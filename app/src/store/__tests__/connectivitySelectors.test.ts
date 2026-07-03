import { describe, expect, it, vi } from 'vitest';

import { isTauri } from '../../utils/tauriCommands/common';
import { selectBlockingState } from '../connectivitySelectors';
import type { ConnectivityState } from '../connectivitySlice';
import type { RootState } from '../index';

// Mock isTauri so we can test both Tauri and browser-mode paths.
vi.mock('../../utils/tauriCommands/common', () => ({ isTauri: vi.fn(() => false) }));

const mockIsTauri = vi.mocked(isTauri);

const make = (over: Partial<ConnectivityState>): RootState =>
  ({
    // The selector only reads `connectivity`. Cast through unknown so we don't
    // have to fabricate the rest of the root state.
    connectivity: {
      internet: 'online',
      core: 'reachable',
      backend: 'connected',
      lastError: {},
      ...over,
    },
  }) as unknown as RootState;

describe('selectBlockingState', () => {
  it('returns ok when all three channels are healthy', () => {
    expect(selectBlockingState(make({}))).toBe('ok');
  });

  it('prioritises internet outage over everything else', () => {
    expect(
      selectBlockingState(
        make({ internet: 'offline', core: 'unreachable', backend: 'disconnected' })
      )
    ).toBe('internet-offline');
  });

  it('returns core-unreachable when only the sidecar is down', () => {
    expect(selectBlockingState(make({ core: 'unreachable' }))).toBe('core-unreachable');
  });

  it('returns backend-only when just the websocket is degraded (Tauri)', () => {
    mockIsTauri.mockReturnValue(true);
    expect(selectBlockingState(make({ backend: 'disconnected' }))).toBe('backend-only');
    expect(selectBlockingState(make({ backend: 'connecting' }))).toBe('backend-only');
  });

  it('returns browser-mode when websocket is degraded outside Tauri', () => {
    mockIsTauri.mockReturnValue(false);
    expect(selectBlockingState(make({ backend: 'disconnected' }))).toBe('browser-mode');
    expect(selectBlockingState(make({ backend: 'connecting' }))).toBe('browser-mode');
  });
});
