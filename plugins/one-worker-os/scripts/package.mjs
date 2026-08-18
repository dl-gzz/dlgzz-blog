#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  cpSync,
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

const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = resolve(pluginRoot, '..', '..');
const canonicalSkill = join(projectRoot, 'skills', 'one-worker-os');
const pluginSkill = join(pluginRoot, 'skills', 'one-worker-os');
const marketplacePath = join(
  projectRoot,
  '.codebuddy-plugin',
  'marketplace.json'
);
const outputRoot = join(projectRoot, 'public', 'one-worker-os-marketplace');
const normalizedMtime = new Date('2026-01-01T00:00:00.000Z');
const checkOnly = process.argv.includes('--check');
const syncLegacy = process.argv.includes('--sync-legacy');

const legacyFiles = [
  'manifest.yaml',
  'references/api-schema.md',
  'references/dispatch-protocol.md',
  'references/semantic-query-contract.md',
  'references/workbuddy-test-cases.md',
  'scripts/one-worker-os-credentials.mjs',
  'scripts/query-analytics.mjs',
  'scripts/query-knowledge.mjs',
  'scripts/resolve-capability.mjs',
  'scripts/update-one-worker-os-skill.mjs',
];

function lexicalCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function parseJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(
      `Invalid JSON at ${relative(projectRoot, path)}: ${error.message}`
    );
  }
}

function writeAtomic(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  writeFileSync(temporary, content);
  renameSync(temporary, path);
}

function syncLegacyFiles() {
  for (const path of legacyFiles) {
    const source = join(canonicalSkill, path);
    const destination = join(pluginSkill, path);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(source, destination);
  }
}

function validateLegacyFiles() {
  for (const path of legacyFiles) {
    const source = join(canonicalSkill, path);
    const bundled = join(pluginSkill, path);
    if (!existsSync(source) || !existsSync(bundled)) {
      throw new Error(`Missing legacy fallback file: ${path}`);
    }
    if (!readFileSync(source).equals(readFileSync(bundled))) {
      throw new Error(
        `Legacy fallback is stale: ${path}; run pnpm onework:plugin:sync-legacy`
      );
    }
  }
}

function validateSource() {
  const plugin = parseJson(
    join(pluginRoot, '.codebuddy-plugin', 'plugin.json')
  );
  const marketplace = parseJson(marketplacePath);
  const mcp = parseJson(join(pluginRoot, '.mcp.json'));

  if (plugin.name !== 'one-worker-os') {
    throw new Error('plugin.json name must be one-worker-os');
  }
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(plugin.version)) {
    throw new Error('plugin.json version must be semantic');
  }
  if (plugin.skills !== './skills/' || plugin.mcpServers !== './.mcp.json') {
    throw new Error('plugin.json component paths must stay plugin-relative');
  }
  if (marketplace.name !== 'one-worker-os-marketplace') {
    throw new Error('marketplace name must be one-worker-os-marketplace');
  }
  if (marketplace.version !== plugin.version) {
    throw new Error('marketplace and plugin versions must match');
  }
  if (
    marketplace.plugins?.length !== 1 ||
    marketplace.plugins[0]?.name !== plugin.name ||
    marketplace.plugins[0]?.version !== plugin.version ||
    marketplace.plugins[0]?.source !== './plugins/one-worker-os'
  ) {
    throw new Error(
      'marketplace must contain the local one-worker-os plugin source'
    );
  }

  const server = mcp.mcpServers?.['one-worker-os'];
  if (
    Object.keys(mcp).length !== 1 ||
    !server ||
    server.type !== 'http' ||
    server.url !== 'https://www.dlgzz.com/mcp' ||
    'headers' in server ||
    'oauth' in server
  ) {
    throw new Error(
      '.mcp.json must use the OAuth-discovered HTTPS endpoint without embedded credentials or invented OAuth fields'
    );
  }

  const skill = readFileSync(join(pluginSkill, 'SKILL.md'), 'utf8');
  if (!skill.startsWith('---\nname: one-worker-os\ndescription:')) {
    throw new Error(
      'Plugin Skill must have valid name and description frontmatter'
    );
  }
  for (const tool of [
    'onework_resolve_capability',
    'onework_search_knowledge',
    'onework_query_analytics',
    'onework_get_entitlements',
    'onework_get_usage',
  ]) {
    if (!skill.includes(`\`${tool}\``)) {
      throw new Error(`Plugin Skill does not route ${tool}`);
    }
  }

  validateLegacyFiles();
  return { plugin, marketplace };
}

function listFiles(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort(
      (left, right) => lexicalCompare(left.name, right.name)
    )) {
      if (
        entry.name === '.DS_Store' ||
        entry.name === '.env' ||
        entry.name.startsWith('.env.')
      ) {
        continue;
      }
      const absolute = join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(`Packages must not contain symlinks: ${absolute}`);
      }
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) files.push(absolute);
      else throw new Error(`Unsupported package entry: ${absolute}`);
    }
  };
  visit(root);
  return files.sort(lexicalCompare);
}

function copyPlugin(destination) {
  cpSync(pluginRoot, destination, {
    recursive: true,
    dereference: false,
    filter(source) {
      const path = relative(pluginRoot, source).split(sep).join('/');
      return (
        path !== 'scripts/package.mjs' &&
        !path.endsWith('/.DS_Store') &&
        !/(?:^|\/)\.env(?:\.|$)/.test(path)
      );
    },
  });
}

function normalizeTree(root) {
  for (const absolute of listFiles(root)) {
    const path = relative(root, absolute).split(sep).join('/');
    chmodSync(absolute, path.includes('/scripts/') ? 0o755 : 0o644);
    utimesSync(absolute, normalizedMtime, normalizedMtime);
  }
}

function createZip(stagingRoot, topLevelName, outputPath) {
  const topLevel = join(stagingRoot, topLevelName);
  normalizeTree(topLevel);
  const entries = listFiles(topLevel).map((absolute) =>
    relative(stagingRoot, absolute).split(sep).join('/')
  );
  const zipped = spawnSync('zip', ['-X', '-q', outputPath, ...entries], {
    cwd: stagingRoot,
    encoding: 'utf8',
  });
  if (zipped.status !== 0) {
    throw new Error(
      `zip failed: ${(zipped.stderr || zipped.stdout || '').trim()}`
    );
  }
  const content = readFileSync(outputPath);
  return { content, sha256: sha256(content), size: content.length };
}

function buildOnce(version) {
  const temporaryRoot = mkdtempSync(
    join(tmpdir(), 'one-worker-os-plugin-package-')
  );
  try {
    const pluginStage = join(temporaryRoot, 'one-worker-os');
    copyPlugin(pluginStage);
    const pluginZipPath = join(
      temporaryRoot,
      `one-worker-os-plugin-${version}.zip`
    );
    const pluginArchive = createZip(
      temporaryRoot,
      'one-worker-os',
      pluginZipPath
    );

    const marketplaceStage = join(temporaryRoot, 'one-worker-os-marketplace');
    mkdirSync(join(marketplaceStage, '.codebuddy-plugin'), {
      recursive: true,
    });
    copyFileSync(
      marketplacePath,
      join(marketplaceStage, '.codebuddy-plugin', 'marketplace.json')
    );
    copyPlugin(join(marketplaceStage, 'plugins', 'one-worker-os'));
    const marketplaceZipPath = join(
      temporaryRoot,
      `one-worker-os-marketplace-${version}.zip`
    );
    const marketplaceArchive = createZip(
      temporaryRoot,
      'one-worker-os-marketplace',
      marketplaceZipPath
    );

    return {
      plugin: {
        ...pluginArchive,
        name: `one-worker-os-plugin-${version}.zip`,
      },
      marketplace: {
        ...marketplaceArchive,
        name: `one-worker-os-marketplace-${version}.zip`,
      },
    };
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

function publishArtifact(artifact) {
  const path = join(outputRoot, artifact.name);
  writeAtomic(path, artifact.content);
  writeAtomic(`${path}.sha256`, `${artifact.sha256}  ${artifact.name}\n`);
  if (
    statSync(path).size !== artifact.size ||
    sha256(readFileSync(path)) !== artifact.sha256
  ) {
    throw new Error(`Published artifact verification failed: ${artifact.name}`);
  }
}

function main() {
  if (syncLegacy) syncLegacyFiles();
  const { plugin } = validateSource();
  const first = buildOnce(plugin.version);
  const second = buildOnce(plugin.version);
  if (
    first.plugin.sha256 !== second.plugin.sha256 ||
    first.marketplace.sha256 !== second.marketplace.sha256
  ) {
    throw new Error('Packaging is not deterministic');
  }

  const release = {
    schema: 'one-worker-os.plugin-release.v1',
    name: plugin.name,
    version: plugin.version,
    artifacts: [first.plugin, first.marketplace].map(
      ({ name, size, sha256: hash }) => ({ name, size, sha256: hash })
    ),
  };

  if (!checkOnly) {
    publishArtifact(first.plugin);
    publishArtifact(first.marketplace);
    const releaseJson = `${JSON.stringify(release, null, 2)}\n`;
    writeAtomic(join(outputRoot, 'release.json'), releaseJson);
    writeAtomic(
      join(outputRoot, 'release.json.sha256'),
      `${sha256(releaseJson)}  release.json\n`
    );
  }

  process.stdout.write(
    `${JSON.stringify({ success: true, checkOnly, ...release }, null, 2)}\n`
  );
}

try {
  main();
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`
  );
  process.exitCode = 1;
}
