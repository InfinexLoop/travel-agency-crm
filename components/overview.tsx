'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Activity, BookOpen, CalendarDays, ClipboardList, Compass, Download, FlaskConical, Globe2, Instagram, MessageCircle, Phone, Plane, Ticket, UsersRound, Wallet, Zap } from 'lucide-react';
import { balance, bookingStatuses, money, sources, stages, titleDate } from '../domains/shared';
import { report, type Filters } from '../domains/reporting';
import { Badge, Button, Empty, PageHeading, Panel, Table, Upcoming, dateColumn, labelFor, moneyColumn, stateColumn, useApp } from './ui';

function BarList({values,tone='teal'}:{values:{label:string;value:number}[];tone?:string}) {
  const max=Math.max(1,...values.map(x=>x.value));
  return values.length?<div className="bar-list">{values.map(({label,value})=><div className="bar-row" key={label}><div><span>{label}</span><strong>{value}</strong></div>
    <div className="meter"><span className={tone} style={{width:(value/max*100)+'%'}}/></div></div>)}</div>:<Empty title="No data in this view" description="Change the filters to see other records."/>;
}
export function Overview({reports=false}:{reports?:boolean}) {
  const {data,portal,act}=useApp();
  const [filters,setFilters]=useState<Filters>({});
  const [period,setPeriod]=useState('All dates');
  const [running,setRunning]=useState(false);
  const totals=report(data,filters,data.today);
  const salesPerformance=data.team.filter(user=>['admin','manager','sales'].includes(user.role)).map(user=>{
    const assigned=totals.leads.filter(lead=>lead.owner===user.id);
    const leadIds=new Set(assigned.map(lead=>lead.id));
    const quoteIds=new Set(data.quotes.filter(quote=>leadIds.has(quote.lead_id)).map(quote=>quote.id));
    const booked=totals.bookings.filter(booking=>quoteIds.has(booking.quote_id)&&booking.status!=='Cancelled');
    return {id:user.id,name:user.name,enquiries:assigned.length,won:assigned.filter(lead=>lead.stage==='Won').length,
      booked:booked.reduce((sum,booking)=>sum+(booking.total||0),0)};
  }).filter(user=>user.enquiries);
  const rows=totals.bookings.map(b=>({...b,customer:labelFor(data.customers,data.bookings.find(r=>r.id===b.id)?.customer_id),outstanding:balance(b.total||0,b.paid||0,b.status||'')}));
  const add=(name:keyof Filters,value:string)=>setFilters(prev=>({...prev,[name]:value}));
  const exportQuery=new URLSearchParams(Object.entries(filters).filter(([,value])=>value)).toString();
  const canSim=['admin','manager','sales'].includes(data.user.role);
  const canReport=['admin','manager','finance'].includes(data.user.role);
  const canDue=['admin','manager','ops','finance'].includes(data.user.role);
  const name=data.user.name.split(' ')[0];
  const selectedMonth=(value:string)=>{
    setPeriod(value);
    if (value==='All dates') setFilters(prev=>({...prev,from:'',to:''}));
    else {
      const date=new Date(data.today+'T00:00:00Z');date.setUTCDate(date.getUTCDate()-Number(value));
      setFilters(prev=>({...prev,from:date.toISOString().slice(0,10),to:data.today}));
    }
  };
  if (portal) return <>
    <PageHeading title={`Welcome, ${name}`} description="Review your travel plans and contact the Zuri Holidays team."/>
    <div className="hero portal-hero"><div><div className="hero-label"><Plane size={15}/> YOUR TRAVEL PORTAL</div><h2>Your next trip starts here.</h2>
      <p>Open a quotation or check the details of an upcoming booking.</p><Link className="button hero-button" href="/portal/bookings">My bookings</Link></div></div>
    <div className="chart-grid"><Panel title="Your quotations" description="Review travel proposals and respond directly.">
      {data.quotes.length?<div className="search-results">{data.quotes.slice(0,6).map(q=><Link key={q.id} href={'/portal/quotes/'+q.id}><strong>{q.destination} · {q.id}</strong><Badge value={q.status}/></Link>)}</div>:<Empty title="No shared quotations" description="Your travel specialist’s proposals will appear here."/>}
      </Panel><Panel title="Upcoming departures"><Upcoming records={totals.departures}/></Panel></div>
  </>;
  const core=[
    ['Total enquiries',totals.leads.length,UsersRound,'All recorded enquiries','blue'],
    ['Active bookings',totals.active,Ticket,'Open bookings across all stages','violet'],
    ['Booking value',money(totals.value),Wallet,'Non-cancelled bookings','green'],
    ['Outstanding balances',money(totals.outstanding),Activity,'Across non-cancelled bookings','amber'],
  ] as const;
  return <>
    <PageHeading title={reports?'Business reports':'Business overview'} description={reports?'Filter and export activity calculated from your workspace records.':`Here’s what’s happening at Zuri Holidays, ${name}.`}>
      {canDue&&<Button className="outline" disabled={running} onClick={async()=>{setRunning(true);try {await act('automation.due',{},r=>r.processed?`Processed ${r.processed} due automations`:'Due automations are up to date');}catch{} finally{setRunning(false);}}}><Zap size={16}/> {running?'Running…':'Run due automations'}</Button>}
      {canSim&&<Link className="button" href="/simulation"><FlaskConical size={16}/> Open simulator</Link>}
    </PageHeading>
    {!reports&&<div className="hero"><div><div className="hero-label"><Plane size={15}/> ZURI HOLIDAYS WORKSPACE</div><h2>From enquiry to takeoff.</h2>
      <p>Manage your sales pipeline and keep every trip on track.</p>
      <Link className="button hero-button" href={canSim?'/guide':'/bookings'}><BookOpen size={16}/>{canSim?'Explore demo guide':'View bookings'}</Link></div>
      <div className="hero-location"><Compass size={14}/> Dubai Marina, UAE</div></div>}
    <section className="snapshot">
      <div className="section-title"><div><h2>{reports?'Performance summary':'Business snapshot'}</h2><p>Figures update as activity is recorded.</p></div>
        <label className="period"><CalendarDays size={16}/><select aria-label="Reporting period" value={period} onChange={e=>selectedMonth(e.target.value)}>
          <option>All dates</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></select></label></div>
      {reports&&<div className="report-filters">
        <label className="field"><span>From</span><input type="date" value={filters.from||''} onChange={e=>add('from',e.target.value)}/></label>
        <label className="field"><span>Through</span><input type="date" value={filters.to||''} onChange={e=>add('to',e.target.value)}/></label>
        <label className="field"><span>Booking status</span><select value={filters.bookingStatus||''} onChange={e=>add('bookingStatus',e.target.value)}><option value="">All statuses</option>{bookingStatuses.map(x=><option key={x}>{x}</option>)}</select></label>
        {data.user.role!=='finance'&&<>
        <label className="field"><span>Source</span><select aria-label="Source" value={filters.source||''} onChange={e=>add('source',e.target.value)}><option value="">All sources</option>{sources.map(x=><option key={x}>{x}</option>)}</select></label>
        <label className="field"><span>Salesperson</span><select value={filters.owner||''} onChange={e=>add('owner',e.target.value)}><option value="">All staff</option>{data.team.filter(u=>['admin','manager','sales'].includes(u.role)).map(u=><option value={u.id} key={u.id}>{u.name}</option>)}</select></label>
        <label className="field"><span>Lead stage</span><select value={filters.stage||''} onChange={e=>add('stage',e.target.value)}><option value="">All stages</option>{stages.map(x=><option key={x}>{x}</option>)}</select></label></>}
      </div>}
      <div className="stats">{core.map(([label,value,Icon,caption,tone])=><div className="stat" key={label}><div><span className={'stat-icon '+tone}><Icon size={19}/></span><span>{label}</span></div><strong>{value}</strong><small>{caption}</small></div>)}</div>
    </section>
    <div className="chart-grid">
      <Panel title="Booking revenue & collections" description="By booking month · INR" action={canReport&&!reports?<Link href="/reports" className="text-link">View report</Link>:undefined} className="trend-panel">
        <div className="legend"><span><i/> Confirmed revenue</span><span><i/> Net received</span></div>
        <div className="chart">{totals.groups.length?<ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <AreaChart data={totals.groups} margin={{top:6,right:12,bottom:0,left:0}}>
            <defs><linearGradient id="sales-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="var(--chart-teal)" stopOpacity={.25}/><stop offset="100%" stopColor="var(--chart-teal)" stopOpacity={.015}/></linearGradient></defs>
            <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="4 4"/>
            <XAxis dataKey="month" tickFormatter={v=>new Date(v+'-03').toLocaleDateString('en-IN',{month:'short'})} tick={{fill:'var(--muted)',fontSize:12}} axisLine={false} tickLine={false}/>
            <YAxis width={56} tickFormatter={v=>v===0?'₹0':'₹'+(v/10_000_000).toFixed(v%10_000_000?1:0)+'L'} tick={{fill:'var(--muted)',fontSize:12}} axisLine={false} tickLine={false}/>
            <Tooltip formatter={v=>money(Number(v))} contentStyle={{background:'var(--panel)',border:'1px solid var(--line)',borderRadius:10}}/>
            <Area type="monotone" name="Confirmed revenue" dataKey="revenue" stroke="var(--chart-teal)" fill="url(#sales-fill)" strokeWidth={2.5} isAnimationActive={false}/>
            <Area type="monotone" name="Net received" dataKey="cash" stroke="var(--chart-blue)" fill="none" strokeWidth={2} strokeDasharray="5 3" isAnimationActive={false}/>
          </AreaChart></ResponsiveContainer>:<Empty title="No booking activity" description="Bookings within the selected date range appear here."/>}</div>
      </Panel>
      <Panel title={data.user.role==='finance'?'Financial position':'Enquiries by source'} description={data.user.role==='finance'?'Across the selected booking cohort':'Where your travellers first reached out'}>
        {data.user.role==='finance'?<div className="mini-metrics finance-metrics">{[['Net received',money(totals.cash)],['Supplier payables',money(totals.payable)],['Estimated gross profit',money(totals.profit)]].map(([label,value])=><div key={label}><small>{label}</small><strong>{value}</strong></div>)}</div>:<BarList values={totals.sources.slice(0,7)}/>}
      </Panel>
    </div>
    <div className="chart-grid">
      <Panel title="Sales pipeline" description="Qualification and conversion across the selected enquiries"><BarList values={totals.funnel}/>
      <div className="mini-metrics"><div><small>New leads</small><strong>{totals.newLeads}</strong></div><div><small>Qualified leads</small><strong>{totals.qualified}</strong></div><div><small>Follow-ups due</small><strong>{totals.due}</strong></div></div></Panel>
      <Panel title="Upcoming departures" description={totals.departures.length+' confirmed trips from today'} action={<Link href="/bookings" className="text-link">View bookings</Link>}><Upcoming records={totals.departures.slice(0,reports?12:5)}/></Panel>
    </div>
    <Panel title="Commercial performance" description="Revenue uses confirmed booking value. Net cash deducts refunds. Estimated cost uses the higher of the quote estimate and active supplier commitments.">
      <div className="mini-metrics wrap">{[
        ['Quotations issued',totals.sent],['Quotes accepted',totals.accepted],['Quote acceptance',totals.sent?Math.round(totals.accepted/totals.sent*100)+'%':'—'],['Confirmed revenue',money(totals.sales)],
        ['Net received',money(totals.cash)],['Supplier payables',money(totals.payable)],['Est. margin',totals.margin+'%'],
        ['Est. gross profit',money(totals.profit)],
      ].map(([label,value])=><div key={label}><small>{label}</small><strong>{value}</strong></div>)}</div>
    </Panel>
    {reports&&<>
      <div className="chart-grid"><Panel title="Destination demand"><BarList values={totals.demand.slice(0,8)}/></Panel>
        <Panel title="Monthly booking activity"><BarList values={totals.groups.map(g=>({label:g.month,value:g.bookings}))}/></Panel></div>
      {data.user.role!=='finance'&&<Panel title="Salesperson performance"><Table records={salesPerformance}
        columns={[{key:'name',label:'Salesperson'},{key:'enquiries',label:'Enquiries'},{key:'won',label:'Won leads'},moneyColumn('booked','Booking value')]}/></Panel>}
      <Panel title="Report exports" action={<div className="actions">{(data.user.role==='finance'?['bookings','suppliers']:['leads','bookings','suppliers']).map(key=><a key={key} className="button outline" href={'/api/crm/report/'+key+'?'+exportQuery}><Download size={15}/> {key==='suppliers'?'Supplier':key==='leads'?'Leads':'Bookings'} CSV</a>)}</div>}>
        <Table records={rows} columns={[{key:'id',label:'Booking'},{key:'customer',label:'Customer'},stateColumn(),dateColumn('departure','Departure'),moneyColumn('total','Value'),moneyColumn('paid','Net received'),moneyColumn('outstanding','Balance')]} href={r=>'/bookings/'+r.id}/>
      </Panel>
    </>}
  </>;
}
const demos=[
  ['Website enquiry','Submit a travel brief and open its CRM record.','/simulation?channel=Website',Globe2],
  ['WhatsApp enquiry','Collect a Dubai family trip brief with the chat assistant.','/simulation?channel=WhatsApp',MessageCircle],
  ['Instagram DM','Start with a handle and add contact details during qualification.','/simulation?channel=Instagram',Instagram],
  ['Phone enquiry','Record a conversation, caller details and follow-up manually.','/simulation?channel=Phone',Phone],
  ['Quotation and PDF','Choose a qualified enquiry and prepare a package-based proposal.','/leads',ClipboardList],
  ['Acceptance and booking','Share a sent quotation through the portal and convert it.','/quotes',Ticket],
  ['Payment and invoice','Record a test advance on a booking and download a receipt.','/bookings',Wallet],
  ['Supplier and operations','Confirm supplier requests and complete preparation tasks.','/operations',BuildingPlaceholder],
  ['Customer portal','Open Ananya’s seeded account or use a fresh link from a sent quote.','/portal',Compass],
  ['Live reporting','Review changes in booking value, cash and leads.','/reports',Activity],
] as const;
function BuildingPlaceholder({size}:{size:number}) { return <ClipboardList size={size}/>; }
export function DemoGuide() {
  const {data}=useApp();
  const [completed,setCompleted]=useState<string[]>([]);
  const restricted=data.user.role!=='admin';
  return <><PageHeading title="Demo guide" description="Follow a customer from their first message to travel and reporting."/>
    <Panel title="10-minute walkthrough" description="Begin with a WhatsApp enquiry. Keep the customer portal in a second tab while you work in the staff workspace.">
      <div className="guide-progress"><strong>{completed.length} of {demos.length} steps checked</strong><progress max={demos.length} value={completed.length}/></div>
    </Panel>
    <div className="guide-grid">{demos.map(([title,desc,href,Icon])=><Panel key={title}><div className="guide-card">
      <span className="stat-icon green"><Icon size={20}/></span><h2>{title}</h2><p>{desc}</p>
      <div className="actions"><Link className="button outline" href={href} target={href==='/portal'?'_blank':undefined}>Open {title.toLowerCase()}</Link>
        <label className="check-label"><input type="checkbox" checked={completed.includes(title)} onChange={e=>setCompleted(e.target.checked?[...completed,title]:completed.filter(x=>x!==title))}/> Done</label></div></div></Panel>)}</div>
    {restricted&&<p className="muted">Some steps require a different staff role. The Owner / Admin demo account can run the full walkthrough.</p>}
  </>;
}
