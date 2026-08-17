#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_ORIGIN = 'https://www.dlgzz.com';
const RELEASE_PATH = '/downloads/oneworkos-workbuddy-skill-release.json';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_RELEASE_BYTES = 512 * 1024;
const MAX_ARCHIVE_BYTES = 25 * 1024 * 1024;
const skillRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const workbuddyRoot = dirname(dirname(skillRoot));
const stateFile = join(workbuddyRoot, 'onework-update-state.json');
const backupRoot = join(workbuddyRoot, 'onework-backups');

function parseArgs(argv) {
  return {
    force: argv.includes('--force'),
    checkOnly: argv.includes('--check-only'),
    json: argv.includes('--json'),
  };
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function readVersion(root) {
  const raw = readFileSync(join(root, 'manifest.yaml'), 'utf8');
  const version = raw.match(/^version:\s*["']?([^"'\s]+)["']?\s*$/m)?.[1];
  if (!version || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error('OneWorkerOS manifest.yaml 缺少有效版本号');
  }
  return version;
}

function compareVersions(left, right) {
  const parse = (value) => value.split(/[+-]/, 1)[0].split('.').map(Number);
  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  }
  return 0;
}

function safeReadJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function writeJsonAtomic(path, value) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.tmp-${randomUUID()}`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
  });
  renameSync(temporary, path);
}

async function fetchBuffer(url, { timeoutMs = 15_000, maxBytes }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const declaredSize = Number(response.headers.get('content-length') || 0);
    if (declaredSize > maxBytes)
      throw new Error(`下载内容超过 ${maxBytes} 字节限制`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes)
      throw new Error(`下载内容超过 ${maxBytes} 字节限制`);
    return buffer;
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error(`更新检查超时：${url}`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function releaseUrl() {
  const configured = process.env.ONEWORK_RELEASE_URL?.trim();
  const base =
    configured || process.env.ONEWORK_API_URL?.trim() || DEFAULT_ORIGIN;
  const parsed = new URL(base);
  if (!['https:', 'http:'].includes(parsed.protocol))
    throw new Error('更新地址必须使用 HTTP(S)');
  if (
    parsed.protocol === 'http:' &&
    !['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname)
  ) {
    throw new Error('远程 OneWorkerOS 更新必须使用 HTTPS');
  }
  return configured ? parsed : new URL(RELEASE_PATH, parsed.origin);
}

function validateRelease(release) {
  if (
    release?.schema !== 'onework.skill-release.v1' ||
    release?.name !== 'one-work-os' ||
    typeof release?.version !== 'string' ||
    !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(release.version) ||
    typeof release?.artifact?.url !== 'string' ||
    !Number.isInteger(release?.artifact?.size) ||
    release.artifact.size < 1 ||
    release.artifact.size > MAX_ARCHIVE_BYTES ||
    !/^[a-f0-9]{64}$/.test(release?.artifact?.sha256 || '') ||
    !Array.isArray(release?.files) ||
    release.files.length < 1
  ) {
    throw new Error('OneWorkerOS release 清单格式无效');
  }
  const seen = new Set();
  for (const file of release.files) {
    const pathParts =
      typeof file?.path === 'string' ? file.path.split('/') : [];
    if (
      typeof file?.path !== 'string' ||
      !file.path ||
      file.path.startsWith('/') ||
      file.path.includes('\\') ||
      pathParts.some(
        (part) => !part || part === '.' || part === '..' || part.includes('\0')
      ) ||
      seen.has(file.path) ||
      !Number.isInteger(file.size) ||
      file.size < 0 ||
      !/^[a-f0-9]{64}$/.test(file.sha256 || '')
    ) {
      throw new Error(
        `OneWorkerOS release 文件清单无效：${file?.path || 'unknown'}`
      );
    }
    seen.add(file.path);
  }
  return release;
}

async function fetchRelease() {
  const url = releaseUrl();
  const [expectedHashBuffer, releaseBuffer] = await Promise.all([
    fetchBuffer(`${url.toString()}.sha256`, { maxBytes: 512 }),
    fetchBuffer(url, { maxBytes: MAX_RELEASE_BYTES }),
  ]);
  const expectedHash = expectedHashBuffer
    .toString('utf8')
    .trim()
    .split(/\s+/, 1)[0];
  if (
    !/^[a-f0-9]{64}$/.test(expectedHash) ||
    sha256(releaseBuffer) !== expectedHash
  ) {
    throw new Error('OneWorkerOS release 清单 SHA256 校验失败');
  }
  let parsed;
  try {
    parsed = JSON.parse(releaseBuffer.toString('utf8'));
  } catch {
    throw new Error('OneWorkerOS release 清单不是有效 JSON');
  }
  return { release: validateRelease(parsed), url };
}

function listFiles(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort(
      (a, b) => a.name.localeCompare(b.name)
    )) {
      const absolute = join(directory, entry.name);
      if (entry.isSymbolicLink() || lstatSync(absolute).isSymbolicLink()) {
        throw new Error(`Skill 压缩包不得包含符号链接：${entry.name}`);
      }
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) files.push(absolute);
      else throw new Error(`Skill 包含不支持的文件类型：${entry.name}`);
    }
  };
  visit(root);
  return files.sort();
}

function listArchiveEntries(archivePath) {
  let output;
  if (process.platform === 'win32') {
    const escaped = archivePath.replaceAll("'", "''");
    output = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Add-Type -AssemblyName System.IO.Compression.FileSystem; $zip=[IO.Compression.ZipFile]::OpenRead('${escaped}'); try { $zip.Entries | ForEach-Object { $_.FullName } } finally { $zip.Dispose() }`,
      ],
      { encoding: 'utf8' }
    );
  } else {
    output = execFileSync('unzip', ['-Z1', archivePath], { encoding: 'utf8' });
  }
  return output
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .sort();
}

function validateArchiveEntries(archivePath, release) {
  const expected = release.files
    .map((file) => `one-work-os/${file.path}`)
    .sort();
  const actual = listArchiveEntries(archivePath);
  if (
    actual.length !== expected.length ||
    actual.some((entry, index) => entry !== expected[index])
  ) {
    throw new Error('Skill ZIP 的文件列表与 release 清单不一致');
  }
}

function extractArchive(archivePath, stagingRoot) {
  if (process.platform === 'win32') {
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Expand-Archive -LiteralPath '${archivePath.replaceAll("'", "''")}' -DestinationPath '${stagingRoot.replaceAll("'", "''")}' -Force`,
      ],
      { stdio: 'ignore' }
    );
  } else {
    execFileSync('unzip', ['-q', '-o', archivePath, '-d', stagingRoot], {
      stdio: 'ignore',
    });
  }
}

function validateExtractedSkill(stagedSkill, release) {
  const expected = new Map(release.files.map((file) => [file.path, file]));
  const actualFiles = listFiles(stagedSkill);
  const actualPaths = actualFiles.map((path) =>
    relative(stagedSkill, path).split(sep).join('/')
  );
  if (
    actualPaths.length !== expected.size ||
    actualPaths.some((path) => !expected.has(path))
  ) {
    throw new Error('Skill 压缩包文件列表与 release 清单不一致');
  }
  for (const absolute of actualFiles) {
    const path = relative(stagedSkill, absolute).split(sep).join('/');
    const expectedFile = expected.get(path);
    const content = readFileSync(absolute);
    if (
      content.length !== expectedFile.size ||
      sha256(content) !== expectedFile.sha256
    ) {
      throw new Error(`Skill 文件校验失败：${path}`);
    }
  }
  if (readVersion(stagedSkill) !== release.version) {
    throw new Error('Skill manifest 版本与 release 清单不一致');
  }
}

function cleanupBackups(keep = 2) {
  mkdirSync(backupRoot, { recursive: true, mode: 0o700 });
  const backups = readdirSync(backupRoot, { withFileTypes: true })
    .filter(
      (entry) => entry.isDirectory() && entry.name.startsWith('one-work-os-')
    )
    .map((entry) => ({
      name: entry.name,
      path: join(backupRoot, entry.name),
      mtime: statSync(join(backupRoot, entry.name)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime);
  for (const backup of backups.slice(keep))
    rmSync(backup.path, { recursive: true, force: true });
}

async function installUpdate(release, manifestUrl) {
  const artifactUrl = new URL(release.artifact.url, manifestUrl);
  if (artifactUrl.origin !== manifestUrl.origin)
    throw new Error('Skill 下载地址必须与 release 清单同源');
  const archive = await fetchBuffer(artifactUrl, {
    timeoutMs: 30_000,
    maxBytes: MAX_ARCHIVE_BYTES,
  });
  if (
    archive.length !== release.artifact.size ||
    sha256(archive) !== release.artifact.sha256
  ) {
    throw new Error('OneWorkerOS Skill ZIP 大小或 SHA256 校验失败');
  }

  mkdirSync(workbuddyRoot, { recursive: true, mode: 0o700 });
  const stagingRoot = mkdtempSync(
    join(workbuddyRoot, '.onework-update-staging-')
  );
  const archivePath = join(stagingRoot, 'skill.zip');
  const stagedFiles = join(stagingRoot, 'files');
  writeFileSync(archivePath, archive, { mode: 0o600 });
  mkdirSync(stagedFiles, { recursive: true, mode: 0o700 });
  try {
    // SHA256 here is an integrity check for bytes delivered over HTTPS, not a
    // publisher signature. Validate every archive path before extraction too.
    validateArchiveEntries(archivePath, release);
    extractArchive(archivePath, stagedFiles);
    const stagedSkill = join(stagedFiles, 'one-work-os');
    validateExtractedSkill(stagedSkill, release);
    mkdirSync(backupRoot, { recursive: true, mode: 0o700 });
    const backupPath = join(
      backupRoot,
      `one-work-os-${readVersion(skillRoot)}-${Date.now()}`
    );
    renameSync(skillRoot, backupPath);
    try {
      renameSync(stagedSkill, skillRoot);
    } catch (error) {
      if (!existsSync(skillRoot) && existsSync(backupPath))
        renameSync(backupPath, skillRoot);
      throw error;
    }
    cleanupBackups();
  } finally {
    rmSync(stagingRoot, { recursive: true, force: true });
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const currentVersion = readVersion(skillRoot);
  const cached = safeReadJson(stateFile);
  if (
    !options.force &&
    cached?.currentVersion === currentVersion &&
    compareVersions(cached?.latestVersion || currentVersion, currentVersion) <=
      0 &&
    typeof cached?.checkedAt === 'string' &&
    Date.now() - new Date(cached.checkedAt).getTime() < CACHE_TTL_MS
  ) {
    return {
      success: true,
      cached: true,
      updated: false,
      currentVersion,
      latestVersion: cached.latestVersion || currentVersion,
    };
  }

  const { release, url } = await fetchRelease();
  const comparison = compareVersions(release.version, currentVersion);
  if (comparison <= 0) {
    writeJsonAtomic(stateFile, {
      checkedAt: new Date().toISOString(),
      currentVersion,
      latestVersion: release.version,
    });
    return {
      success: true,
      cached: false,
      updated: false,
      updateAvailable: comparison > 0,
      currentVersion,
      latestVersion: release.version,
    };
  }

  if (options.checkOnly) {
    return {
      success: true,
      cached: false,
      updated: false,
      updateAvailable: true,
      currentVersion,
      latestVersion: release.version,
    };
  }

  await installUpdate(release, url);
  writeJsonAtomic(stateFile, {
    checkedAt: new Date().toISOString(),
    currentVersion: release.version,
    latestVersion: release.version,
  });
  return {
    success: true,
    cached: false,
    updated: true,
    previousVersion: currentVersion,
    currentVersion: release.version,
    restartRequired: true,
  };
}

main()
  .then((result) => {
    if (process.argv.includes('--json'))
      console.log(JSON.stringify(result, null, 2));
    else if (result.updated)
      console.log(
        `OneWorkerOS 已更新到 ${result.currentVersion}，请重启 WorkBuddy。`
      );
    else console.log(`OneWorkerOS ${result.currentVersion} 已是当前版本。`);
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
