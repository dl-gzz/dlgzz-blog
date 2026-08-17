#!/usr/bin/env node

import {
  getOneWorkAuthHeaders,
  oneWorkApiErrorMessage,
} from './onework-credentials.mjs';

const DEFAULT_ORIGIN = 'https://www.dlgzz.com';
const ENDPOINT_PATH = '/api/capabilities/resolve';

function usage(stream = process.stderr) {
  stream.write(
    [
      'Usage: node scripts/resolve-capability.mjs --goal <text> [options]',
      '',
      'Options:',
      '  --intent <id>          Optional intent hint',
      '  --context <json>       Minimal routing context object',
      '  --available <ids>      Comma-separated host capability IDs',
      '  --execute              The user requested execution',
      '  --json                 Print the complete JSON response',
      '  --help                 Show this help',
      '',
      'Environment:',
      '  ONEWORK_API_KEY        Required bearer key',
      '  ONEWORK_DEVICE_ID      Required bound device ID',
      '  ONEWORK_CAPABILITY_URL Optional full resolver endpoint',
      '  ONEWORK_API_URL        Optional OneWorkerOS URL; its origin is used',
      '',
    ].join('\n')
  );
}

function parseJsonObject(raw, name) {
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error(`${name} must be valid JSON`);
  }
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw new Error(`${name} must be a JSON object`);
  }
  return value;
}

function readValue(argv, index, option) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${option} requires a value`);
  }
  return value;
}

function parseArgs(argv) {
  const options = {
    goal: '',
    intentHint: undefined,
    context: {},
    availableCapabilities: [],
    executionRequested: false,
    json: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--goal') options.goal = readValue(argv, index++, arg);
    else if (arg === '--intent') {
      options.intentHint = readValue(argv, index++, arg);
    } else if (arg === '--context') {
      options.context = parseJsonObject(readValue(argv, index++, arg), arg);
    } else if (arg === '--available') {
      options.availableCapabilities = readValue(argv, index++, arg)
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
    } else if (arg === '--execute') options.executionRequested = true;
    else if (arg === '--json') options.json = true;
    else if (!arg.startsWith('-') && !options.goal) options.goal = arg;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  options.goal = options.goal.trim();
  if (options.intentHint) options.intentHint = options.intentHint.trim();
  options.availableCapabilities = [...new Set(options.availableCapabilities)];

  if (!options.help && !options.goal) throw new Error('Missing --goal');
  if (options.goal.length > 2000) throw new Error('--goal is too long');
  if (options.availableCapabilities.length > 100) {
    throw new Error('--available accepts at most 100 capability IDs');
  }
  return options;
}

function resolveEndpoint() {
  const explicit = process.env.ONEWORK_CAPABILITY_URL?.trim();
  const base =
    explicit || process.env.ONEWORK_API_URL?.trim() || DEFAULT_ORIGIN;
  let parsed;
  try {
    parsed = new URL(base);
  } catch {
    throw new Error('OneWorkerOS endpoint is not a valid URL');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('OneWorkerOS endpoint must use HTTP or HTTPS');
  }
  if (
    parsed.protocol === 'http:' &&
    !['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname)
  ) {
    throw new Error('远程 OneWorkerOS endpoint 必须使用 HTTPS');
  }
  return explicit
    ? parsed.toString()
    : new URL(ENDPOINT_PATH, parsed.origin).toString();
}

function printReadable(data) {
  const resolution = data.resolution;
  if (!resolution || typeof resolution !== 'object') {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  console.log(`Intent: ${resolution.intent || 'unknown'}`);
  console.log(`Route: ${resolution.route || 'unknown'}`);
  console.log(`Risk: ${resolution.risk || 'unknown'}`);
  if (typeof resolution.requiresConfirmation === 'boolean') {
    console.log(
      `Confirmation: ${resolution.requiresConfirmation ? 'required' : 'not required'}`
    );
  }

  const capabilities = Array.isArray(resolution.capabilities)
    ? resolution.capabilities
    : [];
  if (capabilities.length) {
    console.log('Capabilities:');
    for (const capability of capabilities) {
      if (typeof capability === 'string') console.log(`- ${capability}`);
      else {
        const operation = capability.operation
          ? `.${capability.operation}`
          : '';
        const reason = capability.reason ? ` — ${capability.reason}` : '';
        console.log(`- ${capability.id || 'unknown'}${operation}${reason}`);
      }
    }
  }

  const missing = Array.isArray(resolution.missingCapabilities)
    ? resolution.missingCapabilities
    : [];
  if (missing.length) console.log(`Missing: ${missing.join(', ')}`);
}

async function readResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return {
      error: text.slice(0, 500),
      nonJson: true,
      contentType: response.headers.get('content-type') || '',
    };
  }
}

async function fetchWithTimeout(url, init, timeoutMs = 15_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(
        `OneWorkerOS 能力路由超时（${Math.round(timeoutMs / 1000)} 秒），请检查网络后重试。`
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage(process.stdout);
    return;
  }

  const response = await fetchWithTimeout(resolveEndpoint(), {
    method: 'POST',
    headers: getOneWorkAuthHeaders(),
    body: JSON.stringify({
      goal: options.goal,
      ...(options.intentHint ? { intentHint: options.intentHint } : {}),
      context: options.context,
      availableCapabilities: options.availableCapabilities,
      executionRequested: options.executionRequested,
    }),
  });

  const data = await readResponse(response);
  if (!response.ok) {
    if (data?.nonJson) {
      const contentType = data.contentType || 'non-JSON';
      throw new Error(
        `OneWorkerOS API HTTP ${response.status}: resolver returned ${contentType}; check deployment of /api/capabilities/resolve`
      );
    }
    const code = data?.code ? ` ${data.code}` : '';
    const message = oneWorkApiErrorMessage(data, response.status);
    throw new Error(`OneWorkerOS API${code}: ${message}`);
  }
  if (!data?.success || !data.resolution) {
    throw new Error('OneWorkerOS API returned an invalid resolver response');
  }

  if (options.json) console.log(JSON.stringify(data, null, 2));
  else printReadable(data);
}

main().catch((error) => {
  usage();
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
