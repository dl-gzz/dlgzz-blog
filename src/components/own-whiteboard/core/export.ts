import { getShapeBounds, resolveArrowPoints, validateDocument } from './model';
import {
  MAX_ASSET_BYTES,
  MAX_BUNDLE_ASSET_BYTES,
  assertPersistentResources,
  getAsset,
  newAssetId,
  storeAssetRecords,
  validateAsset,
} from './storage';
import {
  type AssetRecord,
  type BoardDocument,
  type BoardShape,
  type Bounds,
  SHAPE_LABELS,
} from './types';

export const MAX_JSON_BYTES = 96 * 1024 * 1024;
export const MAX_EXPORT_EDGE = 8192;
export const MAX_EXPORT_PIXELS = 32 * 1024 * 1024;
const TEXT_LINE_HEIGHT = 1.4;
// biome-ignore lint/suspicious/noControlCharactersInRegex: XML 1.0 forbids these control characters.
const INVALID_XML_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;
// biome-ignore lint/suspicious/noControlCharactersInRegex: Download filenames cannot contain controls.
const INVALID_FILENAME_CHARACTERS = /[\\/:*?"<>|\u0000-\u001f]/g;
type PortableAsset = {
  id: string;
  name: string;
  mimeType: string;
  data: string;
};
type PortableBoard = {
  format: 'oneworker-whiteboard-bundle';
  version: 1;
  document: BoardDocument;
  assets: PortableAsset[];
};

export function escapeXML(value: unknown): string {
  return String(value ?? '')
    .replace(INVALID_XML_CHARACTERS, '')
    .replace(
      /[&<>"']/g,
      (ch) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&apos;',
        })[ch]!
    );
}

function base64(bytes: Uint8Array): string {
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += 24576)
    parts.push(btoa(String.fromCharCode(...bytes.subarray(i, i + 24576))));
  return parts.join('');
}

async function assetDataURI(record: AssetRecord): Promise<string> {
  validateAsset(record);
  return `data:${record.mimeType};base64,${base64(new Uint8Array(await record.blob.arrayBuffer()))}`;
}

function mediaSource(shape: BoardShape): string | undefined {
  if (shape.type !== 'image' && shape.type !== 'video') return undefined;
  return typeof shape.props.src === 'string'
    ? shape.props.src
    : typeof shape.props.url === 'string'
      ? shape.props.url
      : undefined;
}

async function fetchMedia(
  source: string,
  name = 'linked-media'
): Promise<AssetRecord> {
  if (!/^(https?:|data:(image|video)\/)/i.test(source))
    throw new Error('媒体地址不受支持，请重新导入原始文件。');
  if (source.length > MAX_JSON_BYTES) throw new Error('媒体数据超过导出限制。');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(source, {
      mode: 'cors',
      credentials: 'omit',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const contentLength = Number(response.headers.get('content-length'));
    if (contentLength > MAX_ASSET_BYTES) throw new Error('文件超过 32 MiB');
    const mimeType = (response.headers.get('content-type') ?? '')
      .split(';')[0]
      .trim()
      .toLowerCase();
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let size = 0;
    if (!response.body) throw new Error('无法读取媒体内容');
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_ASSET_BYTES) {
        await reader.cancel();
        throw new Error('文件超过 32 MiB');
      }
      chunks.push(new Uint8Array(value));
    }
    const blob = new Blob(chunks, { type: mimeType });
    const record = { id: newAssetId(), name, mimeType, blob };
    validateAsset(record);
    return record;
  } catch (error) {
    throw new Error(
      `媒体导出失败：无法读取链接资源（可能受跨域 CORS 限制、超时或文件过大）。请下载并重新导入图片/视频。${error instanceof Error ? ` ${error.message}` : ''}`
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function exportBoardJSON(input: BoardDocument): Promise<Blob> {
  const document = validateDocument(input);
  assertPersistentResources(document);
  const records = new Map<string, AssetRecord>();
  const external = new Map<string, string>();
  let bytes = 0;
  const addRecord = (record: AssetRecord) => {
    if (records.has(record.id)) return;
    validateAsset(record);
    bytes += record.blob.size;
    if (bytes > MAX_BUNDLE_ASSET_BYTES)
      throw new Error('白板媒体总量超过 64 MiB 导出限制。');
    records.set(record.id, record);
  };
  for (const page of document.pages) {
    for (const shape of page.shapes) {
      if (shape.props.assetId) {
        if (!records.has(shape.props.assetId)) {
          const record = await getAsset(shape.props.assetId);
          if (!record)
            throw new Error(
              `找不到媒体资源 ${shape.props.assetId}，无法生成完整备份。`
            );
          addRecord(record);
        }
      } else {
        const source = mediaSource(shape);
        if (!source) continue;
        let assetId = external.get(source);
        if (!assetId) {
          const record = await fetchMedia(source);
          addRecord(record);
          assetId = record.id;
          external.set(source, assetId);
        }
        shape.props.assetId = assetId;
        shape.props.src = undefined;
        shape.props.url = undefined;
      }
    }
  }
  const assets: PortableAsset[] = [];
  for (const record of records.values())
    assets.push({
      id: record.id,
      name: record.name,
      mimeType: record.mimeType,
      data: base64(new Uint8Array(await record.blob.arrayBuffer())),
    });
  const bundle: PortableBoard = {
    format: 'oneworker-whiteboard-bundle',
    version: 1,
    document,
    assets,
  };
  const result = new Blob([JSON.stringify(bundle)], {
    type: 'application/json',
  });
  if (result.size > MAX_JSON_BYTES)
    throw new Error('白板备份超过 96 MiB 限制，请拆分页面或压缩媒体。');
  return result;
}

export async function importBoardJSON(text: string): Promise<BoardDocument> {
  if (text.length > MAX_JSON_BYTES || new Blob([text]).size > MAX_JSON_BYTES)
    throw new Error('导入文件超过 96 MiB 限制。');
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    throw new Error('文件不是有效的 JSON 白板。');
  }
  if (
    !input ||
    typeof input !== 'object' ||
    !('format' in input) ||
    input.format !== 'oneworker-whiteboard-bundle'
  ) {
    const doc = validateDocument(input);
    assertPersistentResources(doc);
    const checked = new Set<string>();
    for (const page of doc.pages) {
      for (const shape of page.shapes) {
        const id = shape.props.assetId;
        if (!id || checked.has(id)) continue;
        if (!(await getAsset(id))) {
          throw new Error(
            '此 JSON 未包含媒体文件，当前浏览器也没有对应资源。请在原白板导出带媒体的 JSON 备份。'
          );
        }
        checked.add(id);
      }
    }
    return doc;
  }
  const bundle = input as Partial<PortableBoard>;
  if (
    bundle.version !== 1 ||
    !Array.isArray(bundle.assets) ||
    bundle.assets.length > 2000
  )
    throw new Error('白板资源包版本或结构无效。');
  const document = validateDocument(bundle.document);
  assertPersistentResources(document);
  const records: AssetRecord[] = [];
  const idMap = new Map<string, string>();
  let total = 0;
  for (const asset of bundle.assets) {
    if (
      !asset ||
      typeof asset.id !== 'string' ||
      idMap.has(asset.id) ||
      typeof asset.name !== 'string' ||
      typeof asset.mimeType !== 'string' ||
      typeof asset.data !== 'string'
    )
      throw new Error('白板资源列表无效或重复。');
    if (
      asset.data.length > Math.ceil(MAX_ASSET_BYTES / 3) * 4 ||
      asset.data.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(asset.data)
    )
      throw new Error('媒体资源大小或 Base64 编码无效。');
    const binary = atob(asset.data);
    total += binary.length;
    if (total > MAX_BUNDLE_ASSET_BYTES)
      throw new Error('白板媒体总量超过 64 MiB 导入限制。');
    const bytes = Uint8Array.from(binary, (character) =>
      character.charCodeAt(0)
    );
    const record = {
      id: newAssetId(),
      name: asset.name,
      mimeType: asset.mimeType,
      blob: new Blob([bytes], { type: asset.mimeType }),
    };
    validateAsset(record);
    idMap.set(asset.id, record.id);
    records.push(record);
  }
  for (const page of document.pages) {
    for (const shape of page.shapes) {
      if (!shape.props.assetId) continue;
      const id = idMap.get(shape.props.assetId);
      if (!id) throw new Error(`资源包缺少媒体 ${shape.props.assetId}。`);
      shape.props.assetId = id;
    }
  }
  await storeAssetRecords(records);
  return document;
}

function color(value: string, fallback = '#18263c'): string {
  return /^(#[\da-f]{3,8}|[a-z]{1,24}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%]+\))$/i.test(
    value
  )
    ? escapeXML(value)
    : fallback;
}

/** Approximate system-font wrapping, also used by SVG where foreignObject is avoided. */
export function wrapExportText(
  text: string,
  width: number,
  fontSize: number,
  maxLines = 100
): string[] {
  const lines: string[] = [];
  const maxWidth = Math.max(fontSize, width);
  for (const paragraph of text.replace(/\r/g, '').split('\n')) {
    let line = '';
    let used = 0;
    for (const char of paragraph) {
      const advance = fontSize * (char.charCodeAt(0) <= 127 ? 0.57 : 1);
      if (line && used + advance > maxWidth) {
        lines.push(line);
        line = '';
        used = 0;
      }
      if (lines.length >= maxLines)
        return [
          ...lines.slice(0, maxLines - 1),
          `${lines[maxLines - 1].slice(0, -1)}…`,
        ];
      line += char;
      used += advance;
    }
    lines.push(line);
    if (lines.length >= maxLines) return lines.slice(0, maxLines);
  }
  return lines;
}

function textSVG(
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  fontSize: number,
  fill: string,
  options: {
    bold?: unknown;
    italic?: unknown;
    align?: unknown;
    overflow?: boolean;
  } = {}
): string {
  const lineHeight = fontSize * TEXT_LINE_HEIGHT;
  const lines = wrapExportText(
    text,
    width,
    fontSize,
    options.overflow
      ? Number.POSITIVE_INFINITY
      : Math.max(1, Math.floor(height / lineHeight))
  );
  const anchor =
    options.align === 'center'
      ? 'middle'
      : options.align === 'right'
        ? 'end'
        : 'start';
  const textX =
    x + (anchor === 'middle' ? width / 2 : anchor === 'end' ? width : 0);
  return `<text x="${textX}" y="${y + fontSize}" font-size="${fontSize}" font-weight="${options.bold ? 700 : 400}" font-style="${options.italic ? 'italic' : 'normal'}" text-anchor="${anchor}" fill="${fill}" stroke="none" xml:space="preserve">${lines.map((line, index) => `<tspan x="${textX}" dy="${index ? lineHeight : 0}">${escapeXML(line)}</tspan>`).join('')}</text>`;
}

/** CSS text overflows its fixed-height box; rotate the expanded ink box about the original center. */
function overflowingTextBounds(shape: BoardShape): Bounds | null {
  if (shape.type !== 'text') return null;
  const fontSize = shape.style.fontSize;
  const lineCount = wrapExportText(
    shape.props.text ?? '',
    shape.w - 16,
    fontSize,
    Number.POSITIVE_INFINITY
  ).length;
  const height = Math.max(
    shape.h,
    lineCount * fontSize * TEXT_LINE_HEIGHT + 12
  );
  const width = Math.max(shape.w, fontSize + 16);
  const extraWidth = width - shape.w;
  const left =
    shape.x -
    (shape.props.align === 'right'
      ? extraWidth
      : shape.props.align === 'center'
        ? extraWidth / 2
        : 0);
  const cx = shape.x + shape.w / 2;
  const cy = shape.y + shape.h / 2;
  const angle = (shape.rotation * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const corners = [
    [left, shape.y],
    [left + width, shape.y],
    [left + width, shape.y + height],
    [left, shape.y + height],
  ].map(([x, y]) => ({
    x: cx + (x - cx) * cos - (y - cy) * sin,
    y: cy + (x - cx) * sin + (y - cy) * cos,
  }));
  const x = Math.min(...corners.map((point) => point.x));
  const y = Math.min(...corners.map((point) => point.y));
  return {
    x,
    y,
    w: Math.max(...corners.map((point) => point.x)) - x,
    h: Math.max(...corners.map((point) => point.y)) - y,
  };
}

function cardText(shape: BoardShape): string {
  const { props } = shape;
  const title = props.title || SHAPE_LABELS[shape.type];
  const summary =
    props.text ||
    props.result ||
    props.description ||
    props.url ||
    props.src ||
    (Array.isArray(props.messages)
      ? props.messages
          .slice(-3)
          .map((message) => `${message.role}: ${message.content}`)
          .join('\n')
      : '');
  const note = ['video', 'video_player', 'embed', 'preview_html'].includes(
    shape.type
  )
    ? '（卡片摘要，不含视频画面或网页实时内容）'
    : '（卡片摘要）';
  return `${title}\n${note}${summary ? `\n\n${summary}` : ''}`;
}

export function getExportBounds(
  document: BoardDocument,
  pageId: string
): Bounds {
  const page = document.pages.find((candidate) => candidate.id === pageId);
  if (!page) throw new Error('找不到要导出的页面。');
  if (!page.shapes.length) return { x: 0, y: 0, w: 800, h: 600 };
  const bounds = page.shapes.flatMap((shape) => {
    const geometry = getShapeBounds(shape, page.shapes);
    const text = overflowingTextBounds(shape);
    return text ? [geometry, text] : [geometry];
  });
  const padding = Math.max(
    32,
    ...page.shapes.map((shape) => shape.style.strokeWidth * 4)
  );
  const x = Math.min(...bounds.map((bound) => bound.x)) - padding;
  const y = Math.min(...bounds.map((bound) => bound.y)) - padding;
  const right = Math.max(...bounds.map((bound) => bound.x + bound.w)) + padding;
  const bottom =
    Math.max(...bounds.map((bound) => bound.y + bound.h)) + padding;
  return { x, y, w: Math.ceil(right - x), h: Math.ceil(bottom - y) };
}

export function assertRasterSize(width: number, height: number): void {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    width > MAX_EXPORT_EDGE ||
    height > MAX_EXPORT_EDGE ||
    width * height > MAX_EXPORT_PIXELS
  )
    throw new Error(
      '页面过大，无法安全生成位图（最大边 8192 像素、总面积 32MP）。请导出 SVG 或拆分页面。'
    );
}

/** Pure renderer. Images must be supplied as inlined data URIs, keyed by asset id/source. */
export function renderBoardSVG(
  input: BoardDocument,
  pageId: string,
  assets: Record<string, string> = {}
): string {
  const document = validateDocument(input);
  const page = document.pages.find((candidate) => candidate.id === pageId);
  if (!page) throw new Error('找不到要导出的页面。');
  const bounds = getExportBounds(document, pageId);
  const rendered = page.shapes
    .map((shape, index) => {
      const { x, y, w, h, style } = shape;
      const stroke = color(style.stroke);
      const fill = color(style.fill, 'transparent');
      const transform = `rotate(${shape.rotation} ${x + w / 2} ${y + h / 2})`;
      const common = `stroke="${stroke}" fill="${fill}" stroke-width="${style.strokeWidth}" stroke-linejoin="round" stroke-linecap="round"${style.dash ? ' stroke-dasharray="8 6"' : ''}`;
      const lineCommon = common.replace(`fill="${fill}"`, 'fill="none"');
      const label = escapeXML(SHAPE_LABELS[shape.type]);
      let content = '';
      let rotate = true;
      switch (shape.type) {
        case 'rectangle':
          content = `<rect x="${x}" y="${y}" width="${w}" height="${h}" ${common}/>`;
          break;
        case 'ellipse':
          content = `<ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}" ${common}/>`;
          break;
        case 'triangle':
          content = `<polygon points="${x + w / 2},${y} ${x + w},${y + h} ${x},${y + h}" ${common}/>`;
          break;
        case 'diamond':
          content = `<polygon points="${x + w / 2},${y} ${x + w},${y + h / 2} ${x + w / 2},${y + h} ${x},${y + h / 2}" ${common}/>`;
          break;
        case 'arrow': {
          const points = resolveArrowPoints(shape, page.shapes);
          rotate = false;
          content = `<defs><marker id="arrow-${index}" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="strokeWidth"><path d="M 1 1 L 8 5 L 1 9" stroke="${stroke}" fill="none" stroke-width="1.6"/></marker></defs><polyline points="${points.map((p) => `${p.x},${p.y}`).join(' ')}" ${lineCommon} marker-end="url(#arrow-${index})"/>`;
          break;
        }
        case 'line':
        case 'draw':
        case 'highlight': {
          const points = shape.points?.length
            ? shape.points
            : [
                { x: 0, y: 0 },
                { x: w, y: h },
              ];
          content = `<polyline points="${points.map((point) => `${x + point.x},${y + point.y}`).join(' ')}" ${lineCommon}/>`;
          break;
        }
        case 'text':
          content = textSVG(
            shape.props.text ?? '',
            x + 8,
            y + 6,
            w - 16,
            h - 12,
            style.fontSize,
            stroke,
            {
              bold: shape.props.bold,
              italic: shape.props.italic,
              align: shape.props.align,
              overflow: true,
            }
          );
          break;
        case 'note':
          content = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${fill === 'transparent' ? '#fff2a8' : fill}" stroke="${stroke}" stroke-width="${style.strokeWidth}"/>${textSVG(shape.props.text ?? '', x + 18, y + 18, w - 36, h - 36, style.fontSize, stroke, { bold: shape.props.bold, italic: shape.props.italic, align: shape.props.align })}`;
          break;
        case 'frame':
          content = `<rect x="${x}" y="${y}" width="${w}" height="${h}" ${common}/>${textSVG(shape.props.title ?? '框架', x + 8, y + 4, w - 16, 28, 16, stroke)}`;
          break;
        case 'image': {
          const source = shape.props.assetId || mediaSource(shape) || '';
          const data =
            assets[source] ||
            (source.startsWith('data:image/') ? source : undefined);
          if (
            !data ||
            !/^data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+$/.test(data)
          )
            throw new Error('图片资源未内嵌，无法生成完整图片导出。');
          const crop = shape.props.crop;
          let imageX = x;
          let imageY = y;
          let imageW = w;
          let imageH = h;
          if (crop && crop.w > 0 && crop.h > 0) {
            imageW = w / crop.w;
            imageH = h / crop.h;
            imageX = x - crop.x * imageW;
            imageY = y - crop.y * imageH;
          }
          content = `<defs><clipPath id="image-${index}"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath></defs><image x="${imageX}" y="${imageY}" width="${imageW}" height="${imageH}" preserveAspectRatio="none" href="${escapeXML(data)}" clip-path="url(#image-${index})"/>`;
          break;
        }
        default:
          content = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${fill === 'transparent' ? '#f8fafc' : fill}" stroke="${stroke}" stroke-width="${style.strokeWidth}"/>${textSVG(cardText(shape), x + 14, y + 12, w - 28, h - 24, Math.min(style.fontSize, 18), stroke)}`;
      }
      if (
        ['rectangle', 'ellipse', 'triangle', 'diamond'].includes(shape.type) &&
        shape.props.text
      )
        content += textSVG(
          shape.props.text,
          x + 12,
          y + 12,
          w - 24,
          h - 24,
          style.fontSize,
          stroke
        );
      return `<g data-shape-id="${escapeXML(shape.id)}" aria-label="${label}" opacity="${style.opacity * (shape.type === 'highlight' ? 0.35 : 1)}"${rotate ? ` transform="${transform}"` : ''}>${content}</g>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${bounds.w}" height="${bounds.h}" viewBox="${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif"><title>${escapeXML(document.name)} — ${escapeXML(page.name)}</title><rect x="${bounds.x}" y="${bounds.y}" width="${bounds.w}" height="${bounds.h}" fill="white"/>${rendered}</svg>`;
}

export async function exportBoardImage(
  input: BoardDocument,
  pageId: string,
  format: 'svg' | 'png' | 'jpeg' | 'webp'
): Promise<Blob> {
  const doc = validateDocument(input);
  const page = doc.pages.find((candidate) => candidate.id === pageId);
  if (!page) throw new Error('找不到要导出的页面。');
  const bounds = getExportBounds(doc, pageId);
  if (format !== 'svg') assertRasterSize(bounds.w, bounds.h);
  const assets: Record<string, string> = Object.create(null);
  let bytes = 0;
  for (const shape of page.shapes) {
    if (shape.type !== 'image') continue;
    const key = shape.props.assetId || mediaSource(shape);
    if (!key) throw new Error('图片缺少源文件，无法导出。');
    if (assets[key]) continue;
    const record = shape.props.assetId
      ? await getAsset(shape.props.assetId)
      : await fetchMedia(key);
    if (!record) throw new Error(`找不到媒体资源 ${key}，请重新导入。`);
    bytes += record.blob.size;
    if (bytes > MAX_BUNDLE_ASSET_BYTES)
      throw new Error('图片媒体总量超过 64 MiB 导出限制。');
    assets[key] = await assetDataURI(record);
  }
  const svg = new Blob([renderBoardSVG(doc, pageId, assets)], {
    type: 'image/svg+xml;charset=utf-8',
  });
  if (format === 'svg') return svg;
  if (typeof document === 'undefined')
    throw new Error('位图导出需要在浏览器中执行。');
  await document.fonts?.ready;
  const url = URL.createObjectURL(svg);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('图片渲染超时，请尝试 SVG 导出。')),
        20000
      );
      image.onload = () => {
        clearTimeout(timer);
        resolve();
      };
      image.onerror = () => {
        clearTimeout(timer);
        reject(new Error('浏览器无法渲染导出图片，请尝试 SVG 导出。'));
      };
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = bounds.w;
    canvas.height = bounds.h;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('浏览器无法创建画布。');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0);
    const mime = `image/${format}`;
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => {
          if (!blob) reject(new Error('位图编码失败，请尝试 SVG 导出。'));
          else if (blob.type !== mime)
            reject(
              new Error(
                `当前浏览器不支持 ${format.toUpperCase()} 编码，请选择 PNG。`
              )
            );
          else resolve(blob);
        },
        mime,
        0.92
      )
    );
  } catch (error) {
    if (error instanceof DOMException && error.name === 'SecurityError')
      throw new Error(
        '图片受到跨域限制，无法导出。请将远程图片下载后重新导入。'
      );
    throw error;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download =
    name.replace(INVALID_FILENAME_CHARACTERS, '_').slice(0, 240) ||
    'whiteboard';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // A delay lets browsers finish reading the object URL before releasing it.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
