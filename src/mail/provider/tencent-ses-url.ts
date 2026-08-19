const TENCENT_SES_TEMPLATE_ORIGIN = 'https://www.dlgzz.com';

export type TencentSesAuthTemplate = 'forgotPassword' | 'verifyEmail';

function getSingleParameter(url: URL, name: string): string | undefined {
  const values = url.searchParams.getAll(name);

  if (values.length > 1) {
    throw new Error(`Tencent SES authentication URL has duplicate ${name}.`);
  }

  return values[0];
}

function validateCallbackUrl(url: URL): void {
  const callbackUrl = getSingleParameter(url, 'callbackURL');

  if (callbackUrl === undefined) return;

  if (
    callbackUrl.trim() === '' ||
    callbackUrl.startsWith('//') ||
    callbackUrl.startsWith('\\')
  ) {
    throw new Error('Tencent SES callbackURL is unsafe.');
  }

  const parsedCallback = new URL(
    callbackUrl,
    `${TENCENT_SES_TEMPLATE_ORIGIN}/`
  );
  if (
    parsedCallback.origin !== TENCENT_SES_TEMPLATE_ORIGIN ||
    parsedCallback.username ||
    parsedCallback.password
  ) {
    throw new Error('Tencent SES callbackURL must stay on www.dlgzz.com.');
  }
}

function validateResetPasswordUrl(url: URL): void {
  const match = /^\/api\/auth\/reset-password\/([^/]+)$/.exec(url.pathname);
  if (!match) {
    throw new Error(
      'Tencent SES forgotPassword URL must contain its token in the reset-password path.'
    );
  }

  let token: string;
  try {
    token = decodeURIComponent(match[1]);
  } catch {
    throw new Error('Tencent SES forgotPassword token is malformed.');
  }

  if (!token || token.includes('/') || token.includes('\\')) {
    throw new Error('Tencent SES forgotPassword token is malformed.');
  }
}

function validateVerifyEmailUrl(url: URL): void {
  if (url.pathname !== '/api/auth/verify-email') {
    throw new Error(
      'Tencent SES verifyEmail URL must use the verify-email endpoint.'
    );
  }

  const token = getSingleParameter(url, 'token');
  if (!token || token.trim() === '') {
    throw new Error(
      'Tencent SES verifyEmail URL must contain its token in the query string.'
    );
  }
}

/**
 * Tencent SES templates pin the public origin in the reviewed template:
 * `https://www.dlgzz.com/{{url}}`.
 *
 * Only the path, query, and hash may be sent as `url`. The leading slash is
 * deliberately removed because the reviewed template already supplies it.
 */
export function getTencentSesTemplateUrlValue(
  value: unknown,
  template: TencentSesAuthTemplate
): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('Tencent SES template URL is missing.');
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Tencent SES template URL must be an absolute URL.');
  }

  if (
    url.origin !== TENCENT_SES_TEMPLATE_ORIGIN ||
    url.username ||
    url.password
  ) {
    throw new Error('Tencent SES template URL must use https://www.dlgzz.com.');
  }

  if (template === 'forgotPassword') {
    validateResetPasswordUrl(url);
  } else {
    validateVerifyEmailUrl(url);
  }
  validateCallbackUrl(url);

  return `${url.pathname.slice(1)}${url.search}${url.hash}`;
}
