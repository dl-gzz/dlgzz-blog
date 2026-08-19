import assert from 'node:assert/strict';
import test from 'node:test';
import { getTencentSesTemplateUrlValue } from '../src/mail/provider/tencent-ses-url';

const resetToken = 'uFXc2bN9rY7pQ4wD6sK8mV3a';
const verificationToken =
  'eyJhbGciOiJIUzI1NiJ9.eyJlbWFpbCI6InVzZXJAZXhhbXBsZS5jb20ifQ.signature';

test('accepts the Better Auth 1.1.19 reset-password URL shape', () => {
  assert.equal(
    getTencentSesTemplateUrlValue(
      `https://www.dlgzz.com/api/auth/reset-password/${resetToken}?callbackURL=%2Fzh%2Fauth%2Freset-password#form`,
      'forgotPassword'
    ),
    `api/auth/reset-password/${resetToken}?callbackURL=%2Fzh%2Fauth%2Freset-password#form`
  );
});

test('accepts the Better Auth 1.1.19 verify-email URL shape', () => {
  assert.equal(
    getTencentSesTemplateUrlValue(
      `https://www.dlgzz.com/api/auth/verify-email?token=${verificationToken}&callbackURL=%2Fdashboard#done`,
      'verifyEmail'
    ),
    `api/auth/verify-email?token=${verificationToken}&callbackURL=%2Fdashboard#done`
  );
});

test('rejects relative and foreign-origin authentication URLs', () => {
  assert.throws(
    () =>
      getTencentSesTemplateUrlValue(
        `/api/auth/reset-password/${resetToken}?callbackURL=%2Fauth%2Freset-password`,
        'forgotPassword'
      ),
    /absolute URL/
  );
  assert.throws(
    () =>
      getTencentSesTemplateUrlValue(
        `https://example.com/api/auth/reset-password/${resetToken}?callbackURL=%2Fauth%2Freset-password`,
        'forgotPassword'
      ),
    /must use https:\/\/www\.dlgzz\.com/
  );
});

test('requires the reset token in the reset-password path', () => {
  assert.throws(
    () =>
      getTencentSesTemplateUrlValue(
        `https://www.dlgzz.com/api/auth/reset-password?token=${resetToken}&callbackURL=%2Fauth%2Freset-password`,
        'forgotPassword'
      ),
    /token in the reset-password path/
  );
  assert.throws(
    () =>
      getTencentSesTemplateUrlValue(
        `https://www.dlgzz.com/api/auth/verify-email?token=${verificationToken}`,
        'forgotPassword'
      ),
    /token in the reset-password path/
  );
});

test('requires the verification token in the verify-email query string', () => {
  assert.throws(
    () =>
      getTencentSesTemplateUrlValue(
        'https://www.dlgzz.com/api/auth/verify-email?callbackURL=%2Fdashboard',
        'verifyEmail'
      ),
    /token in the query string/
  );
  assert.throws(
    () =>
      getTencentSesTemplateUrlValue(
        `https://www.dlgzz.com/api/auth/reset-password/${resetToken}`,
        'verifyEmail'
      ),
    /verify-email endpoint/
  );
});

test('rejects network-path and backslash callback URLs', () => {
  for (const callbackUrl of ['//evil.example/path', '\\evil.example/path']) {
    const url = new URL('https://www.dlgzz.com/api/auth/verify-email');
    url.searchParams.set('token', verificationToken);
    url.searchParams.set('callbackURL', callbackUrl);

    assert.throws(
      () => getTencentSesTemplateUrlValue(url.toString(), 'verifyEmail'),
      /callbackURL is unsafe/
    );
  }
});

test('rejects callback URLs that resolve outside www.dlgzz.com', () => {
  for (const callbackUrl of [
    'https://evil.example/path',
    '/\\evil.example/path',
    'javascript:alert(1)',
  ]) {
    const url = new URL('https://www.dlgzz.com/api/auth/verify-email');
    url.searchParams.set('token', verificationToken);
    url.searchParams.set('callbackURL', callbackUrl);

    assert.throws(
      () => getTencentSesTemplateUrlValue(url.toString(), 'verifyEmail'),
      /callbackURL must stay on www\.dlgzz\.com/
    );
  }
});

test('rejects missing and duplicate verification tokens', () => {
  assert.throws(
    () => getTencentSesTemplateUrlValue(undefined, 'verifyEmail'),
    /template URL is missing/
  );
  assert.throws(
    () =>
      getTencentSesTemplateUrlValue(
        `https://www.dlgzz.com/api/auth/verify-email?token=${verificationToken}&token=duplicate`,
        'verifyEmail'
      ),
    /duplicate token/
  );
});
