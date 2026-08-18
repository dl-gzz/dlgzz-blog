import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { reserveApiKeyRateLimit } from '@/lib/api-key';
import {
  claimOneWorkInstallToken,
  createOneWorkInstallToken,
  grantOneWorkEntitlements,
  issueOneWorkActivationCode,
  redeemOneWorkActivation,
} from '@/lib/onework-access';
import { ALL_PACKS_GRANT } from '@/lib/onework-constants';
import * as dotenv from 'dotenv';
import postgres from 'postgres';

// one-worker-os 授权闭环的临时用户冒烟测试：签发 → 兑换 → 安装领取 → 清理。

dotenv.config({ path: join(process.cwd(), '.env') });
dotenv.config({ path: join(process.cwd(), '.env.local'), override: true });

function hashSecret(value: string) {
  return createHash('sha256').update(value.trim().toUpperCase()).digest('hex');
}

function getTestDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is not set');
  const hostname = new URL(databaseUrl).hostname;
  const isLocal = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname);
  if (!isLocal && process.env.ONEWORK_ALLOW_REMOTE_E2E !== 'true') {
    throw new Error(
      `Refusing temporary writes to remote database ${hostname}; set ONEWORK_ALLOW_REMOTE_E2E=true explicitly`
    );
  }
  return databaseUrl;
}

async function main() {
  const ssl = ['false', 'disable', 'off'].includes(
    (process.env.DATABASE_SSL || '').toLowerCase()
  )
    ? false
    : 'require';
  const sql = postgres(getTestDatabaseUrl(), {
    ssl,
    max: 1,
    prepare: false,
  });
  const runId = randomUUID();
  const testUserId = `onework-e2e-user-${runId}`;
  const testEmail = `onework-e2e-${runId}@invalid.example`;
  const futurePackId = 'future-pack-added-later-v1';
  const secondDeviceId = `e2e-install-${randomUUID()}`;
  let activationCode = '';
  let activationHash = '';

  try {
    await sql`
			insert into "user" (
				id, name, email, email_verified, created_at, updated_at
			) values (
				${testUserId}, 'one-worker-os E2E', ${testEmail}, true, now(), now()
			)
		`;

    const firstRoute = await reserveApiKeyRateLimit({
      userId: testUserId,
      kind: 'capability_resolve_e2e',
      limit: 2,
    });
    const secondRoute = await reserveApiKeyRateLimit({
      userId: testUserId,
      kind: 'capability_resolve_e2e',
      limit: 2,
    });
    const blockedRoute = await reserveApiKeyRateLimit({
      userId: testUserId,
      kind: 'capability_resolve_e2e',
      limit: 2,
    });
    if (
      !firstRoute.allowed ||
      !secondRoute.allowed ||
      blockedRoute.allowed ||
      secondRoute.remaining !== 0
    ) {
      throw new Error('能力路由的账号级原子限流未按预期生效');
    }

    const issued = await issueOneWorkActivationCode({
      packIds: [ALL_PACKS_GRANT],
      trialDays: 1,
      monthlyQuota: 7,
      label: 'e2e-test',
      source: 'test',
      createdByUserId: testUserId,
    });
    activationCode = issued.rawCode;
    activationHash = hashSecret(activationCode);
    const redeemed = await redeemOneWorkActivation({
      userId: testUserId,
      code: activationCode,
    });
    if (!redeemed.packIds.includes(ALL_PACKS_GRANT))
      throw new Error('兑换后的账号权益未写入全量授权');

    const [beforeRenewal] = await sql<{ expires_at: Date }[]>`
      select expires_at from onework_entitlement
      where user_id = ${testUserId} and knowledge_pack_id = ${ALL_PACKS_GRANT}
    `;
    const orderA = `e2e-order-a-${runId}`;
    const orderB = `e2e-order-b-${runId}`;
    await Promise.all([
      grantOneWorkEntitlements({
        userId: testUserId,
        packIds: [ALL_PACKS_GRANT],
        trialDays: 2,
        monthlyQuota: 7,
        source: 'test',
        externalOrderId: orderA,
      }),
      grantOneWorkEntitlements({
        userId: testUserId,
        packIds: [ALL_PACKS_GRANT],
        trialDays: 2,
        monthlyQuota: 7,
        source: 'test',
        externalOrderId: orderB,
      }),
    ]);
    const [afterConcurrentRenewal] = await sql<{ expires_at: Date }[]>`
      select expires_at from onework_entitlement
      where user_id = ${testUserId} and knowledge_pack_id = ${ALL_PACKS_GRANT}
    `;
    const expectedAddedMs = 4 * 24 * 60 * 60 * 1000;
    if (
      afterConcurrentRenewal.expires_at.getTime() -
        beforeRenewal.expires_at.getTime() !==
      expectedAddedMs
    ) {
      throw new Error('并发续费未完整累加两笔订单');
    }

    await grantOneWorkEntitlements({
      userId: testUserId,
      packIds: [ALL_PACKS_GRANT],
      trialDays: 2,
      monthlyQuota: 7,
      source: 'test',
      externalOrderId: orderA,
    });
    const [afterRetry] = await sql<{ expires_at: Date }[]>`
      select expires_at from onework_entitlement
      where user_id = ${testUserId} and knowledge_pack_id = ${ALL_PACKS_GRANT}
    `;
    const [grantCount] = await sql<{ count: number }[]>`
      select count(*)::int as count from onework_entitlement_grant
      where user_id = ${testUserId}
    `;
    if (
      afterRetry.expires_at.getTime() !==
        afterConcurrentRenewal.expires_at.getTime() ||
      grantCount.count !== 2
    ) {
      throw new Error('同一支付订单重试时重复发放了权益');
    }

    const install = await createOneWorkInstallToken({
      userId: testUserId,
      platform: 'test',
      deviceName: 'one-worker-os E2E 2',
    });
    const claimed = await claimOneWorkInstallToken({
      token: install.rawToken,
      deviceId: secondDeviceId,
      deviceName: 'one-worker-os E2E 2',
      platform: 'test',
    });
    const claimedWildcard = await sql<{ id: string }[]>`
      select id from api_key_pack_grant
      where api_key_id = ${claimed.apiKeyId} and knowledge_pack_id = ${ALL_PACKS_GRANT}
    `;
    if (claimedWildcard.length !== 1)
      throw new Error('安装领取的 Key 未写入全量授权');
    console.log('✅ 授权闭环通过:', {
      packs: redeemed.packIds,
      futurePackAccess: `wildcard grant covers ${futurePackId}`,
      installKeyPrefix: claimed.keyPrefix,
      quota: redeemed.monthlyQuota,
    });
  } finally {
    if (activationHash) {
      await sql`delete from onework_activation_code where code_hash = ${activationHash}`;
    }
    await sql`delete from "user" where id = ${testUserId}`;
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
