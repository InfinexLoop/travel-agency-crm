import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { allow, authenticate, check, demo, demoSignInPassword, digest, DomainError, getUser, session } from '../../../../server/auth.ts';
import { seededDemoPassword } from '../../../../server/password.ts';
import { day, insert, now, one, run, transaction, ConcurrentWrite } from '../../../../server/db.ts';
import { crmActions } from '../../../../server/crm.ts';
import { commercialActions } from '../../../../server/commercial.ts';
import { runDue, simulationActions } from '../../../../server/simulation.ts';
import { authorizePortalLink, operationsActions, upload } from '../../../../server/operations.ts';
import { dataset } from '../../../../server/queries.ts';
import { file } from '../../../../server/files.ts';
import { report } from '../../../../domains/reporting.ts';
import { balance, bookingStatuses, sources, stages, type User } from '../../../../domains/shared.ts';

export const runtime='nodejs';
export const dynamic='force-dynamic';
type Context={params:Promise<{path?:string[]}>};
const headers={'Cache-Control':'private, no-store'};
const json=(value:unknown,status=200)=>NextResponse.json(value,{status,headers});
const cookieOpts={httpOnly:true,sameSite:'lax' as const,path:'/',maxAge:12*3600};
const sessionName=(r:NextRequest)=>r.headers.get('x-crm-space')==='portal'||r.nextUrl.searchParams.get('space')==='portal'?'zuri_portal':'zuri_staff';
const rawSession=(r:NextRequest)=>r.cookies.get(sessionName(r))?.value;
async function requireUser(r:NextRequest) {
  const user=await getUser(rawSession(r));
  check(user,'Sign in to continue',401);
  return user;
}
function bad(error:unknown) {
  if (error instanceof ConcurrentWrite) return json({error:error.message},409);
  if (error instanceof DomainError) return json({error:error.message},error.status);
  if (error instanceof z.ZodError) return json({error:error.issues.map(i=>`${i.path.join(' ')} ${i.message}`.trim()).join('. ')},400);
  if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) return json({error:'That record or contact is already in use.'},409);
  if (error instanceof SyntaxError) return json({error:'The request could not be read'},400);
  console.error(error);
  return json({error:'The request could not be completed. Check the local application log.'},500);
}
function setCookie(response:NextResponse,r:NextRequest,name:string,value:string) {
  response.cookies.set(name,value,{...cookieOpts,secure:r.nextUrl.protocol==='https:'});
  return response;
}
function csv(value:unknown) {
  const v=String(value??'');
  return '"'+(/^[\s]*[=+\-@\t\r]/.test(v)?"'":"")+v.replaceAll('"','""')+'"';
}
export async function GET(r:NextRequest,ctx:Context) {
  try {
    const [path='data',kind,resource]=(await ctx.params).path||[];
    const user=await requireUser(r);
    if (path==='data') return json({...await dataset(user),today:day(),demo,autoDue:demo&&process.env.CRM_AUTO_DUE==='1'});
    if (path==='file') {
      check(kind&&resource,'File not found',404);
      const result=await file(user,kind,resource);
      return new NextResponse(Buffer.from(result.bytes),{headers:{...headers,'Content-Type':result.mime,
        'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(result.name)}`}});
    }
    if (path==='report') {
      allow(user,'manager','finance');
      const d=await dataset(user);
      const filtering=z.object({from:z.iso.date().optional(),to:z.iso.date().optional(),source:z.enum(sources).optional(),owner:z.string().max(90).optional(),stage:z.enum(stages).optional(),bookingStatus:z.enum(bookingStatuses).optional()});
      const totals=report(d,filtering.parse(Object.fromEntries(r.nextUrl.searchParams)),day());
      let table:unknown[][];
      if (kind==='leads') table=[['Reference','Source','Destination','Stage','Owner','Created'],...totals.leads.map(l=>[l.id,l.source,l.destination,l.stage,d.team.find(u=>u.id===l.owner)?.name,l.created])];
      else if (kind==='suppliers') table=[['Booking','Status','Cost INR','Settled INR','Outstanding INR'],...totals.jobs.map(j=>[j.booking_id,j.status,(j.cost||0)/100,(j.settled||0)/100,((j.cost||0)-(j.settled||0))/100])];
      else table=[['Booking','Status','Departure','Value INR','Net received INR','Outstanding INR'],...totals.bookings.map(b=>[b.id,b.status,b.departure,(b.total||0)/100,(b.paid||0)/100,balance(b.total||0,b.paid||0,b.status||'')/100])];
      return new NextResponse(table.map(row=>row.map(csv).join(',')).join('\r\n'),{headers:{...headers,'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="zuri-report.csv"'}});
    }
    throw new DomainError('Page not found',404);
  } catch(error) { return bad(error); }
}
const failedLogins=new Map<string,{count:number;until:number}>();
export async function POST(r:NextRequest,ctx:Context) {
  try {
    const [path]=(await ctx.params).path||[];
    const origin=r.headers.get('origin');
    const host=r.headers.get('host')||r.nextUrl.host;
    check(origin===`${r.nextUrl.protocol}//${host}`,'Request origin is not allowed',403);
    const length=Number(r.headers.get('content-length')||0);
    check(length <= (path==='upload'?5.2*1024*1024:150_000),'Request is too large',413);
    if (path==='login') {
      const input=z.object({email:z.email().max(180),password:z.string().min(1).max(200)}).parse(await r.json());
      const k=input.email.toLowerCase();
      const time=Date.now();
      for (const [email,entry] of failedLogins) if (entry.until<time) failedLogins.delete(email);
      const attempt=failedLogins.get(k);
      check((attempt?.count||0)<10,'Too many attempts. Try again in ten minutes.',429);
      let user:User;
      let raw:string;
      try {
        ({user,raw}=await transaction(async ()=>{
          const user=await authenticate(input.email,input.password);
          check(input.password!==seededDemoPassword||demoSignInPassword(),'Invalid email or password',401);
          return {user,raw:session(user)};
        }));
      }
      catch (e) {
        if(e instanceof DomainError&&e.status===401&&failedLogins.size<5000) failedLogins.set(k,{count:(attempt?.count||0)+1,until:attempt?.until||time+600_000});
        throw e;
      }
      failedLogins.delete(k);
      return setCookie(json({user}),r,user.role==='customer'?'zuri_portal':'zuri_staff',raw);
    }
    if (path==='portal-link') {
      check(demo,'Demo portal links are disabled',403);
      const {token}=z.object({token:z.string().regex(/^[A-Za-z0-9_-]{43}$/)}).parse(await r.json());
      const raw=await transaction(async ()=>{
        const hashed=digest(token);
        const account=await one<User>(`SELECT u.id,u.name,u.email,u.role,u.customer_id FROM portal_links p JOIN users u ON u.id=p.user_id
          WHERE p.token=? AND p.expires>? AND u.active=1 AND u.role='customer'`,hashed,now());
        check(account,'This portal link is expired or has already been used',401);
        run('DELETE FROM portal_links WHERE token=?',hashed);
        return {user:account,session:session(account)};
      });
      return setCookie(json({user:raw.user}),r,'zuri_portal',raw.session);
    }
    if (path==='logout') {
      await transaction(async ()=>{
        await requireUser(r);
        run('DELETE FROM sessions WHERE token=?',digest(rawSession(r)!));
      });
      const response=json({ok:true});
      response.cookies.delete(sessionName(r));
      return response;
    }
    if (path==='upload') {
      await requireUser(r);
      return json(await upload(()=>requireUser(r),await r.formData()));
    }
    check(path==='action'||path==='ingest','Page not found',404);
    const payload=await r.json();
    if (path==='ingest') check(demo,'The website demo adapter is disabled',403);
    const {action,input}=path==='ingest'?{action:'lead.create',input:{...z.record(z.string(),z.unknown()).parse(payload),source:'Website'}}:
      z.object({action:z.string().max(60),input:z.unknown()}).parse(payload);
    const requestKey=r.headers.get('idempotency-key');
    check(requestKey&&/^[a-zA-Z0-9_-]{8,100}$/.test(requestKey),'A valid request identifier is required');
    const fingerprint=digest(JSON.stringify(input??null));
    return json(await transaction(async ()=>{
      const user=await requireUser(r);
      const existing=await one('SELECT * FROM requests WHERE key=? AND user_id=? AND action=?',requestKey,user.id,action);
      if (existing) {
        check(existing.fingerprint===fingerprint,'This request ID was already used with different data',409);
        if (action==='portal.link') await authorizePortalLink(user,input);
        return JSON.parse(existing.result);
      }
      const result=action==='automation.due'?await runDue(user):
        await crmActions(action,input,user)??await commercialActions(action,input,user)??await operationsActions(action,input,user)??await simulationActions(action,input,user);
      check(result,'Action not found',404);
      insert('requests',{key:requestKey,user_id:user.id,action,fingerprint,result:JSON.stringify(result)});
      return result;
    }));
  } catch(error) { return bad(error); }
}
