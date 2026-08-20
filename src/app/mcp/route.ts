import {
  ONEWORK_MCP_MAX_BODY_BYTES,
  handleOneWorkMcpMessage,
  isSupportedOneWorkMcpProtocolVersion,
  oneWorkMcpRpcError,
} from '@/lib/onework-mcp';
import {
  getOneWorkOAuthIssuer,
  getOneWorkOAuthResource,
  verifyOneWorkOAuthAccessToken,
} from '@/lib/onework-oauth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

class PayloadTooLargeError extends Error {}
class RequestReadTimeoutError extends Error {}
class AuthorizationTimeoutError extends Error {}

function jsonRpcResponse(body: unknown, status: number, headers?: HeadersInit) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      ...headers,
    },
  });
}

function httpError(
  code: number,
  message: string,
  status: number,
  data?: Record<string, unknown>,
  headers?: HeadersInit
) {
  return jsonRpcResponse(
    oneWorkMcpRpcError(null, code, message, data),
    status,
    headers
  );
}

function allowedOrigins() {
  return new Set(
    (process.env.ONEWORK_MCP_ALLOWED_ORIGINS || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  );
}

function isOriginAllowed(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return (
      new URL(request.url).origin === origin || allowedOrigins().has(origin)
    );
  } catch {
    return false;
  }
}

function acceptsJson(request: Request) {
  const accept = request.headers.get('accept');
  if (!accept || accept.trim() === '*/*') return true;
  return accept
    .split(',')
    .some((value) => value.trim().toLowerCase().startsWith('application/json'));
}

function acceptsEventStream(request: Request) {
  return (request.headers.get('accept') || '')
    .split(',')
    .some((value) =>
      value.trim().toLowerCase().startsWith('text/event-stream')
    );
}

async function readBoundedJson(request: Request): Promise<unknown> {
  if (!request.body) throw new SyntaxError('empty request body');
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let bytes = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = Date.now() + 5_000;

  try {
    while (true) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new RequestReadTimeoutError('request read timed out');
      }
      const next = await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new RequestReadTimeoutError('request read timed out')),
            remaining
          );
        }),
      ]);
      if (timer) clearTimeout(timer);
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > ONEWORK_MCP_MAX_BODY_BYTES) {
        throw new PayloadTooLargeError('payload too large');
      }
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

function authStatus(reason: string) {
  return reason === 'missing' ||
    reason === 'invalid' ||
    reason === 'expired' ||
    reason === 'revoked' ||
    reason === 'replaced'
    ? 401
    : 403;
}

function authChallenge(error = 'invalid_token', scope?: string) {
  const metadataUrl = `${getOneWorkOAuthIssuer()}/.well-known/oauth-protected-resource`;
  return `Bearer resource_metadata="${metadataUrl}", error="${error}"${
    scope ? `, scope="${scope}"` : ''
  }`;
}

function streamResponse(body: unknown, status: number, headers?: HeadersInit) {
  return new Response(`event: message\ndata: ${JSON.stringify(body)}\n\n`, {
    status,
    headers: {
      'Cache-Control': 'no-store, no-transform',
      Connection: 'keep-alive',
      'Content-Type': 'text/event-stream; charset=utf-8',
      ...headers,
    },
  });
}

async function verifyAuthorization(authorization: string | null) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      verifyOneWorkOAuthAccessToken(authorization),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new AuthorizationTimeoutError()),
          5_000
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function POST(request: Request) {
  if (!isOriginAllowed(request)) {
    return httpError(-32003, 'Origin is not allowed', 403);
  }

  const contentType = (request.headers.get('content-type') || '')
    .split(';', 1)[0]
    .trim()
    .toLowerCase();
  if (contentType !== 'application/json') {
    return httpError(-32600, 'Content-Type must be application/json', 415);
  }
  if (!acceptsJson(request) && !acceptsEventStream(request)) {
    return httpError(
      -32600,
      'Accept must include application/json or text/event-stream',
      406
    );
  }

  const protocolVersion =
    request.headers.get('mcp-protocol-version')?.trim() || '2025-03-26';
  if (!isSupportedOneWorkMcpProtocolVersion(protocolVersion)) {
    return httpError(-32600, 'Unsupported MCP-Protocol-Version', 400, {
      protocolVersion,
    });
  }

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (
    Number.isFinite(contentLength) &&
    contentLength > ONEWORK_MCP_MAX_BODY_BYTES
  ) {
    return httpError(-32000, 'Request body is too large', 413);
  }

  let verified: Awaited<ReturnType<typeof verifyOneWorkOAuthAccessToken>>;
  try {
    verified = await verifyAuthorization(request.headers.get('authorization'));
  } catch (error) {
    if (error instanceof AuthorizationTimeoutError) {
      return httpError(-32603, 'Authorization service timed out', 504);
    }
    console.error('[mcp] OAuth verification unavailable', error);
    return httpError(-32603, 'Authorization service unavailable', 503);
  }
  if (!verified.ok) {
    return httpError(
      -32001,
      'OAuth access token rejected',
      authStatus(verified.reason),
      {
        reason: verified.reason,
      },
      {
        'WWW-Authenticate': authChallenge(),
      }
    );
  }
  if (verified.principal.resource !== getOneWorkOAuthResource()) {
    return httpError(-32001, 'OAuth token resource mismatch', 401, undefined, {
      'WWW-Authenticate': authChallenge(),
    });
  }

  let body: unknown;
  try {
    body = await readBoundedJson(request);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return httpError(-32000, 'Request body is too large', 413);
    }
    if (error instanceof RequestReadTimeoutError) {
      return httpError(-32000, 'Request body read timed out', 408);
    }
    return httpError(-32700, 'Parse error', 400);
  }

  const result = await handleOneWorkMcpMessage(body, verified.principal);
  if (!result.response) {
    return new Response(null, {
      status: result.status,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
  const responseHeaders: HeadersInit = {};
  if (
    result.status === 403 &&
    'error' in result.response &&
    result.response.error.code === -32003
  ) {
    const requiredScope = result.response.error.data?.requiredScope;
    responseHeaders['WWW-Authenticate'] = authChallenge(
      'insufficient_scope',
      typeof requiredScope === 'string' ? requiredScope : undefined
    );
  }
  if (!acceptsJson(request) && acceptsEventStream(request)) {
    return streamResponse(result.response, result.status, responseHeaders);
  }
  return jsonRpcResponse(result.response, result.status, responseHeaders);
}

export function GET() {
  return httpError(
    -32600,
    'This stateless MCP endpoint accepts JSON-RPC via POST',
    405,
    undefined,
    { Allow: 'POST, OPTIONS' }
  );
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      Allow: 'POST, OPTIONS',
      'Cache-Control': 'no-store',
    },
  });
}
