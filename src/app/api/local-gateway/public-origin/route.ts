import { NextRequest, NextResponse } from 'next/server';
import os from 'node:os';

export const runtime = 'nodejs';

function stripPort(host: string) {
  return host.replace(/^\[/, '').replace(/\]$/, '').split(':')[0];
}

function isLocalHost(host: string) {
  const normalized = host.toLowerCase();
  return (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '0.0.0.0' ||
    normalized === '::1'
  );
}

function findLanHost() {
  const interfaces = os.networkInterfaces();
  for (const addresses of Object.values(interfaces)) {
    for (const address of addresses || []) {
      if (address.family === 'IPv4' && !address.internal) {
        return address.address;
      }
    }
  }
  return '';
}

export async function GET(request: NextRequest) {
  const configuredHost = process.env.LOCAL_GATEWAY_PUBLIC_HOST?.trim() || '';
  const requestHost = stripPort(request.headers.get('host') || request.nextUrl.host || '');
  const port =
    process.env.LOCAL_GATEWAY_PORT?.trim() ||
    request.nextUrl.port ||
    request.headers.get('x-forwarded-port') ||
    '19527';
  const protocol =
    request.headers.get('x-forwarded-proto') ||
    request.nextUrl.protocol.replace(':', '') ||
    'http';

  const host =
    configuredHost && !isLocalHost(configuredHost)
      ? configuredHost
      : findLanHost() || requestHost || '127.0.0.1';

  return NextResponse.json({
    success: true,
    origin: `${protocol}://${host}:${port}`,
    host,
    port,
  });
}
