import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', workers: 1, fullyParallel: false,
  use: { baseURL: 'http://127.0.0.1:5178', browserName: 'chromium',
    launchOptions: { executablePath: process.env.CHROME_PATH },
    screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: 'node tests/support/server.mjs', url: 'http://127.0.0.1:5178', reuseExistingServer: false },
});
