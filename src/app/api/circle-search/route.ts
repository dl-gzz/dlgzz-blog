import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const { text, question } = await request.json();

    if (!text) {
      return NextResponse.json(
        { error: '缺少文本数据' },
        { status: 400 }
      );
    }

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'DeepSeek API Key 未配置' },
        { status: 500 }
      );
    }

    console.log('[Circle Search] 开始调用 DeepSeek API...');
    console.log('[Circle Search] 提取的文本长度:', text.length);

    // 构建提示词
    const prompt = question
      ? `以下是从文章中选中的文本内容:\n\n"""\n${text}\n"""\n\n${question}`
      : `以下是从文章中选中的文本内容:\n\n"""\n${text}\n"""\n\n请解释这段内容，如果是中文内容，请用中文回答。`;

    // 调用 DeepSeek API
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: 2000,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('[Circle Search] DeepSeek API 错误:', errorData);
      return NextResponse.json(
        { error: 'DeepSeek API 调用失败', details: errorData },
        { status: response.status }
      );
    }

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content || '无法获取回答';

    console.log('[Circle Search] DeepSeek API 调用成功');

    return NextResponse.json({ answer });
  } catch (error) {
    console.error('[Circle Search] 服务器错误:', error);
    return NextResponse.json(
      { error: '服务器错误', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
