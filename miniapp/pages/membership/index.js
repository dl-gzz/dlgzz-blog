Page({
  data: {
    columns: [
      {
        id: 'xhs',
        icon: '红',
        title: '小红书专栏',
        description: '整理小红书账号定位、内容表达、图文笔记和运营复盘。',
        meta: '图文内容 · 持续更新',
      },
      {
        id: 'ai',
        icon: 'AI',
        title: 'AI 专栏',
        description: '记录 AI 工具、自动化流程和独立工作者的效率实践。',
        meta: '工具实践 · 方法沉淀',
      },
      {
        id: 'thinking',
        icon: '思',
        title: '独立沉思录',
        description: '关于自由职业、长期主义、个人产品和独立生活的观察。',
        meta: '文章阅读 · 独立思考',
      },
    ],
  },

  openColumn(event) {
    const { id } = event.currentTarget.dataset;

    if (id === 'xhs') {
      wx.navigateTo({
        url: '/pages/xhs/index',
      });
      return;
    }

    wx.switchTab({
      url: '/pages/home/index',
    });
  },
});
