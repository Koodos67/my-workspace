import 'server-only';
import { lookup as dnsLookup, promises as dns } from 'node:dns';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import { assertFetchableUrl, FetchGuardError, isBlockedAddress } from './address-guard';
export { assertFetchableUrl, FetchGuardError, isBlockedAddress } from './address-guard';

/**
 * Validation happens inside the connect-time lookup, and only addresses that passed are
 * handed back, so the socket cannot be pointed at a different address than the one checked.
 * That closes the DNS-rebinding window a resolve-then-fetch check would leave open.
 */
const guardedLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
    const done = callback as (error: Error | null, address?: unknown, family?: number) => void;
    if (error) return done(error);
    const safe = (addresses as { address: string; family: number }[])
      .filter(entry => !isBlockedAddress(entry.address));
    if (!safe.length) return done(new FetchGuardError('That address is not publicly routable.'));
    if ((options as { all?: boolean }).all) return done(null, safe);
    return done(null, safe[0].address, safe[0].family);
  });
};

export type FetchedDocument = { body: Buffer; contentType: string; charset: string; finalUrl: string };

function once(url: URL, timeoutMs: number, maxBytes: number) {
  return new Promise<{ redirect: string } | FetchedDocument>((resolve, reject) => {
    const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const request = send({
      protocol: url.protocol,
      hostname: url.hostname.replace(/^\[|\]$/g, ''),
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: 'GET',
      lookup: guardedLookup,
      // Identity encoding keeps the size cap honest and avoids a decompression bomb.
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'accept-encoding': 'identity',
        'user-agent': 'KoodosWorkspace/1.0 (artifact import)',
        host: url.host,
      },
    }, (response: IncomingMessage) => {
      const status = response.statusCode || 0;
      const location = response.headers.location;
      if (status >= 300 && status < 400 && location) {
        response.destroy();
        return resolve({ redirect: new URL(location, url).href });
      }
      if (status !== 200) {
        response.destroy();
        return reject(new FetchGuardError(`The page could not be fetched (HTTP ${status || 'error'}).`));
      }
      const contentType = String(response.headers['content-type'] || '');
      const type = contentType.split(';')[0].trim().toLowerCase();
      if (type && type !== 'text/html' && type !== 'application/xhtml+xml') {
        response.destroy();
        return reject(new FetchGuardError(`That URL returned ${type}, not an HTML page.`));
      }
      const declared = Number(response.headers['content-length'] || 0);
      if (declared > maxBytes) {
        response.destroy();
        return reject(new FetchGuardError('That page is larger than 25 MB.'));
      }
      const chunks: Buffer[] = [];
      let total = 0;
      response.on('data', (chunk: Buffer) => {
        total += chunk.length;
        if (total > maxBytes) {
          response.destroy();
          reject(new FetchGuardError('That page is larger than 25 MB.'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => {
        if (!total) return reject(new FetchGuardError('That page returned no content.'));
        const charset = /charset=([\w-]+)/i.exec(contentType)?.[1]?.toLowerCase() || 'utf-8';
        resolve({ body: Buffer.concat(chunks), contentType: type || 'text/html', charset, finalUrl: url.href });
      });
      response.on('error', reject);
    });
    request.setTimeout(timeoutMs, () => {
      request.destroy(new FetchGuardError('The page took too long to respond.'));
    });
    request.on('error', error => reject(
      error instanceof FetchGuardError ? error : new FetchGuardError('That page could not be reached.'),
    ));
    request.end();
  });
}

/**
 * An early resolve so a blocked host fails with a clear message rather than a socket error.
 * This is not the security boundary — guardedLookup is, because it validates at connect time.
 */
async function assertResolvesPublic(hostname: string) {
  if (isIP(hostname)) return;
  let records: { address: string }[];
  try {
    records = await dns.lookup(hostname, { all: true });
  } catch {
    throw new FetchGuardError('That address could not be resolved.');
  }
  if (!records.length || records.every(record => isBlockedAddress(record.address))) {
    throw new FetchGuardError('That address is not publicly routable.');
  }
}

/** Fetches an HTML document, re-validating the destination at every redirect hop. */
export async function fetchGuardedDocument(
  rawUrl: string,
  { maxBytes, timeoutMs = 20_000, maxRedirects = 3 }: { maxBytes: number; timeoutMs?: number; maxRedirects?: number },
): Promise<FetchedDocument> {
  let url = assertFetchableUrl(rawUrl);
  for (let hop = 0; hop <= maxRedirects; hop++) {
    await assertResolvesPublic(url.hostname.replace(/^\[|\]$/g, ''));
    const result = await once(url, timeoutMs, maxBytes);
    if (!('redirect' in result)) return result;
    url = assertFetchableUrl(result.redirect);
  }
  throw new FetchGuardError('That URL redirected too many times.');
}
