import { statusLabel, type TrackStatus } from '@/lib/tracks';

export function TrackStatusBadge({ status, client = false }: { status: TrackStatus; client?: boolean }) {
  return <span className="track-status" data-status={status}><span aria-hidden="true" />{statusLabel(status, client ? 'client' : 'admin')}</span>;
}
