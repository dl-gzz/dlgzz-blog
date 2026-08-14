# 独立沉思录

独立沉思录是一个“文章即服务”的知识平台：内容既可供人阅读，也可通过 API 和 Skill 接入 AI。

## 主要能力

- 中英文博客与会员内容
- 基于文章和知识库的 AI 问答
- 知识包、API Key 与 OneWorkOS 安装链路
- 组件商店与本地客户端交付
- 白板、课件与数字员工扩展能力
- 订阅、支付、权益与管理后台

## 本地开发

环境要求：Node.js 20+ 和 pnpm。

```bash
pnpm install
cp env.example .env.local
pnpm dev
```

开发服务默认运行在 `http://localhost:3000`。

## 常用命令

```bash
pnpm dev
pnpm build
pnpm lint
pnpm db:generate
pnpm db:migrate
```

## 项目结构

```text
src/app/          Next.js App Router 页面与 API
src/components/   UI 和业务组件
src/lib/          领域逻辑与服务封装
src/db/           Drizzle 数据库模型与迁移
src/storage/      通用对象存储能力
messages/         中英文界面文案
content/          博客、文档和作者内容
docs/             系统与交付文档
skills/           项目内置 Skill
```

## 文档

从 [docs/README.md](docs/README.md) 开始了解组件上架、安装链路与交付规范。

## License

[LICENSE](LICENSE)
