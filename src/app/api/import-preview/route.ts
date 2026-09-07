import { requireAdmin } from '@/lib/auth';
import { verifyUpload } from '@/lib/content';
import { ARTIFACT_HEADERS, readStoredFile } from '@/lib/artifact-response';

export const dynamic = 'force-dynamic';

/**
 * Serves a staged, not-yet-saved import under the artifact policy, so the preview shows
 * exactly what the client would get. The receipt is the same HMAC-signed, actor-bound,
 * 15-minute ticket the commit path uses, so no separate authorisation is needed.
 */
export async function GET(request: Request) {
  const { profile } = await requireAdmin();
  const receipt = new URL(request.url).searchParams.get('receipt') || '';
  let ticket;
  try {
    ticket = verifyUpload(receipt);
  } catch {
    return new Response('Not found', { status: 404 });
  }
  if (ticket.actor !== profile.id || ticket.type !== 'artifact') return new Response('Not found', { status: 404 });
  const stored = await readStoredFile(ticket.pathname);
  if (!stored) return new Response('Not found', { status: 404 });
  return new Response(stored.body, { headers: ARTIFACT_HEADERS });
}
