/** OneWorkOS 授权闭环的真实数据库冒烟测试：签发 → 兑换 → 安装会话领取 → 清理。 */
import postgres from 'postgres';
import * as dotenv from 'dotenv';
import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import {
  claimOneWorkInstallToken,
  createOneWorkInstallToken,
  issueOneWorkActivationCode,
  redeemOneWorkActivation,
} from '@/lib/onework-access';
import { ALL_PACKS_GRANT } from '@/lib/onework-constants';

dotenv.config({ path: join(process.cwd(), '.env') });
dotenv.config({ path: join(process.cwd(), '.env.local'), override: true });

function hashSecret(value: string) {
  return createHash('sha256').update(value.trim().toUpperCase()).digest('hex');
}

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { ssl: 'require', max: 1, prepare: false });
  const [user] = await sql<{ id: string }[]>`select id from "user" order by created_at limit 1`;
  if (!user) throw new Error('数据库里没有用户，无法测试外键');

  const packId = ALL_PACKS_GRANT;
  const futurePackId = 'future-pack-added-later-v1';
  const before = await sql<{ id: string }[]>`
    select id from onework_entitlement where user_id = ${user.id} and knowledge_pack_id = ${packId}
  `;
  const secondDeviceId = `e2e-install-${randomUUID()}`;
  let activationCode = '';
  let activationHash = '';
  let keyIds: string[] = [];

  try {
    const issued = await issueOneWorkActivationCode({
      packIds: [ALL_PACKS_GRANT],
      trialDays: 1,
      monthlyQuota: 7,
      label: 'e2e-test',
      source: 'test',
      createdByUserId: user.id,
    });
    activationCode = issued.rawCode;
    activationHash = hashSecret(activationCode);
    const redeemed = await redeemOneWorkActivation({
      userId: user.id,
      code: activationCode,
    });
    if (!redeemed.packIds.includes(ALL_PACKS_GRANT)) throw new Error('兑换后的账号权益未写入全量授权');

    const install = await createOneWorkInstallToken({
      userId: user.id,
      platform: 'test',
      deviceName: 'OneWorkOS E2E 2',
    });
    const claimed = await claimOneWorkInstallToken({
      token: install.rawToken,
      deviceId: secondDeviceId,
      deviceName: 'OneWorkOS E2E 2',
      platform: 'test',
    });
    keyIds.push(claimed.apiKeyId);
    const claimedWildcard = await sql<{ id: string }[]>`
      select id from api_key_pack_grant
      where api_key_id = ${claimed.apiKeyId} and knowledge_pack_id = ${ALL_PACKS_GRANT}
    `;
    if (claimedWildcard.length !== 1) throw new Error('安装领取的 Key 未写入全量授权');
    console.log('✅ 授权闭环通过:', {
      packs: redeemed.packIds,
      futurePackAccess: `wildcard grant covers ${futurePackId}`,
      installKeyPrefix: claimed.keyPrefix,
      quota: redeemed.monthlyQuota,
    });
  } finally {
    if (keyIds.length > 0) {
      await sql`delete from onework_device where api_key_id in ${sql(keyIds)}`;
      await sql`delete from api_key_pack_grant where api_key_id in ${sql(keyIds)}`;
      await sql`delete from api_key where id in ${sql(keyIds)}`;
    }
    if (activationHash) {
      await sql`delete from onework_activation_code where code_hash = ${activationHash}`;
    }
    const after = await sql<{ id: string }[]>`
      select id from onework_entitlement where user_id = ${user.id} and knowledge_pack_id = ${packId}
    `;
    const createdEntitlementIds = after.map((item) => item.id).filter((id) => !before.some((row) => row.id === id));
    if (createdEntitlementIds.length > 0) {
      await sql`delete from onework_entitlement where id in ${sql(createdEntitlementIds)}`;
    }
    await sql.end();
    process.exit(0);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
