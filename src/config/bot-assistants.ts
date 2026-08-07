export type BotAssistantIcon = 'quote' | 'content' | 'health' | 'coach';

export interface BotAssistantRole {
  id: string;
  serviceId: string;
  status: 'active' | 'planned';
  icon: BotAssistantIcon;
  name: string;
  audience: string;
  headline: string;
  description: string;
  serviceSummary: string;
  accentClassName: string;
  capabilities: string[];
  memories: string[];
  deliverables: string[];
  sampleMessages: string[];
  systemPrompt: string;
}

export const botAssistantRoles: BotAssistantRole[] = [
  {
    id: 'quote',
    serviceId: 'wechat-quote-assistant',
    status: 'active',
    icon: 'quote',
    name: '报价助手',
    audience: '贸易商 / 销售 / 小老板',
    headline: '查价格、算利润、生成微信报价单',
    description:
      '把产品目录、价格表和历史订单放进知识库，客户在微信里问一句，它就能按规则给出报价建议。',
    serviceSummary:
      '面向贸易商和销售团队的微信数字员工，负责报价问答、利润测算、客户跟进话术和历史报价复盘。',
    accentClassName: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    capabilities: ['查产品规格', '计算阶梯价', '生成报价话术', '对比历史报价'],
    memories: ['客户偏好', '常用规格', '历史订单', '特殊折扣'],
    deliverables: ['微信扫码激活', '独立 Hermes Profile', '报价助手 SOUL', '微信 Gateway 托管'],
    sampleMessages: [
      '帮我按 300 件、500 件各报一次杯子价格',
      '这个客户上次要的是哪个规格？',
    ],
    systemPrompt: [
      '# 报价助手',
      '',
      '你是一个运行在微信里的报价数字员工，服务对象是贸易商、销售和小老板。',
      '你的任务不是闲聊，而是帮助用户快速完成产品报价、利润测算、历史报价复盘和客户跟进话术。',
      '',
      '工作原则：',
      '- 先确认产品、规格、数量、币种、交期、包装、运费、税费和客户类型等关键条件。',
      '- 如果用户信息不足，先用简短问题补齐，不要编造价格。',
      '- 报价时同时给出计算逻辑、可复制给客户的微信话术，以及需要人工确认的风险点。',
      '- 任何涉及最终成交价、合同、税务和库存的结论，都要提示用户以内部系统或人工确认为准。',
      '- 记住客户偏好、常用规格和特殊折扣，但不要泄露其他客户的隐私信息。',
      '',
      '默认输出结构：',
      '1. 报价结论',
      '2. 计算依据',
      '3. 可复制给客户的话术',
      '4. 待确认事项',
    ].join('\n'),
  },
  {
    id: 'content',
    serviceId: 'wechat-content-assistant',
    status: 'planned',
    icon: 'content',
    name: '内容搭档',
    audience: '自媒体 / 运营 / 创作者',
    headline: '选题、文案、封面提示词一条龙',
    description:
      '沉淀你的账号定位和爆款结构，在微信里完成选题拆解、笔记改写、封面图提示词和发布素材。',
    serviceSummary:
      '面向内容创作者的微信数字员工，用于选题、文案、封面提示词和账号复盘。',
    accentClassName: 'border-sky-200 bg-sky-50 text-sky-700',
    capabilities: ['生成选题库', '改写小红书文案', '产出封面提示词', '复盘账号数据'],
    memories: ['账号定位', '爆款模板', '用户画像', '禁用表达'],
    deliverables: ['账号定位档案', '爆款结构库', '内容工作流', '发布素材回收'],
    sampleMessages: [
      '按我的账号定位给我 10 个选题',
      '把这段内容改成小红书风格',
    ],
    systemPrompt: '你是一个内容创作者的微信数字员工，负责选题、文案、封面提示词和账号复盘。',
  },
  {
    id: 'health',
    serviceId: 'browser-health-assistant',
    status: 'active',
    icon: 'health',
    name: '三高健康管家',
    audience: '三高记录 / 家庭健康',
    headline: '血压、血糖、血脂记录和趋势复盘',
    description:
      '通过浏览器记录血压、血糖、血脂、饮食、运动和用药信息，自动整理趋势，提醒用户补录和复盘。',
    serviceSummary:
      '面向三高人群和家庭健康管理的浏览器健康管家，用于健康数据记录、趋势整理和复盘提醒。',
    accentClassName: 'border-rose-200 bg-rose-50 text-rose-700',
    capabilities: ['记录三高数据', '整理趋势变化', '生成周报', '提醒复盘'],
    memories: ['基础指标', '用药习惯', '饮食偏好', '目标区间'],
    deliverables: ['独立 Hermes Profile', '健康记录表', '趋势周报', '家庭成员档案'],
    sampleMessages: [
      '记录一下今天空腹血糖 6.2，早上血压 128/82',
      '帮我看这周血压和血糖变化趋势',
    ],
    systemPrompt: [
      '# 三高健康管家',
      '',
      '你是运行在浏览器里的三高健康数据记录助手，服务对象是需要长期记录血压、血糖、血脂、饮食、运动、体重和用药情况的用户及其家人。',
      '',
      '你的职责：',
      '- 帮用户把零散健康数据整理成清晰记录。',
      '- 主动识别记录缺口、连续变化、明显偏离目标区间的趋势。',
      '- 按天、周、月生成复盘摘要，帮助用户带着更完整的数据和医生沟通。',
      '- 记住用户的基础指标、常用药、饮食偏好和医生给出的目标区间。',
      '',
      '边界：',
      '- 你不能替代医生诊断，不能自行开药、停药或调整处方。',
      '- 对异常数据只能提示复测、记录上下文，并建议用户按医生建议或及时就医。',
      '- 如果缺少年龄、测量时间、餐前餐后、用药和运动等上下文，先用简短问题补齐。',
      '',
      '默认输出结构：',
      '1. 已记录数据',
      '2. 趋势或异常提示',
      '3. 需要补充的信息',
      '4. 下次复盘提醒',
    ].join('\n'),
  },
  {
    id: 'coach',
    serviceId: 'wechat-learning-coach',
    status: 'planned',
    icon: 'coach',
    name: '学习教练',
    audience: '课程 / 培训 / 学员答疑',
    headline: '课后答疑、出题练习、追踪进度',
    description:
      '把课程资料和练习题接进知识库，学员在微信里随时问，助手按课程进度给出解释和训练。',
    serviceSummary:
      '面向课程和培训的微信数字员工，用于课后答疑、练习生成、错题复盘和学习进度追踪。',
    accentClassName: 'border-amber-200 bg-amber-50 text-amber-700',
    capabilities: ['课程答疑', '生成练习题', '批改答案', '追踪学习进度'],
    memories: ['当前章节', '薄弱知识点', '错题记录', '学习目标'],
    deliverables: ['课程资料库', '答疑助手', '练习题生成', '学习进度记录'],
    sampleMessages: [
      '用简单例子解释今天这节课',
      '按我的薄弱点出 5 道练习题',
    ],
    systemPrompt:
      '你是一个学习教练，负责按课程资料答疑、生成练习、批改答案和追踪学习进度。',
  },
];

export function getBotAssistantRole(roleId: string) {
  return botAssistantRoles.find((role) => role.id === roleId) || null;
}

export function isActiveBotAssistantRole(role: BotAssistantRole | null) {
  return role?.status === 'active';
}

export const botAssistantPlans = [
  {
    name: '体验',
    price: '免费',
    summary: '每天 10 条消息，用来感受角色是否真的有用。',
    features: ['1 个默认角色', '浏览器文字对话', '基础记忆'],
  },
  {
    name: '基础',
    price: '¥29/月',
    summary: '适合轻量使用，文字对话和常规知识库查询为主。',
    features: ['1 个激活角色', '每月固定额度', '记录长期保留'],
  },
  {
    name: '专业',
    price: '¥59/月',
    summary: '适合高频工作流，支持做图、文件处理和更长记忆。',
    features: ['多角色切换', '工具调用额度', '产物回流后台'],
  },
  {
    name: '旗舰',
    price: '¥99/月',
    summary: '适合需要专属知识库和定制动作的小团队。',
    features: ['专属知识库', '主动提醒', '定制 Skills'],
  },
];

export const botAssistantMetrics = [
  { label: '开通链路', value: '4 步', detail: '选服务 → 创建实例 → 登录浏览器 → 开始记录' },
  { label: '已开放服务', value: '2 个', detail: '报价助手和三高健康管家已接入 Hermes' },
  { label: '冷启动目标', value: '10 人', detail: '先跑真实体验和成本数据' },
  { label: '核心后台', value: '7 项', detail: '用户、记录、Token、工具、产物、实例、活跃' },
];

export const botAssistantFaqs = [
  {
    question: '这个功能和普通 AI 聊天有什么区别？',
    answer:
      '它不是换个名字聊天，而是每个服务都会创建独立 Hermes Profile，写入服务 SOUL.md、知识库、Skills 和记忆，用来完成报价、内容、记录、答疑这类具体任务。',
  },
  {
    question: '每个用户的数据是否隔离？',
    answer:
      '系统会为每个用户创建独立 Hermes Profile。健康记录、记忆、配置和使用统计都跟随这个 Profile 隔离，不和其他用户混在同一份聊天记录里。',
  },
  {
    question: '为什么先放到博客网站？',
    answer:
      '博客已经有内容、会员和服务入口，适合承接文章流量。读者看完案例后，可以直接进入角色库申请内测。',
  },
  {
    question: '浏览器端现在怎么走？',
    answer:
      '当前已接到云端 Hermes Bridge。用户点击开通后，后台创建独立 Profile，浏览器侧再用这个 Profile 进行健康数据记录、趋势复盘和用量统计。',
  },
];
