# 🚀 生产环境部署检查清单

## 📋 部署前准备

### 1. 腾讯云 SSL 证书申请
- [ ] 登录腾讯云控制台
- [ ] 进入 SSL 证书管理
- [ ] 申请免费 DV SSL 证书（1年有效期）
- [ ] 域名：`www.dlgzz.com` 和 `dlgzz.com`
- [ ] 验证方式选择：DNS 验证或文件验证
- [ ] 下载证书（Nginx 格式）
  - `www.dlgzz.com.crt` (证书文件)
  - `www.dlgzz.com.key` (私钥文件)

### 2. 服务器环境准备
- [ ] Node.js 18+ 已安装
- [ ] pnpm 已安装 (`npm install -g pnpm`)
- [ ] Nginx 已安装 (`apt install nginx` 或 `yum install nginx`)
- [ ] PostgreSQL 数据库已准备（或使用 Supabase）
- [ ] 防火墙开放端口：80, 443, 3002

### 3. 代码准备
- [ ] 代码已上传到服务器
- [ ] 运行 `pnpm install` 安装依赖
- [ ] 复制 `.env.production.example` 为 `.env.production`
- [ ] 填写所有生产环境配置

## 🔐 环境变量配置

### 必须配置的变量
```bash
NEXT_PUBLIC_BASE_URL="https://www.dlgzz.com"
DATABASE_URL="your_production_database_url"
BETTER_AUTH_SECRET="$(openssl rand -base64 32)"
XORPAY_APP_ID="your_production_app_id"
XORPAY_APP_SECRET="your_production_app_secret"
```

### 可选但建议配置
```bash
RESEND_API_KEY="for_email_sending"
GOOGLE_CLIENT_ID="for_google_login"
OSS_ACCESS_KEY_ID="for_image_upload"
```

## 📦 构建和部署步骤

### Step 1: 构建生产版本
```bash
cd /path/to/mksaas-outfit-main
pnpm build
```

### Step 2: 配置 SSL 证书
```bash
# 创建证书目录
sudo mkdir -p /etc/nginx/ssl

# 上传证书文件（从本地上传到服务器）
sudo cp www.dlgzz.com.crt /etc/nginx/ssl/
sudo cp www.dlgzz.com.key /etc/nginx/ssl/

# 设置权限
sudo chmod 600 /etc/nginx/ssl/www.dlgzz.com.key
sudo chmod 644 /etc/nginx/ssl/www.dlgzz.com.crt
```

### Step 3: 配置 Nginx
```bash
# 复制 nginx.conf 到 Nginx 配置目录
sudo cp nginx.conf /etc/nginx/sites-available/dlgzz.com

# 创建符号链接
sudo ln -s /etc/nginx/sites-available/dlgzz.com /etc/nginx/sites-enabled/

# 测试 Nginx 配置
sudo nginx -t

# 重启 Nginx
sudo systemctl restart nginx
```

### Step 4: 使用 PM2 管理 Node.js 进程
```bash
# 安装 PM2
npm install -g pm2

# 启动应用
pm2 start npm --name "dlgzz" -- start

# 设置开机自启
pm2 startup
pm2 save

# 查看日志
pm2 logs dlgzz

# 重启应用
pm2 restart dlgzz
```

## 🧪 部署后测试

### 测试清单
- [ ] 访问 `https://www.dlgzz.com` 正常显示
- [ ] HTTP 自动跳转到 HTTPS
- [ ] SSL 证书正常（浏览器显示安全锁）
- [ ] 价格页面显示正确金额
- [ ] 点击支付按钮能创建订单
- [ ] 支付二维码正常显示
- [ ] 扫码支付测试（使用 1.8 元测试订单）
- [ ] 支付成功后 Webhook 回调正常
- [ ] 数据库订单状态更新正常
- [ ] 所有静态资源加载正常

## 🔄 XorPay 生产环境配置

### 1. 更新 XorPay 配置
生产环境需要使用真实的 XorPay 凭证：
```bash
XORPAY_APP_ID="YOUR_REAL_APP_ID"
XORPAY_APP_SECRET="YOUR_REAL_APP_SECRET"
```

### 2. 配置 Webhook URL
在 XorPay 后台设置 Webhook 回调地址：
```
https://www.dlgzz.com/api/webhooks/xorpay
```

### 3. 更新支付金额
修改 `src/config/website.tsx` 中的金额为实际价格：
```typescript
amount: 9900,  // 99.00 元（根据实际定价调整）
```

## 📊 监控和维护

### 日志查看
```bash
# Nginx 日志
sudo tail -f /var/log/nginx/dlgzz.com.access.log
sudo tail -f /var/log/nginx/dlgzz.com.error.log

# 应用日志
pm2 logs dlgzz
```

### 常用 PM2 命令
```bash
pm2 list              # 查看所有进程
pm2 restart dlgzz     # 重启应用
pm2 stop dlgzz        # 停止应用
pm2 delete dlgzz      # 删除应用
pm2 monit             # 监控资源使用
```

## 🛡️ 安全建议

- [ ] 定期更新 SSL 证书（腾讯云免费证书 1 年有效）
- [ ] 定期备份数据库
- [ ] 定期更新依赖包 `pnpm update`
- [ ] 启用 Nginx 访问日志分析
- [ ] 配置服务器防火墙规则
- [ ] 不要在代码库中提交敏感信息
- [ ] 使用环境变量管理所有密钥

## 📞 常见问题

### Q: 如何更新代码？
```bash
cd /path/to/mksaas-outfit-main
git pull
pnpm install
pnpm build
pm2 restart dlgzz
```

### Q: 数据库迁移
```bash
pnpm db:push  # 推送数据库 schema 变更
```

### Q: SSL 证书到期怎么办？
重新申请腾讯云免费证书，然后替换证书文件，重启 Nginx。

### Q: 支付测试通过，但生产环境不工作？
检查：
1. XorPay 是否使用生产凭证
2. Webhook URL 是否正确配置
3. 防火墙是否允许 XorPay 服务器访问
4. 日志中是否有错误信息

## ✅ 部署完成后

- [ ] 访问 https://www.dlgzz.com 测试所有功能
- [ ] 使用小额（1.8元）测试真实支付流程
- [ ] 监控服务器资源使用情况
- [ ] 设置告警通知（可选）
- [ ] 更新项目文档

---

**部署时间：** _____________________
**部署人员：** _____________________
**服务器 IP：** _____________________
**备注：** _____________________
