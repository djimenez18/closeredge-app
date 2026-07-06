/**
 * WelcomeScreen — unpaired entry point for the mobile app.
 *
 * Two paths to connect:
 *   - Log in (primary): CloserEdge account → pick a registered desktop →
 *     automatic handshake. Only offered when Supabase is configured in
 *     the build.
 *   - Scan QR (secondary): the zero-account local pairing flow.
 */
import { type FC } from 'react';
import { useNavigate } from 'react-router-dom';

import { useT } from '../../lib/i18n/I18nContext';
import { supabaseConfigured } from '../../lib/supabase';

export const WelcomeScreen: FC = () => {
  const navigate = useNavigate();
  const { t } = useT();

  return (
    <div
      className="flex flex-col items-center justify-center min-h-screen text-white px-6 py-12"
      style={{
        background:
          'radial-gradient(ellipse at 50% -10%, rgba(123,110,246,0.28), transparent 60%), #171130',
      }}>
      <div className="flex flex-col items-center gap-8 max-w-sm w-full">
        <div className="text-center">
          <img
            src="/closeredge-logo-white.png"
            alt="CloserEdge AI"
            className="w-64 max-w-[80%] h-auto mx-auto drop-shadow-[0_10px_30px_rgba(123,110,246,0.3)]"
          />
          <p className="text-sm text-white/60 leading-relaxed mt-4">
            {t('mobileWelcome.tagline', 'Your AI employee, in your pocket.')}
          </p>
        </div>

        <div className="flex flex-col gap-3 w-full mt-2">
          {supabaseConfigured && (
            <button
              onClick={() => navigate('/login')}
              data-testid="welcome-login"
              className="w-full py-4 rounded-xl bg-edge-500 text-white font-medium text-base
                         active:opacity-80 transition-opacity shadow-md shadow-edge-700/30">
              {t('mobileWelcome.logIn', 'Log in')}
            </button>
          )}
          <button
            onClick={() => navigate('/pair')}
            data-testid="welcome-scan-qr"
            className={`w-full py-4 rounded-xl text-base transition-opacity active:opacity-70 ${
              supabaseConfigured
                ? 'border border-white/20 text-white/80'
                : 'bg-edge-500 text-white font-medium shadow-md shadow-edge-700/30'
            }`}>
            {t('mobileWelcome.scanQr', 'Pair with QR code')}
          </button>
        </div>

        <p className="text-xs text-white/40 text-center leading-relaxed">
          {t(
            'mobileWelcome.hint',
            'Log in to connect to your desktops and cloud agents, or scan the QR from CloserEdge AI on your computer.'
          )}
        </p>
      </div>
    </div>
  );
};
