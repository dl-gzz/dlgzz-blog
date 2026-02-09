export class GeminiAI {
  private apiKey: string;
  private baseURL: string;
  private model: string;
  private chatCompletionsURL: string;

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || '';
    this.baseURL = process.env.GOOGLE_GEMINI_BASE_URL || 'https://api.aigocode.com';
    this.model = process.env.GEMINI_MODEL || 'gemini-3-pro-preview';
    this.chatCompletionsURL = process.env.GEMINI_CHAT_COMPLETIONS_URL || '';
  }

  private getCandidateUrls() {
    if (this.chatCompletionsURL) {
      return [this.chatCompletionsURL];
    }

    const normalized = this.baseURL.replace(/\/+$/, '');

    if (normalized.endsWith('/chat/completions')) {
      return [normalized];
    }

    const candidates: string[] = [];

    if (normalized.endsWith('/v1')) {
      candidates.push(`${normalized}/chat/completions`);
    } else {
      candidates.push(`${normalized}/v1/chat/completions`);
      candidates.push(`${normalized}/chat/completions`);
    }

    // Native Gemini endpoint fallback (works for vendors implementing Google-style path)
    candidates.push(
      `${normalized}/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`
    );

    return candidates;
  }

  async chat(messages: Array<{ role: string; content: string }>) {
    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY is not configured');
    }

    const candidates = this.getCandidateUrls();
    let lastError = '';

    for (const url of candidates) {
      const isNativeGemini = url.includes(':generateContent?key=');
      const response = await fetch(url, {
        method: 'POST',
        headers: isNativeGemini
          ? {
              'Content-Type': 'application/json',
            }
          : {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${this.apiKey}`,
            },
        body: JSON.stringify(
          isNativeGemini
            ? {
                contents: [
                  {
                    parts: [
                      {
                        text: messages.map((m) => `${m.role}: ${m.content}`).join('\n\n'),
                      },
                    ],
                  },
                ],
              }
            : {
                model: this.model,
                messages,
                stream: false,
              }
        ),
      });

      if (!response.ok) {
        const errorText = await response.text();
        lastError = `${url} -> ${response.status} - ${errorText}`;
        continue;
      }

      const data = await response.json();

      if (isNativeGemini) {
        const nativeText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (nativeText) return nativeText;
      } else {
        const content = data?.choices?.[0]?.message?.content;
        if (typeof content === 'string') return content;
        if (Array.isArray(content)) {
          const firstText = content.find((item: any) => item?.type === 'text' && item?.text)?.text;
          if (firstText) return firstText;
        }
      }

      lastError = `${url} -> 返回内容为空`;
    }

    throw new Error(`Gemini 请求失败: ${lastError || 'No available endpoint'}`);
  }
}
