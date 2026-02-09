// 智谱 AI 服务
export class ZhipuAI {
  private apiKey: string;
  private baseURL: string;
  private model: string;

  constructor() {
    this.apiKey = process.env.ZHIPU_API_KEY || '';
    this.baseURL = process.env.ZHIPU_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4';
    this.model = process.env.ZHIPU_MODEL || 'glm-4';
  }

  async chat(messages: Array<{ role: string; content: string }>) {
    if (!this.apiKey) {
      throw new Error('ZHIPU_API_KEY is not configured');
    }

    // Try different authentication methods for gateway compatibility
    const authHeadersList: Array<Record<string, string>> = [
      { 'Authorization': `Bearer ${this.apiKey}` },
      { 'x-api-key': this.apiKey },
      { 'api-key': this.apiKey },
    ];

    let lastError = '';

    for (const authHeaders of authHeadersList) {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...authHeaders,
      };

      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: this.model,
          messages,
          stream: false,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const authType = Object.keys(authHeaders)[0];
        lastError = `[${authType}] ${response.statusText} - ${errorText}`;
        continue;
      }

      const data = await response.json();
      return data.choices[0].message.content;
    }

    throw new Error(`智谱 AI 请求失败: ${lastError}`);
  }
}
