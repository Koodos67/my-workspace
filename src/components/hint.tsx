'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Info } from 'lucide-react';

/**
 * A short explanation attached to a control, for the things a label cannot say:
 * what a status means, what the client will see, what an approval does and does not do.
 *
 * Click toggles it, so touch works; hover reveals it for mouse users; the button carries
 * aria-describedby so assistive technology reads the text whether or not it is on screen.
 * Escape and an outside press close it, and it is a type="button" so it never submits a form.
 */
export function Hint({ label, align = 'start', children }: { label: string; align?: 'start' | 'end'; children: ReactNode }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (event: Event) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', key); };
  }, [open]);
  return <span className="hint" ref={ref} data-open={open || undefined} data-align={align}>
    <button type="button" className="hint-button" aria-expanded={open} aria-describedby={id} onClick={() => setOpen(value => !value)}>
      <Info size={14} aria-hidden="true" /><span className="sr-only">About {label}</span>
    </button>
    <span className="hint-bubble" role="tooltip" id={id}>{children}</span>
  </span>;
}
