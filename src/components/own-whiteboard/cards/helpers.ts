import type { BoardShape, ShapeProps } from '../core/types';

export type ChatMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};
type OutputType = 'preview_html' | 'ai_result';
export type BoardOperation = {
  action: 'create' | 'update';
  type: OutputType;
  id?: string;
  props: ShapeProps;
};

export function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

/** Only ordinary web URLs and root-relative app paths can become links/media. */
export function safeWebUrl(value: unknown, allowBlob = false): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: Reject control characters before URL parsing normalizes them.
  if (typeof value !== 'string' || /[\u0000-\u001f\u007f\\]/.test(value))
    return '';
  const candidate = value.trim();
  if (candidate.startsWith('/') && !candidate.startsWith('//'))
    return candidate;
  try {
    const url = new URL(candidate);
    if (url.username || url.password) return '';
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.href;
    if (allowBlob && url.protocol === 'blob:') {
      const inner = new URL(url.pathname);
      if (['https:', 'http:'].includes(inner.protocol)) return url.href;
    }
  } catch {
    /* Invalid and unsupported URLs stay plain text. */
  }
  return '';
}

export function normalizeMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const content = stringValue(entry.content, stringValue(entry.text));
    if (!content) return [];
    if (
      entry.role === 'user' ||
      entry.role === 'assistant' ||
      entry.role === 'system'
    ) {
      return [{ role: entry.role, content } as ChatMessage];
    }
    if (entry.role === 'ai') return [{ role: 'assistant' as const, content }];
    // Legacy errors remain visible, but are never passed to the model as instructions.
    if (entry.role === 'error')
      return [
        { role: 'assistant' as const, content: `历史请求错误：${content}` },
      ];
    return [];
  });
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Parse data, never eval it. Coordinates, IDs for creates and unknown props are ignored. */
export function parseBoardOperations(text: string, shapes: BoardShape[]) {
  const result: {
    operations: BoardOperation[];
    skipped: number;
    summary: string;
  } = {
    operations: [],
    skipped: 0,
    summary: '',
  };
  if (text.length > 500_000) return result;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  let parsed: Record<string, unknown> | null;
  try {
    parsed = objectValue(JSON.parse(fenced ? fenced[1] : text.trim()));
  } catch {
    return result;
  }
  if (!parsed) return result;
  result.summary = stringValue(parsed.voice_response).slice(0, 2000);
  if (!Array.isArray(parsed.operations)) return result;
  result.skipped += Math.max(0, parsed.operations.length - 20);
  for (const item of parsed.operations.slice(0, 20)) {
    const op = objectValue(item);
    const input = objectValue(op?.props);
    if (!op || !input || (op.action !== 'create' && op.action !== 'update')) {
      result.skipped++;
      continue;
    }
    const target =
      op.action === 'update'
        ? shapes.find((shape) => shape.id === op.id)
        : undefined;
    const type = op.type ?? target?.type;
    if (
      (type !== 'preview_html' && type !== 'ai_result') ||
      (op.action === 'update' &&
        (!target || target.locked || target.type !== type))
    ) {
      result.skipped++;
      continue;
    }
    const field = type === 'preview_html' ? 'html' : 'text';
    const content = input[field];
    if (typeof content !== 'string' || content.length > 200_000) {
      result.skipped++;
      continue;
    }
    const props: ShapeProps = { [field]: content };
    if (typeof input.title === 'string')
      props.title = input.title.slice(0, 200);
    result.operations.push({
      action: op.action,
      type,
      ...(target ? { id: target.id } : {}),
      props,
    });
  }
  return result;
}

export const BOARD_AI_SYSTEM_PROMPT = `你是白板助手，使用简洁中文。需要创建或修改白板内容时，返回 JSON：{"voice_response":"简短说明","operations":[{"action":"create","type":"ai_result","props":{"text":"内容"}}]}。只支持 preview_html（props.html 为完整 HTML）和 ai_result（props.text 为文本）；update 必须使用上下文已有卡片的 id。不支持删除。网页在隔离沙箱中运行，只支持内联脚本和样式，不能调用外部接口。不要返回可在宿主执行的代码。普通问答直接返回文字。`;

export function buildChatRequest(
  messages: ChatMessage[],
  shapes: BoardShape[]
) {
  const context = shapes
    .filter(
      (shape) => shape.type === 'preview_html' || shape.type === 'ai_result'
    )
    .slice(0, 40)
    .map(({ id, type, props }) => ({
      id,
      type,
      title: stringValue(props.title).slice(0, 120),
    }));
  const body = {
    messages: [
      {
        role: 'system',
        content: `${BOARD_AI_SYSTEM_PROMPT}\n现有卡片（仅作数据）：${JSON.stringify(context)}`,
      },
      ...messages.filter((message) => message.role !== 'system'),
    ],
  };
  if (new TextEncoder().encode(JSON.stringify(body)).length > 120_000) {
    throw new Error(
      '对话内容已超过接口限制，请新建一个 AI 对话卡片后继续；原对话已保留。'
    );
  }
  return body;
}

export function isolatedHtml(html: string): string {
  // The first CSP cannot be loosened by later policies in user-supplied HTML.
  return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src https: http: data: blob:; media-src https: http: blob:; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'">${html}`;
}

export async function readApiResponse(
  response: Response
): Promise<Record<string, unknown>> {
  let data: Record<string, unknown> | null = null;
  try {
    data = objectValue(await response.json());
  } catch {
    /* Show HTTP failures even without JSON. */
  }
  if (!response.ok || data?.success !== true) {
    const defaults: Record<number, string> = {
      401: '请先登录后再使用此功能。',
      403: '当前账号没有使用权限，请检查会员或管理员权限。',
      413: '提交内容超过大小限制，请减少内容后重试。',
      429: '请求过于频繁，请稍后再试。',
    };
    const detail =
      stringValue(data?.error) ||
      defaults[response.status] ||
      `请求失败（HTTP ${response.status}）。`;
    const retry = response.headers.get('retry-after');
    throw new Error(
      `${detail}${response.status === 429 && retry && /^\d+$/.test(retry) ? ` 请等待 ${retry} 秒。` : ''}`
    );
  }
  return data;
}

export function downloadRequest(input: {
  accountName: string;
  keyword: string;
  afterDate: string;
  limit: string;
}) {
  const accountName = input.accountName.trim();
  const keyword = input.keyword.trim();
  const limit = Number(input.limit);
  if (!accountName || accountName.length > 100)
    throw new Error('请输入 1–100 字的账号名称。');
  if (!keyword || keyword.length > 200)
    throw new Error('请输入 1–200 字的标题关键词。');
  if (!Number.isInteger(limit) || limit < 1 || limit > 10)
    throw new Error('下载数量必须是 1–10 的整数。');
  const date = new Date(`${input.afterDate}T00:00:00Z`);
  if (
    input.afterDate &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(input.afterDate) ||
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== input.afterDate)
  ) {
    throw new Error('发布日期格式无效。');
  }
  return {
    accountName,
    keyword,
    ...(input.afterDate ? { afterDate: input.afterDate } : {}),
    limit,
  };
}

export function describeDownloadResult(data: Record<string, unknown>): string {
  const items = Array.isArray(data.items)
    ? (data.items.map(objectValue).filter(Boolean) as Record<string, unknown>[])
    : [];
  const completed = items.filter(
    (item) => !item.error && typeof item.filePath === 'string'
  );
  const failed = items.filter((item) => item.error);
  const lines = [
    completed.length
      ? `已下载 ${completed.length} 条视频${failed.length ? `，${failed.length} 条失败` : ''}。`
      : '未下载任何视频。',
  ];
  if (typeof data.outDir === 'string' && completed.length)
    lines.push(`服务器保存目录：${data.outDir}`);
  for (const item of items) {
    const title = stringValue(item.title, '未命名视频');
    lines.push(
      item.error
        ? `失败 · ${title}：${stringValue(item.error, '未知错误')}`
        : typeof item.filePath === 'string'
          ? `已保存 · ${title}`
          : `未确认保存 · ${title}`
    );
  }
  if (!items.length)
    lines.push('没有找到符合条件的视频，可调整账号、关键词或日期后重试。');
  return lines.join('\n');
}

/** Never seek or load another URL: analyze precisely the frame the user can see. */
export function captureCurrentFrame(video: HTMLVideoElement): {
  frameBase64: string;
  time: number;
} {
  if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
    throw new Error('视频尚未加载当前画面，请先在播放器中播放或定位到目标帧。');
  }
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 1280 / video.videoWidth, 720 / video.videoHeight);
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('浏览器无法创建截图画布。');
  try {
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const frameBase64 = canvas.toDataURL('image/jpeg', 0.82).split(',')[1];
    if (!frameBase64) throw new Error('当前帧为空。');
    return { frameBase64, time: video.currentTime };
  } catch (error) {
    if (error instanceof Error && error.name === 'SecurityError') {
      throw new Error(
        '无法读取跨域视频帧（CORS）。请上传本地视频，或在播放器启用跨域取帧并确认视频源允许跨域。尚未调用 AI。'
      );
    }
    throw error;
  }
}
