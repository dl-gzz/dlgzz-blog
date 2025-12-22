# 阿里云OSS图片上传配置

## 概述

本项目使用阿里云OSS（Object Storage Service）来存储用户上传的模特图片和服装图片。

## 前置条件

1. 拥有阿里云账号
2. 已开通OSS服务
3. 已创建OSS Bucket

## 配置步骤

### 1. 创建OSS Bucket

1. 登录[阿里云OSS控制台](https://oss.console.aliyun.com/)
2. 点击"创建Bucket"
3. 填写以下信息：
   - Bucket名称：`outfittest`（或你自定义的名称）
   - 地域：选择离用户最近的地域（如：华北2-北京）
   - 存储类型：标准存储
   - 读写权限：公共读
4. 点击"确定"创建

### 2. 获取访问密钥

1. 登录[RAM控制台](https://ram.console.aliyun.com/users)
2. 创建RAM用户或使用现有用户
3. 为用户添加OSS权限：`AliyunOSSFullAccess`
4. 创建AccessKey，记录以下信息：
   - AccessKey ID
   - AccessKey Secret

### 3. 配置环境变量

在项目根目录的`.env.local`文件中添加以下配置：

```env
# 阿里云OSS配置
OSS_ACCESS_KEY_ID="你的AccessKey ID"
OSS_ACCESS_KEY_SECRET="你的AccessKey Secret"
```

### 4. 更新OSS配置

如果你的Bucket名称或地域与默认配置不同，请修改 `src/lib/oss-client.ts` 文件：

```typescript
export const ossClient = new OSS({
  accessKeyId: process.env.OSS_ACCESS_KEY_ID,
  accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
  region: 'oss-cn-beijing', // 修改为你的地域
  authorizationV4: true,
  bucket: 'outfittest', // 修改为你的Bucket名称
  endpoint: 'https://oss-cn-beijing.aliyuncs.com', // 修改为你的地域对应的endpoint
});
```

同时更新 `getOssUrl` 函数中的URL：

```typescript
export function getOssUrl(ossKey: string): string {
  return `https://你的bucket名称.oss-cn-beijing.aliyuncs.com/${ossKey}`;
}
```

## 文件上传功能

### 支持的功能

1. **模特图片上传**
   - 格式：JPEG、PNG、WebP
   - 大小限制：10MB
   - 存储路径：`models/` 目录

2. **服装图片上传**
   - 格式：JPEG、PNG、WebP
   - 大小限制：10MB
   - 存储路径：`clothes/` 目录

### 上传流程

1. 用户选择图片文件
2. 前端验证文件格式和大小
3. 调用 `/api/upload` API
4. 文件上传到OSS
5. 返回公网访问URL

### API接口

**POST** `/api/upload`

请求参数：
- `file`: 图片文件
- `type`: 上传类型（`model` 或 `clothing`）

响应格式：
```json
{
  "success": true,
  "url": "https://outfittest.oss-cn-beijing.aliyuncs.com/models/1234567890-abc123.jpg",
  "ossKey": "models/1234567890-abc123.jpg",
  "filename": "model.jpg",
  "size": 1024000,
  "type": "image/jpeg"
}
```

## 安全考虑

1. **访问权限**：Bucket设置为公共读，确保图片可以被前端访问
2. **文件验证**：严格验证文件类型和大小
3. **文件命名**：使用时间戳和随机字符串生成唯一文件名
4. **密钥安全**：AccessKey信息存储在环境变量中，不要提交到代码仓库

## 故障排除

### 常见错误

1. **403 Forbidden**
   - 检查AccessKey权限是否正确
   - 确认RAM用户有OSS访问权限

2. **跨域问题**
   - 在OSS控制台配置CORS规则
   - 允许来源：你的网站域名
   - 允许方法：GET, POST, PUT
   - 允许头信息：*

3. **上传失败**
   - 检查网络连接
   - 确认Bucket名称和地域配置正确
   - 查看浏览器控制台错误信息

### CORS配置示例

在OSS控制台的跨域设置中添加：

```xml
<CORSRule>
  <AllowedOrigin>http://localhost:3000</AllowedOrigin>
  <AllowedOrigin>https://你的域名.com</AllowedOrigin>
  <AllowedMethod>GET</AllowedMethod>
  <AllowedMethod>POST</AllowedMethod>
  <AllowedMethod>PUT</AllowedMethod>
  <AllowedHeader>*</AllowedHeader>
  <ExposeHeader>ETag</ExposeHeader>
</CORSRule>
```

## 成本优化

1. **生命周期管理**：设置自动删除过期文件
2. **存储类型**：根据访问频率选择合适的存储类型
3. **CDN加速**：配置阿里云CDN加速图片访问 