export const disposablePort=3100;
export const disposableOrigin=`http://127.0.0.1:${disposablePort}`;
export const hostedOrigin='https://zuri-holidays-crm-demo.pied-mugger-0k.workers.dev';

type Environment=Record<string,string|undefined>;
const urlOverrides=['CRM_E2E_LIVE_URL','CRM_E2E_BASE_URL','PLAYWRIGHT_TEST_BASE_URL','CRM_SMOKE_ORIGIN'];

export function disposableTarget(env:Environment) {
  if ([...urlOverrides,'CRM_SMOKE_STAFF_SESSION']
    .some(name=>env[name]!==undefined)) {
    throw new Error('Local CRM tests reject hosted URLs and credentials. Use the dedicated hosted smoke configuration.');
  }
  if (env.CRM_E2E_TARGET!=='sqlite'&&env.CRM_E2E_TARGET!=='workers') {
    throw new Error('Select a disposable CRM test target with npm run test:e2e or npm run test:e2e:worker.');
  }
  return env.CRM_E2E_TARGET;
}

export function assertHostedTarget(env:Environment) {
  if ([...urlOverrides,'CRM_E2E_TARGET'].some(name=>env[name]!==undefined)) {
    throw new Error('Hosted smoke uses the fixed Worker origin. Unset other CRM test targets and URL overrides.');
  }
}
