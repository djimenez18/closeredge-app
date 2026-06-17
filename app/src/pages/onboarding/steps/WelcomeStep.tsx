import WhatLeavesLink from '../../../features/privacy/WhatLeavesLink';
import { useT } from '../../../lib/i18n/I18nContext';
import OnboardingNextButton from '../components/OnboardingNextButton';

interface WelcomeStepProps {
  onNext: () => void;
}

const WelcomeStep = ({ onNext }: WelcomeStepProps) => {
  const { t } = useT();
  return (
    <div
      data-testid="onboarding-welcome-step"
      className="rounded-2xl bg-white dark:bg-neutral-900 p-10 shadow-soft animate-fade-up">
      <div className="flex flex-col items-center text-center">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-brand-500/10 ring-1 ring-brand-500/20">
          <img
            src="/brand/closeredge-mark.svg"
            alt="CloserEdge AI"
            className="h-12 w-auto"
            draggable={false}
          />
        </div>
        <h1 className="text-3xl font-display text-stone-900 dark:text-neutral-100 mb-3 leading-tight">
          {t('onboarding.welcome')}
        </h1>
        <p className="text-stone-500 dark:text-neutral-400 text-sm leading-relaxed max-w-sm">
          {t('onboarding.welcomeDesc')}
        </p>
      </div>
      <div className="mt-8">
        <OnboardingNextButton label={t('onboarding.getStarted')} onClick={onNext} />
      </div>
      <div className="mt-4 flex justify-center">
        <WhatLeavesLink />
      </div>
    </div>
  );
};

export default WelcomeStep;
