# 星球、网站和微信小程序的会员流程

星球负责收款，管理员确认后手动发出一个 `MEM-` 会员码。网站和小程序共用 `membership_entitlement`，会员码只需兑换一次。

## 用户操作

1. 在网站注册账号并完成要求的邮箱验证。
2. 小程序“我的”页面完成微信登录，使用网站邮箱和密码关联账号。
3. 在网站或小程序兑换管理员发出的会员码。已在网站兑换的用户关联后直接看到会员身份。
4. 首次关联后，后续微信登录自动识别网站账号。密码不保存到小程序存储，不返回网站登录令牌。

网站生成的 8 位绑定码仍是备用关联方式，适用于第三方登录且没有网站密码的用户。会员码不用于证明网站账号归属。

所有现有文章公开，会员只表示身份和有效期。续期使用新的会员码，天数在剩余有效期上累加；每个码仍只能消费一次，永久会员不会被限时码缩短。

## 部署和验收

- 网站环境变量 `WECHAT_MINIAPP_APP_ID`、`WECHAT_MINIAPP_APP_SECRET` 必须来自同一个微信小程序。正确的密钥由管理员直接保存到部署平台。
- 小程序源码在 `/Users/baiyang/Desktop/miniapp`；`utils/config.js` 指向 `https://www.dlgzz.com`。
- 微信开发者工具登录后编译项目，检查微信后台合法域名配置，并在真机验证公开阅读、微信登录、账号关联和兑换。
- 网站部署不等于小程序已发布；需另行上传小程序版本并完成微信平台审核/发布。
- 星球订单确认和发码是人工流程，退费或退群不会自动同步。

## 回归检查

以下脚本只使用内存 PostgreSQL，不会连接环境里的生产数据库：

```sh
# 在临时目录安装测试依赖，不修改项目生产依赖
npm install --prefix /tmp/membership-test-deps @electric-sql/pglite --no-audit --no-fund
MEMBERSHIP_TEST_DEPS=/tmp/membership-test-deps \
MINIAPP_SOURCE_ROOT=/Users/baiyang/Desktop/miniapp \
node scripts/test-unified-membership.mjs
```

覆盖密码和邮箱验证、账号归属、错误账号拒绝、临时网站会话清理、一次性兑换、重复兑换拒绝、续期累加、永久会员、过期/停用账号，以及小程序错误码处理。微信授权本身还需真实微信登录验证。
