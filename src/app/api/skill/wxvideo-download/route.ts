import os from 'os';
import path from 'path';
import { requireHermesAdmin } from '@/lib/api-security';
import fs from 'fs/promises';
import { type NextRequest, NextResponse } from 'next/server';

const API = 'https://www.dajiala.com/fbmain/monitor/v3/wxvideo';
const DOWNLOAD_ROOT = path.resolve(
  process.env.WXVIDEO_DOWNLOAD_DIR ||
    path.join(os.tmpdir(), 'dlgzz-wxvideo-downloads')
);

function resolveOutputDir(value: unknown): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw || raw === '~/Desktop/视频下载') return DOWNLOAD_ROOT;
  if (raw.startsWith('~') || path.isAbsolute(raw)) {
    throw new Error('outDir 只能是相对于下载根目录的子目录');
  }

  const resolved = path.resolve(DOWNLOAD_ROOT, raw);
  if (
    resolved !== DOWNLOAD_ROOT &&
    !resolved.startsWith(`${DOWNLOAD_ROOT}${path.sep}`)
  ) {
    throw new Error('outDir 不能跳出下载根目录');
  }

  return resolved;
}

function sanitizeFilename(text: string, maxLen = 64): string {
  return text
    .replace(/[\\/:*?"<>|\n\r]+/g, '_')
    .trim()
    .slice(0, maxLen);
}

async function postJson(
  params: Record<string, string>,
  retries = 5
): Promise<any> {
  const url = new URL(API);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  let lastErr: unknown;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url.toString(), {
        method: 'POST',
        signal: AbortSignal.timeout(45_000),
      });
      if (res.status >= 500) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (!text.trim()) throw new Error('empty response');
      return JSON.parse(text);
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 1200 * (i + 1)));
    }
  }
  throw lastErr;
}

async function resolveV2Name(
  key: string,
  accountName: string
): Promise<string> {
  const js = await postJson({
    type: '6',
    key,
    keywords: accountName,
    verifycode: '',
  });
  const v2Name = js?.v2_info_list?.contact?.username;
  if (!v2Name) throw new Error(`无法解析账号：${accountName}`);
  return v2Name;
}

async function fetchCandidates(
  key: string,
  v2Name: string,
  keyword: string,
  limit: number,
  afterTs: number,
  maxPages = 12
): Promise<any[]> {
  const matches: any[] = [];
  const seen = new Set<string>();
  let lastBuffer = '';
  for (let page = 0; page < maxPages; page++) {
    const js = await postJson({
      type: '1',
      key,
      v2_name: v2Name,
      last_buffer: lastBuffer,
      verifycode: '',
    });
    for (const item of js?.object ?? []) {
      const oid = String(item?.object_id ?? '').trim();
      if (!oid || seen.has(oid)) continue;
      seen.add(oid);
      if (afterTs) {
        try {
          const ts = Math.floor(
            new Date(
              String(item?.publish_time ?? '').replace(' ', 'T')
            ).getTime() / 1000
          );
          if (ts < afterTs) continue;
        } catch {
          /* skip */
        }
      }
      if (String(item?.title ?? '').includes(keyword)) {
        matches.push(item);
        if (matches.length >= limit) return matches;
      }
    }
    const next = js?.last_buffer ?? '';
    if (js?.continue_flag !== 1 || !next || next === lastBuffer) break;
    lastBuffer = next;
  }
  return matches;
}

async function getDownloadDetail(
  key: string,
  objectId: string,
  objectNonceId = ''
): Promise<any> {
  const params: Record<string, string> = {
    type: '3',
    key,
    object_id: objectId,
    verifycode: '',
  };
  if (objectNonceId) params.object_nonce_id = objectNonceId;
  const js = await postJson(params);
  if (js?.code !== 0)
    throw new Error(`获取下载链接失败：object_id=${objectId}`);
  return js;
}

async function downloadFile(url: string, filePath: string): Promise<number> {
  const res = await fetch(url, { signal: AbortSignal.timeout(180_000) });
  if (!res.ok) throw new Error(`下载失败 HTTP ${res.status}`);
  const buffer = await res.arrayBuffer();
  await fs.writeFile(filePath, Buffer.from(buffer));
  return buffer.byteLength;
}

export async function POST(request: NextRequest) {
  const auth = await requireHermesAdmin('微信视频下载接口只允许管理员访问');
  if ('response' in auth) return auth.response;

  const apiKey = process.env.XHS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        success: false,
        error: '缺少 XHS_API_KEY 环境变量，请在 .env.local 中配置',
      },
      { status: 503 }
    );
  }

  try {
    const {
      accountName,
      v2Name: v2NameInput,
      keyword,
      afterDate,
      limit = 5,
      outDir,
    } = await request.json();
    if (!keyword)
      return NextResponse.json(
        { success: false, error: '缺少关键词' },
        { status: 400 }
      );
    if (!accountName && !v2NameInput)
      return NextResponse.json(
        { success: false, error: '缺少账号名称' },
        { status: 400 }
      );

    // afterDate 格式 "YYYY-MM-DD"，转为当天零点的 Unix 时间戳
    const afterTs = afterDate
      ? Math.floor(new Date(afterDate + 'T00:00:00').getTime() / 1000)
      : 0;
    const resolvedOutDir = resolveOutputDir(outDir);
    await fs.mkdir(resolvedOutDir, { recursive: true });

    const v2Name: string =
      v2NameInput || (await resolveV2Name(apiKey, accountName));
    const candidates = await fetchCandidates(
      apiKey,
      v2Name,
      keyword,
      Number(limit) || 5,
      afterTs
    );

    const items: any[] = [];
    for (let idx = 0; idx < candidates.length; idx++) {
      const c = candidates[idx];
      const oid = String(c?.object_id ?? '');
      const nonce = String(c?.object_nonce_id ?? '');
      try {
        const detail = await getDownloadDetail(apiKey, oid, nonce);
        const title = String(detail?.title || c?.title || oid);
        const publishTime = String(
          detail?.publish_time || c?.publish_time || ''
        );
        const base = sanitizeFilename(title, 60);
        const stamp = publishTime.replace(' ', '_').replace(/:/g, '-') || oid;
        const filename = `${String(idx + 1).padStart(2, '0')}_${base}_${stamp}.mp4`;
        const filePath = path.join(resolvedOutDir, filename);

        const fileSize = await downloadFile(detail.download_url, filePath);

        const meta = {
          title,
          publishTime,
          nickname: detail?.nickname || '',
          v2Name: detail?.v2_name || v2Name,
          objectId: oid,
          objectNonceId: detail?.object_nonce_id || nonce,
          downloadUrl: detail?.download_url || '',
          fileSize,
        };
        await fs.writeFile(
          filePath.replace('.mp4', '.json'),
          JSON.stringify(meta, null, 2),
          'utf-8'
        );

        items.push({ index: idx + 1, title, publishTime, filePath, fileSize });
      } catch (e: any) {
        items.push({
          index: idx + 1,
          title: c?.title || oid,
          error: e.message,
        });
      }
    }

    return NextResponse.json({
      success: true,
      count: items.filter((i) => !i.error).length,
      keyword,
      v2Name,
      outDir: resolvedOutDir,
      items,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || '未知错误' },
      { status: 500 }
    );
  }
}
