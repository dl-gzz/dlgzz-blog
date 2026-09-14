# one-worker-os · WorkBuddy 安装说明

请直接安装并连接 one-worker-os。安装、校验和插件管理由 WorkBuddy 完成，只有浏览器里的 OAuth“允许连接”需要用户确认。

## 只有一个正确对象

- 市场：`one-worker-os-marketplace`
- 插件：`one-worker-os@one-worker-os-marketplace`
- MCP：`one-worker-os` → `https://www.dlgzz.com/mcp`

这是一个同时包含 Skill 和 MCP 的完整插件，不是独立 Skill。不要把 MCP 地址当网页打开，也不要创建、索取或粘贴 API Key、Token、设备 ID。

## 安装步骤

1. 从 `https://www.dlgzz.com/one-worker-os-marketplace/release.json` 下载列出的 ZIP，并核对 SHA-256。
2. 将已校验的 ZIP 保存到当前用户的持久 `.workbuddy` 目录，不要使用临时目录或 Git。
3. 用 WorkBuddy 原生插件管理能力；没有该工具时，使用 WorkBuddy 自带的 `codebuddy` CLI，并明确指向真实 `.workbuddy` 配置目录。
4. 检查并注册市场 `one-worker-os-marketplace`，然后安装并启用 `one-worker-os@one-worker-os-marketplace`，作用域为 `user`。
5. 在 WorkBuddy 的“自定义连接器 → 我的 MCP → one-worker-os”点击“连接”。浏览器打开授权页后，用户核对账号并点击“允许连接”。
6. 返回 WorkBuddy，确认插件已启用、MCP 已连接，并能调用 `onework_get_entitlements` 与 `onework_search_knowledge`。

## 失败时怎么处理

- 只看到安装成功但没有 MCP：先检查插件缓存是否同时包含 `.codebuddy-plugin/plugin.json`、`skills/one-worker-os/SKILL.md` 和 `.mcp.json`；必要时完整退出并重启 WorkBuddy。
- 看到 `-32600` 或“只支持 POST/JSON-RPC”：说明把机器端点当网页打开了，应回到客户端点击连接。
- 没有会员权益：开通或兑换会员后再授权，不要切换到 API Key。
- 安装失败：报告实际错误并停止，不要复制 GitHub 中的 Skill，也不要使用旧版安装器。

## 连接规则

同一会员账号同一时间只有一个有效的 one-worker-os OAuth 连接。新的授权和令牌交换成功后，旧连接才会失效；取消或失败不会影响原连接。会员、网站登录和云端知识不受影响。
