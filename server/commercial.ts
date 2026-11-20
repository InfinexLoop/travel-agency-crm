import { z } from 'zod';
import { addDays, balance, bookingStatuses, confirmed, type User } from '../domains/shared.ts';
import { allow, check, sameCustomer } from './auth.ts';
import { day, id, insert, one, rows, run, update } from './db.ts';
import { assignee, closeTasks, message, notify, record, task, template } from './events.ts';
import { find, leadStage, salesLead } from './crm.ts';
import { amount, count, date, days, key, notes, optionalKey, str, text, validateTravel } from './input.ts';

export function quoteAccess(user:User,id:string) {
  allow(user,'manager','sales','customer','finance');
  const q=find('quotes',id);
  sameCustomer(user,q.customer_id);
  if (user.role==='sales') salesLead(user,q.lead_id);
  check(user.role!=='customer'||['Sent','Viewed','Accepted','Rejected','Expired'].includes(q.status),'Quotation not found',404);
  return q;
}
export function bookingAccess(user:User,id:string) {
  const b=find('bookings',id);
  sameCustomer(user,b.customer_id);
  if (user.role==='sales') salesLead(user,find('quotes',b.quote_id).lead_id);
  return b;
}
export function bookingPaid(id:string) {
  return one<{paid:number}>(`SELECT COALESCE(SUM(CASE status WHEN 'Paid' THEN amount WHEN 'Refunded' THEN -amount ELSE 0 END),0) paid
    FROM payments WHERE booking_id=?`,id)!.paid;
}
export function createBooking(quoteId:string,user:User) {
  allow(user,'manager','sales','customer');
  const q=quoteAccess(user,quoteId);
  check(q.status==='Accepted','Only accepted quotations can become bookings');
  const existing=one('SELECT id FROM bookings WHERE quote_id=?',q.id);
  if (existing) return {id:existing.id};
  const booking=id('BK');
  insert('bookings',{id:booking,quote_id:q.id,customer_id:q.customer_id,destination:q.destination,departure:q.departure,
    return_date:q.return_date,balance_due:q.balance_due||addDays(q.departure,-7),itinerary:q.itinerary,total:q.total,cost:q.cost,advance:q.advance});
  for (const traveller of rows('SELECT id FROM travellers WHERE customer_id=? ORDER BY rowid LIMIT ?',q.customer_id,q.adults+q.children)) {
    insert('booking_travellers',{booking_id:booking,traveller_id:traveller.id});
  }
  leadStage(q.lead_id,'Won',user);
  record('Booking created','Accepted quotation copied into booking',{booking_id:booking,lead_id:q.lead_id},user,`booking:${q.id}`);
  return {id:booking};
}
function steps(booking:string,departure:string) {
  const owner=assignee('ops');
  for (const title of ['Confirm hotel, flights and transfers','Verify traveller documents and visa requirements','Prepare itinerary and travel vouchers','Review departure readiness']) {
    task({title,owner,links:{booking_id:booking},due:departure,key:`prep:${booking}:${title}`});
  }
}
const packageInput=z.object({
  id:key.optional(),title:text,destination:text,category:text,nights:count,overview:notes,
  hotel:str,meals:str,transfers:str,activities:notes,flights:z.boolean().default(false),inclusions:notes,exclusions:notes,
  cancellation:notes,base:amount,markup:amount,valid_until:date,itinerary:days,
});
const quoteInput=z.object({
  id:key.optional(),lead_id:key,package_id:optionalKey,destination:text,departure:date,return_date:date,
  adults:count.min(1),children:count.default(0),itinerary:days,cost:amount,markup:amount,extras:amount,discount:amount,tax:amount,
  advance:amount,schedule:notes,balance_due:z.union([date,z.literal('')]).default(''),expiry:date,terms:notes,notes,internal:notes,
});

function advanceReached(b:ReturnType<typeof bookingAccess>,user:User) {
  if (b.status!=='Pending Advance'||bookingPaid(b.id)<b.advance) return;
  update('bookings',b.id,{status:'Advance Recorded'});
  const event=record('Advance payment recorded','Required advance reached. Operations tasks have been created.',{booking_id:b.id},user,`advance:${b.id}`);
  notify(assignee('ops'),'Advance received. Prepare this booking.',`/bookings/${b.id}`,event);
  steps(b.id,b.departure);
}

export function commercialActions(action:string,input:unknown,user:User) {
  switch(action) {
    case 'package.save': {
      allow(user,'manager');
      const {id:existing,itinerary,flights,...fields}=packageInput.parse(input);
      const packageId=existing||id('PK');
      const details={...fields,flights:Number(flights)};
      if (existing) { find('packages',existing); update('packages',existing,details); }
      else insert('packages',{id:packageId,...details,cover:fields.destination.toLowerCase()==='dubai'?'/travel/dubai.jpg':''});
      run('DELETE FROM package_days WHERE package_id=?',packageId);
      itinerary.forEach((item,index)=>insert('package_days',{package_id:packageId,position:index+1,...item}));
      record('Package saved',`${fields.title} saved`,{},user);
      return {id:packageId};
    }
    case 'package.toggle':
    case 'package.duplicate': {
      allow(user,'manager');
      const {id:source}=z.object({id:key}).parse(input);
      const packageRow=find('packages',source);
      if (action==='package.toggle') {
        update('packages',source,{active:Number(!packageRow.active)});
        return {id:source};
      }
      const copied=id('PK');
      insert('packages',{...packageRow,id:copied,title:packageRow.title+' (copy)'});
      run('INSERT INTO package_days SELECT ?,position,title,description FROM package_days WHERE package_id=?',copied,source);
      run('INSERT INTO package_suppliers SELECT ?,supplier_id FROM package_suppliers WHERE package_id=?',copied,source);
      return {id:copied};
    }
    case 'package.supplier': {
      allow(user,'manager','ops');
      const data=z.object({id:key,supplier:key,remove:z.boolean().default(false)}).parse(input);
      find('packages',data.id); find('suppliers',data.supplier);
      if (data.remove) run('DELETE FROM package_suppliers WHERE package_id=? AND supplier_id=?',data.id,data.supplier);
      else run('INSERT OR IGNORE INTO package_suppliers VALUES (?,?)',data.id,data.supplier);
      return {id:data.id};
    }
    case 'quote.save': {
      const {id:existing,package_id,itinerary,...data}=quoteInput.parse(input);
      const lead=salesLead(user,data.lead_id);
      if (package_id) find('packages',package_id);
      validateTravel(data.departure,data.return_date);
      check(data.expiry>=day(),'Select a current or future quotation expiry');
      const total=data.cost+data.markup+data.extras+data.tax-data.discount;
      check(total>0&&data.advance>0&&data.advance<=total,'Total and advance must be positive. Advance cannot exceed the total.');
      const quoteId=existing||id('QT');
      let revision=1;
      if (existing) {
        const q=quoteAccess(user,existing);
        check(q.lead_id===lead.id&&!['Accepted'].includes(q.status),'Accepted quotations cannot be changed');
        revision=q.revision+1;
      }
      check(!data.balance_due||data.balance_due<=data.departure,'The balance is due on or before departure');
      const fields={...data,balance_due:data.balance_due||addDays(data.departure,-7),customer_id:lead.customer_id,package_id:package_id||null,itinerary:JSON.stringify(itinerary),total,revision,status:'Draft'};
      if (existing) update('quotes',quoteId,fields);
      else insert('quotes',{id:quoteId,...fields});
      insert('quote_revisions',{quote_id:quoteId,version:revision,snapshot:JSON.stringify(fields),actor:user.id});
      if (['New','In Conversation','Qualified','Quotation Prepared'].includes(lead.stage)) leadStage(lead.id,'Quotation Prepared',user);
      record('Quotation prepared',`${quoteId} · revision ${revision}`,{lead_id:lead.id},user);
      return {id:quoteId};
    }
    case 'quote.status': {
      const data=z.object({id:key,status:z.enum(['Internal Review','Approved','Sent','Viewed','Accepted','Rejected']),
        channel:z.enum(['WhatsApp','Email']).default('WhatsApp'),revision:z.number().int().positive().optional()}).parse(input);
      const q=quoteAccess(user,data.id);
      const portal=user.role==='customer';
      if (portal||data.revision!==undefined) check(data.revision===q.revision,'The quotation changed. Reopen it and review the current revision.',409);
      check(portal?['Viewed','Accepted','Rejected'].includes(data.status):['Internal Review','Approved','Sent'].includes(data.status),
        'This quotation action requires the appropriate role',403);
      if (data.status==='Approved') allow(user,'manager');
      if (!portal) allow(user,'manager','sales');
      const transitions:Record<string,string[]>={Draft:['Internal Review','Approved'], 'Internal Review':['Approved'],Approved:['Sent'],Sent:['Viewed','Accepted','Rejected'],Viewed:['Accepted','Rejected']};
      if (q.status===data.status) return {id:q.id};
      check(transitions[q.status]?.includes(data.status),'This quotation action is unavailable in the current status');
      check(q.expiry>=day(),'This quotation has expired');
      update('quotes',q.id,{status:data.status});
      record('Quotation '+data.status.toLowerCase(),`${q.id} → ${data.status}`,{lead_id:q.lead_id},user);
      if (data.status==='Sent') {
        if (['New','In Conversation','Qualified','Quotation Prepared','Quotation Sent'].includes(find('leads',q.lead_id).stage)) leadStage(q.lead_id,'Quotation Sent',user);
        const existing=one('SELECT id FROM conversations WHERE lead_id=? AND channel=? ORDER BY created DESC LIMIT 1',q.lead_id,data.channel);
        const conversation=existing?.id||id('CV');
        if (!existing) insert('conversations',{id:conversation,channel:data.channel,identity:find('customers',q.customer_id).name,lead_id:q.lead_id,customer_id:q.customer_id,owner:find('leads',q.lead_id).owner,status:'Open'});
        message(conversation,'Outbound',(template('quotation')||'Your travel quotation {quote} is ready in the demo portal.').replaceAll('{quote}',q.id),user,true);
        record('Simulated quotation notification',`${data.channel} notification saved in the inbox`,{lead_id:q.lead_id,conversation_id:conversation},user);
      }
      if (data.status==='Accepted') {
        const event=record('Accepted quote ready to book',`${q.id} can now be converted to a booking`,{lead_id:q.lead_id},user);
        notify(find('leads',q.lead_id).owner,'A traveller accepted their quotation',`/quotes/${q.id}`,event);
      }
      return {id:q.id};
    }
    case 'booking.create': {
      const data=z.object({id:key}).parse(input);
      return createBooking(data.id,user);
    }
    case 'booking.edit': {
      allow(user,'manager','ops');
      const {id:booking,itinerary,...fields}=z.object({id:key,departure:date,return_date:date,notes,hotel:str,flight:str,transfer:str,itinerary:days}).parse(input);
      const b=bookingAccess(user,booking);
      check(!['Cancelled','Completed'].includes(b.status),'Completed or cancelled bookings are locked');
      validateTravel(fields.departure,fields.return_date);
      const balance_due=b.balance_due===addDays(b.departure,-7)||!b.balance_due
        ?addDays(fields.departure,-7):b.balance_due>fields.departure?fields.departure:b.balance_due;
      update('bookings',booking,{...fields,balance_due,itinerary:JSON.stringify(itinerary)});
      if (b.departure!==fields.departure) {
        run("UPDATE tasks SET due=? WHERE booking_id=? AND status<>'Done' AND due=?",fields.departure,booking,b.departure);
        run("UPDATE documents SET due=? WHERE booking_id=? AND status<>'Verified' AND due=?",fields.departure,booking,b.departure);
      }
      record('Booking amended',`Booking dates ${fields.departure} to ${fields.return_date} and travel details saved`,{booking_id:booking},user);
      return {id:booking};
    }
    case 'booking.adjust': {
      allow(user,'finance');
      const data=z.object({id:key,total:amount,advance:amount,reason:text}).parse(input);
      const b=bookingAccess(user,data.id);
      check(!['Cancelled','Completed'].includes(b.status),'This booking is locked');
      check(data.total>=bookingPaid(b.id)&&data.advance>0&&data.advance<=data.total,
        'Booking value must cover net receipts and the required advance');
      check(data.total!==b.total||data.advance!==b.advance,'No financial change was entered');
      check(!confirmed.includes(b.status)||bookingPaid(b.id)>=data.advance,'A confirmed booking must retain its paid advance');
      const adjustment=id('ADJ');
      insert('booking_adjustments',{id:adjustment,booking_id:b.id,actor:user.id,
        prior_total:b.total,new_total:data.total,prior_advance:b.advance,new_advance:data.advance,reason:data.reason});
      const needsAdvance=['Advance Recorded','Supplier Confirmation Pending'].includes(b.status)&&bookingPaid(b.id)<data.advance;
      update('bookings',b.id,{total:data.total,advance:data.advance,...(needsAdvance?{status:'Pending Advance'}:{})});
      if (b.status==='Pending Advance') advanceReached({...b,advance:data.advance},user);
      record('Booking financial adjustment',`${adjustment} · ${data.reason}`,{booking_id:b.id},user);
      return {id:adjustment};
    }
    case 'booking.status': {
      allow(user,'manager','ops');
      const data=z.object({id:key,status:z.enum(bookingStatuses),reason:notes}).parse(input);
      const b=bookingAccess(user,data.id);
      if (b.status===data.status) return {id:b.id};
      const next:Record<string,string>={'Advance Recorded':'Supplier Confirmation Pending','Supplier Confirmation Pending':'Confirmed','Confirmed':'Documents Ready',
        'Documents Ready':'Travel In Progress','Travel In Progress':'Completed'};
      check((data.status==='Cancelled'&&!['Cancelled','Completed'].includes(b.status)&&data.reason)||next[b.status]===data.status,'Choose the next workflow stage or provide a cancellation reason');
      if (data.status==='Supplier Confirmation Pending') {
        check(bookingPaid(b.id)>=b.advance,'Record the required advance first');
        check(one("SELECT id FROM supplier_jobs WHERE booking_id=? AND status<>'Cancelled'",b.id),'Add at least one supplier service request');
      }
      if (data.status==='Confirmed') {
        check(bookingPaid(b.id)>=b.advance,'Record the required advance first');
        check(one("SELECT id FROM supplier_jobs WHERE booking_id=? AND status='Confirmed'",b.id)&&!one("SELECT id FROM supplier_jobs WHERE booking_id=? AND status='Requested'",b.id),'Confirm all active supplier requests before confirming');
      }
      if (data.status==='Documents Ready') {
        check(!one("SELECT id FROM documents WHERE booking_id=? AND status NOT IN ('Verified','Waived')",b.id),'Verify or waive outstanding document requirements first');
        check(!one("SELECT id FROM visas WHERE booking_id=? AND status NOT IN ('Approved','Not Required')",b.id),'Resolve outstanding visa cases first');
      }
      update('bookings',b.id,{status:data.status,...(data.status==='Cancelled'?{cancel_reason:data.reason}:{})});
      if (data.status==='Confirmed') steps(b.id,b.departure);
      if (['Cancelled','Completed'].includes(data.status)) closeTasks(b.id);
      const q=find('quotes',b.quote_id);
      record(data.status==='Completed'?'Booking completed':data.status==='Supplier Confirmation Pending'?data.status:'Booking status updated',
        `${b.status} → ${data.status}${data.reason?' · '+data.reason:''}`,{booking_id:b.id,lead_id:q.lead_id},user);
      const feedback=template('feedback');
      if (data.status==='Completed'&&feedback) {
        const c=one('SELECT id FROM conversations WHERE lead_id=? ORDER BY created DESC LIMIT 1',q.lead_id);
        if (c) message(c.id,'Outbound',feedback,undefined,true);
        record('Feedback requested','Trip feedback is available in the customer portal',{booking_id:b.id,lead_id:q.lead_id},user);
      }
      return {id:b.id};
    }
    case 'finance.payment': {
      allow(user,'finance','customer');
      const data=z.object({id:key,amount:amount.refine(n=>n>0,'Enter an amount greater than zero'),
        method:z.enum(['UPI','Card','Bank transfer','Cash']),status:z.enum(['Paid','Pending','Failed'])}).parse(input);
      const b=bookingAccess(user,data.id);
      check(b.status!=='Cancelled','Cancelled bookings cannot receive payments');
      const before=bookingPaid(b.id);
      check(data.amount<=balance(b.total,before,b.status),'Payment exceeds the outstanding balance');
      const payment=id('PAY');
      insert('payments',{id:payment,booking_id:b.id,amount:data.amount,method:data.method,status:data.status,actor:user.id});
      record('Simulated payment '+data.status.toLowerCase(),`${payment} · ${data.method}`,{booking_id:b.id},user);
      if (data.status==='Paid') advanceReached(b,user);
      return {id:payment};
    }
    case 'finance.resolve': {
      allow(user,'finance');
      const data=z.object({id:key,status:z.enum(['Paid','Failed'])}).parse(input);
      const payment=find('payments',data.id);
      const b=bookingAccess(user,payment.booking_id);
      check(payment.status==='Pending','Only pending payments can be resolved');
      if (data.status==='Paid') check(payment.amount<=balance(b.total,bookingPaid(b.id),b.status),'Payment exceeds the outstanding balance');
      update('payments',payment.id,{status:data.status});
      record('Simulated payment resolved',`${payment.id} → ${data.status}`,{booking_id:b.id},user);
      if (data.status==='Paid') advanceReached(b,user);
      return {id:payment.id};
    }
    case 'finance.refund': {
      allow(user,'finance');
      const data=z.object({id:key,amount:amount.refine(n=>n>0),reason:text}).parse(input);
      const payment=find('payments',data.id);
      check(payment.status==='Paid','Only a successful payment can be refunded');
      const refunded=one('SELECT COALESCE(SUM(amount),0) amount FROM payments WHERE parent=?',data.id)?.amount;
      check(data.amount<=payment.amount-refunded,'Refund exceeds the remaining payment amount');
      const refund=id('RF');
      insert('payments',{id:refund,booking_id:payment.booking_id,amount:data.amount,method:payment.method,status:'Refunded',parent:payment.id,actor:user.id});
      const b=bookingAccess(user,payment.booking_id);
      if (['Advance Recorded','Supplier Confirmation Pending'].includes(b.status)&&bookingPaid(b.id)<b.advance) update('bookings',b.id,{status:'Pending Advance'});
      record('Simulated refund',data.reason,{booking_id:payment.booking_id},user);
      return {id:refund};
    }
    case 'finance.invoice': {
      allow(user,'finance','manager');
      const data=z.object({id:key}).parse(input);
      const b=bookingAccess(user,data.id);
      check(confirmed.includes(b.status),'Issue an invoice after booking confirmation');
      const existing=one('SELECT id FROM invoices WHERE booking_id=?',b.id);
      if (existing) return {id:existing.id};
      const invoice=id('INV');
      insert('invoices',{id:invoice,booking_id:b.id});
      record('Demo invoice issued',invoice,{booking_id:b.id},user);
      return {id:invoice};
    }
    case 'supplier.save': {
      allow(user,'ops');
      const {id:existing,active,...fields}=z.object({id:key.optional(),name:text,category:text,destination:text,contact:str,email:str,
        phone:str,terms:notes,notes,rate:amount,active:z.boolean().default(true)}).parse(input);
      const supplier=existing||id('SP');
      if (existing) {find('suppliers',existing);update('suppliers',existing,{...fields,active:Number(active)});}
      else insert('suppliers',{id:supplier,...fields,active:Number(active)});
      record('Supplier saved',fields.name,{},user);
      return {id:supplier};
    }
    case 'supplier.request': {
      allow(user,'ops');
      const data=z.object({booking_id:key,supplier_id:key,service:text,cost:amount.refine(n=>n>0),due:date}).parse(input);
      const b=bookingAccess(user,data.booking_id);
      check(!['Cancelled','Completed'].includes(b.status),'This booking is locked');
      check(find('suppliers',data.supplier_id).active,'Supplier is archived');
      const job=id('SVC');
      insert('supplier_jobs',{id:job,...data});
      record('Supplier service requested',`${data.service} · simulated/manual coordination`,{booking_id:b.id},user);
      return {id:job};
    }
    case 'supplier.status': {
      allow(user,'ops');
      const data=z.object({id:key,status:z.enum(['Confirmed','Cancelled']),reference:str}).parse(input);
      const job=find('supplier_jobs',data.id);
      const b=bookingAccess(user,job.booking_id);
      check(job.status==='Requested'&&b.status!=='Completed','Only open supplier requests can change');
      if (data.status==='Confirmed') check(data.reference&&b.status!=='Cancelled','Enter a demo confirmation reference on an active booking');
      if (data.status==='Cancelled') check(!one('SELECT id FROM settlements WHERE job_id=?',job.id),'Settled supplier service cannot be cancelled');
      update('supplier_jobs',job.id,{status:data.status,reference:data.reference});
      record('Supplier request '+data.status.toLowerCase(),`${job.service} · ${data.reference||'closed'}`,{booking_id:job.booking_id},user);
      return {id:job.id};
    }
    case 'supplier.settle': {
      allow(user,'finance');
      const data=z.object({id:key,amount:amount.refine(n=>n>0)}).parse(input);
      const job=find('supplier_jobs',data.id);
      const settled=one('SELECT COALESCE(SUM(amount),0) amount FROM settlements WHERE job_id=?',job.id)?.amount;
      check(job.status==='Confirmed'&&data.amount<=job.cost-settled,'Settlement must be within the confirmed supplier balance');
      const settlement=id('STL');
      insert('settlements',{id:settlement,job_id:job.id,amount:data.amount,actor:user.id});
      record('Supplier settlement recorded','Internal simulation entry',{booking_id:job.booking_id},user);
      return {id:settlement};
    }
  }
}
