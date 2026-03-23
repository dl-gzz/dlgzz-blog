const DEFAULT_LOCAL_CLIENT_ORIGIN = 'http://127.0.0.1:19527';

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}

export function getLocalClientOrigin() {
  const value =
    process.env.NEXT_PUBLIC_LOCAL_CLIENT_ORIGIN ||
    process.env.LOCAL_CLIENT_ORIGIN ||
    DEFAULT_LOCAL_CLIENT_ORIGIN;

  return trimTrailingSlash(value);
}

