import { test, expect } from '@playwright/test';
import { assertFetchableUrl, isBlockedAddress, FetchGuardError } from '../src/lib/address-guard';

// The URL import fetches an admin-supplied address from the server, so this is the SSRF boundary.
// These run without a browser; they are pure predicates.

test('blocks every address range that is not publicly routable', () => {
  for (const address of [
    '127.0.0.1', '127.9.9.9',                       // loopback
    '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1',  // private
    '169.254.169.254',                              // link-local, the cloud metadata address
    '100.64.0.1',                                   // carrier-grade NAT
    '0.0.0.0', '192.0.2.5', '198.18.0.1', '224.0.0.1', '240.0.0.1', '255.255.255.255',
    '::1', '::', 'fe80::1', 'fc00::1', 'fd00::abcd', 'ff02::1',
    '::ffff:10.0.0.1', '::ffff:127.0.0.1',          // IPv4-mapped
    '64:ff9b::7f00:1',                              // NAT64 wrapping loopback
    '2001:db8::1',                                  // documentation
    'not-an-ip', '', '999.1.1.1',                   // unparseable input must never be allowed
  ]) {
    expect(isBlockedAddress(address), address).toBe(true);
  }
});

test('allows ordinary public addresses', () => {
  for (const address of ['8.8.8.8', '93.184.216.34', '1.1.1.1', '172.32.0.1', '2606:2800:220:1:248:1893:25c8:1946']) {
    expect(isBlockedAddress(address), address).toBe(false);
  }
});

test('refuses URLs that are not plain public web addresses', () => {
  const cases: [string, string][] = [
    ['ftp://example.com/', 'Use an http or https URL.'],
    ['file:///etc/passwd', 'Use an http or https URL.'],
    ['https://admin:secret@example.com/', 'Remove the credentials from the URL.'],
    ['http://example.com:8080/', 'Only the standard web ports are allowed.'],
    ['http://example.com:22/', 'Only the standard web ports are allowed.'],
    ['http://127.0.0.1/', 'That address is not publicly routable.'],
    ['http://169.254.169.254/latest/meta-data/', 'That address is not publicly routable.'],
    ['http://[::1]/', 'That address is not publicly routable.'],
    ['http://[::ffff:127.0.0.1]/', 'That address is not publicly routable.'],
    ['http://10.0.0.5/', 'That address is not publicly routable.'],
    ['not a url', 'That is not a valid URL.'],
  ];
  for (const [url, message] of cases) {
    let thrown: unknown;
    try { assertFetchableUrl(url); } catch (error) { thrown = error; }
    expect(thrown, url).toBeInstanceOf(FetchGuardError);
    expect((thrown as Error).message, url).toBe(message);
  }
});

test('allows a normal public page URL on a default port', () => {
  expect(assertFetchableUrl('https://example.com/report.html').href).toBe('https://example.com/report.html');
  expect(assertFetchableUrl('http://example.com:80/a?b=c').href).toBe('http://example.com/a?b=c');
});
