/**
 * MobileTabBar — bottom tab navigation for the CloserEdge AI mobile app.
 *
 * Surfaces the three mobile routes: Home, Chat, Settings. Sits at the
 * bottom of the viewport with a thumb-reachable safe-area inset so it
 * clears the iPhone home indicator / Android gesture bar.
 *
 * Active tab gets the brand violet tint plus a small indicator dot.
 * Light/dark aware via Tailwind `dark:` classes (ThemeProvider toggles
 * the root class).
 */
import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useT } from '../../lib/i18n/I18nContext';

interface Tab {
  id: string;
  labelKey: string;
  labelFallback: string;
  path: string;
  icon: ReactNode;
}

const tabs: Tab[] = [
  {
    id: 'home',
    labelKey: 'mobile.tab.home',
    labelFallback: 'Home',
    path: '/home',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.8}
          d="M3 10.5L12 3l9 7.5M5 9.5V21h5v-6h4v6h5V9.5"
        />
      </svg>
    ),
  },
  {
    id: 'chat',
    labelKey: 'mobile.tab.chat',
    labelFallback: 'Chat',
    path: '/chat',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.8}
          d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
        />
      </svg>
    ),
  },
  {
    id: 'settings',
    labelKey: 'mobile.tab.settings',
    labelFallback: 'Settings',
    path: '/settings',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.8}
          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.8}
          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
        />
      </svg>
    ),
  },
];

const MobileTabBar = () => {
  const { t } = useT();
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(`${path}/`);

  return (
    <nav
      className="flex-shrink-0 flex justify-around items-stretch border-t
                 border-stone-200 bg-white/95
                 dark:border-white/10 dark:bg-edge-950/95 backdrop-blur-md"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label={t('mobile.nav.ariaLabel')}>
      {tabs.map(tab => {
        const active = isActive(tab.path);
        const label = t(tab.labelKey, tab.labelFallback);
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => navigate(tab.path)}
            className={`relative flex flex-col items-center justify-center gap-1 flex-1 py-2.5 transition-colors ${
              active ? 'text-edge-600 dark:text-edge-300' : 'text-stone-400 dark:text-white/40'
            }`}
            aria-current={active ? 'page' : undefined}
            aria-label={label}>
            {tab.icon}
            <span className="text-[11px] font-medium">{label}</span>
            <span
              aria-hidden="true"
              className={`absolute top-0.5 h-1 w-1 rounded-full bg-edge-500 transition-opacity ${
                active ? 'opacity-100' : 'opacity-0'
              }`}
            />
          </button>
        );
      })}
    </nav>
  );
};

export default MobileTabBar;
