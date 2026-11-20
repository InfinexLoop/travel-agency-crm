'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Wallet } from 'lucide-react';
import { balance, money, roles, titleDate, type Role } from '../domains/shared';
import { report } from '../domains/reporting';
import { ActionButton, EditButton, field, inr, memo, optional } from './actions';
import { PaymentButton } from './travel-records';
import { Badge, Details, DownloadLink, Empty, PageHeading, Panel, Table, Timeline, dateColumn, labelFor, moneyColumn, selectRows, stateColumn, useApp, type Row } from './ui';

const supplierFields=[field('name','Supplier name'),field('category','Category','select',{options:['Hotel','Transport','Tour operator','Consolidator','Guide / activity','Visa services','Other']}),
  field('destination','Destinations served'),optional('contact','Contact person'),optional('email','Email','email'),optional('phone','Phone','tel'),inr('rate','Negotiated rate'),
  memo('terms','Payment terms'),memo('notes','Operational notes'),field('active','Active supplier','checkbox',{value:true})];
export function Suppliers({id,sub}:{id?:string;sub?:string}) {
  const {data}=useApp();
  const router=useRouter();
  const supplier=data.suppliers.find(s=>s.id===id);
  const job=id==='service'?data.supplier_jobs.find(j=>j.id===sub):undefined;
  const canEdit=['admin','ops'].includes(data.user.role);
  const canSettle=['admin','finance'].includes(data.user.role);
  const serviceRows:Row[]=data.supplier_jobs.map(j=>({...j,supplier:labelFor(data.suppliers,j.supplier_id),balance:j.status==='Cancelled'?0:j.cost-j.settled}));
  const jobTable=(list:Row[])=><Table records={list} href={j=>'/suppliers/service/'+j.id} filter="status" columns={[
    {key:'service',label:'Service'},{key:'supplier',label:'Supplier'},{key:'booking_id',label:'Booking'},stateColumn(),dateColumn('due','Payable due'),moneyColumn('balance','Payable')]}/>;
  if (!id) return <><PageHeading title="Suppliers" description="Maintain partner profiles, booking requests and payment obligations.">
    {canEdit&&<EditButton label="New supplier" action="supplier.save" fields={supplierFields} className="" done={r=>router.push('/suppliers/'+r.id)}><Plus size={16}/></EditButton>}</PageHeading>
    <Panel title="Supplier directory"><Table records={data.suppliers.map(s=>({...s,status:s.active?'Active':'Archived'}))} href={s=>'/suppliers/'+s.id} filter="category" columns={[
      {key:'name',label:'Supplier'},{key:'category',label:'Category'},{key:'destination',label:'Destinations'},{key:'contact',label:'Contact'},moneyColumn('rate','Negotiated rate'),stateColumn()]}/></Panel>
    <Panel title="Service requests & payables">{jobTable(serviceRows)}</Panel>
  </>;
  if (job) {
    const outstanding=job.status==='Cancelled'?0:job.cost-job.settled;
    return <><PageHeading title={job.service} description={`${job.id} · ${labelFor(data.suppliers,job.supplier_id)}`}>
      {canEdit&&job.status==='Requested'&&<><EditButton label="Confirm supplier" action="supplier.status" input={{id:job.id,status:'Confirmed'}} fields={[field('reference','Demo confirmation reference')]} className=""/>
        <ActionButton action="supplier.status" input={{id:job.id,status:'Cancelled'}}>Cancel request</ActionButton></>}
      {canSettle&&job.status==='Confirmed'&&outstanding>0&&<EditButton label="Record simulated settlement" action="supplier.settle" input={{id:job.id}}
        fields={[field('amount','Amount (INR)','money',{min:.01,max:outstanding/100,value:outstanding})]}/>}
    </PageHeading><Panel title="Service request"><div className="panel-body"><Details items={[
      ['Status',<Badge value={job.status}/>],['Booking',<Link className="text-link" href={'/bookings/'+job.booking_id}>{job.booking_id}</Link>],
      ['Supplier',<Link className="text-link" href={'/suppliers/'+job.supplier_id}>{labelFor(data.suppliers,job.supplier_id)}</Link>],['Confirmation',job.reference],['Cost',money(job.cost)],['Settled',money(job.settled)],['Outstanding',money(outstanding)],['Due',titleDate(job.due)]]}/></div></Panel>
      {canSettle&&<Panel title="Settlement history"><Table records={data.settlements.filter(s=>s.job_id===job.id)} columns={[{key:'id',label:'Settlement'},dateColumn('created','Recorded'),moneyColumn('amount','Simulated amount')]}/></Panel>}</>;
  }
  if (!supplier) return <Empty title="Supplier record not found"/>;
  return <><PageHeading title={supplier.name} description={supplier.id+' · '+supplier.category}>
    {canEdit&&<EditButton label="Edit supplier" action="supplier.save" initial={supplier} input={{id}} fields={supplierFields}/>}</PageHeading>
    <div className="detail-grid"><Panel title="Partner details" action={<Badge value={supplier.active?'Active':'Archived'}/>}><div className="panel-body"><Details items={[
      ['Destinations',supplier.destination],['Contact',supplier.contact],['Email',supplier.email],['Phone',supplier.phone],['Negotiated rate',money(supplier.rate)],['Payment terms',supplier.terms],['Notes',supplier.notes]]}/></div></Panel>
      <Panel title="Linked packages"><div className="panel-body record-links">{data.package_suppliers.filter(p=>p.supplier_id===id).map(p=><Link key={p.package_id} href={'/packages/'+p.package_id}>{labelFor(data.packages,p.package_id,'title')}</Link>)}</div></Panel></div>
    <Panel title="Booking services">{jobTable(serviceRows.filter(j=>j.supplier_id===id))}</Panel></>;
}

export function Finance({id,sub}:{id?:string;sub?:string}) {
  const {data}=useApp();
  const totals=report(data,{},data.today);
  const r=id==='transaction'?data.payments.find(p=>p.id===sub):null;
  const editable=['admin','finance'].includes(data.user.role);
  const booking=r?data.bookings.find(b=>b.id===r.booking_id):null;
  if (id&&!r) return <Empty title="Transaction not found"/>;
  if(r) {
    const refunded=data.payments.filter(p=>p.parent===r.id).reduce((sum,p)=>sum+p.amount,0);
    return <><PageHeading title="Simulated transaction" description={r.id+' · '+r.method}>
      {['Paid','Refunded'].includes(r.status)&&<DownloadLink kind="receipt" id={r.id}>Receipt PDF</DownloadLink>}
      {editable&&r.status==='Pending'&&<EditButton label="Resolve pending transaction" action="finance.resolve" input={{id:r.id}}
        fields={[field('status','Simulated result','select',{options:['Paid','Failed']})]}/>}
      {editable&&r.status==='Paid'&&r.amount>refunded&&<EditButton label="Record simulated refund" action="finance.refund" input={{id:r.id}} initial={{amount:r.amount-refunded}}
        fields={[field('amount','Refund (INR)','money',{min:.01,max:(r.amount-refunded)/100}),field('reason','Reason')]}/>}
    </PageHeading><Panel><div className="panel-body"><Details items={[['Status',<Badge value={r.status}/>],['Amount',money(r.amount)],['Recorded',titleDate(r.created)],['Refunded',r.status==='Paid'?money(refunded):undefined],
      ['Original transaction',r.parent?<Link className="text-link" href={'/finance/transaction/'+r.parent}>{r.parent}</Link>:undefined],
      ['Booking',<Link className="text-link" href={'/bookings/'+r.booking_id}>{r.booking_id}</Link>],['Booking balance',booking?money(balance(booking.total,booking.paid,booking.status)):null]]}/></div></Panel></>;
  }
  return <><PageHeading title="Finance" description="Record simulated customer payments and supplier settlements.">
    <a className="button outline" href="/api/crm/report/bookings">Export balances</a><Link className="button" href="/bookings"><Wallet size={16}/> Find a booking</Link></PageHeading>
    <div className="booking-summary">{[['Confirmed revenue',totals.sales],['Net collections',totals.cash],['Customer outstanding',totals.outstanding],['Supplier payable',totals.payable]].map(([label,value])=><div key={label}><small>{label}</small><strong>{money(Number(value))}</strong></div>)}</div>
    <Panel title="Transactions" description="All entries are internal demonstrations."><Table records={data.payments.map(p=>({...p,customer:labelFor(data.customers,data.bookings.find(b=>b.id===p.booking_id)?.customer_id)}))}
      href={p=>'/finance/transaction/'+p.id} filter="status" columns={[{key:'id',label:'Reference'},{key:'customer',label:'Customer'},{key:'booking_id',label:'Booking'},{key:'method',label:'Method'},
        stateColumn(),moneyColumn('amount','Amount'),dateColumn('created','Recorded')]}/></Panel>
    <Panel title="Outstanding booking balances"><Table records={data.bookings.map(b=>({...b,outstanding:balance(b.total,b.paid,b.status)})).filter(b=>b.outstanding>0)}
      href={b=>'/bookings/'+b.id} columns={[{key:'id',label:'Booking'},stateColumn(),moneyColumn('total','Value'),moneyColumn('paid','Net received'),moneyColumn('outstanding','Outstanding'),
        {key:'action',label:'Action',render:b=>editable?<PaymentButton booking={b}/>:null}]}/></Panel>
    <Panel title="Issued invoices"><Table records={data.invoices} href={r=>'/bookings/'+r.booking_id} columns={[{key:'id',label:'Invoice'},{key:'booking_id',label:'Booking'},dateColumn('created','Issued'),
      {key:'file',label:'File',render:r=><DownloadLink kind="invoice" id={r.booking_id}>Invoice PDF</DownloadLink>}]}/></Panel>
    <Panel title="Supplier settlements" action={<Link className="text-link" href="/suppliers">View supplier ledger</Link>}><Table records={data.settlements} href={r=>'/suppliers/service/'+r.job_id}
      columns={[{key:'id',label:'Settlement'},{key:'job_id',label:'Service request'},moneyColumn('amount','Simulated amount'),dateColumn('created','Recorded')]}/></Panel>
  </>;
}
const staffFields=[
  field('name','Full name'),field('email','Email address','email'),
  field('role','Staff role','select',{options:Object.entries(roles).filter(([role])=>role!=='customer').map(([value,label])=>({value,label}))}),
  optional('password','Password (10 characters minimum)','password'),field('active','Active account','checkbox',{value:true}),
];
export function Team({id}:{id?:string}) {
  const {data}=useApp();
  const router=useRouter();
  const u=data.team.find(u=>u.id===id);
  if (id&&!u) return <Empty title="Staff member not found"/>;
  if (u) return <><PageHeading title={u.name} description={u.email}>
    <EditButton label="Edit staff account" action="staff.save" fields={staffFields} initial={u} input={{id}}/></PageHeading>
    <Panel><div className="panel-body"><Details items={[['Role',roles[u.role as Role]],['Account status',u.active?'Active':'Disabled'],['Email',u.email],['Assigned enquiries',data.leads.filter(l=>l.owner===u.id).length]]}/></div></Panel></>;
  return <><PageHeading title="Staff & settings" description="Manage access and configure local automation templates.">
    <EditButton label="New staff account" action="staff.save" fields={staffFields.map(f=>f.name==='password'?{...f,optional:false}:f)} className="" done={u=>router.push('/team/'+u.id)}><Plus size={16}/></EditButton></PageHeading>
    <Panel title="Staff permissions"><Table records={data.team.map(u=>({...u,status:u.active?'Active':'Disabled',role_label:roles[u.role as Role]}))}
      href={r=>'/team/'+r.id} filter="status" columns={[{key:'name',label:'Name'},{key:'email',label:'Email'},{key:'role_label',label:'Role'},stateColumn()]}/></Panel>
    <div className="detail-grid"><Panel title="Automation templates"><div className="panel-body">{data.workflows.map(w=><details className="revision" key={w.id}>
      <summary>{w.label} · {w.enabled?'Enabled':'Paused'}</summary><p>{w.template}</p><EditButton label="Edit template" action="workflow.save" input={{id:w.id}} initial={w}
        fields={[memo('template','Message template'),field('enabled','Enable workflow','checkbox')]}/></details>)}</div></Panel>
      <Panel title="Workspace settings"><div className="panel-body"><Details items={[['Workspace','Zuri Holidays'],['Currency','INR'],['Timezone','Asia/Kolkata'],['Integrations','Local simulation']]}/></div></Panel></div>
    <Panel title="Audit activity"><div className="panel-body"><Timeline events={data.events}/></div></Panel>
  </>;
}
