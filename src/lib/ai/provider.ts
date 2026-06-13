import 'server-only';

import { DeepSeekAI } from '@/lib/ai/deepseek';
import { GeminiAI } from '@/lib/ai/gemini';
import { ZhipuAI } from '@/lib/ai/zhipu';

export type ServerChatProvider = 'gemini' | 'zhipu' | 'deepseek';

export interface ServerChatMessage {
  role: string;
  content: string;
}

export function resolveServerChatProvider(envValue?: string): ServerChatProvider | null {
  const preferred = (envValue || '').trim().toLowerCase();

  if (preferred === 'gemini' || preferred === 'zhipu' || preferred === 'deepseek') {
    return preferred;
  }

  if (process.env.GEMINI_API_KEY) return 'gemini';
  if (process.env.ZHIPU_API_KEY) return 'zhipu';
  if (process.env.DEEPSEEK_API_KEY) return 'deepseek';

  return null;
}

export async function chatWithServerProvider({
  provider,
  messages,
  model,
}: {
  provider: ServerChatProvider;
  messages: ServerChatMessage[];
  model?: string;
}) {
  if (provider === 'gemini') {
    return new GeminiAI({ model }).chat(messages);
  }

  if (provider === 'zhipu') {
    return new ZhipuAI().chat(messages);
  }

  return new DeepSeekAI().chat(messages);
}

export async function chatWithResolvedServerProvider({
  messages,
  preferredProvider,
  model,
}: {
  messages: ServerChatMessage[];
  preferredProvider?: string;
  model?: string;
}) {
  const provider = resolveServerChatProvider(preferredProvider);

  if (!provider) {
    throw new Error(
      'No AI provider configured. Set GEMINI_API_KEY, ZHIPU_API_KEY, or DEEPSEEK_API_KEY.'
    );
  }

  const message = await chatWithServerProvider({
    provider,
    messages,
    model,
  });

  return {
    provider,
    message,
  };
}
