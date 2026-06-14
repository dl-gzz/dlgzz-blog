export class GeminiAI {
  private apiKey: string;
  private baseURL: string;
  private model: string;
  private chatCompletionsURL: string;
  private authMode: string;
  private responseMimeType?: string;
  private responseSchema?: Record<string, unknown>;

  constructor(options: {
    model?: string;
    responseMimeType?: string;
    responseSchema?: Record<string, unknown>;
  } = {}) {
    this.apiKey = process.env.GEMINI_API_KEY || '';
    this.baseURL =
      process.env.GOOGLE_GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com';
    this.model = options.model || process.env.GEMINI_MODEL || 'gemini-3.5-flash';
    this.chatCompletionsURL = process.env.GEMINI_CHAT_COMPLETIONS_URL || '';
    this.authMode = (process.env.GEMINI_AUTH_MODE || 'auto').toLowerCase();
    this.responseMimeType = options.responseMimeType;
    this.responseSchema = options.responseSchema;
  }

  private shouldUseNativeGemini(normalizedBaseUrl: string) {
    if (process.env.GEMINI_API_FORMAT?.toLowerCase() === 'native') return true;
    if (process.env.GEMINI_API_FORMAT?.toLowerCase() === 'openai') return false;

    return (
      normalizedBaseUrl.includes('generativelanguage.googleapis.com') ||
      normalizedBaseUrl === 'https://api.apiyi.com'
    );
  }

  private getCandidateUrls() {
    if (this.chatCompletionsURL) {
      return [this.chatCompletionsURL];
    }

    const normalized = this.baseURL.replace(/\/+$/, '');

    // Native Gemini providers use the official generateContent path.
    // API易 native Gemini requires https://api.apiyi.com, not /v1.
    if (this.shouldUseNativeGemini(normalized)) {
      return [`${normalized}/v1beta/models/${this.model}:generateContent`];
    }

    if (normalized.endsWith('/chat/completions')) {
      return [normalized];
    }
    if (normalized.endsWith('/v1/messages') || normalized.endsWith('/messages')) {
      return [normalized];
    }

    const candidates: string[] = [];

    if (normalized.endsWith('/v1')) {
      candidates.push(`${normalized}/chat/completions`);
      candidates.push(`${normalized}/messages`);
    } else {
      candidates.push(`${normalized}/v1/chat/completions`);
      candidates.push(`${normalized}/chat/completions`);
      candidates.push(`${normalized}/v1/messages`);
    }

    // Native Gemini endpoint fallback is opt-in because many proxy providers
    // only support OpenAI-compatible chat/completions.
    if (process.env.GEMINI_ENABLE_NATIVE_FALLBACK === 'true') {
      candidates.push(
        `${normalized}/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`
      );
    }

    return candidates;
  }

  async chat(messages: Array<{ role: string; content: string }>) {
    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY is not configured');
    }

    const candidates = this.getCandidateUrls();
    let lastError = '';

    const buildNativeGeminiPayload = () => {
      const systemMessages = messages
        .filter((message) => message.role === 'system')
        .map((message) => message.content)
        .join('\n\n')
        .trim();
      const conversation = messages
        .filter((message) => message.role !== 'system')
        .map((message) => `${message.role}: ${message.content}`)
        .join('\n\n')
        .trim();
      const generationConfig: Record<string, unknown> = {
        temperature: 0.2,
        maxOutputTokens: 16000,
      };

      if (this.responseMimeType) {
        generationConfig.responseFormat = {
          text: {
            mimeType: this.responseMimeType,
            ...(this.responseSchema ? { schema: this.responseSchema } : {}),
          },
        };
      }

      return {
        ...(systemMessages
          ? {
              system_instruction: {
                parts: [{ text: systemMessages }],
              },
            }
          : {}),
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: conversation || messages.map((message) => message.content).join('\n\n'),
              },
            ],
          },
        ],
        generationConfig,
      };
    };

    const authHeadersForMode = (): Array<Record<string, string>> => {
      if (this.authMode === 'bearer') {
        return [{ Authorization: `Bearer ${this.apiKey}` }];
      }
      if (this.authMode === 'x-api-key') {
        return [{ 'x-api-key': this.apiKey }];
      }
      if (this.authMode === 'api-key') {
        return [{ 'api-key': this.apiKey }];
      }
      // auto mode: try common variants used by gateway vendors
      return [
        { Authorization: `Bearer ${this.apiKey}` },
        { 'x-api-key': this.apiKey },
        { 'api-key': this.apiKey },
      ];
    };

    const buildOpenAICompatiblePayload = () => ({
      model: this.model,
      messages,
      stream: false,
      max_tokens: 8192,
      ...(this.responseMimeType === 'application/json'
        ? { response_format: { type: 'json_object' } }
        : {}),
    });

    for (const url of candidates) {
      const isNativeGemini = url.includes(':generateContent');
      const isNativeMessages = url.endsWith('/v1/messages') || url.endsWith('/messages');
      const headerVariants: Array<Record<string, string>> = isNativeGemini
        ? [{ 'x-goog-api-key': this.apiKey }]
        : authHeadersForMode();

      for (const authHeaders of headerVariants) {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          ...authHeaders,
        };
        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(
            isNativeGemini
              ? buildNativeGeminiPayload()
              : isNativeMessages
                ? {
                    model: this.model,
                    contents: [
                      {
                        role: 'user',
                        parts: [
                          {
                            text: messages.map((m) => `${m.role}: ${m.content}`).join('\n\n'),
                          },
                        ],
                      },
                    ],
                  }
              : buildOpenAICompatiblePayload()
          ),
        });

        if (!response.ok) {
          const errorText = await response.text();
          const authTag = Object.keys(authHeaders).join(',') || 'native-key-query';
          lastError = `${url} [${authTag}] -> ${response.status} - ${errorText}`;
          continue;
        }

        const data = await response.json();

        if (isNativeGemini || isNativeMessages) {
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

        const authTag = Object.keys(authHeaders).join(',') || 'native-key-query';
        lastError = `${url} [${authTag}] -> 返回内容为空`;
      }
    }

    throw new Error(`Gemini 请求失败: ${lastError || 'No available endpoint'}`);
  }
}
