import { Workspace } from '../../components/workspace';
export const dynamic='force-dynamic';
export default function Page() { return <Workspace demo={process.env.CRM_DEMO!=='0'}/>; }
