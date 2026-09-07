import Link from 'next/link';
import { ArchiveIcon, ArrowDown, ArrowUp, ArrowUpRight, Layers3, Plus, RotateCcw } from 'lucide-react';
import { ActionForm } from './action-form';
import { TrackStatusBadge } from './track-status';
import { archiveTrack, createTrack, moveTrack, updateTrack } from '@/app/admin/track-actions';
import { TRACK_STATUSES, statusLabel, trackDate, type Track } from '@/lib/tracks';
import { ApprovalManager, type ApprovalItem } from './approval-manager';
import { approvalLabels, type Approval } from '@/lib/approvals';

export function TrackManager({ clientId, slug, tracks, approvals, approvalItems }: { clientId: string; slug: string; tracks: Track[]; approvals: Approval[]; approvalItems: ApprovalItem[] }) {
  const active = tracks.filter(track => !track.archived_at);
  const archived = tracks.filter(track => track.archived_at);
  const approvalState = (trackId: string) => approvals.find(approval => approval.track_id === trackId)?.state;
  return <section id="tracks" className="form-panel track-manager">
    <div className="section-top"><div><h2><Layers3 size={20} aria-hidden="true" /> Work tracks</h2><p className="muted">A clear picture of progress. Status and notes are visible to your client as soon as you save.</p></div>
      <Link className="button secondary compact" href={'/admin/board?client='+slug}>Open board <ArrowUpRight size={15} aria-hidden="true" /></Link></div>
    {[false, true].map(recurring => {
      const group = active.filter(track => track.recurring === recurring);
      return <div key={String(recurring)} className="track-management-group">
        <div className="eyebrow">{recurring ? 'Ongoing services' : 'Delivery stages'}</div>
        {group.map((track, index) => <details className="track-editor" key={track.id} id={'track-'+track.id}>
          <summary><span className="track-number">{recurring ? '↻' : String(index + 1).padStart(2, '0')}</span><span className="track-editor-title">{track.name}<small>{track.deliverable || 'Add an expected deliverable'}</small>{approvalState(track.id) && <small className="approval-inline-status">{approvalLabels[approvalState(track.id)!]}</small>}</span><TrackStatusBadge status={track.status} /><span className="muted track-edit-cue">Edit <span aria-hidden="true">⌄</span></span></summary>
          <div className="track-editor-body">
            {approvals.find(approval => approval.track_id === track.id) && <p className="approval-summary">{approvalLabels[approvals.find(approval => approval.track_id === track.id)!.state]}</p>}
            <ActionForm action={updateTrack.bind(null, clientId, track.id)} success="Track updated. Your client can see this change.">
              <label htmlFor={'status-'+track.id}>Status<select id={'status-'+track.id} aria-label="Status" name="status" defaultValue={track.status}>{TRACK_STATUSES.map(status => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></label>
              <label>Client update<input name="status_note" defaultValue={track.status_note} maxLength={500} placeholder="A short update on where things stand" /></label>
              <label>Track name<input name="name" defaultValue={track.name} required maxLength={120} /></label>
              <label>Expected deliverable<input name="deliverable" defaultValue={track.deliverable} maxLength={120} /></label>
              <label className="wide">What happens<textarea name="summary" defaultValue={track.summary} maxLength={500} /></label>
              <label className="check-label wide"><input type="checkbox" name="recurring" defaultChecked={track.recurring} /> Ongoing service, shown separately from delivery stages</label>
              <label>Approval checkpoint<select name="approval_kind" aria-label="Approval checkpoint" defaultValue={track.approval_kind || ''}><option value="">None</option><option value="plan">Plan approval before build</option><option value="launch">Permission to launch and change DNS</option></select></label>
              <button className="button">Save track</button>
            </ActionForm>
            <ApprovalManager trackId={track.id} kind={track.approval_kind} approvals={approvals.filter(approval => approval.track_id === track.id)} items={approvalItems} />
            <div className="track-editor-footer"><span className="muted">{track.item_count} shared deliverable{track.item_count === 1 ? '' : 's'} · Status changed {trackDate(track.status_changed_at)}</span>
              <div className="inline-form">
                <ActionForm className="inline-form" action={moveTrack.bind(null, clientId, track.id, 'up')}><button className="icon-button" disabled={index === 0} aria-label={'Move '+track.name+' up'}><ArrowUp size={16} aria-hidden="true" /></button></ActionForm>
                <ActionForm className="inline-form" action={moveTrack.bind(null, clientId, track.id, 'down')}><button className="icon-button" disabled={index === group.length - 1} aria-label={'Move '+track.name+' down'}><ArrowDown size={16} aria-hidden="true" /></button></ActionForm>
                <ActionForm className="inline-form" action={archiveTrack.bind(null, clientId, track.id, false)} confirm="Archive this track? Its progress will be hidden; its folders and published content will remain available."><button className="icon-button danger"><ArchiveIcon size={16} aria-hidden="true" /> Archive track</button></ActionForm>
              </div>
            </div>
          </div>
        </details>)}
        {!group.length && <p className="muted">{recurring ? 'No ongoing services.' : 'No delivery stages. Add a track below.'}</p>}
      </div>;
    })}
    <details className="sub-panel"><summary><Plus size={16} aria-hidden="true" /> Add a work track</summary>
      <ActionForm action={createTrack.bind(null, clientId)} success="Work track added.">
        <label>New track name<input name="name" required maxLength={120} /></label>
        <label>Expected deliverable<input name="deliverable" maxLength={120} /></label>
        <label className="wide">What happens<textarea name="summary" maxLength={500} /></label>
        <label className="check-label wide"><input name="recurring" type="checkbox" /> Ongoing service</label>
        <button className="button">Add track</button>
      </ActionForm>
    </details>
    {archived.length > 0 && <details className="sub-panel"><summary>Archived tracks ({archived.length})</summary>{archived.map(track => <div className="member-row" key={track.id}><span>{track.name}</span><ActionForm className="inline-form" action={archiveTrack.bind(null, clientId, track.id, true)}><button className="button secondary compact"><RotateCcw size={15} aria-hidden="true" /> Restore track</button></ActionForm></div>)}</details>}
  </section>;
}
