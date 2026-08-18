import Container from '@/components/layout/container';
import { OneWorkOAuthConsent } from '@/components/onework/onework-oauth-consent';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '授权连接 OneWorkOS',
  description: '确认 WorkBuddy 或其他 AI 客户端访问 OneWorkOS 的权限。',
  robots: { index: false, follow: false },
};

export default function OneWorkOAuthAuthorizePage() {
  return (
    <Container className="px-4 py-16 sm:py-24">
      <OneWorkOAuthConsent />
    </Container>
  );
}
