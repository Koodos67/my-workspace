import { Shell } from '@/components/shell';
import { BackLink } from '@/components/back-link';
export default function ClientPreview() {
  return <Shell preview client name="Rooted Education" initials="HW">
    <BackLink href="/preview">Back to all clients</BackLink>
    <div className="heading"><div><div className="eyebrow">Rooted Education × KOODOS</div><h1>Good things take root.</h1><p className="muted">Your work, ideas, and next steps. All here, whenever you need them.</p></div></div>
    <section className="welcome"><div className="eyebrow" style={{ marginBottom: 16 }}>Start here</div><h2>A space for our work together.</h2><p>Welcome, Heather. This is where we’ll share the thinking, the plans, and the progress. Everything has a place, and there’s room for your thoughts too.</p><span className="badge green">Welcome & how this works</span></section>
    <div className="section-top"><h2>▱ Proposals</h2><span className="muted">2 items</span></div>
    <div className="cards"><article className="item-card"><span className="eyebrow">HTML document</span><h2>Being Findable — can’t wait</h2><p>The first steps towards a clearer, more discoverable presence for Rooted Education.</p><div className="meta"><span>Sample deliverable</span><span className="badge green">Updated</span></div></article><article className="item-card"><span className="eyebrow">HTML document</span><h2>Interim presence proposal</h2><p>A focused plan to give Rooted a home online while the bigger picture takes shape.</p><div className="meta"><span>Sample deliverable</span><span className="badge">Action needed</span></div></article></div>
    <div className="section-top"><h2>▱ Design</h2><span className="muted">1 item</span></div>
    <div className="cards"><article className="item-card"><span className="eyebrow">External link</span><h2>Design track comparison tool</h2><p>Explore the visual directions and find the one that feels like Rooted.</p><a className="button secondary" href="https://rooted-ashen.vercel.app" target="_blank" rel="noopener noreferrer">Open design tool ↗</a></article></div>
  </Shell>;
}
