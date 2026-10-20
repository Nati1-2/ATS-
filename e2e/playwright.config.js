import { defineConfig, devices } from '@playwright/test';

/**
 * Runs against an already-running app (npm run dev, or the Docker stack).
 * Each spec file re-seeds the demo database first, so specs never depend on each other.
 * Run the server with AI off (GEMINI_API_KEY empty) so tests don't spend AI quota.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1, // specs share one database
  timeout: 120_000,
  expect: { timeout: 30_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
});
