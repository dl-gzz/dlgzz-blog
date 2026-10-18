// Real migration SQL against disposable PostgreSQL-compatible fixtures only.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const drizzleRequire = createRequire(require.resolve('drizzle-orm/pglite'));
const { PGlite } = drizzleRequire('@electric-sql/pglite');
const pg = new PGlite();
try {
  await pg.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    GRANT USAGE ON SCHEMA public TO PUBLIC;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
    CREATE TABLE public."user" (id text PRIMARY KEY);
    INSERT INTO public."user" VALUES ('fixture-user');
    CREATE TABLE public.api_usage_event(id text PRIMARY KEY, status text);
    INSERT INTO public.api_usage_event VALUES ('legacy-event','ok');
  `);
  const credits = readFileSync(
    'src/db/migrations/0030_onework_usage_credits.sql',
    'utf8'
  );
  await pg.exec('BEGIN');
  await pg.exec(credits);
  await pg.exec('COMMIT');
  await pg.exec(credits);
  assert.deepEqual(
    (await pg.query('SELECT * FROM public.api_usage_event')).rows,
    [
      {
        id: 'legacy-event',
        status: 'ok',
        billing_source: 'subscription',
        credit_grant_id: null,
      },
    ]
  );
  console.log(
    'PASS: credit migration is repeatable and preserves existing usage with subscription billing'
  );
  for (const principal of ['public', 'anon', 'authenticated']) {
    const result = await pg.query(
      `SELECT
      has_table_privilege($1,'public.onework_usage_credit_grant','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS table_access,
      has_any_column_privilege($1,'public.onework_usage_credit_grant','SELECT,INSERT,UPDATE') AS column_access`,
      [principal]
    );
    assert.equal(result.rows[0].table_access, false, principal);
    assert.equal(result.rows[0].column_access, false, principal);
  }
  assert.equal(
    (
      await pg.query(
        "SELECT relrowsecurity AS rls FROM pg_class WHERE oid='public.onework_usage_credit_grant'::regclass"
      )
    ).rows[0].rls,
    true
  );
  console.log(
    'PASS: PUBLIC and browser roles cannot read, modify or truncate balances despite inherited default grants'
  );
  await pg.exec(`INSERT INTO public.onework_usage_credit_grant
    (id,user_id,credits_granted,credits_remaining) VALUES ('fixture-credit','fixture-user',5,5)`);
  for (const remaining of [-1, 6])
    await assert.rejects(
      pg.query(
        'UPDATE public.onework_usage_credit_grant SET credits_remaining=$1',
        [remaining]
      ),
      (error) => error.code === '23514'
    );
  assert.equal(
    (
      await pg.query(
        'SELECT credits_remaining FROM public.onework_usage_credit_grant'
      )
    ).rows[0].credits_remaining,
    5
  );
  console.log(
    'PASS: service owner retains access and balance constraints reject underflow/overflow'
  );

  await pg.exec(`CREATE TABLE public.onework_oauth_active_session
    (id text PRIMARY KEY,user_id text,resource text,client_id text);
    CREATE UNIQUE INDEX onework_oauth_active_session_user_resource_unique_idx
      ON public.onework_oauth_active_session(user_id,resource);
    INSERT INTO public.onework_oauth_active_session VALUES ('a','fixture-user','mcp','client-a');`);
  const oauth = readFileSync(
    'src/db/migrations/0031_reconcile_onework_oauth_multi_client_sessions.sql',
    'utf8'
  );
  await pg.exec('BEGIN');
  await pg.exec(oauth);
  await pg.exec('COMMIT');
  await pg.exec(oauth);
  await pg.exec(
    "INSERT INTO public.onework_oauth_active_session VALUES ('b','fixture-user','mcp','client-b')"
  );
  await assert.rejects(
    pg.query(
      "INSERT INTO public.onework_oauth_active_session VALUES ('c','fixture-user','mcp','client-a')"
    ),
    (error) => error.code === '23505'
  );
  assert.equal(
    (
      await pg.query(
        'SELECT count(*)::int AS n FROM public.onework_oauth_active_session'
      )
    ).rows[0].n,
    2
  );
  console.log(
    'PASS: OAuth reconciliation retains sessions, permits different clients and denies duplicate same-client sessions'
  );
  console.log(
    'Credit/OAuth migrations: 4/4 checks passed; no production connection or writes'
  );
} finally {
  await pg.close();
}
