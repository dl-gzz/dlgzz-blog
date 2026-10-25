const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '../..');
const packages = ['gray-matter', 'mdast-util-from-markdown', 'mdast-util-to-markdown', 'micromark-extension-gfm', 'mdast-util-gfm', '@mdx-js/mdx', 'remark-gfm'];
const alias = {};
for (const name of packages) {
  const prefix = name.replace('/', '+') + '@';
  const folder = fs.readdirSync(path.join(root, 'node_modules/.pnpm')).find(p => p.startsWith(prefix));
  if (!folder) throw new Error(`Missing build dependency: ${name}`);
  alias[name] = path.join(root, 'node_modules/.pnpm', folder, 'node_modules', name);
}
(async () => {
  const common = { bundle: true, platform: 'node', target: 'node18', format: 'cjs', alias, logLevel: 'warning' };
  await esbuild.build({ ...common, entryPoints: [path.join(__dirname, 'plugin.mjs')], outfile: path.join(__dirname, 'main.js'), external: ['obsidian'], footer: { js: 'module.exports = module.exports.default;' } });
  await esbuild.build({ ...common, entryPoints: [path.join(__dirname, 'core.mjs')], outfile: path.join(__dirname, '.core-test.cjs') });
  console.log('Built plugin and isolated test module.');
})().catch(e => { console.error(e); process.exitCode = 1; });
