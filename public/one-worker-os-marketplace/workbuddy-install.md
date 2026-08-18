# one-worker-os · WorkBuddy 安装规范

请直接安装并连接 one-worker-os。只有浏览器中的 OAuth 账号授权需要用户本人确认；其余步骤由你自动完成。

## 1. 唯一正确的安装对象

- 市场：`one-worker-os-marketplace`
- 完整插件：`one-worker-os@one-worker-os-marketplace`
- MCP：`one-worker-os` → `https://www.dlgzz.com/mcp`

one-worker-os 是同时包含 Skill 和 MCP 的完整 WorkBuddy 插件，不是独立 Skill。

## 2. 先识别当前状态

- **首次安装**：当前没有 `one-worker-os@one-worker-os-marketplace`，也没有旧版。直接安装新版。
- **新版已安装**：检查并更新市场/插件，确保已启用，不要重复创建。
- **旧版迁移**：发现 `one-work-os@onework-os-marketplace`、MCP `onework-os` 或 `~/.workbuddy/skills/one-work-os` 时，先保留旧版，并行安装新版。只有新版通过本文全部验收后，才能停用并备份旧版。
- **半安装状态**：优先修复完整插件；无法修复时报告准确错误并停止，不得降级。

## 3. 获取并校验市场包

1. 读取 `https://www.dlgzz.com/one-worker-os-marketplace/release.json`。
2. 下载其中列出的 `one-worker-os-marketplace-*.zip`。
3. 将下载文件的 SHA-256 与 `release.json` 严格比对；不一致必须停止。
4. 解压到当前用户 `.workbuddy` 下的持久目录，使用直接包含 `.codebuddy-plugin/marketplace.json` 的 `one-worker-os-marketplace` 根目录。不要使用临时目录，也不要依赖 Git。

SHA-256 在这里用于检查下载完整性，不是数字签名。

## 4. 用 WorkBuddy 的插件管理能力安装

优先使用 WorkBuddy 原生插件管理能力。如果当前对话没有该工具，使用终端动态定位 WorkBuddy 应用自带的 `codebuddy` CLI；它没有加入 PATH 不代表 WorkBuddy 不支持插件。

- macOS 可从 `/Applications/WorkBuddy.app/Contents/Resources/app.asar.unpacked/cli/bin/codebuddy` 定位。
- Windows 从正在运行的 `WorkBuddy.exe` 位置动态定位 `resources\app.asar.unpacked\cli\bin\codebuddy`；不要硬编码用户安装目录。
- 必要时用 WorkBuddy 自带的 Electron/`WorkBuddy.exe` 配合 `ELECTRON_RUN_AS_NODE=1` 运行 CLI。不要要求用户另行安装 Node.js、Git 或 PowerShell 模块。

`/plugin` 和 `/reload-plugins` 不是 WorkBuddy 桌面聊天中可依赖的安装 API，不要把它们当作聊天框命令。在终端中使用无前导斜杠的 CLI 子命令：

1. `plugin marketplace list` 检查新市场。
2. 未注册时执行 `plugin marketplace add <本地市场根目录> --name one-worker-os-marketplace`；已注册时更新该市场。
3. 执行 `plugin install one-worker-os@one-worker-os-marketplace --scope user`。
4. 执行 `plugin enable one-worker-os@one-worker-os-marketplace --scope user`。

如果 WorkBuddy 当前版本无法热加载，清楚地提醒用户完整退出并重启 WorkBuddy。重启前不得声称已完成连接。

## 5. 严禁的降级路径

- 不得把 GitHub 仓库中的 `skills/one-worker-os` 单独复制到 `~/.workbuddy/skills`。
- 不得使用只安装 Skill 的推荐市场工具作为替代。
- 不得使用旧版安装器。
- 不得创建、索要或展示 `ONEWORK_API_KEY`、`ONEWORK_DEVICE_ID`、Key 或 Token。
- 完整插件无法安装时，必须报告准确的阻塞原因并停止，不得降级成独立 Skill。

## 6. 只有真实验收后才能说“安装成功”

1. 插件列表显示 `one-worker-os@one-worker-os-marketplace`，作用域为 `user`，状态为已启用。
2. 实际安装目录属于 WorkBuddy 插件缓存，并同时包含 `.codebuddy-plugin/plugin.json`、`skills/one-worker-os/SKILL.md` 和 `.mcp.json`。
3. MCP/自定义连接器出现 `one-worker-os`，地址为 `https://www.dlgzz.com/mcp`。
4. 发起 one-worker-os 的 OAuth 网页授权，由用户本人点击允许。如果没有会员权益，只提醒用户开通或兑换，不得改用 API Key。
5. 授权后成功调用 `onework_get_entitlements`，并成功调用一次 `onework_search_knowledge`。

上述五项全部通过后，才能告诉用户“安装成功”。
