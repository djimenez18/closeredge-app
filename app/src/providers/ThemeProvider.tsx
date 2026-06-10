import { ReactNode, useEffect, useRef } from 'react';

import { useAppSelector } from '../store/hooks';
import { resolveTheme, type ThemeMode } from '../store/themeSlice';

/**
 * Syncs the Redux `theme.mode` slice to the `<html>` element's class list so
 * Tailwind's `darkMode: 'class'` and the `:root.dark` CSS variable block in
 * theme.css activate together.
 *
 * Mode = `system` also subscribes to `prefers-color-scheme` so OS-level theme
 * flips propagate live without a reload.
 *
 * The very first paint is handled by the inline bootstrap in `index.html`
 * (pre-React, no flash); this provider takes over from there. On every
 * *subsequent* flip it stamps `.theme-transition` on <html> for ~200ms so
 * theme.css can cross-fade colors (~150ms, skipped under
 * prefers-reduced-motion) instead of hard-cutting.
 */
const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const mode = useAppSelector(state => state.theme.mode) as ThemeMode;
  const transitionTimer = useRef<number | null>(null);

  useEffect(() => {
    const apply = (animate: boolean) => {
      const root = document.documentElement;
      const resolved = resolveTheme(mode);
      const isDarkNow = root.classList.contains('dark');
      const changing = isDarkNow !== (resolved === 'dark');

      if (animate && changing) {
        root.classList.add('theme-transition');
        if (transitionTimer.current !== null) window.clearTimeout(transitionTimer.current);
        transitionTimer.current = window.setTimeout(() => {
          root.classList.remove('theme-transition');
          transitionTimer.current = null;
        }, 200);
      }

      if (resolved === 'dark') {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
      root.style.colorScheme = resolved;
    };

    // Animate the flip — `apply` itself no-ops the transition stamp when the
    // resolved theme isn't actually changing (e.g. initial mount where the
    // index.html bootstrap already set the class).
    apply(true);

    if (mode !== 'system') return;
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = () => apply(true);
    // Safari < 14 uses addListener/removeListener (the deprecated API). Guard
    // for both so we don't ship a broken sync on older webviews.
    if (mq.addEventListener) {
      mq.addEventListener('change', listener);
      return () => mq.removeEventListener('change', listener);
    }
    mq.addListener(listener);
    return () => mq.removeListener(listener);
  }, [mode]);

  return <>{children}</>;
};

export default ThemeProvider;
