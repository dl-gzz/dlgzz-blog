# AI 博客问答功能配置指南

## 功能说明

基于博客内容的 AI 智能问答系统，使用 DeepSeek API 提供高性价比的 AI 对话服务。

## 环境变量配置

请在 `.env.local` 文件中添加以下环境变量：

```bash
# DeepSeek API 配置
DEEPSEEK_API_KEY=your_deepseek_api_key_here
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_MODEL=deepseek-chat  # 或 deepseek-reasoner

# 可选：OpenAI API (作为备选)
# OPENAI_API_KEY=your_openai_api_key_here
```

## 获取 DeepSeek API Key

1. 访问 [DeepSeek 平台](https://platform.deepseek.com/)
2. 注册/登录账号
3. 进入 API Keys 页面
4. 创建新的 API Key
5. 复制 API Key 到 `.env.local`

## 价格参考（2025年1月）

DeepSeek API 定价（非常便宜）：
- **DeepSeek-Chat**: ¥1/百万 tokens (输入), ¥2/百万 tokens (输出)
- **DeepSeek-Reasoner**: ¥5.5/百万 tokens (输入), ¥11/百万 tokens (输出)

对比 OpenAI：
- GPT-4: $30/百万 tokens (贵约 200 倍)
- GPT-3.5: $2/百万 tokens (贵约 10 倍)

## 功能特性

1. ✅ **基于博客内容回答** - 使用 RAG 检索相关文章
2. ✅ **语义搜索** - 集成 Orama 搜索引擎
3. ✅ **引用来源** - 显示答案来自哪些文章
4. ✅ **付费功能** - 仅限订阅用户使用
5. ✅ **流式响应** - 实时显示 AI 回答
6. ✅ **中文优化** - DeepSeek 对中文理解优秀

## 技术架构

```
用户提问
  ↓
检查订阅权限
  ↓
Orama 语义搜索相关博客
  ↓
提取相关文章内容
  ↓
DeepSeek API (带上下文)
  ↓
生成答案 + 引用来源
  ↓
流式返回给用户
```

## 使用说明

配置完成后：
1. 重启开发服务器
2. 访问 `/dashboard` 或包含 AI 问答的页面
3. 提问关于博客内容的问题
4. AI 会根据博客文章内容回答

## 示例问题

- "你的博客里有关于 Next.js 的内容吗？"
- "如何实现用户认证？"
- "支付集成的最佳实践是什么？"
- "XorPay 和 Stripe 有什么区别？"
