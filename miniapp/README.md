# Mini Program Blog

这是当前仓库配套的轻量微信小程序端，用来对接 `src/app/api/mp/*` 接口。

当前已包含：

- 博客首页
- 文章详情
- 年度会员页
- 我的页面

开发前请先确认：

1. 生产环境已部署当前 Next.js 项目
2. `https://www.dlgzz.com/api/mp/config` 可以返回 JSON
3. `https://www.dlgzz.com/api/mp/posts?page=1&pageSize=2&locale=zh` 可以返回 JSON
4. 微信小程序后台已把 `https://www.dlgzz.com` 加入 request、uploadFile、downloadFile 合法域名
5. 微信开发者工具打开本目录后，重新编译小程序
