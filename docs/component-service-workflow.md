# 组件博客上架标准流程

这份文档定义一个原则：

一篇可安装组件博客，本身就必须同时承担三件事：

1. 人类说明书
2. 安装清单来源
3. OpenClaw/agent 说明来源

也就是说，后面你开发任何新 shape，不再单独维护三套材料，而是统一收敛到同一篇博客文章里。

## 一篇组件博客必须包含的三层

### 1. 正文

给人看。

作用：

- 告诉用户这个组件做什么
- 解释为什么值得安装
- 说明安装后怎么用
- 建立销售与理解

### 2. service_manifest

给安装系统看。

作用：

- 定义 serviceId
- 定义 shapeType
- 定义入口卡片的尺寸、标题、图标、默认 props
- 定义安装后如何进入白板
- 定义 pricing / permissions / outputs

### 3. agent_spec

给 OpenClaw / agent 看。

作用：

- 定义这个组件适合什么任务
- 定义不适合什么任务
- 定义输入输出
- 定义 agent 应优先调用哪个 API / shape
- 定义执行时的注意事项

注意：

- `agent_spec` 默认不显示给人
- 它通过安装接口跟随文章一起下到线下
- 线下页面显示的仍然是正文

## 标准开发流程

### 第一步：先定义 shape 本体

你先明确：

- 组件名
- shape_type
- 它是入口组件还是流程中间节点
- 最小可用输入是什么
- 最小可用结果是什么

### 第二步：写组件博客正文

正文只负责人类理解，不负责结构化协议。

建议正文一定回答这几个问题：

- 这个组件是做什么的
- 它解决什么卡点
- 安装后怎么用
- 适合谁
- 安装成功后应该看到什么

### 第三步：补 service_manifest

这是安装协议层。

必须稳定的字段：

- `id`
- `entry.shape_type`
- `source.article_slug`
- `runtime.route`
- `pricing.mode`

### 第四步：补 agent_spec

这是 OpenClaw 协议层。

至少要写：

- `purpose`
- `whenToUse`
- `whenNotToUse`
- `inputs`
- `outputs`
- `actions`
- `operatingNotes`

### 第五步：测试安装链

至少验证四件事：

1. 商店接口 `/api/services/install` 能返回 `manifest + article_bundle`
2. 线下点击安装后，Shape 栏出现组件
3. 本地说明页能显示博客正文
4. 线下本地 bundle 里能看到 `article.agentSpec`

## 定价建议

### free

适合：

- 引流组件
- 基础能力
- 想快速验证安装链的组件

### premium

适合：

- 一组工作流里常用的会员能力
- 需要订阅身份校验的组件

### license

适合：

- 单点爆款组件
- 可独立售卖的稳定工具
- 用户愿意一次性买断的能力

## 命名建议

建议统一三层命名关系：

- 博客标题：面向销售与理解
- manifest.name：面向安装与组件识别
- agent_spec.title：面向 agent 调用

三者可以一致，也可以轻微不同，但不要完全割裂。

## 以后新增组件怎么做

直接复制这个模板：

- `docs/templates/component-service.zh.mdx.template`

然后替换：

- 标题
- slug
- shape_type
- API
- 输入输出
- 定价模式

## 现在这套规则的结果

以后商店中的组件博客会天然具备两种能力：

- 人类可以直接阅读、购买、理解
- OpenClaw 可以直接读取、理解、调用

安装到线下时，同步下来的就不只是“文章”或“组件”，而是一个完整的组件服务包。
