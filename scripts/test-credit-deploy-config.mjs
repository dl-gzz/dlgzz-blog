// Validate the actual Docker build wiring and compiled price configuration.
// No environment files, network, payment gateway, or database connections.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const keys = [
  'NEXT_PUBLIC_ONEWORK_CREDIT_PRICE_ID',
  'NEXT_PUBLIC_ONEWORK_CREDIT_AMOUNT_MINOR',
  'NEXT_PUBLIC_ONEWORK_CREDIT_COUNT',
];
const docker = readFileSync('Dockerfile', 'utf8');
const compose = readFileSync('deploy/docker-compose.prod.yml', 'utf8');
for (const key of keys) {
  assert.ok(docker.includes('ARG ' + key + '\n'), key + ' build argument');
  assert.ok(docker.includes(key + '=$' + key), key + ' builder environment');
  assert.ok(
    compose.includes(key + ': ${' + key + ':-}'),
    key + ' compose build argument'
  );
}
console.log(
  'PASS: all three public credit-product values reach the Docker builder'
);

async function compiledPlan(values) {
  const result = await build({
    entryPoints: ['src/config/website.tsx'],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    packages: 'external',
    define: Object.fromEntries(
      keys.map((key, index) => [
        'process.env.' + key,
        JSON.stringify(values[index] || ''),
      ])
    ),
  });
  const module = { exports: {} };
  vm.runInThisContext(
    '(function(require,module,exports){' + result.outputFiles[0].text + '\n})'
  )(require, module, module.exports);
  return module.exports.websiteConfig.price.plans.onework_credits;
}
const configured = await compiledPlan(['fixture_credits', '9900', '1000']);
assert.equal(configured.disabled, false);
assert.equal(configured.prices[0].priceId, 'fixture_credits');
assert.equal(configured.prices[0].amount, 9900);
assert.equal(configured.prices[0].usageCredits, 1000);
assert.equal(configured.prices[0].currency, 'CNY');
console.log(
  'PASS: configured build preserves the server-owned product, integer amount and credits'
);
for (const values of [
  ['', '', ''],
  ['fixture', '', '1000'],
  ['fixture', '9900', ''],
  ['fixture', '0', '1000'],
  ['fixture', '99.1', '1000'],
  ['fixture', '9900', '1.5'],
  ['fixture', '9900', '10000001'],
]) {
  const plan = await compiledPlan(values);
  assert.equal(plan.disabled, true);
  assert.equal(plan.prices[0].disabled, true);
}
console.log(
  'PASS: missing or invalid configuration cannot expose a purchasable credit plan'
);
