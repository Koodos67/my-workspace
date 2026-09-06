'use server';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAuth } from '@/lib/auth-config';
import { isConfigured } from '@/lib/config';
export async function requestMagicLink(form: FormData) {
  if (!isConfigured()) redirect('/login?setup=1');
  const email = String(form.get('email') || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) redirect('/login?invalid=1');
  const requestHeaders = new Headers(await headers());
  requestHeaders.set('content-type', 'application/json');
  requestHeaders.set('origin', process.env.BETTER_AUTH_URL!);
  // Use the HTTP handler so Better Auth's database rate limit also covers Server Actions.
  const response = await getAuth().handler(new Request(process.env.BETTER_AUTH_URL! + '/api/auth/sign-in/magic-link', {
    method: 'POST',
    headers: requestHeaders,
    body: JSON.stringify({ email, callbackURL: '/workspaces', errorCallbackURL: '/login?error=1' }),
  }));
  if (response.status === 429) redirect('/login?limited=1');
  if (!response.ok) redirect('/login?unavailable=1');
  redirect('/login?sent=1');
}
export async function signOut() {
  await getAuth().api.signOut({ headers: await headers() });
  redirect('/login');
}
