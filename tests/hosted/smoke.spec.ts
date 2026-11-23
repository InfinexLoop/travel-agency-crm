import { expect, test } from '@playwright/test';
import { hostedRead, hostedStaffSession } from '../support/hosted-read';
import { assertHostedTarget, hostedOrigin } from '../support/targets';

assertHostedTarget(process.env);
const staffSession=hostedStaffSession(process.env);

test('staff and portal render their public CRM login screens',async ({page})=>{
  for (const [route,heading] of [['/','Welcome back'],['/portal','Your travel portal']] as const) {
    const response=await hostedRead(route);
    expect(response.status,route).toBe(200);
    expect(response.headers.get('cache-control'),route).toContain('private, no-store');
    await response.body?.cancel();
    await page.goto(hostedOrigin+route);
    await expect(page).toHaveURL(hostedOrigin+route);
    await expect(page.getByRole('heading',{name:heading})).toBeVisible();
    await expect(page.getByLabel('Email address')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeVisible();
    await expect(page.getByText('Demo accounts',{exact:true})).toHaveCount(0);
  }
});

test('the CRM requires a session for staff and portal data, exports and documents',async ()=>{
  for (const route of ['/api/crm/data','/api/crm/data?space=portal','/api/crm/report/bookings','/api/crm/file/document/DOC-SMOKE-CHECK'] as const) {
    const response=await hostedRead(route);
    expect(response.status,route).toBe(401);
    expect(response.headers.get('cache-control'),route).toContain('no-store');
    expect(await response.json(),route).toEqual({error:'Sign in to continue'});
  }
});

test('an existing staff session can read CRM data',async ()=>{
  test.skip(!staffSession,'Set CRM_SMOKE_STAFF_SESSION to verify an existing staff session.');
  const response=await hostedRead('/api/crm/data',staffSession);
  expect(response.status).toBe(200);
  const data=await response.json() as {user?:{role?:string};bookings?:unknown[]};
  expect(typeof data.user?.role==='string' && Array.isArray(data.bookings)).toBe(true);
});
