export const TRACK_STATUSES = ['not_started', 'in_progress', 'waiting_on_client', 'on_hold', 'done'] as const;
export type TrackStatus = typeof TRACK_STATUSES[number];

export const DEFAULT_TRACKS: {name:string;summary:string;deliverable:string;recurring:boolean;approval_kind?:'plan'|'launch'}[] = [
  { name: 'Discovery', summary: 'A working session on the business, the buyers and the constraints', deliverable: 'Written brief', recurring: false },
  { name: 'Research', summary: 'Market, competitor and search analysis; content gap and citation audit', deliverable: 'Research pack', recurring: false },
  { name: 'Plan', summary: 'Sitemap, content model, design direction, stack recommendation', deliverable: 'Plan for approval', recurring: false, approval_kind: 'plan' },
  { name: 'Build', summary: 'Design and development against the approved plan', deliverable: 'Staging site', recurring: false },
  { name: 'Review', summary: 'One structured round of changes, tracked in writing', deliverable: 'Change log', recurring: false },
  { name: 'Launch', summary: 'Migration, redirects, analytics, handover documentation', deliverable: 'Live site and keys', recurring: false, approval_kind: 'launch' },
  { name: 'Operate', summary: 'Monitoring, fixes, measurement — and content, if you want it', deliverable: 'Quarterly report', recurring: true },
];

export type Track = {
  approval_kind: 'plan' | 'launch' | null;
  id: string; client_id: string; name: string; summary: string; deliverable: string;
  position: number; recurring: boolean; status: TrackStatus; status_note: string;
  status_changed_at: string; note_updated_at: string | null; archived_at: string | null;
  item_count: number; last_updated: string | null;
};

export function statusLabel(status: TrackStatus, audience: 'admin' | 'client' = 'admin') {
  const labels: Record<TrackStatus, string> = {
    not_started: 'Not started', in_progress: 'In progress',
    waiting_on_client: audience === 'client' ? 'Waiting on you' : 'Waiting on client',
    on_hold: 'On hold', done: 'Done',
  };
  return labels[status];
}

export function trackDate(value: string) {
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' });
}
