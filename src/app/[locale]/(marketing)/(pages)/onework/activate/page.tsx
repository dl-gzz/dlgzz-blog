import Container from '@/components/layout/container';
import { OneWorkDeviceActivation } from '@/components/onework/onework-device-activation';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '设备授权 | OneWorkerOS',
  description: '使用设备码将 WorkBuddy 或其他 AI 客户端连接到 OneWorkerOS。',
  robots: { index: false, follow: false },
};

export default function OneWorkActivatePage() {
  return (
    <Container className="px-4 py-16 sm:py-24">
      <OneWorkDeviceActivation />
    </Container>
  );
}
