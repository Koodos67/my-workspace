import Link from 'next/link';
import { BrandLogo } from '@/components/brand-logo';
import { isConfigured } from '@/lib/config';
import { requestMagicLink } from './actions';
export default async function Login({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const configured = isConfigured();
  return <main id="main" className="login"><Link className="wordmark" href="/" aria-label="Koodos home"><BrandLogo /></Link><h1>Welcome back.</h1><p className="muted">A home for the work we make together. Sign in with your invited email address.</p>
    {!configured || params.setup ? <div className="notice">Sign-in will be available once this workspace is configured. <Link href="/preview" style={{ textDecoration: 'underline' }}>Explore the design preview</Link>.</div> : params.sent ? <div className="notice" role="status">Check your inbox. If your address has been invited, you’ll receive a sign-in link.</div> : <form action={requestMagicLink}><label htmlFor="email">Email address</label><input id="email" name="email" type="email" autoComplete="email" placeholder="you@company.com" maxLength={254} required /><button className="button" type="submit">Send me a sign-in link →</button></form>}
    {params.limited && <p role="alert">Please wait a minute before requesting another link.</p>}{params.unavailable && <p role="alert">Sign-in is temporarily unavailable. Please try again.</p>}{params.invalid && <p role="alert">Enter a valid email address.</p>}{params.error && <p role="alert">That link has expired or could not be verified. Please request a new one.</p>}
    <p className="muted" style={{ fontSize: 12, marginTop: 28 }}>No passwords. Just a secure link to your workspace.</p></main>;
}
