import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

type ArticleConfig = {
  filename: string;
  slug: string;
};

type PluginData = {
  uploadedImages?: Record<string, string | { url?: string; publicUrl?: string }>;
};

const ARTICLE_CONFIGS: ArticleConfig[] = [
  {
    filename: 'Mac 和 Windows 如何安装 WorkBuddy？先把数字员工请上岗（已发）.md',
    slug: 'workbuddy-installation',
  },
  {
    filename: 'WorkBuddy如何新建任务栏（已发）.md',
    slug: 'workbuddy-task-bar',
  },
  {
    filename: 'WorkBuddy的Skill介绍（已发）.md',
    slug: 'workbuddy-skill',
  },
  {
    filename: 'WorkBuddy的专家中心教程（已发）.md',
    slug: 'workbuddy-expert-center',
  },
  {
    filename: 'WorkBuddy的助理介绍（已发）.md',
    slug: 'workbuddy-assistant',
  },
  {
    filename: 'WorkBuddy的界面介绍（已发）.md',
    slug: 'workbuddy-interface',
  },
  {
    filename: 'WorkBuddy的自动化介绍（已发）.md',
    slug: 'workbuddy-automation',
  },
  {
    filename: 'WorkBuddy的连接器介绍（已发）.md',
    slug: 'workbuddy-connectors',
  },
  {
    filename: 'WorkBuddy的项目介绍（已发）.md',
    slug: 'workbuddy-projects',
  },
  {
    filename: 'WorkBuddy 装好了，第一件小事怎么交给它？（已发）.md',
    slug: 'workbuddy-first-task',
  },
  {
    filename: 'WorkBuddy的右侧边栏介绍（已发）.md',
    slug: 'workbuddy-right-sidebar',
  },
  {
    filename: 'WorkBuddy的帮助与反馈介绍.md',
    slug: 'workbuddy-help-feedback',
  },
  {
    filename: 'WorkBuddy的数据管理介绍（已发）.md',
    slug: 'workbuddy-data-management',
  },
  {
    filename: 'WorkBuddy的模型配置介绍（已发）.md',
    slug: 'workbuddy-model-settings',
  },
  {
    filename: 'WorkBuddy的灵感介绍（已发）.md',
    slug: 'workbuddy-inspiration',
  },
  {
    filename: 'WorkBuddy的系统设置介绍(已发）.md',
    slug: 'workbuddy-system-settings',
  },
  {
    filename: 'WorkBuddy的设计创意介绍（已发）.md',
    slug: 'workbuddy-design-ideas',
  },
];

const SYNCABLE_STATUSES = new Set(['已发送到公众号', '已配图·待发布']);

const IMAGE_EXTENSIONS = new Set([
  '.avif',
  '.gif',
  '.jpeg',
  '.jpg',
  '.png',
  '.svg',
  '.webp',
]);

const vaultRoot = process.env.OBSIDIAN_VAULT_ROOT;
const sourceRoot = process.env.OBSIDIAN_WORKBUDDY_ARTICLES;
const pluginDataPath = process.env.OBSIDIAN_GZH_DESIGN_DATA;

if (!vaultRoot || !sourceRoot || !pluginDataPath) {
  throw new Error(
    'Set OBSIDIAN_VAULT_ROOT, OBSIDIAN_WORKBUDDY_ARTICLES, and OBSIDIAN_GZH_DESIGN_DATA before syncing.'
  );
}

const outputRoot = path.join(process.cwd(), 'content', 'blog');
const syncMetadataPath = path.join(
  process.cwd(),
  'content',
  'generated',
  'obsidian-blog-sync.json'
);

async function pathExists(candidate: string) {
  try {
    await fs.access(candidate);
    return true;
  } catch {
    return false;
  }
}

async function walkImages(root: string): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const candidate = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkImages(candidate)));
    } else if (IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.push(candidate);
    }
  }

  return files;
}

function cleanImageReference(rawReference: string) {
  const [target, alias] = rawReference.split('|', 2);
  const withoutSubpath = target.split('#', 1)[0].trim();
  return {
    target: withoutSubpath,
    alias: alias?.trim() || '',
  };
}

async function resolveImagePath(
  rawReference: string,
  articlePath: string,
  imagePathsByName: Map<string, string[]>
) {
  const { target } = cleanImageReference(rawReference);
  const normalizedTarget = target.replace(/^\/+/, '');
  const candidates = [
    path.resolve(path.dirname(articlePath), normalizedTarget),
    path.resolve(sourceRoot!, normalizedTarget),
    path.resolve(vaultRoot!, normalizedTarget),
  ];

  for (const candidate of candidates) {
    if (await pathExists(candidate)) return candidate;
  }

  const byName = imagePathsByName.get(path.basename(normalizedTarget)) || [];
  if (byName.length === 1) return byName[0];

  const suffix = `${path.sep}${normalizedTarget}`;
  const suffixMatches = byName.filter((candidate) => candidate.endsWith(suffix));
  if (suffixMatches.length === 1) return suffixMatches[0];

  return null;
}

function pluginImageUrl(
  uploadedImages: PluginData['uploadedImages'],
  hash: string
) {
  const value = uploadedImages?.[hash];
  if (typeof value === 'string') return value;
  return value?.url || value?.publicUrl || null;
}

function imageAlt(rawReference: string, alias: string) {
  if (alias) return alias;
  const { target } = cleanImageReference(rawReference);
  return path
    .basename(target)
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .trim();
}

function replaceWikiLinks(content: string) {
  return content
    .replace(/!\[\[([^\]]+)\]\]/g, (_, rawReference: string) => {
      const { alias, target } = cleanImageReference(rawReference);
      return `![${imageAlt(target, alias)}](obsidian-image:${encodeURIComponent(rawReference)})`;
    })
    .replace(/\[\[([^\]]+)\]\]/g, (_, rawReference: string) => {
      const [, alias] = rawReference.split('|', 2);
      return (alias || rawReference).split('#', 1)[0].trim();
    })
    .replace(/<(https?:\/\/[^>]+)>/g, '[$1]($1)')
    .replace(/%%[\s\S]*?%%/g, '');
}

function removeLeadingTitle(content: string, title: string) {
  const lines = content.replace(/\r/g, '').trimStart().split('\n');
  if (lines[0]?.trim() === `# ${title}`) {
    lines.shift();
  }
  return lines.join('\n');
}

function firstParagraph(content: string) {
  const plain = content
    .replace(/```[\s\S]*?```/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/[*_`]/g, '')
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
    .find((paragraph) => paragraph.length >= 20);

  if (!plain) return 'WorkBuddy 独立工作者使用教程。';
  return plain.length > 150 ? `${plain.slice(0, 147)}...` : plain;
}

function formatDate(value: unknown) {
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return '2026-08-14';
  return date.toISOString().slice(0, 10);
}

function quote(value: string) {
  return JSON.stringify(value);
}

async function main() {
  const pluginData = JSON.parse(
    await fs.readFile(pluginDataPath!, 'utf8')
  ) as PluginData;
  const imagePaths = await walkImages(vaultRoot!);
  const imagePathsByName = new Map<string, string[]>();

  for (const imagePath of imagePaths) {
    const name = path.basename(imagePath);
    const existing = imagePathsByName.get(name) || [];
    existing.push(imagePath);
    imagePathsByName.set(name, existing);
  }

  await fs.mkdir(outputRoot, { recursive: true });
  await fs.mkdir(path.dirname(syncMetadataPath), { recursive: true });

  const metadata: {
    generatedAt: string;
    sourceStatuses: string[];
    articles: Array<{
      sourceFile: string;
      slug: string;
      title: string;
      date: string;
      status: string;
      imageReferences: number;
      mappedImages: number;
    }>;
  } = {
    generatedAt: new Date().toISOString(),
    sourceStatuses: [...SYNCABLE_STATUSES],
    articles: [],
  };

  for (const config of ARTICLE_CONFIGS) {
    const articlePath = path.join(sourceRoot!, config.filename);
    if (!(await pathExists(articlePath))) {
      throw new Error(`Published article not found: ${config.filename}`);
    }

    const parsed = matter(await fs.readFile(articlePath, 'utf8'));
    if (!SYNCABLE_STATUSES.has(String(parsed.data.status))) {
      throw new Error(
        `Refusing to sync ${config.filename}: frontmatter status is not syncable.`
      );
    }

    let body = replaceWikiLinks(parsed.content);
    const imagePattern = /!\[([^\]]*)\]\(obsidian-image:([^\)]+)\)/g;
    const imageResults: Array<{ url: string; sourcePath: string }> = [];
    let firstImage = true;

    body = await replaceAsync(body, imagePattern, async (alt, encodedReference) => {
      const rawReference = decodeURIComponent(encodedReference);
      const sourcePath = await resolveImagePath(
        rawReference,
        articlePath,
        imagePathsByName
      );
      if (!sourcePath) {
        throw new Error(
          `Could not resolve image ${rawReference} in ${config.filename}`
        );
      }

      const hash = createHash('md5')
        .update(await fs.readFile(sourcePath))
        .digest('hex');
      const url = pluginImageUrl(pluginData.uploadedImages, hash);
      if (!url) {
        throw new Error(
          `Image is not present in 小白排版 uploadedImages cache: ${rawReference}`
        );
      }

      imageResults.push({ url, sourcePath });
      if (firstImage) {
        firstImage = false;
        return '';
      }
      return `![${alt}](${url})`;
    });

    body = removeLeadingTitle(body, parsed.data.title);
    body = body
      .replace(/^\s*\n/, '')
      .replace(/[ \t]+$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    const cover = imageResults[0]?.url;
    if (!cover) {
      throw new Error(`No cover image found in ${config.filename}`);
    }

    const date = formatDate(parsed.data.created || parsed.data.updated);
    const output = [
      '---',
      `title: ${quote(String(parsed.data.title))}`,
      `description: ${quote(firstParagraph(body))}`,
      `image: ${quote(cover)}`,
      `date: ${quote(date)}`,
      'published: true',
      'author: "mksaas"',
      'premium: false',
      '---',
      '',
      body,
      '',
    ].join('\n');

    await fs.writeFile(
      path.join(outputRoot, `${config.slug}.zh.mdx`),
      output,
      'utf8'
    );

    metadata.articles.push({
      sourceFile: config.filename,
      slug: config.slug,
      title: String(parsed.data.title),
      date,
      status: String(parsed.data.status),
      imageReferences: imageResults.length,
      mappedImages: imageResults.length,
    });

    console.log(
      `${config.slug}: ${imageResults.length} images mapped from ${config.filename}`
    );
  }

  await fs.writeFile(
    syncMetadataPath,
    `${JSON.stringify(metadata, null, 2)}\n`,
    'utf8'
  );
  console.log(
    `Synced ${metadata.articles.length} public Obsidian articles.`
  );
}

async function replaceAsync(
  input: string,
  pattern: RegExp,
  replacer: (...args: string[]) => Promise<string>
) {
  const matches = [...input.matchAll(pattern)];
  if (matches.length === 0) return input;

  let output = '';
  let cursor = 0;
  for (const match of matches) {
    output += input.slice(cursor, match.index);
    output += await replacer(...(match.slice(1) as string[]), match[0]);
    cursor = (match.index || 0) + match[0].length;
  }
  return output + input.slice(cursor);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
