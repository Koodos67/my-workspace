import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { withActor } from '@/lib/db';
import { Shell } from '@/components/shell';
import { archiveClient, createFolder, renameFolder, archiveFolder, moveFolder, inviteMember, revokeMember } from '../../actions';
export const dynamic = 'force-dynamic';
export default async function ClientAdmin({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ invited?: string; emailError?: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { profile } = await requireAdmin();
  const notices = await searchParams;
  const data = await withActor(profile.id, async db => {
    const client = (await db.query("SELECT * FROM clients WHERE id = $1 AND status = 'active'", [id])).rows[0];
    if (!client) return null;
    const folders = (await db.query('SELECT id,name FROM folders WHERE client_id = $1 AND archived_at IS NULL ORDER BY position, created_at', [id])).rows;
    const members = (await db.query('SELECT p.id,p.full_name,p.email,m.invited_at FROM memberships m JOIN profiles p ON p.id=m.profile_id WHERE m.client_id=$1 ORDER BY m.invited_at', [id])).rows;
    return { client, folders, members };
  });
  if (!data) notFound();
  return <Shell signedIn name={profile.full_name || 'Admin'} initials="MT"><Link href="/admin" className="muted">← All clients</Link><div className="heading"><div><h1>{data.client.name}</h1><p className="muted">Organise the work. Bring the right people in.</p></div><Link className="button secondary" href={'/c/' + data.client.slug}>View workspace ↗</Link></div>
    <h2>Folders</h2>{data.folders.length === 0 && <div className="empty"><p className="muted">Create a folder for proposals, research, or whatever comes next.</p></div>}
    {data.folders.map((folder, index) => <div className="folder-row" key={folder.id}><form action={renameFolder.bind(null,id,folder.id)} className="inline-form"><label className="sr-only" htmlFor={folder.id}>Folder name</label><input id={folder.id} name="name" defaultValue={folder.name} maxLength={120} required /><button className="button secondary">Save</button></form><div className="inline-form"><form action={moveFolder.bind(null,id,folder.id,'up')}><button className="icon-button" disabled={index===0} aria-label={'Move '+folder.name+' up'}>↑</button></form><form action={moveFolder.bind(null,id,folder.id,'down')}><button className="icon-button" disabled={index===data.folders.length-1} aria-label={'Move '+folder.name+' down'}>↓</button></form><form action={archiveFolder.bind(null,id,folder.id)}><button className="icon-button">Archive</button></form></div></div>)}
    <form action={createFolder.bind(null,id)} className="inline-form" style={{ marginTop:16 }}><label className="sr-only" htmlFor="new-folder">New folder name</label><input id="new-folder" name="name" placeholder="New folder name" maxLength={120} required /><button className="button">+ Add folder</button></form>
    <section className="form-panel"><h2>Members</h2>{notices.invited && <p className="notice" role="status">Access granted and a sign-in link requested. Delivery depends on your Resend sender configuration.</p>}{notices.emailError && <p role="alert">Access was granted, but the sign-in link could not be requested. Ask the member to use the sign-in page.</p>}{data.members.map(member=><div className="member-row" key={member.id}><div><strong>{member.full_name}</strong><p className="muted">{member.email}</p></div><form action={revokeMember.bind(null,id,member.id)}><button className="button secondary">Revoke access</button></form></div>)}
    <h2>Invite a member</h2><form action={inviteMember.bind(null,id)} className="form-grid"><label>Name<input name="name" autoComplete="name" maxLength={120} /></label><label>Email address<input name="email" type="email" required autoComplete="email" maxLength={254} /></label><button className="button">Send invitation →</button></form></section>
    <details className="form-panel"><summary>Archive this client</summary><p className="muted">The workspace will disappear and its members will lose access. Its records will be retained.</p><form action={archiveClient.bind(null,id)}><button className="button secondary">Archive {data.client.name}</button></form></details>
  </Shell>;
}
