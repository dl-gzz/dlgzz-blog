import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  cpSync,
  readdirSync,
  chmodSync,
  utimesSync,
  rmSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { verifyArchiveContents } from './lib/verify-release-archive.mjs';

const source = resolve('connectors/one-worker-os');
const output = resolve('public/one-worker-os-connector');
const metadata = JSON.parse(
  readFileSync(join(source, 'connector-meta.json'), 'utf8')
);
const version = metadata.version;
if (!/^\d+\.\d+\.\d+$/.test(version))
  throw new Error('Invalid connector version');
const name = `one-worker-os-connector-${version}.zip`;
const root = mkdtempSync(join(tmpdir(), 'one-worker-os-connector-'));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
try {
  const stage = join(root, 'stage');
  cpSync(source, stage, { recursive: true, dereference: false });
  const files = [];
  function visit(dir, prefix = '') {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const relative = prefix + entry.name;
      const path = join(dir, entry.name);
      if (entry.isSymbolicLink())
        throw new Error('Connector cannot contain symlinks');
      if (entry.isDirectory()) visit(path, `${relative}/`);
      else {
        if (entry.name.startsWith('.env'))
          throw new Error('Connector cannot contain environment files');
        chmodSync(path, 0o644);
        utimesSync(
          path,
          new Date('2026-01-01T00:00:00Z'),
          new Date('2026-01-01T00:00:00Z')
        );
        files.push(relative);
      }
    }
  }
  visit(stage);
  const zipped = spawnSync(
    'zip',
    ['-X', '-q', join(root, name), ...files.sort()],
    { cwd: stage }
  );
  if (zipped.status !== 0) throw new Error('Connector packaging failed');
  const bytes = readFileSync(join(root, name));
  const path = join(output, name);
  if (process.argv.includes('--check')) {
    const published = readFileSync(path);
    const release = JSON.parse(
      readFileSync(join(output, 'release.json'), 'utf8')
    );
    if (
      release.version !== version ||
      release.artifact.sha256 !== hash(published) ||
      release.artifact.size !== published.length ||
      readFileSync(`${path}.sha256`, 'utf8') !== `${hash(published)}  ${name}\n`
    )
      throw new Error('Connector release metadata mismatch');
    verifyArchiveContents(published, bytes, name);
  } else {
    mkdirSync(output, { recursive: true });
    if (existsSync(path) && hash(readFileSync(path)) !== hash(bytes))
      throw new Error(
        'Bump connector version before changing an existing release'
      );
    writeFileSync(path, bytes);
    writeFileSync(`${path}.sha256`, `${hash(bytes)}  ${name}\n`);
    const release =
      JSON.stringify(
        {
          name: metadata.source,
          version,
          artifact: {
            url: `/one-worker-os-connector/${name}`,
            size: bytes.length,
            sha256: hash(bytes),
          },
        },
        null,
        2
      ) + '\n';
    writeFileSync(join(output, 'release.json'), release);
  }
  console.log(`Connector ${version}: archive matches source`);
} finally {
  rmSync(root, { recursive: true, force: true });
}
