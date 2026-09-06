import Link from 'next/link';
import { signOut } from '@/app/login/actions';
export function Shell({ children, preview = false, client = false, name = 'Your workspace', initials = 'K', signedIn = false }: { children: React.ReactNode; preview?: boolean; client?: boolean; name?: string; initials?: string; signedIn?: boolean }) {
  return <>
    {preview && <div className="preview-banner">Design preview · Sample content / <Link href="/login">Go to sign in</Link></div>}
    <div className="shell">
      <aside className="sidebar">
        <div><Link href="/" className="wordmark" aria-label="Koodos home">koodos<span>®</span></Link><p className="eyebrow" style={{ marginTop: 12 }}>Client workspace</p></div>
        <nav className="nav" aria-label="Main navigation">
          <Link className={!client ? 'active' : ''} href={preview ? '/preview' : '/workspaces'}>▦ <span>{client ? 'Workspaces' : 'Clients'}</span></Link>
          {preview && <Link className={client ? 'active' : ''} href="/preview/rooted-education">↗ <span>Client view</span></Link>}
        </nav>
        <div className="sidebar-bottom">Good work.<br />All in one place.<br /><br />{signedIn ? <form action={signOut}><button className="button secondary">Sign out</button></form> : 'Made with care by KOODOS'}</div>
      </aside>
      <div className="workspace">
        <header className="topbar"><div>{client ? name : 'Studio workspace'} <small> / {client ? 'Overview' : 'Client directory'}</small></div><div className="avatar" aria-label={name}>{initials}</div></header>
        <main id="main" className="content">{children}<footer className="footer"><span>A little more together.</span><span>KOODOS · Client workspace</span></footer></main>
      </div>
    </div>
  </>;
}
