import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireProfile } from '@/lib/auth';
import { withActor } from '@/lib/db';
import { Shell } from '@/components/shell';
import { BackLink } from '@/components/back-link';
import { ArtifactViewer } from '@/components/artifact-viewer';
export const dynamic='force-dynamic';
export default async function ItemPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{version?:string}>}) {
  const {id}=await params,{version:selected}=await searchParams;
  if(!/^[0-9a-f-]{36}$/i.test(id) || (selected && !/^[0-9a-f-]{36}$/i.test(selected)))notFound();
  const {profile}=await requireProfile();
  const data=await withActor(profile.id,async db=>{
    const item=(await db.query('SELECT i.*,c.name AS client_name,c.slug,f.name AS folder_name FROM items i JOIN clients c ON c.id=i.client_id LEFT JOIN folders f ON f.id=i.folder_id WHERE i.id=$1 AND i.archived_at IS NULL',[id])).rows[0];
    if(!item)return null;
    const versions=(await db.query('SELECT id,mime_type,size_bytes,version_note,created_at FROM item_versions WHERE item_id=$1 ORDER BY created_at DESC,id DESC',[id])).rows;
    return {item,versions};
  });
  if(!data)notFound();
  const {item,versions}=data, version=versions.find(v=>v.id===(selected || item.current_version_id));
  if(selected && !version)notFound();
  return <Shell signedIn client={profile.role!=='admin'} name={item.client_name} initials={(profile.full_name || profile.email).slice(0,2).toUpperCase()}>
    <BackLink href={profile.role==='admin' ? '/admin/clients/'+item.client_id : '/c/'+item.slug+(item.folder_id?'#folder-'+item.folder_id:'')}>{profile.role==='admin' ? 'Back to manage '+item.client_name : 'Back to '+item.client_name}</BackLink>
    {item.folder_name && <p className="eyebrow">{item.folder_name}</p>}
    <div className="heading"><div><h1>{item.title}</h1><p className="muted">{item.description}</p>{!item.published_at && <span className="badge">Draft — only visible to admin</span>}</div></div>
    {item.type==='link'?<a className="button" href={item.url} target="_blank" rel="noopener noreferrer">Open link ↗</a>:version?<>
      <div className="section-top"><a className="button secondary" href={`/api/items/${id}/file?version=${version.id}&download=1`}>Download original ↓</a><span className="muted">{(Number(version.size_bytes)/1024).toFixed(1)} KB · {new Date(version.created_at).toLocaleDateString('en-GB',{timeZone:'Europe/London'})}</span></div>
      {version.id!==item.current_version_id && <p className="notice">Viewing an earlier version. <Link href={'/items/'+id}>Return to the current version</Link>.</p>}
      {item.type==='artifact'?<ArtifactViewer itemId={id} versionId={version.id} title={item.title}/>:<div className="empty"><h2>Your file is ready.</h2><p className="muted">Download the original to view it on your device.</p></div>}
      {versions.length>1 && <details className="form-panel"><summary>Version history ({versions.length})</summary>{versions.map((v,index)=><div className="member-row" key={v.id}><div><Link href={`/items/${id}?version=${v.id}`}>Version {versions.length-index}{v.id===item.current_version_id?' · Current':''}</Link><p className="muted">{v.version_note || 'No version note'} · {new Date(v.created_at).toLocaleDateString('en-GB',{timeZone:'Europe/London'})}</p></div><a href={`/api/items/${id}/file?version=${v.id}&download=1`}>Download ↓</a></div>)}</details>}
    </>:<div className="empty">No file has been uploaded yet.</div>}
  </Shell>;
}
