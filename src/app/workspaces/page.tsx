import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireProfile } from '@/lib/auth';
import { withActor } from '@/lib/db';
import { Shell } from '@/components/shell';
export const dynamic = 'force-dynamic';
export default async function Workspaces() {
  const { profile } = await requireProfile();
  if (profile.role === 'admin') redirect('/admin');
  const clients = await withActor(profile.id, async db => (await db.query("SELECT id, name, slug FROM clients WHERE status = 'active' ORDER BY name")).rows);
  if (clients.length === 1) redirect('/c/' + clients[0].slug);
  return <Shell signedIn name={profile.full_name || 'Your account'}><h1>Your workspaces.</h1>{clients.length ? clients.map(client => <Link className="client-row" key={client.id} href={'/c/' + client.slug}><div className="client-icon">↗</div><h2>{client.name}</h2></Link>) : <div className="empty"><h2>No workspace yet</h2><p className="muted">Contact KOODOS to get connected to your client workspace.</p></div>}</Shell>;
}
