import { Check, ChevronDown, Repeat2 } from 'lucide-react';
import { TrackStatusBadge } from './track-status';
import { trackDate, type Track } from '@/lib/tracks';
import { ApprovalCard } from './approval-card';
import { approvalLabels, type Approval } from '@/lib/approvals';

function TrackDetail({ track, folders }: { track: Track; folders: { id: string; name: string; track_id: string | null }[] }) {
  const linked = folders.filter(folder => folder.track_id === track.id);
  return <div className="progress-detail">
    {track.summary && <p className="muted">{track.summary}</p>}
    {track.deliverable && <p className="expected-deliverable"><span className="eyebrow">What you get</span><strong>{track.deliverable}</strong></p>}
    {track.status_note && <div className="track-client-note"><p>{track.status_note}</p>{track.note_updated_at && <time dateTime={track.note_updated_at}>Update · {trackDate(track.note_updated_at)}</time>}</div>}
    <p className="track-meta">{track.item_count} shared deliverable{track.item_count === 1 ? '' : 's'}{track.last_updated && <> · Last updated {trackDate(track.last_updated)}</>}</p>
    {linked.length > 0 && <div className="track-folder-links">{linked.map(folder => <a key={folder.id} href={'#folder-'+folder.id}>{folder.name} <span aria-hidden="true">↗</span></a>)}</div>}
  </div>;
}

export function ClientProgress({ tracks, folders, approvals, canRespond }: { tracks: Track[]; folders: { id: string; name: string; track_id: string | null }[]; approvals: Approval[]; canRespond: boolean }) {
  if (!tracks.length) return null;
  const stages = tracks.filter(track => !track.recurring);
  const ongoing = tracks.filter(track => track.recurring);
  const completed = stages.filter(track => track.status === 'done').length;
  const current = stages.findIndex(track => track.status !== 'done' && track.status !== 'not_started');
  const allDone = stages.length > 0 && completed === stages.length;
  const started = stages.some(track => track.status !== 'not_started');
  const focus = current >= 0 ? current : stages.findIndex(track => track.status !== 'done');
  const pendingApprovals = approvals.filter(approval => approval.state === 'pending');
  return <section className="client-progress" aria-labelledby="progress-title">
    <div className="progress-heading"><div><div className="eyebrow">Our work together</div><h2 id="progress-title">Where things stand</h2></div>{stages.length > 0 && <span className="progress-count">{completed} of {stages.length} stages complete</span>}</div>
    {pendingApprovals.length>0 && <p className="approval-attention">{pendingApprovals.length === 1 ? 'There is an approval request' : `There are ${pendingApprovals.length} approval requests`} for you to review below.</p>}
    {stages.length > 0 && <>
      <p className="progress-current">{allDone ? 'Delivery complete.' : !started ? 'Ready when you are.' : current >= 0 ? `Stage ${current + 1} of ${stages.length} · ${stages[current].name}` : `Up next · ${stages[focus].name}`}</p>
      <ol className="progress-spine">{stages.map((track, index) => <li key={track.id} data-status={track.status} aria-current={index === current ? 'step' : undefined}>
        <span className="spine-marker" aria-hidden="true">{track.status === 'done' ? <Check size={16} /> : String(index + 1).padStart(2, '0')}</span>
        <details open={index === focus || approvals.some(approval => approval.track_id === track.id)}>
          <summary><span className="spine-title">{track.name}</span><TrackStatusBadge status={track.status} client /><ChevronDown className="progress-chevron" size={16} aria-hidden="true" /></summary>
          <TrackDetail track={track} folders={folders} />
          {approvals.filter(approval => approval.track_id === track.id).slice(0,1).map(approval => <ApprovalCard key={approval.id} approval={approval} canRespond={canRespond} />)}
          {approvals.filter(approval => approval.track_id === track.id).length>1 && <details className="approval-history"><summary>Approval history</summary>{approvals.filter(approval => approval.track_id === track.id).slice(1).map(approval => <ApprovalCard key={approval.id} approval={approval} history />)}</details>}
        </details>
        {approvals.find(approval => approval.track_id === track.id) && <p className="approval-spine-status">{approvalLabels[approvals.find(approval => approval.track_id === track.id)!.state]}</p>}
      </li>)}</ol>
    </>}
    {ongoing.length > 0 && <div className="client-ongoing"><div className="eyebrow"><Repeat2 size={15} aria-hidden="true" /> Ongoing care</div>{ongoing.map(track => <details key={track.id} open={track.status !== 'not_started'}><summary><span className="spine-title">{track.name}</span><TrackStatusBadge status={track.status} client /><ChevronDown className="progress-chevron" size={16} aria-hidden="true" /></summary><TrackDetail track={track} folders={folders} /></details>)}</div>}
  </section>;
}
