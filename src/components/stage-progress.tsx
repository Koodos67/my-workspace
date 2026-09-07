import { statusLabel, type Track } from '@/lib/tracks';

/**
 * One segment per delivery stage, coloured by status, so the shape of a project reads
 * in a glance before any row is opened. Decorative: the segments carry no text, and the
 * whole strip exposes a single summary label to assistive technology.
 */
export function StageProgress({ stages }: { stages: Pick<Track, 'id' | 'name' | 'status'>[] }) {
  if (!stages.length) return null;
  const done = stages.filter(track => track.status === 'done').length;
  return <div className="stage-progress" role="img"
    aria-label={`${done} of ${stages.length} stages complete. ` + stages.map(track => `${track.name}: ${statusLabel(track.status)}`).join('. ')}>
    {stages.map(track => <span key={track.id} className="stage-progress-seg" data-status={track.status} />)}
  </div>;
}
