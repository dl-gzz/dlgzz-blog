/**
 * Worker platform stability checks.
 *
 * Run:
 *   pnpm worker:stability
 */

import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import postgres from "postgres";
import * as dotenv from "dotenv";

dotenv.config({ path: join(process.cwd(), ".env") });
dotenv.config({ path: join(process.cwd(), ".env.local"), override: true });

const REQUIRED_TABLES = [
	"worker_employee",
	"worker_employee_version",
	"worker_instance",
	"worker_skill",
	"worker_employee_skill",
	"worker_instance_skill",
	"worker_skill_knowledge_pack",
	"knowledge_packs",
	"knowledge_documents",
	"knowledge_chunks",
	"worker_user_profile",
	"worker_memory",
	"worker_push_subscription",
	"worker_content_item",
	"worker_push_delivery",
];

const REQUIRED_WORKER_INSTANCE_COLUMNS = [
	"access_source",
	"membership_price_id",
	"profile_name",
	"activation_id",
	"weixin_user_id",
];

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

function buildProfileName({
	assistantId,
	roleId,
	userId,
}: {
	assistantId: string;
	roleId: string;
	userId: string;
}) {
	const readableRole = roleId.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 16);
	const hash = createHash("sha256")
		.update(`${assistantId}:${roleId}:${userId}`)
		.digest("hex")
		.slice(0, 12);

	return `bot${readableRole}${hash}`.slice(0, 32);
}

async function main() {
	const sql = getSql();
	const failures: string[] = [];

	try {
		const tableRows = await sql<{ table_name: string }[]>`
			select table_name
			from information_schema.tables
			where table_schema = 'public'
				and table_name in ${sql(REQUIRED_TABLES)}
		`;
		const existingTables = new Set(tableRows.map((row) => row.table_name));
		for (const table of REQUIRED_TABLES) {
			if (!existingTables.has(table)) failures.push(`missing table: ${table}`);
		}

		const columnRows = await sql<{ column_name: string }[]>`
			select column_name
			from information_schema.columns
			where table_schema = 'public'
				and table_name = 'worker_instance'
				and column_name in ${sql(REQUIRED_WORKER_INSTANCE_COLUMNS)}
		`;
		const existingColumns = new Set(columnRows.map((row) => row.column_name));
		for (const column of REQUIRED_WORKER_INSTANCE_COLUMNS) {
			if (!existingColumns.has(column)) {
				failures.push(`missing worker_instance column: ${column}`);
			}
		}

		const duplicateProfiles = await sql<{
			profile_name: string;
			count: string;
			instances: string[];
		}[]>`
			select profile_name, count(*)::text, array_agg(id order by id) as instances
			from worker_instance
			where profile_name is not null and profile_name <> ''
			group by profile_name
			having count(*) > 1
		`;
		for (const row of duplicateProfiles) {
			failures.push(
				`profile collision in database: ${row.profile_name} -> ${row.instances.join(", ")}`,
			);
		}

		const skillPackRows = await sql<{ count: string }[]>`
			select count(*)::text from worker_skill_knowledge_pack where status = 'enabled'
		`;
		const enabledSkillPackBindings = Number(skillPackRows[0]?.count || 0);
		if (enabledSkillPackBindings < 1) {
			failures.push("no enabled skill -> knowledge pack binding found");
		}

		const activeRows = await sql<{
			total: string;
			with_profile: string;
			with_weixin: string;
		}[]>`
			select
				count(*)::text as total,
				count(profile_name)::text as with_profile,
				count(weixin_user_id)::text as with_weixin
			from worker_instance
			where status = 'active'
		`;

		const simulatedNames = new Set<string>();
		for (let userIndex = 0; userIndex < 120; userIndex += 1) {
			for (let instanceIndex = 0; instanceIndex < 3; instanceIndex += 1) {
				const name = buildProfileName({
					assistantId: `wi_${randomUUID()}`,
					roleId: "xhs-open-shop-coach",
					userId: `user_${userIndex}`,
				});
				if (name.length > 32) {
					failures.push(`profile name too long: ${name}`);
				}
				if (simulatedNames.has(name)) {
					failures.push(`simulated profile collision: ${name}`);
				}
				simulatedNames.add(name);
			}
		}

		const result = {
			success: failures.length === 0,
			checks: {
				requiredTables: `${tableRows.length}/${REQUIRED_TABLES.length}`,
				requiredWorkerInstanceColumns: `${columnRows.length}/${REQUIRED_WORKER_INSTANCE_COLUMNS.length}`,
				enabledSkillPackBindings,
				duplicateProfiles: duplicateProfiles.length,
				simulatedProfiles: simulatedNames.size,
				activeInstances: {
					total: Number(activeRows[0]?.total || 0),
					withProfile: Number(activeRows[0]?.with_profile || 0),
					withWeixin: Number(activeRows[0]?.with_weixin || 0),
				},
			},
			failures,
		};

		console.log(JSON.stringify(result, null, 2));
		if (failures.length) process.exitCode = 1;
	} finally {
		await sql.end().catch(() => {});
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
