import { useT } from '../lib/i18n/I18nContext';

interface RouteLoadingScreenProps {
  label?: string;
}

const RouteLoadingScreen = ({ label }: RouteLoadingScreenProps) => {
  const { t } = useT();
  return (
    <div className="h-full min-h-[280px] w-full flex items-center justify-center animate-fade-in">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-[#7C3AED] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-stone-500 dark:text-neutral-400">
          {label ?? t('app.routeLoading.initializing')}
        </p>
      </div>
    </div>
  );
};

export default RouteLoadingScreen;
