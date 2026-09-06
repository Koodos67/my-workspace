import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', workers: 1, timeout: 180000,
  use: { baseURL: process.env.TEST_BASE_URL || 'http://localhost:3198', channel: 'chrome', trace: 'retain-on-failure' },
  outputDir: '.shipstudio/test-results', reporter: 'list',
});
