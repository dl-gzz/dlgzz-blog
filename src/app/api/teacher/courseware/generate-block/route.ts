import { chatWithResolvedServerProvider } from '@/lib/ai/provider';
import { type NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;

const PROMPT_BLOCK_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    description: { type: 'string' },
    slug: { type: 'string' },
    whiteboardPrompt: { type: 'string' },
    mdx: { type: 'string' },
  },
  required: ['title', 'description', 'slug', 'whiteboardPrompt', 'mdx'],
} satisfies Record<string, unknown>;

function readText(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function yamlString(value: string) {
  return JSON.stringify(value);
}

function toSafeSlug(value: string, fallback = 'prompt-block') {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
  return normalized || `${fallback}-${Date.now()}`;
}

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

function buildFallbackBlock(idea: string) {
  const title = idea.replace(/[。！？\n\r]+/g, ' ').trim().slice(0, 36) || 'AI 课件提示词 Block';
  const description = `围绕“${title}”生成的可复用白板互动课件提示词。`;
  const whiteboardPrompt = `请根据《${title}》生成一个触屏互动课件：包含清晰图形、步骤切换、可拖拽/可点击交互、1 道即时检测题，并在提交时通过 quiz_result 上报学生答题结果。`;
  const today = new Date().toISOString().slice(0, 10);
  const mdx = `---
title: ${yamlString(title)}
description: ${yamlString(description)}
date: ${yamlString(today)}
image: /images/blog/interactive-math-game.png
published: true
author: admin
premium: false
featured: false
whiteboard_category: education
whiteboard_prompt: ${yamlString(whiteboardPrompt)}
generated_prompt_block: true
---

# ${title}

## 教学目标

- 帮助学生理解“${title}”的核心概念。
- 通过可视化操作把抽象步骤变成可观察、可拖动、可验证的过程。
- 通过一道即时检测题判断学生是否真正理解。

## 课件生成提示词

${whiteboardPrompt}

## 交互要求

- 面向 iPad 和触屏使用，按钮足够大。
- 至少包含两个真实交互：步骤切换、拖拽图形、滑块调节、选择答案或提交结果。
- 使用 SVG、Canvas 或原生 HTML/CSS/JS，优先保证触屏稳定。

## 答题与记录要求

- 最后必须有一道检测题。
- 学生提交后必须上报 quiz_result。
- questions 包含所有答题记录，wrong 只包含错题。
`;

  return {
    title,
    description,
    slug: toSafeSlug(`${title}-prompt`),
    whiteboardPrompt,
    mdx,
  };
}

function normalizeBlock(value: unknown, idea: string) {
  const fallback = buildFallbackBlock(idea);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;

  const record = value as Record<string, unknown>;
  const title = readText(record.title, fallback.title);
  const description = readText(record.description, fallback.description);
  const whiteboardPrompt = readText(record.whiteboardPrompt, fallback.whiteboardPrompt);
  const slug = toSafeSlug(readText(record.slug, `${title}-prompt`));
  const mdx = readText(record.mdx, fallback.mdx);

  return {
    title,
    description,
    slug,
    whiteboardPrompt,
    mdx,
  };
}

function buildPrompt(idea: string) {
  return `你是老师后台里的“MDX 课件提示词 Block”生成器。

老师会输入一句自然语言想法。你不要生成最终 HTML 课件，而是生成一份可编辑、可保存、可复用的 MDX Block。

这个 MDX Block 的作用：
1. 它本身是一篇博客/教案。
2. 它的 whiteboard_prompt 字段会被白板读取，作为后续生成互动课件的提示词。
3. 老师可以编辑它，也可以保存后反复复用。

必须返回 JSON，不能返回 Markdown 解释。JSON 格式：
{
  "title": "适合老师识别的标题",
  "description": "一句话说明这个 Block 能生成什么课件",
  "slug": "英文小写 slug",
  "whiteboardPrompt": "给白板 AI 使用的完整课件生成提示词",
  "mdx": "完整 MDX 文档源码"
}

MDX 要求：
- 必须包含 frontmatter。
- frontmatter 必须包含：title、description、date、published、whiteboard_category、whiteboard_prompt、generated_prompt_block。
- whiteboard_category 必须是 education。
- whiteboard_prompt 要写得具体，能指导 AI 生成触屏互动课件，而不是普通文章。
- 正文要包含：教学目标、知识点拆解、互动设计、答题检测、生成注意事项。
- 不要在 MDX 里放最终 HTML，不要放 React 组件代码。
- 面向小学/中学课堂，语言清楚，老师能改。

老师想法：
${idea}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const idea = readText(body.idea);

    if (!idea) {
      return NextResponse.json(
        { success: false, error: '请先输入想生成什么课件' },
        { status: 400 }
      );
    }

    const model = process.env.COURSEWARE_BLOCK_MODEL || process.env.GEMINI_MODEL || 'gemini-3.5-flash';

    try {
      const { message, provider } = await chatWithResolvedServerProvider({
        preferredProvider:
          process.env.COURSEWARE_BLOCK_PROVIDER ||
          process.env.WHITEBOARD_COURSEWARE_PROVIDER ||
          'gemini',
        model,
        responseMimeType: 'application/json',
        responseSchema: PROMPT_BLOCK_SCHEMA,
        messages: [
          {
            role: 'system',
            content:
              '你只输出可解析 JSON。你负责把老师的一句话想法整理成可编辑、可复用的 MDX 课件提示词 Block。',
          },
          { role: 'user', content: buildPrompt(idea) },
        ],
      });

      return NextResponse.json({
        success: true,
        provider,
        model,
        block: normalizeBlock(extractJson(message), idea),
        message,
      });
    } catch (generationError) {
      return NextResponse.json({
        success: true,
        fallback: true,
        provider: process.env.COURSEWARE_BLOCK_PROVIDER || 'system',
        model,
        block: buildFallbackBlock(idea),
        message:
          generationError instanceof Error
            ? generationError.message
            : 'AI 生成接口异常，已使用本地模板生成 Block。',
      });
    }
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '生成 MDX Block 失败',
      },
      { status: 500 }
    );
  }
}
