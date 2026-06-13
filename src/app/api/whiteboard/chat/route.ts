import { chatWithResolvedServerProvider } from '@/lib/ai/provider';
import { hasAccessToPremiumContent } from '@/lib/premium-access';
import { getSession } from '@/lib/server';
import { type NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;

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

    const { messages, purpose } = await request.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { success: false, error: '无效的消息格式' },
        { status: 400 }
      );
    }

    const isCoursewareGeneration = purpose === 'courseware';
    const preferredProvider = isCoursewareGeneration
      ? process.env.WHITEBOARD_COURSEWARE_PROVIDER || 'gemini'
      : process.env.WHITEBOARD_AI_PROVIDER;
    const model = isCoursewareGeneration
      ? process.env.WHITEBOARD_COURSEWARE_MODEL || process.env.GEMINI_MODEL || 'gemini-3.1-pro-preview'
      : undefined;

    const { message, provider } = await chatWithResolvedServerProvider({
      messages,
      preferredProvider,
      model,
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
        error: error instanceof Error ? error.message : 'AI 请求失败',
      },
      { status: 500 }
    );
  }
}
