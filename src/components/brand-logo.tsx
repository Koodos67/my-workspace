import Image from 'next/image';

export function BrandLogo({ variant = 'black' }: { variant?: 'black' | 'teal' | 'light' }) {
  return <Image
    className="brand-logo"
    src={`/brand/koodos-logo-${variant}.svg`}
    alt="Koodos"
    width={922}
    height={294}
    preload
  />;
}
