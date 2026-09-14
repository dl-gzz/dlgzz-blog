import { MembershipPanel } from '@/components/membership/membership-panel';
import { OneWorkAccessPanel } from '@/components/onework/onework-access-panel';

export default function OneWorkSettingsPage() {
  // One redemption form handles both code formats; the second panel is only
  // for connecting AI clients and refreshes when membership changes.
  return (
    <div className="space-y-10">
      <MembershipPanel />
      <OneWorkAccessPanel showRedeem={false} />
    </div>
  );
}
