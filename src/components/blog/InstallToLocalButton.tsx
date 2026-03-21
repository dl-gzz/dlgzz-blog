'use client';

import { buildServiceInstallApiPath } from '@/lib/service-routes';
import {
  serializeServiceManifest,
  type ServiceManifestV1,
} from '@/lib/service-manifest';

interface InstallToLocalButtonProps {
  title: string;
  description: string;
  slug: string;
  locale?: string;
  whiteboardPrompt?: string;
  serviceManifest?: ServiceManifestV1 | null;
  localPort?: number;
}

export function InstallToLocalButton({
  title,
  description,
  slug,
  locale = 'zh',
  whiteboardPrompt,
  serviceManifest,
  localPort = 3001,
}: InstallToLocalButtonProps) {
  const handleClick = async () => {
    const manifestUrl = serviceManifest
      ? new URL(buildServiceInstallApiPath(locale, slug), window.location.origin).toString()
      : null;

    const params = new URLSearchParams({
      article: slug,
      title,
      desc: description,
    });

    if (manifestUrl) {
      try {
        const response = await fetch(manifestUrl, {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
        });
        const data = await response.json().catch(() => null);

        if (!response.ok || !data?.manifest) {
          const reason = String(data?.error || '安装前校验失败');
          const helper = data?.code === 'AUTH_REQUIRED'
            ? '请先在商店端登录，再回来安装。'
            : data?.code === 'PREMIUM_REQUIRED'
              ? '这个组件需要先在商店端升级会员后才能安装。'
              : data?.code === 'LICENSE_REQUIRED'
                ? '这个组件需要先在商店端完成单独购买后才能安装。'
                : '';
          window.alert(`${reason}${helper ? `\n${helper}` : ''}`);
          return;
        }

        params.set('manifest', serializeServiceManifest(data.manifest));
        if (typeof data?.whiteboard_prompt === 'string' && data.whiteboard_prompt.trim()) {
          params.set('prompt', data.whiteboard_prompt.trim());
        }
      } catch {
        window.alert('安装前校验失败，请稍后重试。');
        return;
      }
    } else if (whiteboardPrompt) {
      params.set('prompt', whiteboardPrompt);
    }

    window.open(`http://localhost:${localPort}/${locale}/whiteboard?${params.toString()}`, '_blank');
  };

  return (
    <button
      onClick={handleClick}
      title="需要本地运行 One Worker OS"
      className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
    >
      <span>{serviceManifest ? '⬇' : '🪄'}</span>
      <span>{serviceManifest ? '安装到客户端' : '安装到本地'}</span>
    </button>
  );
}
