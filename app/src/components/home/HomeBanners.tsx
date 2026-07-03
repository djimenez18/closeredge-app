import { useNavigate } from 'react-router-dom';

import { SUBSCRIPTION_ROUTE } from '../../constants/links';
import { useT } from '../../lib/i18n/I18nContext';
import { COMMUNITY_URL } from '../../utils/links';
import { openUrl } from '../../utils/openUrl';

function formatUsd(amount: number): string {
  return `$${amount.toFixed(amount % 1 === 0 ? 0 : 2)}`;
}

export function UsageLimitBanner({
  tone,
  icon,
  title,
  message,
  ctaLabel,
}: {
  tone: 'warning' | 'danger';
  icon: string;
  title: string;
  message: string;
  ctaLabel: string;
}) {
  const navigate = useNavigate();
  const styles =
    tone === 'danger'
      ? {
          card: 'border-coral-200 bg-gradient-to-r from-coral-50 via-rose-50 to-orange-50 dark:border-coral-500/30 dark:from-coral-900/30 dark:via-coral-900/20 dark:to-coral-900/10',
          title: 'text-coral-700 dark:text-coral-300',
          body: 'text-coral-500 dark:text-coral-300/80',
          button:
            'border-coral-700 text-coral-700 hover:text-coral-800 dark:border-coral-300 dark:text-coral-300 dark:hover:text-coral-200',
        }
      : {
          card: 'border-amber-200 bg-gradient-to-r from-amber-50 via-orange-50 to-rose-50 dark:border-amber-500/30 dark:from-amber-900/30 dark:via-amber-900/20 dark:to-amber-900/10',
          title: 'text-amber-700 dark:text-amber-300',
          body: 'text-amber-600 dark:text-amber-300/80',
          button:
            'border-amber-700 text-amber-700 hover:text-amber-800 dark:border-amber-300 dark:text-amber-300 dark:hover:text-amber-200',
        };

  return (
    <div className={`mb-3 rounded-2xl border px-4 py-4 text-left shadow-soft ${styles.card}`}>
      <div className="flex items-start gap-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg`}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold ${styles.title}`}>{title}</p>
          <p className={`mt-1 text-sm leading-relaxed ${styles.body}`}>
            {message}&nbsp;
            <button
              type="button"
              onClick={() => {
                navigate(SUBSCRIPTION_ROUTE);
              }}
              className={`cursor-pointer border-b border-dashed font-bold ${styles.button}`}>
              {ctaLabel}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

export function PromotionalCreditsBanner({ promoCredits }: { promoCredits: number }) {
  const { t } = useT();
  const navigate = useNavigate();
  return (
    <div className="mb-3 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 via-orange-50 to-rose-50 px-4 py-4 text-left shadow-soft dark:border-amber-500/30 dark:from-amber-900/30 dark:via-amber-900/20 dark:to-amber-900/10">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-500/20 text-lg">
          🎉
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
            {t('home.banners.promoCreditsTitle').replace('{amount}', formatUsd(promoCredits))}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-amber-600 dark:text-amber-300/80">
            {t('home.banners.promoCreditsBody')}{' '}
            <button
              type="button"
              onClick={() => {
                navigate(SUBSCRIPTION_ROUTE);
              }}
              className="cursor-pointer border-b border-amber-700 border-dashed font-bold text-amber-700 hover:text-amber-800 dark:border-amber-300 dark:text-amber-300 dark:hover:text-amber-200">
              {t('home.banners.getSubscription')}
            </button>{' '}
            {t('home.banners.promoCreditsUsage')}
          </p>
        </div>
      </div>
    </div>
  );
}

export function EarlyBirdyBanner({ onDismiss }: { onDismiss?: () => void }) {
  const { t } = useT();
  const navigate = useNavigate();
  return (
    <div className="relative mb-3 mt-3 rounded-2xl border border-orange-200 bg-gradient-to-r from-orange-50 via-amber-50 to-orange-50 px-4 py-4 text-left shadow-soft dark:border-orange-500/30 dark:from-orange-900/30 dark:via-amber-900/20 dark:to-orange-900/10">
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t('home.banners.earlyBirdDismiss')}
          className="absolute right-3 top-3 rounded-md p-1 text-orange-500 hover:bg-orange-100 hover:text-orange-700 dark:text-orange-300 dark:hover:bg-orange-500/10 dark:hover:text-orange-200">
          ✕
        </button>
      )}
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-500/20 text-lg">
          🐦
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-orange-700 dark:text-orange-300">
            {t('home.banners.earlyBirdTitle')}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-orange-600 dark:text-orange-300/80">
            {t('home.banners.earlyBirdUseCode')}{' '}
            <span className="rounded-md border border-orange-300 bg-white px-1.5 py-0.5 font-mono text-[12px] font-bold text-orange-700 dark:border-orange-500/40 dark:bg-neutral-900 dark:text-orange-300">
              EARLYBIRDY
            </span>{' '}
            {t('home.banners.earlyBirdOn')}{' '}
            <button
              type="button"
              onClick={() => {
                navigate(SUBSCRIPTION_ROUTE);
              }}
              className="cursor-pointer border-b border-amber-700 border-dashed font-bold text-amber-700 hover:text-amber-800 dark:border-amber-300 dark:text-amber-300 dark:hover:text-amber-200">
              {t('home.banners.earlyBirdFirstSub')}
            </button>{' '}
          </p>
        </div>
      </div>
    </div>
  );
}

export function CommunityBanner() {
  const { t } = useT();
  return (
    <button
      type="button"
      onClick={() => {
        void openUrl(COMMUNITY_URL);
      }}
      className="mb-3 text-left mt-3 block w-full rounded-2xl border border-[#C5CAF0] bg-gradient-to-r from-[#F5F3FF] via-[#F0EDFF] to-[#EBE8FF] px-4 py-4 text-[#5B3AAE] shadow-soft transition-transform transition-colors hover:-translate-y-0.5 hover:border-[#B3B8E8] hover:from-[#EDEBFF] hover:to-[#E3E0FF] dark:border-[#7C3AED]/30 dark:from-[#7C3AED]/10 dark:via-[#7C3AED]/15 dark:to-[#7C3AED]/10 dark:text-[#C4B5FD] dark:hover:border-[#7C3AED]/50 dark:hover:from-[#7C3AED]/15 dark:hover:to-[#7C3AED]/20">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#7C3AED]/12 text-[#7C3AED]">
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
            aria-hidden="true">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z"
            />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{t('home.banners.communityTitle')}</div>
          <div className="mt-0.5 text-sm text-[#6D5BC0] dark:text-[#A78BFA]">
            {t('home.banners.communitySubtitle')}
          </div>
        </div>
      </div>
    </button>
  );
}
