import Link from 'next/link';
import {
  ArchiveIcon, ArrowDown, ArrowUp, ArrowUpRight, Check, Layers3, Plus, Repeat2, RotateCcw,
} from 'lucide-react';
import { ActionForm } from './action-form';
import { TrackStatusBadge } from './track-status';
import { Hint } from './hint';
import { StageProgress } from './stage-progress';
import { archiveTrack, createTrack, moveTrack, updateTrack } from '@/app/admin/track-actions';
import {
  currentStageIndex, sinceLabel, statusHelp, statusLabel, trackDate, TRACK_STATUSES, type Track,
} from '@/lib/tracks';
import { ApprovalManager, type ApprovalItem } from './approval-manager';
import { approvalLabels, type Approval } from '@/lib/approvals';

/**
 * Reporting is what the client sees; setup is wording the studio sets once. They remain a single
 * form and a single action — grouping them only separates the weekly edit from the one-off edit,
 * which was the thing that made a track hard to work in.
 */
function TrackEditorBody({ clientId, track, approvals, approvalItems, first, last }: {
  clientId: string; track: Track; approvals: Approval[]; approvalItems: ApprovalItem[]; first: boolean; last: boolean;
}) {
  const mine = approvals.filter(approval => approval.track_id === track.id);
  return <div className="track-editor-body">
    <ActionForm action={updateTrack.bind(null, clientId, track.id)} success="Track updated. Your client can see this change.">
      <div className="track-zone wide" data-zone="reporting">
        <div className="track-zone-head">
          <span className="eyebrow">Reporting · your client sees this</span>
          <Hint label="what the client sees" align="end">
            Saving here changes your client’s progress view straight away. It is reporting only —
            it never publishes content, starts work or sends an email.
          </Hint>
        </div>
        <div className="track-zone-grid">
          {/* The hint sits outside the label element on purpose: a control nested in a label
              inherits that label, which would make the icon button answer to the field's name. */}
          <div className="field">
            <div className="field-label"><label htmlFor={'status-' + track.id}>Status</label>
              <Hint label="the status options">
                <strong>Not started</strong> — nothing has begun.<br />
                <strong>In progress</strong> — active work.<br />
                <strong>Waiting on client</strong> — blocked on them; they read it as “Waiting on you”.<br />
                <strong>On hold</strong> — paused on purpose.<br />
                <strong>Done</strong> — finished and handed over.
              </Hint></div>
            <select id={'status-' + track.id} aria-label="Status" name="status" defaultValue={track.status}>
              {TRACK_STATUSES.map(status => <option key={status} value={status}>{statusLabel(status)}</option>)}
            </select>
          </div>
          <div className="field">
            <div className="field-label"><label htmlFor={'note-' + track.id}>Client update</label>
              <Hint label="the client update" align="end">
                One short line your client reads under this stage. It is dated from when you change
                the wording, so an old note never looks fresher than it is.
              </Hint></div>
            <input id={'note-' + track.id} name="status_note" defaultValue={track.status_note} maxLength={500} placeholder="A short update on where things stand" />
          </div>
        </div>
        <p className="track-zone-foot">
          Right now they see <TrackStatusBadge status={track.status} client /> · {statusHelp[track.status]}
        </p>
      </div>

      <div className="track-zone wide" data-zone="setup">
        <div className="track-zone-head">
          <span className="eyebrow">Stage setup</span>
          <Hint label="stage setup" align="end">
            The wording of the stage itself. Renaming a stage does not change its approval
            checkpoint, its folders, or any content already shared under it.
          </Hint>
        </div>
        <div className="track-zone-grid">
          <label>Track name<input name="name" defaultValue={track.name} required maxLength={120} /></label>
          <label>Expected deliverable<input name="deliverable" defaultValue={track.deliverable} maxLength={120} /></label>
          <label className="wide">What happens<textarea name="summary" defaultValue={track.summary} maxLength={500} /></label>
          <label className="check-label wide"><input type="checkbox" name="recurring" defaultChecked={track.recurring} /> Ongoing service, shown separately from delivery stages</label>
        </div>
      </div>

      {!track.recurring && <div className="track-zone wide" data-zone="approval">
        <div className="track-zone-head">
          <span className="eyebrow">Approval checkpoint</span>
          <Hint label="approval checkpoints" align="end">
            Makes this stage an explicit permission gate. <strong>Plan</strong> asks the client to
            approve a published plan version before the build starts. <strong>Launch</strong> asks
            permission to go live, including DNS and switching traffic. Recording permission is all
            it does — nothing deploys, and the stage status is still yours to set.
          </Hint>
        </div>
        <label>Approval checkpoint<select name="approval_kind" aria-label="Approval checkpoint" defaultValue={track.approval_kind || ''}>
          <option value="">None</option>
          <option value="plan">Plan approval before build</option>
          <option value="launch">Permission to launch and change DNS</option>
        </select></label>
      </div>}

      <div className="track-form-foot wide">
        <button className="button">Save track</button>
        <span className="muted">Status and client update appear in the workspace as soon as you save.</span>
      </div>
    </ActionForm>

    {!track.recurring && <ApprovalManager trackId={track.id} kind={track.approval_kind} approvals={mine} items={approvalItems} />}

    <div className="track-editor-footer">
      <span className="muted">{track.item_count} shared deliverable{track.item_count === 1 ? '' : 's'} · Status changed {trackDate(track.status_changed_at)}</span>
      <div className="inline-form">
        <ActionForm className="inline-form" action={moveTrack.bind(null, clientId, track.id, 'up')}><button className="icon-button" disabled={first} aria-label={'Move ' + track.name + ' up'}><ArrowUp size={16} aria-hidden="true" /></button></ActionForm>
        <ActionForm className="inline-form" action={moveTrack.bind(null, clientId, track.id, 'down')}><button className="icon-button" disabled={last} aria-label={'Move ' + track.name + ' down'}><ArrowDown size={16} aria-hidden="true" /></button></ActionForm>
        <ActionForm className="inline-form" action={archiveTrack.bind(null, clientId, track.id, false)} confirm="Archive this track? Its progress will be hidden; its folders and published content will remain available."><button className="icon-button danger"><ArchiveIcon size={16} aria-hidden="true" /> Archive track</button></ActionForm>
      </div>
    </div>
  </div>;
}

export function TrackManager({ clientId, projectId, slug, tracks, approvals, approvalItems }: { clientId: string; projectId: string; slug: string; tracks: Track[]; approvals: Approval[]; approvalItems: ApprovalItem[] }) {
  const active = tracks.filter(track => !track.archived_at);
  const archived = tracks.filter(track => track.archived_at);
  const stages = active.filter(track => !track.recurring);
  const ongoing = active.filter(track => track.recurring);
  const done = stages.filter(track => track.status === 'done').length;
  const current = currentStageIndex(stages);
  // Distinguish the stage actually being worked from the one merely next in line.
  const underway = current >= 0 && stages[current].status !== 'not_started';
  const waiting = stages.filter(track => track.status === 'waiting_on_client').length;
  const pending = approvals.filter(approval => approval.state === 'pending').length;
  const latestApproval = (trackId: string) => approvals.find(approval => approval.track_id === trackId);

  return <section id="tracks" className="form-panel track-manager">
    <div className="section-top">
      <div><h2><Layers3 size={20} aria-hidden="true" /> Work tracks</h2>
        <p className="muted">A clear picture of progress. Status and notes are visible to your client as soon as you save.</p></div>
      <Link className="button secondary compact" href={'/admin/board?client=' + slug}>Open board <ArrowUpRight size={15} aria-hidden="true" /></Link>
    </div>

    {stages.length > 0 && <div className="track-overview">
      <StageProgress stages={stages} />
      <div className="track-overview-facts">
        <span><strong>{done}</strong> of {stages.length} stages done</span>
        {current >= 0 && <span className="track-overview-current">{underway ? 'Now on ' : 'Up next '}<strong>{stages[current].name}</strong></span>}
        {waiting > 0 && <span className="track-overview-flag">{waiting} waiting on the client</span>}
        {pending > 0 && <span className="track-overview-flag">{pending} approval{pending === 1 ? '' : 's'} awaiting a response</span>}
      </div>
    </div>}

    {[false, true].map(recurring => {
      const group = recurring ? ongoing : stages;
      return <div key={String(recurring)} className="track-management-group" data-group={recurring ? 'ongoing' : 'stages'}>
        <div className="eyebrow">{recurring ? 'Ongoing services' : 'Delivery stages'}</div>
        <div className="track-stage-list">
          {group.map((track, index) => {
            const approval = latestApproval(track.id);
            const isCurrent = !recurring && index === current;
            return <details className="track-editor" key={track.id} id={'track-' + track.id}
              data-status={track.status} data-current={isCurrent || undefined}>
              <summary>
                <span className="track-marker" data-status={track.status} aria-hidden="true">
                  {recurring ? <Repeat2 size={15} /> : track.status === 'done' ? <Check size={16} strokeWidth={3} /> : String(index + 1).padStart(2, '0')}
                </span>
                <span className="track-editor-title">
                  <span className="track-editor-name">{track.name}{isCurrent && <span className="stage-flag" data-tone={underway ? 'live' : 'next'}>{underway ? 'Current' : 'Up next'}</span>}</span>
                  <small>{track.deliverable || 'Add an expected deliverable'}</small>
                  {track.status_note && <small className="track-summary-note">“{track.status_note}”</small>}
                  {track.status !== 'not_started' && <small className="track-summary-age">Status changed {sinceLabel(track.status_changed_at)}</small>}
                </span>
                <span className="track-summary-side">
                  {approval && <span className="approval-chip" data-state={approval.state}>{approvalLabels[approval.state]}</span>}
                  <TrackStatusBadge status={track.status} />
                </span>
                <span className="muted track-edit-cue">Edit <span aria-hidden="true">⌄</span></span>
              </summary>
              <TrackEditorBody clientId={clientId} track={track} approvals={approvals} approvalItems={approvalItems} first={index === 0} last={index === group.length - 1} />
            </details>;
          })}
        </div>
        {!group.length && <p className="muted">{recurring ? 'No ongoing services.' : 'No delivery stages. Add a track below.'}</p>}
      </div>;
    })}

    <details className="sub-panel"><summary><Plus size={16} aria-hidden="true" /> Add a work track</summary>
      <ActionForm action={createTrack.bind(null, clientId)} success="Work track added.">
        <input type="hidden" name="projectId" value={projectId} />
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
