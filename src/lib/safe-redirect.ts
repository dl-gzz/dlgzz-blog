/** Normalize first: URL parsers strip control characters and normalize slashes. */
export function safeLocalRedirect(value: string, fallback: string) {
  try {
    const base = 'https://redirect.invalid';
    const url = new URL(value, base);
    if (!value.startsWith('/') || url.origin !== base) return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}
