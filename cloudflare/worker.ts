import { createRemoteJWKSet, jwtVerify } from 'jose';
import vinext from 'vinext/server/fetch-handler';
import { accessAudience, accessIssuer } from './resources.ts';

type WorkerEnv = { CRM_LOCAL_TEST?: string };
const keys=createRemoteJWKSet(new URL('/cdn-cgi/access/certs',accessIssuer));

async function authorized(request:Request) {
  const token=request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) return false;
  try {
    await jwtVerify(token,keys,{
      issuer:accessIssuer,
      audience:accessAudience,
      algorithms:['RS256'],
      requiredClaims:['exp','iat'],
    });
    return true;
  } catch {
    return false;
  }
}

export default {
  async fetch(request:Request,env:WorkerEnv,ctx:unknown) {
    const url=new URL(request.url);
    const local=env.CRM_LOCAL_TEST==='1' && url.protocol==='http:' &&
      ['127.0.0.1','localhost','[::1]'].includes(url.hostname);
    if (!local&&!await authorized(request)) {
      return new Response('Cloudflare Access is required.',{status:403,headers:{'Cache-Control':'private, no-store'}});
    }
    const response:Response=await vinext.fetch(request,env,ctx);
    const headers=new Headers(response.headers);
    headers.set('Cache-Control','private, no-store');
    return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
  },
};
