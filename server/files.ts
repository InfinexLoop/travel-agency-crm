import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { balance, confirmed, titleDate, type User } from '../domains/shared.ts';
import { allow, check } from './auth.ts';
import { bookingAccess, bookingPaid, quoteAccess } from './commercial.ts';
import { documentAccess } from './operations.ts';
import { find } from './crm.ts';
import { uploadsDir } from './db.ts';

const inr = (amount:number) => 'INR '+(amount/100).toLocaleString('en-IN',{minimumFractionDigits:2});
const ascii=(text:string)=>text.replace(/[–—]/g,'-').replace(/₹/g,'INR ').replace(/[’‘]/g,"'").replace(/[“”]/g,'"').replace(/[^\x20-\x7e\n]/g,'?');
function itinerary(raw:string) {
  return (JSON.parse(raw) as {title:string;description:string}[]).flatMap((part,i)=>[`Day ${i+1} | ${part.title}`,part.description,'']);
}
async function pdf(title:string, ref:string, content:string[]) {
  const doc=await PDFDocument.create();
  doc.setTitle(title+' '+ref);doc.setAuthor('Zuri Holidays | Infinex Loop demo');
  const regular=await doc.embedFont(StandardFonts.Helvetica);
  const bold=await doc.embedFont(StandardFonts.HelveticaBold);
  const navy=rgb(.047,.105,.18), teal=rgb(.04,.42,.40);
  let page=doc.addPage([595,842]), y=0;
  function header(first=false) {
    page.drawRectangle({x:0,y:734,width:595,height:108,color:navy});
    page.drawText('ZURI HOLIDAYS', {x:42,y:806,size:13,font:bold,color:rgb(.50,.86,.81)});
    page.drawText(first?title:title+' (continued)', {x:42,y:765,size:24,font:bold,color:rgb(1,1,1)});
    page.drawText(ref, {x:42,y:709,size:11,font:bold,color:teal});
    page.drawText('DEMO DOCUMENT | Synthetic travel and payment records', {x:42,y:30,size:9,font:bold,color:teal});
    y=675;
  }
  header(true);
  for (const entry of content.flatMap(s=>ascii(s).split('\n'))) {
    const words=entry.trim().match(/.{1,70}(?:\s|$)|.{1,70}/g) || [''];
    let line='';
    for (const chunk of [...words,'']) {
      const next=line?line+' '+chunk.trim():chunk.trim();
      if ((regular.widthOfTextAtSize(next,11)>507||chunk==='')&&line) {
        if (y<62) {page=doc.addPage([595,842]);header();}
        page.drawText(line,{x:42,y,size:11,font:regular,color:navy});
        y-=18;
        line=chunk.trim();
      } else line=next;
    }
    if (!entry.trim()) y-=10;
  }
  return doc.save();
}
export async function file(user:User,kind:string,resource:string) {
  const downloadable=(bytes:Uint8Array,name:string,mime='application/pdf')=>({bytes,name,mime});
  if (kind==='document') {
    const d=documentAccess(user,resource);
    check(d.mime,'No file has been submitted',404);
    if (!d.file_key) return downloadable(await pdf('Sample travel document',d.id,[d.kind,'Synthetic file for workflow demonstration.']),d.id+'.pdf');
    check(/^FILE-[A-F0-9]+\.(pdf|jpg|png)$/.test(d.file_key),'File not found',404);
    return downloadable(readFileSync(resolve(uploadsDir,d.file_key)),d.name,d.mime);
  }
  if (kind==='quote') {
    const q=quoteAccess(user,resource);
    return downloadable(await pdf('Travel quotation',q.id,[
      find('customers',q.customer_id).name,`${q.destination} | ${titleDate(q.departure)} to ${titleDate(q.return_date)}`,
      `${q.adults} adults, ${q.children} children | Revision ${q.revision} | ${q.status}`,'',
      `Trip subtotal: ${inr(q.cost+q.markup)}`,`Optional charges: ${inr(q.extras)}`,`Discount: ${inr(q.discount)}`,
      `Demo tax: ${inr(q.tax)}`,`Total: ${inr(q.total)}`,`Required advance: ${inr(q.advance)}`,
      `Valid through ${titleDate(q.expiry)}`,q.schedule,'',...itinerary(q.itinerary),q.notes,q.terms,
    ]),q.id+'.pdf');
  }
  if (kind==='receipt') {
    const p=find('payments',resource);
    const b=bookingAccess(user,p.booking_id);
    check(['Paid','Refunded'].includes(p.status),'Receipt is unavailable for this status',404);
    return downloadable(await pdf(p.status==='Refunded'?'Refund acknowledgement':'Payment receipt',p.id,[
      find('customers',b.customer_id).name,`Booking ${b.id} | ${b.destination}`,titleDate(p.created),
      `Simulated ${p.method} | ${p.status}`,inr(p.amount),p.parent?`Original payment: ${p.parent}`:'',
      'Internal demonstration record. No funds moved.',
    ]),p.id+'.pdf');
  }
  const b=bookingAccess(user,resource);
  const common=[find('customers',b.customer_id).name,`${b.destination} | ${titleDate(b.departure)} to ${titleDate(b.return_date)}`,`Booking ${b.id} | ${b.status}`,''];
  if (kind==='invoice') {
    const inv=findInvoice(b.id);
    return downloadable(await pdf('Demo invoice',inv.id,[
      ...common,`Issued on ${titleDate(inv.created)}`,`Trip value: ${inr(b.total)}`,
      `Demo tax included in trip value: ${inr(find('quotes',b.quote_id).tax)}`,
      `Recorded customer payments (net): ${inr(bookingPaid(b.id))}`,
      `Outstanding: ${inr(balance(b.total,bookingPaid(b.id),b.status))}`,'Internal demonstration invoice.',
    ]),inv.id+'.pdf');
  }
  check(['voucher','itinerary'].includes(kind),'File not found',404);
  if (kind==='voucher') check(confirmed.includes(b.status),'Voucher is available after booking confirmation',404);
  return downloadable(await pdf(kind==='voucher'?'Travel voucher':'Travel itinerary',b.id,[
    ...common,`Hotel: ${b.hotel||'To be recorded'}`,`Flights: ${b.flight||'To be recorded'}`,`Transfers: ${b.transfer||'To be recorded'}`,'',
    ...itinerary(b.itinerary),
  ]),b.id+'-'+kind+'.pdf');
}

import { one } from './db.ts';
function findInvoice(booking:string) {
  const inv=one('SELECT id,created FROM invoices WHERE booking_id=?',booking);
  check(inv,'Invoice has not been issued',404);
  return inv;
}
