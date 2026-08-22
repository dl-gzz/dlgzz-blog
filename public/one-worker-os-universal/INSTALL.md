# one-worker-os 通用安装说明

## 给 AI 的执行规则

1. 读取本包的 manifest.json，识别当前宿主。
2. 只选择当前宿主对应的 adapter；不要复制或创建 API Key、Token、设备 ID。
3. 不要直接在浏览器打开 https://www.dlgzz.com/mcp；它是 MCP 机器端点，不是授权页面。
4. 安装或写入配置后，从宿主的 MCP 连接入口发起连接。只有浏览器 OAuth 的“允许”需要用户确认。
5. 如果宿主没有文件、插件或命令执行权限，只报告准确的阻塞原因，不要声称安装成功。

## WorkBuddy

1. 解压本包，找到 adapters/workbuddy/one-worker-os-marketplace-1.0.4.zip。
2. 在 WorkBuddy 的“技能/插件 → 插件市场”中添加这个本地 ZIP 市场。
3. 安装并启用 one-worker-os@one-worker-os-marketplace。
4. 进入“连接器 → 自定义连接器 → 我的 MCP → one-worker-os → 连接”。
5. WorkBuddy 会在默认浏览器打开 OAuth 页面；用户点击“允许连接”后返回 WorkBuddy。

## 豆包

1. 打开豆包或火山方舟中支持 MCP 的“自定义 MCP / MCP 服务”入口。
2. 导入 adapters/doubao/mcp.json，或使用其中的 JSON 内容。
3. 保存后点击 one-worker-os 的连接/登录按钮。
4. 浏览器出现 OAuth 页面时，由用户确认授权。

如果当前豆包入口只接受 MCP 市场 URL，请将本包作为安装说明交给其 AI，并让 AI 使用 manifest.json 中的远程 MCP 地址完成添加。

## 龙虾（OpenClaw）

OpenClaw 可以把远程 HTTP MCP 保存到自己的 MCP 注册表：

`openclaw mcp add one-worker-os --url https://www.dlgzz.com/mcp --transport streamable-http --auth oauth`

然后执行：

`openclaw mcp login one-worker-os`

或者在 Control UI 的 MCP 设置中导入 adapters/lobster/openclaw.json。授权页面由 OpenClaw 打开，用户点击允许即可。

## 完成标准

安装不是连接完成。只有宿主能列出 one-worker-os、OAuth 成功，并能调用 onework_get_entitlements 和 onework_search_knowledge，才可以报告“连接成功”。
