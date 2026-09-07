import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireProfile } from '@/lib/auth';
import { withActor } from '@/lib/db';
import { Shell } from '@/components/shell';
import { BackLink } from '@/components/back-link';
import { ClientProgress } from '@/components/client-progress';
import { readTracks } from '@/lib/track-data';
import { readApprovals } from '@/lib/approval-data';
export const dynamic = 'force-dynamic';
export default async function ClientWorkspace({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { profile } = await requireProfile();
  const data = await withActor(profile.id, async db => {
    const client = (await db.query("SELECT id,name,accent_color FROM clients WHERE slug=$1 AND status='active'",[slug])).rows[0];
    if (!client) return null;
    const folders = (await db.query('SELECT id,name,track_id FROM folders WHERE client_id=$1 AND archived_at IS NULL ORDER BY position,created_at,id',[client.id])).rows;
    const tracks = await readTracks(db, client.id);
    const approvals = await readApprovals(db, client.id);
    const items = (await db.query('SELECT id,folder_id,title,description,type,url,published_at,updated_at FROM items WHERE client_id=$1 AND archived_at IS NULL AND published_at IS NOT NULL AND published_at<=now() ORDER BY position,created_at,id',[client.id])).rows;
    return {client,folders,items,tracks,approvals};
  });
  if (!data) notFound();
  const {client,folders,items,tracks}=data;
  return <Shell signedIn client name={client.name} initials={(profile.full_name || profile.email).slice(0,2).toUpperCase()}>
    <BackLink href={profile.role==='admin' ? '/admin/clients/'+client.id : '/workspaces?all=1'}>{profile.role==='admin' ? 'Back to manage workspace' : 'Back to all workspaces'}</BackLink>
    <div className="workspace-brand" style={{borderColor:client.accent_color || '#354c37'}}><div className="eyebrow">{client.name} × KOODOS</div><h1>Your work has a home.</h1><p className="muted">The things we’re making together, all in one place.</p></div>
    {profile.role==='admin' && <p><Link className="button secondary" href={'/admin/clients/'+client.id}>Manage workspace</Link> <span className="muted">This view shows published content only.</span></p>}
    <ClientProgress tracks={tracks} folders={folders.map(folder => ({id:folder.id,name:folder.name,track_id:folder.track_id}))} approvals={data.approvals} canRespond={profile.role==='client'} />
    {[{id:null,name:'Start here',track_id:null},...folders].map(folder=>{
      const content=items.filter(item=>item.folder_id===folder.id);
      if(!folder.id && !content.length)return null;
      return <section id={folder.id ? 'folder-'+folder.id : 'workspace-root'} key={folder.id || 'root'}><div className="client-folder-heading"><h2>{folder.name}</h2>{tracks.find(track=>track.id===folder.track_id) && <span className="badge green">{tracks.find(track=>track.id===folder.track_id)!.name}</span>}</div>{content.length?<div className="cards">{content.map(item=><Link className="item-card" href={'/items/'+item.id} key={item.id}><span className="badge green">{item.type==='artifact'?'HTML artifact':item.type==='link'?'Link':'File'}</span><h2>{item.title}</h2><p>{item.description || 'Open to explore this deliverable.'}</p><div className="meta"><span>{new Date(item.updated_at).toLocaleDateString('en-GB',{timeZone:'Europe/London'})}</span><span>Open →</span></div></Link>)}</div>:<div className="empty"><p className="muted">Your shared work will appear here.</p></div>}</section>;
    })}
    {!folders.length && !items.length && <div className="empty"><h2>A fresh beginning.</h2><p className="muted">Your shared work will appear here.</p></div>}
  </Shell>;
}
