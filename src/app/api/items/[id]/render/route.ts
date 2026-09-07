import { requireProfile } from '@/lib/auth';
import { withActor } from '@/lib/db';
import { ARTIFACT_HEADERS, readStoredFile } from '@/lib/artifact-response';

export const dynamic = 'force-dynamic';

/**
 * Serves an artifact's stored HTML under the artifact policy, for framing by the item page.
 * Access is decided by RLS inside withActor, exactly as the download route is: a draft, an
 * archived item, or another client's item simply does not come back.
 *
 * Restricted to type 'artifact' so a stored PDF or image can never be served as HTML.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { profile } = await requireProfile();
  const { id } = await params;
  const versionId = new URL(request.url).searchParams.get('version');
  if (!/^[0-9a-f-]{36}$/i.test(id) || (versionId && !/^[0-9a-f-]{36}$/i.test(versionId))) {
    return new Response('Not found', { status: 404 });
  }
  const version = await withActor(profile.id, async db => (await db.query(
    `SELECT v.storage_path FROM items i
     JOIN item_versions v ON v.item_id=i.id AND v.id=coalesce($2::uuid,i.current_version_id)
     WHERE i.id=$1 AND i.archived_at IS NULL AND i.type='artifact'`,
    [id, versionId])).rows[0]);
  if (!version) return new Response('Not found', { status: 404 });
  const stored = await readStoredFile(version.storage_path);
  if (!stored) return new Response('Not found', { status: 404 });
  return new Response(stored.body, { headers: ARTIFACT_HEADERS });
}
