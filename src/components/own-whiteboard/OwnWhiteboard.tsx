'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Bot,
  ClipboardCheck,
  Code2,
  Download,
  FileText,
  GripVertical,
  Home,
  MousePointer2,
  Plus,
  QrCode,
  Send,
  Trash2,
} from 'lucide-react';
import QrSvg from 'react-qr-code';

type ShapeType = 'preview_html' | 'ai_result';

type BoardShape = {
  id: string;
  type: ShapeType;
  x: number;
  y: number;
  props: {
    w: number;
    h: number;
    html?: string;
    text?: string;
    color?: string;
  };
};

type BoardMessage = {
  role: 'system' | 'user' | 'assistant';
  text: string;
};

type LessonPromptPost = {
  title: string;
  description: string;
  image?: string;
  date?: string;
  url: string;
  slugs?: string[];
  whiteboardPrompt?: string;
  hasWhiteboardPrompt?: boolean;
};

type EduAnswerPayload = {
  subject: string;
  grade?: string;
  skill: string;
  question: string;
  correctAnswer?: string;
  studentAnswer?: string;
  isCorrect: boolean;
  timeSpentMs?: number;
  hintUsed?: boolean;
  attempts?: number;
};

type QuizWrongItem = {
  question: string;
  studentAnswer?: string;
  correctAnswer?: string;
};

type QuizResultPayload = {
  topic: string;
  total: number;
  correct: number;
  questions: QuizWrongItem[];
  wrong: QuizWrongItem[];
  durationSeconds?: number;
  finishedAt?: string;
};

type DueWrongbookItem = {
  id?: string;
  topic?: string;
  question?: string;
  studentAnswer?: string | null;
  correctAnswer?: string | null;
};

type ParentBindQrResult = {
  studentId: string;
  studentName?: string;
  studentGrade?: string;
  assistantId?: string;
  activationId: string;
  status: string;
  expiresAt?: string | null;
  profileName?: string | null;
  hermesProfileId?: string | null;
  qrPayload?: string | null;
  qrImageUrl?: string | null;
  weixinUserId?: string | null;
  gatewayStatus?: string | null;
  bound?: boolean;
  message?: string;
};

type EduAttemptRecord = EduAnswerPayload & {
  id: string;
  studentId: string;
  lessonId: string;
  kind?: 'answer' | 'quiz';
  total?: number;
  correct?: number;
  wrongCount?: number;
  receivedAt: string;
  saveStatus: 'saving' | 'saved' | 'failed';
  error?: string;
};

type BoardOperation =
  | {
      action: 'create';
      type: string;
      x?: number;
      y?: number;
      props?: Record<string, unknown>;
    }
  | {
      action: 'update';
      id: string;
      props?: Record<string, unknown>;
    }
  | {
      action: 'delete';
      id: string;
    };

type DragState =
  | {
      mode: 'move';
      id: string;
      startClientX: number;
      startClientY: number;
      startX: number;
      startY: number;
    }
  | {
      mode: 'resize';
      id: string;
      startClientX: number;
      startClientY: number;
      startW: number;
      startH: number;
    }
  | {
      mode: 'ai-panel';
      startClientX: number;
      startClientY: number;
      startX: number;
      startY: number;
    };

const STORAGE_KEY = 'dlgzz-own-whiteboard-v1';
const AI_PANEL_WIDTH = 390;
const AI_PANEL_HEIGHT = 520;
const AI_PANEL_MARGIN = 12;

const SYSTEM_PROMPT = `⚠️ CRITICAL JSON-ONLY MODE ⚠️

You are an interactive content designer for a canvas-based workspace. Your job is to turn the user's idea into visual, interactive HTML components or concise text cards.

🚨 ABSOLUTE RULE: You MUST respond with VALID JSON ONLY. No explanations, no markdown, no code blocks.

🚫 DO NOT ENTER BOOTSTRAP / IDENTITY MODE:
- If the user mentions BOOTSTRAP.md, IDENTITY.md, USER.md, onboarding, identity collection, or "引导对话", treat that text as content to visualize.
- Do NOT ask the user questions to fill files.
- Do NOT describe what you should do.
- Your only job is to return component operations for this canvas.

📋 REQUIRED JSON FORMAT:
{
  "thought": "中文思考过程",
  "voice_response": "中文语音反馈",
  "operations": [
    {
      "action": "create",
      "type": "preview_html",
      "props": {
        "w": 700,
        "h": 500,
        "html": "完整的HTML代码..."
      }
    }
  ]
}

🎯 SUPPORTED TYPES:
- "preview_html": Full HTML applications/slides/tutorials with CSS/JS
- "ai_result": Text cards (props: { "text": "...", "w": 320, "h": 220, "color": "#f0fdf4" })

🔄 UPDATE EXISTING SHAPES:
When shapes are selected, they are shown in CURRENT CONTEXT with [ID: shape:xxx].
To modify selected shapes, return:
{"action":"update","id":"shape:xxxxxx","props":{...only_changed_props}}

Updatable props by type:
- "preview_html": { "html", "w", "h" } and html must be a complete HTML document
- "ai_result": { "text", "w", "h", "color" }

RULES:
- If user asks to 修改/改/换/调整/fix/improve selected shape, use "update"
- If user wants something new, use "create"
- Can mix create and update in the same response
- Use Chinese for "thought" and "voice_response"

💡 HTML REQUIREMENTS:
- Self-contained: include all CSS and JS inline
- Interactive: use buttons, onclick handlers, sliders, animations, transitions when useful
- Beautiful and readable: modern UI, professional spacing, 14px+ fonts, 1.5+ line-height
- Do not load external scripts or styles
- Educational quizzes MUST report the final result to the parent whiteboard using this exact contract:
  window.parent.postMessage({ type: "quiz_result", studentId: "<student id if known>", quiz: { topic, total, correct, questions, wrong, durationSeconds, finishedAt } }, "*")
- If CURRENT STUDENT ID is provided, use that exact studentId. Never use "demo-student".
- questions must include every answered question, for example: [{ question: "7+8", studentAnswer: "15", correctAnswer: "15" }]
- wrong must include only incorrect questions, for example: [{ question: "7+8", studentAnswer: "14", correctAnswer: "15" }]
- If you include due wrongbook questions in the quiz, they MUST appear in questions even when answered correctly. Only put them in wrong if the student answers incorrectly.
- Use stable topic/skill labels, for example: "10以内加减法", "addition_carry", "multiplication_table_9"
- You may additionally report single answers with type "edu.answer", but "quiz_result" is the required final event.

✅ EXAMPLE:
{"thought":"用户想要一个交互式步骤演示，我将创建 HTML 组件","voice_response":"已生成互动组件","operations":[{"action":"create","type":"preview_html","props":{"w":700,"h":500,"html":"<!DOCTYPE html><html><head><style>body{margin:0;font-family:system-ui;background:#111827;color:#f9fafb;padding:24px}.step{padding:14px;border:1px solid #374151;border-radius:8px;margin:10px 0}.active{border-color:#60a5fa;background:#1f2937}button{padding:10px 14px;border:0;border-radius:6px;background:#60a5fa;color:#0f172a;font-weight:700}</style></head><body><h1>互动步骤</h1><div id='step' class='step active'>点击按钮推进内容</div><button onclick=\\"document.getElementById('step').textContent='已经进入下一步'\\">下一步</button></body></html>"}}]}`;

function createId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `shape:${crypto.randomUUID().slice(0, 8)}`;
  }
  return `shape:${Math.random().toString(36).slice(2, 10)}`;
}

function getDefaultHtml(studentId = '') {
  const serializedStudentId = JSON.stringify(studentId);
  return `<!DOCTYPE html><html><head><style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f8fafc;color:#111827;font-family:system-ui}.box{padding:28px;border:1px solid #d1d5db;border-radius:8px;background:white;box-shadow:0 12px 30px rgba(15,23,42,.08)}button{margin-top:12px;padding:10px 14px;border:0;border-radius:6px;background:#111827;color:white}.ok{display:none;margin-top:12px;color:#047857;font-size:14px}</style></head><body><div class="box"><h2>HTML 组件</h2><p>点击按钮会向白板上报一份 quiz_result 测试成绩。</p><button onclick="reportQuizResult()">上报测试成绩</button><div id="ok" class="ok">已上报：10以内加减法 1/1</div></div><script>function reportQuizResult(){document.getElementById("ok").style.display="block";window.parent.postMessage({type:"quiz_result",studentId:${serializedStudentId},quiz:{topic:"10以内加减法",total:1,correct:1,questions:[{question:"1+1",studentAnswer:"2",correctAnswer:"2"}],wrong:[],durationSeconds:12,finishedAt:new Date().toISOString()}},"*")}</script></body></html>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function buildFallbackHtml(userText: string, note: string) {
  const safeText = escapeHtml(userText);
  const safeNote = escapeHtml(note);
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      background: #f7f8fb;
      color: #111827;
      padding: 28px;
    }
    .wrap {
      max-width: 720px;
      margin: 0 auto;
      background: #fff;
      border: 1px solid #d7dde7;
      border-radius: 8px;
      box-shadow: 0 18px 40px rgba(15,23,42,.08);
      overflow: hidden;
    }
    header {
      padding: 18px 20px;
      border-bottom: 1px solid #e5e7eb;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      background: #111827;
      color: #fff;
    }
    h1 { font-size: 18px; margin: 0; }
    .tag { font-size: 12px; color: #cbd5e1; }
    main { padding: 20px; }
    .prompt {
      white-space: pre-wrap;
      line-height: 1.65;
      font-size: 15px;
      border: 1px solid #e5e7eb;
      background: #f9fafb;
      border-radius: 8px;
      padding: 16px;
    }
    .notice {
      margin-top: 14px;
      font-size: 13px;
      line-height: 1.5;
      color: #4b5563;
    }
    button {
      margin-top: 18px;
      border: 0;
      border-radius: 6px;
      padding: 10px 14px;
      background: #2563eb;
      color: white;
      font-weight: 700;
      cursor: pointer;
    }
    .done {
      margin-top: 12px;
      display: none;
      padding: 12px;
      border-radius: 6px;
      background: #ecfdf5;
      color: #065f46;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <header>
      <h1>已生成组件草稿</h1>
      <div class="tag">本地兜底组件</div>
    </header>
    <main>
      <div class="prompt">${safeText}</div>
      <div class="notice">${safeNote}</div>
      <button onclick="document.querySelector('.done').style.display='block'">确认内容</button>
      <div class="done">这段输入已被作为画布内容处理，没有进入引导对话流程。</div>
    </main>
  </div>
</body>
</html>`;
}

function normalizeShapeType(type: string): ShapeType {
  if (type === 'preview_html' || type === 'html' || type === 'app') return 'preview_html';
  return 'ai_result';
}

function extractJson(raw: string) {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = fenced?.[1] || raw;
  const jsonMatch = source.match(/\{[\s\S]*\}/);
  return jsonMatch ? JSON.parse(jsonMatch[0]) : null;
}

function getShapeTitle(shape: BoardShape) {
  if (shape.type === 'preview_html') {
    const title = shape.props.html?.match(/<title>(.*?)<\/title>/i)?.[1];
    const h1 = shape.props.html?.match(/<h1[^>]*>(.*?)<\/h1>/i)?.[1];
    return (title || h1 || 'HTML 组件').replace(/<[^>]*>/g, '').slice(0, 22);
  }
  return (shape.props.text || '文本卡片').split('\n')[0].slice(0, 22);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function clampAiPanelPosition(x: number, y: number) {
  if (typeof window === 'undefined') return { x, y };

  return {
    x: clamp(x, AI_PANEL_MARGIN, window.innerWidth - AI_PANEL_WIDTH - AI_PANEL_MARGIN),
    y: clamp(y, AI_PANEL_MARGIN, window.innerHeight - AI_PANEL_HEIGHT - AI_PANEL_MARGIN),
  };
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function readText(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function readBoolean(value: unknown, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', 'yes', '1', 'correct'].includes(normalized)) return true;
    if (['false', 'no', '0', 'wrong'].includes(normalized)) return false;
  }
  return fallback;
}

function readNumber(value: unknown) {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function normalizeWrongItems(value: unknown): QuizWrongItem[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!isObjectRecord(item)) return null;
      const question = readText(item.question);
      if (!question) return null;
      return {
        question,
        studentAnswer: readText(item.studentAnswer) || undefined,
        correctAnswer: readText(item.correctAnswer) || undefined,
      };
    })
    .filter(Boolean) as QuizWrongItem[];
}

function normalizeQuizResultPayload(payload: unknown): QuizResultPayload | null {
  if (!isObjectRecord(payload)) return null;

  const topic = readText(payload.topic, readText(payload.skill, '未分类练习'));
  const questions = normalizeWrongItems(
    payload.questions || payload.items || payload.answers || payload.questionItems
  );
  const wrong = normalizeWrongItems(payload.wrong);
  const totalValue = readNumber(payload.total) ?? (questions.length || wrong.length);
  const total = Math.max(0, Math.round(totalValue));
  const correct = Math.max(
    0,
    Math.min(total, Math.round(readNumber(payload.correct) ?? total - wrong.length))
  );

  if (!topic || total <= 0) return null;

  return {
    topic,
    total,
    correct,
    questions,
    wrong,
    durationSeconds: readNumber(payload.durationSeconds),
    finishedAt: readText(payload.finishedAt) || undefined,
  };
}

function normalizeEduAnswerPayload(payload: unknown): EduAnswerPayload | null {
  if (!isObjectRecord(payload)) return null;

  const question = readText(payload.question);
  const correctAnswer = readText(payload.correctAnswer);
  const studentAnswer = readText(payload.studentAnswer);
  const isCorrect =
    typeof payload.isCorrect === 'boolean' || typeof payload.isCorrect === 'string'
      ? readBoolean(payload.isCorrect)
      : Boolean(correctAnswer && studentAnswer && correctAnswer === studentAnswer);

  if (!question && !correctAnswer && !studentAnswer) return null;

  return {
    subject: readText(payload.subject, 'math'),
    grade: readText(payload.grade) || undefined,
    skill: readText(payload.skill, 'unknown_skill'),
    question: question || '未命名题目',
    correctAnswer: correctAnswer || undefined,
    studentAnswer: studentAnswer || undefined,
    isCorrect,
    timeSpentMs: readNumber(payload.timeSpentMs),
    hintUsed:
      typeof payload.hintUsed === 'undefined'
        ? undefined
        : readBoolean(payload.hintUsed),
    attempts: readNumber(payload.attempts),
  };
}

function readSearchParam(name: string, fallback: string) {
  if (typeof window === 'undefined') return fallback;
  const value = new URLSearchParams(window.location.search).get(name)?.trim();
  return value || fallback;
}

function formatLocalDateTime(value: string) {
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) return value;
  return time.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function buildParentBindQrHtml(bindQr: ParentBindQrResult) {
  const studentTitle = escapeHtml(bindQr.studentName || '未填写姓名');
  const studentId = escapeHtml(bindQr.studentId);
  const studentGrade = bindQr.studentGrade
    ? `<div class="meta-row"><span>年级</span><strong>${escapeHtml(bindQr.studentGrade)}</strong></div>`
    : '';
  const expiresAt = escapeHtml(bindQr.expiresAt ? formatLocalDateTime(bindQr.expiresAt) : '未返回');
  const profileName = bindQr.profileName || bindQr.hermesProfileId || '等待创建';
  const statusLabel = escapeHtml(getBindStatusLabel(bindQr.status, bindQr.bound));
  const helperText = bindQr.bound
    ? '家长微信已绑定到这个学生档案。'
    : '请让家长使用微信扫描侧边栏二维码并确认。';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: #f5f7fb;
      color: #111827;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    }
    .card {
      width: 100vw;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 8px;
      padding: 14px 16px;
      background: #ffffff;
    }
    .eyebrow {
      font-size: 13px;
      font-weight: 700;
      color: #2563eb;
    }
    h1 {
      margin: 0;
      font-size: 20px;
      line-height: 1.15;
      letter-spacing: 0;
    }
    .subtitle {
      margin: 0;
      color: #4b5563;
      font-size: 14px;
      line-height: 1.35;
    }
    .command {
      margin: 2px 0;
      padding: 14px 16px;
      border-radius: 8px;
      border: 1px solid #bfdbfe;
      background: #eff6ff;
      color: #0f172a;
      font-size: 22px;
      line-height: 1.25;
      font-weight: 800;
      text-align: center;
      overflow-wrap: anywhere;
    }
    .meta {
      display: grid;
      gap: 6px;
      padding: 10px 12px;
      border-radius: 8px;
      background: #f8fafc;
      border: 1px solid #e5e7eb;
    }
    .meta-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      font-size: 13px;
      color: #6b7280;
    }
    .meta-row strong {
      color: #111827;
      font-size: 14px;
      text-align: right;
      overflow-wrap: anywhere;
    }
    .status {
      display: inline-flex;
      width: fit-content;
      align-items: center;
      gap: 6px;
      border-radius: 999px;
      background: #ecfeff;
      color: #0e7490;
      padding: 5px 9px;
      font-size: 12px;
      font-weight: 800;
    }
    .hint {
      margin: 0;
      color: #6b7280;
      font-size: 12px;
      line-height: 1.35;
    }
  </style>
</head>
<body>
  <main class="card">
    <div class="eyebrow">Hermes 家长绑定</div>
    <h1>${studentTitle}</h1>
    <p class="subtitle">${escapeHtml(helperText)}</p>
    <div class="command">微信扫码激活 Hermes Profile</div>
    <div class="status">${statusLabel}</div>
    <section class="meta">
      <div class="meta-row"><span>学生编号</span><strong>${studentId}</strong></div>
      ${studentGrade}
      <div class="meta-row"><span>Profile</span><strong>${escapeHtml(profileName)}</strong></div>
      <div class="meta-row"><span>有效期</span><strong>${expiresAt}</strong></div>
    </section>
    <p class="hint">扫码成功后，Hermes 会自动把家长微信身份绑定到这个学生档案。</p>
  </main>
</body>
</html>`;
}

function getBindStatusLabel(status: string, bound?: boolean) {
  if (bound || status === 'activated' || status === 'active') return '已绑定';
  if (status === 'scanned') return '已扫码，等待确认';
  if (status === 'expired' || status === 'activation_expired') return '二维码已过期';
  if (status === 'failed' || status === 'activation_failed') return '激活失败';
  if (status === 'demo_ready') return '演示二维码';
  return '等待扫码';
}

function isBindPollingStatus(status: string) {
  return ['qr_ready', 'scanned', 'ready_to_activate', 'demo_ready'].includes(status);
}

function resolveStudentIdFromMessage(value: unknown, fallback: string) {
  const direct = readText(value);
  const normalized = direct.trim().toLowerCase();
  if (
    direct &&
    normalized !== 'demo-student' &&
    normalized !== '<student id if known>' &&
    normalized !== '<student id>'
  ) {
    return direct;
  }
  return fallback;
}

function formatDueWrongbookPrompt(items: DueWrongbookItem[]) {
  if (items.length === 0) return '';

  const lines = items.slice(0, 8).map((item, index) => {
    const topic = readText(item.topic, '未分类');
    const question = readText(item.question, '未知题目');
    const studentAnswer = readText(item.studentAnswer, '未记录');
    const correctAnswer = readText(item.correctAnswer, '未记录');
    return `${index + 1}. [${topic}] ${question}，上次答：${studentAnswer}，正确答案：${correctAnswer}`;
  });

  return [
    'STUDENT DUE WRONGBOOK:',
    '以下是该学生到期需要重现的错题。生成练习或课件时，必须把这些题自然混入练习中，并且仍然按 quiz_result 协议上报最终成绩。',
    '上报时，所有做过的题都必须进入 quiz.questions；只有答错的题进入 quiz.wrong。到期错题如果这次答对，也必须出现在 quiz.questions 中，这样系统才能把复习节点标记为完成。',
    ...lines,
  ].join('\n');
}

export default function OwnWhiteboard() {
  const [shapes, setShapes] = useState<BoardShape[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(true);
  const [lessonLibraryOpen, setLessonLibraryOpen] = useState(false);
  const [lessonPosts, setLessonPosts] = useState<LessonPromptPost[]>([]);
  const [lessonLoading, setLessonLoading] = useState(false);
  const [lessonSearch, setLessonSearch] = useState('');
  const [aiPanelPosition, setAiPanelPosition] = useState<{ x: number; y: number } | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [eduAttempts, setEduAttempts] = useState<EduAttemptRecord[]>([]);
  const [messages, setMessages] = useState<BoardMessage[]>([
    { role: 'system', text: '自研白板已启动。AI 会通过 Hermes 返回 JSON action。' },
  ]);
  const [ready, setReady] = useState(false);
  const dragRef = useRef<DragState | null>(null);
  const studentId = useMemo(() => readSearchParam('studentId', ''), []);
  const lessonId = useMemo(() => readSearchParam('lessonId', 'own-whiteboard-demo'), []);
  const [bindPanelOpen, setBindPanelOpen] = useState(false);
  const [bindStudentId, setBindStudentId] = useState(studentId);
  const [bindStudentName, setBindStudentName] = useState('');
  const [bindStudentGrade, setBindStudentGrade] = useState('');
  const [bindLoading, setBindLoading] = useState(false);
  const [bindError, setBindError] = useState('');
  const [bindQr, setBindQr] = useState<ParentBindQrResult | null>(null);

  const selectedShape = useMemo(
    () => shapes.find((shape) => shape.id === selectedId) || null,
    [selectedId, shapes]
  );

  const lessonPromptPosts = useMemo(
    () => lessonPosts.filter((post) => post.whiteboardPrompt?.trim()),
    [lessonPosts]
  );

  const filteredLessonPosts = useMemo(() => {
    const keyword = lessonSearch.trim().toLowerCase();
    if (!keyword) return lessonPromptPosts;
    return lessonPromptPosts.filter((post) => {
      return (
        post.title.toLowerCase().includes(keyword) ||
        post.description.toLowerCase().includes(keyword) ||
        (post.whiteboardPrompt || '').toLowerCase().includes(keyword)
      );
    });
  }, [lessonPromptPosts, lessonSearch]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) setShapes(parsed);
      }
    } catch {
      // Ignore invalid local state.
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(shapes));
  }, [ready, shapes]);

  useEffect(() => {
    if (studentId && !bindStudentId) setBindStudentId(studentId);
  }, [bindStudentId, studentId]);

  useEffect(() => {
    if (!bindQr?.activationId || !bindQr.studentId || !isBindPollingStatus(bindQr.status)) {
      return;
    }

    let stopped = false;
    let timer: number | null = null;

    const poll = async () => {
      try {
        const params = new URLSearchParams({ studentId: bindQr.studentId });
        const response = await fetch(
          `/api/learning-assistant/profile-activation/${encodeURIComponent(bindQr.activationId)}?${params.toString()}`,
          { cache: 'no-store' }
        );
        const data = await response.json().catch(() => null);

        if (response.ok && data?.success) {
          const nextStatus = readText(data.status, bindQr.status);
          const nextQr: ParentBindQrResult = {
            ...bindQr,
            activationId: readText(data.activationId, bindQr.activationId),
            status: nextStatus,
            expiresAt: readText(data.expiresAt, bindQr.expiresAt || '') || bindQr.expiresAt,
            profileName: readText(data.profileName) || bindQr.profileName,
            hermesProfileId: readText(data.hermesProfileId) || bindQr.hermesProfileId,
            qrPayload: readText(data.qrPayload) || bindQr.qrPayload,
            qrImageUrl: readText(data.qrImageUrl) || bindQr.qrImageUrl,
            weixinUserId: readText(data.weixinUserId) || bindQr.weixinUserId,
            gatewayStatus: readText(data.gatewayStatus) || bindQr.gatewayStatus,
            bound: Boolean(data.bound) || bindQr.bound,
            message: readText(data.message, bindQr.message || ''),
          };

          setBindQr((current) =>
            current?.activationId === bindQr.activationId ? nextQr : current
          );

          if (nextQr.bound || nextStatus === 'activated') {
            setMessages((current) => [
              ...current,
              {
                role: 'system',
                text: `${nextQr.studentId} 已绑定到 Hermes Profile：${nextQr.profileName || nextQr.hermesProfileId || '未返回'}`,
              },
            ]);
          }

          if (!stopped && isBindPollingStatus(nextStatus)) {
            timer = window.setTimeout(poll, 2500);
          }
          return;
        }
      } catch {
        // Keep the visible QR and try again while it is still pending.
      }

      if (!stopped && isBindPollingStatus(bindQr.status)) {
        timer = window.setTimeout(poll, 3000);
      }
    };

    timer = window.setTimeout(poll, 2500);
    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [bindQr]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!isObjectRecord(data)) return;

      if (data.type === 'quiz_result') {
        const quiz = normalizeQuizResultPayload(data.quiz);
        if (!quiz) return;

        const targetStudentId = resolveStudentIdFromMessage(data.studentId, studentId);
        const record: EduAttemptRecord = {
          id: `quiz:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
          kind: 'quiz',
          studentId: targetStudentId,
          lessonId,
          subject: 'math',
          skill: quiz.topic,
          question: `${quiz.topic}：${quiz.correct}/${quiz.total}`,
          isCorrect: quiz.correct === quiz.total,
          total: quiz.total,
          correct: quiz.correct,
          wrongCount: quiz.wrong.length,
          receivedAt: new Date().toISOString(),
          saveStatus: 'saving',
        };

        setEduAttempts((current) => [record, ...current].slice(0, 20));
        setMessages((current) => [
          ...current,
          {
            role: 'system',
            text: `收到成绩：${quiz.topic}，${quiz.correct}/${quiz.total}，错题 ${quiz.wrong.length} 道`,
          },
        ]);
        void persistQuizResult(record, quiz);
        return;
      }

      if (data.type === 'edu.answer') {
        const payload = normalizeEduAnswerPayload(data.payload);
        if (!payload) return;

        const record: EduAttemptRecord = {
          ...payload,
          id: `attempt:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
          kind: 'answer',
          studentId,
          lessonId,
          receivedAt: new Date().toISOString(),
          saveStatus: 'saving',
        };

        setEduAttempts((current) => [record, ...current].slice(0, 20));
        setMessages((current) => [
          ...current,
          {
            role: 'system',
            text: `收到学习事件：${record.question}，${record.isCorrect ? '答对' : '答错'}，知识点 ${record.skill}`,
          },
        ]);
        void persistEduAttempt(record);
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [lessonId, studentId]);

  useEffect(() => {
    setAiPanelPosition((current) => {
      if (current) return current;
      return clampAiPanelPosition(window.innerWidth - AI_PANEL_WIDTH - 20, 20);
    });
  }, []);

  useEffect(() => {
    const onResize = () => {
      setAiPanelPosition((current) =>
        current ? clampAiPanelPosition(current.x, current.y) : current
      );
    };

    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = event.clientX - drag.startClientX;
      const dy = event.clientY - drag.startClientY;

      if (drag.mode === 'ai-panel') {
        setAiPanelPosition(clampAiPanelPosition(drag.startX + dx, drag.startY + dy));
        return;
      }

      setShapes((current) =>
        current.map((shape) => {
          if (shape.id !== drag.id) return shape;
          if (drag.mode === 'move') {
            return { ...shape, x: drag.startX + dx, y: drag.startY + dy };
          }
          return {
            ...shape,
            props: {
              ...shape.props,
              w: Math.max(220, drag.startW + dx),
              h: Math.max(160, drag.startH + dy),
            },
          };
        })
      );
    };

    const onUp = () => {
      dragRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);

  function buildContext() {
    if (!selectedShape) return 'Selected Shapes:\nNo shapes selected.';
    const content =
      selectedShape.type === 'preview_html'
        ? `HTML App: "${(selectedShape.props.html || '').slice(0, 1800)}"`
        : `Text: "${(selectedShape.props.text || '').slice(0, 1800)}"`;
    return [
      'Selected Shapes:',
      `- [ID: ${selectedShape.id}] Type: ${selectedShape.type}, ${content}, Size: ${Math.round(
        selectedShape.props.w
      )}x${Math.round(selectedShape.props.h)}`,
    ].join('\n');
  }

  function createShape(
    type: ShapeType,
    props?: Partial<BoardShape['props']>,
    placement?: { x?: number; y?: number; select?: boolean }
  ) {
    const w = props?.w || (type === 'preview_html' ? 620 : 320);
    const h = props?.h || (type === 'preview_html' ? 460 : 220);
    const next: BoardShape = {
      id: createId(),
      type,
      x: Math.max(40, placement?.x ?? window.innerWidth / 2 - w / 2),
      y: Math.max(24, placement?.y ?? window.innerHeight / 2 - h / 2),
      props: {
        w,
        h,
        html: type === 'preview_html' ? props?.html || getDefaultHtml(studentId) : undefined,
        text: type === 'ai_result' ? props?.text || '新的文本卡片' : undefined,
        color: props?.color || '#ffffff',
      },
    };
    setShapes((current) => [...current, next]);
    if (placement?.select !== false) {
      setSelectedId(next.id);
    }
  }

  function executeOperations(operations: BoardOperation[]) {
    setShapes((current) => {
      let next = [...current];
      let offset = 0;

      for (const op of operations) {
        if (op.action === 'create') {
          const type = normalizeShapeType(op.type);
          const props = (op.props || {}) as BoardShape['props'];
          const w = Number(props.w || (type === 'preview_html' ? 680 : 340));
          const h = Number(props.h || (type === 'preview_html' ? 500 : 220));
          const shape: BoardShape = {
            id: createId(),
            type,
            x: Number(op.x ?? window.innerWidth / 2 - w / 2 + offset),
            y: Number(op.y ?? window.innerHeight / 2 - h / 2 + offset),
            props: {
              w,
              h,
              html: type === 'preview_html' ? String(props.html || getDefaultHtml(studentId)) : undefined,
              text: type === 'ai_result' ? String(props.text || 'AI 结果') : undefined,
              color: String(props.color || '#ffffff'),
            },
          };
          next.push(shape);
          setSelectedId(shape.id);
          offset += 36;
        }

        if (op.action === 'update') {
          next = next.map((shape) => {
            if (shape.id !== op.id) return shape;
            return {
              ...shape,
              props: {
                ...shape.props,
                ...(op.props || {}),
              },
            };
          });
          setSelectedId(op.id);
        }

        if (op.action === 'delete') {
          next = next.filter((shape) => shape.id !== op.id);
          if (selectedId === op.id) setSelectedId(null);
        }
      }

      return next;
    });
  }

  function createFallbackShape(userText: string, note: string) {
    executeOperations([
      {
        action: 'create',
        type: 'preview_html',
        props: {
          w: 680,
          h: 460,
          html: buildFallbackHtml(userText, note),
        },
      },
    ]);
  }

  async function persistEduAttempt(record: EduAttemptRecord) {
    try {
      if (!record.studentId) {
        throw new Error('缺少 studentId，请通过 URL 参数 ?studentId=学生编号 打开白板');
      }

      const studentResponse = await fetch('/api/learning-assistant/record-quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: record.studentId,
          lessonId: record.lessonId,
          source: 'whiteboard-single-answer',
          quiz: {
            topic: record.skill,
            total: 1,
            correct: record.isCorrect ? 1 : 0,
            questions: [
              {
                question: record.question,
                studentAnswer: record.studentAnswer,
                correctAnswer: record.correctAnswer,
              },
            ],
            wrong: record.isCorrect
              ? []
              : [
                  {
                    question: record.question,
                    studentAnswer: record.studentAnswer,
                    correctAnswer: record.correctAnswer,
                  },
                ],
            durationSeconds:
              typeof record.timeSpentMs === 'number'
                ? Math.round(record.timeSpentMs / 1000)
                : undefined,
            finishedAt: record.receivedAt,
          },
        }),
      });
      const studentData = await studentResponse.json().catch(() => null);
      if (!studentResponse.ok || !studentData?.success) {
        throw new Error(studentData?.error || `HTTP ${studentResponse.status}`);
      }

      setEduAttempts((current) =>
        current.map((item) =>
          item.id === record.id ? { ...item, saveStatus: 'saved' } : item
        )
      );
    } catch (error) {
      setEduAttempts((current) =>
        current.map((item) =>
          item.id === record.id
            ? {
                ...item,
                saveStatus: 'failed',
                error: error instanceof Error ? error.message : '保存失败',
              }
            : item
        )
      );
    }
  }

  async function persistQuizResult(record: EduAttemptRecord, quiz: QuizResultPayload) {
    try {
      if (!record.studentId) {
        throw new Error('缺少 studentId，请通过 URL 参数 ?studentId=学生编号 打开白板');
      }

      const response = await fetch('/api/learning-assistant/record-quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: record.studentId,
          lessonId: record.lessonId,
          source: 'whiteboard',
          quiz: {
            topic: quiz.topic,
            total: quiz.total,
            correct: quiz.correct,
            questions: quiz.questions,
            wrong: quiz.wrong,
            durationSeconds: quiz.durationSeconds,
            finishedAt: quiz.finishedAt || record.receivedAt,
          },
        }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || `HTTP ${response.status}`);
      }

      setEduAttempts((current) =>
        current.map((item) =>
          item.id === record.id ? { ...item, saveStatus: 'saved' } : item
        )
      );
    } catch (error) {
      setEduAttempts((current) =>
        current.map((item) =>
          item.id === record.id
            ? {
                ...item,
                saveStatus: 'failed',
                error: error instanceof Error ? error.message : '保存失败',
              }
            : item
        )
      );
    }
  }

  async function fetchLessonPosts() {
    if (lessonLoading || lessonPosts.length > 0) return;
    setLessonLoading(true);
    try {
      const response = await fetch('/api/whiteboard/blog-posts?locale=zh');
      const data = await response.json();
      if (data?.success && Array.isArray(data.posts)) {
        setLessonPosts(data.posts);
      }
    } finally {
      setLessonLoading(false);
    }
  }

  function toggleLessonLibrary() {
    setAiOpen(true);
    setLessonLibraryOpen((open) => {
      const next = !open;
      if (next) void fetchLessonPosts();
      return next;
    });
  }

  function runLessonPrompt(post: LessonPromptPost) {
    const prompt =
      post.whiteboardPrompt?.trim() ||
      `帮我基于博客《${post.title}》生成一个互动教育课件。博客简介：${post.description}`;
    setLessonLibraryOpen(false);
    void runAIWithPrompt(prompt, `课件库：${post.title}`);
  }

  async function createParentBindQr() {
    const targetStudentId = bindStudentId.trim();
    if (!targetStudentId) {
      setBindError('请先输入学生编号');
      return;
    }

    setBindLoading(true);
    setBindError('');
    setBindQr(null);

    try {
      const activationResponse = await fetch('/api/learning-assistant/profile-activation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: targetStudentId,
          name: bindStudentName.trim(),
          grade: bindStudentGrade.trim(),
        }),
      });
      const activationData = await activationResponse.json().catch(() => null);

      if (!activationResponse.ok || !activationData?.success) {
        throw new Error(activationData?.error || `HTTP ${activationResponse.status}`);
      }

      const nextQr: ParentBindQrResult = {
        studentId: readText(activationData.studentId, targetStudentId),
        studentName: bindStudentName.trim() || readText(activationData.studentName) || undefined,
        studentGrade: bindStudentGrade.trim() || readText(activationData.studentGrade) || undefined,
        assistantId: readText(activationData.assistantId) || undefined,
        activationId: readText(activationData.activationId),
        status: readText(activationData.status, 'qr_ready'),
        expiresAt: readText(activationData.expiresAt) || null,
        profileName: readText(activationData.profileName) || null,
        hermesProfileId: readText(activationData.hermesProfileId) || null,
        qrPayload: readText(activationData.qrPayload) || null,
        qrImageUrl: readText(activationData.qrImageUrl) || null,
        weixinUserId: readText(activationData.weixinUserId) || null,
        gatewayStatus: readText(activationData.gatewayStatus) || null,
        bound: Boolean(activationData.bound),
        message: readText(activationData.message),
      };

      if (!nextQr.activationId) {
        throw new Error('Hermes 未返回 activationId');
      }
      if (!nextQr.qrPayload && !nextQr.qrImageUrl && nextQr.status !== 'activated') {
        throw new Error('Hermes Bridge 未返回可扫码二维码');
      }

      setBindQr(nextQr);
      createShape('preview_html', {
        w: 390,
        h: 320,
        html: buildParentBindQrHtml(nextQr),
      }, {
        y: 28,
        select: false,
      });
      setSelectedId(null);
      setMessages((current) => [
        ...current,
        { role: 'system', text: `已生成 ${targetStudentId} 的 Hermes 微信绑定二维码，请让家长扫码确认。` },
      ]);
    } catch (error) {
      setBindError(error instanceof Error ? error.message : '生成 Hermes 绑定二维码失败');
    } finally {
      setBindLoading(false);
    }
  }

  async function fetchDueWrongbookPrompt() {
    if (!studentId) return { count: 0, prompt: '' };

    try {
      const params = new URLSearchParams({
        studentId,
        poolLimit: '20',
        limit: '8',
        dueBefore: new Date().toISOString(),
      });
      const response = await fetch(`/api/learning-assistant/next-practice?${params.toString()}`);
      const data = await response.json().catch(() => null);
      const items = Array.isArray(data?.items) ? (data.items as DueWrongbookItem[]) : [];

      return {
        count: Number(data?.count || items.length),
        prompt: readText(data?.prompt) || formatDueWrongbookPrompt(items),
      };
    } catch {
      return { count: 0, prompt: '' };
    }
  }

  async function runAIWithPrompt(rawPrompt: string, sourceLabel?: string) {
    const userText = rawPrompt.trim();
    if (!userText || loading) return;
    setInput('');
    setLoading(true);
    setMessages((current) => [
      ...current,
      { role: 'user', text: sourceLabel || userText },
    ]);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 45000);

    try {
      const context = buildContext();
      const dueWrongbook = await fetchDueWrongbookPrompt();
      const finalPrompt = `${SYSTEM_PROMPT}\n\nCURRENT CONTEXT:\n${context}\n\nUSER REQUEST${
        sourceLabel ? ` (${sourceLabel})` : ''
      }: ${userText}\n\nCURRENT STUDENT ID: ${
        studentId ? `"${studentId}"` : '未提供，生成组件可以继续，但答题结果无法入档'
      }${
        dueWrongbook.prompt ? `\n\n${dueWrongbook.prompt}` : ''
      }`;
      if (dueWrongbook.count > 0) {
        setMessages((current) => [
          ...current,
          { role: 'system', text: `已加入 ${dueWrongbook.count} 道到期错题用于重现。` },
        ]);
      }
      const response = await fetch('/api/whiteboard/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          sessionKey: 'own-whiteboard',
          purpose: 'courseware',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: finalPrompt },
          ],
        }),
      });

      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || `HTTP ${response.status}`);
      }

      const responseText = String(data.message || '');
      const plan = extractJson(responseText);
      if (!plan || !Array.isArray(plan.operations)) {
        createFallbackShape(userText, 'Hermes 没有返回 JSON operations，因此已自动生成本地 HTML 组件。');
        setMessages((current) => [
          ...current,
          { role: 'assistant', text: 'Hermes 没有返回组件 JSON，已使用本地兜底生成 HTML 组件。' },
        ]);
        return;
      }

      executeOperations(plan.operations as BoardOperation[]);
      setMessages((current) => [
        ...current,
        { role: 'assistant', text: plan.thought || plan.voice_response || '已执行。' },
      ]);
    } catch (error) {
      createFallbackShape(
        userText,
        error instanceof Error && error.name === 'AbortError'
          ? 'Hermes 响应超时，因此已自动生成本地 HTML 组件。'
          : 'Hermes 调用失败，因此已自动生成本地 HTML 组件。'
      );
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          text:
            error instanceof Error && error.name === 'AbortError'
              ? 'Hermes 超时，已直接生成本地 HTML 组件。'
              : 'Hermes 没有完成，已直接生成本地 HTML 组件。',
        },
      ]);
    } finally {
      window.clearTimeout(timeout);
      setLoading(false);
    }
  }

  function callAI() {
    void runAIWithPrompt(input);
  }

  function deleteSelected() {
    if (!selectedId) return;
    setShapes((current) => current.filter((shape) => shape.id !== selectedId));
    setSelectedId(null);
  }

  function downloadSelectedHtml() {
    if (!selectedShape || selectedShape.type !== 'preview_html') return;
    const blob = new Blob([selectedShape.props.html || ''], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${selectedShape.id.replace(':', '-')}.html`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div
      className="fixed inset-0 overflow-hidden bg-[#f6f7f9] text-[#111827]"
      style={{
        backgroundImage:
          'linear-gradient(rgba(17,24,39,.06) 1px, transparent 1px), linear-gradient(90deg, rgba(17,24,39,.06) 1px, transparent 1px)',
        backgroundSize: '24px 24px',
        fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) setSelectedId(null);
      }}
    >
      <div className="absolute left-4 top-4 z-40 flex items-center gap-2 rounded-md border border-black/10 bg-white/90 px-3 py-2 shadow-sm backdrop-blur">
        <MousePointer2 size={16} />
        <div className="text-sm font-semibold">Edu Board</div>
        <div className="h-4 w-px bg-black/10" />
        <a
          href="/zh/whiteboard"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-black/5"
          title="返回教育白板"
        >
          <Home size={16} />
        </a>
      </div>

      {shapes.map((shape) => (
        <ShapeView
          key={shape.id}
          shape={shape}
          selected={shape.id === selectedId}
          onSelect={() => setSelectedId(shape.id)}
          onMoveStart={(event) => {
            event.preventDefault();
            event.stopPropagation();
            event.currentTarget.setPointerCapture(event.pointerId);
            document.body.style.cursor = 'grabbing';
            document.body.style.userSelect = 'none';
            setSelectedId(shape.id);
            dragRef.current = {
              mode: 'move',
              id: shape.id,
              startClientX: event.clientX,
              startClientY: event.clientY,
              startX: shape.x,
              startY: shape.y,
            };
          }}
          onResizeStart={(event) => {
            event.preventDefault();
            event.stopPropagation();
            event.currentTarget.setPointerCapture(event.pointerId);
            document.body.style.cursor = 'nwse-resize';
            document.body.style.userSelect = 'none';
            setSelectedId(shape.id);
            dragRef.current = {
              mode: 'resize',
              id: shape.id,
              startClientX: event.clientX,
              startClientY: event.clientY,
              startW: shape.props.w,
              startH: shape.props.h,
            };
          }}
        />
      ))}

      {eduAttempts.length > 0 && (
        <div className="absolute bottom-20 left-4 z-40 w-[360px] overflow-hidden rounded-md border border-black/10 bg-white/95 shadow-xl backdrop-blur">
          <div className="flex items-center justify-between border-b border-black/10 px-3 py-2">
            <div className="flex min-w-0 items-center gap-2 text-sm font-semibold">
              <ClipboardCheck size={16} />
              学习事件
            </div>
            <div className="truncate text-xs text-black/45">{studentId}</div>
          </div>
          <div className="max-h-56 overflow-y-auto">
            {eduAttempts.slice(0, 6).map((attempt) => (
              <div key={attempt.id} className="border-b border-black/10 px-3 py-2 last:border-b-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 truncate text-sm font-medium text-[#111827]">
                    {attempt.question}
                  </div>
                  <span
                    className={[
                      'shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold',
                      attempt.isCorrect
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-rose-50 text-rose-700',
                    ].join(' ')}
                  >
                    {attempt.kind === 'quiz'
                      ? `${attempt.correct}/${attempt.total}`
                      : attempt.isCorrect
                        ? '答对'
                        : '答错'}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2 text-xs text-black/50">
                  <span className="truncate">
                    {attempt.kind === 'quiz'
                      ? `${attempt.skill} · 错题 ${attempt.wrongCount || 0} 道`
                      : attempt.skill}
                  </span>
                  <span>
                    {attempt.saveStatus === 'saved'
                      ? '已保存'
                      : attempt.saveStatus === 'failed'
                        ? '保存失败'
                        : '保存中'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {aiOpen && (
        <div
          className="absolute z-50 flex h-[520px] w-[390px] flex-col rounded-md border border-black/10 bg-white/95 shadow-xl backdrop-blur"
          style={
            aiPanelPosition
              ? { left: aiPanelPosition.x, top: aiPanelPosition.y }
              : { right: 20, top: 20 }
          }
        >
          <div className="flex items-center justify-between border-b border-black/10 px-4 py-3">
            <div
              className="flex min-w-0 flex-1 cursor-grab select-none items-center gap-2 text-sm font-semibold active:cursor-grabbing"
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                event.currentTarget.setPointerCapture(event.pointerId);
                const position =
                  aiPanelPosition ||
                  clampAiPanelPosition(window.innerWidth - AI_PANEL_WIDTH - 20, 20);
                setAiPanelPosition(position);
                document.body.style.cursor = 'grabbing';
                document.body.style.userSelect = 'none';
                dragRef.current = {
                  mode: 'ai-panel',
                  startClientX: event.clientX,
                  startClientY: event.clientY,
                  startX: position.x,
                  startY: position.y,
                };
              }}
              title="拖动 AI 面板"
            >
              <GripVertical size={15} className="shrink-0 text-black/35" />
              <Bot size={17} />
              Hermes AI
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className={[
                  'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-black/5',
                  lessonLibraryOpen ? 'bg-[#111827] text-white' : 'text-black/60',
                ].join(' ')}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={toggleLessonLibrary}
                title="课件库"
              >
                <BookOpen size={13} />
                课件库
              </button>
              <button
                type="button"
                className={[
                  'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-black/5',
                  bindPanelOpen ? 'bg-[#111827] text-white' : 'text-black/60',
                ].join(' ')}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => setBindPanelOpen((open) => !open)}
                title="Hermes 微信绑定"
              >
                <QrCode size={13} />
                绑定
              </button>
              <button
                type="button"
                className="rounded-md px-2 py-1 text-xs text-black/60 hover:bg-black/5"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => setMessages([{ role: 'system', text: '对话已清空。' }])}
              >
                清空
              </button>
            </div>
          </div>

          {lessonLibraryOpen && (
            <div className="border-b border-black/10 p-3">
              <input
                value={lessonSearch}
                onChange={(event) => setLessonSearch(event.target.value)}
                placeholder="搜索课件博客..."
                className="mb-2 h-9 w-full rounded-md border border-black/15 px-3 text-sm outline-none focus:border-[#111827]"
              />
              <div className="max-h-44 overflow-y-auto rounded-md border border-black/10">
                {lessonLoading ? (
                  <div className="px-3 py-4 text-center text-xs text-black/50">加载中...</div>
                ) : filteredLessonPosts.length === 0 ? (
                  <div className="px-3 py-4 text-center text-xs text-black/45">暂无课件提示词</div>
                ) : (
                  filteredLessonPosts.map((post) => (
                    <button
                      key={post.url}
                      type="button"
                      disabled={loading}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={() => runLessonPrompt(post)}
                      className="block w-full border-b border-black/10 px-3 py-2 text-left last:border-b-0 hover:bg-black/[0.03] disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <div className="truncate text-sm font-medium text-[#111827]">{post.title}</div>
                      <div className="mt-1 line-clamp-2 text-xs leading-4 text-black/55">
                        {post.description}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {bindPanelOpen && (
            <div className="border-b border-black/10 p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#111827]">
                <QrCode size={15} />
                Hermes 微信绑定
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={bindStudentId}
                  onChange={(event) => setBindStudentId(event.target.value)}
                  placeholder="学生编号，如 1号"
                  className="col-span-2 h-9 rounded-md border border-black/15 px-3 text-sm outline-none focus:border-[#111827]"
                />
                <input
                  value={bindStudentName}
                  onChange={(event) => setBindStudentName(event.target.value)}
                  placeholder="姓名"
                  className="h-9 rounded-md border border-black/15 px-3 text-sm outline-none focus:border-[#111827]"
                />
                <input
                  value={bindStudentGrade}
                  onChange={(event) => setBindStudentGrade(event.target.value)}
                  placeholder="年级"
                  className="h-9 rounded-md border border-black/15 px-3 text-sm outline-none focus:border-[#111827]"
                />
              </div>
              <button
                type="button"
                disabled={bindLoading || !bindStudentId.trim()}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={createParentBindQr}
                className="mt-2 inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-[#111827] px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                <QrCode size={15} />
                {bindLoading ? '生成中...' : '生成 Hermes 微信二维码'}
              </button>
              {bindError && (
                <div className="mt-2 rounded-md bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">
                  {bindError}
                </div>
              )}
              {bindQr && (
                <div className="mt-3 rounded-md border border-black/10 bg-white p-3">
                  <div className="text-xs leading-5 text-black/65">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold text-[#111827]">
                        {bindQr.studentName || '未填写姓名'} · {bindQr.studentId}
                      </div>
                      <span className="rounded-full bg-cyan-50 px-2 py-0.5 text-[11px] font-semibold text-cyan-700">
                        {getBindStatusLabel(bindQr.status, bindQr.bound)}
                      </span>
                    </div>
                    {bindQr.studentGrade && <div>年级：{bindQr.studentGrade}</div>}
                    <div>Profile：{bindQr.profileName || bindQr.hermesProfileId || '等待创建'}</div>
                    <div>
                      有效期：
                      {bindQr.expiresAt ? formatLocalDateTime(bindQr.expiresAt) : '未返回'}
                    </div>
                  </div>
                  {bindQr.qrImageUrl ? (
                    <div className="mt-3 flex justify-center rounded-md border border-black/10 bg-white p-3">
                      <img
                        src={bindQr.qrImageUrl}
                        alt="Hermes 微信绑定二维码"
                        className="size-40"
                      />
                    </div>
                  ) : bindQr.qrPayload ? (
                    <div className="mt-3 flex justify-center rounded-md border border-black/10 bg-white p-3">
                      <QrSvg value={bindQr.qrPayload} size={168} />
                    </div>
                  ) : null}
                  <div className="mt-2 text-xs leading-5 text-black/55">
                    {bindQr.bound
                      ? '绑定完成。家长之后在同一条微信聊天里提问即可读取这个学生档案。'
                      : bindQr.message || '请让家长用微信扫码并确认，页面会自动更新状态。'}
                  </div>
                  {bindQr.weixinUserId && (
                    <div className="mt-1 truncate text-[11px] leading-4 text-black/40">
                      微信身份：{bindQr.weixinUserId}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={[
                  'max-w-[86%] rounded-md px-3 py-2 text-sm leading-5',
                  message.role === 'user'
                    ? 'ml-auto bg-[#111827] text-white'
                    : message.role === 'assistant'
                      ? 'bg-[#e8f4ff] text-[#0f172a]'
                      : 'bg-[#f3f4f6] text-black/65',
                ].join(' ')}
              >
                {message.text}
              </div>
            ))}
            {loading && <div className="text-xs text-black/50">Hermes 正在生成...</div>}
          </div>

          <div className="border-t border-black/10 p-3">
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') callAI();
                }}
                placeholder={selectedId ? '描述如何修改选中组件...' : '描述你想生成的组件...'}
                className="h-10 min-w-0 flex-1 rounded-md border border-black/15 px-3 text-sm outline-none focus:border-[#111827]"
              />
              <button
                onClick={callAI}
                disabled={loading || !input.trim()}
                className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-[#111827] text-white disabled:cursor-not-allowed disabled:opacity-40"
                title="发送"
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="absolute bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-md border border-black/10 bg-white/95 p-2 shadow-xl backdrop-blur">
        <IconButton title="AI 助手" active={aiOpen} onClick={() => setAiOpen((open) => !open)}>
          <Bot size={18} />
        </IconButton>
        <IconButton title="课件库" active={lessonLibraryOpen} onClick={toggleLessonLibrary}>
          <BookOpen size={18} />
        </IconButton>
        <IconButton title="新增 HTML 组件" onClick={() => createShape('preview_html')}>
          <Code2 size={18} />
        </IconButton>
        <IconButton title="新增文本卡片" onClick={() => createShape('ai_result')}>
          <FileText size={18} />
        </IconButton>
        <div className="mx-1 h-7 w-px bg-black/10" />
        <IconButton title="下载选中 HTML" disabled={selectedShape?.type !== 'preview_html'} onClick={downloadSelectedHtml}>
          <Download size={18} />
        </IconButton>
        <IconButton title="删除选中组件" disabled={!selectedId} onClick={deleteSelected}>
          <Trash2 size={18} />
        </IconButton>
        <IconButton
          title="清空画布"
          disabled={shapes.length === 0}
          onClick={() => {
            setShapes([]);
            setSelectedId(null);
          }}
        >
          <Plus size={18} className="rotate-45" />
        </IconButton>
      </div>
    </div>
  );
}

function ShapeView({
  shape,
  selected,
  onSelect,
  onMoveStart,
  onResizeStart,
}: {
  shape: BoardShape;
  selected: boolean;
  onSelect: () => void;
  onMoveStart: (event: React.PointerEvent) => void;
  onResizeStart: (event: React.PointerEvent) => void;
}) {
  return (
    <div
      className="absolute rounded-md bg-white shadow-lg"
      style={{
        left: shape.x,
        top: shape.y,
        width: shape.props.w,
        height: shape.props.h,
        outline: selected ? '2px solid #2563eb' : '1px solid rgba(17,24,39,.14)',
        zIndex: selected ? 20 : 10,
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
        onSelect();
      }}
    >
      <div
        className="flex h-9 cursor-grab select-none items-center justify-between border-b border-black/10 bg-[#f8fafc] px-2.5 text-xs font-medium text-black/70 active:cursor-grabbing"
        onPointerDown={onMoveStart}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <GripVertical size={14} className="shrink-0 text-black/35" />
          <span className="truncate">{getShapeTitle(shape)}</span>
        </span>
        <span className="text-black/35">{shape.id.replace('shape:', '#')}</span>
      </div>

      <div className="h-[calc(100%-36px)] overflow-hidden rounded-b-md">
        {shape.type === 'preview_html' ? (
          <iframe
            title={shape.id}
            srcDoc={shape.props.html || ''}
            className="h-full w-full border-0 bg-white"
            sandbox="allow-scripts allow-forms allow-popups allow-modals allow-downloads"
          />
        ) : (
          <div
            className="h-full overflow-auto whitespace-pre-wrap p-4 text-sm leading-6"
            style={{ background: shape.props.color || '#ffffff' }}
          >
            {shape.props.text}
          </div>
        )}
      </div>

      <div
        className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize rounded-br-md border-b-2 border-r-2 border-[#2563eb] bg-white/70"
        onPointerDown={onResizeStart}
      />
    </div>
  );
}

function IconButton({
  title,
  children,
  active,
  disabled,
  onClick,
}: {
  title: string;
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={[
        'inline-flex h-10 w-10 items-center justify-center rounded-md transition',
        active ? 'bg-[#111827] text-white' : 'text-[#111827] hover:bg-black/5',
        disabled ? 'cursor-not-allowed opacity-35 hover:bg-transparent' : '',
      ].join(' ')}
    >
      {children}
    </button>
  );
}
