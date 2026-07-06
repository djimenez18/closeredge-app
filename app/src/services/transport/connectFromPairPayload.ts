/**
 * connectFromPairPayload — the single code path that turns a pairing
 * payload into a working connection profile.
 *
 * Used by BOTH mobile onboarding flows:
 *   - QR scan (PairScreen): payload parsed from the openhuman://pair URL.
 *   - Account login (LoginScreen): payload read from the Supabase
 *     device_registry row the desktop published.
 *
 * Steps: validate expiry → generate device X25519 keypair → persist a
 * ConnectionProfile → probe transport health. The E2E handshake and
 * everything downstream is identical regardless of how the payload
 * arrived.
 */
import debug from 'debug';

import { base64urlEncode, generateKeypair } from '../../lib/tunnel/crypto';
import { BACKEND_URL } from '../../utils/config';
import { type ConnectionProfile, saveProfile } from './profileStore';
import { createTransportManager } from './TransportManager';

const log = debug('mobile:connect');
const logErr = debug('mobile:connect:error');

export interface PairPayload {
  channelId: string;
  pairingToken: string;
  corePubkey: string;
  rpcUrl?: string;
  /** Unix seconds. */
  expiresAt: number;
}

export type ConnectResult =
  | { kind: 'ok' }
  | { kind: 'expired' }
  | { kind: 'unhealthy' }
  | { kind: 'error'; message: string };

/**
 * Establish a connection from a pairing payload. On success a profile is
 * saved and the transport has answered a health probe.
 */
export async function connectFromPairPayload(
  payload: PairPayload,
  label: string
): Promise<ConnectResult> {
  const nowSecs = Math.floor(Date.now() / 1000);
  if (payload.expiresAt < nowSecs) {
    log('[mobile] pairing payload expired at=%d now=%d', payload.expiresAt, nowSecs);
    return { kind: 'expired' };
  }
  log('[mobile] payload valid; expires in %ds', payload.expiresAt - nowSecs);

  const keypair = generateKeypair();
  const devicePubkeyB64 = base64urlEncode(keypair.publicKey);
  const devicePrivkeyB64 = base64urlEncode(keypair.secretKey);
  log('[mobile] device keypair generated pubkey_len=%d', devicePubkeyB64.length);
  // NOTE: Never log the private key value — log length only.
  log('[mobile] device privkey_len=%d (not logged)', devicePrivkeyB64.length);

  const profile: ConnectionProfile = {
    id: payload.channelId,
    label,
    kind: 'tunnel',
    channelId: payload.channelId,
    pairingToken: payload.pairingToken,
    corePubkey: payload.corePubkey,
    rpcUrl: payload.rpcUrl,
    devicePrivkey: devicePrivkeyB64,
    // sessionToken will be written after the tunnel handshake completes.
  };
  saveProfile(profile);
  log('[mobile] profile saved id=%s kind=%s', profile.id, profile.kind);

  try {
    const manager = createTransportManager(profile, { backendSocketUrl: BACKEND_URL });
    const transport = await manager.getTransport();
    const healthy = await transport.isHealthy();
    if (!healthy) {
      logErr('[mobile] transport health check failed kind=%s', transport.kind);
      return { kind: 'unhealthy' };
    }
    log('[mobile] transport healthy kind=%s', transport.kind);
  } catch (err) {
    logErr('[mobile] transport probe error: %o', err);
    return { kind: 'error', message: err instanceof Error ? err.message : String(err) };
  }

  return { kind: 'ok' };
}
