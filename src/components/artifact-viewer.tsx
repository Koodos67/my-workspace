/**
 * The artifact loads from its own route rather than being injected through srcdoc, so it
 * carries its own Content-Security-Policy instead of inheriting the portal's. The sandbox
 * attribute withholds allow-same-origin and the response repeats `sandbox allow-scripts` in
 * CSP, so the document sits on an opaque origin whether it is framed here or opened directly.
 */
export function ArtifactViewer({ itemId, versionId, title }: { itemId: string; versionId: string; title: string }) {
  return <iframe
    className="artifact-frame"
    title={title}
    src={`/api/items/${itemId}/render?version=${versionId}`}
    sandbox="allow-scripts"
    referrerPolicy="no-referrer"
  />;
}
