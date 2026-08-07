import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { canAccessHermesAdmin } from './hermes-admin-access';
import { getSession } from './server';

const TOKEN_VERSION = 'sat1';
const DEFAULT_TTL_SECONDS = 24 * 60 * 60;
const MIN_TTL_SECONDS = 5 * 60;
const MAX_TTL_SECONDS = 7 * 24 * 60 * 60;

type StudentAccessPayload = {
  v: 1;
  studentId: string;
  iat: number;
  exp: number;
};

type VerificationResult =
  | { valid: true; payload: StudentAccessPayload }
  | { valid: false; reason: 'invalid' | 'expired' | 'student_mismatch' };

export class StudentAccessConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StudentAccessConfigurationError';
  }
}

function getSecret() {
  const secret =
    process.env.LEARNING_ASSISTANT_STUDENT_ACCESS_SECRET?.trim() || '';

  if (Buffer.byteLength(secret, 'utf8') < 32) {
    throw new StudentAccessConfigurationError(
      'LEARNING_ASSISTANT_STUDENT_ACCESS_SECRET must contain at least 32 bytes'
    );
  }

  return secret;
}

function getTtlSeconds() {
  const raw = process.env.LEARNING_ASSISTANT_STUDENT_ACCESS_TTL_SECONDS?.trim();
  if (!raw) return DEFAULT_TTL_SECONDS;

  const ttl = Number(raw);
  if (
    !Number.isSafeInteger(ttl) ||
    ttl < MIN_TTL_SECONDS ||
    ttl > MAX_TTL_SECONDS
  ) {
    throw new StudentAccessConfigurationError(
      `LEARNING_ASSISTANT_STUDENT_ACCESS_TTL_SECONDS must be an integer between ${MIN_TTL_SECONDS} and ${MAX_TTL_SECONDS}`
    );
  }

  return ttl;
}

function sign(value: string, secret: string) {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

function signaturesMatch(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');

  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

function isStudentAccessPayload(value: unknown): value is StudentAccessPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;

  const payload = value as Partial<StudentAccessPayload>;
  return (
    payload.v === 1 &&
    typeof payload.studentId === 'string' &&
    Boolean(payload.studentId) &&
    Number.isSafeInteger(payload.iat) &&
    Number.isSafeInteger(payload.exp) &&
    Number(payload.exp) > Number(payload.iat)
  );
}

export function issueStudentAccessToken(studentId: string) {
  const normalizedStudentId = studentId.trim();
  if (!normalizedStudentId) {
    throw new Error('studentId is required');
  }

  const now = Math.floor(Date.now() / 1000);
  const payload: StudentAccessPayload = {
    v: 1,
    studentId: normalizedStudentId,
    iat: now,
    exp: now + getTtlSeconds(),
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    'base64url'
  );
  const signedValue = `${TOKEN_VERSION}.${encodedPayload}`;

  return {
    token: `${signedValue}.${sign(signedValue, getSecret())}`,
    expiresAt: new Date(payload.exp * 1000).toISOString(),
  };
}

export function verifyStudentAccessToken(
  token: string,
  expectedStudentId: string
): VerificationResult {
  const secret = getSecret();
  const parts = token.split('.');
  if (token.length > 4096 || parts.length !== 3 || parts[0] !== TOKEN_VERSION) {
    return { valid: false, reason: 'invalid' };
  }

  const [version, encodedPayload, signature] = parts;
  const signedValue = `${version}.${encodedPayload}`;
  const expectedSignature = sign(signedValue, secret);
  if (!signaturesMatch(signature, expectedSignature)) {
    return { valid: false, reason: 'invalid' };
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8')
    ) as unknown;
    if (!isStudentAccessPayload(payload)) {
      return { valid: false, reason: 'invalid' };
    }

    if (Math.floor(Date.now() / 1000) >= payload.exp) {
      return { valid: false, reason: 'expired' };
    }

    if (payload.studentId !== expectedStudentId.trim()) {
      return { valid: false, reason: 'student_mismatch' };
    }

    return { valid: true, payload };
  } catch {
    return { valid: false, reason: 'invalid' };
  }
}

function readBearerToken(request: Request) {
  const authorization = request.headers.get('authorization')?.trim() || '';
  if (!authorization) return { provided: false, token: '' };

  const match = /^Bearer\s+(\S+)$/i.exec(authorization);
  return { provided: true, token: match?.[1] || '' };
}

export async function requireStudentAccess(
  request: Request,
  studentId: string
) {
  const bearer = readBearerToken(request);
  let verification: VerificationResult = {
    valid: false,
    reason: 'invalid',
  };
  let configurationError: StudentAccessConfigurationError | null = null;

  if (bearer.provided) {
    try {
      verification = verifyStudentAccessToken(bearer.token, studentId);
      if (verification.valid) {
        return { access: 'student-token' as const };
      }
    } catch (error) {
      if (error instanceof StudentAccessConfigurationError) {
        configurationError = error;
      } else {
        throw error;
      }
    }
  }

  const session = await getSession();
  if (canAccessHermesAdmin(session?.user)) {
    return { access: 'admin-session' as const };
  }

  if (configurationError) {
    return {
      response: NextResponse.json(
        {
          success: false,
          code: 'STUDENT_ACCESS_NOT_CONFIGURED',
          error: '学生访问令牌服务未配置，请联系管理员',
        },
        { status: 503 }
      ),
    } as const;
  }

  const expired = !verification.valid && verification.reason === 'expired';
  return {
    response: NextResponse.json(
      {
        success: false,
        code: expired
          ? 'STUDENT_ACCESS_TOKEN_EXPIRED'
          : bearer.provided
            ? 'STUDENT_ACCESS_TOKEN_INVALID'
            : 'STUDENT_ACCESS_TOKEN_REQUIRED',
        error: expired
          ? '学生访问链接已过期，请联系管理员重新生成'
          : bearer.provided
            ? '学生访问令牌无效'
            : '缺少学生访问令牌，请使用管理员生成的学生白板链接',
      },
      { status: 401 }
    ),
  } as const;
}
