import { readBatch, type Row } from './db.ts';
import { canManageStaff, type User } from '../domains/shared.ts';

function omit({ ...row }:Row, fields:string[]) {
  for (const field of fields) delete row[field];
  return row;
}

export async function dataset(user:User) {
  const customer=user.role==='customer', finance=user.role==='finance', ops=user.role==='ops', sales=user.role==='sales';
  const staffRetail=!customer&&!finance&&!ops;
  const customerScope='SELECT customer_id FROM customer_sales_assignments WHERE salesperson_id=(SELECT uid FROM ctx)';
  const leadWhere=sales?` AND owner=(SELECT uid FROM ctx) AND customer_id IN (${customerScope})`:customer?" AND customer_id=(SELECT cid FROM ctx)":"";
  const leadSet=`SELECT id FROM leads WHERE merged_into IS NULL${leadWhere}`;
  const salesQuoteScope=`lead_id IN (${leadSet}) AND customer_id IN (${customerScope})`;
  const bookingWhere=customer?' WHERE customer_id=(SELECT cid FROM ctx)':sales?` WHERE customer_id IN (${customerScope}) AND quote_id IN (SELECT id FROM quotes WHERE ${salesQuoteScope})`:'';
  const bookingSet=`SELECT id FROM bookings${bookingWhere}`;
  const customerWhere=customer?' WHERE id=(SELECT cid FROM ctx)':sales
    ?` WHERE id IN (${customerScope})`
    :ops||finance?` WHERE id IN (SELECT customer_id FROM bookings WHERE id IN (${bookingSet}))`:'';
  const conversationWhere=customer?' WHERE customer_id=(SELECT cid FROM ctx)':sales?` WHERE ((lead_id IS NULL AND owner=(SELECT uid FROM ctx)) OR lead_id IN (${leadSet}))
      AND (customer_id IS NULL OR customer_id IN (${customerScope}))`:'';
  const conversationSet=`SELECT id FROM conversations${conversationWhere}`;
  const docsWhere=customer?' WHERE customer_id=(SELECT cid FROM ctx)':sales
    ?` WHERE booking_id IS NULL AND traveller_id IS NULL AND customer_id IN (${customerScope}) AND (lead_id IS NULL OR lead_id IN (${leadSet}))`
    :finance?" WHERE kind IN ('Invoice','Payment receipt')":'';
  const bookingChild=` WHERE booking_id IN (${bookingSet})`;
  const taskFilter=sales?` WHERE lead_id IN (${leadSet})`:ops?' WHERE booking_id IS NOT NULL':'';
  const quoteIds=sales?` WHERE quote_id IN (SELECT id FROM quotes WHERE ${salesQuoteScope})`:'';
  const select=(table:string,clause='',sort='')=>`SELECT * FROM ${table}${clause} ${sort}`;
  const sql={
    customers:['admin','manager'].includes(user.role)
      ?'SELECT c.*,a.salesperson_id AS sales_owner FROM customers c LEFT JOIN customer_sales_assignments a ON a.customer_id=c.id ORDER BY c.name'
      :select('customers',customerWhere,'ORDER BY name'),
    leads:(staffRetail||customer)&&select('leads',' WHERE merged_into IS NULL'+leadWhere,'ORDER BY touched DESC,rowid DESC'),
    packages:!customer&&!finance&&select('packages','','ORDER BY rowid'),
    package_days:!customer&&!finance&&select('package_days','','ORDER BY position'),
    package_suppliers:!customer&&!finance&&!sales&&select('package_suppliers'),
    quotes:!ops&&select('quotes',customer
      ?" WHERE customer_id=(SELECT cid FROM ctx) AND status IN ('Sent','Viewed','Accepted','Rejected','Expired')"
      :sales?` WHERE ${salesQuoteScope}`:'','ORDER BY created DESC,rowid DESC'),
    revisions:!customer&&!ops&&!finance&&select('quote_revisions',quoteIds,'ORDER BY version DESC'),
    conversations:(staffRetail||customer)&&select('conversations',conversationWhere,'ORDER BY created DESC,rowid DESC'),
    messages:(staffRetail||customer)&&`SELECT * FROM messages WHERE conversation_id IN (${conversationSet})
      ${customer?"AND direction<>'Internal'":""} ORDER BY rowid`,
    submissions:staffRetail&&select('submissions',` WHERE lead_id IN (${leadSet})`,'ORDER BY rowid DESC'),
    bookings:`SELECT b.*, COALESCE((SELECT SUM(CASE status WHEN 'Paid' THEN amount WHEN 'Refunded' THEN -amount ELSE 0 END)
      FROM payments p WHERE p.booking_id=b.id),0) paid,
      (SELECT SUM(cost) FROM supplier_jobs j WHERE j.booking_id=b.id AND j.status<>'Cancelled') assigned_cost
      FROM bookings b WHERE b.id IN (${bookingSet}) ORDER BY b.created DESC,b.rowid DESC`,
    suppliers:!customer&&!sales&&select('suppliers','','ORDER BY name'),
    supplier_jobs:!customer&&!sales&&`SELECT j.*,COALESCE((SELECT SUM(amount) FROM settlements s WHERE s.job_id=j.id),0) settled
      FROM supplier_jobs j ORDER BY j.due`,
    settlements:(finance||user.role==='admin')&&select('settlements','','ORDER BY rowid DESC'),
    payments:select('payments',bookingChild,'ORDER BY created DESC,rowid DESC'),
    invoices:select('invoices',bookingChild,'ORDER BY rowid DESC'),
    adjustments:select('booking_adjustments',bookingChild,'ORDER BY rowid DESC'),
    tasks:!customer&&!finance&&select('tasks',taskFilter,'ORDER BY due,rowid'),
    documents:select('documents',docsWhere,'ORDER BY rowid DESC'),
    visas:!finance&&!sales&&select('visas',bookingChild,'ORDER BY due'),
    travellers:!finance&&!sales&&`SELECT * FROM travellers ${customer?'WHERE customer_id=(SELECT cid FROM ctx)':ops?'WHERE customer_id IN (SELECT customer_id FROM bookings)':''} ORDER BY name`,
    booking_travellers:!finance&&!sales&&select('booking_travellers',bookingChild),
    feedback:select('feedback',bookingChild,'ORDER BY rowid DESC'),
    events:!customer&&select('events',sales?` WHERE lead_id IN (${leadSet}) OR conversation_id IN (${conversationSet}) OR booking_id IN (${bookingSet})`
      :ops||finance?' WHERE booking_id IS NOT NULL':user.sign_in==='quick'?" WHERE kind<>'Staff account saved'":'','ORDER BY rowid DESC'),
    team:!customer&&(canManageStaff(user)?"SELECT id,name,role,active,email FROM users WHERE role<>'customer' ORDER BY name"
      :"SELECT id,name,role,active FROM users WHERE role<>'customer' ORDER BY name"),
    notifications:select('notifications',' WHERE user_id=(SELECT uid FROM ctx)','ORDER BY rowid DESC LIMIT 80'),
    workflows:canManageStaff(user)&&select('workflows','','ORDER BY label'),
  };
  const entries=Object.entries(sql) as [keyof typeof sql,string|false][];
  const selected=entries.filter((entry):entry is [keyof typeof sql,string]=>entry[1]!==false);
  const results=await readBatch(selected.map(([,query])=>({
    sql:'WITH ctx(uid,cid) AS (VALUES (?,?)) '+query,params:[user.id,user.customer_id],
  })));
  const data=Object.fromEntries(entries.map(([key])=>[key,[] as Row[]])) as Record<keyof typeof sql,Row[]>;
  selected.forEach(([key],index)=>{data[key]=results[index];});
  data.documents=data.documents.map(row=>omit(row,['file_key']));
  if (customer) {
    data.customers=data.customers.map(row=>omit(row,['notes']));
    data.leads=data.leads.map(row=>omit(row,['owner','priority','follow_up']));
    data.quotes=data.quotes.map(row=>omit(row,['internal','cost','markup','discount']));
    data.conversations=data.conversations.map(row=>omit(row,['state','owner']));
    data.messages=data.messages.map(row=>omit(row,['actor']));
    data.bookings=data.bookings.map(row=>omit(row,['cost','assigned_cost','notes','cancel_reason']));
    data.payments=data.payments.map(row=>omit(row,['actor']));
    data.adjustments=data.adjustments.map(row=>omit(row,['actor','reason']));
    data.visas=data.visas.map(row=>omit(row,['notes']));
    data.travellers=data.travellers.map(row=>omit(row,['document_ref','emergency']));
  }
  return {user,...data};
}
