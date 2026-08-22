#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = join(projectRoot, 'public', 'one-worker-os-universal');
const marketplaceRoot = join(
  projectRoot,
  'public',
  'one-worker-os-marketplace'
);
const version = '1.0.0';
const packageName = 'one-worker-os';
const artifactName = `one-worker-os-universal-${version}.zip`;
const normalizedMtime = new Date('2026-01-01T00:00:00.000Z');
const checkOnly = process.argv.includes('--check');

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function writeAtomic(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  writeFileSync(temporary, content);
  renameSync(temporary, path);
}

function listFiles(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort(
      (left, right) => left.name.localeCompare(right.name)
    )) {
      if (entry.name === '.DS_Store') continue;
      const absolute = join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(
          `Universal package must not contain symlinks: ${absolute}`
        );
      }
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) files.push(absolute);
      else throw new Error(`Unsupported package entry: ${absolute}`);
    }
  };
  visit(root);
  return files.sort();
}

function normalizeTree(root) {
  for (const absolute of listFiles(root)) {
    const path = relative(root, absolute).split(sep).join('/');
    chmodSync(absolute, path.endsWith('.sh') ? 0o755 : 0o644);
    utimesSync(absolute, normalizedMtime, normalizedMtime);
  }
}

function readWorkBuddyArtifact() {
  const releasePath = join(marketplaceRoot, 'release.json');
  const release = JSON.parse(readFileSync(releasePath, 'utf8'));
  const artifact = release.artifacts?.find((item) =>
    item.name.startsWith('one-worker-os-marketplace-')
  );
  if (
    !artifact ||
    !/^one-worker-os-marketplace-\d+\.\d+\.\d+\.zip$/.test(artifact.name)
  ) {
    throw new Error('Current WorkBuddy marketplace artifact is missing');
  }
  const source = join(marketplaceRoot, artifact.name);
  if (!existsSync(source))
    throw new Error(`Missing WorkBuddy artifact: ${source}`);
  const content = readFileSync(source);
  if (content.length !== artifact.size || sha256(content) !== artifact.sha256) {
    throw new Error(`WorkBuddy artifact hash mismatch: ${artifact.name}`);
  }
  return { ...artifact, content };
}

function writePackageFiles(stage, workbuddyArtifact) {
  const files = {
    'README.md':
      '# one-worker-os 通用安装包\n\n这是 OneWorkerOS 的通用客户端安装包。请把整个 ZIP 交给当前 AI 客户端读取；它会根据当前宿主选择 WorkBuddy、豆包或龙虾（OpenClaw）入口。\n\n核心服务只有一个：\n\n- MCP：https://www.dlgzz.com/mcp\n- 授权：由客户端发起 OAuth，用户在浏览器中点击允许\n- 会员和知识库：由 OneWorkerOS 云端统一管理\n\n详细步骤见 INSTALL.md。\n',
    'INSTALL.md': `# one-worker-os 通用安装说明\n\n## 给 AI 的执行规则\n\n1. 读取本包的 manifest.json，识别当前宿主。\n2. 只选择当前宿主对应的 adapter；不要复制或创建 API Key、Token、设备 ID。\n3. 不要直接在浏览器打开 https://www.dlgzz.com/mcp；它是 MCP 机器端点，不是授权页面。\n4. 安装或写入配置后，从宿主的 MCP 连接入口发起连接。只有浏览器 OAuth 的“允许”需要用户确认。\n5. 如果宿主没有文件、插件或命令执行权限，只报告准确的阻塞原因，不要声称安装成功。\n\n## WorkBuddy\n\n1. 解压本包，找到 adapters/workbuddy/one-worker-os-marketplace-${workbuddyArtifact.name.match(/(\\d+\\.\\d+\\.\\d+)/)?.[1] ?? '1.0.4'}.zip。\n2. 在 WorkBuddy 的“技能/插件 → 插件市场”中添加这个本地 ZIP 市场。\n3. 安装并启用 one-worker-os@one-worker-os-marketplace。\n4. 进入“连接器 → 自定义连接器 → 我的 MCP → one-worker-os → 连接”。\n5. WorkBuddy 会在默认浏览器打开 OAuth 页面；用户点击“允许连接”后返回 WorkBuddy。\n\n## 豆包\n\n1. 打开豆包或火山方舟中支持 MCP 的“自定义 MCP / MCP 服务”入口。\n2. 导入 adapters/doubao/mcp.json，或使用其中的 JSON 内容。\n3. 保存后点击 one-worker-os 的连接/登录按钮。\n4. 浏览器出现 OAuth 页面时，由用户确认授权。\n\n如果当前豆包入口只接受 MCP 市场 URL，请将本包作为安装说明交给其 AI，并让 AI 使用 manifest.json 中的远程 MCP 地址完成添加。\n\n## 龙虾（OpenClaw）\n\nOpenClaw 可以把远程 HTTP MCP 保存到自己的 MCP 注册表：\n\n\`openclaw mcp add one-worker-os --url https://www.dlgzz.com/mcp --transport streamable-http --auth oauth\`\n\n然后执行：\n\n\`openclaw mcp login one-worker-os\`\n\n或者在 Control UI 的 MCP 设置中导入 adapters/lobster/openclaw.json。授权页面由 OpenClaw 打开，用户点击允许即可。\n\n## 完成标准\n\n安装不是连接完成。只有宿主能列出 one-worker-os、OAuth 成功，并能调用 onework_get_entitlements 和 onework_search_knowledge，才可以报告“连接成功”。\n`,
    'manifest.json':
      JSON.stringify(
        {
          schema: 'one-worker-os.universal-package.v1',
          name: packageName,
          version,
          displayName: 'one-worker-os',
          description:
            '面向 WorkBuddy、豆包和龙虾（OpenClaw）的统一 MCP 安装包',
          mcp: {
            transport: 'streamable-http',
            url: 'https://www.dlgzz.com/mcp',
            oauth: 'client-discovered',
          },
          authorization: {
            mode: 'single_active_connection',
            maxActiveConnections: 1,
            replacementRule: 'latest_successful_authorization_wins',
          },
          hosts: [
            {
              id: 'workbuddy',
              names: ['WorkBuddy'],
              adapter: 'adapters/workbuddy',
              installation: 'workbuddy-marketplace-zip',
            },
            {
              id: 'doubao',
              names: ['豆包', '火山方舟'],
              adapter: 'adapters/doubao',
              installation: 'mcp-json-import',
            },
            {
              id: 'lobster',
              names: ['龙虾', 'OpenClaw'],
              adapter: 'adapters/lobster',
              installation: 'openclaw-mcp-registry',
            },
          ],
        },
        null,
        2
      ) + '\n',
    'mcp.json':
      JSON.stringify(
        {
          mcpServers: {
            'one-worker-os': {
              type: 'http',
              url: 'https://www.dlgzz.com/mcp',
            },
          },
        },
        null,
        2
      ) + '\n',
    'adapters/workbuddy/README.md':
      '# WorkBuddy\n\n安装同目录的 one-worker-os-marketplace ZIP，然后在 WorkBuddy 插件市场安装并启用：\n\n`one-worker-os@one-worker-os-marketplace`\n\n安装后从“连接器 → 自定义连接器 → 我的 MCP → one-worker-os → 连接”发起 OAuth。\n',
    'adapters/doubao/README.md':
      '# 豆包\n\n在豆包或火山方舟的 MCP / 自定义 MCP 入口导入 mcp.json。保存后点击连接或登录，由客户端打开 OAuth 页面。\n',
    'adapters/doubao/mcp.json':
      JSON.stringify(
        {
          mcpServers: {
            'one-worker-os': {
              type: 'http',
              url: 'https://www.dlgzz.com/mcp',
            },
          },
        },
        null,
        2
      ) + '\n',
    'adapters/lobster/README.md':
      '# 龙虾（OpenClaw）\n\n使用：\n\n`openclaw mcp add one-worker-os --url https://www.dlgzz.com/mcp --transport streamable-http --auth oauth`\n`openclaw mcp login one-worker-os`\n\n也可以在 Control UI 的 MCP 设置中导入 openclaw.json。\n',
    'adapters/lobster/openclaw.json':
      JSON.stringify(
        {
          name: 'one-worker-os',
          url: 'https://www.dlgzz.com/mcp',
          transport: 'streamable-http',
          auth: 'oauth',
        },
        null,
        2
      ) + '\n',
  };
  for (const [path, content] of Object.entries(files)) {
    const destination = join(stage, path);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, content);
  }
  mkdirSync(join(stage, 'adapters', 'workbuddy'), { recursive: true });
  copyFileSync(
    join(marketplaceRoot, workbuddyArtifact.name),
    join(stage, 'adapters', 'workbuddy', workbuddyArtifact.name)
  );
}

function createArchive(stageRoot) {
  normalizeTree(stageRoot);
  const entries = listFiles(stageRoot).map((path) =>
    relative(dirname(stageRoot), path).split(sep).join('/')
  );
  const archivePath = join(stageRoot, '..', artifactName);
  const zipped = spawnSync('zip', ['-X', '-q', archivePath, ...entries], {
    cwd: dirname(stageRoot),
    encoding: 'utf8',
  });
  if (zipped.status !== 0) {
    throw new Error(
      `zip failed: ${(zipped.stderr || zipped.stdout || '').trim()}`
    );
  }
  const content = readFileSync(archivePath);
  return { content, size: content.length, sha256: sha256(content) };
}

function publishArtifact(path, archive) {
  const hashPath = `${path}.sha256`;
  const expectedHashFile = `${archive.sha256}  ${artifactName}\n`;
  if (existsSync(path)) {
    const existing = readFileSync(path);
    if (sha256(existing) !== archive.sha256) {
      throw new Error(
        `Refusing to overwrite immutable universal artifact: ${artifactName}`
      );
    }
  } else if (!checkOnly) {
    writeAtomic(path, archive.content);
  }
  if (existsSync(hashPath)) {
    if (readFileSync(hashPath, 'utf8') !== expectedHashFile) {
      throw new Error(
        `Universal artifact checksum mismatch: ${artifactName}.sha256`
      );
    }
  } else if (!checkOnly) {
    writeAtomic(hashPath, expectedHashFile);
  }
}

function main() {
  const workbuddyArtifact = readWorkBuddyArtifact();
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'one-worker-os-universal-'));
  try {
    const stage = join(temporaryRoot, 'one-worker-os-universal');
    mkdirSync(stage, { recursive: true });
    writePackageFiles(stage, workbuddyArtifact);
    const first = createArchive(stage);

    const secondRoot = mkdtempSync(join(tmpdir(), 'one-worker-os-universal-'));
    try {
      const secondStage = join(secondRoot, 'one-worker-os-universal');
      mkdirSync(secondStage, { recursive: true });
      writePackageFiles(secondStage, workbuddyArtifact);
      const second = createArchive(secondStage);
      if (first.sha256 !== second.sha256 || first.size !== second.size) {
        throw new Error('Universal packaging is not deterministic');
      }
    } finally {
      rmSync(secondRoot, { recursive: true, force: true });
    }

    const release = {
      schema: 'one-worker-os.universal-release.v1',
      name: packageName,
      version,
      artifact: {
        url: `/one-worker-os-universal/${artifactName}`,
        size: first.size,
        sha256: first.sha256,
      },
      hosts: ['workbuddy', 'doubao', 'lobster'],
      mcp: { url: 'https://www.dlgzz.com/mcp', transport: 'streamable-http' },
    };
    if (!checkOnly) {
      mkdirSync(outputRoot, { recursive: true });
      publishArtifact(join(outputRoot, artifactName), first);
      copyFileSync(join(stage, 'INSTALL.md'), join(outputRoot, 'INSTALL.md'));
      const releaseJson = `${JSON.stringify(release, null, 2)}\n`;
      writeAtomic(join(outputRoot, 'release.json'), releaseJson);
      writeAtomic(
        join(outputRoot, 'release.json.sha256'),
        `${sha256(releaseJson)}  release.json\n`
      );
    } else {
      publishArtifact(join(outputRoot, artifactName), first);
    }
    process.stdout.write(
      `${JSON.stringify({ success: true, checkOnly, ...release }, null, 2)}\n`
    );
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`
  );
  process.exitCode = 1;
}
