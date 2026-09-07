'use server';
import { revalidatePath } from 'next/cache';
import { requireAdmin, requireProfile } from '@/lib/auth';
import { withActor } from '@/lib/db';
import { textField } from '@/lib/content';

function refresh() {
  revalidatePath('/admin/clients/[id]', 'page');
  revalidatePath('/admin/board');
  revalidatePath('/c/[slug]', 'page');
}

export async function requestApproval(trackId: string, form: FormData) {
  const { profile } = await requireAdmin();
  await withActor(profile.id, async db => {
    await db.query('SELECT private.request_approval($1,$2,$3,$4)', [trackId,
      textField(form,'item_id',36),textField(form,'version_label',120),textField(form,'scope',3000)]);
  });
  refresh();
}

export async function withdrawApproval(requestId: string) {
  const { profile } = await requireAdmin();
  await withActor(profile.id, async db => { await db.query('SELECT private.withdraw_approval($1)',[requestId]); });
  refresh();
}

export async function respondToApproval(requestId: string, form: FormData) {
  const { profile } = await requireProfile();
  if (profile.role !== 'client') throw new Error('A client member must respond.');
  const decision = textField(form,'decision',30);
  if (!['approved','changes_requested'].includes(decision)) throw new Error('Choose a response.');
  if (decision === 'approved' && form.get('consent') !== 'on') throw new Error('Confirm your approval.');
  await withActor(profile.id, async db => {
    await db.query('SELECT private.respond_to_approval($1,$2,$3)',[requestId,decision,textField(form,'comment',3000,true)]);
  });
  refresh();
}
