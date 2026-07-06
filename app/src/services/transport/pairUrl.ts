/**
 * pairUrl — the single source of truth for the QR pairing payload codec.
 *
 * The desktop (PairPhoneModal) BUILDS an `openhuman://pair?...` URL and encodes
 * it as a QR code; the phone (PairScreen) scans and PARSES it. Keeping both
 * halves in one module guarantees the two sides can never drift out of sync —
 * the round-trip is pinned by `pairUrl.test.ts`.
 *
 * URL shape:
 *   openhuman://pair?cid=<channel>&pt=<token>&cpk=<corePubkey>
 *                   &rpc=<optional rpc url>&exp=<unix seconds>
 *
 * `cid/pt/cpk/exp` are required; `rpc` is optional (LAN direct-connect hint).
 */
import debug from 'debug';

import type { PairPayload } from './connectFromPairPayload';

const log = debug('mobile:pair-url');
const logErr = debug('mobile:pair-url:error');

/** Desktop-side pairing session as returned by `openhuman.devices_create_pairing`. */
export interface PairingSession {
  channel_id: string;
  pairing_token: string;
  core_pubkey: string;
  rpc_url: string | null;
  /** ISO 8601 timestamp. */
  expires_at: string;
}

/** The `openhuman://` deep-link scheme + host used for pairing QR codes. */
export const PAIR_URL_PREFIX = 'openhuman://pair';

/**
 * Build the QR URL the desktop encodes for the phone to scan.
 * `expires_at` (ISO) is converted to a compact unix-seconds `exp` field.
 */
export function buildPairUrl(session: PairingSession): string {
  const params = new URLSearchParams();
  params.set('cid', session.channel_id);
  params.set('pt', session.pairing_token);
  params.set('cpk', session.core_pubkey);
  if (session.rpc_url) params.set('rpc', session.rpc_url);
  const expUnix = Math.floor(new Date(session.expires_at).getTime() / 1_000);
  params.set('exp', String(expUnix));
  return `${PAIR_URL_PREFIX}?${params.toString()}`;
}

/**
 * Parse a scanned QR string into a {@link PairPayload}, or `null` if the
 * content is malformed or missing required fields. Accepts both the
 * `openhuman://` deep-link and a plain `https://` fallback.
 */
export function parsePairUrl(raw: string): PairPayload | null {
  log('parsing pair URL len=%d', raw.length);
  try {
    // Normalise openhuman:// → https:// so the URL() parser accepts it.
    const normalised = raw.startsWith('openhuman://')
      ? raw.replace('openhuman://', 'https://openhuman.app/')
      : raw;
    const url = new URL(normalised);
    const p = url.searchParams;

    const channelId = p.get('cid');
    const pairingToken = p.get('pt');
    const corePubkey = p.get('cpk');
    const rpcRaw = p.get('rpc');
    const expRaw = p.get('exp');

    if (!channelId || !pairingToken || !corePubkey || !expRaw) {
      logErr(
        'missing required QR fields cid=%s pt_len=%d cpk_len=%d exp=%s',
        channelId,
        pairingToken?.length ?? 0,
        corePubkey?.length ?? 0,
        expRaw
      );
      return null;
    }

    const expiresAt = parseInt(expRaw, 10);
    if (isNaN(expiresAt)) {
      logErr('invalid exp field: %s', expRaw);
      return null;
    }

    return { channelId, pairingToken, corePubkey, rpcUrl: rpcRaw ?? undefined, expiresAt };
  } catch (err) {
    logErr('URL parse error: %o', err);
    return null;
  }
}
