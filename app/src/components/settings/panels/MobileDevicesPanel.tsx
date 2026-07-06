/**
 * MobileDevicesPanel — connection management for the paired phone.
 *
 * Lists the desktop(s) this phone is paired with (from profileStore), runs a
 * live transport-health probe per device, and lets the user disconnect or pair
 * another device. Replaces the desktop-oriented "Coming Soon" stub on the
 * mobile target (Settings.tsx branches on getIsMobile()).
 *
 * All data is real: profiles come from profileStore, health from a
 * TransportManager probe — nothing is mocked.
 */
import debug from 'debug';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useT } from '../../../lib/i18n/I18nContext';
import {
  type ConnectionProfile,
  deleteProfile,
  listProfiles,
} from '../../../services/transport/profileStore';
import { createTransportManager } from '../../../services/transport/TransportManager';
import { BACKEND_URL } from '../../../utils/config';
import SettingsHeader from '../components/SettingsHeader';
import { useSettingsNavigation } from '../hooks/useSettingsNavigation';

const log = debug('mobile:devices-panel');
const logErr = debug('mobile:devices-panel:error');

type Health = 'checking' | 'online' | 'offline';

const MobileDevicesPanel = () => {
  const { t } = useT();
  const navigate = useNavigate();
  const { navigateBack, breadcrumbs } = useSettingsNavigation();
  const [profiles, setProfiles] = useState<ConnectionProfile[]>(() => listProfiles());
  const [health, setHealth] = useState<Record<string, Health>>({});

  useEffect(() => {
    let cancelled = false;
    log('[mobile] probing health for %d device(s)', profiles.length);
    for (const profile of profiles) {
      setHealth(h => ({ ...h, [profile.id]: 'checking' }));
      void (async () => {
        try {
          const manager = createTransportManager(profile, { backendSocketUrl: BACKEND_URL });
          const transport = await manager.getTransport();
          const healthy = await transport.isHealthy();
          if (!cancelled) setHealth(h => ({ ...h, [profile.id]: healthy ? 'online' : 'offline' }));
        } catch (err) {
          logErr('[mobile] devices probe failed id=%s: %o', profile.id, err);
          if (!cancelled) setHealth(h => ({ ...h, [profile.id]: 'offline' }));
        }
      })();
    }
    return () => {
      cancelled = true;
    };
  }, [profiles]);

  function handleDisconnect(id: string) {
    log('[mobile] disconnecting desktop id=%s', id);
    deleteProfile(id);
    const remaining = listProfiles();
    setProfiles(remaining);
    // No desktops left → the phone is no longer paired; return to welcome.
    if (remaining.length === 0) navigate('/welcome', { replace: true });
  }

  const statusLabel = (h: Health | undefined): string => {
    if (h === 'online') return t('mobileHome.status.online', 'Connected');
    if (h === 'offline') return t('mobileHome.status.offline', 'Unreachable');
    return t('mobileHome.status.checking', 'Checking…');
  };
  const statusDot = (h: Health | undefined): string =>
    h === 'online'
      ? 'bg-sage-500'
      : h === 'offline'
        ? 'bg-coral-500'
        : 'bg-stone-400 animate-pulse';

  return (
    <div className="z-10 relative">
      <div className="px-5 pt-5 pb-3">
        <SettingsHeader
          title={t('devices.title')}
          showBackButton={breadcrumbs.length > 0}
          onBack={navigateBack}
          breadcrumbs={breadcrumbs}
        />
      </div>

      <div className="space-y-3 px-5 pb-5">
        <p className="text-sm text-stone-500 dark:text-white/50">
          {t('mobileDevices.subtitle', 'Desktops paired with this phone.')}
        </p>

        {profiles.map(p => (
          <div
            key={p.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white p-4 dark:border-white/10 dark:bg-white/5">
            <div className="flex min-w-0 items-center gap-3">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${statusDot(health[p.id])}`} />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-stone-900 dark:text-white">
                  {p.label}
                </p>
                <p className="text-xs text-stone-500 dark:text-white/50">
                  {statusLabel(health[p.id])}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleDisconnect(p.id)}
              className="shrink-0 rounded-lg border border-coral-200 px-3 py-1.5 text-xs font-medium
                         text-coral-600 transition-opacity active:opacity-70
                         dark:border-coral-400/30 dark:text-coral-400">
              {t('iosMascot.disconnect', 'Disconnect')}
            </button>
          </div>
        ))}

        {profiles.length === 0 && (
          <p className="text-sm text-stone-500 dark:text-white/50">
            {t('mobileDevices.empty', 'No desktops paired yet.')}
          </p>
        )}

        <button
          type="button"
          onClick={() => navigate('/pair')}
          className="mt-2 w-full rounded-xl bg-edge-500 py-3 text-sm font-medium text-white
                     shadow-md shadow-edge-700/30 transition-opacity active:opacity-80">
          {t('mobileDevices.pairAnother', 'Pair another device')}
        </button>
      </div>
    </div>
  );
};

export default MobileDevicesPanel;
