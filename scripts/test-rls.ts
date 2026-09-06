import { loadEnvConfig } from '@next/env';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
loadEnvConfig(process.cwd());
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
    await db.query('SET LOCAL ROLE koodos_app');
    await db.query("SELECT set_config('app.user_id',$1,true)",[userA]);
    assert.equal((await db.query('SELECT id FROM clients')).rows.length,1,'Client sees own workspace only');
    assert.equal((await db.query('SELECT id FROM clients WHERE id=$1',[clientB])).rows.length,0,'Other client direct query blocked');
    assert.deepEqual((await db.query('SELECT id FROM items')).rows.map(row=>row.id),[published],'Draft and other client items hidden');
    await db.query('SAVEPOINT denied_write');
    await assert.rejects(db.query("UPDATE profiles SET role='admin' WHERE id=$1",[userA]),'Client cannot promote role');
    await db.query('ROLLBACK TO SAVEPOINT denied_write');
    await db.query('SAVEPOINT denied_auth');
    await assert.rejects(db.query('SELECT * FROM public."session"'),'App role cannot read auth sessions');
    await db.query('ROLLBACK TO SAVEPOINT denied_auth');
    await db.query("SELECT set_config('app.user_id',$1,true)",[admin]);
    assert.equal((await db.query('SELECT id FROM clients WHERE id=ANY($1::uuid[])',[[clientA,clientB]])).rows.length,2,'Admin sees both');
    await db.query("UPDATE clients SET status='archived' WHERE id=$1",[clientA]);
    await db.query("SELECT set_config('app.user_id',$1,true)",[userA]);
    assert.equal((await db.query('SELECT id FROM clients')).rows.length,0,'Archived workspace hidden');
    assert.equal((await db.query('SELECT id FROM items')).rows.length,0,'Archived workspace items hidden');
    await db.query("SELECT set_config('app.user_id',$1,true)",[admin]);
    await db.query("UPDATE clients SET status='active' WHERE id=$1",[clientA]);
    await db.query('DELETE FROM memberships WHERE profile_id=$1',[userA]);
    await db.query("SELECT set_config('app.user_id',$1,true)",[userA]);
    assert.equal((await db.query('SELECT id FROM clients')).rows.length,0,'Revocation takes effect immediately');
    await db.query("SELECT set_config('app.user_id','',true)");
    assert.equal((await db.query('SELECT id FROM clients')).rows.length,0,'No identity gets no clients');
    console.log('PASS: tenant isolation, draft filtering, admin access, role escalation denial, auth table protection, archiving, revocation, and missing identity.');
  } finally { await db.query('ROLLBACK'); db.release(); await pool.end(); }
}
main().catch(error=>{console.error('RLS test failed:',error.message);process.exitCode=1;});
