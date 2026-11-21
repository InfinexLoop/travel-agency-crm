import { defineConfig } from '@playwright/test';
import { disposableOrigin, disposablePort, disposableTarget } from './tests/support/targets';

const target=disposableTarget(process.env);

export default defineConfig({
  testDir:'./tests/browser', timeout:100_000, expect:{timeout:12_000}, workers:1,
  reporter:'list',
  use:{
    baseURL:disposableOrigin,
    actionTimeout:15_000,
    trace:'retain-on-failure',
    launchOptions:process.env.PLAYWRIGHT_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE}:{},
  },
  webServer:[{
    command:target==='workers'?'node scripts/test-worker.mjs':'node scripts/test-server.mjs',
    port:disposablePort,reuseExistingServer:false,timeout:120_000,
    gracefulShutdown:{signal:'SIGTERM',timeout:5000},
  }],
});
