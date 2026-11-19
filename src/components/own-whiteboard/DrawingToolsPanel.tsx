'use client';

import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import type { Point, Tool } from './core/types';

export type DrawingToolsPanelProps = {
  tool: Tool;
  onSelect: (tool: Tool) => void;
  onInsertMedia: () => void;
  onClose: () => void;
};

type DrawingTool = { id: Tool; icon: string; label: string; title: string };

const PRIMARY_TOOLS: DrawingTool[] = [
  { id: 'select', icon: '➤', label: '选择', title: '选择（V）' },
  { id: 'hand', icon: '🤚', label: '平移', title: '平移（H / 空格）' },
  { id: 'draw', icon: '✏️', label: '画笔', title: '画笔（P）' },
  { id: 'eraser', icon: '🧹', label: '橡皮', title: '橡皮（E）' },
  { id: 'rectangle', icon: '⬜', label: '矩形', title: '矩形（R）' },
  { id: 'arrow', icon: '↗️', label: '箭头', title: '箭头（A）' },
  { id: 'text', icon: '🔤', label: '文字', title: '文字（T）' },
  { id: 'note', icon: '🟨', label: '便签', title: '便签（N）' },
];

const MORE_TOOLS: DrawingTool[] = [
  { id: 'highlight', icon: '🖍️', label: '荧光笔', title: '荧光笔' },
  { id: 'ellipse', icon: '⚪', label: '椭圆', title: '椭圆（O）' },
  { id: 'triangle', icon: '🔺', label: '三角形', title: '三角形' },
  { id: 'diamond', icon: '🔷', label: '菱形', title: '菱形' },
  { id: 'line', icon: '╱', label: '线条', title: '线条（L）' },
  { id: 'frame', icon: '🔲', label: '框架', title: '框架（F）' },
];

const EDGE = 8;

/** Convert viewport pointer positions to the panel's absolute-position container. */
function panelGeometry(element: HTMLElement) {
  const parent = element.offsetParent;
  const viewport = window.visualViewport;
  const viewportLeft = viewport?.offsetLeft ?? 0;
  const viewportTop = viewport?.offsetTop ?? 0;
  const viewportRight = viewportLeft + (viewport?.width ?? window.innerWidth);
  const viewportBottom = viewportTop + (viewport?.height ?? window.innerHeight);
  const container = parent instanceof HTMLElement ? parent : null;
  const containerRect = container?.getBoundingClientRect();
  const originX = containerRect
    ? containerRect.left + container!.clientLeft - container!.scrollLeft
    : -window.scrollX;
  const originY = containerRect
    ? containerRect.top + container!.clientTop - container!.scrollTop
    : -window.scrollY;
  const rect = element.getBoundingClientRect();
  const left =
    Math.max(viewportLeft, containerRect?.left ?? viewportLeft) + EDGE;
  const top = Math.max(viewportTop, containerRect?.top ?? viewportTop) + EDGE;
  const right =
    Math.min(viewportRight, containerRect?.right ?? viewportRight) - EDGE;
  const bottom =
    Math.min(viewportBottom, containerRect?.bottom ?? viewportBottom) - EDGE;
  const minX = left - originX;
  const minY = top - originY;
  const maxX = Math.max(minX, right - originX - rect.width);
  const maxY = Math.max(minY, bottom - originY - rect.height);
  return {
    rect,
    originX,
    originY,
    clamp(point: Point): Point {
      return {
        x: Math.min(maxX, Math.max(minX, point.x)),
        y: Math.min(maxY, Math.max(minY, point.y)),
      };
    },
  };
}

/** App-owned tool picker. No editor runtime or third-party whiteboard code. */
export default function DrawingToolsPanel({
  tool,
  onSelect,
  onInsertMedia,
  onClose,
}: DrawingToolsPanelProps) {
  const panel = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    pointerId: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [position, setPosition] = useState<Point | null>(null);
  const [dragging, setDragging] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreId = useId();

  useEffect(() => {
    const element = panel.current;
    if (!element) return;
    const keepVisible = () => {
      const geometry = panelGeometry(element);
      const current = {
        x: geometry.rect.left - geometry.originX,
        y: geometry.rect.top - geometry.originY,
      };
      const clamped = geometry.clamp(current);
      if (
        Math.abs(current.x - clamped.x) > 0.5 ||
        Math.abs(current.y - clamped.y) > 0.5
      )
        setPosition(clamped);
    };
    const cancelDrag = () => {
      drag.current = null;
      setDragging(false);
    };
    const observer = new ResizeObserver(keepVisible);
    observer.observe(element);
    if (element.offsetParent instanceof HTMLElement)
      observer.observe(element.offsetParent);
    window.addEventListener('resize', keepVisible);
    window.addEventListener('blur', cancelDrag);
    window.visualViewport?.addEventListener('resize', keepVisible);
    window.visualViewport?.addEventListener('scroll', keepVisible);
    keepVisible();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', keepVisible);
      window.removeEventListener('blur', cancelDrag);
      window.visualViewport?.removeEventListener('resize', keepVisible);
      window.visualViewport?.removeEventListener('scroll', keepVisible);
    };
  }, []);

  function startDrag(event: PointerEvent<HTMLButtonElement>) {
    event.stopPropagation();
    if (event.button !== 0 || !event.isPrimary || !panel.current) return;
    event.preventDefault();
    const geometry = panelGeometry(panel.current);
    drag.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - geometry.rect.left,
      offsetY: event.clientY - geometry.rect.top,
    };
    setPosition(
      geometry.clamp({
        x: geometry.rect.left - geometry.originX,
        y: geometry.rect.top - geometry.originY,
      })
    );
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  }

  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    event.stopPropagation();
    const active = drag.current;
    if (!active || event.pointerId !== active.pointerId || !panel.current)
      return;
    event.preventDefault();
    const geometry = panelGeometry(panel.current);
    setPosition(
      geometry.clamp({
        x: event.clientX - active.offsetX - geometry.originX,
        y: event.clientY - active.offsetY - geometry.originY,
      })
    );
  }

  function endDrag(event: PointerEvent<HTMLButtonElement>) {
    event.stopPropagation();
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function moveWithKeyboard(event: KeyboardEvent<HTMLButtonElement>) {
    const direction: Record<string, Point> = {
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
    };
    const step = direction[event.key];
    if (!step || !panel.current) return;
    event.preventDefault();
    event.stopPropagation();
    const geometry = panelGeometry(panel.current);
    const distance = event.shiftKey ? 4 : 16;
    setPosition(
      geometry.clamp({
        x: geometry.rect.left - geometry.originX + step.x * distance,
        y: geometry.rect.top - geometry.originY + step.y * distance,
      })
    );
  }

  function toolButton(item: DrawingTool) {
    return (
      <button
        key={item.id}
        type="button"
        className={`owb-draw-panel__tool${tool === item.id ? ' owb-draw-panel__tool--active' : ''}`}
        title={item.title}
        aria-label={item.label}
        aria-pressed={tool === item.id}
        onClick={() => onSelect(item.id)}
      >
        <span className="owb-draw-panel__icon" aria-hidden="true">
          {item.icon}
        </span>
      </button>
    );
  }

  const style: CSSProperties = {
    position: 'absolute',
    width: 'max-content',
    maxWidth: 'min(calc(100% - 16px), calc(100vw - 16px))',
    maxHeight: 'min(calc(100% - 16px), calc(100dvh - 16px))',
    boxSizing: 'border-box',
    overflow: 'auto',
    pointerEvents: 'auto',
    ...(position
      ? { left: position.x, top: position.y }
      : { bottom: 100, left: '50%', transform: 'translateX(-50%)' }),
  };

  return (
    <div
      ref={panel}
      className={`owb-draw-panel${dragging ? ' owb-draw-panel--dragging' : ''}`}
      style={style}
      role="toolbar"
      aria-label="绘图工具"
      aria-orientation="horizontal"
      data-board-interactive="true"
      onPointerDown={(event) => event.stopPropagation()}
      onPointerMove={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      onPointerCancel={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape') {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <div
        className="owb-draw-panel__bar"
        style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center' }}
      >
        <button
          type="button"
          className="owb-draw-panel__handle"
          title="拖动绘图工具栏；聚焦后也可用方向键移动"
          aria-label="移动绘图工具栏"
          style={{
            touchAction: 'none',
            userSelect: 'none',
            cursor: dragging ? 'grabbing' : 'grab',
          }}
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onLostPointerCapture={endDrag}
          onKeyDown={moveWithKeyboard}
        >
          <span className="owb-draw-panel__grip" aria-hidden="true">
            ⠿
          </span>
          <span className="owb-draw-panel__title">绘图</span>
        </button>
        <div
          className="owb-draw-panel__tools"
          style={{ display: 'flex', flexWrap: 'wrap' }}
        >
          {PRIMARY_TOOLS.map(toolButton)}
        </div>
        <button
          type="button"
          className={`owb-draw-panel__more-toggle${MORE_TOOLS.some((item) => item.id === tool) ? ' owb-draw-panel__tool--active' : ''}`}
          title={moreOpen ? '收起更多绘图工具' : '更多绘图工具'}
          aria-label="更多绘图工具"
          aria-expanded={moreOpen}
          aria-controls={moreId}
          onClick={() => setMoreOpen((open) => !open)}
        >
          <span className="owb-draw-panel__icon" aria-hidden="true">
            {moreOpen ? '⌃' : '⋯'}
          </span>
        </button>
        <button
          type="button"
          className="owb-draw-panel__media"
          title="插入媒体或文件"
          aria-label="插入媒体"
          onClick={onInsertMedia}
        >
          <span className="owb-draw-panel__icon" aria-hidden="true">
            🖼️
          </span>
        </button>
        <button
          type="button"
          className="owb-draw-panel__close"
          title="关闭绘图工具栏（Esc）"
          aria-label="关闭绘图工具栏"
          onClick={onClose}
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
      {moreOpen && (
        <fieldset
          id={moreId}
          className="owb-draw-panel__more"
          aria-label="更多绘图工具"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            minWidth: 0,
            margin: 0,
            padding: 0,
            border: 0,
          }}
        >
          {MORE_TOOLS.map(toolButton)}
        </fieldset>
      )}
    </div>
  );
}
