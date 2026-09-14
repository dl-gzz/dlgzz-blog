import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Compare files rather than ZIP bytes: ZIP headers differ across platforms.
export function verifyArchiveContents(actual, expected, label) {
  const root = mkdtempSync(join(tmpdir(), 'one-worker-os-verify-'));
  const run = (args) => {
    const result = spawnSync('unzip', args, { maxBuffer: 32 * 1024 * 1024 });
    if (result.status !== 0) throw new Error(`Cannot read ${label}`);
    return result.stdout;
  };
  try {
    const a = join(root, 'actual.zip');
    const b = join(root, 'expected.zip');
    writeFileSync(a, actual);
    writeFileSync(b, expected);
    const names = (path) =>
      run(['-Z1', path])
        .toString()
        .trim()
        .split('\n')
        .filter((name) => !name.endsWith('/'))
        .sort();
    const actualNames = names(a);
    const expectedNames = names(b);
    if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
      throw new Error(
        `${label}: released file list differs from current source; bump version and package again`
      );
    }
    for (const name of expectedNames) {
      if (!run(['-p', a, name]).equals(run(['-p', b, name]))) {
        throw new Error(
          `${label}: stale released file ${name}; bump version and package again`
        );
      }
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
