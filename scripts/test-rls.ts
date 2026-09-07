import { loadEnvConfig } from '@next/env';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { parseEnv } from 'node:util';
loadEnvConfig(process.cwd(), true);
if (existsSync('.env.production.local')) {
  const production = parseEnv(readFileSync('.env.production.local', 'utf8')).DATABASE_URL;
  if (production && new URL(production).hostname.replace('-pooler','') === new URL(process.env.DATABASE_URL!).hostname.replace('-pooler','')) {
    throw new Error('Refusing to run RLS tests against production.');
  }
}
async function main() {
  const { getPool } = await import('../src/lib/db');
  const pool = getPool();
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const userA = randomUUID(), userB = randomUUID(), admin = randomUUID();
    for (const id of [userA,userB,admin]) await db.query('INSERT INTO public."user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,true,now(),now())', [id,'RLS test',id+'@example.invalid']);
    await db.query("UPDATE profiles SET role='admin' WHERE id=$1",[admin]);
    const clientA = (await db.query("INSERT INTO clients(name,slug) VALUES('Test A',$1) RETURNING id",['test-'+randomUUID()])).rows[0].id;
    const clientB = (await db.query("INSERT INTO clients(name,slug) VALUES('Test B',$1) RETURNING id",['test-'+randomUUID()])).rows[0].id;
    await db.query('INSERT INTO memberships(client_id,profile_id) VALUES($1,$2),($3,$4)',[clientA,userA,clientB,userB]);
    const published = (await db.query("INSERT INTO items(client_id,type,title,published_at) VALUES($1,'artifact','Published',now()) RETURNING id",[clientA])).rows[0].id;
    await db.query("INSERT INTO items(client_id,type,title) VALUES($1,'artifact','Draft')",[clientA]);
    await db.query("INSERT INTO items(client_id,type,title,published_at) VALUES($1,'artifact','Other client',now())",[clientB]);
    const trackA = (await db.query("INSERT INTO tracks(client_id,name,status_changed_at) VALUES($1,'Research',now()-interval '20 days') RETURNING id",[clientA])).rows[0].id;
    const trackB = (await db.query("INSERT INTO tracks(client_id,name) VALUES($1,'Other track') RETURNING id",[clientB])).rows[0].id;
    await db.query("INSERT INTO tracks(client_id,name,archived_at) VALUES($1,'Archived track',now())",[clientA]);
    await db.query('SET LOCAL ROLE koodos_app');
    await db.query("SELECT set_config('app.user_id',$1,true)",[userA]);
    assert.equal((await db.query('SELECT id FROM clients')).rows.length,1,'Client sees own workspace only');
    assert.equal((await db.query('SELECT id FROM clients WHERE id=$1',[clientB])).rows.length,0,'Other client direct query blocked');
    assert.deepEqual((await db.query('SELECT id FROM items')).rows.map(row=>row.id),[published],'Draft and other client items hidden');
    assert.deepEqual((await db.query('SELECT id FROM tracks')).rows.map(row=>row.id),[trackA],'Other client and archived tracks hidden');
    assert.equal((await db.query("UPDATE tracks SET status='done' WHERE id=$1",[trackA])).rowCount,0,'Client cannot change track status');
    await db.query('SAVEPOINT denied_track');
    await assert.rejects(db.query("INSERT INTO tracks(client_id,name) VALUES($1,'Not allowed')",[clientA]),'Client cannot create tracks');
    await db.query('ROLLBACK TO SAVEPOINT denied_track');
    await db.query('SAVEPOINT denied_write');
    await assert.rejects(db.query("UPDATE profiles SET role='admin' WHERE id=$1",[userA]),'Client cannot promote role');
    await db.query('ROLLBACK TO SAVEPOINT denied_write');
    await db.query('SAVEPOINT denied_auth');
    await assert.rejects(db.query('SELECT * FROM public."session"'),'App role cannot read auth sessions');
    await db.query('ROLLBACK TO SAVEPOINT denied_auth');
    await db.query("SELECT set_config('app.user_id',$1,true)",[admin]);
    assert.equal((await db.query('SELECT id FROM clients WHERE id=ANY($1::uuid[])',[[clientA,clientB]])).rows.length,2,'Admin sees both');
    await db.query('SAVEPOINT foreign_track');
    await assert.rejects(db.query("INSERT INTO folders(client_id,name,track_id) VALUES($1,'Wrong client',$2)",[clientA,trackB]),'Composite FK prevents cross-client folder assignment');
    await db.query('ROLLBACK TO SAVEPOINT foreign_track');
    const before = (await db.query('SELECT status_changed_at FROM tracks WHERE id=$1',[trackA])).rows[0].status_changed_at;
    await db.query("UPDATE tracks SET status_note='Client note' WHERE id=$1",[trackA]);
    const noteOnly = (await db.query('SELECT status_changed_at,note_updated_at FROM tracks WHERE id=$1',[trackA])).rows[0];
    assert.equal(+noteOnly.status_changed_at,+before,'Note edit does not reset status age');
    assert.ok(noteOnly.note_updated_at,'Note is dated separately');
    await db.query("UPDATE tracks SET status='in_progress' WHERE id=$1",[trackA]);
    assert.ok(+(await db.query('SELECT status_changed_at FROM tracks WHERE id=$1',[trackA])).rows[0].status_changed_at > +before,'Status trigger updates date');
    await db.query("UPDATE clients SET status='archived' WHERE id=$1",[clientA]);
    await db.query("SELECT set_config('app.user_id',$1,true)",[userA]);
    assert.equal((await db.query('SELECT id FROM clients')).rows.length,0,'Archived workspace hidden');
    assert.equal((await db.query('SELECT id FROM items')).rows.length,0,'Archived workspace items hidden');
    assert.equal((await db.query('SELECT id FROM tracks')).rows.length,0,'Archived workspace tracks hidden');
    await db.query("SELECT set_config('app.user_id',$1,true)",[admin]);
    await db.query("UPDATE clients SET status='active' WHERE id=$1",[clientA]);
    await db.query('DELETE FROM memberships WHERE profile_id=$1',[userA]);
    await db.query("SELECT set_config('app.user_id',$1,true)",[userA]);
    assert.equal((await db.query('SELECT id FROM clients')).rows.length,0,'Revocation takes effect immediately');
    assert.equal((await db.query('SELECT id FROM tracks')).rows.length,0,'Revocation hides tracks immediately');
    await db.query("SELECT set_config('app.user_id','',true)");
    assert.equal((await db.query('SELECT id FROM clients')).rows.length,0,'No identity gets no clients');
    console.log('PASS: tenant isolation, draft filtering, admin access, role escalation denial, auth table protection, archiving, revocation, missing identity, track permissions, composite FK, and status/note timestamps.');
  } finally { await db.query('ROLLBACK'); db.release(); await pool.end(); }
}
main().catch(error=>{console.error('RLS test failed:',error.message);process.exitCode=1;});
