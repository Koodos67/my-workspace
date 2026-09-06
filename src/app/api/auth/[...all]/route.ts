import { getAuth } from '@/lib/auth-config';
import { isConfigured } from '@/lib/config';
async function handle(request: Request) {
  if (!isConfigured()) return Response.json({ error: 'Sign-in is not configured.' }, { status: 503 });
  return getAuth().handler(request);
}
export const GET = handle;
export const POST = handle;
