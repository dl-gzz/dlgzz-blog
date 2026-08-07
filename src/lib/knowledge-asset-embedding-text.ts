export const KNOWLEDGE_ASSET_EMBEDDING_TEXT_VERSION = '1';

export type KnowledgeAssetEmbeddingTextInput = {
  title?: string | null;
  altTexts?: Array<string | null | undefined>;
  caption?: string | null;
  ocrText?: string | null;
  platform?: string | null;
  publisher?: string | null;
  sourceType?: string | null;
  visualFacts?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
};

const MAX_EMBEDDING_TEXT_LENGTH = 6000;
const MAX_OCR_TEXT_LENGTH = 1000;

const FIELD_LABELS: Record<string, string> = {
  type: '图片类型',
  topic: '主题',
  contrast: '对比',
  guidance: '说明',
  components: '组成',
  steps: '步骤',
  controls: '控制项',
  modes: '模式',
  protectedActions: '受保护操作',
  successSignal: '成功标志',
  layers: '层级',
  id: '角色标识',
  name: '角色名称',
  role: '角色身份',
  brand: '品牌',
  visibleLabel: '画面文字',
};

const VALUE_ALIASES: Record<string, string[]> = {
  wechat_official_account: ['微信公众号', '公众号'],
  wechat_official_account_article: ['微信公众号文章', '公众号配图'],
  knowledge_answer: ['知识库回答'],
  brand_mascot: ['品牌角色', '品牌吉祥物'],
  blue_cat: ['蓝猫'],
  owned_course_illustration: ['自有课程插图'],
};

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function expandValues(values: string[]) {
  const expanded: string[] = [];
  for (const value of values) {
    if (!value) continue;
    expanded.push(value, ...(VALUE_ALIASES[value] || []));
  }
  return [...new Set(expanded)];
}

function appendFactLines(lines: string[], key: string, value: unknown): void {
  if (value === null || value === undefined) return;
  const label = FIELD_LABELS[key] || key;

  if (typeof value === 'string') {
    const normalized = normalizeText(value);
    if (normalized)
      lines.push(`${label}：${expandValues([normalized]).join('、')}`);
    return;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    lines.push(`${label}：${String(value)}`);
    return;
  }
  if (Array.isArray(value)) {
    const scalarValues = value
      .map((item) => normalizeText(item))
      .filter(Boolean);
    if (scalarValues.length === value.length) {
      lines.push(`${label}：${expandValues(scalarValues).join('、')}`);
      return;
    }
    for (const item of value) {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        for (const childKey of Object.keys(item).sort()) {
          appendFactLines(
            lines,
            childKey,
            (item as Record<string, unknown>)[childKey]
          );
        }
      }
    }
    return;
  }
  if (typeof value === 'object') {
    for (const childKey of Object.keys(value).sort()) {
      appendFactLines(
        lines,
        childKey,
        (value as Record<string, unknown>)[childKey]
      );
    }
  }
}

function appendLine(lines: string[], label: string, value: unknown) {
  const normalized = normalizeText(value);
  if (normalized) lines.push(`${label}：${normalized}`);
}

export function buildKnowledgeAssetEmbeddingText(
  asset: KnowledgeAssetEmbeddingTextInput
) {
  const lines: string[] = [];
  appendLine(lines, '标题', asset.title);

  const altTexts = [
    ...new Set(
      (asset.altTexts || [])
        .map(normalizeText)
        .filter((value) => Boolean(value))
    ),
  ].sort();
  if (altTexts.length) lines.push(`替代文本：${altTexts.join('；')}`);

  appendLine(lines, '图注', asset.caption);
  const ocrText = normalizeText(asset.ocrText).slice(0, MAX_OCR_TEXT_LENGTH);
  if (ocrText) lines.push(`画面文字识别：${ocrText}`);

  const platform = normalizeText(asset.platform);
  if (platform) lines.push(`平台：${expandValues([platform]).join('、')}`);
  appendLine(lines, '发布者', asset.publisher);

  const sourceType = normalizeText(asset.sourceType);
  if (sourceType) {
    lines.push(`来源类型：${expandValues([sourceType]).join('、')}`);
  }

  const usageContexts = asset.metadata?.usageContexts;
  if (Array.isArray(usageContexts)) {
    const values = usageContexts.map(normalizeText).filter(Boolean);
    if (values.length) {
      lines.push(`使用场景：${expandValues(values).join('、')}`);
    }
  }

  if (asset.visualFacts) {
    for (const key of Object.keys(asset.visualFacts).sort()) {
      appendFactLines(lines, key, asset.visualFacts[key]);
    }
  }

  return [...new Set(lines)].join('\n').slice(0, MAX_EMBEDDING_TEXT_LENGTH);
}
