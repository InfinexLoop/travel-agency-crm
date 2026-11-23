import { hostedOrigin } from './targets';

const routes=['/','/portal','/api/crm/data','/api/crm/data?space=portal','/api/crm/report/bookings','/api/crm/file/document/DOC-SMOKE-CHECK'] as const;
export type HostedRoute=typeof routes[number];

export function hostedStaffSession(env:Record<string,string|undefined>) {
  const staffSession=env.CRM_SMOKE_STAFF_SESSION;
  if (staffSession!==undefined&&!/^[a-zA-Z0-9_-]{43}$/.test(staffSession)) {
    throw new Error('Hosted smoke requires a valid existing staff session value when provided.');
  }
  return staffSession;
}

export async function hostedRead(route:HostedRoute,staffSession?:string) {
  if (!routes.includes(route)) throw new Error('Unsupported hosted smoke route.');
  try {
    const headers=new Headers();
    if (route==='/api/crm/data'&&staffSession) headers.set('Cookie','zuri_staff='+staffSession);
    return await fetch(hostedOrigin+route,{method:'GET',headers,redirect:'manual',signal:AbortSignal.timeout(15_000)});
  } catch {
    throw new Error('Hosted smoke request failed.');
  }
}
