# One Worker 白板集成到 dlgzz-blog 项目

## 📋 项目概述

将 One Worker 白板（基于 Tldraw 的 AI 白板应用）集成到 dlgzz-blog Next.js SaaS 应用中。

---

## 🎯 集成方案：独立页面集成（方案 1）

### 目标
- 在 dlgzz-blog 中添加 `/whiteboard` 页面
- 保留 Tldraw 白板的所有功能
- 集成智谱 AI 对话功能
- 利用现有的用户认证系统

### 技术栈对比

| 功能 | One Worker 白板 | dlgzz-blog | 集成方案 |
|------|----------------|------------|----------|
| 框架 | Vite + React 19 | Next.js 15 + React 19 | 使用 Next.js |
| 语言 | JavaScript (.jsx) | TypeScript (.tsx) | 转换为 TypeScript |
| 白板 | Tldraw 4.2.3 | - | 安装 Tldraw |
| AI | 智谱 AI (GLM-4) | DeepSeek | 添加智谱 AI |
| 认证 | 无 | Better Auth | 使用 Better Auth |
| 数据库 | 无 | PostgreSQL | 可选：保存白板数据 |

---

## 📦 实施步骤

### 步骤 1：安装依赖

```bash
cd /Users/baiyang/Desktop/桌面\ -\ 白阳的Mac\ mini/dlgzz-blog-main

# 安装 Tldraw 和相关依赖
pnpm add tldraw@4.2.3
pnpm add react-markdown
pnpm add lucide-react  # 已安装，跳过
```

### 步骤 2：创建白板页面结构

```bash
# 创建白板页面目录
mkdir -p src/app/[locale]/(protected)/whiteboard
mkdir -p src/components/whiteboard
mkdir -p src/lib/ai
```

### 步骤 3：复制和转换组件

需要从 One Worker 项目复制以下文件：

```
One Worker 白板                    →  dlgzz-blog
─────────────────────────────────────────────────────────────
src/components/TldrawBoard.jsx     →  src/components/whiteboard/TldrawBoard.tsx
src/components/shapes/AITerminalShape.jsx  →  src/components/whiteboard/shapes/AITerminalShape.tsx
src/components/shapes/registry.js  →  src/components/whiteboard/shapes/registry.ts
src/services/AIProvider.js         →  src/lib/ai/zhipu.ts
src/App.css                         →  src/components/whiteboard/whiteboard.css
```

### 步骤 4：创建 API 路由

在 Next.js 中创建 API 路由处理智谱 AI 请求：

```
src/app/api/ai/
├── chat/
│   └── route.ts          # 智谱 AI 对话接口
└── zhipu/
    └── route.ts          # 智谱 AI 配置
```

### 步骤 5：创建白板页面

```
src/app/[locale]/(protected)/whiteboard/
├── page.tsx              # 白板主页面
├── layout.tsx            # 白板布局（可选）
└── loading.tsx           # 加载状态
```

---

## 🔧 详细实施代码

### 1. 安装依赖

```bash
pnpm add tldraw@4.2.3 react-markdown
```

### 2. 添加环境变量

在 `.env` 文件中添加：

```bash
# 智谱 AI 配置
ZHIPU_API_KEY=your_zhipu_api_key_here
ZHIPU_BASE_URL=https://open.bigmodel.cn/api/paas/v4
ZHIPU_MODEL=glm-4
```

### 3. 创建智谱 AI 服务

**文件**: `src/lib/ai/zhipu.ts`

```typescript
// 智谱 AI 服务
export class ZhipuAI {
  private apiKey: string;
  private baseURL: string;
  private model: string;

  constructor() {
    this.apiKey = process.env.ZHIPU_API_KEY || '';
    this.baseURL = process.env.ZHIPU_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4';
    this.model = process.env.ZHIPU_MODEL || 'glm-4';
  }

  async chat(messages: Array<{ role: string; content: string }>) {
    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`智谱 AI 请求失败: ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }
}
```

### 4. 创建 API 路由

**文件**: `src/app/api/ai/chat/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { ZhipuAI } from '@/lib/ai/zhipu';

export async function POST(request: NextRequest) {
  try {
    const { messages } = await request.json();

    const zhipu = new ZhipuAI();
    const response = await zhipu.chat(messages);

    return NextResponse.json({
      success: true,
      message: response
    });
  } catch (error) {
    console.error('AI Chat Error:', error);
    return NextResponse.json(
      { success: false, error: '智谱 AI 请求失败' },
      { status: 500 }
    );
  }
}
```

### 5. 创建白板页面

**文件**: `src/app/[locale]/(protected)/whiteboard/page.tsx`

```typescript
'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';

// 动态导入 Tldraw 组件（避免 SSR 问题）
const TldrawBoard = dynamic(
  () => import('@/components/whiteboard/TldrawBoard'),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg">加载白板中...</div>
      </div>
    )
  }
);

export default function WhiteboardPage() {
  return (
    <div className="h-screen w-full">
      <Suspense fallback={<div>加载中...</div>}>
        <TldrawBoard />
      </Suspense>
    </div>
  );
}
```

### 6. 转换 TldrawBoard 组件

**文件**: `src/components/whiteboard/TldrawBoard.tsx`

这个文件需要从 One Worker 项目的 `src/components/TldrawBoard.jsx` 转换而来。

主要改动：
1. 文件扩展名：`.jsx` → `.tsx`
2. 添加 TypeScript 类型
3. 修改 AI API 调用路径：从 `http://localhost:8000` → `/api/ai/chat`
4. 移除 God Mode 相关代码（已删除）

### 7. 转换 AITerminalShape 组件

**文件**: `src/components/whiteboard/shapes/AITerminalShape.tsx`

从 One Worker 项目的 `src/components/shapes/AITerminalShape.jsx` 转换。

主要改动：
1. TypeScript 类型定义
2. API 调用改为 Next.js API Routes
3. 样式调整以适配 dlgzz-blog 主题

---

## 🎨 样式集成

### 方案 A：保留原样式

将 One Worker 的 `App.css` 复制为 `whiteboard.css`，在白板页面单独引入。

### 方案 B：使用 Tailwind CSS

将原有的 CSS 样式转换为 Tailwind 类名，与 dlgzz-blog 统一。

**推荐**：方案 A（快速集成），后续逐步迁移到方案 B。

---

## 🔐 权限控制

### 基础版：登录即可使用

```typescript
// src/app/[locale]/(protected)/whiteboard/page.tsx
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default async function WhiteboardPage() {
  const session = await auth();

  if (!session) {
    redirect('/auth/login');
  }

  return <TldrawBoard />;
}
```

### 进阶版：订阅用户专享

```typescript
import { getUserSubscription } from '@/lib/subscription';

export default async function WhiteboardPage() {
  const session = await auth();
  const subscription = await getUserSubscription(session.user.id);

  if (!subscription || subscription.status !== 'active') {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">白板功能需要订阅</h1>
          <a href="/pricing" className="btn btn-primary">
            查看订阅计划
          </a>
        </div>
      </div>
    );
  }

  return <TldrawBoard />;
}
```

---

## 📊 数据持久化（可选 - 第二阶段）

### 数据库 Schema

```typescript
// src/db/schema/whiteboard.ts
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const whiteboards = pgTable('whiteboards', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  title: text('title').notNull(),
  data: text('data').notNull(), // JSON 字符串
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
```

### API 路由

```typescript
// src/app/api/whiteboard/save/route.ts
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { title, data } = await request.json();

  // 保存到数据库
  const whiteboard = await db.insert(whiteboards).values({
    userId: session.user.id,
    title,
    data: JSON.stringify(data),
  });

  return NextResponse.json({ success: true, id: whiteboard.id });
}
```

---

## 🚀 部署注意事项

### 1. 环境变量

确保在部署平台（Vercel/腾讯云）配置：
- `ZHIPU_API_KEY`
- `ZHIPU_BASE_URL`
- `ZHIPU_MODEL`

### 2. 构建优化

Tldraw 是一个较大的库，建议：
- 使用动态导入 (`dynamic import`)
- 启用代码分割
- 配置 CDN 加速

### 3. SSR 问题

Tldraw 依赖浏览器 API，必须禁用 SSR：

```typescript
const TldrawBoard = dynamic(
  () => import('@/components/whiteboard/TldrawBoard'),
  { ssr: false }
);
```

---

## 📝 测试清单

- [ ] 白板页面可以正常访问
- [ ] Tldraw 编辑器正常加载
- [ ] AI Terminal 可以发送消息
- [ ] 智谱 AI 返回正常响应
- [ ] 用户认证正常工作
- [ ] 移动端适配正常
- [ ] 构建和部署成功

---

## 🐛 常见问题

### 问题 1：Tldraw 在 Next.js 中报错

**原因**：Tldraw 使用了浏览器 API，不支持 SSR

**解决**：使用 `dynamic import` 并设置 `ssr: false`

### 问题 2：智谱 AI API 调用失败

**原因**：API Key 未配置或网络问题

**解决**：
1. 检查 `.env` 文件中的 `ZHIPU_API_KEY`
2. 确认 API Key 有效
3. 检查网络连接

### 问题 3：样式冲突

**原因**：Tailwind CSS 与 Tldraw 样式冲突

**解决**：
1. 使用 CSS Modules 隔离样式
2. 或者在白板页面禁用全局样式

---

## 📚 参考资源

- [Tldraw 官方文档](https://tldraw.dev/)
- [Next.js 动态导入](https://nextjs.org/docs/advanced-features/dynamic-import)
- [智谱 AI API 文档](https://open.bigmodel.cn/dev/api)
- [Better Auth 文档](https://www.better-auth.com/)

---

## 🎯 下一步计划

### 第一阶段（当前）
- ✅ 基础集成
- ✅ AI 对话功能
- ✅ 用户认证

### 第二阶段（1周后）
- [ ] 数据持久化
- [ ] 白板列表页
- [ ] 分享功能

### 第三阶段（2周后）
- [ ] 实时协作
- [ ] 模板市场
- [ ] 付费订阅功能

---

需要我开始实施集成吗？
