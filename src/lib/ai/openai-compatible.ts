import 'server-only';

import { createOpenAI } from '@ai-sdk/openai';
import OpenAI from 'openai';

export type OpenAICompatibleProvider = 'deepseek' | 'openai';

export interface OpenAICompatibleConfig {
  provider: OpenAICompatibleProvider;
  apiKey: string;
  baseURL: string;
  model: string;
}

export function resolveOpenAICompatibleConfig({
  defaultOpenAIModel = 'gpt-3.5-turbo',
}: {
  defaultOpenAIModel?: string;
} = {}): OpenAICompatibleConfig | null {
  if (process.env.DEEPSEEK_API_KEY) {
    return {
      provider: 'deepseek',
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    };
  }

  if (process.env.OPENAI_API_KEY) {
    return {
      provider: 'openai',
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      model: process.env.OPENAI_MODEL || defaultOpenAIModel,
    };
  }

  return null;
}

export function getOpenAICompatibleConfig(options?: {
  defaultOpenAIModel?: string;
}) {
  const config = resolveOpenAICompatibleConfig(options);

  if (!config) {
    throw new Error(
      'API 密钥未配置，请设置 DEEPSEEK_API_KEY 或 OPENAI_API_KEY'
    );
  }

  return config;
}

export function createOpenAICompatibleClient(options?: {
  defaultOpenAIModel?: string;
}) {
  const config = getOpenAICompatibleConfig(options);

  return {
    config,
    client: new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    }),
  };
}

export function createOpenAICompatibleSdk(options?: {
  defaultOpenAIModel?: string;
}) {
  const config = getOpenAICompatibleConfig(options);

  return {
    config,
    sdk: createOpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    }),
  };
}
