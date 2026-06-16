import { type ReactElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useT } from '../lib/i18n/I18nContext';
import { selectCompanionSessionActive } from '../store/companionSlice';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { selectUnreadCount } from '../store/notificationSlice';
import { resolveTheme, setThemeMode, type ThemeMode } from '../store/themeSlice';
import { isAccountsFullscreen } from '../utils/accountsFullscreen';

interface TabDef {
  id: string;
  label: string;
  path: string;
  icon: ReactElement;
}

/** Primary tabs shown directly in the bottom bar. */
const makePrimaryTabs = (t: (key: string) => string): TabDef[] => [
  {
    id: 'home',
    label: t('nav.home'),
    path: '/home',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.8}
          d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a2 2 0 01-2-2v-4a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2z"
        />
      </svg>
    ),
  },
  {
    id: 'chat',
    label: t('nav.chat'),
    path: '/chat',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.8}
          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
        />
      </svg>
    ),
  },
  {
    id: 'hivemind',
    label: 'Hive Mind',
    path: '/hivemind',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.8}
          d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
        />
      </svg>
    ),
  },
  {
    id: 'warroom',
    label: 'War Room',
    path: '/warroom',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.8}
          d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
        />
      </svg>
    ),
  },
];

/** Overflow tabs shown inside the "More" popover menu. */
const makeOverflowTabs = (t: (key: string) => string): TabDef[] => [
  {
    id: 'human',
    label: t('nav.human'),
    path: '/human',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.8}
          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14c-4 0-7 2.5-7 6h14c0-3.5-3-6-7-6z"
        />
      </svg>
    ),
  },
  {
    id: 'skills',
    label: t('nav.connections'),
    path: '/skills',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.8}
          d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5"
        />
      </svg>
    ),
  },
  {
    id: 'intelligence',
    label: t('nav.memory'),
    path: '/intelligence',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.8}
          d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
        />
      </svg>
    ),
  },
  {
    id: 'memory',
    label: 'Memory',
    path: '/memory',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.8}
          d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"
        />
      </svg>
    ),
  },
  {
    id: 'admin',
    label: 'Admin',
    path: '/admin',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.8}
          d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
        />
      </svg>
    ),
  },
  {
    id: 'settings',
    label: t('nav.settings'),
    path: '/settings',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

const BottomTabBar = () => {
  const { t } = useT();
  const location = useLocation();
  const navigate = useNavigate();

  const [revealed, setRevealed] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  const activeAccountId = useAppSelector(state => state.accounts.activeAccountId);
  const unreadCount = useAppSelector(state => selectUnreadCount(state.notifications.items));
  const companionActive = useAppSelector(selectCompanionSessionActive);
  // `state.theme` is undefined in some test fixtures that build a minimal
  // store without the theme slice; default to the historical 'hover' behavior
  // so an absent theme branch can't crash the bar.
  const tabBarLabels = useAppSelector(state => state.theme?.tabBarLabels ?? 'hover');
  const labelsAlwaysVisible = tabBarLabels === 'always';

  // Quick light/dark toggle — persistent companion to Settings → Appearance.
  // Flips to the opposite of the *resolved* theme so it also works while in
  // `system` mode (the explicit pick then takes over, matching Home's toggle).
  const dispatch = useAppDispatch();
  const themeMode = useAppSelector(state => (state.theme?.mode ?? 'system') as ThemeMode);
  const isDark = resolveTheme(themeMode) === 'dark';
  const toggleTheme = () => {
    dispatch(setThemeMode(isDark ? 'light' : 'dark'));
  };
  const primaryTabs = useMemo(() => makePrimaryTabs(t), [t]);
  const overflowTabs = useMemo(() => makeOverflowTabs(t), [t]);

  // Close the "More" popover when clicking outside it.
  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
      setMoreOpen(false);
    }
  }, []);

  useEffect(() => {
    if (moreOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [moreOpen, handleClickOutside]);

  // Close "More" when the route changes (user navigated).
  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname]);

  const hiddenPaths = ['/', '/login'];
  if (
    hiddenPaths.some(path => location.pathname === path || location.pathname.startsWith(`${path}/`))
  ) {
    return null;
  }

  // On /accounts we want as much real estate as possible for the embedded
  // webview — but *only* when a real account (WhatsApp, …) is selected.
  // The Agent entry keeps the tab bar visible so chatting with the agent
  // feels like a normal page. A thin hover strip along the bottom lets
  // the user reveal the bar manually even in fullscreen mode.
  const fullscreen = isAccountsFullscreen(location.pathname, activeAccountId);
  const collapsed = fullscreen && !revealed;

  const isActive = (path: string) => {
    if (path === '/chat') return location.pathname.startsWith('/chat');
    if (path === '/settings/cron-jobs') return location.pathname.startsWith('/settings/cron-jobs');
    if (path === '/settings/messaging') return location.pathname.startsWith('/settings/messaging');
    if (path === '/settings')
      return (
        location.pathname === '/settings' ||
        (location.pathname.startsWith('/settings/') &&
          !location.pathname.startsWith('/settings/cron-jobs') &&
          !location.pathname.startsWith('/settings/messaging'))
      );
    if (path === '/home') return location.pathname === '/home';
    return location.pathname === path;
  };

  /** True when the current path matches any item inside the overflow menu. */
  const overflowHasActive = overflowTabs.some(tab => isActive(tab.path));

  const renderTab = (tab: TabDef) => {
    const active = isActive(tab.path);
    const showBadge = tab.id === 'notifications' && unreadCount > 0;
    const showCompanionDot = tab.id === 'settings' && companionActive;
    const walkthroughAttr: Record<string, string> = {
      chat: 'tab-chat',
      skills: 'tab-skills',
      notifications: 'tab-notifications',
      settings: 'tab-settings',
    };
    return (
      <button
        key={tab.id}
        data-walkthrough={walkthroughAttr[tab.id]}
        onClick={() => navigate(tab.path)}
        className={`ce-press-scale group relative flex items-center px-2 py-2 rounded-sm text-sm transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] cursor-pointer ${
          active
            ? 'bg-white dark:bg-neutral-800 text-[#7C3AED] dark:text-[#A855F7] font-semibold shadow-sm'
            : 'bg-transparent text-stone-500 dark:text-neutral-400 hover:bg-stone-300/50 dark:hover:bg-neutral-800/60 hover:text-stone-700 dark:hover:text-neutral-200'
        }`}
        aria-label={
          tab.id === 'notifications' && unreadCount > 0
            ? `${tab.label} (${unreadCount} ${t('alerts.unread')})`
            : tab.label
        }>
        <span className="relative inline-flex flex-shrink-0">
          {tab.icon}
          {showBadge && (
            <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-1 rounded-full bg-coral-500 text-[9px] font-bold text-white flex items-center justify-center leading-none">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
          {showCompanionDot && (
            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
          )}
        </span>
        <span
          className={`overflow-hidden whitespace-nowrap transition-[max-width,margin-left,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
            active || labelsAlwaysVisible
              ? 'max-w-[160px] ml-2 opacity-100'
              : 'max-w-0 ml-0 opacity-0 group-hover:max-w-[160px] group-hover:ml-2 group-hover:opacity-100 group-focus-visible:max-w-[160px] group-focus-visible:ml-2 group-focus-visible:opacity-100'
          }`}>
          {tab.label}
        </span>
      </button>
    );
  };

  return (
    // pointer-events-none on the full-width shell so transparent areas (e.g.
    // beside the centered nav pill) do not steal clicks from sticky footers
    // such as Settings SaveBar. Only the <nav> pill re-enables hits.
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-50">
      {/* Hover strip — only matters when collapsed; provides a 12px bottom
          edge the user can mouse into to reveal the bar again. */}
      {collapsed && (
        <div
          className="pointer-events-auto absolute inset-x-0 bottom-0 h-3"
          onMouseEnter={() => setRevealed(true)}
          aria-hidden
        />
      )}
      <div
        className={`pointer-events-none flex justify-center px-4 pb-4 pt-2 transition-transform duration-300 ease-out ${
          collapsed ? 'translate-y-[calc(100%+8px)]' : 'translate-y-0'
        }`}
        onMouseLeave={() => setRevealed(false)}
        onFocus={() => setRevealed(true)}
        onBlur={e => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setRevealed(false);
        }}>
        <nav className="pointer-events-auto inline-flex items-center gap-1 rounded-sm border border-stone-300 dark:border-neutral-700 bg-stone-200 dark:bg-neutral-900 shadow-soft px-1 py-1">
          {/* ── Primary tabs ─────────────────────────────────────── */}
          {primaryTabs.map(renderTab)}

          {/* ── "More" overflow button + popover ─────────────────── */}
          <div ref={moreRef} className="relative">
            <button
              onClick={() => setMoreOpen(prev => !prev)}
              className={`ce-press-scale group relative flex items-center px-2 py-2 rounded-sm text-sm transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] cursor-pointer ${
                moreOpen || overflowHasActive
                  ? 'bg-white dark:bg-neutral-800 text-[#7C3AED] dark:text-[#A855F7] font-semibold shadow-sm'
                  : 'bg-transparent text-stone-500 dark:text-neutral-400 hover:bg-stone-300/50 dark:hover:bg-neutral-800/60 hover:text-stone-700 dark:hover:text-neutral-200'
              }`}
              aria-label="More"
              aria-expanded={moreOpen}>
              <span className="relative inline-flex flex-shrink-0">
                {/* Three-dot / ellipsis icon */}
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.8}
                    d="M5 12h.01M12 12h.01M19 12h.01"
                  />
                </svg>
              </span>
              <span
                className={`overflow-hidden whitespace-nowrap transition-[max-width,margin-left,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                  moreOpen || overflowHasActive || labelsAlwaysVisible
                    ? 'max-w-[160px] ml-2 opacity-100'
                    : 'max-w-0 ml-0 opacity-0 group-hover:max-w-[160px] group-hover:ml-2 group-hover:opacity-100 group-focus-visible:max-w-[160px] group-focus-visible:ml-2 group-focus-visible:opacity-100'
                }`}>
                More
              </span>
            </button>

            {/* Popover menu */}
            {moreOpen && (
              <div className="absolute bottom-full right-0 mb-2 min-w-[180px] rounded-lg border border-stone-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-lg py-1 z-50 animate-scale-in">
                {overflowTabs.map(tab => {
                  const active = isActive(tab.path);
                  return (
                    <button
                      key={tab.id}
                      onClick={() => {
                        navigate(tab.path);
                        setMoreOpen(false);
                      }}
                      className={`ce-press-scale flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-all duration-200 cursor-pointer ${
                        active
                          ? 'bg-[#7C3AED]/[0.08] dark:bg-[#7C3AED]/10 text-[#7C3AED] dark:text-[#A855F7] font-semibold'
                          : 'text-stone-600 dark:text-neutral-300 hover:bg-stone-50 dark:hover:bg-neutral-800/60 hover:text-stone-900 dark:hover:text-neutral-100'
                      }`}>
                      <span
                        className={`flex-shrink-0 ${active ? 'text-[#7C3AED] dark:text-[#A855F7]' : 'text-stone-400 dark:text-neutral-500'}`}>
                        {tab.icon}
                      </span>
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Quick theme toggle ────────────────────────────────── */}
          <span aria-hidden className="mx-0.5 h-5 w-px bg-stone-300 dark:bg-neutral-700" />
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={isDark ? t('home.themeToggle.toLight') : t('home.themeToggle.toDark')}
            title={isDark ? t('home.themeToggle.toLight') : t('home.themeToggle.toDark')}
            className="group relative flex items-center px-2 py-2 rounded-sm text-sm cursor-pointer bg-transparent text-stone-500 dark:text-neutral-400 hover:bg-stone-300/50 dark:hover:bg-neutral-800/60 hover:text-stone-700 dark:hover:text-neutral-200 transition-colors duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]">
            {/* Sun / moon morph — both icons stay mounted and cross-rotate. */}
            <span className="relative inline-flex w-4 h-4 flex-shrink-0">
              {/* Sun — visible in dark mode (click = back to light) */}
              <svg
                className={`absolute inset-0 w-4 h-4 transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                  isDark ? 'rotate-0 scale-100 opacity-100' : 'rotate-90 scale-50 opacity-0'
                }`}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                viewBox="0 0 24 24"
                aria-hidden="true">
                <circle cx="12" cy="12" r="4" />
                <path
                  strokeLinecap="round"
                  d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
                />
              </svg>
              {/* Moon — visible in light mode (click = go dark) */}
              <svg
                className={`absolute inset-0 w-4 h-4 transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                  isDark ? '-rotate-90 scale-50 opacity-0' : 'rotate-0 scale-100 opacity-100'
                }`}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                viewBox="0 0 24 24"
                aria-hidden="true">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"
                />
              </svg>
            </span>
          </button>
        </nav>
      </div>
    </div>
  );
};

export default BottomTabBar;
