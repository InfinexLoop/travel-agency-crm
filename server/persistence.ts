export type SqlValue = string | number | null;
// SQL projections vary across role-specific listings and workflows.
export type Row = Record<string, any>;
export type Statement = { sql: string; params: SqlValue[] };
export interface Database {
  select<T = Row>(statement: Statement): Promise<T[]>;
  readBatch(statements: Statement[]): Promise<Row[][]>;
  commit(statements: Statement[]): Promise<void>;
}
