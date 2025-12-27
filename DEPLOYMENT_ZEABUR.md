# 🚀 Zeabur 部署指南 - www.dlgzz.com

## 📋 Zeabur 部署优势

- ✅ 自动 HTTPS/SSL 配置
- ✅ 自动域名绑定
- ✅ 持续部署（Git 推送自动部署）
- ✅ 内置环境变量管理
- ✅ 无需配置 Nginx
- ✅ 免费的 PostgreSQL 数据库

## 🔧 部署步骤

### Step 1: 准备 Zeabur 账号
1. 访问 [zeabur.com](https://zeabur.com)
2. 使用 GitHub 账号登录
3. 创建新项目

### Step 2: 连接 GitHub 仓库
1. 在 Zeabur 控制台点击 "Deploy"
2. 选择 "From GitHub"
3. 授权 Zeabur 访问您的 GitHub 仓库
4. 选择 `mksaas-outfit-main` 仓库

### Step 3: 配置服务
Zeabur 会自动检测 Next.js 项目并配置：
- **Framework**: Next.js 自动识别
- **Build Command**: 自动使用 `pnpm build`
- **Start Command**: 自动使用 `pnpm start`
- **Port**: 自动检测或设置为 3000

### Step 4: 配置环境变量

在 Zeabur 控制台的 "Environment Variables" 标签页添加以下变量：

#### 必需的环境变量
```bash
# 应用 URL（Zeabur 会自动提供 HTTPS）
NEXT_PUBLIC_BASE_URL=https://www.dlgzz.com

# 数据库（可使用 Zeabur 提供的 PostgreSQL）
DATABASE_URL=postgresql://your_database_url

# 认证密钥
BETTER_AUTH_SECRET=你的32位随机字符串

# XorPay 配置（生产环境）
XORPAY_APP_ID=你的生产环境AppID
XORPAY_MERCHANT_ID=你的商户ID
XORPAY_APP_SECRET=你的生产环境AppSecret
XORPAY_WEBHOOK_SECRET=你的Webhook密钥
```

#### 可选的环境变量
```bash
# Google OAuth（如需要）
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# 邮件服务
RESEND_API_KEY=

# 阿里云 OSS（如需要）
OSS_ACCESS_KEY_ID=
OSS_ACCESS_KEY_SECRET=
```

### Step 5: 绑定自定义域名

#### 5.1 在 Zeabur 添加域名
1. 进入项目设置
2. 点击 "Domains" 标签
3. 点击 "Add Domain"
4. 输入 `www.dlgzz.com`
5. Zeabur 会提供一个 CNAME 记录

#### 5.2 配置域名 DNS
在您的域名提供商（腾讯云）添加 DNS 记录：

| 类型 | 主机记录 | 记录值 | TTL |
|------|---------|--------|-----|
| CNAME | www | zeabur提供的域名 | 600 |
| CNAME | @ | zeabur提供的域名 | 600 |

**示例：**
```
类型: CNAME
主机记录: www
记录值: your-project.zeabur.app
TTL: 600
```

#### 5.3 SSL 证书
Zeabur 会自动为您的域名申请和配置 Let's Encrypt SSL 证书。
- ✅ 自动续期
- ✅ 强制 HTTPS
- ✅ 无需手动配置

### Step 6: 部署应用

1. **自动部署**：推送代码到 GitHub，Zeabur 自动部署
```bash
git add .
git commit -m "配置生产环境"
git push origin main
```

2. **手动部署**：在 Zeabur 控制台点击 "Redeploy"

## 📦 Zeabur 数据库配置（推荐）

### 添加 PostgreSQL 数据库
1. 在 Zeabur 项目中点击 "Add Service"
2. 选择 "PostgreSQL"
3. Zeabur 自动创建数据库并设置环境变量
4. 数据库 URL 会自动注入到 `DATABASE_URL`

### 数据库迁移
部署后运行数据库迁移：
```bash
# 在 Zeabur 控制台的 "Terminal" 或本地
pnpm db:push
```

## 🔄 XorPay Webhook 配置

### 设置 Webhook URL
在 XorPay 后台配置 Webhook 回调地址：
```
https://www.dlgzz.com/api/webhooks/xorpay
```

### 测试 Webhook
使用 XorPay 后台的测试功能测试 Webhook 是否正常接收。

## 📊 Zeabur 特性

### 自动化功能
- ✅ Git 推送自动部署
- ✅ 自动构建和优化
- ✅ 零配置 SSL/HTTPS
- ✅ CDN 加速（全球）
- ✅ 日志查看
- ✅ 资源监控

### 查看日志
在 Zeabur 控制台：
1. 点击服务名称
2. 选择 "Logs" 标签
3. 实时查看应用日志

### 扩展配置
如需自定义构建，创建 `zeabur.json`：
```json
{
  "build": {
    "env": {
      "NODE_ENV": "production"
    }
  },
  "deploy": {
    "env": {
      "PORT": "3000"
    }
  }
}
```

## 🧪 部署后测试清单

- [ ] 访问 `https://www.dlgzz.com` 正常
- [ ] HTTPS 证书有效（绿锁）
- [ ] HTTP 自动跳转 HTTPS
- [ ] 价格页面正常显示
- [ ] 支付流程测试（1.8元小额测试）
- [ ] Webhook 回调正常
- [ ] 数据库连接正常
- [ ] 图片上传正常（如启用）
- [ ] 所有页面加载正常

## 🛠️ 常用操作

### 更新代码
```bash
# 本地修改代码后
git add .
git commit -m "更新说明"
git push origin main
# Zeabur 自动部署
```

### 查看环境变量
在 Zeabur 控制台 "Environment Variables" 查看和修改

### 重启服务
在 Zeabur 控制台点击 "Restart"

### 回滚版本
在 Zeabur 控制台 "Deployments" 选择历史版本回滚

## 💰 调整支付金额

部署完成后，修改 `src/config/website.tsx`：
```typescript
prices: [
  {
    amount: 9900,  // 99.00 元（根据实际定价）
    currency: 'CNY',
    interval: PlanIntervals.MONTH,
  }
]
```

推送更新：
```bash
git add src/config/website.tsx
git commit -m "更新支付金额"
git push origin main
```

## 🔐 安全建议

### 环境变量安全
- ✅ 所有密钥都在 Zeabur 环境变量中配置
- ✅ 不要在代码中硬编码密钥
- ✅ `.env.local` 不要提交到 Git

### 定期更新
- [ ] 定期更新依赖包
- [ ] 监控 Zeabur 服务状态
- [ ] 备份数据库数据

## 📞 遇到问题？

### 常见问题

**Q: 域名解析不生效？**
A: DNS 解析需要时间（最多 48 小时），可以用 `nslookup www.dlgzz.com` 检查

**Q: 支付回调失败？**
A: 检查：
1. Webhook URL 是否正确
2. XorPay 是否使用生产凭证
3. 查看 Zeabur 日志中的错误信息

**Q: 如何查看错误日志？**
A: Zeabur 控制台 → 选择服务 → Logs 标签

**Q: 数据库连接失败？**
A: 检查 `DATABASE_URL` 环境变量是否正确配置

## ✅ 部署完成

恭喜！您的应用已成功部署到 Zeabur。

**访问地址：** https://www.dlgzz.com
**部署平台：** Zeabur
**自动部署：** ✅ 已启用
**HTTPS：** ✅ 自动配置

---

**相关资源**
- Zeabur 文档: https://zeabur.com/docs
- Next.js 文档: https://nextjs.org/docs
- XorPay 文档: https://xorpay.com/doc
