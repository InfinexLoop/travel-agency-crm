import { hostedOrigin } from './targets';

const routes=['/','/portal','/api/crm/data'] as const;
export type HostedRoute=typeof routes[number];

export function hostedCredentials(env:Record<string,string|undefined>) {
  const id=env.CF_ACCESS_CLIENT_ID;
  const secret=env.CF_ACCESS_CLIENT_SECRET;
  const staffSession=env.CRM_SMOKE_STAFF_SESSION;
  if (id!==undefined||secret!==undefined||staffSession!==undefined) {
    if (!id?.trim()||!secret?.trim()||
        (staffSession!==undefined&&!/^[a-zA-Z0-9_-]{43}$/.test(staffSession))) {
      throw new Error('Hosted smoke requires both Access credential values and a valid optional existing staff session.');
    }
    return {id,secret,staffSession};
  }
}

export async function hostedRead(route:HostedRoute,credentials?:ReturnType<typeof hostedCredentials>) {
  if (!routes.includes(route)) throw new Error('Unsupported hosted smoke route.');
  try {
    const headers=new Headers();
    if (credentials) {
      headers.set('CF-Access-Client-Id',credentials.id);
      headers.set('CF-Access-Client-Secret',credentials.secret);
      if (route==='/api/crm/data'&&credentials.staffSession) headers.set('Cookie','zuri_staff='+credentials.staffSession);
    }
    return await fetch(hostedOrigin+route,{method:'GET',headers,redirect:'manual',signal:AbortSignal.timeout(15_000)});
  } catch {
    throw new Error('Hosted smoke request failed.');
  }
}
