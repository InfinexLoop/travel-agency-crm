import { expect, test } from '@playwright/test';
import { accessIssuer } from '../../cloudflare/resources';
import { hostedCredentials, hostedRead } from '../support/hosted-read';
import { assertHostedTarget, hostedOrigin } from '../support/targets';

assertHostedTarget(process.env);
const credentials=hostedCredentials(process.env);

test('anonymous staff, portal and CRM data routes require Cloudflare Access',async ()=>{
  for (const route of ['/', '/portal', '/api/crm/data'] as const) {
    const response=await hostedRead(route);
    expect([302,303,307,401,403],route).toContain(response.status);
    if (response.status>=300&&response.status<400) {
      const location=response.headers.get('location');
      expect(Boolean(location),route).toBe(true);
      expect(new URL(location!,hostedOrigin).origin===accessIssuer,route).toBe(true);
    }
    await response.body?.cancel();
  }
});

test('approved Access identity can read hosted routes with the CRM session boundary intact',async ()=>{
  test.skip(!credentials,'An approved Access service identity is required for authenticated smoke.');
  for (const route of ['/','/portal'] as const) {
    const response=await hostedRead(route,credentials);
    expect(response.status,route).toBe(200);
    expect(response.headers.get('cache-control'),route).toContain('no-store');
    expect((await response.text()).includes('Zuri Holidays'),route).toBe(true);
  }

  const response=await hostedRead('/api/crm/data',credentials);
  expect(response.status).toBe(credentials?.staffSession?200:401);
  if (credentials?.staffSession) {
    const data=await response.json() as {user?:{role?:string};bookings?:unknown[]};
    expect(typeof data.user?.role==='string' && Array.isArray(data.bookings)).toBe(true);
  } else {
    await response.body?.cancel();
  }
});
