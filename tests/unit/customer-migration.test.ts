import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';

it('leaves legacy customers unassigned and revokes pre-migration portal credentials',()=>{
  const dir=new URL('../../db/',import.meta.url);
  const db=new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA foreign_keys=ON');
    for (const file of readdirSync(dir).sort().filter(name=>/^00[1-5]-.*\.sql$/.test(name))) {
      db.exec(readFileSync(new URL(file,dir),'utf8'));
    }
    db.exec(`
      INSERT INTO roles VALUES ('sales','Sales'),('customer','Customer');
      INSERT INTO customers(id,name) VALUES ('customer-fixture','Synthetic fixture');
      INSERT INTO users(id,name,email,hash,role,customer_id) VALUES
        ('sales-fixture','Sales fixture','sales@example.test','fixture','sales',NULL),
        ('portal-fixture','Portal fixture','portal@example.test','fixture','customer','customer-fixture');
      INSERT INTO leads(id,customer_id,source,owner) VALUES ('lead-fixture','customer-fixture','Website','sales-fixture');
      INSERT INTO sessions VALUES ('staff-fixture','sales-fixture','2099-01-01'),
        ('session-fixture','portal-fixture','2099-01-01');
      INSERT INTO portal_links VALUES ('link-fixture','portal-fixture','2099-01-01');
      INSERT INTO requests VALUES ('link-request','sales-fixture','portal.link','fixture','{}'),
        ('other-request','sales-fixture','lead.create','fixture','{}');
    `);
    db.exec(readFileSync(new URL('006-customer-sales-authorization.sql',dir),'utf8'));
    expect(db.prepare('SELECT * FROM customer_sales_assignments').all()).toEqual([]);
    expect(db.prepare('SELECT owner FROM leads').get()?.owner).toBe('sales-fixture');
    expect(db.prepare('SELECT id FROM customers').get()?.id).toBe('customer-fixture');
    expect(db.prepare('SELECT * FROM portal_links').all()).toEqual([]);
    expect(db.prepare('SELECT token FROM sessions').all()).toEqual([{token:'staff-fixture'}]);
    expect(db.prepare('SELECT key FROM requests').all()).toEqual([{key:'other-request'}]);
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  } finally {
    db.close();
  }
});
