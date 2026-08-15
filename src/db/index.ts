/**
 * Connect to PostgreSQL Database (Supabase/Neon/Local PostgreSQL)
 * https://orm.drizzle.team/docs/tutorials/drizzle-with-supabase
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

let db: ReturnType<typeof drizzle> | null = null;

function envInteger(name: string, fallback: number, minimum: number, maximum: number) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value >= minimum && value <= maximum
    ? value
    : fallback;
}

function resolveSslOption(connectionString: string) {
  const explicit = (process.env.DATABASE_SSL || '').trim().toLowerCase();

  if (explicit === 'false' || explicit === 'disable' || explicit === 'off') {
    return false;
  }

  if (explicit === 'true' || explicit === 'require' || explicit === 'on') {
    return 'require' as const;
  }

  // Supabase / Neon / managed poolers usually require SSL in production.
  if (
    connectionString.includes('supabase.com') ||
    connectionString.includes('neon.tech') ||
    connectionString.includes('pooler.') ||
    process.env.NODE_ENV === 'production'
  ) {
    return 'require' as const;
  }

  // Keep local / self-hosted databases compatible by default.
  return false;
}

export async function getDb() {
  if (db) return db;
  const connectionString =
    process.env.DATABASE_URL ||
    (process.env.DOCKER_BUILD === 'true'
      ? 'postgres://build:build@localhost:5432/build'
      : undefined);

  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }

  const client = postgres(connectionString, {
    prepare: false,
    ssl: resolveSslOption(connectionString),
    // 每个应用实例的连接上限；扩容时需保证：实例数 × 此值 < 数据库上限。
    max: envInteger('DATABASE_POOL_MAX', 10, 1, 100),
    idle_timeout: envInteger('DATABASE_IDLE_TIMEOUT_SECONDS', 20, 5, 300),
    connect_timeout: envInteger('DATABASE_CONNECT_TIMEOUT_SECONDS', 10, 3, 60),
    max_lifetime: envInteger('DATABASE_CONNECTION_LIFETIME_SECONDS', 1800, 60, 7200),
  });

  db = drizzle(client, { schema });
  return db;
}

/**
 * Connect to Neon Database
 * https://orm.drizzle.team/docs/tutorials/drizzle-with-neon
 */
// import { drizzle } from 'drizzle-orm/neon-http';
// const db = drizzle(process.env.DATABASE_URL!);

/**
 * Database connection with Drizzle
 * https://orm.drizzle.team/docs/connect-overview
 *
 * Drizzle <> PostgreSQL
 * https://orm.drizzle.team/docs/get-started-postgresql
 *
 * Get Started with Drizzle and Neon
 * https://orm.drizzle.team/docs/get-started/neon-new
 *
 * Drizzle with Neon Postgres
 * https://orm.drizzle.team/docs/tutorials/drizzle-with-neon
 *
 * Drizzle <> Neon Postgres
 * https://orm.drizzle.team/docs/connect-neon
 *
 * Drizzle with Supabase Database
 * https://orm.drizzle.team/docs/tutorials/drizzle-with-supabase
 */
