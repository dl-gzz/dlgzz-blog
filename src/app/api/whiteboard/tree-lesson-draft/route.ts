import { NextResponse } from 'next/server';
import {
  generateTreeDraft,
  parseTreeDraftRequest,
} from '@/lib/ai/tree-lesson-draft';
import {
  bodyErrorResponse,
  readBoundedJson,
  requireSameOrigin,
  requireSession,
} from '@/lib/api-security';
import { userHasPremiumAccess } from '@/lib/premium-access';
import { requireRequestBudget } from '@/lib/request-rate-limit';

export const maxDuration = 60;
const json = (value: unknown, status = 200) =>
  NextResponse.json(value, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  });

export async function POST(request: Request) {
  const blocked = requireSameOrigin(request);
  if (blocked) return blocked;
  const auth = await requireSession('请先登录，再用 AI 准备课件副本');
  if ('response' in auth) return auth.response;
  if (!(await userHasPremiumAccess(auth.session.user.id)))
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
  if (!process.env.DEEPSEEK_API_KEY)
    return json({ error: '服务器尚未配置 DeepSeek，未创建副本。' }, 503);
  const limited = requireRequestBudget(
    'whiteboard-tree-draft',
    auth.session.user.id,
    6
  );
  if (limited) return limited;
  try {
    const settings = await generateTreeDraft(input);
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
  } catch {
    return json({ error: 'DeepSeek 暂时没有返回可用结果，未创建副本。' }, 502);
  }
}
