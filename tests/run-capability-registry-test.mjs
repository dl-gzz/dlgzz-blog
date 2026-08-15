#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temporaryDirectory = mkdtempSync(
  resolve(tmpdir(), 'onework-capability-registry-test-')
);
const bundledTest = resolve(temporaryDirectory, 'capability-registry.test.mjs');

try {
  const bundle = spawnSync(
    resolve(projectRoot, 'node_modules/.bin/esbuild'),
    [
      'tests/capability-registry.test.ts',
      '--bundle',
      '--platform=node',
      '--format=esm',
      `--outfile=${bundledTest}`,
      `--alias:server-only=${resolve(projectRoot, 'tests/server-only-stub.mjs')}`,
      '--log-level=warning',
    ],
    {
      cwd: projectRoot,
      stdio: 'inherit',
    }
  );
  if (bundle.error) throw bundle.error;
  if (bundle.status !== 0) {
    throw new Error(`esbuild 失败，退出码：${bundle.status ?? '未知'}`);
  }

  const result = spawnSync(process.execPath, ['--test', bundledTest], {
    cwd: projectRoot,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
