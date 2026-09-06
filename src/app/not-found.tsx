import Link from 'next/link';
export default function NotFound() { return <main id="main" className="login"><div className="wordmark">koodos<span>®</span></div><h1>Nothing here.</h1><p className="muted">This page isn’t available in your workspace.</p><Link className="button" href="/workspaces">Back to your workspace</Link></main>; }
