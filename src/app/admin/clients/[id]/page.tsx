import Link from 'next/link';
import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import {
  ArchiveIcon, ArrowDown, ArrowUp, ArrowUpRight, Folder, FolderPlus, Globe, Link2,
  MailPlus, RotateCcw, Settings2, ShieldAlert, SquarePen, UserMinus, UserRound, Users,
} from 'lucide-react';
import { requireAdmin } from '@/lib/auth';
import { withActor } from '@/lib/db';
import { Shell } from '@/components/shell';
import { BackLink } from '@/components/back-link';
import { PublicationControls } from '@/components/publication-controls';
import { ActionForm } from '@/components/action-form';
import { UploadPanel } from '@/components/upload-panel';
import { FolderControls } from '@/components/folder-controls';
import { ItemIcon, itemTypeLabel } from '@/components/item-icon';
import { UrlImport } from '@/components/url-import';
import { archiveClient, createFolder, inviteMember, revokeMember, updateClient, restoreFolder } from '../../actions';
import { createLink, editItem, archiveItem, moveItem } from '../../content-actions';

export const dynamic = 'force-dynamic';

const date = (value: Date | null) => value ? new Date(value).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'Europe/London'}) : 'Not yet';
const initials = (name: string | null, email: string) => (name || email).trim().split(/\s+/).slice(0,2).map(part=>part[0] ?? '').join('').toUpperCase() || '?';

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
    const items = (await db.query(
      `SELECT i.*,
        (SELECT count(*) FROM item_versions v WHERE v.item_id=i.id) AS versions,
        (SELECT v.mime_type FROM item_versions v WHERE v.id=i.current_version_id) AS mime
       FROM items i WHERE client_id=$1 ORDER BY position,created_at,id`,[id])).rows;
    return {client,folders,members,items};
  });
  if (!data) notFound();

  const folders=data.folders.filter(f=>!f.archived_at);
  const folderOptions=<><option value="">Workspace root</option>{folders.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</>;
  const live=data.items.filter(i=>!i.archived_at);
  const published=live.filter(i=>i.published_at).length;
  const joined=data.members.filter(m=>m.first_seen_at).length;
  const hidden=data.items.filter(i=>i.archived_at || (i.folder_id && !folders.some(f=>f.id===i.folder_id)));
  const nonce=(await headers()).get('x-nonce') || '';

  return <Shell signedIn name={profile.full_name || 'Admin'} initials="MT">
    <BackLink href="/admin">Back to all clients</BackLink>
    <div className="heading">
      <div>
        <h1>{data.client.name}</h1>
        <p className="muted">Organise the work. Bring the right people in.</p>
      </div>
      <Link className="button secondary" href={'/c/'+data.client.slug}>View workspace <ArrowUpRight size={16} aria-hidden="true" /></Link>
    </div>

    <nav className="section-links" aria-label="Workspace sections">
      <a href="#content">Content</a><a href="#folders">Folders</a><a href="#members">Members</a><a href="#settings">Settings</a>
    </nav>

    <section id="content" className="form-panel">
      <h2>Add content</h2>
      <p className="muted">New content starts as a draft. Open the item below, choose <strong>Share with client</strong>, then <strong>Save &amp; publish</strong> when it is ready.</p>
      <UploadPanel clientId={id} folders={folders.map(f=>({id:f.id,name:f.name}))}/>
      <details className="sub-panel">
        <summary><Link2 size={16} aria-hidden="true" /> Add a link</summary>
        <ActionForm action={createLink.bind(null,id)} success="Link added as a draft.">
          <label>Title<input name="title" required maxLength={120}/></label>
          <label>URL<input name="url" type="url" required maxLength={2048} placeholder="https://"/></label>
          <label className="wide">Description<textarea name="description" maxLength={500}/></label>
          <label>Folder<select name="folderId">{folderOptions}</select></label>
          <button className="button">Add link draft</button>
        </ActionForm>
      </details>
      <details className="sub-panel">
        <summary><Globe size={16} aria-hidden="true" /> Import an artifact from a URL</summary>
        <UrlImport clientId={id} folders={folders.map(f=>({id:f.id,name:f.name}))} nonce={nonce}/>
      </details>
    </section>

    <section>
      <div className="section-top">
        <h2>Workspace content</h2>
        <span className="muted">{live.length} item{live.length===1?'':'s'} · {published} published</span>
      </div>
      {!live.length && <div className="empty">Upload your first artifact or add a link above.</div>}
      {[{id:null,name:'Workspace root'},...folders].map(folder=>{
        const items=live.filter(item=>item.folder_id===folder.id);
        return items.length>0 && <section className="folder-group" key={folder.id || 'root'}>
          <h3><span className="type-icon" data-kind="folder"><Folder size={16} strokeWidth={1.75} aria-hidden="true" /></span>{folder.name}<span className="muted">{items.length}</span></h3>
          {items.map((item,index)=><details className="content-row" key={item.id}>
            <summary>
              <ItemIcon type={item.type} mime={item.mime}/>
              <span className="content-title">{item.title}</span>
              <span className={'badge'+(item.published_at?' green':'')}>{item.published_at?'Published · visible to client':'Draft · hidden from client'}</span>
              <span className="content-edit-cue"><SquarePen size={14} aria-hidden="true" /> Edit &amp; sharing <span aria-hidden="true">⌄</span></span>
              <small className="muted">{itemTypeLabel(item.type,item.mime)} · {item.versions} version{Number(item.versions)===1?'':'s'}</small>
            </summary>
            <div className="item-controls">
              <Link className="button secondary" href={'/items/'+item.id}>Preview item <ArrowUpRight size={15} aria-hidden="true" /></Link>
              <ActionForm action={editItem.bind(null,id,item.id)}>
                <label>Title<input name="title" defaultValue={item.title} maxLength={120} required/></label>
                <label>Folder<select name="folderId" defaultValue={item.folder_id || ''}>{folderOptions}</select></label>
                <label className="wide">Description<textarea name="description" defaultValue={item.description || ''} maxLength={500}/></label>
                {item.type==='link' && <label className="wide">URL<input type="url" name="url" defaultValue={item.url} required maxLength={2048}/></label>}
                <PublicationControls key={String(!!item.published_at)} published={!!item.published_at}/>
              </ActionForm>
              {item.type!=='link' && <UploadPanel clientId={id} itemId={item.id} folderId={item.folder_id || ''}/>}
              {item.type==='artifact' && <UrlImport clientId={id} itemId={item.id} folderId={item.folder_id || ''} nonce={nonce}/>}
              <div className="inline-form">
                <ActionForm className="inline-form" action={moveItem.bind(null,id,item.id,'up')}><button className="icon-button" disabled={index===0}><ArrowUp size={15} aria-hidden="true" /><span className="button-text">Move up</span></button></ActionForm>
                <ActionForm className="inline-form" action={moveItem.bind(null,id,item.id,'down')}><button className="icon-button" disabled={index===items.length-1}><ArrowDown size={15} aria-hidden="true" /><span className="button-text">Move down</span></button></ActionForm>
                <ActionForm className="inline-form" action={archiveItem.bind(null,id,item.id,false)} confirm="Archive this item? It will disappear from the client workspace."><button className="icon-button danger"><ArchiveIcon size={15} aria-hidden="true" /><span className="button-text">Archive item</span></button></ActionForm>
              </div>
            </div>
          </details>)}
        </section>;
      })}
      {hidden.length>0 && <details className="sub-panel">
        <summary><ArchiveIcon size={16} aria-hidden="true" /> Archived items and hidden folder contents</summary>
        {hidden.map(item=><div key={item.id} className="member-row">
          <span><ItemIcon type={item.type} mime={item.mime}/> {item.title} <small className="muted">{item.archived_at?'Archived':'In an archived folder — restore the folder below'}</small></span>
          {item.archived_at && <ActionForm className="inline-form" action={archiveItem.bind(null,id,item.id,true)} success="Restored as draft."><button className="button secondary"><RotateCcw size={15} aria-hidden="true" /> Restore as draft</button></ActionForm>}
        </div>)}
      </details>}
    </section>

    <section id="folders" className="form-panel">
      <h2>Folders</h2>
      <p className="muted">Drag a row by its handle to place it before another, or use the arrow buttons.</p>
      <FolderControls clientId={id} folders={folders.map(f=>({id:f.id,name:f.name}))}/>
      <ActionForm action={createFolder.bind(null,id)} className="inline-form add-folder" success="Folder added.">
        <label className="sr-only" htmlFor="new-folder">New folder name</label>
        <input id="new-folder" name="name" required maxLength={120} placeholder="New folder name"/>
        <button className="button"><FolderPlus size={16} aria-hidden="true" /> Add folder</button>
      </ActionForm>
      {data.folders.some(f=>f.archived_at) && <details className="sub-panel">
        <summary><ArchiveIcon size={16} aria-hidden="true" /> Archived folders</summary>
        <p className="muted">Restoring a folder makes its published contents visible again.</p>
        {data.folders.filter(f=>f.archived_at).map(f=><div className="member-row" key={f.id}>
          <span><span className="type-icon" data-kind="folder"><Folder size={16} strokeWidth={1.75} aria-hidden="true" /></span> {f.name}</span>
          <ActionForm className="inline-form" action={restoreFolder.bind(null,id,f.id)}><button className="button secondary"><RotateCcw size={15} aria-hidden="true" /> Restore folder</button></ActionForm>
        </div>)}
      </details>}
    </section>

    <div className="admin-zone">
      <div className="admin-zone-head">
        <span className="eyebrow">Workspace administration</span>
        <p className="muted">Who can reach this workspace, and how it is configured. Nothing here is visible to the client.</p>
      </div>

      <section id="members" className="form-panel">
        <div className="section-top">
          <h2><Users size={18} strokeWidth={1.75} aria-hidden="true" /> Members</h2>
          <span className="muted">{data.members.length} with access</span>
        </div>
        {notices.invited && <p role="status" className="notice">Access granted and a sign-in link requested.</p>}
        {notices.emailError && <p role="alert" className="notice warn">Access is granted, but the email request failed. The member can request a link from the sign-in page.</p>}

        <div className="member-stats">
          <div className="stat-tile"><span className="muted">With access</span><strong>{data.members.length}</strong></div>
          <div className="stat-tile"><span className="muted">Signed in</span><strong>{joined}</strong></div>
          <div className="stat-tile"><span className="muted">Awaiting first sign-in</span><strong>{data.members.length-joined}</strong></div>
        </div>

        {!data.members.length && <div className="empty">No one has access yet. Invite the first member below.</div>}
        <ul className="member-list">
          {data.members.map(member=><li className="member-card" key={member.id}>
            <span className="member-avatar" aria-hidden="true">{initials(member.full_name,member.email)}</span>
            <div className="member-identity">
              <strong>{member.full_name || member.email}</strong>
              <span className={'badge'+(member.first_seen_at?' green':'')}>{member.first_seen_at?'Joined':'Invited'}</span>
              <p className="member-email">{member.email}</p>
            </div>
            <dl className="member-meta">
              <div><dt>Invited</dt><dd>{date(member.invited_at)}</dd></div>
              <div><dt>First sign-in</dt><dd>{date(member.first_seen_at)}</dd></div>
              <div><dt>Last seen</dt><dd>{date(member.last_seen_at)}</dd></div>
            </dl>
            <div className="member-actions">
              <form action={inviteMember.bind(null,id)}>
                <input type="hidden" name="email" value={member.email}/>
                <input type="hidden" name="name" value={member.full_name || ''}/>
                <button className="button secondary compact"><MailPlus size={15} aria-hidden="true" /> Resend link</button>
              </form>
              <ActionForm className="inline-form" action={revokeMember.bind(null,id,member.id)} confirm={'Revoke workspace access for '+member.email+'?'}>
                <button className="icon-button danger"><UserMinus size={15} aria-hidden="true" /><span className="button-text">Revoke access</span></button>
              </ActionForm>
            </div>
          </li>)}
        </ul>

        <details className="sub-panel" open={!data.members.length}>
          <summary><UserRound size={16} aria-hidden="true" /> Invite a member</summary>
          <form action={inviteMember.bind(null,id)} className="form-grid">
            <label>Name<input name="name" autoComplete="name" maxLength={120}/></label>
            <label>Email address<input name="email" type="email" required autoComplete="email" maxLength={254}/></label>
            <button className="button"><MailPlus size={16} aria-hidden="true" /> Send invitation</button>
          </form>
        </details>
      </section>

      <section id="settings" className="form-panel">
        <h2><Settings2 size={18} strokeWidth={1.75} aria-hidden="true" /> Workspace settings</h2>
        <ActionForm action={updateClient.bind(null,id)}>
          <label>Company name<input name="name" defaultValue={data.client.name} required maxLength={120}/></label>
          <label>Accent colour<input type="color" name="accent_color" defaultValue={data.client.accent_color || '#354c37'}/></label>
          <p className="muted wide">Workspace address: <code>/c/{data.client.slug}</code></p>
          <button className="button">Save workspace</button>
        </ActionForm>
      </section>

      <details className="form-panel danger-panel">
        <summary><ShieldAlert size={16} aria-hidden="true" /> Archive this client</summary>
        <p className="muted">Members will lose access. Records and files are retained, and the client can be restored from the directory.</p>
        <form action={archiveClient.bind(null,id)}>
          <button className="button secondary"><ArchiveIcon size={15} aria-hidden="true" /> Archive {data.client.name}</button>
        </form>
      </details>
    </div>
  </Shell>;
}
