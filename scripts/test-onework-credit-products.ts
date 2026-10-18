import assert from 'node:assert/strict';

const envKeys = [
  'NEXT_PUBLIC_ONEWORK_CREDIT_PRICE_ID',
  'NEXT_PUBLIC_ONEWORK_CREDIT_AMOUNT_MINOR',
  'NEXT_PUBLIC_ONEWORK_CREDIT_COUNT',
] as const;
const original = Object.fromEntries(
  envKeys.map((key) => [key, process.env[key]])
);

async function main() {
  try {
    process.env.NEXT_PUBLIC_ONEWORK_CREDIT_PRICE_ID = 'price_1000';
    process.env.NEXT_PUBLIC_ONEWORK_CREDIT_AMOUNT_MINOR = '9900';
    process.env.NEXT_PUBLIC_ONEWORK_CREDIT_COUNT = '1000';
    const { getOneWorkUsageCreditsForPrice } = await import(
      '../src/lib/onework-credit-products'
    );
    const { oneWorkQuotaPeriodStart } = await import('../src/lib/api-key');
    assert.equal(getOneWorkUsageCreditsForPrice('price_1000'), 1000);
    assert.equal(getOneWorkUsageCreditsForPrice('other_price'), null);

    const anchor = new Date('2026-01-18T07:30:00.000Z');
    assert.equal(
      oneWorkQuotaPeriodStart(
        new Date('2026-02-18T07:29:59.999Z'),
        anchor
      ).toISOString(),
      anchor.toISOString()
    );
    assert.equal(
      oneWorkQuotaPeriodStart(
        new Date('2026-02-18T07:30:00.000Z'),
        anchor
      ).toISOString(),
      '2026-02-18T07:30:00.000Z'
    );

    const monthEndAnchor = new Date('2026-01-31T12:00:00.000Z');
    assert.equal(
      oneWorkQuotaPeriodStart(
        new Date('2026-02-27T12:00:00.000Z'),
        monthEndAnchor
      ).toISOString(),
      monthEndAnchor.toISOString()
    );
    assert.equal(
      oneWorkQuotaPeriodStart(
        new Date('2026-02-28T12:00:00.000Z'),
        monthEndAnchor
      ).toISOString(),
      '2026-02-28T12:00:00.000Z'
    );
  } finally {
    for (const key of envKeys) {
      if (original[key] === undefined) Reflect.deleteProperty(process.env, key);
      else process.env[key] = original[key];
    }
  }

  console.log('one-worker-os credit product mapping tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
