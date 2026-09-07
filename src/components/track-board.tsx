'use client';
import Link from 'next/link';
import { useEffect, useState, useTransition, type DragEvent } from 'react';
import { GripVertical, Repeat2 } from 'lucide-react';
import { setTrackStatus } from '@/app/admin/track-actions';
import { TRACK_STATUSES, statusLabel, type Track, type TrackStatus } from '@/lib/tracks';
import { TrackStatusBadge } from './track-status';

type BoardTrack = Track & { client_name: string; client_slug: string; unchanged_days: number };
const DRAG_TYPE = 'text/koodos-track';

export function TrackBoard({ tracks, showAll, filtered }: { tracks: BoardTrack[]; showAll: boolean; filtered: boolean }) {
  const [pending, start] = useTransition();
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const [dragging, setDragging] = useState('');
  const [over, setOver] = useState('');
  const columns = showAll ? TRACK_STATUSES : TRACK_STATUSES.filter(status => status !== 'not_started' && status !== 'done');
  const stages = tracks.filter(track => !track.recurring);
  const ongoing = tracks.filter(track => track.recurring);

  function change(track: BoardTrack, status: TrackStatus) {
    setMessage('');
    start(async () => {
      try {
        await setTrackStatus(track.client_id, track.id, status);
        setError(false);
        setMessage(`${track.client_name} · ${track.name}: ${statusLabel(status)}.`);
      } catch {
        setError(true);
        setMessage('Could not change the status. Please retry.');
      }
    });
  }

  function drop(event: DragEvent, status: TrackStatus) {
    event.preventDefault();
    const track = stages.find(item => item.id === event.dataTransfer.getData(DRAG_TYPE));
    setDragging(''); setOver('');
    if (track && track.status !== status && !pending) change(track, status);
  }

  function control(track: BoardTrack) {
    return <label className="board-status-control"><span className="sr-only">Status for {track.client_name} · {track.name}</span>
      <select value={track.status} disabled={!ready || pending} onChange={event => change(track, event.target.value as TrackStatus)}>{TRACK_STATUSES.map(status => <option key={status} value={status}>{statusLabel(status)}</option>)}</select>
    </label>;
  }

  return <>
    <div className="board-feedback" aria-live="polite">{pending ? 'Updating status…' : <span role={error ? 'alert' : 'status'} className={error ? 'form-error' : 'muted'}>{message}</span>}</div>
    <div key={showAll ? 'all' : 'live'} className="track-board" data-all={showAll} tabIndex={0} role="region" aria-label="Delivery stages board">
      {columns.map(status => {
        const cards = stages.filter(track => track.status === status);
        return <section key={status} aria-label={statusLabel(status)} className={'board-column'+(over === status ? ' is-over' : '')}
          onDragOver={event => { if (!pending && event.dataTransfer.types.includes(DRAG_TYPE)) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setOver(status); } }}
          onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(''); }}
          onDrop={event => drop(event, status)}>
          <div className="board-column-heading"><h2>{statusLabel(status)}</h2><span>{cards.length}</span></div>
          {cards.map(track => <article key={track.id} className={'board-card'+(dragging === track.id ? ' is-dragging' : '')}>
            <div className="board-card-top"><Link href={'/admin/clients/'+track.client_id+'#tracks'} className={filtered ? 'muted' : 'board-client-name'}>{track.client_name}</Link>
              <button type="button" className="drag-handle" disabled={!ready || pending} draggable={ready && !pending} aria-label={'Drag '+track.client_name+' '+track.name+' to change status'}
                onDragStart={event => { event.dataTransfer.setData(DRAG_TYPE, track.id); event.dataTransfer.effectAllowed = 'move'; setDragging(track.id); }}
                onDragEnd={() => { setDragging(''); setOver(''); }}><GripVertical size={17} aria-hidden="true" /></button></div>
            <h3><Link href={'/admin/clients/'+track.client_id+'#track-'+track.id}>{track.name}</Link></h3>
            {track.deliverable && <p className="board-deliverable">{track.deliverable}</p>}
            {track.status_note && <p className="board-note">{track.status_note}</p>}
            <p className="track-meta">{track.item_count} shared deliverable{track.item_count === 1 ? '' : 's'}</p>
            <p className={'board-age'+(track.unchanged_days >= 14 ? ' is-stale' : '')}>{track.unchanged_days === 0 ? 'Status changed today' : `Status unchanged for ${track.unchanged_days} day${track.unchanged_days === 1 ? '' : 's'}`}</p>
            {control(track)}
          </article>)}
          {!cards.length && <p className="board-empty">No stages here</p>}
        </section>;
      })}
    </div>
    {!showAll && !stages.some(track => track.status !== 'done' && track.status !== 'not_started') && <p className="muted">No live stages right now. Choose “Show all stages” to start work or review completed stages.</p>}
    {ongoing.length > 0 && <section className="board-ongoing"><h2><Repeat2 size={19} aria-hidden="true" /> Ongoing</h2><p className="muted">Services that continue beyond launch.</p>{ongoing.map(track => <article key={track.id} className="ongoing-row">
      <div><Link href={'/admin/clients/'+track.client_id+'#track-'+track.id}><strong>{track.client_name}</strong><span className="muted"> · {track.name}</span></Link><p className="muted">{track.deliverable}{track.status_note && <> · {track.status_note}</>}</p></div>
      <div><TrackStatusBadge status={track.status} /><p className="track-meta">{track.unchanged_days === 0 ? 'Status changed today' : `Unchanged for ${track.unchanged_days} days`}</p></div>{control(track)}
    </article>)}</section>}
  </>;
}
