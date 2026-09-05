// Run with MEMBERSHIP_TEST_DEPS pointing to an isolated npm prefix containing
// @electric-sql/pglite. Never connects to DATABASE_URL or writes production data.
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const deps = process.env.MEMBERSHIP_TEST_DEPS;
if (!deps)
  throw new Error(
    'Set MEMBERSHIP_TEST_DEPS to a temporary npm prefix with @electric-sql/pglite installed'
  );
const pglite = require.resolve('@electric-sql/pglite', { paths: [deps] });
const result = await build({
  entryPoints: ['tests/unified-membership.test.mjs'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  packages: 'external',
  plugins: [
    {
      name: 'isolated-membership-test',
      setup(b) {
        b.onResolve({ filter: /^@electric-sql\/pglite$/ }, () => ({
          path: pglite,
          external: true,
        }));
        b.onResolve({ filter: /^drizzle-orm\/pglite$/ }, () => ({
          path: require.resolve('drizzle-orm/pglite'),
        }));
        b.onResolve(
          { filter: /^(server-only|@\/db|@\/lib\/auth)$/ },
          ({ path }) => ({ path, namespace: 'test' })
        );
        b.onLoad({ filter: /.*/, namespace: 'test' }, ({ path }) => ({
          contents:
            path === '@/db'
              ? 'export async function getDb() { return globalThis.__membershipTestDb; }'
              : path === '@/lib/auth'
                ? 'export const auth = { handler: (r) => globalThis.__membershipTestAuth(r) };'
                : '',
          loader: 'js',
        }));
      },
    },
  ],
});
const run = vm.runInThisContext(
  `(function(require,module,exports){${result.outputFiles[0].text}\n})`,
  {
    filename: path.resolve('tests/unified-membership.bundle.cjs'),
  }
);
const module = { exports: {} };
run(require, module, module.exports);
