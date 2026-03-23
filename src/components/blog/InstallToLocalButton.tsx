'use client';

import { useEffect, useMemo, useState } from 'react';
import { buildServicePackageApiPath } from '@/lib/service-routes';
import type { ServiceManifestV1 } from '@/lib/service-manifest';

interface InstallToLocalButtonProps {
  title: string;
  description: string;
  slug: string;
  locale?: string;
  whiteboardPrompt?: string;
  serviceManifest?: ServiceManifestV1 | null;
  localPort?: number;
}

type LocalInstallState =
  | 'checking'
  | 'not_installed'
  | 'installed'
  | 'upgrade_available'
  | 'local_unreachable';

function compareVersions(a: string, b: string) {
  const left = a
    .trim()
    .split('.')
    .map((segment) => Number(segment.match(/\d+/)?.[0] || 0));
  const right = b
    .trim()
    .split('.')
    .map((segment) => Number(segment.match(/\d+/)?.[0] || 0));
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    const l = left[index] ?? 0;
    const r = right[index] ?? 0;
    if (l > r) return 1;
    if (l < r) return -1;
  }

  return 0;
}

function getLocalBadge(state: LocalInstallState, localVersion?: string | null) {
  switch (state) {
    case 'installed':
      return {
        label: localVersion ? `已安装 v${localVersion}` : '已安装',
        className: 'border-slate-200 bg-slate-50 text-slate-700',
      };
    case 'upgrade_available':
      return {
        label: localVersion ? `可升级 当前 v${localVersion}` : '可升级',
        className: 'border-orange-200 bg-orange-50 text-orange-700',
      };
    case 'local_unreachable':
      return {
        label: '未连接线下',
        className: 'border-rose-200 bg-rose-50 text-rose-700',
      };
    case 'checking':
      return {
        label: '检查中',
        className: 'border-slate-200 bg-slate-50 text-slate-600',
      };
    default:
      return {
        label: '未安装',
        className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      };
  }
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
  const [localInstallState, setLocalInstallState] = useState<LocalInstallState>(
    serviceManifest ? 'checking' : 'not_installed'
  );
  const [localVersion, setLocalVersion] = useState<string | null>(null);
  const [installFeedback, setInstallFeedback] = useState('');

  useEffect(() => {
    if (!serviceManifest) {
      setLocalInstallState('not_installed');
      setLocalVersion(null);
      return;
    }

    const controller = new AbortController();

    const loadLocalStatus = async () => {
      try {
        const response = await fetch(`http://localhost:${localPort}/api/shape-packages/installed`, {
          method: 'GET',
          cache: 'no-store',
          signal: controller.signal,
        });
        const data = await response.json().catch(() => null);
        if (!response.ok || !Array.isArray(data?.items)) {
          throw new Error('LOCAL_STATUS_FAILED');
        }

        const matched = data.items.find(
          (item: any) => item?.manifest?.id === serviceManifest.id
        );

        if (!matched?.manifest?.version) {
          setLocalInstallState('not_installed');
          setLocalVersion(null);
          return;
        }

        const installedVersion = String(matched.manifest.version);
        setLocalVersion(installedVersion);
        setLocalInstallState(
          compareVersions(serviceManifest.version, installedVersion) > 0
            ? 'upgrade_available'
            : 'installed'
        );
      } catch {
        if (controller.signal.aborted) return;
        setLocalInstallState('local_unreachable');
        setLocalVersion(null);
      }
    };

    void loadLocalStatus();

    return () => controller.abort();
  }, [localPort, serviceManifest]);

  const localStatusText = useMemo(() => {
    if (!serviceManifest) return '';
    if (installFeedback) return installFeedback;

    switch (localInstallState) {
      case 'checking':
        return '正在检查线下客户端状态';
      case 'installed':
        return localVersion
          ? `线下已安装 v${localVersion}`
          : '线下已安装这个组件';
      case 'upgrade_available':
        return localVersion
          ? `线下当前 v${localVersion}，可升级到 v${serviceManifest.version}`
          : `发现可升级版本 v${serviceManifest.version}`;
      case 'local_unreachable':
        return '暂未连接到线下客户端，安装时会再尝试连接';
      default:
        return '线下还没有安装这个组件';
    }
  }, [installFeedback, localInstallState, localVersion, serviceManifest]);

  const buttonLabel = useMemo(() => {
    if (!serviceManifest) return '安装到本地';

    switch (localInstallState) {
      case 'checking':
        return '检查本地状态';
      case 'installed':
        return '重新安装到客户端';
      case 'upgrade_available':
        return '升级到客户端';
      default:
        return '安装到客户端';
    }
  }, [localInstallState, serviceManifest]);

  const badge = useMemo(
    () => (serviceManifest ? getLocalBadge(localInstallState, localVersion) : null),
    [localInstallState, localVersion, serviceManifest]
  );

  const handleClick = async () => {
    if (!serviceManifest) {
      const params = new URLSearchParams({
        article: slug,
        title,
        desc: description,
        ...(whiteboardPrompt ? { prompt: whiteboardPrompt } : {}),
      });
      window.open(`http://localhost:${localPort}/${locale}/whiteboard?${params.toString()}`, '_blank');
      return;
    }

    setInstallFeedback('');
    const packageUrl = new URL(buildServicePackageApiPath(locale, slug), window.location.origin).toString();

    try {
      const packageResponse = await fetch(packageUrl, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      });
      const packageData = await packageResponse.json().catch(() => null);

      if (!packageResponse.ok || !packageData?.shape_package) {
        const reason = String(packageData?.error || '安装前校验失败');
        const helper = packageData?.code === 'AUTH_REQUIRED'
          ? '请先在商店端登录，再回来安装。'
          : packageData?.code === 'PREMIUM_REQUIRED'
            ? '这个组件需要先在商店端升级会员后才能安装。'
            : packageData?.code === 'LICENSE_REQUIRED'
              ? '这个组件需要先在商店端完成单独购买后才能安装。'
              : '';
        window.alert(`${reason}${helper ? `\n${helper}` : ''}`);
        return;
      }

      const localInstallResponse = await fetch(`http://localhost:${localPort}/api/shape-packages/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shape_package: packageData.shape_package }),
      });
      const localInstallData = await localInstallResponse.json().catch(() => null);

      if (!localInstallResponse.ok || localInstallData?.success === false) {
        const reason = String(localInstallData?.error || '本地客户端安装失败，请确认线下客户端已经启动。');
        const helper = localInstallData?.code === 'HOST_VERSION_TOO_OLD'
          ? `请先升级线下客户端版本，再回来安装。\n当前版本：${localInstallData?.current_host_version || '-'}\n所需版本：${localInstallData?.required_host_version || '-'}`
          : '';
        window.alert(`${reason}${helper ? `\n${helper}` : ''}`);
        return;
      }

      const nextVersion = String(localInstallData?.next_version || serviceManifest.version);
      const action = String(localInstallData?.install_action || 'installed');
      const feedback =
        action === 'upgraded'
          ? `已升级到线下 v${nextVersion}`
          : action === 'reinstalled'
            ? `线下已重新安装 v${nextVersion}`
            : action === 'downgraded'
              ? `已覆盖安装到线下 v${nextVersion}`
              : `已安装到线下 v${nextVersion}`;

      setLocalInstallState('installed');
      setLocalVersion(nextVersion);
      setInstallFeedback(feedback);

      window.open(`http://localhost:${localPort}/${locale}/services/installed`, '_blank');
    } catch {
      setLocalInstallState('local_unreachable');
      window.alert('本地客户端安装失败，请确认线下客户端已经启动。');
    }
  };

  return (
    <div className="flex flex-col items-start gap-2">
      {badge ? (
        <div className={`rounded-full border px-3 py-1 text-xs font-semibold ${badge.className}`}>
          {badge.label}
        </div>
      ) : null}
      <button
        onClick={handleClick}
        title="需要本地运行 One Worker OS"
        className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
      >
        <span>{serviceManifest ? '⬇' : '🪄'}</span>
        <span>{buttonLabel}</span>
      </button>
      {serviceManifest ? (
        <div className="text-xs leading-5 text-muted-foreground">
          {localStatusText}
        </div>
      ) : null}
    </div>
  );
}
