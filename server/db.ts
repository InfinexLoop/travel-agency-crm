import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';
import { database } from './platform.ts';
import type { Database, Row, SqlValue, Statement } from './persistence.ts';
export type { Row } from './persistence.ts';

type Unit = { db: Database; writes: Statement[]; keys: Set<string> };
const units = new AsyncLocalStorage<Unit>();
const currentDb = () => units.getStore()?.db ?? database();
const versionSql = 'SELECT version FROM crm_write_revision WHERE id=1';
export const rows = <T = Row>(sql: string, ...params: SqlValue[]) =>
  currentDb().select<T>({sql,params});
export async function one<T = Row>(sql: string, ...params: SqlValue[]) {
  return (await rows<T>(sql,...params))[0] as T | undefined;
}
export function readBatch(statements: Statement[]) {
  return currentDb().readBatch(statements);
}
export function run(sql: string, ...params: SqlValue[]) {
  const unit=units.getStore();
  if (!unit) throw new Error('Database writes require a transaction');
  unit.writes.push({sql,params});
}
export function reserveKey(key: string) {
  const unit=units.getStore();
  if (!unit) throw new Error('Keys require a transaction');
  if (unit.keys.has(key)) return false;
  unit.keys.add(key);
  return true;
}

export class ConcurrentWrite extends Error {}

// A D1 batch commits or rolls back as one unit. The revision check detects
// any intervening CRM mutation between planning reads and the batch.
export async function transaction<T>(operation: () => Promise<T> | T): Promise<T> {
  if (units.getStore()) throw new Error('Nested CRM transactions are unsupported');
  const db=database();
  for (let attempt=0; attempt<5; attempt++) {
    const [revision]=await db.select<{version:number}>({sql:versionSql,params:[]});
    if (!revision) throw new Error('CRM database migrations have not been applied');
    const unit:Unit={db,writes:[],keys:new Set()};
    let result:T;
    try {
      result=await units.run(unit,operation);
    } catch (error) {
      const [latest]=await db.select<{version:number}>({sql:versionSql,params:[]});
      if (latest?.version!==revision.version) continue;
      throw error;
    }
    if (!unit.writes.length) return result;
    try {
      await db.commit([
        {sql:'UPDATE crm_write_revision SET version=CASE WHEN version=? THEN version+1 ELSE -1 END WHERE id=1',params:[revision.version]},
        ...unit.writes,
      ]);
      return result;
    } catch (error) {
      if (!String(error).includes('crm_revision_nonnegative')) throw error;
    }
  }
  throw new ConcurrentWrite('Another CRM update was in progress. Please retry.');
}

export const id = (prefix: string) => `${prefix}-${randomBytes(7).toString('hex').toUpperCase()}`;
export const now = () => new Date().toISOString().slice(0,19).replace('T',' ');
export function day(offset=0, date=new Date()) {
  return new Date(date.getTime()+offset*86_400_000).toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'});
}
export function insert(table: string, record: Record<string, SqlValue>) {
  const keys=Object.keys(record);
  run(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`,...Object.values(record));
}
export function update(table: string, key: string, record: Record<string, SqlValue>) {
  run(`UPDATE ${table} SET ${Object.keys(record).map(column => `${column}=?`).join(',')} WHERE id=?`,...Object.values(record),key);
}
