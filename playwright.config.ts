import { defineConfig } from '@playwright/test';
const workers=process.env.CRM_E2E_TARGET==='workers';
const live=process.env.CRM_E2E_LIVE_URL;
const serviceId=process.env.CF_ACCESS_CLIENT_ID;
const serviceSecret=process.env.CF_ACCESS_CLIENT_SECRET;
if (live && (!/^https:\/\/zuri-holidays-crm-demo\.[a-z0-9-]+\.workers\.dev$/.test(live)||!serviceId||!serviceSecret)) {
  throw new Error('Live QA requires the approved Worker URL and temporary Access service credentials');
}

export default defineConfig({
  testDir:'./tests/browser', timeout:live?180_000:100_000, expect:{timeout:12_000}, workers:1,
  reporter:'list',
  use:{
    baseURL:live||'http://127.0.0.1:3100',
    extraHTTPHeaders:live?{'CF-Access-Client-Id':serviceId!,'CF-Access-Client-Secret':serviceSecret!}:undefined,
    actionTimeout:15_000,
    trace:live?'off':'retain-on-failure',
    launchOptions:process.env.PLAYWRIGHT_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE}:{},
  },
  webServer:live?undefined:{command:workers?'node scripts/test-worker.mjs':'node scripts/test-server.mjs',url:'http://127.0.0.1:3100',reuseExistingServer:false,timeout:120_000,gracefulShutdown:{signal:'SIGTERM',timeout:5000}},
});
