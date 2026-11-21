import { z } from 'zod';
import { balance, scenarios, type User } from '../domains/shared.ts';
import { allow, check, demo } from './auth.ts';
import { assignee, message, notify, record, task, template } from './events.ts';
import { day, id, insert, one, readBatch, run, update } from './db.ts';
import { conversationAccess, ingest, mergeLeadRecords, requireCustomerScope, salesLead } from './crm.ts';
import { enquiry, key, notes, phone, str } from './input.ts';

const prompts = [
  ['destination','Where would you like to travel?'],
  ['travellers','How many adults and children are travelling?'],
  ['dates','When would you like to travel? An approximate month or flexible dates are fine.'],
  ['city','Which city will you depart from?'],
  ['budget','What is your approximate total budget in INR?'],
  ['contact','Could you share your name and a phone number or email for your quotation?'],
  ['preferences','Anything we should plan around, such as hotel preferences, activities or accessibility? You can reply “No preferences”.'],
] as const;
type Step = typeof prompts[number][0];
type State = {scenario:number; step?:Step; destination?:string; adults?:number; children?:number; dates?:string; city?:string;
  budget?:number; name?:string; phone?:string; email?:string; preferences?:string; purpose?:string; qualified?:boolean; package_id?:string};
const destinations = ['Dubai','Bali','Kashmir','Thailand','Singapore','Goa','Kerala','Maldives','Vietnam','Sri Lanka','Nepal','Japan','Rajasthan','Himachal','Andaman','Malaysia'];
const cities = ['Chennai','Bengaluru','Bangalore','Hyderabad','Mumbai','Kochi','Pune','Delhi','Kolkata','Ahmedabad','Coimbatore','Dubai','Singapore'];
const number = (word:string) => ({one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10}[word.toLowerCase()] ?? Number(word));
function extract(body:string,s:State) {
  const lower=body.toLowerCase();
  const destination=destinations.find(d=>new RegExp(`\\b${d}\\b`,'i').test(body));
  const custom=body.match(/(?:travel to|trip to|visit|destination(?: is)?)[ :]+([\p{L} ]{2,35})(?=[,.!?]|$)/iu)?.[1]?.trim();
  if (!s.destination && (destination||custom)) s.destination=destination||custom;
  if (!s.destination&&s.step==='destination'&&/^[\p{L}][\p{L} ]{1,34}$/u.test(body)&&!/(hi|hello|details|package|help|please)\b/i.test(body)) s.destination=body;
  const adults=body.match(/\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:adults?|people|pax|travell?ers?)\b/i);
  const children=body.match(/\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:children|kids?|child)\b/i);
  if (adults&&number(adults[1])>0) s.adults=number(adults[1]);
  if (children) s.children=number(children[1]);
  if (!adults&&s.step==='travellers'&&/^\d{1,2}$/.test(body)&&Number(body)>0) s.adults=Number(body);
  if (s.adults&&s.children===undefined) s.children=0;
  const dates=/(?:\b(next month|next week|flexible|january|february|march|april|may|june|july|august|september|october|november|december)\b|\b\d{4}-\d{2}-\d{2}\b)/i;
  const dateText=body.match(/[^;.!?]*?(?:next month|next week|flexible|(?:\d{1,2}(?:[–-]\d{1,2})?\s+)?(?:January|February|March|April|May|June|July|August|September|October|November|December)|\d{4}-\d{2}-\d{2})[^;.!?]*/i);
  if (!s.dates&&dates.test(body)&&dateText) s.dates=(s.step==='dates'?body:dateText[0].trim()).slice(0,245);
  const from=body.match(/\b(?:from|departing from|departure city(?: is)?)\s+([\p{L} ]{2,32})(?=[,.;!?]|$)/iu)?.[1];
  const city=cities.find(c=>lower===c.toLowerCase()||lower.includes('from '+c.toLowerCase()));
  if (!s.city&&(city||from)) s.city=city||from;
  if (!s.city&&s.step==='city'&&/^[\p{L}][\p{L} ]{1,32}$/u.test(body)&&!dates.test(body)) s.city=body;
  const budget=body.match(/(?:₹|\bINR\s*|\bbudget(?: is| of)?\s*[:=]?\s*)([\d,.]+)\s*(lakh|lac|k)?/i)
    ||(s.step==='budget'?body.match(/^(?:around\s+|approx(?:imately)?\s+)?([\d,.]+)\s*(lakh|lac|k)?$/i):null);
  if (budget) {
    const scale=budget[2]?.toLowerCase()==='k'?1000:budget[2]?100_000:1;
    const value=Math.round(Number(budget[1].replaceAll(',',''))*scale*100);
    if (Number.isSafeInteger(value)&&value>0&&value<=10_000_000_000) s.budget=value;
  }
  const email=body.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i)?.[0];
  const rawPhone=body.match(/(?:\+\d{1,3}[ -]?)?(?:\d[ -]?){10,14}\d?/g)?.find(value=>!value.trim().match(/^\d{4}-\d{2}-\d{2}$/));
  const explicitName=body.match(/(?:my name is|i am|i'm|name[:=])\s*([\p{L}][\p{L} '-]{1,70})(?=[,.;!?]|$)/iu)?.[1];
  if (email) s.email=email;
  if (rawPhone&&phone(rawPhone)) s.phone=phone(rawPhone);
  if (explicitName) s.name=explicitName;
  if (!s.name&&(s.step==='contact'||email||rawPhone)) {
    const first=body.split(/[,;\n]/)[0].trim();
    if (/^[\p{L}][\p{L} '-]{1,70}$/u.test(first)&&!/^(hello|hi|thanks|thank you|yes|no)$/i.test(first)) s.name=first;
  }
  s.purpose ||= body.match(/\b(honeymoon|family|corporate|group|budget)\b/i)?.[1] || '';
  const preference=body.match(/(?:prefer(?:ence)?s?(?: are)?|special requests?|we need)[: ]+([^;]+)/i)?.[1];
  if (preference && !s.preferences) s.preferences=preference;
  if (s.step==='preferences') s.preferences=body;
}
function nextStep(s:State):Step|undefined {
  const missing:Record<Step,boolean>={destination:!s.destination,travellers:!s.adults,dates:!s.dates,
    city:!s.city,budget:!s.budget,contact:!s.name||!(s.phone||s.email),preferences:s.preferences===undefined};
  return prompts.find(([step])=>missing[step])?.[0];
}
export async function simulationActions(action:string,input:unknown,user:User) {
  if (!action.startsWith('sim.')) return;
  allow(user,'manager','sales');
  check(demo,'Simulations are disabled',403);
  if (action==='sim.start') {
    const data=z.object({channel:z.enum(['WhatsApp','Instagram']),identity:str,scenario:z.coerce.number().int().min(0).max(scenarios.length-1)}).parse(input);
    const conversation=id('CV');
    if (data.channel==='Instagram') check(/^@?[a-z0-9_.]{1,30}$/i.test(data.identity),'Enter a valid Instagram handle');
    insert('conversations',{id:conversation,channel:data.channel,identity:data.identity,owner:user.id,state:JSON.stringify({scenario:data.scenario})});
    await record('Conversation started',`Simulated ${data.channel} session opened`,{conversation_id:conversation},user);
    return {id:conversation};
  }
  if (action==='sim.message') {
    const data=z.object({id:key,body:notes.refine(Boolean,'Type a message').refine(s=>s.length<=600,'Use 600 characters or less')}).parse(input);
    const c=await conversationAccess(user,data.id);
    check(['WhatsApp','Instagram'].includes(c.channel),'Select a messaging simulation');
    check(c.status!=='Closed','This conversation has been closed');
    const state:State=JSON.parse(c.state);
    message(c.id,'Inbound',data.body,user);
    await record('Message received',`Simulated ${c.channel} message stored`,{lead_id:c.lead_id,conversation_id:c.id},user);
    if (c.status!=='Automation') {
      const event=await record('Awaiting staff reply','The incoming message was routed to the assigned salesperson',{lead_id:c.lead_id,conversation_id:c.id},user);
      notify(c.owner,'A conversation needs your reply',`/inbox/${c.id}`,event);
      return {id:c.id};
    }
    if (/\b(human|agent|salesperson|quotation|quote)\b/i.test(data.body) && (state.qualified||/human|agent|salesperson/i.test(data.body))) {
      update('conversations',c.id,{status:'Human'});
      message(c.id,'Outbound',await template('handoff')||'A travel specialist will take over here.',undefined,true);
      const event=await record('Human handoff','Conversation handed to a salesperson',{lead_id:c.lead_id,conversation_id:c.id},user);
      notify(c.owner,'Conversation handed to sales',`/inbox/${c.id}`,event);
      return {id:c.id};
    }
    if (state.qualified) {
      message(c.id,'Outbound','Your travel brief is saved. Ask for a quotation to have a travel specialist take over.',undefined,true);
      return {id:c.id};
    }
    const previous={...state};
    extract(data.body,state);
    for (const [property,label] of [['destination','Destination identified'],['adults','Traveller details collected'],['dates','Travel dates collected'],['phone','Contact phone collected'],['email','Contact email collected']] as const) {
      if (state[property]!==previous[property]) await record(label,String(state[property]),{lead_id:c.lead_id,conversation_id:c.id},user);
    }
    if (c.channel==='Instagram'&&!c.lead_id) {
      const initial=await ingest(enquiry.parse({source:c.channel,instagram:c.identity,name:c.identity,destination:state.destination}),user,c.id);
      c.lead_id=initial.lead;
      c.customer_id=initial.customer;
    }
    state.step=nextStep(state);
    if (state.step) {
      let reply=prompts.find(([step])=>step===state.step)![1] as string;
      if (state.step==='contact'&&state.name) reply=`Thanks, ${state.name}. What phone number or email should we use?`;
      else if (state.step==='contact'&&(state.phone||state.email)) reply='I have your contact details. What name should I put on the quotation?';
      else if (state.step==='travellers'&&previous.step!=='travellers'&&state.destination) reply=`${state.destination} sounds great. ${reply}`;
      message(c.id,'Outbound',reply,undefined,true);
    } else {
      const best=await one('SELECT id,title FROM packages WHERE lower(destination)=lower(?) AND active=1 AND valid_until>=? ORDER BY ABS(base+markup-?) LIMIT 1',state.destination!,day(),state.budget!);
      const contact=enquiry.parse({...state,source:c.channel,instagram:'',whatsapp:c.channel==='WhatsApp'?state.phone:undefined,
        flexible:/flexible/i.test(state.dates!),package_id:best?.id});
      let transfer:{customer:string;lead:string}|undefined;
      if (c.channel==='Instagram') {
        const old=await one('SELECT * FROM customers WHERE id=?',c.customer_id);
        const found=await one('SELECT id FROM customers WHERE (phone=? OR email=?) AND id<>?',state.phone||null,state.email?.toLowerCase()||null,c.customer_id);
        if (found&&old&&!old.phone&&!old.email) {
          await requireCustomerScope(user,old.id);
          await requireCustomerScope(user,found.id);
          run('UPDATE customers SET instagram=NULL WHERE id=?',c.customer_id);
          run('UPDATE leads SET customer_id=? WHERE id=?',found.id,c.lead_id);
          transfer={customer:c.customer_id,lead:c.lead_id};
        }
        contact.instagram=c.identity;
      }
      const result=await ingest(contact,user,c.id,true,transfer);
      if (c.channel==='Instagram' && c.lead_id && c.lead_id!==result.lead) {
        const oldLead=await salesLead(user,c.lead_id);
        const oldCustomer=transfer?result.customer:oldLead.customer_id;
        if (oldCustomer===result.customer) {
          await mergeLeadRecords({...oldLead,customer_id:oldCustomer},
            {id:result.lead,owner:result.owner,customer_id:result.customer},user);
        }
      }
      run('UPDATE events SET lead_id=? WHERE conversation_id=?',result.lead,c.id);
      const event=await record('Qualification complete',best?`Suggested package: ${best.title}`:'Marked as a custom trip',{lead_id:result.lead,conversation_id:c.id},user);
      notify(result.owner,'New qualified enquiry',`/leads/${result.lead}`,event);
      state.qualified=true;
      state.package_id=best?.id;
      message(c.id,'Outbound',`Thanks, ${state.name}. Your ${state.destination} brief is ready. ${best?`${best.title} is a good starting point.`:'A specialist can prepare a custom itinerary.'} Would you like a quotation?`,undefined,true);
    }
    update('conversations',c.id,{state:JSON.stringify(state)});
    return {id:c.id};
  }
}

export async function runDue(user:User) {
  allow(user,'manager','ops','finance');
  let processed=0;
  const today=day();
  const [workflows,events,checklist,followups,departures,documents,payments,expired]=await readBatch([
    {sql:"SELECT id,template FROM workflows WHERE enabled=1",params:[]},
    {sql:"SELECT event_key FROM events WHERE event_key IS NOT NULL",params:[]},
    {sql:"SELECT trigger_key FROM tasks WHERE trigger_key LIKE 'departure:%'",params:[]},
    {sql:"SELECT * FROM tasks WHERE status<>'Done' AND due<=?",params:[today]},
    {sql:"SELECT * FROM bookings WHERE status IN ('Confirmed','Documents Ready') AND departure BETWEEN ? AND ?",params:[today,day(7)]},
    {sql:"SELECT * FROM documents WHERE status='Missing' AND booking_id IS NOT NULL AND due<=?",params:[day(7)]},
    {sql:`SELECT b.*,q.lead_id,
      (SELECT id FROM conversations WHERE lead_id=q.lead_id ORDER BY created DESC LIMIT 1) conversation_id,
      COALESCE((SELECT SUM(CASE status WHEN 'Paid' THEN amount WHEN 'Refunded' THEN -amount ELSE 0 END)
        FROM payments WHERE booking_id=b.id),0) paid
      FROM bookings b JOIN quotes q ON q.id=b.quote_id
      WHERE b.balance_due<=? AND b.status NOT IN ('Cancelled','Completed')`,params:[today]},
    {sql:"SELECT id,lead_id FROM quotes WHERE status IN ('Sent','Viewed') AND expiry<?",params:[today]},
  ]);
  const templates=new Map(workflows.map(row=>[row.id,String(row.template)]));
  const eventKeys=new Set<string>(events.map(row=>row.event_key));
  const taskKeys=new Set<string>(checklist.map(row=>row.trigger_key));
  const owner=await assignee('ops');
  if (templates.has('followup')) for (const t of followups) {
    const event=await record('Follow-up due',t.title,{lead_id:t.lead_id,booking_id:t.booking_id},user,`due:${t.id}:${t.due}`,'Success',eventKeys);
    notify(t.owner,t.title,t.lead_id?`/leads/${t.lead_id}`:`/bookings/${t.booking_id}`,event);
    processed+=Number(Boolean(event));
  }
  if (templates.has('departure')) for (const b of departures) {
    const key=`departure:${b.id}:${b.departure}`;
    const event=await record('Departure approaching',`${b.destination} departs ${b.departure}`,{booking_id:b.id},user,key,'Success',eventKeys);
    notify(owner,'Review upcoming departure',`/bookings/${b.id}`,event);
    await task({title:'Review departure readiness',owner,links:{booking_id:b.id},due:b.departure,key,existingKeys:taskKeys});
    processed+=Number(Boolean(event));
  }
  if (templates.has('documents')) for (const d of documents) {
    const event=await record('Document missing',`${d.kind} is due ${d.due}`,{booking_id:d.booking_id},user,`document:${d.id}`,'Success',eventKeys);
    notify(owner,`Missing ${d.kind}`,`/documents/${d.id}`,event);
    processed+=Number(Boolean(event));
  }
  const reminder=templates.get('payment');
  if (reminder) for (const b of payments) {
    if (!balance(b.total,b.paid,b.status)) continue;
    const event=await record('Payment milestone due','Outstanding balance reminder recorded as a simulation',
      {booking_id:b.id,lead_id:b.lead_id},user,`balance-due:${b.id}:${b.balance_due}`,'Success',eventKeys);
    if (!event) continue;
    if (b.conversation_id) message(b.conversation_id,'Outbound',reminder,undefined,true);
    processed++;
  }
  for (const q of expired) {
    update('quotes',q.id,{status:'Expired'});
    await record('Quotation expired',`${q.id} passed its validity date`,{lead_id:q.lead_id},user);
    processed++;
  }
  return {processed};
}
