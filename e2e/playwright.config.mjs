import { defineConfig } from '@playwright/test';
import { resolveBrowserExecutablePath } from './lib/browser.mjs';

const browserName = process.env.OSG_TEST_BROWSER || 'chromium';
if (!['chromium', 'webkit'].includes(browserName)) {
  throw new Error('OSG_TEST_BROWSER must be chromium or webkit');
}

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.mjs',
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: true,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    headless: true,
    launchOptions: browserName === 'chromium' ? {
      executablePath: resolveBrowserExecutablePath(),
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    } : undefined,
    viewport: { width: 1440, height: 900 },
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    ignoreHTTPSErrors: true,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  projects: [
    {
      name: browserName,
      use: { browserName },
    },
  ],
});
