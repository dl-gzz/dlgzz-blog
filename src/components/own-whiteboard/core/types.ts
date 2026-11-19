/** App-owned whiteboard format. No tldraw runtime or schema dependency. */
export type Point = { x: number; y: number; pressure?: number };
export type Camera = { x: number; y: number; zoom: number };
export type Bounds = { x: number; y: number; w: number; h: number };
export const SHAPE_TYPES = [
  'rectangle', 'ellipse', 'triangle', 'diamond', 'draw', 'highlight',
  'line', 'arrow', 'text', 'note', 'image', 'video', 'bookmark', 'embed', 'frame',
  'ai_terminal', 'ai_result', 'preview_html', 'blog_post', 'skill',
  'video_player', 'ai_video_analyzer', 'math_quiz',
] as const;
export type ShapeType = (typeof SHAPE_TYPES)[number];
export type Tool = 'select' | 'hand' | 'eraser' | 'laser' | ShapeType;
export type ShapeStyle = {
  stroke: string;
  fill: string;
  strokeWidth: number;
  fontSize: number;
  opacity: number;
  dash: boolean;
};
export type Binding = { shapeId: string; anchor: Point };
export type ShapeProps = {
  text?: string;
  html?: string;
  title?: string;
  url?: string;
  src?: string;
  assetId?: string;
  description?: string;
  image?: string;
  date?: string;
  category?: string;
  messages?: { role: 'user' | 'assistant' | 'system'; content: string }[];
  result?: string;
  videoId?: string;
  crop?: { x: number; y: number; w: number; h: number };
  [key: string]: unknown;
};
export type BoardShape = Bounds & {
  id: string;
  type: ShapeType;
  rotation: number;
  style: ShapeStyle;
  props: ShapeProps;
  /** Visual scale of a product card's fixed-size layout. Absent means 1. */
  cardScale?: number;
  points?: Point[];
  startBinding?: Binding;
  endBinding?: Binding;
  groupId?: string;
  parentId?: string;
  locked?: boolean;
};
export type BoardPage = { id: string; name: string; shapes: BoardShape[]; camera: Camera; assistantAppliedRequests?: string[] };
export type BoardDocument = {
  format: 'oneworker-whiteboard';
  version: 2;
  id: string;
  name: string;
  pages: BoardPage[];
  currentPageId: string;
};
export type AssetRecord = { id: string; blob: Blob; name: string; mimeType: string };
export type BoardCardProps = {
  shape: BoardShape;
  shapes: BoardShape[];
  interactive: boolean;
  updateProps: (patch: Partial<ShapeProps>) => void;
  updateShapeProps?: (id: string, patch: Partial<ShapeProps>) => void;
  insertShape: (type: ShapeType, props?: ShapeProps) => void;
  notify: (message: string) => void;
  resolveAsset: (id: string) => string | undefined;
};
export const DEFAULT_STYLE: ShapeStyle = {
  stroke: '#18263c', fill: 'transparent', strokeWidth: 2.5,
  fontSize: 24, opacity: 1, dash: false,
};
export const CARD_TYPES: ShapeType[] = [
  'ai_terminal', 'ai_result', 'preview_html', 'blog_post', 'skill',
  'video_player', 'ai_video_analyzer', 'math_quiz',
];
export const SHAPE_LABELS: Record<ShapeType, string> = {
  rectangle: '矩形', ellipse: '椭圆', triangle: '三角形', diamond: '菱形',
  draw: '画笔', highlight: '荧光笔', line: '线条', arrow: '箭头', text: '文字',
  note: '便签', image: '图片', video: '视频', bookmark: '链接卡片', embed: '网页嵌入',
  frame: '框架', ai_terminal: 'AI 对话', ai_result: 'AI 结果', preview_html: 'HTML 预览',
  blog_post: '文章卡片', skill: '视频号下载', video_player: '视频播放器',
  ai_video_analyzer: '视频帧分析', math_quiz: '数学练习',
};
