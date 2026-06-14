#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any


HOST = os.environ.get("LEARNING_ASSISTANT_HOST", "0.0.0.0")
PORT = int(os.environ.get("LEARNING_ASSISTANT_PORT", "7319"))
TOKEN = os.environ.get("LEARNING_ASSISTANT_TOKEN", "").strip()
SCRIPT = Path(
    os.environ.get(
        "LEARNING_ASSISTANT_SCRIPT",
        str(Path.home() / ".hermes" / "skills" / "learning-assistant" / "scripts" / "learning_assistant.py"),
    )
).expanduser()
TIMEOUT_SECONDS = int(os.environ.get("LEARNING_ASSISTANT_TIMEOUT_SECONDS", "60"))

ALLOWED_COMMANDS = {
    "answer_parent",
    "bind_parent",
    "bind_parent_from_message",
    "create_bind_token",
    "create_student",
    "daily_report",
    "list_parent_students",
    "next_practice",
    "record_quiz",
    "set_profile",
    "snapshot",
}


def json_bytes(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False).encode("utf-8")


class LearningAssistantHandler(BaseHTTPRequestHandler):
    server_version = "LearningAssistantHTTP/1.0"

    def log_message(self, fmt: str, *args: Any) -> None:
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def send_json(self, status: int, payload: Any) -> None:
        body = json_bytes(payload)
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "authorization, content-type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        self.send_json(200, {"success": True})

    def do_GET(self) -> None:
        if self.path == "/health":
            self.send_json(
                200,
                {
                    "success": True,
                    "script": str(SCRIPT),
                    "scriptExists": SCRIPT.exists(),
                },
            )
            return
        self.send_json(404, {"success": False, "error": "not found"})

    def do_POST(self) -> None:
        if self.path.rstrip("/") != "/api/learning-assistant/run":
            self.send_json(404, {"success": False, "error": "not found"})
            return

        if TOKEN:
            expected = f"Bearer {TOKEN}"
            if self.headers.get("Authorization", "") != expected:
                self.send_json(401, {"success": False, "error": "unauthorized"})
                return

        try:
            size = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(size).decode("utf-8") or "{}")
        except Exception:
            self.send_json(400, {"success": False, "error": "invalid JSON body"})
            return

        if not isinstance(payload, dict):
            self.send_json(400, {"success": False, "error": "body must be a JSON object"})
            return

        command = payload.get("command")
        args = payload.get("args", [])
        request_input = payload.get("input", None)

        if command not in ALLOWED_COMMANDS:
            self.send_json(400, {"success": False, "error": "unsupported command"})
            return
        if not isinstance(args, list) or not all(isinstance(item, str) for item in args):
            self.send_json(400, {"success": False, "error": "args must be a string array"})
            return
        if not SCRIPT.exists():
            self.send_json(500, {"success": False, "error": f"script not found: {SCRIPT}"})
            return

        stdin_text = ""
        if request_input is not None:
            stdin_text = json.dumps(request_input, ensure_ascii=False)

        try:
            completed = subprocess.run(
                [sys.executable, str(SCRIPT), command, *args],
                input=stdin_text,
                text=True,
                capture_output=True,
                timeout=TIMEOUT_SECONDS,
                env=os.environ.copy(),
                check=False,
            )
        except subprocess.TimeoutExpired:
            self.send_json(504, {"success": False, "error": f"{command} timed out"})
            return

        raw = (completed.stdout or completed.stderr or "").strip()
        try:
            result = json.loads(raw) if raw else None
        except json.JSONDecodeError:
            result = None

        if completed.returncode != 0:
            self.send_json(
                400,
                result
                if isinstance(result, dict)
                else {
                    "success": False,
                    "error": raw or f"{command} exited {completed.returncode}",
                },
            )
            return

        if not isinstance(result, dict):
            self.send_json(500, {"success": False, "error": "learning-assistant returned invalid JSON"})
            return

        self.send_json(200, result)


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), LearningAssistantHandler)
    print(f"learning-assistant HTTP listening on {HOST}:{PORT}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
