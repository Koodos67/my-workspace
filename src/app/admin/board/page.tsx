import Link from 'next/link';
import { Shell } from '@/components/shell';
import { TrackBoard } from '@/components/track-board';
import { requireAdmin } from '@/lib/auth';
import { withActor } from '@/lib/db';
import { readTracks } from '@/lib/track-data';

export const dynamic = 'force-dynamic';

export default async function Board({ searchParams }: { searchParams: Promise<{ client?: string; show?: string }> }) {
  const { profile } = await requireAdmin();
  const params = await searchParams;
  const showAll = params.show === 'all';
  const { clients, tracks } = await withActor(profile.id, async db => ({
    clients: (await db.query("SELECT id,name,slug FROM clients WHERE status='active' ORDER BY name,id")).rows as {id:string;name:string;slug:string}[],
    tracks: await readTracks(db),
  }));
  const visible = tracks.filter(track => track.recurring || showAll || (track.status !== 'not_started' && track.status !== 'done'));
  function href(client?: string, all = showAll) {
    const query = new URLSearchParams();
    if (client) query.set('client', client);
    if (all) query.set('show', 'all');
    return '/admin/board' + (query.size ? '?'+query.toString() : '');
  }
  const selected = tracks.filter(track => !params.client || track.client_slug === params.client);
  const now = Date.now();
  return <Shell signedIn admin board name={profile.full_name || 'Admin'} initials={(profile.full_name || profile.email).slice(0,2).toUpperCase()}>
    <div className="heading"><div><div className="eyebrow">Across the studio</div><h1>The work in motion.</h1><p className="muted">Keep progress clear, and your clients in the picture.</p></div></div>
    <nav className="board-filters" aria-label="Filter work by client">
      <Link href={href()} aria-current={!params.client ? 'page' : undefined}>All <span>{visible.length}</span></Link>
      {clients.map(client => <Link key={client.id} href={href(client.slug)} aria-current={params.client === client.slug ? 'page' : undefined}>{client.name} <span>{visible.filter(track => track.client_id === client.id).length}</span></Link>)}
    </nav>
    <div className="board-toolbar"><p className="muted">{showAll ? 'All delivery stages' : 'Live work · In progress, waiting and on hold'}</p><Link className="button secondary compact" href={href(params.client, !showAll)}>{showAll ? 'Show live work' : 'Show all stages'}</Link></div>
    <TrackBoard tracks={selected.map(track => ({...track, unchanged_days:Math.max(0,Math.floor((now - new Date(track.status_changed_at).getTime()) / 86400000))}))} showAll={showAll} filtered={!!params.client} />
  </Shell>;
}
