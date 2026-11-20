import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

mkdirSync('data', { recursive:true });
const data=mkdtempSync(resolve('data/test-'));
const env={...process.env,CRM_DATA_DIR:data,CRM_NEXT_DIR:'.next-e2e',CRM_DEMO:'1',NEXT_TELEMETRY_DISABLED:'1'};
const seed=spawnSync(process.execPath,['scripts/database.ts','seed'],{env,stdio:'inherit'});
if(seed.status!==0) {rmSync(data,{recursive:true,force:true});process.exit(seed.status||1);}
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port','3100'],{env,stdio:'inherit'});
for (const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>server.kill(signal));
server.on('exit',code=>{rmSync(data,{recursive:true,force:true});process.exit(code||0);});
