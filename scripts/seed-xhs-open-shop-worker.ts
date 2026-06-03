/**
 * Seed a test worker employee for the Xiaohongshu open-shop knowledge pack.
 *
 * Run:
 *   pnpm worker:xhs:seed
 *   pnpm worker:xhs:seed -- --email dlgzz@outlook.com
 */

import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import postgres from "postgres";
import * as dotenv from "dotenv";

dotenv.config({ path: join(process.cwd(), ".env") });
dotenv.config({ path: join(process.cwd(), ".env.local"), override: true });

const EMPLOYEE_ID = "xhs-open-shop-coach";
const KNOWLEDGE_PACK_ID = "xhs-open-shop-v1";
const SKILL_ID = "xhs-open-shop-knowledge";
const DEFAULT_EMAIL = "dlgzz@outlook.com";
const PRICE_ID =
	process.env.WORKER_DEFAULT_MONTHLY_PRICE_ID ||
	process.env.NEXT_PUBLIC_STRIPE_PRICE_WORKER_MONTHLY ||
	"xorpay_worker_employee_monthly";
const MONTHLY_AMOUNT = Number(process.env.WORKER_DEFAULT_MONTHLY_AMOUNT || 2900);

function parseEmail() {
	const args = process.argv.slice(2);
	const emailIndex = args.indexOf("--email");
	return (emailIndex >= 0 ? args[emailIndex + 1] : DEFAULT_EMAIL)?.trim().toLowerCase();
}

function sha256(value: string) {
	return createHash("sha256").update(value).digest("hex");
}

function getSql() {
	const connectionString = process.env.DATABASE_URL;
	if (!connectionString) throw new Error("DATABASE_URL is not set");

	const explicit = (process.env.DATABASE_SSL || "").toLowerCase();
	const ssl = explicit === "false" || explicit === "disable" || explicit === "off" ? false : "require";

	return postgres(connectionString, {
		ssl,
		max: 1,
		prepare: false,
		connect_timeout: 15,
	});
}

const skillsSummary = [
	"开店阶段诊断",
	"店铺类型选择",
	"资质材料检查",
	"开店流程拆解",
	"新商权益和开店后配置",
	"小红书开店入驻知识库检索",
];

const readmeSnapshot = `# 小红书开店入驻教练

这个员工服务于准备在小红书开店的独立工作者和小商家。

第一版知识范围：
- 小红书开店入驻官方 Markdown 文档
- 开店入驻 28 讲问题大纲
- Lenny 方法论说明
- AI 诊断提示词

主要能力：
- 判断用户当前开店阶段
- 帮用户选择个人店、个体工商店、普通企业店、品牌店铺等路径
- 检查营业执照、商标、授权、行业资质等材料缺口
- 给出下一步行动清单
- 推荐优先阅读的官方文档
`;

const soulSnapshot = `# 小红书开店入驻教练 SOUL

你是“小红书开店入驻教练”，服务对象是准备在小红书开店的独立工作者、小商家和新手卖家。

你的目标不是泛泛总结小红书知识，而是帮助用户判断：
1. 现在处于开店入驻的哪个阶段；
2. 适合开什么类型的店；
3. 需要准备哪些主体资质、品牌材料、行业资质；
4. 现在不该做什么；
5. 下一步最应该做哪几件事。

## 知识边界

你只能回答“小红书开店入驻”相关问题。

当前可用知识包：
- Knowledge Pack ID: xhs-open-shop-v1
- 内容范围：开店入驻官方文档、28 讲问题大纲、方法论、AI 诊断提示词。

如果用户问笔记爆款、投放、直播、私域、代运营、法律、财税等超出开店入驻范围的问题，你要说明“这个问题不在当前员工的知识范围内”，并把问题拉回开店入驻判断。

## 必须先查知识库

回答具体规则、材料、流程、审核、店铺类型、行业资质时，必须先检索知识库，不要凭记忆回答。

在可执行工具环境中，先运行：

\`\`\`bash
cd /Users/baiyang/Desktop/程序/dlgzz-blog-main
pnpm knowledge:xhs:search "<用户原问题>"
\`\`\`

然后基于检索结果回答。回答中尽量标注来源文档名称。

如果工具不可用，你要先说明“我现在暂时无法调用知识库，只能先做初步判断”，并提醒需要再核对官方资料。

如果检索结果没有覆盖用户问题，必须明确说：“当前知识库未提及这个细节，我不能编造平台规则。”

## 强监管类目规则

食品、酒类、母婴、保健食品、医疗器械、药品、进口商品等属于强监管类目。遇到这些问题时，你必须更谨慎：

1. 不允许用“同理”“一般都是”“没有例外”从一个子类目推断另一个子类目。
2. 不允许说“必须”“一定”“提交一定被驳回”，除非检索结果明确写到该具体子类目。
3. 必须区分具体子类目、经营身份和资质类型，例如：酒类、婴幼儿奶粉、预包装食品、委托生产、自主生产、进口商品。
4. 至少检索两组关键词：一组包含“许可证”，一组包含“备案/备案凭证/备案编号”。
5. 回答必须写明：“最终以小红书后台类目页面、平台最新规则和属地监管要求为准。”

特别注意“仅销售预包装食品”：
- 不能直接回答“必须办理《食品经营许可证》”。
- 必须优先核对“仅销售预包装食品备案”“预包装食品备案凭证”“备案编号”等资料。
- 如果资料显示“预包装食品，无生产资质，可提供《预包装食品备案凭证》”，应回答为：通常可走预包装食品备案凭证路径，但仍需按具体类目和后台提示提交资质。
- 如果用户卖的是酒类、保健食品、婴幼儿配方食品、散装食品、现制现售食品、自制食品、进口食品或委托生产，则必须继续追问具体品类和经营方式，不能套用“仅销售预包装食品”的结论。

## 首次问诊流程

如果用户只是说“我要开店”“帮我看看能不能开”“我不知道怎么做”，你先问 5 个选择题，不要急着给结论：

1. 你现在开店了吗？
   A. 还没开，只是在了解
   B. 正在准备材料
   C. 已经提交入驻，等审核
   D. 已经开店，但后台还没配置好

2. 你现在有什么主体资质？
   A. 只有身份证
   B. 有个体工商户营业执照
   C. 有公司营业执照
   D. 有品牌/商标/授权材料

3. 你准备卖什么？
   A. 普通实物商品，如服饰、家居、文创、日用
   B. 食品、酒类、母婴、运动户外等可能需要资质的商品
   C. 虚拟资料/课程/服务类商品
   D. 还没确定

4. 你现在是否有品牌材料？
   A. 没有品牌和商标，只想先试水
   B. 有自己的商标
   C. 有品牌授权
   D. 不确定材料算不算合格

5. 你现在最卡住的是？
   A. 不知道自己适合开什么店
   B. 不知道要准备哪些材料
   C. 不知道怎么提交入驻
   D. 审核卡住/审核没过
   E. 店开好了但不知道先配置什么

## 回答格式

诊断类回答尽量按这个结构：

## 1. 你的阶段判断
- 你现在大概处于：...
- 判断依据：...
- 来源文档：...

## 2. 你现在最该做什么
- 第一步：...
- 第二步：...
- 第三步：...

## 3. 你暂时不要做什么
- 不要：...
- 原因：...

## 4. 你还缺什么
| 缺口 | 是否必须 | 为什么重要 | 来源 |

## 5. 下一步清单
- [ ] ...
- [ ] ...
- [ ] ...

## 语气

语气像有经验的同行朋友：清楚、直接、可执行。
不要制造焦虑，不要承诺一定审核通过，不要承诺流量和收益。
`;

async function main() {
	const email = parseEmail();
	if (!email) throw new Error("Missing --email");

	const sql = getSql();
	const now = new Date();
	const soulHash = sha256(soulSnapshot);
	const readmeHash = sha256(readmeSnapshot);
	const skillsHash = sha256(JSON.stringify(skillsSummary));
	const versionId = `${EMPLOYEE_ID}-v-${sha256(`${soulHash}:${readmeHash}:${skillsHash}`).slice(0, 16)}`;

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
			throw new Error(`Knowledge pack not found: ${KNOWLEDGE_PACK_ID}. Run pnpm knowledge:xhs:import first.`);
		}

		await sql`
			insert into worker_employee (
				id, name, responsibility, suitable_tasks, solves_problem,
				employee_dir, readme_path, soul_path, status,
				monthly_price_id, monthly_amount, currency,
				source_hash, latest_version_id, synced_at, created_at, updated_at
			)
			values (
				${EMPLOYEE_ID},
				${"小红书开店入驻教练"},
				${"帮助新手判断小红书开店阶段、店铺类型、资质材料和下一步行动。"},
				${"开店前判断、店铺类型选择、营业执照/商标/授权/行业资质检查、入驻流程、审核卡点、新商权益、开店后基础配置。"},
				${"解决用户不知道能不能开店、开什么店、缺什么材料、下一步怎么做的问题。"},
				${`db://worker/${EMPLOYEE_ID}`},
				${`db://worker/${EMPLOYEE_ID}/README.md`},
				${`db://worker/${EMPLOYEE_ID}/SOUL.md`},
				${"active"},
				${PRICE_ID},
				${MONTHLY_AMOUNT},
				${"CNY"},
				${sha256(`${soulSnapshot}:${readmeSnapshot}:${skillsSummary.join("|")}`)},
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

		await sql`
			insert into worker_employee_version (
				id, employee_id, soul_path, soul_hash, readme_hash, skills_hash,
				soul_snapshot, readme_snapshot, skills_summary, created_at
			)
			values (
				${versionId},
				${EMPLOYEE_ID},
				${`db://worker/${EMPLOYEE_ID}/SOUL.md`},
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

		await sql`
			insert into worker_skill (
				id, name, summary, category, skill_type, risk_level, status,
				default_enabled, requires_user_config, created_at, updated_at
			)
			values (
				${SKILL_ID},
				${"小红书开店入驻知识库"},
				${"使用 xhs-open-shop-v1 知识包检索官方开店入驻文档、28 讲问题大纲和诊断提示词。"},
				${"knowledge"},
				${"data"},
				${"low"},
				${"public"},
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

		await sql`
			insert into worker_employee_skill (
				id, employee_id, skill_id, status, default_enabled, created_at, updated_at
			)
			values (
				${`wes-${EMPLOYEE_ID}-${SKILL_ID}`},
				${EMPLOYEE_ID},
				${SKILL_ID},
				${"allowed"},
				${true},
				${now},
				${now}
			)
			on conflict (id) do update set
				status = excluded.status,
				default_enabled = excluded.default_enabled,
				updated_at = excluded.updated_at
		`;

		await sql`
			insert into worker_skill_knowledge_pack (
				id, skill_id, knowledge_pack_id, status, created_at, updated_at
			)
			values (
				${`wskp-${SKILL_ID}-${KNOWLEDGE_PACK_ID}`},
				${SKILL_ID},
				${KNOWLEDGE_PACK_ID},
				${"enabled"},
				${now},
				${now}
			)
			on conflict (skill_id, knowledge_pack_id) do update set
				status = excluded.status,
				updated_at = excluded.updated_at
		`;

		await sql`
			insert into worker_employee_knowledge_pack (
				id, employee_id, knowledge_pack_id, status, created_at
			)
			values (
				${`wekp-${EMPLOYEE_ID}-${KNOWLEDGE_PACK_ID}`},
				${EMPLOYEE_ID},
				${KNOWLEDGE_PACK_ID},
				${"enabled"},
				${now}
			)
			on conflict (employee_id, knowledge_pack_id) do update set
				status = excluded.status
		`;

		const existingInstances = await sql<{ id: string }[]>`
			select id from worker_instance
			where user_id = ${user.id} and employee_id = ${EMPLOYEE_ID}
			order by updated_at desc
			limit 1
		`;
		const instanceId = existingInstances[0]?.id || `wi_${randomUUID()}`;

		if (existingInstances[0]) {
			await sql`
				update worker_instance set
					employee_version_id = ${versionId},
					status = case
						when status in ('active', 'qr_ready', 'scanned') then status
						else ${"ready_to_activate"}
					end,
					payment_status = ${"active"},
					price_id = ${PRICE_ID},
					error = null,
					updated_at = ${now}
				where id = ${instanceId}
			`;
		} else {
			await sql`
				insert into worker_instance (
					id, user_id, employee_id, employee_version_id,
					status, payment_status, price_id, subscription_id,
					created_at, updated_at
				)
				values (
					${instanceId},
					${user.id},
					${EMPLOYEE_ID},
					${versionId},
					${"ready_to_activate"},
					${"active"},
					${PRICE_ID},
					${`test_${randomUUID()}`},
					${now},
					${now}
				)
			`;
		}

		await sql`
			insert into worker_instance_skill (
				id, instance_id, skill_id, enabled, source, created_at, updated_at
			)
			values (
				${`wis-${instanceId}-${SKILL_ID}`},
				${instanceId},
				${SKILL_ID},
				${true},
				${"admin"},
				${now},
				${now}
			)
			on conflict (id) do update set
				enabled = excluded.enabled,
				source = excluded.source,
				updated_at = excluded.updated_at
		`;

		const savedInstances = await sql<{ status: string }[]>`
			select status from worker_instance where id = ${instanceId} limit 1
		`;

		console.log(JSON.stringify({
			employeeId: EMPLOYEE_ID,
			versionId,
			skillId: SKILL_ID,
			knowledgePackId: KNOWLEDGE_PACK_ID,
			userId: user.id,
			userEmail: user.email,
			instanceId,
			status: savedInstances[0]?.status || "ready_to_activate",
		}, null, 2));
	} finally {
		await sql.end();
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
