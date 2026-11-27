export type DeepSeekCredentials =
  | { mode: 'site'; defaultModel?: string }
  | { mode: 'personal'; apiKey: string };

const officialBase = 'https://api.deepseek.com/v1';
const personalModel = 'deepseek-flash';

/** Do not include the response body or headers: they can contain private data. */
export class DeepSeekHttpError extends Error {
  constructor(readonly status: number) {
    super('DeepSeek HTTP ' + status);
    this.name = 'DeepSeekHttpError';
  }
}

export class DeepSeekAI {
  #apiKey: string;
  private readonly personal: boolean;
  private readonly baseURL: string;
  readonly model: string;

  constructor(credentials: DeepSeekCredentials = { mode: 'site' }) {
    this.personal = credentials.mode === 'personal';
    if (credentials.mode === 'personal') {
      this.#apiKey = credentials.apiKey;
      this.baseURL = officialBase;
      this.model = personalModel;
    } else {
      this.#apiKey = process.env.DEEPSEEK_API_KEY || '';
      this.baseURL = process.env.DEEPSEEK_BASE_URL || officialBase;
      this.model =
        process.env.DEEPSEEK_MODEL?.trim() || credentials.defaultModel || 'deepseek-chat';
    }
  }

  async chat(
    messages: Array<{ role: string; content: string }>,
    options?: { json?: boolean; maxTokens?: number; signal?: AbortSignal }
  ) {
    if (!this.#apiKey) {
      throw new Error('DEEPSEEK_API_KEY is not configured');
    }

    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      cache: 'no-store',
      redirect: 'error',
      signal: options?.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.#apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        stream: false,
        ...(this.personal ? { thinking: { type: 'disabled' } } : {}),
        max_tokens: options?.maxTokens ?? 8192,
        ...(options?.json ? { response_format: { type: 'json_object' } } : {}),
      }),
    });

    if (!response.ok) {
      void response.body?.cancel().catch(() => undefined);
      throw new DeepSeekHttpError(response.status);
    }

    const data = await response.json().catch(() => null);
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string')
      throw new Error('Invalid DeepSeek response');
    return content;
  }
}
