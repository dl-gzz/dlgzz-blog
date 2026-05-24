# One Worker OS Store

`dlgzz-blog-main` 是 One Worker OS 的线上商店与内容生产端。它同时负责：

- 文章、文档、更新日志的内容发布
- 组件服务的安装清单与文章元数据管理
- 白板与站内 AI 问答
- 会员 / 单买组件的授权校验
- 将组件安装到本地客户端

## 技术栈

- Next.js 15 App Router
- React 19
- next-intl
- Better Auth
- PostgreSQL + Drizzle ORM
- Fumadocs / MDX
- XorPay
- S3-compatible storage via `s3mini`

## 本地启动

1. 安装依赖

```bash
pnpm install
```

2. 复制环境变量模板

```bash
cp env.example .env.local
```

3. 配置至少以下变量

```bash
NEXT_PUBLIC_BASE_URL="http://localhost:3000"
DATABASE_URL="postgresql://..."
BETTER_AUTH_SECRET="..."

# Whiteboard / AI
WHITEBOARD_AI_PROVIDER="deepseek"
DEEPSEEK_API_KEY="..."
DEEPSEEK_BASE_URL="https://api.deepseek.com/v1"
DEEPSEEK_MODEL="deepseek-chat"

# Storage
STORAGE_REGION="auto"
STORAGE_BUCKET_NAME=""
STORAGE_ACCESS_KEY_ID=""
STORAGE_SECRET_ACCESS_KEY=""
STORAGE_ENDPOINT=""
STORAGE_PUBLIC_URL=""
```

4. 启动开发环境

```bash
pnpm dev
```

## 常用命令

- `pnpm dev`
- `pnpm build`
- `pnpm start`
- `pnpm lint`
- `pnpm format`
- `pnpm db:generate`
- `pnpm db:migrate`
- `pnpm db:push`
- `pnpm db:studio`

## 主要目录

```text
src/app            Next.js 页面与 API
src/components     页面组件与业务组件
src/lib            核心业务逻辑
src/db             数据库 schema 与 migrations
src/storage        统一文件存储抽象
content            博客、文档、分类等 MDX 内容
docs               项目内部说明文档
```

## 项目特点

- 博客文章可直接携带 `service_manifest`，生成可安装组件商品
- 服务安装链路同时支持免费、会员、单独购买三种授权模式
- 白板与站内聊天都走统一的服务端 AI 配置
- 商店端与本地客户端通过固定安装协议对接
