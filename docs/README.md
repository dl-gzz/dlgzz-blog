# DLGZZ 文档索引

这份索引用于快速定位当前仓库里最重要的系统文档。

当前仓库：`dlgzz-blog-main`
定位：线上商店 / 组件生产端 / 文章与安装清单来源

## 优先阅读

### 1. 图片组件统一规范

- 文件：`docs/IMAGE_COMPONENT_STANDARD.md`
- 用途：约束线上图片组件在下载到线下前必须满足的返回协议、参考图交互和验收标准
- 什么时候看：准备上架新的图片组件时先看这个

### 2. 组件服务工作流

- 文件：`docs/component-service-workflow.md`
- 用途：说明一篇组件文章如何同时承担人类说明、安装清单、Agent 说明三种角色
- 什么时候看：准备写新组件博客或上架新组件时看这个

### 3. 本地客户端安装说明

- 文件：`docs/local-client-install.md`
- 用途：说明线上点击“安装到客户端”时，商店端会把组件发往哪个本地目标
- 什么时候看：排查安装目标、网关地址和环境变量时看这个

### 4. 自动升级后续装流程

- 文件：`docs/auto-upgrade-component-install-flow.md`
- 用途：记录“更新完成后自动续装组件”的产品流程

### 5. 图片组件开发清单模板

- 文件：`docs/templates/IMAGE_COMPONENT_CHECKLIST_TEMPLATE.md`
- 用途：开发新图片组件时直接复制填空，避免漏掉返回协议、参考图感应、安装链路和交付验收

## 基础能力文档

### 6. AI API 说明

- 文件：`docs/ai-api.md`

### 7. OSS 相关

- 文件：`docs/aliyun-oss.md`
- 文件：`docs/oss-setup.md`

## 建议阅读顺序

如果你要上架一个新的图片组件，推荐按这个顺序：

1. `IMAGE_COMPONENT_STANDARD.md`
2. `templates/IMAGE_COMPONENT_CHECKLIST_TEMPLATE.md`
3. `component-service-workflow.md`
4. `local-client-install.md`

如果你要排查“为什么线上点了安装，线下没收到”，推荐按这个顺序：

1. `local-client-install.md`
2. `component-service-workflow.md`

## 一句话理解这个仓库

这个仓库负责定义组件长什么样、文章怎么写、安装清单怎么发给线下，以及用户在商店看到的组件说明是什么。
