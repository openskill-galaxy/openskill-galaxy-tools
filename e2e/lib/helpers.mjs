import { expect } from '@playwright/test';

const DOCUMENT_404_CONSOLE_TEXT =
  'Failed to load resource: the server responded with a status of 404 (Not Found)';

function stripUrlHash(url) {
  const s = String(url || '');
  const idx = s.indexOf('#');
  return idx >= 0 ? s.slice(0, idx) : s;
}

export function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function clickOptionByKey(page, key) {
  const escaped = escapeRegExp(key);
  const btn = page
    .locator('button.option-btn')
    .filter({
      has: page.locator('.option-key', { hasText: new RegExp(`^\\s*${escaped}\\s*$`) }),
    })
    .first();
  await expect(btn).toBeVisible();
  await btn.click();
}

function computeUnexpectedConsoleErrors(consoleErrorEntries, document404Credits, allowDocument404) {
  const remaining = new Map(document404Credits);
  const unexpected = [];
  for (const entry of consoleErrorEntries) {
    if (allowDocument404 && entry.text === DOCUMENT_404_CONSOLE_TEXT) {
      const normalizedUrl = stripUrlHash(entry.url);
      const credits = remaining.get(normalizedUrl) || 0;
      if (credits > 0) {
        remaining.set(normalizedUrl, credits - 1);
        continue;
      }
    }
    unexpected.push(entry.text);
  }
  return unexpected;
}

/**
 * Attach console.error, pageerror, and failed HTTP (>=400) asset listeners to a Playwright page.
 * Allows expected HTTP 404 responses on initial SPA document navigation (GitHub Pages 404.html pattern)
 * when allowDocument404 is true, while failing on any asset/data 404 or >=500 response.
 */
export function attachRuntimeGuards(page, { allowDocument404 = false } = {}) {
  const consoleErrorEntries = [];
  const pageErrors = [];
  const failedRequests = [];
  const cancelledDocuments = [];
  const badResponses = [];
  const document404Credits = new Map();

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrorEntries.push({
        text: msg.text(),
        url: msg.location()?.url || '',
      });
    }
  });

  page.on('pageerror', (err) => {
    pageErrors.push(err.message || String(err));
  });

  page.on('requestfailed', (req) => {
    const url = req.url();
    // Ignore intentionally aborted external requests if any, capture local failures
    if (url.startsWith('http://127.0.0.1:') || url.startsWith('http://localhost:')) {
      if (allowDocument404 && req.isNavigationRequest() && req.failure()?.errorText === 'cancelled') {
        cancelledDocuments.push(stripUrlHash(url));
        return;
      }
      failedRequests.push(`${req.method()} ${url}: ${req.failure()?.errorText || 'failed'}`);
    }
  });

  page.on('response', (res) => {
    const status = res.status();
    if (status < 400) return;
    const url = res.url();
    if (!url.startsWith('http://127.0.0.1:') && !url.startsWith('http://localhost:')) return;
    const resourceType = res.request().resourceType();
    if (allowDocument404 && status === 404 && resourceType === 'document') {
      const normalizedUrl = stripUrlHash(url);
      document404Credits.set(normalizedUrl, (document404Credits.get(normalizedUrl) || 0) + 1);
      return;
    }
    badResponses.push(`${status} ${resourceType} ${url}`);
  });

  return {
    get consoleErrors() {
      return computeUnexpectedConsoleErrors(
        consoleErrorEntries,
        document404Credits,
        allowDocument404
      );
    },
    pageErrors,
    failedRequests,
    badResponses,
    assertClean(label = 'page') {
      expect(this.consoleErrors, `${label}: console.error`).toEqual([]);
      expect(pageErrors, `${label}: pageerror`).toEqual([]);
      // WebKit may report a cancelled document after its 404.html redirect has already run.
      const unexpectedCancellations = cancelledDocuments.filter((url) => !document404Credits.has(url));
      expect(unexpectedCancellations, `${label}: cancelled navigation`).toEqual([]);
      expect(failedRequests, `${label}: requestfailed`).toEqual([]);
      expect(badResponses, `${label}: HTTP >= 400 responses`).toEqual([]);
    },
  };
}

export async function waitForAppReady(page) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(() => {
    const root = document.getElementById('root');
    if (!root) return false;
    const text = (root.innerText || '').trim();
    if (!text || root.querySelector('[aria-label="页面加载中"]')) return false;
    return !text.includes('正在加载模块数据');
  });
}

export async function assertNoHorizontalOverflow(page, label = 'viewport') {
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(
    metrics.scrollWidth,
    `${label}: horizontal overflow scrollWidth=${metrics.scrollWidth} > innerWidth=${metrics.innerWidth}`
  ).toBeLessThanOrEqual(metrics.innerWidth);
}

export async function assertHeaderHealthy(page, label = 'header') {
  const check = await page.evaluate(() => {
    const header = document.querySelector('header');
    if (!header) return { hasHeader: false };
    const headerRect = header.getBoundingClientRect();
    const vw = window.innerWidth;
    const controls = [...header.querySelectorAll('a, button, input')].filter((el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
    });

    const clipped = [];
    for (const el of controls) {
      const r = el.getBoundingClientRect();
      if (r.right > vw + 2 || r.left < -2) {
        clipped.push({
          tag: el.tagName,
          label: el.getAttribute('aria-label') || (el.textContent || '').trim().slice(0, 30),
          left: Math.round(r.left),
          right: Math.round(r.right),
          vw,
        });
      }
    }

    const overlaps = [];
    for (let i = 0; i < controls.length; i++) {
      for (let j = i + 1; j < controls.length; j++) {
        const a = controls[i].getBoundingClientRect();
        const b = controls[j].getBoundingClientRect();
        if (controls[i].contains(controls[j]) || controls[j].contains(controls[i])) continue;
        const xOverlap = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const yOverlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (xOverlap > 2 && yOverlap > 2) {
          overlaps.push({
            a: controls[i].getAttribute('aria-label') || (controls[i].textContent || '').trim().slice(0, 20),
            b: controls[j].getAttribute('aria-label') || (controls[j].textContent || '').trim().slice(0, 20),
            xOverlap: Math.round(xOverlap),
            yOverlap: Math.round(yOverlap),
          });
        }
      }
    }

    return {
      hasHeader: true,
      headerWidth: Math.round(headerRect.width),
      vw,
      controlCount: controls.length,
      clipped,
      overlaps,
    };
  });

  expect(check.hasHeader, `${label}: header missing`).toBe(true);
  expect(check.clipped, `${label}: clipped header controls`).toEqual([]);
  expect(check.overlaps, `${label}: overlapping header controls`).toEqual([]);
}
