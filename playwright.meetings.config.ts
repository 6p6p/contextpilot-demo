import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './tests/meeting-live', timeout: 360000, workers: 1, retries: 0, maxFailures: 1, expect: { timeout: 15000 }, use: { baseURL: 'http://127.0.0.1:5273', channel: process.env.PLAYWRIGHT_CHANNEL, trace: 'off' } });
