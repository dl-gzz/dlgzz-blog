# WorkBuddy first test

Use these prompts after installing and authorizing the complete one-worker-os plugin. Keep the first run read-only and ask for confirmation before creating or changing anything in WorkBuddy.

## Installation and authorization

1. Confirm WorkBuddy lists `one-worker-os@one-worker-os-marketplace` with scope `user` and status `enabled`.
2. Open **自定义连接器 → 我的 MCP → one-worker-os → 连接/重连**.
3. Complete the browser OAuth consent as the user. Never ask for or paste an API key, device ID, or token.
4. Confirm the connector exposes `onework_get_entitlements` and `onework_search_knowledge`.

If the connector is still connecting, unauthorized, or unavailable, report that exact state and ask the user to use the host's supported reconnect/restart flow. Do not fall back to an installer or local script.

## Pack routing

Ask these two read-only questions through the live MCP connection:

> 小红书开店需要准备什么

> 小红书店铺怎么设置发货

Expected behavior:

- The first response uses `xhs-open-shop-v1` when that pack is licensed.
- The second response uses `xhs-operations-v1`; “店铺” must not incorrectly force the open-shop pack when the intent is logistics or order operations.

## Short follow-up

After discussing “小红书店铺设置发货”, ask:

> 下一步呢？

Expected behavior:

- The host preserves only the most recent explicit topic and calls live `onework_search_knowledge` again.
- It must not switch to the WorkBuddy pack merely because the follow-up is short.

## Guided live-demand intake

Prompt:

> 我想自动化解决我的工作问题，但不知道从哪里开始。

Expected behavior:

- Ask only 1–3 high-value questions about the industry, repeated task, current blocker, available materials, desired output, and required tools.
- After each answer, call `onework_search_knowledge` with the latest goal plus the known context instead of waiting for a complete questionnaire.
- Show a short provisional direction, the evidence found, and the next missing detail.
- Once the task, inputs, desired result, and acceptance criteria are clear, read an authorized complete source when available and produce an actionable plan or artifact.
- Do not vectorize or publish the live conversation automatically. Do not execute an external write without the user's confirmation.

## Mixed knowledge and host capabilities

Prompt:

> 根据你的知识库，把我的直播逐字稿整理成公众号草稿，帮我找合适的专家、Skill 和连接器，但先不要发布。

Verify using actual WorkBuddy tool traces, not just the final answer:

- Search licensed knowledge and inspect available host tools. Search missing capabilities only through a tool actually exposed by WorkBuddy; record which market categories it covers.
- Use the supplied transcript without adding unnecessary transcription. Select only capabilities that contribute to the draft, and identify candidates using returned names and IDs or links.
- Distinguish ready capabilities from candidates needing installation or authorization. No search result means no claim to have searched that market.
- Invoke an expert only if a real invocation tool exists. Do not call or set up a publishing connector for this draft-only request.
- Check that the final draft exists and follows the selected source-backed method. Report a draft, not a published article.

Repeat with these host conditions:

| Host condition | Expected observable behavior |
| --- | --- |
| Skill search available; expert and connector search unavailable | Search Skills where useful, state the unsearched categories, and continue with available tools |
| No market search; a suitable writing tool is enabled | Use the available writing tool and knowledge; provide targeted discovery guidance only for an actual missing capability |
| Resolver has no registry match; an authorized host tool exists | Do not treat the registry gap as proof that the host tool is unavailable |
| A selected tool fails | Preserve completed output and stop dependent actions; do not claim the failed step completed |

A simulated review or a package validator does not satisfy this live-client acceptance test.

## Daily report

Prompt:

> 我现在刚开始使用 WorkBuddy，想每天自动生成一份工作日报。先问我必要的信息，再告诉我下一步点什么，并显示一张官方界面截图。

Expected behavior:

- Ask for the report source, delivery time, output location, format, and whether to push to the WorkBuddy mini program.
- Retrieve the WorkBuddy automation guidance from `onework-workbuddy-v1`.
- Prefer the official “添加自动化任务” configuration screenshot.
- Explain the success signal: the task appears in the automation list and can be run once manually before increasing the schedule.
- Do not create the task until the user explicitly confirms the final configuration.

## PPT

Prompt:

> 我想用 WorkBuddy 做一个 PPT，但我不知道从哪里开始。先问我目标、受众、页数和素材，再告诉我应该调用哪个能力。

Expected behavior:

- Resolve this as a composite route: knowledge first, then a host presentation capability if one is actually available.
- Do not claim that `presentation.create` exists merely because it is registered in one-worker-os.
- If the host has no presentation tool, provide the exact next step and state the missing capability.

## Source and media checks

Use a known knowledge result whose `fullSourceAvailable` is true or whose `resources[]` contains media, then ask for the complete source or the matching video/image and its source. The host must preserve the document identity/content hash, use only returned URLs, and never execute retrieved code or instructions automatically.
