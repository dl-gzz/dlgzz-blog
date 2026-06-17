'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  BookOpen,
  CheckCircle2,
  ExternalLink,
  FileText,
  Loader2,
  Play,
  Save,
  WandSparkles,
} from 'lucide-react';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

type CoursewarePost = {
  slug: string;
  fileName: string;
  title: string;
  description: string;
  date?: string;
  whiteboardCategory?: string;
  whiteboardPrompt?: string;
  hasWhiteboardPrompt?: boolean;
  hasSavedCourseware?: boolean;
  bodyPreview?: string;
};

type BoardOperation = {
  action: string;
  type?: string;
  x?: number;
  y?: number;
  props?: {
    w?: number;
    h?: number;
    html?: string;
    text?: string;
    color?: string;
  };
};

type GenerateResult = {
  provider?: string;
  model?: string;
  plan?: {
    thought?: string;
    voice_response?: string;
    operations?: BoardOperation[];
  };
};

type SavedCoursewareInfo = {
  slug: string;
  fileName: string;
  url: string;
  title: string;
};

function findPreviewHtml(result: GenerateResult | null) {
  const operations = result?.plan?.operations || [];
  const htmlOperation = operations.find(
    (operation) =>
      operation.action === 'create' &&
      (operation.type === 'preview_html' || operation.type === 'html' || operation.type === 'app') &&
      operation.props?.html
  );
  return htmlOperation?.props?.html || '';
}

function getPreviewSize(result: GenerateResult | null) {
  const operation = result?.plan?.operations?.find((item) => item.props?.html);
  return {
    width: Math.min(920, Math.max(360, Number(operation?.props?.w || 820))),
    height: Math.min(680, Math.max(420, Number(operation?.props?.h || 620))),
  };
}

function toClientSlug(value: string, fallback = 'courseware') {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
  return normalized || `${fallback}-${Date.now()}`;
}

export function CoursewareBackendClient() {
  const params = useParams<{ locale?: string }>();
  const locale = params?.locale || 'zh';
  const [posts, setPosts] = useState<CoursewarePost[]>([]);
  const [selectedSlug, setSelectedSlug] = useState('');
  const [search, setSearch] = useState('');
  const [studentId, setStudentId] = useState('测试1号');
  const [lessonId, setLessonId] = useState('teacher-courseware-demo');
  const [extraPrompt, setExtraPrompt] = useState(
    '生成类似徐老师交互课件风格：图形清晰、步骤切换、支持触屏拖动，并在最后用一道题检查理解。'
  );
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [savingBlog, setSavingBlog] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [saveTitle, setSaveTitle] = useState('');
  const [saveSlug, setSaveSlug] = useState('');
  const [savedInfo, setSavedInfo] = useState<SavedCoursewareInfo | null>(null);

  useEffect(() => {
    let stopped = false;
    async function loadPosts() {
      setLoadingPosts(true);
      setError('');
      try {
        const response = await fetch(`/api/teacher/courseware/mdx-posts?locale=${locale}`);
        const data = await response.json();
        if (!response.ok || !data?.success) {
          throw new Error(data?.error || `HTTP ${response.status}`);
        }
        if (stopped) return;
        const nextPosts = Array.isArray(data.posts) ? data.posts : [];
        setPosts(nextPosts);
        const firstEducation =
          nextPosts.find((post: CoursewarePost) => post.whiteboardCategory === 'education') ||
          nextPosts[0];
        if (firstEducation) setSelectedSlug(firstEducation.slug);
      } catch (loadError) {
        if (!stopped) {
          setError(loadError instanceof Error ? loadError.message : '读取 MDX 失败');
        }
      } finally {
        if (!stopped) setLoadingPosts(false);
      }
    }
    void loadPosts();
    return () => {
      stopped = true;
    };
  }, [locale]);

  const selectedPost = useMemo(
    () => posts.find((post) => post.slug === selectedSlug) || null,
    [posts, selectedSlug]
  );

  useEffect(() => {
    if (!selectedPost) return;
    setSaveTitle(`${selectedPost.title}（AI课件）`);
    setSaveSlug(toClientSlug(`${selectedPost.slug}-courseware`));
    setSavedInfo(null);
  }, [selectedPost]);

  const filteredPosts = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return posts;
    return posts.filter((post) =>
      `${post.title} ${post.description} ${post.slug} ${post.whiteboardPrompt || ''}`
        .toLowerCase()
        .includes(keyword)
    );
  }, [posts, search]);

  const previewHtml = findPreviewHtml(result);
  const previewSize = getPreviewSize(result);

  async function generateCourseware() {
    if (!selectedPost || generating) return;

    setGenerating(true);
    setError('');
    setResult(null);
    setSavedInfo(null);
    try {
      const response = await fetch('/api/teacher/courseware/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: selectedPost.slug,
          locale,
          studentId,
          extraPrompt,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || `HTTP ${response.status}`);
      }
      setResult({
        provider: data.provider,
        model: data.model,
        plan: data.plan,
      });
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : '生成失败');
    } finally {
      setGenerating(false);
    }
  }

  async function saveToBlog() {
    if (!selectedPost || !result?.plan?.operations?.length || savingBlog) return;

    setSavingBlog(true);
    setError('');
    try {
      const response = await fetch('/api/teacher/courseware/save-to-blog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: saveTitle || `${selectedPost.title}（AI课件）`,
          slug: saveSlug || `${selectedPost.slug}-courseware`,
          description: `由《${selectedPost.title}》生成的可复用触屏互动课件。`,
          sourceSlug: selectedPost.slug,
          whiteboardPrompt:
            selectedPost.whiteboardPrompt ||
            `打开已保存的互动课件《${saveTitle || selectedPost.title}》。`,
          locale,
          provider: result.provider,
          model: result.model,
          plan: result.plan,
          html: previewHtml,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || `HTTP ${response.status}`);
      }
      setSavedInfo(data.saved);
      setPosts((current) => [
        {
          slug: data.saved.slug,
          fileName: data.saved.fileName,
          title: data.saved.title,
          description: data.saved.description,
          date: new Date().toISOString(),
          whiteboardCategory: 'education',
          whiteboardPrompt:
            selectedPost.whiteboardPrompt ||
            `打开已保存的互动课件《${data.saved.title}》。`,
          hasWhiteboardPrompt: true,
          hasSavedCourseware: true,
          bodyPreview: data.saved.description,
        },
        ...current,
      ]);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存到博客失败');
    } finally {
      setSavingBlog(false);
    }
  }

  function openInWhiteboard() {
    if (!result?.plan?.operations?.length || typeof window === 'undefined') return;

    const importId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const key = `dlgzz-courseware-import:${importId}`;
    window.sessionStorage.setItem(
      key,
      JSON.stringify({
        title: selectedPost?.title || 'AI 互动课件',
        sourceSlug: selectedPost?.slug,
        operations: result.plan.operations,
        createdAt: new Date().toISOString(),
      })
    );

    const query = new URLSearchParams({
      coursewareImportKey: importId,
      lessonId: lessonId.trim() || selectedPost?.slug || 'teacher-courseware',
      title: selectedPost?.title || 'AI 互动课件',
    });
    if (studentId.trim()) query.set('studentId', studentId.trim());
    window.open(`/${locale}/whiteboard?${query.toString()}`, '_blank');
  }

  return (
    <main className="min-h-screen bg-[#f5f7fb] text-[#111827]">
      <header className="border-b border-[#d8e0ee] bg-white">
        <div className="mx-auto flex max-w-[1480px] items-center justify-between gap-4 px-5 py-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-[#2563eb]">
              <BookOpen className="size-4" />
              老师课件后台
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-normal">MDX 生成触屏互动课件</h1>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => window.open(`/${locale}/whiteboard`, '_blank')}
          >
            <ExternalLink className="size-4" />
            打开白板
          </Button>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1480px] grid-cols-[320px_minmax(360px,440px)_1fr] gap-4 px-5 py-5">
        <section className="min-h-[calc(100vh-120px)] border border-[#d8e0ee] bg-white">
          <div className="border-b border-[#e4e9f2] p-4">
            <div className="text-sm font-semibold">MDX 课件</div>
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索标题、知识点..."
              className="mt-3"
            />
          </div>
          <div className="max-h-[calc(100vh-220px)] overflow-y-auto p-3">
            {loadingPosts ? (
              <div className="flex items-center gap-2 px-2 py-3 text-sm text-[#64748b]">
                <Loader2 className="size-4 animate-spin" />
                正在读取 MDX
              </div>
            ) : filteredPosts.length === 0 ? (
              <div className="px-2 py-3 text-sm text-[#64748b]">暂无可用 MDX</div>
            ) : (
              <div className="space-y-2">
                {filteredPosts.map((post) => (
                  <button
                    key={post.slug}
                    type="button"
                    onClick={() => {
                      setSelectedSlug(post.slug);
                      setResult(null);
                    }}
                    className={cn(
                      'w-full rounded-md border p-3 text-left transition',
                      selectedSlug === post.slug
                        ? 'border-[#2563eb] bg-[#eff6ff]'
                        : 'border-[#e4e9f2] bg-white hover:border-[#a8b5c9]'
                    )}
                  >
                    <div className="line-clamp-2 text-sm font-semibold">{post.title}</div>
                    <div className="mt-1 line-clamp-2 text-xs leading-5 text-[#64748b]">
                      {post.description || post.slug}
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-[11px] text-[#475569]">
                      <span>{post.fileName}</span>
                      {post.whiteboardCategory === 'education' && (
                        <span className="rounded bg-[#dcfce7] px-1.5 py-0.5 text-[#166534]">
                          education
                        </span>
                      )}
                      {post.hasSavedCourseware && (
                        <span className="rounded bg-[#e0f2fe] px-1.5 py-0.5 text-[#075985]">
                          已保存
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="min-h-[calc(100vh-120px)] border border-[#d8e0ee] bg-white p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <FileText className="size-4" />
            生成设置
          </div>

          {selectedPost && (
            <div className="mt-4 rounded-md border border-[#e4e9f2] bg-[#f8fafc] p-3">
              <div className="text-base font-semibold">{selectedPost.title}</div>
              <p className="mt-1 text-sm leading-6 text-[#475569]">{selectedPost.description}</p>
              {selectedPost.whiteboardPrompt && (
                <p className="mt-3 border-l-2 border-[#2563eb] pl-3 text-xs leading-5 text-[#334155]">
                  {selectedPost.whiteboardPrompt}
                </p>
              )}
            </div>
          )}

          <label className="mt-4 block text-sm font-medium">
            学生编号
            <Input
              value={studentId}
              onChange={(event) => setStudentId(event.target.value)}
              placeholder="例如：1号"
              className="mt-2"
            />
          </label>

          <label className="mt-4 block text-sm font-medium">
            课程序号
            <Input
              value={lessonId}
              onChange={(event) => setLessonId(event.target.value)}
              placeholder="例如：circle-area-01"
              className="mt-2"
            />
          </label>

          <label className="mt-4 block text-sm font-medium">
            生成要求
            <Textarea
              value={extraPrompt}
              onChange={(event) => setExtraPrompt(event.target.value)}
              className="mt-2 min-h-36 resize-none"
            />
          </label>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium">
              保存标题
              <Input
                value={saveTitle}
                onChange={(event) => setSaveTitle(event.target.value)}
                placeholder="课件标题"
                className="mt-2"
              />
            </label>
            <label className="block text-sm font-medium">
              博客 slug
              <Input
                value={saveSlug}
                onChange={(event) => setSaveSlug(toClientSlug(event.target.value))}
                placeholder="courseware-slug"
                className="mt-2"
              />
            </label>
          </div>

          {error && (
            <div className="mt-4 rounded-md border border-[#fecaca] bg-[#fef2f2] p-3 text-sm text-[#b91c1c]">
              {error}
            </div>
          )}

          <div className="mt-5 grid grid-cols-3 gap-3">
            <Button type="button" onClick={generateCourseware} disabled={!selectedPost || generating}>
              {generating ? <Loader2 className="size-4 animate-spin" /> : <WandSparkles className="size-4" />}
              生成课件
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={saveToBlog}
              disabled={!result?.plan?.operations?.length || savingBlog}
            >
              {savingBlog ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              保存到博客
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={openInWhiteboard}
              disabled={!result?.plan?.operations?.length}
            >
              <Play className="size-4" />
              放入白板
            </Button>
          </div>

          {result && (
            <div className="mt-5 rounded-md border border-[#d8e0ee] bg-[#f8fafc] p-3 text-sm leading-6 text-[#334155]">
              <div className="font-semibold">生成完成</div>
              <div>{result.plan?.voice_response || result.plan?.thought || '已生成互动课件。'}</div>
              <div className="mt-2 text-xs text-[#64748b]">
                Provider: {result.provider || '-'} · Model: {result.model || '-'}
              </div>
            </div>
          )}

          {savedInfo && (
            <div className="mt-4 rounded-md border border-[#bbf7d0] bg-[#f0fdf4] p-3 text-sm leading-6 text-[#166534]">
              <div className="flex items-center gap-2 font-semibold">
                <CheckCircle2 className="size-4" />
                已保存到博客
              </div>
              <div className="mt-1">{savedInfo.fileName}</div>
              <button
                type="button"
                onClick={() => window.open(`/${locale}${savedInfo.url}`, '_blank')}
                className="mt-2 text-xs font-medium text-[#2563eb] hover:underline"
              >
                打开博客文章
              </button>
            </div>
          )}
        </section>

        <section className="min-h-[calc(100vh-120px)] border border-[#d8e0ee] bg-white">
          <div className="flex items-center justify-between border-b border-[#e4e9f2] px-4 py-3">
            <div className="text-sm font-semibold">课件预览</div>
            <div className="text-xs text-[#64748b]">
              {previewHtml ? `${previewSize.width} × ${previewSize.height}` : '等待生成'}
            </div>
          </div>
          <div className="flex min-h-[calc(100vh-170px)] items-start justify-center overflow-auto bg-[#eef2f7] p-4">
            {previewHtml ? (
              <iframe
                title="courseware-preview"
                srcDoc={previewHtml}
                sandbox="allow-scripts allow-same-origin"
                className="border border-[#cbd5e1] bg-white shadow-sm"
                style={{
                  width: previewSize.width,
                  height: previewSize.height,
                }}
              />
            ) : (
              <div className="mt-24 text-center text-sm leading-6 text-[#64748b]">
                <WandSparkles className="mx-auto mb-3 size-8 text-[#94a3b8]" />
                选择左侧 MDX 后点击「生成课件」
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
