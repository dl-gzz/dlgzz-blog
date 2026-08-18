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
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const skillName = 'one-worker-os';
const skillSource = join(projectRoot, 'skills', skillName);
const outputDir = join(projectRoot, 'public', 'downloads');
const releaseFilename = 'one-worker-os-workbuddy-skill-release.json';
const releasePath = join(outputDir, releaseFilename);
const releaseHashPath = `${releasePath}.sha256`;
const normalizedMtime = new Date('2026-01-01T00:00:00.000Z');

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function writeAtomic(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temporary, content);
  renameSync(temporary, path);
}

function readManifest() {
  const raw = readFileSync(join(skillSource, 'manifest.yaml'), 'utf8');
  const name = raw.match(/^name:\s*["']?([^"'\s]+)["']?\s*$/m)?.[1];
  const version = raw.match(/^version:\s*["']?([^"'\s]+)["']?\s*$/m)?.[1];
  if (name !== skillName) throw new Error(`manifest name must be ${skillName}`);
  if (!version || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error('manifest version must be a valid semantic version');
  }
  return { name, version };
}

function listFiles(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort(
      (a, b) => a.name.localeCompare(b.name)
    )) {
      if (
        entry.name === '.DS_Store' ||
        entry.name === '.env' ||
        entry.name.startsWith('.env.')
      )
        continue;
      const absolute = join(directory, entry.name);
      if (entry.isSymbolicLink())
        throw new Error(`Skill package must not contain symlinks: ${absolute}`);
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
    const relativePath = relative(root, absolute).split(sep).join('/');
    chmodSync(absolute, relativePath.startsWith('scripts/') ? 0o755 : 0o644);
    utimesSync(absolute, normalizedMtime, normalizedMtime);
  }
}

function validateRequiredFiles(files) {
  const relativeFiles = new Set(
    files.map((path) => relative(skillSource, path).split(sep).join('/'))
  );
  for (const required of [
    'SKILL.md',
    'manifest.yaml',
    'agents/openai.yaml',
    'scripts/one-worker-os-credentials.mjs',
    'scripts/query-knowledge.mjs',
    'scripts/resolve-capability.mjs',
    'scripts/query-analytics.mjs',
    'scripts/update-one-worker-os-skill.mjs',
    'references/api-schema.md',
    'references/dispatch-protocol.md',
    'references/workbuddy-test-cases.md',
  ]) {
    if (!relativeFiles.has(required))
      throw new Error(`Missing required Skill file: ${required}`);
  }
}

function main() {
  if (!existsSync(skillSource))
    throw new Error(`Skill source not found: ${skillSource}`);
  const manifest = readManifest();
  const sourceFiles = listFiles(skillSource);
  validateRequiredFiles(sourceFiles);

  const temporaryRoot = mkdtempSync(
    join(tmpdir(), 'one-worker-os-skill-package-')
  );
  const stagedSkill = join(temporaryRoot, skillName);
  const temporaryZip = join(
    temporaryRoot,
    `one-worker-os-workbuddy-skill-${manifest.version}.zip`
  );
  const versionedFilename = basename(temporaryZip);
  const latestFilename = 'one-worker-os-workbuddy-skill-latest.zip';

  try {
    cpSync(skillSource, stagedSkill, { recursive: true, dereference: false });
    normalizeTree(stagedSkill);
    const stagedFiles = listFiles(stagedSkill);
    const archiveEntries = stagedFiles
      .map((path) => relative(temporaryRoot, path).split(sep).join('/'))
      .sort();
    const zipped = spawnSync(
      'zip',
      ['-X', '-q', temporaryZip, ...archiveEntries],
      {
        cwd: temporaryRoot,
        encoding: 'utf8',
      }
    );
    if (zipped.status !== 0) {
      throw new Error(
        `zip failed: ${(zipped.stderr || zipped.stdout || '').trim()}`
      );
    }

    const archive = readFileSync(temporaryZip);
    const archiveHash = sha256(archive);
    const versionedPath = join(outputDir, versionedFilename);
    const latestPath = join(outputDir, latestFilename);
    mkdirSync(outputDir, { recursive: true });
    copyFileSync(temporaryZip, versionedPath);
    copyFileSync(temporaryZip, latestPath);

    const fileManifest = stagedFiles.map((absolute) => {
      const content = readFileSync(absolute);
      return {
        path: relative(stagedSkill, absolute).split(sep).join('/'),
        size: content.length,
        sha256: sha256(content),
      };
    });
    const release = {
      schema: 'one-worker-os.skill-release.v1',
      name: manifest.name,
      version: manifest.version,
      artifact: {
        url: `/downloads/${versionedFilename}`,
        latestUrl: `/downloads/${latestFilename}`,
        size: archive.length,
        sha256: archiveHash,
      },
      files: fileManifest,
    };
    const releaseJson = `${JSON.stringify(release, null, 2)}\n`;
    const releaseHash = sha256(Buffer.from(releaseJson));

    writeAtomic(releasePath, releaseJson);
    writeAtomic(releaseHashPath, `${releaseHash}  ${releaseFilename}\n`);
    writeAtomic(
      `${versionedPath}.sha256`,
      `${archiveHash}  ${versionedFilename}\n`
    );
    writeAtomic(`${latestPath}.sha256`, `${archiveHash}  ${latestFilename}\n`);

    const latest = readFileSync(latestPath);
    if (latest.length !== archive.length || sha256(latest) !== archiveHash) {
      throw new Error(
        'latest ZIP does not match the versioned release artifact'
      );
    }
    console.log(
      JSON.stringify(
        {
          success: true,
          name: manifest.name,
          version: manifest.version,
          artifact: versionedPath,
          latest: latestPath,
          size: archive.length,
          sha256: archiveHash,
          files: fileManifest.length,
          release: releasePath,
          releaseSha256: releaseHash,
        },
        null,
        2
      )
    );
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
