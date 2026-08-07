# 知识包管线：从每天写作到可售卖的 Skill 数据库

> 状态：已实施（2026-07-09）。通用导入器 `scripts/import-knowledge-pack.ts`（`pnpm knowledge:import`）已落地。
> 定位：这是「知识包即付费 Skill」模式的**进货管线**。商业模式：你每天创作 → 按主题入包 → 会员的 Hermes 装薄 Skill、带 Key 调你的检索 API。本文档只管「创作 → 数据库」这一段；「数据库 → 付费 API → Skill 包」见后续的 query 端点设计。

---

## 0. 一句话架构（三段式）

```
① 你写文章（博客 content/blog / Obsidian，照常创作，不改习惯）
   └── ② AI 提炼：pnpm knowledge:distill
         读文章 → LLM 抽原子知识单元（问题→答案）→ 写入 <包目录>/distilled/*.md
         （可人工审改——你的策展 = 产品质量）
          └── ③ 向量化入库：pnpm knowledge:import -- --pack <包目录>
                └── Postgres：knowledge_packs / documents / chunks(pgvector) / units
                     └── searchKnowledgeChunks(query, { packId })  ← 未来付费 API 调这里
```

**博客/文章就是知识源头,但不直接入库。** 叙事原文切块检索质量差,所以中间由 AI 做「提炼」这一步:把文章变成原子化的问答单元,以文件形态落地(可审、可改、可版本管理),再向量化入库。你只管写文章,提炼是机器的活。

## 1. 修正了什么

原状：每个包一份硬编码脚本（`import-xhs-open-shop-knowledge.ts` 写死了 pack ID、目录结构、28 讲表格解析）。做 N 个包 = 复制 N 份脚本。

现在：**一个通用导入器 + 每包一份 manifest**。加一个新包（剪映、小红书运营、糖尿病…）只需要：

1. 建一个内容文件夹，放 `.md` 知识文件
2. 写一份 `pack.md`（十几行 frontmatter）
3. `pnpm knowledge:import -- --pack <文件夹>`

不用写代码。

## 2. 包目录与 manifest 格式

以剪映包为例：

```text
/Users/baiyang/Desktop/知识包/jianying/
├── pack.md              ← manifest（见下）
├── docs/                ← how-to 知识文件，一题一文件或一题一 H2
│   ├── 卡点视频怎么做.md
│   ├── 导出高清参数.md
│   └── 字幕批量识别.md
└── faq.md               ← 高频问答（H2=问题，正文=答案）
```

`pack.md`：

```markdown
---
id: jianying-v1
name: 剪映实操知识包
description: 剪映剪辑实操：功能位置、参数、步骤、避坑。
scope: jianying
status: active
version: 1
category: 剪映
sources:
  - dir: docs
    source: howto
  - file: faq.md
    source: faq
units:
  - type: heading_qa
    file: faq.md
---

这里写给自己看的包说明（不入库）：定位、更新节奏、待补主题清单。
```

字段说明：

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | ✅ | 包主键，也是未来售卖的 SKU；建议 `主题-v1` |
| `name` | ✅ | 展示名 |
| `scope` | | 检索过滤标签，默认 = id |
| `sources` | ✅ | `dir:`（目录下所有 .md）或 `file:`（单文件）；`source:` 是语料类型标签 |
| `units` | | `heading_qa`：该文件每个 H2 抽成一条 `knowledge_units`（问题→答案），检索命中率最高的形态 |

## 3. 写作规范（决定检索质量，务必遵守）

给 AI 查的知识和给人读的文章是两种文体。入包的 `.md` 遵守：

1. **一个 H2 = 一个完整问题的完整答案**。切块器按标题切（≤1400 字符），H2 纪律 = 块质量。
2. **原子化、自包含**：每块单独读也成立，不写「如上所述」「接上文」。
3. **操作颗粒度**：路径、按钮名、参数值、步骤序号。「剪映 → 右上角导出 → 分辨率 1080P、码率推荐」优于「导出时注意参数」。
4. **写版本和日期**：剪映/小红书天天变，答案里带「剪映 13.x，2026-07 验证」，过时可识别。
5. **避坑段**：每题后加「常见错误」，这是网上搜不到的策展价值。
6. frontmatter 里写 `title:` 可覆盖文件名作为文档标题。

## 4. 日常循环（你的「进货」动作）

```bash
# 1. 写作/修改文章（博客或 Obsidian，照常创作）

# 2. AI 提炼（增量：source_hash 不变的文章自动跳过，不重复花 LLM 钱）
pnpm knowledge:distill -- --source content/blog \
  --pack-dir /Users/baiyang/Desktop/知识包/blog-knowledge \
  --pack-id blog-knowledge-v1 --pack-name "博客知识包"
#   --dry-run 预览 / --limit 3 只跑三篇 / --force 强制重提炼
#   --source 可指向任意 md/mdx 目录或单文件（Obsidian 目录也行），可重复传多个
#   提炼模型：默认 DeepSeek（DEEPSEEK_API_KEY），可用 KNOWLEDGE_DISTILL_PROVIDER/MODEL 覆盖

# 3.（建议）人工过一遍 distilled/*.md，改错删水，这一步是你的策展价值

# 4. 向量化入库（增量：content_hash 不变的文件自动跳过，不重复花 embedding 钱）
pnpm knowledge:import -- --pack /Users/baiyang/Desktop/知识包/blog-knowledge
#   --dry-run 预览 / --force 强制重导
```

- 每次运行记录在 `knowledge_ingest_run`，可追溯。
- 嵌入用智谱 `embedding-3`（2048 维，与 `knowledge_chunks.embedding vector(2048)` 和 `searchKnowledgeChunks` 一致），需要 `ZHIPU_API_KEY`。
- 增量成本极低：只有改动过的文件重新嵌入。

## 5. 与博客的关系（一次创作，两份产出）

- **方向是「文章 → AI 提炼 → 包」**：你照常写文章，博客直接发布（橱窗），同一篇文章经 `knowledge:distill` 变成包里的知识（商品）。一次创作同时补货两边。
- 手写原子知识文件（第 3 节规范）仍然支持——适合没有对应文章、直接想入库的纯操作知识；两种来源在同一个包里共存（`sources` 里多列一个 `dir` 即可）。
- 每个 distilled 文件的 frontmatter 记录 `source_file`（原文章），未来付费 API 返回片段时可回链原文——既标注来源，也是给博客导流的钩子。

## 6. 存量迁移与后续

- **小红书包**：`knowledge:xhs:import` 老脚本继续可用（它有 28 讲表格的特殊解析，通用器暂不支持 `qa_table`）。建议下次大改小红书内容时，把源文件整理进 `pack.md` 结构，用通用器接管，然后删老脚本。
- **检索默认包**：`src/lib/knowledge-search.ts` 的 `DEFAULT_KNOWLEDGE_PACK_ID` 硬编码为 `xhs-open-shop-v1`——付费 query 端点必须显式传 `packId`，多包上线前建议去掉这个默认值。
- **下一段管线**（另行设计实施）：`POST /api/knowledge/query`（API Key 鉴权 → Key↔pack 授权 → searchKnowledgeChunks → 按次计量）+ 每包一个 Hermes Skill 包（SKILL.md 模板）+ Key 签发绑购买。

## 7. 图片资产审核与发布

图片不直接跟随整个 Obsidian 目录上传。资产管线只读取 `pack.md` 白名单中的 Markdown，并收录这些正式文档真实引用的图片：

```bash
# 1. 生成私有审核报告；Apple Vision 在本机执行 OCR、二维码和 GIF 全帧扫描
pnpm knowledge:assets:audit -- \
  --pack /path/to/knowledge-pack \
  --out /private/path/asset-audit.json \
  --scan

# 2. 把明确批准的 contentHash、说明和结构化视觉事实写进 approval 文件

# 3. 由“审核证据 + 明确批准”编译公开 catalog
pnpm knowledge:assets:compile -- \
  --audit /private/path/asset-audit.json \
  --approvals /private/path/approvals.json \
  --out /private/path/catalog.json \
  --public-base-url https://img.example.com

# 4. 在上传前先验证全部 document/chunk 关联，不改变数据库和 COS
pnpm knowledge:assets:import -- \
  --catalog /private/path/catalog.json \
  --dry-run --preflight

# 5A. 有受限 COS 凭据时自动上传并入库
pnpm knowledge:assets:import -- \
  --catalog /private/path/catalog.json --upload

# 5B. 手动上传时，把文件整理成最终对象名，再上传到 catalog 的对象前缀
pnpm knowledge:assets:stage -- \
  --catalog /private/path/catalog.json \
  --out-dir /private/path/upload-batch

# 上传完成后验证公开 URL 并激活数据库记录
pnpm knowledge:assets:import -- --catalog /private/path/catalog.json
```

审核状态分开保存：

- `screening.decision`：`ready / needs_review / blocked`
- `approval.status`：`pending / approved / rejected`
- `publication.status`：`not_uploaded / uploaded / active / failed`

规则是“未知即复核”。二维码、联系方式、本地用户路径、未遮盖密钥、会话链接或个人身份命中时不得公开；GIF 必须扫描全部帧。私有审核报告可以保存本地源路径用于取文件，但 catalog 的 `sourceRef`、对象 Key 和数据库字段必须使用逻辑路径或内容哈希。本地 Vision 扫描不调用 Gemini 等付费模型；宿主多模态模型只负责对最终候选图做一次语义确认。
