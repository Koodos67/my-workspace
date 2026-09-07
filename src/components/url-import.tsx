'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CircleAlert, Download, Globe, Trash2 } from 'lucide-react';
import { discardImport, finishUpload, importFromUrl, type ImportPreview } from '@/app/admin/content-actions';
import { toSandboxDocument } from '@/lib/artifact-html';

type Staged = Extract<ImportPreview, { ok: true }>;

export function UrlImport({ clientId, folders = [], itemId, folderId = '', nonce }: {
  clientId: string; folders?: { id: string; name: string }[]; itemId?: string; folderId?: string; nonce: string;
}) {
  const [url, setUrl] = useState('');
  const [folder, setFolder] = useState(folderId);
  const [busy, setBusy] = useState<'' | 'fetching' | 'saving' | 'discarding'>('');
  const [staged, setStaged] = useState<Staged | null>(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const router = useRouter();

  const document_ = useMemo(() => staged ? toSandboxDocument(staged.html, nonce) : '', [staged, nonce]);

  // What the sandbox will and will not honour, so the admin sees the caveats before saving.
  // Anything not already inline is external once stored: the document ends up on an opaque
  // origin with no base URL, so a relative path is just as unreachable as an absolute one.
  const analysis = useMemo(() => {
    if (!staged) return null;
    const doc = new DOMParser().parseFromString(staged.html, 'text/html');
    const count = (selector: string, attribute: string) => Array.from(doc.querySelectorAll(selector))
      .filter(element => {
        const value = (element.getAttribute(attribute) || '').trim();
        return value !== '' && !value.startsWith('data:') && !value.startsWith('blob:') && !value.startsWith('#');
      }).length;
    return {
      scripts: count('script[src]', 'src') + count('link[rel~="modulepreload"]', 'href'),
      styles: count('link[rel~="stylesheet"]', 'href'),
      media: count('img[src]', 'src') + count('link[rel~="preload"][as="font"]', 'href'),
      text: (doc.body?.textContent || '').trim().length,
    };
  }, [staged]);

  async function preview(event: React.FormEvent) {
    event.preventDefault();
    if (!url.trim() || busy) return;
    setBusy('fetching'); setError(''); setDone('');
    try {
      const form = new FormData();
      form.set('url', url.trim());
      form.set('folderId', folder);
      form.set('itemId', itemId || '');
      const result = await importFromUrl(clientId, form);
      if (result.ok) setStaged(result); else setError(result.error);
    } catch {
      setError('The import failed. Please retry.');
    } finally {
      setBusy('');
    }
  }

  async function save() {
    if (!staged || busy) return;
    setBusy('saving'); setError('');
    try {
      await finishUpload(staged.receipt);
      setDone(itemId ? 'New version saved from the URL.' : `“${staged.title}” saved as a draft. Publish it when ready.`);
      setStaged(null); setUrl('');
      router.refresh();
    } catch {
      setError('The page was fetched but could not be saved. Refresh and check the item before retrying.');
    } finally {
      setBusy('');
    }
  }

  async function discard() {
    if (!staged || busy) return;
    setBusy('discarding');
    try { await discardImport(staged.receipt); } catch { /* the staged file expires on its own */ }
    setStaged(null); setError(''); setBusy('');
  }

  return <div className="url-import">
    <form className="url-import-form" onSubmit={preview}>
      <label className="url-import-field">
        <span><Globe size={15} strokeWidth={1.75} aria-hidden="true" /> {itemId ? 'Replace from a URL' : 'Artifact URL'}</span>
        <input type="url" value={url} onChange={event => setUrl(event.target.value)} disabled={!!busy}
          placeholder="https://…" maxLength={2048} required />
      </label>
      {!itemId && folders.length > 0 && <label className="url-import-field">
        <span>Import into</span>
        <select value={folder} onChange={event => setFolder(event.target.value)} disabled={!!busy}>
          <option value="">Workspace root</option>
          {folders.map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
        </select>
      </label>}
      <button className="button" disabled={!!busy}>
        <Download size={16} aria-hidden="true" /> {busy === 'fetching' ? 'Fetching…' : 'Fetch and preview'}
      </button>
    </form>
    <p className="muted url-import-hint">
      Public http and https pages only, up to 25 MB. The page is fetched by the server and stored privately,
      exactly like an upload. Nothing is saved until you confirm the preview.
    </p>

    {error && <p className="form-error" role="alert">{error}</p>}
    {done && <p className="notice" role="status">{done}</p>}

    {staged && <div className="import-preview">
      <div className="import-preview-head">
        <div>
          <span className="eyebrow">Preview · nothing saved yet</span>
          <strong>{staged.title}</strong>
          <p className="muted">{staged.finalUrl}{staged.finalUrl !== staged.sourceUrl ? ' (after redirect)' : ''} · {(staged.bytes / 1024).toFixed(1)} KB</p>
        </div>
        <div className="import-preview-actions">
          <button type="button" className="button" onClick={save} disabled={!!busy}>
            {busy === 'saving' ? 'Saving…' : itemId ? 'Save as new version' : 'Save as draft'}
          </button>
          <button type="button" className="button secondary" onClick={discard} disabled={!!busy}>
            <Trash2 size={15} aria-hidden="true" /> Discard
          </button>
        </div>
      </div>

      {analysis && analysis.scripts > 0 && <p className="notice stop" role="status">
        <CircleAlert size={16} aria-hidden="true" /> <span>
          <strong>This page will not work as an artifact.</strong> It loads its code from {analysis.scripts} separate
          {analysis.scripts === 1 ? ' file' : ' files'}, and an artifact is a single stored document — those files
          cannot come with it, so the page has nothing to run. This is what a share link for an app-rendered page
          looks like. Export or download the artifact as a <strong>self-contained HTML file</strong> and upload that
          instead.
        </span>
      </p>}
      {analysis && analysis.scripts === 0 && analysis.text < 40 && <p className="notice warn" role="status">
        <CircleAlert size={16} aria-hidden="true" /> <span>This page has almost no text of its own, so it may appear
        blank to the client. Check the preview below before saving.</span>
      </p>}
      {analysis && (analysis.styles > 0 || analysis.media > 0) && <p className="notice warn" role="status">
        <CircleAlert size={16} aria-hidden="true" /> <span>
          {analysis.styles > 0 && `${analysis.styles} stylesheet${analysis.styles === 1 ? '' : 's'}`}
          {analysis.styles > 0 && analysis.media > 0 && ' and '}
          {analysis.media > 0 && `${analysis.media} image or font file${analysis.media === 1 ? '' : 's'}`}
          {' '}will not load in the sandbox, so the styling may differ from the original page.
        </span>
      </p>}

      <p className="muted">This is the client&apos;s view, in the same sandbox they get:</p>
      <iframe className="artifact-frame" title={'Preview of ' + staged.title} srcDoc={document_}
        sandbox="allow-scripts" referrerPolicy="no-referrer" />
    </div>}
  </div>;
}
