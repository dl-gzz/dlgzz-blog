/**
 * 文件下载统计 API
 * 查看文件下载统计信息
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/server';
import { getDb } from '@/db';
import { fileDownload } from '@/db/schema';
import { desc, eq, sql } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  try {
    const db = await getDb();
    // 检查管理员权限
    const session = await getSession();
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json(
        { error: '需要管理员权限' },
        { status: 403 }
      );
    }

    const searchParams = req.nextUrl.searchParams;
    const fileKey = searchParams.get('fileKey');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // 如果指定了文件，返回该文件的统计
    if (fileKey) {
      const stats = await db
        .select()
        .from(fileDownload)
        .where(eq(fileDownload.fileKey, fileKey))
        .orderBy(desc(fileDownload.downloadedAt))
        .limit(limit)
        .offset(offset);

      const total = await db
        .select({ count: sql<number>`count(*)` })
        .from(fileDownload)
        .where(eq(fileDownload.fileKey, fileKey));

      return NextResponse.json({
        stats,
        total: total[0]?.count || 0,
        limit,
        offset,
      });
    }

    // 返回所有文件的统计摘要
    const summary = await db
      .select({
        fileKey: fileDownload.fileKey,
        fileName: fileDownload.fileName,
        downloadCount: sql<number>`count(*)`,
        lastDownload: sql<Date>`max(${fileDownload.downloadedAt})`,
        uniqueUsers: sql<number>`count(distinct ${fileDownload.userId})`,
      })
      .from(fileDownload)
      .groupBy(fileDownload.fileKey, fileDownload.fileName)
      .orderBy(desc(sql`count(*)`))
      .limit(limit)
      .offset(offset);

    const totalFiles = await db
      .select({ count: sql<number>`count(distinct ${fileDownload.fileKey})` })
      .from(fileDownload);

    return NextResponse.json({
      summary,
      totalFiles: totalFiles[0]?.count || 0,
      limit,
      offset,
    });

  } catch (error: any) {
    console.error('获取下载统计错误:', error);
    return NextResponse.json(
      {
        error: '获取统计失败',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}
