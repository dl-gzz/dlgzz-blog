import { NextRequest, NextResponse } from 'next/server';

const API = 'https://www.dajiala.com/fbmain/monitor/v3/wxvideo';

async function postJson(params: Record<string, string>, retries = 5): Promise<any> {
  const url = new URL(API);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  let lastErr: unknown;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url.toString(), { method: 'POST', signal: AbortSignal.timeout(45_000) });
      if (res.status >= 500) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (!text.trim()) throw new Error('empty response');
      return JSON.parse(text);
    } catch (e) {
      lastErr = e;
      await new Promise(r => setTimeout(r, 1200 * (i + 1)));
    }
  }
  throw lastErr;
}

async function resolveV2Name(key: string, accountName: string): Promise<string> {
  const js = await postJson({ type: '6', key, keywords: accountName, verifycode: '' });
  const v2Name = js?.v2_info_list?.contact?.username;
  if (!v2Name) throw new Error(`无法解析账号：${accountName}`);
  return v2Name;
}

async function fetchCandidates(
  key: string, v2Name: string, keyword: string,
  limit: number, afterTs: number, maxPages = 12
): Promise<any[]> {
  const matches: any[] = [];
  const seen = new Set<string>();
  let lastBuffer = '';
  for (let page = 0; page < maxPages; page++) {
    const js = await postJson({ type: '1', key, v2_name: v2Name, last_buffer: lastBuffer, verifycode: '' });
    for (const item of (js?.object ?? [])) {
      const oid = String(item?.object_id ?? '').trim();
      if (!oid || seen.has(oid)) continue;
      seen.add(oid);
      if (afterTs) {
        try {
          const ts = Math.floor(new Date(String(item?.publish_time ?? '').replace(' ', 'T')).getTime() / 1000);
          if (ts < afterTs) continue;
        } catch { /* skip */ }
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

async function getDownloadDetail(key: string, objectId: string, objectNonceId = ''): Promise<any> {
  const params: Record<string, string> = { type: '3', key, object_id: objectId, verifycode: '' };
  if (objectNonceId) params.object_nonce_id = objectNonceId;
  const js = await postJson(params);
  if (js?.code !== 0) throw new Error(`获取下载链接失败：object_id=${objectId}`);
  return js;
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.XHS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { success: false, error: '缺少 XHS_API_KEY 环境变量' },
      { status: 503 }
    );
  }

  try {
    const { accountName, v2Name: v2NameInput, keyword, days, limit = 5 } = await request.json();
    if (!keyword) return NextResponse.json({ success: false, error: '缺少关键词' }, { status: 400 });
    if (!accountName && !v2NameInput) return NextResponse.json({ success: false, error: '缺少账号名称' }, { status: 400 });

    const afterTs = days ? Math.floor(Date.now() / 1000) - Number(days) * 86400 : 0;
    const v2Name: string = v2NameInput || await resolveV2Name(apiKey, accountName);
    const candidates = await fetchCandidates(apiKey, v2Name, keyword, Number(limit) || 5, afterTs);

    const items = await Promise.all(
      candidates.map(async (c, idx) => {
        const oid = String(c?.object_id ?? '');
        const nonce = String(c?.object_nonce_id ?? '');
        try {
          const detail = await getDownloadDetail(apiKey, oid, nonce);
          const title = String(detail?.title || c?.title || oid);
          const publishTime = String(detail?.publish_time || c?.publish_time || '');
          // 生成安全的文件名
          const safeName = title.replace(/[\\/:*?"<>|\n\r]+/g, '_').trim().slice(0, 60);
          const stamp = publishTime.replace(' ', '_').replace(/:/g, '-') || oid;
          const filename = `${String(idx + 1).padStart(2, '0')}_${safeName}_${stamp}.mp4`;
          return {
            index: idx + 1,
            title,
            publishTime,
            filename,
            downloadUrl: detail?.download_url || '',
          };
        } catch (e: any) {
          return { index: idx + 1, title: c?.title || oid, filename: '', downloadUrl: '', error: e.message };
        }
      })
    );

    return NextResponse.json({ success: true, count: items.filter(i => !i.error).length, keyword, v2Name, items });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || '未知错误' }, { status: 500 });
  }
}
