import 'server-only';
import type { PoolClient } from 'pg';

export type Comment = {
  id: string; item_id: string; profile_id: string; body: string;
  author_name: string; author_role: 'admin' | 'client';
  created_at: string; edited_at: string | null; deleted_at: string | null;
};

/**
 * Call only inside withActor. Visibility is decided by the comments_read policy: the reader must
 * be able to read the item, and removed comments are returned to admins only. The author's name
 * comes from the snapshot on the row, because a client member cannot read anyone else's profile.
 */
export async function readComments(db: PoolClient, itemId: string): Promise<Comment[]> {
  const { rows } = await db.query(
    `SELECT id,item_id,profile_id,body,author_name,author_role,created_at,edited_at,deleted_at
     FROM comments WHERE item_id=$1 ORDER BY created_at,id`, [itemId]);
  return rows.map(row => ({ ...row,
    created_at: row.created_at.toISOString(),
    edited_at: row.edited_at?.toISOString() ?? null,
    deleted_at: row.deleted_at?.toISOString() ?? null,
  }));
}

export function commentDate(value: string) {
  return new Date(value).toLocaleString('en-GB',
    { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
}

export function commentInitials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(part => part[0] ?? '').join('').toUpperCase() || '?';
}
