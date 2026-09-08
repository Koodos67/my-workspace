import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { PoolClient } from 'pg';

export const MAX_UPLOAD = 25 * 1024 * 1024;
export function textField(form: FormData, key: string, max = 120, optional = false) {
  const value = String(form.get(key) || '').trim();
  if ((!optional && !value) || value.length > max) throw new Error(`Check ${key} (maximum ${max} characters).`);
  return value;
}
export function webUrl(value: string) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Use an http or https URL without credentials.');
  return url.href;
}
export async function activeClient(db: PoolClient, clientId: string, folderId?: string | null) {
  const result = await db.query("SELECT id FROM clients WHERE id=$1 AND status='active' FOR UPDATE", [clientId]);
  if (!result.rowCount) throw new Error('This workspace is archived or unavailable.');
  if (folderId && !(await db.query('SELECT id FROM folders WHERE id=$1 AND client_id=$2 AND archived_at IS NULL', [folderId, clientId])).rowCount) throw new Error('Choose an active folder in this workspace.');
}
export type UploadTicket = { actor: string; clientId: string; projectId: string; folderId: string | null; itemId: string; versionId: string; pathname: string; title: string; type: 'artifact' | 'file'; mime: string; note: string; replacement: boolean; expires: number };
function signature(payload: string) { return createHmac('sha256', process.env.BETTER_AUTH_SECRET!).update(payload).digest('base64url'); }
export function signUpload(ticket: UploadTicket) {
  const payload = Buffer.from(JSON.stringify(ticket)).toString('base64url');
  return payload + '.' + signature(payload);
}
export function verifyUpload(value: string): UploadTicket {
  const [payload, mac] = value.split('.');
  if (!payload || !mac || mac.length !== signature(payload).length || !timingSafeEqual(Buffer.from(mac), Buffer.from(signature(payload)))) throw new Error('Invalid upload receipt.');
  const ticket = JSON.parse(Buffer.from(payload, 'base64url').toString()) as UploadTicket;
  if (ticket.expires < Date.now()) throw new Error('Upload expired. Please select the file again.');
  return ticket;
}
