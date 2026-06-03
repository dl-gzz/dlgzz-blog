/**
 * Import the first Xiaohongshu open-shop knowledge pack into Postgres + pgvector.
 *
 * Default scope:
 * - 28 open-shop question outline
 * - official open-shop Markdown docs
 * - diagnostic/method prompt docs
 *
 * Run:
 *   pnpm knowledge:xhs:import
 *   pnpm knowledge:xhs:import -- --dry-run
 *   pnpm knowledge:xhs:import -- --no-embeddings
 */

import { createHash, randomUUID } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import matter from "gray-matter";
import postgres from "postgres";
import * as dotenv from "dotenv";

dotenv.config({ path: join(process.cwd(), ".env") });
dotenv.config({ path: join(process.cwd(), ".env.local"), override: true });

const DEFAULT_ROOT = "/Users/baiyang/Desktop/小红书";
const PACK_ID = "xhs-open-shop-v1";
const EMBEDDING_MODEL = "embedding-3";
const EMBEDDING_DIMENSIONS = 2048;
const MAX_CHUNK_CHARS = 1400;
const EMBEDDING_DELAY_MS = 220;

type SourceDoc = {
	source: string;
	category: string;
	filePath: string;
	metadata: Record<string, unknown>;
};

type PreparedDoc = SourceDoc & {
	id: string;
	title: string;
	rawContent: string;
	bodyContent: string;
	contentHash: string;
};

type Chunk = {
	id: string;
	documentId: string;
	chunkIndex: number;
	heading: string | null;
	content: string;
	tokenCount: number;
	metadata: Record<string, unknown>;
};

type DayQuestion = {
	day: number;
	module: string;
	title: string;
	intent: string;
	sources: string[];
	sourceQuote: string;
};

type CliOptions = {
	root: string;
	dryRun: boolean;
	noEmbeddings: boolean;
	force: boolean;
	limit?: number;
};

function parseArgs(): CliOptions {
	const args = process.argv.slice(2);
	const options: CliOptions = {
		root: process.env.XHS_KNOWLEDGE_ROOT || DEFAULT_ROOT,
		dryRun: false,
		noEmbeddings: false,
		force: false,
	};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--dry-run") options.dryRun = true;
		if (arg === "--no-embeddings") options.noEmbeddings = true;
		if (arg === "--force") options.force = true;
		if (arg === "--root") options.root = args[++i] || options.root;
		if (arg === "--limit") options.limit = Number(args[++i]);
	}

	return options;
}

function sha1(input: string) {
	return createHash("sha1").update(input).digest("hex");
}

function stableId(prefix: string, value: string) {
	return `${prefix}-${sha1(value).slice(0, 16)}`;
}

function cleanTitle(value: string) {
	return value
		.replace(/[#*_`[\]]/g, "")
		.replace(/\s+/g, " ")
		.trim();
}

function getTitle(filePath: string, content: string) {
	const parsed = matter(content);
	if (typeof parsed.data.title === "string" && parsed.data.title.trim()) {
		return cleanTitle(parsed.data.title);
	}

	const firstHeading = parsed.content.match(/^#\s+(.+)$/m)?.[1];
	if (firstHeading) return cleanTitle(firstHeading);

	return basename(filePath, ".md");
}

function normalizeMarkdownForEmbedding(content: string) {
	return content
		.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
		.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
		.replace(/```[\s\S]*?```/g, "")
		.replace(/[ \t]+\n/g, "\n")
		.replace(/\n{4,}/g, "\n\n\n")
		.trim();
}

function estimateTokenCount(text: string) {
	return Math.ceil(text.length / 1.7);
}

function splitOversizedText(text: string, maxChars = MAX_CHUNK_CHARS) {
	const chunks: string[] = [];
	let remaining = text.trim();

	while (remaining.length > maxChars) {
		let cut = remaining.lastIndexOf("\n", maxChars);
		if (cut < maxChars * 0.55) cut = remaining.lastIndexOf("。", maxChars);
		if (cut < maxChars * 0.55) cut = maxChars;

		chunks.push(remaining.slice(0, cut).trim());
		remaining = remaining.slice(cut).trim();
	}

	if (remaining) chunks.push(remaining);
	return chunks;
}

function splitSectionIntoChunks(heading: string | null, sectionContent: string) {
	const paragraphs = sectionContent
		.split(/\n{2,}/)
		.map((paragraph) => paragraph.trim())
		.filter(Boolean);

	const chunks: string[] = [];
	let current = "";

	for (const paragraph of paragraphs) {
		if (paragraph.length > MAX_CHUNK_CHARS) {
			if (current.trim()) {
				chunks.push(current.trim());
				current = "";
			}
			chunks.push(...splitOversizedText(paragraph));
			continue;
		}

		const next = current ? `${current}\n\n${paragraph}` : paragraph;
		if (next.length > MAX_CHUNK_CHARS && current.trim()) {
			chunks.push(current.trim());
			current = paragraph;
		} else {
			current = next;
		}
	}

	if (current.trim()) chunks.push(current.trim());

	return chunks.map((chunk) => {
		if (!heading) return chunk;
		if (chunk.startsWith("#")) return chunk;
		return `## ${heading}\n\n${chunk}`;
	});
}

function isMeaningfulChunk(content: string) {
	const text = content
		.replace(/[#*_`>\-|\\.[\](){}:：。；;，,\s\d]/g, "")
		.trim();
	return text.length >= 24;
}

function chunkMarkdown(doc: PreparedDoc): Chunk[] {
	if (doc.source === "xhs_28_questions") {
		return parseDayQuestions(doc).map((question, index) => {
			const content = [
				`Day ${String(question.day).padStart(2, "0")}｜${question.title}`,
				`模块：${question.module}`,
				`核心问题：${question.intent}`,
				`主要来源：${question.sources.join("、")}`,
				"用途：这是问题路由片段，正式回答时必须继续检索对应官方文档。",
			].join("\n");

			return {
				id: `${doc.id}-chunk-${String(index + 1).padStart(4, "0")}`,
				documentId: doc.id,
				chunkIndex: index,
				heading: `Day ${String(question.day).padStart(2, "0")}｜${question.title}`,
				content,
				tokenCount: estimateTokenCount(content),
				metadata: {
					...doc.metadata,
					source: doc.source,
					category: doc.category,
					title: doc.title,
					filePath: doc.filePath,
					day: question.day,
					module: question.module,
					sources: question.sources,
				},
			};
		});
	}

	const text = normalizeMarkdownForEmbedding(doc.bodyContent);
	const lines = text.split(/\r?\n/);
	const sections: Array<{ heading: string | null; content: string }> = [];
	let heading: string | null = null;
	let buffer: string[] = [];

	for (const line of lines) {
		const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
		if (headingMatch && buffer.join("\n").trim()) {
			sections.push({ heading, content: buffer.join("\n").trim() });
			heading = cleanTitle(headingMatch[2]);
			buffer = [line];
			continue;
		}

		if (headingMatch && !buffer.join("\n").trim()) {
			heading = cleanTitle(headingMatch[2]);
		}

		buffer.push(line);
	}

	if (buffer.join("\n").trim()) {
		sections.push({ heading, content: buffer.join("\n").trim() });
	}

	const chunks: Chunk[] = [];
	for (const section of sections) {
		const pieces = splitSectionIntoChunks(section.heading, section.content);
		for (const piece of pieces) {
			if (!isMeaningfulChunk(piece)) continue;

			const index = chunks.length;
			chunks.push({
				id: `${doc.id}-chunk-${String(index + 1).padStart(4, "0")}`,
				documentId: doc.id,
				chunkIndex: index,
				heading: section.heading,
				content: piece,
				tokenCount: estimateTokenCount(piece),
				metadata: {
					...doc.metadata,
					source: doc.source,
					category: doc.category,
					title: doc.title,
					filePath: doc.filePath,
				},
			});
		}
	}

	return chunks;
}

function listMarkdownFiles(dir: string) {
	if (!existsSync(dir)) return [];
	return readdirSync(dir)
		.filter((file) => file.endsWith(".md"))
		.sort((a, b) => a.localeCompare(b, "zh-Hans-CN"))
		.map((file) => join(dir, file));
}

function collectSourceDocs(root: string): SourceDoc[] {
	const docs: SourceDoc[] = [];
	const officialDir = join(root, "开店入驻-用户交付包", "02-Markdown版");

	for (const filePath of listMarkdownFiles(officialDir)) {
		docs.push({
			source: "xhs_official",
			category: "开店入驻",
			filePath,
			metadata: {
				scope: "xhs_open_shop",
				corpus: "official_docs",
				relativePath: relative(root, filePath),
			},
		});
	}

	const methodFiles: SourceDoc[] = [
		{
			source: "xhs_28_questions",
			category: "开店入驻",
			filePath: join(root, "小红书笔记规划", "开店入驻-小红书开店入驻28讲正式大纲.md"),
			metadata: {
				scope: "xhs_open_shop",
				corpus: "question_outline",
				relativePath: "小红书笔记规划/开店入驻-小红书开店入驻28讲正式大纲.md",
			},
		},
		{
			source: "lenny_method",
			category: "开店入驻",
			filePath: join(root, "小红书笔记规划", "开店入驻-28讲文档说明与方法论.md"),
			metadata: {
				scope: "xhs_open_shop",
				corpus: "methodology",
				relativePath: "小红书笔记规划/开店入驻-28讲文档说明与方法论.md",
			},
		},
		{
			source: "diagnosis_prompt",
			category: "开店入驻",
			filePath: join(root, "开店入驻-用户交付包", "03-AI诊断提示词", "00-AI诊断提示词-开店入驻.md"),
			metadata: {
				scope: "xhs_open_shop",
				corpus: "diagnosis_prompt",
				relativePath: "开店入驻-用户交付包/03-AI诊断提示词/00-AI诊断提示词-开店入驻.md",
			},
		},
	];

	for (const doc of methodFiles) {
		if (existsSync(doc.filePath)) docs.push(doc);
	}

	return docs;
}

function prepareDoc(doc: SourceDoc): PreparedDoc {
	const rawContent = readFileSync(doc.filePath, "utf8");
	const parsed = matter(rawContent);
	return {
		...doc,
		id: stableId("knowledge-doc", doc.filePath),
		title: getTitle(doc.filePath, rawContent),
		rawContent,
		bodyContent: parsed.content.trim(),
		contentHash: sha1(rawContent),
	};
}

function parseDayQuestions(outlineDoc?: PreparedDoc): DayQuestion[] {
	if (!outlineDoc) return [];

	const questions: DayQuestion[] = [];
	const lines = outlineDoc.bodyContent.split(/\r?\n/);

	for (const line of lines) {
		const match = line.match(/^\|\s*(\d{1,2})\s*\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|/);
		if (!match) continue;

		const day = Number(match[1]);
		if (!Number.isInteger(day) || day < 1 || day > 28) continue;

		const sourceText = cleanTitle(match[5]);
		questions.push({
			day,
			module: cleanTitle(match[2]),
			title: cleanTitle(match[3]),
			intent: cleanTitle(match[4]),
			sources: sourceText.split(/[、，,]/).map((item) => item.trim()).filter(Boolean),
			sourceQuote: line,
		});
	}

	return questions;
}

async function getEmbedding(text: string): Promise<number[]> {
	const apiKey = process.env.ZHIPU_API_KEY;
	if (!apiKey) {
		throw new Error("ZHIPU_API_KEY is not set");
	}

	const resp = await fetch("https://open.bigmodel.cn/api/paas/v4/embeddings", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${apiKey}`,
		},
		body: JSON.stringify({
			model: EMBEDDING_MODEL,
			input: text.slice(0, 8000),
		}),
	});

	if (!resp.ok) {
		const body = await resp.text().catch(() => "");
		throw new Error(`Zhipu embedding failed: ${resp.status} ${body.slice(0, 240)}`);
	}

	const data = (await resp.json()) as { data: Array<{ embedding: number[] }> };
	return data.data[0].embedding;
}

function wait(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
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

async function main() {
	const options = parseArgs();
	const docs = collectSourceDocs(options.root).slice(0, options.limit || undefined).map(prepareDoc);
	const outlineDoc = docs.find((doc) => doc.source === "xhs_28_questions");
	const dayQuestions = parseDayQuestions(outlineDoc);
	const allChunks = docs.flatMap(chunkMarkdown);

	console.log("XHS open-shop knowledge import");
	console.log(`Root: ${options.root}`);
	console.log(`Documents: ${docs.length}`);
	console.log(`Chunks: ${allChunks.length}`);
	console.log(`Day question units: ${dayQuestions.length}`);
	console.log(`Embeddings: ${options.noEmbeddings ? "disabled" : EMBEDDING_MODEL}`);

	if (options.dryRun) {
		console.log("\nDry run documents:");
		for (const doc of docs) {
			console.log(`- [${doc.source}] ${doc.title} (${relative(options.root, doc.filePath)})`);
		}
		return;
	}

	const sql = getSql();
	const ingestRunId = randomUUID();
	const errors: string[] = [];
	let importedDocuments = 0;
	let skippedDocuments = 0;
	let totalChunks = 0;
	let embeddedChunks = 0;

	try {
		await sql`
			insert into knowledge_packs (id, name, description, scope, status, metadata, updated_at)
			values (
				${PACK_ID},
				${"小红书开店入驻知识包"},
				${"第一版知识包：28 个开店入驻问题、官方开店入驻文档、诊断提示词和方法论。"},
				${"xhs_open_shop"},
				${"active"},
				${JSON.stringify({ version: 1, embeddingModel: EMBEDDING_MODEL, embeddingDimensions: EMBEDDING_DIMENSIONS })}::jsonb,
				now()
			)
			on conflict (id) do update set
				name = excluded.name,
				description = excluded.description,
				scope = excluded.scope,
				status = excluded.status,
				metadata = excluded.metadata,
				updated_at = now()
		`;

		await sql`
			insert into knowledge_ingest_run (
				id, knowledge_pack_id, source_root, status, total_documents, total_units, errors
			)
			values (
				${ingestRunId},
				${PACK_ID},
				${options.root},
				${"running"},
				${docs.length},
				${dayQuestions.length},
				${JSON.stringify([])}::jsonb
			)
		`;

		for (const doc of docs) {
			try {
				const existing = await sql<{ content_hash: string }[]>`
					select content_hash from knowledge_documents where id = ${doc.id}
				`;
				const unchanged = existing[0]?.content_hash === doc.contentHash;

				await sql`
					insert into knowledge_documents (
						id, source, category, title, file_path, content_hash, raw_content, status, metadata, updated_at
					)
					values (
						${doc.id},
						${doc.source},
						${doc.category},
						${doc.title},
						${doc.filePath},
						${doc.contentHash},
						${doc.rawContent},
						${"active"},
						${JSON.stringify(doc.metadata)}::jsonb,
						now()
					)
					on conflict (id) do update set
						source = excluded.source,
						category = excluded.category,
						title = excluded.title,
						file_path = excluded.file_path,
						content_hash = excluded.content_hash,
						raw_content = excluded.raw_content,
						status = excluded.status,
						metadata = excluded.metadata,
						updated_at = now()
				`;

				await sql`
					insert into knowledge_pack_documents (id, knowledge_pack_id, document_id)
					values (${`${PACK_ID}-${doc.id}`}, ${PACK_ID}, ${doc.id})
					on conflict (knowledge_pack_id, document_id) do nothing
				`;

				if (unchanged && !options.force) {
					skippedDocuments++;
					console.log(`Skip unchanged: ${doc.title}`);
					continue;
				}

				await sql`delete from knowledge_units where document_id = ${doc.id}`;
				await sql`delete from knowledge_chunks where document_id = ${doc.id}`;

				const chunks = chunkMarkdown(doc);
				for (const chunk of chunks) {
					let embedding: number[] | null = null;
					if (!options.noEmbeddings) {
						embedding = await getEmbedding(`${doc.title}\n${chunk.heading || ""}\n${chunk.content}`);
						embeddedChunks++;
						await wait(EMBEDDING_DELAY_MS);
					}

					if (embedding) {
						await sql`
							insert into knowledge_chunks (
								id, document_id, chunk_index, heading, content, token_count,
								embedding, embedding_model, embedding_dimensions, metadata
							)
							values (
								${chunk.id},
								${chunk.documentId},
								${chunk.chunkIndex},
								${chunk.heading},
								${chunk.content},
								${chunk.tokenCount},
								${JSON.stringify(embedding)}::vector,
								${EMBEDDING_MODEL},
								${EMBEDDING_DIMENSIONS},
								${JSON.stringify(chunk.metadata)}::jsonb
							)
						`;
					} else {
						await sql`
							insert into knowledge_chunks (
								id, document_id, chunk_index, heading, content, token_count,
								embedding_model, embedding_dimensions, metadata
							)
							values (
								${chunk.id},
								${chunk.documentId},
								${chunk.chunkIndex},
								${chunk.heading},
								${chunk.content},
								${chunk.tokenCount},
								${EMBEDDING_MODEL},
								${EMBEDDING_DIMENSIONS},
								${JSON.stringify(chunk.metadata)}::jsonb
							)
						`;
					}

					totalChunks++;
				}

				importedDocuments++;
				console.log(`Imported: ${doc.title} (${chunks.length} chunks)`);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				errors.push(`${doc.filePath}: ${message}`);
				console.error(`Failed: ${doc.filePath}`);
				console.error(message);
			}
		}

		if (outlineDoc) {
			await sql`delete from knowledge_units where unit_type = ${"qa_seed"} and metadata->>'scope' = ${"xhs_open_shop"}`;

			for (const question of dayQuestions) {
				await sql`
					insert into knowledge_units (
						id, document_id, unit_type, intent, title, answer, source_quote, risk_level, metadata
					)
					values (
						${`xhs-open-shop-day-${String(question.day).padStart(2, "0")}`},
						${outlineDoc.id},
						${"qa_seed"},
						${question.intent},
						${question.title},
						${`这是第 ${question.day} 讲的核心问题种子。模块：${question.module}。主要来源：${question.sources.join("、")}。回答时必须继续检索对应官方文档后再给结论。`},
						${question.sourceQuote},
						${"low"},
						${JSON.stringify({
							scope: "xhs_open_shop",
							day: question.day,
							module: question.module,
							sources: question.sources,
						})}::jsonb
					)
					on conflict (id) do update set
						document_id = excluded.document_id,
						intent = excluded.intent,
						title = excluded.title,
						answer = excluded.answer,
						source_quote = excluded.source_quote,
						metadata = excluded.metadata
				`;
			}
		}

		await sql`
			update knowledge_ingest_run set
				status = ${errors.length ? "completed_with_errors" : "completed"},
				imported_documents = ${importedDocuments},
				skipped_documents = ${skippedDocuments},
				total_chunks = ${totalChunks},
				embedded_chunks = ${embeddedChunks},
				total_units = ${dayQuestions.length},
				errors = ${JSON.stringify(errors)}::jsonb,
				completed_at = now()
			where id = ${ingestRunId}
		`;

		console.log("\nImport complete");
		console.log(`Imported documents: ${importedDocuments}`);
		console.log(`Skipped documents: ${skippedDocuments}`);
		console.log(`Inserted chunks: ${totalChunks}`);
		console.log(`Embedded chunks: ${embeddedChunks}`);
		console.log(`Question units: ${dayQuestions.length}`);
		if (errors.length) console.log(`Errors: ${errors.length}`);
	} finally {
		await sql.end();
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
