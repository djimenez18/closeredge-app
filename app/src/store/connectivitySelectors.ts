import { isTauri } from '../utils/tauriCommands/common';
import { RootState } from './index';

/**
 * Single app-level "what is broken right now?" derived state. Order matters —
 * the user-blocking outage wins over the soft "we're reconnecting" state.
 *
 * - `internet-offline`  : navigator.onLine = false. Nothing else can talk.
 * - `core-unreachable`  : local sidecar isn't answering. App is dead-in-the-water.
 * - `backend-only`      : backend Socket.IO is down but core is alive — the
 *                         app stays usable, we just show a soft banner.
 * - `browser-mode`      : running in a plain browser (not Tauri desktop) and
 *                         the backend Socket.IO is not connected. Not an error
 *                         — just a UI-preview environment.
 * - `ok`                : everything healthy.
 */
export type BlockingState =
  | 'internet-offline'
  | 'core-unreachable'
  | 'backend-only'
  | 'browser-mode'
  | 'ok';

export const selectInternet = (s: RootState) => s.connectivity.internet;
export const selectCore = (s: RootState) => s.connectivity.core;
export const selectBackend = (s: RootState) => s.connectivity.backend;
export const selectConnectivityErrors = (s: RootState) => s.connectivity.lastError;

export const selectBlockingState = (s: RootState): BlockingState => {
  if (s.connectivity.internet === 'offline') return 'internet-offline';
  if (s.connectivity.core === 'unreachable') return 'core-unreachable';
  if (s.connectivity.backend === 'disconnected' || s.connectivity.backend === 'connecting') {
    // In browser mode (no Tauri runtime) the backend socket may legitimately
    // be disconnected because there is no local sidecar forwarding the
    // connection. Surface a non-alarming state instead of the "Reconnecting"
    // banner that implies something is broken.
    if (!isTauri()) return 'browser-mode';
    return 'backend-only';
  }
  return 'ok';
};
