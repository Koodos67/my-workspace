'use client';
import { useEffect, useRef, useState, useTransition } from 'react';

/**
 * The one place a plain ActionForm will not do: after posting, the box must empty. An
 * uncontrolled textarea keeps its value through the server re-render, so a posted comment would
 * sit there looking unsent.
 */
export function CommentComposer({ action, placeholder, label, submit }: {
  action: (form: FormData) => Promise<void>; placeholder: string; label: string; submit: string;
}) {
  const form = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  // Until React has hydrated, a submit is a native GET and the comment is silently lost to the
  // query string. The board and the approval response guard the same way.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return <form ref={form} className="comment-composer" onSubmit={event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (!String(data.get('body') || '').trim()) { setError('Write something first.'); return; }
    setError('');
    start(async () => {
      try { await action(data); form.current?.reset(); }
      catch { setError('Your comment was not saved. The item may have changed. Refresh and try again.'); }
    });
  }}>
    <fieldset disabled={!ready || pending}>
      <label htmlFor="comment-body">{label}</label>
      <textarea id="comment-body" name="body" required maxLength={10000} placeholder={placeholder} rows={3} />
      <div className="comment-composer-foot">
        <button className="button">{pending ? 'Posting…' : submit}</button>
        <span className="muted">Everyone with access to this workspace can see it.</span>
      </div>
    </fieldset>
    {error && <p role="alert" className="form-error">{error}</p>}
  </form>;
}
