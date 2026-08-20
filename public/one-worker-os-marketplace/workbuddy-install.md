# one-worker-os · WorkBuddy 安装规范

请直接安装并连接 one-worker-os。只有浏览器中的 OAuth 账号授权需要用户本人确认；其余步骤由你自动完成。

## 1. 唯一正确的安装对象

- 市场：`one-worker-os-marketplace`
- 完整插件：`one-worker-os@one-worker-os-marketplace`
- MCP：`one-worker-os` → `https://www.dlgzz.com/mcp`

one-worker-os 是同时包含 Skill 和 MCP 的完整 WorkBuddy 插件，不是独立 Skill。

`https://www.dlgzz.com/mcp` 是 MCP 协议地址，不是网页或授权地址。严禁直接用浏览器打开；如果看到 `-32600` 或“仅支持 POST/JSON-RPC”，只说明打开方式错误，不代表服务故障。

## 2. 先识别当前状态

- **首次安装**：当前没有 `one-worker-os@one-worker-os-marketplace`，也没有旧版。直接安装新版。
- **新版已安装**：检查并更新市场/插件，确保已启用，不要重复创建。
- **旧版迁移**：发现 `one-work-os@onework-os-marketplace`、MCP `onework-os` 或 `~/.workbuddy/skills/one-work-os` 时，先保留旧版，并行安装新版。只有新版通过本文全部验收后，才能停用并备份旧版。
- **半安装状态**：优先修复完整插件；无法修复时报告准确错误并停止，不得降级。

## 3. 获取并校验市场包

1. 读取 `https://www.dlgzz.com/one-worker-os-marketplace/release.json`。
2. 下载其中列出的 `one-worker-os-marketplace-*.zip`。
3. 将下载文件的 SHA-256 与 `release.json` 严格比对；不一致必须停止。
4. 首次安装时，将通过校验的 ZIP 原文件保存为当前用户 `.workbuddy/plugins/packages/one-worker-os-marketplace.zip`。更新已有 `zip` 市场时，先读取它已登记的持久 ZIP 源路径；下载到同目录的旁路文件，校验成功后再原子替换该源文件。不要先解压，不要在校验前覆盖旧包，不要使用临时目录，也不要依赖 Git。

SHA-256 在这里用于检查下载完整性，不是数字签名。

## 4. 用 WorkBuddy 的插件管理能力安装

优先使用 WorkBuddy 原生插件管理能力。如果当前对话没有该工具，使用终端动态定位 WorkBuddy 应用自带的 `codebuddy` CLI；它没有加入 PATH 不代表 WorkBuddy 不支持插件。

使用终端 CLI 时，**所有命令都必须显式将 `CODEBUDDY_CONFIG_DIR` 指向当前用户真实的 WorkBuddy 配置目录**：macOS/Linux 为 `$HOME/.workbuddy`，Windows 为 `$env:USERPROFILE\.workbuddy`。可同时设置 `WORKBUDDY_CONFIG_DIR` 为同一路径以兼容宿主。严禁使用临时目录、聊天沙箱 profile 或默认的 `~/.codebuddy`；如果当前终端没有权限写入真实 `.workbuddy`，应请求用户批准该写入，无法获批则报告阻塞并停止，不能在其它 profile 中假装安装成功。

- macOS 可从 `/Applications/WorkBuddy.app/Contents/Resources/app.asar.unpacked/cli/bin/codebuddy` 定位；调用每条命令时都带上 `CODEBUDDY_CONFIG_DIR="$HOME/.workbuddy"`。
- Windows 从正在运行的 `WorkBuddy.exe` 位置动态定位 `resources\app.asar.unpacked\cli\bin\codebuddy`；不要硬编码用户安装目录。
- Windows 调用前先设置 `$env:CODEBUDDY_CONFIG_DIR = Join-Path $env:USERPROFILE '.workbuddy'`；再将 `$env:WORKBUDDY_CONFIG_DIR` 设为相同值。
- 优先使用 WorkBuddy 原生插件管理能力或当前系统已有、版本符合 CLI 要求的 Node.js 执行 `cli/bin/codebuddy`。不要要求用户为了本次安装另行安装 Node.js、Git 或 PowerShell 模块；如果宿主没有原生插件管理能力，系统也没有可用运行时，则准确报告阻塞，不得把安装写到临时 profile。

`/plugin` 和 `/reload-plugins` 不是 WorkBuddy 桌面聊天中可依赖的安装 API，不要把它们当作聊天框命令。在终端中使用无前导斜杠的 CLI 子命令：

1. `plugin marketplace list` 检查新市场。
2. 未注册时执行 `plugin marketplace add <已校验的持久 ZIP 文件> --name one-worker-os-marketplace`。不得把解压后的目录作为市场源，那是不生成正式安装缓存的开发模式。
3. 已注册且类型为 `zip` 时，先确认已登记的源是当前用户 `.workbuddy` 下可写的本地 ZIP；将已校验的新包原子替换到该源路径，然后执行 `plugin marketplace update one-worker-os-marketplace`。不得仅用同名 `marketplace add`，因为它不会覆盖已存在的市场源。若历史源是 URL 或其它不可安全替换的位置，报告需要迁移并停止，不得擅自移除一个已授权的正式市场。
4. 如果发现是之前失败安装留下的 `directory` 类型，先移除**这个新 ID 的半安装市场**，再用已校验的持久 ZIP 重新添加；不得动旧 ID 或旧用户数据。
5. 首次安装执行 `plugin install one-worker-os@one-worker-os-marketplace --scope user`；已有新版执行 `plugin update one-worker-os@one-worker-os-marketplace --scope user`。
6. 执行 `plugin enable one-worker-os@one-worker-os-marketplace --scope user`。

不能只依据 CLI 打印的 `installed` 或 `enabled` 判断成功。命令完成后必须直接核验当前用户真实目录中的以下状态：

- `$HOME/.workbuddy/plugins/known_marketplaces.json` 包含 `one-worker-os-marketplace`，且市场类型为 `zip`；
- `$HOME/.workbuddy/plugins/installed_plugins.json` 包含 user scope 的 `one-worker-os@one-worker-os-marketplace`；
- `$HOME/.workbuddy/settings.json` 的 `enabledPlugins` 对该完整插件 ID 为 `true`；
- 安装缓存真实位于 `$HOME/.workbuddy/plugins/cache/one-worker-os-marketplace/one-worker-os/<version>`，且三件套齐全。

Windows 使用对应的 `$env:USERPROFILE\.workbuddy\...` 路径。任一真实状态缺失都属于安装失败，不得要求用户靠重启修复，也不得声称已经安装。

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
4. 在 WorkBuddy 的“自定义连接器 → 我的 MCP → one-worker-os”中点击“连接/重连”，由 WorkBuddy 自动打开带完整参数的 OAuth 授权页。不得直接浏览 `/mcp`，也不得手工拼接 OAuth 地址。授权页只由用户本人点击允许；如果没有会员权益，只提醒用户开通或兑换，不得改用 API Key。
5. OAuth 同一会员账号同一时间只保留 1 个有效的 one-worker-os 连接。新位置只有在授权和令牌交换都成功后才会替换旧连接；拒绝、取消或连接失败不得让原连接掉线。替换只影响 one-worker-os，不影响网站登录和会员权益。
6. 授权后成功调用 `onework_get_entitlements`，确认 `authorizationPolicy.mode` 为 `single_active_connection`、`maxActiveConnections` 为 `1`，且响应不再返回旧版 `deviceLimit`；再成功调用一次 `onework_search_knowledge`。

上述六项全部通过后，才能告诉用户“安装成功”。
