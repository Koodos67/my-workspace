import { loadEnvConfig } from '@next/env';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// loadEnvConfig defaults to production, so this script used to apply migrations to the
// production database from a developer's machine with nothing said about it. Development is
// now the default and production must be asked for by name, the way every release here is.
const toProduction = process.argv.includes('--production');
loadEnvConfig(process.cwd(), !toProduction);
if (!process.env.DATABASE_URL) throw new Error('No DATABASE_URL for the chosen environment.');
const host = new URL(process.env.DATABASE_URL).hostname;
console.log(`Target: ${toProduction ? 'PRODUCTION' : 'development'} — ${host}`);
if (toProduction && !process.argv.includes('--yes')) {
  throw new Error('Refusing to migrate production without --yes. Rehearse first, then re-run with --production --yes.');
}

async function main() {
  const { getPool } = await import('../src/lib/db');
  const pool = getPool();
  const { getMigrations } = await import('better-auth/db/migration');
  const { authOptions } = await import('../src/lib/auth-config');
  // Generate a reviewable SQL file from the installed Better Auth version.
  const plan = await getMigrations(authOptions());
  const authSql = await plan.compileMigrations();
  if (authSql.trim() !== ';') {
    await writeFile('database/migrations/001_auth.sql', authSql);
    await plan.runMigrations();
    console.log('Better Auth schema applied.');
  }
  const client = await pool.connect();
  try {
    await client.query('CREATE TABLE IF NOT EXISTS public.schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    for (const name of (await readdir('database/migrations')).filter(name => name.endsWith('.sql') && name !== '001_auth.sql').sort()) {
      const sql = await readFile('database/migrations/' + name, 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const applied = await client.query('SELECT checksum FROM schema_migrations WHERE name = $1', [name]);
      if (applied.rows.length) {
        if (applied.rows[0].checksum !== checksum) throw new Error('Applied migration changed: ' + name);
        continue;
      }
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(name, checksum) VALUES ($1, $2)', [name, checksum]);
      console.log('Applied ' + name);
    }
  } finally { client.release(); await pool.end(); }
}
main().catch(error => { console.error('Migration failed:', error.message); process.exitCode = 1; });
