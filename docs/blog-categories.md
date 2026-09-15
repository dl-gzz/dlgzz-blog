# 网站与小程序文章分类

一级专栏：AI实战（ai-practice）、一人公司（solo-company）、独立沉思（independent-thinking）。

当前二级分类：AI实战 → WorkBuddy（workbuddy）。现有17篇教程归属此处。

文章 frontmatter 示例：

```yaml
column: "ai-practice"
subcategory: "workbuddy"
```

仅设置 column 的文章显示在该专栏的“全部”中。未设置 column 的文章仍可在博客阅读。
子分类在 src/lib/blog-columns.ts 的 BLOG_SUBCATEGORIES 中定义，包含 id、name 和所属 column。
小程序从文章接口返回的 subcategories 读取子分类列表，无需在两端重复配置。

网站入口：/blog?column=ai-practice&subcategory=workbuddy
接口：/api/mp/posts?column=ai-practice&subcategory=workbuddy&page=1&pageSize=10
接口先筛选再分页；不合法的分类组合返回400。

上线顺序：先部署网站接口，再上传小程序。旧接口没有 taxonomyVersion: 2，小程序会提示更新中，避免将全部文章误显示为某个专栏。
