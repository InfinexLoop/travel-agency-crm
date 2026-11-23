import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { one, run, insert, now } from './db.ts';
import { passwordHash } from './password.ts';
import { localDemoSignInEnabled, publicDemoSignInEnabled } from './platform.ts';
import { demoOwnerId, demoPersonas } from '../domains/demo-personas.ts';
export { passwordHash } from './password.ts';
import type { Role, SignIn, User } from '../domains/shared.ts';

export class DomainError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) { super(message); this.status=status; }
}
export function check(condition: unknown, message: string, status=400): asserts condition {
  if (!condition) throw new DomainError(message, status);
}
export const demo = process.env.CRM_DEMO !== '0';
export const localDemoPasswordEnabled = () => demo&&localDemoSignInEnabled();
export const demoQuickLoginEnabled = () => demo&&(localDemoSignInEnabled()||publicDemoSignInEnabled());
export { publicDemoSignInEnabled };
export const token = () => randomBytes(32).toString('base64url');
export const digest = (raw:string) => createHash('sha256').update(raw).digest('hex');
export const isDemoSignIn = (signIn?:SignIn) => signIn==='quick'||signIn==='demo-portal-link';
// Older Worker builds only recognize password-format session digests.
export const sessionDigest = (raw:string,signIn?:SignIn) => digest(isDemoSignIn(signIn)?'quick:'+raw:raw);
export const portalLinkDigest = (raw:string,quick=false) => digest(quick?'quick-portal:'+raw:raw);
const profile = 'u.id,u.name,u.email,u.role,u.customer_id';
export async function authenticate(email:string, password:string) {
  const account = await one<User & {hash:string}>(`SELECT ${profile},u.hash FROM users u WHERE u.email=? AND u.active=1 AND u.id<>?`,email.toLowerCase(),demoOwnerId);
  const actual = account?.hash || '0'.repeat(32)+':'+ '0'.repeat(128);
  check(timingSafeEqual(Buffer.from(actual),Buffer.from(passwordHash(password,actual.split(':')[0]))) && account,'Invalid email or password',401);
  const {hash: _hash, ...user} = account;
  return user;
}
export async function demoAccount(key:string,portal:boolean) {
  check(demoQuickLoginEnabled(),'Demo quick login is disabled',403);
  check(Object.hasOwn(demoPersonas,key),'Unknown demo account',400);
  const persona=demoPersonas[key as keyof typeof demoPersonas];
  check((persona.role==='customer')===portal,'Choose a demo account for this portal',400);
  const user=await one<User>(`SELECT ${profile} FROM users u
    WHERE u.id=? AND u.role=? AND u.customer_id IS ? AND u.active=1
    AND EXISTS (SELECT 1 FROM settings WHERE key='seed_version' AND value='1')`,persona.id,persona.role,persona.customerId);
  check(user,'This demo account is unavailable',403);
  return user;
}
export function session(user:User,signIn:SignIn='password') {
  const raw=token();
  run('DELETE FROM sessions WHERE expires<=?',now());
  insert('sessions',{token:sessionDigest(raw,signIn),user_id:user.id,sign_in:signIn,
    expires:new Date(Date.now()+12*3600000).toISOString().slice(0,19).replace('T',' ')});
  return raw;
}
export async function getUser(raw?:string) {
  if (!raw || raw.length!==43) return;
  const user=await one<User>(`SELECT ${profile},s.sign_in FROM users u JOIN sessions s ON s.user_id=u.id
    WHERE s.token IN (?,?) AND s.expires>? AND u.active=1`,sessionDigest(raw),sessionDigest(raw,'quick'),now());
  if (isDemoSignIn(user?.sign_in)&&!demoQuickLoginEnabled()) return;
  if (user?.sign_in==='quick') {
    const matches=Object.values(demoPersonas).some(persona=>persona.id===user.id&&persona.role===user.role&&persona.customerId===user.customer_id);
    return matches?user:undefined;
  }
  if (user?.id!==demoOwnerId) return user;
}
export function allow(user:User,...allowed:Role[]) {
  check(user.role==='admin'||allowed.includes(user.role),'You do not have permission for this action',403);
}
export const staff = ['manager','sales','ops','finance'] as const;
export function sameCustomer(user:User, customer:string) {
  check(user.role!=='customer'||user.customer_id===customer,'Record not found',404);
}
