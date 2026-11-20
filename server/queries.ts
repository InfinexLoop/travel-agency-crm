import { rows, type Row } from './db.ts';
import type { User } from '../domains/shared.ts';

function omit({ ...row }:Row, fields:string[]) {
  for (const field of fields) delete row[field];
  return row;
}
export function dataset(user:User) {
  const customer=user.role==='customer', finance=user.role==='finance', ops=user.role==='ops', sales=user.role==='sales';
  const staffRetail=!customer&&!finance&&!ops;
  const leadWhere=sales?" AND owner=(SELECT uid FROM ctx)":customer?" AND customer_id=(SELECT cid FROM ctx)":"";
  const leadSet=`SELECT id FROM leads WHERE merged_into IS NULL${leadWhere}`;
  const bookingWhere=customer?' WHERE customer_id=(SELECT cid FROM ctx)':sales?` WHERE quote_id IN (SELECT id FROM quotes WHERE lead_id IN (${leadSet}))`:'';
  const bookingSet=`SELECT id FROM bookings${bookingWhere}`;
  const customerWhere=customer?' WHERE id=(SELECT cid FROM ctx)':sales
    ?` WHERE id IN (SELECT customer_id FROM leads WHERE id IN (${leadSet}))`
    :ops||finance?` WHERE id IN (SELECT customer_id FROM bookings WHERE id IN (${bookingSet}))`:'';
  const conversationWhere=customer?' WHERE customer_id=(SELECT cid FROM ctx)':sales?` WHERE owner=(SELECT uid FROM ctx) OR lead_id IN (${leadSet})`:'';
  const conversationSet=`SELECT id FROM conversations${conversationWhere}`;
  const query=(sql:string) => rows('WITH ctx(uid,cid) AS (VALUES (?,?)) '+sql,user.id,user.customer_id);
  const m=(table:string,clause='',sort='') => query(`SELECT * FROM ${table}${clause} ${sort}`);
  const leads=staffRetail||customer ? m('leads',' WHERE merged_into IS NULL'+leadWhere,'ORDER BY touched DESC,rowid DESC') : [];
  const customers=m('customers',customerWhere,'ORDER BY name');
  const bookings=query(`SELECT b.*, COALESCE((SELECT SUM(CASE status WHEN 'Paid' THEN amount WHEN 'Refunded' THEN -amount ELSE 0 END)
    FROM payments p WHERE p.booking_id=b.id),0) paid,
    (SELECT SUM(cost) FROM supplier_jobs j WHERE j.booking_id=b.id AND j.status<>'Cancelled') assigned_cost
    FROM bookings b WHERE b.id IN (${bookingSet}) ORDER BY b.created DESC,b.rowid DESC`);
  const quotes=ops ? [] : m('quotes',customer
    ?" WHERE customer_id=(SELECT cid FROM ctx) AND status IN ('Sent','Viewed','Accepted','Rejected','Expired')"
    :sales?` WHERE lead_id IN (${leadSet})`:'','ORDER BY created DESC,rowid DESC');
  const conversations=staffRetail||customer ? m('conversations',conversationWhere,'ORDER BY created DESC,rowid DESC') : [];
  const messages=staffRetail||customer ? query(`SELECT * FROM messages WHERE conversation_id IN (${conversationSet})
    ${customer?"AND direction<>'Internal'":""} ORDER BY rowid`) : [];
  const docsWhere=customer?' WHERE customer_id=(SELECT cid FROM ctx)':sales
    ?` WHERE booking_id IS NULL AND traveller_id IS NULL AND customer_id IN (SELECT customer_id FROM leads WHERE id IN (${leadSet}))`
    :finance?" WHERE kind IN ('Invoice','Payment receipt')":'';
  const bookingChild=` WHERE booking_id IN (${bookingSet})`;
  const taskFilter=sales?` WHERE lead_id IN (${leadSet})`:ops?' WHERE booking_id IS NOT NULL':'';
  const events=customer?[]:m('events',sales? ` WHERE lead_id IN (${leadSet}) OR conversation_id IN (${conversationSet}) OR booking_id IN (${bookingSet})`
    :ops||finance?' WHERE booking_id IS NOT NULL':'','ORDER BY rowid DESC');
  const jobs=customer||sales?[]:query(`SELECT j.*,COALESCE((SELECT SUM(amount) FROM settlements s WHERE s.job_id=j.id),0) settled
    FROM supplier_jobs j ORDER BY j.due`);
  const quoteIds = sales?` WHERE quote_id IN (SELECT id FROM quotes WHERE lead_id IN (${leadSet}))`:'';
  const roleSensitiveMoney=['cost','assigned_cost'];
  return {
    user,
    customers:customer?customers.map(r=>omit(r,['notes'])):customers,
    leads:customer?leads.map(r=>omit(r,['owner','priority','follow_up'])):leads,
    packages:customer||finance?[]:m('packages','','ORDER BY rowid'),
    package_days:customer||finance?[]:m('package_days','','ORDER BY position'),
    package_suppliers:customer||finance||sales?[]:m('package_suppliers'),
    quotes:customer?quotes.map(r=>omit(r,['internal','cost','markup','discount'])):quotes,
    revisions:customer||ops||finance?[]:m('quote_revisions',quoteIds,'ORDER BY version DESC'),
    conversations:customer?conversations.map(r=>omit(r,['state','owner'])):conversations,
    messages:customer?messages.map(r=>omit(r,['actor'])):messages,
    submissions:staffRetail?m('submissions',` WHERE lead_id IN (${leadSet})`,'ORDER BY rowid DESC'):[],
    bookings:customer?bookings.map(r=>omit(r,[...roleSensitiveMoney,'notes','cancel_reason'])):bookings,
    suppliers:customer||sales?[]:m('suppliers','','ORDER BY name'),
    supplier_jobs:jobs,
    settlements:finance||user.role==='admin'?m('settlements','','ORDER BY rowid DESC'):[],
    payments:m('payments',bookingChild,'ORDER BY created DESC,rowid DESC').map(r=>customer?omit(r,['actor']):r),
    invoices:m('invoices',bookingChild,'ORDER BY rowid DESC'),
    adjustments:m('booking_adjustments',bookingChild,'ORDER BY rowid DESC').map(r=>customer?omit(r,['actor','reason']):r),
    tasks:customer||finance?[]:m('tasks',taskFilter,'ORDER BY due,rowid'),
    documents:m('documents',docsWhere,'ORDER BY rowid DESC').map(r=>omit(r,['file_key'])),
    visas:finance||sales?[]:m('visas',bookingChild,'ORDER BY due').map(r=>customer?omit(r,['notes']):r),
    travellers:finance||sales?[]:query(`SELECT * FROM travellers ${customer?'WHERE customer_id=(SELECT cid FROM ctx)':ops?'WHERE customer_id IN (SELECT customer_id FROM bookings)':''} ORDER BY name`)
      .map(r=>customer?omit(r,['document_ref','emergency']):r),
    booking_travellers:finance||sales?[]:m('booking_travellers',bookingChild),
    feedback:m('feedback',bookingChild,'ORDER BY rowid DESC'),
    events,
    team:customer?[]:user.role==='admin'?query("SELECT id,name,role,active,email FROM users WHERE role<>'customer' ORDER BY name")
      :query("SELECT id,name,role,active FROM users WHERE role<>'customer' ORDER BY name"),
    notifications:m('notifications',' WHERE user_id=(SELECT uid FROM ctx)','ORDER BY rowid DESC LIMIT 80'),
    workflows:user.role==='admin'?m('workflows','','ORDER BY label'):[],
  };
}
