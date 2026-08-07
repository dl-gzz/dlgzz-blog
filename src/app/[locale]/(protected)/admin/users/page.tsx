import { UsersPageClient } from '@/components/admin/users-page';
import { canAccessHermesAdmin } from '@/lib/hermes-admin-access';
import { getSession } from '@/lib/server';

/**
 * Users page
 *
 * This page is used to manage users for the admin,
 * it is protected and only accessible to the admin role
 */
export default async function UsersPage() {
  const session = await getSession();

  if (!canAccessHermesAdmin(session?.user)) {
    return (
      <div className="space-y-2 px-4 lg:px-6">
        <h1 className="text-2xl font-semibold tracking-normal">
          无法访问用户管理
        </h1>
        <p className="text-sm text-muted-foreground">
          这个页面只对管理员开放。
        </p>
      </div>
    );
  }

  return <UsersPageClient />;
}
