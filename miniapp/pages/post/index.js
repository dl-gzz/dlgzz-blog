const { getPostDetail } = require('../../utils/api');
const { toAbsoluteImageUrl, toAbsoluteImageUrls } = require('../../utils/request');

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
            authorName: res.data.authorName || '独立工作者',
            authorInitial: (res.data.authorName || '独').slice(0, 1),
            image: toAbsoluteImageUrl(res.data.image),
          }
        : null;
      if (detail) {
        const galleryImages = toAbsoluteImageUrls(detail.images || []);
        const coverImage = detail.image ? [detail.image] : [];
        detail.galleryImages = galleryImages.length > 0 ? galleryImages : coverImage;
      }

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
