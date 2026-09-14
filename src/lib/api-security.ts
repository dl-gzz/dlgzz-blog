import 'server-only';

import { NextResponse } from 'next/server';
import { canAccessHermesAdmin } from './hermes-admin-access';
import { getLocalClientOrigin } from './local-client-origin';
import { getSession } from './server';
import { getBaseUrl } from './urls/urls';

export class RequestBodyTooLargeError extends Error {
  constructor() {
    super('request body too large');
    this.name = 'RequestBodyTooLargeError';
  }
}

export class RequestBodyReadTimeoutError extends Error {
  constructor() {
    super('request body read timed out');
    this.name = 'RequestBodyReadTimeoutError';
  }
}

/** Read JSON without allowing chunked requests to bypass the size limit. */
export async function readBoundedJson(
  request: Request,
  maxBytes: number,
  timeoutMs = 5_000
): Promise<unknown> {
  if (!request.body) throw new SyntaxError('empty request body');
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let bytes = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = Date.now() + timeoutMs;

  try {
    while (true) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new RequestBodyReadTimeoutError();
      const next = await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new RequestBodyReadTimeoutError()),
            remaining
          );
        }),
      ]);
      if (timer) clearTimeout(timer);
      timer = undefined;
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > maxBytes) throw new RequestBodyTooLargeError();
      chunks.push(decoder.decode(next.value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return JSON.parse(chunks.join(''));
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
    reader.releaseLock();
  }
}

type Session = NonNullable<Awaited<ReturnType<typeof getSession>>>;

export async function requireSession(message = '请先登录') {
  const session = await getSession();

  if (!session?.user?.id) {
    return {
      response: NextResponse.json(
        {
          success: false,
          code: 'UNAUTHORIZED',
          error: message,
        },
        { status: 401 }
      ),
    } as const;
  }

  return { session: session as Session } as const;
}

export async function requireHermesAdmin(message = '这个接口只允许管理员访问') {
  const auth = await requireSession('请先登录后再访问管理员接口');
  if ('response' in auth) return auth;

  if (!canAccessHermesAdmin(auth.session.user)) {
    return {
      response: NextResponse.json(
        {
          success: false,
          code: 'FORBIDDEN',
          error: message,
        },
        { status: 403 }
      ),
    } as const;
  }

  return { session: auth.session } as const;
}

/**
 * Cookie-authenticated mutation endpoints must not be callable cross-origin.
 * Requests without an Origin header are kept compatible with CLI/server clients;
 * browser requests are restricted to the configured app and local client origin.
 */
export function requireSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return null;

  let normalizedOrigin: string;
  try {
    normalizedOrigin = new URL(origin).origin;
  } catch {
    return NextResponse.json(
      { success: false, code: 'CSRF_BLOCKED', error: '请求来源无效' },
      { status: 403 }
    );
  }

  const allowedOrigins = new Set<string>();
  for (const candidate of [getBaseUrl(), getLocalClientOrigin()]) {
    try {
      allowedOrigins.add(new URL(candidate).origin);
    } catch {
      // Ignore malformed optional configuration.
    }
  }

  if (!allowedOrigins.has(normalizedOrigin)) {
    return NextResponse.json(
      { success: false, code: 'CSRF_BLOCKED', error: '请求来源不受信任' },
      { status: 403 }
    );
  }

  return null;
}
