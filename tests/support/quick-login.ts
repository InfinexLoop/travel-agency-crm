import { expect, type Page } from '@playwright/test';
import { demoPersonas } from '../../domains/demo-personas';

type Persona = (typeof demoPersonas)[keyof typeof demoPersonas];
type RecordScope = {id:string;customer_id:string;owner?:string;lead_id?:string;quote_id?:string};

export async function verifyQuickLogin(page:Page,origin:string,persona:Persona) {
  const portal=persona.role==='customer';
  const url=origin+(portal?'/portal':'/');
  const space=portal?'portal':'staff';
  const authPath=origin+'/api/crm/';
  const context=page.context();
  const headers={'X-CRM-Space':space};
  await page.goto(url);
  await expect(page).toHaveURL(url);
  await expect(page.locator('.demo-accounts button')).toHaveCount(portal?3:6);
  await expect(page.getByLabel('Password',{exact:true})).toBeVisible();
  const width=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,viewport:window.innerWidth}));
  expect(width.scroll).toBeLessThanOrEqual(width.viewport);

  await page.getByRole('button',{name:persona.label,exact:true}).click();
  try {
    await expect(page.getByRole('heading',{name:portal?`Welcome, ${persona.label.split(' ')[0]}`:'Business overview',exact:true})).toBeVisible();
    await expect(page).toHaveURL(url);
    const jar=await context.cookies(origin);
    const cookie=jar.find(entry=>entry.name==='zuri_'+space);
    expect(Boolean(cookie&&cookie.httpOnly&&cookie.sameSite==='Lax'&&cookie.secure===origin.startsWith('https:'))).toBe(true);
    expect(jar.some(entry=>entry.name===(portal?'zuri_staff':'zuri_portal'))).toBe(false);

    const response=await context.request.get(authPath+'data',{headers,maxRedirects:0});
    expect(response.status()).toBe(200);
    const data=await response.json();
    expect({id:data.user.id,role:data.user.role,customer_id:data.user.customer_id,sign_in:data.user.sign_in}).toEqual({
      id:persona.id,role:persona.role,customer_id:persona.customerId,sign_in:'quick',
    });
    if (portal) {
      expect(data.customers.map((row:RecordScope)=>row.id)).toEqual([persona.customerId]);
      expect(data.bookings.length).toBeGreaterThan(0);
      for (const key of ['leads','quotes','bookings','documents']) {
        expect(data[key].every((row:RecordScope)=>row.customer_id===persona.customerId),key).toBe(true);
      }
    }
    if (persona.role==='sales') {
      expect(data.leads.length).toBeGreaterThan(0);
      expect(data.bookings.length).toBeGreaterThan(0);
      const customers=new Set(data.customers.map((row:RecordScope)=>row.id));
      expect(data.leads.every((row:RecordScope)=>row.owner===persona.id&&customers.has(row.customer_id))).toBe(true);
      for (const key of ['quotes','bookings','documents']) {
        expect(data[key].every((row:RecordScope)=>customers.has(row.customer_id)),key).toBe(true);
      }
    }
    if (persona.role==='admin') {
      await expect(page.getByRole('link',{name:'Staff & settings'})).toHaveCount(0);
      expect(data.workflows).toEqual([]);
      expect(data.team.every((row:object)=>!Object.hasOwn(row,'email'))).toBe(true);
    }
  } finally {
    if ((await context.cookies(origin)).some(entry=>entry.name==='zuri_'+space)) {
      const signedOut=await context.request.post(authPath+'logout',{headers:{...headers,Origin:origin},maxRedirects:0});
      expect(signedOut.status()).toBe(200);
    }
  }
}
