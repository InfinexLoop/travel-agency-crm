import { z } from 'zod';
import { stages, type User } from '../domains/shared.ts';
import { check, allow } from './auth.ts';
import { day, id, insert, now, one, run, update, rows } from './db.ts';
import { assignee, message, notify, record, task, template } from './events.ts';
import { enquiry, phone, type Enquiry, key, notes, str, contacts } from './input.ts';

export function find(table:string, id:string) {
  const value=one(`SELECT * FROM ${table} WHERE id=?`,id);
  check(value,'Record not found',404);
  return value;
}
export function salesLead(user:User, id:string) {
  allow(user,'manager','sales');
  const lead=find('leads',id);
  check(!lead.merged_into && (user.role!=='sales'||lead.owner===user.id),'Lead not found',404);
  return lead;
}
export function conversationAccess(user:User,id:string) {
  allow(user,'manager','sales','customer');
  const conversation=find('conversations',id);
  const permitted = user.role==='customer' ? conversation.customer_id===user.customer_id
    : user.role!=='sales' || conversation.owner===user.id ||
      (conversation.lead_id && one('SELECT id FROM leads WHERE id=? AND owner=?',conversation.lead_id,user.id));
  check(permitted,'Conversation not found',404);
  return conversation;
}
export function salesperson(key:string) {
  check(one("SELECT id FROM users WHERE id=? AND active=1 AND role IN ('sales','manager','admin')",key),'Select an active sales user');
  return key;
}
export function identity(input:z.output<typeof contacts>) {
  const number=phone(input.phone);
  const email=input.email.toLowerCase();
  const handle=input.instagram.toLowerCase().replace(/^@/,'');
  const wa=phone(input.whatsapp);
  check(!input.phone||number,'Enter a valid phone number');
  check(!input.whatsapp||wa,'Enter a valid WhatsApp number');
  const matches=rows(`SELECT * FROM customers WHERE (?<>'' AND phone=?) OR (?<>'' AND email=?) OR (?<>'' AND instagram=?)`,
    number,number,email,email,handle,handle);
  check(matches.length<2,'Phone, email or Instagram handle belong to different customers. Review their profiles first.',409);
  const existing=matches[0];
  if (existing) {
    update('customers',existing.id,{name:existing.phone||existing.email?existing.name:input.name,
      phone:existing.phone||number||null,email:existing.email||email||null,
      instagram:existing.instagram||handle||null,whatsapp:existing.whatsapp||wa||null});
    return existing.id as string;
  }
  const customer=id('CUS');
  insert('customers',{id:customer,name:input.name,phone:number||null,email:email||null,instagram:handle||null,whatsapp:wa||null});
  return customer;
}

export function assignLead(lead:string, owner:string|null, user:User) {
  update('leads',lead,{owner});
  run('UPDATE conversations SET owner=? WHERE lead_id=?',owner,lead);
  run("UPDATE tasks SET owner=? WHERE lead_id=? AND status<>'Done'",owner,lead);
  const event=record('Lead assigned',owner?`Sales owner assigned to ${lead}`:'Sales owner cleared',{lead_id:lead},user);
  notify(owner,'An enquiry was assigned to you',`/leads/${lead}`,event);
}
export function scheduleFollowup(lead:string, owner:string|null, due:string, user:User, key?:string) {
  update('leads',lead,{follow_up:due});
  task({title:'Follow up with traveller',owner,links:{lead_id:lead},due,key});
  record('Follow-up scheduled',`Sales follow-up set for ${due}`,{lead_id:lead},user,key?'event:'+key:undefined);
}
export function leadStage(lead:string, stage:string, user:User) {
  const previous=find('leads',lead).stage;
  if (previous===stage) return;
  update('leads',lead,{stage,touched:now()});
  record(stage==='Qualified'?'Lead qualified':'Lead stage updated',`${previous} → ${stage}`,{lead_id:lead},user);
}
function leadDetails(input:Enquiry) {
  if (input.package_id) check(one('SELECT id FROM packages WHERE id=?',input.package_id),'Package not found');
  return {
    destination:input.destination,package_id:input.package_id||null,city:input.city,dates:input.dates,
    flexible:Number(input.flexible),adults:input.adults,children:input.children,ages:input.ages,budget:input.budget,
    purpose:input.purpose,preferences:input.preferences,priority:input.priority,
  };
}
export function ingest(input:Enquiry,user:User,existingConversation?:string,qualified=false) {
  const customer=identity(input);
  const name=find('customers',customer).name;
  const candidate=one(`SELECT * FROM leads WHERE customer_id=? AND lower(destination)=lower(?)
    AND merged_into IS NULL AND stage NOT IN ('Won','Lost','Closed') ${user.role==='sales'?'AND owner=?':''}
    ORDER BY created DESC LIMIT 1`,customer,input.destination,...(user.role==='sales'?[user.id]:[]));
  const lead=candidate?.id ?? id('LD');
  const owner=candidate?.owner || (user.role==='sales'?user.id:input.owner?salesperson(input.owner):assignee('sales'));
  const linked=Boolean(candidate);
  const conversation=existingConversation||id('CV');
  if (!linked) {
    insert('leads',{id:lead,customer_id:customer,source:input.source,owner,stage:'New',
      ...leadDetails(input),...(input.call_time?{created:input.call_time}:{}),touched:now()});
  } else {
    update('leads',lead,{touched:now()});
    if (qualified && candidate && ['New','In Conversation'].includes(candidate.stage)) update('leads',lead,leadDetails(input));
  }
  if (existingConversation) update('conversations',conversation,{lead_id:lead,customer_id:customer,owner});
  else {
    insert('conversations',{id:conversation,channel:input.source,identity:input.instagram||input.phone||input.email||name,lead_id:lead,customer_id:customer,owner,status:'Open'});
    record('Conversation started',`${input.source} conversation opened`,{lead_id:lead,conversation_id:conversation},user);
    message(conversation,input.source==='Phone Call'?'Internal':'Inbound',input.call_notes||input.preferences||`${name} requested a trip${input.destination?' to '+input.destination:''}.`,user);
  }
  const links={lead_id:lead,conversation_id:conversation};
  if (input.source==='Website') insert('submissions',{id:id('FORM'),lead_id:lead,conversation_id:conversation,payload:JSON.stringify(input)});
  record('Enquiry received',linked?`${input.source} enquiry linked to existing ${lead}`:`${input.source} enquiry created ${lead}`,links,user);
  if (!linked) assignLead(lead,owner,user);
  if (qualified && (!candidate||['New','In Conversation'].includes(candidate.stage))) leadStage(lead,'Qualified',user);
  if (!linked || input.follow_up) scheduleFollowup(lead,owner,input.follow_up||day(1),user,`enquiry:${conversation}`);
  const acknowledgement=template('acknowledgement');
  if (input.source==='Website' && acknowledgement) {
    message(conversation,'Outbound',acknowledgement.replaceAll('{name}',name),undefined,true);
    record('Acknowledgement sent','Website acknowledgement stored as simulated outbound message',links,user);
  }
  return {lead,customer,conversation,linked};
}
export function mergeLeads(sourceId:string,targetId:string,user:User) {
  const source=salesLead(user,sourceId);
  const target=salesLead(user,targetId);
  check(source.id!==target.id,'Select a different lead');
  check(source.customer_id===target.customer_id,'Only enquiries from the same customer can be merged');
  run('UPDATE conversations SET lead_id=?,owner=? WHERE lead_id=?',target.id,target.owner,source.id);
  run('UPDATE quotes SET lead_id=? WHERE lead_id=?',target.id,source.id);
  run('UPDATE submissions SET lead_id=? WHERE lead_id=?',target.id,source.id);
  run('UPDATE documents SET lead_id=? WHERE lead_id=?',target.id,source.id);
  run('UPDATE events SET lead_id=? WHERE lead_id=?',target.id,source.id);
  run('UPDATE tasks SET lead_id=?,owner=? WHERE lead_id=?',target.id,target.owner,source.id);
  update('leads',source.id,{merged_into:target.id,stage:'Closed'});
  record('Lead merged',`${source.id} merged into ${target.id}. Source interactions retained.`,{lead_id:target.id},user);
  return {id:target.id};
}

export function crmActions(action:string,input:unknown,user:User) {
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
      return ingest(data,user);
    }
    case 'lead.edit': {
      const data=enquiry.extend({id:key}).parse(input);
      const lead=salesLead(user,data.id);
      update('leads',data.id,{...leadDetails(data),touched:now()});
      if (data.follow_up&&data.follow_up!==lead.follow_up) scheduleFollowup(data.id,lead.owner,data.follow_up,user);
      record('Lead edited','Travel requirements updated',{lead_id:data.id},user);
      return {id:data.id};
    }
    case 'lead.stage': {
      const data=z.object({id:key,stage:z.enum(stages)}).parse(input);
      salesLead(user,data.id);
      check(!['Quotation Prepared','Quotation Sent','Won'].includes(data.stage),'Use the quotation or booking workflow for this stage');
      leadStage(data.id,data.stage,user);
      return {id:data.id};
    }
    case 'lead.assign': {
      allow(user,'manager');
      const data=z.object({id:key,owner:key}).parse(input);
      salesLead(user,data.id);
      assignLead(data.id,salesperson(data.owner),user);
      return {id:data.id};
    }
    case 'lead.merge': {
      const data=z.object({id:key,target:key}).parse(input);
      return mergeLeads(data.id,data.target,user);
    }
    case 'lead.note': {
      const data=z.object({id:key,body:notes.refine(Boolean,'Enter a note')}).parse(input);
      salesLead(user,data.id);
      record('Staff note',data.body,{lead_id:data.id},user);
      return {id:data.id};
    }
    case 'customer.save': {
      allow(user,'manager','sales');
      const data=contacts.extend({id:key.optional(),preferences:notes,notes}).parse(input);
      check(data.phone||data.email||data.instagram,'Enter a contact method');
      if (!data.id) {
        const customer=identity(data);
        const current=find('customers',customer);
        update('customers',customer,{preferences:data.preferences||current.preferences,notes:data.notes||current.notes});
        record('Customer saved',current.name,{},user);
        return {id:customer};
      }
      find('customers',data.id);
      check(user.role!=='sales'||one('SELECT id FROM leads WHERE customer_id=? AND owner=? AND merged_into IS NULL',data.id,user.id),'Customer not found',404);
      const number=phone(data.phone), wa=phone(data.whatsapp);
      check((!data.phone||number)&&(!data.whatsapp||wa),'Enter a valid phone number');
      update('customers',data.id,{name:data.name,phone:number||null,whatsapp:wa||null,email:data.email.toLowerCase()||null,
        instagram:data.instagram.toLowerCase().replace(/^@/,'')||null,preferences:data.preferences,notes:data.notes});
      record('Customer edited',`Customer profile ${data.id} updated`,{},user);
      return {id:data.id};
    }
    case 'inbox.state': {
      const data=z.object({id:key,status:z.enum(['Automation','Human','Paused','Closed','Open'])}).parse(input);
      allow(user,'manager','sales');
      const c=conversationAccess(user,data.id);
      update('conversations',data.id,{status:data.status});
      record('Conversation '+data.status,`Conversation changed to ${data.status}`,{lead_id:c.lead_id,conversation_id:data.id},user);
      return {id:data.id};
    }
    case 'inbox.message': {
      const data=z.object({id:key,body:notes.refine(Boolean),internal:z.boolean().default(false)}).parse(input);
      const c=conversationAccess(user,data.id);
      check(user.role!=='customer'||!data.internal,'This action requires a staff account',403);
      message(data.id,user.role==='customer'?'Inbound':data.internal?'Internal':'Outbound',data.body,user);
      if (c.lead_id) update('leads',c.lead_id,{touched:now()});
      const event=record(user.role==='customer'?'Customer reply':data.internal?'Internal note':'Simulated reply',
        user.role==='customer'?'Customer sent a portal message':data.internal?'Staff added an internal note':'Staff saved a simulated outbound reply',
        {lead_id:c.lead_id,conversation_id:data.id},user);
      if (user.role==='customer') notify(c.owner,'Customer sent a portal message',`/inbox/${data.id}`,event);
      return {id:data.id};
    }
    case 'inbox.followup': {
      allow(user,'manager','sales');
      const data=z.object({id:key,due:z.iso.date()}).parse(input);
      const c=conversationAccess(user,data.id);
      check(c.lead_id,'Qualify the conversation to schedule a CRM follow-up');
      scheduleFollowup(c.lead_id,c.owner,data.due,user);
      return {id:data.id};
    }
    case 'portal.assistance': {
      check(user.role==='customer'&&user.customer_id,'Customer portal access required',403);
      const {body}=z.object({body:str.refine(Boolean,'Enter your request')}).parse(input);
      const existing=one("SELECT id,owner FROM conversations WHERE customer_id=? AND channel='Portal' AND status<>'Closed' LIMIT 1",user.customer_id);
      const conversation=existing?.id||id('CV');
      const owner=existing?.owner||assignee('sales');
      if (!existing) insert('conversations',{id:conversation,channel:'Portal',identity:user.name,customer_id:user.customer_id,owner,status:'Open'});
      message(conversation,'Inbound',body,user);
      const event=record('Assistance requested','Customer requested help through the portal',{conversation_id:conversation},user);
      notify(owner,'New portal assistance request',`/inbox/${conversation}`,event);
      return {id:conversation};
    }
  }
}
