import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E Test Configuration for ST-Auto-Summarize
 *
 * CRITICAL CONSTRAINTS:
 * - Sequential execution ONLY (workers: 1)
 * - Single SillyTavern backend = shared state
 * - Parallel tests would corrupt each other
 *
 * See docs/development/PLAYWRIGHT_TESTING_GUIDE.md for details
 */
export default defineConfig({
  // Test directories
  testDir: './tests',
  testMatch: '**/*.spec.js',

  // CRITICAL: Sequential execution only
  // One SillyTavern backend = one shared state
  // Parallel workers would corrupt each other's state
  fullyParallel: false,
  workers: 1,

  // Retry configuration
  // Feature tests: retry once (fast feedback loop)
  // Suite tests: no retry (state chain would be broken)
  retries: process.env.CI ? 1 : 0,

  // Reporter configuration
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['list'],
    ['json', { outputFile: 'test-results/results.json' }]
  ],

  // Output directories
  outputDir: 'test-results',

  // Global timeout settings
  // E2E tests are slower than unit tests (real browser, real backend)
  timeout: 60000, // 60s per test (includes navigation, LLM calls via proxy)
  expect: {
    timeout: 10000 // 10s for assertions
  },

  use: {
    // Base URL for SillyTavern
    // Update this to match your SillyTavern instance
    baseURL: 'http://localhost:8000',

    // Browser context options
    trace: 'on-first-retry', // Collect trace on retry
    screenshot: 'only-on-failure', // Screenshots on failure
    video: 'retain-on-failure', // Videos on failure

    // Viewport size
    viewport: { width: 1280, height: 720 },

    // Additional context options
    ignoreHTTPSErrors: true, // Allow self-signed certs

    // Action timeouts
    actionTimeout: 15000, // 15s for clicks, fills, etc
    navigationTimeout: 30000 // 30s for page loads
  },

  // Projects configuration
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],

  // Web server configuration (optional)
  // Uncomment if you want Playwright to auto-start SillyTavern
  // webServer: {
  //   command: 'npm start',
  //   url: 'http://localhost:8000',
  //   reuseExistingServer: !process.env.CI,
  //   timeout: 120000
  // }
});
