'use client';
export default function ErrorPage({ reset }: { reset: () => void }) { return <main id="main" className="login"><h1>A small interruption.</h1><p className="muted">We couldn’t load this page. Please try again.</p><button className="button" onClick={reset}>Try again</button></main>; }
