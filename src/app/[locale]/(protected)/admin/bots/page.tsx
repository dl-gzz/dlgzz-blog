import { BotAdminDashboard } from '@/components/bots/bot-admin-dashboard';
import { canAccessHermesAdmin } from '@/lib/hermes-admin-access';
import { getSession } from '@/lib/server';

export default async function AdminBotsPage() {
  const session = await getSession();

  if (!canAccessHermesAdmin(session?.user)) {
    return (
      <div className="space-y-2 px-4 lg:px-6">
        <h1 className="text-2xl font-semibold tracking-normal">
          无法访问助手管理后台
        </h1>
        <p className="text-sm text-muted-foreground">
          这个后台只对管理员或 Hermes 管理员邮箱开放。
        </p>
      </div>
    );
  }

  return <BotAdminDashboard />;
}
