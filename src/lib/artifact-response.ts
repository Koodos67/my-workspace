import 'server-only';
import { issueSignedToken, presignUrl } from '@vercel/blob';
import { FONT_HOSTS, SCRIPT_HOSTS, STYLE_HOSTS } from './artifact-hosts';

/**
 * The policy an artifact document is served under. Because it arrives as a real response
 * rather than through srcdoc, it carries its own CSP instead of inheriting the portal's —
 * so allowing artifacts to use CDNs does not weaken the portal itself.
 *
 * `sandbox allow-scripts` (with no allow-same-origin) is the load-bearing directive. It puts
 * the document on an opaque origin however it is reached, so even opening this URL directly
 * in a tab cannot touch the session cookie or portal storage. Keep it.
 *
 * `connect-src 'none'` stays: an artifact renders, it does not call home.
 */
export const ARTIFACT_CSP = [
  "default-src 'none'",
  'sandbox allow-scripts',
  `script-src 'unsafe-inline' ${SCRIPT_HOSTS.join(' ')}`,
  `style-src 'unsafe-inline' ${STYLE_HOSTS.join(' ')}`,
  `font-src data: ${FONT_HOSTS.join(' ')}`,
  'img-src data: blob: https:',
  'media-src data: blob: https:',
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "frame-ancestors 'self'",
].join('; ');

export const ARTIFACT_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Content-Security-Policy': ARTIFACT_CSP,
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};

/** Opens a private Blob object for reading through a short-lived presigned URL. */
export async function readStoredFile(storagePath: string) {
  const validUntil = Date.now() + 60_000;
  const token = await issueSignedToken({ pathname: storagePath, operations: ['get'], validUntil });
  const { presignedUrl } = await presignUrl(token, { operation: 'get', pathname: storagePath, access: 'private', validUntil });
  const response = await fetch(presignedUrl, { cache: 'no-store' });
  return response.ok && response.body ? response : null;
}
