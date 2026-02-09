import { NextRequest, NextResponse } from 'next/server';
import { GeminiAI } from '@/lib/ai/gemini';
import { ZhipuAI } from '@/lib/ai/zhipu';
import { DeepSeekAI } from '@/lib/ai/deepseek';

export const maxDuration = 60;

/**
 * Whiteboard AI Chat API
 *
 * Provider priority:
 * 1. WHITEBOARD_AI_PROVIDER=gemini|zhipu|deepseek
 * 2. Auto-detect by available server keys
 */
export async function POST(request: NextRequest) {
  try {
    const { messages } = await request.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { success: false, error: '无效的消息格式' },
        { status: 400 }
      );
    }

    const provider = (process.env.WHITEBOARD_AI_PROVIDER || '').trim().toLowerCase();
    const hasGemini = Boolean(process.env.GEMINI_API_KEY);
    const hasZhipu = Boolean(process.env.ZHIPU_API_KEY);
    const hasDeepSeek = Boolean(process.env.DEEPSEEK_API_KEY);

    let response = '';
    let usedProvider = '';

    if (provider === 'gemini' || (!provider && hasGemini)) {
      const gemini = new GeminiAI();
      response = await gemini.chat(messages);
      usedProvider = 'gemini';
    } else if (provider === 'zhipu' || (!provider && hasZhipu)) {
      const zhipu = new ZhipuAI();
      response = await zhipu.chat(messages);
      usedProvider = 'zhipu';
    } else if (provider === 'deepseek' || (!provider && hasDeepSeek)) {
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
