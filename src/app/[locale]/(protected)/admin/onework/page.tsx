import { AdminMembershipSection } from '@/components/dashboard/admin-membership-section';
import { OneWorkAdminPanel } from '@/components/onework/onework-admin-panel';
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
          星球已付费用户用统一会员码；独立销售 AI 检索额度时，再展开下方的
          OneWorkOS 码。
        </p>
      </div>
      <AdminMembershipSection />
      <details className="rounded-xl border bg-card p-5">
        <summary className="cursor-pointer text-sm font-semibold">
          其他产品：OneWorkOS 知识库额度码
        </summary>
        <p className="my-4 text-sm text-muted-foreground">
          这是另一类独立权益，用于 AI
          知识库及每月检索额度，不等同于上方的星球统一会员。日常给星球用户发码，不需要使用这里。
        </p>
        <OneWorkAdminPanel />
      </details>
    </div>
  );
}
