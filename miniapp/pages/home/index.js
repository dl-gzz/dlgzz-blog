const { getPosts, getConfig } = require('../../utils/api');
const { toAbsoluteImageUrl } = require('../../utils/request');

Page({
  data: {
    page: 1,
    pageSize: 8,
    hasMore: true,
    loading: false,
    hero: null,
    posts: [],
    appName: '独立工作者',
  },

  onLoad() {
    this.bootstrap();
  },

  onPullDownRefresh() {
    this.bootstrap().finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  onReachBottom() {
    this.loadPosts();
  },

  async bootstrap() {
    this.setData({
      page: 1,
      hasMore: true,
      hero: null,
      posts: [],
    });

    try {
      const [configRes] = await Promise.all([getConfig()]);
      this.setData({
        appName: configRes?.data?.appName || '独立工作者',
      });
    } catch (error) {
      console.error('load config failed', error);
    }

    await this.loadPosts(true);
  },

  async loadPosts(reset = false) {
    if (this.data.loading || (!this.data.hasMore && !reset)) {
      return;
    }

    const nextPage = reset ? 1 : this.data.page;
    this.setData({ loading: true });

    try {
      const res = await getPosts({
        page: nextPage,
        pageSize: this.data.pageSize,
      });
      const incoming = (res?.data?.items || []).map((item) => ({
        ...item,
        image: toAbsoluteImageUrl(item.image),
      }));
      const merged = reset ? incoming : this.data.posts.concat(incoming);

      this.setData({
        hero: merged[0] || null,
        posts: merged.slice(1),
        page: nextPage + 1,
        hasMore: Boolean(res?.data?.pagination?.hasMore),
      });
    } catch (error) {
      console.error('load posts failed', error);
      wx.showToast({
        title: '加载文章失败',
        icon: 'none',
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  openPost(event) {
    const { slug } = event.currentTarget.dataset;
    if (!slug) return;

    wx.navigateTo({
      url: `/pages/post/index?slug=${encodeURIComponent(slug)}`,
    });
  },
});
