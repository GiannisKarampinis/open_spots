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
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    /* Test against mobile viewports. */
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Galaxy S24'] },
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Galaxy Tab S9'] },
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Galaxy Tab S9 landscape'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12 landscape'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12 Pro'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12 Pro landscape'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12 Pro Max'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12 Pro Max landscape'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12 Mini'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12 Mini landscape'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 15'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 15 landscape'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 15 Pro'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 15 Pro landscape'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 15 Pro Max'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 15 Pro Max landscape'] },
    },
    {
      name: 'Mobile Mozilla',
      use: { ...devices['iPad (gen 11)'] },
    },
    {
      name: 'Mobile Mozilla',
      use: { ...devices['iPad (gen 11) landscape'] },
    },

    /* Test against branded browsers. */
    {
      name: 'Microsoft Edge',
      use: {
        ...devices['Desktop Edge'],
        channel: 'msedge'
      },
    },
    {
      name: 'Google Chrome',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome'
      },
    },
  ],
});
