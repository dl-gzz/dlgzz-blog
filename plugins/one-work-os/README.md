# OneWorkOS for WorkBuddy

This is a thin WorkBuddy/CodeBuddy plugin. It installs the `one-work-os` Skill and connects the remote OneWorkOS MCP server at `https://www.dlgzz.com/mcp`.

## Authentication and data freshness

The MCP entry intentionally contains only the documented `type`, `url`, and `description` fields. A current WorkBuddy build follows the MCP OAuth 2.1 challenge from the server and opens the authorization flow. No client secret or API key belongs in the plugin.

Knowledge and account data are read from the remote MCP server when a tool is called. Updating cloud knowledge therefore does not require reinstalling the plugin.

The bundled Node.js scripts remain available only as a legacy fallback for hosts that cannot connect to MCP. They use `ONEWORK_API_KEY` and `ONEWORK_DEVICE_ID` from the existing managed installation file; never paste those values into a conversation or commit them.

## Install from a Git marketplace

This repository already has the supported layout: its root contains `.codebuddy-plugin/marketplace.json`, whose plugin source is `./plugins/one-work-os`. Run these two commands:

```text
/plugin marketplace add dl-gzz/dlgzz-blog
/plugin install one-work-os@onework-os-marketplace
```

Run `/reload-plugins` after installation to activate the Skill and MCP server without restarting WorkBuddy.

Open `/mcp`, select `onework-os`, and complete the browser authorization if WorkBuddy asks. A successful connection exposes these tools:

- `onework_resolve_capability`
- `onework_search_knowledge`
- `onework_query_analytics`
- `onework_get_entitlements`
- `onework_get_usage`

## Local acceptance test

Build the deterministic marketplace bundle from the application repository:

```bash
pnpm onework:plugin:package
```

Extract `public/onework-marketplace/onework-os-marketplace-<version>.zip`, then use the extracted absolute directory:

```text
/plugin marketplace add /absolute/path/to/onework-marketplace
/plugin install one-work-os@onework-os-marketplace
/reload-plugins
```

Try `WorkBuddy 如何开启完全访问？`, followed by `下一步呢？`. The second query must keep the prior WorkBuddy topic and call live knowledge search again.

## Compatibility assumption

The official documentation warns that HTTP(S)-URL marketplaces can have relative-path installation failures. This package therefore does not advertise a raw `marketplace.json` URL. Git marketplaces and local marketplace directories are the documented installation paths used here. OAuth requires a WorkBuddy version with MCP OAuth support; on older builds, use the legacy managed Skill installer until WorkBuddy is upgraded.

Official references:

- https://www.codebuddy.cn/docs/cli/plugins-reference
- https://www.codebuddy.cn/docs/cli/plugin-marketplaces
- https://www.codebuddy.cn/docs/cli/mcp
