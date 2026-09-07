import Link from 'next/link';
import { CheckCheck, FileCheck2, ShieldCheck } from 'lucide-react';
import { approvalDate, approvalLabels, approvalTitle, type Approval } from '@/lib/approvals';
import { ApprovalResponse } from './approval-response';

export function ApprovalCard({ approval, canRespond = false, history = false }: { approval: Approval; canRespond?: boolean; history?: boolean }) {
  const stale = approval.state === 'stale';
  return <article className="approval-card" data-state={approval.state} aria-label={approvalTitle(approval.kind)+' request '+approval.request_number}>
    <div className="approval-card-heading"><div className="approval-heading-title">{approval.kind === 'launch' ? <ShieldCheck size={19} aria-hidden="true" /> : <FileCheck2 size={19} aria-hidden="true" />}<h3>{approvalTitle(approval.kind)}</h3></div><span className="approval-badge" data-state={approval.state}>{approvalLabels[approval.state]}</span></div>
    <p className="approval-version"><strong>{approval.item_title}</strong><span>{approval.version_label} · Request {approval.request_number}</span></p>
    {approval.source_available && (approval.version_id
      ? <Link className="approval-source" href={'/items/'+approval.item_id+'?version='+approval.version_id} target="_blank" rel="noopener noreferrer">Review the requested version ↗</Link>
      : approval.item_url && <a className="approval-source" href={approval.item_url} target="_blank" rel="noopener noreferrer">Review the staging site ↗</a>)}
    <div className="approval-scope"><div className="eyebrow">{approval.kind === 'launch' ? 'Launch and DNS changes covered' : 'Plan covered by this request'}</div><p>{approval.scope}</p></div>
    <p className="approval-authority">{approval.consent_text}</p>
    <p className="track-meta">Requested {approvalDate(approval.requested_at)}</p>
    {approval.decision && <div className="approval-receipt"><CheckCheck size={17} aria-hidden="true" /><div><strong>{approval.decision === 'approved' ? 'Approved' : 'Changes requested'} by {approval.responder_name}</strong><p>{approval.responder_email} · {approvalDate(approval.responded_at!)}</p>{approval.response_comment && <blockquote>{approval.response_comment}</blockquote>}</div></div>}
    {stale && <p className="approval-explanation">This request no longer covers the current deliverable. A fresh request is needed before proceeding; any earlier response remains in the history.</p>}
    {approval.state === 'withdrawn' && <p className="approval-explanation">KOODOS withdrew this request. It no longer authorises work to proceed.</p>}
    {approval.state === 'superseded' && <p className="approval-explanation">A newer request replaces this one.</p>}
    {approval.state === 'approved' && <p className="approval-explanation">{approval.kind === 'launch' ? 'Permission is recorded. KOODOS will carry out the agreed launch and DNS changes.' : 'This plan version is approved for the build to proceed.'}</p>}
    {approval.state === 'changes_requested' && <p className="approval-explanation">KOODOS will review your feedback and issue a fresh request when the changes are ready.</p>}
    {!history && approval.state === 'pending' && (canRespond ? <ApprovalResponse requestId={approval.id} kind={approval.kind} consent={approval.consent_text} /> : <p className="muted">Waiting for a client member to respond.</p>)}
  </article>;
}
