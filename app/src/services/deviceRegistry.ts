/**
 * deviceRegistry — Supabase-backed desktop discovery for account pairing.
 *
 * The desktop (Cloud Pairing enabled) upserts its current pairing payload;
 * a phone logged into the same account lists rows and connects with the
 * exact same handshake the QR flow uses. RLS restricts every row to its
 * owning user. See supabase/migrations/010_device_registry.sql.
 */
import debug from 'debug';

import { supabase, supabaseConfigured } from '../lib/supabase';
import { type PairPayload } from './transport/connectFromPairPayload';

const log = debug('app:device-registry');

export interface RegisteredDesktop {
  id: string;
  desktopInstallId: string;
  deviceLabel: string;
  payload: PairPayload;
  lastSeenAt: string;
  /** True when the pairing token is still inside its validity window. */
  online: boolean;
}

interface DeviceRegistryRow {
  id: string;
  desktop_install_id: string;
  device_label: string;
  channel_id: string;
  core_pubkey: string;
  pairing_token: string;
  rpc_url: string | null;
  token_expires_at: string;
  last_seen_at: string;
}

/** List the account's registered desktops, freshest first. */
export async function listRegisteredDesktops(): Promise<RegisteredDesktop[]> {
  if (!supabaseConfigured) return [];
  const { data, error } = await supabase
    .from('device_registry')
    .select(
      'id, desktop_install_id, device_label, channel_id, core_pubkey, pairing_token, rpc_url, token_expires_at, last_seen_at'
    )
    .order('last_seen_at', { ascending: false });
  if (error) {
    log('list error: %s', error.message);
    throw new Error(error.message);
  }
  const nowSecs = Math.floor(Date.now() / 1000);
  return ((data ?? []) as DeviceRegistryRow[]).map(row => {
    const expiresAt = Math.floor(new Date(row.token_expires_at).getTime() / 1000);
    return {
      id: row.id,
      desktopInstallId: row.desktop_install_id,
      deviceLabel: row.device_label,
      payload: {
        channelId: row.channel_id,
        pairingToken: row.pairing_token,
        corePubkey: row.core_pubkey,
        rpcUrl: row.rpc_url ?? undefined,
        expiresAt,
      },
      lastSeenAt: row.last_seen_at,
      online: expiresAt > nowSecs,
    };
  });
}

export interface PublishDesktopInput {
  desktopInstallId: string;
  deviceLabel: string;
  channelId: string;
  corePubkey: string;
  pairingToken: string;
  rpcUrl: string | null;
  /** ISO 8601, from devices_create_pairing. */
  tokenExpiresAt: string;
}

/** Desktop-side: upsert this machine's current pairing payload. */
export async function publishDesktopPairing(input: PublishDesktopInput): Promise<void> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    throw new Error(userErr?.message ?? 'not signed in');
  }
  const { error } = await supabase.from('device_registry').upsert(
    {
      user_id: userData.user.id,
      desktop_install_id: input.desktopInstallId,
      device_label: input.deviceLabel,
      channel_id: input.channelId,
      core_pubkey: input.corePubkey,
      pairing_token: input.pairingToken,
      rpc_url: input.rpcUrl,
      token_expires_at: input.tokenExpiresAt,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,desktop_install_id' }
  );
  if (error) {
    log('publish error: %s', error.message);
    throw new Error(error.message);
  }
  log('published pairing for install_id=%s', input.desktopInstallId);
}
