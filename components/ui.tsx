'use client';

import { createContext, useContext, useId, useState, type FormEvent, type ReactNode, type ButtonHTMLAttributes } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, CalendarDays, ChevronLeft, ChevronRight, CircleAlert, Download, FolderOpen, LoaderCircle, Plus, Search, X } from 'lucide-react';
import { money, timestamp, titleDate, type User } from '../domains/shared';

export type Row=Record<string,any>;
export type Data={ [K in 'customers'|'leads'|'packages'|'package_days'|'package_suppliers'|'quotes'|'revisions'|'conversations'|'messages'|'submissions'|'bookings'|
  'suppliers'|'supplier_jobs'|'settlements'|'payments'|'invoices'|'adjustments'|'tasks'|'documents'|'visas'|'travellers'|'booking_travellers'|'feedback'|'events'|'team'|'notifications'|'workflows']:Row[]
} & {user:User;today:string;demo:boolean;autoDue:boolean};
type Action=(action:string,input:unknown,success?:string|((row:Row)=>string))=>Promise<Row>;
export const AppContext=createContext<{data:Data;act:Action;upload:(form:FormData)=>Promise<Row>;refresh:()=>Promise<void>;portal:boolean}|null>(null);
export function useApp() { const value=useContext(AppContext); if (!value) throw Error('Workspace is not initialized'); return value; }
export const labelFor=(records:Row[],id:string,field='name')=>records.find(row=>row.id===id)?.[field]||'—';
export function Button({children,className='',...props}:ButtonHTMLAttributes<HTMLButtonElement>){
  return <button type="button" className={'button '+className} {...props}>{children}</button>;
}
export function PageHeading({title,description,children}:{title:string;description?:string;children?:ReactNode}) {
  return <div className="page-heading"><div><h1>{title}</h1>{description&&<p>{description}</p>}</div>{children&&<div className="actions">{children}</div>}</div>;
}
export function Panel({title,description,children,action,className=''}:{title?:string;description?:string;children:ReactNode;action?:ReactNode;className?:string}) {
  return <section className={'panel '+className}>{title&&<header className="panel-head"><div><h2>{title}</h2>{description&&<p>{description}</p>}</div>{action}</header>}{children}</section>;
}
export function Empty({title='No matching records',description='Try changing the filters.'}:{title?:string;description?:string}) {
  return <div className="empty"><FolderOpen size={23}/><strong>{title}</strong><p>{description}</p></div>;
}
export function Badge({value}:{value:string}) {
  const tone=['Completed','Confirmed','Accepted','Paid','Verified','Qualified','Approved','Won','Done','Success','Documents Ready'].includes(value)?'green':
    ['Cancelled','Lost','Failed','Rejected','Expired','Missing','Urgent','Overdue','Error'].includes(value)?'red':
    ['Advance Recorded','New','Sent','In Conversation','In progress','Travel In Progress','Viewed','Automation','Website'].includes(value)?'blue':
    ['Pending Advance','Requested','Supplier Confirmation Pending','Documents Pending','Pending','High','Human','Internal Review','Refunded','Unresponsive'].includes(value)?'amber':'neutral';
  return <span className={`badge ${tone}`}>{value}</span>;
}
export function Modal({title,close,children}:{title:string;close:()=>void;children:ReactNode}) {
  const titleId=useId();
  return <dialog aria-labelledby={titleId} ref={node=>{ if(node&&!node.open) node.showModal(); }} onCancel={e=>{e.preventDefault();close();}} className="dialog">
    <div className="dialog-head"><h2 id={titleId}>{title}</h2><Button className="icon-button quiet" aria-label="Close dialog" onClick={close}><X size={19}/></Button></div>
    <div className="dialog-body">{children}</div>
  </dialog>;
}

export type Field={name:string;label:string;type?:'text'|'email'|'tel'|'number'|'money'|'date'|'datetime-local'|'password'|'textarea'|'checkbox'|'select';
  options?:readonly (string|{value:string;label:string})[];optional?:boolean; placeholder?:string;value?:any;min?:number;max?:number;};
export type Day={title:string;description:string};
export function readDays(raw?:string):Day[] {
  if (!raw) return [{title:'',description:''}];
  try { return JSON.parse(raw); } catch { return [{title:'',description:''}]; }
}
export function selectRows(rows:Row[],label='name') { return rows.map(r=>({value:r.id,label:String(r[label]||r.id)})); }
export function Form({fields,initial={},submit,label='Save changes',children,itinerary,onChange,options}:{fields:Field[];initial?:Row;
  submit:(data:Row)=>Promise<unknown>;label?:string;children?:ReactNode;itinerary?:Day[];onChange?:(name:string,value:any)=>Row|void;
  options?:{totals?:boolean}}) {
  const [values,set]=useState<Row>(initial);
  const [days,setDays]=useState(itinerary);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  function change(field:Field, raw:any) {
    const updates=onChange?.(field.name,raw);
    if (updates?.itinerary) setDays(updates.itinerary);
    set(prev=>({...prev,[field.name]:raw,...updates}));
  }
  const get=(f:Field)=>values[f.name]??f.value??'';
  const convert=(f:Field)=>{
    const raw=get(f);
    if (f.type==='money') {
      if (typeof raw==='number') return raw;
      const [whole='0',fraction='']=String(raw||'0').split('.');
      return Number(whole)*100+Number(fraction.padEnd(2,'0'));
    }
    if (f.type==='number') return Number(raw||0);
    if (f.type==='checkbox') return Boolean(raw);
    return raw;
  };
  const preview=options?.totals?fields.reduce<Row>((out,f)=>({...out,[f.name]:convert(f)}),{}):null;
  async function save(e:FormEvent) {
    e.preventDefault();setBusy(true);setError('');
    try { await submit({...Object.fromEntries(fields.map(f=>[f.name,convert(f)])),...(days?{itinerary:days}:{})}); }
    catch(err) {setError(err instanceof Error?err.message:'Unable to save');}
    finally {setBusy(false);}
  }
  return <form onSubmit={save} className="form">
    <div className="form-grid">{fields.map(f=>{
      const val=get(f);
      const standard={name:f.name,'aria-label':f.label,required:!f.optional&&f.type!=='checkbox',placeholder:f.placeholder};
      return <label className={f.type==='textarea'?'field wide':'field'} key={f.name}>
        {f.type!=='checkbox'&&<span>{f.label}</span>}
        {f.type==='textarea'?<textarea rows={3} {...standard} value={val} onChange={e=>change(f,e.target.value)}/>:
          f.type==='select'?<select {...standard} value={val} onChange={e=>change(f,e.target.value)}><option value="">{f.optional?'None':'Select…'}</option>{f.options?.map(o=>typeof o==='string'?<option key={o}>{o}</option>:<option key={o.value} value={o.value}>{o.label}</option>)}</select>:
          f.type==='checkbox'?<span className="check-label"><input type="checkbox" name={f.name} checked={Boolean(val)} onChange={e=>change(f,e.target.checked)}/>{f.label}</span>:
          <input {...standard} type={f.type==='money'?'number':f.type||'text'} step={f.type==='money'?'0.01':undefined} min={f.min??(f.type==='money'?0:undefined)} max={f.max}
            value={f.type==='money'&&typeof val==='number'?val/100:val} onChange={e=>change(f,e.target.value)}/>}
      </label>;
    })}</div>
    {preview&&<div className="cost-preview"><span>Quotation total</span><strong>{money((preview.cost||0)+(preview.markup||0)+(preview.extras||0)+(preview.tax||0)-(preview.discount||0))}</strong></div>}
    {days&&<fieldset className="day-editor"><legend>Day-wise itinerary</legend>{days.map((d,i)=><div className="day-edit" key={i}><div className="day-edit-head">
      <strong>Day {i+1}</strong><div className="actions"><Button className="icon-button quiet" aria-label={`Move day ${i+1} up`} disabled={i===0} onClick={()=>setDays(days.map((x,j)=>j===i-1?d:j===i?days[i-1]:x))}><ArrowUp size={15}/></Button>
      <Button className="icon-button quiet" aria-label={`Move day ${i+1} down`} disabled={i===days.length-1} onClick={()=>setDays(days.map((x,j)=>j===i+1?d:j===i?days[i+1]:x))}><ArrowDown size={15}/></Button>
      <Button className="icon-button quiet" aria-label={`Remove day ${i+1}`} disabled={days.length===1} onClick={()=>setDays(days.filter((_,j)=>i!==j))}><X size={15}/></Button></div></div>
      <input aria-label={`Day ${i+1} title`} required placeholder="Day title" value={d.title} onChange={e=>setDays(days.map((x,j)=>j===i?{...x,title:e.target.value}:x))}/>
      <textarea aria-label={`Day ${i+1} details`} placeholder="Day details" value={d.description} onChange={e=>setDays(days.map((x,j)=>j===i?{...x,description:e.target.value}:x))}/>
    </div>)}<Button className="outline" disabled={days.length>=45} onClick={()=>setDays([...days,{title:'',description:''}])}><Plus size={16}/> Add day</Button></fieldset>}
    {children}{error&&<p className="error" role="alert"><CircleAlert size={17}/>{error}</p>}
    <div className="form-foot"><Button type="submit" disabled={busy}>{busy&&<LoaderCircle className="spin" size={16}/>} {busy?'Saving…':label}</Button></div>
  </form>;
}

type Column={label:string;key:string;render?:(row:Row)=>ReactNode};
export function Table({records,columns,href,filter='',search='Search records',size=12, extra}:{records:Row[];columns:Column[];href?:(r:Row)=>string;
  filter?:string;search?:string;size?:number;extra?:ReactNode}) {
  const [query,setQuery]=useState('');
  const [choice,setChoice]=useState('');
  const [sort,setSort]=useState<{key:string;desc:boolean}>();
  const [page,setPage]=useState(0);
  const matches=records.filter(r=>(!choice||r[filter]===choice)&&(!query||Object.values(r).some(v=>String(v??'').toLowerCase().includes(query.toLowerCase()))));
  if (sort) matches.sort((a,b)=>{
    const x=a[sort.key],y=b[sort.key];
    const rank=typeof x==='number'&&typeof y==='number'?x-y:String(x??'').localeCompare(String(y??''),undefined,{numeric:true});
    return sort.desc?-rank:rank;
  });
  const p=Math.min(page,Math.max(0,Math.ceil(matches.length/size)-1));
  return <div className="table-widget">
    <div className="table-tools"><label className="search-field"><Search size={17}/><input aria-label={search} placeholder={search} value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}}/></label>
      {filter&&<select aria-label={'Filter by '+filter} value={choice} onChange={e=>{setChoice(e.target.value);setPage(0);}}><option value="">All {filter==='category'?'categories':filter+'s'}</option>{[...new Set(records.map(r=>r[filter]).filter(Boolean))].sort().map(s=><option key={s}>{s}</option>)}</select>}{extra}</div>
    {!matches.length?<Empty/>:<div className="table-scroll"><table><thead><tr>{columns.map(c=><th key={c.key} scope="col" aria-sort={sort?.key===c.key?sort.desc?'descending':'ascending':'none'}>
      <button onClick={()=>setSort({key:c.key,desc:sort?.key===c.key?!sort.desc:false})}>{c.label} {sort?.key===c.key&&(sort.desc?<ArrowDown size={13}/>:<ArrowUp size={13}/>)}</button></th>)}</tr></thead>
      <tbody>{matches.slice(p*size,p*size+size).map((r,i)=><tr key={r.id||i}>{columns.map((c,j)=><td key={c.key}>
        {j===0&&href?<Link className="row-link" href={href(r)}>{c.render?c.render(r):r[c.key]??'—'}</Link>:c.render?c.render(r):r[c.key]??'—'}</td>)}</tr>)}</tbody></table></div>}
    {!!matches.length&&<div className="table-footer"><span>Showing {p*size+1}–{Math.min((p+1)*size,matches.length)} of {matches.length}</span><div className="actions">
      <Button className="icon-button outline" aria-label="Previous page" disabled={p===0} onClick={()=>setPage(p-1)}><ChevronLeft size={17}/></Button>
      <Button className="icon-button outline" aria-label="Next page" disabled={(p+1)*size>=matches.length} onClick={()=>setPage(p+1)}><ChevronRight size={17}/></Button></div></div>}
  </div>;
}
export const stateColumn=(key='status',label='Status'):Column=>({key,label,render:r=><Badge value={r[key]}/>});
export const dateColumn=(key:string,label:string):Column=>({key,label,render:r=>titleDate(r[key])});
export const moneyColumn=(key:string,label:string):Column=>({key,label,render:r=>money(r[key]||0)});
export function Details({items}:{items:[string,ReactNode][]}) {
  return <dl className="details">{items.map(([name,value])=><div key={name}><dt>{name}</dt><dd>{value===null||value===undefined||value===''?'—':value}</dd></div>)}</dl>;
}
export function Itinerary({days}:{days:Day[]}) {
  return <ol className="itinerary">{days.map((day,i)=><li key={i}><div className="day-circle">{i+1}</div><div><strong>{day.title}</strong><p>{day.description}</p></div></li>)}</ol>;
}
export function Timeline({events,limit=30}:{events:Row[];limit?:number}) {
  const {portal}=useApp();
  return events.length?<ol className="timeline">{events.slice(0,limit).map(event=><li key={event.id}><i className={event.outcome==='Error'?'failed':''}/><div><strong>{event.kind}</strong>
    <p>{event.summary}</p><small>{timestamp(event.created)} · {event.outcome||'Recorded'}</small>
    {!portal&&event.lead_id&&<Link className="text-link timeline-link" href={'/leads/'+event.lead_id}>Open lead</Link>}</div></li>)}</ol>:<Empty title="No activity yet" description="Activity will appear here as changes are saved."/>;
}
export function DownloadLink({kind,id,children}:{kind:string;id:string;children:ReactNode}) {
  const {portal}=useApp();
  return <a className="button outline" href={`/api/crm/file/${kind}/${id}${portal?'?space=portal':''}`} download><Download size={16}/>{children}</a>;
}
export function Upcoming({records}:{records:Row[]}) {
  const {data,portal}=useApp();
  if (!records.length) return <Empty title="No upcoming departures" description="Confirmed future trips appear here."/>;
  return <div className="upcoming">{records.map(r=><Link key={r.id} href={(portal?'/portal':'')+'/bookings/'+r.id} className="upcoming-row">
    <span className="list-icon"><CalendarDays size={17}/></span><span><strong>{r.destination}</strong><small>{labelFor(data.customers,r.customer_id)} · {r.id}</small></span><span className="upcoming-date">{titleDate(r.departure)}</span></Link>)}</div>;
}
