#!/usr/bin/env node

/**
 * one-worker-os managed installer. Compatible with Node.js 18/20/22 both as a
 * downloaded .mjs file and through `node -` (no static ESM imports).
 *
 * Preferred:
 *   curl -fsSL https://www.dlgzz.com/downloads/one-worker-os-install.mjs -o /tmp/one-worker-os-install.mjs
 *   node /tmp/one-worker-os-install.mjs --server https://www.dlgzz.com --token "owinst_..."
 *
 * Credentials:
 *   macOS/Linux: ~/.workbuddy/one-worker-os.local.env
 *   Windows:     %USERPROFILE%\.workbuddy\one-worker-os.local.env
 */

async function main() {
  const { createHash, randomUUID } = await import('node:crypto');
  const {
    chmodSync,
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
  } = await import('node:fs');
  const { execFileSync } = await import('node:child_process');
  const { homedir, hostname, platform, release } = await import('node:os');
  const { join, relative, sep } = await import('node:path');

  const RELEASE_PATH = '/downloads/one-worker-os-workbuddy-skill-release.json';
  const MAX_RELEASE_BYTES = 512 * 1024;
  const MAX_ARCHIVE_BYTES = 25 * 1024 * 1024;

  function arg(name, fallback = '') {
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] || fallback : fallback;
  }

  function required(name) {
    const value = arg(name);
    if (!value) throw new Error(`缺少参数 ${name}`);
    return value;
  }

  function sha256(value) {
    return createHash('sha256').update(value).digest('hex');
  }

  function isLocalhost(url) {
    return ['127.0.0.1', 'localhost', '::1'].includes(url.hostname);
  }

  async function fetchWithTimeout(url, init = {}, timeoutMs = 15_000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, {
        ...init,
        signal: controller.signal,
        cache: 'no-store',
      });
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error(`网络请求超时：${url}`);
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function fetchBuffer(url, { timeoutMs = 15_000, maxBytes }) {
    const response = await fetchWithTimeout(url, {}, timeoutMs);
    if (!response.ok)
      throw new Error(`下载失败（HTTP ${response.status}）：${url}`);
    const declaredSize = Number(response.headers.get('content-length') || 0);
    if (declaredSize > maxBytes)
      throw new Error(`下载内容超过 ${maxBytes} 字节限制`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes)
      throw new Error(`下载内容超过 ${maxBytes} 字节限制`);
    return buffer;
  }

  function validateRelease(value) {
    if (
      value?.schema !== 'one-worker-os.skill-release.v1' ||
      value?.name !== 'one-worker-os' ||
      typeof value?.version !== 'string' ||
      !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(value.version) ||
      typeof value?.artifact?.url !== 'string' ||
      !Number.isInteger(value?.artifact?.size) ||
      value.artifact.size < 1 ||
      value.artifact.size > MAX_ARCHIVE_BYTES ||
      !/^[a-f0-9]{64}$/.test(value?.artifact?.sha256 || '') ||
      !Array.isArray(value?.files) ||
      value.files.length < 1
    ) {
      throw new Error('one-worker-os release 清单格式无效');
    }
    const seen = new Set();
    for (const file of value.files) {
      const pathParts =
        typeof file?.path === 'string' ? file.path.split('/') : [];
      if (
        typeof file?.path !== 'string' ||
        !file.path ||
        file.path.startsWith('/') ||
        file.path.includes('\\') ||
        pathParts.some(
          (part) =>
            !part || part === '.' || part === '..' || part.includes('\0')
        ) ||
        seen.has(file.path) ||
        !Number.isInteger(file.size) ||
        file.size < 0 ||
        !/^[a-f0-9]{64}$/.test(file.sha256 || '')
      ) {
        throw new Error(
          `one-worker-os release 文件清单无效：${file?.path || 'unknown'}`
        );
      }
      seen.add(file.path);
    }
    return value;
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

  function readManifestVersion(root) {
    const raw = readFileSync(join(root, 'manifest.yaml'), 'utf8');
    const version = raw.match(/^version:\s*["']?([^"'\s]+)["']?\s*$/m)?.[1];
    if (!version) throw new Error('Skill manifest.yaml 缺少版本号');
    return version;
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
      output = execFileSync('unzip', ['-Z1', archivePath], {
        encoding: 'utf8',
      });
    }
    return output
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean)
      .sort();
  }

  function extractArchive(archivePath, destination) {
    if (process.platform === 'win32') {
      execFileSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `Expand-Archive -LiteralPath '${archivePath.replaceAll("'", "''")}' -DestinationPath '${destination.replaceAll("'", "''")}' -Force`,
        ],
        { stdio: 'ignore' }
      );
    } else {
      execFileSync('unzip', ['-q', '-o', archivePath, '-d', destination], {
        stdio: 'ignore',
      });
    }
  }

  function validateArchiveEntries(archivePath, releaseManifest) {
    const expected = releaseManifest.files
      .map((file) => `one-worker-os/${file.path}`)
      .sort();
    const actual = listArchiveEntries(archivePath);
    if (
      actual.length !== expected.length ||
      actual.some((entry, index) => entry !== expected[index])
    ) {
      throw new Error('Skill ZIP 的文件列表与 release 清单不一致');
    }
  }

  function validateExtractedSkill(skillSource, releaseManifest) {
    const expected = new Map(
      releaseManifest.files.map((file) => [file.path, file])
    );
    const actualFiles = listFiles(skillSource);
    const actualPaths = actualFiles.map((path) =>
      relative(skillSource, path).split(sep).join('/')
    );
    if (
      actualPaths.length !== expected.size ||
      actualPaths.some((path) => !expected.has(path))
    ) {
      throw new Error('Skill 解压后的文件列表与 release 清单不一致');
    }
    for (const absolute of actualFiles) {
      const path = relative(skillSource, absolute).split(sep).join('/');
      const expectedFile = expected.get(path);
      const content = readFileSync(absolute);
      if (
        content.length !== expectedFile.size ||
        sha256(content) !== expectedFile.sha256
      ) {
        throw new Error(`Skill 文件校验失败：${path}`);
      }
    }
    if (readManifestVersion(skillSource) !== releaseManifest.version) {
      throw new Error('Skill manifest 版本与 release 清单不一致');
    }
  }

  function cleanupBackups(backupRoot, keep = 2) {
    mkdirSync(backupRoot, { recursive: true, mode: 0o700 });
    const entries = readdirSync(backupRoot, { withFileTypes: true })
      .filter(
        (entry) => entry.isDirectory() && entry.name.startsWith('install-')
      )
      .map((entry) => ({
        path: join(backupRoot, entry.name),
        mtime: statSync(join(backupRoot, entry.name)).mtimeMs,
      }))
      .sort((a, b) => b.mtime - a.mtime);
    for (const entry of entries.slice(keep))
      rmSync(entry.path, { recursive: true, force: true });
  }

  const nodeMajor = Number(process.versions.node.split('.')[0]);
  if (!Number.isFinite(nodeMajor) || nodeMajor < 18) {
    throw new Error(`需要 Node.js 18+，当前版本为 ${process.versions.node}`);
  }

  const serverUrl = new URL(arg('--server', 'https://www.dlgzz.com'));
  if (!['http:', 'https:'].includes(serverUrl.protocol))
    throw new Error('安装服务器地址必须使用 HTTP(S)');
  if (serverUrl.protocol === 'http:' && !isLocalhost(serverUrl))
    throw new Error('远程 one-worker-os 安装必须使用 HTTPS');
  const serverOrigin = serverUrl.origin;
  const token = required('--token');
  const deviceName = arg('--device-name', hostname());
  const skipSkill = process.argv.includes('--skip-skill');
  const targetDir = join(homedir(), '.workbuddy');
  const skillsDir = join(targetDir, 'skills');
  const skillTarget = join(skillsDir, 'one-worker-os');
  const targetFile = join(targetDir, 'one-worker-os.local.env');
  const deviceIdentityFile = join(targetDir, 'one-worker-os-device-id');
  const backupRoot = join(targetDir, 'one-worker-os-backups');
  const legacySkillTarget = join(skillsDir, 'one-work-os');
  const legacyCredentialFile = join(targetDir, 'one-work-os.local.env');
  const legacyDeviceIdentityFile = join(targetDir, 'onework-device-id');

  mkdirSync(targetDir, { recursive: true, mode: 0o700 });
  mkdirSync(skillsDir, { recursive: true, mode: 0o700 });
  mkdirSync(backupRoot, { recursive: true, mode: 0o700 });
  const stagingRoot = mkdtempSync(
    join(targetDir, '.one-worker-os-install-staging-')
  );
  process.on('exit', () =>
    rmSync(stagingRoot, { recursive: true, force: true })
  );

  // Preflight the exact filesystem and rename operations before consuming the token.
  const probeA = join(stagingRoot, 'write-probe-a');
  const probeB = join(stagingRoot, 'write-probe-b');
  writeFileSync(probeA, 'ok', { mode: 0o600 });
  renameSync(probeA, probeB);
  rmSync(probeB, { force: true });

  let deviceId = arg('--device-id').trim();
  if (!deviceId) {
    try {
      deviceId = readFileSync(deviceIdentityFile, 'utf8').trim();
    } catch {
      try {
        deviceId = readFileSync(legacyDeviceIdentityFile, 'utf8').trim();
      } catch {
        // First managed install on this profile.
      }
    }
  }
  if (!deviceId) {
    deviceId = sha256(`${hostname()}|${platform()}|${release()}|${homedir()}`);
    writeFileSync(deviceIdentityFile, `${deviceId}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    try {
      chmodSync(deviceIdentityFile, 0o600);
    } catch {
      /* Windows ACLs apply. */
    }
  }
  if (!/^[A-Za-z0-9._:-]{16,200}$/.test(deviceId)) {
    throw new Error('one-worker-os 设备标识无效');
  }

  let releaseManifest = null;
  let skillSource = null;
  if (!skipSkill) {
    const releaseUrl = new URL(RELEASE_PATH, serverOrigin);
    const [releaseHashBuffer, releaseBuffer] = await Promise.all([
      fetchBuffer(`${releaseUrl.toString()}.sha256`, { maxBytes: 512 }),
      fetchBuffer(releaseUrl, { maxBytes: MAX_RELEASE_BYTES }),
    ]);
    const expectedReleaseHash = releaseHashBuffer
      .toString('utf8')
      .trim()
      .split(/\s+/, 1)[0];
    if (
      !/^[a-f0-9]{64}$/.test(expectedReleaseHash) ||
      sha256(releaseBuffer) !== expectedReleaseHash
    ) {
      throw new Error('one-worker-os release 清单 SHA256 校验失败');
    }
    try {
      releaseManifest = validateRelease(
        JSON.parse(releaseBuffer.toString('utf8'))
      );
    } catch (error) {
      if (error instanceof SyntaxError)
        throw new Error('one-worker-os release 清单不是有效 JSON');
      throw error;
    }
    const artifactUrl = new URL(releaseManifest.artifact.url, releaseUrl);
    if (artifactUrl.origin !== releaseUrl.origin)
      throw new Error('Skill 下载地址必须与 release 清单同源');
    const archive = await fetchBuffer(artifactUrl, {
      timeoutMs: 30_000,
      maxBytes: MAX_ARCHIVE_BYTES,
    });
    if (
      archive.length !== releaseManifest.artifact.size ||
      sha256(archive) !== releaseManifest.artifact.sha256
    ) {
      throw new Error('one-worker-os Skill ZIP 大小或 SHA256 校验失败');
    }
    const archivePath = join(stagingRoot, 'one-worker-os-skill.zip');
    const extractedRoot = join(stagingRoot, 'extracted');
    writeFileSync(archivePath, archive, { mode: 0o600 });
    mkdirSync(extractedRoot, { recursive: true, mode: 0o700 });
    // SHA256 verifies transport integrity over HTTPS; it is not a publisher
    // signature. Exact entry validation prevents unexpected extraction paths.
    validateArchiveEntries(archivePath, releaseManifest);
    extractArchive(archivePath, extractedRoot);
    skillSource = join(extractedRoot, 'one-worker-os');
    validateExtractedSkill(skillSource, releaseManifest);
  }

  // Only consume the one-time token after download, hash, extraction and filesystem checks pass.
  const claimResponse = await fetchWithTimeout(
    `${serverOrigin}/api/onework/install/claim`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        token,
        deviceId,
        deviceName,
        platform: platform(),
      }),
    }
  );
  const claimData = await claimResponse.json().catch(() => ({}));
  if (!claimResponse.ok || !claimData.success || !claimData.key?.rawKey) {
    throw new Error(
      claimData.error || `安装授权失败（HTTP ${claimResponse.status}）`
    );
  }
  if (!/^[A-Za-z0-9._~-]{20,500}$/.test(claimData.key.rawKey)) {
    throw new Error('安装服务器返回了无效的 one-worker-os Key');
  }

  const credentialTemp = join(stagingRoot, 'one-worker-os.local.env');
  writeFileSync(
    credentialTemp,
    `# one-worker-os managed credential\nONEWORK_API_KEY=${claimData.key.rawKey}\nONEWORK_DEVICE_ID=${deviceId}\n`,
    { encoding: 'utf8', mode: 0o600 }
  );
  try {
    chmodSync(credentialTemp, 0o600);
  } catch {
    /* Windows ACLs apply. */
  }

  const backupSession = join(
    backupRoot,
    `install-${Date.now()}-${randomUUID().slice(0, 8)}`
  );
  mkdirSync(backupSession, { recursive: true, mode: 0o700 });
  const credentialBackup = join(backupSession, 'one-worker-os.local.env');
  const skillBackup = join(backupSession, 'one-worker-os');

  // Commit the credential first. If the Skill swap fails, the previous Skill can
  // still use the newly issued key instead of being stranded with a revoked key.
  if (existsSync(targetFile)) renameSync(targetFile, credentialBackup);
  try {
    renameSync(credentialTemp, targetFile);
  } catch (error) {
    if (!existsSync(targetFile) && existsSync(credentialBackup))
      renameSync(credentialBackup, targetFile);
    throw error;
  }

  if (!skipSkill) {
    if (existsSync(skillTarget)) renameSync(skillTarget, skillBackup);
    try {
      renameSync(skillSource, skillTarget);
    } catch (error) {
      if (!existsSync(skillTarget) && existsSync(skillBackup))
        renameSync(skillBackup, skillTarget);
      throw new Error(
        `新 Key 已写入，但 Skill 更新失败：${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  const verifyResponse = await fetchWithTimeout(
    `${serverOrigin}/api/onework/install/verify`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${claimData.key.rawKey}`,
        'X-OneWork-Device-ID': deviceId,
      },
    }
  );
  const verifyData = await verifyResponse.json().catch(() => ({}));
  if (!verifyResponse.ok || !verifyData.success) {
    throw new Error(
      `one-worker-os 文件已安装，但设备授权验证失败（HTTP ${verifyResponse.status}）：${verifyData.error || '请重启 WorkBuddy 后重试'}`
    );
  }

  // Only retire the old identity after the replacement has passed its remote
  // authorization check. Keep every legacy file in the rollback backup.
  if (!skipSkill) {
    if (existsSync(legacySkillTarget)) {
      renameSync(legacySkillTarget, join(backupSession, 'legacy-one-work-os'));
    }
    if (existsSync(legacyCredentialFile)) {
      renameSync(
        legacyCredentialFile,
        join(backupSession, 'legacy-one-work-os.local.env')
      );
    }
    if (existsSync(legacyDeviceIdentityFile)) {
      renameSync(
        legacyDeviceIdentityFile,
        join(backupSession, 'legacy-onework-device-id')
      );
    }
  }

  if (readdirSync(backupSession).length === 0)
    rmSync(backupSession, { recursive: true, force: true });
  cleanupBackups(backupRoot);
  console.log(`Skill 版本：${releaseManifest?.version || '保持现有版本'}`);
  console.log(`one-worker-os 已连接：${claimData.key.keyPrefix}`);
  console.log(`知识包：${(claimData.packs || []).join(', ')}`);
  console.log(`凭据已写入：${targetFile}`);
  if (verifyData.ready === false && verifyData.notice) {
    console.log(`提醒：${verifyData.notice}`);
  } else {
    console.log('端到端授权验证已通过。');
  }
  console.log('请重启 WorkBuddy。');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
