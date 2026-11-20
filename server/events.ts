import { day, id, insert, one, run } from './db.ts';
import type { User } from '../domains/shared.ts';

type Links = {lead_id?:string|null; booking_id?:string|null; conversation_id?:string|null};
export function record(kind:string, summary:string, links:Links={}, actor?:User|null, key?:string, outcome='Success') {
  if (key && one('SELECT id FROM events WHERE event_key=?',key)) return;
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
export function task({title,owner,links,due=day(1),key,priority='Normal'}:{
  title:string; owner:string|null; links:Links; due?:string; key?:string; priority?:string;
}) {
  if (key && one('SELECT id FROM tasks WHERE trigger_key=?',key)) return;
  const keyId=id('TSK');
  insert('tasks',{id:keyId,title,owner,...links,due,priority,trigger_key:key??null});
  return keyId;
}
export const template = (key:string) => one<{template:string}>('SELECT template FROM workflows WHERE id=? AND enabled=1',key)?.template;
export const assignee = (role:'sales'|'ops') => one<{id:string}>(`SELECT u.id FROM users u
  LEFT JOIN leads l ON l.owner=u.id AND l.merged_into IS NULL AND l.stage NOT IN ('Won','Lost','Closed')
  WHERE u.role=? AND u.active=1 GROUP BY u.id ORDER BY COUNT(l.id),u.id LIMIT 1`,role)?.id ?? null;
export function closeTasks(booking:string) {
  run("UPDATE tasks SET status='Done' WHERE booking_id=?",booking);
}
