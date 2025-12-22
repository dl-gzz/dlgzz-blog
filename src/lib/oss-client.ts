const OSS = require('ali-oss');

// 只在有配置时才初始化 OSS 客户端
export const ossClient = process.env.MY_OSS_ACCESS_KEY_ID && process.env.MY_OSS_ACCESS_KEY_SECRET
  ? new OSS({
      // 从环境变量中获取访问凭证
      accessKeyId: process.env.MY_OSS_ACCESS_KEY_ID,
      accessKeySecret: process.env.MY_OSS_ACCESS_KEY_SECRET,
      // 填写Bucket所在地域
      region: 'oss-cn-beijing',
      // 使用V4签名算法
      authorizationV4: true,
      // 填写Bucket名称
      bucket: 'outfittest',
      // 填写Bucket所在地域对应的公网Endpoint
      endpoint: 'https://oss-cn-beijing.aliyuncs.com',
    })
  : null;

/**
 * 生成唯一的文件名
 * @param originalName 原始文件名
 * @param prefix 文件前缀（如 'models/', 'clothes/'）
 * @returns 唯一的文件名
 */
export function generateUniqueFileName(originalName: string, prefix: string = ''): string {
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(2, 15);
  const extension = originalName.split('.').pop();
  return `${prefix}${timestamp}-${randomString}.${extension}`;
}

/**
 * 获取OSS文件的公网访问URL
 * @param ossKey OSS对象键名
 * @returns 公网访问URL
 */
export function getOssUrl(ossKey: string): string {
  return `https://outfittest.oss-cn-beijing.aliyuncs.com/${ossKey}`;
}
