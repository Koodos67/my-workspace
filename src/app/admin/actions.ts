'use server';
import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { withActor, getPool } from '@/lib/db';
import { getAuth } from '@/lib/auth-config';
import { headers } from 'next/headers';
import { activeClient, textField } from '@/lib/content';
import { activeProject } from '@/lib/projects';
import { seedTracks } from '@/lib/track-data';

export async function updateClient(id: string, form: FormData) {
  const { profile } = await requireAdmin();
  const name = textField(form, 'name');
  const color = textField(form, 'accent_color', 7, true);
  if (color && !/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Choose a valid colour.');
  await withActor(profile.id, async db => {
    await activeClient(db, id);
    await db.query('UPDATE clients SET name=$1,accent_color=$2 WHERE id=$3', [name,color || null,id]);
  });
  revalidatePath('/admin');
  revalidatePath('/admin/clients/' + id);
  revalidatePath('/c/[slug]', 'page');
}
export async function restoreClient(id: string) {
  const { profile } = await requireAdmin();
  await withActor(profile.id, async db => { await db.query("UPDATE clients SET status='active' WHERE id=$1",[id]); });
  revalidatePath('/admin');
}
export async function restoreFolder(clientId: string, folderId: string) {
  const { profile } = await requireAdmin();
  await withActor(profile.id, async db => {
    await activeClient(db, clientId);
    await db.query('UPDATE folders SET archived_at=NULL WHERE id=$1 AND client_id=$2',[folderId,clientId]);
  });
  revalidatePath('/admin/clients/' + clientId);
  revalidatePath('/c/[slug]', 'page');
}
// beforeId places the folder immediately before that folder; null moves it to the end.
export async function reorderFolder(clientId: string, folderId: string, beforeId: string | null) {
  const { profile } = await requireAdmin();
  await withActor(profile.id, async db => {
    await activeClient(db,clientId);
    const { rows } = await db.query('SELECT id FROM folders WHERE client_id=$1 AND project_id=(SELECT project_id FROM folders WHERE id=$2 AND client_id=$1) AND archived_at IS NULL ORDER BY position,created_at,id FOR UPDATE',[clientId,folderId]);
    const ids: string[] = rows.map(row=>row.id);
    if (!ids.includes(folderId)) return;
    if (beforeId !== null && (!ids.includes(beforeId) || folderId === beforeId)) return;
    ids.splice(ids.indexOf(folderId),1);
    if (beforeId === null) ids.push(folderId);
    else ids.splice(ids.indexOf(beforeId),0,folderId);
    for(let i=0;i<ids.length;i++) await db.query('UPDATE folders SET position=$1 WHERE id=$2',[(i+1)*1000,ids[i]]);
  });
  revalidatePath('/admin/clients/' + clientId);
  revalidatePath('/c/[slug]', 'page');
}
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
    id = await withActor(profile.id, async db => {
      const clientId = (await db.query('INSERT INTO clients(name, slug) VALUES ($1,$2) RETURNING id', [name, slug])).rows[0].id;
      await seedTracks(db, clientId);
      return clientId;
    });
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
    const projectId = await activeProject(db, clientId, String(form.get('projectId') || ''));
    await db.query('INSERT INTO folders(client_id, name, project_id, position) SELECT $1,$2,$3,coalesce(max(position),0)+1000 FROM folders WHERE client_id = $1 AND project_id=$3', [clientId, name, projectId]);
  });
  revalidatePath('/admin/clients/' + clientId);
}
export async function renameFolder(clientId: string, folderId: string, form: FormData) {
  const { profile } = await requireAdmin();
  await withActor(profile.id, async db => {
    await activeClient(db, clientId);
    const trackId = textField(form, 'track_id', 36, true) || null;
    if (trackId && !(await db.query('SELECT id FROM tracks WHERE id=$1 AND client_id=$2 AND archived_at IS NULL', [trackId, clientId])).rowCount) throw new Error('Track unavailable.');
    await db.query('UPDATE folders SET name=$1,track_id=$2 WHERE id=$3 AND client_id=$4', [field(form, 'name'), trackId, folderId, clientId]);
  });
  revalidatePath('/admin/clients/' + clientId);
  revalidatePath('/admin/board');
  revalidatePath('/c/[slug]', 'page');
}
export async function archiveFolder(clientId: string, folderId: string) {
  const { profile } = await requireAdmin();
  await withActor(profile.id, async db => { await db.query('UPDATE folders SET archived_at = now() WHERE id = $1 AND client_id = $2', [folderId, clientId]); });
  revalidatePath('/admin/clients/' + clientId);
}
export async function moveFolder(clientId: string, folderId: string, direction: 'up' | 'down') {
  const { profile } = await requireAdmin();
  await withActor(profile.id, async db => {
    const { rows } = await db.query('SELECT id FROM folders WHERE client_id = $1 AND project_id=(SELECT project_id FROM folders WHERE id=$2 AND client_id=$1) AND archived_at IS NULL ORDER BY position, created_at FOR UPDATE', [clientId,folderId]);
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
