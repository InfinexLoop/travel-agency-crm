import { env } from 'cloudflare:workers';
import type { Database, Row, SqlValue, Statement } from './persistence.ts';

interface D1Statement {
  bind(...params: SqlValue[]): D1Statement;
  all<T>(): Promise<{ results: T[] }>;
}
interface D1Session {
  prepare(sql: string): D1Statement;
  batch<T>(statements: D1Statement[]): Promise<{ results: T[] }[]>;
}
interface Bindings {
  DB: { withSession(constraint: 'first-primary'): D1Session };
  FILES: {
    put(key: string, value: ArrayBuffer, options: { httpMetadata: { contentType: string } }): Promise<unknown>;
    get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
    delete(key: string): Promise<void>;
  };
}
const bound=()=>env as unknown as Bindings;

export function database(): Database {
  const session=bound().DB.withSession('first-primary');
  const prepare=({sql,params}: Statement)=>session.prepare(sql).bind(...params);
  return {
    async select<T>(statement: Statement) {
      return (await prepare(statement).all<T>()).results;
    },
    async readBatch(statements) {
      if (!statements.length) return [];
      return (await session.batch<Row>(statements.map(prepare))).map(result=>result.results);
    },
    async commit(statements) {
      await session.batch(statements.map(prepare));
    },
  };
}

export async function putFile(key: string, bytes: ArrayBuffer, mime: string) {
  await bound().FILES.put(key,bytes,{httpMetadata:{contentType:mime}});
}
export async function readObject(key: string) {
  const file=await bound().FILES.get(key);
  return file ? new Uint8Array(await file.arrayBuffer()) : null;
}
export const deleteObject=(key: string)=>bound().FILES.delete(key);
