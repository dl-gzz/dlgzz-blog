import { OneWorkAdminPanel } from '@/components/onework/onework-admin-panel';
import { canAccessHermesAdmin } from '@/lib/hermes-admin-access';
import { getSession } from '@/lib/server';

export default async function OneWorkAdminPage() {
  const session = await getSession();
  if (!canAccessHermesAdmin(session?.user)) {
    return <div className="px-4 text-sm text-muted-foreground">这个页面只对管理员开放。</div>;
  }
  return <OneWorkAdminPanel />;
}

