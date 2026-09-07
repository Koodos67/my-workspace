import { isIP } from 'node:net';

/** Thrown for anything the guard refuses. The message is safe to show an admin. */
export class FetchGuardError extends Error {}

const V4_BLOCKS: [string, number][] = [
  ['0.0.0.0', 8],          // this network
  ['10.0.0.0', 8],         // private
  ['100.64.0.0', 10],      // carrier-grade NAT
  ['127.0.0.0', 8],        // loopback
  ['169.254.0.0', 16],     // link-local, includes the 169.254.169.254 metadata address
  ['172.16.0.0', 12],      // private
  ['192.0.0.0', 24],       // IETF protocol assignments
  ['192.0.2.0', 24],       // documentation
  ['192.168.0.0', 16],     // private
  ['198.18.0.0', 15],      // benchmarking
  ['198.51.100.0', 24],    // documentation
  ['203.0.113.0', 24],     // documentation
  ['224.0.0.0', 4],        // multicast
  ['240.0.0.0', 4],        // reserved, includes 255.255.255.255
];

function v4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = value * 256 + octet;
  }
  return value;
}

function isBlockedV4(ip: string): boolean {
  const value = v4ToInt(ip);
  if (value === null) return true;
  return V4_BLOCKS.some(([block, bits]) => {
    const base = v4ToInt(block)!;
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (value & mask) >>> 0 === (base & mask) >>> 0;
  });
}

/** Expands an IPv6 literal to eight 16-bit groups, resolving :: and any trailing IPv4 part. */
function expandV6(ip: string): number[] | null {
  let text = ip.toLowerCase().split('%')[0];
  let tail: number[] = [];
  const embedded = text.lastIndexOf(':') + 1;
  if (text.slice(embedded).includes('.')) {
    const value = v4ToInt(text.slice(embedded));
    if (value === null) return null;
    tail = [(value >>> 16) & 0xffff, value & 0xffff];
    text = text.slice(0, embedded) || '::';
    if (text.endsWith(':') && !text.endsWith('::')) text = text.slice(0, -1);
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const parse = (part: string) => part ? part.split(':').filter(Boolean).map(group => {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return NaN;
    return parseInt(group, 16);
  }) : [];
  const head = parse(halves[0]);
  const rest = halves.length === 2 ? parse(halves[1]) : [];
  const groups = [...head, ...rest, ...tail];
  if (groups.some(Number.isNaN)) return null;
  if (halves.length === 2) {
    const fill = 8 - (head.length + rest.length + tail.length);
    if (fill < 0) return null;
    return [...head, ...Array(fill).fill(0), ...rest, ...tail];
  }
  return groups.length === 8 ? groups : null;
}

function isBlockedV6(ip: string): boolean {
  const groups = expandV6(ip);
  if (!groups) return true;
  const [a, b, c, d, e, f, g, h] = groups;
  if (groups.every(group => group === 0)) return true;                              // ::
  if (groups.slice(0, 7).every(group => group === 0) && h === 1) return true;       // ::1
  if ((a & 0xfe00) === 0xfc00) return true;                                         // fc00::/7 unique local
  if ((a & 0xffc0) === 0xfe80) return true;                                         // fe80::/10 link-local
  if ((a & 0xff00) === 0xff00) return true;                                         // ff00::/8 multicast
  if (a === 0x2001 && b === 0x0db8) return true;                                    // 2001:db8::/32 documentation
  // IPv4-mapped (::ffff:0:0/96), IPv4-compatible (::/96) and NAT64 (64:ff9b::/96)
  // all carry a v4 address in the last two groups; judge them as that address.
  const embedded = () => isBlockedV4([(g >>> 8) & 0xff, g & 0xff, (h >>> 8) & 0xff, h & 0xff].join('.'));
  if (a === 0 && b === 0 && c === 0 && d === 0 && e === 0 && (f === 0xffff || f === 0)) return embedded();
  if (a === 0x0064 && b === 0xff9b && c === 0 && d === 0 && e === 0 && f === 0) return embedded();
  return false;
}

/** True when an address must never be connected to from the server. Unparseable input is blocked. */
export function isBlockedAddress(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isBlockedV4(ip);
  if (version === 6) return isBlockedV6(ip);
  return true;
}


/** Rejects anything that is not a plain public http(s) URL on a standard port. */
export function assertFetchableUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new FetchGuardError('That is not a valid URL.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new FetchGuardError('Use an http or https URL.');
  if (url.username || url.password) throw new FetchGuardError('Remove the credentials from the URL.');
  if (url.port && url.port !== '80' && url.port !== '443') throw new FetchGuardError('Only the standard web ports are allowed.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host) && isBlockedAddress(host)) throw new FetchGuardError('That address is not publicly routable.');
  return url;
}

