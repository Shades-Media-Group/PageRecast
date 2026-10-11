import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: true,
  reporter: process.env.CI ? 'github' : 'list',
  // Tests read the English interface, whatever language this machine runs in.
  use: { viewport: { width: 1280, height: 800 }, locale: 'en-US' },
})
