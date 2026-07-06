/**
 * devicePairingPublisher — desktop-side half of account pairing.
 *
 * While enabled (Devices panel → Cloud Pairing) and the user is signed in,
 * this loop periodically calls the same core RPC the QR modal uses
 * (`devices_create_pairing`) and publishes the payload to the Supabase
 * device_registry. Phones logged into the same account can then connect
 * without scanning anything.
 *
 * The token is refreshed at ~70% of its validity window so the registry
 * row never goes stale while the desktop runs. Stopping the loop (or
 * quitting the app) lets the token lapse — the row simply turns
 * "offline" on the phone.
 */
import debug from 'debug';

import { supabase, supabaseConfigured } from '../lib/supabase';
import { callCoreRpc } from './coreRpcClient';
import { publishDesktopPairing } from './deviceRegistry';

const log = debug('app:cloud-pairing');

const ENABLED_KEY = 'cloudPairing.enabled';
const INSTALL_ID_KEY = 'cloudPairing.installId';

interface CreatePairingResponse {
  channel_id: string;
  pairing_token: string;
  core_pubkey: string;
  rpc_url: string | null;
  expires_at: string;
}

let timer: ReturnType<typeof setTimeout> | null = null;
let running = false;

/** Stable per-install identity so re-publishes update one registry row. */
function getInstallId(): string {
  let id = window.localStorage.getItem(INSTALL_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem(INSTALL_ID_KEY, id);
  }
  return id;
}

function deviceLabel(): string {
  // Best effort, editable later via the registry row if we add renaming.
  const platform = navigator.platform || 'Desktop';
  return `CloserEdge on ${platform}`;
}

export function isCloudPairingEnabled(): boolean {
  return window.localStorage.getItem(ENABLED_KEY) === '1';
}

export function setCloudPairingEnabled(enabled: boolean): void {
  window.localStorage.setItem(ENABLED_KEY, enabled ? '1' : '0');
  if (enabled) {
    startCloudPairingPublisher();
  } else {
    stopCloudPairingPublisher();
  }
}

async function publishOnce(): Promise<number> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    log('skipped publish: no session');
    return 60_000; // retry once a minute until signed in
  }
  const session = await callCoreRpc<CreatePairingResponse>({
    method: 'openhuman.devices_create_pairing',
    params: {},
  });
  await publishDesktopPairing({
    desktopInstallId: getInstallId(),
    deviceLabel: deviceLabel(),
    channelId: session.channel_id,
    corePubkey: session.core_pubkey,
    pairingToken: session.pairing_token,
    rpcUrl: session.rpc_url,
    tokenExpiresAt: session.expires_at,
  });
  const validityMs = new Date(session.expires_at).getTime() - Date.now();
  // Refresh at 70% of validity, clamped to a sane window.
  return Math.min(Math.max(validityMs * 0.7, 30_000), 30 * 60_000);
}

/** Idempotent: starts the loop if enabled + supabase configured. */
export function startCloudPairingPublisher(): void {
  if (running || !supabaseConfigured || !isCloudPairingEnabled()) return;
  running = true;
  log('cloud pairing publisher starting');

  const tick = async () => {
    if (!running) return;
    let delay = 60_000;
    try {
      delay = await publishOnce();
      log('published; next refresh in %ds', Math.round(delay / 1000));
    } catch (err) {
      log('publish failed (will retry): %s', err instanceof Error ? err.message : String(err));
    }
    if (running) {
      timer = setTimeout(() => void tick(), delay);
    }
  };
  void tick();
}

export function stopCloudPairingPublisher(): void {
  running = false;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  log('cloud pairing publisher stopped');
}
