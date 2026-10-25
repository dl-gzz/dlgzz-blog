import { Plugin, PluginSettingTab, Setting, Notice, Modal, requestUrl } from 'obsidian';
import fs from 'node:fs/promises';
import path from 'node:path';
import { prepareArticle, syncRepository, commitArticle, pushReceipt, checkOnline, digest, git } from './core.mjs';

const DEFAULTS = {
  repoPath: '/Users/baiyang/Projects/独立工作者/runtime/blog-publisher',
  origin: 'https://github.com/dl-gzz/dlgzz-blog.git',
  baseUrl: 'https://www.dlgzz.com',
};

function confirmArticle(app, article) {
  return new Promise(resolve => {
    const modal = new Modal(app); let accepted = false;
    modal.onOpen = () => {
      modal.titleEl.setText(article.existing ? '更新网站文章' : '发布到网站和小程序');
      modal.contentEl.createEl('h3', { text: article.title });
      modal.contentEl.createEl('p', { text: `${article.premium ? '会员文章' : '公开文章'} · ${article.slug}` });
      modal.contentEl.createEl('p', { text: `将发布当前这一篇笔记，随文处理 ${article.assets.length} 张本地图片。网站部署完成后，小程序重新打开文章即可读取。` });
      if (article.requiresApproval) modal.contentEl.createEl('p', { text: '这篇笔记尚未标记为已发布。点击下方按钮，即确认将本篇内容发布到网站。' });
      modal.contentEl.createEl('p', { text: '目标：https://www.dlgzz.com/zh/blog/' + article.slug });
      const cancel = modal.contentEl.createEl('button', { text: '取消' }); cancel.onclick = () => modal.close();
      const publish = modal.contentEl.createEl('button', { text: '确认发布这一篇', cls: 'mod-cta' });
      publish.onclick = () => { accepted = true; modal.close(); resolve(true); };
    };
    modal.onClose = () => { if (!accepted) resolve(false); }; modal.open();
  });
}

export default class BlogSync extends Plugin {
  async onload() {
    const saved = await this.loadData() || {};
    this.settings = { ...DEFAULTS, ...saved };
    if (!saved.origin || saved.repoPath === '/Users/baiyang/Desktop/程序/dlgzz-blog-main') this.settings.repoPath = DEFAULTS.repoPath;
    this.alive = true; this.busy = false;
    this.status = this.addStatusBarItem(); this.refreshStatus();
    this.addSettingTab(new BlogSettings(this.app, this));
    this.addCommand({ id: 'publish-current-article', name: '发布当前笔记到网站和小程序', callback: () => this.run(true).catch(() => {}) });
    this.addCommand({ id: 'prepare-current-article', name: '检查并生成当前文章（不发布）', callback: () => this.run(false).catch(() => {}) });
    this.addCommand({ id: 'verify-last-publication', name: '核对或恢复上次发布', callback: () => this.resume().catch(() => {}) });
    this.addRibbonIcon('upload', '发布当前笔记到网站和小程序', () => this.run(true).catch(() => {}));
  }
  onunload() { this.alive = false; }
  async saveSettings() { await this.saveData(this.settings); }
  refreshStatus() {
    const stage = this.settings.lastPublication?.stage;
    this.status?.setText(stage === 'verified' ? '博客：已上线' : stage ? '博客：待核对' : '博客同步');
  }
  async record(receipt) { this.settings.lastPublication = { ...receipt }; await this.saveSettings(); this.refreshStatus(); }
  async prepare(file) {
    return prepareArticle({ raw: await this.app.vault.read(file), sourcePath: file.path,
      vaultRoot: this.app.vault.adapter.basePath, repo: this.settings.repoPath,
      resolveAsset: (target, source) => this.app.metadataCache.getFirstLinkpathDest(target, source)?.path });
  }
  async exclusive(action) {
    if (this.busy) { new Notice('已有一篇文章正在处理，请稍候。'); return; }
    this.busy = true;
    let handle; const lock = path.join(this.settings.repoPath, '.git/dlgzz-publish.lock');
    try {
      try { handle = await fs.open(lock, 'wx'); }
      catch (e) {
        if (e.code === 'EEXIST') {
          const pid = Number(await fs.readFile(lock, 'utf8'));
          let running = true;
          if (Number.isInteger(pid) && pid > 0) { try { process.kill(pid, 0); } catch (err) { if (err.code === 'ESRCH') running = false; } }
          if (running) throw new Error('另一个发布操作仍在运行，请稍后再试。');
          await fs.unlink(lock); handle = await fs.open(lock, 'wx');
        } else throw new Error('发布仓库不可用，请检查插件设置中的发布目录。');
      }
      await handle.writeFile(String(process.pid));
      return await action();
    } catch (error) { new Notice(`博客同步：${error.message}`, 12000); throw error; }
    finally { if (handle) { await handle.close(); await fs.unlink(lock).catch(() => {}); } this.busy = false; }
  }
  async run(publish) {
    return this.exclusive(async () => {
      const file = this.app.workspace.getActiveFile();
      if (!file || file.extension !== 'md') throw new Error('请先打开要发布的 Markdown 笔记。');
      if (this.settings.lastPublication?.stage === 'committed') throw new Error('上次提交尚未完成推送，请先运行“核对或恢复上次发布”。');
      await syncRepository(this.settings.repoPath, this.settings.origin);
      const article = await this.prepare(file);
      if (!publish) {
        const output = path.join(this.app.vault.adapter.basePath, this.app.vault.configDir, 'plugins/dlgzz-blog-sync/preview', `${article.slug}.mdx`);
        await fs.mkdir(path.dirname(output), { recursive: true }); await fs.writeFile(output, article.content);
        new Notice(`检查通过：${article.title}。预览已生成，尚未发布。`, 8000);
        return { preview: output, title: article.title, assets: article.assets.length };
      }
      if (!await confirmArticle(this.app, article)) return { cancelled: true };
      if (digest(await this.app.vault.read(file)) !== article.sourceHash) throw new Error('确认期间笔记有改动，请重新发布以包含最新内容。');
      return this.publishApproved(article, file);
    });
  }
  // Called only after the explicit per-article confirmation above.
  async publishApproved(article, file) {
    const repo = this.settings.repoPath;
    let receipt = await commitArticle(repo, article, r => this.record(r));
    receipt = await pushReceipt(repo, receipt, r => this.record(r));
    try {
      await this.app.fileManager.processFrontMatter(file, fm => { fm.blog_slug = article.slug; fm.blog_publish = true; });
    } catch { new Notice('文章已推送，但笔记属性回写失败；发布记录已保存。', 8000); }
    new Notice('文章已推送，正在核对网站部署与小程序文章接口。', 8000);
    return this.waitForOnline(receipt);
  }
  async get(url, type) {
    let timer;
    try {
      const result = await Promise.race([requestUrl({ url, method: type === 'image' ? 'HEAD' : 'GET', throw: false }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('线上核对请求超时')), 15000); })]);
      if (result.status < 200 || result.status >= 300) throw new Error(`线上资源返回 ${result.status}`);
      if (type === 'image') { if (!/^image\//i.test(result.headers['content-type'] || result.headers['Content-Type'] || '')) throw new Error('文章图片未正确返回'); return true; }
      return type ? result.text : result.json;
    } finally { clearTimeout(timer); }
  }
  async waitForOnline(receipt, attempts = 30) {
    let reason = '网站尚在部署';
    for (let n = 0; n < attempts && this.alive; n++) {
      try {
        const result = await checkOnline(this.settings.baseUrl, receipt, (u, t) => this.get(u, t));
        if (result.ready) {
          await this.record({ ...receipt, ...result, stage: 'verified', verifiedAt: new Date().toISOString() });
          new Notice('网站文章和小程序文章接口已更新。小程序下拉刷新或重新打开文章即可查看。', 12000);
          return result;
        }
        reason = result.reason;
      } catch (e) { reason = e.message; }
      if (n < attempts - 1) await new Promise(r => setTimeout(r, 10000));
    }
    await this.record({ ...receipt, stage: 'pushed', lastCheck: reason });
    new Notice(`文章已推送，尚未确认上线：${reason}。稍后运行“核对或恢复上次发布”，无需重复发布。`, 15000);
    return { ready: false, reason };
  }
  async resume() {
    return this.exclusive(async () => {
      let receipt = this.settings.lastPublication;
      if (!receipt) throw new Error('还没有发布记录。');
      if (receipt.stage === 'committed') receipt = await pushReceipt(this.settings.repoPath, receipt, r => this.record(r));
      return this.waitForOnline(receipt);
    });
  }
}

class BlogSettings extends PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
  display() {
    this.containerEl.empty();
    this.containerEl.createEl('p', { text: '打开任意一篇笔记，点击左侧上传图标即可发布。只发布你确认的当前文章，不会批量扫描或上传笔记库。' });
    new Setting(this.containerEl).setName('文章发布目录').setDesc('独立、干净的 GitHub main 工作副本。')
      .addText(t => t.setValue(this.plugin.settings.repoPath).onChange(async v => { this.plugin.settings.repoPath = v.trim(); await this.plugin.saveSettings(); }));
    const last = this.plugin.settings.lastPublication;
    if (last) this.containerEl.createEl('p', { text: `上次文章：${last.title}；${last.stage === 'verified' ? '网站与接口已核对' : '等待核对上线'}` });
    new Setting(this.containerEl).setName('核对或恢复上次发布').addButton(b => b.setButtonText('立即核对').onClick(() => this.plugin.resume().catch(() => {})));
  }
}
