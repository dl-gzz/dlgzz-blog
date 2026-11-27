import { NextRequest, NextResponse } from 'next/server';
import { DeepSeekAI, DeepSeekHttpError } from '@/lib/ai/deepseek';
import {
  bodyErrorResponse,
  readBoundedJson,
  requireSameOrigin,
} from '@/lib/api-security';
import { userHasPremiumAccess } from '@/lib/premium-access';
import { requireRequestBudget } from '@/lib/request-rate-limit';
import { getSession } from '@/lib/server';

export const maxDuration = 60;

function chatError(error: string, status: number) {
  return NextResponse.json(
    { success: false, error },
    { status, headers: { 'Cache-Control': 'no-store' } }
  );
}

type ChatMessage = { role: string; content: string };

function isChatMessage(value: unknown): value is ChatMessage {
  if (typeof value !== 'object' || value === null) return false;
  const message = value as Partial<ChatMessage>;
  return (
    typeof message.role === 'string' &&
    ['system', 'user', 'assistant'].includes(message.role) &&
    typeof message.content === 'string'
  );
}

export async function POST(request: NextRequest) {
  const csrf = requireSameOrigin(request);
  if (csrf) return csrf;

  let usingPersonalKey = false;
  try {
    const userId = (await getSession())?.user?.id;
    if (!userId) return chatError('请先登录后再使用白板 AI', 401);

    const limited = requireRequestBudget('whiteboard-ai', userId, 10);
    if (limited) return limited;

    const input = (await readBoundedJson(request, 128_000)) as {
      messages?: unknown;
      purpose?: unknown;
    } | null;
    const messages = input?.messages;
    if (!Array.isArray(messages) || !messages.length || !messages.every(isChatMessage)) {
      return chatError('无效的消息格式', 400);
    }

    const keyHeader = request.headers.get('x-deepseek-api-key');
    const personalKey = keyHeader?.trim();
    if (keyHeader !== null && (!personalKey || !/^[!-~]{1,256}$/.test(personalKey))) {
      return chatError('DeepSeek API Key 格式无效', 400);
    }
    usingPersonalKey = Boolean(personalKey);

    // The client-supplied purpose changes the output format, never billing access.
    if (!usingPersonalKey) {
      if (!(await userHasPremiumAccess(userId, { membershipOnly: true }))) {
        return chatError('平台 AI 额度仅限付费会员。也可在 AI 助手中填写自己的 DeepSeek API Key。', 403);
      }
      if (!process.env.DEEPSEEK_API_KEY?.trim()) {
        return chatError('平台 DeepSeek 暂未配置，可使用自己的 DeepSeek API Key。', 503);
      }
    }

    const deepseek = new DeepSeekAI(
      personalKey
        ? { mode: 'personal', apiKey: personalKey }
        : { mode: 'site', defaultModel: 'deepseek-flash' }
    );
    const message = await deepseek.chat(
      messages.map(({ role, content }) => ({ role, content })),
      {
        json: input?.purpose === 'courseware',
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(55_000)]),
      }
    );

    return NextResponse.json(
      {
        success: true,
        message,
        provider: 'deepseek',
        model: deepseek.model,
        keySource: usingPersonalKey ? 'user' : 'server',
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    const bodyError = bodyErrorResponse(error);
    if (bodyError) return bodyError;
    if (error instanceof DeepSeekHttpError) {
      // Never log headers, the request, the upstream body or the error object.
      console.warn('Whiteboard DeepSeek upstream status:', error.status);
      if (usingPersonalKey && (error.status === 401 || error.status === 403)) {
        return chatError('DeepSeek 拒绝了你的 API Key，请检查密钥是否正确且有效。', 422);
      }
      if (usingPersonalKey && error.status === 402) {
        return chatError('你的 DeepSeek 账号余额不足，请充值后重试。', 422);
      }
      if (error.status === 429) return chatError('DeepSeek 请求过多，请稍后重试。', 429);
    } else {
      console.warn('Whiteboard DeepSeek request failed');
    }
    return chatError('AI 请求失败，请稍后重试。', 502);
  }
}
