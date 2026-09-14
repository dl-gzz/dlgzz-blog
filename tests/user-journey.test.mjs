import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { NextRequest } from 'next/server';
import {
  issueMembershipActivationCode,
  getMembershipStatus,
} from '../src/lib/membership';
import { redeemUnifiedMembership } from '../src/lib/unified-redemption';
import { POST as webhook } from '../src/app/api/webhooks/xorpay/route';
import { GET as orderStatus } from '../src/app/api/xorpay/check-status/route';
import { GET as payParams } from '../src/app/api/xorpay/get-pay-params/route';
import { safeLocalRedirect } from '../src/lib/safe-redirect';

async function main() {
  for (const path of [
    '//evil.test',
    '/\n/evil.test',
    '/\\evil.test',
    'https://evil.test',
  ]) {
    assert.equal(safeLocalRedirect(path, '/dashboard'), '/dashboard');
  }
  assert.equal(
    safeLocalRedirect('/blog?from=signup', '/dashboard'),
    '/blog?from=signup'
  );
  const pg = new PGlite();
  globalThis.__journeyDb = drizzle(pg);
  globalThis.fetch = () => {
    throw new Error('No network permitted in journey tests');
  };
  process.env.XORPAY_APP_SECRET = 'isolated-webhook-secret';
  try {
    await pg.exec(`
    CREATE TABLE "user"(id text primary key, email text, name text, banned boolean);
    INSERT INTO "user" VALUES ('reader','reader@example.test','Reader',false),('other','other@example.test','Other',false);
    CREATE TABLE payment(id text primary key, price_id text, type text, interval text, user_id text, customer_id text, subscription_id text,
      status text, period_start timestamp, period_end timestamp, cancel_at_period_end boolean, trial_start timestamp, trial_end timestamp,
      created_at timestamp default now(), updated_at timestamp default now());
    CREATE TABLE api_key(id text primary key,user_id text,status text,monthly_quota integer,updated_at timestamp);
  `);
    await pg.exec(
      fs.readFileSync('src/db/migrations/0027_unified_membership.sql', 'utf8')
    );
    // Use the real table/index definitions, omitting unrelated tables and hosted RLS roles.
    for (const file of [
      '0012_onework_access.sql',
      '0020_onework_entitlement_grant_ledger.sql',
    ]) {
      const statements = fs
        .readFileSync('src/db/migrations/' + file, 'utf8')
        .split('--> statement-breakpoint');
      for (const statement of statements) {
        const start = statement.search(
          /CREATE (?:TABLE|(?:UNIQUE )?INDEX) IF NOT EXISTS/
        );
        if (start < 0) continue;
        const sql = statement.slice(start);
        if (
          /CREATE TABLE IF NOT EXISTS "(?:onework_activation_code|onework_entitlement|onework_entitlement_grant)"/.test(
            sql
          ) ||
          /\sON\s+"?(?:onework_activation_code|onework_entitlement|onework_entitlement_grant)"?\s*\(/.test(
            sql
          )
        )
          await pg.exec(sql);
      }
    }
    const code = await issueMembershipActivationCode({ durationDays: 30 });
    const redeemed = await redeemUnifiedMembership({
      userId: 'reader',
      code: code.rawCode,
    });
    assert.equal(redeemed.isMember, true);
    assert.deepEqual(redeemed.packs, ['*']);
    const expiry = async () =>
      Date.parse((await getMembershipStatus('reader')).expiresAt);
    const first = await expiry();
    const ai = async () =>
      (
        await pg.query(
          "SELECT expires_at AT TIME ZONE 'UTC' AS expires_at FROM onework_entitlement WHERE user_id='reader' AND knowledge_pack_id='*'"
        )
      ).rows[0];
    assert.equal(Date.parse((await ai()).expires_at), first);
    await assert.rejects(
      () => redeemUnifiedMembership({ userId: 'other', code: code.rawCode }),
      { code: 'CODE_NOT_ACTIVE' }
    );
    await assert.rejects(
      () => redeemUnifiedMembership({ userId: 'reader', code: 'MEM-invalid' }),
      { code: 'INVALID_CODE' }
    );
    assert.equal(await expiry(), first, 'invalid code must roll back pre-sync');

    const retryCode = await issueMembershipActivationCode({ durationDays: 7 });
    await pg.exec(
      "CREATE FUNCTION reject_ai_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture injected AI failure'; END $$; CREATE TRIGGER reject_ai BEFORE UPDATE ON onework_entitlement FOR EACH ROW EXECUTE FUNCTION reject_ai_write();"
    );
    await assert.rejects(() =>
      redeemUnifiedMembership({ userId: 'reader', code: retryCode.rawCode })
    );
    assert.equal(
      await expiry(),
      first,
      'failed AI grant rolls back club extension'
    );
    const retryHash = createHash('sha256')
      .update(retryCode.rawCode)
      .digest('hex');
    assert.equal(
      (
        await pg.query(
          'SELECT status FROM membership_activation_code WHERE code_hash=$1',
          [retryHash]
        )
      ).rows[0].status,
      'active',
      'failed redemption never consumes code'
    );
    await pg.exec(
      'DROP TRIGGER reject_ai ON onework_entitlement; DROP FUNCTION reject_ai_write();'
    );

    async function newOrder(id) {
      await pg.query(
        "INSERT INTO payment(id,user_id,price_id,type,interval,customer_id,subscription_id,status,period_start,period_end) VALUES ($1,'reader','xorpay_pro_monthly','subscription','month','fixture',$1,'processing',now(),now()+interval '30 days')",
        [id]
      );
    }
    function notify(id, signature = true) {
      const payTime = '2026-09-14 12:00:00';
      const sign = createHash('md5')
        .update(
          id + 'order-' + id + '19.90' + payTime + process.env.XORPAY_APP_SECRET
        )
        .digest('hex');
      return webhook(
        new NextRequest('https://fixture.test/api/webhooks/xorpay', {
          method: 'POST',
          body: new URLSearchParams({
            aoid: id,
            order_id: 'order-' + id,
            pay_price: '19.90',
            pay_time: payTime,
            sign: signature ? sign : 'invalid',
          }),
        })
      );
    }
    await newOrder('paid-a');
    assert.equal((await notify('paid-a', false)).status, 400);
    assert.equal(await expiry(), first);
    assert.equal((await notify('paid-a')).status, 200);
    assert.equal(
      await expiry(),
      first + 30 * 86400000,
      'new paid period extends remaining membership'
    );
    assert.equal(Date.parse((await ai()).expires_at), await expiry());
    await notify('paid-a');
    assert.equal(await expiry(), first + 30 * 86400000, 'replay adds nothing');
    await newOrder('paid-b');
    await notify('paid-b');
    await notify('paid-a');
    assert.equal(
      await expiry(),
      first + 60 * 86400000,
      'old replay after a later order adds nothing'
    );

    // Force a failure between AI and club grants; outer transaction must roll back both.
    await pg.exec(
      "CREATE FUNCTION reject_club_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture injected failure'; END $$; CREATE TRIGGER reject_club BEFORE UPDATE ON membership_entitlement FOR EACH ROW EXECUTE FUNCTION reject_club_write();"
    );
    await newOrder('paid-c');
    assert.equal((await notify('paid-c')).status, 500);
    assert.equal(Date.parse((await ai()).expires_at), first + 60 * 86400000);
    assert.equal(
      (
        await pg.query(
          "SELECT count(*)::int AS n FROM onework_entitlement_grant WHERE external_order_id='xorpay:paid-c'"
        )
      ).rows[0].n,
      0
    );
    await pg.exec(
      'DROP TRIGGER reject_club ON membership_entitlement; DROP FUNCTION reject_club_write();'
    );
    assert.equal((await notify('paid-c')).status, 200);
    assert.equal(await expiry(), first + 90 * 86400000);

    const legacy = 'OWOS-TEST-LEGACY';
    await pg.query(
      "INSERT INTO onework_activation_code(id,code_hash,code_prefix,pack_ids,trial_days) VALUES ('legacy',$1,'OWOS-test','[\"*\"]',10)",
      [createHash('sha256').update(legacy).digest('hex')]
    );
    const legacyResult = await redeemUnifiedMembership({
      userId: 'reader',
      code: legacy,
    });
    assert.equal(Date.parse(legacyResult.expiresAt), first + 100 * 86400000);
    assert.equal(Date.parse((await ai()).expires_at), await expiry());
    const lifetime = await issueMembershipActivationCode({
      durationDays: null,
    });
    await redeemUnifiedMembership({ userId: 'reader', code: lifetime.rawCode });
    await newOrder('paid-d');
    await notify('paid-d');
    assert.equal((await getMembershipStatus('reader')).expiresAt, null);
    assert.equal((await ai()).expires_at, null);

    const query = () =>
      orderStatus(
        new NextRequest(
          'https://fixture.test/api/xorpay/check-status?aoid=paid-a'
        )
      );
    globalThis.__journeySession = null;
    assert.equal((await query()).status, 401);
    assert.equal(
      (
        await payParams(
          new NextRequest(
            'https://fixture.test/api/xorpay/get-pay-params?aoid=paid-a'
          )
        )
      ).status,
      401
    );
    globalThis.__journeySession = { user: { id: 'other' } };
    assert.equal((await query()).status, 404);
    assert.equal(
      (
        await payParams(
          new NextRequest(
            'https://fixture.test/api/xorpay/get-pay-params?aoid=paid-a'
          )
        )
      ).status,
      404
    );
    globalThis.__journeySession = { user: { id: 'reader' } };
    const owned = await query();
    assert.equal(owned.status, 200);
    assert.equal(owned.headers.get('cache-control'), 'no-store');
    assert.equal((await owned.json()).status, 'completed');
    console.log(
      'PASS: unified MEM/legacy codes, matching deadlines, paid renewal, invalid signatures, old/new callback replay, atomic failure rollback and retry, permanent membership, order ownership. No production writes.'
    );
  } finally {
    await pg.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
