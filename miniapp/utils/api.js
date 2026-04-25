const { request } = require('./request');

function getConfig() {
  return request({
    url: '/api/mp/config',
  });
}

function getPosts({ page = 1, pageSize = 10, locale = 'zh' } = {}) {
  return request({
    url: `/api/mp/posts?page=${page}&pageSize=${pageSize}&locale=${locale}`,
  });
}

function getPostDetail({ slug, locale = 'zh' }) {
  return request({
    url: `/api/mp/posts/${encodeURIComponent(slug)}?locale=${locale}`,
  });
}

module.exports = {
  getConfig,
  getPosts,
  getPostDetail,
};
