import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let cached;

function parseEnvFile(raw) {
  const values = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator <= 0) continue;
    const name = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    values[name] = value;
  }
  return values;
}

/** Load credentials kept beside the installed Skill without printing them. */
export function getOneWorkEnv() {
  if (cached) return cached;
  const skillRoot = dirname(dirname(fileURLToPath(import.meta.url)));
  const workbuddyRoot = dirname(dirname(skillRoot));
  const envPaths = [
    join(workbuddyRoot, 'one-work-os.local.env'),
    join(skillRoot, '.env'),
  ];
  cached = {};
  for (const envPath of envPaths) {
    try {
      cached = { ...cached, ...parseEnvFile(readFileSync(envPath, 'utf8')) };
    } catch {
      // Keep trying the next local credential location.
    }
  }
  return cached;
}

export function getOneWorkApiKey() {
  return (
    process.env.ONEWORK_API_KEY ||
    getOneWorkEnv().ONEWORK_API_KEY ||
    ''
  ).trim();
}
