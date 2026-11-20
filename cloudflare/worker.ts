import vinext from 'vinext/server/fetch-handler';

type WorkerContext = { access?: unknown };
type WorkerEnv = { CRM_LOCAL_TEST?: string };

export default {
  async fetch(request:Request,env:WorkerEnv,ctx:WorkerContext) {
    const url=new URL(request.url);
    const local=env.CRM_LOCAL_TEST==='1' && url.protocol==='http:' &&
      ['127.0.0.1','localhost','[::1]'].includes(url.hostname);
    if (!local&&!ctx.access) {
      return new Response('Cloudflare Access is required.',{status:403,headers:{'Cache-Control':'private, no-store'}});
    }
    const response:Response=await vinext.fetch(request,env,ctx);
    const headers=new Headers(response.headers);
    headers.set('Cache-Control','private, no-store');
    return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
  },
};
