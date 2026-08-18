# one-worker-os for WorkBuddy

This is a thin WorkBuddy/CodeBuddy plugin. It installs the `one-worker-os` Skill and connects the remote `one-worker-os` MCP server at `https://www.dlgzz.com/mcp`.

## Authentication and data freshness

The MCP entry intentionally contains only the documented `type`, `url`, and `description` fields. A current WorkBuddy build follows the MCP OAuth 2.1 challenge from the server and opens the authorization flow. No client secret or API key belongs in the plugin.

Knowledge and account data are read from the remote MCP server when a tool is called. Updating cloud knowledge therefore does not require reinstalling the plugin.

The bundled Node.js scripts remain available only as a legacy fallback for hosts that cannot connect to MCP. They use `ONEWORK_API_KEY` and `ONEWORK_DEVICE_ID` from the existing managed installation file; never paste those values into a conversation or commit them.

## Install from a Git marketplace

This repository already has the supported layout: its root contains `.codebuddy-plugin/marketplace.json`, whose plugin source is `./plugins/one-worker-os`. Run these commands:

```text
/plugin marketplace add dl-gzz/dlgzz-blog
/plugin install one-worker-os@one-worker-os-marketplace
/plugin enable one-worker-os@one-worker-os-marketplace --scope user
```

Run `/reload-plugins --force` after installation to activate the Skill and MCP server without restarting WorkBuddy. If the host does not support hot reload, restart WorkBuddy. Then verify `one-worker-os` is shown as enabled under **专家·技能·连接器 → 技能 → 我安装的**; an entry in the installed-plugin registry alone is not enough.

In WorkBuddy, open **自定义连接器 → 我的 MCP → one-worker-os** and choose **连接/重连**. WorkBuddy then opens the OAuth page with the required client parameters. Do not open `https://www.dlgzz.com/mcp` directly in a browser: it is the machine JSON-RPC endpoint, so a browser GET correctly returns a `-32600` / POST-only message. A successful connection exposes these tools:

- `onework_resolve_capability`
- `onework_search_knowledge`
- `onework_query_analytics`
- `onework_get_entitlements`
- `onework_get_usage`

## Local acceptance test

Build the deterministic marketplace bundle from the application repository:

```bash
pnpm one-worker-os:plugin:package
```

Extract `public/one-worker-os-marketplace/one-worker-os-marketplace-<version>.zip`, then use the extracted absolute directory:

```text
/plugin marketplace add /absolute/path/to/one-worker-os-marketplace
/plugin install one-worker-os@one-worker-os-marketplace
/plugin enable one-worker-os@one-worker-os-marketplace --scope user
/reload-plugins --force
```

Try `WorkBuddy 如何开启完全访问？`, followed by `下一步呢？`. The second query must keep the prior WorkBuddy topic and call live knowledge search again.

## Compatibility assumption

The official documentation warns that HTTP(S)-URL marketplaces can have relative-path installation failures. This package therefore does not advertise a raw `marketplace.json` URL. Git marketplaces and local marketplace directories are the documented installation paths used here. OAuth requires a WorkBuddy version with MCP OAuth support; on older builds, use the legacy managed Skill installer until WorkBuddy is upgraded.

Official references:

- https://www.codebuddy.cn/docs/cli/plugins-reference
- https://www.codebuddy.cn/docs/cli/plugin-marketplaces
- https://www.codebuddy.cn/docs/cli/mcp
