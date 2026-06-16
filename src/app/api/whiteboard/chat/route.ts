import { NextRequest, NextResponse } from 'next/server';
import { GeminiAI } from '@/lib/ai/gemini';
import { ZhipuAI } from '@/lib/ai/zhipu';
import { DeepSeekAI } from '@/lib/ai/deepseek';
import { hasAccessToPremiumContent } from '@/lib/premium-access';
import { getSession } from '@/lib/server';

export const maxDuration = 60;

const WHITEBOARD_ACTION_SCHEMA = {
  type: 'object',
  properties: {
    thought: {
      type: 'string',
      description: 'A short private summary of the plan.',
    },
    voice_response: {
      type: 'string',
      description: 'A short Chinese sentence shown to the teacher.',
    },
    operations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['create', 'update', 'delete'],
          },
          id: {
            type: 'string',
            description: 'Shape id for update/delete operations.',
          },
          type: {
            type: 'string',
            enum: ['preview_html', 'ai_result'],
          },
          x: { type: 'number' },
          y: { type: 'number' },
          props: {
            type: 'object',
            properties: {
              w: { type: 'number' },
              h: { type: 'number' },
              html: {
                type: 'string',
                description:
                  'Complete HTML document for preview_html. It must post quiz_result to window.parent after the learner submits answers.',
              },
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

/**
 * Whiteboard AI Chat API
 *
 * Provider priority:
 * 1. Courseware requests use WHITEBOARD_COURSEWARE_PROVIDER/MODEL.
 * 2. Other whiteboard requests use WHITEBOARD_AI_PROVIDER.
 * 3. Auto-detect by available server keys.
 */
export async function POST(request: NextRequest) {
  try {
    const { messages, purpose } = await request.json();
    const isCoursewareGeneration = purpose === 'courseware';

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { success: false, error: '无效的消息格式' },
        { status: 400 }
      );
    }

    const requireCoursewareAuth = process.env.WHITEBOARD_COURSEWARE_REQUIRE_AUTH === 'true';
    if (!isCoursewareGeneration || requireCoursewareAuth) {
      const session = await getSession();
      if (!session?.user) {
        return NextResponse.json(
          { success: false, error: '请先登录后再使用白板 AI' },
          { status: 401 }
        );
      }

      const hasPremiumAccess = await hasAccessToPremiumContent();
      if (!hasPremiumAccess) {
        return NextResponse.json(
          { success: false, error: '白板 AI 功能仅限付费用户使用' },
          { status: 403 }
        );
      }
    }

    const configuredProvider = (
      isCoursewareGeneration
        ? process.env.WHITEBOARD_COURSEWARE_PROVIDER || 'gemini'
        : process.env.WHITEBOARD_AI_PROVIDER || ''
    )
      .trim()
      .toLowerCase();
    const coursewareModel =
      process.env.WHITEBOARD_COURSEWARE_MODEL ||
      process.env.GEMINI_MODEL ||
      'gemini-3.5-flash';
    const hasGemini = Boolean(process.env.GEMINI_API_KEY);
    const hasZhipu = Boolean(process.env.ZHIPU_API_KEY);
    const hasDeepSeek = Boolean(process.env.DEEPSEEK_API_KEY);

    let response = '';
    let usedProvider = '';
    let usedModel: string | null = null;

    if (configuredProvider === 'gemini' || (!configuredProvider && hasGemini)) {
      const gemini = new GeminiAI({
        model: isCoursewareGeneration ? coursewareModel : undefined,
        responseMimeType: isCoursewareGeneration ? 'application/json' : undefined,
        responseSchema: isCoursewareGeneration ? WHITEBOARD_ACTION_SCHEMA : undefined,
      });
      response = await gemini.chat(messages);
      usedProvider = 'gemini';
      usedModel = isCoursewareGeneration ? coursewareModel : null;
    } else if (configuredProvider === 'zhipu' || (!configuredProvider && hasZhipu)) {
      const zhipu = new ZhipuAI();
      response = await zhipu.chat(messages);
      usedProvider = 'zhipu';
    } else if (configuredProvider === 'deepseek' || (!configuredProvider && hasDeepSeek)) {
      const deepseek = new DeepSeekAI();
      response = await deepseek.chat(messages);
      usedProvider = 'deepseek';
    } else {
      throw new Error(
        'No whiteboard AI provider configured. Set GEMINI_API_KEY, ZHIPU_API_KEY, or DEEPSEEK_API_KEY.'
      );
    }

    return NextResponse.json({
      success: true,
      message: response,
      provider: usedProvider,
      model: usedModel,
    });
  } catch (error) {
    console.error('Whiteboard AI Chat Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'AI 请求失败'
      },
      { status: 500 }
    );
  }
}
