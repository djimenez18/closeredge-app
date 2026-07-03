/**
 * Service and daemon management commands.
 */
import { invoke } from '@tauri-apps/api/core';

import { callCoreRpc } from '../../services/coreRpcClient';
import { CommandResponse, isTauri, parseServiceCliOutput } from './common';

export type ServiceState = 'Running' | 'Stopped' | 'NotInstalled' | { Unknown: string };

export interface ServiceStatus {
  state: ServiceState;
  unit_path?: string | null;
  label: string;
  details?: string | null;
}

export interface AgentServerStatus {
  running: boolean;
  url: string;
}

export interface DaemonHostConfig {
  show_tray: boolean;
}

export interface RestartStatus {
  accepted: boolean;
  source: string;
  reason: string;
}

export async function openhumanServiceInstall(): Promise<CommandResponse<ServiceStatus>> {
  if (!isTauri()) {
    return { result: { state: 'NotInstalled', label: 'browser-mode' }, logs: [] };
  }
  try {
    return await callCoreRpc<CommandResponse<ServiceStatus>>({
      method: 'openhuman.service_install',
    });
  } catch {
    const raw = await invoke<string>('service_install_direct');
    return parseServiceCliOutput<ServiceStatus>(raw);
  }
}

export async function openhumanServiceStart(): Promise<CommandResponse<ServiceStatus>> {
  if (!isTauri()) {
    return { result: { state: 'NotInstalled', label: 'browser-mode' }, logs: [] };
  }
  try {
    return await callCoreRpc<CommandResponse<ServiceStatus>>({ method: 'openhuman.service_start' });
  } catch {
    const raw = await invoke<string>('service_start_direct');
    return parseServiceCliOutput<ServiceStatus>(raw);
  }
}

export async function openhumanServiceStop(): Promise<CommandResponse<ServiceStatus>> {
  if (!isTauri()) {
    return { result: { state: 'NotInstalled', label: 'browser-mode' }, logs: [] };
  }
  try {
    return await callCoreRpc<CommandResponse<ServiceStatus>>({ method: 'openhuman.service_stop' });
  } catch {
    const raw = await invoke<string>('service_stop_direct');
    return parseServiceCliOutput<ServiceStatus>(raw);
  }
}

export async function openhumanServiceStatus(): Promise<CommandResponse<ServiceStatus>> {
  if (!isTauri()) {
    return { result: { state: 'NotInstalled', label: 'browser-mode' }, logs: [] };
  }
  try {
    return await callCoreRpc<CommandResponse<ServiceStatus>>({
      method: 'openhuman.service_status',
    });
  } catch {
    const raw = await invoke<string>('service_status_direct');
    return parseServiceCliOutput<ServiceStatus>(raw);
  }
}

export async function openhumanServiceUninstall(): Promise<CommandResponse<ServiceStatus>> {
  if (!isTauri()) {
    return { result: { state: 'NotInstalled', label: 'browser-mode' }, logs: [] };
  }
  try {
    return await callCoreRpc<CommandResponse<ServiceStatus>>({
      method: 'openhuman.service_uninstall',
    });
  } catch {
    const raw = await invoke<string>('service_uninstall_direct');
    return parseServiceCliOutput<ServiceStatus>(raw);
  }
}

export async function openhumanServiceRestart(
  source?: string,
  reason?: string
): Promise<CommandResponse<RestartStatus>> {
  if (!isTauri()) {
    return {
      result: { accepted: false, source: 'browser-mode', reason: 'Not available in browser mode' },
      logs: [],
    };
  }
  return await callCoreRpc<CommandResponse<RestartStatus>>({
    method: 'openhuman.service_restart',
    params: { source, reason },
  });
}

export async function openhumanAgentServerStatus(): Promise<CommandResponse<AgentServerStatus>> {
  if (!isTauri()) {
    // Browser mode — no local sidecar. Return a non-running stub so callers
    // degrade gracefully instead of spamming "Not running in Tauri" errors.
    return { result: { running: false, url: '' }, logs: [] };
  }
  return await callCoreRpc<CommandResponse<AgentServerStatus>>({
    method: 'openhuman.agent_server_status',
  });
}

export async function openhumanGetDaemonHostConfig(): Promise<CommandResponse<DaemonHostConfig>> {
  if (!isTauri()) {
    return { result: { show_tray: false }, logs: [] };
  }
  return await callCoreRpc<CommandResponse<DaemonHostConfig>>({
    method: 'openhuman.service_daemon_host_get',
  });
}

export async function openhumanSetDaemonHostConfig(
  showTray: boolean
): Promise<CommandResponse<DaemonHostConfig>> {
  if (!isTauri()) {
    return { result: { show_tray: showTray }, logs: [] };
  }
  return await callCoreRpc<CommandResponse<DaemonHostConfig>>({
    method: 'openhuman.service_daemon_host_set',
    params: { show_tray: showTray },
  });
}
