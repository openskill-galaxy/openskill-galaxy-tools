# OpenSkill Galaxy — 4-Tier Opaque-Box E2E Test Suite

Self-contained, deterministic ESM test suite for validating the OpenSkill Galaxy Portal (`openskill-galaxy.github.io`), Module Template (`module-template`), Toolchain (`openskill-galaxy-tools/scripts`), and all 60 Learning Modules (`module-*`).

## Offline Installation

```bash
cd openskill-galaxy-tools/e2e
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install --no-audit --no-fund
```

This reuses locally cached `@playwright/test` and Playwright Chromium / system Google Chrome without downloading browser binaries.

## Test Commands

| Command | Scope | Prerequisites |
|---|---|---|
| `npm run test:self` | Self-check for harness (`server.mjs`, `browser.mjs`, `contrast.mjs`, `fixtures.mjs`, `workspace.mjs`) | None (uses `/tmp/` mock `dist/` + static JSONs) |
| `npm run test:tier1` | Tier 1: CLI contracts, Portal data invariants, `dist/` & `npm run build` checks, 63-repo Git boundary, Portal & Module happy-path browser checks | `scripts/node_modules`, built `dist/` (or `SKIP_BUILD_EXEC=1` for build exec skip) |
| `npm run test:tier2` | Tier 2: CLI negative fault injection + Portal/Module boundary cases + Desktop/Mobile Light/Dark contrast & overflow | Same as Tier 1 |
| `npm run test:tier3` | Tier 3: Cross-feature pairwise interactions (Portal↔Module deep-links, same-origin `localStorage` isolation, diagnostics, modals, TOC/playground) | Built `dist/` for Portal, Template, and representative modules |
| `npm run test:tier4` | Tier 4: 6 End-to-End real-world user & release pipeline scenarios | Built `dist/` for Portal, Template, and representative modules |
| `npm run test:tier5` | Tier 5: Adversarial regression & parity checks (QuizSpeedRun `judge`, fixed modal containment, CodePlayground/scrollProgress reset, ExamResult reload, WeakPointDiagnostics fallback, WrongQuestions SM-2, Portal filters/tabs/Backup/SearchBox) | Built `dist/` for Portal, Template, and representative modules |
| `npm run test:e2e` | Full 4-Tier suite (`test:tier1` → `test:tier4`) | Full workspace build |

## Environment Variables

- `OSG_ROOT`: Override workspace root (defaults to `/Users/claire/Wonderful/openskill-galaxy` or auto-detected parent of `openskill-galaxy-tools`).
- `OSG_TEST_BROWSER`: Set to `webkit` to run the browser suite with Playwright WebKit, for example `OSG_TEST_BROWSER=webkit npx playwright test --workers=4`. This requires the WebKit build matching the installed Playwright version.
- `PW_EXECUTABLE_PATH`: Explicit Chromium / Chrome executable path override. Defaults to newest `chromium_headless_shell-*` / `chromium-*` in `~/Library/Caches/ms-playwright/`, falling back to `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`.
- `RUN_BUILD_CHECK`: Optional toggle for heavy build sweeps (if `SKIP_BUILD_EXEC=1`, `builds-and-artifacts.test.mjs` skips executing `npm run build` and validates `dist/` + `vite.config.ts` / `manifest.json` artifacts directly; by default `SKIP_BUILD_EXEC !== '1'` runs `npm run build` on Portal, Template, and sampled modules).
- `SKIP_BUILD_EXEC`: Set to `1` to skip running `npm run build` inside `builds-and-artifacts.test.mjs` when `dist/` is already freshly built.

## Architecture

- `lib/workspace.mjs`: Resolves workspace repos and creates isolated `/tmp/osg-e2e-cli-*` `OSG_ROOT` sandboxes for mutating CLI scripts and negative fault injection.
- Git checks compare the workspace with the published module catalog and check that each run leaves repository revisions untouched.
- `lib/browser.mjs`: Offline Playwright Chromium / Chrome executable resolver and launch helper.
- `lib/server.mjs`: Pure Node `http` same-origin static preview server (`127.0.0.1:0`) mounting Portal `dist/` at `/` and module `dist/`s at `/<slug>/` with authentic HTTP `404` → `404.html` SPA fallback and plain `404` for missing static assets.
- `lib/fixtures.mjs`: Dynamic JSON discovery for Portal and Module fixtures (no brittle hardcoded slugs).
- `lib/contrast.mjs`: WCAG 2.1 relative luminance and contrast calculation helpers (both Node & browser `evaluate`).
