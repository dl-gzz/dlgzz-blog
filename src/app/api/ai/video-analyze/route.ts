import { NextRequest, NextResponse } from 'next/server';

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
  try {
    const { frameBase64, mimeType = 'image/jpeg', videoName = '' } = await request.json();

    if (!frameBase64) {
      return NextResponse.json({ success: false, error: '缺少视频帧数据' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    const model = process.env.GEMINI_MODEL || 'gemini-3.1-pro-preview';

    if (!apiKey) {
      return NextResponse.json({ success: false, error: 'GEMINI_API_KEY 未配置' }, { status: 500 });
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const textPrompt = videoName
      ? `${ANALYSIS_PROMPT}\n\n视频文件名：${videoName}`
      : ANALYSIS_PROMPT;

    const body = {
      contents: [
        {
          parts: [
            { text: textPrompt },
            {
              inlineData: {
                mimeType,
                data: frameBase64,
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
        { success: false, error: `Gemini 请求失败: ${res.status}` },
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
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
