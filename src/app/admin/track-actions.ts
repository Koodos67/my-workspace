'use server';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import { withActor } from '@/lib/db';
import { activeClient, textField } from '@/lib/content';
import { TRACK_STATUSES, type TrackStatus } from '@/lib/tracks';

function refresh(clientId: string) {
  revalidatePath('/admin/clients/' + clientId);
  revalidatePath('/admin/board');
  revalidatePath('/c/[slug]', 'page');
}

function statusField(value: unknown): TrackStatus {
  if (!TRACK_STATUSES.includes(value as TrackStatus)) throw new Error('Choose a valid status.');
  return value as TrackStatus;
}

export async function createTrack(clientId: string, form: FormData) {
  const { profile } = await requireAdmin();
  const name = textField(form, 'name', 120);
  await withActor(profile.id, async db => {
    await activeClient(db, clientId);
    await db.query(`INSERT INTO tracks(client_id,name,summary,deliverable,recurring,position)
      SELECT $1,$2,$3,$4,$5,coalesce(max(position),0)+1000 FROM tracks WHERE client_id=$1`,
      [clientId, name, textField(form, 'summary', 500, true), textField(form, 'deliverable', 120, true), form.get('recurring') === 'on']);
  });
  refresh(clientId);
}

export async function updateTrack(clientId: string, trackId: string, form: FormData) {
  const { profile } = await requireAdmin();
  const status = statusField(form.get('status'));
  const approvalKind = textField(form, 'approval_kind', 10, true) || null;
  if (approvalKind && !['plan','launch'].includes(approvalKind)) throw new Error('Choose a valid approval checkpoint.');
  if (approvalKind && form.get('recurring') === 'on') throw new Error('Approval checkpoints are delivery stages.');
  await withActor(profile.id, async db => {
    await activeClient(db, clientId);
    const result = await db.query(`UPDATE tracks SET name=$1,summary=$2,deliverable=$3,
      recurring=$4,status=$5,status_note=$6,approval_kind=$9 WHERE id=$7 AND client_id=$8 AND archived_at IS NULL`,
      [textField(form, 'name', 120), textField(form, 'summary', 500, true), textField(form, 'deliverable', 120, true),
        form.get('recurring') === 'on', status, textField(form, 'status_note', 500, true), trackId, clientId, approvalKind]);
    if (!result.rowCount) throw new Error('Track unavailable.');
  });
  refresh(clientId);
}

export async function setTrackStatus(clientId: string, trackId: string, value: string) {
  const { profile } = await requireAdmin();
  const status = statusField(value);
  await withActor(profile.id, async db => {
    await activeClient(db, clientId);
    const result = await db.query('UPDATE tracks SET status=$1 WHERE id=$2 AND client_id=$3 AND archived_at IS NULL', [status, trackId, clientId]);
    if (!result.rowCount) throw new Error('Track unavailable.');
  });
  refresh(clientId);
}

export async function archiveTrack(clientId: string, trackId: string, restore: boolean) {
  const { profile } = await requireAdmin();
  await withActor(profile.id, async db => {
    await activeClient(db, clientId);
    await db.query('UPDATE tracks SET archived_at=CASE WHEN $1 THEN NULL ELSE now() END WHERE id=$2 AND client_id=$3', [restore, trackId, clientId]);
  });
  refresh(clientId);
}

export async function moveTrack(clientId: string, trackId: string, direction: 'up' | 'down') {
  const { profile } = await requireAdmin();
  if (direction !== 'up' && direction !== 'down') throw new Error('Invalid direction.');
  await withActor(profile.id, async db => {
    await activeClient(db, clientId);
    const { rows } = await db.query('SELECT id,recurring FROM tracks WHERE client_id=$1 AND archived_at IS NULL ORDER BY position,created_at,id FOR UPDATE', [clientId]);
    const current = rows.find(row => row.id === trackId);
    if (!current) throw new Error('Track unavailable.');
    const group = rows.filter(row => row.recurring === current.recurring);
    const at = group.findIndex(row => row.id === trackId);
    const next = at + (direction === 'up' ? -1 : 1);
    if (next < 0 || next >= group.length) return;
    [group[at], group[next]] = [group[next], group[at]];
    for (const [index, row] of group.entries()) {
      await db.query('UPDATE tracks SET position=$1 WHERE id=$2 AND client_id=$3', [(index + 1) * 1000, row.id, clientId]);
    }
  });
  refresh(clientId);
}
