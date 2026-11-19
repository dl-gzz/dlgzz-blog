import 'server-only';

import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { NextResponse } from 'next/server';

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 20_000;

// This is a bounded, single-process defense. Multi-replica deployments also
// need a shared Redis/edge limiter; process restarts reset these counters.
export function reserveRequest(
  namespace: string,
  subject: string,
  limit: number,
  windowMs: number,
  now = Date.now()
) {
  const digest = createHash('sha256').update(subject).digest('hex');
  let key = `${namespace}:${digest}`;
  if (buckets.size >= MAX_BUCKETS && !buckets.has(key)) {
    for (const [k, value] of buckets) {
      if (value.resetAt <= now) buckets.delete(k);
    }
    if (buckets.size >= MAX_BUCKETS) key = `${namespace}:overflow`;
  }
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  return {
    allowed: bucket.count <= limit,
    retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

export function trustedClientAddress(request: Request) {
  // Production nginx overwrites X-Real-IP. Never use client-controlled XFF.
  const address = request.headers.get('x-real-ip') || '';
  return isIP(address) ? address : 'unknown';
}

export function requireRequestBudget(
  namespace: string,
  subject: string,
  limit: number,
  windowMs = 60_000
) {
  const result = reserveRequest(namespace, subject, limit, windowMs);
  return result.allowed
    ? null
    : NextResponse.json(
        {
          success: false,
          code: 'RATE_LIMITED',
          error: '操作太频繁，请稍后再试',
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(result.retryAfter),
            'Cache-Control': 'no-store',
          },
        }
      );
}
