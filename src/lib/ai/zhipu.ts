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

    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`智谱 AI 请求失败: ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }
}
