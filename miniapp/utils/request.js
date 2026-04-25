const { allowHttpImages, baseUrl } = require('./config');

function request({ url, method = 'GET', data }) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${baseUrl}${url}`,
      method,
      data,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
          return;
        }

        reject(new Error(`Request failed with status ${res.statusCode}`));
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
    const absoluteUrl = `${baseUrl}${imageUrl}`;
    return absoluteUrl.startsWith('http://') && !allowHttpImages
      ? ''
      : absoluteUrl;
  }

  return imageUrl;
}

module.exports = {
  request,
  toAbsoluteImageUrl,
};
