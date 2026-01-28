import { NextRequest, NextResponse } from 'next/server';
import { ZhipuAI } from '@/lib/ai/zhipu';

export const maxDuration = 60;

/**
 * Whiteboard AI Chat API - 白板专用的智谱 AI 对话接口
 *
 * 与 /api/ai/chat 不同，这个接口：
 * 1. 使用智谱 AI (GLM-4) 而不是 DeepSeek
 * 2. 不需要付费订阅（可选）
 * 3. 专门用于白板的 AI Terminal 功能
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

    const zhipu = new ZhipuAI();
    const response = await zhipu.chat(messages);

    return NextResponse.json({
      success: true,
      message: response
    });
  } catch (error) {
    console.error('Whiteboard AI Chat Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '智谱 AI 请求失败'
      },
      { status: 500 }
    );
  }
}
