import { existsSync, readdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { chromium } from '@playwright/test';

function parseRevision(dirName, prefix) {
  const rest = dirName.slice(prefix.length);
  const num = Number(rest);
  return Number.isFinite(num) ? num : -1;
}

function findCachedPlaywrightBinaries({ headless = true } = {}) {
  const cacheDir = process.env.PLAYWRIGHT_BROWSERS_PATH || join(homedir(), 'Library', 'Caches', 'ms-playwright');
  if (!existsSync(cacheDir)) return [];

  const entries = readdirSync(cacheDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const candidates = [];

  if (headless) {
    const shells = entries
      .filter((n) => n.startsWith('chromium_headless_shell-'))
      .sort((a, b) => parseRevision(b, 'chromium_headless_shell-') - parseRevision(a, 'chromium_headless_shell-'));

    for (const dir of shells) {
      const subpaths = [
        join(cacheDir, dir, 'chrome-headless-shell-mac-arm64', 'chrome-headless-shell'),
        join(cacheDir, dir, 'chrome-headless-shell-mac-x64', 'chrome-headless-shell'),
        join(cacheDir, dir, 'chrome-linux', 'headless_shell'),
      ];
      for (const p of subpaths) {
        if (existsSync(p)) candidates.push(p);
      }
    }
  }

  const fullChromiums = entries
    .filter((n) => n.startsWith('chromium-'))
    .sort((a, b) => parseRevision(b, 'chromium-') - parseRevision(a, 'chromium-'));

  for (const dir of fullChromiums) {
    const subpaths = [
      join(cacheDir, dir, 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'),
      join(cacheDir, dir, 'chrome-mac', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'),
      join(cacheDir, dir, 'chrome-linux', 'chrome'),
    ];
    for (const p of subpaths) {
      if (existsSync(p)) candidates.push(p);
    }
  }

  return candidates;
}

export function resolveBrowserExecutablePath({ headless = true } = {}) {
  if (process.env.PW_EXECUTABLE_PATH) {
    if (!existsSync(process.env.PW_EXECUTABLE_PATH)) {
      throw new Error(`PW_EXECUTABLE_PATH does not exist: ${process.env.PW_EXECUTABLE_PATH}`);
    }
    return process.env.PW_EXECUTABLE_PATH;
  }

  const cached = findCachedPlaywrightBinaries({ headless });
  if (cached.length > 0) {
    return cached[0];
  }

  const systemChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (existsSync(systemChrome)) {
    return systemChrome;
  }

  throw new Error(
    'No Chromium or Google Chrome executable found. Set PW_EXECUTABLE_PATH or populate ~/Library/Caches/ms-playwright/.'
  );
}

export async function launchBrowser(options = {}) {
  const headless = options.headless ?? true;
  const executablePath = options.executablePath || resolveBrowserExecutablePath({ headless });
  return chromium.launch({
    headless,
    executablePath,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    ...options,
  });
}
