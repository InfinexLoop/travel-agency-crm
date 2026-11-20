import { z } from 'zod';
import { sources } from '../domains/shared.ts';
import { check } from './auth.ts';

export const text = z.string().trim().min(1).max(250);
export const notes = z.string().trim().max(15_000).default('');
export const str = z.string().trim().max(250).default('');
export const key = z.string().min(1).max(90).regex(/^[\w-]+$/);
export const date = z.iso.date();
export const count = z.coerce.number().int().min(0).max(99);
export const amount = z.coerce.number().int().min(0).max(10_000_000_000).default(0);
export const email = z.union([z.literal(''),z.email().max(180)]).default('');
export function phone(raw:string) {
  const digits=raw.replace(/\D/g,'');
  if (digits.length===10 && !raw.trim().startsWith('+')) return '+91'+digits;
  if (digits.length<8 || digits.length>15) return '';
  return '+'+digits;
}
export const optionalKey = z.union([key,z.literal(''),z.null()]).default('');
export const contacts = z.object({name:text,phone:str,email,whatsapp:str,instagram:str});
export const enquiry = contacts.extend({
  source:z.enum(sources).default('Website'), destination:str, city:str, dates:str, package_id:optionalKey,
  flexible:z.boolean().default(false), adults:count.min(1).default(1), children:count.default(0), ages:str,
  budget:amount, purpose:str, preferences:notes, priority:z.enum(['Low','Normal','High','Urgent']).default('Normal'),
  owner:optionalKey, follow_up:z.union([date,z.literal('')]).default(''),
  call_time:str, call_notes:notes,
});
export type Enquiry = z.output<typeof enquiry>;
export const days = z.array(z.object({title:text,description:notes})).min(1).max(45);
export function parseDays(raw:string) {
  return days.parse(JSON.parse(raw));
}
export function validateTravel(departure:string, end:string) {
  check(end>=departure,'Return date must be on or after departure');
}
