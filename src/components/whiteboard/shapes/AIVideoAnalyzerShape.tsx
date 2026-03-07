import { useCallback, useEffect, useRef, useState } from 'react';
import { BaseBoxShapeUtil, HTMLContainer, useEditor, type TLBaseShape } from 'tldraw';

interface AIVideoAnalyzerShapeProps {
  w: number;
  h: number;
}

type AIVideoAnalyzerShape = TLBaseShape<'ai_video_analyzer', AIVideoAnalyzerShapeProps>;

const DRAG_BAR_HEIGHT = 36;
const EDGE_PROXIMITY = 120;

export class AIVideoAnalyzerShapeUtil extends BaseBoxShapeUtil<AIVideoAnalyzerShape> {
  static override type = 'ai_video_analyzer' as const;
  override canEdit() { return false; }
  override getDefaultProps(): AIVideoAnalyzerShapeProps {
    return { w: 380, h: 480 };
  }
  override component(shape: AIVideoAnalyzerShape) {
    return <AIVideoAnalyzerComponent shape={shape} />;
  }
  override indicator(shape: AIVideoAnalyzerShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={12} />;
  }
}

function edgeDistance(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number }
) {
  const dx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w));
  const dy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h));
  return Math.sqrt(dx * dx + dy * dy);
}

async function captureFrame(videoUrl: string): Promise<string> {
  const existing = Array.from(document.querySelectorAll('video')).find(
    (v) => v.src === videoUrl || v.currentSrc === videoUrl
  );
  const draw = (el: HTMLVideoElement): string => {
    const c = document.createElement('canvas');
    c.width = el.videoWidth || 640;
    c.height = el.videoHeight || 360;
    c.getContext('2d')!.drawImage(el, 0, 0);
    return c.toDataURL('image/jpeg', 0.85).split(',')[1];
  };
  if (existing && existing.readyState >= 2) return draw(existing);
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.crossOrigin = 'anonymous';
    v.src = videoUrl;
    v.currentTime = 2;
    v.addEventListener('seeked', () => { resolve(draw(v)); v.remove(); });
    v.addEventListener('error', () => reject(new Error('视频帧捕获失败')));
    v.load();
  });
}

function AIVideoAnalyzerComponent({ shape }: { shape: AIVideoAnalyzerShape }) {
  const editor = useEditor();
  const { w, h } = shape.props;

  const [nearbyVideo, setNearbyVideo] = useState<{ id: string; videoUrl: string; fileName: string } | null>(null);
  const [status, setStatus] = useState<'idle' | 'capturing' | 'analyzing' | 'done' | 'error'>('idle');
  const [analysis, setAnalysis] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 自定义滚动条状态
  const scrollRef = useRef<HTMLDivElement>(null);
  const [thumbTop, setThumbTop] = useState(0);
  const [thumbHeight, setThumbHeight] = useState(0);
  const [showThumb, setShowThumb] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // 拖拽滑块用的 ref（不需要触发重渲染）
  const isDraggingThumb = useRef(false);
  const dragStartY = useRef(0);
  const dragStartScrollTop = useRef(0);

  const updateThumb = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ratio = el.clientHeight / el.scrollHeight;
    if (ratio >= 1) { setShowThumb(false); return; }
    setShowThumb(true);
    setThumbHeight(Math.max(24, ratio * el.clientHeight));
    setThumbTop((el.scrollTop / (el.scrollHeight - el.clientHeight)) * (el.clientHeight - Math.max(24, ratio * el.clientHeight)));
  }, []);

  // 点击轨道空白区域 → 跳转到对应位置
  const handleTrackPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    // 只处理点在轨道本身（不是滑块）的情况
    if ((e.target as HTMLElement) !== e.currentTarget) return;
    const el = scrollRef.current;
    if (!el) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickRatio = (e.clientY - rect.top) / rect.height;
    el.scrollTop = Math.max(0, Math.min(clickRatio * (el.scrollHeight - el.clientHeight), el.scrollHeight - el.clientHeight));
    updateThumb();
  }, [updateThumb]);

  // 按下滑块 → 开始拖拽
  const handleThumbPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    isDraggingThumb.current = true;
    setIsDragging(true);
    dragStartY.current = e.clientY;
    dragStartScrollTop.current = scrollRef.current?.scrollTop ?? 0;
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  // 拖拽中 → 实时滚动
  const handleThumbPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingThumb.current) return;
    e.stopPropagation();
    const el = scrollRef.current;
    if (!el) return;
    const deltaY = e.clientY - dragStartY.current;
    // 与 updateThumb 保持一致：用 el.clientHeight 作为虚拟轨道高度
    const maxThumbTravel = el.clientHeight - thumbHeight;
    if (maxThumbTravel <= 0) return;
    const newScrollTop = dragStartScrollTop.current + (deltaY / maxThumbTravel) * (el.scrollHeight - el.clientHeight);
    el.scrollTop = Math.max(0, Math.min(newScrollTop, el.scrollHeight - el.clientHeight));
    updateThumb();
  }, [updateThumb, thumbHeight]);

  // 松开滑块 → 结束拖拽
  const handleThumbPointerUp = useCallback(() => {
    isDraggingThumb.current = false;
    setIsDragging(false);
  }, []);

  // 内容变化后重新计算滑块（分析完成、重置等场景）
  useEffect(() => {
    // 等 DOM 更新完成后再计算
    const t = setTimeout(updateThumb, 50);
    return () => clearTimeout(t);
  }, [status, analysis, updateThumb]);

  useEffect(() => {
    const check = () => {
      const myB = editor.getShapePageBounds(shape.id);
      if (!myB) return;
      const videoShapes = editor.getCurrentPageShapes().filter((s) => s.type === 'video_player') as any[];
      let closest: { id: string; videoUrl: string; fileName: string } | null = null;
      let minDist = Infinity;
      for (const vs of videoShapes) {
        const vB = editor.getShapePageBounds(vs.id);
        if (!vB) continue;
        const dist = edgeDistance(
          { x: myB.x, y: myB.y, w: myB.w, h: myB.h },
          { x: vB.x, y: vB.y, w: vB.w, h: vB.h }
        );
        if (dist < EDGE_PROXIMITY && dist < minDist) {
          minDist = dist;
          closest = { id: vs.id, videoUrl: vs.props?.videoUrl ?? '', fileName: vs.props?.fileName ?? '' };
        }
      }
      setNearbyVideo(closest);
    };
    check();
    timerRef.current = setInterval(check, 600);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [editor, shape.id]);

  const handleAnalyze = async () => {
    if (!nearbyVideo?.videoUrl) return;
    setStatus('capturing'); setErrorMsg(''); setAnalysis('');
    try {
      const frameBase64 = await captureFrame(nearbyVideo.videoUrl);
      setStatus('analyzing');
      const res = await fetch('/api/ai/video-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frameBase64, mimeType: 'image/jpeg', videoName: nearbyVideo.fileName }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || '分析失败');
      setAnalysis(data.analysis);
      setStatus('done');
    } catch (err: any) {
      setErrorMsg(err.message || '未知错误');
      setStatus('error');
    }
  };

  const isLoading = status === 'capturing' || status === 'analyzing';

  return (
    <HTMLContainer>
      {/* 外层容器：固定宽高，flex 列布局 */}
      <div style={{
        width: w, height: h,
        background: 'linear-gradient(160deg, #0f172a 0%, #1e1b4b 100%)',
        borderRadius: 12,
        border: nearbyVideo ? '1.5px solid #6366f1' : '1.5px solid #1e293b',
        boxShadow: nearbyVideo ? '0 0 20px rgba(99,102,241,0.3)' : '0 4px 20px rgba(0,0,0,0.4)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        transition: 'border-color 0.3s, box-shadow 0.3s',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}>

        {/* ── 拖动条：无 stopPropagation，tldraw 可从这里拖动 ── */}
        <div style={{
          height: DRAG_BAR_HEIGHT, minHeight: DRAG_BAR_HEIGHT,
          background: '#111827', borderBottom: '1px solid #374151',
          display: 'flex', alignItems: 'center', padding: '0 10px', gap: 8,
          cursor: 'grab', userSelect: 'none', flexShrink: 0,
        }}>
          <span style={{ color: '#4b5563', fontSize: 14, lineHeight: 1 }}>⠿</span>
          <div style={{ display: 'flex', gap: 5 }}>
            <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#ff5f57' }} />
            <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#febc2e' }} />
            <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#28c840' }} />
          </div>
          <span style={{ color: '#9ca3af', fontSize: 12, fontWeight: 600, flex: 1 }}>🤖 视频内容分析</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{
              width: 7, height: 7, borderRadius: '50%',
              background: nearbyVideo ? '#22c55e' : '#374151',
              boxShadow: nearbyVideo ? '0 0 6px #22c55e' : 'none',
              transition: 'all 0.3s',
            }} />
            <span style={{ color: nearbyVideo ? '#86efac' : '#4b5563', fontSize: 10 }}>
              {nearbyVideo ? '已锁定' : '待机'}
            </span>
          </div>
        </div>

        {/* ── ① 状态卡（只展示，无交互，不阻断 tldraw 拖动） ── */}
        <div style={{ flexShrink: 0, padding: '10px 14px 0', cursor: 'grab', userSelect: 'none' }}>
          {nearbyVideo ? (
            <div style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 8, padding: '7px 10px' }}>
              <div style={{ color: '#a5b4fc', fontSize: 11, marginBottom: 2 }}>✅ 检测到视频</div>
              <div style={{ color: '#e2e8f0', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                🎬 {nearbyVideo.fileName || '未命名视频'}
              </div>
            </div>
          ) : (
            <div style={{ background: 'rgba(71,85,105,0.15)', border: '1px dashed #334155', borderRadius: 8, padding: '8px 10px' }}>
              <div style={{ color: '#64748b', fontSize: 12, marginBottom: 2 }}>⬅ 拖到视频旁边</div>
              <div style={{ color: '#475569', fontSize: 11 }}>边缘距离 &lt; {EDGE_PROXIMITY}px 自动激活</div>
            </div>
          )}
        </div>

        {/* ── ② 滚动区 + 自定义滚动条（绕过 tldraw 全局隐藏） ── */}
        {/* ⚠️ 外层 wrapper 不放 onPointerDown，让 tldraw 可以从空白区域拖动 */}
        <div style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex' }}>
          {/* 内容滚动区：stopPropagation 只在内容 div 上，防止 tldraw 在滚动时抢焦点 */}
          <div
            ref={scrollRef}
            onPointerDown={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
            onScroll={updateThumb}
            style={{
              flex: 1, overflowY: 'scroll', padding: '10px 4px 10px 14px',
              pointerEvents: 'auto',
              /* 隐藏原生滚动条（tldraw 已全局隐藏，此处双重保险） */
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
            }}
          >
            {isLoading && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, paddingTop: 20 }}>
                <div style={{ fontSize: 32 }}>{status === 'capturing' ? '📸' : '🧠'}</div>
                <div style={{ color: '#94a3b8', fontSize: 13 }}>
                  {status === 'capturing' ? '捕获视频帧...' : 'Gemini 3.1 分析中...'}
                </div>
                <div style={{ width: 120, height: 3, background: '#1e293b', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', background: '#6366f1', borderRadius: 2, animation: 'progress 1.5s ease-in-out infinite' }} />
                </div>
              </div>
            )}
            {status === 'done' && analysis && (
              <div>
                <div style={{ color: '#a5b4fc', fontSize: 11, marginBottom: 8, fontWeight: 600 }}>📊 分析报告</div>
                <div style={{ color: '#cbd5e1', fontSize: 12, lineHeight: 1.8, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {analysis}
                </div>
              </div>
            )}
            {status === 'error' && (
              <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '8px 10px', color: '#fca5a5', fontSize: 12 }}>
                ❌ {errorMsg}
              </div>
            )}
          </div>

          {/* 自定义滚动条轨道：加宽至 8px，支持点击跳转 */}
          {showThumb && (
            <div
              onPointerDown={handleTrackPointerDown}
              onWheel={(e) => e.stopPropagation()}
              style={{
                width: 8, flexShrink: 0, margin: '6px 4px 6px 0',
                background: 'rgba(255,255,255,0.07)', borderRadius: 4, position: 'relative',
                cursor: 'pointer', pointerEvents: 'auto',
              }}
            >
              {/* 滑块：支持拖拽滚动 */}
              <div
                onPointerDown={handleThumbPointerDown}
                onPointerMove={handleThumbPointerMove}
                onPointerUp={handleThumbPointerUp}
                style={{
                  position: 'absolute', left: 0, right: 0,
                  top: thumbTop, height: thumbHeight,
                  background: isDragging ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.35)',
                  borderRadius: 4,
                  transition: isDragging ? 'none' : 'top 0.1s ease-out',
                  cursor: isDragging ? 'grabbing' : 'grab',
                  userSelect: 'none',
                }}
              />
            </div>
          )}
        </div>

        {/* ── ③ 底部按钮（wrapper 不阻断，stopPropagation 只在按钮本身） ── */}
        <div
          style={{ padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 8, flexShrink: 0 }}
        >
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={handleAnalyze}
            disabled={!nearbyVideo || isLoading}
            style={{
              flex: 1, padding: '8px 0', borderRadius: 8, border: 'none',
              background: !nearbyVideo || isLoading ? '#1e293b' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              color: !nearbyVideo || isLoading ? '#475569' : '#fff',
              fontSize: 13, fontWeight: 600,
              cursor: !nearbyVideo || isLoading ? 'not-allowed' : 'pointer',
              pointerEvents: 'auto',
            }}
          >
            {isLoading ? '分析中...' : '▶ 分析视频'}
          </button>
          {(status === 'done' || status === 'error') && (
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => { setStatus('idle'); setAnalysis(''); setErrorMsg(''); }}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #334155', background: 'transparent', color: '#64748b', fontSize: 12, cursor: 'pointer', pointerEvents: 'auto' }}
            >
              重置
            </button>
          )}
        </div>

      </div>

      <style>{`
        @keyframes progress {
          0%   { width: 0%; margin-left: 0; }
          50%  { width: 60%; margin-left: 20%; }
          100% { width: 0%; margin-left: 100%; }
        }
      `}</style>
    </HTMLContainer>
  );
}
