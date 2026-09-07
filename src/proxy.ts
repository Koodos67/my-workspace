import { NextResponse, type NextRequest } from 'next/server';

// Artifact documents send their own Content-Security-Policy so untrusted content is governed
// separately from the portal. This proxy overwrites the CSP on everything it touches, so those
// routes must pass through untouched — otherwise frame-ancestors 'none' from the portal policy
// lands on the artifact and the item page cannot frame it at all.
const SELF_POLICED = [/^\/api\/items\/[^/]+\/render$/];

export function proxy(request: NextRequest) {
  if (SELF_POLICED.some(route => route.test(request.nextUrl.pathname))) return NextResponse.next();
  const nonce = btoa(crypto.randomUUID());
  const development = process.env.NODE_ENV === 'development';
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'nonce-" + nonce + "'" + (development ? " 'unsafe-eval'" : ''),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self' https://vercel.com/api/blob https://vercel.com/api/blob/ https://blob.vercel-storage.com https://*.blob.vercel-storage.com" + (development ? ' ws: wss:' : ''),
    "frame-src 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('Referrer-Policy', 'same-origin');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
