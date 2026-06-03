/**
 * Provision a worker instance through Hermes Bridge without going through the UI.
 *
 * Run:
 *   pnpm worker:provision -- wi_xxx
 */

import { join } from "node:path";
import postgres from "postgres";
import * as dotenv from "dotenv";

dotenv.config({ path: join(process.cwd(), ".env") });
dotenv.config({ path: join(process.cwd(), ".env.local"), override: true });

type InstanceRow = {
	id: string;
	user_id: string;
	employee_id: string;
	employee_version_id: string;
	persona_prompt: string | null;
	status: string;
	payment_status: string;
	employee_name: string;
	responsibility: string;
	suitable_tasks: string;
	skills_summary: string[];
	soul_snapshot: string;
};

type SkillRow = {
	id: string;
	name: string;
	summary: string;
	skill_type: string;
	risk_level: string;
	enabled: boolean;
};

type KnowledgePackRow = {
	id: string;
	name: string;
	scope: string;
};

type BridgeResponse = {
	success?: boolean;
	assistantId?: string;
	activationId?: string;
	status?: string;
	profileName?: string | null;
	qrPayload?: string | null;
	qrImageUrl?: string | null;
	expiresAt?: string | null;
	weixinAccountId?: string | null;
	weixinUserId?: string | null;
	gatewayStatus?: string | null;
	gatewayError?: string | null;
	error?: string;
	message?: string;
};

function getInstanceId() {
	const id = process.argv.slice(2).find((arg) => arg.trim() && arg !== "--")?.trim();
	if (!id) throw new Error("Usage: pnpm worker:provision -- <workerInstanceId>");
	return id;
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

function getBridgeUrl() {
	const raw = process.env.HERMES_BRIDGE_URL || "http://127.0.0.1:7323";
	return new URL(raw);
}

function getBridgeHeaders(): Record<string, string> {
	const token = process.env.HERMES_BRIDGE_TOKEN?.trim();
	return token ? { Authorization: `Bearer ${token}` } : {};
}

function normalizeBridgeStatus(status?: string | null) {
	if (status === "activated") return "active";
	if (status === "expired") return "activation_expired";
	if (status === "failed") return "activation_failed";
	return status || "qr_ready";
}

async function main() {
	const instanceId = getInstanceId();
	const sql = getSql();

	try {
		const instances = await sql<InstanceRow[]>`
			select
				wi.id,
				wi.user_id,
				wi.employee_id,
				wi.employee_version_id,
				wi.persona_prompt,
				wi.status,
				wi.payment_status,
				we.name as employee_name,
				we.responsibility,
				we.suitable_tasks,
				wev.skills_summary,
				wev.soul_snapshot
			from worker_instance wi
			join worker_employee we on we.id = wi.employee_id
			join worker_employee_version wev on wev.id = wi.employee_version_id
			where wi.id = ${instanceId}
			limit 1
		`;
		const instance = instances[0];
		if (!instance) throw new Error(`Worker instance not found: ${instanceId}`);

		const skills = await sql<SkillRow[]>`
			select
				ws.id,
				ws.name,
				ws.summary,
				ws.skill_type,
				ws.risk_level,
				coalesce(wis.enabled, wes.default_enabled, ws.default_enabled) as enabled
			from worker_skill ws
			join worker_employee_skill wes on wes.skill_id = ws.id
			left join worker_instance_skill wis
				on wis.skill_id = ws.id and wis.instance_id = ${instance.id}
			where wes.employee_id = ${instance.employee_id}
				and wes.status = 'allowed'
				and ws.status in ('public', 'beta', 'internal')
		`;
		const enabledSkills = skills.filter((skill) => skill.enabled);
		const enabledSkillLines = enabledSkills.map(
			(skill) => `- ${skill.name}：${skill.summary}`,
		);
		const enabledSkillCapabilityLines = enabledSkills.map(
			(skill) => `${skill.name}：${skill.summary}`,
		);
		const employeeKnowledgePacks = await sql<KnowledgePackRow[]>`
			select distinct kp.id, kp.name, kp.scope
			from knowledge_packs kp
			join worker_employee_knowledge_pack wekp
				on wekp.knowledge_pack_id = kp.id
			where wekp.employee_id = ${instance.employee_id}
				and wekp.status = 'enabled'
				and kp.status in ('active', 'published')
		`;
		const skillKnowledgePacks = enabledSkills.length
			? await sql<KnowledgePackRow[]>`
				select distinct kp.id, kp.name, kp.scope
				from knowledge_packs kp
				join worker_skill_knowledge_pack wskp
					on wskp.knowledge_pack_id = kp.id
				where wskp.skill_id in ${sql(enabledSkills.map((skill) => skill.id))}
					and wskp.status = 'enabled'
					and kp.status in ('active', 'published')
			`
			: [];
		const knowledgePacks = [...employeeKnowledgePacks, ...skillKnowledgePacks]
			.filter((pack, index, all) => all.findIndex((item) => item.id === pack.id) === index);
		const knowledgePackLines = knowledgePacks.map(
			(pack) => `- ${pack.id}：${pack.name}（${pack.scope}）`,
		);
		const knowledgePackCapabilityLines = knowledgePacks.map(
			(pack) => `${pack.id}：${pack.name}（${pack.scope}）`,
		);
		const serviceCapabilityLines = [
			...enabledSkillCapabilityLines,
			...knowledgePackCapabilityLines,
		];
		const servicePrompt = [
			instance.soul_snapshot.trim(),
			enabledSkillLines.length
				? `\n## 本实例已启用技能\n${enabledSkillLines.join("\n")}`
				: "",
			knowledgePackLines.length
				? `\n## 本实例可用知识库\n${knowledgePackLines.join("\n")}`
				: "",
			instance.persona_prompt
				? `\n## 用户选择的性格偏好\n${instance.persona_prompt.trim()}`
				: "",
		].filter(Boolean).join("\n\n");

		const response = await fetch(new URL("/assistants/provision", getBridgeUrl()), {
			method: "POST",
			headers: {
				...getBridgeHeaders(),
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				assistantId: instance.id,
				workerInstanceId: instance.id,
				userId: instance.user_id,
				roleId: instance.employee_id,
				employeeId: instance.employee_id,
				employeeVersionId: instance.employee_version_id,
				serviceId: `worker-${instance.employee_id}`,
				serviceName: instance.employee_name,
				serviceSummary: instance.responsibility,
				servicePrompt,
				soulSnapshot: instance.soul_snapshot,
				skillsSummary: enabledSkills.length
					? enabledSkills.map((skill) => skill.name)
					: instance.skills_summary,
				enabledSkills,
				serviceCapabilities: serviceCapabilityLines.length
					? serviceCapabilityLines
					: instance.skills_summary.length
						? instance.skills_summary
						: [instance.suitable_tasks].filter(Boolean),
				serviceDeliverables: [
					"独立 Hermes Profile",
					"员工灵魂快照",
					"微信扫码激活",
				],
				source: "workers-platform-cli",
				locale: "zh",
				activationTtlSeconds: 120,
			}),
		});
		const data = (await response.json().catch(() => null)) as BridgeResponse | null;

		if (!response.ok || !data?.success) {
			throw new Error(data?.error || `Hermes Bridge failed: ${response.status}`);
		}

		await sql`
			update worker_instance set
				status = ${normalizeBridgeStatus(data.status)},
				profile_name = ${data.profileName || null},
				activation_id = ${data.activationId || data.assistantId || instance.id},
				qr_payload = ${data.qrPayload || null},
				qr_image_url = ${data.qrImageUrl || null},
				activation_expires_at = ${data.expiresAt ? new Date(data.expiresAt) : null},
				weixin_account_id = ${data.weixinAccountId || null},
				weixin_user_id = ${data.weixinUserId || null},
				gateway_status = ${data.gatewayStatus || null},
				error = ${data.error || data.gatewayError || null},
				updated_at = now()
			where id = ${instance.id}
		`;

		console.log(JSON.stringify({
			instanceId: instance.id,
			status: normalizeBridgeStatus(data.status),
			profileName: data.profileName,
			activationId: data.activationId || data.assistantId || instance.id,
			expiresAt: data.expiresAt,
			qrPayload: data.qrPayload,
			message: data.message,
		}, null, 2));
	} finally {
		await sql.end();
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
