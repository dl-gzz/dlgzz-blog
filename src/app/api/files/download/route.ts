/**
 * 文件下载 API - 支持权限控制和下载统计
 * 支持：公开文件、需要登录、需要付费订阅
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/server';
import { hasAccessToPremiumContent } from '@/lib/premium-access';
import { getDb } from '@/db';
import { fileDownload } from '@/db/schema';
import { nanoid } from 'nanoid';
import path from 'path';
import fs from 'fs';

export async function GET(req: NextRequest) {
  try {
    const db = await getDb();
    const searchParams = req.nextUrl.searchParams;
    const fileKey = searchParams.get('key');
    const requireAuth = searchParams.get('auth') === 'true';
    const requirePremium = searchParams.get('premium') === 'true';

    if (!fileKey) {
      return NextResponse.json(
        { error: '缺少文件标识' },
        { status: 400 }
      );
    }

    // 权限检查
    if (requireAuth || requirePremium) {
      const session = await getSession();

      // 检查是否登录
      if (!session?.user) {
        return NextResponse.json(
          { error: '请先登录才能下载此文件' },
          { status: 401 }
        );
      }

      // 检查是否需要付费订阅
      if (requirePremium) {
        const hasPremium = await hasAccessToPremiumContent();
        if (!hasPremium) {
          return NextResponse.json(
            { error: '此文件需要付费订阅才能下载，请升级您的订阅计划' },
            { status: 403 }
          );
        }
      }
    }

    // 构建文件路径
    // 受保护的文件放在 private-files 目录
    // 公开文件放在 public/files 目录
    let filePath: string;

    if (requireAuth || requirePremium) {
      // 受保护的文件
      filePath = path.join(process.cwd(), 'private-files', fileKey);
    } else {
      // 公开文件
      filePath = path.join(process.cwd(), 'public', 'files', fileKey);
    }

    // 安全检查：防止路径遍历攻击
    const normalizedPath = path.normalize(filePath);
    const baseDir = requireAuth || requirePremium
      ? path.join(process.cwd(), 'private-files')
      : path.join(process.cwd(), 'public', 'files');

    if (!normalizedPath.startsWith(baseDir)) {
      return NextResponse.json(
        { error: '非法的文件路径' },
        { status: 400 }
      );
    }

    // 检查文件是否存在
    if (!fs.existsSync(normalizedPath)) {
      return NextResponse.json(
        { error: '文件不存在' },
        { status: 404 }
      );
    }

    // 读取文件
    const fileBuffer = fs.readFileSync(normalizedPath);
    const fileName = path.basename(normalizedPath);

    // 获取文件的 MIME 类型
    const ext = path.extname(fileName).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.zip': 'application/zip',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.ppt': 'application/vnd.ms-powerpoint',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      '.txt': 'text/plain',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
    };

    const contentType = mimeTypes[ext] || 'application/octet-stream';

    // 获取用户信息
    const session = await getSession();
    const userId = session?.user?.id || null;
    const userEmail = session?.user?.email || null;

    // 获取请求信息
    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    const userAgent = req.headers.get('user-agent') || 'unknown';
    const referer = req.headers.get('referer') || null;

    // 记录下载统计到数据库
    try {
      await db.insert(fileDownload).values({
        id: nanoid(),
        fileKey,
        fileName,
        fileSize: fileBuffer.length,
        userId,
        userEmail,
        ipAddress,
        userAgent,
        referer,
        requireAuth,
        requirePremium,
      });
      console.log(`✅ Download stats recorded for: ${fileName}`);
    } catch (dbError) {
      // 统计记录失败不影响下载
      console.warn('⚠️ Failed to record download stats (database not configured):', dbError instanceof Error ? dbError.message : 'Unknown error');
    }

    // 控制台日志
    console.log(`File downloaded: ${fileName} by user: ${userEmail || 'anonymous'}`);

    // 返回文件
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
        'Content-Length': fileBuffer.length.toString(),
        'Cache-Control': 'private, max-age=0',
      },
    });

  } catch (error: any) {
    console.error('文件下载错误:', error);
    return NextResponse.json(
      {
        error: '下载失败，请稍后重试',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}
