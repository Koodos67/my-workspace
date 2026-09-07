import Link from 'next/link';
import { ArrowUpRight, CheckCheck, FileCheck2, ShieldCheck } from 'lucide-react';
import { approvalDate, approvalLabels, approvalTitle, type Approval } from '@/lib/approvals';
import { ApprovalResponse } from './approval-response';

export function ApprovalCard({ approval, canRespond = false, history = false }: { approval: Approval; canRespond?: boolean; history?: boolean }) {
  const stale = approval.state === 'stale';
  const answering = !history && approval.state === 'pending' && canRespond;
  const source = approval.source_available && (approval.version_id
    ? <Link className="approval-source" href={'/items/'+approval.item_id+'?version='+approval.version_id} target="_blank" rel="noopener noreferrer">Review the requested version <ArrowUpRight size={15} aria-hidden="true" /></Link>
    : approval.item_url && <a className="approval-source" href={approval.item_url} target="_blank" rel="noopener noreferrer">Review the staging site <ArrowUpRight size={15} aria-hidden="true" /></a>);
  return <article className="approval-card" data-state={approval.state} data-kind={approval.kind} data-answering={answering || undefined} aria-label={approvalTitle(approval.kind)+' request '+approval.request_number}>
    <div className="approval-card-heading">
      <div className="approval-heading-title">
        <span className="approval-kind-icon" data-kind={approval.kind} aria-hidden="true">{approval.kind === 'launch' ? <ShieldCheck size={18} /> : <FileCheck2 size={18} />}</span>
        <div><h3>{approvalTitle(approval.kind)}</h3><span className="approval-request-number">Request {approval.request_number} · {approvalDate(approval.requested_at)}</span></div>
      </div>
      <span className="approval-badge" data-state={approval.state}>{approvalLabels[approval.state]}</span>
    </div>

    {answering && <p className="approval-prompt">Your decision is needed. Read what is covered, open the deliverable, then answer below.</p>}

    <dl className="approval-facts">
      <div><dt>Deliverable</dt><dd>{approval.item_title}</dd></div>
      <div><dt>Version</dt><dd>{approval.version_label}</dd></div>
    </dl>
    {source}

    <div className="approval-scope"><div className="eyebrow">{approval.kind === 'launch' ? 'Launch and DNS changes covered' : 'Plan covered by this request'}</div><p>{approval.scope}</p></div>

    {/* The consent wording is the checkbox label while answering; repeating it above would ask the reader to parse the same sentence twice. */}
    {!answering && <p className="approval-authority">{approval.consent_text}</p>}

    {approval.decision && <div className="approval-receipt"><CheckCheck size={17} aria-hidden="true" /><div><strong>{approval.decision === 'approved' ? 'Approved' : 'Changes requested'} by {approval.responder_name}</strong><p>{approval.responder_email} · {approvalDate(approval.responded_at!)}</p>{approval.response_comment && <blockquote>{approval.response_comment}</blockquote>}</div></div>}
    {stale && <p className="approval-explanation">This request no longer covers the current deliverable. A fresh request is needed before proceeding; any earlier response remains in the history.</p>}
    {approval.state === 'withdrawn' && <p className="approval-explanation">KOODOS withdrew this request. It no longer authorises work to proceed.</p>}
    {approval.state === 'superseded' && <p className="approval-explanation">A newer request replaces this one.</p>}
    {approval.state === 'approved' && <p className="approval-explanation">{approval.kind === 'launch' ? 'Permission is recorded. KOODOS will carry out the agreed launch and DNS changes.' : 'This plan version is approved for the build to proceed.'}</p>}
    {approval.state === 'changes_requested' && <p className="approval-explanation">KOODOS will review your feedback and issue a fresh request when the changes are ready.</p>}
    {!history && approval.state === 'pending' && (canRespond ? <ApprovalResponse requestId={approval.id} kind={approval.kind} consent={approval.consent_text} /> : <p className="approval-explanation">Waiting for a client member to respond.</p>)}
  </article>;
}
