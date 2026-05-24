# 文件存储配置

## 概述

当前项目已经统一使用 `src/storage` 下的 storage 抽象，不再直接依赖旧的 `oss-client` 实现。

默认实现：

- Provider: `S3Provider`
- SDK: `s3mini`
- 适用对象：Cloudflare R2、阿里云 OSS、AWS S3 以及其他 S3-compatible 服务

## 当前相关文件

- `src/storage/index.ts`
- `src/storage/config/storage-config.ts`
- `src/storage/provider/s3.ts`
- `src/app/api/storage/upload/route.ts`
- `src/app/api/upload/route.ts`

## 环境变量

在 `.env.local` 中配置：

```env
STORAGE_REGION="auto"
STORAGE_BUCKET_NAME=""
STORAGE_ACCESS_KEY_ID=""
STORAGE_SECRET_ACCESS_KEY=""
STORAGE_ENDPOINT=""
STORAGE_PUBLIC_URL=""
```

说明：

- `STORAGE_ENDPOINT` 必填，指向你的对象存储 endpoint
- `STORAGE_PUBLIC_URL` 可选；如果配置，会优先用这个地址返回公网 URL
- 阿里云 OSS 也建议通过这套 `STORAGE_*` 变量接入，不再使用旧的 `OSS_*` 或 `MY_OSS_*`

## 上传接口

### 1. 通用上传

`POST /api/storage/upload`

请求参数：

- `file`
- `folder` 可选

用途：

- 走统一 storage 抽象
- 适合新功能接入

### 2. 兼容上传

`POST /api/upload`

请求参数：

- `file`
- `type`: `model` 或 `clothing`

说明：

- 这是兼容旧调用方保留的接口
- 内部已经改为复用统一 storage 抽象
- 返回字段里仍保留 `ossKey`，但实际意义已经是通用 storage key

## 接阿里云 OSS 的建议

如果你继续用阿里云 OSS，可以这样映射：

- `STORAGE_REGION=oss-cn-beijing`
- `STORAGE_BUCKET_NAME=<你的 bucket>`
- `STORAGE_ACCESS_KEY_ID=<你的 AccessKey ID>`
- `STORAGE_SECRET_ACCESS_KEY=<你的 AccessKey Secret>`
- `STORAGE_ENDPOINT=https://oss-cn-beijing.aliyuncs.com`
- `STORAGE_PUBLIC_URL=https://<你的 bucket>.oss-cn-beijing.aliyuncs.com`

## 注意事项

- 上传接口目前限制图片类型为 JPEG / PNG / WebP
- 文件大小限制为 10MB
- 如果需要自定义 CDN 域名，优先配置 `STORAGE_PUBLIC_URL`
- 如果历史文档还提到 `src/lib/oss-client.ts`，以当前这份文档为准
