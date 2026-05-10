import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['github'],
    ['list'],
  ],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    serviceWorkers: 'block',
  },
  projects: [
    {
      name: 'iPhone 14',
      use: {
        ...devices['iPhone 14'],
        // Emulate touch, correct viewport, Safari-like UA
        hasTouch: true,
        isMobile: true,
      },
    },
    {
      name: 'Pixel 7',
      use: {
        ...devices['Pixel 7'],
        hasTouch: true,
        isMobile: true,
      },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
})
