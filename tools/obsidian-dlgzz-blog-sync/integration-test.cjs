const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const matter = require('gray-matter');
const core = require('./.core-test.cjs');

(async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'blog-sync-test-'));
  const vault = path.join(temp, 'vault'), repo = path.join(temp, 'repo'), remote = path.join(temp, 'remote.git');
  await fs.mkdir(vault); await fs.mkdir(repo);
  const git = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: 'pipe' }).toString().trim();
  const results = [];
  const test = async (name, action) => { await action(); results.push(name); console.log('PASS', name); };
  try {
    git(temp, 'init', '--bare', remote); git(repo, 'init', '-b', 'main'); git(repo, 'config', 'user.name', 'Local Test'); git(repo, 'config', 'user.email', 'test@example.invalid');
    await fs.writeFile(path.join(repo, 'README.md'), 'Fixture'); git(repo, 'add', '.'); git(repo, 'commit', '-m', 'initial'); git(repo, 'remote', 'add', 'origin', remote); git(repo, 'push', '-u', 'origin', 'main');
    await fs.mkdir(path.join(vault, '图片')); await fs.writeFile(path.join(vault, '图片/a b.png'), Buffer.from('fixture-image-bytes'));
    const prepare = (raw, sourcePath = '任意目录/测试.md') => core.prepareArticle({ raw, sourcePath, vaultRoot: vault, repo, resolveAsset: async target => {
      try { await fs.access(path.join(vault, target)); return target; } catch { return null; }
    }, now: new Date('2026-10-26T00:00:00Z') });
    let article, receipt;
    await test('plain note without frontmatter or other plugins gets valid cover and stable slug', async () => {
      article = await prepare('这是一篇普通笔记。'); const data = matter(article.content).data;
      assert.equal(data.image, '/og.png'); assert.equal(data.title, '测试'); assert.equal(article.assets.length, 0); assert.equal(article.requiresApproval, true);
      assert.equal(article.slug, (await prepare('修改后的笔记。')).slug);
    });
    await test('wiki and standard local images produce website assets', async () => {
      const a = await prepare('![说明](图片/a%20b.png)\n\n![[图片/a b.png|400]]');
      assert.equal(a.assets.length, 1); assert.match(a.content, /image: "\/blog\/obsidian\//); assert.doesNotMatch(a.content, /!\[\[/);
      assert.match(a.content, /!\[a b\]\(\/blog\/obsidian\//);
    });
    await test('reference images resolve without COS', async () => {
      const a = await prepare('前言\n\n![说明][fig]\n\n[fig]: 图片/a%20b.png'); assert.equal(a.assets.length, 1); assert.match(a.content, /image: "\/blog\/obsidian\//);
    });
    await test('cover and membership flag survive conversion; literal MDX syntax is escaped', async () => {
      const a = await prepare('---\nblog_cover: 图片/a b.png\npremium: true\n---\n这是 {name} <Widget /> 和普通文字。');
      assert.equal(matter(a.content).data.premium, true); assert.equal(a.assets.length, 1); assert.match(a.content, /\\\{name\\\}/);
    });
    await test('code blocks stay literal and do not upload example links', async () => {
      const a = await prepare('```js\nimport x from "somewhere";\n![[not-a-real-image.png]]\n```'); assert.match(a.content, /import x from "somewhere"/); assert.equal(a.assets.length, 0);
    });
    await test('executable MDX declarations refused', async () => { await assert.rejects(prepare('export const secret = 1\n'), /MDX/); });
    await test('missing images and note embeds fail closed', async () => {
      await assert.rejects(prepare('![[missing.png]]'), /找不到图片/);
      await fs.writeFile(path.join(vault, '秘密.md'), 'Do not publish'); await assert.rejects(prepare('![[秘密.md]]'), /格式/);
    });
    await test('unsafe slugs and hidden notes rejected', async () => {
      await assert.rejects(prepare('---\nblog_slug: ../escape\n---\n正文'), /blog_slug/);
      await assert.rejects(prepare('正文', '.obsidian/data.md'), /正常目录/);
    });
    await test('symlinks cannot copy files outside vault', async () => {
      await fs.writeFile(path.join(temp, 'outside.png'), 'secret'); await fs.symlink(path.join(temp, 'outside.png'), path.join(vault, 'outside.png'));
      await assert.rejects(prepare('![[outside.png]]'), /不在当前笔记库/);
    });
    await test('moved historical note keeps slug date cover and member access', async () => {
      await fs.mkdir(path.join(repo, 'content/generated'), { recursive: true }); await fs.mkdir(path.join(repo, 'content/blog'), { recursive: true });
      await fs.writeFile(path.join(repo, 'content/generated/obsidian-blog-sync.json'), JSON.stringify({ articles: [{ sourceFile: '测试.md', slug: 'old-slug' }] }));
      await fs.writeFile(path.join(repo, 'content/blog/old-slug.zh.mdx'), '---\ntitle: 测试\nimage: /og.png\ndate: 2026-01-01\npremium: true\ncolumn: solo-company\n---\n旧文');
      const a = await prepare('新内容', '归档/测试.md'); assert.equal(a.slug, 'old-slug'); const fm = matter(a.content).data; assert.equal(fm.date, '2026-01-01'); assert.equal(fm.premium, true); assert.equal(fm.column, 'solo-company');
      git(repo, 'add', '.'); git(repo, 'commit', '-m', 'history'); git(repo, 'push', 'origin', 'main');
    });
    await test('clean main sync commit and bare-remote push preserve receipt', async () => {
      await core.syncRepository(repo, remote); article = await prepare('---\nblog_slug: new-test\n---\n正文\n\n![图](图片/a%20b.png)');
      receipt = await core.commitArticle(repo, article, async r => { receipt = r; }); assert.equal(receipt.stage, 'committed');
      receipt = await core.pushReceipt(repo, receipt, async r => { receipt = r; }); assert.equal(receipt.stage, 'pushed'); assert.equal(git(remote, 'rev-parse', 'main'), receipt.commit);
      assert.deepEqual(git(repo, 'diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD').split('\n').sort(), receipt.paths.sort());
    });
    await test('retry push creates no duplicate commit', async () => { const before = git(repo, 'rev-parse', 'HEAD'); await core.pushReceipt(repo, receipt, async () => {}); assert.equal(git(repo, 'rev-parse', 'HEAD'), before); });
    await test('dirty publishing directory refused and preserved', async () => {
      await fs.writeFile(path.join(repo, 'unrelated.txt'), 'keep'); await assert.rejects(core.syncRepository(repo, remote), /未提交/); assert.equal(await fs.readFile(path.join(repo, 'unrelated.txt'), 'utf8'), 'keep'); await fs.unlink(path.join(repo, 'unrelated.txt'));
    });
    await test('online verifier distinguishes deployment delay and full readback', async () => {
      assert.equal((await core.checkOnline('https://example.invalid', receipt, async () => ({ success: true, commit: 'old' }))).ready, false);
      const requested = []; const result = await core.checkOnline('https://example.invalid', receipt, async (url, type) => {
        requested.push(url); if (url.includes('/health/')) return { success: true, commit: receipt.commit };
        if (type === 'image') return true; if (type === true) return receipt.title;
        return { success: true, data: { slug: receipt.slug, title: receipt.title, image: receipt.image, contentHash: receipt.contentHash, contentBlocks: [{ type: 'image', url: receipt.image }] } };
      }); assert.equal(result.ready, true); assert.ok(requested.some(u => u.includes('/blog/obsidian/')));
    });
    console.log(JSON.stringify({ passed: results.length, productionWrites: 0, tests: results }));
  } finally { await fs.rm(temp, { recursive: true, force: true }); }
})().catch(e => { console.error(e); process.exitCode = 1; });
