import { getCoursewareMdxPost } from '@/lib/courseware-mdx';
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
      ok: /addEventListener|onpointerdown|pointerdown|pointermove|pointerup|touchstart|touchmove|drag/i.test(
        previewHtml
      ),
      message: '课件必须包含触屏/拖拽事件逻辑，例如 Pointer Events',
    },
    {
      ok: /quiz_result/.test(previewHtml) && /postMessage/.test(previewHtml),
      message: '课件必须通过 postMessage 上报 quiz_result',
    },
  ];

  return checks.find((check) => !check.ok)?.message || '';
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

    const post = getCoursewareMdxPost(slug, locale);
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

    for (let attempt = 0; attempt < 2; attempt += 1) {
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
        plan,
        message,
      });
    }

    return NextResponse.json(
      {
        success: false,
        error: lastValidationError || '模型没有返回可解析的互动课件 JSON',
        provider: lastProvider || undefined,
        model,
        message: lastMessage,
      },
      { status: 502 }
    );
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
