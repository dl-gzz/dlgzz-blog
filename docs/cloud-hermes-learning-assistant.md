# Cloud Hermes Learning Assistant

## Goal

The website must not call a local `~/.hermes` script in production. In production,
`/api/learning-assistant/*` should call a cloud Hermes HTTP endpoint.

## Website Environment

Set these variables on Zeabur:

```env
HERMES_LEARNING_ASSISTANT_URL="http://1.15.141.88:7319/api/learning-assistant/run"
HERMES_LEARNING_ASSISTANT_TOKEN="<shared-secret>"
```

Local development may leave `HERMES_LEARNING_ASSISTANT_URL` empty, which keeps the
current local Python skill behavior.

## Current Tencent Cloud Deployment

The current cloud bridge runs on the existing Tencent Cloud CVM:

- Public IP: `1.15.141.88`
- OS user: `ubuntu`
- Skill path: `~/.hermes/skills/learning-assistant/`
- Shared data path: `~/.hermes/learning-assistant-data/`
- HTTP bridge path: `~/.hermes/learning-assistant-http/server.py`
- HTTP endpoint: `http://1.15.141.88:7319/api/learning-assistant/run`
- Health check: `http://1.15.141.88:7319/health`

The bridge reads `~/.hermes/learning-assistant-http/.env` for:

```env
LEARNING_ASSISTANT_TOKEN="<shared-secret>"
LEARNING_ASSISTANT_HOST="0.0.0.0"
LEARNING_ASSISTANT_PORT="7319"
LEARNING_ASSISTANT_SCRIPT="/home/ubuntu/.hermes/skills/learning-assistant/scripts/learning_assistant.py"
LEARNING_ASSISTANT_DATA_DIR="/home/ubuntu/.hermes/learning-assistant-data"
```

The current runtime is started with `nohup` and has an `@reboot` crontab entry as
a fallback because `systemctl --user` is unavailable in Tencent Cloud TAT
sessions:

```sh
cd ~/.hermes/learning-assistant-http
set -a
. ./.env
set +a
nohup /home/ubuntu/.hermes/hermes-agent/venv/bin/python3 server.py > server.log 2>&1 &
```

To restart manually:

```sh
cd ~/.hermes/learning-assistant-http
kill "$(cat server.pid)" 2>/dev/null || true
set -a
. ./.env
set +a
nohup /home/ubuntu/.hermes/hermes-agent/venv/bin/python3 server.py > server.log 2>&1 &
echo $! > server.pid
curl -s http://127.0.0.1:7319/health
```

## Cloud Hermes HTTP Contract

The website sends:

```json
{
  "command": "create_bind_token",
  "args": ["--student-id", "1号"],
  "input": null
}
```

Headers:

```http
Content-Type: application/json
Authorization: Bearer <HERMES_LEARNING_ASSISTANT_TOKEN>
```

The cloud Hermes endpoint should:

1. Verify the bearer token.
2. Run the `learning-assistant` skill command.
3. Return the skill JSON response unchanged.

Expected successful response example:

```json
{
  "success": true,
  "studentId": "1号",
  "token": "xxxx",
  "expiresAt": "2026-06-20T15:00:00.000Z",
  "bindPayload": {
    "studentId": "1号",
    "bindToken": "xxxx"
  },
  "bindUrl": "learning-assistant://bind?studentId=1号&token=xxxx"
}
```

## Commands Used By The Website

- `create_student`
- `create_bind_token`
- `next_practice`
- `record_quiz`

## Why This Fixes QR Binding

Zeabur cannot access `/Users/baiyang/.hermes/...` on the local Mac. A cloud Hermes
endpoint makes the whiteboard, the parent Weixin bot, and the learning records use
one shared backend and one shared data directory.
