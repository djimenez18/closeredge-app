/**
 * LoginScreen — account pairing for the mobile app.
 *
 * Flow:
 *   1. Email + password → Supabase sign-in (same account as desktop).
 *   2. List the account's registered desktops (device_registry).
 *   3. Tap a desktop → connectFromPairPayload runs the exact same E2E
 *      handshake the QR flow uses → /home.
 *
 * Desktops appear here when they have Cloud Pairing enabled
 * (desktop → Settings → Devices). An offline/expired row stays visible
 * but unselectable, with a hint to wake the desktop.
 */
import debug from 'debug';
import { type FC, type FormEvent, useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { CloserEdgeMark } from '../../components/mobile/CloserEdgeBrand';
import { useT } from '../../lib/i18n/I18nContext';
import { supabase } from '../../lib/supabase';
import { listRegisteredDesktops, type RegisteredDesktop } from '../../services/deviceRegistry';
import { connectFromPairPayload } from '../../services/transport/connectFromPairPayload';

const log = debug('mobile:login');

type Phase =
  | { kind: 'credentials'; busy: boolean; error: string | null }
  | { kind: 'devices'; desktops: RegisteredDesktop[]; busy: boolean; error: string | null }
  | { kind: 'connecting'; label: string };

export const LoginScreen: FC = () => {
  const navigate = useNavigate();
  const { t } = useT();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phase, setPhase] = useState<Phase>({ kind: 'credentials', busy: false, error: null });

  const loadDesktops = useCallback(async () => {
    setPhase({ kind: 'devices', desktops: [], busy: true, error: null });
    try {
      const desktops = await listRegisteredDesktops();
      log('[mobile] registry returned %d desktops', desktops.length);
      setPhase({ kind: 'devices', desktops, busy: false, error: null });
    } catch (err) {
      setPhase({
        kind: 'devices',
        desktops: [],
        busy: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  // Already signed in (e.g. came back from a previous attempt) → skip
  // straight to the device list.
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        log('[mobile] existing session found');
        void loadDesktops();
      }
    });
  }, [loadDesktops]);

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (phase.kind !== 'credentials' || phase.busy) return;
    setPhase({ kind: 'credentials', busy: true, error: null });
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      log('[mobile] sign-in failed: %s', error.message);
      setPhase({ kind: 'credentials', busy: false, error: error.message });
      return;
    }
    log('[mobile] signed in');
    await loadDesktops();
  }

  async function handleConnect(desktop: RegisteredDesktop): Promise<void> {
    setPhase({ kind: 'connecting', label: desktop.deviceLabel });
    const result = await connectFromPairPayload(desktop.payload, desktop.deviceLabel);
    if (result.kind === 'ok') {
      navigate('/home', { replace: true });
      return;
    }
    const message =
      result.kind === 'expired'
        ? t(
            'mobileLogin.error.expired',
            'That desktop has not refreshed recently — make sure CloserEdge AI is running, then pull to refresh.'
          )
        : result.kind === 'unhealthy'
          ? t('mobileLogin.error.unreachable', "Couldn't reach that desktop. Is it online?")
          : result.message;
    await loadDesktopsWithError(message);
  }

  async function loadDesktopsWithError(message: string): Promise<void> {
    try {
      const desktops = await listRegisteredDesktops();
      setPhase({ kind: 'devices', desktops, busy: false, error: message });
    } catch {
      setPhase({ kind: 'devices', desktops: [], busy: false, error: message });
    }
  }

  return (
    <div
      className="flex flex-col min-h-screen text-white px-6 py-12"
      style={{
        background:
          'radial-gradient(ellipse at 50% -10%, rgba(123,110,246,0.28), transparent 60%), #171130',
      }}>
      <div className="flex flex-col items-center gap-6 max-w-sm w-full mx-auto my-auto">
        <div className="flex items-center gap-3">
          <CloserEdgeMark size={32} />
          <h1 className="font-display font-bold text-xl tracking-tight">
            {phase.kind === 'credentials'
              ? t('mobileLogin.title', 'Log in')
              : t('mobileLogin.pickDesktop', 'Choose a desktop')}
          </h1>
        </div>

        {phase.kind === 'credentials' && (
          <form onSubmit={e => void handleSubmit(e)} className="flex flex-col gap-3 w-full">
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder={t('mobileLogin.email', 'Email')}
              aria-label={t('mobileLogin.email', 'Email')}
              className="w-full px-4 py-3.5 rounded-xl bg-white/5 border border-white/15 text-white
                         placeholder-white/40 focus:outline-none focus:border-edge-400/60 text-base"
            />
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={t('mobileLogin.password', 'Password')}
              aria-label={t('mobileLogin.password', 'Password')}
              className="w-full px-4 py-3.5 rounded-xl bg-white/5 border border-white/15 text-white
                         placeholder-white/40 focus:outline-none focus:border-edge-400/60 text-base"
            />
            {phase.error && (
              <p className="text-red-400 text-sm text-center" role="alert">
                {phase.error}
              </p>
            )}
            <button
              type="submit"
              disabled={phase.busy}
              data-testid="login-submit"
              className="w-full py-4 rounded-xl bg-edge-500 text-white font-medium text-base
                         active:opacity-80 transition-opacity shadow-md shadow-edge-700/30
                         disabled:opacity-50">
              {phase.busy
                ? t('mobileLogin.signingIn', 'Signing in…')
                : t('mobileLogin.title', 'Log in')}
            </button>
            <button
              type="button"
              onClick={() => navigate('/welcome')}
              className="text-white/40 text-xs underline underline-offset-2 mt-1">
              {t('common.back')}
            </button>
          </form>
        )}

        {phase.kind === 'devices' && (
          <div className="flex flex-col gap-3 w-full">
            {phase.error && (
              <p className="text-red-400 text-sm text-center" role="alert">
                {phase.error}
              </p>
            )}
            {phase.busy && (
              <p className="text-white/60 text-sm text-center animate-pulse">
                {t('mobileLogin.loadingDesktops', 'Looking for your desktops…')}
              </p>
            )}
            {!phase.busy && phase.desktops.length === 0 && (
              <div className="text-center flex flex-col gap-3">
                <p className="text-white/70 text-sm leading-relaxed">
                  {t(
                    'mobileLogin.noDesktops',
                    'No desktops found on your account yet. Open CloserEdge AI on your computer and turn on Cloud Pairing under Settings → Devices.'
                  )}
                </p>
                <button
                  onClick={() => void loadDesktops()}
                  className="w-full py-3 rounded-xl border border-white/20 text-white/80 text-sm
                             active:opacity-70 transition-opacity">
                  {t('common.retry')}
                </button>
                <button
                  onClick={() => navigate('/pair')}
                  className="text-edge-300 text-sm underline underline-offset-2">
                  {t('mobileLogin.useQrInstead', 'Pair with QR code instead')}
                </button>
              </div>
            )}
            {phase.desktops.map(d => (
              <button
                key={d.id}
                disabled={!d.online}
                onClick={() => void handleConnect(d)}
                data-testid={`desktop-${d.desktopInstallId}`}
                className="w-full text-left rounded-xl px-4 py-3.5 border border-white/15 bg-white/5
                           active:opacity-80 transition-opacity disabled:opacity-40
                           flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{d.deviceLabel}</p>
                  <p className="text-xs text-white/50">
                    {d.online
                      ? t('mobileLogin.desktopOnline', 'Ready to connect')
                      : t(
                          'mobileLogin.desktopOffline',
                          'Offline — open CloserEdge on this computer'
                        )}
                  </p>
                </div>
                <span
                  className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                    d.online ? 'bg-sage-500' : 'bg-white/20'
                  }`}
                />
              </button>
            ))}
            {!phase.busy && phase.desktops.length > 0 && (
              <button
                onClick={() => void loadDesktops()}
                className="text-white/40 text-xs underline underline-offset-2 mt-1">
                {t('common.refresh', 'Refresh')}
              </button>
            )}
          </div>
        )}

        {phase.kind === 'connecting' && (
          <p className="text-white/60 text-sm text-center animate-pulse">
            {t('mobileLogin.connecting', 'Connecting to {label}…').replace('{label}', phase.label)}
          </p>
        )}
      </div>
    </div>
  );
};
