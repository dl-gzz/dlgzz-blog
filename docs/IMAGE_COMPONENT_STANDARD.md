# 图片类组件统一规范

## 一句话结论

以后所有做图组件，不管是原生 shape 还是插件 shape，都必须统一走同一套图片返回协议和参考图交互协议。

只要遵守这份规范，线上组件下载到线下后，基本不会再出现“生成成功但白板里是坏图”的问题。

## 这份文档解决什么

这份文档专门约束四件事：

- 线上图片组件开发时，结果该怎么返回
- 线下白板渲染时，图片该怎么显示
- 支持参考图的组件，怎样统一做“靠近图片亮绿灯”
- 新组件上线前，怎样验收才能避免再次出现坏图

## 这次问题的真正根因

之前即梦坏图，不是模型不会生成，也不是文件坏了。

真正的问题是：

- 图片文件实际已经生成成功
- 但白板读取结果时，过度依赖 `publicUrl`
- 一旦本地静态资源 URL 某次没有稳定命中，白板拿到的就不是图片，而是 HTML / 404 页面
- 最终表现成“shape 里是坏图”或者“白板插入后是坏图”

`Nano Banana 工坊` 之前更稳，是因为它已经带了 `dataUrl` 兜底。

所以彻底修复的关键，不是只修某一个组件，而是统一图片结果协议。

## 统一图片结果协议

所有图片类组件执行完成后，返回的 `image` 对象必须至少包含：

```json
{
  "fileName": "jimeng-generated-1774770196904.jpeg",
  "mimeType": "image/jpeg",
  "dataUrl": "data:image/jpeg;base64,...",
  "publicUrl": "/images/whiteboard/generated/jimeng-generated-1774770196904.jpeg",
  "latestUrl": "/images/whiteboard/generated/latest-jimeng.jpeg",
  "latestCommonUrl": "/images/whiteboard/generated/latest.png"
}
```

### 字段含义

- `mimeType`
  - 真实图片类型，不能写死成 `image/png`
- `dataUrl`
  - 白板展示主兜底
  - 用于避免 `publicUrl` 偶发失效时出现坏图
- `publicUrl`
  - 本地静态资源访问地址
  - 用于结果持久化和后续访问
- `latestUrl`
  - 当前通道或当前组件的最新图
- `latestCommonUrl`
  - 通用最新图地址

## 白板展示统一规则

白板里所有图片类组件都必须遵守：

### 1. 结果预览

shape 内部预览图显示时：

```ts
src={result.image.dataUrl || toAbsoluteUrl(result.image.publicUrl)}
```

### 2. 插入白板

插入 tldraw 图片资产时：

```ts
await insertImageToCanvas(
  data?.image?.dataUrl || data?.image?.publicUrl,
  data?.image?.mimeType || 'image/png'
)
```

### 3. 资源创建

tldraw 资产必须使用：

- 真实 `mimeType`
- 可展示的最终地址
- 不能默认假设一定是 png

## 两种底座的接入规范

## A. 原生宿主型图片组件

例如：

- `即梦出图工坊`
- `Text2Image Studio`

这类组件统一走：

- `src/app/api/skill/text2image/route.ts`
- `src/components/whiteboard/shapes/Text2ImageShape.tsx`

必须保证：

- 接口返回 `dataUrl + publicUrl + mimeType`
- shape 预览优先吃 `dataUrl`
- shape 插图优先吃 `dataUrl`

## B. 插件型图片组件

例如：

- `Nano Banana 工坊`

这类组件统一走：

- `src/lib/plugin-runtime.ts`
- `src/components/whiteboard/shapes/PluginShape.tsx`

必须保证：

- 插件运行结果返回 `dataUrl + publicUrl + mimeType`
- `PluginShape` 预览优先吃 `dataUrl`
- `PluginShape` 插图优先吃 `dataUrl`

## 参考图交互统一规范

以后所有支持参考图的图片组件，都统一支持“靠近白板图片自动锁定参考图”。

### 统一规则

- 如果组件支持参考图输入
- 且白板附近存在图片
- 且用户没有手动填写参考图
- 那么组件运行时自动使用附近图片作为参考图

### 优先级

优先级必须固定为：

1. 用户手动输入
2. 白板邻近自动感应
3. 空参考图

也就是：

- 手动输入永远覆盖自动感应
- 自动感应只是兜底，不抢用户控制权

## 邻近感应底座

统一复用：

- `src/components/whiteboard/shapes/nearbyShapeSupport.tsx`

目前已经支持：

- `image`
- `video_player`

### 当前已接入的图片能力

- `Text2ImageShape`
- `PluginShape`

所以现在：

- 即梦有绿灯锁图
- 通用文生图有绿灯锁图
- `Nano Banana 工坊` 现在也有绿灯锁图

## 插件类图片组件的标准写法

如果一个插件支持参考图，`plugin_spec` 里必须声明：

```yaml
action:
  request:
    prompt_field: prompt
    reference_images_field: referenceImages
```

并且字段本身建议使用：

```yaml
- id: referenceImages
  label: 参考图
  type: multi_text
  placeholder: 每行一张参考图，支持 http(s) URL、data URL 或本机绝对路径
```

这样 `PluginShape` 才能自动识别这是参考图字段，并接入邻近感应。

## 线上组件开发要求

以后你在线上开发新的做图组件，必须按下面流程做：

1. 先确定它属于哪种运行模式

- 原生宿主型：走 `text2image` 底座
- 插件型：走 `plugin-runtime` 底座

2. 再确认它是否支持参考图

- 如果支持，就必须接入参考图字段
- 并统一遵守“手动优先，邻近感应兜底”

3. 最后检查返回结果

必须确认最终返回的 `image` 里有：

- `dataUrl`
- `publicUrl`
- `mimeType`

少一个都不算合格

## 下载到线下前的自检清单

每个线上图片组件上线前，必须过这份清单：

- 返回结果是否包含 `dataUrl`
- 返回结果是否包含 `publicUrl`
- 返回结果是否包含真实 `mimeType`
- shape 预览是否优先吃 `dataUrl`
- 白板插图是否优先吃 `dataUrl`
- 如果支持参考图，是否声明了 `reference_images_field`
- 如果支持参考图，靠近白板图片时是否会亮绿灯
- 如果支持参考图，手动填写后是否能覆盖自动感应

## 当前统一后的状态

### 线下纯净版

- 坏图兜底协议已统一
- 图片靠近锁图底座已统一
- `Nano Banana 工坊` 已支持靠近白板图片自动锁定参考图

### 历史线下版

- 同类协议已同步
- 同类交互已同步

### 线上商店说明

对应组件说明也要同步写清楚：

- 是否支持参考图
- 是否支持白板邻近自动锁定
- 手动输入是否覆盖自动感应

## 线上到线下的统一落点

以后图片组件链路，统一按下面这条理解：

1. 线上商店定义组件说明和 `plugin_spec`
2. 组件被安装到线下宿主
3. 线下执行组件或底座时，产出统一 `image` 结果
4. 白板统一优先读取 `dataUrl`
5. 如果组件支持参考图，白板统一走邻近感应底座

也就是说：

- 线上决定组件长什么样
- 线下决定组件怎么跑
- 白板决定组件结果怎么显示

这三层必须说同一种协议，不能各写各的

## 新图片组件开发流程

以后每新增一个图片组件，开发顺序固定为：

1. 先选底座

- 如果只是复用现有文生图/改图运行方式，就挂到现有图片底座
- 如果是插件式组件，就按 `plugin_spec` 接入 `PluginShape`

2. 再定输入字段

- 至少明确 `prompt`
- 如果支持参考图，必须明确 `reference_images_field`
- 如果支持比例、尺寸、风格，也都在 spec 里写清楚

3. 再定返回结构

- 统一返回 `dataUrl`
- 统一返回 `publicUrl`
- 统一返回 `mimeType`

4. 最后再做白板交互验收

- 是否能正常预览
- 是否能正常插入白板
- 是否能在附近图片出现时亮绿灯
- 是否手动输入后会覆盖自动感应

## 发布前验收动作

不要只测“接口有没有返回”，要固定做下面这组动作：

1. 空白白板直接生成一次
2. 白板先放一张图，再把组件拖近，确认绿灯出现
3. 不手填参考图，直接运行一次
4. 手动填参考图，再运行一次，确认手动输入生效
5. 刷新页面后，确认结果图仍然能显示
6. 删除组件再重装一次，确认结果协议没有依赖历史缓存

只要这 6 步都过了，基本才算真的可交付

## 以后不能再绕开的硬限制

下面这些以后不要再例外处理：

- 不要只返回 `publicUrl`
- 不要在白板里假设图片一定是 png
- 不要让插件图片组件自己单独发明一套预览逻辑
- 不要让参考图自动感应覆盖用户手动输入
- 不要上线前只测线上，不测线下白板实际展示

## 以后开发时的硬规则

以后所有图片类组件都遵守下面这条，不要例外：

`图片结果统一返回 dataUrl + publicUrl + mimeType；支持参考图的组件统一接入邻近感应底座；手动输入优先于自动感应。`

只要不绕开这条规则，线上下载到线下后的图片组件就不会再反复出现这次这种坏图问题。
