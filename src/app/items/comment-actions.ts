'use server';
import { revalidatePath } from 'next/cache';
import { requireProfile } from '@/lib/auth';
import { withActor } from '@/lib/db';
import { textField } from '@/lib/content';

// Every check lives in the database function. These actions carry no authority of their own:
// the author is taken from the actor set on the transaction, never from the submitted form.
function refresh() {
  revalidatePath('/items/[id]', 'page');
  revalidatePath('/c/[slug]', 'page');
  revalidatePath('/admin/clients/[id]', 'page');
}

export async function postComment(itemId: string, form: FormData) {
  const { profile } = await requireProfile();
  await withActor(profile.id, async db => {
    await db.query('SELECT private.post_comment($1,$2)', [itemId, textField(form, 'body', 10000)]);
  });
  refresh();
}

export async function editComment(commentId: string, form: FormData) {
  const { profile } = await requireProfile();
  await withActor(profile.id, async db => {
    await db.query('SELECT private.edit_comment($1,$2)', [commentId, textField(form, 'body', 10000)]);
  });
  refresh();
}

export async function deleteComment(commentId: string) {
  const { profile } = await requireProfile();
  await withActor(profile.id, async db => {
    await db.query('SELECT private.delete_comment($1)', [commentId]);
  });
  refresh();
}
