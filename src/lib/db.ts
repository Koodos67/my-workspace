import { Pool, type PoolClient } from 'pg';
let pool: Pool | undefined;
// This pool is server-side only. App data MUST use withActor; auth and migrations use the owner.
export function getPool() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing.');
  return pool ??= new Pool({ connectionString: process.env.DATABASE_URL.replace('sslmode=require', 'sslmode=verify-full'), max: 5, idleTimeoutMillis: 10000, connectionTimeoutMillis: 10000 });
}
export async function withActor<T>(userId: string, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE koodos_app');
    await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
