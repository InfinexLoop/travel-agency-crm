import { z } from 'zod';
import { stages, type User } from '../domains/shared.ts';
import { check, allow } from './auth.ts';
import { day, id, insert, now, one, run, update, rows, type Row } from './db.ts';
import { assignee, message, notify, record, task, template } from './events.ts';
import { enquiry, phone, type Enquiry, key, notes, str, contacts, optionalKey } from './input.ts';

export async function find(table:string, id:string) {
  const value=await one(`SELECT * FROM ${table} WHERE id=?`,id);
  check(value,'Record not found',404);
  return value;
}
export async function requireCustomerScope(user:User,customer:string,message='Customer not found') {
  if (user.role==='sales') {
    check(await one('SELECT 1 FROM customer_sales_assignments WHERE customer_id=? AND salesperson_id=?',customer,user.id),message,404);
  }
}
export async function salesLead(user:User, id:string) {
  allow(user,'manager','sales');
  const lead=await find('leads',id);
  check(!lead.merged_into && (user.role!=='sales'||lead.owner===user.id),'Lead not found',404);
  await requireCustomerScope(user,lead.customer_id,'Lead not found');
  return lead;
}
export async function conversationAccess(user:User,id:string) {
  allow(user,'manager','sales','customer');
  const conversation=await find('conversations',id);
  if (user.role==='customer') check(conversation.customer_id===user.customer_id,'Conversation not found',404);
  if (user.role==='sales') {
    if (conversation.customer_id) await requireCustomerScope(user,conversation.customer_id,'Conversation not found');
    if (conversation.lead_id) await salesLead(user,conversation.lead_id);
    else check(conversation.owner===user.id,'Conversation not found',404);
  }
  return conversation;
}
export async function salesperson(key:string) {
  check(await one("SELECT id FROM users WHERE id=? AND active=1 AND role IN ('sales','manager','admin')",key),'Select an active sales user');
  return key;
}
async function identity(input:z.output<typeof contacts>,user:User,ignoredCustomer?:string) {
  const number=phone(input.phone);
  const email=input.email.toLowerCase();
  const handle=input.instagram.toLowerCase().replace(/^@/,'');
  const wa=phone(input.whatsapp);
  check(!input.phone||number,'Enter a valid phone number');
  check(!input.whatsapp||wa,'Enter a valid WhatsApp number');
  const matches=await rows(`SELECT * FROM customers WHERE id IS NOT ? AND ((?<>'' AND phone=?) OR (?<>'' AND email=?) OR (?<>'' AND instagram=?))`,
    ignoredCustomer??null,number,number,email,email,handle,handle);
  for (const match of matches) await requireCustomerScope(user,match.id);
  check(matches.length<2,'Phone, email or Instagram handle belong to different customers. Review their profiles first.',409);
  const existing=matches[0];
  if (existing) {
    const name=existing.phone||existing.email?existing.name:input.name;
    update('customers',existing.id,{name,
      phone:existing.phone||number||null,email:existing.email||email||null,
      instagram:existing.instagram||handle||null,whatsapp:existing.whatsapp||wa||null});
    return {id:existing.id as string,name,preferences:existing.preferences,notes:existing.notes,created:false};
  }
  const customer=id('CUS');
  insert('customers',{id:customer,name:input.name,phone:number||null,email:email||null,instagram:handle||null,whatsapp:wa||null});
  if (user.role==='sales') insert('customer_sales_assignments',{customer_id:customer,salesperson_id:user.id});
  return {id:customer,name:input.name,preferences:'',notes:'',created:true};
}

export async function assignLead(lead:string, owner:string|null, user:User) {
  update('leads',lead,{owner});
  run('UPDATE conversations SET owner=? WHERE lead_id=?',owner,lead);
  run("UPDATE tasks SET owner=? WHERE lead_id=? AND status<>'Done'",owner,lead);
  const event=await record('Lead assigned',owner?`Sales owner assigned to ${lead}`:'Sales owner cleared',{lead_id:lead},user);
  notify(owner,'An enquiry was assigned to you',`/leads/${lead}`,event);
}
export async function scheduleFollowup(lead:string, owner:string|null, due:string, user:User, key?:string) {
  update('leads',lead,{follow_up:due});
  await task({title:'Follow up with traveller',owner,links:{lead_id:lead},due,key});
  await record('Follow-up scheduled',`Sales follow-up set for ${due}`,{lead_id:lead},user,key?'event:'+key:undefined);
}
export async function leadStage(lead:string, stage:string, user:User, priorStage?:string) {
  const previous=priorStage??(await find('leads',lead)).stage;
  if (previous===stage) return;
  update('leads',lead,{stage,touched:now()});
  await record(stage==='Qualified'?'Lead qualified':'Lead stage updated',`${previous} → ${stage}`,{lead_id:lead},user);
}
async function leadDetails(input:Enquiry) {
  if (input.package_id) check(await one('SELECT id FROM packages WHERE id=?',input.package_id),'Package not found');
  return {
    destination:input.destination,package_id:input.package_id||null,city:input.city,dates:input.dates,
    flexible:Number(input.flexible),adults:input.adults,children:input.children,ages:input.ages,budget:input.budget,
    purpose:input.purpose,preferences:input.preferences,priority:input.priority,
  };
}
export async function ingest(input:Enquiry,user:User,existingConversation?:string,qualified=false,
  transfer?:{customer:string;lead:string}) {
  const {id:customer,name,created}=await identity(input,user,transfer?.customer);
  const candidate=await one(`SELECT * FROM leads WHERE (customer_id=? OR id=?) AND lower(destination)=lower(?)
    AND merged_into IS NULL AND stage NOT IN ('Won','Lost','Closed') ${user.role==='sales'?'AND owner=?':''}
    ORDER BY created DESC LIMIT 1`,customer,transfer?.lead??null,input.destination,...(user.role==='sales'?[user.id]:[]));
  const lead=candidate?.id ?? id('LD');
  const owner=candidate?.owner || (user.role==='sales'?user.id:input.owner?await salesperson(input.owner):await assignee('sales'));
  if (created && user.role!=='sales' && owner) {
    run(`INSERT INTO customer_sales_assignments (customer_id,salesperson_id)
      SELECT ?,id FROM users WHERE id=? AND role='sales' AND active=1`,customer,owner);
  }
  const linked=Boolean(candidate);
  const conversation=existingConversation||id('CV');
  if (!linked) {
    insert('leads',{id:lead,customer_id:customer,source:input.source,owner,stage:'New',
      ...(await leadDetails(input)),...(input.call_time?{created:input.call_time}:{}),touched:now()});
  } else {
    update('leads',lead,{touched:now()});
    if (qualified && candidate && ['New','In Conversation'].includes(candidate.stage)) update('leads',lead,await leadDetails(input));
  }
  if (existingConversation) update('conversations',conversation,{lead_id:lead,customer_id:customer,owner});
  else {
    insert('conversations',{id:conversation,channel:input.source,identity:input.instagram||input.phone||input.email||name,lead_id:lead,customer_id:customer,owner,status:'Open'});
    await record('Conversation started',`${input.source} conversation opened`,{lead_id:lead,conversation_id:conversation},user);
    message(conversation,input.source==='Phone Call'?'Internal':'Inbound',input.call_notes||input.preferences||`${name} requested a trip${input.destination?' to '+input.destination:''}.`,user);
  }
  const links={lead_id:lead,conversation_id:conversation};
  if (input.source==='Website') insert('submissions',{id:id('FORM'),lead_id:lead,conversation_id:conversation,payload:JSON.stringify(input)});
  await record('Enquiry received',linked?`${input.source} enquiry linked to existing ${lead}`:`${input.source} enquiry created ${lead}`,links,user);
  if (!linked) await assignLead(lead,owner,user);
  if (qualified && (!candidate||['New','In Conversation'].includes(candidate.stage))) await leadStage(lead,'Qualified',user,candidate?.stage??'New');
  if (!linked || input.follow_up) await scheduleFollowup(lead,owner,input.follow_up||day(1),user,`enquiry:${conversation}`);
  const acknowledgement=await template('acknowledgement');
  if (input.source==='Website' && acknowledgement) {
    message(conversation,'Outbound',acknowledgement.replaceAll('{name}',name),undefined,true);
    await record('Acknowledgement sent','Website acknowledgement stored as simulated outbound message',links,user);
  }
  return {lead,customer,conversation,linked,owner};
}
export async function mergeLeads(sourceId:string,targetId:string,user:User) {
  const source=await salesLead(user,sourceId);
  const target=await salesLead(user,targetId);
  return mergeLeadRecords(source,target,user);
}
export async function mergeLeadRecords(source:Row,target:Row,user:User) {
  check(source.id!==target.id,'Select a different lead');
  check(source.customer_id===target.customer_id,'Only enquiries from the same customer can be merged');
  run('UPDATE conversations SET lead_id=?,owner=? WHERE lead_id=?',target.id,target.owner,source.id);
  run('UPDATE quotes SET lead_id=? WHERE lead_id=?',target.id,source.id);
  run('UPDATE submissions SET lead_id=? WHERE lead_id=?',target.id,source.id);
  run('UPDATE documents SET lead_id=? WHERE lead_id=?',target.id,source.id);
  run('UPDATE events SET lead_id=? WHERE lead_id=?',target.id,source.id);
  run('UPDATE tasks SET lead_id=?,owner=? WHERE lead_id=?',target.id,target.owner,source.id);
  update('leads',source.id,{merged_into:target.id,stage:'Closed'});
  await record('Lead merged',`${source.id} merged into ${target.id}. Source interactions retained.`,{lead_id:target.id},user);
  return {id:target.id};
}

export async function crmActions(action:string,input:unknown,user:User) {
  switch(action) {
    case 'lead.create': {
      allow(user,'manager','sales');
      const data=enquiry.parse(input);
      check(data.name && (data.email||data.phone||data.instagram),'Provide a phone number, email or Instagram handle');
      if (data.call_time) {
        const time=new Date(data.call_time+'+05:30');
        check(Number.isFinite(time.valueOf()),'Invalid enquiry date/time');
        data.call_time=time.toISOString().slice(0,19).replace('T',' ');
      }
      return await ingest(data,user);
    }
    case 'lead.edit': {
      const data=enquiry.extend({id:key}).parse(input);
      const lead=await salesLead(user,data.id);
      update('leads',data.id,{...(await leadDetails(data)),touched:now()});
      if (data.follow_up&&data.follow_up!==lead.follow_up) await scheduleFollowup(data.id,lead.owner,data.follow_up,user);
      await record('Lead edited','Travel requirements updated',{lead_id:data.id},user);
      return {id:data.id};
    }
    case 'lead.stage': {
      const data=z.object({id:key,stage:z.enum(stages)}).parse(input);
      await salesLead(user,data.id);
      check(!['Quotation Prepared','Quotation Sent','Won'].includes(data.stage),'Use the quotation or booking workflow for this stage');
      await leadStage(data.id,data.stage,user);
      return {id:data.id};
    }
    case 'lead.assign': {
      allow(user,'manager');
      const data=z.object({id:key,owner:key}).parse(input);
      await salesLead(user,data.id);
      await assignLead(data.id,await salesperson(data.owner),user);
      return {id:data.id};
    }
    case 'lead.merge': {
      const data=z.object({id:key,target:key}).parse(input);
      return await mergeLeads(data.id,data.target,user);
    }
    case 'lead.note': {
      const data=z.object({id:key,body:notes.refine(Boolean,'Enter a note')}).parse(input);
      await salesLead(user,data.id);
      await record('Staff note',data.body,{lead_id:data.id},user);
      return {id:data.id};
    }
    case 'customer.save': {
      allow(user,'manager','sales');
      const data=contacts.extend({id:key.optional(),preferences:notes,notes}).parse(input);
      check(data.phone||data.email||data.instagram,'Enter a contact method');
      if (!data.id) {
        const customer=await identity(data,user);
        update('customers',customer.id,{preferences:data.preferences||customer.preferences,notes:data.notes||customer.notes});
        await record('Customer saved',customer.name,{},user);
        return {id:customer.id};
      }
      await find('customers',data.id);
      await requireCustomerScope(user,data.id);
      const number=phone(data.phone), wa=phone(data.whatsapp);
      check((!data.phone||number)&&(!data.whatsapp||wa),'Enter a valid phone number');
      update('customers',data.id,{name:data.name,phone:number||null,whatsapp:wa||null,email:data.email.toLowerCase()||null,
        instagram:data.instagram.toLowerCase().replace(/^@/,'')||null,preferences:data.preferences,notes:data.notes});
      await record('Customer edited',`Customer profile ${data.id} updated`,{},user);
      return {id:data.id};
    }
    case 'customer.assign': {
      allow(user,'manager');
      const data=z.object({id:key,sales_owner:optionalKey}).parse(input);
      await find('customers',data.id);
      const current=await one('SELECT salesperson_id FROM customer_sales_assignments WHERE customer_id=?',data.id);
      const owner=data.sales_owner||null;
      if (owner) check(await one("SELECT id FROM users WHERE id=? AND role='sales' AND active=1",owner),'Select an active salesperson');
      if ((current?.salesperson_id??null)===owner) return {id:data.id};
      if (owner) run(`INSERT INTO customer_sales_assignments (customer_id,salesperson_id) VALUES (?,?)
        ON CONFLICT(customer_id) DO UPDATE SET salesperson_id=excluded.salesperson_id`,data.id,owner);
      else run('DELETE FROM customer_sales_assignments WHERE customer_id=?',data.id);
      if (current) {
        run("DELETE FROM portal_links WHERE user_id IN (SELECT id FROM users WHERE customer_id=? AND role='customer')",data.id);
        run("DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE customer_id=? AND role='customer')",data.id);
      }
      await record('Customer sales access changed',`Customer ${data.id}: ${current?.salesperson_id??'unassigned'} → ${owner??'unassigned'}`,{},user);
      return {id:data.id};
    }
    case 'inbox.state': {
      const data=z.object({id:key,status:z.enum(['Automation','Human','Paused','Closed','Open'])}).parse(input);
      allow(user,'manager','sales');
      const c=await conversationAccess(user,data.id);
      update('conversations',data.id,{status:data.status});
      await record('Conversation '+data.status,`Conversation changed to ${data.status}`,{lead_id:c.lead_id,conversation_id:data.id},user);
      return {id:data.id};
    }
    case 'inbox.message': {
      const data=z.object({id:key,body:notes.refine(Boolean),internal:z.boolean().default(false)}).parse(input);
      const c=await conversationAccess(user,data.id);
      check(user.role!=='customer'||!data.internal,'This action requires a staff account',403);
      message(data.id,user.role==='customer'?'Inbound':data.internal?'Internal':'Outbound',data.body,user);
      if (c.lead_id) update('leads',c.lead_id,{touched:now()});
      const event=await record(user.role==='customer'?'Customer reply':data.internal?'Internal note':'Simulated reply',
        user.role==='customer'?'Customer sent a portal message':data.internal?'Staff added an internal note':'Staff saved a simulated outbound reply',
        {lead_id:c.lead_id,conversation_id:data.id},user);
      if (user.role==='customer') notify(c.owner,'Customer sent a portal message',`/inbox/${data.id}`,event);
      return {id:data.id};
    }
    case 'inbox.followup': {
      allow(user,'manager','sales');
      const data=z.object({id:key,due:z.iso.date()}).parse(input);
      const c=await conversationAccess(user,data.id);
      check(c.lead_id,'Qualify the conversation to schedule a CRM follow-up');
      await scheduleFollowup(c.lead_id,c.owner,data.due,user);
      return {id:data.id};
    }
    case 'portal.assistance': {
      check(user.role==='customer'&&user.customer_id,'Customer portal access required',403);
      const {body}=z.object({body:str.refine(Boolean,'Enter your request')}).parse(input);
      const existing=await one("SELECT id,owner FROM conversations WHERE customer_id=? AND channel='Portal' AND status<>'Closed' LIMIT 1",user.customer_id);
      const conversation=existing?.id||id('CV');
      const assigned=await one(`SELECT a.salesperson_id FROM customer_sales_assignments a
        JOIN users u ON u.id=a.salesperson_id WHERE a.customer_id=? AND u.role='sales' AND u.active=1`,user.customer_id);
      const owner=assigned?.salesperson_id??null;
      if (existing && existing.owner!==owner) update('conversations',conversation,{owner});
      if (!existing) insert('conversations',{id:conversation,channel:'Portal',identity:user.name,customer_id:user.customer_id,owner,status:'Open'});
      message(conversation,'Inbound',body,user);
      const event=await record('Assistance requested','Customer requested help through the portal',{conversation_id:conversation},user);
      notify(owner,'New portal assistance request',`/inbox/${conversation}`,event);
      return {id:conversation};
    }
  }
}
