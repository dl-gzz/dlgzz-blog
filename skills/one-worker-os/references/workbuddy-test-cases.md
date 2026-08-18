# WorkBuddy first test

Use these prompts after installing the Skill. Keep the first run read-only and ask for confirmation before creating or changing anything in WorkBuddy.

## Installation and authorization

Run these commands from the installed Skill folder before testing content:

```bash
node scripts/update-one-worker-os-skill.mjs --force --check-only --json
node scripts/query-knowledge.mjs --query "WorkBuddy 怎么连接 QQ 邮箱" --pack auto --limit 4 --json
```

Expected behavior:

- The updater returns the installed and latest versions without consuming a one-time install authorization.
- The knowledge request succeeds only when both `ONEWORK_API_KEY` and `ONEWORK_DEVICE_ID` were installed and the current device remains bound.
- A missing device ID produces a friendly reinstallation message. It must not print the API Key, silently search the web, or answer from model memory.

## Pack routing

Run these two read-only queries:

```bash
node scripts/query-knowledge.mjs --query "小红书开店需要准备什么" --pack auto --limit 4 --json
node scripts/query-knowledge.mjs --query "小红书店铺怎么设置发货" --pack auto --limit 4 --json
```

Expected behavior:

- The first response has `packId: "xhs-open-shop-v1"`.
- The second response has `packId: "xhs-operations-v1"`; “店铺” must not incorrectly force the open-shop pack when the real intent is logistics or order operations.

## Short follow-up

After discussing “小红书店铺设置发货”, ask:

> 下一步呢？

The host should preserve only that most recent explicit topic and run:

```bash
node scripts/query-knowledge.mjs --query "下一步呢" --context "小红书店铺设置发货" --pack auto --limit 4 --json
```

Expected behavior:

- The request stays in `xhs-operations-v1` and the effective query contains both the prior topic and the follow-up.
- It must not switch to the WorkBuddy pack merely because the follow-up is short.

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

## Image and source check

Prompt:

> 把刚才日报自动化用到的图片和出处都给我。

Expected behavior:

- Return at most one directly relevant image and a clickable official source.
- Use the structured `assets[]` URL, not an image URL copied from article text.
- If the host cannot render the image, show the fallback link and say that rendering still depends on the host.

## Video and source check

Use a known knowledge result whose `resources[]` contains `type: "video"`, then ask:

> 把这一步对应的视频和出处给我。

Expected behavior:

- Return the exact video URL as a named clickable link.
- When a returned thumbnail or cover exists, make it a clickable cover pointing to the same video.
- Include the exact returned article `sourceUrl` separately as the source.
- Do not omit the video, substitute a guessed platform URL, or claim inline playback unless the host actually rendered a player.
