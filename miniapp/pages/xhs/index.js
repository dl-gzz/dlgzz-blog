const { getPosts } = require('../../utils/api');
const { toAbsoluteImageUrl } = require('../../utils/request');

function isXhsPost(post) {
  const images = Array.isArray(post.images) ? post.images.join(' ') : '';
  const text = [post.slug, post.title, post.description, post.image, images].filter(Boolean).join(' ').toLowerCase();

  return text.includes('小红书') || text.includes('xhs') || text.includes('xiaohongshu');
}

function normalizePost(post) {
  const rawImages = Array.isArray(post.images) ? post.images : [];
  const images = rawImages.map((image) => toAbsoluteImageUrl(image));

  return {
    ...post,
    image: toAbsoluteImageUrl(post.image || rawImages[0]),
    images,
  };
}

function toNotes(posts) {
  const notes = [];

  posts.forEach((post) => {
    const images = post.images.length ? post.images : [post.image].filter(Boolean);

    if (!images.length) {
      notes.push({
        key: `${post.slug}-text`,
        slug: post.slug,
        title: post.title,
        description: post.description,
        image: '',
      });
      return;
    }

    images.forEach((image, index) => {
      const number = index + 1 < 10 ? `0${index + 1}` : `${index + 1}`;

      notes.push({
        key: `${post.slug}-${index}`,
        slug: post.slug,
        title: images.length > 1 ? `${post.title} · ${number}` : post.title,
        description: post.description,
        image,
      });
    });
  });

  return notes;
}

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

  return { leftNotes: left, rightNotes: right };
}

Page({
  data: {
    page: 1,
    pageSize: 20,
    hasMore: true,
    loading: false,
    categories: ['全部', '图文笔记', '运营拆解', '案例库'],
    activeCategory: '全部',
    posts: [],
    leftNotes: [],
    rightNotes: [],
    noteCount: 0,
  },

  onLoad() {
    this.loadXhsPosts(true);
  },

  onPullDownRefresh() {
    this.loadXhsPosts(true).finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  onReachBottom() {
    this.loadXhsPosts();
  },

  async loadXhsPosts(reset = false) {
    if (this.data.loading || (!this.data.hasMore && !reset)) {
      return;
    }

    this.setData({ loading: true });

    try {
      let nextPage = reset ? 1 : this.data.page;
      let hasMore = true;
      let matched = reset ? [] : this.data.posts.slice();
      let guard = 0;

      while (hasMore && guard < 4) {
        const res = await getPosts({
          page: nextPage,
          pageSize: this.data.pageSize,
        });
        const incoming = (res?.data?.items || []).map(normalizePost).filter(isXhsPost);

        matched = matched.concat(incoming);
        hasMore = Boolean(res?.data?.pagination?.hasMore);
        nextPage += 1;
        guard += 1;

        if (incoming.length || !reset) {
          break;
        }
      }

      const notes = toNotes(matched);
      const groups = splitWaterfall(notes);

      this.setData({
        posts: matched,
        ...groups,
        noteCount: notes.length,
        page: nextPage,
        hasMore,
      });
    } catch (error) {
      console.error('load xhs posts failed', error);
      wx.showToast({
        title: '加载小红书内容失败',
        icon: 'none',
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  switchCategory(event) {
    const { category } = event.currentTarget.dataset;

    this.setData({
      activeCategory: category,
    });
  },

  openPost(event) {
    const { slug } = event.currentTarget.dataset;
    if (!slug) return;

    wx.navigateTo({
      url: `/pages/post/index?slug=${encodeURIComponent(slug)}`,
    });
  },
});
