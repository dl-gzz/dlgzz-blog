const { getPosts, getConfig } = require('../../utils/api');
const { toAbsoluteImageUrl } = require('../../utils/request');

function splitWaterfall(items) {
  const left = [];
  const right = [];

  items.forEach((item, index) => {
    if (index % 2 === 0) {
      left.push(item);
    } else {
      right.push(item);
    }
  });

  return {
    xhsLeftPosts: left,
    xhsRightPosts: right,
  };
}

Page({
  data: {
    page: 1,
    pageSize: 8,
    hasMore: true,
    loading: false,
    hero: null,
    allPosts: [],
    posts: [],
    xhsOpen: false,
    xhsOpening: false,
    xhsLeftPosts: [],
    xhsRightPosts: [],
    xhsCount: 0,
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
      allPosts: [],
      posts: [],
      xhsOpen: false,
      xhsOpening: false,
      xhsLeftPosts: [],
      xhsRightPosts: [],
      xhsCount: 0,
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
      const incoming = (res?.data?.items || []).map((item) => {
        const rawImages = Array.isArray(item.images) ? item.images : [];
        const images = rawImages.map((image) => toAbsoluteImageUrl(image));

        return {
          ...item,
          image: toAbsoluteImageUrl(item.image || rawImages[0]),
          images,
        };
      });
      const merged = reset ? incoming : this.data.allPosts.concat(incoming);
      const imagePosts = merged.filter((item) => item.image || item.images.length > 0);
      const xhsGroups = splitWaterfall(imagePosts.length ? imagePosts : merged);

      this.setData({
        hero: merged[0] || null,
        allPosts: merged,
        posts: merged.slice(1),
        ...xhsGroups,
        xhsCount: xhsGroups.xhsLeftPosts.length + xhsGroups.xhsRightPosts.length,
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

  openXhsBook() {
    const shouldAnimate = !this.data.xhsOpen;

    this.setData({
      xhsOpen: true,
      xhsOpening: shouldAnimate,
    });

    if (this.xhsTimer) {
      clearTimeout(this.xhsTimer);
    }

    if (shouldAnimate) {
      this.xhsTimer = setTimeout(() => {
        this.setData({ xhsOpening: false });
      }, 760);
    }

    setTimeout(() => {
      wx.pageScrollTo({
        selector: '.xhs-shelf',
        duration: 320,
      });
    }, 80);
  },

  openPost(event) {
    const { slug } = event.currentTarget.dataset;
    if (!slug) return;

    wx.navigateTo({
      url: `/pages/post/index?slug=${encodeURIComponent(slug)}`,
    });
  },

  onUnload() {
    if (this.xhsTimer) {
      clearTimeout(this.xhsTimer);
    }
  },
});
