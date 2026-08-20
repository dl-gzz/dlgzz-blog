import { getSessionCookie } from 'better-auth/cookies';
import createMiddleware from 'next-intl/middleware';
import { type NextRequest, NextResponse } from 'next/server';
import { LOCALES, routing } from './i18n/routing';
import {
  DEFAULT_LOGIN_REDIRECT,
  protectedRoutes,
  routesNotAllowedByLoggedInUsers,
} from './routes';

const intlMiddleware = createMiddleware(routing);
const CANONICAL_HOSTNAME = 'www.dlgzz.com';
const LEGACY_HOSTNAME = 'dlgzz.com';

/**
 * 1. Next.js middleware
 * https://nextjs.org/docs/app/building-your-application/routing/middleware
 *
 * 2. Better Auth middleware
 * https://www.better-auth.com/docs/integrations/next#middleware
 *
 * In Next.js middleware, it's recommended to only check for the existence of a session cookie
 * to handle redirection. To avoid blocking requests by making API or database calls.
 */
export default async function middleware(req: NextRequest) {
  const { nextUrl } = req;

  // Keep browser navigation, Better Auth, and its host-only session cookie on
  // one origin. API, OAuth, MCP, and static asset routes are excluded by the
  // matcher below so existing payment and integration callbacks are unchanged.
  if (getRequestHostname(req) === LEGACY_HOSTNAME) {
    const canonicalUrl = nextUrl.clone();
    canonicalUrl.protocol = 'https:';
    canonicalUrl.hostname = CANONICAL_HOSTNAME;
    canonicalUrl.port = '';
    return NextResponse.redirect(canonicalUrl, 308);
  }

  // Middleware only performs an optimistic cookie check for redirects. API routes
  // and server components must still validate the full session and permissions.
  // Avoid making a server-side request here: deriving its destination from
  // forwarded host headers can turn an untrusted request into SSRF/cookie leakage.
  const isLoggedIn = Boolean(getSessionCookie(req));

  // Get the pathname of the request (e.g. /zh/dashboard to /dashboard)
  const pathnameWithoutLocale = getPathnameWithoutLocale(
    nextUrl.pathname,
    LOCALES
  );

  // If the route can not be accessed by logged in users, redirect if the user is logged in
  if (isLoggedIn) {
    const isNotAllowedRoute = routesNotAllowedByLoggedInUsers.some((route) =>
      new RegExp(`^${route}$`).test(pathnameWithoutLocale)
    );
    if (isNotAllowedRoute) {
      return NextResponse.redirect(new URL(DEFAULT_LOGIN_REDIRECT, nextUrl));
    }
  }

  const isProtectedRoute = protectedRoutes.some((route) =>
    new RegExp(`^${route}$`).test(pathnameWithoutLocale)
  );

  // If the route is a protected route, redirect to login if user is not logged in
  if (!isLoggedIn && isProtectedRoute) {
    let callbackUrl = nextUrl.pathname;
    if (nextUrl.search) {
      callbackUrl += nextUrl.search;
    }
    const encodedCallbackUrl = encodeURIComponent(callbackUrl);
    return NextResponse.redirect(
      new URL(`/auth/login?callbackUrl=${encodedCallbackUrl}`, nextUrl)
    );
  }

  // Apply intlMiddleware for all routes
  return intlMiddleware(req);
}

function getRequestHostname(req: NextRequest): string {
  const forwardedHost = req.headers.get('x-forwarded-host')?.split(',')[0];
  const host = forwardedHost ?? req.headers.get('host') ?? '';

  return host.trim().toLowerCase().replace(/:\d+$/, '');
}

/**
 * Get the pathname of the request (e.g. /zh/dashboard to /dashboard)
 */
function getPathnameWithoutLocale(pathname: string, locales: string[]): string {
  const localePattern = new RegExp(`^/(${locales.join('|')})/`);
  return pathname.replace(localePattern, '/');
}

/**
 * Next.js internationalized routing
 * specify the routes the middleware applies to
 *
 * https://next-intl.dev/docs/routing#base-path
 */
export const config = {
  // The `matcher` is relative to the `basePath`
  matcher: [
    // Match all pathnames except for
    // - if they start with `/api`, `/_next` or `/_vercel`
    // - if they contain a dot (e.g. `favicon.ico`)
    // Protocol endpoints must keep their canonical, non-localized URLs.
    // Rewriting /mcp or /oauth/* through next-intl breaks OAuth issuer/resource
    // matching and makes PKCE callbacks fail across clients.
    '/((?!api|mcp|oauth|_next|_vercel|.*\\..*).*)',
  ],
};
