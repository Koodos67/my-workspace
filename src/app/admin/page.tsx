import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { withActor } from '@/lib/db';
import { Shell } from '@/components/shell';
import { ActionForm } from '@/components/action-form';
import { createClient, restoreClient } from './actions';
export const dynamic = 'force-dynamic';
export default async function Admin({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { profile } = await requireAdmin();
  const { error } = await searchParams;
  const clients = await withActor(profile.id, async db => (await db.query("SELECT c.id,c.name,c.slug,c.status,c.accent_color,(SELECT count(*) FROM memberships m WHERE m.client_id=c.id) AS members,(SELECT count(*) FROM items i WHERE i.client_id=c.id AND i.archived_at IS NULL) AS items FROM clients c ORDER BY c.name")).rows);
  const active=clients.filter(c=>c.status==='active'),archived=clients.filter(c=>c.status==='archived');
  return <Shell signedIn admin name={profile.full_name || 'Admin'} initials="MT"><div className="heading"><div><div className="eyebrow">A home for the work</div><h1>Your clients, together.</h1><p className="muted">A clear view of the people and projects you’re looking after.</p></div><a className="button" href="#new-client">+ New client</a></div><h2>Client directory</h2>{active.length?active.map(client=><Link className="client-row" key={client.id} href={'/admin/clients/'+client.id}><div className="client-icon" style={{borderBottom:'3px solid '+(client.accent_color || '#354c37')}}>{client.name.slice(0,1)}</div><div><h2>{client.name}</h2><p>{client.members} members · {client.items} items</p></div><span>Manage workspace ↗</span></Link>):<div className="empty"><h2>Room for your first client.</h2><p className="muted">Create a client below to get started.</p></div>}
    <section className="form-panel" id="new-client"><h2>Create a client</h2>{error && <p role="alert">{error==='duplicate'?'That address is already in use. Choose another slug.':'Use lowercase letters, numbers, and hyphens for the slug.'}</p>}<form action={createClient} className="form-grid"><label>Company name<input name="name" required maxLength={120} placeholder="Rooted Education"/></label><label>Workspace slug <span className="muted">(optional)</span><input name="slug" maxLength={80} pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="rooted-education"/></label><button className="button" type="submit">Create client →</button></form></section>
    {archived.length>0 && <details className="form-panel"><summary>Archived clients ({archived.length})</summary><p className="muted">Restoring a client restores member access to its published content.</p>{archived.map(client=><div className="member-row" key={client.id}><strong>{client.name}</strong><ActionForm action={restoreClient.bind(null,client.id)} className="inline-form" confirm={'Restore '+client.name+' and its members’ access?'}><button className="button secondary">Restore client</button></ActionForm></div>)}</details>}
  </Shell>;
}
