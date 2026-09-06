import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { withActor } from '@/lib/db';
import { Shell } from '@/components/shell';
import { BackLink } from '@/components/back-link';
import { PublicationControls } from '@/components/publication-controls';
import { ActionForm } from '@/components/action-form';
import { UploadPanel } from '@/components/upload-panel';
import { FolderControls } from '@/components/folder-controls';
import { archiveClient, createFolder, inviteMember, revokeMember, updateClient, restoreFolder } from '../../actions';
import { createLink, editItem, archiveItem, moveItem } from '../../content-actions';
export const dynamic = 'force-dynamic';
const date = (value: Date | null) => value ? new Date(value).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'Europe/London'}) : 'Not yet';
export default async function ClientAdmin({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ invited?: string; emailError?: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { profile } = await requireAdmin();
  const notices = await searchParams;
  const data = await withActor(profile.id, async db => {
    const client = (await db.query("SELECT * FROM clients WHERE id=$1 AND status='active'",[id])).rows[0];
    if (!client) return null;
    const folders = (await db.query('SELECT id,name,archived_at FROM folders WHERE client_id=$1 ORDER BY position,created_at,id',[id])).rows;
    const members = (await db.query('SELECT p.id,p.full_name,p.email,p.last_seen_at,m.invited_at,m.first_seen_at FROM memberships m JOIN profiles p ON p.id=m.profile_id WHERE m.client_id=$1 ORDER BY m.invited_at',[id])).rows;
    const items = (await db.query('SELECT i.*, (SELECT count(*) FROM item_versions v WHERE v.item_id=i.id) AS versions FROM items i WHERE client_id=$1 ORDER BY position,created_at,id',[id])).rows;
    return {client,folders,members,items};
  });
  if (!data) notFound();
  const folders=data.folders.filter(f=>!f.archived_at);
  const folderOptions=<><option value="">Workspace root</option>{folders.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</>;
  return <Shell signedIn name={profile.full_name || 'Admin'} initials="MT">
    <BackLink href="/admin">Back to all clients</BackLink>
    <div className="heading"><div><h1>{data.client.name}</h1><p className="muted">Organise the work. Bring the right people in.</p></div><Link className="button secondary" href={'/c/'+data.client.slug}>View workspace ↗</Link></div>
    <nav className="section-links" aria-label="Workspace sections"><a href="#content">Content</a><a href="#folders">Folders</a><a href="#members">Members</a><a href="#settings">Settings</a></nav>
    <section id="content" className="form-panel"><h2>Add content</h2><p className="muted">New content starts as a draft. Open the item below, choose <strong>Share with client</strong>, then <strong>Save &amp; publish</strong> when it is ready.</p><UploadPanel clientId={id} folders={folders.map(f=>({id:f.id,name:f.name}))}/>
      <details className="sub-panel"><summary>Add a link</summary><ActionForm action={createLink.bind(null,id)} success="Link added as a draft."><label>Title<input name="title" required maxLength={120}/></label><label>URL<input name="url" type="url" required maxLength={2048} placeholder="https://"/></label><label>Description<textarea name="description" maxLength={500}/></label><label>Folder<select name="folderId">{folderOptions}</select></label><button className="button">Add link draft</button></ActionForm></details>
    </section>
    <section><div className="section-top"><h2>Workspace content</h2><span className="muted">{data.items.filter(i=>!i.archived_at).length} items</span></div>
      {!data.items.some(i=>!i.archived_at) && <div className="empty">Upload your first artifact or add a link above.</div>}
      {[{id:null,name:'Workspace root'},...folders].map(folder=>{
        const items=data.items.filter(item=>!item.archived_at && item.folder_id===folder.id);
        return items.length>0 && <section key={folder.id || 'root'}><h3>{folder.name}</h3>{items.map((item,index)=><details className="content-row" key={item.id}><summary><span>{item.title}</span><span className={'badge'+(item.published_at?' green':'')}>{item.published_at?'Published · visible to client':'Draft · hidden from client'}</span><span className="content-edit-cue">Edit &amp; sharing <span aria-hidden="true">⌄</span></span><small className="muted">{item.type} · {item.versions} versions</small></summary><div className="item-controls">
          <Link className="button secondary" href={'/items/'+item.id}>Preview item ↗</Link>
          <ActionForm action={editItem.bind(null,id,item.id)}><label>Title<input name="title" defaultValue={item.title} maxLength={120} required/></label><label>Folder<select name="folderId" defaultValue={item.folder_id || ''}>{folderOptions}</select></label><label className="wide">Description<textarea name="description" defaultValue={item.description || ''} maxLength={500}/></label>{item.type==='link' && <label className="wide">URL<input type="url" name="url" defaultValue={item.url} required maxLength={2048}/></label>}<PublicationControls key={String(!!item.published_at)} published={!!item.published_at}/></ActionForm>
          {item.type!=='link' && <UploadPanel clientId={id} itemId={item.id} folderId={item.folder_id || ''}/>}
          <div className="inline-form"><ActionForm className="inline-form" action={moveItem.bind(null,id,item.id,'up')}><button className="icon-button" disabled={index===0}>Move up</button></ActionForm><ActionForm className="inline-form" action={moveItem.bind(null,id,item.id,'down')}><button className="icon-button" disabled={index===items.length-1}>Move down</button></ActionForm><ActionForm className="inline-form" action={archiveItem.bind(null,id,item.id,false)} confirm="Archive this item? It will disappear from the client workspace."><button className="icon-button">Archive item</button></ActionForm></div>
        </div></details>)}</section>;
      })}
      {data.items.some(i=>i.archived_at || (i.folder_id && !folders.some(f=>f.id===i.folder_id))) && <details className="sub-panel"><summary>Archived items and hidden folder contents</summary>{data.items.filter(i=>i.archived_at || (i.folder_id && !folders.some(f=>f.id===i.folder_id))).map(item=><div key={item.id} className="member-row"><span>{item.title} <small className="muted">{item.archived_at?'Archived':'In an archived folder — restore the folder below'}</small></span>{item.archived_at && <ActionForm className="inline-form" action={archiveItem.bind(null,id,item.id,true)} success="Restored as draft."><button className="button secondary">Restore as draft</button></ActionForm>}</div>)}</details>}
    </section>
    <section id="folders" className="form-panel"><h2>Folders</h2><p className="muted">Drag the handle to place a folder before another, or use the arrow buttons.</p><FolderControls clientId={id} folders={folders.map(f=>({id:f.id,name:f.name}))}/><ActionForm action={createFolder.bind(null,id)} className="inline-form" success="Folder added."><label className="sr-only" htmlFor="new-folder">New folder name</label><input id="new-folder" name="name" required maxLength={120} placeholder="New folder name"/><button className="button">Add folder</button></ActionForm>
      {data.folders.some(f=>f.archived_at) && <details className="sub-panel"><summary>Archived folders</summary><p className="muted">Restoring a folder makes its published contents visible again.</p>{data.folders.filter(f=>f.archived_at).map(f=><div className="member-row" key={f.id}><span>{f.name}</span><ActionForm className="inline-form" action={restoreFolder.bind(null,id,f.id)}><button className="button secondary">Restore folder</button></ActionForm></div>)}</details>}
    </section>
    <section id="members" className="form-panel"><h2>Members</h2>{notices.invited && <p role="status" className="notice">Access granted and a sign-in link requested.</p>}{notices.emailError && <p role="alert">Access is granted, but the email request failed. The member can request a link from the sign-in page.</p>}
      {data.members.map(member=><div className="member-row" key={member.id}><div><strong>{member.full_name}</strong> <span className={'badge'+(member.first_seen_at?' green':'')}>{member.first_seen_at?'Joined':'Invited'}</span><p>{member.email}</p><p className="muted">Invited {date(member.invited_at)} · First sign-in {date(member.first_seen_at)} · Last seen {date(member.last_seen_at)}</p></div><div className="inline-form"><form action={inviteMember.bind(null,id)}><input type="hidden" name="email" value={member.email}/><input type="hidden" name="name" value={member.full_name || ''}/><button className="button secondary">Resend link</button></form><ActionForm className="inline-form" action={revokeMember.bind(null,id,member.id)} confirm={'Revoke workspace access for '+member.email+'?'}><button className="icon-button">Revoke access</button></ActionForm></div></div>)}
      <h3>Invite a member</h3><form action={inviteMember.bind(null,id)} className="form-grid"><label>Name<input name="name" autoComplete="name" maxLength={120}/></label><label>Email address<input name="email" type="email" required autoComplete="email" maxLength={254}/></label><button className="button">Send invitation →</button></form>
    </section>
    <section id="settings" className="form-panel"><h2>Workspace settings</h2><ActionForm action={updateClient.bind(null,id)}><label>Company name<input name="name" defaultValue={data.client.name} required maxLength={120}/></label><label>Accent colour<input type="color" name="accent_color" defaultValue={data.client.accent_color || '#354c37'}/></label><p className="muted wide">Workspace address: /c/{data.client.slug}</p><button className="button">Save workspace</button></ActionForm></section>
    <details className="form-panel"><summary>Archive this client</summary><p className="muted">Members will lose access. Records and files are retained, and the client can be restored from the directory.</p><form action={archiveClient.bind(null,id)}><button className="button secondary">Archive {data.client.name}</button></form></details>
  </Shell>;
}
