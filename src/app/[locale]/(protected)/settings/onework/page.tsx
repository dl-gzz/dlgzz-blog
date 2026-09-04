import { MembershipPanel } from '@/components/membership/membership-panel';
import { OneWorkAccessPanel } from '@/components/onework/onework-access-panel';

export default function OneWorkSettingsPage() {
  // 普通用户需要在设置页直接输入购买后收到的兑换码；隐藏兑换卡片会让
  // 新账号只能看到“暂无已激活知识包”，却找不到开通入口。
  return (
    <div className="space-y-10">
      <MembershipPanel />
      <OneWorkAccessPanel showRedeem />
    </div>
  );
}
