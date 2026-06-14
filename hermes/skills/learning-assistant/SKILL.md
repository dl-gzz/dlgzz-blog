---
name: dlgzz-learning-assistant
description: AI 学习助手后端。管理学生答题记录、掌握度、错题复习、家长绑定和家长问答。
version: 0.1.0
platforms: [macos]
metadata:
  hermes:
    tags: [learning-assistant, education, whiteboard, parent-weixin, student-records]
    category: education
---

# DLGZZ Learning Assistant

这个 skill 是 AI 学习助手的唯一后端和数据大脑。白板前端只负责渲染题目组件、收集答案，并把结构化答题结果交给本 skill。

## When To Use

使用本 skill 处理这些请求：

- 老师在白板里要求给某个学生出题、生成练习、生成互动课件
- 白板组件完成答题后上报 `quiz_result`
- 查询或生成某个学生的下一次复习题
- 创建学生编号或设置学生档案
- 生成家长绑定 token、处理家长扫码绑定
- 家长通过微信询问孩子当天学习情况、薄弱点、错题、复习建议

## Data Source

所有 profile 共享同一个数据目录。默认位置：

```text
/Users/baiyang/.hermes/learning-assistant-data/
  students/<学生编号>/
    profile.json
    records.jsonl
    mastery.json
    wrongbook.jsonl
  bindings.json      # { "家长微信ID": ["学生编号1", "学生编号2"] }
  bind_tokens.json
```

可通过环境变量 `LEARNING_ASSISTANT_DATA_DIR` 覆盖数据目录。不要把数据放回各 profile 的 skill 副本目录，否则老师白板和家长 bot 会读写不同数据源。

学生编号允许中文，例如 `1号`。禁止空值、斜杠、反斜杠、空字节和路径穿透。

## Commands

统一入口：

```bash
python3 /Users/baiyang/.hermes/skills/learning-assistant/scripts/learning_assistant.py <command> [args]
```

常用命令：

```bash
python3 /Users/baiyang/.hermes/skills/learning-assistant/scripts/learning_assistant.py create_student --student-id '1号' --name '张三' --grade '一年级'
python3 /Users/baiyang/.hermes/skills/learning-assistant/scripts/learning_assistant.py record_quiz --json '{"studentId":"1号","quiz":{"topic":"10以内加减法","total":2,"correct":1,"questions":[{"question":"1+1","studentAnswer":"2","correctAnswer":"2"},{"question":"7+8","studentAnswer":"14","correctAnswer":"15"}],"wrong":[{"question":"7+8","studentAnswer":"14","correctAnswer":"15"}]}}'
python3 /Users/baiyang/.hermes/skills/learning-assistant/scripts/learning_assistant.py next_practice --student-id '1号'
python3 /Users/baiyang/.hermes/skills/learning-assistant/scripts/learning_assistant.py create_bind_token --student-id '1号'
python3 /Users/baiyang/.hermes/skills/learning-assistant/scripts/learning_assistant.py bind_parent_from_message --parent-id 'wx-mama' --message '绑定 1号 839251'
python3 /Users/baiyang/.hermes/skills/learning-assistant/scripts/learning_assistant.py bind_parent --parent-id 'wx-mama' --student-id '1号' --code '839251'
python3 /Users/baiyang/.hermes/skills/learning-assistant/scripts/learning_assistant.py bind_parent --parent-id 'wx-mama' --token '<token>'
python3 /Users/baiyang/.hermes/skills/learning-assistant/scripts/learning_assistant.py list_parent_students --parent-id 'wx-mama'
python3 /Users/baiyang/.hermes/skills/learning-assistant/scripts/learning_assistant.py answer_parent --parent-id 'wx-mama' --child-name '张三' --question '张三今天怎么样'
python3 /Users/baiyang/.hermes/skills/learning-assistant/scripts/learning_assistant.py answer_parent --parent-id 'wx-mama' --question '今天怎么样'
```

在 Hermes 微信会话中，若平台把发信人 ID 注入到 `HERMES_SESSION_USER_ID`，可以省略 `--parent-id`：

```bash
HERMES_SESSION_USER_ID='o9cq80-xxx@im.wechat' python3 /Users/baiyang/.hermes/skills/learning-assistant/scripts/learning_assistant.py bind_parent_from_message --message '绑定 1号 839251'
HERMES_SESSION_USER_ID='o9cq80-xxx@im.wechat' python3 /Users/baiyang/.hermes/skills/learning-assistant/scripts/learning_assistant.py bind_parent --token '<token>'
HERMES_SESSION_USER_ID='o9cq80-xxx@im.wechat' python3 /Users/baiyang/.hermes/skills/learning-assistant/scripts/learning_assistant.py answer_parent --question '今天怎么样'
```

## Quiz Result Contract

白板或题目组件上报时，必须提供：

```json
{
  "studentId": "1号",
  "lessonId": "optional-lesson-id",
  "source": "whiteboard",
  "quiz": {
    "topic": "10以内加减法",
    "total": 10,
    "correct": 8,
    "durationSeconds": 180,
    "finishedAt": "2026-06-13T10:00:00+08:00",
    "questions": [
      {
        "question": "7+8",
        "studentAnswer": "14",
        "correctAnswer": "15"
      }
    ],
    "wrong": [
      {
        "question": "7+8",
        "studentAnswer": "14",
        "correctAnswer": "15"
      }
    ]
  }
}
```

`questions` 必须包含本次答过的全部题目。错题复习毕业依赖它：如果到期错题这次答对了，它必须出现在 `questions` 里，且不能出现在 `wrong` 里。

## Behavior

### record_quiz

1. 规范化答题结果。
2. 追加到 `records.jsonl`。
3. 更新 `mastery.json`。
4. 执行错题对账：
   - 首次答错：加入错题本，创建 3 天和 7 天复习计划。
   - 到期重做答对：标记最近一个复习点 `done`。
   - 3 天和 7 天都答对：错题毕业，写入 `graduatedAt`。
   - 重做又错：不重复追加错题，重置 3 天和 7 天复习计划。

### next_practice

读取该学生到期错题，返回结构化错题列表和可直接拼入出题请求的教育提示词。出题时应自然混入到期错题，而不是让学生感觉只是机械重考。

### bind_parent / bind_parent_from_message

使用一次性绑定凭证把家长微信 ID 绑定到学生编号。推荐微信内口令绑定，不跳转网页：

```text
绑定 1号 839251
```

老师侧 `create_bind_token` 会同时返回长 `bindToken` 和短 `bindCode`，并给出 `bindMessage`。家长在 Hermes 微信助手里发送 `bindMessage` 后，Hermes 调用：

```bash
python3 /Users/baiyang/.hermes/skills/learning-assistant/scripts/learning_assistant.py bind_parent_from_message --message '绑定 1号 839251'
```

绑定命令会从当前微信会话读取家长 `parentId`，校验学生编号 + 短绑定码，成功后追加写入 `bindings.json`。一个家长可以绑定多个孩子，不会覆盖已有孩子。

兼容旧流程：`bind_parent --token '<token>'` 仍可用；`bind_parent --student-id '1号' --code '839251'` 也可直接调用。

### list_parent_students

根据家长微信 ID 返回该家长已绑定的所有孩子 `[{studentId,name,grade}]`。当家长绑定多个孩子时，Hermes 可用它辅助做名字匹配或反问。

### answer_parent

根据家长微信 ID 查绑定学生，读取学生记录，返回当天学习总结、薄弱点、错题和复习建议。不要泄露其他家长的微信 ID 或绑定信息。

- 一个家长只绑定 1 个孩子时，可直接调用 `answer_parent`，无需指定孩子。
- 一个家长绑定多个孩子时，优先传 `--student-id` 或 `--child-name`。
- 如果绑定多个孩子但未指定孩子，或 `--child-name` 匹配不到唯一孩子，命令会返回 `{success:false, needChild:true, children:[...]}`。Hermes 必须反问家长，不要猜。

## Weixin Parent Flow

当 Hermes 在 weixin 平台收到家长消息时，按下面规则处理：

1. 如果消息看起来是绑定请求，例如 `绑定 1号 839251`，优先把整句话传给：

```bash
python3 /Users/baiyang/.hermes/skills/learning-assistant/scripts/learning_assistant.py bind_parent_from_message --message '<家长原话>'
```

优先从当前会话的 `HERMES_SESSION_USER_ID` 读取家长微信 ID；如果运行环境拿不到该变量，则把当前发信人微信 ID 显式传入 `--parent-id '<发信人ID>'`。

2. 兼容旧绑定请求：如果消息是 `绑定码 <token>`、单独一串 token，或 JSON 中包含 `bindToken`，提取 token 后调用：

```bash
python3 /Users/baiyang/.hermes/skills/learning-assistant/scripts/learning_assistant.py bind_parent --token '<token>'
```

同样优先从当前会话的 `HERMES_SESSION_USER_ID` 读取家长微信 ID；如果运行环境拿不到该变量，则把当前发信人微信 ID 显式传入 `--parent-id '<发信人ID>'`。

3. 如果消息是学习提问，例如 `今天怎么样`、`哪里薄弱`、`有错题吗`、`怎么复习`，先从家长原话里提取孩子名字或编号：

- 家长话里带名字/编号，例如 `张三今天怎么样`、`1号哪里薄弱`：调用时带上 `--child-name '张三'` 或 `--student-id '1号'`。
- 家长话里没带名字，例如 `今天怎么样`：直接调用 `answer_parent`，让 skill 根据绑定数量决定是否能直接回答。

示例：

```bash
python3 /Users/baiyang/.hermes/skills/learning-assistant/scripts/learning_assistant.py answer_parent --question '<家长原话>'
python3 /Users/baiyang/.hermes/skills/learning-assistant/scripts/learning_assistant.py answer_parent --child-name '张三' --question '<家长原话>'
```

同样优先使用 `HERMES_SESSION_USER_ID`，拿不到时显式传 `--parent-id '<发信人ID>'`。

4. 如果 `answer_parent` 返回 `needChild:true`，用 `children` 里的姓名/编号反问家长，例如：“您是要问 张三 还是 李四？”家长回答后，再把名字作为 `--child-name` 调用 `answer_parent`。

5. 如果 `answer_parent` 返回“该家长尚未绑定学生档案”，回复家长：请先让老师生成绑定口令，然后在微信里发送类似 `绑定 1号 839251` 的口令完成绑定。

## Architecture Rule

Hermes 是唯一后端。不要在白板项目中新增学生数据存储、错题逻辑或家长问答逻辑。白板只做渲染和上报。
