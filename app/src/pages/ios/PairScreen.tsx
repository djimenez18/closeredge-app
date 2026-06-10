/**
 * PairScreen — iOS-only QR pairing flow.
 *
 * Flow:
 *   1. User taps "Scan QR code" → barcode scanner opens.
 *   2. App parses the openhuman://pair?... URL from the scan result.
 *   3. Validates fields; rejects expired codes.
 *   4. Generates a fresh device X25519 keypair.
 *   5. Builds a ConnectionProfile and saves it via profileStore.
 *   6. Probes the channel via TransportManager.isHealthy().
 *   7. On success: navigates to /human (mobile tab bar shows Human/Chat/Settings).
 *   8. On failure: shows error + retry button.
 *
 * No dynamic imports. Static import of barcode scanner — caller guard is
 * the iOS-only route; desktop never renders this component.
 */
import { Format, scan } from '@tauri-apps/plugin-barcode-scanner';
import debug from 'debug';
import { type FC, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { CloserEdgeMark } from '../../components/mobile/CloserEdgeBrand';
import { useT } from '../../lib/i18n/I18nContext';
import {
  connectFromPairPayload,
  type PairPayload,
} from '../../services/transport/connectFromPairPayload';

const log = debug('ios:pair-screen');
const logErr = debug('ios:pair-screen:error');

// -- QR payload parsing -------------------------------------------------------

function parsePairUrl(raw: string): PairPayload | null {
  log('[ios] parsing pair URL len=%d', raw.length);
  try {
    // Accept both the openhuman:// deep-link and a plain https:// fallback.
    // Normalise openhuman:// → https:// so URL() can parse it.
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
        '[ios] missing required QR fields cid=%s pt_len=%d cpk_len=%d exp=%s',
        channelId,
        pairingToken?.length ?? 0,
        corePubkey?.length ?? 0,
        expRaw
      );
      return null;
    }

    const expiresAt = parseInt(expRaw, 10);
    if (isNaN(expiresAt)) {
      logErr('[ios] invalid exp field: %s', expRaw);
      return null;
    }

    return { channelId, pairingToken, corePubkey, rpcUrl: rpcRaw ?? undefined, expiresAt };
  } catch (err) {
    logErr('[ios] URL parse error: %o', err);
    return null;
  }
}

// -- component ---------------------------------------------------------------

type ScreenState =
  | { kind: 'idle' }
  | { kind: 'scanning' }
  | { kind: 'error'; message: string }
  | { kind: 'expired' }
  | { kind: 'connecting' }
  | { kind: 'success' };

export const PairScreen: FC = () => {
  const navigate = useNavigate();
  const { t } = useT();
  const [state, setState] = useState<ScreenState>({ kind: 'idle' });

  async function startScan(): Promise<void> {
    log('[ios] starting QR scan');
    setState({ kind: 'scanning' });
    try {
      const result = await scan({ windowed: false, formats: [Format.QRCode] });
      const rawContent = result.content;
      log('[ios] scan result received len=%d', rawContent.length);

      await handleScanResult(rawContent);
    } catch (err) {
      logErr('[ios] scan error: %o', err);
      setState({ kind: 'error', message: t('iosPair.error.camera') });
    }
  }

  async function handleScanResult(raw: string): Promise<void> {
    // 1. Parse
    const payload = parsePairUrl(raw);
    if (!payload) {
      setState({ kind: 'error', message: t('iosPair.error.invalidQr') });
      return;
    }

    // 2. Shared connect path (expiry check → keypair → profile → probe);
    // identical to the account-login flow in LoginScreen.
    setState({ kind: 'connecting' });
    const result = await connectFromPairPayload(payload, t('iosPair.desktopLabel'));
    if (result.kind === 'expired') {
      setState({ kind: 'expired' });
      return;
    }
    if (result.kind === 'unhealthy') {
      setState({ kind: 'error', message: t('iosPair.error.unreachableDesktop') });
      return;
    }
    if (result.kind === 'error') {
      logErr('[ios] connect error: %s', result.message);
      setState({ kind: 'error', message: t('iosPair.error.connectionFailed') });
      return;
    }

    // 3. Navigate to Home now that pairing is established.
    setState({ kind: 'success' });
    navigate('/home', { replace: true });
  }

  return (
    <div
      className="flex flex-col items-center justify-center min-h-screen text-white px-6 py-12"
      style={{
        background:
          'radial-gradient(ellipse at 50% -10%, rgba(123,110,246,0.28), transparent 60%), #171130',
      }}>
      <div className="flex flex-col items-center gap-8 max-w-sm w-full">
        {/* Logo / icon area */}
        <div
          className="w-20 h-20 rounded-2xl flex items-center justify-center shadow-lg
                     bg-gradient-to-br from-edge-800 to-edge-600 shadow-edge-700/40">
          <CloserEdgeMark size={44} />
        </div>

        {/* Wordmark */}
        <p className="font-display font-bold text-xl tracking-tight -mt-3">
          Closer<span className="text-edge-400">Edge</span>
          <span className="font-medium opacity-80"> AI</span>
        </p>

        {/* Heading */}
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-white mb-2">{t('iosPair.title')}</h1>
          <p className="text-sm text-white/60 leading-relaxed">{t('iosPair.instructions')}</p>
        </div>

        {/* State-specific content */}
        {state.kind === 'idle' && (
          <button
            onClick={() => void startScan()}
            className="w-full py-4 rounded-xl bg-edge-500 text-white font-medium text-base
                       active:opacity-80 transition-opacity shadow-md shadow-edge-700/30">
            {t('iosPair.scanQrCode')}
          </button>
        )}

        {state.kind === 'scanning' && (
          <p className="text-white/60 text-sm text-center animate-pulse">
            {t('iosPair.scannerOpening')}
          </p>
        )}

        {state.kind === 'connecting' && (
          <p className="text-white/60 text-sm text-center animate-pulse">
            {t('iosPair.connecting')}
          </p>
        )}

        {state.kind === 'success' && (
          <p className="text-green-400 text-sm text-center">{t('iosPair.connectedLoading')}</p>
        )}

        {state.kind === 'expired' && (
          <div className="flex flex-col items-center gap-4 text-center">
            <p className="text-amber-400 text-sm">{t('iosPair.expired')}</p>
            <button
              onClick={() => setState({ kind: 'idle' })}
              className="w-full py-3 rounded-xl border border-white/20 text-white/80 text-sm
                         active:opacity-70 transition-opacity">
              {t('common.retry')}
            </button>
          </div>
        )}

        {state.kind === 'error' && (
          <div className="flex flex-col items-center gap-4 text-center w-full">
            <p className="text-red-400 text-sm">{state.message}</p>
            <button
              onClick={() => void startScan()}
              className="w-full py-3 rounded-xl bg-edge-500/80 text-white text-sm
                         active:opacity-70 transition-opacity">
              {t('iosPair.retryScan')}
            </button>
            <button
              onClick={() => setState({ kind: 'idle' })}
              className="text-white/40 text-xs underline-offset-2 underline">
              {t('common.cancel')}
            </button>
          </div>
        )}

        {/* Step hint */}
        {(state.kind === 'idle' || state.kind === 'error' || state.kind === 'expired') && (
          <div className="flex flex-col gap-3 w-full mt-2">
            {[
              t('iosPair.step.openDesktop'),
              t('iosPair.step.openSettings'),
              t('iosPair.step.showQr'),
            ].map((step, i) => (
              <div key={step} className="flex items-center gap-3 text-white/50 text-xs">
                <span className="w-5 h-5 rounded-full border border-white/20 flex items-center justify-center text-[10px] shrink-0">
                  {i + 1}
                </span>
                {step}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
