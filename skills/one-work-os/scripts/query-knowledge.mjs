#!/usr/bin/env node

const DEFAULT_ORIGIN = 'https://www.dlgzz.com';
const ENDPOINT_PATH = '/api/knowledge/query';
const DEFAULT_PACK_ID = 'onework-workbuddy-v1';
const XHS_OPEN_SHOP_PACK_ID = 'xhs-open-shop-v1';
const XHS_OPERATIONS_PACK_ID = 'xhs-operations-v1';

function usage(stream = process.stderr) {
  stream.write(
    [
      'Usage: node scripts/query-knowledge.mjs --query <text> [options]',
      '',
      'Options:',
      '  --pack <id|auto>      Licensed knowledge pack ID (auto routes WorkBuddy/XHS)',
      '  --limit <1-20>        Result limit (default: 6)',
      '  --no-assets           Omit linked images and resources',
      '  --json                Print the complete JSON response',
      '  --help                Show this help',
      '',
      'Environment:',
      '  ONEWORK_API_KEY       Required bearer key',
      '  ONEWORK_KNOWLEDGE_URL Optional full knowledge endpoint',
      '  ONEWORK_API_URL       Optional OneWorkOS URL; its origin is used',
      '',
    ].join('\n')
  );
}

function parseArgs(argv) {
  const options = {
    query: '',
    packId: DEFAULT_PACK_ID,
    limit: 6,
    includeAssets: true,
    json: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--query') options.query = argv[++index] || '';
    else if (arg === '--pack') options.packId = argv[++index] || '';
    else if (arg === '--limit') options.limit = Number(argv[++index]);
    else if (arg === '--no-assets') options.includeAssets = false;
    else if (arg === '--json') options.json = true;
    else if (!arg.startsWith('-') && !options.query) options.query = arg;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  options.query = options.query.trim();
  options.packId = options.packId.trim();
  if (!options.help && !options.query) throw new Error('Missing --query');
  if (!options.help && !options.packId) throw new Error('Missing --pack');
  if (
    !Number.isFinite(options.limit) ||
    options.limit < 1 ||
    options.limit > 20
  ) {
    throw new Error('--limit must be between 1 and 20');
  }
  options.limit = Math.floor(options.limit);
  return options;
}

function resolvePackId(packId, query) {
  if (packId !== 'auto') return packId;
  const normalized = String(query || '').toLowerCase();
  const isXhs = /小红书|xiaohongshu|xhs|red\b/.test(normalized);
  if (!isXhs) return DEFAULT_PACK_ID;
  if (
    /开店|入驻|店铺|个人店|个体店|店铺类型|升级|营业执照|主体|资质|品牌授权|商标|审核|保证金|运费宝/.test(
      normalized
    )
  ) {
    return XHS_OPEN_SHOP_PACK_ID;
  }
  return XHS_OPERATIONS_PACK_ID;
}

function resolveEndpoint() {
  const explicit = process.env.ONEWORK_KNOWLEDGE_URL?.trim();
  const base =
    explicit || process.env.ONEWORK_API_URL?.trim() || DEFAULT_ORIGIN;
  let parsed;
  try {
    parsed = new URL(base);
  } catch {
    throw new Error('OneWorkOS endpoint is not a valid URL');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('OneWorkOS endpoint must use HTTP or HTTPS');
  }
  return explicit
    ? parsed.toString()
    : new URL(ENDPOINT_PATH, parsed.origin).toString();
}

function normalizeSourceUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    url.hash = '';
    for (const name of [...url.searchParams.keys()]) {
      if (/^utm_/i.test(name)) url.searchParams.delete(name);
    }
    url.searchParams.sort();
    return url.toString();
  } catch {
    return null;
  }
}

function escapeMarkdownLabel(value, fallback) {
  const label =
    typeof value === 'string' && value.trim() ? value.trim() : fallback;
  return label
    .replaceAll('\\', '\\\\')
    .replaceAll('[', '\\[')
    .replaceAll(']', '\\]')
    .replace(/\s+/g, ' ');
}

function tutorialImagePriority(asset) {
  const role = typeof asset?.role === 'string' ? asset.role : '';
  const rolePriority = {
    ui_step: 500,
    configuration_diagram: 450,
    safety_diagram: 400,
    workflow_diagram: 350,
    concept_diagram: 250,
    inline: 200,
    cover: 50,
  };
  return rolePriority[role] ?? 150;
}

function hasUiInstructionIntent(query) {
  if (/怎么理解|如何理解|是什么意思|什么原理|概念/.test(query || '')) {
    return false;
  }
  return /怎么|如何|哪里|哪一步|下一步|点击|打开|进入|设置|配置|安装|使用|操作|按钮|页面|界面|步骤|开始|创建|添加|开启|我要|我想|帮我|实现|完成/.test(
    query || ''
  );
}

function tutorialImageEvidenceTier(asset) {
  const sourceType =
    typeof asset?.sourceType === 'string' ? asset.sourceType : '';
  const sourcePriority = {
    official_product_screenshot: 400,
    official_platform_screenshot: 400,
    user_uploaded_screenshot: 300,
    user_provided_screenshot: 300,
    product_ui_screenshot: 200,
    ui_screenshot: 200,
    screenshot: 200,
    catalog: 200,
    owned_course_illustration: 0,
  };
  return sourcePriority[sourceType] ?? 100;
}

const TUTORIAL_IMAGE_KEYWORDS = [
  '完全访问',
  '默认权限',
  '自动化',
  '小程序',
  '连接器',
  '专家团',
  '选择文件',
  '技能',
  'skill',
  '上传',
  '本地',
  '安装',
  '导入',
  '创建',
  '查找',
  '权限',
  '手机',
  '推送',
  '通知',
  '项目',
  '专家',
  '助理',
  '微信',
  '邮箱',
  '模板',
  '卸载',
  '批量',
  '开启',
  '关闭',
  '添加',
  '任务',
];

const TUTORIAL_IMAGE_SYNONYM_GROUPS = [
  [
    ['手机', '小程序'],
    ['手机', '小程序'],
  ],
  [
    ['发到', '发送', '推送', '通知'],
    ['发送', '推送', '通知', '查收'],
  ],
  [
    ['怎么装', '安装', '导入', '上传'],
    ['安装', '导入', '上传', '选择文件'],
  ],
  [
    ['开启', '打开', '启用'],
    ['开启', '打开', '启用', '切换'],
  ],
  [
    ['哪里', '入口', '点', '点击'],
    ['入口', '点击', '菜单', '按钮', '下拉'],
  ],
];

const TUTORIAL_IMAGE_INTENT_ANCHORS = [
  [['远程'], ['助理', '远程']],
  [['完全访问'], ['完全访问']],
  [['自动化'], ['自动化']],
  [['项目'], ['项目']],
  [
    ['专家团', '多角色'],
    ['专家团', '专家'],
  ],
  [['qq邮箱', 'qq 邮箱', '邮箱'], ['邮箱']],
  [
    ['技能', 'skill'],
    ['技能', 'skill'],
  ],
  [['连接器'], ['连接器', '连接应用', '连应用']],
];

function tutorialImageQueryMatchScore(asset, query) {
  const normalizedQuery = String(query || '').toLowerCase();
  const assetText = [asset?.title, asset?.alt, asset?.caption, asset?.role]
    .filter((value) => typeof value === 'string')
    .join(' ')
    .toLowerCase();
  let score = 0;

  for (const [queryTerms, assetTerms] of TUTORIAL_IMAGE_INTENT_ANCHORS) {
    if (
      queryTerms.some((term) => normalizedQuery.includes(term)) &&
      !assetTerms.some((term) => assetText.includes(term))
    ) {
      return -1;
    }
  }
  for (const keyword of TUTORIAL_IMAGE_KEYWORDS) {
    if (normalizedQuery.includes(keyword) && assetText.includes(keyword)) {
      score += keyword.length * 20;
    }
  }
  for (const [queryTerms, assetTerms] of TUTORIAL_IMAGE_SYNONYM_GROUPS) {
    if (
      queryTerms.some((term) => normalizedQuery.includes(term)) &&
      assetTerms.some((term) => assetText.includes(term))
    ) {
      score += 25;
    }
  }
  return score;
}

function selectTutorialImages(results, query, maxImages = 1) {
  const candidates = [];
  const uiInstructionIntent = hasUiInstructionIntent(query);
  for (const [resultIndex, result] of results.entries()) {
    for (const asset of Array.isArray(result.assets) ? result.assets : []) {
      if (asset.type !== 'image' || !asset.url) continue;
      const evidenceTier = tutorialImageEvidenceTier(asset);
      if (uiInstructionIntent && evidenceTier <= 0) continue;
      candidates.push({
        asset,
        resultIndex,
        evidenceTier,
        queryMatchScore: tutorialImageQueryMatchScore(asset, query),
        priority:
          tutorialImagePriority(asset) +
          (typeof result.score === 'number' ? result.score : 0),
      });
    }
  }
  candidates.sort(
    (left, right) =>
      right.queryMatchScore - left.queryMatchScore ||
      (uiInstructionIntent ? right.evidenceTier - left.evidenceTier : 0) ||
      right.priority - left.priority ||
      left.resultIndex - right.resultIndex
  );

  const selected = [];
  const seenAssets = new Set();
  const bestQueryMatchScore = candidates[0]?.queryMatchScore || 0;
  for (const candidate of candidates) {
    if (selected.length >= maxImages) break;
    if (
      selected.length > 0 &&
      (candidate.queryMatchScore <= 0 ||
        candidate.queryMatchScore < bestQueryMatchScore * 0.7)
    ) {
      continue;
    }
    const key = candidate.asset.id || candidate.asset.url;
    if (seenAssets.has(key)) continue;
    seenAssets.add(key);
    selected.push(candidate);
  }
  return selected;
}

function printReadable(data) {
  console.log(`Pack: ${data.packId}`);
  console.log(`Query: ${data.query}`);
  console.log(`Results: ${data.results.length}`);
  const sources = new Map();
  const selectedTutorialImages = selectTutorialImages(data.results, data.query);

  for (const [index, result] of data.results.entries()) {
    const heading = result.heading ? ` / ${result.heading}` : '';
    const score =
      typeof result.score === 'number' ? result.score.toFixed(3) : 'n/a';
    const freshness =
      result.metadata?.lastUpdated || result.metadata?.factsVerified;
    const verified = freshness ? `, verified ${freshness}` : '';
    const authority = result.metadata?.authority
      ? `, ${result.metadata.authority}`
      : '';
    console.log(
      `\n[${index + 1}] ${result.title}${heading} (score ${score}${authority}${verified})`
    );
    console.log(result.content);

    const sourceUrl = normalizeSourceUrl(result.sourceUrl);
    const sourceTitle = escapeMarkdownLabel(result.title, '查看出处');
    const sourceKey =
      sourceUrl || `unlinked:${result.source || ''}:${sourceTitle}`;
    const supportsSelectedImage = selectedTutorialImages.some(
      (candidate) => candidate.resultIndex === index
    );
    if (!sources.has(sourceKey)) {
      sources.set(sourceKey, {
        url: sourceUrl,
        title: sourceTitle,
        platform: result.metadata?.platform,
        publisher: result.metadata?.publisher,
        supportsSelectedImage,
      });
    } else if (supportsSelectedImage) {
      sources.get(sourceKey).supportsSelectedImage = true;
    }
    const assets = Array.isArray(result.assets) ? result.assets : [];
    const images = selectedTutorialImages
      .filter((candidate) => candidate.resultIndex === index)
      .map((candidate) => candidate.asset);
    for (const image of images) {
      const alt = escapeMarkdownLabel(
        image.alt || image.caption,
        'WorkBuddy 教程图'
      );
      console.log('\n教程图资产（由宿主作为图片渲染）:');
      console.log(`![${alt}](${image.url})`);
      console.log(
        `[图片未显示时查看原图](${image.originalUrl || image.url})`
      );
      if (image.caption && image.caption !== alt) {
        console.log(`图示: ${image.caption}`);
      }
    }

    const resources = Array.isArray(result.resources) ? result.resources : [];
    const related = [...resources, ...assets].find(
      (asset) => (asset.type === 'video' || asset.type === 'link') && asset.url
    );
    if (related) {
      const label =
        related.title ||
        related.caption ||
        (related.type === 'video' ? '相关视频' : '官方原文');
      const prefix = related.publisher
        ? `${related.publisher}的`
        : related.official
          ? '官方'
          : '相关';
      const platform = related.platform ? ` · ${related.platform}` : '';
      console.log(
        `${prefix}${related.type === 'video' ? '视频' : '链接'}${platform}: [${label}](${related.url})`
      );
    }
  }

  const sourceEntries = [...sources.entries()]
    .sort(
      ([, left], [, right]) =>
        Number(right.supportsSelectedImage) - Number(left.supportsSelectedImage)
    )
    .slice(0, 3);
  if (sourceEntries.length === 1) {
    const source = sourceEntries[0][1];
    const details = [source.publisher, source.platform]
      .filter(Boolean)
      .join(' · ');
    const citation = source.url
      ? `[${source.title}](${source.url})`
      : `${source.title}（暂无公开链接）`;
    console.log(`\n出处：${citation}${details ? `（${details}）` : ''}`);
  } else if (sourceEntries.length > 1) {
    console.log('\n出处：');
    for (const [, source] of sourceEntries) {
      const details = [source.publisher, source.platform]
        .filter(Boolean)
        .join(' · ');
      const citation = source.url
        ? `[${source.title}](${source.url})`
        : `${source.title}（暂无公开链接）`;
      console.log(`- ${citation}${details ? `（${details}）` : ''}`);
    }
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage(process.stdout);
    return;
  }
  const apiKey = process.env.ONEWORK_API_KEY?.trim();

  if (!apiKey) throw new Error('ONEWORK_API_KEY is not set');

  const resolvedPackId = resolvePackId(options.packId, options.query);

  const response = await fetch(resolveEndpoint(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: options.query,
      packId: resolvedPackId,
      limit: options.limit,
      includeAssets: options.includeAssets,
    }),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const code = data?.code ? ` ${data.code}` : '';
    const message = data?.error || `HTTP ${response.status}`;
    throw new Error(`OneWork API${code}: ${message}`);
  }
  if (!data?.success || !Array.isArray(data.results)) {
    throw new Error('OneWork API returned an invalid response');
  }

  if (options.json) console.log(JSON.stringify(data, null, 2));
  else printReadable(data);
}

main().catch((error) => {
  usage();
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
