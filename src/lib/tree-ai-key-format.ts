/** Only a format check. DeepSeek, not our application, authenticates the key. */
export function isDeepSeekKey(value: string): boolean {
  return /^sk-[A-Za-z0-9_-]{12,253}$/.test(value);
}

/** A pasted credential must not become part of the model conversation. */
export function looksLikeDeepSeekKeyInPrompt(value: string): boolean {
  return /(?:^|[^A-Za-z0-9_-])sk-[A-Za-z0-9_-]{12,253}(?![A-Za-z0-9_-])/.test(
    value
  );
}
