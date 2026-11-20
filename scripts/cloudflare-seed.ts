import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

const target=process.argv[2];
if (!target) throw new Error('Usage: npm run db:seed:cloudflare -- <output.json>');

const guard="NOT EXISTS (SELECT 1 FROM settings WHERE key='seed_version')";
const tables=[
  'roles','customers','users','workflows','suppliers','packages','package_days',
  'package_suppliers','leads','conversations','messages','events','submissions',
  'quotes','quote_revisions','bookings','tasks','travellers','booking_travellers','supplier_jobs',
  'settlements','payments','invoices','documents','visas','feedback','notifications','settings',
] as const;
const dir=mkdtempSync(join(tmpdir(),'zuri-crm-synthetic-'));
try {
  const build=spawnSync(process.execPath,['scripts/database.ts','seed'],{
    env:{...process.env,CRM_DEMO:'1',CRM_DATA_DIR:dir},encoding:'utf8',
  });
  if (build.status!==0) throw new Error(build.stderr||'Synthetic seed generation failed');
  const db=new DatabaseSync(join(dir,'crm.sqlite'),{readOnly:true});
  try {
    // The first statement deliberately violates the revision table's CHECK if
    // records predate a seed marker. A D1 batch rolls back on this guard.
    const batch=[{sql:`INSERT INTO crm_write_revision(id,version)
      SELECT 2,0 WHERE ${guard} AND (EXISTS(SELECT 1 FROM customers) OR EXISTS(SELECT 1 FROM users))`}];
    for (const table of tables) {
      const columns=db.prepare(`PRAGMA table_info(${table})`).all().map(col=>`"${col.name}"`);
      const values=db.prepare(`SELECT ${columns.map(column=>`quote(${column})`).join(',')}
        FROM ${table}${
          table==='settings'?" WHERE key<>'seed_version'":table==='workflows'?" WHERE id<>'payment'":""
        } ORDER BY rowid`).all();
      for (let offset=0; offset<values.length; offset+=20) {
        const records=values.slice(offset,offset+20).map(row=>`(${Object.values(row).join(',')})`);
        batch.push({sql:`INSERT INTO ${table} (${columns.join(',')})
          SELECT * FROM (VALUES ${records.join(',')}) WHERE ${guard}`});
      }
    }
    batch.push({sql:`INSERT INTO settings(key,value) SELECT 'seed_version','1' WHERE ${guard}`});
    writeFileSync(target,JSON.stringify(batch),{mode:0o600,flag:'wx'});
    console.log(`Generated ${batch.length} synthetic seed statements at ${target}`);
  } finally {
    db.close();
  }
} finally {
  rmSync(dir,{recursive:true,force:true});
}
