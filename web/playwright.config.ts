import { defineConfig, devices } from '@playwright/test';

// Continuous screenshot tracing competes with the software WebGL renderer
// on CI. Keep action/DOM traces and final failure screenshots for all lanes.
const ciRun = !!process.env.CI;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  // Timings include failed attempts, so CI optimization is based on real cost.
  reporter: process.env.CI
    ? [['dot'], ['json', { outputFile: 'test-results/ci-results.json' }]]
    : 'list',
  use: {
    // Keep individual UI actions bounded even in longer transactional tests.
    actionTimeout: ciRun ? 10_000 : 0,
    baseURL: 'http://127.0.0.1:4173/dark_fantasy_2d_arpg/',
    trace: ciRun
      ? { mode: 'retain-on-failure', screenshots: false, snapshots: true, sources: false }
      : 'retain-on-failure',
    screenshot: ciRun ? 'only-on-failure' : 'off',
    ...devices['Desktop Chrome']
  },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173/dark_fantasy_2d_arpg/',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000
  }
});
