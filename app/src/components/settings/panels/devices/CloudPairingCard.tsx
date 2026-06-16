/**
 * CloudPairingCard — Devices panel toggle for account pairing.
 *
 * When ON (and the user is signed in to their CloserEdge account), this
 * desktop continuously publishes its pairing payload to the account's
 * device registry, so phones logged into the same account connect with a
 * tap — no QR scan. The published token is the same short-lived secret
 * the QR carries; only this account can read it (RLS).
 */
import { useState } from 'react';

import { useT } from '../../../../lib/i18n/I18nContext';
import { supabaseConfigured } from '../../../../lib/supabase';
import {
  isCloudPairingEnabled,
  setCloudPairingEnabled,
} from '../../../../services/devicePairingPublisher';

const CloudPairingCard = () => {
  const { t } = useT();
  const [enabled, setEnabled] = useState<boolean>(() => isCloudPairingEnabled());

  if (!supabaseConfigured) return null;

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    setCloudPairingEnabled(next);
  };

  return (
    <div
      className="rounded-xl border border-stone-200 dark:border-neutral-800 bg-white
                 dark:bg-[#1a1a22] p-4 flex items-center justify-between gap-4"
      data-testid="cloud-pairing-card">
      <div className="min-w-0">
        <p className="text-sm font-medium text-stone-900 dark:text-neutral-100">
          {t('devices.cloudPairing.title', 'Cloud pairing')}
        </p>
        <p className="text-xs text-stone-500 dark:text-neutral-400 mt-0.5">
          {t(
            'devices.cloudPairing.body',
            'Let phones signed in to your CloserEdge account connect without scanning a QR code.'
          )}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={t('devices.cloudPairing.title', 'Cloud pairing')}
        onClick={toggle}
        className={`relative shrink-0 w-11 h-6 rounded-full transition-colors ${
          enabled ? 'bg-edge-500' : 'bg-stone-300 dark:bg-neutral-700'
        }`}>
        <span
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
            enabled ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
};

export default CloudPairingCard;
