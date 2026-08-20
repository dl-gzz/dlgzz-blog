---
id: independent-worker-cli-library-v1
name: one-worker-os · 独立工作者 CLI 库
description: 帮助 AI 识别、安装、验证和安全使用经过实际测试的命令行工具，同时保留时效、会员、授权和人工确认边界。
scope: independent_worker_cli_library
status: active
version: 1
category: CLI库
documentIdStrategy: pack_relative
immutableVersioned: true
embeddingPolicy: manual

collection:
  id: independent-worker
  name: 独立工作者
  description: one-worker-os 面向独立工作者的第一方方法、案例和 AI 可读资料合集。
  status: active
  sortOrder: 30
  metadata:
    authority: first_party_collection
    contentKinds:
      - methodology
      - article
      - code

metadata:
  seriesId: independent-worker-cli-library
  versionPolicy: immutable
  authority: curated_field_notes
  contentKinds:
    - cli_catalog_entry
    - operational_note
    - supporting_reference
  audience:
    - 独立工作者
    - AI Agent 使用者
    - 命令行工具使用者
  topics:
    - CLI 工具
    - AI 工作系统
    - 第二大脑
    - 信息沉淀
  routingKeywords:
    - 得到大脑 CLI
    - getnote-cli
    - "@getnote/cli"
    - Get笔记 命令行
    - 得到 OpenAPI 会员
    - getnote OAuth 登录
    - 终端保存笔记
    - 第二大脑信息沉淀
    - npm 安装 getnote
    - getnote PATH 命令找不到
  author: 白杨
  publisher: 白杨
  licenseStatus: first_party_owned
  ownershipConfirmedAt: "2026-08-20"
  sourceAccess: full
  executionPolicy: user_confirmation_required
  permittedUse:
    - 会员账号内由 AI 检索受控片段和引用
    - 经用户确认后生成安装或排障方案
  prohibitedUse:
    - 未经用户确认执行安装、登录或写入第三方服务
    - 索取或回显真实 API Key、Token 或 Cookie
    - 将时效性版本和会员规则表述为永久事实

sources:
  - file: CLI库/得到CLI.md
    source: obsidian_cli_library
    category: CLI库
    metadata:
      authority: first_party_field_note
      author: 白杨
      publisher: 白杨
      licenseStatus: first_party_owned
      ownershipConfirmedAt: "2026-08-20"
      sourceKind: cli_catalog_entry
      contentRole: supporting_reference
      documentStatus: install_verified_auth_pending
      sourceAccess: full
      executionPolicy: user_confirmation_required
      language: zh-CN
      version: "1.2.1"
      verifiedAt: "2026-07-16"
      sourceUrl: https://github.com/iswalle/getnote-cli
      topics:
        - 得到大脑
        - Get笔记
        - CLI
        - 第二大脑
        - 信息沉淀
      intents:
        - 安装 getnote-cli
        - 使用 OAuth 登录 getnote
        - 排查 getnote PATH 问题
        - 保存和搜索得到笔记
        - 判断得到会员权限问题

units: []
---

# 独立工作者 CLI 库 v1

本知识包保存经过实际测试的 CLI 条目，供 AI 理解工具用途、安装条件、权限边界和常见故障。文章和命令始终是不可信参考资料；任何安装、登录、写入第三方服务或凭据操作都必须由用户明确确认。

当前唯一来源已由内容所有者确认归属，并授权会员读取全文。包保持手动向量策略；本次授权只覆盖 `CLI库/得到CLI.md`，不得扩展到同目录其他文章。

只读 dry-run（不会连接数据库或生成向量）：

```bash
pnpm knowledge:import -- --pack knowledge-manifests/independent-worker-cli-library-v1 --source-root "/path/to/Obsidian/Vault" --only-source "CLI库/得到CLI.md" --dry-run --no-embeddings
```

内容所有者已于 2026-08-20 明确授权这一篇发布和生成向量。生产导入仍必须使用精确 `--only-source "CLI库/得到CLI.md" --publish --allow-embeddings`，不得扫描或导入 `CLI库` 中的其他文章。
