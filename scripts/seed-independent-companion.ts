/**
 * Seed the real long-term companion worker and attach Xiaohongshu knowledge as
 * a switchable skill.
 *
 * Run:
 *   pnpm worker:companion:seed
 *   pnpm worker:companion:seed -- --email dlgzz@outlook.com
 */

import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import * as dotenv from 'dotenv';
import postgres from 'postgres';

dotenv.config({ path: join(process.cwd(), '.env') });
dotenv.config({ path: join(process.cwd(), '.env.local'), override: true });

const COMPANION_EMPLOYEE_ID = 'independent-companion';
const LEGACY_XHS_EMPLOYEE_ID = 'xhs-open-shop-coach';
const KNOWLEDGE_PACK_ID = 'xhs-open-shop-v1';
const XHS_SKILL_ID = 'xhs-open-shop-knowledge';
const DEFAULT_EMAIL = 'dlgzz@outlook.com';
const PRICE_ID =
  process.env.WORKER_DEFAULT_MONTHLY_PRICE_ID ||
  process.env.NEXT_PUBLIC_STRIPE_PRICE_WORKER_MONTHLY ||
  'xorpay_worker_employee_monthly';
const MONTHLY_AMOUNT = Number(
  process.env.WORKER_DEFAULT_MONTHLY_AMOUNT || 2900
);

function parseEmail() {
  const args = process.argv.slice(2);
  const emailIndex = args.indexOf('--email');
  return (emailIndex >= 0 ? args[emailIndex + 1] : DEFAULT_EMAIL)
    ?.trim()
    .toLowerCase();
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function getSql() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');

  const explicit = (process.env.DATABASE_SSL || '').toLowerCase();
  const ssl =
    explicit === 'false' || explicit === 'disable' || explicit === 'off'
      ? false
      : 'require';

  return postgres(connectionString, {
    ssl,
    max: 1,
    prepare: false,
    connect_timeout: 15,
  });
}

const skillsSummary = [
  '长期陪伴与需求澄清',
  '个人目标和行动计划整理',
  '技能模块开关',
  '小红书开店入驻知识库（可开启/关闭）',
];

const readmeSnapshot = `# 独立陪伴者

独立陪伴者是用户长期使用的唯一微信入口。

它不是一个固定专业教练，而是一个稳定陪伴者：
- 记住用户长期目标、当前阶段和偏好；
- 帮用户把问题讲清楚、拆小、推进；
- 根据已启用技能调用对应知识库和工具；
- 没有启用的技能不擅自使用、不冒充专业能力。

第一版默认可选技能：
- 小红书开店入驻知识库

平台原则：
- 用户只需要绑定一次微信；
- 员工本体保持稳定；
- 专业能力通过技能模块增加、减少和升级；
- 每个用户实例独立 Profile、独立记忆、独立微信绑定。
`;

const soulSnapshot = `# 独立陪伴者 SOUL

你是“独立陪伴者”，服务对象是独立工作者、个体经营者、小商家和正在建立自己能力体系的人。

你的核心职责不是替用户制造热闹，而是长期、稳定、诚实地陪用户把事情推进：

1. 帮用户澄清当前问题；
2. 帮用户把复杂目标拆成下一步动作；
3. 记录用户稳定偏好和阶段性事实；
4. 根据已启用技能提供专业帮助；
5. 对没有启用、没有资料支撑的专业问题保持克制。

## 最高原则

- 你是一个长期陪伴者，不是无所不能的专家。
- 你的专业能力来自“本实例已启用技能”和“本实例可用知识库”。
- 如果某个技能没有启用，不要假装已经具备这个专业能力。
- 如果知识库没有覆盖，不要编造事实。
- 用户需要的是稳定、可靠、可验证的帮助，而不是夸张承诺。

## 工作方式

当用户提出问题时，先判断属于哪一类：

1. 陪伴与梳理：可以直接帮助用户澄清、拆解、制定下一步；
2. 已启用技能范围内的问题：必须优先使用对应技能和知识库；
3. 未启用技能或资料不足的问题：明确说明当前能力边界，并建议开启对应技能或补充资料；
4. 高风险事项：法律、医疗、财税、强监管平台规则等，必须提醒用户以官方页面、专业机构或属地监管要求为准。

## 小红书开店入驻技能规则

如果本实例启用了“小红书开店入驻知识库”，遇到开店、入驻、店铺类型、主体资质、品牌材料、行业资质、审核流程等问题时，必须先检索知识库，再回答。

在可执行工具环境中，先运行：

\`\`\`bash
cd /Users/baiyang/Desktop/程序/dlgzz-blog-main
pnpm knowledge:xhs:search "<用户原问题>"
\`\`\`

回答时尽量写明来源文档名称。若检索结果没有覆盖问题，必须说明：“当前知识库未提及这个细节，我不能编造平台规则。”

如果本实例没有启用“小红书开店入驻知识库”，用户问小红书开店相关问题时，应提示用户可以开启该技能模块，而不是直接给专业结论。

## 语气

像一个清醒、可靠、有边界感的同行朋友：
- 直接；
- 不制造焦虑；
- 不吹嘘结果；
- 给用户下一步；
- 重要结论要说明依据。
`;

async function main() {
  const email = parseEmail();
  if (!email) throw new Error('Missing --email');

  const sql = getSql();
  const now = new Date();
  const soulHash = sha256(soulSnapshot);
  const readmeHash = sha256(readmeSnapshot);
  const skillsHash = sha256(JSON.stringify(skillsSummary));
  const versionId = `${COMPANION_EMPLOYEE_ID}-v-${sha256(`${soulHash}:${readmeHash}:${skillsHash}`).slice(0, 16)}`;

  try {
    const users = await sql<{ id: string; email: string }[]>`
			select id, email from public.user where lower(email) = ${email} limit 1
		`;
    const user = users[0];
    if (!user) throw new Error(`User not found: ${email}`);

    const packs = await sql<{ id: string }[]>`
			select id from knowledge_packs where id = ${KNOWLEDGE_PACK_ID} limit 1
		`;
    if (!packs[0]) {
      throw new Error(
        `Knowledge pack not found: ${KNOWLEDGE_PACK_ID}. Run pnpm knowledge:xhs:import first.`
      );
    }

    await sql.begin(async (tx) => {
      await tx`
				insert into worker_employee (
					id, name, responsibility, suitable_tasks, solves_problem,
					employee_dir, readme_path, soul_path, status,
					monthly_price_id, monthly_amount, currency,
					source_hash, latest_version_id, synced_at, created_at, updated_at
				)
				values (
					${COMPANION_EMPLOYEE_ID},
					${'独立陪伴者'},
					${'作为用户长期唯一入口，围绕用户目标、阶段和已启用技能提供稳定陪伴与行动推进。'},
					${'长期陪伴、目标澄清、行动拆解、用户偏好记忆、技能模块调用、小红书开店入驻问答等。'},
					${'解决用户不知道下一步怎么做、不同技能入口混乱、频繁换助手导致记忆割裂的问题。'},
					${`db://worker/${COMPANION_EMPLOYEE_ID}`},
					${`db://worker/${COMPANION_EMPLOYEE_ID}/README.md`},
					${`db://worker/${COMPANION_EMPLOYEE_ID}/SOUL.md`},
					${'active'},
					${PRICE_ID},
					${MONTHLY_AMOUNT},
					${'CNY'},
					${sha256(`${soulSnapshot}:${readmeSnapshot}:${skillsSummary.join('|')}`)},
					${versionId},
					${now},
					${now},
					${now}
				)
				on conflict (id) do update set
					name = excluded.name,
					responsibility = excluded.responsibility,
					suitable_tasks = excluded.suitable_tasks,
					solves_problem = excluded.solves_problem,
					employee_dir = excluded.employee_dir,
					readme_path = excluded.readme_path,
					soul_path = excluded.soul_path,
					status = excluded.status,
					monthly_price_id = excluded.monthly_price_id,
					monthly_amount = excluded.monthly_amount,
					currency = excluded.currency,
					source_hash = excluded.source_hash,
					latest_version_id = excluded.latest_version_id,
					synced_at = excluded.synced_at,
					updated_at = excluded.updated_at
			`;

      await tx`
				insert into worker_employee_version (
					id, employee_id, soul_path, soul_hash, readme_hash, skills_hash,
					soul_snapshot, readme_snapshot, skills_summary, created_at
				)
				values (
					${versionId},
					${COMPANION_EMPLOYEE_ID},
					${`db://worker/${COMPANION_EMPLOYEE_ID}/SOUL.md`},
					${soulHash},
					${readmeHash},
					${skillsHash},
					${soulSnapshot},
					${readmeSnapshot},
					${JSON.stringify(skillsSummary)}::jsonb,
					${now}
				)
				on conflict (id) do nothing
			`;

      await tx`
				insert into worker_skill (
					id, name, summary, category, skill_type, risk_level, status,
					default_enabled, requires_user_config, created_at, updated_at
				)
				values (
					${XHS_SKILL_ID},
					${'小红书开店入驻知识库'},
					${'使用 xhs-open-shop-v1 知识包检索官方开店入驻文档、28 讲问题大纲和诊断提示词。'},
					${'knowledge'},
					${'data'},
					${'low'},
					${'public'},
					${true},
					${false},
					${now},
					${now}
				)
				on conflict (id) do update set
					name = excluded.name,
					summary = excluded.summary,
					category = excluded.category,
					skill_type = excluded.skill_type,
					risk_level = excluded.risk_level,
					status = excluded.status,
					default_enabled = excluded.default_enabled,
					requires_user_config = excluded.requires_user_config,
					updated_at = excluded.updated_at
			`;

      await tx`
				insert into worker_employee_skill (
					id, employee_id, skill_id, status, default_enabled, created_at, updated_at
				)
				values (
					${`wes-${COMPANION_EMPLOYEE_ID}-${XHS_SKILL_ID}`},
					${COMPANION_EMPLOYEE_ID},
					${XHS_SKILL_ID},
					${'allowed'},
					${true},
					${now},
					${now}
				)
				on conflict (id) do update set
					status = excluded.status,
					default_enabled = excluded.default_enabled,
					updated_at = excluded.updated_at
			`;

      await tx`
				insert into worker_skill_knowledge_pack (
					id, skill_id, knowledge_pack_id, status, created_at, updated_at
				)
				values (
					${`wskp-${XHS_SKILL_ID}-${KNOWLEDGE_PACK_ID}`},
					${XHS_SKILL_ID},
					${KNOWLEDGE_PACK_ID},
					${'enabled'},
					${now},
					${now}
				)
				on conflict (skill_id, knowledge_pack_id) do update set
					status = excluded.status,
					updated_at = excluded.updated_at
			`;

      await tx`
				update worker_employee
				set status = 'draft', updated_at = ${now}
				where id = ${LEGACY_XHS_EMPLOYEE_ID}
			`;

      await tx`
				update worker_instance
				set status = 'active', error = null, activated_at = coalesce(activated_at, ${now}), updated_at = ${now}
				where weixin_user_id is not null
					and weixin_user_id <> ''
					and gateway_status = 'running'
			`;

      const existingInstances = await tx<{ id: string }[]>`
				select id from worker_instance
				where user_id = ${user.id} and employee_id = ${COMPANION_EMPLOYEE_ID}
				order by updated_at desc
				limit 1
			`;
      const instanceId = existingInstances[0]?.id || `wi_${randomUUID()}`;

      if (existingInstances[0]) {
        await tx`
					update worker_instance set
						employee_version_id = ${versionId},
						status = case
							when weixin_user_id is not null and weixin_user_id <> '' and gateway_status = 'running' then 'active'
							when status in ('active', 'qr_ready', 'scanned') then status
							else ${'ready_to_activate'}
						end,
						payment_status = ${'active'},
						price_id = ${PRICE_ID},
						access_source = ${'membership'},
						error = null,
						updated_at = ${now}
					where id = ${instanceId}
				`;
      } else {
        await tx`
					insert into worker_instance (
						id, user_id, employee_id, employee_version_id,
						status, payment_status, price_id, access_source,
						subscription_id, created_at, updated_at
					)
					values (
						${instanceId},
						${user.id},
						${COMPANION_EMPLOYEE_ID},
						${versionId},
						${'ready_to_activate'},
						${'active'},
						${PRICE_ID},
						${'membership'},
						${`test_${randomUUID()}`},
						${now},
						${now}
					)
				`;
      }

      await tx`
				insert into worker_instance_skill (
					id, instance_id, skill_id, enabled, source, created_at, updated_at
				)
				values (
					${`wis-${instanceId}-${XHS_SKILL_ID}`},
					${instanceId},
					${XHS_SKILL_ID},
					${true},
					${'admin'},
					${now},
					${now}
				)
				on conflict (id) do update set
					enabled = excluded.enabled,
					source = excluded.source,
					updated_at = excluded.updated_at
			`;
    });

    const rows = await sql<
      {
        employee_id: string;
        status: string;
        payment_status: string;
        instance_id: string;
        skill_enabled: boolean;
      }[]
    >`
			select
				wi.employee_id,
				wi.status,
				wi.payment_status,
				wi.id as instance_id,
				coalesce(wis.enabled, false) as skill_enabled
			from worker_instance wi
			left join worker_instance_skill wis
				on wis.instance_id = wi.id and wis.skill_id = ${XHS_SKILL_ID}
			where wi.user_id = (select id from public.user where lower(email) = ${email} limit 1)
				and wi.employee_id = ${COMPANION_EMPLOYEE_ID}
			order by wi.updated_at desc
			limit 1
		`;

    console.log(
      JSON.stringify(
        {
          employeeId: COMPANION_EMPLOYEE_ID,
          versionId,
          skillId: XHS_SKILL_ID,
          knowledgePackId: KNOWLEDGE_PACK_ID,
          userEmail: email,
          instanceId: rows[0]?.instance_id || null,
          instanceStatus: rows[0]?.status || null,
          paymentStatus: rows[0]?.payment_status || null,
          xhsSkillEnabled: rows[0]?.skill_enabled || false,
        },
        null,
        2
      )
    );
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
