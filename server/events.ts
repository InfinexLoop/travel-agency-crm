import { day, id, insert, one, reserveKey, run } from './db.ts';
import type { User } from '../domains/shared.ts';

type Links = {lead_id?:string|null; booking_id?:string|null; conversation_id?:string|null};
export async function record(kind:string, summary:string, links:Links={}, actor?:User|null, key?:string, outcome='Success', existingKeys?:ReadonlySet<string>) {
  if (key && (!reserveKey('event:'+key) || (existingKeys ? existingKeys.has(key) : await one('SELECT id FROM events WHERE event_key=?',key)))) return;
  const event=id('EV');
  insert('events',{id:event,kind,summary,...links,actor:actor?.id??null,event_key:key??null,outcome});
  return event;
}
export function notify(userId:string|null, title:string, href:string, eventId?:string) {
  if (userId && eventId) insert('notifications',{id:id('NT'),user_id:userId,title,href,event_id:eventId});
}
export function message(conversation:string, direction:'Inbound'|'Outbound'|'Internal', body:string, actor?:User, automated=false) {
  insert('messages',{id:id('MS'),conversation_id:conversation,direction,body,actor:actor?.id??null,automated:Number(automated)});
}
export async function task({title,owner,links,due=day(1),key,priority='Normal',existingKeys}:{
  title:string; owner:string|null; links:Links; due?:string; key?:string; priority?:string; existingKeys?:ReadonlySet<string>;
}) {
  if (key && (!reserveKey('task:'+key) || (existingKeys ? existingKeys.has(key) : await one('SELECT id FROM tasks WHERE trigger_key=?',key)))) return;
  const keyId=id('TSK');
  insert('tasks',{id:keyId,title,owner,...links,due,priority,trigger_key:key??null});
  return keyId;
}
export const template = async (key:string) => (await one<{template:string}>('SELECT template FROM workflows WHERE id=? AND enabled=1',key))?.template;
export const assignee = async (role:'sales'|'ops') => (await one<{id:string}>(`SELECT u.id FROM users u
  LEFT JOIN leads l ON l.owner=u.id AND l.merged_into IS NULL AND l.stage NOT IN ('Won','Lost','Closed')
  WHERE u.role=? AND u.active=1 GROUP BY u.id ORDER BY COUNT(l.id),u.id LIMIT 1`,role))?.id ?? null;
export function closeTasks(booking:string) {
  run("UPDATE tasks SET status='Done' WHERE booking_id=?",booking);
}
