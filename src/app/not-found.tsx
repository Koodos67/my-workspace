import Link from 'next/link';
import { BrandLogo } from '@/components/brand-logo';
export default function NotFound() { return <main id="main" className="login"><div className="wordmark"><BrandLogo /></div><h1>Nothing here.</h1><p className="muted">This page isn’t available in your workspace.</p><Link className="button" href="/workspaces">Back to your workspace</Link></main>; }
