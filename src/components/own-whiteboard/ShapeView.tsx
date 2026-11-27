'use client';

import type { CSSProperties } from 'react';
import PlantingLessonDisplay from './PlantingLessonDisplay';
import BoardCard, { ARTICLE_LINK_FOOTER_HEIGHT } from './cards/BoardCard';
import { safeWebUrl } from './cards/helpers';
import { coursewareForShape, isRetiredCoursewareId } from './core/courseware';
import { resolveArrowPoints } from './core/model';
import {
  CARD_TYPES,
  SHAPE_LABELS,
  type BoardCardProps,
  type BoardShape,
  type Point,
} from './core/types';

function strokePath(points: Point[]) {
  if (!points.length) return '';
  if (points.length < 3)
    return `M ${points.map((p) => `${p.x} ${p.y}`).join(' L ')}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    const next = points[i + 1];
    d += ` Q ${p.x} ${p.y} ${(p.x + next.x) / 2} ${(p.y + next.y) / 2}`;
  }
  return `${d} L ${points.at(-1)!.x} ${points.at(-1)!.y}`;
}

export function PrimitiveShape({
  shape,
  shapes,
}: { shape: BoardShape; shapes: BoardShape[] }) {
  const { type, w, h, style: s } = shape;
  const common = {
    stroke: s.stroke,
    strokeWidth: s.strokeWidth,
    fill: s.fill,
    strokeDasharray: s.dash
      ? `${s.strokeWidth * 3} ${s.strokeWidth * 2}`
      : undefined,
  };
  if (type === 'rectangle')
    return <rect x={0} y={0} width={w} height={h} rx={5} {...common} />;
  if (type === 'ellipse')
    return <ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} {...common} />;
  if (type === 'triangle')
    return <polygon points={`${w / 2},0 ${w},${h} 0,${h}`} {...common} />;
  if (type === 'diamond')
    return (
      <polygon
        points={`${w / 2},0 ${w},${h / 2} ${w / 2},${h} 0,${h / 2}`}
        {...common}
      />
    );
  if (type === 'draw' || type === 'highlight')
    return (
      <path
        d={strokePath(shape.points || [])}
        {...common}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={type === 'highlight' ? 0.35 : 1}
      />
    );
  const points = resolveArrowPoints(shape, shapes).map((p) => ({
    x: p.x - shape.x,
    y: p.y - shape.y,
  }));
  const last = points.at(-1) || { x: w, y: h };
  const previous = points.at(-2) || { x: 0, y: 0 };
  const a = Math.atan2(last.y - previous.y, last.x - previous.x);
  const size = Math.max(10, s.strokeWidth * 4);
  return (
    <>
      <polyline
        points={points.map((p) => `${p.x},${p.y}`).join(' ')}
        {...common}
        fill="none"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {type === 'arrow' && (
        <path
          d={`M ${last.x - size * Math.cos(a - 0.45)} ${last.y - size * Math.sin(a - 0.45)} L ${last.x} ${last.y} L ${last.x - size * Math.cos(a + 0.45)} ${last.y - size * Math.sin(a + 0.45)}`}
          {...common}
          fill="none"
          strokeLinecap="round"
        />
      )}
      {shape.props.text && (
        <text
          x={(points[0].x + last.x) / 2}
          y={(points[0].y + last.y) / 2 - 8}
          textAnchor="middle"
          fill={s.stroke}
          stroke="white"
          strokeWidth={4}
          paintOrder="stroke"
          fontSize={s.fontSize}
        >
          {shape.props.text}
        </text>
      )}
    </>
  );
}

export default function ShapeView(
  props: BoardCardProps & {
    selected: boolean;
    editing: boolean;
    finishEditing: () => void;
    onActivateCourseware?: () => void;
  }
) {
  const {
    shape,
    shapes,
    interactive,
    selected,
    editing,
    updateProps,
    resolveAsset,
  } = props;
  const { type, style: s } = shape;
  const isStroke = ['draw', 'highlight', 'line', 'arrow'].includes(type);
  const isCard = CARD_TYPES.includes(type);
  const courseware = coursewareForShape(shape);
  const plantingLesson = courseware?.id === 'zhi-shu-shi-yan';
  const retiredLesson = isRetiredCoursewareId(shape.props.coursewareId);
  const lessonTitle = plantingLesson ? (shape.props.title || courseware.title) : courseware?.title;
  const articleUrl = type === 'blog_post' ? safeWebUrl(shape.props.url) : '';
  const cardScale = shape.cardScale ?? 1;
  const cardLayout =
    cardScale === 1
      ? shape
      : { ...shape, w: shape.w / cardScale, h: shape.h / cardScale };
  const isText = type === 'text' || type === 'note';
  const textStyle: CSSProperties = {
    color: s.stroke,
    fontSize: s.fontSize,
    fontWeight: shape.props.bold ? 700 : 400,
    fontStyle: shape.props.italic ? 'italic' : 'normal',
    textAlign: (shape.props.align as CSSProperties['textAlign']) || 'left',
  };
  const source = shape.props.assetId
    ? resolveAsset(shape.props.assetId)
    : shape.props.src || shape.props.url || '';
  const safeSource =
    source && /^(https?:|blob:|data:image\/|data:video\/|\/)/i.test(source)
      ? source
      : '';
  return (
    <div
      data-shape-id={shape.id}
      data-shape-type={type}
      className={`owb-shape ${type === 'frame' ? 'owb-frame' : ''} ${selected ? 'is-selected' : ''}`}
      style={{
        left: shape.x,
        top: shape.y,
        width: shape.w,
        height: shape.h,
        transform:
          isStroke && (type === 'arrow' || type === 'line')
            ? undefined
            : `rotate(${shape.rotation}deg)`,
        opacity: s.opacity,
        pointerEvents: isStroke || type === 'frame' ? 'none' : undefined,
        ...(type === 'frame' ? { borderColor: s.stroke } : {}),
      }}
    >
      {isCard ? (
        <div
          className={`owb-card${articleUrl ? ' owb-card--with-link' : ''}`}
          style={{
            width: cardLayout.w,
            height: cardLayout.h,
            transform: cardScale === 1 ? undefined : `scale(${cardScale})`,
          }}
        >
          <div className="owb-card-handle" data-card-handle>
            <span className="owb-card-kind">{SHAPE_LABELS[type]}</span>
            <small data-active={interactive}>
              {interactive ? '交互中' : '双击操作'}
            </small>
          </div>
          <div
            className="owb-card-body"
            style={{
              pointerEvents: interactive && !shape.locked ? 'auto' : 'none',
            }}
          >
            <BoardCard {...props} shape={cardLayout} />
          </div>
          {articleUrl && (
            <a
              className="owb-card-open-article"
              data-board-interactive="true"
              href={articleUrl}
              target="_blank"
              rel="noopener noreferrer"
              draggable={false}
              style={{ height: ARTICLE_LINK_FOOTER_HEIGHT }}
            >
              打开文章 <span>↗</span>
            </a>
          )}
        </div>
      ) : type === 'frame' ? (
        <div className="owb-frame-label" style={{ pointerEvents: 'auto' }}>
          {shape.props.title || '框架'}
        </div>
      ) : isText ? (
        <div
          className={`owb-text ${type === 'note' ? 'owb-note' : ''}`}
          style={{
            ...textStyle,
            background:
              type === 'note'
                ? s.fill === 'transparent'
                  ? '#fff6bc'
                  : s.fill
                : s.fill,
          }}
        >
          {editing ? (
            <textarea
              autoFocus
              aria-label="编辑文字"
              data-board-interactive
              value={shape.props.text || ''}
              style={textStyle}
              onChange={(e) => updateProps({ text: e.target.value })}
              onBlur={props.finishEditing}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Escape') props.finishEditing();
              }}
            />
          ) : (
            <span>{shape.props.text || '双击输入文字'}</span>
          )}
        </div>
      ) : type === 'image' ? (
        <div className="owb-image-clip">
          {safeSource ? (
            <img
              alt={shape.props.title || '白板图片'}
              src={safeSource}
              draggable={false}
              style={
                shape.props.crop
                  ? {
                      width: `${100 / shape.props.crop.w}%`,
                      height: `${100 / shape.props.crop.h}%`,
                      maxWidth: 'none',
                      position: 'absolute',
                      left: `${(-100 * shape.props.crop.x) / shape.props.crop.w}%`,
                      top: `${(-100 * shape.props.crop.y) / shape.props.crop.h}%`,
                    }
                  : { width: '100%', height: '100%', objectFit: 'contain' }
              }
            />
          ) : (
            <div className="owb-media-placeholder">图片未加载</div>
          )}
        </div>
      ) : type === 'video' ? (
        <video
          data-board-video={shape.id}
          src={safeSource || undefined}
          controls={interactive}
          style={{
            width: '100%',
            height: '100%',
            background: '#101827',
            borderRadius: 10,
            pointerEvents: interactive ? 'auto' : 'none',
          }}
        />
      ) : type === 'bookmark' ? (
        <div className="owb-bookmark">
          <small>LINK</small>
          <strong>{shape.props.title || '链接卡片'}</strong>
          <p>
            {shape.props.description || shape.props.url || '在右侧填写链接'}
          </p>
          {interactive && safeSource && (
            <a
              href={safeSource}
              target="_blank"
              rel="noopener noreferrer"
              data-board-interactive
            >
              打开链接 ↗
            </a>
          )}
        </div>
      ) : type === 'embed' && plantingLesson ? (
        <PlantingLessonDisplay
          title={lessonTitle || courseware.title}
          articleHref={courseware.articleHref}
          config={shape.props.coursewareConfig}
          onActivate={props.onActivateCourseware}
        />
      ) : type === 'embed' ? (
        <div className={`owb-embed${courseware ? ' owb-courseware' : ''}`}>
          {courseware && (
            <div className="owb-courseware-header" data-card-handle>
              <strong title={lessonTitle}>互动课件 · {lessonTitle}</strong>
              <div className="owb-courseware-actions" data-board-interactive="true">
                <button
                  type="button"
                  className="owb-courseware-activate"
                  onClick={props.onActivateCourseware}
                >
                  操作课件
                </button>
                <a href={courseware.articleHref}>返回文章</a>
              </div>
            </div>
          )}
          {retiredLesson ? (
            <div className="owb-media-placeholder">《直线植树》已下线</div>
          ) : courseware || safeSource ? (
            <iframe
              title={lessonTitle || shape.props.title || '网页嵌入'}
              src={courseware?.entryHref || safeSource}
              sandbox={courseware ? 'allow-scripts' : 'allow-scripts allow-presentation'}
              allowFullScreen={Boolean(courseware)}
              referrerPolicy="no-referrer"
              style={{
                width: '100%',
                height: '100%',
                // The canvas tool, not card selection, controls lesson input.
                pointerEvents: courseware
                  ? undefined
                  : interactive
                    ? 'auto'
                    : 'none',
              }}
            />
          ) : (
            <div className="owb-media-placeholder">
              在右侧填写 HTTPS 网页地址
              <br />
              目标网站需允许嵌入
            </div>
          )}
        </div>
      ) : (
        <svg
          width={shape.w}
          height={shape.h}
          style={{ overflow: 'visible', pointerEvents: 'visiblePainted' }}
        >
          <PrimitiveShape shape={shape} shapes={shapes} />
        </svg>
      )}
    </div>
  );
}
