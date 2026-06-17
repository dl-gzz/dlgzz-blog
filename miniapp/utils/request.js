const { allowHttpImages, baseUrl } = require('./config');

function request({ url, method = 'GET', data }) {
  return new Promise((resolve, reject) => {
    const token = wx.getStorageSync('mpToken');
    wx.request({
      url: `${baseUrl}${url}`,
      method,
      data,
      header: token
        ? {
            Authorization: `Bearer ${token}`,
          }
        : undefined,
      success(res) {
        const { statusCode } = res;
        const payload = res.data;

        if (statusCode < 200 || statusCode >= 300) {
          reject(new Error(`Request failed with status ${statusCode}`));
          return;
        }

        if (
          payload &&
          typeof payload === 'object' &&
          Object.prototype.hasOwnProperty.call(payload, 'success') &&
          payload.success === false
        ) {
          reject(new Error(payload.error || '请求失败'));
          return;
        }

        resolve(payload);
      },
      fail(error) {
        reject(error);
      },
    });
  });
}

function toAbsoluteImageUrl(imageUrl) {
  if (!imageUrl) return '';

  if (/^https:\/\//.test(imageUrl)) return imageUrl;

  if (/^http:\/\//.test(imageUrl)) {
    return allowHttpImages ? imageUrl : '';
  }

  if (imageUrl.startsWith('/')) {
    const baseOrigin = baseUrl.replace(/\/api(?:\/.*)?$/, '');
    const absoluteUrl = `${baseOrigin}${imageUrl}`;
    return absoluteUrl.startsWith('http://') && !allowHttpImages
      ? ''
      : absoluteUrl;
  }

  return imageUrl;
}

function toAbsoluteImageUrls(imageUrls = []) {
  return imageUrls.map(toAbsoluteImageUrl).filter(Boolean);
}

module.exports = {
  request,
  toAbsoluteImageUrl,
  toAbsoluteImageUrls,
};
