import type { AgentSpecV1 } from '@/lib/service-article';
import type { ServiceManifestV1 } from '@/lib/service-manifest';

/**
 * 文章即服务 → Hermes Skill：把组件文章的 agent_spec + manifest 组装成
 * Hermes 可直接安装的 SKILL.md（约定同 learning-assistant：YAML frontmatter
 * + When To Use / Inputs / Actions / Behavior 分节）。
 *
 * 纯函数、不依赖 server-only，脚本和 API 路由都能调用。
 */

export interface HermesSkillMdInput {
  manifest: ServiceManifestV1;
  agentSpec: AgentSpecV1;
  articleUrl: string;
  siteOrigin: string;
}

function yamlString(value: string) {
  return JSON.stringify(value);
}

function bulletList(items: string[] | undefined, fallback: string) {
  const list = (items || []).filter(Boolean);
  if (!list.length) return `- ${fallback}`;
  return list.map((item) => `- ${item}`).join('\n');
}

export function buildHermesSkillMd({
  manifest,
  agentSpec,
  articleUrl,
  siteOrigin,
}: HermesSkillMdInput): string {
  const skillName = `dlgzz-${manifest.id}`;
  const description = agentSpec.purpose || manifest.summary || manifest.name;

  const inputRows = (agentSpec.inputs || []).map((field) => {
    const required = field.required ? '必填' : '可选';
    const enums = field.enum?.length ? `，可选值：${field.enum.join(' / ')}` : '';
    return `- \`${field.name}\`（${field.type || 'string'}，${required}）：${field.description || ''}${enums}`;
  });

  const apiRows = (manifest.api || []).map(
    (api) => `- \`${api.method} ${siteOrigin}${api.endpoint}\`${api.auth === 'required' ? '（需要登录/Key）' : ''}`
  );

  const actionRows = (agentSpec.actions || []).map((action) => {
    if (!action.target) return null;
    const label = action.method ? `${action.method} ${action.target}` : action.target;
    return `- **${action.kind}** \`${label}\`${action.description ? `：${action.description}` : ''}`;
  });

  const sections = [
    '---',
    `name: ${skillName}`,
    `description: ${yamlString(description)}`,
    `version: ${yamlString(manifest.version || '1.0.0')}`,
    'metadata:',
    '  hermes:',
    `    tags: [${yamlString(manifest.category)}, "dlgzz-store"]`,
    `    source: ${yamlString(articleUrl)}`,
    '---',
    '',
    `# ${agentSpec.title || manifest.name}`,
    '',
    description,
    '',
    '## When To Use',
    '',
    bulletList(agentSpec.whenToUse, '用户需要这个服务的核心能力时'),
    '',
    '## When NOT To Use',
    '',
    bulletList(agentSpec.whenNotToUse, '与该服务能力无关的请求'),
    '',
    '## Inputs',
    '',
    inputRows.length ? inputRows.join('\n') : '- 无固定输入，按用户口语请求理解。',
    '',
    '## Outputs',
    '',
    bulletList(agentSpec.outputs, '结构化结果，直接转述给用户'),
  ];

  if (apiRows.length) {
    sections.push('', '## API', '', apiRows.join('\n'));
  }

  const cleanActions = actionRows.filter(Boolean) as string[];
  if (cleanActions.length) {
    sections.push('', '## Actions', '', cleanActions.join('\n'));
  }

  if (agentSpec.commandExamples?.length) {
    sections.push(
      '',
      '## Examples',
      '',
      agentSpec.commandExamples.map((example) => `- ${example}`).join('\n')
    );
  }

  sections.push(
    '',
    '## Behavior',
    '',
    bulletList(agentSpec.operatingNotes, '严格按用户请求调用，不虚构结果。'),
    '',
    '## Source',
    '',
    `- 服务详情与购买：${articleUrl}`,
    `- 由 dlgzz 组件商店分发（service: ${manifest.id}，pricing: ${manifest.pricing.mode}）`,
    ''
  );

  return sections.join('\n');
}
