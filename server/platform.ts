import { readFile, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { db, uploadsDir, transaction } from './db.local.ts';
import type { Database, Row, Statement } from './persistence.ts';

const select = <T>(statement: Statement) => db().prepare(statement.sql).all(...statement.params) as T[];
export function database(): Database {
  return {
    async select<T>(statement: Statement) { return select<T>(statement); },
    async readBatch(statements) { return statements.map(select<Row>); },
    async commit(statements) {
      transaction(() => {
        for (const {sql,params} of statements) db().prepare(sql).run(...params);
      });
    },
  };
}

export const localDemoSignInEnabled = () => true;
export const publicDemoSignInEnabled = () => false;

export const putFile = (key: string, bytes: ArrayBuffer, _mime: string) =>
  writeFile(resolve(uploadsDir,key),new Uint8Array(bytes),{mode:0o600,flag:'wx'});
export const readObject = (key: string) =>
  readFile(resolve(uploadsDir,key)).catch((error: NodeJS.ErrnoException) => {
    if (error.code==='ENOENT') return null;
    throw error;
  });
export const deleteObject = (key: string) => unlink(resolve(uploadsDir,key));
