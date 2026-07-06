import { describe, expect, it } from 'vitest';

import { buildPairUrl, type PairingSession, parsePairUrl } from './pairUrl';

const session = (over: Partial<PairingSession> = {}): PairingSession => ({
  channel_id: 'chan-abc123',
  pairing_token: 'tok_secret_value',
  core_pubkey: 'BASE64URLPUBKEY-_xyz',
  rpc_url: 'http://192.168.1.20:8421/rpc',
  expires_at: '2026-06-16T20:00:00.000Z',
  ...over,
});

describe('pairUrl codec', () => {
  it('round-trips a full session: desktop build → phone parse', () => {
    const s = session();
    const payload = parsePairUrl(buildPairUrl(s));
    expect(payload).not.toBeNull();
    expect(payload).toEqual({
      channelId: s.channel_id,
      pairingToken: s.pairing_token,
      corePubkey: s.core_pubkey,
      rpcUrl: s.rpc_url ?? undefined,
      // 2026-06-16T20:00:00Z → unix seconds
      expiresAt: Math.floor(new Date(s.expires_at).getTime() / 1000),
    });
  });

  it('converts ISO expires_at to compact unix seconds in the URL', () => {
    const url = buildPairUrl(session({ expires_at: '2026-06-16T20:00:00.000Z' }));
    const exp = new URL(url.replace('openhuman://', 'https://x/')).searchParams.get('exp');
    expect(exp).toBe(String(Math.floor(Date.parse('2026-06-16T20:00:00.000Z') / 1000)));
  });

  it('omits rpc when the desktop has no rpc_url, and round-trips to undefined', () => {
    const url = buildPairUrl(session({ rpc_url: null }));
    expect(url).not.toContain('rpc=');
    expect(parsePairUrl(url)?.rpcUrl).toBeUndefined();
  });

  it('preserves tokens with URL-special characters through encode/decode', () => {
    const s = session({ pairing_token: 'a+b/c=d&e?f', core_pubkey: 'p k+/=' });
    const payload = parsePairUrl(buildPairUrl(s));
    expect(payload?.pairingToken).toBe('a+b/c=d&e?f');
    expect(payload?.corePubkey).toBe('p k+/=');
  });

  it('accepts a plain https:// fallback form', () => {
    const payload = parsePairUrl('https://openhuman.app/pair?cid=c1&pt=t1&cpk=k1&exp=1900000000');
    expect(payload).toEqual({
      channelId: 'c1',
      pairingToken: 't1',
      corePubkey: 'k1',
      rpcUrl: undefined,
      expiresAt: 1900000000,
    });
  });

  it.each([
    ['missing cid', 'openhuman://pair?pt=t&cpk=k&exp=1900000000'],
    ['missing pt', 'openhuman://pair?cid=c&cpk=k&exp=1900000000'],
    ['missing cpk', 'openhuman://pair?cid=c&pt=t&exp=1900000000'],
    ['missing exp', 'openhuman://pair?cid=c&pt=t&cpk=k'],
    ['non-numeric exp', 'openhuman://pair?cid=c&pt=t&cpk=k&exp=soon'],
    ['not a url', 'just some scanned text'],
    ['empty', ''],
  ])('rejects invalid input (%s) with null', (_label, raw) => {
    expect(parsePairUrl(raw)).toBeNull();
  });
});
