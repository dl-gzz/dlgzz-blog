# PRD：AI 课件白板与 MDX Block 后台

> 版本：v0.1
> 日期：2026-08-26
> 项目：`dlgzz-blog-main`
> 使用场景：给 WorkBuddy / AI 开发助手理解当前项目、继续实现功能
> 当前策略：先满足单人可用，不先做复杂多租户注册体系

---

## 1. 产品定位

本项目要做一套面向老师的 AI 互动课件系统。

老师可以在网页后台输入一句自然语言想法，例如“我想生成一个三角形求面积的课件”，系统先生成一个可编辑、可保存、可复用的 **MDX Block**。这个 Block 本质上是一份“教学提示词 + 教案文档”，可以被白板读取，再由 AI 生成可触屏互动的 HTML 课件组件。

学生在白板上完成课件或答题后，成绩通过 `quiz_result` 协议上报，并写入 Hermes 学习助手。家长后续可以通过 Hermes/微信侧查询孩子学习表现。

一句话总结：

```text
老师一句话
→ 生成 MDX Block
→ 保存到博客/课件库
→ 白板选择 Block
→ AI 生成互动 HTML 课件
→ 学生答题
→ Hermes 记录学习数据
→ 家长查询学习情况
```

---

## 2. 当前 MVP 目标

### 2.1 本阶段目标

先让项目所有者本人可用：

1. 能在网页端打开课件后台。
2. 能输入一句话生成 MDX Block。
3. 能编辑并保存 MDX Block。
4. 白板课件库能读取这些 Block。
5. 点击任意 Block 后，统一按“提示词生成互动课件”，而不是直接插入写死组件。
6. 生成的课件必须可触屏、可点击/拖动/答题。
7. 学生提交后，白板能显示学习事件并保存成绩。

### 2.2 暂不做

1. 暂不做多老师注册与权限隔离。
2. 暂不做复杂班级管理。
3. 暂不做完整 SaaS 计费。
4. 暂不做微信扫码自动回调绑定的最终生产方案。

---

## 3. 目标用户

### 3.1 老师

老师是后台和白板的核心使用者。

老师要完成：

1. 输入课件想法。
2. 生成并编辑 MDX Block。
3. 把 Block 保存到课件库。
4. 在白板中选择 Block 并生成互动课件。
5. 给学生上课或练习。

### 3.2 学生

学生不需要接触后台，只在白板上操作：

1. 看图形演示。
2. 拖动图形、调节滑块、点击按钮。
3. 回答随堂题。
4. 提交结果。

### 3.3 家长

家长不进入白板或后台，后续通过 Hermes/微信问：

1. 今天学得怎么样？
2. 哪些题错了？
3. 哪个知识点薄弱？
4. 接下来怎么复习？

---

## 4. 当前线上入口

### 4.1 课件后台

```text
https://www.dlgzz.com/zh/teacher/courseware
```

本地开发：

```text
http://127.0.0.1:19527/zh/teacher/courseware
```

当前页面位置：

```text
src/app/[locale]/(fullscreen)/teacher/courseware/page.tsx
src/components/courseware/CoursewareBackendClient.tsx
```

当前状态：

1. 该页面目前不需要登录。
2. 页面没有放进首页导航，需要直接打开链接。
3. 适合 MVP 测试。

### 4.2 白板

```text
https://www.dlgzz.com/zh/own-whiteboard?studentId=测试1号&lessonId=test
```

本地开发：

```text
http://127.0.0.1:19527/zh/own-whiteboard?studentId=测试1号&lessonId=test
```

当前页面位置：

```text
src/app/[locale]/(fullscreen)/own-whiteboard/page.tsx
src/components/own-whiteboard/OwnWhiteboard.tsx
```

---

## 5. 核心流程

### 5.1 老师生成 MDX Block

```text
老师打开 /zh/teacher/courseware
→ 在“新建 Block”输入课件想法
→ 点击“生成 Block”
→ 系统调用 /api/teacher/courseware/generate-block
→ 返回 title / description / slug / whiteboardPrompt / mdx
→ 老师编辑内容
→ 点击“保存 Block”
→ 系统调用 /api/teacher/courseware/save-block
→ 保存到数据库 edu_blog_post
→ Block 出现在左侧/课件库列表
```

### 5.2 老师从 Block 生成互动课件

```text
老师在后台选择一个 Block
→ 点击生成课件
→ 系统调用 /api/teacher/courseware/generate
→ AI 根据 MDX 和 whiteboard_prompt 生成 HTML 互动课件
→ 页面展示 iframe 预览
→ 老师可保存到博客或打开白板使用
```

### 5.3 白板从课件库生成课件

```text
老师打开 /zh/own-whiteboard
→ 点击底部“课件库”
→ 选择一个 Block
→ 前端调用 /api/teacher/courseware/generate
→ 生成 preview_html 操作
→ 白板创建 HTML iframe shape
→ 学生在 iframe 中交互
```

重要要求：

课件库中的所有条目都应统一走“Block 提示词生成课件”，不要再通过硬编码直接插入第一、第二个组件。

### 5.4 学生提交学习结果

课件 HTML 必须通过以下协议向父页面上报：

```js
window.parent.postMessage({
  type: "quiz_result",
  studentId,
  quiz: {
    topic,
    total,
    correct,
    questions,
    wrong,
    durationSeconds,
    finishedAt
  }
}, "*")
```

白板收到后：

```text
OwnWhiteboard message listener
→ /api/learning-assistant/record-quiz
→ Hermes learning-assistant skill
→ 写入学生学习档案
→ 白板显示“学习事件 / 已保存”
```

---

## 6. 功能需求

### FR-1：课件后台入口

后台页面应提供：

1. Block 列表。
2. 新建 Block 表单。
3. Block 生成结果编辑区。
4. 课件生成按钮。
5. 课件 iframe 预览。
6. 保存到博客/课件库能力。
7. 打开白板按钮。

当前文件：

```text
src/components/courseware/CoursewareBackendClient.tsx
```

### FR-2：AI 生成 MDX Block

用户输入一句课件想法，系统返回：

```json
{
  "title": "课件标题",
  "description": "课件说明",
  "slug": "英文 slug",
  "whiteboardPrompt": "给白板 AI 使用的完整课件生成提示词",
  "mdx": "完整 MDX 文档源码"
}
```

当前接口：

```text
POST /api/teacher/courseware/generate-block
```

当前实现：

```text
src/app/api/teacher/courseware/generate-block/route.ts
```

模型配置：

```text
COURSEWARE_BLOCK_PROVIDER
COURSEWARE_BLOCK_MODEL
WHITEBOARD_COURSEWARE_PROVIDER
GEMINI_MODEL
```

### FR-3：保存 MDX Block

保存后应进入数据库，并能被白板课件库读取。

当前接口：

```text
POST /api/teacher/courseware/save-block
```

当前实现：

```text
src/app/api/teacher/courseware/save-block/route.ts
src/lib/edu-content.ts
```

保存目标：

```text
edu_blog_post
```

字段重点：

```text
post_type = prompt_block
whiteboard_category = education
whiteboard_prompt = 生成课件用提示词
mdx_source = 完整 MDX
visibility = private
```

### FR-4：从 MDX Block 生成互动课件

输入一个 slug，系统读取该 Block 的 MDX 与 `whiteboard_prompt`，生成白板可执行操作：

```json
{
  "success": true,
  "plan": {
    "operations": [
      {
        "action": "create",
        "type": "preview_html",
        "x": 16,
        "y": 72,
        "props": {
          "w": 820,
          "h": 620,
          "html": "<!DOCTYPE html>..."
        }
      }
    ]
  }
}
```

当前接口：

```text
POST /api/teacher/courseware/generate
```

当前实现：

```text
src/app/api/teacher/courseware/generate/route.ts
```

关键要求：

1. HTML 必须是完整文档。
2. 必须包含内联 CSS/JS。
3. 必须包含 SVG 或 Canvas 可视化。
4. 必须支持触屏。
5. 必须有至少两个真实交互。
6. 必须能提交学习结果。
7. 如果 AI 输出不稳定，使用系统兜底课件。
8. 后端应拒绝脚本语法错误或引用未声明函数的坏 HTML。

### FR-5：白板课件库

白板点击“课件库”后：

1. 调用 `/api/whiteboard/blog-posts?locale=zh`。
2. 读取本地 MDX 和数据库 Block。
3. 只展示 `whiteboard_category=education` 或带 `whiteboard_prompt` 的内容。
4. 用户点击任何 Block，都统一调用 `/api/teacher/courseware/generate`。

当前实现：

```text
src/app/api/whiteboard/blog-posts/route.ts
src/components/own-whiteboard/OwnWhiteboard.tsx
```

### FR-6：白板 shape 与本地保存

白板支持：

1. preview_html shape。
2. math_quiz shape。
3. 文本卡片。
4. 拖动 shape。
5. 删除/清空/下载选中 HTML。
6. 按 `studentId + lessonId` 隔离 localStorage。

当前本地存储 key：

```text
dlgzz-own-whiteboard-v1:${studentId}:${lessonId}
```

### FR-7：学习记录写入 Hermes

学生答题结果应转给 Hermes learning-assistant。

当前接口：

```text
POST /api/learning-assistant/record-quiz
GET  /api/learning-assistant/next-practice
POST /api/learning-assistant/create-student
POST /api/learning-assistant/create-bind-token
POST /api/learning-assistant/profile-activation
```

当前桥接：

```text
src/lib/hermes-learning-assistant.ts
```

支持两种模式：

1. 本地脚本：

```text
HERMES_LEARNING_ASSISTANT_SCRIPT
HERMES_LEARNING_ASSISTANT_PYTHON
```

2. 远程 Hermes：

```text
HERMES_LEARNING_ASSISTANT_URL
HERMES_LEARNING_ASSISTANT_TOKEN
```

---

## 7. 数据模型

当前教育内容使用 PostgreSQL / Supabase 风格关系表。

### 7.1 edu_workspace

用途：教育内容工作区。

当前 MVP 使用默认工作区，未来可扩展为每个老师一个 workspace。

核心字段：

```text
id
owner_user_id
name
slug
status
metadata
created_at
updated_at
```

### 7.2 edu_blog_post

用途：保存 MDX Block / 博客 / 课件文章。

核心字段：

```text
id
workspace_id
courseware_id
created_by
post_type
title
slug
locale
description
image
mdx_source
whiteboard_category
whiteboard_prompt
status
visibility
published_at
metadata
created_at
updated_at
```

### 7.3 edu_courseware

用途：保存已经生成好的 HTML 课件。

核心字段：

```text
id
workspace_id
created_by
title
slug
locale
description
source_slug
whiteboard_prompt
html_content
mdx_source
provider
model
status
visibility
metadata
created_at
updated_at
```

### 7.4 edu_board / edu_board_shape

用途：未来用于网络端长期保存白板画布与 shape。

当前白板主要仍使用 localStorage；网络端保存白板可以基于这两张表继续实现。

---

## 8. API 清单

### 8.1 课件后台 API

```text
GET  /api/teacher/courseware/mdx-posts
POST /api/teacher/courseware/generate-block
POST /api/teacher/courseware/save-block
POST /api/teacher/courseware/generate
POST /api/teacher/courseware/save-to-blog
```

### 8.2 白板 API

```text
GET  /api/whiteboard/blog-posts
POST /api/whiteboard/chat
GET  /api/whiteboard/courseware-mdx
```

### 8.3 学习助手 API

```text
POST /api/learning-assistant/create-student
POST /api/learning-assistant/create-bind-token
GET  /api/learning-assistant/next-practice
POST /api/learning-assistant/record-quiz
POST /api/learning-assistant/profile-activation
GET  /api/learning-assistant/profile-activation/[activationId]
```

---

## 9. 非功能需求

### 9.1 触屏体验

课件必须适合 iPad / 电子白板：

1. 按钮高度不低于 44px。
2. 拖拽使用 Pointer Events。
3. 拖拽区域设置 `touch-action: none`。
4. 不依赖 hover。
5. iframe 内部不得阻塞触控。

### 9.2 生成稳定性

AI 生成课件存在不稳定性，因此后端必须做保护：

1. 校验返回 JSON。
2. 校验 `operations`。
3. 校验 `preview_html.props.html`。
4. 校验 HTML 是否包含交互。
5. 校验内联脚本语法。
6. 校验内联事件引用函数是否存在。
7. 不合格时返回系统兜底课件。

### 9.3 数据安全

当前 MVP 为单人使用，后台暂未登录保护。正式平台化前必须补：

1. 后台登录保护。
2. workspace 按老师隔离。
3. API 鉴权。
4. 家长数据权限校验。
5. 白板 postMessage 来源校验。

### 9.4 部署

线上部署在 Zeabur / GitHub 触发链路。

健康检查：

```text
GET /api/health/build
```

用于确认当前线上 commit。

---

## 10. 验收标准

### AC-1：后台能打开

打开：

```text
/zh/teacher/courseware
```

应看到：

1. 新建 Block。
2. Block 列表。
3. 生成设置。
4. 课件预览区域。

### AC-2：能生成并保存 Block

输入：

```text
我想生成一个三角形求面积的课件
```

点击“生成 Block”，应生成：

1. title。
2. slug。
3. whiteboardPrompt。
4. MDX 源码。

点击“保存 Block”，应保存到数据库，并出现在列表中。

### AC-3：白板能从 Block 生成课件

打开：

```text
/zh/own-whiteboard?studentId=测试1号&lessonId=test
```

点击：

```text
课件库 → 任意 Block
```

应生成一个 iframe HTML 课件 shape。

### AC-4：生成课件可交互

课件中至少能完成：

1. 点击步骤按钮。
2. 拖动图形或调节滑块。
3. 选择答案。
4. 提交结果。

### AC-5：学习结果能保存

学生提交后，白板应显示：

```text
学习事件
学生编号
课件名：correct/total
已保存
```

---

## 11. 当前已知问题

### 11.1 后台入口不明显

目前后台没有放到首页导航，需要直接访问：

```text
/zh/teacher/courseware
```

建议下一步在首页或白板工具栏加入“课件后台”入口。

### 11.2 后台暂未登录保护

当前为了快速 MVP，不做登录保护。正式给其他老师使用前需要移入 dashboard 或加入 protected route。

### 11.3 白板网络端持久化未完成

当前 shape 主要存在浏览器 localStorage。数据库已有 `edu_board` / `edu_board_shape`，但还需要补 API 和前端保存/加载逻辑。

### 11.4 家长微信回调未最终定稿

已有 Hermes learning-assistant 方向，但真正生产环境还需明确：

1. 微信/OpenClaw 如何拿 parentId。
2. 如何把 parentId 与 studentId 绑定。
3. 云端 Hermes 是否常驻。

---

## 12. 近期开发任务建议

### Task-1：把后台入口加到网页

目标：

1. 首页或白板顶部增加“课件后台”按钮。
2. 白板底部工具栏可返回后台。
3. 后台可一键打开白板。

### Task-2：统一课件库为提示词生成模式

目标：

1. 所有课件库条目点击后都走 `/api/teacher/courseware/generate`。
2. 不再硬编码第一、第二个课件直接生成。
3. 保留已保存 HTML 的读取能力，但不作为课件库默认点击行为。

### Task-3：网络端保存白板

目标：

1. 新增保存白板 API。
2. 将 shape 写入 `edu_board_shape`。
3. 按 `studentId + lessonId` 或 boardId 恢复画布。
4. 支持长期复用。

### Task-4：后台登录保护

目标：

1. 把 `/teacher/courseware` 加入 protected route。
2. 或移动到 `/dashboard/teacher/courseware`。
3. 每个用户只看自己的 workspace。

### Task-5：Hermes 云端学习记录闭环

目标：

1. 白板提交结果写入云端 Hermes。
2. 家长微信绑定学生。
3. 家长提问时读取对应学生档案。
4. 支持错题、掌握度、复习建议。

---

## 13. WorkBuddy 使用说明

如果把本 PRD 放进 WorkBuddy，建议使用以下指令：

```text
请阅读 docs/PRD-ai-courseware-whiteboard.md。

你要在项目 /Users/baiyang/Desktop/程序/dlgzz-blog-main 中继续开发 AI 课件白板系统。

当前优先级：
1. 先确认 /zh/teacher/courseware 后台可用。
2. 确认 /zh/own-whiteboard 的课件库点击任意 Block 都走提示词生成。
3. 增加一个更明显的“课件后台”入口。
4. 不要先做多用户注册；当前只服务项目所有者本人使用。
5. 修改后运行 pnpm build。
6. 如果需要部署，推送到 GitHub main 并检查 /api/health/build。

注意：
- 不要泄露或硬编码 API Key。
- 不要删除 Hermes learning-assistant 桥接。
- 不要把第一、第二个课件重新改回硬编码直接插入。
- 生成课件必须支持触屏、互动和 quiz_result 上报。
```

---

## 14. 关键代码索引

```text
src/components/courseware/CoursewareBackendClient.tsx
  课件后台主界面

src/components/own-whiteboard/OwnWhiteboard.tsx
  自研白板、课件库、shape 渲染、学习结果上报

src/app/api/teacher/courseware/generate-block/route.ts
  一句话生成 MDX Block

src/app/api/teacher/courseware/save-block/route.ts
  保存 MDX Block 到数据库

src/app/api/teacher/courseware/generate/route.ts
  从 MDX Block 生成互动 HTML 课件

src/app/api/teacher/courseware/save-to-blog/route.ts
  保存生成好的课件到博客/数据库

src/app/api/whiteboard/blog-posts/route.ts
  白板课件库读取可用 Block

src/lib/edu-content.ts
  教育内容数据库读写

src/lib/courseware-mdx.ts
  本地 MDX 读取与保存课件 HTML 提取

src/lib/hermes-learning-assistant.ts
  白板与 Hermes learning-assistant 的桥接

src/db/schema.ts
  教育内容相关数据表定义
```
