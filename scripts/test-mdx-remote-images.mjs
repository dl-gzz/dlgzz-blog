import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { getDefaultMDXOptions } from 'fumadocs-mdx/config';
import matter from 'gray-matter';

async function main() {
  // Load the actual TypeScript config as ESM without changing package.json.
  const compiledConfig = await build({
    entryPoints: ['source.config.ts'],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    plugins: [{
      name: 'resolve-config-dependencies',
      setup(builder) {
        builder.onResolve({ filter: /^[^./]/ }, args => args.kind === 'entry-point'
          ? undefined
          : { path: import.meta.resolve(args.path), external: true });
      },
    }],
  });
  const { default: config } = await import(
    `data:text/javascript;base64,${Buffer.from(compiledConfig.outputFiles[0].text).toString('base64')}`
  );
  // Resolve the compiler already installed by fumadocs-mdx; no new dependency.
  const require = createRequire(path.join(process.cwd(), 'package.json'));
  const mdxRequire = createRequire(require.resolve('fumadocs-mdx/config'));
  const { compile } = await import(
    pathToFileURL(mdxRequire.resolve('@mdx-js/mdx')).href
  );
  const mdxOptions = typeof config.mdxOptions === 'function'
    ? await config.mdxOptions()
    : config.mdxOptions;
  const options = getDefaultMDXOptions(mdxOptions ?? {});
  const originalFetch = globalThis.fetch;
  let fetchAttempts = 0;
  globalThis.fetch = async () => {
    fetchAttempts++;
    throw new Error('Network intentionally disabled for MDX image regression');
  };

  try {
    const remote = 'https://image-host-unavailable.invalid/example.jpg';
    const fixture = String(await compile(`![Remote image](${remote})`, options));
    assert.ok(fixture.includes(remote), 'Remote image URL must be preserved');
    const local = String(await compile('![Local image](./example.png)', options));
    assert.match(local, /import .* from ["']\.\/example\.png["']/,
      'Local images must still use static imports');

    const dir = path.resolve('content/blog');
    const files = (await readdir(dir)).filter(name => /^workbuddy-.*\.zh\.mdx$/.test(name));
    assert.equal(files.length, 17, 'All 17 published WorkBuddy articles are covered');
    for (const name of files) {
      const file = path.join(dir, name);
      const { data, content } = matter(await readFile(file, 'utf8'));
      assert.equal(data.premium, false, `${name} must stay public`);
      const result = String(await compile({ value: content, path: file }, options));
      const urls = [...content.matchAll(/!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/g)]
        .map(match => match[1]);
      assert.ok(urls.length > 0, `${name} must include its cloud images`);
      for (const url of urls) {
        assert.ok(result.includes(url), `${name}: cloud image URL must be preserved`);
      }
    }
    assert.equal(fetchAttempts, 0, 'MDX compilation must never fetch remote images');
    console.log(`PASS: ${files.length} public articles compile offline with cloud images preserved; local image imports retained.`);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
