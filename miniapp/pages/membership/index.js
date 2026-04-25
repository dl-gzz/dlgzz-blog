const { getConfig } = require('../../utils/api');

Page({
  data: {
    planName: '年度会员',
    priceText: '待接入正式支付',
    benefits: [],
  },

  onLoad() {
    this.loadConfig();
  },

  async loadConfig() {
    try {
      const res = await getConfig();
      const membership = res?.data?.membership || {};
      this.setData({
        planName: membership.planName || '年度会员',
        priceText: membership.priceText || '待接入正式支付',
        benefits: membership.benefits || [],
      });
    } catch (error) {
      console.error('load membership config failed', error);
    }
  },

  handlePurchase() {
    wx.showToast({
      title: '下一步接微信支付',
      icon: 'none',
    });
  },
});
