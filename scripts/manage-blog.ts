/**
 * Blog admin CLI: list and delete file-based blog posts on the production
 * branch (main). Blog posts live in content/blog/*.mdx in git, so "delete"
 * means removing the file from main + push (Zeabur redeploys) — a hosted web
 * panel can't touch git-committed content, this is the correct tool.
 *
 * Mirrors the deploy-worktree isolation of sync-obsidian-to-blog.ts: all git
 * actions happen in a throwaway worktree checked out from origin/main, so the
 * dev working tree (and its WIP) is never touched.
 *
 * Run:
 *   pnpm blog:list                          # 列出 main 上所有博客文章
 *   pnpm blog:delete -- --slug my-post      # 删除一篇（可多次 --slug）
 *   pnpm blog:delete -- --slug a --slug b --dry-run
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import matter from "gray-matter";

const DEPLOY_BRANCH = "main";
const BLOG_DIR_REL = "content/blog";
const IMAGES_DIR_REL = "public/images/blog";
const MANIFEST_REL = "content/generated/obsidian-blog-sync.json";

type CliOptions = {
	mode: "list" | "delete";
	slugs: string[];
	dryRun: boolean;
	json: boolean;
};

function parseArgs(): CliOptions {
	const args = process.argv.slice(2);
	const options: CliOptions = { mode: "list", slugs: [], dryRun: false, json: false };

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--list") options.mode = "list";
		if (arg === "--delete") options.mode = "delete";
		if (arg === "--slug") options.slugs.push(args[++i] || "");
		if (arg === "--dry-run") options.dryRun = true;
		if (arg === "--json") options.json = true;
	}

	options.slugs = options.slugs.filter(Boolean);
	if (options.mode === "delete" && !options.slugs.length) {
		throw new Error("删除模式需要至少一个 --slug <slug>");
	}

	return options;
}

/** 读 main 上的文件内容，不做 checkout（比 worktree 快很多）。 */
function gitShow(path: string): string | null {
	try {
		return execSync(`git show ${JSON.stringify(`origin/${DEPLOY_BRANCH}:${path}`)}`, {
			encoding: "utf8",
			maxBuffer: 20 * 1024 * 1024,
			stdio: ["ignore", "pipe", "ignore"],
		});
	} catch {
		return null;
	}
}

function listBlogFilesOnMain(): string[] {
	const output = execSync(
		`git -c core.quotepath=false ls-tree -r --name-only origin/${DEPLOY_BRANCH} -- ${BLOG_DIR_REL}`,
		{ encoding: "utf8", maxBuffer: 10 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] }
	);
	return output
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.endsWith(".mdx") || line.endsWith(".md"));
}

function localeFromFileName(fileName: string) {
	const match = fileName.replace(/\.(mdx|md)$/, "").match(/\.([a-z]{2})$/);
	return match ? match[1] : "default";
}

/** 直接从 origin/main 读取全部博客文章元数据，无需 worktree。 */
function readPostsFromMain(): PostInfo[] {
	execSync(`git fetch origin ${DEPLOY_BRANCH}`, { stdio: "ignore" });

	const manifestRaw = gitShow(MANIFEST_REL);
	const manifest = manifestRaw
		? (JSON.parse(manifestRaw) as Record<string, { targetFile?: string }>)
		: {};
	const syncedTargets = new Set(
		Object.values(manifest)
			.map((entry) => entry.targetFile)
			.filter(Boolean)
	);

	const posts: PostInfo[] = [];
	for (const relPath of listBlogFilesOnMain()) {
		const raw = gitShow(relPath);
		if (!raw) continue;
		const parsed = matter(raw);
		const data = parsed.data as Record<string, unknown>;
		const file = basename(relPath);
		posts.push({
			slug: slugFromFileName(file),
			file,
			locale: localeFromFileName(file),
			title:
				(typeof data.title === "string" && data.title) ||
				parsed.content.match(/^#\s+(.+)$/m)?.[1] ||
				slugFromFileName(file),
			date: typeof data.date === "string" ? data.date : "",
			published: data.published !== false,
			source: syncedTargets.has(relPath) ? "obsidian" : "repo",
		});
	}

	return posts.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}

function setupWorktree(): string {
	const worktreePath = resolve(process.cwd(), ".blog-deploy-worktree");
	try {
		execSync(`git worktree remove ${JSON.stringify(worktreePath)} --force`, {
			stdio: "ignore",
		});
	} catch {
		// 无旧 worktree
	}
	execSync(`git fetch origin ${DEPLOY_BRANCH}`, { stdio: "inherit" });
	execSync(
		`git worktree add --detach ${JSON.stringify(worktreePath)} origin/${DEPLOY_BRANCH}`,
		{ stdio: "inherit" }
	);
	return worktreePath;
}

function teardownWorktree(worktreePath: string) {
	try {
		execSync(`git worktree remove ${JSON.stringify(worktreePath)} --force`, {
			stdio: "ignore",
		});
	} catch {
		// 忽略
	}
}

type PostInfo = {
	slug: string;
	file: string;
	locale: string;
	title: string;
	date: string;
	published: boolean;
	source: string;
};

function slugFromFileName(fileName: string) {
	// xhs-account.zh.mdx → xhs-account
	return fileName.replace(/\.(mdx|md)$/, "").replace(/\.[a-z]{2}$/, "");
}

function runList(options: CliOptions) {
	const posts = readPostsFromMain();

	if (options.json) {
		process.stdout.write(JSON.stringify(posts));
		return;
	}

	console.log(`\n博客文章（main，共 ${posts.length} 篇）：\n`);
	console.log("状态  来源      日期        slug");
	console.log("----  --------  ----------  --------------------------------");
	for (const post of posts) {
		const status = post.published ? "已发布" : "未发布";
		const date = (post.date || "—").padEnd(10);
		const source = post.source.padEnd(8);
		console.log(`${status}  ${source}  ${date}  ${post.slug}`);
		console.log(`                              ${post.title}`);
	}
	console.log(
		`\n删除某篇：pnpm blog:delete -- --slug <slug>（Obsidian 来源的会连同图片和同步记录一起删）`
	);
}

function matchBlogFiles(blogDir: string, slug: string) {
	if (!existsSync(blogDir)) return [];
	return readdirSync(blogDir).filter((file) => slugFromFileName(file) === slug);
}

function removeFromManifest(manifestPath: string, slug: string) {
	if (!existsSync(manifestPath)) return false;
	const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<
		string,
		{ targetFile?: string }
	>;
	let changed = false;
	for (const [key, entry] of Object.entries(manifest)) {
		if (
			entry.targetFile &&
			slugFromFileName(basename(entry.targetFile)) === slug
		) {
			delete manifest[key];
			changed = true;
		}
	}
	if (changed) {
		writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
	}
	return changed;
}

function runDelete(options: CliOptions) {
	const worktreePath = setupWorktree();
	try {
		const blogDir = join(worktreePath, BLOG_DIR_REL);
		const manifestPath = join(worktreePath, MANIFEST_REL);
		const removed: string[] = [];

		for (const slug of options.slugs) {
			const files = matchBlogFiles(blogDir, slug);
			if (!files.length) {
				console.warn(`未找到文章：${slug}`);
				continue;
			}
			for (const file of files) {
				const rel = `${BLOG_DIR_REL}/${file}`;
				console.log(`${options.dryRun ? "将删除" : "删除"}：${rel}`);
				if (!options.dryRun) {
					rmSync(join(blogDir, file), { force: true });
					removed.push(rel);
				}
			}

			const imageDir = join(worktreePath, IMAGES_DIR_REL, slug);
			if (existsSync(imageDir)) {
				console.log(`${options.dryRun ? "将删除" : "删除"}图片目录：${IMAGES_DIR_REL}/${slug}/`);
				if (!options.dryRun) {
					rmSync(imageDir, { recursive: true, force: true });
					removed.push(`${IMAGES_DIR_REL}/${slug}`);
				}
			}

			if (!options.dryRun && removeFromManifest(manifestPath, slug)) {
				removed.push(MANIFEST_REL);
			}
		}

		if (options.dryRun) {
			console.log("\ndry-run：未删除、未推送。");
			return;
		}

		if (!removed.length) {
			console.log("\n没有匹配的文章，未改动。");
			return;
		}

		console.log(`\nDeploy 删除 → origin/${DEPLOY_BRANCH}…`);
		execSync(`git -C ${JSON.stringify(worktreePath)} add -A`, { stdio: "inherit" });
		execSync(
			`git -C ${JSON.stringify(worktreePath)} commit -m ${JSON.stringify(`content: delete ${options.slugs.join(", ")} from blog`)}`,
			{ stdio: "inherit" }
		);
		execSync(
			`git -C ${JSON.stringify(worktreePath)} push origin HEAD:${DEPLOY_BRANCH}`,
			{ stdio: "inherit" }
		);
		console.log(`已从 ${DEPLOY_BRANCH} 删除并推送，Zeabur 将自动部署。`);
	} finally {
		teardownWorktree(worktreePath);
	}
}

function main() {
	const options = parseArgs();
	if (options.mode === "list") runList(options);
	else runDelete(options);
}

try {
	main();
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
}
