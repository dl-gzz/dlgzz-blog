import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import matter from 'gray-matter';

const repositoryRoot = resolve(process.cwd());
const importerPath = join(repositoryRoot, 'scripts/import-knowledge-pack.ts');

type FixtureOptions = {
  id?: string;
  version?: string;
  immutableVersioned?: string;
  documentIdStrategy?: string;
  description?: string;
  packMetadata?: string;
  collectionMetadata?: string;
  sourceMetadata?: string;
  units?: string;
};

function indent(value: string, spaces: number) {
  const prefix = ' '.repeat(spaces);
  return value
    .trim()
    .split('\n')
    .map((line) => `${prefix}${line}`)
    .join('\n');
}

function makeManifest(options: FixtureOptions = {}) {
  const immutableVersioned = options.immutableVersioned
    ? `immutableVersioned: ${options.immutableVersioned}\n`
    : '';
  const packMetadata = options.packMetadata
    ? `metadata:\n${indent(options.packMetadata, 2)}\n`
    : 'metadata:\n  docs_url: "/callback?token=<TOKEN>"\n  oauth_route: "https://example.invalid/auth/code"\n';
  const collectionMetadata = options.collectionMetadata
    ? indent(options.collectionMetadata, 4)
    : '    callback: "finish#code=authorization-code"';
  const sourceMetadata = options.sourceMetadata
    ? `\n    metadata:\n${indent(options.sourceMetadata, 6)}`
    : '\n    metadata:\n      callback: "/oauth/token/${ACCESS_TOKEN}"';

  const units = options.units
    ? `units:\n${indent(options.units, 2)}`
    : 'units: []';

  return `---
id: ${options.id ?? 'fixture-v1'}
name: Synthetic fixture
description: ${options.description ?? 'Safe importer fixture'}
version: ${options.version ?? '1'}
${immutableVersioned}documentIdStrategy: ${options.documentIdStrategy ?? 'pack_relative'}
status: draft
${packMetadata}collection:
  id: fixture-collection
  name: Fixture collection
  metadata:
${collectionMetadata}
sources:
  - file: docs/article.md${sourceMetadata}
${units}
---

# Synthetic fixture
`;
}

function runFixture(
  manifest: string,
  options: {
    cliArgs?: string[];
    articleContent?: string;
    leadingSeparator?: boolean;
  } = {}
) {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'onework-importer-fixture-'));
  try {
    mkdirSync(join(fixtureRoot, 'docs'));
    writeFileSync(join(fixtureRoot, 'pack.md'), manifest, 'utf8');
    writeFileSync(
      join(fixtureRoot, 'docs/article.md'),
      options.articleContent ??
        `---
title: Fixture article
source_url: "/docs?code=authorization-code"
---

# Fixture article

This is deliberately synthetic content for a dry-run importer test.
`,
      'utf8'
    );

    const result = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        importerPath,
        ...(options.leadingSeparator ? ['--'] : []),
        '--pack',
        fixtureRoot,
        ...(options.cliArgs ?? ['--dry-run', '--no-embeddings']),
      ],
      {
        cwd: repositoryRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          DATABASE_URL: '',
          ZHIPU_API_KEY: '',
        },
      }
    );
    return {
      status: result.status,
      output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
    };
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

function expectPass(name: string, manifest: string) {
  const result = runFixture(manifest);
  assert.equal(
    result.status,
    0,
    `${name} should pass, received:\n${result.output}`
  );
  assert.match(result.output, /Dry run documents:/, name);
}

function expectReject(name: string, manifest: string, expected: RegExp) {
  const result = runFixture(manifest);
  assert.notEqual(result.status, 0, `${name} should be rejected`);
  assert.match(result.output, expected, `${name}:\n${result.output}`);
}

expectPass('safe placeholders', makeManifest());
const leadingSeparator = runFixture(makeManifest(), {
  leadingSeparator: true,
});
assert.equal(
  leadingSeparator.status,
  0,
  `leading pnpm separator should pass, received:\n${leadingSeparator.output}`
);
assert.match(leadingSeparator.output, /Dry run documents:/);

const misplacedSeparator = runFixture(makeManifest(), {
  cliArgs: ['--dry-run', '--', '--no-embeddings'],
});
assert.notEqual(misplacedSeparator.status, 0);
assert.match(misplacedSeparator.output, /未知参数：--/);

expectPass(
  'legacy mutable version remains compatible',
  makeManifest({ id: 'onework-workbuddy-v1', version: '2' })
);

const earlyEmbeddingGate = runFixture(makeManifest(), {
  cliArgs: ['--dry-run', '--allow-embeddings'],
  articleContent:
    'OPENAI_API_KEY=sk-proj-this-content-must-not-be-read-before-the-exact-source-gate',
});
assert.notEqual(earlyEmbeddingGate.status, 0);
assert.match(
  earlyEmbeddingGate.output,
  /必须显式提供 --only-source 精确文章路径/
);
assert.doesNotMatch(earlyEmbeddingGate.output, /Potential AI provider token/);
expectPass(
  'immutable series metadata matches versioned id',
  makeManifest({
    id: 'independent-worker-core-v1',
    version: '1',
    packMetadata: 'seriesId: independent-worker-core\nversionPolicy: immutable',
  })
);

expectReject(
  'recursive pack metadata secret',
  makeManifest({ packMetadata: 'nested:\n  apiKey: actual-secret-987654' }),
  /Potential configured secret/
);
expectReject(
  'source metadata path secret',
  makeManifest({
    sourceMetadata: 'callback: "/oauth/token/actual-path-secret-987654"',
  }),
  /URL path value/
);
expectReject(
  'collection metadata fragment secret',
  makeManifest({
    collectionMetadata:
      'callback: "finish#access_token=actual-fragment-secret-987654"',
  }),
  /URL (?:fragment (?:path|parameter)|relative\/fragment parameter)/
);
expectReject(
  'frontmatter relative query secret',
  makeManifest({
    description: '"callback?code=actual-auth-code-987654"',
  }),
  /URL (?:query|relative\/fragment) parameter/
);
expectReject(
  'version must be positive',
  makeManifest({ version: '0' }),
  /version 必须是显式声明的大于 0 的安全整数/
);
expectReject(
  'pack id uses the authorization-safe format',
  makeManifest({ id: 'Independent Worker v1' }),
  /pack\.md id 必须是长度不超过 160/
);
expectReject(
  'version must not be a numeric string',
  makeManifest({ version: '"1"' }),
  /version 必须是显式声明的大于 0 的安全整数/
);
expectReject(
  'absolute document id strategy',
  makeManifest({ documentIdStrategy: 'absolute_path' }),
  /documentIdStrategy 必须显式设为 pack_relative/
);
expectReject(
  'unit directory cannot escape source root',
  makeManifest({ units: '- type: heading_qa\n  dir: ..' }),
  /Source path escapes source root/
);
expectReject(
  'immutable version suffix mismatch',
  makeManifest({
    id: 'fixture-v1',
    version: '2',
    immutableVersioned: 'true',
  }),
  /id 必须以 -v2 结尾/
);
expectReject(
  'independent-worker version suffix mismatch',
  makeManifest({ id: 'independent-worker-core-v1', version: '2' }),
  /id 必须以 -v2 结尾/
);
expectReject(
  'immutable series id mismatch',
  makeManifest({
    id: 'independent-worker-core-v1',
    immutableVersioned: 'true',
    packMetadata: 'seriesId: wrong-series\nversionPolicy: immutable',
  }),
  /metadata\.seriesId 必须是 independent-worker-core/
);
expectReject(
  'immutable policy mismatch',
  makeManifest({
    id: 'independent-worker-core-v1',
    immutableVersioned: 'true',
    packMetadata: 'seriesId: independent-worker-core\nversionPolicy: mutable',
  }),
  /metadata\.versionPolicy 必须是 immutable/
);
expectReject(
  'immutable policy alone enforces the id suffix',
  makeManifest({
    id: 'fixture-v1',
    version: '2',
    packMetadata: 'seriesId: fixture\nversionPolicy: immutable',
  }),
  /id 必须以 -v2 结尾/
);
expectReject(
  'explicit mutable flag cannot downgrade an immutable namespace',
  makeManifest({
    id: 'independent-worker-core-v1',
    immutableVersioned: 'false',
    packMetadata: 'seriesId: independent-worker-core\nversionPolicy: immutable',
  }),
  /immutableVersioned=false 不能覆盖 immutable 策略/
);

function collectionDefinition(manifestPath: string) {
  const parsed = matter(readFileSync(manifestPath, 'utf8'));
  const collection = parsed.data.collection as Record<string, unknown>;
  const { sortOrder: _sortOrder, ...definition } = collection;
  return definition;
}

const coreCollection = collectionDefinition(
  join(repositoryRoot, 'knowledge-manifests/independent-worker-core-v1/pack.md')
);
const cliCollection = collectionDefinition(
  join(
    repositoryRoot,
    'knowledge-manifests/independent-worker-cli-library-v1/pack.md'
  )
);
assert.deepEqual(
  cliCollection,
  coreCollection,
  'manifests sharing a collection id must use one canonical definition'
);
assert.deepEqual(cliCollection, {
  id: 'independent-worker',
  name: '独立工作者',
  description:
    'one-worker-os 面向独立工作者的第一方方法、案例和 AI 可读资料合集。',
  status: 'active',
  metadata: {
    authority: 'first_party_collection',
    contentKinds: ['methodology', 'article', 'code'],
  },
});

console.log('Knowledge importer synthetic security fixtures passed');
