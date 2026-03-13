// playwright.config.js
// Run from the project root: npx playwright test --config=tests/playwright.config.js

const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.js',

  // How long a single test can take
  timeout: 5_000,

  // Retry once on CI, not locally
  retries: process.env.CI ? 1 : 0,

  // Run tests sequentially — the app is stateless per page load so this is fine
  workers: 1,

  reporter: [['list'], ['html', { open: 'never', outputFolder: './report' }]],

  use: {
    // Point at your local Jekyll server
    baseURL: 'http://localhost:4000',

    // Keep screenshots on failure
    screenshot: 'only-on-failure',

    // Capture trace on first retry
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Visual snapshot config
  expect: {
    // Tolerate up to 0.5% pixel difference (handles anti-aliasing)
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.005,
    },
  },
});