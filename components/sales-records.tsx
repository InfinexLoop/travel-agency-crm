'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Compass, FileText, List, Columns3, MapPin, MessageCircle, Plus } from 'lucide-react';
import { balance, money, sources, stages, timestamp, titleDate } from '../domains/shared';
import { travelWindow } from '../domains/travel-dates';
import { ActionButton, EditButton, addDays, field, inr, memo, optional } from './actions';
import { EnquiryForm, inputFields } from './simulation';
import { Badge, Button, Details, DownloadLink, Empty, Form, Itinerary, Modal, PageHeading, Panel, Table, Timeline, dateColumn, labelFor, moneyColumn, readDays, selectRows, stateColumn, useApp, type Field, type Row } from './ui';

const missing=(entity:string)=><Empty title={entity+' not found'} description="Open an accessible record from its list." />;
export function Leads({id}:{id?:string}) {
  const {data,portal}=useApp();
  const router=useRouter();
  const [layout,setLayout]=useState('Table');
  const [filter,setFilter]=useState('');
  const [form,setForm]=useState('');
  const [query,setQuery]=useState('');
  const href=(id:string)=>(portal?'/portal':'')+'/leads/'+id;
  const rows:Row[]=data.leads.map(l=>({...l,contact:labelFor(data.customers,l.customer_id),salesperson:labelFor(data.team,l.owner)}));
  const lead=rows.find(l=>l.id===id);
  if (!id) {
    const matches=rows.filter(l=>(!filter||l.source===filter)&&(!query||[l.contact,l.destination,l.id].join(' ').toLowerCase().includes(query.toLowerCase())));
    return <>
      <PageHeading title={portal?'My enquiries':'Enquiries'} description={portal?'Track the travel requests you’ve shared with the team.':'Qualify enquiries, schedule follow-ups and move travellers through the sales pipeline.'}>
        {!portal&&<><Button className="outline" onClick={()=>setForm('Phone Call')}>Log phone enquiry</Button><Button onClick={()=>setForm('Manual')}><Plus size={17}/> New enquiry</Button></>}
      </PageHeading>
      <Panel>
        <div className="list-toolbar">
          {!portal&&<div className="segmented">{[['Table',List],['Kanban',Columns3]].map(([label,Icon])=>{const Glyph=Icon as typeof List;return <Button key={String(label)} className={layout===label?'selected':'quiet'} onClick={()=>setLayout(String(label))}><Glyph size={16}/>{String(label)}</Button>;})}</div>}
          {layout==='Kanban'&&<input aria-label="Search pipeline" placeholder="Search pipeline" value={query} onChange={e=>setQuery(e.target.value)}/>}
          {!portal&&<select aria-label="Filter by source" value={filter} onChange={e=>setFilter(e.target.value)}><option value="">All sources</option>{sources.map(s=><option key={s}>{s}</option>)}</select>}
        </div>
        {layout==='Kanban'?<div className="kanban">{stages.map(stage=><section key={stage}><header><Badge value={stage}/><small>{matches.filter(l=>l.stage===stage).length}</small></header>
          {matches.filter(l=>l.stage===stage).map(l=><Link href={href(l.id)} className="kanban-card" key={l.id}><strong>{l.contact}</strong><span>{l.destination||'Destination undecided'}</span><small>{l.source} · {l.id}</small></Link>)}</section>)}</div>:
          <Table records={matches} href={r=>href(r.id)} search="Search enquiries" filter="stage"
            columns={[{label:'Customer',key:'contact',render:r=><span className="stack"><strong>{r.contact}</strong><small>{r.id}</small></span>},{label:'Destination',key:'destination'},{label:'Source',key:'source'},
              stateColumn('stage','Stage'),...(!portal?[{label:'Salesperson',key:'salesperson'},dateColumn('follow_up','Follow-up')]:[dateColumn('created','Submitted')])]}/>}
      </Panel>
      {form&&<Modal title={form==='Phone Call'?'Log phone enquiry':'New enquiry'} close={()=>setForm('')}><EnquiryForm channel={form} onSaved={r=>{setForm('');router.push(href(r.lead));}}/></Modal>}
    </>;
  }
  if (!lead) return missing('Enquiry');
  const customer=data.customers.find(c=>c.id===lead.customer_id);
  const linked=data.quotes.filter(q=>q.lead_id===id);
  const relevant=data.conversations.filter(c=>c.lead_id===id);
  const same=rows.filter(l=>l.id!==id&&l.customer_id===lead.customer_id);
  return <>
    <PageHeading title={lead.contact} description={`${lead.id} · ${lead.source} enquiry`}>
      {!portal&&<><Button className="outline" onClick={()=>setForm('Edit')}>Edit enquiry</Button><Link className="button" href={'/quotes/new?lead='+lead.id}><Plus size={16}/> Create quotation</Link></>}
    </PageHeading>
    <div className="detail-grid">
      <Panel title="Travel brief" action={<Badge value={lead.stage}/>}><div className="panel-body">
        <Details items={[['Destination',lead.destination],['Departure city',lead.city],['Travel dates',lead.dates],['Flexible dates',lead.flexible?'Yes':'No'],['Travellers',`${lead.adults} adults · ${lead.children} children`],['Children’s ages',lead.ages],['Budget',lead.budget?money(lead.budget):null],
          ['Trip purpose',lead.purpose],['Package interest',labelFor(data.packages,lead.package_id,'title')],['Requirements',lead.preferences],['Last interaction',titleDate(lead.touched)],
          ...(!portal?[['Priority',lead.priority],['Follow-up',titleDate(lead.follow_up)]] as [string,string][]:[])]}/>
        {!portal&&<div className="actions section-actions">
          <EditButton label="Change stage" action="lead.stage" input={{id:lead.id}} initial={lead}
            fields={[field('stage','Lead stage','select',{options:stages.filter(s=>!['Quotation Prepared','Quotation Sent','Won'].includes(s))})]}/>
          {data.user.role!=='sales'&&<EditButton label="Assign salesperson" action="lead.assign" input={{id:lead.id}} initial={lead}
            fields={[field('owner','Sales owner','select',{options:selectRows(data.team.filter(u=>u.active&&['sales','manager','admin'].includes(u.role)))})]}/>}
          <EditButton label="Add staff note" action="lead.note" input={{id:lead.id}} fields={[field('body','Note','textarea')]}/>
          {same.length>0&&<EditButton label="Merge enquiry" title="Move history to another enquiry for this customer" action="lead.merge" input={{id:lead.id}}
            fields={[field('target','Merge into','select',{options:same.map(x=>({value:x.id,label:x.id+' · '+x.destination+' · '+x.stage}))})]} done={r=>router.push(href(r.id))}/>}
        </div>}
        </div></Panel>
      <Panel title="Contact & related records"><div className="panel-body">
        <Details items={[['Customer',portal?customer?.name:<Link className="text-link" href={'/customers/'+lead.customer_id}>{customer?.name}</Link>],['Phone',customer?.phone],['WhatsApp',customer?.whatsapp],['Email',customer?.email],['Instagram',customer?.instagram],...(!portal?[['Sales owner',lead.salesperson]] as [string,string][]:[])]}/>
        <div className="record-links">{relevant.map(c=><Link key={c.id} href={(portal?'/portal':'')+'/inbox/'+c.id}><MessageCircle size={16}/>{c.channel} conversation</Link>)}
          {linked.map(q=><Link key={q.id} href={(portal?'/portal':'')+'/quotes/'+q.id}><FileText size={16}/>{q.id} · {q.status}</Link>)}</div>
      </div></Panel>
    </div>
    {!portal&&<div className="detail-grid"><Panel title="Lead activity"><div className="panel-body"><Timeline events={data.events.filter(e=>e.lead_id===id)}/></div></Panel>
      <div className="stack-layout"><Panel title="Conversation history"><div className="panel-body">
        {relevant.length===0?<Empty title="No conversations yet" description="New messages and enquiries appear here."/>:
          data.messages.filter(m=>relevant.some(c=>c.id===m.conversation_id)).map(m=><div className="message-line" key={m.id}><small>{labelFor(relevant,m.conversation_id,'channel')} · {m.direction} · {timestamp(m.created)}</small><p>{m.body}</p></div>)}
        </div></Panel>
        <Panel title="Website submissions & attachments"><div className="panel-body">
          {data.submissions.filter(s=>s.lead_id===id).map(s=><p key={s.id}>Website form {s.id} · {titleDate(s.created)}</p>)}
          <div className="record-links">{data.documents.filter(d=>d.lead_id===id).map(d=><Link key={d.id} href={'/documents/'+d.id}>{d.name} · {d.status}</Link>)}</div>
          <Link className="button outline" href={'/documents/new?lead='+lead.id}>Upload lead attachment</Link>
        </div></Panel></div></div>}
    {form==='Edit'&&<Modal title="Edit enquiry" close={()=>setForm('')}><EnquiryForm channel={lead.source} edit initial={{...lead,name:lead.contact}} onSaved={()=>setForm('')}/></Modal>}
  </>;
}

const packageFields:Field[]=[field('title','Package title'),field('destination','Destination'),field('category','Trip category'),
  field('nights','Nights','number',{min:0,max:99,value:3}),field('valid_until','Valid through','date'),
  inr('base','Base cost'),inr('markup','Markup'),optional('hotel','Hotel category'),optional('meals','Meals'),optional('transfers','Transfers'),
  field('flights','Flights included','checkbox'),memo('overview','Overview'),memo('activities','Activities'),memo('inclusions','Inclusions'),memo('exclusions','Exclusions'),memo('cancellation','Cancellation conditions')];
export function Packages({id}:{id?:string}) {
  const {data}=useApp();
  const router=useRouter();
  const [view,setView]=useState('Catalogue');
  const [query,setQuery]=useState('');
  const [category,setCategory]=useState('');
  const p=data.packages.find(p=>p.id===id);
  const canEdit=['admin','manager'].includes(data.user.role);
  const canSupplier=['admin','manager','ops'].includes(data.user.role);
  const rows=data.packages.filter(r=>(!category||r.category===category)&&[r.title,r.destination,r.id].join(' ').toLowerCase().includes(query.toLowerCase()));
  const nav=(r:Row)=>router.push('/packages/'+r.id);
  if (!id) return <>
    <PageHeading title="Tour packages" description="Browse editable demo itineraries for domestic and international trips.">
      {canEdit&&<EditButton label="New package" action="package.save" fields={packageFields} initial={{valid_until:addDays(data.today,90)}}
        itinerary={readDays()} className="" done={nav}><Plus size={16}/></EditButton>}</PageHeading>
    <Panel><div className="list-toolbar"><div className="segmented">{['Catalogue','Table'].map(label=><Button className={label===view?'selected':'quiet'} key={label} onClick={()=>setView(label)}>{label}</Button>)}</div>
      {view==='Catalogue'&&<><input placeholder="Search packages" aria-label="Search packages" value={query} onChange={e=>setQuery(e.target.value)}/>
      <select aria-label="Filter package category" value={category} onChange={e=>setCategory(e.target.value)}><option value="">All categories</option>{[...new Set(data.packages.map(p=>p.category))].sort().map(c=><option key={c}>{c}</option>)}</select></>}</div>
      {view==='Table'?<Table records={data.packages.map(p=>({...p,selling:p.base+p.markup,status:p.active?'Active':'Archived'}))} filter="category" href={p=>'/packages/'+p.id}
        columns={[{key:'title',label:'Package'},{key:'destination',label:'Destination'},{key:'category',label:'Category'},{key:'nights',label:'Nights'},moneyColumn('selling','Selling price'),stateColumn()]}/>:
      <div className="package-grid">{rows.map(p=><Link className="package-card" key={p.id} href={'/packages/'+p.id}>
        <div className={'package-cover '+(p.cover?'has-cover':'')} style={p.cover?{backgroundImage:`url(${p.cover})`}:undefined}>
          <span><MapPin size={14}/>{p.destination}</span>{!p.cover&&<Compass size={56} strokeWidth={.75}/>}</div>
        <div className="package-body"><div><small>{p.category} · {p.nights+1} days</small><h2>{p.title}</h2></div><strong>{money(p.base+p.markup)}</strong>{!p.active&&<Badge value="Archived"/>}</div></Link>)}
        {!rows.length&&<Empty/>}</div>}</Panel>
  </>;
  if (!p) return missing('Package');
  const itinerary=data.package_days.filter(d=>d.package_id===id).map(d=>({title:d.title,description:d.description}));
  const linked=data.package_suppliers.filter(r=>r.package_id===id);
  return <>
    <PageHeading title={p.title} description={`${p.id} · ${p.destination} · ${p.nights} nights / ${p.nights+1} days`}>
      {canEdit&&<><ActionButton action="package.toggle" input={{id}}>{p.active?'Archive package':'Restore package'}</ActionButton>
      <ActionButton action="package.duplicate" input={{id}} done={nav}>Duplicate</ActionButton>
      <EditButton label="Edit package" action="package.save" input={{id}} fields={packageFields} initial={p} itinerary={itinerary} className=""/></>}
    </PageHeading>
    <div className="detail-grid"><Panel title="Package details" action={<Badge value={p.active?'Active':'Archived'}/>}><div className="panel-body"><p>{p.overview}</p>
      <Details items={[['Category',p.category],['Base cost',money(p.base)],['Markup',money(p.markup)],['Selling price',money(p.base+p.markup)],['Valid through',titleDate(p.valid_until)],['Hotel',p.hotel],
        ['Meals',p.meals],['Transfers',p.transfers],['Flights',p.flights?'Included':'Excluded'],['Activities',p.activities],['Inclusions',p.inclusions],['Exclusions',p.exclusions],['Cancellation',p.cancellation]]}/></div></Panel>
      <Panel title="Day-wise itinerary"><div className="panel-body"><Itinerary days={itinerary}/></div></Panel></div>
    {canSupplier&&<Panel title="Package suppliers" action={<EditButton label="Link supplier" action="package.supplier" input={{id}} fields={[field('supplier','Supplier','select',{options:selectRows(data.suppliers.filter(s=>s.active))})]}/>}>
      <div className="panel-body">{linked.length?linked.map(s=><div className="inline-row" key={s.supplier_id}><Link className="text-link" href={'/suppliers/'+s.supplier_id}>{labelFor(data.suppliers,s.supplier_id)}</Link>
        <ActionButton action="package.supplier" input={{id,supplier:s.supplier_id,remove:true}}>Remove link</ActionButton></div>):<Empty title="No linked suppliers" description="Link a demo supplier that serves this itinerary."/>}</div></Panel>}
  </>;
}

export function PortalLink({customer,quote}:{customer:string;quote?:string}) {
  const [result,setResult]=useState<string>();
  return <>{result?<a className="button" href={(quote?'/portal/quotes/'+quote:'/portal')+'#access='+result} target="_blank" rel="noreferrer">Open customer portal</a>:
    <ActionButton action="portal.link" input={{id:customer}} success="One-time portal link created" done={r=>setResult(r.token)}>Create demo portal link</ActionButton>}
  </>;
}
const quoteFields=(data:ReturnType<typeof useApp>['data']):Field[]=>[
  field('package_id','Package template','select',{options:selectRows(data.packages.filter(p=>p.active),'title'),optional:true}),field('destination','Destination'),
  field('departure','Departure','date'),field('return_date','Return date','date'),field('adults','Adults','number',{min:1,max:99}),
  field('children','Children','number',{min:0,max:99}),inr('cost','Supplier estimate'),inr('markup','Markup'),
  inr('extras','Optional charges'),inr('discount','Discount'),inr('tax','Demo tax'),inr('advance','Required advance'),
  field('expiry','Valid through','date'),field('balance_due','Balance due date','date',{optional:true}),memo('schedule','Payment terms'),memo('terms','Terms and conditions'),memo('notes','Inclusions and customer notes'),memo('internal','Internal notes'),
];
function QuoteForm({lead,quote,save}:{lead:Row;quote?:Row;save:(r:Row)=>void}) {
  const {data,act}=useApp();
  const window=travelWindow(lead.dates||'',data.today);
  const departure=quote?.departure||window?.departure||'';
  const template=(id:string)=>{
    const p=data.packages.find(p=>p.id===id);
    if (!p) return;
    return {destination:p.destination,cost:p.base,markup:p.markup,advance:Math.floor((p.base+p.markup)/3),return_date:window?.return_date||(departure?addDays(departure,p.nights):''),
      terms:p.cancellation,notes:p.inclusions,itinerary:data.package_days.filter(d=>d.package_id===p.id).map(d=>({title:d.title,description:d.description}))};
  };
  const preset=template(lead.package_id);
  const initial=quote||{destination:lead.destination,departure,return_date:window?.return_date||(departure?addDays(departure,3):''),adults:lead.adults,children:lead.children,
    expiry:addDays(data.today,14),schedule:'Advance on acceptance. Balance seven days before departure.',package_id:lead.package_id||'',...preset};
  return <Form fields={quoteFields(data)} initial={initial} itinerary={quote?readDays(quote.itinerary):preset?.itinerary||readDays()} options={{totals:true}}
    onChange={(name,value)=>name==='package_id'?template(value):undefined} label={quote?'Save revised quotation':'Save quotation'}
    submit={async p=>save(await act('quote.save',{...p,id:quote?.id,lead_id:lead.id},quote?'Revision saved as draft':'Draft quotation saved'))}/>;
}
export function Quotes({id,leadId}:{id?:string;leadId?:string}) {
  const {data,portal,act}=useApp();
  const router=useRouter();
  const [edit,setEdit]=useState(false);
  const prefix=portal?'/portal':'';
  const quote=data.quotes.find(q=>q.id===id);
  const b=data.bookings.find(b=>b.quote_id===id);
  const canSales=['admin','manager','sales'].includes(data.user.role);
  const canApprove=['admin','manager'].includes(data.user.role);
  useEffect(()=>{
    if (portal&&quote?.status==='Sent') void act('quote.status',{id:quote.id,status:'Viewed',revision:quote.revision}).catch(()=>{});
  },[quote?.id,portal,quote?.status]);
  if (!id) return <><PageHeading title="Quotations" description={portal?'Review proposals shared by your travel specialist.':'Prepare proposals, track approvals and convert accepted quotations.'}/>
    <Panel><Table records={data.quotes.map(q=>({...q,customer:labelFor(data.customers,q.customer_id)}))} href={q=>prefix+'/quotes/'+q.id} filter="status"
      columns={[{key:'id',label:'Quotation'},{key:'customer',label:'Customer'},{key:'destination',label:'Destination'},stateColumn(),moneyColumn('total','Total'),dateColumn('expiry','Valid through')]}/></Panel></>;
  if (id==='new'&&canSales) {
    const lead=data.leads.find(l=>l.id===leadId);
    return lead?<><PageHeading title="Prepare quotation" description={`${lead.id} · ${labelFor(data.customers,lead.customer_id)} · ${lead.dates||'Travel dates to be confirmed'}`}/>
      <Panel title="Trip proposal"><div className="panel-body"><QuoteForm lead={lead} save={r=>router.push('/quotes/'+r.id)}/></div></Panel></>:missing('Enquiry');
  }
  if (!quote) return missing('Quotation');
  const lead=data.leads.find(l=>l.id===quote.lead_id);
  const expired=quote.expiry<data.today;
  return <>
    <PageHeading title={quote.destination+' quotation'} description={`${quote.id} · Revision ${quote.revision} · ${labelFor(data.customers,quote.customer_id)}`}>
      <DownloadLink kind="quote" id={quote.id}>Quotation PDF</DownloadLink>
      {canSales&&quote.status!=='Accepted'&&<Button className="outline" onClick={()=>setEdit(true)}>Revise quotation</Button>}
      {canSales&&quote.status==='Draft'&&!expired&&<ActionButton action="quote.status" input={{id,status:'Internal Review'}}>Submit for review</ActionButton>}
      {canApprove&&['Draft','Internal Review'].includes(quote.status)&&!expired&&<ActionButton className="" action="quote.status" input={{id,status:'Approved'}}>Approve quotation</ActionButton>}
      {canSales&&quote.status==='Approved'&&!expired&&<EditButton label="Send simulated quote" action="quote.status" input={{id,status:'Sent'}} fields={[field('channel','Channel','select',{value:'WhatsApp',options:['WhatsApp','Email']})]} className=""/>}
      {canSales&&data.demo&&['Sent','Viewed','Accepted'].includes(quote.status)&&<PortalLink customer={quote.customer_id} quote={quote.id}/>}
      {portal&&['Sent','Viewed'].includes(quote.status)&&!expired&&<><ActionButton action="quote.status" input={{id,status:'Rejected',revision:quote.revision}}>Reject quotation</ActionButton>
      <ActionButton action="quote.status" className="" input={{id,status:'Accepted',revision:quote.revision}} success="Quotation accepted">Accept quotation</ActionButton></>}
      {b?<Link className="button" href={prefix+'/bookings/'+b.id}>View booking</Link>:quote.status==='Accepted'&&canSales&&<ActionButton className="" action="booking.create" input={{id}} done={r=>router.push(prefix+'/bookings/'+r.id)}>Convert to booking</ActionButton>}
    </PageHeading>
    <div className="detail-grid"><Panel title="Quotation details" action={<Badge value={expired&&['Sent','Viewed'].includes(quote.status)?'Expired':quote.status}/>}><div className="panel-body">
      <Details items={[['Travel dates',titleDate(quote.departure)+' to '+titleDate(quote.return_date)],['Travellers',`${quote.adults} adults · ${quote.children} children`],
        ...(!portal?[['Supplier estimate',money(quote.cost)],['Markup',money(quote.markup)],['Discount',money(quote.discount)]] as [string,string][]:[]),['Optional charges',money(quote.extras)],['Demo tax',money(quote.tax)],
        ['Trip total',money(quote.total)],['Required advance',money(quote.advance)],['Balance due date',titleDate(quote.balance_due)],['Payment terms',quote.schedule],['Valid through',titleDate(quote.expiry)],
        ['Terms',quote.terms],['Customer notes',quote.notes],...(!portal?[['Internal notes',quote.internal],['Enquiry',lead?<Link href={'/leads/'+lead.id} className="text-link">{lead.id}</Link>:'—']] as [string,React.ReactNode][]:[])]}/>
    </div></Panel><Panel title="Proposed itinerary"><div className="panel-body"><Itinerary days={readDays(quote.itinerary)}/></div></Panel></div>
    {!portal&&data.revisions.some(r=>r.quote_id===id)&&<Panel title="Quotation revisions"><div className="panel-body">{data.revisions.filter(r=>r.quote_id===id).map(r=>{
      const snap=JSON.parse(r.snapshot);
      return <details className="revision" key={r.version}><summary>Revision {r.version} · {money(snap.total)} · {titleDate(r.created)}</summary>
        <Details items={[['Supplier estimate',money(snap.cost)],['Markup',money(snap.markup)],['Discount',money(snap.discount)],['Advance',money(snap.advance)],
          ['Travel dates',titleDate(snap.departure)+' to '+titleDate(snap.return_date)],['Notes',snap.notes]]}/></details>;
    })}</div></Panel>}
    {edit&&lead&&<Modal title="Revise quotation" close={()=>setEdit(false)}><QuoteForm quote={quote} lead={lead} save={()=>setEdit(false)}/></Modal>}
  </>;
}

export const travellerFields=[field('name','Traveller name'),optional('nationality','Nationality'),optional('birthday','Date of birth','date'),
  optional('document_ref','Document reference'),optional('emergency','Emergency contact'),memo('assistance','Assistance needs')];
export function Customers({id}:{id?:string}) {
  const {data}=useApp();
  const router=useRouter();
  const c=data.customers.find(c=>c.id===id);
  const canEdit=['admin','manager','sales'].includes(data.user.role);
  const canTraveller=['admin','manager','ops'].includes(data.user.role);
  const fields=[...Object.values(inputFields),memo('preferences','Travel preferences'),memo('notes','Staff notes')];
  const b=data.bookings.filter(b=>b.customer_id===id);
  const t=data.travellers.filter(t=>t.customer_id===id);
  const leads=data.leads.filter(l=>l.customer_id===id);
  if (!id) return <><PageHeading title="Customers" description="Manage contact histories, travel preferences and traveller profiles.">
    {canEdit&&<EditButton label="New customer" action="customer.save" fields={fields} className="" done={r=>router.push('/customers/'+r.id)}/>}</PageHeading>
    <Panel><Table records={data.customers.map(c=>({...c,trip_count:data.bookings.filter(b=>b.customer_id===c.id).length}))} href={c=>'/customers/'+c.id} search="Search customers"
      columns={[{key:'name',label:'Customer'},{key:'email',label:'Email'},{key:'phone',label:'Phone'},{key:'trip_count',label:'Bookings'},dateColumn('created','Added')]}/></Panel></>;
  if (!c) return missing('Customer');
  return <>
    <PageHeading title={c.name} description={c.id+' · Customer profile'}>
      {canEdit&&<EditButton label="Edit customer" action="customer.save" initial={c} input={{id}} fields={fields}/>}
      {canEdit&&data.demo&&<PortalLink customer={c.id}/>}
    </PageHeading>
    <div className="detail-grid"><Panel title="Contact and preferences"><div className="panel-body"><Details items={[
      ['Email',c.email],['Phone',c.phone],['WhatsApp',c.whatsapp],['Instagram',c.instagram],['Preferences',c.preferences],['Staff notes',c.notes],
      ['Lifetime net spend',money(b.reduce((sum,x)=>sum+x.paid,0))],['Booking balance',money(b.reduce((sum,x)=>sum+balance(x.total,x.paid,x.status),0))]]}/></div></Panel>
      <Panel title="Traveller profiles" action={canTraveller&&<EditButton label="Add traveller" action="traveller.save" input={{customer_id:id}} fields={travellerFields}/>}>
        <div className="panel-body">{!t.length?<Empty title="No traveller profiles" description="Add people travelling on behalf of this customer."/>:t.map(t=><details className="revision" key={t.id}><summary>{t.name}</summary>
          <Details items={[['Nationality',t.nationality],['Birth date',titleDate(t.birthday)],['Document tracking',t.document_ref],['Emergency contact',t.emergency],['Assistance',t.assistance]]}/>
          {canTraveller&&<EditButton label="Edit traveller" action="traveller.save" fields={travellerFields} initial={t} input={{id:t.id,customer_id:id}}/>}</details>)}</div></Panel></div>
    <Panel title="Bookings"><Table records={b} href={b=>'/bookings/'+b.id} columns={[{key:'id',label:'Booking'},{key:'destination',label:'Destination'},stateColumn(),dateColumn('departure','Departure'),moneyColumn('paid','Net received')]}/></Panel>
    <div className="detail-grid"><Panel title="Enquiries"><div className="panel-body record-links">{leads.map(l=><Link key={l.id} href={'/leads/'+l.id}>{l.id} · {l.destination} · {l.stage}</Link>)}</div></Panel>
      <Panel title="Quotations and documents"><div className="panel-body record-links">{data.quotes.filter(q=>q.customer_id===id).map(q=><Link key={q.id} href={'/quotes/'+q.id}>{q.id} · {q.status}</Link>)}
      {data.documents.filter(d=>d.customer_id===id).map(doc=><Link key={doc.id} href={'/documents/'+doc.id}>{doc.kind} · {doc.status}</Link>)}</div></Panel></div>
    <Panel title="Customer activity"><div className="panel-body"><Timeline events={data.events.filter(e=>leads.some(l=>l.id===e.lead_id)||b.some(b=>b.id===e.booking_id))}/></div></Panel>
  </>;
}
