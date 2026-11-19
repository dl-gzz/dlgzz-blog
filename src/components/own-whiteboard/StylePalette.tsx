'use client';

import { Circle, MoreHorizontal, Square } from 'lucide-react';
import type { ShapeStyle } from './core/types';

const PALETTE = [
  ['黑色', '#1d1d1d'],
  ['灰色', '#9aa0a6'],
  ['浅紫色', '#c77dce'],
  ['紫色', '#9c27b0'],
  ['蓝色', '#3155df'],
  ['浅蓝色', '#4a9ad4'],
  ['黄色', '#f2b43d'],
  ['橙色', '#e86b24'],
  ['绿色', '#19815c'],
  ['浅绿色', '#51a65a'],
  ['浅红色', '#ed6b78'],
  ['红色', '#dd233b'],
] as const;

export default function StylePalette({
  style,
  onChange,
  onMore,
}: {
  style: ShapeStyle;
  onChange: (patch: Partial<ShapeStyle>) => void;
  onMore: () => void;
}) {
  const softFill = /^#[\da-f]{6}$/i.test(style.stroke)
    ? `${style.stroke}24`
    : '#e5e7eb';
  return (
    <aside className="owb-palette" aria-label="绘图样式">
      <fieldset
        className="owb-palette-colors"
        aria-label="颜色"
        style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
      >
        {PALETTE.map(([name, color]) => (
          <button
            type="button"
            key={color}
            aria-label={`颜色 — ${name}`}
            title={name}
            aria-pressed={style.stroke === color}
            onClick={() => onChange({ stroke: color })}
          >
            <span style={{ backgroundColor: color }} />
          </button>
        ))}
      </fieldset>
      <input
        type="range"
        min="0.1"
        max="1"
        step="0.05"
        aria-label="不透明度"
        title={`不透明度 ${Math.round(style.opacity * 100)}%`}
        value={style.opacity}
        onChange={(event) => onChange({ opacity: Number(event.target.value) })}
      />
      <fieldset
        className="owb-palette-row"
        aria-label="填充"
        style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
      >
        {[
          ['无填充', 'transparent'],
          ['浅色填充', softFill],
          ['实心填充', style.stroke],
        ].map(([name, fill]) => (
          <button
            type="button"
            key={name}
            title={name}
            aria-label={name}
            aria-pressed={style.fill === fill}
            onClick={() => onChange({ fill })}
          >
            <Square size={16} fill={fill === 'transparent' ? 'none' : fill} />
          </button>
        ))}
        <button
          type="button"
          aria-label="更多样式"
          title="更多样式与排列"
          onClick={onMore}
        >
          <MoreHorizontal size={17} />
        </button>
      </fieldset>
      <fieldset
        className="owb-palette-row"
        aria-label="线条样式"
        style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
      >
        <button
          type="button"
          aria-label="实线"
          title="实线"
          aria-pressed={!style.dash}
          onClick={() => onChange({ dash: false })}
        >
          <Circle size={16} />
        </button>
        <button
          type="button"
          aria-label="虚线"
          title="虚线"
          aria-pressed={style.dash}
          onClick={() => onChange({ dash: true })}
        >
          <Circle size={16} strokeDasharray="3 3" />
        </button>
      </fieldset>
      <fieldset
        className="owb-palette-row"
        aria-label="线条大小"
        style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
      >
        {(
          [
            ['S', 1.5],
            ['M', 2.5],
            ['L', 4],
            ['XL', 6],
          ] as const
        ).map(([label, strokeWidth]) => (
          <button
            type="button"
            key={label}
            aria-label={`线条大小 ${label}`}
            title={`线宽 ${strokeWidth}`}
            aria-pressed={style.strokeWidth === strokeWidth}
            onClick={() => onChange({ strokeWidth })}
          >
            {label}
          </button>
        ))}
      </fieldset>
    </aside>
  );
}
