import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  use: { baseURL: 'http://127.0.0.1:3001', trace: 'retain-on-failure', channel: process.env.PLAYWRIGHT_CHANNEL },
});
