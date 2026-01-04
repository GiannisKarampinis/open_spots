const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 30 * 1000,
  retries: 0,

  reporter: [['html', { open: 'never' }]],

  use: {
    baseURL: 'http://127.0.0.1:8000/venues',
    headless: true,
    viewport: { width: 1280, height: 720 },

    video: 'retain-on-failure',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
