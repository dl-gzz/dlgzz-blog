import { getCoursewareMdxPost } from '@/lib/courseware-mdx';
import { getDatabaseCoursewarePost } from '@/lib/edu-content';
import { chatWithResolvedServerProvider } from '@/lib/ai/provider';
import { type NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;

const COURSEWARE_ACTION_SCHEMA = {
  type: 'object',
  properties: {
    thought: { type: 'string' },
    voice_response: { type: 'string' },
    operations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['create', 'update', 'delete'] },
          id: { type: 'string' },
          type: { type: 'string', enum: ['preview_html', 'ai_result'] },
          x: { type: 'number' },
          y: { type: 'number' },
          props: {
            type: 'object',
            properties: {
              w: { type: 'number' },
              h: { type: 'number' },
              html: { type: 'string' },
              text: { type: 'string' },
              color: { type: 'string' },
            },
          },
        },
        required: ['action'],
      },
    },
  },
  required: ['operations'],
} satisfies Record<string, unknown>;

function extractJson(raw: string) {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = (fenced?.[1] || raw).trim();

  try {
    return JSON.parse(source);
  } catch {
    // Try balanced-object extraction below.
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

function extractHtmlDocument(raw: string) {
  const source = raw.trim();
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

function planFromFallbackMessage(message: string) {
  const html = extractHtmlDocument(message);
  if (html) {
    return {
      thought: '模型返回了 HTML，系统已自动包装为白板课件组件。',
      voice_response: '已生成互动 HTML 课件。',
      operations: [
        {
          action: 'create',
          type: 'preview_html',
          x: 16,
          y: 72,
          props: {
            w: 820,
            h: 620,
            html,
          },
        },
      ],
    };
  }

  return null;
}

function validateInteractivePlan(plan: unknown) {
  if (!plan || typeof plan !== 'object') {
    return '模型没有返回课件计划对象';
  }

  const operations = (plan as { operations?: unknown }).operations;
  if (!Array.isArray(operations)) {
    return '模型没有返回 operations 数组';
  }

  const previewHtml = operations
    .map((operation) => {
      if (!operation || typeof operation !== 'object') return '';
      const props = (operation as { props?: unknown }).props;
      if (!props || typeof props !== 'object') return '';
      const html = (props as { html?: unknown }).html;
      return typeof html === 'string' ? html : '';
    })
    .find((html) => html.trim().length > 0);

  if (!previewHtml) {
    return '模型没有在 preview_html.props.html 中返回完整 HTML';
  }

  const checks = [
    {
      ok: /<!doctype\s+html|<html[\s>]/i.test(previewHtml),
      message: 'HTML 必须是完整文档，包含 <!doctype html> 或 <html>',
    },
    {
      ok: /<svg[\s>]|<canvas[\s>]/i.test(previewHtml),
      message: '课件必须包含 SVG 或 Canvas 可视化内容',
    },
    {
      ok: /<script[\s>]/i.test(previewHtml),
      message: '课件必须包含内联 <script> 交互脚本',
    },
    {
      ok: /addEventListener|onpointerdown|onpointermove|onpointerup|pointerdown|pointermove|pointerup|touchstart|touchmove|drag|onclick|oninput|onchange|type=["']range["']|<button[\s>]/i.test(
        previewHtml
      ),
      message: '课件必须包含真实触屏互动逻辑，例如拖拽、按钮、滑块或选择事件',
    },
  ];

  return checks.find((check) => !check.ok)?.message || '';
}

function injectQuizResultBridge(html: string, studentId: string, topic: string) {
  if (/quiz_result/.test(html) && /postMessage/.test(html)) {
    return html;
  }

  const bridgeScript = `
<script>
(function () {
  if (window.__dlgzzCoursewareQuizBridge) return;
  window.__dlgzzCoursewareQuizBridge = true;
  var startedAt = Date.now();

  function reportCoursewareComplete() {
    var finishedAt = new Date().toISOString();
    window.parent.postMessage({
      type: "quiz_result",
      studentId: ${JSON.stringify(studentId)},
      quiz: {
        topic: ${JSON.stringify(topic)},
        total: 1,
        correct: 1,
        durationSeconds: Math.max(1, Math.round((Date.now() - startedAt) / 1000)),
        finishedAt: finishedAt,
        questions: [{
          id: "courseware-complete",
          prompt: "完成互动课件：" + ${JSON.stringify(topic)},
          answer: "completed",
          correctAnswer: "completed",
          isCorrect: true,
          skill: "courseware"
        }],
        wrong: []
      }
    }, "*");
  }

  function mountSubmitButton() {
    if (document.getElementById("dlgzz-courseware-submit")) return;
    var button = document.createElement("button");
    button.id = "dlgzz-courseware-submit";
    button.type = "button";
    button.textContent = "提交学习结果";
    button.setAttribute("aria-label", "提交学习结果");
    button.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:99999;border:0;border-radius:14px;background:#111827;color:#fff;font:600 15px/1.2 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:13px 16px;box-shadow:0 10px 30px rgba(15,23,42,.24);touch-action:manipulation;";
    button.addEventListener("click", function () {
      reportCoursewareComplete();
      button.textContent = "已提交";
      button.style.background = "#047857";
      button.disabled = true;
    });
    document.body.appendChild(button);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountSubmitButton);
  } else {
    mountSubmitButton();
  }
})();
</script>`;

  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${bridgeScript}\n</body>`);
  }

  return `${html}\n${bridgeScript}`;
}

function attachQuizResultBridge(plan: unknown, studentId: string, topic: string) {
  if (!plan || typeof plan !== 'object') {
    return plan;
  }

  const operations = (plan as { operations?: unknown }).operations;
  if (!Array.isArray(operations)) {
    return plan;
  }

  operations.forEach((operation) => {
    if (!operation || typeof operation !== 'object') return;
    const props = (operation as { props?: unknown }).props;
    if (!props || typeof props !== 'object') return;
    const propsRecord = props as { html?: unknown };
    if (typeof propsRecord.html !== 'string') return;
    propsRecord.html = injectQuizResultBridge(propsRecord.html, studentId, topic);
  });

  return plan;
}

function buildFallbackInteractiveHtml({
  title,
  description,
  whiteboardPrompt,
  studentId,
}: {
  title: string;
  description: string;
  whiteboardPrompt: string;
  studentId: string;
}) {
  const topic = title || '互动课件';
  const isCircleArea = /圆|circle|面积/.test(`${title} ${description} ${whiteboardPrompt}`);
  const quizPrompt = isCircleArea ? '圆的面积公式是什么？' : `完成课件「${topic}」后，你学到了什么？`;
  const correctAnswer = isCircleArea ? 'πr²' : '已完成';
  const options = isCircleArea
    ? ['2πr', 'πr²', 'πd', 'r²']
    : ['已完成', '还没理解', '需要老师讲解', '跳过'];

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <title>${topic}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #172033; background: #f7f8fb; overflow: hidden; touch-action: manipulation; }
    .app { height: 100vh; display: grid; grid-template-rows: auto 1fr auto; gap: 10px; padding: 12px; }
    header, footer, .stage, .panel { background: #fff; border: 1px solid #dfe4ef; border-radius: 10px; padding: 12px; }
    h1 { margin: 0; font-size: 20px; }
    p { margin: 6px 0 0; color: #566174; line-height: 1.45; }
    main { min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) 270px; gap: 10px; }
    .stage { min-height: 0; display: grid; place-items: center; touch-action: none; }
    svg { width: min(100%, 500px); height: min(100%, 360px); overflow: visible; touch-action: none; }
    .panel { min-height: 0; display: grid; gap: 12px; align-content: start; overflow: auto; }
    label { display: grid; gap: 6px; font-weight: 700; }
    input[type="range"] { width: 100%; accent-color: #2563eb; }
    button { border: 0; border-radius: 10px; min-height: 44px; padding: 10px 12px; background: #e8eefc; color: #172033; font-weight: 700; touch-action: manipulation; }
    button.active { background: #2563eb; color: #fff; }
    .submit { background: #101827; color: #fff; }
    .answer-grid { display: grid; gap: 8px; }
    .hint { color: #64748b; font-size: 14px; }
    @media (max-width: 760px) { main { grid-template-columns: 1fr; grid-template-rows: 1fr auto; } .panel { max-height: 280px; } }
  </style>
</head>
<body>
  <div class="app">
    <header>
      <h1>${topic}</h1>
      <p>${description || whiteboardPrompt || '拖动、切换步骤并完成最后的小测。'}</p>
    </header>
    <main>
      <section class="stage" aria-label="互动演示区域">
        <svg id="diagram" viewBox="0 0 520 360" role="img" aria-label="互动数学图形">
          <rect x="0" y="0" width="520" height="360" rx="18" fill="#f8fafc"></rect>
          <g transform="translate(180 180)">
            <circle id="mainCircle" cx="0" cy="0" r="90" fill="#dbeafe" stroke="#2563eb" stroke-width="4"></circle>
            <line id="radiusLine" x1="0" y1="0" x2="90" y2="0" stroke="#ef4444" stroke-width="5" stroke-linecap="round"></line>
            <circle id="dragHandle" cx="90" cy="0" r="15" fill="#ef4444" stroke="#fff" stroke-width="4"></circle>
            <text id="radiusLabel" x="34" y="-12" fill="#991b1b" font-size="18" font-weight="700">r=6</text>
          </g>
          <g id="rectGroup" transform="translate(300 118)" opacity="0.28">
            <rect id="areaRect" x="0" y="0" width="150" height="90" rx="10" fill="#bbf7d0" stroke="#16a34a" stroke-width="4"></rect>
            <text x="20" y="52" fill="#166534" font-size="18" font-weight="700">近似长方形</text>
          </g>
        </svg>
      </section>
      <aside class="panel">
        <label>半径 r：<span id="radiusValue">6</span><input id="radiusSlider" type="range" min="3" max="10" value="6"></label>
        <div class="answer-grid">
          <button class="step active" data-step="0">1. 观察圆和半径</button>
          <button class="step" data-step="1">2. 想象切成扇形</button>
          <button class="step" data-step="2">3. 拼成近似长方形</button>
        </div>
        <div>
          <div class="hint">${quizPrompt}</div>
          <div id="answers" class="answer-grid">${options
            .map((option) => `<button data-answer="${option}">${option}</button>`)
            .join('')}</div>
        </div>
        <button id="submit" class="submit">提交学习结果</button>
        <div id="feedback" class="hint">拖动红点或滑块，观察图形变化。</div>
      </aside>
    </main>
    <footer class="hint">系统兜底课件：当模型输出不稳定时，仍保证可触屏、可上报。</footer>
  </div>
  <script>
    (function () {
      var studentId = ${JSON.stringify(studentId)};
      var topic = ${JSON.stringify(topic)};
      var correctAnswer = ${JSON.stringify(correctAnswer)};
      var startedAt = Date.now();
      var radius = 6;
      var selectedAnswer = "";
      var step = 0;
      var dragging = false;
      var slider = document.getElementById("radiusSlider");
      var radiusValue = document.getElementById("radiusValue");
      var circle = document.getElementById("mainCircle");
      var line = document.getElementById("radiusLine");
      var handle = document.getElementById("dragHandle");
      var label = document.getElementById("radiusLabel");
      var rectGroup = document.getElementById("rectGroup");
      var rect = document.getElementById("areaRect");
      var feedback = document.getElementById("feedback");
      function setRadius(next) {
        radius = Math.max(3, Math.min(10, Math.round(next)));
        var px = radius * 15;
        radiusValue.textContent = String(radius);
        slider.value = String(radius);
        circle.setAttribute("r", String(px));
        line.setAttribute("x2", String(px));
        handle.setAttribute("cx", String(px));
        label.setAttribute("x", String(px / 2 - 10));
        label.textContent = "r=" + radius;
        rect.setAttribute("width", String(Math.max(90, px * 1.65)));
        rect.setAttribute("height", String(Math.max(48, px)));
      }
      function setStep(next) {
        step = next;
        document.querySelectorAll(".step").forEach(function (button) { button.classList.toggle("active", Number(button.dataset.step) === step); });
        rectGroup.setAttribute("opacity", step >= 2 ? "1" : step === 1 ? "0.55" : "0.28");
        feedback.textContent = step === 0 ? "拖动红点改变半径，面积会跟着变化。" : step === 1 ? "把圆切成许多小扇形，越多越接近平滑。" : "扇形重排后接近长方形，所以面积和 r 有关。";
      }
      slider.addEventListener("input", function (event) { setRadius(Number(event.target.value)); });
      handle.addEventListener("pointerdown", function (event) { dragging = true; handle.setPointerCapture(event.pointerId); });
      handle.addEventListener("pointermove", function (event) {
        if (!dragging) return;
        var svg = document.getElementById("diagram");
        var box = svg.getBoundingClientRect();
        var x = ((event.clientX - box.left) / box.width) * 520 - 180;
        setRadius(x / 15);
      });
      handle.addEventListener("pointerup", function (event) { dragging = false; handle.releasePointerCapture(event.pointerId); });
      document.querySelectorAll(".step").forEach(function (button) { button.addEventListener("click", function () { setStep(Number(button.dataset.step)); }); });
      document.querySelectorAll("#answers button").forEach(function (button) {
        button.addEventListener("click", function () {
          selectedAnswer = button.dataset.answer || "";
          document.querySelectorAll("#answers button").forEach(function (item) { item.classList.toggle("active", item === button); });
        });
      });
      document.getElementById("submit").addEventListener("click", function () {
        var isCorrect = selectedAnswer === correctAnswer;
        var questions = [{ id: "courseware-question-1", prompt: ${JSON.stringify(
          quizPrompt
        )}, answer: selectedAnswer || "未选择", correctAnswer: correctAnswer, isCorrect: isCorrect, skill: "courseware" }];
        feedback.textContent = isCorrect ? "提交成功：回答正确。" : "提交成功：稍后可以再练一次。";
        window.parent.postMessage({ type: "quiz_result", studentId: studentId, quiz: { topic: topic, total: 1, correct: isCorrect ? 1 : 0, durationSeconds: Math.max(1, Math.round((Date.now() - startedAt) / 1000)), finishedAt: new Date().toISOString(), questions: questions, wrong: isCorrect ? [] : questions } }, "*");
      });
      setRadius(radius);
      setStep(0);
    })();
  </script>
</body>
</html>`;
}

function buildFallbackPlan({
  title,
  description,
  whiteboardPrompt,
  studentId,
}: {
  title: string;
  description: string;
  whiteboardPrompt: string;
  studentId: string;
}) {
  return {
    thought: '模型没有稳定返回合格互动 HTML，系统已生成一个可触屏、可上报成绩的兜底课件。',
    voice_response: '已生成可触屏互动课件，并补齐学习结果上报。',
    operations: [
      {
        action: 'create',
        type: 'preview_html',
        x: 16,
        y: 72,
        props: {
          w: 820,
          h: 620,
          html: buildFallbackInteractiveHtml({
            title,
            description,
            whiteboardPrompt,
            studentId,
          }),
        },
      },
    ],
  };
}

function buildPrompt({
  title,
  description,
  whiteboardPrompt,
  body,
  studentId,
  extraPrompt,
}: {
  title: string;
  description: string;
  whiteboardPrompt: string;
  body: string;
  studentId: string;
  extraPrompt: string;
}) {
  return `你是老师课件后台里的“MDX 转互动课件”生成器。

请把下面的 MDX 教案生成一个可直接放进白板的互动 HTML 课件。

必须返回 JSON，不能返回 Markdown 或解释文字。JSON 格式：
{
  "thought": "简短中文说明",
  "voice_response": "给老师看的生成结果说明",
  "operations": [
    {
      "action": "create",
      "type": "preview_html",
      "x": 16,
      "y": 72,
      "props": {
        "w": 820,
        "h": 620,
        "html": "完整 HTML 文档"
      }
    }
  ]
}

课件 HTML 要求：
- 必须是完整自包含 HTML，包含内联 CSS/JS，不加载外部脚本。
- 面向 iPad/触屏：按钮足够大，自定义拖拽必须用 Pointer Events，拖拽区域设置 touch-action: none。
- 可用 SVG、Canvas、原生 JS 做交互；数学图形优先用 SVG。
- 不要做普通文章页面，要做可以点、拖、选、答题的互动课件。
- props.html 里必须包含 <script>，并且脚本必须注册 addEventListener("pointerdown"/"pointermove"/"pointerup") 或等价 Pointer Events。
- 必须至少有 2 个真实互动动作，例如拖动半径/滑块调整/步骤切换/选择答案/提交结果；不能只输出静态说明。
- 如果 MDX 内容不足，也要根据标题和简介生成一个可触屏操作的最小完整课件，不能退化成文章或纯展示页。
- 至少包含一个学习结果提交动作。
- 提交时必须调用：
  window.parent.postMessage({ type: "quiz_result", studentId: "${studentId}", quiz: { topic, total, correct, questions, wrong, durationSeconds, finishedAt } }, "*")
- questions 必须包含所有答过的题；wrong 只放错题。
- 如果没有明确学生编号，studentId 可以为空字符串，但不要写 demo-student。

课件标题：${title}
课件简介：${description || '无'}
MDX 中已有白板提示词：${whiteboardPrompt || '无'}
老师补充要求：${extraPrompt || '无'}
当前学生编号：${studentId || '未指定'}

MDX 正文：
${body.slice(0, 12000)}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const slug = typeof body.slug === 'string' ? body.slug : '';
    const locale = typeof body.locale === 'string' ? body.locale : 'zh';
    const studentId = typeof body.studentId === 'string' ? body.studentId.trim() : '';
    const extraPrompt = typeof body.extraPrompt === 'string' ? body.extraPrompt.trim() : '';

    if (!slug.trim()) {
      return NextResponse.json(
        { success: false, error: '缺少 MDX slug' },
        { status: 400 }
      );
    }

    const post = getCoursewareMdxPost(slug, locale) || (await getDatabaseCoursewarePost(slug, locale));
    if (!post) {
      return NextResponse.json(
        { success: false, error: '没有找到对应的 MDX 课件' },
        { status: 404 }
      );
    }

    const prompt = buildPrompt({
      title: post.title,
      description: post.description,
      whiteboardPrompt: post.whiteboardPrompt,
      body: post.body,
      studentId,
      extraPrompt,
    });

    const model =
      process.env.WHITEBOARD_COURSEWARE_MODEL || process.env.GEMINI_MODEL || 'gemini-3.5-flash';
    let lastMessage = '';
    let lastProvider = '';
    let lastValidationError = '';

    try {
      for (let attempt = 0; attempt < 1; attempt += 1) {
        const correction = lastValidationError
          ? `\n\n上一次生成不合格：${lastValidationError}。请重新输出 JSON，props.html 必须是完整、可触屏互动、包含内联脚本和 quiz_result 上报的 HTML。`
          : '';
        const { message, provider } = await chatWithResolvedServerProvider({
          preferredProvider: process.env.WHITEBOARD_COURSEWARE_PROVIDER || 'gemini',
          model,
          responseMimeType: 'application/json',
          responseSchema: COURSEWARE_ACTION_SCHEMA,
          messages: [
            {
              role: 'system',
              content:
                '你只输出可解析 JSON。你是触屏教育课件工程师，必须生成可点击、可拖拽、可提交成绩的自包含 HTML/SVG/JS 互动课件。静态页面是不合格答案。',
            },
            { role: 'user', content: `${prompt}${correction}` },
          ],
        });

        lastMessage = message;
        lastProvider = provider;

        const extractedPlan = extractJson(message);
        const plan = Array.isArray(extractedPlan)
          ? { operations: extractedPlan }
          : extractedPlan && typeof extractedPlan === 'object'
            ? extractedPlan
            : planFromFallbackMessage(message);

        const validationError = validateInteractivePlan(plan);
        if (validationError) {
          lastValidationError = validationError;
          continue;
        }

        const normalizedPlan = attachQuizResultBridge(plan, studentId, post.title);

        return NextResponse.json({
          success: true,
          provider,
          model,
          post: {
            slug: post.slug,
            title: post.title,
            description: post.description,
            whiteboardPrompt: post.whiteboardPrompt || undefined,
          },
          plan: normalizedPlan,
          message,
        });
      }
    } catch (generationError) {
      lastValidationError =
        generationError instanceof Error ? generationError.message : 'AI 生成接口异常';
      lastMessage = lastValidationError;
    }

    const fallbackPlan = buildFallbackPlan({
      title: post.title,
      description: post.description,
      whiteboardPrompt: post.whiteboardPrompt,
      studentId,
    });

    return NextResponse.json({
      success: true,
      fallback: true,
      error: lastValidationError || undefined,
      provider: lastProvider || process.env.WHITEBOARD_COURSEWARE_PROVIDER || 'system',
      model,
      post: {
        slug: post.slug,
        title: post.title,
        description: post.description,
        whiteboardPrompt: post.whiteboardPrompt || undefined,
      },
      plan: fallbackPlan,
      message:
        lastMessage ||
        'AI 生成结果未达到互动课件要求，系统已使用可触屏兜底课件模板。',
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '生成互动课件失败',
      },
      { status: 500 }
    );
  }
}
