import 'server-only';
import type { PoolClient } from 'pg';
import { DEFAULT_TRACKS, type Track } from './tracks';

export async function seedTracks(db: PoolClient, clientId: string) {
  for (const [index, track] of DEFAULT_TRACKS.entries()) {
    await db.query('INSERT INTO tracks(client_id,name,summary,deliverable,position,recurring) VALUES($1,$2,$3,$4,$5,$6)',
      [clientId, track.name, track.summary, track.deliverable, (index + 1) * 1000, track.recurring]);
  }
}

// Call only inside withActor. Explicit publication filtering also makes admin previews
// match the member view. Archived folders and draft items never inflate client counts.
export async function readTracks(db: PoolClient, clientId?: string, includeArchived = false) {
  const { rows } = await db.query(`
    SELECT t.*, c.name AS client_name, c.slug AS client_slug,
      coalesce(a.item_count,0)::int AS item_count, a.last_updated
    FROM tracks t JOIN clients c ON c.id=t.client_id
    LEFT JOIN LATERAL (
      SELECT count(i.id) AS item_count, max(i.updated_at) AS last_updated
      FROM folders f JOIN items i ON i.folder_id=f.id AND i.client_id=f.client_id
      WHERE f.track_id=t.id AND f.archived_at IS NULL AND i.archived_at IS NULL
        AND i.published_at IS NOT NULL AND i.published_at<=now()
    ) a ON true
    WHERE c.status='active' AND ($1::uuid IS NULL OR t.client_id=$1)
      AND ($2::boolean OR t.archived_at IS NULL)
    ORDER BY c.name,c.id,t.position,t.created_at,t.id`, [clientId ?? null, includeArchived]);
  return rows.map(row => ({ ...row,
    status_changed_at: row.status_changed_at.toISOString(),
    note_updated_at: row.note_updated_at?.toISOString() ?? null,
    archived_at: row.archived_at?.toISOString() ?? null,
    last_updated: row.last_updated?.toISOString() ?? null,
  })) as (Track & { client_name: string; client_slug: string })[];
}
