import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { spawnSync } from 'node:child_process';
import { afterEach, expect, it, vi } from 'vitest';
import { hostedRead, hostedStaffSession, type HostedRoute } from '../support/hosted-read';
import { assertHostedTarget, disposableTarget, hostedOrigin } from '../support/targets';

afterEach(()=>vi.unstubAllGlobals());

it('requires an explicit disposable target and rejects live URLs or credentials',()=>{
  expect(disposableTarget({CRM_E2E_TARGET:'sqlite'})).toBe('sqlite');
  expect(disposableTarget({CRM_E2E_TARGET:'workers'})).toBe('workers');
  expect(()=>disposableTarget({})).toThrow(/disposable/);
  expect(()=>disposableTarget({CRM_E2E_TARGET:'production'})).toThrow(/disposable/);
  for (const name of ['CRM_E2E_LIVE_URL','CRM_E2E_BASE_URL','PLAYWRIGHT_TEST_BASE_URL','CRM_SMOKE_ORIGIN',
    'CRM_SMOKE_STAFF_SESSION']) {
    expect(()=>disposableTarget({CRM_E2E_TARGET:'workers',[name]:'dummy value'})).toThrow(/reject/);
  }
  expect(()=>assertHostedTarget({CRM_E2E_TARGET:'sqlite'})).toThrow(/fixed Worker origin/);
  expect(()=>assertHostedTarget({CRM_E2E_LIVE_URL:hostedOrigin})).toThrow(/fixed Worker origin/);
  expect(()=>hostedStaffSession({CRM_SMOKE_STAFF_SESSION:'invalid'})).toThrow(/valid existing staff session/);
});

it('rejects the old live configuration in the Playwright CLI before collecting tests',()=>{
  const result=spawnSync(process.execPath,['node_modules/@playwright/test/cli.js','test','--list'],{
    env:{...process.env,CRM_E2E_TARGET:'workers',CRM_E2E_LIVE_URL:hostedOrigin},encoding:'utf8',timeout:20_000,
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('Local CRM tests reject hosted URLs and credentials.');
  expect(result.stdout).not.toContain('Listing tests');
});

it('keeps an existing staff session in a manual-redirect data GET to the fixed origin',async ()=>{
  const staffSession=hostedStaffSession({CRM_SMOKE_STAFF_SESSION:'a'.repeat(43)})!;
  const calls:{url:string;method?:string;headers:Headers}[]=[];
  const nativeFetch=globalThis.fetch;
  let downstreamRequests=0;
  const downstream=createServer((_,res)=>{downstreamRequests++;res.end();});
  const initial=createServer((req,res)=>{
    if (req.url==='/portal') {
      res.writeHead(302,{Location:`http://127.0.0.1:${(downstream.address() as AddressInfo).port}/image`});
    }
    res.end();
  });
  try {
    for (const server of [initial,downstream]) await new Promise<void>(resolve=>{server.listen(0,'127.0.0.1',resolve);});
    const initialOrigin=`http://127.0.0.1:${(initial.address() as AddressInfo).port}`;
    vi.stubGlobal('fetch',async (url:string,init:RequestInit)=>{
      const target=new URL(url);
      calls.push({url,method:init.method,headers:new Headers(init.headers)});
      return nativeFetch(initialOrigin+target.pathname,init);
    });
    const page=await hostedRead('/portal',staffSession);
    expect(page.status).toBe(302);
    await page.body?.cancel();
    await (await hostedRead('/api/crm/data',staffSession)).body?.cancel();
    await (await hostedRead('/')).body?.cancel();
    for (const path of ['//unrelated.example/','https://unrelated.example/','/api/crm/action','/api/crm/login']) {
      await expect(hostedRead(path as HostedRoute,staffSession)).rejects.toThrow('Unsupported hosted smoke route.');
    }
    expect(calls.map(c=>[c.url,c.method])).toEqual([
      [hostedOrigin+'/portal','GET'],[hostedOrigin+'/api/crm/data','GET'],[hostedOrigin+'/','GET'],
    ]);
    expect([...calls[0].headers]).toEqual([]);
    expect(calls[1].headers.get('cookie')).toBe('zuri_staff='+'a'.repeat(43));
    expect([...calls[2].headers]).toEqual([]);
    expect(downstreamRequests).toBe(0);
    await expect(hostedRead('/api/crm/data','invalid\nsession')).rejects.toThrow(/^Hosted smoke request failed\.$/);
    expect(calls).toHaveLength(3);
  } finally {
    await Promise.all([initial,downstream].map(server=>new Promise<void>(resolve=>server.close(()=>resolve()))));
  }
});
