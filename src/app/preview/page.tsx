import Link from 'next/link';
import { Shell } from '@/components/shell';
export default function Preview() {
  return <Shell preview name="Mark Thurman" initials="MT">
    <div className="heading"><div><div className="eyebrow">A home for the work</div><h1>Your clients, together.</h1><p className="muted">A clear view of the people and projects you’re looking after.</p></div><Link className="button secondary" href="/preview/rooted-education">Explore client view ↗</Link></div>
    <div className="stats"><div className="stat"><span className="muted">Active clients</span><strong>1</strong></div><div className="stat"><span className="muted">Shared items</span><strong>4</strong></div><div className="stat"><span className="muted">Awaiting acknowledgement</span><strong>1</strong></div></div>
    <div className="section-top"><h2>Client directory <span className="muted"> / 01</span></h2><span className="muted">Sample workspace</span></div>
    <Link href="/preview/rooted-education" className="client-row"><div className="client-icon">r.</div><div><h2>Rooted Education</h2><p>4 items · 2 folders · Heather Weaver</p></div><span className="badge">1 action needed</span><span aria-hidden="true">↗</span></Link>
    <div className="note"><span aria-hidden="true">✳</span><div><strong>Space for what comes next.</strong><p>Reports, proposals, and the useful things in between. Give every client a considered home for your work together.</p></div></div>
  </Shell>;
}
