#!/usr/bin/env node

/**
 * OneWorkOS 跨平台安装器（Node.js 18+）。
 *
 * 用法（网站一键安装器会自动生成参数；也支持手动调用）：
 *   curl -fsSL https://www.dlgzz.com/downloads/onework-install.mjs | \
 *     node - --server https://www.dlgzz.com --token "owinst_..."
 *
 * 它不会把长期 API Key 放进命令行以外的日志；领取后写入本机：
 *   macOS/Linux: ~/.workbuddy/one-work-os.local.env
 *   Windows:     %USERPROFILE%\\.workbuddy\\one-work-os.local.env
 */
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, renameSync, writeFileSync, mkdtempSync, rmSync, chmodSync } from 'node:fs';
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
const nodeMajor = Number(process.versions.node.split('.')[0]);
if (!Number.isFinite(nodeMajor) || nodeMajor < 18) {
  throw new Error(`需要 Node.js 18+，当前版本为 ${process.versions.node}`);
}
const serverUrl = new URL(server);
if (!['http:', 'https:'].includes(serverUrl.protocol)) {
  throw new Error('安装服务器地址必须使用 http 或 https');
}
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

let credentialTemp = join(targetDir, `.one-work-os.local.env.tmp-${randomUUID()}`);
process.on('exit', () => {
  if (credentialTemp) rmSync(credentialTemp, { force: true });
});
writeFileSync(
  credentialTemp,
  `# OneWorkOS managed credential\nONEWORK_API_KEY=${data.key.rawKey}\n`,
  { encoding: 'utf8', mode: 0o600 }
);
try {
  chmodSync(credentialTemp, 0o600);
} catch {
  // Windows does not support POSIX mode bits; the file is still private to the user profile.
}

let skillTarget;
let skillBackup;

if (!skipSkill) {
  const zipResponse = await fetch(`${server}/downloads/oneworkos-workbuddy-skill-latest.zip`);
  if (!zipResponse.ok) {
    rmSync(credentialTemp, { force: true });
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
    skillTarget = join(targetDir, 'skills', 'one-work-os');
    if (!existsSync(join(skillSource, 'SKILL.md')) || !existsSync(join(skillSource, 'manifest.yaml'))) {
      throw new Error('Skill 安装包不完整：缺少 SKILL.md 或 manifest.yaml');
    }
    mkdirSync(join(targetDir, 'skills'), { recursive: true, mode: 0o700 });
    if (existsSync(skillTarget)) {
      skillBackup = `${skillTarget}.bak-${Date.now()}-${randomUUID().slice(0, 8)}`;
      renameSync(skillTarget, skillBackup);
    }
    try {
      renameSync(skillSource, skillTarget);
    } catch (error) {
      if (skillBackup && existsSync(skillBackup)) renameSync(skillBackup, skillTarget);
      throw error;
    }
    console.log(`Skill 已安装：${skillTarget}`);
  } finally {
    rmSync(archivePath, { force: true });
    rmSync(stagingRoot, { recursive: true, force: true });
  }
}

const credentialBackup = existsSync(targetFile)
  ? `${targetFile}.bak-${Date.now()}-${randomUUID().slice(0, 8)}`
  : null;
try {
  if (credentialBackup) renameSync(targetFile, credentialBackup);
  renameSync(credentialTemp, targetFile);
  credentialTemp = '';
} catch (error) {
  if (credentialBackup && existsSync(credentialBackup)) renameSync(credentialBackup, targetFile);
  if (skillTarget && skillBackup && existsSync(skillBackup) && existsSync(skillTarget)) {
    rmSync(skillTarget, { recursive: true, force: true });
    renameSync(skillBackup, skillTarget);
  }
  throw error;
} finally {
  if (credentialTemp) rmSync(credentialTemp, { force: true });
}

console.log(`OneWorkOS 已连接：${data.key.keyPrefix}`);
console.log(`知识包：${(data.packs || []).join(', ')}`);
console.log(`凭据已写入：${targetFile}`);

console.log('请重启 WorkBuddy，使 Skill 读取新的授权。');
