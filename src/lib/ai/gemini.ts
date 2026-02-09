export class GeminiAI {
  private apiKey: string;
  private baseURL: string;
  private model: string;

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || '';
    this.baseURL = process.env.GOOGLE_GEMINI_BASE_URL || 'https://api.aigocode.com';
    this.model = process.env.GEMINI_MODEL || 'gemini-3-pro-preview';
  }

  private getChatCompletionsUrl() {
    const normalized = this.baseURL.replace(/\/+$/, '');
    if (normalized.endsWith('/v1')) {
      return `${normalized}/chat/completions`;
    }
    return `${normalized}/v1/chat/completions`;
  }

  async chat(messages: Array<{ role: string; content: string }>) {
    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY is not configured');
    }

    const response = await fetch(this.getChatCompletionsUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini 请求失败: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content === 'string') {
      return content;
    }
    if (Array.isArray(content)) {
      const firstText = content.find((item: any) => item?.type === 'text' && item?.text)?.text;
      if (firstText) return firstText;
    }
    throw new Error('Gemini 返回内容为空');
  }
}

