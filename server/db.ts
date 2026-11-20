import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

export const dataDir = resolve(/*turbopackIgnore: true*/ process.env.CRM_DATA_DIR || 'data');
export const uploadsDir = resolve(dataDir, 'uploads');
let connection: DatabaseSync | undefined;

export function db() {
  if (!connection) {
    mkdirSync(uploadsDir, { recursive: true, mode: 0o700 });
    connection = new DatabaseSync(resolve(dataDir, 'crm.sqlite'));
    connection.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON');
  }
  return connection;
}

export function migrate() {
  db().exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY) STRICT');
  transaction(() => {
    const migrations=['001-initial.sql','002-adjustments.sql','003-payment-schedule.sql','004-payment-reminder.sql'];
    for (const [index,filename] of migrations.entries()) {
      const version=index+1;
      if (one('SELECT 1 FROM schema_migrations WHERE version=?',version)) continue;
      db().exec(readFileSync(resolve('db',filename),'utf8'));
      run('INSERT INTO schema_migrations VALUES (?)',version);
    }
  });
}

// Query projections vary with role and report. Callers can supply a specific projection type.
export type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export const rows = <T = Row>(sql: string, ...params: SQLInputValue[]) => db().prepare(sql).all(...params) as T[];
export const one = <T = Row>(sql: string, ...params: SQLInputValue[]) => db().prepare(sql).get(...params) as T | undefined;
export const run = (sql: string, ...params: SQLInputValue[]) => db().prepare(sql).run(...params);
export const id = (prefix: string) => `${prefix}-${randomBytes(7).toString('hex').toUpperCase()}`;
export const now = () => new Date().toISOString().slice(0,19).replace('T',' ');
export function day(offset = 0, date = new Date()) {
  return new Date(date.getTime() + offset * 86_400_000).toLocaleDateString('en-CA', {timeZone:'Asia/Kolkata'});
}
export function transaction<T>(operation: () => T): T {
  db().exec('BEGIN IMMEDIATE');
  try {
    const value = operation();
    db().exec('COMMIT');
    return value;
  } catch (error) {
    db().exec('ROLLBACK');
    throw error;
  }
}
export function insert(table: string, record: Record<string, SQLInputValue>) {
  const keys = Object.keys(record);
  run(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, ...Object.values(record));
}
export function update(table: string, key: string, record: Record<string, SQLInputValue>) {
  run(`UPDATE ${table} SET ${Object.keys(record).map(column => `${column}=?`).join(',')} WHERE id=?`, ...Object.values(record), key);
}
