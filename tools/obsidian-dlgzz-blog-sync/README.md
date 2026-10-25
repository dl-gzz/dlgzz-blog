# 独立工作者博客同步 1.1.1

只发布当前选择并确认的一篇笔记，适用于桌面 Obsidian。无需先使用口播出稿机或小白排版。

## 使用

1. 打开要发布的 Markdown 笔记，点击左侧上传图标，或运行“发布当前笔记到网站和小程序”。
2. 检查确认框里的标题、网址和公开/会员属性，再点“确认发布这一篇”。没有 YAML 的普通笔记也可以操作。
3. 插件处理图片、提交并推送，然后核对线上正文哈希、文章页和图片。显示“网站文章和小程序文章接口已更新”后，在小程序下拉刷新或重新打开文章。

只推送成功时不会标成上线。等待超时或网络恢复后，运行“核对或恢复上次发布”；它会复用原提交，不会重复创建文章。

“检查并生成当前文章（不发布）”将预览写到插件目录 preview/，不推送。

## 文章规则

- 默认标题为笔记名；可用 title 覆盖。首次发布自动生成 blog_slug，并在推送后写回笔记，以后改名仍保留网址。
- 历史 WorkBuddy 文章按已有映射保留网址；归档/移动不再使发布失效。
- blog_column 可为 ai-practice、solo-company、independent-thinking；blog_subcategory 支持 AI 实战下的 workbuddy。
- blog_cover、cover 或 image 可指定封面；否则使用首张图片、已有封面或网站 /og.png 默认图。
- blog_premium 或 premium 可指定 true/false；更新旧文时默认保留原访问属性。
- 自动处理 ![[本地图片]]、![说明](相对路径)、引用式图片和 HTTPS 图片。本地 PNG/JPEG/WebP/GIF/AVIF 随文章保存到网站 public/blog/obsidian，按内容哈希去重。不读取小白排版缓存，也不依赖其他插件的图床。
- 只接受库内非隐藏目录的笔记和图片，不会嵌入另一篇私人笔记，也不会扫描整库自动发布。普通笔记中的可执行 MDX 声明会被拒绝，请将示例代码放入代码块。

## 发布仓库

使用独立的 main 工作副本：`/Users/baiyang/Projects/独立工作者/runtime/blog-publisher`。设置页可调整路径。它与网站开发工作区分开，避免未完成开发改动混入文章发布。

需要现有 GitHub Git 凭据和 commit author 配置。插件不保存 GitHub 密钥。每次先 fetch 和 fast-forward；遇到脏目录、分叉或冲突则停止，不强推、不重置开发代码。

发布记录在 Obsidian 插件 data.json 中保存。线上 API detail.contentHash 必须与本次生成 MDX 的 SHA-256 一致；因此后续其他部署不会导致已发布文章无法复核。

## 构建和验证

在网站项目根目录已有锁文件对应依赖的情况下：

```sh
node tools/obsidian-dlgzz-blog-sync/build.cjs
node tools/obsidian-dlgzz-blog-sync/test.cjs
```

构建产生可直接安装的 main.js（所有 Markdown/MDX 依赖均已打包）。将 main.js 和 manifest.json 复制到笔记库 `.obsidian/plugins/dlgzz-blog-sync/` 并重新加载插件。

测试使用临时笔记、临时 Git 仓库和本地 bare remote，不读取个人文章，不写线上仓库。

代码/接口验证不能代替微信真机的界面验收。
