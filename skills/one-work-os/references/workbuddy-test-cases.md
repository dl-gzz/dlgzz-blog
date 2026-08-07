# WorkBuddy first test

Use these prompts after installing the Skill. Keep the first run read-only and ask for confirmation before creating or changing anything in WorkBuddy.

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
- Do not claim that `presentation.create` exists merely because it is registered in OneWorkOS.
- If the host has no presentation tool, provide the exact next step and state the missing capability.

## Image and source check

Prompt:

> 把刚才日报自动化用到的图片和出处都给我。

Expected behavior:

- Return at most one directly relevant image and a clickable official source.
- Use the structured `assets[]` URL, not an image URL copied from article text.
- If the host cannot render the image, show the fallback link and say that rendering still depends on the host.
