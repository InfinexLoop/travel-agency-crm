import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { money } from '../../domains/shared';
import { report as summarize } from '../../domains/reporting';

import { disposableOrigin as base } from '../support/targets';

const disposableConfig=fileURLToPath(new URL('../../playwright.config.ts',import.meta.url));
test.beforeEach(({baseURL},info)=>{
  if (baseURL!==base||info.config.configFile!==disposableConfig) {
    throw new Error('CRM journeys require the disposable loopback server and its test configuration.');
  }
});
const origin={Origin:base};
const staff={email:'owner@zuri.demo',password:'ZuriDemo!2026'};
const portalHeaders={'X-CRM-Space':'portal'};
const ok=async (context:BrowserContext,path:string,data:unknown,key=randomUUID(),portal=false)=>{
  const res=await context.request.post('/api/crm/'+path,{data,maxRedirects:0,headers:{...origin,'idempotency-key':key,...(portal?portalHeaders:{})}});
  expect(res.ok(),await res.text()).toBeTruthy();
  return res.json();
};
const dataset=async (ctx:BrowserContext,portal=false)=> (await ctx.request.get('/api/crm/data',{headers:portal?portalHeaders:{}})).json();
async function signIn(page:Page,role='Owner / Admin') {
  await page.goto('/');
  await page.getByRole('button',{name:role,exact:true}).click();
  await expect(page.getByRole('heading',{name:'Business overview'})).toBeVisible();
}
async function chat(page:Page,words:string[]) {
  for (const word of words) {
    await page.getByRole('textbox',{name:'Message',exact:true}).fill(word);
    await page.getByRole('button',{name:'Send message',exact:true}).click();
    await expect(page.getByRole('textbox',{name:'Message',exact:true})).toHaveValue('');
  }
}
const action=(context:BrowserContext,action:string,input:unknown,portal=false)=>ok(context,'action',{action,input},randomUUID(),portal);

test('WhatsApp enquiry becomes a completed trip with linked payments, documents and feedback',async ({page,context})=>{
  const errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  await signIn(page);
  const before=await dataset(context);
  const displayName='Aarav QA';
  const contact='Aarav QA, +91 90000 00171, aarav-qa@example.test';
  await page.getByRole('link',{name:'Open simulator'}).click();
  await page.getByRole('button',{name:'Start conversation'}).click();
  await expect(page).toHaveURL(/\/simulation\/CV-/);
  const simUrl=page.url();
  await chat(page,['Hi, I want a Dubai package.','2 adults and 1 child','15–20 December','Chennai','Around 90,000',
    contact,'Family-friendly hotel and airport transfers']);
  await expect(page.getByRole('link',{name:'View CRM lead',exact:true})).toBeVisible();
  await expect(page.getByText('Qualification complete',{exact:true})).toBeVisible();
  await page.reload();
  await expect(page.getByRole('link',{name:'View CRM lead',exact:true})).toBeVisible();
  await chat(page,['Please send a quotation']);
  await expect(page.getByText('Human handoff',{exact:true})).toBeVisible();
  await page.getByRole('link',{name:'View CRM lead',exact:true}).click();
  await expect(page.getByRole('heading',{name:displayName})).toBeVisible();
  const lead=page.url().split('/').at(-1)!;
  const salesData=await dataset(context);
  const generated=salesData.leads.find((record:{id:string})=>record.id===lead);
  expect(generated).toMatchObject({stage:'Qualified',destination:'Dubai',adults:2,children:1,budget:9000000});
  expect(generated.owner).toMatch(/^USR-SALES/);
  await page.getByRole('link',{name:'Create quotation'}).click();
  await expect(page.getByRole('heading',{name:'Prepare quotation'})).toBeVisible();
  await page.getByRole('button',{name:'Save quotation',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Dubai quotation'})).toBeVisible();
  const quote=page.url().split('/').at(-1)!;
  const quoteResponse=await context.request.get('/api/crm/file/quote/'+quote);
  expect(quoteResponse.headers()['content-type']).toBe('application/pdf');
  expect((await PDFDocument.load(await quoteResponse.body())).getPageCount()).toBeGreaterThan(0);
  await page.getByRole('button',{name:'Approve quotation'}).click();
  await page.getByRole('button',{name:'Send simulated quote',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Send simulated quote',exact:true}).click();
  await page.getByRole('button',{name:'Create demo portal link'}).click();
  const [portal]=await Promise.all([context.waitForEvent('page'),page.getByRole('link',{name:'Open customer portal',exact:true}).click()]);
  portal.on('pageerror',e=>errors.push(e.message));
  await expect(portal.getByRole('heading',{name:'Dubai quotation'})).toBeVisible();
  await portal.getByRole('button',{name:'Accept quotation'}).click();
  await expect(portal.getByText('Accepted',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Convert to booking'})).toBeVisible();
  await page.getByRole('button',{name:'Convert to booking'}).click();
  await expect(page.getByRole('heading',{name:'Dubai booking'})).toBeVisible();
  const booking=page.url().split('/').at(-1)!;
  await portal.getByRole('link',{name:'View booking'}).click();
  await expect(portal.getByRole('heading',{name:'Dubai booking'})).toBeVisible();
  await portal.getByRole('button',{name:'Simulate payment',exact:true}).click();
  await portal.getByLabel('Simulated result').selectOption('Failed');
  await portal.getByRole('dialog').getByRole('button',{name:'Simulate payment',exact:true}).click();
  await expect(portal.getByText('Failed',{exact:true})).toBeVisible();
  const failed=await dataset(context,true);
  expect(failed.bookings).toHaveLength(1);
  expect(failed.bookings[0]).toMatchObject({id:booking,paid:0,status:'Pending Advance'});
  expect(failed.bookings[0]).not.toHaveProperty('cost');
  expect(failed.quotes[0]).not.toHaveProperty('internal');
  const denied=await context.request.get('/api/crm/file/invoice/BK-0001?space=portal');
  expect(denied.status()).toBe(404);

  await portal.getByRole('button',{name:'Simulate payment',exact:true}).click();
  await portal.getByRole('dialog').getByRole('button',{name:'Simulate payment',exact:true}).click();
  await expect(portal.getByText('Advance Recorded',{exact:true})).toBeVisible();
  const received=(await dataset(context,true)).bookings[0];
  expect(received.paid).toBe(received.advance);
  await expect(portal.locator('.booking-summary').getByText(money(received.total-received.paid),{exact:true})).toBeVisible();
  await page.bringToFront();
  await expect(page.getByText('Verify traveller documents and visa requirements',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Request supplier service'}).click();
  await page.getByLabel('Supplier',{exact:true}).selectOption('SP-0001');
  await page.getByLabel('Service',{exact:true}).fill('Hotel and airport transfer QA');
  await page.getByLabel('Supplier cost (INR)').fill('28000');
  await page.getByRole('dialog').getByRole('button',{name:'Request supplier service'}).click();
  await expect(page.getByRole('link',{name:'Hotel and airport transfer QA'})).toBeVisible();
  await page.getByRole('button',{name:'Mark supplier confirmation pending'}).click();
  await page.getByRole('button',{name:'Confirm supplier'}).click();
  await page.getByLabel('Demo confirmation reference').fill('DEMO-HOTEL-QA');
  await page.getByRole('dialog').getByRole('button',{name:'Confirm supplier'}).click();
  await expect(page.getByText('DEMO-HOTEL-QA',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Mark confirmed',exact:true}).click();
  await expect(page.getByRole('link',{name:'Voucher PDF'})).toBeVisible();
  await page.getByRole('button',{name:'Request document',exact:true}).click();
  await page.getByLabel('Document type').selectOption('Travel insurance');
  await page.getByRole('dialog').getByRole('button',{name:'Request document',exact:true}).click();
  await portal.bringToFront();
  await portal.reload();
  await portal.getByRole('link',{name:'Travel insurance Missing'}).click();
  await portal.getByRole('button',{name:'Upload requested file'}).click();
  const pdf=await PDFDocument.create();pdf.addPage();
  const sample=Buffer.from(await pdf.save());
  await portal.getByLabel('Choose a file').setInputFiles({name:'demo-insurance.pdf',mimeType:'application/pdf',buffer:sample});
  await portal.getByRole('button',{name:'Upload file',exact:true}).click();
  await expect(portal.getByRole('link',{name:'Download document'})).toBeVisible();
  const doc=portal.url().split('/').at(-1)!;
  const docResponse=await context.request.get('/api/crm/file/document/'+doc+'?space=portal');
  expect(docResponse.ok()).toBeTruthy();
  expect(await docResponse.body()).toEqual(sample);

  await page.goto('/documents/'+doc);
  await page.getByRole('button',{name:'Verify document',exact:true}).click();
  await expect(page.getByText('Verified',{exact:true})).toBeVisible();
  await page.goto('/bookings/'+booking);
  await page.getByRole('button',{name:'Issue demo invoice'}).click();
  await expect(page.getByRole('link',{name:'Invoice PDF'})).toBeVisible();
  for (const kind of ['invoice','voucher','itinerary']) {
    const response=await context.request.get('/api/crm/file/'+kind+'/'+booking+'?space=portal');
    expect(response.ok()).toBeTruthy();
    expect((await PDFDocument.load(await response.body())).getPageCount()).toBeGreaterThan(0);
  }
  const receipt=(await dataset(context,true)).payments.find((p:{status:string})=>p.status==='Paid');
  expect((await context.request.get('/api/crm/file/receipt/'+receipt.id+'?space=portal')).ok()).toBeTruthy();
  await page.getByRole('button',{name:'Mark documents ready',exact:true}).click();
  await page.getByRole('button',{name:'Mark travel in progress',exact:true}).click();
  await page.getByRole('button',{name:'Mark completed',exact:true}).click();
  await expect(page.getByText('Completed',{exact:true}).first()).toBeVisible();
  await portal.goto('/portal/bookings/'+booking);
  await portal.getByRole('button',{name:'Submit feedback',exact:true}).click();
  await portal.getByLabel('How was your trip?').fill('Great hotel and smooth airport transfers.');
  await portal.getByRole('dialog').getByRole('button',{name:'Submit feedback',exact:true}).click();
  await expect(portal.getByText('Great hotel and smooth airport transfers.')).toBeVisible();

  const after=await dataset(context);
  expect(after.leads.length).toBe(before.leads.length+1);
  expect(after.bookings.length).toBe(before.bookings.length+1);
  expect(after.leads.find((r:{id:string})=>r.id===lead).stage).toBe('Won');
  expect(after.tasks.filter((t:{booking_id:string})=>t.booking_id===booking)).toHaveLength(4);
  const report=await context.request.get('/api/crm/report/bookings');
  expect(await report.text()).toContain(booking);
  const oldTotals=summarize(before,{},before.today);
  const newTotals=summarize(after,{},after.today);
  expect(newTotals.sales-oldTotals.sales).toBe(received.total);
  expect(newTotals.cash-oldTotals.cash).toBe(received.advance);
  await page.goto('/');
  await expect(page.getByText(money(newTotals.sales),{exact:true}).first()).toBeVisible();
  await page.goto(simUrl);
  await expect(page.getByText('Human handoff',{exact:true})).toBeVisible();
  expect(errors).toEqual([]);
});

test('website, Instagram and manual phone records share the CRM and preserve request identity',async ({page,context})=>{
  await signIn(page);
  await page.goto('/simulation?channel=Website');
  await page.getByLabel('Example traveller').selectOption('1');
  await page.getByRole('button',{name:'Submit website enquiry'}).click();
  await expect(page.getByRole('link',{name:'View CRM lead',exact:true})).toBeVisible();
  const input={name:'Mira Demo',phone:'9000000072',email:'mira72@example.test',destination:'Bali',city:'Bengaluru'};
  const key=randomUUID();
  const first=await ok(context,'ingest',input,key);
  const replay=await ok(context,'ingest',input,key);
  expect(first).toEqual(replay);
  expect(first.linked).toBeTruthy();
  const conflict=await context.request.post('/api/crm/ingest',{maxRedirects:0,data:{...input,destination:'Goa'},headers:{...origin,'Idempotency-Key':key}});
  expect(conflict.status()).toBe(409);

  await page.goto('/simulation?channel=Instagram');
  await page.getByLabel('Instagram handle').fill('@qa.bali.traveller');
  await page.getByRole('button',{name:'Start conversation'}).click();
  await expect(page).toHaveURL(/\/simulation\/CV-/);
  await chat(page,['Hi, Bali honeymoon package?']);
  await expect(page.getByRole('link',{name:'View CRM lead',exact:true})).toBeVisible();
  const partial=await dataset(context);
  const prospect=partial.customers.find((c:{instagram:string})=>c.instagram==='qa.bali.traveller');
  expect(prospect.phone).toBeNull();
  await chat(page,['Two adults','Flexible next month','Bengaluru','₹120,000','Mira Demo, +91 90000 00072, mira72@example.test','A private pool please']);
  await expect(page.getByText('Qualification complete',{exact:true})).toBeVisible();
  const linked=await dataset(context);
  expect(linked.conversations.find((c:{identity:string})=>c.identity==='@qa.bali.traveller').customer_id).toBe(first.customer);
  expect(linked.customers.filter((c:{email:string})=>c.email==='mira72@example.test')).toHaveLength(1);
  const secondLead=await action(context,'lead.create',{...input,destination:'Goa',source:'Referral'});
  const merged=await action(context,'lead.merge',{id:secondLead.lead,target:first.lead});
  expect(merged.id).toBe(first.lead);
  const afterMerge=await dataset(context);
  expect(afterMerge.leads.some((lead:{id:string})=>lead.id===secondLead.lead)).toBeFalsy();
  expect(afterMerge.conversations.find((c:{id:string})=>c.id===secondLead.conversation).lead_id).toBe(first.lead);
  await page.goto('/leads');
  await page.getByRole('button',{name:'Log phone enquiry',exact:true}).click();
  await page.getByLabel('Full name').fill('Phone QA');
  await page.getByLabel('Phone number',{exact:true}).fill('+919000000172');
  await page.getByLabel('Destination',{exact:true}).fill('Kerala');
  await page.getByLabel('Call notes',{exact:true}).fill('Caller asked for a houseboat itinerary.');
  await page.getByRole('dialog').getByRole('button',{name:'Log phone enquiry',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Phone QA',exact:true})).toBeVisible();
  await expect(page.getByText('Caller asked for a houseboat itinerary.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Change stage',exact:true}).click();
  await page.getByLabel('Lead stage').selectOption('Qualified');
  await page.getByRole('dialog').getByRole('button',{name:'Change stage'}).click();
  await expect(page.getByText('Qualified',{exact:true}).first()).toBeVisible();
  await page.getByRole('button',{name:'Assign salesperson',exact:true}).click();
  await page.getByLabel('Sales owner',{exact:true}).selectOption('USR-SALES2');
  await page.getByRole('dialog').getByRole('button',{name:'Assign salesperson',exact:true}).click();
  await expect(page.getByRole('definition').filter({hasText:'Ravi Menon'})).toBeVisible();
  await page.goto('/packages/PK-0002');
  await page.getByRole('button',{name:'Edit package'}).click();
  await page.getByLabel('Package title').fill('Kashmir Valley QA');
  await page.getByRole('button',{name:'Move day 2 up'}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Edit package',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Kashmir Valley QA',exact:true})).toBeVisible();
  await page.goto('/reports');
  await page.getByLabel('Source',{exact:true}).selectOption('Website');
  await expect(page.getByRole('link',{name:'Leads CSV'})).toHaveAttribute('href',/source=Website/);
  const filteredExport=await context.request.get('/api/crm/report/leads?source=Website');
  expect(filteredExport.ok()).toBeTruthy();
  const exported=await filteredExport.text();
  expect(exported).toContain(first.lead);
  expect(exported).not.toContain('"Phone Call"');
  const due=await action(context,'automation.due',{});
  expect(due.processed).toBeGreaterThan(0);
  expect((await action(context,'automation.due',{})).processed).toBe(0);
});

test('server enforces scope and prevents overpayments and excess settlements',async ({context})=>{
  await ok(context,'login',staff);
  const attempt=async (action:string,input:unknown)=>context.request.post('/api/crm/action',{maxRedirects:0,data:{action,input},headers:{...origin,'Idempotency-Key':randomUUID()}});
  const before=(await dataset(context)).bookings.find((r:{id:string})=>r.id==='BK-0002');
  const over=await attempt('finance.payment',{id:before.id,amount:before.total+1,method:'UPI',status:'Paid'});
  expect(over.status()).toBe(400);
  const pending=await action(context,'finance.payment',{id:before.id,amount:1000,method:'UPI',status:'Pending'});
  expect((await dataset(context)).bookings.find((b:{id:string})=>b.id===before.id).paid).toBe(0);
  await action(context,'finance.resolve',{id:pending.id,status:'Paid'});
  expect((await dataset(context)).bookings.find((b:{id:string})=>b.id===before.id).paid).toBe(1000);
  await action(context,'booking.adjust',{id:before.id,total:before.total+20000,advance:before.advance,reason:'Synthetic schedule amendment'});
  const adjusted=await dataset(context);
  expect(adjusted.adjustments[0]).toMatchObject({booking_id:before.id,prior_total:before.total,new_total:before.total+20000});
  expect(adjusted.bookings.find((b:{id:string})=>b.id===before.id).total).toBe(before.total+20000);
  await action(context,'finance.refund',{id:pending.id,amount:1000,reason:'Synthetic refund'});
  const afterRefund=(await dataset(context)).bookings.find((b:{id:string})=>b.id===before.id);
  expect(afterRefund.paid).toBe(0);
  const payment={id:before.id,amount:afterRefund.total,method:'UPI',status:'Paid'};
  const race=await Promise.all([
    attempt('finance.payment',payment),
    attempt('finance.payment',payment),
  ]);
  expect(race.map(response=>response.status()).sort()).toEqual([200,400]);
  expect((await dataset(context)).bookings.find((b:{id:string})=>b.id===before.id).paid).toBe(afterRefund.total);
  const job=(await dataset(context)).supplier_jobs.find((j:{status:string;settled:number})=>j.status==='Confirmed'&&j.settled>0);
  expect((await attempt('supplier.settle',{id:job.id,amount:job.cost-job.settled+1})).status()).toBe(400);
  await action(context,'supplier.settle',{id:job.id,amount:job.cost-job.settled});
  expect((await dataset(context)).supplier_jobs.find((r:{id:string})=>r.id===job.id).settled).toBe(job.cost);
  const foreign=await context.request.post('/api/crm/action',{maxRedirects:0,data:{action:'lead.stage',input:{id:'LD-0001',stage:'Closed'}},headers:{Origin:'http://example.test','Idempotency-Key':randomUUID()}});
  expect(foreign.status()).toBe(403);
  await ok(context,'login',{email:'sales@zuri.demo',password:staff.password});
  const sales=await dataset(context);
  expect(sales.leads.every((l:{owner:string})=>l.owner==='USR-SALES')).toBeTruthy();
  expect((await attempt('lead.stage',{id:'LD-0002',stage:'Qualified'})).status()).toBe(404);
  expect((await attempt('finance.payment',{id:'BK-0001',amount:1,method:'UPI',status:'Paid'})).status()).toBe(403);
  await ok(context,'login',{email:'customer@zuri.demo',password:staff.password},randomUUID(),true);
  const customer=await dataset(context,true);
  expect(customer.bookings.map((b:{id:string})=>b.id)).toEqual(['BK-0001']);
  expect((await context.request.get('/api/crm/file/document/DOC-0003?space=portal')).status()).toBe(404);
});

test('dashboard, navigation and simulator fit desktop, tablet and phone widths',async ({page},info)=>{
  await page.setViewportSize({width:1440,height:1000});
  await signIn(page);
  for (const width of [1440,768,390,320,375,414]) {
    await page.setViewportSize({width,height:940});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await expect(page.getByRole('heading',{name:'Business snapshot'})).toBeVisible();
    if(width<960) await expect(page.locator('.sidebar')).toBeHidden();
    if ([1440,390].includes(width)) await page.screenshot({path:info.outputPath('dashboard-'+width+'.png'),fullPage:true,animations:'disabled'});
  }
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'Open navigation'}).click();
  await page.getByRole('link',{name:'Simulation center',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Simulation center',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Use dark theme'}).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({path:info.outputPath('simulation-390.png'),fullPage:true,animations:'disabled'});
});

test('manager, operations and finance accounts retain their distinct authority',async ({context})=>{
  const attempt=(action:string,input:unknown)=>context.request.post('/api/crm/action',{
    maxRedirects:0,data:{action,input},headers:{...origin,'Idempotency-Key':randomUUID()},
  });

  await ok(context,'login',{email:'manager@zuri.demo',password:staff.password});
  let data=await dataset(context);
  expect(data.user.role).toBe('manager');
  expect(data.leads.length).toBeGreaterThan(0);
  expect((await attempt('staff.save',{})).status()).toBe(403);
  expect((await attempt('finance.payment',{})).status()).toBe(403);

  await ok(context,'login',{email:'operations@zuri.demo',password:staff.password});
  data=await dataset(context);
  expect(data.user.role).toBe('ops');
  expect(data.supplier_jobs.length).toBeGreaterThan(0);
  expect(data.leads).toEqual([]);
  expect((await attempt('lead.assign',{})).status()).toBe(403);
  expect((await context.request.get('/api/crm/report/bookings')).status()).toBe(403);

  await ok(context,'login',{email:'finance@zuri.demo',password:staff.password});
  data=await dataset(context);
  expect(data.user.role).toBe('finance');
  expect(data.payments.length).toBeGreaterThan(0);
  expect(data.conversations).toEqual([]);
  expect((await attempt('staff.save',{})).status()).toBe(403);
  expect((await context.request.get('/api/crm/report/bookings')).ok()).toBeTruthy();
});

test('customer access is independent of contact matches and enquiry ownership',async ({context})=>{
  const login=(email:string)=>ok(context,'login',{email,password:staff.password});
  const deny=async (type:string,input:unknown,status=404,key=randomUUID())=>{
    const response=await context.request.post('/api/crm/action',{
      data:{action:type,input},maxRedirects:0,headers:{...origin,'Idempotency-Key':key},
    });
    expect(response.status()).toBe(status);
    return response.json();
  };

  await login('manager@zuri.demo');
  const initial=await dataset(context);
  const foreign=initial.customers.find((c:{id:string})=>c.id==='CUS-0002');
  expect(foreign.sales_owner).toBe('USR-SALES2');
  await action(context,'lead.assign',{id:'LD-0002',owner:'USR-SALES'});

  await login('sales@zuri.demo');
  const match={name:'Synthetic identity check',email:foreign.email,whatsapp:'+919000009999',notes:'Must not be recorded'};
  const error=await deny('customer.save',match);
  expect(error).toEqual({error:'Customer not found'});
  expect(await deny('customer.save',{...match,id:foreign.id})).toEqual(error);
  expect(await deny('lead.create',{...match,destination:'Kyoto'})).toEqual(error);
  expect(await deny('lead.create',{name:match.name,phone:foreign.phone,destination:'Kyoto'})).toEqual(error);
  const websiteResponse=await context.request.post('/api/crm/ingest',{
    data:match,maxRedirects:0,headers:{...origin,'Idempotency-Key':randomUUID()},
  });
  expect(websiteResponse.status()).toBe(404);
  expect(await websiteResponse.json()).toEqual(error);
  expect(await deny('portal.link',{id:foreign.id})).toEqual(error);
  await deny('customer.assign',{id:foreign.id,sales_owner:'USR-SALES'},403);
  await deny('lead.note',{id:'LD-0002',body:'Must not be recorded'});
  expect((await context.request.get('/api/crm/file/quote/QT-0002')).status()).toBe(404);
  const scoped=await dataset(context);
  expect(scoped.customers.some((c:{id:string})=>c.id===foreign.id)).toBe(false);
  expect(scoped.leads.some((l:{customer_id:string})=>l.customer_id===foreign.id)).toBe(false);

  const instagram=await action(context,'sim.start',{channel:'Instagram',identity:'@scope.qa',scenario:1});
  for (const body of ['Hi, Bali honeymoon package?','Two adults','Flexible next month','Bengaluru','₹120,000',`Synthetic QA, ${foreign.email}`]) {
    await action(context,'sim.message',{id:instagram.id,body});
  }
  await deny('sim.message',{id:instagram.id,body:'A private pool please'});
  const provisional=(await dataset(context)).conversations.find((c:{id:string})=>c.id===instagram.id);
  expect(provisional.customer_id).not.toBe(foreign.id);

  const profile={name:'Assigned Synthetic QA',email:'authorization-regression@example.test'};
  const owned=await action(context,'customer.save',profile);
  const linkRequest=randomUUID();
  const issued=await ok(context,'action',{action:'portal.link',input:{id:owned.id}},linkRequest);
  expect(issued.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  const redeemed=await ok(context,'portal-link',{token:issued.token},randomUUID(),true);
  expect(redeemed.user.customer_id).toBe(owned.id);
  const unusedLink=await action(context,'portal.link',{id:owned.id});
  const lead=await action(context,'lead.create',{...profile,destination:'Dubai'});
  expect(lead.customer).toBe(owned.id);
  await action(context,'customer.save',{...profile,id:owned.id,notes:'Approved owner update'});

  await login('manager@zuri.demo');
  const manager=await dataset(context);
  expect(manager.customers.find((c:{id:string})=>c.id===foreign.id)).toEqual(foreign);
  expect(manager.leads.filter((l:{customer_id:string})=>l.customer_id===foreign.id)).toHaveLength(
    initial.leads.filter((l:{customer_id:string})=>l.customer_id===foreign.id).length,
  );
  await action(context,'portal.link',{id:foreign.id});
  await action(context,'customer.assign',{id:owned.id,sales_owner:'USR-SALES2'});

  await login('sales@zuri.demo');
  await deny('portal.link',{id:owned.id},404,linkRequest);
  expect((await context.request.get('/api/crm/data',{headers:portalHeaders})).status()).toBe(401);
  const stale=await context.request.post('/api/crm/portal-link',{
    data:{token:unusedLink.token},maxRedirects:0,headers:{...origin,...portalHeaders},
  });
  expect(stale.status()).toBe(401);
  await login('sales2@zuri.demo');
  expect((await action(context,'portal.link',{id:owned.id})).token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  await action(context,'customer.save',{...profile,id:owned.id,notes:'Reassigned owner update'});
});

test('refunds preserve the advance floor and commit only valid audit and ledger changes',async ({context})=>{
  await ok(context,'login',staff);
  const refundInput=(id:string,amount:number)=>({id,amount,reason:'Synthetic refund regression'});
  const refund=(id:string,amount:number)=>action(context,'finance.refund',refundInput(id,amount));
  const attempt=(id:string,amount:number)=>context.request.post('/api/crm/action',{
    data:{action:'finance.refund',input:refundInput(id,amount)},maxRedirects:0,
    headers:{...origin,'Idempotency-Key':randomUUID()},
  });
  const snapshot=async (id:string)=>{
    const data=await dataset(context);
    return {
      booking:data.bookings.find((b:{id:string})=>b.id===id),
      payments:data.payments.filter((p:{booking_id:string})=>p.booking_id===id),
      events:data.events.filter((e:{booking_id:string})=>e.booking_id===id),
    };
  };
  const confirmed=await snapshot('BK-0001');
  expect(confirmed.booking.status).toBe('Confirmed');
  expect(confirmed.booking.paid).toBe(confirmed.booking.advance);
  const receipt=confirmed.payments.find((p:{status:string})=>p.status==='Paid');
  for (const amount of [1,receipt.amount]) {
    const rejected=await attempt(receipt.id,amount);
    expect(rejected.status()).toBe(400);
    expect(await rejected.json()).toEqual({error:'A confirmed booking must retain its paid advance'});
    expect(await snapshot(confirmed.booking.id)).toEqual(confirmed);
  }

  const addPayment=(amount:number)=>action(context,'finance.payment',{
    id:confirmed.booking.id,amount,method:'UPI',status:'Paid',
  });
  const extraPayment=await addPayment(600);
  const partialBody={action:'finance.refund',input:refundInput(extraPayment.id,200)};
  const key=randomUUID();
  const partial=await ok(context,'action',partialBody,key);
  expect(await ok(context,'action',partialBody,key)).toEqual(partial);
  const beforeRace=await snapshot(confirmed.booking.id);
  expect(beforeRace.booking.paid).toBe(confirmed.booking.advance+400);
  const race=await Promise.all([attempt(receipt.id,300),attempt(receipt.id,300)]);
  expect(race.map(r=>r.status()).sort()).toEqual([200,400]);
  const afterRace=await snapshot(confirmed.booking.id);
  expect(afterRace.booking.paid).toBe(confirmed.booking.advance+100);
  expect(afterRace.payments).toHaveLength(beforeRace.payments.length+1);
  expect(afterRace.events).toHaveLength(beforeRace.events.length+1);
  await refund(extraPayment.id,100);
  const aboveFloor=await addPayment(400);
  await refund(aboveFloor.id,400);
  expect((await snapshot(confirmed.booking.id)).booking).toMatchObject({status:'Confirmed',paid:confirmed.booking.advance});

  for (const [id,status] of [['BK-0003','Documents Ready'],['BK-0011','Travel In Progress'],['BK-0006','Completed']]) {
    const later=await snapshot(id);
    expect(later.booking.status).toBe(status);
    for (const p of later.payments.filter((p:{status:string;amount:number})=>p.status==='Paid')) {
      const available=(await snapshot(id)).booking.paid-later.booking.advance;
      if (available>0) await refund(p.id,Math.min(p.amount,available));
    }
    const atFloor=await snapshot(id);
    expect(atFloor.booking).toMatchObject({status,paid:later.booking.advance});
    const paid=atFloor.payments.find((p:{status:string;id:string;amount:number})=>p.status==='Paid'&&
      p.amount>atFloor.payments.filter((r:{parent:string})=>r.parent===p.id).reduce((sum:number,r:{amount:number})=>sum+r.amount,0));
    expect((await attempt(paid.id,1)).status()).toBe(400);
    expect(await snapshot(id)).toEqual(atFloor);
  }

  const advance=await snapshot('BK-0004');
  expect(advance.booking.status).toBe('Advance Recorded');
  await refund(advance.payments.find((p:{status:string})=>p.status==='Paid').id,advance.booking.paid);
  expect((await snapshot(advance.booking.id)).booking).toMatchObject({status:'Pending Advance',paid:0});
  const pending=await snapshot('BK-0005');
  expect(pending.booking.status).toBe('Supplier Confirmation Pending');
  await refund(pending.payments.find((p:{status:string})=>p.status==='Paid').id,1);
  expect((await snapshot(pending.booking.id)).booking).toMatchObject({status:'Pending Advance',paid:pending.booking.paid-1});

  const cancellation=await snapshot('BK-0009');
  await action(context,'booking.status',{id:cancellation.booking.id,status:'Cancelled',reason:'Synthetic authorized cancellation'});
  await refund(cancellation.payments.find((p:{status:string})=>p.status==='Paid').id,cancellation.booking.paid);
  expect((await snapshot(cancellation.booking.id)).booking).toMatchObject({status:'Cancelled',paid:0});
});
