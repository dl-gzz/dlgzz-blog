import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

const SCRIPT_PATH =
  process.env.WXVIDEO_SCRIPT_PATH ||
  path.resolve('/Users/baiyang/Desktop/wxvideo-download/scripts/download_wxvideo.py');

const DEFAULT_OUT_DIR =
  process.env.WXVIDEO_OUT_DIR || path.resolve('/Users/baiyang/Desktop/视频下载');

export async function POST(request: NextRequest) {
  try {
    const { accountName, keyword, days, limit = 5, outDir } = await request.json();

    if (!keyword) {
      return NextResponse.json({ success: false, error: '缺少关键词' }, { status: 400 });
    }
    if (!accountName) {
      return NextResponse.json({ success: false, error: '缺少账号名称' }, { status: 400 });
    }

    const apiKey = process.env.XHS_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ success: false, error: '缺少 XHS_API_KEY 环境变量' }, { status: 500 });
    }

    const resolvedOutDir = outDir?.replace('~', process.env.HOME || '') || DEFAULT_OUT_DIR;

    // 时间过滤：如果指定了天数，计算截止时间戳
    const afterTs = days ? Math.floor(Date.now() / 1000) - Number(days) * 86400 : null;

    const cmd = [
      'python3',
      JSON.stringify(SCRIPT_PATH),
      '--key', JSON.stringify(apiKey),
      '--account-name', JSON.stringify(accountName),
      '--keyword', JSON.stringify(keyword),
      '--limit', String(Number(limit) || 5),
      '--out-dir', JSON.stringify(resolvedOutDir),
      ...(afterTs ? ['--after-ts', String(afterTs)] : []),
    ].join(' ');

    const { stdout } = await execAsync(cmd, { timeout: 120_000 });

    const summary = JSON.parse(stdout);
    return NextResponse.json({
      success: true,
      count: summary.count,
      items: summary.items,
      outDir: resolvedOutDir,
    });
  } catch (error: any) {
    const msg = error?.stderr || error?.message || '未知错误';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
