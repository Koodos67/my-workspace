'use client';

import { useId, useState } from 'react';

export function PublicationControls({ published }: { published: boolean }) {
  const [share, setShare] = useState(published);
  const hintId = useId();

  return <div className={'publication-panel wide' + (share ? ' is-shared' : '')}>
    <div className="publication-copy">
      <span className="eyebrow">Client visibility</span>
      <label className="publication-choice">
        <input name="published" type="checkbox" checked={share}
          onChange={event => setShare(event.target.checked)} aria-describedby={hintId} />
        <span>Share with client</span>
      </label>
      <p id={hintId}>{share
        ? 'After saving, this item will be visible in the client workspace.'
        : 'After saving, this item will be a draft. Only admins can see it.'}</p>
    </div>
    <button className="button publication-save" type="submit">
      {share ? (published ? 'Save changes' : 'Save & publish') : (published ? 'Save & unpublish' : 'Save draft')}
    </button>
  </div>;
}
