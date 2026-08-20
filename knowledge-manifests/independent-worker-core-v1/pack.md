---
id: independent-worker-core-v1
name: one-worker-os · 独立工作者系统
description: 帮助已有真实经验的工作者完成证据盘点、客户问题选择、最小服务设计、内容获客、AI 协作和第一次真实验证。
scope: independent_worker_core
status: draft
version: 1
category: 独立工作者
documentIdStrategy: pack_relative
immutableVersioned: true
embeddingPolicy: manual

collection:
  id: independent-worker
  name: 独立工作者
  description: one-worker-os 面向独立工作者的第一方方法、案例和 AI 可读资料合集。
  status: active
  sortOrder: 10
  metadata:
    authority: first_party_collection
    contentKinds:
      - methodology
      - article
      - code

metadata:
  seriesId: independent-worker-core
  versionPolicy: immutable
  authority: first_party_author
  author: 白杨
  contentKinds:
    - methodology
    - workbook
    - checklist
  audience:
    - 独立工作者
    - 一人公司经营者
    - 希望用 AI 放大个人经验的工作者
  topics:
    - 独立工作者
    - 一人公司
    - 个人证据
    - 客户问题
    - 最小服务
    - 内容获客
    - 数字员工
    - AI 工作系统
    - 30 天验证
  routingKeywords:
    - 独立工作者
    - 一人公司
    - 个人经验产品化
    - 我能卖什么
    - 第一批客户
    - 最小服务
    - 内容获客
    - 数字员工
    - AI 工作系统
    - 个人业务系统
    - 30 天验证
  licenseStatus: first_party_owned
  sourceAccess: full
  permittedUse:
    - 会员账号内由 AI 阅读、摘要和组合
    - 根据用户自身需求生成个人 Skill、代码或模板
  prohibitedUse:
    - 批量导出原文
    - 原文转售
    - 整库再发布

# 内容所有者尚未指定首篇文章。保持空数组可让任何误触导入都直接失败，
# 而不是扫描或写入整个 Obsidian 目录。
sources: []
units: []
---

# 独立工作者系统 v1

这是 one-worker-os 的独立工作者知识包模板。它当前保持 `draft`，且没有声明任何来源；在内容所有者明确指定首篇文章前，不得扫描、导入、切块或生成向量。

选定文章后，必须先把那一篇加入 `sources`，再用精确相对路径做只读 dry-run：

```bash
pnpm knowledge:import -- --pack knowledge-manifests/independent-worker-core-v1 --source-root "/path/to/Obsidian/Vault" --only-source "选定文章.md" --dry-run --no-embeddings
```

只有内容所有者再次明确授权该篇生成向量后，才允许把 manifest 改为 `status: active`，并在同一个精确 `--only-source` 命令中使用 `--publish --allow-embeddings`。当 manifest 只声明这一篇时，它可以作为 v1 的完整首次发布；导入器会拒绝未指定 `--only-source` 或一次命中多篇文章的向量化请求。
