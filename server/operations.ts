import { z } from 'zod';
import { deleteObject, putFile } from './platform.ts';
import { confirmed, docKinds, visaStatuses, roles, type User } from '../domains/shared.ts';
import { allow, check, demo, DomainError, passwordHash, portalLinkDigest, sameCustomer, token } from './auth.ts';
import { id, insert, one, rows, run, update, day, transaction, ConcurrentWrite } from './db.ts';
import { assignee, record, task } from './events.ts';
import { find, requireCustomerScope, salesLead } from './crm.ts';
import { bookingAccess } from './commercial.ts';
import { date, key, notes, optionalKey, str, text } from './input.ts';

export async function documentAccess(user:User,id:string) {
  allow(user,'manager','sales','ops','finance','customer');
  const d=await find('documents',id);
  sameCustomer(user,d.customer_id);
  if (user.role==='finance') check(['Invoice','Payment receipt'].includes(d.kind),'Document not found',404);
  if (user.role==='sales') {
    await requireCustomerScope(user,d.customer_id,'Document not found');
    check(!d.booking_id&&!d.traveller_id,'Document not found',404);
    if (d.lead_id) await salesLead(user,d.lead_id);
  }
  return d;
}
export async function authorizePortalLink(user:User,input:unknown) {
  allow(user,'manager','sales');
  check(demo,'Demo portal links are disabled',403);
  const data=z.object({id:key}).parse(input);
  await requireCustomerScope(user,data.id);
  return await find('customers',data.id);
}
export async function upload(loadUser:()=>Promise<User>,form:FormData) {
  const data=z.object({id:optionalKey,booking_id:optionalKey,lead_id:optionalKey,traveller_id:optionalKey,kind:z.enum(docKinds)}).parse(Object.fromEntries(form));
  const file=form.get('file');
  check(file instanceof File&&file.size>0&&file.size<=5*1024*1024,'Upload a PDF, JPEG or PNG up to 5 MB');
  const bytes=await file.arrayBuffer();
  const buffer=Buffer.from(bytes);
  const mime=buffer.subarray(0,5).toString()==='%PDF-'?'application/pdf'
    :buffer.subarray(0,3).equals(Buffer.from([255,216,255]))?'image/jpeg'
    :buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':null;
  check(mime&&file.type===mime,'The file must be a valid PDF, JPEG or PNG');
  const extension=mime==='application/pdf'?'pdf':mime==='image/png'?'png':'jpg';
  const fileKey=id('FILE')+'.'+extension;
  const newDocument=id('DOC');
  let written=false;
  try {
    const result=await transaction(async ()=>{
      const user=await loadUser();
      allow(user,'manager','sales','ops','customer');
      const existing=data.id?await documentAccess(user,data.id):null;
      const bookingId=existing?.booking_id||data.booking_id||null;
      const leadId=existing?.lead_id||data.lead_id||null;
      const travellerId=existing?.traveller_id||data.traveller_id||null;
      check(!(bookingId&&leadId),'Select either a lead or a booking');
      if (leadId) await salesLead(user,leadId);
      if (bookingId) check(user.role!=='sales','Booking documents require operations access',403);
      const b=bookingId?await bookingAccess(user,bookingId):null;
      const l=leadId?await find('leads',leadId):null;
      const customer=b?.customer_id||l?.customer_id||user.customer_id;
      check(customer,'Select a booking or lead');
      if (existing) check(existing.customer_id===customer && !['Verified','Waived'].includes(existing.status),'Document is locked or assigned to another customer');
      if (travellerId) check((await find('travellers',travellerId)).customer_id===customer,'Traveller does not belong to this customer');
      check(user.role!=='customer'||!['Invoice','Payment receipt','Hotel voucher','Final travel itinerary'].includes(existing?.kind||data.kind),'This document type is issued by staff');
      const name=file.name.replace(/[^\p{L}\p{N} ._-]/gu,'_').slice(0,120) || 'travel-document.'+extension;
      const metadata={name,mime,file_key:fileKey,size:buffer.length,status:'Submitted'};
      if (!written) {
        await putFile(fileKey,bytes,mime);
        written=true;
      }
      const document=existing?.id||newDocument;
      if (existing) update('documents',existing.id,metadata);
      else insert('documents',{id:document,customer_id:customer,booking_id:bookingId,lead_id:leadId,traveller_id:travellerId,kind:data.kind,...metadata});
      await record('Document uploaded',`${existing?.kind||data.kind} submitted for review`,{booking_id:bookingId,lead_id:leadId},user);
      return {id:document,previous:existing?.file_key as string | undefined};
    });
    if (result.previous && /^FILE-[A-F0-9]+\.(pdf|jpg|png)$/.test(result.previous)) {
      await deleteObject(result.previous).catch(() => console.warn('Replaced document could not be removed from storage'));
    }
    return {id:result.id};
  } catch (error) {
    // A transport failure can leave the commit result unknown. Keep the
    // object in that case so any committed metadata still has its file.
    if (written && (error instanceof DomainError || error instanceof ConcurrentWrite)) {
      await deleteObject(fileKey).catch(() => console.warn('Uncommitted document could not be removed from storage'));
    }
    throw error;
  }
}
export async function operationsActions(action:string,input:unknown,user:User) {
  switch(action) {
    case 'task.save': {
      allow(user,'manager','sales','ops');
      const data=z.object({title:text,id:key.optional(),lead_id:optionalKey,booking_id:optionalKey,owner:optionalKey,due:date,
        priority:z.enum(['Low','Normal','High','Urgent']),status:z.enum(['Open','In progress','Done']).default('Open')}).parse(input);
      const existing=data.id?await find('tasks',data.id):null;
      const booking=existing?.booking_id||data.booking_id||null;
      const lead=existing?.lead_id||data.lead_id||null;
      check(Boolean(booking)!==Boolean(lead),'Select a lead or booking');
      if (lead) await salesLead(user,lead);
      if (booking) {allow(user,'manager','ops');await bookingAccess(user,booking);}
      const owner=data.owner||user.id;
      check(await one("SELECT id FROM users WHERE id=? AND active=1 AND role<>'customer'",owner),'Select an active staff owner');
      check(user.role!=='sales'||owner===user.id,'Sales executives can assign their own follow-up tasks');
      const params={title:data.title,owner,due:data.due,priority:data.priority,status:data.status};
      const taskId=existing?.id||id('TSK');
      if (existing) update('tasks',taskId,params);
      else insert('tasks',{id:taskId,...params,booking_id:booking,lead_id:lead});
      await record(data.status==='Done'?'Task completed':'Task saved',data.title,{booking_id:booking,lead_id:lead},user);
      return {id:taskId};
    }
    case 'task.status': {
      allow(user,'manager','sales','ops');
      const data=z.object({id:key,status:z.enum(['Open','In progress','Done'])}).parse(input);
      const t=await find('tasks',data.id);
      if (t.lead_id) await salesLead(user,t.lead_id);
      if (t.booking_id) allow(user,'manager','ops');
      update('tasks',t.id,{status:data.status});
      await record(data.status==='Done'?'Task completed':'Task status updated',`${t.title} · ${data.status}`,{booking_id:t.booking_id,lead_id:t.lead_id},user);
      return {id:t.id};
    }
    case 'document.require': {
      allow(user,'ops');
      const data=z.object({booking_id:key,kind:z.enum(docKinds),due:date,traveller_id:optionalKey}).parse(input);
      const b=await bookingAccess(user,data.booking_id);
      if (data.traveller_id) check((await find('travellers',data.traveller_id)).customer_id===b.customer_id,'Traveller does not belong to this booking');
      const document=id('DOC');
      insert('documents',{id:document,customer_id:b.customer_id,booking_id:b.id,traveller_id:data.traveller_id||null,kind:data.kind,name:data.kind,due:data.due});
      await record('Document requested',data.kind,{booking_id:b.id},user);
      return {id:document};
    }
    case 'document.status': {
      allow(user,'ops');
      const data=z.object({id:key,status:z.enum(['Verified','Waived','Missing','Rejected'])}).parse(input);
      const d=await documentAccess(user,data.id);
      check(data.status!=='Verified'||d.mime,'Upload a file before verifying');
      update('documents',d.id,{status:data.status});
      await record('Document '+data.status.toLowerCase(),d.kind,{booking_id:d.booking_id,lead_id:d.lead_id},user);
      return {id:d.id};
    }
    case 'visa.save': {
      allow(user,'ops');
      const {id:existing,traveller_id,...fields}=z.object({id:key.optional(),booking_id:key,traveller_id:optionalKey,
        status:z.enum(visaStatuses),due:date,notes}).parse(input);
      const b=await bookingAccess(user,fields.booking_id);
      if (traveller_id) check(await one('SELECT 1 FROM booking_travellers WHERE booking_id=? AND traveller_id=?',b.id,traveller_id),'Traveller is not on this booking');
      const visa=existing||id('VISA');
      const info={...fields,traveller_id:traveller_id||null};
      if (existing) {
        check((await find('visas',existing)).booking_id===b.id,'Visa case is linked to a different booking');
        update('visas',existing,info);
      } else insert('visas',{id:visa,...info});
      await record('Visa status recorded',fields.status+' · manual demo status',{booking_id:b.id},user);
      return {id:visa};
    }
    case 'traveller.save': {
      allow(user,'manager','ops');
      const {id:existing,booking_id,...fields}=z.object({id:key.optional(),customer_id:key,booking_id:optionalKey,name:text,nationality:str,
        birthday:z.union([date,z.literal('')]).default(''),document_ref:str,emergency:str,assistance:notes}).parse(input);
      if (user.role==='ops') check(await one('SELECT id FROM bookings WHERE customer_id=?',fields.customer_id),'Customer not found',404);
      await find('customers',fields.customer_id);
      const traveller=existing||id('TR');
      if (existing) {
        check((await find('travellers',existing)).customer_id===fields.customer_id,'Traveller belongs to a different customer');
        update('travellers',existing,fields);
      } else insert('travellers',{id:traveller,...fields});
      if (booking_id) {
        check((await bookingAccess(user,booking_id)).customer_id===fields.customer_id,'Booking belongs to a different customer');
        run('INSERT OR IGNORE INTO booking_travellers VALUES (?,?)',booking_id,traveller);
      }
      await record('Traveller saved',fields.name,{booking_id:booking_id||null},user);
      return {id:traveller};
    }
    case 'booking.feedback': {
      allow(user,'customer','ops','manager');
      const data=z.object({id:key,rating:z.coerce.number().int().min(1).max(5),notes}).parse(input);
      const b=await bookingAccess(user,data.id);
      check(b.status==='Completed','Feedback is available after the trip is completed');
      check(!await one('SELECT id FROM feedback WHERE booking_id=?',b.id),'Feedback already submitted',409);
      const feedback=id('FB');
      insert('feedback',{id:feedback,booking_id:b.id,rating:data.rating,notes:data.notes});
      await record('Trip feedback recorded',`${data.rating} out of 5`,{booking_id:b.id},user);
      return {id:feedback};
    }
    case 'portal.link': {
      const customer=await authorizePortalLink(user,input);
      let account=await one('SELECT id,active FROM users WHERE customer_id=?',customer.id);
      if (!account) {
        const uid=id('USER');
        insert('users',{id:uid,name:customer.name,email:uid.toLowerCase()+'@customer.example.test',hash:passwordHash(token()),role:'customer',customer_id:customer.id});
        account={id:uid,active:1};
      }
      check(account.active,'Portal access has been disabled');
      const raw=token();
      const expires=new Date(Date.now()+10*60_000).toISOString().slice(0,19).replace('T',' ');
      insert('portal_links',{token:portalLinkDigest(raw,user.sign_in==='quick'),user_id:account.id,expires});
      await record('Demo portal link issued',`One-time link issued for ${customer.id}`,{},user);
      return {token:raw};
    }
    case 'notification.read': {
      const data=z.object({id:key}).parse(input);
      run('UPDATE notifications SET read=1 WHERE id=? AND user_id=?',data.id,user.id);
      return {id:data.id};
    }
    case 'staff.save': {
      allow(user);
      const data=z.object({id:key.optional(),name:text,email:z.email(),role:z.enum(['admin','manager','sales','ops','finance']),
        password:z.string().max(200).default(''),active:z.boolean().default(true)}).parse(input);
      check(data.id!==user.id||(data.role==='admin'&&data.active),'Keep your own administrator role active');
      if (data.id) check((await find('users',data.id)).role!=='customer','Use a staff account');
      check((data.id&&!data.password)||data.password.length>=10,'Use a password of at least 10 characters');
      const fields={name:data.name,email:data.email.toLowerCase(),role:data.role,active:Number(data.active),...(data.password?{hash:passwordHash(data.password)}:{})};
      const userId=data.id||id('USER');
      if (data.id) {
        update('users',data.id,fields);
        if (data.password||!data.active) run('DELETE FROM sessions WHERE user_id=?',data.id);
      } else insert('users',{id:userId,...fields});
      await record('Staff account saved',data.email,{},user);
      return {id:userId};
    }
    case 'workflow.save': {
      allow(user);
      const data=z.object({id:key,template:notes,enabled:z.boolean()}).parse(input);
      await find('workflows',data.id);
      update('workflows',data.id,{template:data.template,enabled:Number(data.enabled)});
      await record('Automation settings changed',data.id,{},user);
      return {id:data.id};
    }
  }
}
