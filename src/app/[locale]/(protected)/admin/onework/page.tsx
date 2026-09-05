import { AdminMembershipSection } from '@/components/dashboard/admin-membership-section';
import { canAccessHermesAdmin } from '@/lib/hermes-admin-access';
import { getSession } from '@/lib/server';
import { notFound } from 'next/navigation';

export default async function OneWorkAdminPage() {
  const session = await getSession();
  if (!canAccessHermesAdmin(session?.user)) {
    notFound();
  }
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 lg:px-6">
      <div>
        <h1 className="text-2xl font-semibold">会员发码与记录</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          在这里统一发放会员码，查看兑换记录。网站和小程序共用会员身份。
        </p>
      </div>
      <AdminMembershipSection />
    </div>
  );
}
