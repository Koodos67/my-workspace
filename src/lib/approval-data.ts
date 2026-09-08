import 'server-only';
import type { PoolClient } from 'pg';
import type { Approval } from './approvals';

export async function readApprovals(db: PoolClient, clientId: string, projectId?: string): Promise<Approval[]> {
  const { rows } = await db.query(`SELECT a.*,
    (i.id IS NOT NULL AND i.archived_at IS NULL AND i.published_at<=now()
      AND (i.folder_id IS NULL OR f.archived_at IS NULL AND f.id IS NOT NULL)) AS source_available,
    CASE WHEN a.superseded_at IS NOT NULL THEN 'superseded'
      WHEN a.withdrawn_at IS NOT NULL THEN 'withdrawn'
      WHEN a.invalidated_at IS NOT NULL OR t.archived_at IS NOT NULL OR t.recurring
        OR t.approval_kind IS DISTINCT FROM a.kind OR i.id IS NULL OR i.archived_at IS NOT NULL
        OR i.published_at IS NULL OR i.published_at>now()
        OR (i.folder_id IS NOT NULL AND (f.id IS NULL OR f.archived_at IS NOT NULL))
        OR i.current_version_id IS DISTINCT FROM a.version_id OR i.url IS DISTINCT FROM a.item_url
        OR (i.type='link' AND i.updated_at IS DISTINCT FROM a.item_updated_at) THEN 'stale'
      ELSE coalesce(a.decision,'pending') END AS state
    FROM approval_requests a JOIN tracks t ON t.id=a.track_id
    LEFT JOIN items i ON i.id=a.item_id LEFT JOIN folders f ON f.id=i.folder_id
    WHERE a.client_id=$1 AND ($2::uuid IS NULL OR a.project_id=$2) ORDER BY a.request_number DESC,a.requested_at DESC,a.id`, [clientId, projectId ?? null]);
  return rows.map(row => ({...row, requested_at:row.requested_at.toISOString(),
    responded_at:row.responded_at?.toISOString() ?? null}));
}
