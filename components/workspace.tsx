'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Activity, Bell, BookOpen, Building2, ChevronDown, ChevronRight, CircleHelp, ClipboardList, Compass, Files, FlaskConical, LayoutDashboard, LogOut, Menu, MessageSquareText, Moon, Plane, Search, Settings2, Sun, Ticket, UsersRound, Wallet, X } from 'lucide-react';
import { roles, type Role } from '../domains/shared';
import { AppContext, Button, Empty, Modal, type Data, type Row } from './ui';
import { Overview, DemoGuide } from './overview';
import { Simulation, Inbox } from './simulation';
import { Records } from './records';

const menu=[
  {id:'',title:'Overview',icon:LayoutDashboard,group:'Workspace',roles:['manager','sales','ops','finance']},
  {id:'leads',title:'Enquiries',icon:UsersRound,group:'Workspace',roles:['manager','sales']},
  {id:'inbox',title:'Unified inbox',icon:MessageSquareText,group:'Workspace',roles:['manager','sales']},
  {id:'customers',title:'Customers',icon:UsersRound,group:'Workspace',roles:['manager','sales','ops','finance']},
  {id:'packages',title:'Tour packages',icon:Compass,group:'Travel management',roles:['manager','sales','ops']},
  {id:'quotes',title:'Quotations',icon:Files,group:'Travel management',roles:['manager','sales','finance']},
  {id:'bookings',title:'Bookings',icon:Ticket,group:'Travel management',roles:['manager','sales','ops','finance']},
  {id:'suppliers',title:'Suppliers',icon:Building2,group:'Travel management',roles:['manager','ops','finance']},
  {id:'operations',title:'Operations',icon:ClipboardList,group:'Travel management',roles:['manager','sales','ops']},
  {id:'documents',title:'Documents & visas',icon:Files,group:'Travel management',roles:['manager','sales','ops','finance']},
  {id:'finance',title:'Finance',icon:Wallet,group:'Business',roles:['finance','manager']},
  {id:'reports',title:'Reports',icon:Activity,group:'Business',roles:['manager','finance']},
  {id:'team',title:'Staff & settings',icon:Settings2,group:'Business',roles:[]},
  {id:'simulation',title:'Simulation center',icon:FlaskConical,group:'Demo tools',roles:['manager','sales']},
  {id:'guide',title:'Demo guide',icon:BookOpen,group:'Demo tools',roles:['manager','sales','ops','finance']},
];
const portalMenu=[
  {id:'',title:'My travel',icon:LayoutDashboard},
  {id:'leads',title:'My enquiries',icon:UsersRound},
  {id:'quotes',title:'Quotations',icon:Files},
  {id:'bookings',title:'My bookings',icon:Ticket},
  {id:'documents',title:'Travel documents',icon:Files},
  {id:'inbox',title:'Messages & assistance',icon:MessageSquareText},
];
const emailSuffix='@zuri.demo';
const demoPassword='ZuriDemo!2026';
async function api(path:string,portal:boolean,init?:RequestInit) {
  const response=await fetch('/api/crm/'+path,{cache:'no-store',...init,headers:{'X-CRM-Space':portal?'portal':'staff',...init?.headers}});
  const body=await response.json();
  if (!response.ok) throw Object.assign(new Error(body.error||'Unable to complete the request'),{status:response.status});
  return body;
}
const post=(body:unknown):RequestInit=>({method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID()},body:JSON.stringify(body)});

function Brand({portal=false}:{portal?:boolean}) {
  return <Link className="brand" href={portal?'/portal':'/'}><span className="brand-mark"><Plane size={22}/></span><span><strong>Zuri Holidays</strong><small>{portal?'Customer travel portal':'Travel Business Management'}</small></span></Link>;
}
function Login({portal,onLogin,initialError,demo}:{portal:boolean;onLogin:()=>void;initialError:string;demo:boolean}) {
  const router=useRouter();
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [busy,setBusy]=useState('');
  const [error,setError]=useState(initialError);
  async function login(email:string,password:string,name='form') {
    if (busy) return;
    setBusy(name);setError('');
    try {
      const result=await api('login',portal,post({email,password}));
      const target=result.user.role==='customer'?'/portal':'/';
      if (portal===(result.user.role==='customer')) {router.replace(target);onLogin();}
      else window.location.assign(target);
    } catch (e) {setError((e as Error).message);}
    finally {setBusy('');}
  }
  return <main className="login-screen">
    <div className="login-image"><Brand portal={portal}/><div><span className="login-kicker">ZURI HOLIDAYS</span><h1>Every journey,<br/>beautifully managed.</h1><p>From the first enquiry to the traveller’s return.</p></div><span>Dubai Marina · United Arab Emirates</span></div>
    <section className="login-content"><div className="login-wrap"><div className="login-mobile-brand"><Brand portal={portal}/></div>{demo&&<span className="demo-label"><i/> Demo environment</span>}<h2>{portal?'Your travel portal':'Welcome back'}</h2>
      <p>{portal?'Review quotations, check bookings and get trip assistance.':'Sign in to the Zuri Holidays workspace.'}</p>
      <form className="form" onSubmit={(e:FormEvent)=>{e.preventDefault();void login(email,password);}}>
        <label className="field"><span>Email address</span><input required type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)}/></label>
        <label className="field"><span>Password</span><input required type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></label>
        {error&&<p className="error" role="alert">{error}</p>}<Button type="submit" disabled={Boolean(busy)}>{busy==='form'?'Signing in…':'Sign in'}</Button>
      </form>
      {demo&&<><div className="login-divider"><span>Demo accounts</span></div>
      <div className="demo-accounts">{(portal?[['customer','Ananya Rao'],['customer2','Rohan Mehta'],['customer3','Meera Iyer']]:
        [['owner','Owner / Admin'],['manager','Sales Manager'],['sales','Sales Executive'],['sales2','Sales Executive · Ravi'],['operations','Operations Executive'],['finance','Finance Executive']]).map(([account,label])=>
        <Button className="outline" key={account} disabled={Boolean(busy)} onClick={()=>void login(account+emailSuffix,demoPassword,account)}>{busy===account?'Signing in…':label}</Button>)}</div></>}
      <Link className="text-link login-switch" href={portal?'/':'/portal'}>{portal?'Open staff workspace':'Open customer portal'}</Link>
    </div></section></main>;
}
export function Workspace({demo}:{demo:boolean}) {
  const pathname=usePathname();
  const router=useRouter();
  const [first,...parts]=pathname.split('/').filter(Boolean);
  const portal=first==='portal';
  const [section='',recordId,sub]=portal?parts:[first,...parts];
  const [data,setData]=useState<Data|null>(null);
  const [loading,setLoading]=useState(true);
  const [fatal,setFatal]=useState('');
  const [toast,setToast]=useState<{text:string;error:boolean;id:number}>();
  const [menuOpen,setMenu]=useState(false);
  const [panel,setPanel]=useState<'search'|'notifications'|'profile'>();
  const [term,setTerm]=useState('');
  const [dark,setDark]=useState(false);
  const refresh=useCallback(async()=>{
    try {setData(await api('data',portal));setFatal('');}
    catch(e) {setData(null); if ((e as Row).status!==401) setFatal((e as Error).message);}
    finally {setLoading(false);}
  },[portal]);
  useEffect(()=>{
    if (portal&&location.hash.startsWith('#access=')) {
      const token=location.hash.slice(8);
      history.replaceState(null,'',location.pathname);
      api('portal-link',true,post({token})).then(refresh).catch(error=>{setFatal(error.message);setLoading(false);});
    } else void refresh();
  },[portal,refresh]);
  useEffect(()=>{
    const theme=localStorage.getItem('zuri-theme')==='dark';
    setDark(theme);document.documentElement.dataset.theme=theme?'dark':'light';
  },[]);
  useEffect(()=>{
    const handler=(e:KeyboardEvent)=>{
      if ((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k') {e.preventDefault();setPanel('search');}
      if (e.key==='Escape') {setPanel(undefined);setMenu(false);}
    };
    window.addEventListener('keydown',handler);
    return ()=>window.removeEventListener('keydown',handler);
  },[]);
  useEffect(()=>{setMenu(false);setPanel(undefined);},[pathname]);
  useEffect(()=>{
    if (!toast) return;
    const timer=setTimeout(()=>setToast(undefined),3700);
    return ()=>clearTimeout(timer);
  },[toast]);
  useEffect(()=>{
    if (!data) return;
    const timer=setInterval(()=>{if (document.visibilityState==='visible') void refresh();},section==='simulation'||section==='inbox'?3500:12000);
    const onFocus=()=>{void refresh();};
    window.addEventListener('focus',onFocus);
    document.addEventListener('visibilitychange',onFocus);
    return ()=>{clearInterval(timer);window.removeEventListener('focus',onFocus);document.removeEventListener('visibilitychange',onFocus);};
  },[Boolean(data),refresh,section]);
  const role=data?.user.role;
  useEffect(()=>{
    if (!role||!['admin','manager','ops','finance'].includes(role)||!data?.autoDue) return;
    const timer=setInterval(()=>{
      if(document.visibilityState==='visible') {
        void api('action',false,post({action:'automation.due',input:{}})).then(refresh).catch(()=>{});
      }
    },60_000);
    return ()=>clearInterval(timer);
  },[role,data?.autoDue,refresh]);
  async function act(action:string,input:unknown,success?:string|((row:Row)=>string)) {
    try {
      const result=await api(action==='website.ingest'?'ingest':'action',portal,post(action==='website.ingest'?input:{action,input}));
      await refresh();
      if(success) setToast({text:typeof success==='function'?success(result):success,error:false,id:Date.now()});
      return result;
    } catch(e) {
      setToast({text:(e as Error).message,error:true,id:Date.now()});
      throw e;
    }
  }
  const setTheme=()=>{
    const next=!dark;setDark(next);localStorage.setItem('zuri-theme',next?'dark':'light');
    document.documentElement.dataset.theme=next?'dark':'light';
  };
  if (loading) return <div className="app-loading"><Compass className="spin" size={26}/> Loading workspace…</div>;
  if (!data||portal!==(data.user.role==='customer')) return <Login key={String(portal)} portal={portal} onLogin={refresh} initialError={fatal} demo={demo}/>;
  const items=portal?portalMenu.map(x=>({...x,group:'Your trips'})):menu.filter(item=>data.user.role==='admin'||item.roles.includes(data.user.role));
  const current=items.find(item=>item.id===section);
  const prefix=portal?'/portal':'';
  const href=(id:string)=>prefix+(id?'/'+id:prefix?'':'/');
  const initials=data.user.name.split(' ').map(s=>s[0]).slice(0,2).join('');
  const alerts=data.notifications.filter(n=>!n.read).length;
  const searchRows=[
    ...data.leads.map(l=>({title:`${l.destination||'Enquiry'} · ${l.id}`,description:data.customers.find(c=>c.id===l.customer_id)?.name,href:href('leads/'+l.id)})),
    ...data.bookings.map(b=>({title:`${b.destination} · ${b.id}`,description:data.customers.find(c=>c.id===b.customer_id)?.name,href:href('bookings/'+b.id)})),
    ...data.quotes.map(q=>({title:`${q.destination} · ${q.id}`,description:'Quotation · '+q.status,href:href('quotes/'+q.id)})),
    ...data.customers.filter(()=>!portal).map(c=>({title:c.name,description:c.email,href:href('customers/'+c.id)})),
    ...data.packages.map(p=>({title:p.title,description:p.destination,href:href('packages/'+p.id)})),
  ];
  return <AppContext.Provider value={{data,act,portal,refresh,upload:async form=>{
    const result=await api('upload',portal,{method:'POST',body:form});await refresh();setToast({text:'Document uploaded',error:false,id:Date.now()});return result;
  }}}>
    <div className={'layout'+(portal?' portal-layout':'')}>
      {menuOpen&&<button className="nav-backdrop" aria-label="Close navigation" onClick={()=>setMenu(false)}/>}
      <aside className={'sidebar'+(menuOpen?' open':'')}>
        <Brand portal={portal}/>
        <div className="nav-main">{[...new Set(items.map(item=>item.group))].map(group=><nav aria-label={group} key={group}><div className="nav-label">{group}</div>
          {items.filter(item=>item.group===group).map(item=><Link aria-current={section===item.id?'page':undefined} key={item.id} className={section===item.id?'active':''} href={href(item.id)}><item.icon size={17}/><span>{item.title}</span>{section===item.id&&<i/>}</Link>)}</nav>)}</div>
        <div className="nav-footer"><span className="demo-label"><i/> Demo environment</span><small>Developed by Infinex Loop</small></div>
      </aside>
      <main className="main">
        <header className="topbar"><div className="breadcrumbs">
          <Button className="icon-button quiet nav-toggle" aria-label="Open navigation" onClick={()=>setMenu(!menuOpen)}><Menu size={22}/></Button>
          <Link href={href('')}>{portal?'Travel portal':'Workspace'}</Link><ChevronRight size={14}/><span>{current?.title||'Record'}</span>
          {recordId&&<><ChevronRight className="crumb-detail" size={14}/><span className="crumb-detail">{recordId}</span></>}</div>
          <div className="top-actions">
            <Button className="search-trigger outline" aria-label="Global search" onClick={()=>{setTerm('');setPanel('search');}}><Search size={17}/><span>Search</span><kbd>⌘ K</kbd></Button>
            <Button className="icon-button quiet" aria-label={dark?'Use light theme':'Use dark theme'} onClick={setTheme}>{dark?<Sun size={19}/>:<Moon size={18}/>}</Button>
            <Button className="icon-button quiet bell" aria-label={`Notifications (${alerts} unread)`} onClick={()=>setPanel(panel==='notifications'?undefined:'notifications')}><Bell size={19}/>{alerts>0&&<i/>}</Button>
            <Button className="profile quiet" aria-label="Profile menu" onClick={()=>setPanel(panel==='profile'?undefined:'profile')}><span className="avatar">{initials}</span><span className="profile-name"><strong>{data.user.name}</strong><small>{roles[data.user.role]}</small></span><ChevronDown size={14}/></Button>
          </div>
        </header>
        <div className="content" key={pathname}>
          {!current?<Empty title="This page is unavailable" description="Choose a section from the navigation."/>:
            section===''?<Overview/>:section==='reports'?<Overview reports/>:section==='guide'?<DemoGuide/>:
            section==='simulation'?<Simulation id={recordId}/>:section==='inbox'?<Inbox id={recordId}/>:
            <Records section={section} id={recordId} sub={sub}/>}
        </div>
      </main>
    </div>
    {panel&&<Modal title={panel==='search'?'Find a record':panel==='profile'?'Your profile':'Notifications'} close={()=>setPanel(undefined)}>
      {panel==='search'?<><label className="search-field full"><Search size={17}/><input autoFocus placeholder="Search names, destinations and references" aria-label="Search all records" value={term} onChange={e=>setTerm(e.target.value)}/></label>
        <div className="search-results">{term.trim()&&searchRows.filter(r=>(r.title+' '+r.description).toLowerCase().includes(term.trim().toLowerCase())).slice(0,15).map(r=>
          <Link key={r.href} href={r.href} onClick={()=>setPanel(undefined)}><strong>{r.title}</strong><small>{r.description}</small></Link>)}</div></>:
        panel==='notifications'?data.notifications.length?<div className="search-results">{data.notifications.map(n=><Link key={n.id} href={n.href} onClick={()=>{setPanel(undefined);void act('notification.read',{id:n.id}).catch(()=>{});}}>
          <strong>{n.title}</strong><small>{n.read?'Read':'Unread'}</small></Link>)}</div>:<Empty title="You’re all caught up" description="New assignments and reminders appear here."/>:
        <div className="profile-menu"><p><strong>{data.user.name}</strong><br/>{data.user.email}<br/>{roles[data.user.role]}</p>
          <a className="button outline" href={portal?'/':'/portal'} target="_blank" rel="noreferrer">{portal?'Staff workspace':'Customer portal'}</a>
          <Button className="outline" onClick={async()=>{await api('logout',portal,{method:'POST'});setPanel(undefined);setData(null);router.replace(href(''));}}><LogOut size={16}/> Sign out</Button></div>}
    </Modal>}
    {toast&&<div className={'toast'+(toast.error?' error-toast':'')} role={toast.error?'alert':'status'} key={toast.id}><span>{toast.text}</span><Button className="quiet icon-button" aria-label="Dismiss notification" onClick={()=>setToast(undefined)}><X size={16}/></Button></div>}
  </AppContext.Provider>;
}
