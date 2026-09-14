// Run the real OAuth integration suite in an ephemeral PostgreSQL-compatible
// database. Never load .env or connect to the configured production database.
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const deps = process.env.MEMBERSHIP_TEST_DEPS;
if (!deps)
  throw new Error('Set MEMBERSHIP_TEST_DEPS to isolated PGlite dependencies');
const { PGlite } = require(
  require.resolve('@electric-sql/pglite', { paths: [deps] })
);
const { drizzle } = await import('drizzle-orm/pglite');
const pg = new PGlite();
globalThis.__oauthTestDb = drizzle(pg);
globalThis.fetch = () => {
  throw new Error('Network is disabled in isolated OAuth tests');
};
await pg.exec(`
  CREATE TABLE "user" (id text primary key, name text not null, email text unique not null,
    email_verified boolean not null, image text, created_at timestamp not null default now(),
    updated_at timestamp not null default now(), role text, banned boolean, ban_reason text,
    ban_expires timestamp, customer_id text);
`);
const entitlementDDL = readFileSync(
  'src/db/migrations/0012_onework_access.sql',
  'utf8'
).match(
  /CREATE TABLE IF NOT EXISTS "onework_entitlement" \([\s\S]*?\n\);/
)?.[0];
if (!entitlementDDL) throw new Error('Missing entitlement DDL');
await pg.exec(entitlementDDL);
for (const file of [
  '0021_onework_oauth_mcp.sql',
  '0026_onework_oauth_single_active_session.sql',
  '0028_onework_oauth_multi_client_sessions.sql',
]) {
  await pg.exec(readFileSync(`src/db/migrations/${file}`, 'utf8'));
}
const result = await build({
  entryPoints: ['scripts/test-onework-oauth.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  packages: 'external',
  plugins: [
    {
      name: 'isolate-oauth',
      setup(b) {
        b.onResolve({ filter: /^(server-only|@\/db)$/ }, ({ path }) => ({
          path,
          namespace: 'fixture',
        }));
        b.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({
          loader: 'js',
          contents:
            path === '@/db'
              ? 'export async function getDb(){return globalThis.__oauthTestDb}'
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
