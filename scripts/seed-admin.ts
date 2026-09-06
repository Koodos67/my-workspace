import { loadEnvConfig } from '@next/env';
import { randomUUID } from 'node:crypto';
loadEnvConfig(process.cwd());
async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Set ADMIN_EMAIL before seeding.');
  const { getPool } = await import('../src/lib/db');
  const pool = getPool();
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query('INSERT INTO public."user" (id, name, email, "emailVerified", "createdAt", "updatedAt") VALUES ($1,$2,$3,false,now(),now()) ON CONFLICT (email) DO NOTHING', [randomUUID(), 'Mark Thurman', email]);
    await db.query("UPDATE profiles SET role = 'admin' WHERE lower(email) = $1", [email]);
    await db.query('COMMIT');
    console.log('Admin account prepared for ' + email + '. No email sent.');
  } catch (error) { await db.query('ROLLBACK'); throw error; }
  finally { db.release(); await pool.end(); }
}
main().catch(error => { console.error('Admin setup failed:', error.message); process.exitCode = 1; });
