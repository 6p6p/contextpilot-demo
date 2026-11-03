import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './tests/memory-live', timeout: 300000, workers: 1, retries: 0,
  use: { baseURL: 'http://127.0.0.1:5273', channel: process.env.PLAYWRIGHT_CHANNEL, trace: 'off' } });
