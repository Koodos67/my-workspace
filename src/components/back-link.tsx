import Link from 'next/link';

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className="back-link">
    <span aria-hidden="true">←</span><span>{children}</span>
  </Link>;
}
