const Module = require('node:module');
const { resolve } = require('node:path');

const originalResolveFilename = Module._resolveFilename;
const stubPath = resolve(__dirname, 'server-only-stub.cjs');

Module._resolveFilename = function resolveFilename(request, parent, ...rest) {
  if (request === 'server-only') return stubPath;
  return originalResolveFilename.call(this, request, parent, ...rest);
};
