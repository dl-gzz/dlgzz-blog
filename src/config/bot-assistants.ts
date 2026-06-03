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
    serviceId: 'wechat-health-assistant',
    status: 'planned',
    icon: 'health',
    name: '健康管家',
    audience: '慢病管理 / 家庭健康',
    headline: '每日记录、趋势提醒、习惯追踪',
    description:
      '通过微信收集饮食、运动、血糖或体重记录，自动整理趋势，提醒用户补录和调整生活节奏。',
    serviceSummary:
      '面向家庭健康和慢病记录的微信数字员工，用于记录、趋势整理和复盘提醒。',
    accentClassName: 'border-rose-200 bg-rose-50 text-rose-700',
    capabilities: ['记录健康数据', '识别趋势异常', '生成周报', '提醒复盘'],
    memories: ['基础指标', '用药习惯', '饮食偏好', '目标区间'],
    deliverables: ['健康记录表', '趋势周报', '复盘提醒', '家庭成员档案'],
    sampleMessages: [
      '记录一下今天空腹血糖 6.2',
      '帮我看这周体重变化趋势',
    ],
    systemPrompt:
      '你是一个健康记录助手，只做生活记录、趋势整理和复盘提醒，不替代医生诊断。',
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
    features: ['1 个默认角色', '微信文字对话', '基础记忆'],
  },
  {
    name: '基础',
    price: '¥29/月',
    summary: '适合轻量使用，文字对话和常规知识库查询为主。',
    features: ['1 个激活角色', '每月固定额度', '聊天记录保留'],
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
  { label: '开通链路', value: '4 步', detail: '选服务 → 创建实例 → 扫码激活 → 微信对话' },
  { label: '已开放服务', value: '1 个', detail: '先跑报价助手，其他服务排期中' },
  { label: '冷启动目标', value: '10 人', detail: '先跑真实体验和成本数据' },
  { label: '核心后台', value: '7 项', detail: '用户、消息、Token、工具、产物、通道、活跃' },
];

export const botAssistantFaqs = [
  {
    question: '这个功能和普通 AI 聊天有什么区别？',
    answer:
      '它不是换个名字聊天，而是每个服务都会创建独立 Hermes Profile，写入服务 SOUL.md、知识库、Skills 和记忆，用来完成报价、内容、记录、答疑这类具体任务。',
  },
  {
    question: '微信接入是否安全？',
    answer:
      '用户扫码确认后，系统只把该助手需要的 Weixin/iLink 凭据写入对应 Hermes Profile。助手只能处理进入这个网关的对话，不能访问用户其他微信聊天、朋友圈或联系人数据。',
  },
  {
    question: '为什么先放到博客网站？',
    answer:
      '博客已经有内容、会员和服务入口，适合承接文章流量。读者看完案例后，可以直接进入角色库申请内测。',
  },
  {
    question: '真实绑定现在怎么走？',
    answer:
      '当前已接到 Hermes Bridge。用户点击开通后，页面生成真实微信激活二维码；扫码确认后，网页自动显示激活成功，后台能看到实例和 Gateway 状态。',
  },
];
