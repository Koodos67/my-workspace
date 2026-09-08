'use server';
import { randomUUID } from 'node:crypto';
import { head } from '@vercel/blob';
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import { withActor } from '@/lib/db';
import { activeProject } from '@/lib/projects';
import { activeClient, MAX_UPLOAD, signUpload, verifyUpload, textField, webUrl, type UploadTicket } from '@/lib/content';

function refresh(clientId: string) {
  revalidatePath('/admin/clients/' + clientId);
  revalidatePath('/c/[slug]', 'page');
  revalidatePath('/items/[id]', 'page');
  revalidatePath('/admin');
}
export async function prepareUpload(clientId: string, form: FormData) {
  const { profile } = await requireAdmin();
  const filename = textField(form, 'filename', 255);
  const size = Number(form.get('size'));
  if (!Number.isFinite(size) || size <= 0 || size > MAX_UPLOAD) throw new Error('Choose a file between 1 byte and 25 MB.');
  const folderId = String(form.get('folderId') || '') || null;
  const replacement = String(form.get('itemId') || '');
  const type = /\.html?$/i.test(filename) ? 'artifact' : 'file';
  const projectId = await withActor(profile.id, async db => {
    const projectId = await activeProject(db, clientId, String(form.get('projectId') || ''), folderId);
    if (replacement && !(await db.query('SELECT id FROM items WHERE id=$1 AND client_id=$2 AND type=$3 AND project_id=$4 AND archived_at IS NULL', [replacement, clientId, type, projectId])).rowCount) throw new Error('Choose the same file type as the original item.');
    return projectId;
  });
  const itemId = replacement || randomUUID(), versionId = randomUUID();
  const mime = type === 'artifact' ? 'text/html' : (String(form.get('mime') || 'application/octet-stream').slice(0, 120));
  const ticket: UploadTicket = { actor: profile.id, clientId, projectId, folderId, itemId, versionId, pathname: `${process.env.VERCEL_ENV || 'development'}/${clientId}/${itemId}/${versionId}/${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`, title: textField(form, 'title', 120), type, mime, note: textField(form, 'note', 300, true), replacement: !!replacement, expires: Date.now() + 15 * 60 * 1000 };
  const token = await generateClientTokenFromReadWriteToken({ pathname: ticket.pathname, maximumSizeInBytes: MAX_UPLOAD, allowedContentTypes: [mime], allowOverwrite: false, addRandomSuffix: false, validUntil: ticket.expires });
  return { token, pathname: ticket.pathname, receipt: signUpload(ticket), mime };
}
export async function finishUpload(receipt: string) {
  const { profile } = await requireAdmin();
  const ticket = verifyUpload(receipt);
  if (ticket.actor !== profile.id) throw new Error('Upload belongs to another session.');
  const blob = await head(ticket.pathname);
  if (blob.pathname !== ticket.pathname || blob.size > MAX_UPLOAD || blob.size <= 0) throw new Error('Uploaded file could not be verified.');
  await withActor(profile.id, async db => {
    const projectId = await activeProject(db, ticket.clientId, ticket.projectId, ticket.folderId);
    if ((await db.query('SELECT id FROM item_versions WHERE id=$1 AND item_id=$2', [ticket.versionId, ticket.itemId])).rowCount) return;
    if (ticket.replacement) {
      if (!(await db.query('SELECT id FROM items WHERE id=$1 AND client_id=$2 AND type=$3 AND project_id=$4 AND archived_at IS NULL FOR UPDATE', [ticket.itemId, ticket.clientId, ticket.type, projectId])).rowCount) throw new Error('Item is unavailable.');
    } else {
      await db.query('INSERT INTO items(id,client_id,folder_id,type,title,project_id,position) SELECT $1,$2,$3,$4,$5,$6,coalesce(max(position),0)+1000 FROM items WHERE client_id=$2 AND project_id=$6 AND folder_id IS NOT DISTINCT FROM $3::uuid', [ticket.itemId,ticket.clientId,ticket.folderId,ticket.type,ticket.title,projectId]);
    }
    await db.query('INSERT INTO item_versions(id,item_id,storage_path,mime_type,size_bytes,version_note) VALUES($1,$2,$3,$4,$5,$6)', [ticket.versionId,ticket.itemId,ticket.pathname,ticket.mime,blob.size,ticket.note || null]);
    await db.query('UPDATE items SET current_version_id=$1 WHERE id=$2', [ticket.versionId,ticket.itemId]);
  });
  refresh(ticket.clientId);
  return ticket.itemId;
}

export async function createLink(clientId: string, form: FormData) {
  const { profile } = await requireAdmin();
  const folderId = String(form.get('folderId') || '') || null;
  const title = textField(form, 'title'), description = textField(form,'description',500,true), url = webUrl(textField(form,'url',2048));
  await withActor(profile.id, async db => {
    const projectId = await activeProject(db, clientId, String(form.get('projectId') || ''), folderId);
    await db.query("INSERT INTO items(client_id,folder_id,type,title,description,url,project_id,position) SELECT $1,$2,'link',$3,$4,$5,$6,coalesce(max(position),0)+1000 FROM items WHERE client_id=$1 AND project_id=$6 AND folder_id IS NOT DISTINCT FROM $2::uuid", [clientId,folderId,title,description,url,projectId]);
  });
  refresh(clientId);
}
export async function editItem(clientId: string, itemId: string, form: FormData) {
  const { profile } = await requireAdmin();
  const folderId = String(form.get('folderId') || '') || null;
  await withActor(profile.id, async db => {
    await activeClient(db, clientId, folderId);
    const item = (await db.query('SELECT * FROM items WHERE id=$1 AND client_id=$2 AND archived_at IS NULL FOR UPDATE',[itemId,clientId])).rows[0];
    if (!item) throw new Error('Item is unavailable.');
    await activeProject(db, clientId, item.project_id, folderId);
    const published = form.get('published') === 'on';
    if (published && item.type !== 'link' && !item.current_version_id) throw new Error('Upload a file before publishing.');
    const title = textField(form, 'title');
    const description = textField(form, 'description', 500, true);
    const url = item.type === 'link' ? webUrl(textField(form, 'url', 2048)) : null;
    // Keep the existing position unless moving to a different folder; append there.
    await db.query(`
      UPDATE items
      SET title = $1,
          description = $2,
          folder_id = $3,
          url = $4,
          published_at = CASE WHEN $5 THEN coalesce(published_at, now()) ELSE NULL END,
          position = CASE
            WHEN folder_id IS DISTINCT FROM $3::uuid THEN (
              SELECT coalesce(max(position), 0) + 1000
              FROM items
              WHERE client_id = $7 AND project_id=(SELECT project_id FROM items WHERE id=$6) AND folder_id IS NOT DISTINCT FROM $3::uuid
            )
            ELSE position
          END
      WHERE id = $6 AND client_id = $7
    `, [title, description, folderId, url, published, itemId, clientId]);
  });
  refresh(clientId);
}
export async function archiveItem(clientId: string, itemId: string, restore = false) {
  const { profile } = await requireAdmin();
  await withActor(profile.id, async db => {
    await activeClient(db,clientId);
    await db.query('UPDATE items SET archived_at=CASE WHEN $3 THEN NULL ELSE now() END, published_at=CASE WHEN $3 THEN NULL ELSE published_at END WHERE id=$1 AND client_id=$2',[itemId,clientId,restore]);
  });
  refresh(clientId);
}
export async function moveItem(clientId: string, itemId: string, direction: 'up' | 'down') {
  const { profile } = await requireAdmin();
  await withActor(profile.id, async db => {
    await activeClient(db,clientId);
    const item = (await db.query('SELECT folder_id,project_id FROM items WHERE id=$1 AND client_id=$2',[itemId,clientId])).rows[0];
    if (!item) throw new Error('Item is unavailable.');
    const { rows } = await db.query('SELECT id FROM items WHERE client_id=$1 AND project_id=$3 AND folder_id IS NOT DISTINCT FROM $2::uuid AND archived_at IS NULL ORDER BY position,created_at,id FOR UPDATE',[clientId,item.folder_id,item.project_id]);
    const at = rows.findIndex(row=>row.id===itemId), next = at+(direction==='up'?-1:1);
    if (at<0 || next<0 || next>=rows.length) return;
    [rows[at],rows[next]]=[rows[next],rows[at]];
    for (let i=0;i<rows.length;i++) await db.query('UPDATE items SET position=$1 WHERE id=$2',[(i+1)*1000,rows[i].id]);
  });
  refresh(clientId);
}
