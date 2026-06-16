import { extractSavedCoursewareHtml, getCoursewareMdxPost } from '@/lib/courseware-mdx';
import { type NextRequest, NextResponse } from 'next/server';

function injectStudentIdGuard(html: string, studentId: string) {
  const safeStudentId = JSON.stringify(studentId);
  const script = `<script>
(function(){
  var targetStudentId = ${safeStudentId};
  if (!targetStudentId) return;
  var originalPostMessage = window.parent && window.parent.postMessage ? window.parent.postMessage.bind(window.parent) : null;
  if (!originalPostMessage) return;
  window.parent.postMessage = function(message, targetOrigin, transfer) {
    try {
      if (message && typeof message === 'object' && message.type === 'quiz_result') {
        message = Object.assign({}, message, { studentId: targetStudentId });
      }
    } catch (error) {}
    return originalPostMessage(message, targetOrigin || '*', transfer);
  };
})();
</script>`;
  const replaced = html.replaceAll('__DLGZZ_STUDENT_ID__', studentId);
  if (replaced.includes('</body>')) {
    return replaced.replace('</body>', `${script}</body>`);
  }
  return `${replaced}${script}`;
}

export async function GET(request: NextRequest) {
  try {
    const slug = request.nextUrl.searchParams.get('slug') || '';
    const locale = request.nextUrl.searchParams.get('locale') || 'zh';
    const studentId = request.nextUrl.searchParams.get('studentId') || '';

    if (!slug.trim()) {
      return NextResponse.json(
        { success: false, error: '缺少课件 slug' },
        { status: 400 }
      );
    }

    const post = getCoursewareMdxPost(slug, locale);
    if (!post) {
      return NextResponse.json(
        { success: false, error: '没有找到对应的 MDX 课件' },
        { status: 404 }
      );
    }

    const html = extractSavedCoursewareHtml(post.body);
    if (!html) {
      return NextResponse.json(
        { success: false, error: '这篇 MDX 里没有已保存的课件 HTML' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      post: {
        slug: post.slug,
        title: post.title,
        description: post.description,
      },
      operations: [
        {
          action: 'create',
          type: 'preview_html',
          x: 16,
          y: 72,
          props: {
            w: 820,
            h: 620,
            html: injectStudentIdGuard(html, studentId),
          },
        },
      ],
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '读取已保存课件失败',
      },
      { status: 500 }
    );
  }
}
