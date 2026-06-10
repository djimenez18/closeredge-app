import { useNavigate } from 'react-router-dom';

import { SUBSCRIPTION_ROUTE } from '../../constants/links';
import { useUsageState } from '../../hooks/useUsageState';
import { useT } from '../../lib/i18n/I18nContext';
import UpsellBanner from './UpsellBanner';

export default function GlobalUpsellBanner() {
  const { t } = useT();
  const navigate = useNavigate();
  const { teamUsage, isLoading, isAtLimit, isNearLimit, isFreeTier, usagePct } = useUsageState();

  if (isLoading || !teamUsage) return null;

  if (isAtLimit) {
    return (
      <div className="relative z-20">
        <UpsellBanner
          variant="upgrade"
          title={t('upsell.global.limitTitle')}
          message={t('upsell.global.limitMessage')}
          ctaLabel={t('chat.upgrade')}
          rounded={false}
          onCtaClick={() => {
            navigate(SUBSCRIPTION_ROUTE);
          }}
        />
      </div>
    );
  }

  if (isNearLimit && isFreeTier) {
    const pct = Math.round(usagePct * 100);
    return (
      <div className="relative z-20">
        <UpsellBanner
          variant="warning"
          title={t('upsell.global.nearLimitTitle')}
          message={t('upsell.global.nearLimitMessage').replace('{pct}', String(pct))}
          ctaLabel={t('chat.upgrade')}
          rounded={false}
          onCtaClick={() => {
            navigate(SUBSCRIPTION_ROUTE);
          }}
        />
      </div>
    );
  }

  return null;
}
