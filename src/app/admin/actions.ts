'use server';
import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { withActor, getPool } from '@/lib/db';
import { getAuth } from '@/lib/auth-config';
import { headers } from 'next/headers';
function field(form: FormData, key: string, max = 120) {
  const value = String(form.get(key) || '').trim();
  if (!value || value.length > max) throw new Error('Invalid ' + key);
  return value;
}
export async function createClient(form: FormData) {
  const { profile } = await requireAdmin();
  const name = field(form, 'name');
  const slug = (String(form.get('slug') || '').trim() || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 80) redirect('/admin?error=slug');
  let id: string;
  try {
    id = await withActor(profile.id, async db => (await db.query('INSERT INTO clients(name, slug) VALUES ($1,$2) RETURNING id', [name, slug])).rows[0].id);
  } catch (error) {
    if ((error as { code?: string }).code === '23505') redirect('/admin?error=duplicate');
    throw error;
  }
  revalidatePath('/admin');
  redirect('/admin/clients/' + id);
}
export async function archiveClient(id: string) {
  const { profile } = await requireAdmin();
  await withActor(profile.id, async db => { await db.query("UPDATE clients SET status = 'archived' WHERE id = $1", [id]); });
  revalidatePath('/admin');
  redirect('/admin');
}
export async function createFolder(clientId: string, form: FormData) {
  const { profile } = await requireAdmin();
  const name = field(form, 'name');
  await withActor(profile.id, async db => {
    await db.query('INSERT INTO folders(client_id, name, position) SELECT $1,$2,coalesce(max(position),0)+1000 FROM folders WHERE client_id = $1', [clientId, name]);
  });
  revalidatePath('/admin/clients/' + clientId);
}
export async function renameFolder(clientId: string, folderId: string, form: FormData) {
  const { profile } = await requireAdmin();
  await withActor(profile.id, async db => { await db.query('UPDATE folders SET name = $1 WHERE id = $2 AND client_id = $3', [field(form, 'name'), folderId, clientId]); });
  revalidatePath('/admin/clients/' + clientId);
}
export async function archiveFolder(clientId: string, folderId: string) {
  const { profile } = await requireAdmin();
  await withActor(profile.id, async db => { await db.query('UPDATE folders SET archived_at = now() WHERE id = $1 AND client_id = $2', [folderId, clientId]); });
  revalidatePath('/admin/clients/' + clientId);
}
export async function moveFolder(clientId: string, folderId: string, direction: 'up' | 'down') {
  const { profile } = await requireAdmin();
  await withActor(profile.id, async db => {
    const { rows } = await db.query('SELECT id FROM folders WHERE client_id = $1 AND archived_at IS NULL ORDER BY position, created_at FOR UPDATE', [clientId]);
    const at = rows.findIndex(row => row.id === folderId);
    const next = at + (direction === 'up' ? -1 : 1);
    if (at < 0 || next < 0 || next >= rows.length) return;
    [rows[at], rows[next]] = [rows[next], rows[at]];
    for (let i = 0; i < rows.length; i++) await db.query('UPDATE folders SET position = $1 WHERE id = $2', [(i + 1) * 1000, rows[i].id]);
  });
  revalidatePath('/admin/clients/' + clientId);
}
export async function inviteMember(clientId: string, form: FormData) {
  const { profile } = await requireAdmin();
  const email = field(form, 'email', 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Invalid email');
  const name = String(form.get('name') || '').trim().slice(0, 120) || email;
  // Explicit admin-only identity provisioning. Auth tables are never granted to koodos_app.
  const db = await getPool().connect();
  try {
    await db.query('BEGIN');
    const admin = await db.query("SELECT id FROM profiles WHERE id = $1 AND role = 'admin' FOR SHARE", [profile.id]);
    if (!admin.rows.length) throw new Error('Admin required');
    const client = await db.query("SELECT id FROM clients WHERE id = $1 AND status = 'active' FOR SHARE", [clientId]);
    if (!client.rows.length) throw new Error('Client is unavailable');
    await db.query('INSERT INTO public."user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,false,now(),now()) ON CONFLICT(email) DO NOTHING', [randomUUID(), name, email]);
    await db.query('INSERT INTO memberships(client_id, profile_id) SELECT $1,id FROM public."user" WHERE email = $2 ON CONFLICT(client_id,profile_id) DO NOTHING', [clientId,email]);
    await db.query('COMMIT');
  } catch (error) { await db.query('ROLLBACK'); throw error; } finally { db.release(); }
  const requestHeaders = new Headers(await headers());
  requestHeaders.set('content-type', 'application/json');
  requestHeaders.set('origin', process.env.BETTER_AUTH_URL!);
  const response = await getAuth().handler(new Request(process.env.BETTER_AUTH_URL! + '/api/auth/sign-in/magic-link', {
    method: 'POST', headers: requestHeaders, body: JSON.stringify({ email, callbackURL: '/workspaces', errorCallbackURL: '/login?error=1' }),
  }));
  revalidatePath('/admin/clients/' + clientId);
  redirect('/admin/clients/' + clientId + (response.ok ? '?invited=1' : '?emailError=1'));
}
export async function revokeMember(clientId: string, profileId: string) {
  const { profile } = await requireAdmin();
  // Membership removal is the sole hard-delete exception from the PRD.
  await withActor(profile.id, async db => { await db.query('DELETE FROM memberships WHERE client_id = $1 AND profile_id = $2', [clientId, profileId]); });
  revalidatePath('/admin/clients/' + clientId);
}
