#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import secrets
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo


DATA_DIR = Path(
    os.environ.get("LEARNING_ASSISTANT_DATA_DIR") or (Path.home() / ".hermes" / "learning-assistant-data")
).expanduser().resolve()
STUDENTS_DIR = DATA_DIR / "students"
BINDINGS_FILE = DATA_DIR / "bindings.json"
BIND_TOKENS_FILE = DATA_DIR / "bind_tokens.json"
SHANGHAI = ZoneInfo("Asia/Shanghai")
BIND_CODE_RE = re.compile(r"^\d{4,8}$")
BIND_MESSAGE_RE = re.compile(r"绑定(?:学生|档案|孩子)?[:：\s]*(.+?)[\s,，:：-]*(\d{4,8})(?:\D*)$")


class LearningAssistantError(Exception):
    pass


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat()


def now_iso() -> str:
    return iso(now_utc())


def parse_time(value: Any, fallback: datetime | None = None) -> datetime:
    if isinstance(value, datetime):
        dt = value
    elif isinstance(value, str) and value.strip():
        text = value.strip()
        if text.endswith("Z"):
            text = f"{text[:-1]}+00:00"
        try:
            dt = datetime.fromisoformat(text)
        except ValueError as exc:
            raise LearningAssistantError(f"时间格式无效：{value}") from exc
    elif fallback is not None:
        dt = fallback
    else:
        dt = now_utc()

    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def add_days(date_text: str, days: int) -> str:
    return iso(parse_time(date_text) + timedelta(days=days))


def read_text(value: Any, fallback: str = "") -> str:
    if isinstance(value, str) and value.strip():
        return value.strip()
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return str(value)
    return fallback


def read_parent_id(value: Any = None) -> str:
    return read_text(value, read_text(os.environ.get("HERMES_SESSION_USER_ID")))


def read_optional_text(value: Any) -> str | None:
    text = read_text(value)
    return text or None


def read_number(value: Any, fallback: float = 0) -> float:
    if isinstance(value, bool):
        return fallback
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            return fallback
    return fallback


def read_bool(value: Any, fallback: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return fallback


def assert_object(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise LearningAssistantError(f"{label} 必须是 JSON object")
    return value


def validate_student_id(student_id: str) -> str:
    student_id = read_text(student_id)
    if not student_id:
        raise LearningAssistantError("studentId 不能为空")
    if len(student_id) > 64:
        raise LearningAssistantError("studentId 长度不能超过 64")
    if student_id in {".", ".."} or ".." in student_id:
        raise LearningAssistantError("studentId 不能包含路径穿透片段")
    if any(char in student_id for char in ["/", "\\", "\x00"]):
        raise LearningAssistantError("studentId 不能包含斜杠、反斜杠或空字节")
    return student_id


def student_dir(student_id: str) -> Path:
    clean = validate_student_id(student_id)
    root = STUDENTS_DIR.resolve()
    target = (root / clean).resolve()
    if not target.is_relative_to(root):
        raise LearningAssistantError("studentId 路径无效")
    return target


def student_files(student_id: str) -> dict[str, Path]:
    directory = student_dir(student_id)
    return {
        "dir": directory,
        "profile": directory / "profile.json",
        "records": directory / "records.jsonl",
        "mastery": directory / "mastery.json",
        "wrongbook": directory / "wrongbook.jsonl",
    }


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def read_json(path: Path, fallback: Any) -> Any:
    try:
        return json.loads(path.read_text("utf-8"))
    except FileNotFoundError:
        return fallback
    except json.JSONDecodeError as exc:
        raise LearningAssistantError(f"JSON 文件损坏：{path}") from exc


def write_json(path: Path, value: Any) -> None:
    ensure_parent(path)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", "utf-8")


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    try:
        raw = path.read_text("utf-8")
    except FileNotFoundError:
        return []

    rows: list[dict[str, Any]] = []
    for line_number, line in enumerate(raw.splitlines(), start=1):
        if not line.strip():
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError as exc:
            raise LearningAssistantError(f"JSONL 文件损坏：{path}:{line_number}") from exc
        if isinstance(row, dict):
            rows.append(row)
    return rows


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    ensure_parent(path)
    if rows:
        path.write_text("\n".join(json.dumps(row, ensure_ascii=False) for row in rows) + "\n", "utf-8")
    else:
        path.write_text("", "utf-8")


def append_jsonl(path: Path, row: dict[str, Any]) -> None:
    ensure_parent(path)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(row, ensure_ascii=False) + "\n")


def unique_sorted(values: list[str]) -> list[str]:
    return sorted({item.strip() for item in values if isinstance(item, str) and item.strip()})


def unique_student_ids(values: list[Any]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        student_id = read_text(value)
        if not student_id:
            continue
        clean = validate_student_id(student_id)
        if clean in seen:
            continue
        result.append(clean)
        seen.add(clean)
    return result


def normalize_answer_item(value: Any) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None
    question = read_text(value.get("question"))
    if not question:
        return None
    return {
        "question": question,
        "studentAnswer": read_optional_text(value.get("studentAnswer", value.get("answer"))),
        "correctAnswer": read_optional_text(value.get("correctAnswer")),
    }


def normalize_answer_items(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    items: list[dict[str, Any]] = []
    for item in value:
        normalized = normalize_answer_item(item)
        if normalized:
            items.append(normalized)
    return items


def ensure_profile(student_id: str) -> dict[str, Any]:
    files = student_files(student_id)
    existing = read_json(files["profile"], None)
    if isinstance(existing, dict):
        return existing

    timestamp = now_iso()
    profile = {
        "studentId": validate_student_id(student_id),
        "name": "",
        "grade": "",
        "createdAt": timestamp,
        "updatedAt": timestamp,
    }
    files["dir"].mkdir(parents=True, exist_ok=True)
    write_json(files["profile"], profile)
    return profile


def update_profile(student_id: str, updates: dict[str, Any]) -> dict[str, Any]:
    files = student_files(student_id)
    files["dir"].mkdir(parents=True, exist_ok=True)
    current = ensure_profile(student_id)
    allowed = {"name", "grade", "nickname", "notes"}
    for key in allowed:
        if key in updates:
            current[key] = updates[key]
    current["studentId"] = validate_student_id(student_id)
    current["updatedAt"] = now_iso()
    write_json(files["profile"], current)
    return current


def build_record(student_id: str | None, body: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
    quiz = body.get("quiz") if isinstance(body.get("quiz"), dict) else body
    quiz = assert_object(quiz, "quiz")
    effective_student_id = validate_student_id(student_id or read_text(body.get("studentId"), read_text(quiz.get("studentId"))))
    wrong = normalize_answer_items(quiz.get("wrong"))
    questions = normalize_answer_items(
        quiz.get("questions")
        or quiz.get("items")
        or quiz.get("answers")
        or quiz.get("questionItems")
    )
    total = max(0, round(read_number(quiz.get("total"), len(questions) or len(wrong))))
    correct = max(0, round(read_number(quiz.get("correct"), total - len(wrong))))
    timestamp = now_iso()
    finished_at = read_text(quiz.get("finishedAt"), timestamp)
    parse_time(finished_at)
    record = {
        "id": f"record:{uuid.uuid4()}",
        "studentId": effective_student_id,
        "lessonId": read_optional_text(body.get("lessonId")),
        "source": read_text(body.get("source"), "whiteboard"),
        "topic": read_text(quiz.get("topic"), read_text(quiz.get("skill"), "未分类练习")),
        "total": total,
        "correct": min(correct, total),
        "questions": questions,
        "wrong": wrong,
        "durationSeconds": None if "durationSeconds" not in quiz else max(0, round(read_number(quiz.get("durationSeconds")))),
        "finishedAt": iso(parse_time(finished_at)),
        "recordedAt": timestamp,
    }
    warnings: list[str] = []
    if wrong and not questions:
        warnings.append("本次上报没有 questions 全量列表；错题可以入档，但旧错题答对毕业无法判断。")
    return record, warnings


def update_mastery(student_id: str, record: dict[str, Any]) -> dict[str, Any]:
    files = student_files(student_id)
    mastery = read_json(
        files["mastery"],
        {
            "studentId": student_id,
            "updatedAt": record["recordedAt"],
            "topics": {},
        },
    )
    if not isinstance(mastery, dict):
        mastery = {"studentId": student_id, "updatedAt": record["recordedAt"], "topics": {}}
    topics = mastery.setdefault("topics", {})
    if not isinstance(topics, dict):
        topics = {}
        mastery["topics"] = topics

    topic = read_text(record.get("topic"), "未分类练习")
    current = topics.get(topic) if isinstance(topics.get(topic), dict) else None
    if not current:
        current = {
            "topic": topic,
            "attempts": 0,
            "total": 0,
            "correct": 0,
            "wrong": 0,
            "accuracy": 0,
            "lastPracticedAt": record["recordedAt"],
        }

    next_correct = int(read_number(current.get("correct"))) + int(read_number(record.get("correct")))
    next_total = int(read_number(current.get("total"))) + int(read_number(record.get("total")))
    next_wrong = int(read_number(current.get("wrong"))) + len(record.get("wrong") or [])
    topics[topic] = {
        "topic": topic,
        "attempts": int(read_number(current.get("attempts"))) + 1,
        "total": next_total,
        "correct": next_correct,
        "wrong": next_wrong,
        "accuracy": round(next_correct / next_total, 4) if next_total > 0 else 0,
        "lastPracticedAt": record["finishedAt"],
    }
    mastery["studentId"] = student_id
    mastery["updatedAt"] = record["recordedAt"]
    write_json(files["mastery"], mastery)
    return mastery


def normalize_review_text(value: Any) -> str:
    return "".join(read_text(value).split()).lower()


def review_key(topic: Any, question: Any) -> str:
    return f"{normalize_review_text(topic)}::{normalize_review_text(question)}"


def has_pending_review(row: dict[str, Any]) -> bool:
    plan = row.get("reviewPlan")
    if not isinstance(plan, list):
        return False
    for item in plan:
        if isinstance(item, dict) and read_text(item.get("status"), "pending").lower() == "pending":
            return True
    return False


def is_due_wrongbook_row(row: dict[str, Any], due_before: datetime) -> bool:
    if not has_pending_review(row):
        return False
    for item in row.get("reviewPlan") or []:
        if not isinstance(item, dict):
            continue
        if read_text(item.get("status"), "pending").lower() != "pending":
            continue
        due_at = item.get("dueAt")
        try:
            if parse_time(due_at) <= due_before:
                return True
        except LearningAssistantError:
            continue
    return False


def build_wrongbook_record(record: dict[str, Any], item: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": f"wrong:{uuid.uuid4()}",
        "recordId": record["id"],
        "studentId": record["studentId"],
        "lessonId": record.get("lessonId"),
        "topic": record.get("topic"),
        "question": item.get("question"),
        "studentAnswer": item.get("studentAnswer"),
        "correctAnswer": item.get("correctAnswer"),
        "firstWrongAt": record["finishedAt"],
        "reviewPlan": [
            {"dueAt": add_days(record["finishedAt"], 3), "status": "pending"},
            {"dueAt": add_days(record["finishedAt"], 7), "status": "pending"},
        ],
        "lastReviewedAt": record["finishedAt"],
        "lastResult": "wrong",
        "createdAt": record["recordedAt"],
        "updatedAt": record["recordedAt"],
    }


def mark_review_done(row: dict[str, Any], record: dict[str, Any], due_before: datetime) -> dict[str, bool]:
    plan = row.get("reviewPlan")
    if not isinstance(plan, list):
        return {"completed": False, "graduated": False}

    marked = False
    fallback_index = -1
    next_plan: list[Any] = []
    for index, item in enumerate(plan):
        if not isinstance(item, dict):
            next_plan.append(item)
            continue
        if read_text(item.get("status"), "pending").lower() != "pending":
            next_plan.append(item)
            continue
        if fallback_index == -1:
            fallback_index = index
        due_at = item.get("dueAt")
        try:
            is_due = parse_time(due_at) <= due_before
        except LearningAssistantError:
            is_due = False
        if not is_due:
            next_plan.append(item)
            continue
        next_plan.append({**item, "status": "done", "doneAt": record["finishedAt"]})
        marked = True

    if not marked and fallback_index >= 0:
        fallback_item = next_plan[fallback_index]
        if isinstance(fallback_item, dict):
            next_plan[fallback_index] = {**fallback_item, "status": "done", "doneAt": record["finishedAt"]}
            marked = True

    row["reviewPlan"] = next_plan
    if not marked:
        return {"completed": False, "graduated": False}

    row["lastReviewedAt"] = record["finishedAt"]
    row["lastResult"] = "correct"
    row["updatedAt"] = record["recordedAt"]
    graduated = not has_pending_review(row)
    if graduated:
        row["graduatedAt"] = record["finishedAt"]
    return {"completed": True, "graduated": graduated}


def reschedule_review(row: dict[str, Any], record: dict[str, Any], item: dict[str, Any]) -> None:
    row["recordId"] = record["id"]
    row["studentId"] = record["studentId"]
    row["lessonId"] = record.get("lessonId")
    row["topic"] = record.get("topic")
    row["question"] = item.get("question")
    row["studentAnswer"] = item.get("studentAnswer")
    row["correctAnswer"] = item.get("correctAnswer")
    row["reviewPlan"] = [
        {"dueAt": add_days(record["finishedAt"], 3), "status": "pending"},
        {"dueAt": add_days(record["finishedAt"], 7), "status": "pending"},
    ]
    row["lastReviewedAt"] = record["finishedAt"]
    row["lastResult"] = "wrong"
    row.pop("graduatedAt", None)
    row["updatedAt"] = record["recordedAt"]


def reconcile_wrongbook(student_id: str, record: dict[str, Any]) -> dict[str, int]:
    files = student_files(student_id)
    rows = read_jsonl(files["wrongbook"])
    due_before = parse_time(record.get("finishedAt"))
    wrong_by_key = {
        review_key(record.get("topic"), item.get("question")): item
        for item in record.get("wrong") or []
        if isinstance(item, dict)
    }
    answered_keys = {
        review_key(record.get("topic"), item.get("question"))
        for item in record.get("questions") or []
        if isinstance(item, dict)
    }
    latest_pending_index_by_key: dict[str, int] = {}
    for index, row in enumerate(rows):
        if has_pending_review(row):
            latest_pending_index_by_key[review_key(row.get("topic"), row.get("question"))] = index

    completed_reviews = 0
    graduated = 0
    rescheduled = 0
    appended = 0

    for key in answered_keys:
        if key in wrong_by_key:
            continue
        index = latest_pending_index_by_key.get(key)
        if index is None:
            continue
        result = mark_review_done(rows[index], record, due_before)
        if result["completed"]:
            completed_reviews += 1
        if result["graduated"]:
            graduated += 1

    for key, item in wrong_by_key.items():
        index = latest_pending_index_by_key.get(key)
        if index is not None:
            reschedule_review(rows[index], record, item)
            rescheduled += 1
            continue
        rows.append(build_wrongbook_record(record, item))
        appended += 1

    latest_active_index_by_key: dict[str, int] = {}
    for index, row in enumerate(rows):
        if has_pending_review(row):
            latest_active_index_by_key[review_key(row.get("topic"), row.get("question"))] = index

    for index, row in enumerate(rows):
        if not has_pending_review(row):
            continue
        key = review_key(row.get("topic"), row.get("question"))
        latest_index = latest_active_index_by_key.get(key)
        if latest_index is None or latest_index == index:
            continue
        latest = rows[latest_index]
        row["reviewPlan"] = [
            {**item, "status": "superseded", "supersededAt": record["finishedAt"]}
            if isinstance(item, dict) and read_text(item.get("status"), "pending").lower() == "pending"
            else item
            for item in row.get("reviewPlan") or []
        ]
        row["supersededBy"] = latest.get("id")
        row["updatedAt"] = record["recordedAt"]

    write_jsonl(files["wrongbook"], rows)
    return {
        "completedReviews": completed_reviews,
        "graduated": graduated,
        "rescheduled": rescheduled,
        "appended": appended,
    }


def run_record_quiz(args: argparse.Namespace) -> dict[str, Any]:
    body = load_payload(args)
    record, warnings = build_record(args.student_id, body)
    student_id = record["studentId"]
    files = student_files(student_id)
    files["dir"].mkdir(parents=True, exist_ok=True)
    ensure_profile(student_id)
    append_jsonl(files["records"], record)
    mastery = update_mastery(student_id, record)
    wrongbook = reconcile_wrongbook(student_id, record)
    return {
        "success": True,
        "record": record,
        "mastery": mastery.get("topics", {}).get(record["topic"]),
        "wrongbook": wrongbook,
        "warnings": warnings,
    }


def due_sort_key(row: dict[str, Any]) -> tuple[str, str]:
    due_times: list[str] = []
    for item in row.get("reviewPlan") or []:
        if not isinstance(item, dict):
            continue
        if read_text(item.get("status"), "pending").lower() == "pending" and item.get("dueAt"):
            due_times.append(read_text(item.get("dueAt")))
    return (min(due_times) if due_times else "", read_text(row.get("lastReviewedAt")))


def format_due_wrongbook_prompt(items: list[dict[str, Any]]) -> str:
    if not items:
        return ""
    lines = ["以下是该学生到期错题，请自然混入本次练习中："]
    for index, item in enumerate(items, start=1):
        topic = read_text(item.get("topic"), "未分类练习")
        question = read_text(item.get("question"), "未知题目")
        student_answer = read_text(item.get("studentAnswer"), "未记录")
        correct_answer = read_text(item.get("correctAnswer"), "未记录")
        lines.append(f"{index}. [{topic}] {question}（上次答：{student_answer}，正确答案：{correct_answer}）")
    lines.append("要求：不要直接说这是错题；生成变式或同类题，并在答题结束后继续按 quiz_result 协议上报 questions 和 wrong。")
    return "\n".join(lines)


def run_next_practice(args: argparse.Namespace) -> dict[str, Any]:
    student_id = validate_student_id(args.student_id)
    due_before = parse_time(args.due_before, now_utc()) if args.due_before else now_utc()
    files = student_files(student_id)
    wrongbook = read_jsonl(files["wrongbook"])
    due = [row for row in wrongbook if is_due_wrongbook_row(row, due_before)]
    due.sort(key=due_sort_key)
    pool = due[: max(1, args.pool_limit)]
    items = pool[: max(1, args.limit)]
    return {
        "success": True,
        "studentId": student_id,
        "dueBefore": iso(due_before),
        "count": len(items),
        "totalDue": len(due),
        "items": items,
        "prompt": format_due_wrongbook_prompt(items),
    }


def shanghai_day_range(date_text: str | None) -> tuple[str, datetime, datetime]:
    if date_text and date_text.strip():
        try:
            local_start = datetime.fromisoformat(date_text.strip()).replace(tzinfo=SHANGHAI)
        except ValueError:
            local_start = datetime.strptime(date_text.strip(), "%Y-%m-%d").replace(tzinfo=SHANGHAI)
    else:
        today = datetime.now(SHANGHAI).date()
        local_start = datetime(today.year, today.month, today.day, tzinfo=SHANGHAI)
    local_start = datetime(local_start.year, local_start.month, local_start.day, tzinfo=SHANGHAI)
    local_end = local_start + timedelta(days=1)
    return local_start.date().isoformat(), local_start.astimezone(timezone.utc), local_end.astimezone(timezone.utc)


def record_time(record: dict[str, Any]) -> datetime:
    return parse_time(record.get("finishedAt") or record.get("recordedAt"), datetime.fromtimestamp(0, timezone.utc))


def format_percent(value: float) -> str:
    return f"{round(value * 100)}%"


def build_daily_report(student_id: str, date_text: str | None = None) -> dict[str, Any]:
    student_id = validate_student_id(student_id)
    date, start_at, end_at = shanghai_day_range(date_text)
    files = student_files(student_id)
    profile = read_json(files["profile"], None)
    mastery = read_json(files["mastery"], None)
    records = read_jsonl(files["records"])
    wrongbook = read_jsonl(files["wrongbook"])

    day_records = [record for record in records if start_at <= record_time(record) < end_at]
    stats = {"sessions": 0, "total": 0, "correct": 0, "wrong": 0, "durationSeconds": 0}
    topic_map: dict[str, dict[str, Any]] = {}
    wrong_items: list[dict[str, Any]] = []

    for record in day_records:
        total = max(0, int(read_number(record.get("total"))))
        correct = max(0, min(total, int(read_number(record.get("correct")))))
        wrong_count = len(record.get("wrong") or [])
        stats["sessions"] += 1
        stats["total"] += total
        stats["correct"] += correct
        stats["wrong"] += wrong_count
        stats["durationSeconds"] += max(0, int(read_number(record.get("durationSeconds"))))

        topic = read_text(record.get("topic"), "未分类练习")
        current = topic_map.setdefault(topic, {"topic": topic, "sessions": 0, "total": 0, "correct": 0, "wrong": 0})
        current["sessions"] += 1
        current["total"] += total
        current["correct"] += correct
        current["wrong"] += wrong_count

        for item in record.get("wrong") or []:
            if isinstance(item, dict):
                wrong_items.append(
                    {
                        "topic": topic,
                        "question": read_text(item.get("question"), "未知题目"),
                        "studentAnswer": item.get("studentAnswer"),
                        "correctAnswer": item.get("correctAnswer"),
                    }
                )

    topics = []
    for item in topic_map.values():
        item = dict(item)
        item["accuracy"] = round(item["correct"] / item["total"], 4) if item["total"] > 0 else 0
        topics.append(item)
    accuracy = round(stats["correct"] / stats["total"], 4) if stats["total"] > 0 else 0
    weak_topics = sorted(
        [topic for topic in topics if topic["total"] > 0],
        key=lambda item: (-item["wrong"], item["accuracy"]),
    )[:3]
    due_wrongbook = [row for row in wrongbook if is_due_wrongbook_row(row, end_at)][:10]
    summary = (
        f"{date} 还没有学习记录。"
        if stats["sessions"] == 0
        else f"{date} 完成 {stats['sessions']} 次练习，共 {stats['total']} 题，答对 {stats['correct']} 题，正确率 {format_percent(accuracy)}。"
    )
    recommendations = (
        ["今天还没有答题记录，可以先让孩子完成一组 5-10 题的小练习。"]
        if stats["sessions"] == 0
        else [
            f"优先复习 {weak_topics[0]['topic']}，今天错了 {weak_topics[0]['wrong']} 题。"
            if weak_topics
            else "今天没有明显薄弱知识点，可以保持当前节奏。",
            f"还有 {len(due_wrongbook)} 道到期错题，下一次出题会自动混入。"
            if due_wrongbook
            else "暂无到期错题，可以继续做新题或巩固练习。",
        ]
    )
    safe_profile = None
    if isinstance(profile, dict):
        safe_profile = {
            "studentId": profile.get("studentId"),
            "name": profile.get("name", ""),
            "grade": profile.get("grade", ""),
        }
    return {
        "studentId": student_id,
        "date": date,
        "timezone": "Asia/Shanghai",
        "range": {"startAt": iso(start_at), "endAt": iso(end_at)},
        "profile": safe_profile,
        "summary": summary,
        "stats": {**stats, "accuracy": accuracy},
        "topics": topics,
        "weakTopics": weak_topics,
        "wrongItems": wrong_items,
        "dueWrongbook": due_wrongbook,
        "mastery": mastery,
        "recommendations": recommendations,
        "shareText": "\n".join(
            [
                summary,
                f"错题：{'、'.join(item['question'] for item in wrong_items[:5])}" if wrong_items else "今天没有错题记录。",
                recommendations[0],
            ]
        ),
    }


def build_parent_answer(question: str, report: dict[str, Any]) -> str:
    normalized = question.lower()
    if report["stats"]["sessions"] == 0:
        return f"{report['date']} 还没有学习记录。建议先安排一组 5-10 题的小练习，完成后我就能给你看正确率、错题和薄弱点。"

    if "错" in normalized or "weak" in normalized or "薄弱" in normalized:
        weak_topic = report["weakTopics"][0] if report["weakTopics"] else None
        if not weak_topic:
            return f"{report['summary']}\n今天没有明显薄弱知识点。{report['recommendations'][0]}"
        wrong_list = [
            f"{item['question']}（答：{item.get('studentAnswer') or '未记录'}，正：{item.get('correctAnswer') or '未记录'}）"
            for item in report["wrongItems"]
            if item.get("topic") == weak_topic["topic"]
        ][:5]
        suffix = f"代表错题：{'；'.join(wrong_list)}" if wrong_list else ""
        return f"{report['summary']}\n薄弱点主要是 {weak_topic['topic']}，正确率 {round(weak_topic['accuracy'] * 100)}%，错了 {weak_topic['wrong']} 题。{suffix}"

    if "复习" in normalized or "错题" in normalized:
        if report["dueWrongbook"]:
            return f"{report['summary']}\n现在有 {len(report['dueWrongbook'])} 道到期错题，下一次白板出题会自动混进去。"
        return f"{report['summary']}\n现在没有到期错题，可以继续做新题或做一次轻量巩固。"

    return f"{report['summary']}\n" + "\n".join(report["recommendations"])


def read_bindings() -> dict[str, list[str]]:
    raw = read_json(BINDINGS_FILE, {})
    if not isinstance(raw, dict):
        return {}
    result: dict[str, list[str]] = {}
    for parent_id, value in raw.items():
        parent_key = read_text(parent_id)
        if not parent_key:
            continue
        values = value if isinstance(value, list) else [value]
        try:
            student_ids = unique_student_ids(values)
        except LearningAssistantError:
            continue
        if student_ids:
            result[parent_key] = student_ids
    return result


def write_bindings(bindings: dict[str, list[str]]) -> None:
    normalized: dict[str, list[str]] = {}
    for parent_id in sorted(bindings):
        parent_key = read_text(parent_id)
        if not parent_key:
            continue
        student_ids = unique_student_ids(bindings[parent_id])
        if student_ids:
            normalized[parent_key] = student_ids
    write_json(BINDINGS_FILE, normalized)


def bound_parent_ids_for_student(student_id: str, bindings: dict[str, list[str]] | None = None) -> list[str]:
    clean = validate_student_id(student_id)
    source = bindings if bindings is not None else read_bindings()
    return sorted(parent_id for parent_id, student_ids in source.items() if clean in student_ids)


def student_record_count(student_id: str) -> int:
    files = student_files(student_id)
    return len(read_jsonl(files["records"]))


def student_summary(student_id: str) -> dict[str, str]:
    clean = validate_student_id(student_id)
    files = student_files(clean)
    profile = read_json(files["profile"], None)
    if not isinstance(profile, dict):
        profile = {}
    return {
        "studentId": clean,
        "name": read_text(profile.get("name")),
        "grade": read_text(profile.get("grade")),
    }


def list_parent_student_summaries(parent_id: str) -> list[dict[str, str]]:
    bindings = read_bindings()
    return [student_summary(student_id) for student_id in bindings.get(parent_id, [])]


def normalize_match_text(value: Any) -> str:
    return "".join(read_text(value).split()).lower()


def child_matches(summary: dict[str, str], child_name: str) -> bool:
    query = normalize_match_text(child_name)
    if not query:
        return False
    candidates = [
        normalize_match_text(summary.get("studentId")),
        normalize_match_text(summary.get("name")),
    ]
    for candidate in candidates:
        if not candidate:
            continue
        if candidate == query:
            return True
        if len(candidate) >= 2 and candidate in query:
            return True
    return False


def need_child_response(parent_id: str, children: list[dict[str, str]]) -> dict[str, Any]:
    child_names = [read_text(child.get("name"), child.get("studentId")) for child in children]
    label = "、".join(child_names) if child_names else "孩子"
    return {
        "success": False,
        "needChild": True,
        "parentId": parent_id,
        "children": children,
        "message": f"这个家长绑定了多个孩子，请确认要查询哪一个：{label}。",
    }


def resolve_parent_student(parent_id: str, args: argparse.Namespace) -> tuple[str | None, list[dict[str, str]], dict[str, Any] | None]:
    bindings = read_bindings()
    student_ids = bindings.get(parent_id, [])
    if not student_ids:
        raise LearningAssistantError("该家长尚未绑定学生档案")

    children = [student_summary(student_id) for student_id in student_ids]
    if len(student_ids) == 1:
        return student_ids[0], children, None

    requested_student_id = read_text(getattr(args, "student_id", None))
    if requested_student_id:
        try:
            clean = validate_student_id(requested_student_id)
        except LearningAssistantError:
            clean = ""
        if clean in student_ids:
            return clean, children, None

    child_name = read_text(getattr(args, "child_name", None))
    if child_name:
        matches = [child for child in children if child_matches(child, child_name)]
        if len(matches) == 1:
            return matches[0]["studentId"], children, None

    return None, children, need_child_response(parent_id, children)


def read_bind_tokens() -> dict[str, dict[str, Any]]:
    raw = read_json(BIND_TOKENS_FILE, {})
    if not isinstance(raw, dict):
        return {}
    return {key: value for key, value in raw.items() if isinstance(key, str) and isinstance(value, dict)}


def write_bind_tokens(tokens: dict[str, dict[str, Any]]) -> None:
    write_json(BIND_TOKENS_FILE, {key: tokens[key] for key in sorted(tokens)})


def normalize_bind_code(value: Any) -> str:
    code = read_text(value).replace(" ", "")
    if not BIND_CODE_RE.match(code):
        raise LearningAssistantError("绑定码应为 4-8 位数字")
    return code


def generate_bind_code(tokens: dict[str, dict[str, Any]]) -> str:
    active_codes = {
        read_text(item.get("bindCode"))
        for item in tokens.values()
        if isinstance(item, dict)
        and read_text(item.get("bindCode"))
        and not item.get("usedAt")
        and parse_time(item.get("expiresAt")) >= now_utc()
    }
    for _ in range(100):
        code = f"{secrets.randbelow(1_000_000):06d}"
        if code not in active_codes:
            return code
    raise LearningAssistantError("生成绑定码失败，请稍后重试")


def parse_bind_message(message: str) -> tuple[str, str]:
    text = read_text(message)
    if not text:
        raise LearningAssistantError("绑定消息不能为空")
    compact = re.sub(r"\s+", " ", text).strip()
    match = BIND_MESSAGE_RE.search(compact)
    if not match:
        raise LearningAssistantError("绑定格式应为：绑定 学生编号 绑定码，例如：绑定 1号 839251")
    student_id = match.group(1).strip()
    student_id = re.sub(r"^(学生|编号|孩子)\s*", "", student_id).strip()
    student_id = re.sub(r"\s+", "", student_id)
    return validate_student_id(student_id), normalize_bind_code(match.group(2))


def run_create_student(args: argparse.Namespace) -> dict[str, Any]:
    student_id = validate_student_id(args.student_id)
    bindings = read_bindings()
    record_count = student_record_count(student_id)
    bound_parents = bound_parent_ids_for_student(student_id, bindings)
    if not args.force and (record_count > 0 or bound_parents):
        reasons: list[str] = []
        if record_count > 0:
            reasons.append(f"已有{record_count}条记录")
        if bound_parents:
            reasons.append("已绑定家长")
        raise LearningAssistantError(f"编号 {student_id} 已被使用（{'/'.join(reasons)}），换一个编号，或显式传 --force 确认复用")
    profile = ensure_profile(student_id)
    updates = {key: value for key, value in {"name": args.name, "grade": args.grade}.items() if value is not None}
    if updates:
        profile = update_profile(student_id, updates)
    return {"success": True, "studentId": student_id, "profile": profile}


def run_set_profile(args: argparse.Namespace) -> dict[str, Any]:
    student_id = validate_student_id(args.student_id)
    updates: dict[str, Any] = {}
    if args.json:
        updates.update(assert_object(json.loads(args.json), "--json"))
    for key in ["name", "grade", "nickname", "notes"]:
        value = getattr(args, key)
        if value is not None:
            updates[key] = value
    profile = update_profile(student_id, updates)
    return {"success": True, "studentId": student_id, "profile": profile}


def run_create_bind_token(args: argparse.Namespace) -> dict[str, Any]:
    student_id = validate_student_id(args.student_id)
    ensure_profile(student_id)
    token = secrets.token_urlsafe(24)
    created_at = now_utc()
    expires_at = created_at + timedelta(days=max(1, args.days))
    tokens = read_bind_tokens()
    bind_code = generate_bind_code(tokens)
    tokens[token] = {
        "token": token,
        "studentId": student_id,
        "bindCode": bind_code,
        "createdAt": iso(created_at),
        "expiresAt": iso(expires_at),
        "usedAt": None,
    }
    write_bind_tokens(tokens)
    bind_message = f"绑定 {student_id} {bind_code}"
    return {
        "success": True,
        "studentId": student_id,
        "token": token,
        "bindCode": bind_code,
        "bindMessage": bind_message,
        "expiresAt": iso(expires_at),
        "bindPayload": {"studentId": student_id, "bindToken": token, "bindCode": bind_code},
        "bindUrl": f"learning-assistant://bind?studentId={student_id}&token={token}",
    }


def verify_bind_token(token: str, student_id: str | None = None) -> dict[str, Any]:
    token = read_text(token)
    if not token:
        raise LearningAssistantError("bindToken 不能为空")
    tokens = read_bind_tokens()
    item = tokens.get(token)
    if not item:
        raise LearningAssistantError("bindToken 不存在或已失效")
    token_student_id = validate_student_id(read_text(item.get("studentId")))
    if student_id and token_student_id != validate_student_id(student_id):
        raise LearningAssistantError("bindToken 与学生编号不匹配")
    if item.get("usedAt"):
        raise LearningAssistantError("bindToken 已使用")
    if parse_time(item.get("expiresAt")) < now_utc():
        raise LearningAssistantError("bindToken 已过期")
    item["studentId"] = token_student_id
    item["usedAt"] = now_iso()
    tokens[token] = item
    write_bind_tokens(tokens)
    return item


def verify_bind_code(student_id: str, code: str) -> dict[str, Any]:
    clean_student_id = validate_student_id(student_id)
    clean_code = normalize_bind_code(code)
    tokens = read_bind_tokens()
    matched_key = ""
    matched_item: dict[str, Any] | None = None
    for key, item in tokens.items():
        if not isinstance(item, dict):
            continue
        if read_text(item.get("bindCode")) != clean_code:
            continue
        token_student_id = validate_student_id(read_text(item.get("studentId")))
        if token_student_id != clean_student_id:
            continue
        matched_key = key
        matched_item = item
        break

    if not matched_item:
        raise LearningAssistantError("学生编号或绑定码不正确")
    if matched_item.get("usedAt"):
        raise LearningAssistantError("绑定码已使用")
    if parse_time(matched_item.get("expiresAt")) < now_utc():
        raise LearningAssistantError("绑定码已过期")

    matched_item["studentId"] = clean_student_id
    matched_item["bindCode"] = clean_code
    matched_item["usedAt"] = now_iso()
    tokens[matched_key] = matched_item
    write_bind_tokens(tokens)
    return matched_item


def run_bind_parent(args: argparse.Namespace) -> dict[str, Any]:
    parent_id = read_parent_id(args.parent_id)
    if not parent_id:
        raise LearningAssistantError("parentId 不能为空；微信会话应提供 HERMES_SESSION_USER_ID，或显式传 --parent-id")
    token_info = None
    if args.token:
        token_info = verify_bind_token(args.token, args.student_id)
        student_id = validate_student_id(read_text(token_info.get("studentId")))
    elif args.code:
        if not args.student_id:
            raise LearningAssistantError("使用短绑定码时必须提供学生编号，例如：绑定 1号 839251")
        token_info = verify_bind_code(args.student_id, args.code)
        student_id = validate_student_id(read_text(token_info.get("studentId")))
    elif not args.allow_without_token:
        raise LearningAssistantError("绑定家长需要 bindToken；本地模拟可显式加 --allow-without-token")
    else:
        student_id = validate_student_id(args.student_id)

    ensure_profile(student_id)
    bindings = read_bindings()
    bindings[parent_id] = unique_student_ids([*bindings.get(parent_id, []), student_id])
    write_bindings(bindings)
    children = [student_summary(child_id) for child_id in bindings[parent_id]]
    return {
        "success": True,
        "parentId": parent_id,
        "studentId": student_id,
        "studentIds": bindings[parent_id],
        "children": children,
        "token": token_info,
        "message": f"已绑定 {student_id} 的学习档案。当前该家长已绑定 {len(bindings[parent_id])} 个孩子。",
    }


def run_bind_parent_from_message(args: argparse.Namespace) -> dict[str, Any]:
    student_id, code = parse_bind_message(args.message)
    args.student_id = student_id
    args.code = code
    args.token = None
    args.allow_without_token = False
    result = run_bind_parent(args)
    result["bindMessage"] = f"绑定 {student_id} {code}"
    return result


def run_answer_parent(args: argparse.Namespace) -> dict[str, Any]:
    parent_id = read_parent_id(args.parent_id)
    if not parent_id:
        raise LearningAssistantError("parentId 不能为空；微信会话应提供 HERMES_SESSION_USER_ID，或显式传 --parent-id")
    student_id, children, pending = resolve_parent_student(parent_id, args)
    if pending is not None:
        return pending
    if not student_id:
        raise LearningAssistantError("未能确认要查询的学生")
    question = read_text(args.question, "今天学习情况怎么样？")
    report = build_daily_report(student_id, args.date)
    return {
        "success": True,
        "parentId": parent_id,
        "studentId": student_id,
        "date": report["date"],
        "answer": build_parent_answer(question, report),
        "report": report,
    }


def run_list_parent_students(args: argparse.Namespace) -> dict[str, Any]:
    parent_id = read_parent_id(args.parent_id)
    if not parent_id:
        raise LearningAssistantError("parentId 不能为空；微信会话应提供 HERMES_SESSION_USER_ID，或显式传 --parent-id")
    return {
        "success": True,
        "parentId": parent_id,
        "children": list_parent_student_summaries(parent_id),
    }


def run_daily_report(args: argparse.Namespace) -> dict[str, Any]:
    return {"success": True, "report": build_daily_report(args.student_id, args.date)}


def run_snapshot(args: argparse.Namespace) -> dict[str, Any]:
    student_id = validate_student_id(args.student_id)
    files = student_files(student_id)
    return {
        "success": True,
        "studentId": student_id,
        "profile": read_json(files["profile"], None),
        "mastery": read_json(files["mastery"], None),
        "records": read_jsonl(files["records"])[-args.limit :],
        "wrongbook": read_jsonl(files["wrongbook"])[-args.wrong_limit :],
    }


def load_payload(args: argparse.Namespace) -> dict[str, Any]:
    if getattr(args, "json", None):
        return assert_object(json.loads(args.json), "--json")
    if getattr(args, "file", None):
        return assert_object(json.loads(Path(args.file).read_text("utf-8")), "--file")
    if not sys.stdin.isatty():
        raw = sys.stdin.read().strip()
        if raw:
            return assert_object(json.loads(raw), "stdin")
    raise LearningAssistantError("请通过 --json、--file 或 stdin 提供 JSON")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Hermes learning-assistant skill CLI")
    sub = parser.add_subparsers(dest="command", required=True)

    create_student = sub.add_parser("create_student")
    create_student.add_argument("--student-id", required=True)
    create_student.add_argument("--name")
    create_student.add_argument("--grade")
    create_student.add_argument("--force", action="store_true")
    create_student.set_defaults(func=run_create_student)

    set_profile = sub.add_parser("set_profile")
    set_profile.add_argument("--student-id", required=True)
    set_profile.add_argument("--name")
    set_profile.add_argument("--grade")
    set_profile.add_argument("--nickname")
    set_profile.add_argument("--notes")
    set_profile.add_argument("--json")
    set_profile.set_defaults(func=run_set_profile)

    record_quiz = sub.add_parser("record_quiz")
    record_quiz.add_argument("--student-id")
    record_quiz.add_argument("--json")
    record_quiz.add_argument("--file")
    record_quiz.set_defaults(func=run_record_quiz)

    next_practice = sub.add_parser("next_practice")
    next_practice.add_argument("--student-id", required=True)
    next_practice.add_argument("--due-before")
    next_practice.add_argument("--limit", type=int, default=8)
    next_practice.add_argument("--pool-limit", type=int, default=20)
    next_practice.set_defaults(func=run_next_practice)

    create_bind_token = sub.add_parser("create_bind_token")
    create_bind_token.add_argument("--student-id", required=True)
    create_bind_token.add_argument("--days", type=int, default=7)
    create_bind_token.set_defaults(func=run_create_bind_token)

    bind_parent = sub.add_parser("bind_parent")
    bind_parent.add_argument("--parent-id")
    bind_parent.add_argument("--student-id")
    bind_parent.add_argument("--token")
    bind_parent.add_argument("--code")
    bind_parent.add_argument("--allow-without-token", action="store_true")
    bind_parent.set_defaults(func=run_bind_parent)

    bind_parent_from_message = sub.add_parser("bind_parent_from_message")
    bind_parent_from_message.add_argument("--parent-id")
    bind_parent_from_message.add_argument("--message", required=True)
    bind_parent_from_message.set_defaults(func=run_bind_parent_from_message)

    answer_parent = sub.add_parser("answer_parent")
    answer_parent.add_argument("--parent-id")
    answer_parent.add_argument("--student-id")
    answer_parent.add_argument("--child-name")
    answer_parent.add_argument("--question", default="今天学习情况怎么样？")
    answer_parent.add_argument("--date")
    answer_parent.set_defaults(func=run_answer_parent)

    list_parent_students = sub.add_parser("list_parent_students")
    list_parent_students.add_argument("--parent-id")
    list_parent_students.set_defaults(func=run_list_parent_students)

    daily_report = sub.add_parser("daily_report")
    daily_report.add_argument("--student-id", required=True)
    daily_report.add_argument("--date")
    daily_report.set_defaults(func=run_daily_report)

    snapshot = sub.add_parser("snapshot")
    snapshot.add_argument("--student-id", required=True)
    snapshot.add_argument("--limit", type=int, default=20)
    snapshot.add_argument("--wrong-limit", type=int, default=50)
    snapshot.set_defaults(func=run_snapshot)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        result = args.func(args)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except Exception as exc:
        print(json.dumps({"success": False, "error": str(exc)}, ensure_ascii=False, indent=2), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
