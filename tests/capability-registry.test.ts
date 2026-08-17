import assert from 'node:assert/strict';
import test from 'node:test';
import {
  retainMeaningfulCapabilityMatches,
  scoreCapabilityCandidate,
} from '../src/lib/capability-registry';

const capabilities = [
  {
    id: 'analytics.query',
    name: '受治理数据分析',
    description:
      '使用已注册的指标、维度和筛选条件分析结构化数据，不接受任意 SQL。',
    intents: [
      '数据分析',
      '统计数量',
      '查看趋势',
      '计算增长',
      '排名对比',
      'KPI',
      '过去 30 天表现',
    ],
  },
  {
    id: 'knowledge.search',
    name: 'OneWorkerOS 知识检索',
    description:
      '检索已授权的 OneWorkerOS 知识包，返回文本、出处和相关媒体资产。',
    intents: [
      '查找教程',
      '检索知识',
      '查官方资料',
      'WorkBuddy 怎么用',
      '下一步点什么',
      '查找出处',
    ],
  },
  {
    id: 'presentation.create',
    name: '创建演示文稿',
    description: '调用用户 AI 环境已安装的演示文稿能力生成并验证 PPT。',
    intents: ['生成 PPT', '制作幻灯片', '创建演示文稿', '整理成 PPT'],
  },
  {
    id: 'workbuddy.execute',
    name: 'WorkBuddy 执行',
    description:
      '在宿主环境具备 WorkBuddy 操作能力时执行，否则降级为可验证的界面引导。',
    intents: [
      '操作 WorkBuddy',
      '在 WorkBuddy 中执行',
      '帮我点 WorkBuddy',
      '配置 WorkBuddy',
      '安装 WorkBuddy 功能',
    ],
  },
];

function resolveIds(goal: string) {
  const ranked = capabilities
    .map((capability) => ({
      id: capability.id,
      match: scoreCapabilityCandidate(goal, capability),
    }))
    .filter((capability) => capability.match.score > 0)
    .sort(
      (left, right) =>
        right.match.score - left.match.score || left.id.localeCompare(right.id)
    );

  return retainMeaningfulCapabilityMatches(ranked).map(({ id }) => id);
}

test('小红书自然语言发货问题路由到知识检索', () => {
  assert.deepEqual(resolveIds('小红书店铺怎么设置发货'), ['knowledge.search']);
});

test('QQ 邮箱下一步问题路由到知识检索', () => {
  assert.deepEqual(resolveIds('我现在想连接 QQ 邮箱，下一步怎么做'), [
    'knowledge.search',
  ]);
});

test('中英文相连的 PPT 短请求仍能匹配演示能力', () => {
  assert.deepEqual(resolveIds('我想做一个PPT'), ['presentation.create']);
});

test('具体分析意图会压过泛化的“怎么”教程匹配', () => {
  assert.deepEqual(resolveIds('怎么统计本月订单'), ['analytics.query']);
});

test('明确要求查教程并操作时保留组合路由', () => {
  assert.deepEqual(resolveIds('先查找教程，再操作 WorkBuddy'), [
    'knowledge.search',
    'workbuddy.execute',
  ]);
});

test('仅包含通用状态词时不应误调度', () => {
  assert.deepEqual(resolveIds('这个功能现在可以使用了'), []);
});
