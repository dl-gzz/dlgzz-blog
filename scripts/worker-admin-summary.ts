/**
 * Print a compact worker admin summary for /one CLI or mobile checks.
 *
 * Run:
 *   pnpm worker:admin
 *   pnpm worker:admin -- --limit 20
 *   pnpm worker:admin -- --json
 */

import { join } from "node:path";
import postgres from "postgres";
import * as dotenv from "dotenv";

dotenv.config({ path: join(process.cwd(), ".env") });
dotenv.config({ path: join(process.cwd(), ".env.local"), override: true });

type InstanceRow = {
	id: string;
	user_id: string;
	user_email: string | null;
	employee_name: string | null;
	status: string;
	payment_status: string;
	access_source: string;
	profile_name: string | null;
	activation_id: string | null;
	activation_expires_at: Date | null;
	weixin_user_id: string | null;
	gateway_status: string | null;
	error: string | null;
	activated_at: Date | null;
	created_at: Date;
	updated_at: Date;
	skills: Array<{
		id: string;
		name: string;
		enabled: boolean;
		skill_type: string;
	}>;
};

type BridgeAssistant = {
	assistantId?: string;
	workerInstanceId?: string;
	status?: string;
	gatewayStatus?: string;
	serviceName?: string;
	error?: string | null;
	updatedAt?: string | null;
};

type BridgeAdminResponse = {
	success?: boolean;
	generatedAt?: string;
	summary?: Record<string, number>;
	assistants?: BridgeAssistant[];
	error?: string;
};

type CliOptions = {
	json: boolean;
	limit: number;
};

function readOptions(): CliOptions {
	const args = process.argv.slice(2);
	const limitIndex = args.findIndex((arg) => arg === "--limit");
	const inlineLimit = args.find((arg) => arg.startsWith("--limit="));
	const rawLimit =
		inlineLimit?.split("=")[1] ||
		(limitIndex >= 0 ? args[limitIndex + 1] : undefined);
	const limit = Number(rawLimit || 12);

	return {
		json: args.includes("--json"),
		limit: Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 12,
	};
}

function getSql() {
	const connectionString = process.env.DATABASE_URL;
	if (!connectionString) throw new Error("DATABASE_URL is not set");

	const explicit = (process.env.DATABASE_SSL || "").toLowerCase();
	const ssl =
		explicit === "false" || explicit === "disable" || explicit === "off"
			? false
			: "require";

	return postgres(connectionString, {
		ssl,
		max: 1,
		prepare: false,
		connect_timeout: 15,
	});
}

function getBridgeHeaders(): Record<string, string> {
	const token = process.env.HERMES_BRIDGE_TOKEN?.trim();
	if (!token) return {};

	return {
		Authorization: `Bearer ${token}`,
		"X-Hermes-Bridge-Token": token,
	};
}

async function fetchBridgeAdmin() {
	const rawUrl = process.env.HERMES_BRIDGE_URL?.trim();
	if (!rawUrl) return null;

	try {
		const url = new URL("/admin/assistants", rawUrl);
		const response = await fetch(url, {
			method: "GET",
			cache: "no-store",
			headers: getBridgeHeaders(),
			signal: AbortSignal.timeout(12_000),
		});
		const data = (await response.json().catch(() => null)) as
			| BridgeAdminResponse
			| null;
		if (!response.ok || !data?.success) {
			return {
				ok: false,
				error: data?.error || `Hermes Bridge ${response.status}`,
				summary: {},
				assistants: [],
			};
		}

		return {
			ok: true,
			error: "",
			generatedAt: data.generatedAt || "",
			summary: data.summary || {},
			assistants: Array.isArray(data.assistants) ? data.assistants : [],
		};
	} catch (error) {
		return {
			ok: false,
			error: error instanceof Error ? error.message : "Hermes Bridge unavailable",
			summary: {},
			assistants: [],
		};
	}
}

async function listInstances(limit: number) {
	const sql = getSql();

	try {
		return await sql<InstanceRow[]>`
			with skill_rows as (
				select
					wi.id as instance_id,
					ws.id,
					ws.name,
					ws.skill_type,
					bool_or(coalesce(wis.enabled, wes.default_enabled, ws.default_enabled)) as enabled
				from worker_instance wi
				left join worker_employee_skill wes on wes.employee_id = wi.employee_id
				left join worker_skill ws on ws.id = wes.skill_id
				left join worker_instance_skill wis
					on wis.instance_id = wi.id and wis.skill_id = ws.id
				where ws.id is not null
				group by wi.id, ws.id, ws.name, ws.skill_type
			),
			instance_skills as (
				select
					instance_id,
					coalesce(
						jsonb_agg(
							jsonb_build_object(
								'id', id,
								'name', name,
								'enabled', enabled,
								'skill_type', skill_type
							)
							order by enabled desc, name asc
						),
						'[]'::jsonb
					) as skills
				from skill_rows
				group by instance_id
			)
			select
				wi.id,
				wi.user_id,
				u.email as user_email,
				we.name as employee_name,
				wi.status,
				wi.payment_status,
				wi.access_source,
				wi.profile_name,
				wi.activation_id,
				wi.activation_expires_at,
				wi.weixin_user_id,
				wi.gateway_status,
				wi.error,
				wi.activated_at,
				wi.created_at,
				wi.updated_at,
				coalesce(instance_skills.skills, '[]'::jsonb) as skills
			from worker_instance wi
			left join "user" u on u.id = wi.user_id
			left join worker_employee we on we.id = wi.employee_id
			left join instance_skills on instance_skills.instance_id = wi.id
			order by wi.updated_at desc
			limit ${limit}
		`;
	} finally {
		await sql.end();
	}
}

function summarize(instances: InstanceRow[]) {
	const activated = instances.filter(
		(item) => getEffectiveStatus(item) === "active",
	).length;
	const withQr = instances.filter(
		(item) => Boolean(item.activation_id) || item.status === "qr_ready",
	).length;
	const waitingScan = instances.filter(
		(item) => getEffectiveStatus(item) === "qr_ready",
	).length;
	const expired = instances.filter(
		(item) => getEffectiveStatus(item) === "activation_expired",
	).length;
	const needsAttention = instances.filter(
		(item) =>
			getEffectiveStatus(item) !== "active" &&
			(Boolean(item.error) ||
				item.status === "activation_failed" ||
				item.gateway_status === "start_failed"),
	).length;

	return {
		total: instances.length,
		activated,
		withQr,
		waitingScan,
		expired,
		needsAttention,
	};
}

function getEffectiveStatus(item: InstanceRow) {
	if (item.weixin_user_id && item.gateway_status === "running") return "active";
	if (item.weixin_user_id) return "active";
	if (item.status === "qr_ready" && item.activation_expires_at) {
		return item.activation_expires_at.getTime() <= Date.now()
			? "activation_expired"
			: "qr_ready";
	}
	return item.status;
}

function statusText(status: string) {
	const map: Record<string, string> = {
		pending_payment: "待开通",
		paid: "已开通",
		qr_ready: "等待扫码",
		scanned: "已扫码待确认",
		active: "已激活",
		activated: "已激活",
		activation_expired: "二维码过期",
		activation_failed: "激活失败",
		paused: "已暂停",
		version_upgrade_pending_activation: "新版待激活",
	};
	return map[status] || status || "未知";
}

function mask(value: string | null | undefined) {
	if (!value) return "-";
	if (value.length <= 10) return value;
	return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function formatDate(value: Date | string | null | undefined) {
	if (!value) return "-";
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return "-";
	return date.toLocaleString("zh-CN", {
		hour12: false,
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function formatTextReport({
	instances,
	bridge,
}: {
	instances: InstanceRow[];
	bridge: Awaited<ReturnType<typeof fetchBridgeAdmin>>;
}) {
	const summary = summarize(instances);
	const lines: string[] = [];
	lines.push(`数字员工后台 ${formatDate(new Date())}`);
	lines.push(
		`实例 ${summary.total} | 已生成二维码 ${summary.withQr} | 已激活 ${summary.activated} | 等待扫码 ${summary.waitingScan} | 过期 ${summary.expired} | 需处理 ${summary.needsAttention}`,
	);

	if (bridge) {
		if (bridge.ok) {
			const bridgeSummary = bridge.summary as Record<string, number>;
			lines.push(
				`Hermes Bridge 正常 | 激活 ${bridgeSummary.activated || 0} | 运行 ${bridgeSummary.running || 0} | 等待 ${bridgeSummary.pending || 0} | 需处理 ${bridgeSummary.needsAttention || 0}`,
			);
		} else {
			lines.push(`Hermes Bridge 异常：${bridge.error}`);
		}
	}

	if (!instances.length) {
		lines.push("");
		lines.push("暂无用户实例。");
		return lines.join("\n");
	}

	lines.push("");
	lines.push("最近实例：");
	instances.forEach((item, index) => {
		const effectiveStatus = getEffectiveStatus(item);
		const enabledSkills = item.skills.filter((skill) => skill.enabled);
		const disabledSkills = item.skills.filter((skill) => !skill.enabled);
		const skillText = enabledSkills.length
			? enabledSkills.map((skill) => skill.name).join("、")
			: "未开启技能";
		const disabledText = disabledSkills.length
			? `；关闭：${disabledSkills.map((skill) => skill.name).join("、")}`
			: "";

		lines.push(
			`${index + 1}. ${item.employee_name || "数字员工"} / ${item.user_email || mask(item.user_id)}`,
		);
		lines.push(
			`   状态：${statusText(effectiveStatus)} | 微信：${item.weixin_user_id ? "已绑定" : "未绑定"} | Gateway：${item.gateway_status || "-"}`,
		);
		lines.push(`   技能：${skillText}${disabledText}`);
		lines.push(
			`   实例：${mask(item.id)} | Profile：${item.profile_name || "-"} | 更新：${formatDate(item.updated_at)}`,
		);
		if (item.error && effectiveStatus !== "active") lines.push(`   异常：${item.error}`);
	});

	return lines.join("\n");
}

async function main() {
	const options = readOptions();
	const [instances, bridge] = await Promise.all([
		listInstances(options.limit),
		fetchBridgeAdmin(),
	]);

	if (options.json) {
		console.log(
			JSON.stringify(
				{
					success: true,
					generatedAt: new Date().toISOString(),
					summary: summarize(instances),
					bridge,
					instances,
				},
				null,
				2,
			),
		);
		return;
	}

	console.log(formatTextReport({ instances, bridge }));
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
