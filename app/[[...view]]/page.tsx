import { Workspace } from '../../components/workspace';
import { demo, demoSignInPassword } from '../../server/auth';
export const dynamic='force-dynamic';
export default function Page() { return <Workspace demo={demo} demoPassword={demoSignInPassword()}/>; }
