import { NextResponse } from 'next/server';
import {
  generateTreeDraft,
  parseTreeDraftRequest,
  readTreeAICredentials,
  treeDraftFailure,
} from '@/lib/ai/tree-lesson-draft';
import {
  bodyErrorResponse,
  readBoundedJson,
  requireSameOrigin,
} from '@/lib/api-security';
import { auth } from '@/lib/auth';
import { userHasPremiumAccess } from '@/lib/premium-access';
import { requireRequestBudget } from '@/lib/request-rate-limit';
import { looksLikeDeepSeekKeyInPrompt } from '@/lib/tree-ai-key-format';

export const maxDuration = 60;
const json = (value: unknown, status = 200) =>
  NextResponse.json(value, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  });

export async function POST(request: Request) {
  const blocked = requireSameOrigin(request);
  if (blocked) return blocked;
  // The incoming bearer belongs to DeepSeek, not to our identity provider.
  // Pass only the signed session cookie, including for old site-mode clients.
  const cookie = request.headers.get('cookie');
  const session = cookie
    ? await auth.api
        .getSession({ headers: new Headers({ cookie }) })
        .catch(() => null)
    : null;
  if (!session?.user?.id)
    return json(
      { code: 'UNAUTHORIZED', error: '请先登录，再用 AI 准备课件副本' },
      401
    );
  if (!(await userHasPremiumAccess(session.user.id)))
    return json({ error: 'AI 备课需要有效会员；仍可使用原版课件。' }, 403);
  let raw: unknown;
  try {
    raw = await readBoundedJson(request, 4608);
  } catch (error) {
    return (
      bodyErrorResponse(error) ?? json({ error: '备课要求格式不正确' }, 400)
    );
  }
  const input = parseTreeDraftRequest(raw);
  if (!input)
    return json(
      { error: '请输入 1～800 字的备课要求，并使用有效的课件参数。' },
      400
    );
  if (looksLikeDeepSeekKeyInPrompt(input.instruction))
    return json(
      {
        code: 'KEY_IN_PROMPT',
        error:
          '备课要求中疑似包含密钥。请移除它，粘贴到专用的 API Key 输入框。',
      },
      400
    );
  const credentials = readTreeAICredentials(
    request.headers,
    input.credentialMode
  );
  if (!credentials)
    return json(
      {
        code: 'INVALID_AI_CREDENTIALS',
        error: '密钥来源或 API Key 格式无效，请重新选择并填写。未创建副本。',
      },
      400
    );
  if (credentials.mode === 'site' && !process.env.DEEPSEEK_API_KEY)
    return json(
      { error: '站点尚未配置 DeepSeek，可以改用自己的 API Key。未创建副本。' },
      503
    );
  const limited = requireRequestBudget(
    'whiteboard-tree-draft',
    session.user.id,
    6
  );
  if (limited) return limited;
  try {
    const settings = await generateTreeDraft(input, credentials);
    if (!settings)
      return json(
        {
          error:
            '暂时只能修改路长和间距，必须正好分成 2～10 段。请换个说法，未创建副本。',
        },
        422
      );
    if (
      settings.road === input.base.road &&
      settings.spacing === input.base.spacing
    )
      return json({ error: '路长和间距没有变化，请说明想改成多少米。' }, 422);
    return json({ settings });
  } catch (cause) {
    const { code, error, status } = treeDraftFailure(cause, credentials.mode);
    return json({ code, error }, status);
  }
}
