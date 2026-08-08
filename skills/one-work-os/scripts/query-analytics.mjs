#!/usr/bin/env node

import { getOneWorkApiKey } from './onework-credentials.mjs';

import { readFile } from 'node:fs/promises';

const DEFAULT_ORIGIN = 'https://www.dlgzz.com';
const ENDPOINT_PATH = '/api/analytics/query';
const CONTRACT = 'onework.semantic-query.v1';
const FORBIDDEN_KEYS = new Set([
  'sql',
  'rawsql',
  'statement',
  'tablename',
  'columnname',
  'joinclause',
  'expression',
]);

function usage(stream = process.stderr) {
  stream.write(
    [
      'Usage: node scripts/query-analytics.mjs (--request <json> | --file <path>) [options]',
      '',
      'Options:',
      '  --request <json>       Semantic query JSON object',
      '  --file <path>          Read the semantic query object from a JSON file',
      '  --validate-only        Validate without returning data',
      '  --json                 Print the complete JSON response',
      '  --help                 Show this help',
      '',
      'Environment:',
      '  ONEWORK_API_KEY        Required bearer key',
      '  ONEWORK_ANALYTICS_URL  Optional full analytics endpoint',
      '  ONEWORK_API_URL        Optional OneWorkOS URL; its origin is used',
      '',
    ].join('\n')
  );
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
    request: undefined,
    file: undefined,
    validateOnly: false,
    json: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--request') {
      options.request = readValue(argv, index++, arg);
    } else if (arg === '--file') options.file = readValue(argv, index++, arg);
    else if (arg === '--validate-only') options.validateOnly = true;
    else if (arg === '--json') options.json = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!options.help && Boolean(options.request) === Boolean(options.file)) {
    throw new Error('Provide exactly one of --request or --file');
  }
  return options;
}

function parseJsonObject(raw, source) {
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error(`${source} must contain valid JSON`);
  }
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw new Error(`${source} must contain a JSON object`);
  }
  return value;
}

function findForbiddenKey(value) {
  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findForbiddenKey(item);
      if (found) return found;
    }
    return null;
  }
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key.toLowerCase())) return key;
    const found = findForbiddenKey(child);
    if (found) return found;
  }
  return null;
}

function validateSemanticQuery(query) {
  const forbidden = findForbiddenKey(query);
  if (forbidden) {
    throw new Error(
      `Raw database field "${forbidden}" is forbidden; use semantic IDs`
    );
  }
  if (query.contract && query.contract !== CONTRACT) {
    throw new Error(`Unsupported contract: ${query.contract}`);
  }
  if (typeof query.model !== 'string' || !query.model.trim()) {
    throw new Error('semantic query requires a model');
  }
  if (!Array.isArray(query.metrics) || query.metrics.length === 0) {
    throw new Error('semantic query requires at least one metric');
  }
  if (query.metrics.length > 20)
    throw new Error('metrics accepts at most 20 IDs');
  if (query.dimensions && !Array.isArray(query.dimensions)) {
    throw new Error('dimensions must be an array');
  }
  if (query.dimensions?.length > 20) {
    throw new Error('dimensions accepts at most 20 IDs');
  }
  if (query.filters && !Array.isArray(query.filters)) {
    throw new Error('filters must be an array');
  }
  if (query.filters?.length > 50)
    throw new Error('filters accepts at most 50 items');
  if (query.limit !== undefined) {
    if (
      !Number.isInteger(query.limit) ||
      query.limit < 1 ||
      query.limit > 500
    ) {
      throw new Error('limit must be an integer between 1 and 500');
    }
  }

  return {
    ...query,
    contract: CONTRACT,
    model: query.model.trim(),
  };
}

function resolveEndpoint() {
  const explicit = process.env.ONEWORK_ANALYTICS_URL?.trim();
  const base =
    explicit || process.env.ONEWORK_API_URL?.trim() || DEFAULT_ORIGIN;
  let parsed;
  try {
    parsed = new URL(base);
  } catch {
    throw new Error('OneWorkOS endpoint is not a valid URL');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('OneWorkOS endpoint must use HTTP or HTTPS');
  }
  return explicit
    ? parsed.toString()
    : new URL(ENDPOINT_PATH, parsed.origin).toString();
}

function printReadable(data) {
  const result = data.result;
  console.log(`Request: ${data.requestId || 'n/a'}`);
  console.log(`Model: ${data.evidence?.model || 'unknown'}`);
  if (!result || typeof result !== 'object') {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  if (Array.isArray(result.rows)) {
    console.log(
      `Rows: ${result.rowCount ?? result.rows.length}${result.truncated ? ' (truncated)' : ''}`
    );
    console.log(JSON.stringify(result.rows, null, 2));
  } else {
    console.log('Validation: ok');
  }
  if (data.evidence?.dataFreshness) {
    console.log(`Data freshness: ${data.evidence.dataFreshness}`);
  }
}

async function readResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { error: text.slice(0, 500) };
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage(process.stdout);
    return;
  }

  const raw = options.request
    ? options.request
    : await readFile(options.file, 'utf8').catch((error) => {
        throw new Error(`Cannot read --file: ${error.message}`);
      });
  const semanticQuery = validateSemanticQuery(
    parseJsonObject(raw, options.file || '--request')
  );

  const apiKey = getOneWorkApiKey();
  if (!apiKey) throw new Error('ONEWORK_API_KEY is not set');

  const response = await fetch(resolveEndpoint(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      semanticQuery,
      mode: options.validateOnly ? 'validate' : 'execute',
    }),
  });

  const data = await readResponse(response);
  if (!response.ok) {
    const code = data?.code ? ` ${data.code}` : '';
    const message = data?.error || `HTTP ${response.status}`;
    throw new Error(`OneWorkOS API${code}: ${message}`);
  }
  if (!data?.success) {
    throw new Error('OneWorkOS API returned an invalid analytics response');
  }

  if (options.json) console.log(JSON.stringify(data, null, 2));
  else printReadable(data);
}

main().catch((error) => {
  usage();
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
