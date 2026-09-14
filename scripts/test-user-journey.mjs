// Isolated regression only: no .env, network, or production database.
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const deps = process.env.MEMBERSHIP_TEST_DEPS;
if (!deps)
  throw new Error(
    'Set MEMBERSHIP_TEST_DEPS to isolated PGlite/jsdom dependencies'
  );
const result = await build({
  entryPoints: ['tests/user-journey.test.mjs'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  packages: 'external',
  plugins: [
    {
      name: 'isolation',
      setup(b) {
        b.onResolve({ filter: /^@electric-sql\/pglite$/ }, () => ({
          path: require.resolve('@electric-sql/pglite', { paths: [deps] }),
          external: true,
        }));
        b.onResolve({ filter: /^drizzle-orm\/pglite$/ }, () => ({
          path: require.resolve('drizzle-orm/pglite'),
        }));
        b.onResolve(
          {
            filter:
              /^(server-only|@\/db|@\/lib\/server|\.\/server|@\/lib\/auth|\.\/auth)$/,
          },
          ({ path }) => ({ path, namespace: 'fixture' })
        );
        b.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({
          loader: 'js',
          contents:
            path === '@/db'
              ? 'export async function getDb(){return globalThis.__journeyDb}'
              : path.endsWith('/server')
                ? 'export async function getSession(){return globalThis.__journeySession}'
                : path.endsWith('/auth')
                  ? 'export const auth={};'
                  : '',
        }));
      },
    },
  ],
});
const module = { exports: {} };
vm.runInThisContext(
  '(function(require,module,exports){' + result.outputFiles[0].text + '\n})'
)(require, module, module.exports);
