import { existsSync, readFileSync, statSync } from 'fs';
import http from 'http';
import { extname, join, resolve, sep } from 'path';
import { PORTAL_DIR, TEMPLATE_DIR, WORKSPACE_ROOT, getModuleDirs } from './workspace.mjs';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

const ASSET_EXTENSIONS = new Set([
  '.js',
  '.mjs',
  '.css',
  '.json',
  '.svg',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.map',
  '.webmanifest',
  '.txt',
  '.xml',
]);

function isRegularFile(filePath) {
  try {
    return statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function safeResolveUnder(baseDir, relPath) {
  const absBase = resolve(baseDir);
  const cleaned = relPath.replace(/^\/+/, '');
  const target = resolve(absBase, cleaned);
  if (target !== absBase && !target.startsWith(absBase + sep)) {
    return null;
  }
  return target;
}

function assertValidDist(slug, distDir) {
  if (!existsSync(distDir)) {
    throw new Error(`Missing dist/ directory for "${slug}" at ${distDir}. Run npm run build first.`);
  }
  const indexHtml = join(distDir, 'index.html');
  if (!existsSync(indexHtml)) {
    throw new Error(`Missing index.html in dist/ for "${slug}" at ${indexHtml}.`);
  }
}

/**
 * Pure Node static preview server bound to 127.0.0.1:0.
 * Mounts Portal dist/ at `/` and module dist/s at `/<slug>/`.
 * Faithfully returns HTTP 404 with per-mount 404.html for missing non-asset routes,
 * and HTTP 404 plain text for missing asset extensions.
 */
export async function startPreviewServer({
  portalDistDir = join(PORTAL_DIR, 'dist'),
  requirePortal = true,
  moduleSlugs = [],
  moduleMounts = {},
  includeTemplate = false,
  includeAllBuiltModules = false,
  isUnavailable,
} = {}) {
  const mounts = new Map();

  if (requirePortal) {
    assertValidDist('openskill-galaxy.github.io', portalDistDir);
  }
  const hasPortal = existsSync(join(portalDistDir, 'index.html'));

  if (includeTemplate) {
    const tplDist = join(TEMPLATE_DIR, 'dist');
    assertValidDist('module-template', tplDist);
    mounts.set('module-template', resolve(tplDist));
  }

  for (const slug of moduleSlugs) {
    const dir = slug === 'module-template' ? TEMPLATE_DIR : join(WORKSPACE_ROOT, slug);
    const distDir = join(dir, 'dist');
    assertValidDist(slug, distDir);
    mounts.set(slug, resolve(distDir));
  }

  for (const [slug, distDir] of Object.entries(moduleMounts)) {
    assertValidDist(slug, distDir);
    mounts.set(slug, resolve(distDir));
  }

  if (includeAllBuiltModules) {
    for (const mod of getModuleDirs(WORKSPACE_ROOT, { includeTemplate: true })) {
      const distDir = join(mod.path, 'dist');
      if (existsSync(join(distDir, 'index.html')) && !mounts.has(mod.name)) {
        mounts.set(mod.name, resolve(distDir));
      }
    }
  }

  // Sort longest slug first
  const sortedSlugs = [...mounts.keys()].sort((a, b) => b.length - a.length);

  const server = http.createServer((req, res) => {
    const rawUrl = req.url || '/';
    const qIdx = rawUrl.indexOf('?');
    const rawPath = qIdx >= 0 ? rawUrl.slice(0, qIdx) : rawUrl;
    const rawSearch = qIdx >= 0 ? rawUrl.slice(qIdx) : '';

    if (rawPath.includes('..')) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    let decodedPath;
    try {
      decodedPath = decodeURIComponent(rawPath);
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Bad Request');
      return;
    }

    if (decodedPath.includes('..') || decodedPath.includes('\0')) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    if (isUnavailable?.(decodedPath)) {
      res.writeHead(503, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
      res.end('Temporarily unavailable');
      return;
    }

    let matchedMount = null;
    let relPath = decodedPath;

    for (const slug of sortedSlugs) {
      const prefix = `/${slug}`;
      if (decodedPath === prefix) {
        // Match GitHub Pages behavior: /<slug> -> /<slug>/
        res.writeHead(301, { Location: `${prefix}/${rawSearch}` });
        res.end();
        return;
      }
      if (decodedPath.startsWith(prefix + '/')) {
        matchedMount = { slug, distDir: mounts.get(slug) };
        relPath = decodedPath.slice(prefix.length); // keeps leading /
        break;
      }
    }

    if (!matchedMount) {
      if (!hasPortal) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not Found (Portal not mounted)');
        return;
      }
      matchedMount = { slug: 'portal', distDir: resolve(portalDistDir) };
    }

    const { distDir } = matchedMount;
    let fileToServe = null;

    if (relPath === '/' || relPath === '' || relPath.endsWith('/')) {
      const candidate = safeResolveUnder(distDir, join(relPath, 'index.html'));
      if (candidate && isRegularFile(candidate)) {
        fileToServe = candidate;
      }
    } else {
      const exact = safeResolveUnder(distDir, relPath);
      if (!exact) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Forbidden');
        return;
      }
      if (isRegularFile(exact)) {
        fileToServe = exact;
      } else {
        const dirIndex = safeResolveUnder(distDir, join(relPath, 'index.html'));
        if (dirIndex && isRegularFile(dirIndex)) {
          fileToServe = dirIndex;
        }
      }
    }

    if (fileToServe) {
      const ext = extname(fileToServe).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      const body = readFileSync(fileToServe);
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-store',
      });
      res.end(body);
      return;
    }

    // Missing file -> check if asset extension
    const ext = extname(relPath).toLowerCase();
    if (ASSET_EXTENSIONS.has(ext)) {
      res.writeHead(404, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end('Not Found');
      return;
    }

    // Missing non-asset SPA route -> HTTP 404 with mount's 404.html
    const notFoundHtml = join(distDir, '404.html');
    if (isRegularFile(notFoundHtml)) {
      res.writeHead(404, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(readFileSync(notFoundHtml));
      return;
    }

    res.writeHead(404, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end('Not Found');
  });

  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', resolveListen);
  });

  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;

  return {
    baseUrl,
    port,
    mounts,
    async close() {
      await new Promise((res) => server.close(() => res()));
    },
  };
}
