import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./tests/browser', timeout:100_000, expect:{timeout:12_000}, workers:1,
  reporter:'list',
  use:{
    baseURL:'http://127.0.0.1:3100',
    actionTimeout:15_000,
    trace:'retain-on-failure',
    launchOptions:process.env.PLAYWRIGHT_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE}:{},
  },
  webServer:{command:'node scripts/test-server.mjs',url:'http://127.0.0.1:3100',reuseExistingServer:false,timeout:120_000,gracefulShutdown:{signal:'SIGTERM',timeout:5000}},
});
