import { getAdminMembershipOverview } from '@/lib/admin-membership-overview';
import { AdminMembershipWorkspace } from './admin-membership-workspace';

export async function AdminMembershipSection() {
  let overview = null;
  try {
    overview = await getAdminMembershipOverview();
  } catch {
    // Do not expose query errors or private database details in the page.
    console.error('[admin-membership] Failed to load overview');
  }
  return <AdminMembershipWorkspace overview={overview} />;
}
