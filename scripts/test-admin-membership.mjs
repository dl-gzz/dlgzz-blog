// Isolated regression: no production credentials or database connections.
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
if (!process.env.MEMBERSHIP_TEST_DEPS)
  throw new Error(
    'Set MEMBERSHIP_TEST_DEPS to the isolated PGlite dependency directory'
  );
const pglite = require.resolve('@electric-sql/pglite', {
  paths: [process.env.MEMBERSHIP_TEST_DEPS],
});
const result = await build({
  entryPoints: ['tests/admin-membership.test.mjs'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  packages: 'external',
  plugins: [
    {
      name: 'admin-test-isolation',
      setup(builder) {
        builder.onResolve({ filter: /^@electric-sql\/pglite$/ }, () => ({
          path: pglite,
          external: true,
        }));
        builder.onResolve({ filter: /^drizzle-orm\/pglite$/ }, () => ({
          path: require.resolve('drizzle-orm/pglite'),
        }));
        builder.onResolve(
          { filter: /^(server-only|@\/db|@\/lib\/server)$/ },
          ({ path }) => ({ path, namespace: 'test' })
        );
        builder.onLoad({ filter: /.*/, namespace: 'test' }, ({ path }) => ({
          loader: 'js',
          contents:
            path === '@/db'
              ? 'export async function getDb() { globalThis.__adminDbReads++; return globalThis.__adminDb; }'
              : path === '@/lib/server'
                ? 'export async function getSession() { return globalThis.__adminSession; }'
                : '',
        }));
      },
    },
  ],
});
const execute = vm.runInThisContext(
  '(function(require,module,exports){' + result.outputFiles[0].text + '\n})',
  { filename: path.resolve('tests/admin-membership.bundle.cjs') }
);
const module = { exports: {} };
execute(require, module, module.exports);
