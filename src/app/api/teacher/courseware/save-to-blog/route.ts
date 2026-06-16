import { saveGeneratedCoursewareMdx } from '@/lib/courseware-mdx';
import { type NextRequest, NextResponse } from 'next/server';

function readText(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function findHtmlFromPlan(plan: unknown) {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return '';
  const operations = (plan as { operations?: unknown }).operations;
  if (!Array.isArray(operations)) return '';

  for (const operation of operations) {
    if (!operation || typeof operation !== 'object' || Array.isArray(operation)) continue;
    const props = (operation as { props?: unknown }).props;
    if (!props || typeof props !== 'object' || Array.isArray(props)) continue;
    const html = readText((props as { html?: unknown }).html);
    if (html) return html;
  }

  return '';
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const plan = body.plan;
    const html = readText(body.html) || findHtmlFromPlan(plan);

    const saved = saveGeneratedCoursewareMdx({
      title: readText(body.title, 'AI 互动课件'),
      slug: readText(body.slug),
      description: readText(body.description),
      sourceSlug: readText(body.sourceSlug),
      whiteboardPrompt: readText(body.whiteboardPrompt),
      html,
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
        error: error instanceof Error ? error.message : '保存到博客失败',
      },
      { status: 500 }
    );
  }
}
