import { chatWithResolvedServerProvider } from '@/lib/ai/provider';
import { requireSameOrigin } from '@/lib/api-security';
import { hasAccessToPremiumContent } from '@/lib/premium-access';
import { getSession } from '@/lib/server';
import { type NextRequest, NextResponse } from 'next/server';

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
  const csrf = requireSameOrigin(request);
  if (csrf) return csrf;

  try {
    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > 250_000) {
      return NextResponse.json(
        { success: false, error: '请求内容过大' },
        { status: 413 }
      );
    }

    const { messages, purpose } = await request.json();
    const isCoursewareGeneration = purpose === 'courseware';

    if (
      !Array.isArray(messages) ||
      messages.length === 0 ||
      messages.length > 30 ||
      JSON.stringify(messages).length > 200_000
    ) {
      return NextResponse.json(
        { success: false, error: '无效的消息格式' },
        { status: 400 }
      );
    }

    // Secure by default. Public courseware generation can be explicitly enabled
    // for a controlled demo with WHITEBOARD_COURSEWARE_REQUIRE_AUTH=false.
    const requireCoursewareAuth = process.env.WHITEBOARD_COURSEWARE_REQUIRE_AUTH !== 'false';
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

    const preferredProvider = isCoursewareGeneration
      ? process.env.WHITEBOARD_COURSEWARE_PROVIDER || 'gemini'
      : process.env.WHITEBOARD_AI_PROVIDER;
    const model = isCoursewareGeneration
      ? process.env.WHITEBOARD_COURSEWARE_MODEL || process.env.GEMINI_MODEL || 'gemini-3.5-flash'
      : undefined;

    const { message, provider } = await chatWithResolvedServerProvider({
      messages,
      preferredProvider,
      model,
      responseMimeType: isCoursewareGeneration ? 'application/json' : undefined,
      responseSchema: isCoursewareGeneration ? WHITEBOARD_ACTION_SCHEMA : undefined,
    });

    return NextResponse.json({
      success: true,
      message,
      provider,
      model: model || null,
    });
  } catch (error) {
    console.error('Whiteboard AI Chat Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'AI 请求失败，请稍后重试',
      },
      { status: 500 }
    );
  }
}
