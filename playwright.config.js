import { defineConfig } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: 'tests',
  fullyParallel: true,
  workers: 4,
  retries: 0,
  reporter: [['list']],
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    browserName: 'chromium',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
    locale: 'en-US',
    timezoneId: 'Asia/Manila',
    acceptDownloads: true,
  },
  webServer: {
    // Bound to 127.0.0.1 only, never the local network.
    command: `node node_modules/serve/build/main.js -n -L -l tcp://127.0.0.1:${PORT} .`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
