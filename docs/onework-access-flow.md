# OneWorkOS 授权与安装闭环

当前网站是 `https://www.dlgzz.com`，授权入口：

- `https://www.dlgzz.com/onework`
- `https://www.dlgzz.com/activate`（短链接，自动跳转）

## 外部平台成交（小红书 / 抖音）

1. 管理员打开登录后的 `/admin/onework`，生成一次性 `OWOS-...` 兑换码；兑换码默认覆盖全部 OneWorkOS 知识库。
2. 把兑换码发给购买用户。
3. 用户在 `/onework` 登录后输入兑换码。
4. 网站把权益写入账号，并签发当前设备的 `dk_live_...` Key；Key 明文只返回一次。
5. 用户点击“生成安装授权”，把短时 token 交给安装器。
6. 安装器调用 `/api/onework/install/claim`，领取一把设备 Key，写入本机：
   - macOS/Linux：`~/.workbuddy/one-work-os.local.env`
   - Windows：`%USERPROFILE%\\.workbuddy\\one-work-os.local.env`
7. 安装器安装同一套 `one-work-os` Skill，重启 WorkBuddy 后即可检索。

## 网站内购

XorPay 回调仍保留原有支付逻辑。只有把明确的 OneWorkOS 商品价格 ID 配置到：

```env
ONEWORK_PRICE_IDS=xorpay_onework_yearly
```

支付首次从 `processing` 变成 `completed` 时，系统直接给账号写入全部 OneWorkOS 知识库权益；重复回调不会重复延长同一笔订单。以后新增知识包会自动包含，不需要增加新的环境变量。

## 安全边界

- 数据库只保存兑换码、安装 token、API Key 的哈希；长期 Key 不放 URL。
- 安装 token 10 分钟有效且只能使用一次。
- 知识检索继续走现有 `/api/knowledge/query`，按 Key 的知识包授权和月度额度计量。
- 设备 Key 可在数据库和后台审计；同一电脑重新安装会生成新的历史 Key，不会覆盖旧记录。

## 部署前检查

1. 生产数据库执行 `pnpm db:apply-onework-access`（本次已在当前 `DATABASE_URL` 执行）。
2. 如需网站内购自动开通，配置 `ONEWORK_PRICE_IDS`；知识包不需要逐个配置。
3. 将 `public/downloads/` 下的安装器和 Skill 压缩包随站点发布。
4. 发布后用管理员账号访问 `/admin/onework`，签发一枚测试码，使用测试账号完成一次兑换和安装，再吊销测试 Key。
