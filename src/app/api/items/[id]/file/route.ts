import { issueSignedToken, presignUrl } from '@vercel/blob';
import { requireProfile } from '@/lib/auth';
import { withActor } from '@/lib/db';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, { params }: { params: Promise<{id:string}> }) {
  const { profile } = await requireProfile();
  const { id } = await params;
  const url = new URL(request.url), versionId = url.searchParams.get('version');
  if (!/^[0-9a-f-]{36}$/i.test(id) || (versionId && !/^[0-9a-f-]{36}$/i.test(versionId))) return new Response('Not found',{status:404});
  const version = await withActor(profile.id, async db => (await db.query('SELECT v.storage_path FROM items i JOIN item_versions v ON v.item_id=i.id AND v.id=coalesce($2::uuid,i.current_version_id) WHERE i.id=$1 AND i.archived_at IS NULL',[id,versionId])).rows[0]);
  if (!version) return new Response('Not found',{status:404});
  const validUntil=Date.now()+60000;
  const token=await issueSignedToken({pathname:version.storage_path,operations:['get'],validUntil});
  const {presignedUrl}=await presignUrl(token,{operation:'get',pathname:version.storage_path,access:'private',validUntil});
  const headers={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'};
  if(url.searchParams.has('download')) return new Response(null,{status:302,headers:{...headers,Location:presignedUrl}});
  return Response.json({url:presignedUrl},{headers});
}
