import { balance, businessDate, confirmed } from './shared.ts';

type ReportInput = {
  leads: {id?:string; stage?:string; owner?:string; source?:string; destination?:string; follow_up?:string; created?:string}[];
  quotes: {id?:string; lead_id?:string; status?:string; created?:string}[];
  bookings: {id?:string; quote_id?:string; status?:string; total?:number; paid?:number; cost?:number; assigned_cost?:number; departure?:string; created?:string}[];
  supplier_jobs: {booking_id?:string; status?:string; cost?:number; settled?:number}[];
};
export type Filters = {from?:string; to?:string; source?:string; owner?:string; stage?:string; bookingStatus?:string};
export function report(data:ReportInput, filters:Filters, today:string) {
  const inDate=(value?:string)=>{
    if (!value) return false;
    const date=businessDate(value);
    return (!filters.from||date>=filters.from)&&(!filters.to||date<=filters.to);
  };
  const leadFilter=Boolean(filters.source||filters.owner||filters.stage);
  const matched=data.leads.filter(l=>(!filters.source||l.source===filters.source)&&(!filters.owner||l.owner===filters.owner)&&(!filters.stage||l.stage===filters.stage));
  const leadIds=new Set(matched.map(l=>l.id));
  const leads=matched.filter(l=>inDate(l.created));
  const relevant=data.quotes.filter(q=>!leadFilter||leadIds.has(q.lead_id));
  const quotes=relevant.filter(q=>inDate(q.created));
  const quoteIds=new Set(relevant.map(q=>q.id));
  const bookings=data.bookings.filter(b=>inDate(b.created)&&(!leadFilter||quoteIds.has(b.quote_id))&&(!filters.bookingStatus||b.status===filters.bookingStatus));
  const bookingIds=new Set(bookings.map(b=>b.id));
  const jobs=data.supplier_jobs.filter(j=>j.status!=='Cancelled'&&bookingIds.has(j.booking_id));
  const revenue=bookings.filter(b=>confirmed.includes(b.status||''));
  const sales=revenue.reduce((sum,b)=>sum+(b.total||0),0);
  const costs=revenue.reduce((sum,b)=>sum+Math.max(b.cost||0,b.assigned_cost||0),0);
  const sent=quotes.filter(q=>['Sent','Viewed','Accepted','Rejected','Expired'].includes(q.status||''));
  const counts=(field:'source'|'destination'|'owner')=>Object.entries(leads.reduce<Record<string,number>>((out,l)=>{
    const label=l[field]||'Unspecified'; out[label]=(out[label]||0)+1; return out;
  },{})).map(([label,value])=>({label,value})).sort((a,b)=>b.value-a.value);
  const monthOf=(value:string)=>businessDate(value).slice(0,7);
  const monthKeys=[...new Set(bookings.map(b=>monthOf(b.created!)))].sort().slice(-8);
  return {
    leads,quotes,bookings,jobs, sources:counts('source'), demand:counts('destination'), team:counts('owner'),
    groups:monthKeys.map(month=>({
      month,
      bookings:bookings.filter(b=>monthOf(b.created!)===month).length,
      revenue:revenue.filter(b=>monthOf(b.created!)===month).reduce((sum,b)=>sum+(b.total||0),0),
      cash:bookings.filter(b=>monthOf(b.created!)===month).reduce((sum,b)=>sum+(b.paid||0),0),
    })),
    funnel:[
      {label:'Enquiries',value:leads.length},
      {label:'Qualified or later',value:leads.filter(l=>['Qualified','Quotation Prepared','Quotation Sent','Negotiation','Won'].includes(l.stage||'')).length},
      {label:'Quotation issued',value:new Set(sent.map(q=>q.lead_id)).size},
      {label:'Won',value:leads.filter(l=>l.stage==='Won').length},
    ],
    newLeads:leads.filter(l=>l.stage==='New').length,
    qualified:leads.filter(l=>l.stage==='Qualified').length,
    due:leads.filter(l=>l.follow_up&&l.follow_up<=today&&!['Won','Lost','Closed'].includes(l.stage||'')).length,
    sent:sent.length,
    accepted:quotes.filter(q=>q.status==='Accepted').length,
    active:bookings.filter(b=>!['Completed','Cancelled'].includes(b.status||'')).length,
    departures:bookings.filter(b=>b.departure&&b.departure>=today&&['Confirmed','Documents Ready','Travel In Progress'].includes(b.status||'')).sort((a,b)=>a.departure!.localeCompare(b.departure!)),
    value:bookings.filter(b=>b.status!=='Cancelled').reduce((sum,b)=>sum+(b.total||0),0),
    sales,costs,profit:sales-costs,
    margin:sales?Math.round((sales-costs)/sales*100):0,
    cash:bookings.reduce((sum,b)=>sum+(b.paid||0),0),
    outstanding:bookings.reduce((sum,b)=>sum+balance(b.total||0,b.paid||0,b.status||''),0),
    payable:jobs.reduce((sum,j)=>sum+(j.cost||0)-(j.settled||0),0),
  };
}
