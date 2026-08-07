/**
 * Obsidian → blog sync: convert vault notes marked `publish: blog` into safe
 * MDX under content/blog/, ready for git push (Zeabur auto-deploy).
 *
 * What the converter handles (the reasons naive copying breaks):
 * - MDX hazards: raw `<` and `{` crash MDX compilation → escaped (code blocks untouched)
 * - `<https://...>` autolinks (JSX error in MDX) → markdown links
 * - `[[wikilink|alias]]` → plain text; `![[image.png]]` → copied into
 *   public/images/blog/<slug>/ and rewritten to a site path
 * - `> [!note]` callouts → plain blockquotes; `%%comments%%` removed; tag-only lines removed
 * - Required blog frontmatter (image / date / author / published) auto-completed
 *
 * Safety:
 * - Only notes with frontmatter `publish: blog` are ever touched
 * - Never overwrites a blog file it didn't create (ownership tracked in manifest)
 * - Incremental: unchanged notes are skipped (sha1 in manifest)
 * - No git action unless --push
 *
 * Run:
 *   pnpm blog:sync -- --vault "/path/to/ObsidianFolder"
 *   pnpm blog:sync -- --note "/path/to/one-note.md" --dry-run
 *   pnpm blog:sync -- --vault ... --push
 */

import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import matter from "gray-matter";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]);
const DEFAULT_COVER = "/images/blog/post-1.png";
const MANIFEST_REL = "content/generated/obsidian-blog-sync.json";
const DEPLOY_BRANCH = "main";

type CliOptions = {
	vaults: string[];
	notes: string[];
	root: string;
	outDir: string;
	publicDir: string;
	manifestPath: string;
	locale: string;
	dryRun: boolean;
	force: boolean;
	push: boolean;
	deploy: boolean;
};

type ManifestEntry = {
	sourcePath: string;
	slug: string;
	targetFile: string;
	sourceHash: string;
	syncedAt: string;
};

type Manifest = Record<string, ManifestEntry>;

function parseArgs(): CliOptions {
	const args = process.argv.slice(2);
	const options: CliOptions = {
		vaults: [],
		notes: [],
		root: process.cwd(),
		outDir: "content/blog",
		publicDir: "public",
		manifestPath: MANIFEST_REL,
		locale: "zh",
		dryRun: false,
		force: false,
		push: false,
		deploy: false,
	};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--vault") options.vaults.push(args[++i] || "");
		if (arg === "--note") options.notes.push(args[++i] || "");
		if (arg === "--out-dir") options.outDir = args[++i] || options.outDir;
		if (arg === "--public-dir") options.publicDir = args[++i] || options.publicDir;
		if (arg === "--locale") options.locale = args[++i] || options.locale;
		if (arg === "--dry-run") options.dryRun = true;
		if (arg === "--force") options.force = true;
		if (arg === "--push") options.push = true;
		if (arg === "--deploy") options.deploy = true;
	}

	options.vaults = options.vaults.filter(Boolean).map((item) => resolve(item));
	options.notes = options.notes.filter(Boolean).map((item) => resolve(item));
	if (!options.vaults.length && !options.notes.length) {
		throw new Error("缺少 --vault <目录> 或 --note <文件>");
	}

	// deploy 模式：所有产物写进一个隔离的 main worktree，改写输出路径。
	// dry-run 下不建 worktree，只做预览。
	if (options.deploy && !options.dryRun) {
		options.root = setupDeployWorktree();
		options.outDir = join(options.root, "content/blog");
		options.publicDir = join(options.root, "public");
		options.manifestPath = join(options.root, MANIFEST_REL);
	}

	return options;
}

/**
 * 建一个基于 origin/main 的干净 worktree，博客产物只写进这里，
 * 与当前开发分支的工作区完全隔离——发布博客永远不会碰到 app 代码的 WIP。
 */
function setupDeployWorktree(): string {
	const worktreePath = resolve(process.cwd(), ".blog-deploy-worktree");
	try {
		execSync(`git worktree remove ${JSON.stringify(worktreePath)} --force`, {
			stdio: "ignore",
		});
	} catch {
		// 没有旧 worktree，忽略
	}
	execSync(`git fetch origin ${DEPLOY_BRANCH}`, { stdio: "inherit" });
	execSync(
		`git worktree add --detach ${JSON.stringify(worktreePath)} origin/${DEPLOY_BRANCH}`,
		{ stdio: "inherit" }
	);
	return worktreePath;
}

function teardownDeployWorktree(worktreePath: string) {
	try {
		execSync(`git worktree remove ${JSON.stringify(worktreePath)} --force`, {
			stdio: "ignore",
		});
	} catch {
		// 清理失败不致命，下次 setup 会先删
	}
}

function sha1(input: string) {
	return createHash("sha1").update(input).digest("hex");
}

function walkFiles(dir: string, out: string[] = []) {
	if (!existsSync(dir)) return out;
	for (const entry of readdirSync(dir)) {
		if (entry.startsWith(".")) continue;
		const fullPath = join(dir, entry);
		const stat = statSync(fullPath);
		if (stat.isDirectory()) {
			walkFiles(fullPath, out);
		} else {
			out.push(fullPath);
		}
	}
	return out;
}

/** vault 里的附件可能在任何子目录，按文件名索引一次。 */
function buildAssetIndex(vaults: string[]) {
	const index = new Map<string, string>();
	for (const vault of vaults) {
		for (const filePath of walkFiles(vault)) {
			const ext = extname(filePath).toLowerCase();
			if (!IMAGE_EXTENSIONS.has(ext)) continue;
			const name = basename(filePath);
			if (!index.has(name)) index.set(name, filePath);
		}
	}
	return index;
}

function isMarkedForBlog(data: Record<string, unknown>) {
	const value = data.publish;
	if (typeof value === "string") return value.trim().toLowerCase() === "blog";
	if (Array.isArray(value)) {
		return value.some(
			(item) => typeof item === "string" && item.trim().toLowerCase() === "blog"
		);
	}
	return false;
}

function slugify(value: string) {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9-]+/g, "-")
		.replace(/-{2,}/g, "-")
		.replace(/^-+|-+$/g, "");
}

function resolveSlug(data: Record<string, unknown>, filePath: string) {
	const explicit = typeof data.slug === "string" ? slugify(data.slug) : "";
	if (explicit) return explicit;

	const fromName = slugify(basename(filePath).replace(/\.md$/, ""));
	if (fromName.length >= 3) return fromName;

	return `post-${sha1(filePath).slice(0, 8)}`;
}

function sanitizeAssetName(name: string) {
	const ext = extname(name).toLowerCase();
	const stem = slugify(basename(name, extname(name)));
	return `${stem || `img-${sha1(name).slice(0, 8)}`}${ext}`;
}

/** 把正文切成 代码段/普通段，转换只作用于普通段——代码里的 < { 必须原样保留。 */
function splitCodeSegments(text: string) {
	const segments: Array<{ code: boolean; value: string }> = [];
	const fenceParts = text.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/g);

	for (const part of fenceParts) {
		if (/^(```|~~~)/.test(part)) {
			segments.push({ code: true, value: part });
			continue;
		}
		const inlineParts = part.split(/(`[^`\n]*`)/g);
		for (const inline of inlineParts) {
			segments.push({ code: inline.startsWith("`") && inline.endsWith("`"), value: inline });
		}
	}

	return segments;
}

type ConvertResult = {
	body: string;
	coverImage: string | null;
	warnings: string[];
	imagesCopied: Array<{ from: string; to: string }>;
};

function convertBody({
	content,
	slug,
	assetIndex,
	publicDir,
	dryRun,
}: {
	content: string;
	slug: string;
	assetIndex: Map<string, string>;
	publicDir: string;
	dryRun: boolean;
}): ConvertResult {
	const warnings: string[] = [];
	const imagesCopied: Array<{ from: string; to: string }> = [];
	let coverImage: string | null = null;

	// 1. Obsidian 注释（可跨段落，先全局删）
	let text = content.replace(/%%[\s\S]*?%%/g, "");

	const segments = splitCodeSegments(text);
	const transformed = segments.map((segment) => {
		if (segment.code) return segment.value;
		let value = segment.value;

		// 2. 图片嵌入 ![[file.png|alt]] → 拷贝进 public 并改写为站内路径
		value = value.replace(
			/!\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g,
			(_match, target: string, alias?: string) => {
				const fileName = basename(target.trim());
				const ext = extname(fileName).toLowerCase();

				if (!IMAGE_EXTENSIONS.has(ext)) {
					warnings.push(`跳过非图片嵌入 ![[${target}]]（笔记嵌入不支持）`);
					return "";
				}

				const sourcePath = assetIndex.get(fileName);
				if (!sourcePath) {
					warnings.push(`找不到图片附件 ${fileName}，已保留占位文字`);
					return alias || fileName;
				}

				const safeName = sanitizeAssetName(fileName);
				const publicRel = `/images/blog/${slug}/${safeName}`;
				const targetPath = join(publicDir, "images", "blog", slug, safeName);
				if (!dryRun) {
					mkdirSync(join(publicDir, "images", "blog", slug), { recursive: true });
					copyFileSync(sourcePath, targetPath);
				}
				imagesCopied.push({ from: sourcePath, to: targetPath });
				if (!coverImage && ext !== ".svg") coverImage = publicRel;
				return `![${alias || ""}](${publicRel})`;
			}
		);

		// 3. 双链 [[target|alias]] / [[target]] → 纯文本
		value = value.replace(/\[\[([^\]|]+?)\|([^\]]+)\]\]/g, "$2");
		value = value.replace(/\[\[([^\]]+?)\]\]/g, "$1");

		// 4. callout 标记 > [!note] → 普通引用块
		value = value.replace(/^(>\s*)\[!\w+\][-+]?\s?/gm, "$1");

		// 5. 纯标签行（#tag #tag2）删除；行首 # 会被 MDX 当标题
		value = value.replace(/^[ \t]*(#[^\s#]+[ \t]*)+$/gm, "");

		// 6. 自动链接 <https://...> 在 MDX 里是 JSX 错误 → markdown 链接
		value = value.replace(/<(https?:\/\/[^ >]+)>/g, "[$1]($1)");

		// 7. MDX 转义：裸 < 和 { } 会让整篇构建失败
		value = value.replace(/</g, "\\<");
		value = value.replace(/\{/g, "\\{");
		value = value.replace(/\}/g, "\\}");

		return value;
	});

	return {
		body: transformed.join("").replace(/\n{4,}/g, "\n\n\n").trim(),
		coverImage,
		warnings,
		imagesCopied,
	};
}

function extractDescription(body: string) {
	for (const rawLine of body.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line) continue;
		if (/^(#|>|!|\||-|\*|\d+\.|\[|`)/.test(line)) continue;
		const plain = line
			.replace(/\\([<{}])/g, "$1")
			.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
			.replace(/[*_`]/g, "")
			.trim();
		if (plain.length >= 10) return plain.slice(0, 100);
	}
	return "";
}

function normalizeDate(value: unknown) {
	if (value instanceof Date && !Number.isNaN(value.getTime())) {
		return value.toISOString().slice(0, 10);
	}
	if (typeof value === "string") {
		const match = value.trim().match(/^\d{4}-\d{2}-\d{2}/);
		if (match) return match[0];
	}
	return new Date().toISOString().slice(0, 10);
}

function yamlString(value: string) {
	return JSON.stringify(value);
}

function buildFrontmatter({
	data,
	body,
	coverImage,
	fileName,
}: {
	data: Record<string, unknown>;
	body: string;
	coverImage: string | null;
	fileName: string;
}) {
	// Obsidian 习惯：文件名即标题，找不到 title/H1 时用文件名兜底
	const title =
		(typeof data.title === "string" && data.title.trim()) ||
		body.match(/^#\s+(.+)$/m)?.[1]?.trim() ||
		fileName.trim() ||
		"未命名文章";
	const description =
		(typeof data.description === "string" && data.description.trim()) ||
		extractDescription(body) ||
		title;

	const lines = [
		"---",
		`title: ${yamlString(title)}`,
		`description: ${yamlString(description)}`,
		`image: ${yamlString(
			(typeof data.image === "string" && data.image.trim()) || coverImage || DEFAULT_COVER
		)}`,
		`date: ${yamlString(normalizeDate(data.date))}`,
		`published: ${data.published === false ? "false" : "true"}`,
		`author: ${yamlString((typeof data.author === "string" && data.author.trim()) || "admin")}`,
		`premium: ${data.premium === true ? "true" : "false"}`,
		"---",
	];

	return lines.join("\n");
}

function loadManifest(manifestPath: string): Manifest {
	if (!existsSync(manifestPath)) return {};
	try {
		return JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
	} catch {
		return {};
	}
}

function saveManifest(manifestPath: string, manifest: Manifest) {
	mkdirSync(join(manifestPath, ".."), { recursive: true });
	writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

function collectCandidateNotes(options: CliOptions) {
	const files = [
		...options.notes,
		...options.vaults.flatMap((vault) =>
			walkFiles(vault).filter((file) => extname(file) === ".md")
		),
	];

	const seen = new Set<string>();
	const notes: Array<{ filePath: string; raw: string; data: Record<string, unknown>; content: string }> = [];

	for (const filePath of files) {
		if (seen.has(filePath)) continue;
		seen.add(filePath);
		if (!existsSync(filePath)) continue;

		const raw = readFileSync(filePath, "utf8");
		let parsed: matter.GrayMatterFile<string>;
		try {
			parsed = matter(raw);
		} catch {
			continue;
		}
		const data = parsed.data as Record<string, unknown>;
		if (!isMarkedForBlog(data)) continue;

		notes.push({ filePath, raw, data, content: parsed.content });
	}

	return notes;
}

function run() {
	const options = parseArgs();
	try {
		main(options);
	} finally {
		if (options.deploy && !options.dryRun) {
			teardownDeployWorktree(options.root);
		}
	}
}

function main(options: CliOptions) {
	const notes = collectCandidateNotes(options);

	if (!notes.length) {
		console.log("没有发现标记 publish: blog 的笔记。");
		return;
	}

	const assetIndex = buildAssetIndex(options.vaults);
	const manifest = loadManifest(options.manifestPath);
	const writtenFiles: string[] = [];
	let synced = 0;
	let adopted = 0;
	let skipped = 0;

	console.log(
		`Obsidian → blog sync（候选 ${notes.length} 篇${options.deploy ? "，deploy → " + DEPLOY_BRANCH : ""}）`
	);

	for (const note of notes) {
		const sourceHash = sha1(note.raw);
		const slug = resolveSlug(note.data, note.filePath);
		const targetFile = join(options.outDir, `${slug}.${options.locale}.mdx`);
		// manifest 里存仓库相对路径（deploy 会提交到公开仓库，不能留本地绝对路径）
		const relTargetFile = join("content/blog", `${slug}.${options.locale}.mdx`);
		const existing = manifest[note.filePath];

		if (existing && existing.sourceHash === sourceHash && !options.force) {
			skipped++;
			console.log(`Skip unchanged: ${basename(note.filePath)}`);
			continue;
		}

		const converted = convertBody({
			content: note.content,
			slug,
			assetIndex,
			publicDir: options.publicDir,
			dryRun: options.dryRun,
		});
		const frontmatter = buildFrontmatter({
			data: note.data,
			body: converted.body,
			coverImage: converted.coverImage,
			fileName: basename(note.filePath, ".md"),
		});
		const output = `${frontmatter}\n\n${converted.body}\n`;

		for (const warning of converted.warnings) {
			console.warn(`  ⚠ ${basename(note.filePath)}: ${warning}`);
		}

		// 所有权保护：目标已存在但 manifest 未记录（例如之前手动发布过）
		const ownedByUs = Object.values(manifest).some(
			(entry) => entry.targetFile === relTargetFile
		);
		if (existsSync(targetFile) && !ownedByUs) {
			if (readFileSync(targetFile, "utf8").trim() === output.trim()) {
				// 内容一致 → 静默纳入跟踪，不覆盖不告警
				if (!options.dryRun) {
					manifest[note.filePath] = {
						sourcePath: note.filePath,
						slug,
						targetFile: relTargetFile,
						sourceHash,
						syncedAt: new Date().toISOString(),
					};
				}
				adopted++;
				console.log(`已存在且内容一致，纳入跟踪：${relTargetFile}`);
				continue;
			}
			console.error(
				`拒绝覆盖 ${relTargetFile}：已存在同名但内容不同的文件。请给笔记 frontmatter 换一个 slug。`
			);
			continue;
		}

		if (options.dryRun) {
			console.log(
				`Would sync: ${basename(note.filePath)} → ${relTargetFile}（图片 ${converted.imagesCopied.length} 张）`
			);
			continue;
		}

		mkdirSync(options.outDir, { recursive: true });
		writeFileSync(targetFile, output);
		writtenFiles.push(targetFile, ...converted.imagesCopied.map((item) => item.to));
		manifest[note.filePath] = {
			sourcePath: note.filePath,
			slug,
			targetFile: relTargetFile,
			sourceHash,
			syncedAt: new Date().toISOString(),
		};
		synced++;
		console.log(`Synced: ${basename(note.filePath)} → ${targetFile}`);
	}

	const changed = synced > 0 || adopted > 0;

	if (!options.dryRun && changed) {
		saveManifest(options.manifestPath, manifest);
		writtenFiles.push(options.manifestPath);
	}

	console.log(
		`\nSync complete: ${synced} synced, ${adopted} adopted, ${skipped} skipped`
	);

	if (!changed || options.dryRun) {
		if (changed && options.dryRun) console.log("dry-run：未写入、未推送。");
		return;
	}

	if (options.deploy) {
		// 一体化：在隔离的 main worktree 里提交并推送 origin/main → Zeabur 自动部署
		const wt = options.root;
		console.log(`\nDeploy → origin/${DEPLOY_BRANCH}…`);
		execSync(`git -C ${JSON.stringify(wt)} add content/blog content/generated public/images`, {
			stdio: "inherit",
		});
		execSync(
			`git -C ${JSON.stringify(wt)} commit -m ${JSON.stringify(`content: sync ${synced} new / ${adopted} tracked post(s) from obsidian`)}`,
			{ stdio: "inherit" }
		);
		execSync(`git -C ${JSON.stringify(wt)} push origin HEAD:${DEPLOY_BRANCH}`, {
			stdio: "inherit",
		});
		console.log(`已推送到 ${DEPLOY_BRANCH}，Zeabur 将自动部署上线。`);
		return;
	}

	if (options.push) {
		console.log("\nGit push（当前分支）…");
		execSync(`git add ${writtenFiles.map((file) => JSON.stringify(file)).join(" ")}`, {
			stdio: "inherit",
		});
		execSync(`git commit -m "content: sync ${synced} post(s) from obsidian"`, {
			stdio: "inherit",
		});
		execSync("git push", { stdio: "inherit" });
		console.log("已推送当前分支。");
	} else {
		console.log("已写入本地（未推送）。用 --deploy 一步发布到线上，或 --push 推当前分支。");
	}
}

try {
	run();
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
}
