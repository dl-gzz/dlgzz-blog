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

type ShapeType = 'preview_html' | 'ai_result' | 'math_quiz';

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
  slug?: string;
  slugs?: string[];
  whiteboardPrompt?: string;
  hasWhiteboardPrompt?: boolean;
  whiteboardCategory?: string;
  hasSavedCourseware?: boolean;
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

const TEN_WITHIN_MATH_QUESTIONS = [
  { question: '1 + 9', a: 1, op: '+', b: 9, answer: 10 },
  { question: '7 - 3', a: 7, op: '-', b: 3, answer: 4 },
  { question: '4 + 5', a: 4, op: '+', b: 5, answer: 9 },
  { question: '10 - 6', a: 10, op: '-', b: 6, answer: 4 },
  { question: '2 + 6', a: 2, op: '+', b: 6, answer: 8 },
];

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

const STORAGE_KEY_PREFIX = 'dlgzz-own-whiteboard-v1';
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
- Touch friendly: use large tap targets, Pointer Events when dragging is needed, and set touch-action: manipulation or none for custom controls
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

function buildTenWithinMathCoursewareHtml(studentId = '') {
  const serializedStudentId = JSON.stringify(studentId);
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
  <title>十以内加减法互动课件</title>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; min-height: 100%; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      background: #f5f7fb;
      color: #172033;
      touch-action: manipulation;
      user-select: none;
    }
    .app {
      min-height: 100vh;
      padding: 18px;
      display: grid;
      grid-template-rows: auto 1fr auto;
      gap: 12px;
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 14px;
      border: 1px solid #d9e2f2;
      border-radius: 8px;
      background: #fff;
      box-shadow: 0 10px 22px rgba(34, 54, 92, .08);
    }
    h1 { margin: 0; font-size: 20px; line-height: 1.25; }
    .score { font-weight: 800; color: #2563eb; white-space: nowrap; }
    main {
      display: grid;
      grid-template-columns: minmax(240px, 1fr) 210px;
      gap: 14px;
      min-height: 0;
    }
    .stage, .side {
      border: 1px solid #d9e2f2;
      border-radius: 8px;
      background: #fff;
      box-shadow: 0 10px 22px rgba(34, 54, 92, .08);
    }
    .stage {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 16px;
      padding: 18px;
      min-height: 320px;
    }
    .question {
      font-size: 42px;
      font-weight: 900;
      letter-spacing: 0;
      color: #111827;
      line-height: 1;
    }
    .visual {
      width: min(100%, 440px);
      min-height: 100px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 14px;
      border-radius: 8px;
      background: #f8fafc;
      border: 1px dashed #cbd5e1;
    }
    .dot {
      width: 42px;
      height: 42px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      font-size: 24px;
      background: #fee2e2;
      border: 2px solid #fb7185;
    }
    .dot.sub {
      background: #e0f2fe;
      border-color: #38bdf8;
      opacity: .45;
    }
    .answer-row {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      width: 100%;
    }
    input {
      width: 110px;
      height: 54px;
      border: 2px solid #bfdbfe;
      border-radius: 8px;
      text-align: center;
      font-size: 28px;
      font-weight: 800;
      outline: none;
      background: #fff;
    }
    input:focus { border-color: #2563eb; box-shadow: 0 0 0 4px rgba(37, 99, 235, .12); }
    button {
      min-height: 48px;
      border: 0;
      border-radius: 8px;
      padding: 0 18px;
      font-size: 16px;
      font-weight: 800;
      cursor: pointer;
      touch-action: manipulation;
    }
    .primary { background: #2563eb; color: white; }
    .secondary { background: #e5e7eb; color: #111827; }
    .feedback {
      min-height: 30px;
      font-size: 18px;
      font-weight: 800;
      text-align: center;
    }
    .feedback.ok { color: #047857; }
    .feedback.no { color: #be123c; }
    .side {
      padding: 14px;
      overflow: auto;
    }
    .side h2 {
      margin: 0 0 10px;
      font-size: 15px;
      color: #475569;
    }
    .item {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      padding: 8px 0;
      border-bottom: 1px solid #eef2f7;
      font-size: 14px;
    }
    .item b { color: #111827; }
    footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 12px 14px;
      border: 1px solid #d9e2f2;
      border-radius: 8px;
      background: #fff;
    }
    .done {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, .55);
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .done-card {
      width: min(420px, 100%);
      border-radius: 8px;
      background: white;
      padding: 22px;
      text-align: center;
      box-shadow: 0 24px 70px rgba(15,23,42,.25);
    }
    .done-card h2 { margin: 0 0 8px; font-size: 24px; }
    .done-card p { margin: 8px 0; line-height: 1.6; }
    @media (max-width: 640px) {
      .app { padding: 10px; }
      main { grid-template-columns: 1fr; }
      .side { max-height: 150px; }
      .question { font-size: 34px; }
      .answer-row { flex-wrap: wrap; }
      footer { flex-wrap: wrap; }
    }
  </style>
</head>
<body>
  <div class="app">
    <header>
      <h1>十以内加减法乐园</h1>
      <div class="score" id="score">第 1 / 5 题</div>
    </header>
    <main>
      <section class="stage" aria-live="polite">
        <div class="question" id="question">1 + 1 = ?</div>
        <div class="visual" id="visual"></div>
        <div class="answer-row">
          <input id="answer" type="number" inputmode="numeric" min="0" max="10" aria-label="输入答案" />
          <button class="primary" id="submit" type="button">提交答案</button>
        </div>
        <div class="feedback" id="feedback">看图想一想，再输入答案。</div>
      </section>
      <aside class="side">
        <h2>答题记录</h2>
        <div id="history"></div>
      </aside>
    </main>
    <footer>
      <button class="secondary" id="restart" type="button">重新开始</button>
      <button class="primary" id="finish" type="button">完成并保存成绩</button>
    </footer>
  </div>
  <div class="done" id="done">
    <div class="done-card">
      <h2 id="doneTitle">完成啦</h2>
      <p id="doneText"></p>
      <button class="primary" id="closeDone" type="button">继续查看</button>
    </div>
  </div>
  <script>
    (function () {
      var studentId = ${serializedStudentId};
      var startedAt = Date.now();
      var questions = [
        { question: '1 + 9', a: 1, op: '+', b: 9, answer: 10 },
        { question: '7 - 3', a: 7, op: '-', b: 3, answer: 4 },
        { question: '4 + 5', a: 4, op: '+', b: 5, answer: 9 },
        { question: '10 - 6', a: 10, op: '-', b: 6, answer: 4 },
        { question: '2 + 6', a: 2, op: '+', b: 6, answer: 8 }
      ];
      var index = 0;
      var results = [];

      var questionEl = document.getElementById('question');
      var visualEl = document.getElementById('visual');
      var answerEl = document.getElementById('answer');
      var submitEl = document.getElementById('submit');
      var feedbackEl = document.getElementById('feedback');
      var scoreEl = document.getElementById('score');
      var historyEl = document.getElementById('history');
      var finishEl = document.getElementById('finish');
      var restartEl = document.getElementById('restart');
      var doneEl = document.getElementById('done');
      var doneTitleEl = document.getElementById('doneTitle');
      var doneTextEl = document.getElementById('doneText');
      var closeDoneEl = document.getElementById('closeDone');

      function renderVisual(q) {
        var count = q.op === '+' ? q.a + q.b : q.a;
        var html = '';
        for (var i = 0; i < count; i += 1) {
          var removed = q.op === '-' && i >= q.answer;
          html += '<div class="dot' + (removed ? ' sub' : '') + '">' + (removed ? '☆' : '🍎') + '</div>';
        }
        visualEl.innerHTML = html;
      }

      function render() {
        var q = questions[index];
        questionEl.textContent = q.question + ' = ?';
        scoreEl.textContent = '第 ' + (index + 1) + ' / ' + questions.length + ' 题';
        feedbackEl.className = 'feedback';
        feedbackEl.textContent = '看图想一想，再输入答案。';
        answerEl.value = '';
        answerEl.disabled = false;
        submitEl.disabled = false;
        renderVisual(q);
        setTimeout(function () { answerEl.focus(); }, 40);
      }

      function renderHistory() {
        historyEl.innerHTML = results.length
          ? results.map(function (item, i) {
              return '<div class="item"><span>' + (i + 1) + '. <b>' + item.question + '</b></span><span>' + (item.isCorrect ? '✅' : '❌ ' + item.correctAnswer) + '</span></div>';
            }).join('')
          : '<div class="item"><span>还没有作答</span><span>—</span></div>';
      }

      function submitAnswer() {
        if (index >= questions.length) return;
        var raw = answerEl.value.trim();
        if (!raw) {
          feedbackEl.className = 'feedback no';
          feedbackEl.textContent = '先输入一个答案哦。';
          return;
        }
        var q = questions[index];
        var isCorrect = Number(raw) === q.answer;
        results.push({
          question: q.question,
          studentAnswer: raw,
          correctAnswer: String(q.answer),
          isCorrect: isCorrect
        });
        feedbackEl.className = 'feedback ' + (isCorrect ? 'ok' : 'no');
        feedbackEl.textContent = isCorrect ? '答对了，很棒！' : '这题正确答案是 ' + q.answer + '，我们继续练。';
        renderHistory();
        index += 1;
        if (index >= questions.length) {
          answerEl.disabled = true;
          submitEl.disabled = true;
          setTimeout(finishQuiz, 450);
          return;
        }
        setTimeout(render, 650);
      }

      function finishQuiz() {
        var correct = results.filter(function (item) { return item.isCorrect; }).length;
        var wrong = results.filter(function (item) { return !item.isCorrect; }).map(function (item) {
          return {
            question: item.question,
            studentAnswer: item.studentAnswer,
            correctAnswer: item.correctAnswer
          };
        });
        var allQuestions = results.map(function (item) {
          return {
            question: item.question,
            studentAnswer: item.studentAnswer,
            correctAnswer: item.correctAnswer
          };
        });
        var payload = {
          type: 'quiz_result',
          studentId: studentId,
          quiz: {
            topic: '10以内加减法',
            total: questions.length,
            correct: correct,
            questions: allQuestions,
            wrong: wrong,
            durationSeconds: Math.max(1, Math.round((Date.now() - startedAt) / 1000)),
            finishedAt: new Date().toISOString()
          }
        };
        window.parent.postMessage(payload, '*');
        doneTitleEl.textContent = '完成啦：' + correct + ' / ' + questions.length;
        doneTextEl.textContent = wrong.length ? '有 ' + wrong.length + ' 道题需要复习，成绩已经上报到学习档案。' : '全部答对，成绩已经上报到学习档案。';
        doneEl.style.display = 'flex';
      }

      function restart() {
        index = 0;
        results = [];
        startedAt = Date.now();
        renderHistory();
        doneEl.style.display = 'none';
        render();
      }

      submitEl.addEventListener('click', submitAnswer);
      finishEl.addEventListener('click', finishQuiz);
      restartEl.addEventListener('click', restart);
      closeDoneEl.addEventListener('click', function () { doneEl.style.display = 'none'; });
      answerEl.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') submitAnswer();
      });
      renderHistory();
      render();
    })();
  </script>
</body>
</html>`;
}

function buildCircleAreaCoursewareHtml(studentId = '') {
  const serializedStudentId = JSON.stringify(studentId);
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
  <title>圆面积推导触屏课件</title>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; min-height: 100%; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      background: #f4f7fb;
      color: #152033;
      touch-action: manipulation;
      user-select: none;
    }
    .app {
      min-height: 100vh;
      display: grid;
      grid-template-rows: auto 1fr auto;
      gap: 12px;
      padding: 16px;
    }
    header, .panel, footer {
      border: 1px solid #d9e2ef;
      border-radius: 8px;
      background: #fff;
      box-shadow: 0 14px 30px rgba(25, 42, 70, .08);
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 14px;
    }
    h1 { margin: 0; font-size: 20px; line-height: 1.25; }
    .badge {
      border-radius: 999px;
      background: #eef6ff;
      color: #2563eb;
      padding: 5px 10px;
      font-size: 12px;
      font-weight: 800;
      white-space: nowrap;
    }
    main {
      min-height: 0;
      display: grid;
      grid-template-columns: minmax(300px, 1fr) 260px;
      gap: 12px;
    }
    .stage {
      min-height: 0;
      display: grid;
      grid-template-rows: auto 1fr;
      overflow: hidden;
    }
    .tabs {
      display: flex;
      gap: 8px;
      padding: 12px;
      border-bottom: 1px solid #e6edf6;
      overflow-x: auto;
    }
    button {
      min-height: 44px;
      border: 0;
      border-radius: 8px;
      padding: 0 14px;
      font-weight: 850;
      font-size: 14px;
      cursor: pointer;
      touch-action: manipulation;
    }
    .tab { background: #eef2f7; color: #334155; white-space: nowrap; }
    .tab.active { background: #1d4ed8; color: #fff; }
    .canvas-wrap {
      min-height: 0;
      display: grid;
      place-items: center;
      padding: 12px;
      background: linear-gradient(180deg, #fbfdff, #f1f5f9);
    }
    svg {
      width: min(100%, 620px);
      height: min(100%, 420px);
      min-height: 300px;
      touch-action: none;
      border-radius: 8px;
      background: #ffffff;
      border: 1px solid #e2e8f0;
    }
    .radius-line { stroke: #0f766e; stroke-width: 4; stroke-linecap: round; }
    .handle { fill: #14b8a6; stroke: white; stroke-width: 4; cursor: grab; }
    .handle:active { cursor: grabbing; }
    .label { font-size: 15px; font-weight: 850; fill: #0f172a; }
    .hint {
      font-size: 12px;
      fill: #64748b;
    }
    aside {
      min-height: 0;
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 12px;
    }
    .control {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 12px;
      background: #fff;
    }
    .control h2 {
      margin: 0 0 8px;
      font-size: 15px;
    }
    .control p {
      margin: 0;
      color: #475569;
      font-size: 13px;
      line-height: 1.6;
    }
    input[type="range"] {
      width: 100%;
      accent-color: #2563eb;
    }
    .metric {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 8px;
      margin-top: 8px;
      font-size: 13px;
      color: #475569;
    }
    .formula {
      display: grid;
      gap: 8px;
      margin-top: 10px;
    }
    .option {
      width: 100%;
      background: #f1f5f9;
      color: #0f172a;
      text-align: left;
    }
    .option.selected {
      background: #dcfce7;
      color: #166534;
      outline: 2px solid #22c55e;
    }
    footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 12px;
    }
    .primary { background: #2563eb; color: white; }
    .secondary { background: #e2e8f0; color: #0f172a; }
    .status { color: #475569; font-size: 13px; line-height: 1.5; }
    @media (max-width: 760px) {
      .app { padding: 10px; }
      main { grid-template-columns: 1fr; }
      aside { max-height: 280px; overflow: auto; }
      h1 { font-size: 18px; }
    }
  </style>
</head>
<body>
  <div class="app">
    <header>
      <h1>圆面积推导：把圆拼成长方形</h1>
      <div class="badge">SVG + 触屏拖动</div>
    </header>
    <main>
      <section class="panel stage">
        <div class="tabs">
          <button class="tab active" data-mode="circle">1. 看圆</button>
          <button class="tab" data-mode="cut">2. 切扇形</button>
          <button class="tab" data-mode="rect">3. 拼长方形</button>
        </div>
        <div class="canvas-wrap">
          <svg id="scene" viewBox="0 0 640 420" aria-label="圆面积推导互动图"></svg>
        </div>
      </section>
      <aside class="panel">
        <div class="control">
          <h2>切分数量</h2>
          <input id="pieces" type="range" min="8" max="32" step="4" value="16" />
          <div class="metric"><span>扇形份数</span><strong id="piecesText">16 份</strong></div>
          <p>份数越多，拼出来的图形越接近长方形。</p>
        </div>
        <div class="control">
          <h2>拖动半径</h2>
          <p>直接拖动画面里的绿色圆点，改变半径 r，观察面积如何变化。</p>
          <div class="metric"><span>半径 r</span><strong id="radiusText">82</strong></div>
        </div>
        <div class="control">
          <h2>公式检查</h2>
          <p>圆切开重排后，长方形的长约为 πr，宽为 r，所以面积是？</p>
          <div class="formula">
            <button class="option" data-answer="2πr">2πr</button>
            <button class="option" data-answer="πr²">πr²</button>
            <button class="option" data-answer="πd">πd</button>
          </div>
        </div>
      </aside>
    </main>
    <footer>
      <button class="secondary" id="reset" type="button">重置</button>
      <div class="status" id="status">从“看圆”开始，拖动半径，再切分并拼成长方形。</div>
      <button class="primary" id="finish" type="button">完成并保存</button>
    </footer>
  </div>
  <script>
    (function () {
      var studentId = ${serializedStudentId};
      var scene = document.getElementById('scene');
      var piecesInput = document.getElementById('pieces');
      var piecesText = document.getElementById('piecesText');
      var radiusText = document.getElementById('radiusText');
      var statusEl = document.getElementById('status');
      var mode = 'circle';
      var pieces = 16;
      var radius = 82;
      var dragging = false;
      var selectedAnswer = '';
      var startedAt = Date.now();
      var reported = false;

      function polar(cx, cy, r, angle) {
        var rad = (angle - 90) * Math.PI / 180;
        return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
      }

      function sectorPath(cx, cy, r, startAngle, endAngle) {
        var start = polar(cx, cy, r, endAngle);
        var end = polar(cx, cy, r, startAngle);
        var large = endAngle - startAngle <= 180 ? '0' : '1';
        return ['M', cx, cy, 'L', start.x, start.y, 'A', r, r, 0, large, 0, end.x, end.y, 'Z'].join(' ');
      }

      function escapeText(value) {
        return String(value).replace(/[&<>"']/g, function (char) {
          return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char];
        });
      }

      function renderCircle() {
        var cx = 240;
        var cy = 210;
        var handleX = cx + radius;
        return [
          '<circle cx="' + cx + '" cy="' + cy + '" r="' + radius + '" fill="#dbeafe" stroke="#2563eb" stroke-width="4" />',
          '<line class="radius-line" x1="' + cx + '" y1="' + cy + '" x2="' + handleX + '" y2="' + cy + '" />',
          '<circle id="radiusHandle" class="handle" cx="' + handleX + '" cy="' + cy + '" r="13" />',
          '<text class="label" x="' + (cx + radius / 2 - 8) + '" y="' + (cy - 12) + '">r</text>',
          '<text class="hint" x="36" y="54">圆的面积会随着半径变化。拖动绿色点试一试。</text>',
          '<text class="label" x="420" y="205">面积 = ?</text>'
        ].join('');
      }

      function renderCut() {
        var cx = 240;
        var cy = 210;
        var html = '';
        for (var i = 0; i < pieces; i += 1) {
          var start = i * 360 / pieces;
          var end = (i + 1) * 360 / pieces;
          var color = i % 2 === 0 ? '#bfdbfe' : '#fecdd3';
          html += '<path d="' + sectorPath(cx, cy, radius, start, end) + '" fill="' + color + '" stroke="#475569" stroke-width="1.2" />';
        }
        html += '<line class="radius-line" x1="' + cx + '" y1="' + cy + '" x2="' + (cx + radius) + '" y2="' + cy + '" />';
        html += '<circle id="radiusHandle" class="handle" cx="' + (cx + radius) + '" cy="' + cy + '" r="13" />';
        html += '<text class="hint" x="36" y="54">' + pieces + ' 份扇形。份数越多，边缘越接近直线。</text>';
        return html;
      }

      function renderRect() {
        var startX = 75;
        var baseY = 235;
        var width = Math.min(430, Math.PI * radius * 1.45);
        var height = Math.max(52, radius * .9);
        var pieceWidth = width / pieces;
        var html = '<text class="hint" x="36" y="54">把扇形一正一反拼起来，越来越像长方形。</text>';
        for (var i = 0; i < pieces; i += 1) {
          var x = startX + i * pieceWidth;
          var top = i % 2 === 0 ? baseY - height : baseY - height + 14;
          var color = i % 2 === 0 ? '#bfdbfe' : '#fecdd3';
          html += '<path d="M ' + x + ' ' + top + ' L ' + (x + pieceWidth) + ' ' + (top + 8) + ' L ' + (x + pieceWidth) + ' ' + (baseY + 8) + ' L ' + x + ' ' + baseY + ' Z" fill="' + color + '" stroke="#475569" stroke-width="1" />';
        }
        html += '<line x1="' + startX + '" y1="' + (baseY + 32) + '" x2="' + (startX + width) + '" y2="' + (baseY + 32) + '" stroke="#0f766e" stroke-width="4" stroke-linecap="round" />';
        html += '<text class="label" x="' + (startX + width / 2 - 30) + '" y="' + (baseY + 62) + '">约 πr</text>';
        html += '<line x1="' + (startX + width + 25) + '" y1="' + (baseY - height) + '" x2="' + (startX + width + 25) + '" y2="' + baseY + '" stroke="#dc2626" stroke-width="4" stroke-linecap="round" />';
        html += '<text class="label" x="' + (startX + width + 36) + '" y="' + (baseY - height / 2 + 5) + '">r</text>';
        html += '<text class="label" x="78" y="92">长方形面积 ≈ πr × r = πr²</text>';
        return html;
      }

      function render() {
        piecesText.textContent = pieces + ' 份';
        radiusText.textContent = String(radius);
        scene.innerHTML = mode === 'circle' ? renderCircle() : mode === 'cut' ? renderCut() : renderRect();
      }

      function setMode(nextMode) {
        mode = nextMode;
        Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (button) {
          button.classList.toggle('active', button.getAttribute('data-mode') === mode);
        });
        statusEl.textContent = mode === 'circle'
          ? '观察半径 r：拖动绿色点，圆会变大或变小。'
          : mode === 'cut'
            ? '圆被切成许多扇形，份数越多越接近推导过程。'
            : '扇形重新排列后，长约 πr，宽约 r。';
        render();
      }

      function pointerToRadius(event) {
        var rect = scene.getBoundingClientRect();
        var x = (event.clientX - rect.left) / rect.width * 640;
        radius = Math.round(Math.max(50, Math.min(115, x - 240)));
        render();
      }

      scene.addEventListener('pointerdown', function (event) {
        if (event.target && event.target.id === 'radiusHandle') {
          dragging = true;
          scene.setPointerCapture(event.pointerId);
          pointerToRadius(event);
        }
      });
      scene.addEventListener('pointermove', function (event) {
        if (dragging) pointerToRadius(event);
      });
      scene.addEventListener('pointerup', function (event) {
        dragging = false;
        try { scene.releasePointerCapture(event.pointerId); } catch (error) {}
      });

      piecesInput.addEventListener('input', function () {
        pieces = Number(piecesInput.value);
        if (mode === 'circle') setMode('cut');
        render();
      });

      Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (button) {
        button.addEventListener('click', function () {
          setMode(button.getAttribute('data-mode'));
        });
      });

      Array.prototype.forEach.call(document.querySelectorAll('.option'), function (button) {
        button.addEventListener('click', function () {
          selectedAnswer = button.getAttribute('data-answer') || '';
          Array.prototype.forEach.call(document.querySelectorAll('.option'), function (item) {
            item.classList.toggle('selected', item === button);
          });
          statusEl.textContent = '已选择：' + selectedAnswer + '。点击完成即可保存学习结果。';
        });
      });

      document.getElementById('reset').addEventListener('click', function () {
        mode = 'circle';
        pieces = 16;
        radius = 82;
        selectedAnswer = '';
        reported = false;
        startedAt = Date.now();
        piecesInput.value = '16';
        Array.prototype.forEach.call(document.querySelectorAll('.option'), function (item) {
          item.classList.remove('selected');
        });
        setMode('circle');
      });

      document.getElementById('finish').addEventListener('click', function () {
        if (reported) return;
        if (!selectedAnswer) {
          statusEl.textContent = '请先选择一个面积公式，再保存。';
          return;
        }
        var isCorrect = selectedAnswer === 'πr²';
        reported = true;
        statusEl.textContent = isCorrect ? '回答正确，已保存到学习档案。' : '已保存。正确公式是 πr²，稍后可以复习。';
        window.parent.postMessage({
          type: 'quiz_result',
          studentId: studentId,
          quiz: {
            topic: '圆面积推导',
            total: 1,
            correct: isCorrect ? 1 : 0,
            questions: [{
              question: '圆面积公式是什么？',
              studentAnswer: selectedAnswer,
              correctAnswer: 'πr²'
            }],
            wrong: isCorrect ? [] : [{
              question: '圆面积公式是什么？',
              studentAnswer: selectedAnswer,
              correctAnswer: 'πr²'
            }],
            durationSeconds: Math.max(1, Math.round((Date.now() - startedAt) / 1000)),
            finishedAt: new Date().toISOString()
          }
        }, '*');
      });

      setMode('circle');
    })();
  </script>
</body>
</html>`;
}

function normalizeShapeType(type: string): ShapeType {
  if (type === 'math_quiz' || type === 'ten_within_math_quiz') return 'math_quiz';
  if (type === 'preview_html' || type === 'html' || type === 'app') return 'preview_html';
  return 'ai_result';
}

function pickOperationProps(value: Record<string, unknown>) {
  if (isObjectRecord(value.props)) return value.props;
  if (isObjectRecord(value.properties)) return value.properties;
  if (isObjectRecord(value.data)) return value.data;
  return {};
}

function normalizeBoardOperation(value: unknown): BoardOperation | null {
  if (!isObjectRecord(value)) return null;

  const action = readText(value.action).toLowerCase();
  const props = pickOperationProps(value);
  const typeText = readText(value.type, readText(value.shapeType));
  const html = readText(props.html, readText(value.html));
  const text = readText(props.text, readText(props.content, readText(value.text)));
  const width = readNumber(props.w) ?? readNumber(value.w) ?? readNumber(value.width);
  const height = readNumber(props.h) ?? readNumber(value.h) ?? readNumber(value.height);
  const createProps = {
    ...props,
    ...(width ? { w: width } : {}),
    ...(height ? { h: height } : {}),
    ...(html ? { html } : {}),
    ...(text ? { text } : {}),
  };

  if (['create', 'add', 'insert'].includes(action)) {
    const type = typeText || (html ? 'preview_html' : 'ai_result');
    return {
      action: 'create',
      type,
      x: readNumber(value.x),
      y: readNumber(value.y),
      props: createProps,
    };
  }

  if (action === 'render' && (html || text)) {
    return {
      action: 'create',
      type: html ? 'preview_html' : 'ai_result',
      x: readNumber(value.x),
      y: readNumber(value.y),
      props: createProps,
    };
  }

  if (!action && (typeText || html || text)) {
    return {
      action: 'create',
      type: typeText || (html ? 'preview_html' : 'ai_result'),
      x: readNumber(value.x),
      y: readNumber(value.y),
      props: createProps,
    };
  }

  if (action === 'update') {
    const id = readText(value.id);
    if (!id) return null;
    return {
      action: 'update',
      id,
      props: {
        ...props,
        ...(html ? { html } : {}),
        ...(text ? { text } : {}),
      },
    };
  }

  if (action === 'delete') {
    const id = readText(value.id);
    return id ? { action: 'delete', id } : null;
  }

  return null;
}

function extractJson(raw: string) {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = (fenced?.[1] || raw).trim();

  try {
    return JSON.parse(source);
  } catch {
    // Continue with balanced-object extraction below.
  }

  for (let start = source.indexOf('{'); start >= 0; start = source.indexOf('{', start + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < source.length; index += 1) {
      const char = source[index];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === '\\') {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }

      if (char === '{') depth += 1;
      if (char === '}') depth -= 1;

      if (depth === 0) {
        try {
          return JSON.parse(source.slice(start, index + 1));
        } catch {
          break;
        }
      }
    }
  }

  return null;
}

function decodeJsonishText(value: string) {
  return value
    .replace(/\\u003c/gi, '<')
    .replace(/\\u003e/gi, '>')
    .replace(/\\u0026/gi, '&')
    .replace(/\\"/g, '"')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\\\/g, '\\');
}

function extractHtmlDocument(value: unknown): string {
  if (typeof value === 'string') {
    const source = value.trim();
    const fencedHtml = source.match(/```html\s*([\s\S]*?)```/i);
    const htmlSource = decodeJsonishText(fencedHtml?.[1] || source).trim();
    const startsAtDocument = htmlSource.search(/<!doctype\s+html|<html[\s>]/i);
    const rawDocumentSource = startsAtDocument >= 0 ? htmlSource.slice(startsAtDocument) : htmlSource;
    const endMatch = rawDocumentSource.match(/<\/html>/i);
    const documentSource = endMatch
      ? rawDocumentSource.slice(0, (endMatch.index || 0) + endMatch[0].length)
      : rawDocumentSource;

    if (
      /<!doctype\s+html|<html[\s>]|<body[\s>]/i.test(documentSource) &&
      /<\/html>|<\/body>|<script[\s>]|<style[\s>]/i.test(documentSource)
    ) {
      return documentSource;
    }
    return '';
  }

  if (!isObjectRecord(value)) return '';

  const props = pickOperationProps(value);
  return (
    extractHtmlDocument(props.html) ||
    extractHtmlDocument(props.preview_html) ||
    extractHtmlDocument(props.previewHtml) ||
    extractHtmlDocument(props.content) ||
    extractHtmlDocument(value.html) ||
    extractHtmlDocument(value.preview_html) ||
    extractHtmlDocument(value.previewHtml) ||
    extractHtmlDocument(value.content) ||
    extractHtmlDocument(value.message)
  );
}

function collectBoardOperations(plan: unknown, responseText: string): BoardOperation[] {
  if (Array.isArray(plan)) {
    const operations = plan
      .map((operation: unknown) => normalizeBoardOperation(operation))
      .filter((operation: BoardOperation | null): operation is BoardOperation => Boolean(operation));
    if (operations.length > 0) return operations;
  }

  const normalizedOperations = isObjectRecord(plan) && Array.isArray(plan.operations)
    ? plan.operations
        .map((operation: unknown) => normalizeBoardOperation(operation))
        .filter((operation: BoardOperation | null): operation is BoardOperation => Boolean(operation))
    : [];

  if (normalizedOperations.length > 0) return normalizedOperations;

  if (isObjectRecord(plan)) {
    const nestedPlan = typeof plan.message === 'string' ? extractJson(plan.message) : null;
    const nestedOperations = nestedPlan && nestedPlan !== plan
      ? collectBoardOperations(nestedPlan, plan.message as string)
      : [];
    if (nestedOperations.length > 0) return nestedOperations;

    const html = extractHtmlDocument(plan);
    if (html) {
      return [
        {
          action: 'create',
          type: 'preview_html',
          props: { w: 760, h: 560, html },
        },
      ];
    }
  }

  const html = extractHtmlDocument(responseText);
  return html
    ? [
        {
          action: 'create',
          type: 'preview_html',
          props: { w: 760, h: 560, html },
        },
      ]
    : [];
}

function getShapeTitle(shape: BoardShape) {
  if (shape.type === 'math_quiz') return '十以内加减法互动课件';
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
  const [aiOpen, setAiOpen] = useState(false);
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
  const autoPromptStartedRef = useRef(false);
  const coursewareImportStartedRef = useRef(false);
  const coursewareSlugLoadStartedRef = useRef(false);
  const studentId = useMemo(() => readSearchParam('studentId', ''), []);
  const lessonId = useMemo(() => readSearchParam('lessonId', 'own-whiteboard-demo'), []);
  const storageKey = useMemo(() => {
    const identity = [studentId || 'anonymous', lessonId || 'default']
      .map((part) => encodeURIComponent(part))
      .join(':');
    return `${STORAGE_KEY_PREFIX}:${identity}`;
  }, [lessonId, studentId]);
  const initialPrompt = useMemo(() => readSearchParam('prompt', ''), []);
  const initialPromptTitle = useMemo(() => readSearchParam('title', ''), []);
  const initialCoursewareImportKey = useMemo(() => readSearchParam('coursewareImportKey', ''), []);
  const initialLoadCoursewareSlug = useMemo(() => readSearchParam('loadCoursewareSlug', ''), []);
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
    () =>
      lessonPosts.filter(
        (post) => post.whiteboardPrompt?.trim() && post.whiteboardCategory === 'education'
      ),
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
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) setShapes(parsed);
      }
    } catch {
      // Ignore invalid local state.
    } finally {
      setReady(true);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(storageKey, JSON.stringify(shapes));
  }, [ready, shapes, storageKey]);

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

  function handleQuizResult(quiz: QuizResultPayload, messageStudentId?: unknown) {
    const targetStudentId = resolveStudentIdFromMessage(messageStudentId, studentId);
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
  }

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!isObjectRecord(data)) return;

      if (data.type === 'quiz_result') {
        const quiz = normalizeQuizResultPayload(data.quiz);
        if (!quiz) return;

        handleQuizResult(quiz, data.studentId);
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
        : selectedShape.type === 'math_quiz'
          ? `Interactive Quiz: "十以内加减法课件，可答题并上报 quiz_result"`
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
    const isInteractiveHtml = type === 'preview_html' || type === 'math_quiz';
    const w = props?.w || (isInteractiveHtml ? 620 : 320);
    const h = props?.h || (isInteractiveHtml ? 460 : 220);
    const next: BoardShape = {
      id: createId(),
      type,
      x: Math.max(40, placement?.x ?? window.innerWidth / 2 - w / 2),
      y: Math.max(24, placement?.y ?? window.innerHeight / 2 - h / 2),
      props: {
        w,
        h,
        html:
          type === 'preview_html'
            ? props?.html || getDefaultHtml(studentId)
            : type === 'math_quiz'
              ? props?.html || buildTenWithinMathCoursewareHtml(studentId)
              : undefined,
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
          const isInteractiveHtml = type === 'preview_html' || type === 'math_quiz';
          const w = Number(props.w || (isInteractiveHtml ? 680 : 340));
          const h = Number(props.h || (isInteractiveHtml ? 500 : 220));
          const shape: BoardShape = {
            id: createId(),
            type,
            x: Number(op.x ?? window.innerWidth / 2 - w / 2 + offset),
            y: Number(op.y ?? window.innerHeight / 2 - h / 2 + offset),
            props: {
              w,
              h,
              html:
                type === 'preview_html'
                  ? String(props.html || getDefaultHtml(studentId))
                  : type === 'math_quiz'
                    ? String(props.html || buildTenWithinMathCoursewareHtml(studentId))
                    : undefined,
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

  function getLessonPostSlug(post: LessonPromptPost) {
    if (post.slug) return post.slug;
    if (Array.isArray(post.slugs) && post.slugs.length > 0) return post.slugs.join('/');
    return post.url.split('/').filter(Boolean).pop() || '';
  }

  async function runSavedCoursewarePost(post: LessonPromptPost) {
    const slug = getLessonPostSlug(post);
    if (!slug) {
      throw new Error('课件缺少 slug');
    }

    const params = new URLSearchParams({
      slug,
      locale: 'zh',
      studentId,
    });
    const response = await fetch(`/api/whiteboard/courseware-mdx?${params.toString()}`);
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.success || !Array.isArray(data.operations)) {
      throw new Error(data?.error || `HTTP ${response.status}`);
    }

    executeOperations(data.operations);
    setMessages((current) => [
      ...current,
      { role: 'user', text: `课件库：${post.title}` },
      { role: 'assistant', text: '已打开保存到博客的互动课件。' },
    ]);
  }

  function runLessonPrompt(post: LessonPromptPost) {
    if (post.hasSavedCourseware) {
      setLessonLibraryOpen(false);
      setAiOpen(false);
      void runSavedCoursewarePost(post).catch((error) => {
        setMessages((current) => [
          ...current,
          {
            role: 'assistant',
            text: error instanceof Error ? `读取已保存课件失败：${error.message}` : '读取已保存课件失败。',
          },
        ]);
      });
      return;
    }

    const isCircleAreaLesson =
      post.url.includes('circle-area-touch-courseware') ||
      post.slugs?.includes('circle-area-touch-courseware') ||
      /圆面积|圆的面积|扇形|徐老师/.test(`${post.title} ${post.description} ${post.whiteboardPrompt || ''}`);

    if (isCircleAreaLesson) {
      setLessonLibraryOpen(false);
      setAiOpen(false);
      const shapeWidth = Math.min(820, Math.max(360, window.innerWidth - 32));
      const shapeHeight = Math.min(620, Math.max(480, window.innerHeight - 128));
      executeOperations([
        {
          action: 'create',
          type: 'preview_html',
          x: 16,
          y: 72,
          props: {
            w: shapeWidth,
            h: shapeHeight,
            html: buildCircleAreaCoursewareHtml(studentId),
          },
        },
      ]);
      setMessages((current) => [
        ...current,
        { role: 'user', text: `课件库：${post.title}` },
        { role: 'assistant', text: '已生成圆面积推导触屏课件，支持拖动半径、切分扇形和公式检查。' },
      ]);
      return;
    }

    const isTenWithinMathLesson =
      post.url.includes('interactive-math-game') ||
      post.slugs?.includes('interactive-math-game') ||
      /十以内加减法|数学游戏/.test(`${post.title} ${post.description} ${post.whiteboardPrompt || ''}`);

    if (isTenWithinMathLesson) {
      setLessonLibraryOpen(false);
      setAiOpen(false);
      const shapeWidth = Math.min(760, Math.max(360, window.innerWidth - 32));
      const shapeHeight = Math.min(560, Math.max(430, window.innerHeight - 128));
      executeOperations([
        {
          action: 'create',
          type: 'math_quiz',
          x: 16,
          y: 72,
          props: {
            w: shapeWidth,
            h: shapeHeight,
            html: buildTenWithinMathCoursewareHtml(studentId),
          },
        },
      ]);
      setMessages((current) => [
        ...current,
        { role: 'user', text: `课件库：${post.title}` },
        { role: 'assistant', text: '已生成可交互的十以内加减法课件，答完会自动写入学习档案。' },
      ]);
      return;
    }

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
      const normalizedOperations = collectBoardOperations(plan, responseText);

      if (normalizedOperations.length === 0) {
        createFallbackShape(userText, 'Hermes 没有返回 JSON operations，因此已自动生成本地 HTML 组件。');
        setMessages((current) => [
          ...current,
          { role: 'assistant', text: 'Hermes 没有返回组件 JSON，已使用本地兜底生成 HTML 组件。' },
        ]);
        return;
      }

      executeOperations(normalizedOperations);
      const assistantText = isObjectRecord(plan)
        ? readText(plan.thought, readText(plan.voice_response, '已生成互动课件。'))
        : '已从 Hermes 返回中恢复并生成互动课件。';
      setMessages((current) => [
        ...current,
        { role: 'assistant', text: assistantText },
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

  useEffect(() => {
    if (!ready || !initialCoursewareImportKey || coursewareImportStartedRef.current) return;
    coursewareImportStartedRef.current = true;

    const storageKey = initialCoursewareImportKey.startsWith('dlgzz-courseware-import:')
      ? initialCoursewareImportKey
      : `dlgzz-courseware-import:${initialCoursewareImportKey}`;

    try {
      const raw =
        window.sessionStorage.getItem(storageKey) || window.localStorage.getItem(storageKey);
      if (!raw) {
        throw new Error('没有找到后台生成的课件数据');
      }

      const imported = JSON.parse(raw);
      const operations = collectBoardOperations(imported, raw);
      if (operations.length === 0) {
        throw new Error('后台生成结果里没有可创建的白板组件');
      }

      executeOperations(operations);
      window.sessionStorage.removeItem(storageKey);
      window.localStorage.removeItem(storageKey);
      setAiOpen(false);
      setLessonLibraryOpen(false);
      setMessages((current) => [
        ...current,
        {
          role: 'system',
          text: `已从老师后台导入课件：${readText(imported?.title, initialPromptTitle || 'AI 互动课件')}`,
        },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          role: 'system',
          text: error instanceof Error ? `导入课件失败：${error.message}` : '导入课件失败',
        },
      ]);
    }
  }, [initialCoursewareImportKey, initialPromptTitle, ready]);

  useEffect(() => {
    if (!ready || !initialLoadCoursewareSlug || coursewareSlugLoadStartedRef.current) return;
    coursewareSlugLoadStartedRef.current = true;

    const params = new URLSearchParams({
      slug: initialLoadCoursewareSlug,
      locale: 'zh',
      studentId,
    });

    async function openCoursewareSlug() {
      try {
        const response = await fetch(`/api/whiteboard/courseware-mdx?${params.toString()}`);
        const data = await response.json().catch(() => null);
        if (!response.ok || !data?.success || !Array.isArray(data.operations)) {
          throw new Error(data?.error || `HTTP ${response.status}`);
        }
        executeOperations(data.operations);
        setAiOpen(false);
        setLessonLibraryOpen(false);
        setMessages((current) => [
          ...current,
          {
            role: 'system',
            text: `已从博客打开课件：${readText(data?.post?.title, initialPromptTitle || initialLoadCoursewareSlug)}`,
          },
        ]);
      } catch (savedError) {
        try {
          const response = await fetch('/api/teacher/courseware/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              slug: initialLoadCoursewareSlug,
              locale: 'zh',
              studentId,
              extraPrompt: '从这个 Block 生成一个可触屏互动课件，并放入白板。',
            }),
          });
          const data = await response.json().catch(() => null);
          if (!response.ok || !data?.success) {
            throw new Error(data?.error || `HTTP ${response.status}`);
          }
          const operations = collectBoardOperations(data?.plan, JSON.stringify(data?.plan || data));
          if (operations.length === 0) {
            throw new Error('生成结果里没有可创建的白板组件');
          }
          executeOperations(operations);
          setAiOpen(false);
          setLessonLibraryOpen(false);
          setMessages((current) => [
            ...current,
            {
              role: 'system',
              text: data?.fallback
                ? `已根据博客 Block 生成兜底互动课件：${readText(data?.post?.title, initialPromptTitle || initialLoadCoursewareSlug)}`
                : `已根据博客 Block 生成互动课件：${readText(data?.post?.title, initialPromptTitle || initialLoadCoursewareSlug)}`,
            },
          ]);
        } catch (generateError) {
          const savedMessage =
            savedError instanceof Error ? savedError.message : '读取已保存课件失败';
          const generateMessage =
            generateError instanceof Error ? generateError.message : '生成互动课件失败';
          setMessages((current) => [
            ...current,
            {
              role: 'system',
              text: `打开博客课件失败：${savedMessage}；自动生成也失败：${generateMessage}`,
            },
          ]);
        }
      }
    }

    void openCoursewareSlug();
  }, [initialLoadCoursewareSlug, initialPromptTitle, ready, studentId]);

  useEffect(() => {
    if (!ready || !initialPrompt || autoPromptStartedRef.current) return;
    autoPromptStartedRef.current = true;
    setAiOpen(true);
    void runAIWithPrompt(
      initialPrompt,
      initialPromptTitle ? `博客：${initialPromptTitle}` : '博客提示词'
    );
  }, [initialPrompt, initialPromptTitle, ready]);

  function callAI() {
    void runAIWithPrompt(input);
  }

  function deleteSelected() {
    if (!selectedId) return;
    setShapes((current) => current.filter((shape) => shape.id !== selectedId));
    setSelectedId(null);
  }

  function downloadSelectedHtml() {
    if (!selectedShape?.props.html) return;
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
          href="/zh"
          className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-semibold hover:bg-black/5"
          title="返回首页"
        >
          <Home size={16} />
          首页
        </a>
      </div>

      {shapes.map((shape) => (
        <ShapeView
          key={shape.id}
          shape={shape}
          selected={shape.id === selectedId}
          onSelect={() => setSelectedId(shape.id)}
          onQuizResult={(quiz) => handleQuizResult(quiz, studentId)}
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
                placeholder="搜索教育课件..."
                className="mb-2 h-9 w-full rounded-md border border-black/15 px-3 text-sm outline-none focus:border-[#111827]"
              />
              <div className="max-h-44 overflow-y-auto rounded-md border border-black/10">
                {lessonLoading ? (
                  <div className="px-3 py-4 text-center text-xs text-black/50">加载中...</div>
                ) : filteredLessonPosts.length === 0 ? (
                  <div className="px-3 py-4 text-center text-xs text-black/45">暂无教育课件</div>
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
        <IconButton title="下载选中 HTML" disabled={!selectedShape?.props.html} onClick={downloadSelectedHtml}>
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

function MathQuizShape({
  onQuizResult,
}: {
  onQuizResult: (quiz: QuizResultPayload) => void;
}) {
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [results, setResults] = useState<Array<QuizWrongItem & { isCorrect: boolean }>>([]);
  const [feedback, setFeedback] = useState('看图想一想，再输入答案。');
  const [feedbackKind, setFeedbackKind] = useState<'idle' | 'ok' | 'no'>('idle');
  const [reported, setReported] = useState(false);
  const [startedAt, setStartedAt] = useState(() => Date.now());

  const question = TEN_WITHIN_MATH_QUESTIONS[Math.min(index, TEN_WITHIN_MATH_QUESTIONS.length - 1)];
  const isDone = results.length >= TEN_WITHIN_MATH_QUESTIONS.length;
  const correct = results.filter((item) => item.isCorrect).length;

  function buildQuiz(nextResults: Array<QuizWrongItem & { isCorrect: boolean }>): QuizResultPayload {
    const wrong = nextResults
      .filter((item) => !item.isCorrect)
      .map(({ question, studentAnswer, correctAnswer }) => ({
        question,
        studentAnswer,
        correctAnswer,
      }));
    const questions = nextResults.map(({ question, studentAnswer, correctAnswer }) => ({
      question,
      studentAnswer,
      correctAnswer,
    }));

    return {
      topic: '10以内加减法',
      total: TEN_WITHIN_MATH_QUESTIONS.length,
      correct: nextResults.filter((item) => item.isCorrect).length,
      questions,
      wrong,
      durationSeconds: Math.max(1, Math.round((Date.now() - startedAt) / 1000)),
      finishedAt: new Date().toISOString(),
    };
  }

  function finish(nextResults = results) {
    if (nextResults.length === 0 || reported) return;
    setReported(true);
    onQuizResult(buildQuiz(nextResults));
  }

  function submit() {
    if (isDone) return;

    const normalizedAnswer = answer.trim();
    if (!normalizedAnswer) {
      setFeedback('先输入一个答案哦。');
      setFeedbackKind('no');
      return;
    }

    const isCorrect = Number(normalizedAnswer) === question.answer;
    const nextResults = [
      ...results,
      {
        question: question.question,
        studentAnswer: normalizedAnswer,
        correctAnswer: String(question.answer),
        isCorrect,
      },
    ];

    setResults(nextResults);
    setAnswer('');
    setFeedback(isCorrect ? '答对了，很棒！' : `这题正确答案是 ${question.answer}，我们继续练。`);
    setFeedbackKind(isCorrect ? 'ok' : 'no');

    if (nextResults.length >= TEN_WITHIN_MATH_QUESTIONS.length) {
      finish(nextResults);
      return;
    }

    window.setTimeout(() => {
      setIndex((current) => Math.min(current + 1, TEN_WITHIN_MATH_QUESTIONS.length - 1));
      setFeedback('看图想一想，再输入答案。');
      setFeedbackKind('idle');
    }, 450);
  }

  function restart() {
    setIndex(0);
    setAnswer('');
    setResults([]);
    setFeedback('看图想一想，再输入答案。');
    setFeedbackKind('idle');
    setReported(false);
    setStartedAt(Date.now());
  }

  const visualCount = question.op === '+' ? question.a + question.b : question.a;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 bg-[#f5f7fb] p-4 text-[#172033]">
      <div className="flex items-center justify-between gap-3 rounded-md border border-[#d9e2f2] bg-white px-4 py-3 shadow-sm">
        <h2 className="m-0 text-lg font-extrabold leading-tight">十以内加减法乐园</h2>
        <div className="shrink-0 text-sm font-extrabold text-[#2563eb]">
          {isDone ? `完成 ${correct}/${TEN_WITHIN_MATH_QUESTIONS.length}` : `第 ${index + 1} / ${TEN_WITHIN_MATH_QUESTIONS.length} 题`}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(260px,1fr)_210px] gap-3 max-[700px]:grid-cols-1">
        <div className="flex min-h-[310px] flex-col items-center justify-center gap-4 rounded-md border border-[#d9e2f2] bg-white p-4 shadow-sm">
          <div className="text-4xl font-black leading-none text-[#111827]">
            {isDone ? '全部完成啦' : `${question.question} = ?`}
          </div>
          <div className="flex min-h-[92px] w-full max-w-[430px] flex-wrap items-center justify-center gap-2 rounded-md border border-dashed border-slate-300 bg-slate-50 p-3">
            {Array.from({ length: visualCount }).map((_, itemIndex) => {
              const removed = question.op === '-' && itemIndex >= question.answer;
              return (
                <span
                  key={itemIndex}
                  className={[
                    'grid h-10 w-10 place-items-center rounded-full border-2 text-xl',
                    removed
                      ? 'border-sky-400 bg-sky-100 opacity-45'
                      : 'border-rose-400 bg-rose-100',
                  ].join(' ')}
                >
                  {removed ? '☆' : '🍎'}
                </span>
              );
            })}
          </div>
          <div className="flex w-full flex-wrap items-center justify-center gap-2">
            <input
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') submit();
              }}
              disabled={isDone}
              type="number"
              inputMode="numeric"
              min={0}
              max={10}
              aria-label="输入答案"
              className="h-14 w-28 rounded-md border-2 border-blue-200 bg-white text-center text-2xl font-extrabold outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100 disabled:opacity-50"
            />
            <button
              type="button"
              disabled={isDone}
              onClick={submit}
              className="h-14 rounded-md bg-blue-600 px-5 text-base font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-45"
            >
              提交答案
            </button>
          </div>
          <div
            className={[
              'min-h-7 text-center text-base font-extrabold',
              feedbackKind === 'ok'
                ? 'text-emerald-700'
                : feedbackKind === 'no'
                  ? 'text-rose-700'
                  : 'text-slate-600',
            ].join(' ')}
          >
            {isDone ? '成绩已上报到学习档案。' : feedback}
          </div>
        </div>

        <aside className="min-h-0 overflow-auto rounded-md border border-[#d9e2f2] bg-white p-3 shadow-sm">
          <h3 className="mb-2 mt-0 text-sm font-bold text-slate-600">答题记录</h3>
          {results.length === 0 ? (
            <div className="flex justify-between border-b border-slate-100 py-2 text-sm text-slate-500">
              <span>还没有作答</span>
              <span>-</span>
            </div>
          ) : (
            results.map((item, itemIndex) => (
              <div
                key={`${item.question}-${itemIndex}`}
                className="flex justify-between gap-2 border-b border-slate-100 py-2 text-sm"
              >
                <span className="font-semibold text-slate-900">{itemIndex + 1}. {item.question}</span>
                <span>{item.isCorrect ? '答对' : `答错：${item.correctAnswer}`}</span>
              </div>
            ))
          )}
        </aside>
      </div>

      <div className="flex items-center justify-between gap-2 rounded-md border border-[#d9e2f2] bg-white px-4 py-3 shadow-sm">
        <button
          type="button"
          onClick={restart}
          className="h-11 rounded-md bg-slate-200 px-4 text-sm font-extrabold text-slate-900"
        >
          重新开始
        </button>
        <button
          type="button"
          disabled={results.length === 0 || reported}
          onClick={() => finish()}
          className="h-11 rounded-md bg-blue-600 px-4 text-sm font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-45"
        >
          {reported ? '已保存成绩' : '完成并保存成绩'}
        </button>
      </div>
    </div>
  );
}

function ShapeView({
  shape,
  selected,
  onSelect,
  onQuizResult,
  onMoveStart,
  onResizeStart,
}: {
  shape: BoardShape;
  selected: boolean;
  onSelect: () => void;
  onQuizResult: (quiz: QuizResultPayload) => void;
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
        if ((event.target as HTMLElement).closest('[data-shape-interactive="true"]')) {
          return;
        }
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
        {shape.type === 'math_quiz' ? (
          <div data-shape-interactive="true" className="h-full">
            <MathQuizShape onQuizResult={onQuizResult} />
          </div>
        ) : shape.type === 'preview_html' ? (
          <iframe
            data-shape-interactive="true"
            title={shape.id}
            srcDoc={shape.props.html || ''}
            className="h-full w-full border-0 bg-white"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"
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
