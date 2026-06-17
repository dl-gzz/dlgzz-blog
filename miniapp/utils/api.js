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

function loginWithCode(code) {
  return request({
    url: '/api/mp/auth/login',
    method: 'POST',
    data: { code },
  });
}

function getMembershipStatus() {
  return request({
    url: '/api/mp/membership/status',
  });
}

function createMembershipOrder() {
  return request({
    url: '/api/mp/membership/order',
    method: 'POST',
  });
}

function getMembershipOrderStatus(aoid) {
  return request({
    url: `/api/mp/membership/order/status?aoid=${encodeURIComponent(aoid)}`,
  });
}

module.exports = {
  createMembershipOrder,
  getConfig,
  getMembershipOrderStatus,
  getMembershipStatus,
  getPosts,
  getPostDetail,
  loginWithCode,
};
