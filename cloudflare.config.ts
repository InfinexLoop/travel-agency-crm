import { bindings, defineConfig, defineWorker } from 'cf/config';
import { bucketName, databaseId, databaseName, workerName } from './cloudflare/resources.ts';

export default defineConfig({
  worker: defineWorker({
    name:workerName,
    entrypoint:'./cloudflare/worker.ts',
    compatibilityDate:'2026-11-20',
    workersDev:true,
    previewUrls:false,
    assets:{
      htmlHandling:'none',
      notFoundHandling:'none',
      runWorkerFirst:['/*','!/_next/static/*','!/*/_next/static/*'],
    },
    env:{
      ASSETS:bindings.assets(),
      CRM_LOCAL_TEST:bindings.text(process.env.CRM_LOCAL_TEST==='1'?'1':'0'),
      CRM_PUBLIC_DEMO:bindings.text(process.env.CRM_PUBLIC_DEMO==='1'?'1':'0'),
      DB:bindings.d1({id:databaseId,name:databaseName}),
      FILES:bindings.r2({name:bucketName}),
    },
  }),
});
