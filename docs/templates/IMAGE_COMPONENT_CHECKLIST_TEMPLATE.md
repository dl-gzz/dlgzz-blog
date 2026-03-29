# 图片组件开发清单模板

这是一份内部开发清单。

它不是给用户看的，而是给你、我、其他大模型、未来协作者在开发新图片组件时直接照着填的。

目标只有一个：

避免再次出现“组件能生成，但线下显示坏图、参考图失效、安装后行为不一致”这种问题。

---

## 组件基本信息

- 组件名称：
- serviceId：
- docSlug：
- 组件类型：
  - 原生宿主型 / 插件型
- 所属底座：
  - `Text2ImageShape` / `PluginShape` / 其他
- 目标仓库：
  - `dlgzz-blog-main` / `dlgzz-blog-claw-clean-client` / 其他

## 一、先判断这是不是图片组件

- 是否会输出图片结果：
  - 是 / 否
- 是否支持纯文生图：
  - 是 / 否
- 是否支持参考图生图或改图：
  - 是 / 否
- 是否需要白板插图能力：
  - 是 / 否

如果上面有任意一项是“是”，就必须遵守图片组件统一规范：

- `docs/IMAGE_COMPONENT_STANDARD.md`

## 二、确定底座

### A. 原生宿主型

适用于：

- 直接复用线下现有图片 API
- 走宿主自己的 `api/skill/...`
- 前端用固定 shape 渲染

确认项：

- 是否走 `src/app/api/skill/text2image/route.ts`
- 是否走 `src/components/whiteboard/shapes/Text2ImageShape.tsx`

### B. 插件型

适用于：

- 通过 `plugin_spec` 定义输入输出
- 由插件运行时统一调度
- 前端用 `PluginShape` 渲染

确认项：

- 是否走 `src/lib/plugin-runtime.ts`
- 是否走 `src/components/whiteboard/shapes/PluginShape.tsx`

## 三、输入字段清单

至少确认下面这些字段：

- prompt 字段 id：
- prompt 字段 label：
- 比例字段 id：
- 尺寸字段 id：
- 风格字段 id：
- 模型字段 id：

如果支持参考图，必须补全：

- reference_images_field：
- 对应字段 id：
- 字段类型：
  - `multi_text` / 其他
- 占位文案是否写清楚支持：
  - `http(s) URL`
  - `data URL`
  - 本机绝对路径

## 四、输出结果清单

图片结果必须至少包含：

- `image.dataUrl`
- `image.publicUrl`
- `image.mimeType`

建议同时包含：

- `image.fileName`
- `image.latestUrl`
- `image.latestCommonUrl`

验收打勾：

- [ ] 返回里有 `dataUrl`
- [ ] 返回里有 `publicUrl`
- [ ] 返回里有真实 `mimeType`
- [ ] 没有把 `mimeType` 写死成 `image/png`

## 五、白板展示清单

必须确认：

- [ ] shape 内预览优先吃 `dataUrl`
- [ ] 白板插图优先吃 `dataUrl`
- [ ] `publicUrl` 只作为后备或持久化地址
- [ ] 刷新页面后图片仍然能显示
- [ ] 插入白板后的资产 mimeType 正确

## 六、参考图与绿灯感应清单

如果组件支持参考图，必须确认：

- [ ] 已声明 `reference_images_field`
- [ ] 白板附近有图片时会亮绿灯
- [ ] 用户没手填参考图时，会自动吃附近图片
- [ ] 用户手动输入后，自动感应不会覆盖手动输入
- [ ] 参考图为空时，也不会导致组件报错

## 七、线上文章清单

如果这个组件要上架到线上商店，必须确认文章层是否同步：

- [ ] 正文能让人看懂这是做什么的
- [ ] `service_manifest` 已补全
- [ ] `agent_spec` 已补全
- [ ] 文章里写清楚是否支持参考图
- [ ] 文章里写清楚是否支持白板近场自动锁定
- [ ] 文章里写清楚手动输入优先于自动感应

## 八、线下安装清单

- [ ] 线上安装后，线下白板能出现对应组件
- [ ] 新安装组件首次打开不报错
- [ ] 缺 key 时提示清楚
- [ ] 有 key 时能直接运行
- [ ] 卸载后没有异常残留

## 九、OpenClaw 可调用清单

如果这个组件要被 OpenClaw 调用，必须确认：

- [ ] catalog 里能看到它
- [ ] spec 里能看到真实输入字段
- [ ] spec 说明足够让 Agent 理解用途
- [ ] run 时字段名与 spec 一致
- [ ] 缺 key / 缺配置时会明确报错

## 十、上线前 6 步实测

- [ ] 空白白板直接生成一次
- [ ] 白板先放一张图，再拖组件靠近，确认绿灯出现
- [ ] 不手填参考图，直接生成一次
- [ ] 手动填写参考图，再生成一次
- [ ] 刷新页面后确认图片仍可显示
- [ ] 删除再重装一次，确认不依赖历史缓存

## 十一、发布结论

- 是否达到上线标准：
  - 是 / 否
- 如果不上线，卡点是什么：
- 如果上线，风险备注是什么：

## 十二、交付备注

- 线上改动文件：
- 线下改动文件：
- 是否需要同步文档：
  - 是 / 否
- 是否需要同步 OpenClaw 说明：
  - 是 / 否

---

## 最终一句话检查

发布前最后问自己一句：

这个组件现在是不是已经满足：

`返回 dataUrl + publicUrl + mimeType，白板优先吃 dataUrl，支持参考图时能亮绿灯且手动输入优先。`

如果这句话不能明确回答“是”，就还不能算真正完成。
