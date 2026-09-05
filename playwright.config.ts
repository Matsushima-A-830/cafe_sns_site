import { defineConfig, devices } from '@playwright/test'

// 外部URL（Vercel Preview 等）を指定された場合は自前でサーバーを立てない
const externalBaseURL = process.env.PLAYWRIGHT_BASE_URL
const baseURL = externalBaseURL ?? 'http://localhost:3000'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['html'], ['github']] : 'html',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 14'] } },
  ],
  // CI でも必ずサーバーを立てる。ここを undefined にすると誰も listen していない
  // localhost へ接続しに行き、最初のテストを書いた瞬間に落ちる。
  // CI は事前に pnpm build 済みの前提で本番サーバーを使う。
  webServer: externalBaseURL
    ? undefined
    : {
        command: process.env.CI ? 'pnpm start' : 'pnpm dev',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
})
