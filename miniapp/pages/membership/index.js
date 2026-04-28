const { getConfig } = require('../../utils/api');

Page({
  data: {
    planName: '年度会员即将开放',
    priceText: '敬请期待',
    benefits: ['会员文章阅读权益', '年度会员身份标识', '更多内容服务优先体验'],
  },

  onLoad() {
    this.loadConfig();
  },

  async loadConfig() {
    try {
      const res = await getConfig();
      const membership = res?.data?.membership || {};
      this.setData({
        planName: membership.planName
          ? `${membership.planName}即将开放`
          : '年度会员即将开放',
        priceText: '敬请期待',
        benefits: ['精选内容规划中', '年度内容服务筹备中', '更多阅读体验持续优化'],
      });
    } catch (error) {
      console.error('load membership config failed', error);
    }
  },

  handleComingSoon() {
    wx.showToast({
      title: '年度会员即将开放',
      icon: 'none',
    });
  },
});
