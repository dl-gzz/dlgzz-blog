import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { hashPassword } from 'better-auth/crypto';
import * as schema from '../src/db/schema';
import {
  getMembershipStatus,
  issueMembershipActivationCode,
  redeemMembershipActivationCode,
} from '../src/lib/membership';
import {
  linkVerifiedWebsiteAccount,
  requireMiniappSession,
} from '../src/lib/miniapp-auth';
import { POST as linkRoute } from '../src/app/api/mp/auth/link/route';
import { extendMembershipExpiry } from '../src/lib/membership-expiry';

const hash = (v) => createHash('sha256').update(v).digest('hex');
const req = (token, body) =>
  new Request('https://example.test/api/mp/auth/link', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body || {}),
  });

async function main() {
  const pg = new PGlite();
  globalThis.__membershipTestDb = drizzle(pg);
  try {
    await pg.exec(`
      CREATE TABLE "user" (id text primary key, name text not null, email text unique not null, email_verified boolean not null,
        image text, created_at timestamp not null default now(), updated_at timestamp not null default now(), role text,
        banned boolean, ban_reason text, ban_expires timestamp, customer_id text);
      CREATE TABLE "session" (id text primary key, token text unique not null, user_id text references "user"(id),
        expires_at timestamp, created_at timestamp default now(), updated_at timestamp default now(),
        ip_address text, user_agent text, impersonated_by text);
      CREATE TABLE account (id text primary key, account_id text not null, provider_id text not null,
        user_id text references "user"(id), password text, access_token text, refresh_token text, id_token text,
        access_token_expires_at timestamp, refresh_token_expires_at timestamp, scope text, created_at timestamp, updated_at timestamp);
      CREATE TABLE payment (id text, user_id text, type text, status text, period_start timestamp, period_end timestamp, created_at timestamp);
      INSERT INTO "user"(id,name,email,email_verified) VALUES ('alice','Alice','alice@example.test',true),('bob','Bob','bob@example.test',true);
    `);
    await pg.exec(
      fs.readFileSync('src/db/migrations/0004_miniapp_account.sql', 'utf8')
    );
    await pg.exec(
      fs.readFileSync('src/db/migrations/0027_unified_membership.sql', 'utf8')
    );
    for (const [id, token, openid] of [
      ['s1', 'token-alice', 'wx-alice'],
      ['s2', 'token-bob', 'wx-bob'],
    ]) {
      await pg.query(
        "INSERT INTO miniapp_session(id,token_hash,openid,expires_at) VALUES ($1,$2,$3,now()+interval '1 day')",
        [id, hash(token), openid]
      );
    }
    let authCalls = 0;
    globalThis.__membershipTestAuth = async (r) => {
      authCalls++;
      assert.equal(new URL(r.url).pathname, '/api/auth/sign-in/email');
      const body = await r.json();
      if (body.password !== 'correct-password')
        return Response.json(
          { code: 'INVALID_EMAIL_OR_PASSWORD' },
          { status: 401 }
        );
      const userId = body.email === 'alice@example.test' ? 'alice' : 'bob';
      await pg.query(
        "INSERT INTO session(id,token,user_id,expires_at) VALUES ('temp-login','temp-login-token',$1,now()+interval '1 day')",
        [userId]
      );
      return Response.json({ token: 'temp-login-token', user: { id: userId } });
    };
    const anonymous = await linkRoute(
      req('', { email: 'alice@example.test', password: 'correct-password' })
    );
    assert.equal(anonymous.status, 401);
    assert.equal(authCalls, 0, 'must validate WeChat before password login');
    const badPassword = await linkRoute(
      req('token-alice', { email: 'alice@example.test', password: 'bad' })
    );
    assert.equal(badPassword.status, 401);
    assert.equal(
      (await pg.query('SELECT * FROM miniapp_account')).rows.length,
      0
    );
    const linked = await linkRoute(
      req('token-alice', {
        email: 'alice@example.test',
        password: 'correct-password',
      })
    );
    assert.equal(linked.status, 200);
    const linkedBody = await linked.json();
    assert.equal(linkedBody.membership.isMember, false);
    assert.equal(linkedBody.token, undefined);
    assert.equal(
      (await pg.query('SELECT * FROM session')).rows.length,
      0,
      'discard temporary website login session'
    );
    assert.equal(
      (await requireMiniappSession(req('token-alice'))).userId,
      'alice'
    );
    await linkVerifiedWebsiteAccount(req('token-alice'), 'alice');
    await assert.rejects(
      linkVerifiedWebsiteAccount(req('token-alice'), 'bob'),
      { code: 'ACCOUNT_CONFLICT' },
      'account conflict'
    );
    assert.equal(
      (await requireMiniappSession(req('token-alice'))).userId,
      'alice'
    );
    const first = await issueMembershipActivationCode({
      durationDays: 365,
      createdByUserId: 'alice',
    });
    await redeemMembershipActivationCode({
      userId: 'alice',
      code: first.rawCode,
    });
    const beforeRenewal = await getMembershipStatus('alice');
    assert.equal(beforeRenewal.isMember, true);
    const mp = await requireMiniappSession(req('token-alice'));
    assert.deepEqual(
      await getMembershipStatus(mp.userId),
      beforeRenewal,
      'website and miniapp use the same entitlement'
    );
    await assert.rejects(
      redeemMembershipActivationCode({ userId: 'bob', code: first.rawCode }),
      { code: 'CODE_NOT_ACTIVE' },
      'code reuse by another user'
    );
    await assert.rejects(
      redeemMembershipActivationCode({ userId: 'alice', code: first.rawCode }),
      { code: 'CODE_NOT_ACTIVE' },
      'code reuse by same user'
    );
    assert.equal(
      (await getMembershipStatus('alice')).expiresAt.getTime(),
      beforeRenewal.expiresAt.getTime()
    );
    const renewal = await issueMembershipActivationCode({ durationDays: 365 });
    await redeemMembershipActivationCode({
      userId: 'alice',
      code: renewal.rawCode,
    });
    assert.equal(
      (await getMembershipStatus('alice')).expiresAt.getTime() -
        beforeRenewal.expiresAt.getTime(),
      365 * 86400000
    );
    const concurrent = await Promise.all([
      issueMembershipActivationCode({ durationDays: 1 }),
      issueMembershipActivationCode({ durationDays: 1 }),
    ]);
    const beforeConcurrent = (
      await getMembershipStatus('alice')
    ).expiresAt.getTime();
    await Promise.all(
      concurrent.map((c) =>
        redeemMembershipActivationCode({ userId: 'alice', code: c.rawCode })
      )
    );
    assert.equal(
      (await getMembershipStatus('alice')).expiresAt.getTime() -
        beforeConcurrent,
      2 * 86400000
    );
    const lifetime = await issueMembershipActivationCode({
      durationDays: null,
    });
    await redeemMembershipActivationCode({
      userId: 'alice',
      code: lifetime.rawCode,
    });
    const later = await issueMembershipActivationCode({ durationDays: 1 });
    await redeemMembershipActivationCode({
      userId: 'alice',
      code: later.rawCode,
    });
    assert.equal((await getMembershipStatus('alice')).expiresAt, null);
    await pg.query("UPDATE miniapp_session SET expires_at=$1 WHERE id='s2'", [
      new Date(Date.now() - 60_000).toISOString(),
    ]);
    await assert.rejects(
      linkVerifiedWebsiteAccount(req('token-bob'), 'bob'),
      { code: 'SESSION_EXPIRED' },
      'expired session'
    );
    assert.equal(
      (await pg.query("SELECT * FROM miniapp_account WHERE openid='wx-bob'"))
        .rows.length,
      0
    );
    await pg.exec('UPDATE "user" SET banned=true WHERE id=\'alice\'');
    await assert.rejects(
      requireMiniappSession(req('token-alice')),
      { code: 'USER_BANNED' },
      'banned user'
    );

    // Exercise the installed Better Auth handler and password hashing too, not
    // just the response contract used by the earlier failure-path checks.
    await pg.exec('UPDATE "user" SET banned=false');
    await pg.query(
      "INSERT INTO account(id,account_id,provider_id,user_id,password,created_at,updated_at) VALUES ('credential-alice','alice','credential','alice',$1,now(),now())",
      [await hashPassword('real-test-password')]
    );
    const realAuth = betterAuth({
      baseURL: 'http://localhost:3000',
      secret: 'isolated-membership-test-secret-at-least-32-characters',
      trustedOrigins: ['http://localhost:3000'],
      database: drizzleAdapter(globalThis.__membershipTestDb, {
        provider: 'pg',
        schema,
      }),
      emailAndPassword: { enabled: true, requireEmailVerification: true },
      rateLimit: { enabled: true },
    });
    globalThis.__membershipTestAuth = realAuth.handler;
    const actualWrongPassword = await linkRoute(
      req('token-alice', {
        email: 'alice@example.test',
        password: 'wrong-password',
      })
    );
    assert.equal(actualWrongPassword.status, 401);
    const actualLogin = await linkRoute(
      req('token-alice', {
        email: 'alice@example.test',
        password: 'real-test-password',
      })
    );
    assert.equal(
      actualLogin.status,
      200,
      JSON.stringify(await actualLogin.clone().json())
    );
    assert.equal((await actualLogin.json()).membership.isMember, true);
    assert.equal((await pg.query('SELECT * FROM session')).rows.length, 0);
    await pg.exec('UPDATE "user" SET email_verified=false WHERE id=\'alice\'');
    const unverified = await linkRoute(
      req('token-alice', {
        email: 'alice@example.test',
        password: 'real-test-password',
      })
    );
    assert.equal(unverified.status, 403);
    assert.equal((await unverified.json()).code, 'EMAIL_NOT_VERIFIED');

    const now = new Date('2026-09-05T00:00:00Z');
    assert.equal(
      extendMembershipExpiry(new Date('2020-01-01'), 1, now).toISOString(),
      '2026-09-06T00:00:00.000Z'
    );
    for (const code of [
      'BINDING_REQUIRED',
      'SESSION_EXPIRED',
      'SESSION_REVOKED',
    ]) {
      const context = {
        module: { exports: {} },
        require: () => ({ baseUrl: 'https://example.test' }),
        wx: {
          getStorageSync: () => '',
          request: (o) =>
            o.success({
              statusCode: code === 'BINDING_REQUIRED' ? 409 : 401,
              data: { success: false, code, error: '测试提示' },
            }),
        },
      };
      vm.runInNewContext(
        fs.readFileSync(
          process.env.MINIAPP_SOURCE_ROOT + '/utils/request.js',
          'utf8'
        ),
        context
      );
      await assert.rejects(
        context.module.exports.request({ url: '/api/mp/membership' }),
        { code, message: '测试提示' }
      );
    }
    console.log(
      'PASS: real password verification, email verification, account ownership, WeChat authentication, conflict protection, one-use codes, shared membership, additive renewal, permanent membership, expired/banned sessions and client error recovery'
    );
    console.log(
      'Database verification used an isolated in-memory PostgreSQL engine; no production writes.'
    );
  } finally {
    await pg.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
