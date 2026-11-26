/**
 * WCAG 2.1 relative luminance & contrast ratio helpers for Node and Playwright page.evaluate().
 */

export function parseCssColor(cssColor) {
  if (!cssColor || typeof cssColor !== 'string') return null;
  const trimmed = cssColor.trim().toLowerCase();
  if (trimmed === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };

  const rgbMatch = trimmed.match(
    /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/
  );
  if (rgbMatch) {
    let a = 1;
    if (rgbMatch[4] !== undefined) {
      a = rgbMatch[4].endsWith('%') ? Number(rgbMatch[4].slice(0, -1)) / 100 : Number(rgbMatch[4]);
    }
    return {
      r: Math.round(Number(rgbMatch[1])),
      g: Math.round(Number(rgbMatch[2])),
      b: Math.round(Number(rgbMatch[3])),
      a: Number.isFinite(a) ? a : 1,
    };
  }

  const hexMatch = trimmed.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hexMatch) {
    const hex = hexMatch[1];
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
        a: 1,
      };
    }
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
      a: 1,
    };
  }

  return null;
}

export function compositeOver(fg, bg) {
  const alpha = fg.a ?? 1;
  return {
    r: Math.round(fg.r * alpha + bg.r * (1 - alpha)),
    g: Math.round(fg.g * alpha + bg.g * (1 - alpha)),
    b: Math.round(fg.b * alpha + bg.b * (1 - alpha)),
    a: 1,
  };
}

export function relativeLuminance(rgb) {
  const c = typeof rgb === 'string' ? parseCssColor(rgb) : rgb;
  if (!c) throw new Error(`Invalid color: ${rgb}`);
  const toLinear = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(c.r) + 0.7152 * toLinear(c.g) + 0.0722 * toLinear(c.b);
}

export function getContrastRatio(fg, bg) {
  const fgRgb = typeof fg === 'string' ? parseCssColor(fg) : fg;
  const bgRgb = typeof bg === 'string' ? parseCssColor(bg) : bg;
  if (!fgRgb || !bgRgb) throw new Error(`Invalid color(s): ${fg}, ${bg}`);
  const fgOpaque = fgRgb.a < 1 ? compositeOver(fgRgb, bgRgb) : fgRgb;
  const l1 = relativeLuminance(fgOpaque);
  const l2 = relativeLuminance(bgRgb);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Evaluate contrast inside a live Playwright page for a list of CSS selectors.
 * Resolves effective opaque background color across ancestor elements.
 */
export async function measureContrastInPage(page, selectors) {
  return page.evaluate((sels) => {
    function parseRgba(str) {
      if (!str || str === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
      const m = str.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)/);
      if (!m) return { r: 0, g: 0, b: 0, a: 0 };
      const a = m[4] !== undefined ? (m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4])) : 1;
      return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a };
    }

    function composite(fg, bg) {
      const a = fg.a ?? 1;
      return {
        r: fg.r * a + bg.r * (1 - a),
        g: fg.g * a + bg.g * (1 - a),
        b: fg.b * a + bg.b * (1 - a),
        a: 1,
      };
    }

    function resolveEffectiveBg(el) {
      const layers = [];
      let cur = el;
      while (cur && cur.nodeType === 1) {
        const bg = parseRgba(getComputedStyle(cur).backgroundColor);
        if (bg.a > 0) {
          layers.push(bg);
          if (bg.a >= 0.999) break;
        }
        cur = cur.parentElement;
      }
      const rootFallback = document.documentElement.classList.contains('dark')
        ? { r: 10, g: 11, b: 15, a: 1 }
        : { r: 255, g: 255, b: 255, a: 1 };
      let result = rootFallback;
      for (let i = layers.length - 1; i >= 0; i--) {
        result = composite(layers[i], result);
      }
      return result;
    }

    function luminance(c) {
      const lin = (v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
    }

    function ratio(fg, bg) {
      const fgOpaque = fg.a < 1 ? composite(fg, bg) : fg;
      const l1 = luminance(fgOpaque);
      const l2 = luminance(bg);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    }

    const results = [];
    for (const selector of sels) {
      const el = document.querySelector(selector);
      if (!el) {
        results.push({ selector, found: false });
        continue;
      }
      const style = getComputedStyle(el);
      const fg = parseRgba(style.color);
      const bg = resolveEffectiveBg(el);
      results.push({
        selector,
        found: true,
        text: (el.textContent || '').trim().slice(0, 60),
        color: style.color,
        effectiveBg: `rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})`,
        ratio: Number(ratio(fg, bg).toFixed(2)),
      });
    }
    return results;
  }, selectors);
}

/**
 * Measure WCAG contrast between two CSS custom properties (e.g. '--text-subtle', '--surface')
 * inside a live Playwright page, resolving effective opaque background safely.
 */
export async function measureCssVarContrast(page, fgVar, bgVar) {
  return page.evaluate(
    ({ fgName, bgName }) => {
      const rootStyle = getComputedStyle(document.documentElement);
      const fgVal = rootStyle.getPropertyValue(fgName).trim();
      const bgVal = rootStyle.getPropertyValue(bgName).trim();
      if (!fgVal || !bgVal) {
        return { fgVar: fgName, bgVar: bgName, found: false };
      }

      function parseRgba(str) {
        if (!str || str === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
        const m = str.match(
          /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)/
        );
        if (!m) return { r: 0, g: 0, b: 0, a: 0 };
        const a =
          m[4] !== undefined
            ? m[4].endsWith('%')
              ? parseFloat(m[4]) / 100
              : parseFloat(m[4])
            : 1;
        return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a };
      }

      function composite(fg, bg) {
        const a = fg.a ?? 1;
        return {
          r: fg.r * a + bg.r * (1 - a),
          g: fg.g * a + bg.g * (1 - a),
          b: fg.b * a + bg.b * (1 - a),
          a: 1,
        };
      }

      function resolveEffectiveBg(el) {
        const layers = [];
        let cur = el;
        while (cur && cur.nodeType === 1) {
          const bg = parseRgba(getComputedStyle(cur).backgroundColor);
          if (bg.a > 0) {
            layers.push(bg);
            if (bg.a >= 0.999) break;
          }
          cur = cur.parentElement;
        }
        const rootFallback = document.documentElement.classList.contains('dark')
          ? { r: 10, g: 11, b: 15, a: 1 }
          : { r: 255, g: 255, b: 255, a: 1 };
        let result = rootFallback;
        for (let i = layers.length - 1; i >= 0; i--) {
          result = composite(layers[i], result);
        }
        return result;
      }

      function luminance(c) {
        const lin = (v) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        };
        return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
      }

      function ratio(fg, bg) {
        const fgOpaque = fg.a < 1 ? composite(fg, bg) : fg;
        const l1 = luminance(fgOpaque);
        const l2 = luminance(bg);
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      }

      const probe = document.createElement('span');
      probe.style.color = `var(${fgName})`;
      probe.style.backgroundColor = `var(${bgName})`;
      probe.style.position = 'fixed';
      probe.style.visibility = 'hidden';
      probe.textContent = 'probe';
      document.body.appendChild(probe);
      try {
        const s = getComputedStyle(probe);
        const fg = parseRgba(s.color);
        const bg = resolveEffectiveBg(probe);
        return {
          fgVar: fgName,
          bgVar: bgName,
          found: true,
          color: s.color,
          effectiveBg: `rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})`,
          ratio: Number(ratio(fg, bg).toFixed(2)),
        };
      } finally {
        probe.remove();
      }
    },
    { fgName: fgVar, bgName: bgVar }
  );
}
