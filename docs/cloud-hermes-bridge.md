# 三高健康管家 Hermes Bridge

本文记录当前三高健康管家连接的云端 Hermes 运行环境。不要把这里和旧学习助手服务器混用。

## 当前服务器

- 项目：三高健康管家
- 腾讯云轻量应用服务器实例：`lhins-8wj0z3y8`
- 公网 IP：`124.223.183.178`
- Bridge 端口：`7319`
- Hermes base profile：`default`
- Bridge service：`hermes-bridge.service`
- Bridge path：`/home/ubuntu/hermes-bridge/hermes-bridge.cjs`
- Bridge data：`/home/ubuntu/hermes-bridge/data`

旧学习助手服务器 `1.15.141.88` 只属于学习项目，不用于三高健康管家。

## 本地环境变量

本地网站通过 `.env` 连接云端 Bridge：

```env
HERMES_BRIDGE_URL="http://124.223.183.178:7319"
HERMES_BRIDGE_TOKEN="<shared-secret>"
HERMES_BRIDGE_PORT=7319
HERMES_LEARNING_ASSISTANT_URL=""
```

`HERMES_BRIDGE_TOKEN` 必须和云服务器 `/home/ubuntu/hermes-bridge/.env` 中的值一致。不要把真实 Token 写入文档、截图或聊天记录。

## 浏览器端产品口径

三高健康管家不是微信中转站。对用户可以这样命名：

- 用户端：专属健康管家
- 后台：健康管家实例
- 技术层：Hermes Profile
- 数据层：健康记录和趋势复盘

每个用户应该拥有一个独立 Hermes Profile。Profile 不是单纯的聊天记录，它会承载该用户的角色设定、配置、记忆、健康数据上下文、工具权限和用量统计。

## 网站到 Hermes 流程

```text
浏览器 UI
-> Next.js API
-> HERMES_BRIDGE_URL
-> 云端 Hermes Bridge
-> 独立 Hermes Profile
-> 三高记录 / 趋势整理 / 复盘提醒
```

生产环境不要让网站直接执行 Hermes CLI。网站只调用 HTTP Bridge，Bridge 在云服务器上负责创建和管理 Profile。

## 当前 Bridge 接口

- `GET /health`
- `POST /assistants/provision`
- `GET /activations/status?assistantId=...`
- `POST /pairing/approve`
- `POST /api/learning-assistant/run`

三高浏览器端主要依赖 `/health` 和 `/assistants/provision`。创建三高实例时，网站会传：

```json
{
  "roleId": "health",
  "connectionMode": "browser_profile"
}
```

Bridge 收到 `browser_profile` 后只创建独立 Hermes Profile，不返回微信/iLink 二维码。如果后续要在浏览器里直接发起对话，需要继续补一个 Profile chat/run 接口。

## 本地连通性检查

```sh
curl "$HERMES_BRIDGE_URL/health" \
  -H "Authorization: Bearer $HERMES_BRIDGE_TOKEN"
```

期望关键信号：

```json
{
  "success": true,
  "status": "ok",
  "mode": "hermes"
}
```

## Profile 创建策略

Bridge 创建新用户实例时使用：

```sh
hermes profile create <profile> --clone --clone-from default
```

这样每个用户会从云端 `default` profile 复制模型、环境变量和基础 SOUL，再写入三高健康管家的服务设定。不要用 `--clone-all` 给外部用户复制历史会话和私人记忆。

## 安全清单

- Bridge Token 使用长随机值，本地 `.env` 与云端 `.env` 保持一致。
- 不在日志、文档、截图或聊天里展示 Token。
- 公网开放 `7319` 前确认 Bridge 有鉴权。
- 正式上线建议加 HTTPS 或反向代理。
- 如果用户量增加，优先改成反向代理、访问控制和独立数据存储。
- `/health` 只返回状态，不泄露 Profile 凭据。
