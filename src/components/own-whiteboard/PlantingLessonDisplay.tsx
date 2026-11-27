'use client';

import { type CSSProperties, useEffect, useRef, useState } from 'react';
import PlantingLessonFrame from './PlantingLessonFrame';

type OrientationControls = ScreenOrientation & {
  lock?: (mode: 'landscape') => Promise<void>;
  unlock?: () => void;
};

export default function PlantingLessonDisplay({
  title,
  articleHref,
  config,
  onActivate,
}: { title: string; articleHref: string; config: unknown; onActivate?: () => void }) {
  const panel = useRef<HTMLDialogElement>(null);
  const activate = useRef(onActivate);
  const open = useRef(false);
  const native = useRef(false);
  const [expanded, setExpanded] = useState(false);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });

  function syncViewport() {
    const width = Math.round(window.visualViewport?.width ?? window.innerWidth);
    const height = Math.round(window.visualViewport?.height ?? window.innerHeight);
    setViewport((previous) => previous.width === width && previous.height === height
      ? previous : { width, height });
    return { width, height };
  }

  function showExpanded() {
    const dialog = panel.current;
    if (!dialog) return;
    if (dialog.open) dialog.close();
    dialog.showModal();
    open.current = true;
    setExpanded(true);
    syncViewport();
    activate.current?.();
  }

  function closeExpanded() {
    const dialog = panel.current;
    open.current = false;
    if (dialog?.open) dialog.close();
    dialog?.show();
    setExpanded(false);
    if (native.current) {
      native.current = false;
      const orientation = window.screen.orientation as OrientationControls | undefined;
      try { orientation?.unlock?.(); } catch {}
      if (document.fullscreenElement === document.documentElement) {
        void document.exitFullscreen().catch(() => undefined);
      }
    }
  }

  useEffect(() => { activate.current = onActivate; }, [onActivate]);
  useEffect(() => {
    const dialog = panel.current;
    if (!dialog) return;
    const visualViewport = window.visualViewport;
    const { width, height } = syncViewport();
    if (!dialog.open) dialog.show();
    // A normal bookmarked board remains unchanged. Auto-open only the lesson
    // deliberately launched from a portrait phone.
    if (width <= 768 && height > width &&
      new URLSearchParams(window.location.search).get('courseware') === 'zhi-shu-shi-yan') {
      showExpanded();
    }
    window.addEventListener('resize', syncViewport);
    window.addEventListener('orientationchange', syncViewport);
    visualViewport?.addEventListener('resize', syncViewport);
    const onFullscreenChange = () => {
      if (native.current && !document.fullscreenElement) closeExpanded();
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => {
      window.removeEventListener('resize', syncViewport);
      window.removeEventListener('orientationchange', syncViewport);
      visualViewport?.removeEventListener('resize', syncViewport);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      open.current = false;
      if (native.current && document.fullscreenElement === document.documentElement) {
        native.current = false;
        void document.exitFullscreen().catch(() => undefined);
      }
      if (dialog.open) dialog.close();
    };
  }, []);

  function toggleExpanded() {
    if (open.current) {
      closeExpanded();
      return;
    }
    const orientation = window.screen.orientation as OrientationControls | undefined;
    // On supported phones ask for native landscape in the tap; the top-layer
    // dialog also works where the orientation or fullscreen API is unavailable.
    const root = document.documentElement;
    let request: Promise<void> | undefined;
    try {
      if (viewport.width <= 900 && orientation?.lock && !document.fullscreenElement) {
        request = root.requestFullscreen?.();
      }
    } catch {
      // A rejected native request must not prevent the CSS fallback.
    }
    showExpanded();
    if (request) void request.then(async () => {
      if (document.fullscreenElement !== root) return;
      if (!open.current || !panel.current) {
        await document.exitFullscreen();
        return;
      }
      native.current = true;
      // Keep the same iframe while putting the dialog above the fullscreen root.
      panel.current.close();
      panel.current.showModal();
      await orientation?.lock?.('landscape');
    }).catch(() => undefined);
  }

  const rotated = expanded && viewport.width <= 900 && viewport.height > viewport.width;
  const style: CSSProperties | undefined = rotated
    ? { width: viewport.height, height: viewport.width }
    : undefined;
  return (
    <dialog
      ref={panel}
      aria-label={title}
      className={`owb-embed owb-courseware owb-planting-display${expanded ? ' is-fullscreen' : ''}${rotated ? ' is-rotated-landscape' : ''}`}
      style={style}
      onCancel={(event) => {
        event.preventDefault();
        if (expanded) closeExpanded();
      }}
    >
      <div className="owb-courseware-header" data-card-handle>
        <strong title={title}>互动课件 · {title}</strong>
        <div className="owb-courseware-actions" data-board-interactive="true">
          {!expanded && <button type="button" className="owb-courseware-activate" onClick={onActivate}>操作课件</button>}
          <button type="button" aria-pressed={expanded} onClick={toggleExpanded}>
            {expanded ? '退出全屏' : '全屏'}
          </button>
          <a href={articleHref}>返回文章</a>
        </div>
      </div>
      <PlantingLessonFrame title={title} config={config} />
    </dialog>
  );
}
