import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import matter from 'gray-matter';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { toMarkdown } from 'mdast-util-to-markdown';
import { gfm } from 'micromark-extension-gfm';
import { gfmFromMarkdown, gfmToMarkdown } from 'mdast-util-gfm';
import { compile } from '@mdx-js/mdx';
import remarkGfm from 'remark-gfm';

const exec = promisify(execFile);
const columns = new Set(['ai-practice', 'solo-company', 'independent-thinking']);
const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif']);
export const digest = (value) => createHash('sha256').update(value).digest('hex');

export async function git(repo, ...args) {
  try {
    return (await exec('git', args, { cwd: repo, timeout: 90000, maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } })).stdout.trim();
  } catch (error) {
    // Avoid displaying remote URLs or credential-bearing stderr in notices.
    throw new Error(`Git ${args[0]} 失败（${error.code || '连接异常'}）。请检查网络、Git 凭据或发布仓库状态；不会强推。`);
  }
}

export async function syncRepository(repo, expectedOrigin) {
  const origin = await git(repo, 'remote', 'get-url', 'origin');
  if (expectedOrigin && origin.replace(/\.git$/, '') !== expectedOrigin.replace(/\.git$/, '')) {
    throw new Error('发布仓库 origin 与配置的 GitHub 仓库不一致。');
  }
  if (await git(repo, 'status', '--porcelain')) throw new Error('发布目录有未提交文件，已停止。请保留现场，不要删除开发代码。');
  if (await git(repo, 'branch', '--show-current') !== 'main') throw new Error('发布目录必须使用 main 分支。');
  await git(repo, 'fetch', 'origin', 'main');
  const ahead = Number(await git(repo, 'rev-list', '--count', 'origin/main..HEAD'));
  if (ahead) throw new Error('发布目录有尚未推送的提交。请使用“核对或恢复上次发布”。');
  await git(repo, 'merge', '--ff-only', 'origin/main');
  return git(repo, 'rev-parse', 'HEAD');
}

function safeRelative(value) {
  const normalized = String(value || '').replace(/\\/g, '/');
  if (!normalized || path.posix.isAbsolute(normalized) || normalized.split('/').some(p => p === '..' || p.startsWith('.'))) {
    throw new Error('只能发布笔记库内正常目录中的 Markdown 笔记。');
  }
  return normalized;
}

async function optionalJson(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return {}; throw new Error('配置或历史文章索引无法读取。'); }
}

function httpsOrLocal(value) {
  const v = String(value || '');
  if (/^https:\/\//i.test(v)) { const u = new URL(v); if (u.username || u.password) throw new Error('图片地址不能包含登录凭据。'); return u.href; }
  if (v.startsWith('/blog/') || v.startsWith('/images/') || v === '/og.png') return v;
  return null;
}

export async function prepareArticle({ raw, sourcePath, vaultRoot, repo, resolveAsset, now = new Date() }) {
  sourcePath = safeRelative(sourcePath);
  if (!sourcePath.endsWith('.md')) throw new Error('请选择 Markdown 笔记。');
  const parsed = matter(raw);
  const fm = parsed.data;
  const legacy = await optionalJson(path.join(repo, 'content/generated/obsidian-blog-sync.json'));
  const matches = (legacy.articles || []).filter(a => a.sourceFile === path.basename(sourcePath));
  if (!fm.blog_slug && matches.length > 1) throw new Error('历史文章名称有重复，请明确填写 blog_slug。');
  const slug = String(fm.blog_slug || matches[0]?.slug || `post-${now.toISOString().slice(0, 10).replace(/-/g, '')}-${digest(sourcePath).slice(0, 8)}`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error('blog_slug 只允许小写英文、数字和短横线。');
  const relative = `content/blog/${slug}.zh.mdx`;
  let existing = null;
  try { existing = matter(await fs.readFile(path.join(repo, relative), 'utf8')).data; }
  catch (e) { if (e.code !== 'ENOENT') throw e; }
  const title = String(fm.title || path.basename(sourcePath, '.md')).trim();
  if (!title) throw new Error('文章标题不能为空。');
  const column = String(fm.blog_column || existing?.column || 'ai-practice');
  if (!columns.has(column)) throw new Error('栏目应为 ai-practice、solo-company 或 independent-thinking。');
  const subcategory = fm.blog_subcategory ?? existing?.subcategory ?? (sourcePath.includes('workbuddy教学/') ? 'workbuddy' : '');
  if (subcategory && !(column === 'ai-practice' && subcategory === 'workbuddy')) throw new Error('该子分类不属于所选栏目。');
  const premium = fm.blog_premium ?? fm.premium ?? existing?.premium ?? false;
  if (typeof premium !== 'boolean') throw new Error('premium 必须是 true 或 false。');
  const rawDate = fm.date || fm.created || existing?.date || now;
  const date = rawDate instanceof Date ? rawDate.toISOString().slice(0, 10) : String(rawDate).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) throw new Error('文章日期应为 YYYY-MM-DD。');

  // An optional old URL cache is reused, but no COS account or other plugin is required.
  const cache = (await optionalJson(path.join(vaultRoot, '.obsidian/plugins/gzh-design/data.json'))).uploadedImages || {};
  const root = await fs.realpath(vaultRoot);
  const assets = new Map();
  async function imageUrl(input) {
    const original = String(input || '').replace(/^!\[\[/, '').replace(/\]\]$/, '').trim();
    const remote = httpsOrLocal(original);
    if (remote) return remote;
    if (/^[a-z][a-z0-9+.-]*:/i.test(original)) throw new Error('图片必须是 HTTPS 地址或笔记库内图片。');
    let target; try { target = decodeURIComponent(original.split('|')[0].split('#')[0]); } catch { throw new Error('图片路径编码错误。'); }
    const resolved = await resolveAsset(target, sourcePath);
    if (!resolved) throw new Error(`找不到图片：${target}`);
    const file = await fs.realpath(path.resolve(root, resolved));
    if (!file.startsWith(root + path.sep)) throw new Error('图片不在当前笔记库内，已停止。');
    safeRelative(path.relative(root, file));
    const extension = path.extname(file).toLowerCase();
    if (!imageExtensions.has(extension)) throw new Error(`暂不支持这种图片格式：${extension}，请换用 PNG/JPEG/WebP/GIF/AVIF。`);
    const stat = await fs.stat(file);
    if (stat.size > 20 * 1024 * 1024) throw new Error('单张图片超过 20 MB，请先压缩。');
    const bytes = await fs.readFile(file);
    const old = cache[createHash('md5').update(bytes).digest('hex')];
    const cached = httpsOrLocal(typeof old === 'string' ? old : old?.url || old?.publicUrl);
    if (cached) return cached;
    const relativePath = `public/blog/obsidian/${digest(bytes)}${extension}`;
    assets.set(relativePath, bytes);
    return '/' + relativePath.slice('public/'.length);
  }

  const tree = fromMarkdown(parsed.content, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] });
  const definitions = new Map(tree.children.filter(n => n.type === 'definition').map(n => [n.identifier, n]));
  tree.children = tree.children.filter(n => n.type !== 'definition');
  let firstImage = '';
  async function walk(node) {
    if (node.type === 'imageReference' || node.type === 'linkReference') {
      const def = definitions.get(node.identifier);
      if (!def) throw new Error('文章引用链接缺少定义。');
      node.type = node.type === 'imageReference' ? 'image' : 'link'; node.url = def.url; node.title = def.title;
    }
    if (node.type === 'image') {
      node.url = await imageUrl(node.url);
      if (!firstImage) firstImage = node.url;
    }
    if (node.type === 'html') {
      node.type = 'text';
      node.value = node.value.replace(/<!--[\s\S]*?-->/g, '');
    }
    if (!node.children) return;
    const children = [];
    for (const child of node.children) {
      if (child.type !== 'text') {
        await walk(child);
        if (child.type === 'link' && !/^(https?:\/\/|mailto:|#)/i.test(child.url)) children.push(...child.children);
        else children.push(child);
        continue;
      }
      const text = child.value.replace(/%%[\s\S]*?%%/g, '');
      const pattern = /!\[\[([^\]]+)\]\]|\[\[([^\]]+)\]\]/g;
      let offset = 0;
      for (const match of text.matchAll(pattern)) {
        if (match.index > offset) children.push({ type: 'text', value: text.slice(offset, match.index) });
        if (match[1]) {
          const url = await imageUrl(match[1]);
          if (!firstImage) firstImage = url;
          children.push({ type: 'image', url, alt: path.basename(match[1].split('|')[0]).replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '), title: null });
        } else children.push({ type: 'text', value: match[2].split('|').pop().split('#')[0] });
        offset = match.index + match[0].length;
      }
      if (offset < text.length) children.push({ type: 'text', value: text.slice(offset) });
    }
    node.children = children;
  }
  await walk(tree);
  const explicitCover = fm.blog_cover || fm.cover || fm.image;
  const cover = explicitCover ? await imageUrl(explicitCover) : existing?.image || firstImage || '/og.png';
  // A leading title is already rendered by both readers.
  if (tree.children[0]?.type === 'heading' && tree.children[0].depth === 1 && tree.children[0].children.map(n => n.value || '').join('') === title) tree.children.shift();
  // Preserve historical convention: a leading standalone cover is not duplicated in the body.
  if (tree.children[0]?.type === 'paragraph' && tree.children[0].children.length === 1 && tree.children[0].children[0].type === 'image' && tree.children[0].children[0].url === cover) tree.children.shift();
  const body = toMarkdown(tree, { extensions: [gfmToMarkdown()], bullet: '-', emphasis: '*', strong: '*', rule: '-', ruleRepetition: 3, ruleSpaces: false,
    unsafe: [{ character: '{', inConstruct: 'phrasing' }, { character: '}', inConstruct: 'phrasing' }, { character: '<', inConstruct: 'phrasing' }] });
  // Compile before any commit. This catches expressions/unsupported MDX in an ordinary note.
  await compile(body, { remarkPlugins: [remarkGfm, function plainMarkdownOnly() { return tree => {
    function inspect(node) {
      if (['mdxjsEsm', 'mdxFlowExpression', 'mdxTextExpression'].includes(node.type)) throw new Error('正文包含可执行 MDX 声明，请将代码放入代码块后再发布。');
      for (const child of node.children || []) inspect(child);
    }
    inspect(tree);
  }; }] });
  const description = String(fm.description || existing?.description || body.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/[#*_`>]/g, '').split(/\n\s*\n/).find(s => s.trim().length >= 20)?.replace(/\s+/g, ' ').trim().slice(0, 150) || title);
  const header = { title, description, image: cover, date, published: true, author: String(existing?.author || 'mksaas'), column, ...(subcategory ? { subcategory } : {}), premium };
  const content = '---\n' + Object.entries(header).map(([k,v]) => `${k}: ${JSON.stringify(v)}`).join('\n') + '\n---\n\n' + body;
  return { title, slug, relative, content, assets: [...assets].map(([relative, bytes]) => ({ relative, bytes })),
    image: cover, premium, sourcePath, sourceHash: digest(raw), contentHash: digest(content), existing: !!existing,
    requiresApproval: !['已发布', '已发送到公众号'].includes(String(fm.status)) && fm.blog_publish !== true };
}

export async function commitArticle(repo, article, record) {
  if (await git(repo, 'status', '--porcelain')) throw new Error('发布目录不是干净状态，未覆盖文件。');
  const paths = [article.relative, ...article.assets.map(a => a.relative)];
  for (const entry of [{ relative: article.relative, bytes: article.content }, ...article.assets]) {
    const file = path.join(repo, entry.relative);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, entry.bytes);
  }
  await git(repo, 'add', '--', ...paths);
  const changed = await git(repo, 'diff', '--cached', '--name-only');
  if (changed) await git(repo, 'commit', '-m', `content: sync ${article.slug}`);
  const commit = await git(repo, 'rev-parse', 'HEAD');
  const receipt = { slug: article.slug, title: article.title, image: article.image, premium: article.premium,
    sourcePath: article.sourcePath, sourceHash: article.sourceHash, contentHash: article.contentHash,
    commit, paths, stage: 'committed', updatedAt: new Date().toISOString() };
  await record(receipt); // Durable record before push: retry never creates a second content commit.
  return receipt;
}

export async function pushReceipt(repo, receipt, record) {
  if (await git(repo, 'status', '--porcelain')) throw new Error('发布目录有未提交改动，未重推。');
  if (await git(repo, 'rev-parse', 'HEAD') !== receipt.commit) throw new Error('发布目录版本已变化，需检查上次发布记录。');
  await git(repo, 'push', 'origin', 'HEAD:main');
  receipt = { ...receipt, stage: 'pushed', updatedAt: new Date().toISOString() };
  await record(receipt);
  return receipt;
}

export async function checkOnline(baseUrl, receipt, get) {
  const base = baseUrl.replace(/\/$/, '');
  const build = await get(`${base}/api/health/build`);
  if (!build.success) return { ready: false, reason: '网站尚未完成部署' };
  const detail = await get(`${base}/api/mp/posts/${encodeURIComponent(receipt.slug)}?locale=zh`);
  if (!detail.success || detail.data?.slug !== receipt.slug || detail.data?.title !== receipt.title || detail.data?.image !== receipt.image) return { ready: false, reason: '文章接口内容还未对齐' };
  if (detail.data.contentHash !== receipt.contentHash) return { ready: false, reason: '线上正文版本尚未与本次笔记对齐' };
  const website = await get(`${base}/zh/blog/${encodeURIComponent(receipt.slug)}`, true);
  if (!website.includes(receipt.title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')) && !website.includes(receipt.title)) return { ready: false, reason: '网站文章页尚未显示对应标题' };
  const urls = [receipt.image, ...(detail.data.contentBlocks || []).filter(b => b.type === 'image').map(b => b.url)];
  for (const url of new Set(urls)) await get(new URL(url, base).href, 'image');
  return { ready: true, deployedCommit: build.commit, articleUrl: `${base}/zh/blog/${receipt.slug}`, apiUrl: `${base}/api/mp/posts/${receipt.slug}?locale=zh`, blocks: detail.data.contentBlocks?.length || 0 };
}
