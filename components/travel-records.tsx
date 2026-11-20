'use client';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarDays, CreditCard, FilePlus2, Plus, Upload, Wallet } from 'lucide-react';
import { addDays, balance, paymentSchedule, confirmed, docKinds, money, titleDate, visaStatuses } from '../domains/shared';
import { ActionButton, EditButton, field, inr, memo, optional } from './actions';
import { travellerFields } from './sales-records';
import { Badge, Button, Details, DownloadLink, Empty, Itinerary, PageHeading, Panel, Table, Timeline, Upcoming, dateColumn, labelFor, moneyColumn, readDays, selectRows, stateColumn, useApp, type Row } from './ui';

export function PaymentButton({booking}:{booking:Row}) {
  const {portal}=useApp();
  const due=balance(booking.total,booking.paid,booking.status);
  if (!due) return null;
  const remainingAdvance=booking.advance-booking.paid;
  return <EditButton label={portal?'Simulate payment':'Record simulated payment'} title="Payment simulator" action="finance.payment" input={{id:booking.id}} className=""
    success="Simulated transaction recorded" initial={{amount:remainingAdvance>0?remainingAdvance:due,method:'UPI',status:'Paid'}}
    fields={[field('amount','Amount (INR)','money',{min:.01,max:due/100}),field('method','Payment method','select',{options:['UPI','Card','Bank transfer','Cash']}),
      field('status','Simulated result','select',{options:['Paid','Pending','Failed']})]}><CreditCard size={17}/></EditButton>;
}
export const bookingTaskFields=(data:ReturnType<typeof useApp>['data'])=>[
  field('title','Task title'),field('owner','Assigned to','select',{options:selectRows(data.team.filter(u=>u.active)),value:data.user.id}),
  field('due','Due date','date',{value:data.today}),field('priority','Priority','select',{options:['Low','Normal','High','Urgent'],value:'Normal'}),
  field('status','Task status','select',{options:['Open','In progress','Done'],value:'Open'}),
];
export function Bookings({id}:{id?:string}) {
  const {data,portal}=useApp();
  const b=data.bookings.find(b=>b.id===id);
  const prefix=portal?'/portal':'';
  const canOps=['admin','ops'].includes(data.user.role);
  const canManage=['admin','ops','manager'].includes(data.user.role);
  const canPay=['admin','finance','customer'].includes(data.user.role);
  const financeStaff=['admin','finance'].includes(data.user.role);
  const canInvoice=['admin','finance','manager'].includes(data.user.role);
  const travellers=data.travellers.filter(t=>data.booking_travellers.some(r=>r.traveller_id===t.id&&r.booking_id===id));
  if (!id) return <><PageHeading title={portal?'My bookings':'Bookings'} description={portal?'See your itinerary, current status, invoices and recorded payments.':'Track the trip from accepted quotation through departure and completion.'}/>
    <Panel><Table records={data.bookings.map(b=>({...b,customer:labelFor(data.customers,b.customer_id),due:balance(b.total,b.paid,b.status)}))} href={b=>prefix+'/bookings/'+b.id}
      search="Search bookings" filter="status" columns={[{key:'id',label:'Booking'},{key:'destination',label:'Destination'},...(!portal?[{key:'customer',label:'Customer'}]:[]),
      stateColumn(),dateColumn('departure','Departure'),moneyColumn('total','Booking value'),moneyColumn('due','Outstanding')]}/></Panel></>;
  if (!b) return <Empty title="Booking not found" description="Open an accessible booking from the bookings list."/>;
  const jobs=data.supplier_jobs.filter(j=>j.booking_id===id);
  const payments=data.payments.filter(p=>p.booking_id===id);
  const docs=data.documents.filter(d=>d.booking_id===id);
  const visas=data.visas.filter(v=>v.booking_id===id);
  const invoice=data.invoices.find(i=>i.booking_id===id);
  const feedback=data.feedback.find(f=>f.booking_id===id);
  const schedule=paymentSchedule(b.total,b.advance,b.paid,b.created,b.balance_due||addDays(b.departure,-7),b.status,data.today);
  const member=data.customers.find(c=>c.id===b.customer_id);
  const next:Record<string,string>={'Advance Recorded':'Supplier Confirmation Pending','Supplier Confirmation Pending':'Confirmed','Confirmed':'Documents Ready',
    'Documents Ready':'Travel In Progress','Travel In Progress':'Completed'};
  const unlocked=!['Cancelled','Completed'].includes(b.status);
  return <>
    <PageHeading title={b.destination+' booking'} description={`${b.id} · ${member?.name||'Traveller'} · ${titleDate(b.departure)}`}>
      {canManage&&unlocked&&<EditButton label="Edit trip details" action="booking.edit" input={{id}} initial={b} itinerary={readDays(b.itinerary)}
        fields={[field('departure','Departure','date'),field('return_date','Return date','date'),optional('hotel','Hotel details'),optional('flight','Flight details'),optional('transfer','Transfer details'),memo('notes','Operational notes')]}/>}
      {canPay&&<PaymentButton booking={b}/>}
      {financeStaff&&unlocked&&<EditButton label="Adjust trip pricing" action="booking.adjust" input={{id}} initial={b}
        fields={[field('total','Booking value (INR)','money',{min:.01}),field('advance','Required advance (INR)','money',{min:.01}),field('reason','Adjustment reason')]}/>}
      {canManage&&next[b.status]&&<ActionButton className="" action="booking.status" input={{id,status:next[b.status]}}>{'Mark '+next[b.status].toLowerCase()}</ActionButton>}
    </PageHeading>
    <div className="booking-summary">
      <div><small>Booking stage</small><Badge value={b.status}/></div>
      <div><small>Trip value</small><strong>{money(b.total)}</strong></div><div><small>Net received</small><strong>{money(b.paid)}</strong></div>
      <div><small>Outstanding balance</small><strong>{money(balance(b.total,b.paid,b.status))}</strong></div>
    </div>
    <div className="detail-grid">
      <Panel title="Trip details"><div className="panel-body">
        <Details items={[['Departure',titleDate(b.departure)],['Return',titleDate(b.return_date)],['Required advance',money(b.advance)],['Hotel',b.hotel],['Flights',b.flight],['Transfers',b.transfer],
          ...(!portal?[['Operational notes',b.notes],['Cancellation reason',b.cancel_reason],['Cust. profile',<Link className="text-link" href={'/customers/'+b.customer_id}>{member?.name}</Link>]] as [string,React.ReactNode][]:[]),
          ['Quotation',data.quotes.some(q=>q.id===b.quote_id)?<Link className="text-link" href={prefix+'/quotes/'+b.quote_id}>{b.quote_id}</Link>:b.quote_id]]}/>
        <div className="actions section-actions"><DownloadLink kind="itinerary" id={b.id}>Itinerary PDF</DownloadLink>
          {confirmed.includes(b.status)&&<DownloadLink kind="voucher" id={b.id}>Voucher PDF</DownloadLink>}
          {invoice?<DownloadLink kind="invoice" id={b.id}>Invoice PDF</DownloadLink>:canInvoice&&confirmed.includes(b.status)&&<ActionButton action="finance.invoice" input={{id}}>Issue demo invoice</ActionButton>}
          {portal&&<Link className="button outline" href="/portal/inbox">Request assistance</Link>}
          {canManage&&unlocked&&<EditButton label="Cancel booking" action="booking.status" input={{id,status:'Cancelled'}} fields={[field('reason','Cancellation reason','textarea')]}/>}</div>
      </div></Panel>
      <Panel title="Traveller manifest" action={canManage&&unlocked&&<EditButton label="Add traveller" action="traveller.save" fields={travellerFields} input={{customer_id:b.customer_id,booking_id:id}}/>}>
        <div className="panel-body">{travellers.length?travellers.map(t=><details className="revision" key={t.id}><summary>{t.name}</summary><Details items={[['Nationality',t.nationality],['Birth date',titleDate(t.birthday)],['Assistance',t.assistance],...(!portal?[['Document reference',t.document_ref]] as [string,string][]:[])]}/></details>):
         <Empty title="No travellers on file" description="The manifest can be filled in as traveller details become available."/>}</div></Panel>
    </div>
    {!portal&&<Panel title="Supplier services" description="Staff record demo requests and confirmation references." action={canOps&&unlocked&&<EditButton label="Request supplier service" action="supplier.request" input={{booking_id:id}}
      fields={[field('supplier_id','Supplier','select',{options:selectRows(data.suppliers.filter(s=>s.active))}),field('service','Service'),field('cost','Supplier cost (INR)','money',{min:.01}),
        field('due','Payable due','date',{value:b.departure})]}/>}>
      <Table records={jobs.map(j=>({...j,supplier:labelFor(data.suppliers,j.supplier_id),due_amount:j.cost-j.settled}))} columns={[
        {key:'service',label:'Service',render:r=><Link className="row-link" href={'/suppliers/service/'+r.id}>{r.service}</Link>},{key:'supplier',label:'Supplier'},stateColumn(),{key:'reference',label:'Confirmation'},moneyColumn('cost','Cost'),
        {key:'action',label:'Action',render:r=>canOps&&r.status==='Requested'?<EditButton label="Confirm supplier" action="supplier.status" input={{id:r.id,status:'Confirmed'}} fields={[field('reference','Demo confirmation reference')]}/>:null}]}/>
    </Panel>}
    <Panel title="Payment schedule" description="Received amounts apply to the advance first.">
      <Table records={schedule} size={5} columns={[{key:'title',label:'Milestone'},dateColumn('date','Due by'),moneyColumn('amount','Amount'),moneyColumn('outstanding','Outstanding'),stateColumn('state','Status')]}/>
    </Panel>
    <Panel title="Payment history" description="Internal demo transactions. Pending and failed entries do not change balances.">
      <Table records={payments} columns={[{key:'id',label:'Transaction'},dateColumn('created','Recorded'),{key:'method',label:'Method'},stateColumn(),moneyColumn('amount','Amount'),
        {key:'download',label:'Receipt',render:p=>['Paid','Refunded'].includes(p.status)?<DownloadLink kind="receipt" id={p.id}>Receipt PDF</DownloadLink>:null}]}/>
    </Panel>
    {data.adjustments.some(a=>a.booking_id===id)&&<Panel title="Booking adjustments"><Table records={data.adjustments.filter(a=>a.booking_id===id)}
      columns={[dateColumn('created','Recorded'),moneyColumn('prior_total','Previous value'),moneyColumn('new_total','Revised value'),moneyColumn('new_advance','Revised advance'),...(!portal?[{key:'reason',label:'Reason'}]:[])]}/></Panel>}
    <div className="detail-grid"><Panel title="Travel documents" action={<div className="actions">{(canOps||portal)&&unlocked&&<Link className="button outline" href={prefix+'/documents/new?booking='+id}>Upload document</Link>}
      {canOps&&unlocked&&<EditButton label="Request document" action="document.require" input={{booking_id:id}} fields={[
        field('kind','Document type','select',{options:docKinds}),field('due','Due date','date',{value:b.departure}),
        field('traveller_id','Traveller','select',{options:selectRows(travellers),optional:true})]}/>}</div>}>
      <div className="panel-body record-links">{docs.length?docs.map(d=><Link key={d.id} href={prefix+'/documents/'+d.id}><span>{d.kind}</span><Badge value={d.status}/></Link>):
        <Empty title="No document requests" description="Any requested travel documents appear here."/>}</div>
    </Panel>
      <Panel title="Visa cases" description="Manually recorded demo status." action={canOps&&unlocked&&<EditButton label="Add visa case" action="visa.save" input={{booking_id:id}} fields={visaFields(data,travellers,b.departure)}/>}>
      <div className="panel-body">{visas.length?visas.map(v=><div className="inline-row" key={v.id}><Link className="text-link" href={prefix+'/documents/visa/'+v.id}>{labelFor(travellers,v.traveller_id)} · {titleDate(v.due)}</Link><Badge value={v.status}/></div>):
        <Empty title="No visa cases" description="Any manually tracked visa cases appear here."/>}</div></Panel>
    </div>
    {!portal&&<Panel title="Preparation tasks" action={canManage&&unlocked&&<EditButton label="Add task" action="task.save" input={{booking_id:id}} fields={bookingTaskFields(data)}/>}>
      <Table records={data.tasks.filter(t=>t.booking_id===id).map(t=>({...t,owner_name:labelFor(data.team,t.owner)}))} href={r=>'/operations/'+r.id}
        columns={[{key:'title',label:'Task'},{key:'owner_name',label:'Owner'},stateColumn('priority','Priority'),dateColumn('due','Due'),stateColumn()]}/></Panel>}
    <div className="detail-grid"><Panel title="Day-wise itinerary"><div className="panel-body"><Itinerary days={readDays(b.itinerary)}/></div></Panel>
      {!portal&&<Panel title="Booking activity"><div className="panel-body"><Timeline events={data.events.filter(e=>e.booking_id===id)}/></div></Panel>}</div>
    {b.status==='Completed'&&<Panel title="Trip feedback" action={!feedback&&(portal||canManage)&&<EditButton label="Submit feedback" action="booking.feedback" input={{id}}
      fields={[field('rating','Rating out of 5','number',{min:1,max:5,value:5}),memo('notes','How was your trip?')]}/>}>
      <div className="panel-body">{feedback?<Details items={[['Rating',feedback.rating+' / 5'],['Comments',feedback.notes],['Recorded',titleDate(feedback.created)]]}/>:<p className="muted">Feedback can be submitted now that the trip is complete.</p>}</div></Panel>}
  </>;
}
function visaFields(data:ReturnType<typeof useApp>['data'],travellers:Row[],due?:string) {
  return [field('status','Visa status','select',{options:visaStatuses,value:'Documents Pending'}),field('due','Visa deadline','date',{value:due||data.today}),
    field('traveller_id','Traveller','select',{options:selectRows(travellers),optional:true}),memo('notes','Internal notes')];
}
function UploadForm({id,booking,lead,kind,done}:{id?:string;booking?:string;lead?:string;kind?:string;done:(id:string)=>void}) {
  const {data,portal,upload}=useApp();
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [scope,setScope]=useState(lead?'lead':'booking');
  const [bookingId,setBooking]=useState(booking||'');
  async function save(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();setBusy(true);setError('');
    const form=new FormData(event.currentTarget);
    if (id) form.set('id',id);
    if (booking) form.set('booking_id',booking);
    if (lead) form.set('lead_id',lead);
    if (kind) form.set('kind',kind);
    try {const r=await upload(form);done(r.id);}catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  const eligible=docKinds.filter(k=>!portal||!['Invoice','Payment receipt','Hotel voucher','Final travel itinerary'].includes(k));
  return <form className="form" onSubmit={save} encType="multipart/form-data">
    <div className="form-grid">
      {!id&&!booking&&!lead&&!portal&&data.user.role!=='ops'&&<label className="field"><span>Link document to</span><select value={scope} onChange={e=>setScope(e.target.value)}><option value="booking">Booking</option><option value="lead">Lead</option></select></label>}
      {!id&&!booking&&!lead&&(scope==='booking'?<label className="field"><span>Booking</span><select name="booking_id" required value={bookingId} onChange={e=>setBooking(e.target.value)}><option value="">Select…</option>{data.bookings.map(b=><option key={b.id} value={b.id}>{b.id} · {b.destination}</option>)}</select></label>:
        <label className="field"><span>Enquiry</span><select name="lead_id" required><option value="">Select…</option>{data.leads.map(l=><option key={l.id} value={l.id}>{l.id} · {l.destination}</option>)}</select></label>)}
      {!kind&&<label className="field"><span>Document type</span><select name="kind" required defaultValue=""><option value="">Select…</option>{eligible.map(k=><option key={k}>{k}</option>)}</select></label>}
      {!id&&bookingId&&<label className="field"><span>Traveller (optional)</span><select name="traveller_id" defaultValue=""><option value="">None</option>{data.travellers.filter(t=>data.booking_travellers.some(x=>x.traveller_id===t.id&&x.booking_id===bookingId)).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>}
      <label className="field wide"><span>Choose a file</span><input type="file" accept=".pdf,.jpg,.jpeg,.png" name="file" required/><small>PDF, JPG or PNG · up to 5 MB. Use synthetic files.</small></label>
    </div>
    {error&&<p className="error" role="alert">{error}</p>}
    <div className="form-foot"><Button type="submit" disabled={busy}><Upload size={17}/> {busy?'Uploading…':'Upload file'}</Button></div>
  </form>;
}
export function Documents({id,sub,booking,lead}:{id?:string;sub?:string;booking?:string;lead?:string}) {
  const {data,portal}=useApp();
  const router=useRouter();
  const [replace,setReplace]=useState(false);
  const d=data.documents.find(d=>d.id===id);
  const finance=data.user.role==='finance';
  const canReview=['admin','ops'].includes(data.user.role);
  const prefix=portal?'/portal':'';
  const nav=(id:string)=>router.push(prefix+'/documents/'+id);
  if (id==='new'&&!finance) return <><PageHeading title="Upload travel document" description="Files are stored in the demo’s private local storage."/>
    <Panel><div className="panel-body"><UploadForm booking={booking} lead={lead} done={nav}/></div></Panel></>;
  if (id==='visa') {
    const visa=data.visas.find(v=>v.id===sub);
    if (!visa) return <Empty title="Visa case not found"/>;
    const names=data.travellers.filter(t=>data.booking_travellers.some(x=>x.traveller_id===t.id&&x.booking_id===visa.booking_id));
    return <><PageHeading title="Visa case" description={visa.id+' · Manually recorded demo status'}>
      {canReview&&<EditButton label="Update visa case" action="visa.save" initial={visa} input={{id:visa.id,booking_id:visa.booking_id}} fields={visaFields(data,names)}/>}</PageHeading>
      <Panel><div className="panel-body"><Details items={[[ 'Status',<Badge value={visa.status}/>],['Deadline',titleDate(visa.due)],['Traveller',labelFor(names,visa.traveller_id)],
        ['Booking',<Link className="text-link" href={prefix+'/bookings/'+visa.booking_id}>{visa.booking_id}</Link>],...(!portal?[['Notes',visa.notes]] as [string,string][]:[])]}/></div></Panel></>;
  }
  if (!id) return <><PageHeading title={portal?'Travel documents':'Documents & visas'} description="Review document requests, deadlines and recorded visa cases.">
      {!finance&&<Link className="button" href={prefix+'/documents/new'}><FilePlus2 size={16}/> Upload document</Link>}</PageHeading>
    <Panel title="Travel documents"><Table records={data.documents.map(d=>({...d,customer:labelFor(data.customers,d.customer_id)}))} href={d=>prefix+'/documents/'+d.id} filter="status" search="Search documents"
      columns={[{key:'kind',label:'Document type'},...(!portal?[{key:'customer',label:'Customer'}]:[]),{key:'booking_id',label:'Booking'},dateColumn('due','Deadline'),stateColumn()]}/></Panel>
    {!finance&&<Panel title="Visa cases"><Table records={data.visas.map(v=>({...v,traveller:labelFor(data.travellers,v.traveller_id)}))} href={v=>prefix+'/documents/visa/'+v.id} filter="status"
      columns={[{key:'id',label:'Case'},{key:'traveller',label:'Traveller'},{key:'booking_id',label:'Booking'},dateColumn('due','Deadline'),stateColumn()]}/></Panel>}</>;
  if (!d) return <Empty title="Document not found" description="Open a document from your documents list."/>;
  return <><PageHeading title={d.kind} description={d.id+' · '+d.name}>
      {d.mime&&<DownloadLink kind="document" id={d.id}>Download document</DownloadLink>}
      {!finance&&!['Verified','Waived'].includes(d.status)&&<Button className="outline" onClick={()=>setReplace(!replace)}>{d.mime?'Replace file':'Upload requested file'}</Button>}
      {canReview&&d.mime&&d.status!=='Verified'&&<ActionButton action="document.status" input={{id,status:'Verified'}} className="">Verify document</ActionButton>}
      {canReview&&<EditButton label="Update review status" action="document.status" input={{id}} fields={[field('status','Status','select',{options:['Missing','Rejected','Waived',...(d.mime?['Verified']:[])]})]}/>}
    </PageHeading>
    <Panel title="Document details"><div className="panel-body"><Details items={[['Status',<Badge value={d.status}/>],['File name',d.name],['Type',d.mime],['Due date',titleDate(d.due)],['Traveller',labelFor(data.travellers,d.traveller_id)],
      ['Booking',d.booking_id?<Link className="text-link" href={prefix+'/bookings/'+d.booking_id}>{d.booking_id}</Link>:undefined],['Enquiry',d.lead_id?<Link className="text-link" href={prefix+'/leads/'+d.lead_id}>{d.lead_id}</Link>:undefined]]}/></div></Panel>
    {replace&&<Panel title="Upload the document"><div className="panel-body"><UploadForm id={d.id} kind={d.kind} done={()=>setReplace(false)}/></div></Panel>}
  </>;
}
export function Operations({id}:{id?:string}) {
  const {data}=useApp();
  const t=data.tasks.find(t=>t.id===id);
  const [view,setView]=useState('Tasks');
  const leadOptions=data.leads.map(l=>({value:l.id,label:l.id+' · '+l.destination}));
  const tripOptions=data.bookings.map(b=>({value:b.id,label:b.id+' · '+b.destination}));
  const bookings=data.bookings.filter(b=>b.departure>=data.today&&confirmed.includes(b.status)).sort((a,b)=>a.departure.localeCompare(b.departure));
  if (id&&!t) return <Empty title="Task not found"/>;
  if (t) return <>
    <PageHeading title={t.title} description={t.id+' · Task'}>
      <EditButton label="Edit task" action="task.save" input={{id}} initial={t} fields={bookingTaskFields(data)}/>
      {t.status==='Open'&&<ActionButton action="task.status" input={{id,status:'In progress'}}>Start task</ActionButton>}
      {t.status!=='Done'&&<ActionButton className="" action="task.status" input={{id,status:'Done'}}>Mark done</ActionButton>}
    </PageHeading><Panel><div className="panel-body"><Details items={[['Status',<Badge value={t.status}/>],['Owner',labelFor(data.team,t.owner)],['Priority',t.priority],['Due',titleDate(t.due)],
      ['Linked record',<Link className="text-link" href={t.booking_id?'/bookings/'+t.booking_id:'/leads/'+t.lead_id}>{t.booking_id||t.lead_id}</Link>]]}/></div></Panel></>;
  return <><PageHeading title="Operations" description="Coordinate departures, preparation tasks and document deadlines.">
    {data.user.role!=='sales'&&<EditButton label="New booking task" action="task.save" fields={[field('booking_id','Booking','select',{options:tripOptions}),...bookingTaskFields(data)]}/>}
    {data.user.role!=='ops'&&<EditButton label="New lead follow-up" action="task.save" className="" fields={[field('lead_id','Enquiry','select',{options:leadOptions}),...bookingTaskFields(data)]}><Plus size={16}/></EditButton>}</PageHeading>
    <div className="booking-summary"><div><small>Open tasks</small><strong>{data.tasks.filter(t=>t.status!=='Done').length}</strong></div><div><small>Overdue</small><strong>{data.tasks.filter(t=>t.status!=='Done'&&t.due<data.today).length}</strong></div>
      <div><small>Upcoming departures</small><strong>{bookings.length}</strong></div><div><small>Missing documents</small><strong>{data.documents.filter(d=>d.status==='Missing').length}</strong></div></div>
    <Panel><div className="list-toolbar"><div className="segmented">{['Tasks','Departure schedule'].map(label=><Button key={label} className={view===label?'selected':'quiet'} onClick={()=>setView(label)}>{label}</Button>)}</div></div>
      {view==='Tasks'?<Table records={data.tasks.map(t=>({...t,owner_name:labelFor(data.team,t.owner),record:t.booking_id||t.lead_id}))} href={r=>'/operations/'+r.id} filter="status" columns={[
        {key:'title',label:'Task'},{key:'record',label:'Record'},{key:'owner_name',label:'Owner'},stateColumn('priority','Priority'),dateColumn('due','Due'),stateColumn()]}/>:
        <div className="panel-body"><h3><CalendarDays size={17}/> Upcoming departures by date</h3><Upcoming records={bookings}/></div>}</Panel>
    {data.user.role!=='sales'&&<div className="detail-grid"><Panel title="Supplier confirmations pending"><div className="panel-body record-links">{data.supplier_jobs.filter(j=>j.status==='Requested').slice(0,10).map(j=><Link key={j.id} href={'/suppliers/service/'+j.id}>{j.service} · {j.booking_id}</Link>)}</div></Panel>
      <Panel title="Outstanding documents"><div className="panel-body record-links">{data.documents.filter(d=>d.status==='Missing').slice(0,10).map(d=><Link key={d.id} href={'/documents/'+d.id}>{d.kind} · {titleDate(d.due)}</Link>)}</div></Panel></div>}
  </>;
}
