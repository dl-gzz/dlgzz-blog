import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

// Exercise the real scripts with sudo's environment reset, without network or Docker.
const fixture = mkdtempSync(join(tmpdir(), 'one-worker-os-deploy-test-'));
const bin = join(fixture, 'bin');
mkdirSync(bin);
const revision = 'a'.repeat(40);
const executable = (name, body) => writeFileSync(join(bin, name), `#!/bin/bash\nset -eu\n${body}\n`, { mode: 0o755 });
try {
  executable('sudo', 'exec env -i PATH="$PATH" "$@"');
  executable('git', `if [ "\${1:-}" = rev-parse ]; then echo ${revision}; elif [ "\${1:-}" = branch ]; then echo main; fi`);
  executable('flock', 'exit 0');
  executable('timeout', 'shift; exec "$@"');
  executable('docker', `test "\${GIT_COMMIT_SHA:-}" = ${revision}
test "\${GIT_BRANCH:-}" = main
printf '%s\\n' "$*" >> '${join(fixture, 'docker.log')}'
echo test-container`);
  executable('curl', `echo '{"success":true,"commit":"${revision}"}'`);
  const env = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    APP_DIR: fixture,
    LOCK_FILE: join(fixture, 'deploy.lock'),
    SKIP_FETCH: '1',
  };
  delete env.GIT_COMMIT_SHA;
  delete env.GIT_BRANCH;
  for (const script of ['deploy.sh', 'deploy-if-changed.sh']) {
    const result = spawnSync('bash', [resolve('deploy', script)], { env, encoding: 'utf8' });
    assert.equal(result.status, 0, `${script}: ${result.stdout}\n${result.stderr}`);
  }
  const calls = readFileSync(join(fixture, 'docker.log'), 'utf8');
  assert.match(calls, /build --pull app/);
  assert.match(calls, /up -d --remove-orphans app/);
  assert.match(calls, /ps --status running --quiet app/);
  console.log('PASS: build and status checks retain the exact revision across sudo.');
} finally {
  rmSync(fixture, { recursive: true, force: true });
}
