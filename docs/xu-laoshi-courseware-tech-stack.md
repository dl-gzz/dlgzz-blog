# 徐老师交互课件技术栈分析

> 来源：登录态实测与页面行为整理。
> 目的：为学习助手的互动课件库、AI 课件生成、iPad 触控模板提供参考。

## 分层总览

“徐老师交互课件”不是一个统一白板系统，而是一个按课件独立发布的互动网页应用集合：

- 导航层：课件目录、分类、搜索、登录入口。
- 课件层：一个短 ID 对应一个自包含网页 App。
- 共享库层：各课件从 `/math/daohang/ku/` 按需加载 Three.js、Chart.js、MathJax 等库。
- 防护层：登录取密钥、页面加密、反调试、防嵌入、防爬。
- 商业层：公开视频引流，加微信领账号、无水印、定制服务。

## A. 共享库货架 `/math/daohang/ku/`

| 库 | 用途 |
| --- | --- |
| `three.min.js` (r128) | 3D 渲染引擎，基于 WebGL |
| `OrbitControls.js` | 3D 视角旋转、缩放，支持触摸 |
| `DragControls.js` | 3D 物体拖拽，支持触摸 |
| `chart.js` | 2D 图表，适合折线、柱状、统计图 |
| `tex-svg.js` / MathJax | 数学公式渲染为 SVG |
| `html2canvas` | 把页面或题目区域转成图片 |
| `jspdf` | 生成 PDF |
| `html2pdf.bundle` | HTML 到 PDF 的封装导出 |
| `tailwindcss.js` | 页面样式，部分新课件使用 CDN Tailwind |
| `lucide.min.js` | 图标 |
| `/sdk/asr-sdk.js` | 语音识别，部分课件带语音交互 |

## B. 四类课件技术栈对照

| 题型 | 代表课件 | 技术栈 | 触控实现 |
| --- | --- | --- | --- |
| 3D 几何 | 立体图形切割 | 原生 JS + Three.js r128 + OrbitControls + DragControls + Raycaster | DragControls + Raycaster |
| 平面动画 | 圆面积推导 | React + Framer Motion + SVG，Vite 打包为 `assets/index-[hash].js` | Framer Motion `drag` |
| 图表统计 | 折线统计图 | Chart.js + ASR 语音 SDK | 图表内置交互 |
| 出题练习 | 五下计算出题系统 | 原生 JS + MathJax + html2canvas + jsPDF | 表单交互 + 导出 |

关键结论：

它不是一套统一框架，而是“一个课件 = 一个自包含网页 App”。不同题型按需选择最合适的技术栈。React + Vite 是工程化产物，Three.js / 原生 JS 更像手写课件，整体像“AI 按需生成 + 人工调修”的混合产物。

## C. 加密与防护层

| 机制 | 做法 |
| --- | --- |
| 整页加密 | 课件 HTML 转成 base64 + XOR 密文，进入页面后解密注入 |
| 密钥分发 | `POST /math/api/security/get_key/{token}`，需要登录，未登录返回 `E06` |
| 反调试 | `debugger` 计时探测，打开 DevTools 后清空页面并跳转 `about:blank` |
| 反爬虫 | 检测 `navigator.webdriver` / PhantomJS 等自动化特征 |
| 防嵌入/防扒 | 防 iframe、禁右键、禁快捷键、禁拖拽、禁保存 |

对我们的启发：

MVP 阶段不需要复制这套防护。我们更应该先做课件可生成、可保存、可复用、可记录成绩。等有付费课件库或教师内容资产后，再考虑轻量水印、访问令牌、分享权限、导出限制。

## D. 后端 API 与账号墙

| 接口 | 作用 |
| --- | --- |
| `/math/api/works` | 课件目录，公开接口 |
| `/math/api/user/me` | 当前账号状态，包含访问权限与过期时间 |
| `/math/api/login` | 登录 |
| `/math/api/logout` | 退出登录 |
| `/math/api/security/get_key/{token}` | 课件解密密钥，需要登录 |

目录数据实测约 55 个课件：

- 六年级：23 个
- 五年级：18 个
- 三年级：6 个
- 四年级：5 个
- 计算：3 个

## E. 触控层：最值得复刻的部分

iPad / 触摸屏课件的关键是统一输入事件：

- 使用 Pointer Events 统一鼠标、手指、触控笔。
- 配合 `touch-action: none` 阻止浏览器默认滚动/缩放干扰。
- 使用 `setPointerCapture` 保证拖拽过程中指针不会丢失。
- 3D 场景优先使用 Three.js 的 `OrbitControls` / `DragControls`。
- React 平面动画优先使用 Framer Motion 的 `drag`。

这部分可以直接沉淀成我们自己的互动课件模板规范。

## 对学习助手的复刻策略

我们不照搬它的会员墙和加密壳，而是复刻它最有价值的产品结构：

```text
AI 生成课件
→ 保存为一个自包含 HTML/React/SVG/Three.js 小应用
→ 进入课件库
→ 按年级 / 学科 / 知识点分类
→ 老师一键插入白板
→ 学生答题
→ postMessage 上报成绩
→ Hermes 记录掌握度、错题和家长反馈
```

## 我们应优先沉淀的模板

1. 出题练习模板
   - 输入框 / 选择题 / 拖拽题
   - 必须上报 `quiz_result`
   - 必须包含 `questions` 和 `wrong`

2. 平面可视化模板
   - React / SVG / Framer Motion
   - 适合圆面积、分数、数轴、几何展开

3. 3D 几何模板
   - Three.js + OrbitControls + DragControls
   - 适合立体图形、切割、展开、旋转

4. 图表统计模板
   - Chart.js
   - 适合折线统计图、柱状图、数据分析题

5. 导出打印模板
   - html2canvas + jsPDF
   - 适合生成练习卷、错题卷、课后复习单

## 下一步建议

先做“课件库模型”和“标准课件模板”：

- 课件元数据：标题、年级、学科、知识点、难度、技术类型、缩略图、创建来源。
- 课件内容：HTML 字符串或构建产物 URL。
- 白板动作：插入课件、复制课件、编辑课件、下载课件。
- 学习数据：通过统一 `quiz_result` 协议写入 Hermes。

这样我们就能把当前“AI 临时生成组件”的能力升级为“AI 生成可复用课件资产”。
