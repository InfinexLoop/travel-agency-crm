import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import type { SqlValue } from '../../server/persistence';
import { digest, portalLinkDigest, sessionDigest } from '../../server/auth';
import { bookingAccess, quoteAccess } from '../../server/commercial';
import { dataset } from '../../server/queries';

const { fixture }=vi.hoisted(()=>({fixture:{db:undefined as DatabaseSync|undefined}}));
vi.mock('../../server/platform.ts',()=>({
  localDemoSignInEnabled:()=>false,
  publicDemoSignInEnabled:()=>false,
  database:()=>{
    const select=({sql,params}:{sql:string;params:SqlValue[]})=>fixture.db!.prepare(sql).all(...params);
    return {select,readBatch:async (statements:Parameters<typeof select>[0][])=>statements.map(select)};
  },
}));

beforeAll(()=>{
  const dir=new URL('../../db/',import.meta.url);
  const db=fixture.db=new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  for (const file of readdirSync(dir).sort().filter(name=>/^00[1-6]-.*\.sql$/.test(name))) {
    db.exec(readFileSync(new URL(file,dir),'utf8'));
  }
  db.exec(`
    INSERT INTO roles VALUES ('admin','Admin'),('sales','Sales');
    INSERT INTO settings VALUES ('seed_version','1');
    INSERT INTO users(id,name,email,hash,role) VALUES
      ('owner-fixture','Private owner','owner@example.test','owner-hash','admin'),
      ('sales-fixture','Sales','sales@example.test','sales-hash','sales');
    INSERT INTO sessions VALUES ('staff-session','owner-fixture','2099-01-01');
  `);
  db.exec(readFileSync(new URL('007-demo-quick-login.sql',dir),'utf8'));
});

afterAll(()=>fixture.db?.close());

it('preserves existing private sessions and makes quick sessions unreadable by older Workers',()=>{
  const db=fixture.db!;
  expect(db.prepare("SELECT token,sign_in FROM sessions WHERE user_id='owner-fixture'").get()).toEqual({token:'staff-session',sign_in:'password'});
  expect(db.prepare("SELECT hash FROM users WHERE id='owner-fixture'").get()).toEqual({hash:'owner-hash'});
  expect(db.prepare("SELECT role FROM users WHERE id='USR-DEMO-OWNER'").get()).toEqual({role:'admin'});
  expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  const sample='a'.repeat(43);
  expect(sessionDigest(sample,'password')).toBe(digest(sample));
  expect(sessionDigest(sample,'quick')).not.toBe(digest(sample));
  expect(portalLinkDigest(sample)).toBe(digest(sample));
  expect(portalLinkDigest(sample,true)).not.toBe(digest(sample));
});

it('requires a sales assignment for the customer named on a quote and booking',async ()=>{
  fixture.db!.exec(`
    INSERT INTO customers(id,name) VALUES ('assigned','Assigned'),('unassigned','Unassigned');
    INSERT INTO customer_sales_assignments VALUES ('assigned','sales-fixture');
    INSERT INTO leads(id,customer_id,source,owner) VALUES ('lead','assigned','Website','sales-fixture');
    INSERT INTO quotes(id,lead_id,customer_id,destination,departure,return_date,adults,children,itinerary,cost,markup,discount,extras,tax,total,advance,expiry)
      VALUES ('matched-quote','lead','assigned','Dubai','2099-01-01','2099-01-02',1,0,'[]',100,0,0,0,0,100,50,'2099-01-01'),
        ('other-quote','lead','unassigned','Dubai','2099-01-01','2099-01-02',1,0,'[]',100,0,0,0,0,100,50,'2099-01-01');
    INSERT INTO bookings(id,quote_id,customer_id,destination,departure,return_date,itinerary,total,cost,advance)
      VALUES ('matched-booking','matched-quote','assigned','Dubai','2099-01-01','2099-01-02','[]',100,100,50),
        ('other-booking','other-quote','unassigned','Dubai','2099-01-01','2099-01-02','[]',100,100,50);
    INSERT INTO quote_revisions(quote_id,version,snapshot) VALUES ('matched-quote',1,'{}'),('other-quote',1,'{}');
  `);
  const sales={id:'sales-fixture',role:'sales' as const,name:'Sales',email:'sales@example.test',customer_id:null};
  expect((await dataset(sales)).quotes.map(row=>row.id)).toEqual(['matched-quote']);
  expect((await dataset(sales)).bookings.map(row=>row.id)).toEqual(['matched-booking']);
  expect((await dataset(sales)).revisions.map(row=>row.quote_id)).toEqual(['matched-quote']);
  await expect(quoteAccess(sales,'matched-quote')).resolves.toMatchObject({id:'matched-quote'});
  await expect(bookingAccess(sales,'matched-booking')).resolves.toMatchObject({id:'matched-booking'});
  await expect(quoteAccess(sales,'other-quote')).rejects.toMatchObject({status:404});
  await expect(bookingAccess(sales,'other-booking')).rejects.toMatchObject({status:404});
});
