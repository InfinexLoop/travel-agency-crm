import vinext from 'vinext/server/fetch-handler';

export default {
  async fetch(request:Request,env:unknown,ctx:unknown) {
    const response:Response=await vinext.fetch(request,env,ctx);
    const headers=new Headers(response.headers);
    headers.set('Cache-Control','private, no-store');
    return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
  },
};
