import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { one, run, insert, now } from './db.ts';
import { passwordHash } from './password.ts';
export { passwordHash } from './password.ts';
import type { Role, User } from '../domains/shared.ts';

export class DomainError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) { super(message); this.status=status; }
}
export function check(condition: unknown, message: string, status=400): asserts condition {
  if (!condition) throw new DomainError(message, status);
}
export const demo = process.env.CRM_DEMO !== '0';
export const token = () => randomBytes(32).toString('base64url');
export const digest = (raw:string) => createHash('sha256').update(raw).digest('hex');
const profile = 'u.id,u.name,u.email,u.role,u.customer_id';
export async function authenticate(email:string, password:string) {
  const account = await one<User & {hash:string}>(`SELECT ${profile},u.hash FROM users u WHERE u.email=? AND u.active=1`,email.toLowerCase());
  const actual = account?.hash || '0'.repeat(32)+':'+ '0'.repeat(128);
  check(timingSafeEqual(Buffer.from(actual),Buffer.from(passwordHash(password,actual.split(':')[0]))) && account,'Invalid email or password',401);
  const {hash: _hash, ...user} = account;
  return user;
}
export function session(user:User) {
  const raw=token();
  run('DELETE FROM sessions WHERE expires<=?',now());
  insert('sessions',{token:digest(raw),user_id:user.id,expires:new Date(Date.now()+12*3600000).toISOString().slice(0,19).replace('T',' ')});
  return raw;
}
export async function getUser(raw?:string) {
  if (!raw || raw.length!==43) return;
  return await one<User>(`SELECT ${profile} FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token=? AND s.expires>? AND u.active=1`,digest(raw),now());
}
export function allow(user:User,...allowed:Role[]) {
  check(user.role==='admin'||allowed.includes(user.role),'You do not have permission for this action',403);
}
export const staff = ['manager','sales','ops','finance'] as const;
export function sameCustomer(user:User, customer:string) {
  check(user.role!=='customer'||user.customer_id===customer,'Record not found',404);
}
