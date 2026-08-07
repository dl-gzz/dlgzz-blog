import { NextRequest, NextResponse } from 'next/server';
import { requireSameOrigin } from '@/lib/api-security';
import { getSession } from '@/lib/server';
import { hasAccessToPremiumContent } from '@/lib/premium-access';
import {
  checkTrialQuota,
  recordTrialUsage,
  visitorIdFromRequest,
} from '@/lib/free-trial-quota';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const csrf = requireSameOrigin(request);
  if (csrf) return csrf;

  try {
    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > 100_000) {
      return NextResponse.json({ error: '请求内容过大' }, { status: 413 });
    }

    const body = await request.json();
    const text = typeof body?.text === 'string' ? body.text.trim() : '';
    const question = typeof body?.question === 'string' ? body.question.trim() : '';

    if (!text || text.length > 20_000 || question.length > 2_000) {
      return NextResponse.json(
        { error: text ? '文本或问题过长' : '缺少文本数据' },
        { status: 413 }
      );
    }

    const session = await getSession();
    const userId = session?.user?.id ?? null;
    const isMember = userId ? await hasAccessToPremiumContent() : false;
    const visitorId = userId ? null : visitorIdFromRequest(request);
    const quota = await checkTrialQuota({ userId, visitorId, isMember });
    if (!quota.allowed) {
      return NextResponse.json(
        { error: '今日免费体验次数已用完', code: 'TRIAL_LIMIT', limit: quota.limit },
        { status: 429 }
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
        { error: 'DeepSeek API 调用失败，请稍后重试' },
        { status: response.status }
      );
    }

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content || '无法获取回答';

    if (!quota.isMember) {
      await recordTrialUsage({
        userId,
        visitorId,
        query: question ? `${text}\n${question}` : text,
        resultCount: answer ? 1 : 0,
        latencyMs: 0,
      });
    }

    console.log('[Circle Search] DeepSeek API 调用成功');

    return NextResponse.json({ answer });
  } catch (error) {
    console.error('[Circle Search] 服务器错误:', error);
    return NextResponse.json(
      { error: '服务器错误，请稍后重试' },
      { status: 500 }
    );
  }
}
