import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const root=mkdtempSync(join(tmpdir(),'zuri-worker-test-'));
const state=join(root,'state');
const seed=join(root,'seed.json');
const env={...process.env,CF_SEND_METRICS:'false',CRM_WORKER_STATE:state,CRM_LOCAL_TEST:'1'};
const command=(args,stdio='inherit')=>{
  const result=spawnSync(process.execPath,args,{env,stdio});
  if (result.status!==0) throw new Error(`Worker test setup failed in ${args[0]}`);
};
try {
  const {databaseId}=await import('../cloudflare/resources.ts');
  const cf='node_modules/cf/bin/cf';
  command([cf,'d1','migrations','apply',databaseId,'--local','--persist-to',state,'--dir','db']);
  command(['scripts/cloudflare-seed.ts',seed]);
  command([cf,'d1','raw',databaseId,'--local','--persist-to',state,'--batch','@'+seed],['ignore','ignore','inherit']);
  command(['node_modules/vite/bin/vite.js','build']);
} catch (error) {
  rmSync(root,{recursive:true,force:true});
  throw error;
}
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','3100','--strictPort'],{env,stdio:'inherit'});
for (const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>server.kill(signal));
server.on('exit',code=>{
  rmSync(root,{recursive:true,force:true});
  process.exit(code||0);
});
