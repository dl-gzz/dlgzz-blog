const { getPostDetail } = require('../../utils/api');
const { toAbsoluteImageUrl } = require('../../utils/request');

Page({
  data: {
    slug: '',
    loading: true,
    detail: null,
  },

  onLoad(options) {
    const slug = decodeURIComponent(options.slug || '');
    this.setData({ slug });
    this.loadDetail(slug);
  },

  async loadDetail(slug) {
    if (!slug) {
      wx.showToast({
        title: '文章参数缺失',
        icon: 'none',
      });
      return;
    }

    this.setData({ loading: true });

    try {
      const res = await getPostDetail({ slug });
      const detail = res?.data
        ? {
            ...res.data,
            image: toAbsoluteImageUrl(res.data.image),
          }
        : null;

      this.setData({ detail });
      if (detail?.title) {
        wx.setNavigationBarTitle({
          title: detail.title,
        });
      }
    } catch (error) {
      console.error('load post detail failed', error);
      wx.showToast({
        title: '加载详情失败',
        icon: 'none',
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  openMembership() {
    wx.switchTab({
      url: '/pages/membership/index',
    });
  },
});
