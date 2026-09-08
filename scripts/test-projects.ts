import { loadEnvConfig } from '@next/env';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { getPool } from '../src/lib/db';
loadEnvConfig(process.cwd(), true);
const production = parseEnv(readFileSync('.env.production.local', 'utf8')).DATABASE_URL!;
if (new URL(production).hostname.replace('-pooler', '') === new URL(process.env.DATABASE_URL!).hostname.replace('-pooler', '')) throw new Error('Development only');

async function main() {
  const pool = getPool(), db = await pool.connect();
  try {
    await db.query('BEGIN');
    const admin = randomUUID(), member = randomUUID(), stranger = randomUUID();
    for (const id of [admin, member, stranger]) await db.query('INSERT INTO public."user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,true,now(),now())', [id, 'Project QA', id + '@example.invalid']);
    await db.query("UPDATE profiles SET role='admin' WHERE id=$1", [admin]);
    const client = (await db.query("INSERT INTO clients(name,slug) VALUES('Projects QA',$1) RETURNING id", ['projects-' + randomUUID()])).rows[0].id;
    const otherClient = (await db.query("INSERT INTO clients(name,slug) VALUES('Other QA',$1) RETURNING id", ['other-' + randomUUID()])).rows[0].id;
    const first = (await db.query('SELECT id FROM projects WHERE client_id=$1', [client])).rows[0].id;
    const second = (await db.query("INSERT INTO projects(client_id,name) VALUES($1,'Second project') RETURNING id", [client])).rows[0].id;
    await db.query('INSERT INTO memberships(client_id,profile_id) VALUES($1,$2),($3,$4)', [client, member, otherClient, stranger]);
    const tracks: string[] = [], folders: string[] = [], items: string[] = [];
    for (const project of [first, second]) {
      tracks.push((await db.query("INSERT INTO tracks(client_id,project_id,name,approval_kind) VALUES($1,$2,'Launch','launch') RETURNING id", [client, project])).rows[0].id);
      folders.push((await db.query("INSERT INTO folders(client_id,project_id,name,track_id) VALUES($1,$2,'Files',$3) RETURNING id", [client, project, tracks.at(-1)])).rows[0].id);
      items.push((await db.query("INSERT INTO items(client_id,project_id,folder_id,type,title,url,published_at) VALUES($1,$2,$3,'link','Release','https://example.com/v1',now()) RETURNING id", [client, project, folders.at(-1)])).rows[0].id);
    }
    await db.query('SET LOCAL ROLE koodos_app');
    const actor = async (id: string) => { await db.query("SELECT set_config('app.user_id',$1,true)", [id]); };
    const denied = async (sql: string, params: unknown[], message: string) => {
      await db.query('SAVEPOINT denied');
      await assert.rejects(db.query(sql, params), message);
      await db.query('ROLLBACK TO SAVEPOINT denied');
    };
    await actor(admin);
    await denied('UPDATE folders SET track_id=$1 WHERE id=$2', [tracks[1], folders[0]], 'Cross-project track assignment rejected');
    await denied('UPDATE items SET folder_id=$1 WHERE id=$2', [folders[1], items[0]], 'Cross-project item assignment rejected');
    await denied('UPDATE items SET project_id=$1 WHERE id=$2', [second, items[0]], 'Item ownership immutable');
    await denied("INSERT INTO tracks(client_id,project_id,name) VALUES($1,$2,'Wrong tenant')", [otherClient, first], 'Project belongs to client');
    await denied("INSERT INTO items(client_id,type,title,url) VALUES($1,'link','Ambiguous','https://example.com')", [client], 'Multi-project root needs explicit project');
    await denied("SELECT private.request_approval($1,$2,'v1','Scope')", [tracks[0], items[1]], 'Approval source must belong to same project');
    const request = (await db.query("SELECT private.request_approval($1,$2,'v1','Scope') AS id", [tracks[0], items[0]])).rows[0].id;
    assert.equal((await db.query('SELECT project_id FROM approval_requests WHERE id=$1', [request])).rows[0].project_id, first);
    await actor(member);
    assert.equal((await db.query('SELECT id FROM projects WHERE client_id=$1', [client])).rowCount, 2, 'Membership covers both projects');
    assert.equal((await db.query('SELECT id FROM items WHERE client_id=$1', [client])).rowCount, 2);
    await denied("INSERT INTO projects(client_id,name) VALUES($1,'Forbidden')", [client], 'Members cannot create projects');
    await actor(stranger);
    for (const table of ['projects', 'tracks', 'folders', 'items', 'approval_requests']) assert.equal((await db.query(`SELECT id FROM ${table} WHERE client_id=$1`, [client])).rowCount, 0, 'Other client cannot read ' + table);
    await actor(admin);
    await db.query('UPDATE projects SET archived_at=now() WHERE id=$1', [first]);
    await denied("SELECT private.request_approval($1,$2,'v2','Scope')", [tracks[0], items[0]], 'Archived project cannot request approval');
    await denied("UPDATE tracks SET status='done' WHERE id=$1", [tracks[0]], 'Archived project cannot be edited');
    await actor(member);
    for (const table of ['projects', 'tracks', 'folders', 'items']) assert.equal((await db.query(`SELECT id FROM ${table} WHERE client_id=$1`, [client])).rowCount, 1, 'Only second project visible in ' + table);
    assert.equal((await db.query('SELECT id FROM approval_requests WHERE id=$1', [request])).rowCount, 0);
    await denied("SELECT private.respond_to_approval($1,'approved','')", [request], 'Archived project cannot receive approval');
    await actor(admin);
    await db.query('UPDATE projects SET archived_at=NULL WHERE id=$1', [first]);
    await actor(member);
    await db.query("SELECT private.respond_to_approval($1,'approved','Agreed')", [request]);
    assert.equal((await db.query('SELECT decision FROM approval_requests WHERE id=$1', [request])).rows[0].decision, 'approved');
    await actor(admin);
    await db.query('DELETE FROM memberships WHERE client_id=$1 AND profile_id=$2', [client, member]);
    await actor(member);
    for (const table of ['projects', 'tracks', 'folders', 'items', 'approval_requests']) assert.equal((await db.query(`SELECT id FROM ${table} WHERE client_id=$1`, [client])).rowCount, 0, 'Revocation hides ' + table);
    console.log('PASS: project ownership, client-wide access, cross-project constraints, approvals, archive/restore and revocation. Rolled back.');
  } finally { await db.query('ROLLBACK'); db.release(); await pool.end(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
