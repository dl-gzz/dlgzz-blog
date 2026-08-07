/**
 * AI knowledge distiller: turn narrative articles (blog MDX / Obsidian markdown)
 * into atomic Q&A knowledge files ready for `pnpm knowledge:import`.
 *
 * Pipeline position (stage 2 of 3):
 *   ① write articles → ② THIS SCRIPT (LLM distills each article into
 *   `<pack-dir>/distilled/<name>.md`, H2 = question, body = answer)
 *   → ③ pnpm knowledge:import -- --pack <pack-dir>
 *
 * The distilled files are REVIEWABLE ASSETS: edit them by hand before import —
 * curation is the product. Re-runs skip articles whose content hash is
 * unchanged (the hash is stored in each distilled file's frontmatter).
 *
 * Run:
 *   pnpm knowledge:distill -- --source content/blog --pack-dir /path/to/pack --pack-id my-pack-v1 --pack-name "我的知识包"
 *   pnpm knowledge:distill -- --source /path/to/obsidian/folder --pack-dir ... --dry-run
 *   pnpm knowledge:distill -- --source ... --pack-dir ... --limit 3
 *   pnpm knowledge:distill -- --source ... --pack-dir ... --force
 *
 * Provider: DeepSeek (DEEPSEEK_API_KEY) or Zhipu GLM (ZHIPU_API_KEY), override
 * with KNOWLEDGE_DISTILL_PROVIDER / KNOWLEDGE_DISTILL_MODEL.
 */

import { createHash } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import matter from "gray-matter";
import * as dotenv from "dotenv";

dotenv.config({ path: join(process.cwd(), ".env") });
dotenv.config({ path: join(process.cwd(), ".env.local"), override: true });

const REQUEST_DELAY_MS = 500;
const MAX_ARTICLE_CHARS = 24_000;

type CliOptions = {
	sources: string[];
	packDir: string;
	packId: string;
	packName: string;
	dryRun: boolean;
	force: boolean;
	includeDrafts: boolean;
	limit?: number;
};

type Article = {
	filePath: string;
	title: string;
	body: string;
	contentHash: string;
	published: boolean;
};

type DistilledUnit = {
	question: string;
	answer: string;
	tags: string[];
};

function parseArgs(): CliOptions {
	const args = process.argv.slice(2);
	const options: CliOptions = {
		sources: [],
		packDir: "",
		packId: "",
		packName: "",
		dryRun: false,
		force: false,
		includeDrafts: false,
	};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--source") options.sources.push(args[++i] || "");
		if (arg === "--pack-dir") options.packDir = args[++i] || "";
		if (arg === "--pack-id") options.packId = args[++i] || "";
		if (arg === "--pack-name") options.packName = args[++i] || "";
		if (arg === "--dry-run") options.dryRun = true;
		if (arg === "--force") options.force = true;
		if (arg === "--include-drafts") options.includeDrafts = true;
		if (arg === "--limit") options.limit = Number(args[++i]);
	}

	options.sources = options.sources.filter(Boolean).map((item) => resolve(item));
	if (!options.sources.length) {
		throw new Error("缺少 --source <文章目录或文件>（可重复传多个）");
	}
	if (!options.packDir) {
		throw new Error("缺少 --pack-dir <知识包目录>（提炼结果写入这里的 distilled/）");
	}
	options.packDir = resolve(options.packDir);

	return options;
}

function sha1(input: string) {
	return createHash("sha1").update(input).digest("hex");
}

function cleanTitle(value: string) {
	return value
		.replace(/[#*_`[\]]/g, "")
		.replace(/\s+/g, " ")
		.trim();
}

/** Strip MDX/JSX noise so the LLM sees prose, not component markup. */
function normalizeArticleBody(content: string) {
	return content
		.replace(/^import\s+.+$/gm, "")
		.replace(/^export\s+.+$/gm, "")
		.replace(/<[A-Z][\w.]*(\s[^>]*)?\/>/g, "")
		.replace(/<\/?[A-Z][\w.]*(\s[^>]*)?>/g, "")
		.replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
		.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
		.replace(/\n{4,}/g, "\n\n\n")
		.trim();
}

function listArticleFiles(target: string): string[] {
	if (!existsSync(target)) return [];
	const stat = statSync(target);
	if (stat.isFile()) {
		return [".md", ".mdx"].includes(extname(target)) ? [target] : [];
	}
	return readdirSync(target)
		.filter((file) => [".md", ".mdx"].includes(extname(file)))
		.sort((a, b) => a.localeCompare(b, "zh-Hans-CN"))
		.map((file) => join(target, file))
		.filter((filePath) => statSync(filePath).isFile());
}

function loadArticle(filePath: string): Article {
	const raw = readFileSync(filePath, "utf8");
	const parsed = matter(raw);
	const data = parsed.data as Record<string, unknown>;
	const title =
		(typeof data.title === "string" && data.title.trim()) ||
		parsed.content.match(/^#\s+(.+)$/m)?.[1] ||
		basename(filePath).replace(/\.(md|mdx)$/, "");

	return {
		filePath,
		title: cleanTitle(title),
		body: normalizeArticleBody(parsed.content),
		contentHash: sha1(raw),
		published: data.published !== false,
	};
}

function distilledFileName(article: Article) {
	return `${basename(article.filePath).replace(/\.(md|mdx)$/, "")}.md`;
}

function readExistingSourceHash(distilledPath: string): string | null {
	if (!existsSync(distilledPath)) return null;
	try {
		const parsed = matter(readFileSync(distilledPath, "utf8"));
		const hash = (parsed.data as Record<string, unknown>).source_hash;
		return typeof hash === "string" ? hash : null;
	} catch {
		return null;
	}
}

type ProviderConfig = {
	provider: "deepseek" | "zhipu";
	model: string;
	url: string;
	apiKey: string;
};

function resolveProvider(): ProviderConfig {
	const preferred = (process.env.KNOWLEDGE_DISTILL_PROVIDER || "").trim().toLowerCase();
	const deepseekKey = process.env.DEEPSEEK_API_KEY?.trim();
	const zhipuKey = process.env.ZHIPU_API_KEY?.trim();

	const useDeepseek =
		preferred === "deepseek" || (!preferred && Boolean(deepseekKey));

	if (useDeepseek) {
		if (!deepseekKey) throw new Error("DEEPSEEK_API_KEY is not set");
		return {
			provider: "deepseek",
			model:
				process.env.KNOWLEDGE_DISTILL_MODEL ||
				process.env.DEEPSEEK_MODEL ||
				"deepseek-chat",
			url: `${(process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1").replace(/\/$/, "")}/chat/completions`,
			apiKey: deepseekKey,
		};
	}

	if (!zhipuKey) {
		throw new Error("需要 DEEPSEEK_API_KEY 或 ZHIPU_API_KEY 之一");
	}
	return {
		provider: "zhipu",
		model:
			process.env.KNOWLEDGE_DISTILL_MODEL || process.env.ZHIPU_MODEL || "glm-4",
		url: `${(process.env.ZHIPU_BASE_URL || "https://open.bigmodel.cn/api/paas/v4").replace(/\/$/, "")}/chat/completions`,
		apiKey: zhipuKey,
	};
}

function buildDistillPrompt(article: Article) {
	return `你是一个严格的知识库编辑。把下面这篇文章提炼成「原子知识单元」，供 AI 检索问答使用。

规则：
1. 只保留操作性、事实性、方法性知识：怎么做、步骤、参数、路径、条件、避坑、明确结论。
2. 跳过营销叙事、个人感想、寒暄、与主题无关的内容。
3. 每个单元 = 一个具体问题 + 一个自包含的完整答案。答案单独读也成立，不写"如上所述"。
4. 答案里的步骤、数字、名称必须来自原文，不允许编造原文没有的内容。
5. question 写成用户真的会问的口语问题。
6. 如果整篇文章没有可提炼的知识（纯叙事/纯营销），返回空数组。

只输出 JSON，格式：
{"units": [{"question": "...", "answer": "...", "tags": ["..."]}]}

文章标题：${article.title}

文章内容：
${article.body.slice(0, MAX_ARTICLE_CHARS)}`;
}

function extractJsonObject(raw: string): Record<string, unknown> | null {
	const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
	const source = (fenced?.[1] || raw).trim();

	try {
		const parsed = JSON.parse(source);
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			return parsed as Record<string, unknown>;
		}
	} catch {
		// fall through to balanced extraction
	}

	for (
		let start = source.indexOf("{");
		start >= 0;
		start = source.indexOf("{", start + 1)
	) {
		let depth = 0;
		let inString = false;
		let escaped = false;

		for (let index = start; index < source.length; index += 1) {
			const char = source[index];

			if (inString) {
				if (escaped) {
					escaped = false;
				} else if (char === "\\") {
					escaped = true;
				} else if (char === '"') {
					inString = false;
				}
				continue;
			}

			if (char === '"') {
				inString = true;
				continue;
			}

			if (char === "{") depth += 1;
			if (char === "}") depth -= 1;

			if (depth === 0) {
				try {
					const parsed = JSON.parse(source.slice(start, index + 1));
					if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
						return parsed as Record<string, unknown>;
					}
				} catch {
					break;
				}
			}
		}
	}

	return null;
}

function normalizeUnits(value: unknown): DistilledUnit[] {
	if (!value || typeof value !== "object") return [];
	const rawUnits = (value as Record<string, unknown>).units;
	if (!Array.isArray(rawUnits)) return [];

	return rawUnits
		.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
		.map((item) => ({
			question: cleanTitle(String(item.question || "")),
			answer: String(item.answer || "").trim(),
			tags: Array.isArray(item.tags)
				? item.tags.map((tag) => String(tag).trim()).filter(Boolean)
				: [],
		}))
		.filter((unit) => unit.question.length >= 4 && unit.answer.length >= 20);
}

async function distillArticle(
	article: Article,
	provider: ProviderConfig
): Promise<DistilledUnit[]> {
	const response = await fetch(provider.url, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${provider.apiKey}`,
		},
		body: JSON.stringify({
			model: provider.model,
			temperature: 0.2,
			messages: [
				{
					role: "system",
					content: "你只输出可解析的 JSON，不输出任何解释文字。",
				},
				{ role: "user", content: buildDistillPrompt(article) },
			],
		}),
	});

	if (!response.ok) {
		const body = await response.text().catch(() => "");
		throw new Error(
			`${provider.provider} chat failed: ${response.status} ${body.slice(0, 240)}`
		);
	}

	const data = (await response.json()) as {
		choices?: Array<{ message?: { content?: string } }>;
	};
	const content = data.choices?.[0]?.message?.content || "";
	return normalizeUnits(extractJsonObject(content));
}

function yamlString(value: string) {
	return JSON.stringify(value);
}

function writeDistilledFile(
	packDir: string,
	article: Article,
	units: DistilledUnit[],
	provider: ProviderConfig
) {
	const distilledDir = join(packDir, "distilled");
	mkdirSync(distilledDir, { recursive: true });

	const allTags = [...new Set(units.flatMap((unit) => unit.tags))];
	const lines = [
		"---",
		`title: ${yamlString(article.title)}`,
		`source_file: ${yamlString(article.filePath)}`,
		`source_hash: ${article.contentHash}`,
		`distilled_at: ${yamlString(new Date().toISOString())}`,
		`model: ${yamlString(`${provider.provider}/${provider.model}`)}`,
		allTags.length ? `tags: [${allTags.map(yamlString).join(", ")}]` : "",
		"---",
		"",
		`# ${article.title}（知识提炼）`,
		"",
	].filter(Boolean);

	for (const unit of units) {
		lines.push(`## ${unit.question}`, "", unit.answer, "");
	}

	const outPath = join(distilledDir, distilledFileName(article));
	writeFileSync(outPath, `${lines.join("\n")}\n`);
	return outPath;
}

function ensurePackManifest(options: CliOptions) {
	const manifestPath = join(options.packDir, "pack.md");
	if (existsSync(manifestPath)) return false;

	if (!options.packId || !options.packName) {
		throw new Error(
			`目标目录还没有 pack.md，请传 --pack-id 和 --pack-name 让脚本自动创建（或手动创建后重跑）`
		);
	}

	mkdirSync(options.packDir, { recursive: true });
	const manifest = [
		"---",
		`id: ${options.packId}`,
		`name: ${yamlString(options.packName)}`,
		`description: ${yamlString(`${options.packName}：由博客文章 AI 提炼生成。`)}`,
		`scope: ${options.packId}`,
		"status: active",
		"version: 1",
		`category: ${yamlString(options.packName)}`,
		"sources:",
		"  - dir: distilled",
		"    source: distilled",
		"units:",
		"  - type: heading_qa",
		"    dir: distilled",
		"---",
		"",
		"由 `pnpm knowledge:distill` 自动创建。distilled/ 下是 AI 提炼的原子知识，可手工修订后再 `pnpm knowledge:import`。",
		"",
	].join("\n");
	writeFileSync(manifestPath, manifest);
	return true;
}

function wait(ms: number) {
	return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function main() {
	const options = parseArgs();
	const articles = options.sources
		.flatMap(listArticleFiles)
		.map(loadArticle)
		.filter((article) => options.includeDrafts || article.published)
		.slice(0, options.limit || undefined);

	if (!articles.length) {
		console.log("没有找到可提炼的文章。");
		return;
	}

	console.log(`Knowledge distill → ${options.packDir}`);
	console.log(`Articles: ${articles.length}`);

	if (options.dryRun) {
		console.log("\nDry run articles:");
		for (const article of articles) {
			const distilledPath = join(
				options.packDir,
				"distilled",
				distilledFileName(article)
			);
			const existingHash = readExistingSourceHash(distilledPath);
			const status =
				existingHash === article.contentHash && !options.force
					? "skip (unchanged)"
					: "will distill";
			console.log(`- ${article.title} [${status}]`);
		}
		return;
	}

	const provider = resolveProvider();
	console.log(`Provider: ${provider.provider}/${provider.model}`);

	const createdManifest = ensurePackManifest(options);
	if (createdManifest) console.log(`Created pack.md in ${options.packDir}`);

	let distilled = 0;
	let skipped = 0;
	let empty = 0;
	const errors: string[] = [];

	for (const article of articles) {
		const distilledPath = join(
			options.packDir,
			"distilled",
			distilledFileName(article)
		);
		const existingHash = readExistingSourceHash(distilledPath);
		if (existingHash === article.contentHash && !options.force) {
			skipped++;
			console.log(`Skip unchanged: ${article.title}`);
			continue;
		}

		try {
			const units = await distillArticle(article, provider);
			if (!units.length) {
				empty++;
				console.log(`No distillable knowledge: ${article.title}`);
				await wait(REQUEST_DELAY_MS);
				continue;
			}

			const outPath = writeDistilledFile(options.packDir, article, units, provider);
			distilled++;
			console.log(`Distilled: ${article.title} → ${units.length} units (${outPath})`);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			errors.push(`${article.filePath}: ${message}`);
			console.error(`Failed: ${article.title}`);
			console.error(message);
		}

		await wait(REQUEST_DELAY_MS);
	}

	console.log("\nDistill complete");
	console.log(`Distilled: ${distilled}`);
	console.log(`Skipped (unchanged): ${skipped}`);
	console.log(`No knowledge: ${empty}`);
	if (errors.length) console.log(`Errors: ${errors.length}`);
	console.log(
		`\n下一步：人工过一遍 ${join(options.packDir, "distilled")} 里的内容，然后运行\n  pnpm knowledge:import -- --pack ${options.packDir}`
	);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
