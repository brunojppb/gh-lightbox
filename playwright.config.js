// @ts-check
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'test/e2e',
  testMatch: '*.spec.js',
  timeout: 30_000,
  workers: 2,
  reporter: 'list',
  expect: { timeout: 5_000 },
});
