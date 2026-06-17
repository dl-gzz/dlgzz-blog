const {
  createMembershipOrder,
  getConfig,
  getMembershipOrderStatus,
  getMembershipStatus,
  loginWithCode,
} = require('../../utils/api');

Page({
  data: {
    loading: true,
    paying: false,
    authenticated: false,
    membership: null,
    membershipConfig: {
      planName: '年度会员',
      priceText: '加载中',
      benefits: [
        '解锁会员文章',
        '会员期内解锁全部组件',
        '单买组件可作为永久授权保留',
      ],
    },
    columns: [
      {
        id: 'articles',
        icon: '读',
        title: '会员文章',
        description: '阅读完整的独立工作者实践文章。',
      },
      {
        id: 'skills',
        icon: 'Skill',
        title: '全部组件',
        description: '会员期内解锁线上组件与 Skill 使用权。',
      },
      {
        id: 'license',
        icon: '买',
        title: '单买保留',
        description: '单独购买的组件会作为永久授权保留。',
      },
    ],
  },

  onShow() {
    this.loadMembership();
  },

  wxLogin() {
    return new Promise((resolve, reject) => {
      wx.login({
        success: (res) => {
          if (res.code) resolve(res.code);
          else reject(new Error('微信登录失败'));
        },
        fail: reject,
      });
    });
  },

  async ensureLogin() {
    const existingToken = wx.getStorageSync('mpToken');
    if (existingToken) return existingToken;

    const code = await this.wxLogin();
    const res = await loginWithCode(code);
    const token = res?.data?.token;
    if (!token) throw new Error('登录态创建失败');

    wx.setStorageSync('mpToken', token);
    return token;
  },

  async loadMembership() {
    this.setData({ loading: true });
    try {
      const configRes = await getConfig();
      const membershipConfig =
        configRes?.data?.membership || this.data.membershipConfig;
      let statusRes = null;

      if (wx.getStorageSync('mpToken')) {
        statusRes = await getMembershipStatus();
      }

      this.setData({
        membershipConfig,
        authenticated: Boolean(statusRes?.data?.authenticated),
        membership:
          statusRes?.data?.membership || membershipConfig.current || null,
      });
    } catch (error) {
      console.error('load membership failed', error);
      wx.showToast({ title: '加载会员失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  async buyMembership() {
    if (this.data.paying) return;

    this.setData({ paying: true });
    try {
      await this.ensureLogin();
      const orderRes = await createMembershipOrder();
      const order = orderRes?.data;

      if (order?.alreadyActive) {
        wx.showToast({ title: '会员已生效', icon: 'success' });
        await this.loadMembership();
        return;
      }

      if (!order?.payParams) {
        wx.showModal({
          title: '订单已创建',
          content: '支付网关没有返回小程序支付参数，请稍后在支付后台确认配置。',
          showCancel: false,
        });
        return;
      }

      await new Promise((resolve, reject) => {
        wx.requestPayment({
          ...order.payParams,
          success: resolve,
          fail: reject,
        });
      });

      if (order.aoid) {
        await getMembershipOrderStatus(order.aoid);
      }
      wx.showToast({ title: '支付完成', icon: 'success' });
      await this.loadMembership();
    } catch (error) {
      console.error('buy membership failed', error);
      wx.showToast({
        title: error.message || '支付失败',
        icon: 'none',
      });
    } finally {
      this.setData({ paying: false });
    }
  },

  openColumn(event) {
    const { id } = event.currentTarget.dataset;

    wx.switchTab({
      url: '/pages/home/index',
    });
  },
});
