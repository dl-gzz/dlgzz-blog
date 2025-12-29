# AI 博客问答功能 - 完整使用指南 🤖

## 🎯 功能说明

基于博客内容的 AI 智能问答系统，使用 **DeepSeek API** 提供高性价比的对话服务。

**核心特性：**
- ✅ **RAG 架构** - 检索增强生成
- ✅ **真实内容** - 仅基于博客文章回答
- ✅ **来源引用** - 显示答案出处
- ✅ **付费保护** - 仅限订阅用户
- ✅ **流式响应** - 实时显示回答
- ✅ **双语支持** - 中英文完整翻译

---

## 📦 已创建的文件

```
src/
├── app/
│   ├── api/ai/chat/route.ts          # AI 聊天 API 端点
│   └── [locale]/(protected)/
│       └── ai-chat/page.tsx           # AI 问答测试页面
├── components/ai/
│   └── blog-ai-chat.tsx              # AI 聊天界面组件
└── lib/
    └── blog-search.ts                 # 博客内容搜索引擎

messages/
├── zh.json                            # 中文翻译 ✅
└── en.json                            # 英文翻译 ✅
```

---

## ⚙️ 快速配置（3 步完成）

### 步骤 1: 添加环境变量

在 `.env.local` 文件末尾添加：

```bash
# DeepSeek API 配置
DEEPSEEK_API_KEY=sk-your-api-key-here
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_MODEL=deepseek-chat
```

### 步骤 2: 获取 DeepSeek API Key

1. 访问 https://platform.deepseek.com/
2. 注册/登录账号
3. 创建 API Key
4. 复制到 `.env.local`

### 步骤 3: 重启服务器

```bash
# 停止当前服务器 (Ctrl+C)
# 重新启动
npm run dev
```

✅ 完成！访问 `http://localhost:3002/ai-chat` 测试

---

## 💰 成本优势

| 提供商 | 价格/百万 tokens | 相对成本 |
|--------|-----------------|---------|
| **DeepSeek-Chat** | ¥1-2 | 基准 1x |
| GPT-3.5 | $2 (~¥14) | 贵 10x |
| GPT-4 | $30 (~¥210) | 贵 200x |

**实际成本示例：**
- 1000 次对话：DeepSeek ¥1-2，GPT-4 ¥150-200
- **节省 99%+ 成本！**

---

## 🚀 使用方法

### 方式 1：独立页面

访问 AI 问答页面：
```
http://localhost:3002/ai-chat
```

### 方式 2：嵌入任何页面

```tsx
import { BlogAIChat } from '@/components/ai/blog-ai-chat';

export default function MyPage() {
  return <BlogAIChat />;
}
```

### 测试问题示例

```
✅ "你的博客里有关于 Next.js 的内容吗？"
✅ "如何实现用户认证？"
✅ "支付集成的最佳实践？"
✅ "XorPay 和 Stripe 的区别？"
✅ "订阅功能是怎么实现的？"
```

---

## 🏗️ 技术架构

```
[用户提问]
    ↓
[验证登录 + 订阅权限] ⭐ 付费功能
    ↓
[Orama 搜索相关博客]
    ↓
[提取前 5 篇文章内容]
    ↓
[DeepSeek API 生成回答]
    ↓
[流式返回 + 来源引用]
```

---

## 🔒 权限控制

### 访问条件
1. ✅ 用户已登录
2. ✅ 有有效订阅（月付/年付）

### 权限失败提示
- **未登录**: "请先登录"
- **无订阅**: "AI 问答功能仅限付费用户使用，请升级订阅"

---

## 🧪 测试清单

- [ ] `.env.local` 已配置 DEEPSEEK_API_KEY
- [ ] 开发服务器运行正常
- [ ] 访问 `/ai-chat` 页面成功
- [ ] 登录状态正常
- [ ] 订阅权限检查生效
- [ ] AI 能正确回答博客相关问题
- [ ] 来源引用正确显示
- [ ] 流式响应流畅

---

## 🐛 常见问题

### Q1: API 返回 401 错误
**原因**: 未登录
**解决**: 访问 `/auth/login` 登录

### Q2: API 返回 403 Premium feature
**原因**: 没有有效订阅
**解决**: 访问 `/pricing` 升级订阅

### Q3: DeepSeek API 错误
**原因**: API Key 无效或余额不足
**解决**:
1. 检查 `.env.local` 的 `DEEPSEEK_API_KEY`
2. 访问 DeepSeek 平台充值

### Q4: 搜索不到博客内容
**原因**: 博客文章未被索引
**解决**: 重启开发服务器重建索引

---

## 📈 优化建议

### 成本优化
- [ ] 缓存常见问题答案
- [ ] 设置每日调用限制
- [ ] 记录 token 使用统计

### 功能增强
- [ ] 对话历史记录
- [ ] 多轮对话上下文
- [ ] 问题推荐系统
- [ ] 用户反馈（👍/👎）

---

## 📚 相关资源

- [Vercel AI SDK](https://sdk.vercel.ai/docs)
- [DeepSeek API](https://platform.deepseek.com/docs)
- [Orama 搜索](https://docs.oramasearch.com/)

---

## ✅ 实现状态

- [x] API 路由创建
- [x] 博客搜索集成
- [x] 聊天界面组件
- [x] 付费权限保护
- [x] 来源引用显示
- [x] 流式响应
- [x] 国际化翻译
- [x] 测试页面
- [x] 路由配置

**🎉 功能完整，可以开始测试！**

---

## 下一步

1. **配置 DeepSeek API Key** (必须)
2. **重启开发服务器**
3. **访问** `http://localhost:3002/ai-chat`
4. **开始提问！**
