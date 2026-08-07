import { NextRequest, NextResponse } from 'next/server';
import { requireSameOrigin, requireSession } from '@/lib/api-security';
import { hasAccessToPremiumContent } from '@/lib/premium-access';

export const maxDuration = 60;

const ANALYSIS_PROMPT = `你是一位资深的自媒体内容分析专家。请对这个视频截图进行深度分析，从自媒体创作者的角度提供专业见解。

分析维度：
1. 🎣 **开头钩子**：画面如何在前几秒抓住注意力？用了什么视觉或信息技巧？
2. 🎬 **视觉构图**：画面布局、字幕设计、色彩运用有什么值得借鉴的？
3. 📝 **内容套路**：这条视频可能在用什么内容结构或表达模式？
4. 🎯 **受众定位**：从画面判断目标人群和内容定位？
5. ✍️ **可复用创作技巧**：有哪些具体技巧值得学习借鉴？

请用简洁的要点格式输出，每条直接实用，不要废话。`;

export async function POST(request: NextRequest) {
  const csrf = requireSameOrigin(request);
  if (csrf) return csrf;
  const auth = await requireSession('请先登录后再使用视频分析');
  if ('response' in auth) return auth.response;
  if (!(await hasAccessToPremiumContent())) {
    return NextResponse.json(
      { success: false, code: 'PREMIUM_REQUIRED', error: '视频分析仅限付费用户使用' },
      { status: 403 }
    );
  }

  try {
    const { frameBase64, mimeType = 'image/jpeg', videoName = '' } = await request.json();

    if (typeof frameBase64 !== 'string' || !frameBase64.trim()) {
      return NextResponse.json({ success: false, error: '缺少视频帧数据' }, { status: 400 });
    }

    const normalizedMimeType = typeof mimeType === 'string' ? mimeType.trim().toLowerCase() : '';
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(normalizedMimeType)) {
      return NextResponse.json({ success: false, error: '仅支持 JPEG、PNG 或 WebP 图片帧' }, { status: 400 });
    }

    const rawBase64 = frameBase64.replace(/^data:image\/[a-z0-9.+-]+;base64,/i, '').trim();
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(rawBase64)) {
      return NextResponse.json({ success: false, error: '图片帧格式无效' }, { status: 400 });
    }
    const decodedBytes = Math.floor((rawBase64.length * 3) / 4) - (rawBase64.endsWith('==') ? 2 : rawBase64.endsWith('=') ? 1 : 0);
    if (decodedBytes <= 0 || decodedBytes > 8 * 1024 * 1024) {
      return NextResponse.json({ success: false, error: '图片帧不能超过 8MB' }, { status: 413 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    const model = process.env.GEMINI_MODEL || 'gemini-3.1-pro-preview';

    if (!apiKey) {
      return NextResponse.json({ success: false, error: 'GEMINI_API_KEY 未配置' }, { status: 500 });
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const safeVideoName = typeof videoName === 'string' ? videoName.trim().slice(0, 200) : '';
    const textPrompt = safeVideoName
      ? `${ANALYSIS_PROMPT}\n\n视频文件名：${safeVideoName}`
      : ANALYSIS_PROMPT;

    const body = {
      contents: [
        {
          parts: [
            { text: textPrompt },
            {
              inlineData: {
                mimeType: normalizedMimeType,
                data: rawBase64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        maxOutputTokens: 2048,
        temperature: 0.7,
      },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Gemini multimodal error:', err);
      return NextResponse.json(
        { success: false, error: 'Gemini 请求失败，请稍后重试' },
        { status: 500 }
      );
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return NextResponse.json({ success: false, error: 'Gemini 返回内容为空' }, { status: 500 });
    }

    return NextResponse.json({ success: true, analysis: text });
  } catch (error) {
    console.error('video-analyze error:', error);
    return NextResponse.json(
      { success: false, error: '视频分析失败，请稍后重试' },
      { status: 500 }
    );
  }
}
