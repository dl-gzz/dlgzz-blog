import { ossClient, generateUniqueFileName, getOssUrl } from '@/lib/oss-client';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const type = formData.get('type') as string; // 'model' | 'clothing'
    
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    if (!type || !['model', 'clothing'].includes(type)) {
      return NextResponse.json(
        { error: 'Invalid upload type. Must be "model" or "clothing"' },
        { status: 400 }
      );
    }

    // 验证文件类型
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Only JPEG, PNG, and WebP are allowed.' },
        { status: 400 }
      );
    }

    // 验证文件大小（限制为10MB）
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'File size too large. Maximum size is 10MB.' },
        { status: 400 }
      );
    }

    // 生成唯一文件名
    const prefix = type === 'model' ? 'models/' : 'clothes/';
    const ossKey = generateUniqueFileName(file.name, prefix);

    // 将文件转换为Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 设置自定义请求头
    const headers = {
      'x-oss-storage-class': 'Standard',
      'x-oss-object-acl': 'public-read', // 设置为公共读取
      'Content-Type': file.type,
    };

    // 上传到OSS
    const result = await ossClient.put(ossKey, buffer, { headers });

    if (result.res?.status === 200) {
      const publicUrl = getOssUrl(ossKey);
      
      return NextResponse.json({
        success: true,
        url: publicUrl,
        ossKey: ossKey,
        filename: file.name,
        size: file.size,
        type: file.type
      });
    } else {
      throw new Error('Upload failed');
    }

  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Upload failed. Please try again.' },
      { status: 500 }
    );
  }
} 