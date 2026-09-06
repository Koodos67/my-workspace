import 'server-only';
import { cache } from 'react';
import { headers } from 'next/headers';
import { redirect, notFound } from 'next/navigation';
import { getAuth } from './auth-config';
import { isConfigured } from './config';
import { withActor } from './db';
export const requireProfile = cache(async () => {
  if (!isConfigured()) redirect('/login');
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect('/login');
  const profile = await withActor(session.user.id, async db => {
    const { rows } = await db.query('SELECT id, full_name, email, role FROM profiles WHERE id = $1', [session.user.id]);
    return rows[0] as { id: string; full_name: string | null; email: string; role: 'admin' | 'client' } | undefined;
  });
  if (!profile) notFound();
  return { profile };
});
export async function requireAdmin() {
  const session = await requireProfile();
  if (session.profile.role !== 'admin') notFound();
  return session;
}
