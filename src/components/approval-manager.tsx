import { ActionForm } from './action-form';
import { ApprovalCard } from './approval-card';
import { requestApproval, withdrawApproval } from '@/app/admin/approval-actions';
import { approvalTitle, type Approval, type ApprovalKind } from '@/lib/approvals';

export type ApprovalItem = {id:string;title:string;type:string;current_version_id:string|null};

export function ApprovalManager({ trackId, kind, approvals, items }: { trackId:string;kind:ApprovalKind|null;approvals:Approval[];items:ApprovalItem[] }) {
  const latest = approvals[0];
  const eligible = items.filter(item => kind === 'launch' && item.type === 'link' || item.current_version_id && item.type !== 'link');
  if (!kind && !approvals.length) return null;
  return <section className="approval-manager" aria-label="Approval checkpoint">
    <h3>{kind ? approvalTitle(kind) : 'Previous approvals'}</h3>
    {kind && <p className="muted">{kind === 'plan' ? 'Ask your client to approve a published plan version before starting the build.' : 'Ask for permission to take the reviewed version live, including the planned DNS and traffic changes.'} Requests and responses are recorded separately from the track’s reporting status.</p>}
    {latest && <><ApprovalCard approval={latest} /><ActionForm className="inline-form" action={withdrawApproval.bind(null,latest.id)} confirm="Withdraw this request? Any recorded response stays in history, but will no longer authorise proceeding." success="Approval request withdrawn.">{!['withdrawn','superseded'].includes(latest.state) && <button className="button secondary compact">Withdraw request</button>}</ActionForm></>}
    {kind && <details className="approval-request-form" open={!latest || ['changes_requested','stale','withdrawn'].includes(latest.state)}><summary>{latest ? 'Request fresh approval' : 'Request approval'}</summary>
      {eligible.length ? <ActionForm action={requestApproval.bind(null,trackId)} success="Approval requested. Your client can respond in their workspace." confirm={latest ? 'Issue a new request? It replaces any earlier request and approval for this checkpoint.' : undefined}>
        <label>Deliverable to review<select name="item_id" aria-label="Deliverable to review" required defaultValue=""><option value="" disabled>Choose published content</option>{eligible.map(item => <option key={item.id} value={item.id}>{item.title}{item.type==='link' ? ' · Staging link' : ' · Current uploaded version'}</option>)}</select></label>
        <label>Version or release label<input name="version_label" required maxLength={120} placeholder={kind === 'launch' ? 'Launch candidate 1 · 7 September' : 'Plan v1 · 7 September'} /></label>
        <label className="wide">{kind === 'launch' ? 'Launch scope and DNS changes' : 'What the client is approving'}<textarea name="scope" required maxLength={3000} placeholder={kind === 'launch' ? 'Identify the staging version, domain, DNS changes and the traffic switch you will carry out.' : 'Summarise the plan and what this approval allows the build to proceed with.'} /></label>
        <p className="muted wide">{kind === 'launch' ? 'For staging links, use a fixed preview URL or release reference. If the staging site changes, request fresh approval. Approval records permission; it does not change DNS automatically.' : 'The request records the current uploaded version. Replacing it requires fresh approval.'} Any active client member can respond; the first response closes the request.</p>
        <button className="button">{kind === 'launch' ? 'Request launch permission' : 'Request plan approval'}</button>
      </ActionForm> : <p className="muted">{kind === 'plan' ? 'Upload and publish a plan document or HTML artifact first.' : 'Publish the staging link or launch document first.'}</p>}
    </details>}
    {approvals.length > 1 && <details className="approval-history"><summary>Earlier requests ({approvals.length-1})</summary>{approvals.slice(1).map(approval => <ApprovalCard key={approval.id} approval={approval} history />)}</details>}
  </section>;
}
