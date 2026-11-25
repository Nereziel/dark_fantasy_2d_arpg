import { defineConfig, devices } from '@playwright/test';

// Long natural runs can produce hundreds of MB of screenshot-heavy traces.
// Preserve DOM/action snapshots and a final failure screenshot for diagnosis.
const longCiRun = !!process.env.CI && process.env.LANE === 'act-i';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  // Timings include failed attempts, so CI optimization is based on real cost.
  reporter: process.env.CI
    ? [['dot'], ['json', { outputFile: 'test-results/ci-results.json' }]]
    : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173/dark_fantasy_2d_arpg/',
    trace: longCiRun
      ? { mode: 'retain-on-failure', screenshots: false, snapshots: true, sources: false }
      : 'retain-on-failure',
    screenshot: longCiRun ? 'only-on-failure' : 'off',
    ...devices['Desktop Chrome']
  },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173/dark_fantasy_2d_arpg/',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000
  }
});
