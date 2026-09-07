'use client';
import { useState, useTransition, type ReactNode } from 'react';
export function ActionForm({ action, children, className = 'form-grid', success = 'Saved.', confirm }: { action: (form: FormData) => Promise<void>; children: ReactNode; className?: string; success?: string; confirm?: string }) {
  const [message,setMessage] = useState('');
  const [error,setError] = useState(false);
  const [pending,startTransition] = useTransition();
  return <form action={action} className={className} onSubmit={event=>{
    event.preventDefault();
    if (confirm && !window.confirm(confirm)) return;
    const form = new FormData(event.currentTarget);
    setMessage('');
    startTransition(async()=>{try {await action(form);setError(false);setMessage(success);} catch {setError(true);setMessage('Could not save. Check the fields and try again.');}});
  }}><fieldset disabled={pending} className="form-fields">{children}</fieldset>{pending && <p role="status">Saving…</p>}{!pending && message && <p className={error?'form-error':'muted'} role={error?'alert':'status'}>{message}</p>}</form>;
}
