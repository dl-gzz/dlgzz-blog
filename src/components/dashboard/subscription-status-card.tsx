import { MembershipPanel } from '@/components/membership/membership-panel';
import { Button } from '@/components/ui/button';
import { LocaleLink } from '@/i18n/navigation';
import { Routes } from '@/routes';

/** Display shared membership, never infer it from payment history. */
export function SubscriptionStatusCard() {
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">我的会员与阅读</h1>
      <p className="text-sm text-muted-foreground">
        文章全部公开。兑换一次会员码，网站和已关联的小程序共享会员身份。
      </p>
      <MembershipPanel />
      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <LocaleLink href={Routes.Blog}>开始阅读</LocaleLink>
        </Button>
        <Button variant="outline" asChild>
          <LocaleLink href={Routes.SettingsOneWork}>连接 AI 客户端</LocaleLink>
        </Button>
        <Button variant="outline" asChild>
          <LocaleLink href={Routes.SettingsBilling}>查看支付记录</LocaleLink>
        </Button>
      </div>
    </div>
  );
}
