import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { Pool } from 'pg';

// Dedicated development-only runner: rehearsal rolls back by default.
const env = parseEnv(readFileSync('.env.local', 'utf8'));
const production = parseEnv(readFileSync('.env.production.local', 'utf8'));
if (new URL(env.DATABASE_URL!).hostname === new URL(production.DATABASE_URL!).hostname) throw new Error('Refusing production database');
const pool = new Pool({ connectionString: env.DATABASE_URL!.replace('-pooler.', '.').replace('sslmode=require', 'sslmode=verify-full'), connectionTimeoutMillis: 10000 });
async function main() {
  const db = await pool.connect();
  const name = '006_projects.sql';
  const sql = readFileSync('database/migrations/' + name, 'utf8');
  const checksum = createHash('sha256').update(sql).digest('hex');
  try {
    await db.query('BEGIN');
    const applied = (await db.query('SELECT checksum FROM schema_migrations WHERE name=$1', [name])).rows[0];
    if (applied) { assert.equal(applied.checksum, checksum); console.log('Project migration already applied; checksum matches.'); return; }
    if (!process.argv.includes('--apply')) {
      const admin = randomUUID(), member = randomUUID();
      for (const id of [admin, member]) await db.query('INSERT INTO public."user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,true,now(),now())', [id, 'Migration QA', id + '@example.invalid']);
      await db.query("UPDATE profiles SET role='admin' WHERE id=$1", [admin]);
      const client = (await db.query("INSERT INTO clients(name,slug) VALUES('Migration QA',$1) RETURNING id", ['migration-' + randomUUID()])).rows[0].id;
      await db.query('INSERT INTO memberships(client_id,profile_id) VALUES($1,$2)', [client, member]);
      const track = (await db.query("INSERT INTO tracks(client_id,name,approval_kind) VALUES($1,'Launch','launch') RETURNING id", [client])).rows[0].id;
      const folder = (await db.query("INSERT INTO folders(client_id,name,track_id) VALUES($1,'Documents',$2) RETURNING id", [client, track])).rows[0].id;
      const item = (await db.query("INSERT INTO items(client_id,folder_id,type,title,url,published_at) VALUES($1,$2,'link','Release','https://example.com/release',now()) RETURNING id", [client, folder])).rows[0].id;
      await db.query("SELECT set_config('app.user_id',$1,true)", [admin]);
      const request = (await db.query("SELECT private.request_approval($1,$2,'v1','Launch scope') AS id", [track, item])).rows[0].id;
      await db.query("SELECT set_config('app.user_id',$1,true)", [member]);
      await db.query("SELECT private.respond_to_approval($1,'approved','Agreed')", [request]);
      const file = (await db.query("INSERT INTO items(client_id,type,title,published_at) VALUES($1,'artifact','Plan',now()) RETURNING id", [client])).rows[0].id;
      const version = (await db.query("INSERT INTO item_versions(item_id,storage_path,mime_type,size_bytes) VALUES($1,$2,'text/html',42) RETURNING id", [file, randomUUID()])).rows[0].id;
      await db.query('UPDATE items SET current_version_id=$1 WHERE id=$2', [version, file]);
    }
    await db.query('SET CONSTRAINTS ALL IMMEDIATE');
    const before = new Map<string, unknown>();
    for (const table of ['tracks', 'folders', 'items', 'approval_requests', 'item_versions']) {
      before.set(table, (await db.query(`SELECT to_jsonb(t) AS record FROM ${table} t ORDER BY id`)).rows);
    }
    await db.query(sql.replace(/^begin;/i, '').replace(/commit;\s*$/i, ''));
    for (const table of before.keys()) {
      const after = (await db.query(`SELECT to_jsonb(t) - 'project_id' AS record FROM ${table} t ORDER BY id`)).rows;
      assert.deepEqual(after, before.get(table), table + ' existing values preserved');
    }
    const counts = (await db.query('SELECT (SELECT count(*) FROM clients)::int AS clients,(SELECT count(*) FROM projects)::int AS projects')).rows[0];
    assert.equal(counts.projects, counts.clients);
    if (process.argv.includes('--apply')) {
      await db.query('INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)', [name, checksum]);
      await db.query('COMMIT');
      console.log('Applied development project migration; all existing records preserved.', counts);
    } else console.log('PASS: migration rehearsal; one project per client, existing values preserved. Rolled back.', counts);
  } finally { await db.query('ROLLBACK'); db.release(); await pool.end(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
