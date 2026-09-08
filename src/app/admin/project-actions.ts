'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { withActor } from '@/lib/db';
import { activeClient, textField } from '@/lib/content';
import { seedProject, seedStandardFolders } from '@/lib/project-setup';

function refresh(clientId: string) {
  revalidatePath('/admin/clients/' + clientId);
  revalidatePath('/c/[slug]', 'page');
  revalidatePath('/items/[id]', 'page');
  revalidatePath('/admin/board');
  revalidatePath('/admin');
}

export async function createProject(clientId: string, form: FormData) {
  const { profile } = await requireAdmin();
  const projectId = await withActor(profile.id, async db => {
    await activeClient(db, clientId);
    const project = (await db.query('INSERT INTO projects(client_id,name,description) VALUES($1,$2,$3) RETURNING id',
      [clientId, textField(form, 'name'), textField(form, 'description', 500, true)])).rows[0];
    await seedProject(db, clientId, project.id);
    return project.id;
  });
  refresh(clientId);
  redirect('/admin/clients/' + clientId + '?project=' + projectId);
}

export async function updateProject(clientId: string, projectId: string, form: FormData) {
  const { profile } = await requireAdmin();
  await withActor(profile.id, async db => {
    await activeClient(db, clientId);
    const result = await db.query('UPDATE projects SET name=$1,description=$2 WHERE id=$3 AND client_id=$4 AND archived_at IS NULL',
      [textField(form, 'name'), textField(form, 'description', 500, true), projectId, clientId]);
    if (!result.rowCount) throw new Error('Project unavailable.');
  });
  refresh(clientId);
}

export async function archiveProject(clientId: string, projectId: string, restore: boolean) {
  const { profile } = await requireAdmin();
  await withActor(profile.id, async db => {
    await activeClient(db, clientId);
    const result = await db.query('UPDATE projects SET archived_at=CASE WHEN $1 THEN NULL ELSE now() END WHERE id=$2 AND client_id=$3', [restore, projectId, clientId]);
    if (!result.rowCount) throw new Error('Project unavailable.');
  });
  refresh(clientId);
  redirect('/admin/clients/' + clientId + (restore ? '?project=' + projectId : ''));
}

/**
 * Projects created before folder seeding, or emptied by hand, can adopt the standard set.
 * Offered only when the project has no folders at all, so it can never duplicate one, and it
 * mirrors the project's actual stages rather than the shipped defaults in case they were renamed.
 */
export async function addStandardFolders(clientId: string, projectId: string) {
  const { profile } = await requireAdmin();
  await withActor(profile.id, async db => {
    await activeClient(db, clientId);
    const existing = await db.query('SELECT 1 FROM folders WHERE client_id=$1 AND project_id=$2 LIMIT 1', [clientId, projectId]);
    if (existing.rowCount) throw new Error('This project already has folders.');
    const tracks = (await db.query(
      'SELECT id,name,recurring FROM tracks WHERE client_id=$1 AND project_id=$2 AND archived_at IS NULL ORDER BY position,created_at,id',
      [clientId, projectId])).rows;
    await seedStandardFolders(db, clientId, projectId, tracks);
  });
  refresh(clientId);
}
