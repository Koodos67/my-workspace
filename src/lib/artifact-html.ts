/**
 * Prepares uploaded or imported HTML for the sandboxed iframe. Browser only — it uses DOMParser.
 *
 * The frame is rendered with sandbox="allow-scripts" and no allow-same-origin, so the document
 * already sits on an opaque origin. This adds the second layer: external scripts are dropped,
 * inline scripts are nonced, navigation hooks are stripped, and a default-src 'none' policy is
 * injected. A srcdoc document inherits the embedder's CSP, which is why the nonce must be the
 * host page's nonce rather than a fresh one — a new nonce would stop inline scripts running.
 */
export function toSandboxDocument(html: string, nonce: string) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const activeNonce = document.querySelector<HTMLScriptElement>('script[nonce]')?.nonce || nonce;
  doc.querySelectorAll('script').forEach(script => {
    if (script.src) script.remove();
    else script.setAttribute('nonce', activeNonce);
  });
  doc.querySelectorAll('base,meta[http-equiv="refresh"]').forEach(element => element.remove());
  const policy = doc.createElement('meta');
  policy.httpEquiv = 'Content-Security-Policy';
  policy.content = `default-src 'none'; script-src 'nonce-${activeNonce}'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-src 'none'; object-src 'none'`;
  doc.head.prepend(policy);
  return '<!doctype html>' + doc.documentElement.outerHTML;
}
