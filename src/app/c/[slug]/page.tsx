import { notFound } from 'next/navigation';
import { requireProfile } from '@/lib/auth';
import { withActor } from '@/lib/db';
import { Shell } from '@/components/shell';
export const dynamic = 'force-dynamic';
export default async function ClientWorkspace({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { profile } = await requireProfile();
  const { client, folders } = await withActor(profile.id, async db => {
    const client = (await db.query("SELECT id, name FROM clients WHERE slug = $1 AND status = 'active'", [slug])).rows[0];
    if (!client) return { client: null, folders: [] };
    const folders = (await db.query('SELECT id, name FROM folders WHERE client_id = $1 AND archived_at IS NULL ORDER BY position, created_at', [client.id])).rows;
    return { client, folders };
  });
  if (!client) notFound();
  return <Shell signedIn client name={client.name} initials={(profile.full_name || profile.email).slice(0, 2).toUpperCase()}><div className="eyebrow">{client.name} × KOODOS</div><h1>Your work has a home.</h1><p className="muted">The things we’re making together, all in one place.</p>{folders.length ? folders.map(folder => <section key={folder.id}><h2 style={{ marginTop: 32 }}>▱ {folder.name}</h2><div className="empty"><p className="muted">Your shared work will appear here.</p></div></section>) : <div className="empty" style={{ marginTop: 35 }}><h2>A fresh beginning.</h2><p className="muted">Your shared work will appear here.</p></div>}</Shell>;
}
