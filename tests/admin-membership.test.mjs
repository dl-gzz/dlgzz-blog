import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import {
  getAdminMembershipOverview,
  membershipCodeState,
} from '../src/lib/admin-membership-overview';
import { canAccessHermesAdmin } from '../src/lib/hermes-admin-access';
import { getUsersAction } from '../src/actions/get-users';

async function main() {
  const pg = new PGlite();
  const previousWhitelist = process.env.HERMES_ADMIN_EMAILS;
  process.env.HERMES_ADMIN_EMAILS = 'allowed@example.test';
  globalThis.__adminDb = drizzle(pg);
  globalThis.__adminDbReads = 0;
  try {
    for (const session of [
      null,
      { user: { id: 'member', role: 'user', email: 'member@example.test' } },
    ]) {
      globalThis.__adminSession = session;
      await assert.rejects(getAdminMembershipOverview, /FORBIDDEN/);
      const response = await getUsersAction({
        pageIndex: 0,
        pageSize: 10,
        search: '',
        sorting: [],
      });
      assert.equal(response.data.success, false);
      assert.equal(
        response.data.data,
        undefined,
        'No user data sent to unauthorized callers'
      );
    }
    assert.equal(
      globalThis.__adminDbReads,
      0,
      'Reject anonymous and regular members before touching the DB'
    );
    assert.equal(
      canAccessHermesAdmin({ role: 'user', email: 'unknown@example.test' }),
      false
    );
    assert.equal(
      canAccessHermesAdmin({ role: 'user', email: ' ALLOWED@example.test ' }),
      true
    );
    await pg.exec(`CREATE TABLE "user" (id text primary key, name text, email text, email_verified boolean,
      image text, role text, banned boolean, ban_reason text, ban_expires timestamp, customer_id text,
      created_at timestamp default now(), updated_at timestamp default now());
      INSERT INTO "user"(id,name,email,role) VALUES ('admin','Owner','owner@example.test','admin'), ('member','Member','member@example.test','user');`);
    await pg.exec(
      fs.readFileSync('src/db/migrations/0004_miniapp_account.sql', 'utf8')
    );
    await pg.exec(`CREATE TABLE payment (id text, user_id text, type text, status text,
      period_start timestamp, period_end timestamp, created_at timestamp);`);
    await pg.exec(
      fs.readFileSync('src/db/migrations/0027_unified_membership.sql', 'utf8')
    );
    const future = new Date(Date.now() + 86400000);
    const past = new Date(Date.now() - 86400000);
    await pg.query(
      "INSERT INTO membership_entitlement(id,user_id,product_id,status,expires_at) VALUES ('m1','member','club','active',$1),('m2','admin','club','active',$2)",
      [future, past]
    );
    await pg.exec(
      "INSERT INTO miniapp_account(id,openid,user_id) VALUES ('wx1','private-openid-1','member'),('wx2','private-openid-2','member')"
    );
    for (const [id, status, redeemedCount, expiry] of [
      ['pending', 'active', 0, null],
      ['redeemed', 'redeemed', 1, null],
      ['expired', 'active', 0, past],
      ['revoked', 'revoked', 0, null],
    ]) {
      await pg.query(
        'INSERT INTO membership_activation_code(id,code_hash,code_prefix,label,status,redeemed_count,code_expires_at,redeemed_by_user_id) VALUES ($1,$2,$3,$1,$4,$5,$6,$7)',
        [
          id,
          'secret-hash-' + id,
          'MEM-' + id,
          status,
          redeemedCount,
          expiry,
          redeemedCount ? 'member' : null,
        ]
      );
    }
    globalThis.__adminSession = {
      user: { id: 'admin', role: 'admin', email: 'owner@example.test' },
    };
    const result = await getAdminMembershipOverview();
    assert.deepEqual(result.stats, {
      users: 2,
      activeMembers: 1,
      pendingCodes: 1,
      linkedUsers: 1,
    });
    assert.deepEqual(
      Object.fromEntries(result.codes.map((code) => [code.id, code.state])),
      {
        revoked: 'revoked',
        expired: 'expired',
        redeemed: 'redeemed',
        pending: 'pending',
      }
    );
    assert.equal(
      result.codes.find((code) => code.state === 'redeemed').redeemedEmail,
      'member@example.test'
    );
    assert.ok(!JSON.stringify(result).includes('secret-hash-'));
    assert.ok(!JSON.stringify(result).includes('private-openid-'));
    assert.equal(typeof result.codes[0].createdAt, 'string');
    const users = await getUsersAction({
      pageIndex: 0,
      pageSize: 10,
      search: 'Member',
      sorting: [],
    });
    assert.equal(users.data.success, true);
    assert.equal(users.data.data.total, 1);
    globalThis.__adminSession = {
      user: { role: 'user', email: 'allowed@example.test' },
    };
    assert.equal(
      (await getAdminMembershipOverview()).stats.users,
      2,
      'Existing configured admin whitelist remains supported'
    );
    assert.equal(
      membershipCodeState(
        {
          status: 'active',
          redeemedCount: 1,
          maxRedemptions: 1,
          codeExpiresAt: past,
        },
        new Date()
      ),
      'redeemed'
    );
    assert.equal(
      membershipCodeState(
        {
          status: 'active',
          redeemedCount: 0,
          maxRedemptions: 1,
          codeExpiresAt: new Date(0),
        },
        new Date(0)
      ),
      'expired'
    );
    await pg.exec(
      "INSERT INTO membership_activation_code(id,code_hash,code_prefix) SELECT 'extra-'||i,'hash-extra-'||i,'MEM-extra-'||i FROM generate_series(1,35) i"
    );
    assert.equal(
      (await getAdminMembershipOverview()).codes.length,
      30,
      'Bounded recent records, not full database export'
    );
    console.log(
      'PASS: admin-only data access, real user-list action authorization, whitelist compatibility, membership/code counts, expiry states, 30-row limit, no code hashes or WeChat identifiers exposed.'
    );
  } finally {
    if (previousWhitelist === undefined) delete process.env.HERMES_ADMIN_EMAILS;
    else process.env.HERMES_ADMIN_EMAILS = previousWhitelist;
    await pg.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
