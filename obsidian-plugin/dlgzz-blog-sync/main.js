/*
 * Dlgzz Blog Sync — thin Obsidian shell around scripts/sync-obsidian-to-blog.ts.
 * The conversion logic lives in the blog repo; this plugin only marks notes and
 * triggers the sync command, so script upgrades never require a plugin update.
 */
const {
  Plugin,
  PluginSettingTab,
  Setting,
  Notice,
  Modal,
  ItemView,
} = require('obsidian');
const { execFile } = require('child_process');

const VIEW_TYPE_BLOG_ADMIN = 'dlgzz-blog-admin';

const DEFAULT_SETTINGS = {
  repoPath: '/Users/baiyang/Desktop/程序/dlgzz-blog-main',
  syncCommand: 'npx tsx scripts/sync-obsidian-to-blog.ts',
};

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function suggestSlug(name) {
  return String(name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

class SlugModal extends Modal {
  constructor(app, defaultSlug, onSubmit, onCancel) {
    super(app);
    this.defaultSlug = defaultSlug;
    this.onSubmit = onSubmit;
    this.onCancel = onCancel;
    this.submitted = false;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h3', { text: '发布到博客' });
    contentEl.createEl('p', {
      text: '给这篇文章一个英文 slug（博客 URL 和文件名）。留空会退化成哈希文件名。',
    });

    const input = contentEl.createEl('input', { type: 'text' });
    input.style.width = '100%';
    input.value = this.defaultSlug || '';
    input.placeholder = 'e.g. xhs-quote-tips';
    input.focus();

    const submit = () => {
      const slug = suggestSlug(input.value);
      this.submitted = true;
      this.close();
      this.onSubmit(slug);
    };

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') submit();
    });

    const buttonRow = contentEl.createEl('div');
    buttonRow.style.marginTop = '12px';
    buttonRow.style.textAlign = 'right';
    const button = buttonRow.createEl('button', { text: '标记并同步' });
    button.addEventListener('click', submit);
  }

  onClose() {
    this.contentEl.empty();
    // 用户直接关闭而没提交 → 通知调用方解除 busy 状态
    if (!this.submitted && this.onCancel) this.onCancel();
  }
}

class OutputModal extends Modal {
  constructor(app, title, output) {
    super(app);
    this.title = title;
    this.output = output;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h3', { text: this.title });
    const pre = contentEl.createEl('pre');
    pre.style.maxHeight = '60vh';
    pre.style.overflow = 'auto';
    pre.style.whiteSpace = 'pre-wrap';
    pre.style.fontSize = '12px';
    pre.setText(this.output || '(无输出)');
  }

  onClose() {
    this.contentEl.empty();
  }
}

/** 博客后台：常驻右侧边栏面板，可搜索、可勾选、可单删/批删。 */
class BlogAdminView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.posts = [];
    this.selected = new Set();
    this.filter = '';
  }

  getViewType() {
    return VIEW_TYPE_BLOG_ADMIN;
  }

  getDisplayText() {
    return '博客后台';
  }

  getIcon() {
    return 'layout-list';
  }

  async onOpen() {
    // 切换笔记时刷新「发布当前笔记」区域
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', () => this.updateActiveNote())
    );
    this.registerEvent(
      this.app.workspace.on('file-open', () => this.updateActiveNote())
    );
    this.load();
  }

  async onClose() {
    this.contentEl.empty();
  }

  activeNoteInfo() {
    const file = this.app.workspace.getActiveFile();
    if (!file || file.extension !== 'md') return null;
    const cache = this.app.metadataCache.getFileCache(file);
    const fm = (cache && cache.frontmatter) || {};
    const marked =
      fm.publish === 'blog' ||
      (Array.isArray(fm.publish) && fm.publish.includes('blog'));
    return {
      file,
      marked,
      slug: typeof fm.slug === 'string' ? fm.slug.trim() : '',
    };
  }

  /** 扫全库 frontmatter，找出所有 publish: blog 的笔记（走 Obsidian 缓存，很快）。 */
  markedNotes() {
    return this.app.vault
      .getMarkdownFiles()
      .map((file) => {
        const cache = this.app.metadataCache.getFileCache(file);
        const fm = (cache && cache.frontmatter) || {};
        const marked =
          fm.publish === 'blog' ||
          (Array.isArray(fm.publish) && fm.publish.includes('blog'));
        if (!marked) return null;
        return {
          file,
          slug: typeof fm.slug === 'string' ? fm.slug.trim() : '',
        };
      })
      .filter(Boolean)
      .sort((a, b) =>
        a.file.basename.localeCompare(b.file.basename, 'zh-Hans-CN')
      );
  }

  updateActiveNote() {
    if (!this.noteLabelEl || !this.publishBtn) return;
    const info = this.activeNoteInfo();
    if (!info) {
      this.noteLabelEl.setText('未打开 Markdown 笔记');
      this.publishBtn.disabled = true;
      return;
    }
    const state = info.marked
      ? `已标记${info.slug ? ` · ${info.slug}` : ''}`
      : '未标记（发布时会让你填 slug）';
    this.noteLabelEl.setText(`${info.file.basename} · ${state}`);
    this.publishBtn.disabled = Boolean(this.busy);
  }

  load() {
    this.loading = true;
    this.render();
    this.plugin.execInRepo(
      `${this.plugin.manageCommand()} --list --json`,
      (error, output) => {
        this.loading = false;
        if (error) {
          this.error = output || String(error);
          this.render();
          return;
        }
        const start = output.indexOf('[');
        const end = output.lastIndexOf(']');
        try {
          this.posts = JSON.parse(output.slice(start, end + 1));
          this.error = null;
        } catch (e) {
          this.error = `无法解析列表输出：\n${output}`;
        }
        this.selected.clear();
        this.render();
      }
    );
  }

  visiblePosts() {
    const query = this.filter.trim().toLowerCase();
    if (!query) return this.posts;
    return this.posts.filter(
      (post) =>
        post.slug.toLowerCase().includes(query) ||
        String(post.title).toLowerCase().includes(query)
    );
  }

  confirmDelete(slugs) {
    if (!slugs.length) return;
    const list = slugs.join('、');
    new ConfirmModal(
      this.app,
      `删除 ${slugs.length} 篇文章`,
      `确定从线上删除：${list}？\n\n会从 main 删除文件并重新部署，无法通过界面撤销（可用 git 恢复）。`,
      () => {
        const args = slugs.map((slug) => `--slug ${shellQuote(slug)}`).join(' ');
        new Notice(`删除 ${slugs.length} 篇中…`);
        this.busy = true;
        this.render();
        this.plugin.execInRepo(
          `${this.plugin.manageCommand()} --delete ${args}`,
          (error, output) => {
            this.busy = false;
            if (error) {
              new Notice('❌ 删除失败', 8000);
              new OutputModal(this.app, '删除失败', output || String(error)).open();
              this.render();
              return;
            }
            new Notice(`✅ 已删除 ${slugs.length} 篇，Zeabur 部署中`, 7000);
            this.load();
          }
        );
      }
    ).open();
  }

  render() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl('h3', { text: '博客后台' });

    // ── 发布区 ──────────────────────────────
    const publishBox = contentEl.createEl('div');
    publishBox.style.padding = '8px';
    publishBox.style.marginBottom = '10px';
    publishBox.style.borderRadius = '6px';
    publishBox.style.background = 'var(--background-secondary)';

    this.noteLabelEl = publishBox.createEl('div');
    this.noteLabelEl.style.fontSize = '11px';
    this.noteLabelEl.style.opacity = '0.75';
    this.noteLabelEl.style.marginBottom = '6px';
    this.noteLabelEl.style.overflow = 'hidden';
    this.noteLabelEl.style.textOverflow = 'ellipsis';
    this.noteLabelEl.style.whiteSpace = 'nowrap';

    const btnRow = publishBox.createEl('div');
    btnRow.style.display = 'flex';
    btnRow.style.gap = '6px';
    btnRow.style.flexWrap = 'wrap';

    this.publishBtn = btnRow.createEl('button', { text: '发布当前笔记' });
    this.publishBtn.classList.add('mod-cta');
    this.publishBtn.addEventListener('click', () => {
      this.busy = true;
      this.updateActiveNote();
      this.plugin.publishCurrent(() => {
        this.busy = false;
        this.load();
      });
    });

    const markBtn = btnRow.createEl('button', { text: '仅标记' });
    markBtn.setAttribute('title', '写入标记但不上线，之后用「发布全部已标记」批量发');
    markBtn.addEventListener('click', () => {
      this.plugin.markCurrent(() => {
        // 等 Obsidian 元数据缓存更新后刷新面板
        setTimeout(() => this.render(), 400);
      });
    });

    const marked = this.markedNotes();
    const publishAll = btnRow.createEl('button', {
      text: `发布全部已标记 (${marked.length})`,
    });
    publishAll.disabled = marked.length === 0;
    publishAll.addEventListener('click', () => {
      const names = marked.map((note) => note.file.basename).join('\n');
      new ConfirmModal(
        this.app,
        `发布 ${marked.length} 篇已标记笔记`,
        `将发布并上线：\n${names}\n\n未改动的笔记会自动跳过。`,
        () => {
          this.busy = true;
          this.plugin.runSync({
            mode: 'deploy',
            onDone: () => {
              this.busy = false;
              this.load();
            },
          });
        },
        '确认发布'
      ).open();
    });

    this.updateActiveNote();

    // ── 已标记笔记清单（可折叠）──────────────
    const details = publishBox.createEl('details');
    details.style.marginTop = '8px';
    details.open = Boolean(this.markedOpen);
    details.addEventListener('toggle', () => {
      this.markedOpen = details.open;
    });
    const summary = details.createEl('summary', {
      text: `已标记笔记 (${marked.length})`,
    });
    summary.style.fontSize = '11px';
    summary.style.cursor = 'pointer';
    summary.style.opacity = '0.8';

    if (!marked.length) {
      const hint = details.createEl('div', {
        text: '还没有笔记标记 publish: blog',
      });
      hint.style.fontSize = '11px';
      hint.style.opacity = '0.6';
      hint.style.padding = '4px 0';
    }

    const liveSlugs = new Set(this.posts.map((post) => post.slug));
    for (const note of marked) {
      const item = details.createEl('div');
      item.style.display = 'flex';
      item.style.justifyContent = 'space-between';
      item.style.gap = '6px';
      item.style.fontSize = '11px';
      item.style.padding = '3px 0';
      item.style.cursor = 'pointer';

      const name = item.createEl('span', { text: note.file.basename });
      name.style.overflow = 'hidden';
      name.style.textOverflow = 'ellipsis';
      name.style.whiteSpace = 'nowrap';

      const state = item.createEl('span', {
        text: !note.slug
          ? '缺 slug'
          : liveSlugs.has(note.slug)
            ? '已上线'
            : '未上线',
      });
      state.style.flexShrink = '0';
      state.style.opacity = '0.65';

      item.addEventListener('click', () => {
        this.app.workspace.openLinkText(note.file.path, '', false);
      });
    }
    // ────────────────────────────────────────

    if (this.loading) {
      contentEl.createEl('p', { text: '读取线上文章列表中…' });
      return;
    }
    if (this.error) {
      contentEl.createEl('p', { text: '读取失败：' });
      const pre = contentEl.createEl('pre');
      pre.style.whiteSpace = 'pre-wrap';
      pre.style.fontSize = '12px';
      pre.setText(this.error);
      return;
    }

    const search = contentEl.createEl('input', { type: 'text' });
    search.placeholder = '搜索标题或 slug…';
    search.style.width = '100%';
    search.style.marginBottom = '8px';
    search.value = this.filter;
    search.addEventListener('input', (event) => {
      this.filter = event.target.value;
      this.renderRows();
    });

    this.summaryEl = contentEl.createEl('div');
    this.summaryEl.style.fontSize = '12px';
    this.summaryEl.style.opacity = '0.75';
    this.summaryEl.style.marginBottom = '6px';

    this.rowsEl = contentEl.createEl('div');
    this.rowsEl.style.overflowY = 'auto';
    this.rowsEl.style.borderTop = '1px solid var(--background-modifier-border)';

    const footer = contentEl.createEl('div');
    footer.style.display = 'flex';
    footer.style.justifyContent = 'space-between';
    footer.style.alignItems = 'center';
    footer.style.gap = '8px';
    footer.style.flexWrap = 'wrap';
    footer.style.marginTop = '12px';

    const left = footer.createEl('div');
    const refresh = left.createEl('button', { text: '刷新' });
    refresh.addEventListener('click', () => this.load());

    const right = footer.createEl('div');
    this.batchBtn = right.createEl('button', { text: '删除所选' });
    this.batchBtn.classList.add('mod-warning');
    this.batchBtn.addEventListener('click', () =>
      this.confirmDelete([...this.selected])
    );

    this.renderRows();
  }

  renderRows() {
    if (!this.rowsEl) return;
    this.rowsEl.empty();
    const posts = this.visiblePosts();

    for (const post of posts) {
      const row = this.rowsEl.createEl('div');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.gap = '10px';
      row.style.padding = '8px 4px';
      row.style.borderBottom = '1px solid var(--background-modifier-border)';

      const box = row.createEl('input', { type: 'checkbox' });
      box.checked = this.selected.has(post.slug);
      box.addEventListener('change', () => {
        if (box.checked) this.selected.add(post.slug);
        else this.selected.delete(post.slug);
        this.updateSummary();
      });

      const main = row.createEl('div');
      main.style.flex = '1';
      main.style.minWidth = '0';

      const titleEl = main.createEl('div', { text: post.title });
      titleEl.style.fontWeight = '500';
      titleEl.style.overflow = 'hidden';
      titleEl.style.textOverflow = 'ellipsis';
      titleEl.style.whiteSpace = 'nowrap';

      const meta = main.createEl('div');
      meta.style.fontSize = '11px';
      meta.style.opacity = '0.7';
      const badge = post.source === 'obsidian' ? 'Obsidian' : '仓库';
      const state = post.published ? '' : ' · 未发布';
      meta.setText(`${post.slug} · ${post.date || '无日期'} · ${badge}${state}`);

      const del = row.createEl('button', { text: '删除' });
      del.style.flexShrink = '0';
      del.style.padding = '2px 8px';
      del.style.fontSize = '11px';
      del.addEventListener('click', () => this.confirmDelete([post.slug]));
    }

    if (!posts.length) {
      const empty = this.rowsEl.createEl('p', { text: '没有匹配的文章' });
      empty.style.opacity = '0.6';
    }

    this.updateSummary();
  }

  updateSummary() {
    if (this.summaryEl) {
      this.summaryEl.setText(
        `共 ${this.posts.length} 篇 · 显示 ${this.visiblePosts().length} · 已选 ${this.selected.size}`
      );
    }
    if (this.batchBtn) {
      this.batchBtn.disabled = this.selected.size === 0 || this.busy;
      this.batchBtn.setText(
        this.selected.size ? `删除所选 (${this.selected.size})` : '删除所选'
      );
    }
  }
}

class ConfirmModal extends Modal {
  constructor(app, title, message, onConfirm, confirmLabel) {
    super(app);
    this.title = title;
    this.message = message;
    this.onConfirm = onConfirm;
    this.confirmLabel = confirmLabel || '确认删除';
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h3', { text: this.title });
    for (const line of this.message.split('\n')) {
      contentEl.createEl('p', { text: line });
    }
    const row = contentEl.createEl('div');
    row.style.marginTop = '12px';
    row.style.textAlign = 'right';
    const cancel = row.createEl('button', { text: '取消' });
    cancel.style.marginRight = '8px';
    cancel.addEventListener('click', () => this.close());
    const confirm = row.createEl('button', { text: this.confirmLabel });
    confirm.classList.add(
      this.confirmLabel === '确认删除' ? 'mod-warning' : 'mod-cta'
    );
    confirm.addEventListener('click', () => {
      this.close();
      this.onConfirm();
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

class BlogSyncSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('博客仓库路径')
      .setDesc('dlgzz-blog 本地仓库的绝对路径（同步脚本在这里运行）')
      .addText((text) =>
        text.setValue(this.plugin.settings.repoPath).onChange(async (value) => {
          this.plugin.settings.repoPath = value.trim();
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('同步命令')
      .setDesc('在仓库目录里执行的命令（一般不用改）')
      .addText((text) =>
        text.setValue(this.plugin.settings.syncCommand).onChange(async (value) => {
          this.plugin.settings.syncCommand = value.trim() || DEFAULT_SETTINGS.syncCommand;
          await this.plugin.saveSettings();
        })
      );

    containerEl.createEl('p', {
      text: '发布 = 一步到线上：文章经隔离的 main worktree 直接推送 origin/main，Zeabur 自动部署。不会碰仓库里的其它改动。',
      cls: 'setting-item-description',
    });
  }
}

class DlgzzBlogSyncPlugin extends Plugin {
  async onload() {
    await this.loadSettings();

    this.addCommand({
      id: 'publish-current-note',
      name: '发布当前笔记并上线（标记 + 同步 + 部署）',
      callback: () => this.publishCurrent(),
    });

    this.addCommand({
      id: 'publish-all-marked',
      name: '发布所有已标记笔记并上线',
      callback: () => this.runSync({ mode: 'deploy' }),
    });

    this.addCommand({
      id: 'sync-dry-run',
      name: '预览（dry-run，不写不推）',
      callback: () => this.runSync({ mode: 'dryrun' }),
    });

    this.registerView(
      VIEW_TYPE_BLOG_ADMIN,
      (leaf) => new BlogAdminView(leaf, this)
    );

    this.addCommand({
      id: 'mark-current-note',
      name: '标记当前笔记（加入待发布，不上线）',
      callback: () => this.markCurrent(),
    });

    this.addCommand({
      id: 'open-blog-admin',
      name: '打开博客后台（侧边栏）',
      callback: () => this.activateBlogAdmin(),
    });

    this.addRibbonIcon('layout-list', '博客后台', () => this.activateBlogAdmin());

    this.addSettingTab(new BlogSyncSettingTab(this.app, this));
  }

  /** 在右侧边栏打开（已打开则聚焦）。 */
  async activateBlogAdmin() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_BLOG_ADMIN)[0];
    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      if (!leaf) {
        new Notice('无法打开侧边栏');
        return;
      }
      await leaf.setViewState({ type: VIEW_TYPE_BLOG_ADMIN, active: true });
    }
    workspace.revealLeaf(leaf);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  getVaultBasePath() {
    const adapter = this.app.vault.adapter;
    return typeof adapter.getBasePath === 'function' ? adapter.getBasePath() : null;
  }

  async publishCurrent(onDone) {
    const finish = (error) => {
      if (onDone) onDone(error || null);
    };
    const file = this.app.workspace.getActiveFile();
    if (!file || file.extension !== 'md') {
      new Notice('请先打开一篇 Markdown 笔记');
      finish(new Error('no active markdown note'));
      return;
    }

    const cache = this.app.metadataCache.getFileCache(file);
    const frontmatter = (cache && cache.frontmatter) || {};
    const marked =
      frontmatter.publish === 'blog' ||
      (Array.isArray(frontmatter.publish) && frontmatter.publish.includes('blog'));
    const existingSlug =
      typeof frontmatter.slug === 'string' && frontmatter.slug.trim()
        ? frontmatter.slug.trim()
        : '';

    const notePath = this.absolutePathOf(file);

    if (marked && existingSlug) {
      this.runSync({ mode: 'deploy', notePath, onDone });
      return;
    }

    new SlugModal(
      this.app,
      existingSlug || suggestSlug(file.basename),
      async (slug) => {
        await this.app.fileManager.processFrontMatter(file, (fm) => {
          fm.publish = 'blog';
          if (slug) fm.slug = slug;
        });
        new Notice(`已标记 publish: blog${slug ? `（slug: ${slug}）` : ''}`);
        this.runSync({ mode: 'deploy', notePath, onDone });
      },
      () => finish(new Error('cancelled'))
    ).open();
  }

  /** 只标记（写入 publish: blog + slug），不发布。 */
  async markCurrent(onDone) {
    const finish = (error) => {
      if (onDone) onDone(error || null);
    };
    const file = this.app.workspace.getActiveFile();
    if (!file || file.extension !== 'md') {
      new Notice('请先打开一篇 Markdown 笔记');
      finish(new Error('no active markdown note'));
      return;
    }
    const cache = this.app.metadataCache.getFileCache(file);
    const fm = (cache && cache.frontmatter) || {};
    const marked =
      fm.publish === 'blog' ||
      (Array.isArray(fm.publish) && fm.publish.includes('blog'));
    const existingSlug =
      typeof fm.slug === 'string' && fm.slug.trim() ? fm.slug.trim() : '';

    if (marked && existingSlug) {
      new Notice(`这篇已标记过了（slug: ${existingSlug}）`);
      finish(null);
      return;
    }

    new SlugModal(
      this.app,
      existingSlug || suggestSlug(file.basename),
      async (slug) => {
        await this.app.fileManager.processFrontMatter(file, (f) => {
          f.publish = 'blog';
          if (slug) f.slug = slug;
        });
        new Notice(`✅ 已标记，等待发布${slug ? `（slug: ${slug}）` : ''}`);
        finish(null);
      },
      () => finish(new Error('cancelled'))
    ).open();
  }

  absolutePathOf(file) {
    const base = this.getVaultBasePath();
    return base ? require('path').join(base, file.path) : null;
  }

  manageCommand() {
    return this.settings.syncCommand.replace(
      'sync-obsidian-to-blog.ts',
      'manage-blog.ts'
    );
  }

  execInRepo(command, onDone) {
    const repoPath = this.settings.repoPath;
    if (!repoPath) {
      new Notice('请先在插件设置里填写博客仓库路径');
      return;
    }
    // 走 login shell，避免 GUI 应用的 PATH 里没有 node/npx/pnpm
    execFile(
      '/bin/zsh',
      ['-lc', command],
      { cwd: repoPath, maxBuffer: 10 * 1024 * 1024, timeout: 5 * 60 * 1000 },
      (error, stdout, stderr) => {
        const output = [stdout, stderr].filter(Boolean).join('\n').trim();
        onDone(error, output);
      }
    );
  }

  runSync({ mode, notePath, onDone }) {
    const dryRun = mode === 'dryrun';
    const deploy = mode === 'deploy';
    const vaultPath = this.getVaultBasePath();
    if (!vaultPath) {
      new Notice('无法获取 vault 路径（仅支持桌面端）');
      return;
    }

    // 单篇发布只处理这一篇（--note）；批量/预览扫全库（--vault）
    const target = notePath
      ? `--note ${shellQuote(notePath)}`
      : `--vault ${shellQuote(vaultPath)}`;
    const parts = [this.settings.syncCommand, target];
    if (dryRun) parts.push('--dry-run');
    if (deploy) parts.push('--deploy');

    new Notice(dryRun ? '预览中…' : '发布并上线中…（约需十几秒）');

    this.execInRepo(parts.join(' '), (error, output) => {
      if (error) {
        console.error('[dlgzz-blog-sync]', error, output);
        new Notice('❌ 同步失败，点开查看详情', 8000);
        new OutputModal(this.app, '同步失败', output || String(error)).open();
        if (onDone) onDone(error);
        return;
      }

      const deployed = output.includes('Zeabur 将自动部署');
      const nothing = /Sync complete: 0 synced/.test(output) || output.includes('没有发现标记');
      const summary =
        (output.match(/Sync complete: .+/) || [])[0] ||
        (nothing ? '没有需要发布的笔记' : '完成');
      const hasWarnings = output.includes('⚠') || output.includes('拒绝覆盖');

      if (dryRun || hasWarnings) {
        new OutputModal(this.app, dryRun ? '预览结果' : '完成（有警告）', output).open();
      }
      const tip = deployed ? '✅ 已上线，Zeabur 部署中（约 2-3 分钟）' : `✅ ${summary}`;
      new Notice(tip, 7000);
      console.log('[dlgzz-blog-sync]', output);
      if (onDone) onDone(null);
    });
  }

}

module.exports = DlgzzBlogSyncPlugin;
