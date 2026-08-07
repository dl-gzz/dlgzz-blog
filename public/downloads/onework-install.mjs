#!/usr/bin/env node

/**
 * OneWorkOS 跨平台安装器（Node.js 18+）。
 *
 * 用法（网站生成安装授权后复制）：
 *   curl -fsSL https://www.dlgzz.com/downloads/onework-install.mjs | \
 *     node - --server https://www.dlgzz.com --token "owinst_..."
 *
 * 它不会把长期 API Key 放进命令行以外的日志；领取后写入本机：
 *   macOS/Linux: ~/.workbuddy/one-work-os.local.env
 *   Windows:     %USERPROFILE%\\.workbuddy\\one-work-os.local.env
 */
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, renameSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir, hostname, platform, release } from 'node:os';
import { join } from 'node:path';

function arg(name, fallback = '') {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

function required(name) {
  const value = arg(name);
  if (!value) throw new Error(`缺少参数 ${name}`);
  return value;
}

const server = arg('--server', 'https://www.dlgzz.com').replace(/\/$/, '');
const token = required('--token');
const deviceName = arg('--device-name', hostname());
const skipSkill = process.argv.includes('--skip-skill');
const deviceId = createHash('sha256')
  .update(`${hostname()}|${platform()}|${release()}|${homedir()}`)
  .digest('hex');

const response = await fetch(`${server}/api/onework/install/claim`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    token,
    deviceId,
    deviceName,
    platform: platform(),
  }),
});
const data = await response.json().catch(() => ({}));
if (!response.ok || !data.success || !data.key?.rawKey) {
  throw new Error(data.error || `安装授权失败（HTTP ${response.status}）`);
}

const targetDir = join(homedir(), '.workbuddy');
const targetFile = join(targetDir, 'one-work-os.local.env');
mkdirSync(targetDir, { recursive: true, mode: 0o700 });
if (existsSync(targetFile)) {
  renameSync(targetFile, `${targetFile}.bak-${Date.now()}-${randomUUID().slice(0, 8)}`);
}
writeFileSync(
  targetFile,
  `# OneWorkOS managed credential\nONEWORK_API_KEY=${data.key.rawKey}\n`,
  { encoding: 'utf8', mode: 0o600 }
);

console.log(`OneWorkOS 已连接：${data.key.keyPrefix}`);
console.log(`知识包：${(data.packs || []).join(', ')}`);
console.log(`凭据已写入：${targetFile}`);

if (!skipSkill) {
  const zipResponse = await fetch(`${server}/downloads/oneworkos-workbuddy-skill-latest.zip`);
  if (!zipResponse.ok) {
    throw new Error(`Skill 安装包下载失败（HTTP ${zipResponse.status}）。如需只写入 Key，请追加 --skip-skill。`);
  }
  const archivePath = join(targetDir, `.onework-skill-${Date.now()}.zip`);
  const stagingRoot = mkdtempSync(join(targetDir, '.onework-skill-staging-'));
  writeFileSync(archivePath, Buffer.from(await zipResponse.arrayBuffer()), { mode: 0o600 });
  try {
    if (process.platform === 'win32') {
      execFileSync('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-Command',
        `Expand-Archive -LiteralPath '${archivePath.replaceAll("'", "''")}' -DestinationPath '${stagingRoot.replaceAll("'", "''")}' -Force`,
      ], { stdio: 'ignore' });
    } else {
      execFileSync('unzip', ['-q', '-o', archivePath, '-d', stagingRoot], { stdio: 'ignore' });
    }
    const skillSource = join(stagingRoot, 'one-work-os');
    const skillTarget = join(targetDir, 'skills', 'one-work-os');
    mkdirSync(join(targetDir, 'skills'), { recursive: true, mode: 0o700 });
    if (existsSync(skillTarget)) {
      renameSync(skillTarget, `${skillTarget}.bak-${Date.now()}`);
    }
    renameSync(skillSource, skillTarget);
    console.log(`Skill 已安装：${skillTarget}`);
  } finally {
    rmSync(archivePath, { force: true });
    rmSync(stagingRoot, { recursive: true, force: true });
  }
}

console.log('请重启 WorkBuddy，使 Skill 读取新的授权。');
