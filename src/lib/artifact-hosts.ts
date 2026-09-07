/**
 * Hosts an artifact document may load from. Shared by the response policy that enforces it
 * and by the import preview that warns about what will not load.
 *
 * These are the CDNs Claude reaches for when it writes an HTML artifact. Allowing them means
 * artifacts are no longer self-contained: they render correctly without every copy carrying
 * its own Tailwind build and font files, at the cost of depending on those CDNs staying up.
 */
export const SCRIPT_HOSTS = [
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com',
  'https://cdn.jsdelivr.net',
  'https://unpkg.com',
  'https://esm.sh',
];

export const STYLE_HOSTS = [
  'https://fonts.googleapis.com',
  'https://cdnjs.cloudflare.com',
  'https://cdn.jsdelivr.net',
  'https://unpkg.com',
];

export const FONT_HOSTS = [
  'https://fonts.gstatic.com',
  'https://cdnjs.cloudflare.com',
  'https://cdn.jsdelivr.net',
];

export const ALLOWED_HOSTS = [...new Set([...SCRIPT_HOSTS, ...STYLE_HOSTS, ...FONT_HOSTS])];
