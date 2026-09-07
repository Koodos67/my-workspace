'use client';
import { useEffect, useState, useTransition } from 'react';
import { respondToApproval } from '@/app/admin/approval-actions';
import { Hint } from './hint';
import { type ApprovalKind } from '@/lib/approvals';

export function ApprovalResponse({ requestId, kind, consent }: { requestId: string; kind: ApprovalKind; consent: string }) {
  const [pending, start] = useTransition();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => setReady(true), []);
  return <form className="approval-response" onSubmit={event => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const form = new FormData(event.currentTarget, submitter);
    if (form.get('decision') === 'approved' && form.get('consent') !== 'on') {
      setError('Tick the confirmation before approving.'); return;
    }
    setError('');
    start(async () => {
      try { await respondToApproval(requestId, form); }
      catch { setError('Your response was not saved. The request may have changed or already been answered. Refresh this page and try again.'); }
    });
  }}>
    <fieldset disabled={!ready || pending}>
      <div className="approval-response-head">
        <span className="eyebrow">Your response</span>
        <Hint label="responding" align="end">
          Whichever you choose is recorded once, against your name and the exact version above,
          and closes this request. If anyone else on your team answers first, theirs is the one
          that counts. KOODOS can ask again later.
        </Hint>
      </div>
      <label className="approval-comment">Comment <span className="muted">(optional)</span><textarea name="comment" maxLength={3000} placeholder="Anything you would like us to know?" /></label>
      <label className="approval-consent"><input name="consent" type="checkbox" /> <span>{consent}</span></label>
      <div className="approval-buttons">
        <button className="button" name="decision" value="approved">{kind === 'plan' ? 'Approve plan' : 'Authorise launch'}</button>
        <button className="button secondary" name="decision" value="changes_requested">Request changes</button>
      </div>
      <p className="approval-buttons-note muted">Approving needs the confirmation ticked. Requesting changes does not — tell us what to fix in the comment and we will come back with a fresh version.</p>
    </fieldset>
    {pending && <p role="status" className="muted">Recording your response…</p>}
    {error && <p role="alert" className="form-error">{error}</p>}
  </form>;
}
