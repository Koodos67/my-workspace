import { CircleCheck, CircleDashed, FileCheck2, Hourglass, ShieldCheck, TriangleAlert, Undo2 } from 'lucide-react';
import { ActionForm } from './action-form';
import { ApprovalCard } from './approval-card';
import { Hint } from './hint';
import { requestApproval, withdrawApproval } from '@/app/admin/approval-actions';
import { approvalTitle, type Approval, type ApprovalKind, type ApprovalState } from '@/lib/approvals';

export type ApprovalItem = {id:string;title:string;type:string;current_version_id:string|null};

/** What the studio should do next, said plainly, so the admin never has to infer it from a badge. */
const nextStep: Record<ApprovalState | 'none', { tone: 'idle' | 'waiting' | 'good' | 'warn'; text: string }> = {
  none: { tone: 'idle', text: 'No request sent yet. Nothing authorises this checkpoint.' },
  pending: { tone: 'waiting', text: 'Waiting on the client. The first active member to respond closes the request.' },
  approved: { tone: 'good', text: 'Permission is recorded. You may proceed.' },
  changes_requested: { tone: 'warn', text: 'The client asked for changes. Issue a fresh request once they are ready.' },
  stale: { tone: 'warn', text: 'The deliverable changed after this request. A fresh request is needed before proceeding.' },
  withdrawn: { tone: 'warn', text: 'You withdrew this request. Nothing currently authorises this checkpoint.' },
  superseded: { tone: 'idle', text: 'Replaced by a newer request.' },
};

const stepIcon = { idle: CircleDashed, waiting: Hourglass, good: CircleCheck, warn: TriangleAlert };

export function ApprovalManager({ trackId, kind, approvals, items }: { trackId:string;kind:ApprovalKind|null;approvals:Approval[];items:ApprovalItem[] }) {
  const latest = approvals[0];
  const eligible = items.filter(item => kind === 'launch' && item.type === 'link' || item.current_version_id && item.type !== 'link');
  if (!kind && !approvals.length) return null;
  const step = nextStep[latest?.state ?? 'none'];
  const StepIcon = stepIcon[step.tone];
  const withdrawable = latest && !['withdrawn','superseded'].includes(latest.state);
  return <section className="approval-manager" data-kind={kind ?? 'none'} aria-label="Approval checkpoint">
    <div className="approval-manager-head">
      <span className="approval-kind-icon" data-kind={kind ?? 'none'} aria-hidden="true">{kind === 'launch' ? <ShieldCheck size={17} /> : <FileCheck2 size={17} />}</span>
      <h3>{kind ? approvalTitle(kind) : 'Previous approvals'}</h3>
      {kind && <Hint label="this checkpoint" align="end">
        {kind === 'plan'
          ? 'The client approves one specific published plan version. Replacing that file invalidates the approval, so the build always proceeds against something they actually saw.'
          : 'The client authorises the launch you describe, including the DNS changes. It records permission — it does not change DNS or deploy anything for you.'}
      </Hint>}
    </div>
    {kind && <p className="muted">{kind === 'plan' ? 'Ask your client to approve a published plan version before starting the build.' : 'Ask for permission to take the reviewed version live, including the planned DNS and traffic changes.'} Requests and responses are recorded separately from the track’s reporting status.</p>}

    <p className="approval-next" data-tone={step.tone}><StepIcon size={16} aria-hidden="true" /> {step.text}</p>

    {latest && <ApprovalCard approval={latest} />}
    {withdrawable && <ActionForm className="inline-form approval-withdraw" action={withdrawApproval.bind(null,latest.id)} confirm="Withdraw this request? Any recorded response stays in history, but will no longer authorise proceeding." success="Approval request withdrawn.">
      <button className="button secondary compact"><Undo2 size={15} aria-hidden="true" /> Withdraw request</button>
    </ActionForm>}

    {kind && <details className="approval-request-form" open={!latest || ['changes_requested','stale','withdrawn'].includes(latest.state)}><summary>{latest ? 'Request fresh approval' : 'Request approval'}</summary>
      {eligible.length ? <ActionForm action={requestApproval.bind(null,trackId)} success="Approval requested. Your client can respond in their workspace." confirm={latest ? 'Issue a new request? It replaces any earlier request and approval for this checkpoint.' : undefined}>
        <div className="field">
          <div className="field-label"><label htmlFor={'approval-item-'+trackId}>Deliverable to review</label>
            <Hint label="eligible deliverables">
              Only published, client-visible content can be requested. {kind === 'launch' ? 'A staging link must be a fixed preview URL or release reference.' : 'The request pins the version that is current right now.'}
            </Hint></div>
          <select id={'approval-item-'+trackId} name="item_id" aria-label="Deliverable to review" required defaultValue=""><option value="" disabled>Choose published content</option>{eligible.map(item => <option key={item.id} value={item.id}>{item.title}{item.type==='link' ? ' · Staging link' : ' · Current uploaded version'}</option>)}</select>
        </div>
        <div className="field">
          <div className="field-label"><label htmlFor={'approval-label-'+trackId}>Version or release label</label>
            <Hint label="the version label" align="end">
              What you and the client will call this in conversation later. It is stored on the receipt and cannot be edited afterwards.
            </Hint></div>
          <input id={'approval-label-'+trackId} name="version_label" required maxLength={120} placeholder={kind === 'launch' ? 'Launch candidate 1 · 7 September' : 'Plan v1 · 7 September'} />
        </div>
        <label className="wide">{kind === 'launch' ? 'Launch scope and DNS changes' : 'What the client is approving'}<textarea name="scope" required maxLength={3000} placeholder={kind === 'launch' ? 'Identify the staging version, domain, DNS changes and the traffic switch you will carry out.' : 'Summarise the plan and what this approval allows the build to proceed with.'} /></label>
        <p className="muted wide">{kind === 'launch' ? 'For staging links, use a fixed preview URL or release reference. If the staging site changes, request fresh approval. Approval records permission; it does not change DNS automatically.' : 'The request records the current uploaded version. Replacing it requires fresh approval.'} Any active client member can respond; the first response closes the request.</p>
        <button className="button">{kind === 'launch' ? 'Request launch permission' : 'Request plan approval'}</button>
      </ActionForm> : <p className="muted">{kind === 'plan' ? 'Upload and publish a plan document or HTML artifact first.' : 'Publish the staging link or launch document first.'}</p>}
    </details>}
    {approvals.length > 1 && <details className="approval-history"><summary>Earlier requests ({approvals.length-1})</summary>{approvals.slice(1).map(approval => <ApprovalCard key={approval.id} approval={approval} history />)}</details>}
  </section>;
}
