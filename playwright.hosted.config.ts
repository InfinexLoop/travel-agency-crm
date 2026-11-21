import { defineConfig } from '@playwright/test';
import { assertHostedTarget } from './tests/support/targets';

assertHostedTarget(process.env);

export default defineConfig({
  testDir:'./tests/hosted',
  timeout:30_000,
  workers:1,
  outputDir:'test-results/hosted',
  reporter:'list',
  use:{trace:'off',screenshot:'off',video:'off'},
});
