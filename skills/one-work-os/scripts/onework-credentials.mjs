import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let cached;

function parseEnvFile(raw) {
  const values = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator <= 0) continue;
    const name = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    values[name] = value;
  }
  return values;
}

/** Load credentials kept beside the installed Skill without printing them. */
export function getOneWorkEnv() {
  if (cached) return cached;
  const skillRoot = dirname(dirname(fileURLToPath(import.meta.url)));
  const workbuddyRoot = dirname(dirname(skillRoot));
  const envPaths = [
    join(workbuddyRoot, 'one-work-os.local.env'),
    join(skillRoot, '.env'),
  ];
  cached = {};
  for (const envPath of envPaths) {
    try {
      cached = { ...cached, ...parseEnvFile(readFileSync(envPath, 'utf8')) };
    } catch {
      // Keep trying the next local credential location.
    }
  }
  return cached;
}

export function getOneWorkApiKey() {
  return (
    process.env.ONEWORK_API_KEY ||
    getOneWorkEnv().ONEWORK_API_KEY ||
    ''
  ).trim();
}

export function getOneWorkDeviceId() {
  return (
    process.env.ONEWORK_DEVICE_ID ||
    getOneWorkEnv().ONEWORK_DEVICE_ID ||
    ''
  ).trim();
}

export function requireOneWorkCredentials() {
  const apiKey = getOneWorkApiKey();
  const deviceId = getOneWorkDeviceId();
  if (!apiKey) {
    throw new Error(
      '尚未连接 OneWorkOS。请登录 https://www.dlgzz.com/onework，复制“AI 安装指令”完成安装，然后重启 WorkBuddy。'
    );
  }
  // Device IDs are mandatory for newly managed installs. Keep an empty value
  // compatible with pre-0.2 API keys; the server accepts it only when that Key
  // has no device record and will return a precise error for managed Keys.
  return { apiKey, deviceId };
}

export function getOneWorkAuthHeaders({ json = true } = {}) {
  const { apiKey, deviceId } = requireOneWorkCredentials();
  return {
    Authorization: `Bearer ${apiKey}`,
    ...(deviceId ? { 'X-OneWork-Device-ID': deviceId } : {}),
    ...(json ? { 'Content-Type': 'application/json' } : {}),
  };
}

export function oneWorkApiErrorMessage(data, status) {
  const code = typeof data?.code === 'string' ? data.code.toUpperCase() : '';
  if (code === 'DEVICE_ID_REQUIRED' || code === 'DEVICE_NOT_BOUND') {
    return 'OneWorkOS 设备绑定信息缺失。请在 https://www.dlgzz.com/onework 重新运行安装指令。';
  }
  if (code === 'DEVICE_MISMATCH' || code === 'DEVICE_REVOKED') {
    return 'OneWorkOS 当前电脑的授权已失效。请登录 https://www.dlgzz.com/onework 为这台电脑重新生成安装授权。';
  }
  if (code === 'ENTITLEMENT_EXPIRED') {
    return 'OneWorkOS 会员权益已到期，请在 https://www.dlgzz.com/onework 续费后重试。';
  }
  if (code === 'PACK_NOT_LICENSED') {
    return '当前 OneWorkOS 权益尚未开放这个知识包，请在 https://www.dlgzz.com/onework 查看已开通权益。';
  }
  if (code === 'RATE_LIMITED') {
    return 'OneWorkOS 能力路由请求过于频繁，请稍等一分钟后再试。';
  }
  if (
    code === 'REVOKED' ||
    code === 'INVALID' ||
    code === 'MISSING' ||
    status === 401
  ) {
    return 'OneWorkOS 授权无效或已被替换。请在 https://www.dlgzz.com/onework 重新运行安装指令，然后重启 WorkBuddy。';
  }
  if (code === 'QUOTA_EXCEEDED') {
    return 'OneWorkOS 本月调用额度已用完，可在 https://www.dlgzz.com/onework 查看当前权益。';
  }
  if (status === 429) {
    return data?.error || 'OneWorkOS 请求过于频繁，请稍后重试。';
  }
  return (
    data?.error ||
    (status === 403
      ? 'OneWorkOS 拒绝了当前请求，请在账号页检查权益和设备授权。'
      : `HTTP ${status}`)
  );
}
