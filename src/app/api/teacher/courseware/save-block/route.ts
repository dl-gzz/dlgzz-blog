import { savePromptBlockToDatabase } from '@/lib/edu-content';
import { type NextRequest, NextResponse } from 'next/server';

function readText(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const mdx = readText(body.mdx);

    if (!mdx) {
      return NextResponse.json(
        { success: false, error: '缺少可保存的 MDX Block' },
        { status: 400 }
      );
    }

    const saved = await savePromptBlockToDatabase({
      title: readText(body.title),
      slug: readText(body.slug),
      description: readText(body.description),
      whiteboardPrompt: readText(body.whiteboardPrompt),
      mdx,
      provider: readText(body.provider),
      model: readText(body.model),
      locale: readText(body.locale, 'zh'),
    });

    return NextResponse.json({
      success: true,
      saved,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '保存 MDX Block 失败',
      },
      { status: 500 }
    );
  }
}
