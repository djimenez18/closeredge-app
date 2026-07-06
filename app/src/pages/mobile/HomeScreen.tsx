/**
 * HomeScreen — the CloserEdge AI mobile command center.
 *
 * First screen after pairing. Shows:
 *   - Brand header with a light/dark theme toggle.
 *   - Time-aware greeting.
 *   - Desktop connection card: paired label, live health probe result,
 *     and the active transport kind (LAN / secure tunnel / cloud).
 *   - Hero "Talk to your AI" call-to-action that opens the chat screen.
 *   - Suggestion chips that deep-link into chat.
 *
 * All data shown is real: profile from profileStore, health from a
 * TransportManager probe. Nothing is mocked or fabricated.
 */
import debug from 'debug';
import { type FC, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { CloserEdgeMark, CloserEdgeWordmark } from '../../components/mobile/CloserEdgeBrand';
import { useT } from '../../lib/i18n/I18nContext';
import { listProfiles } from '../../services/transport/profileStore';
import { createTransportManager } from '../../services/transport/TransportManager';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { resolveTheme, setThemeMode, type ThemeMode } from '../../store/themeSlice';
import { BACKEND_URL } from '../../utils/config';

const log = debug('mobile:home');
const logErr = debug('mobile:home:error');

type Health = 'checking' | 'online' | 'offline';

/** Greeting key by local hour: 5–11 morning, 12–17 afternoon, else evening. */
function greetingKey(hour: number): string {
  if (hour >= 5 && hour < 12) return 'mobileHome.greeting.morning';
  if (hour >= 12 && hour < 18) return 'mobileHome.greeting.afternoon';
  return 'mobileHome.greeting.evening';
}

const TRANSPORT_LABEL_KEY: Record<string, string> = {
  lan: 'mobileHome.transport.lan',
  tunnel: 'mobileHome.transport.tunnel',
  cloud: 'mobileHome.transport.cloud',
};

const SUGGESTIONS = [
  { key: 'mobileHome.suggestion.listing', fallback: 'Draft a listing description' },
  { key: 'mobileHome.suggestion.followup', fallback: 'Write a client follow-up' },
  { key: 'mobileHome.suggestion.plan', fallback: 'Plan my day' },
];

const HomeScreen: FC = () => {
  const { t } = useT();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const themeMode = useAppSelector(state => state.theme.mode) as ThemeMode;

  const [health, setHealth] = useState<Health>('checking');
  const [transportKind, setTransportKind] = useState<string | null>(null);

  const profile = listProfiles()[0] ?? null;

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    (async () => {
      try {
        const manager = createTransportManager(profile, { backendSocketUrl: BACKEND_URL });
        const transport = await manager.getTransport();
        const healthy = await transport.isHealthy();
        if (cancelled) return;
        setTransportKind(transport.kind);
        setHealth(healthy ? 'online' : 'offline');
        log('[mobile] health probe done kind=%s healthy=%s', transport.kind, healthy);
      } catch (err) {
        logErr('[mobile] health probe failed: %o', err);
        if (!cancelled) setHealth('offline');
      }
    })();
    return () => {
      cancelled = true;
    };
    // The saved profile is stable for the lifetime of this screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resolved = resolveTheme(themeMode);
  const toggleTheme = () => {
    const next = resolved === 'dark' ? 'light' : 'dark';
    log('[mobile] theme toggle %s -> %s', resolved, next);
    dispatch(setThemeMode(next));
  };

  const now = new Date();
  const dateLine = now.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const healthDot =
    health === 'online'
      ? 'bg-sage-500'
      : health === 'offline'
        ? 'bg-coral-500'
        : 'bg-amber-400 animate-pulse';

  const healthLabel =
    health === 'online'
      ? t('mobileHome.status.online', 'Connected')
      : health === 'offline'
        ? t('mobileHome.status.offline', 'Unreachable')
        : t('mobileHome.status.checking', 'Checking…');

  return (
    <div
      className="h-full overflow-y-auto bg-canvas-50 text-stone-900
                 dark:bg-edge-950 dark:text-white"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      {/* Soft brand glow behind the content (dark mode only). */}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 h-72 opacity-0 dark:opacity-100 transition-opacity"
        style={{
          background:
            'radial-gradient(ellipse at 50% -20%, rgba(123,110,246,0.25), transparent 70%)',
        }}
      />

      <div className="relative px-5 pb-8 max-w-md mx-auto">
        {/* Header: wordmark + theme toggle */}
        <header className="flex items-center justify-between pt-4 pb-6">
          <CloserEdgeWordmark textClassName="text-base" markSize={22} />
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={t('mobileHome.themeToggle', 'Toggle dark mode')}
            className="w-9 h-9 rounded-full flex items-center justify-center
                       border border-stone-200 text-stone-500
                       dark:border-white/15 dark:text-white/70
                       active:scale-95 transition-transform">
            {resolved === 'dark' ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.8}
                  d="M12 3v1.5M12 19.5V21M4.93 4.93l1.06 1.06M18.01 18.01l1.06 1.06M3 12h1.5M19.5 12H21M4.93 19.07l1.06-1.06M18.01 5.99l1.06-1.06M16 12a4 4 0 11-8 0 4 4 0 018 0z"
                />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.8}
                  d="M21 12.8A9 9 0 1111.2 3 7 7 0 0021 12.8z"
                />
              </svg>
            )}
          </button>
        </header>

        {/* Greeting */}
        <p className="text-sm text-stone-500 dark:text-white/50">{dateLine}</p>
        <h1 className="text-3xl font-display font-bold tracking-tight mt-1 mb-6 text-stone-900 dark:text-white">
          {t(greetingKey(now.getHours()), 'Hello')}
        </h1>

        {/* Connection status card */}
        <section
          className="rounded-2xl border border-stone-200 bg-white shadow-sm
                     dark:border-white/10 dark:bg-white/5 p-4 mb-4"
          aria-label={t('mobileHome.status.title', 'Your desktop')}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${healthDot}`} />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {profile?.label ?? t('mobileHome.status.title', 'Your desktop')}
                </p>
                <p className="text-xs text-stone-500 dark:text-white/50">
                  {healthLabel}
                  {transportKind && TRANSPORT_LABEL_KEY[transportKind] && (
                    <> · {t(TRANSPORT_LABEL_KEY[transportKind])}</>
                  )}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigate('/settings/devices')}
              className="text-xs font-medium text-edge-600 dark:text-edge-300
                         px-3 py-1.5 rounded-lg border border-edge-200
                         dark:border-edge-400/30 active:opacity-70 transition-opacity shrink-0">
              {t('mobileHome.status.manage', 'Manage')}
            </button>
          </div>
        </section>

        {/* Hero CTA — talk to your AI */}
        <button
          type="button"
          onClick={() => navigate('/chat')}
          data-testid="home-talk-cta"
          className="w-full rounded-2xl p-5 mb-6 text-left text-white
                     bg-gradient-to-br from-edge-700 via-edge-600 to-edge-500
                     shadow-lg shadow-edge-700/30
                     active:scale-[0.99] transition-transform">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-display font-bold">
                {t('mobileHome.cta.title', 'Talk to your AI')}
              </p>
              <p className="text-sm text-white/70 mt-1 leading-snug">
                {t('mobileHome.cta.subtitle', 'Hold to talk, or type. Your edge, one tap away.')}
              </p>
            </div>
            <CloserEdgeMark size={44} className="shrink-0 ml-3 drop-shadow" />
          </div>
        </button>

        {/* Suggestions */}
        <p className="text-xs uppercase tracking-wide text-stone-400 dark:text-white/40 mb-2">
          {t('mobileHome.suggestions.title', 'Try asking')}
        </p>
        <div className="flex flex-col gap-2">
          {SUGGESTIONS.map(s => (
            <button
              key={s.key}
              type="button"
              onClick={() => navigate('/chat')}
              className="w-full text-left text-sm rounded-xl px-4 py-3
                         border border-stone-200 bg-white text-stone-700
                         dark:border-white/10 dark:bg-white/5 dark:text-white/80
                         active:opacity-70 transition-opacity">
              “{t(s.key, s.fallback)}”
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default HomeScreen;
