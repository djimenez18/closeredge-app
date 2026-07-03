// Frontend service for the "Join a Google Meet call" feature.
//
// Two-phase request:
//  1. Call the core RPC `openhuman.meet_join_call` to validate inputs and
//     mint a stable `request_id`. The core also logs the request — useful
//     for an eventual call audit trail.
//  2. Invoke the Tauri command `meet_call_open_window` to actually open
//     the dedicated CEF webview window at the Meet URL.
//
// Splitting it this way keeps platform-specific window code in the shell
// while the validation rules live (and are tested) in the core.
import { invoke } from '@tauri-apps/api/core';

import { isTauri } from '../utils/tauriCommands/common';
import { callCoreRpc } from './coreRpcClient';

export type MeetJoinCallInput = {
  meetUrl: string;
  /** Bot's display name in Meet's "Your name" prompt. */
  displayName: string;
  /**
   * The launching user's display name as it will appear in the Meet
   * call. This is the *only* speaker the in-call wake-word gate will
   * accept — captions from any other participant are dropped before
   * tools can be dispatched. Empty / missing fails closed in core
   * (no wakes fire) which is the safe default during the rollout.
   */
  ownerDisplayName?: string;
};

export type MeetJoinCallResult = {
  requestId: string;
  meetUrl: string;
  displayName: string;
  ownerDisplayName: string;
  windowLabel: string;
};

type CoreJoinResponse = { ok: boolean; request_id: string; meet_url: string; display_name: string };

export async function joinMeetCall(input: MeetJoinCallInput): Promise<MeetJoinCallResult> {
  const meetUrl = input.meetUrl.trim();
  const displayName = input.displayName.trim();
  const ownerDisplayName = (input.ownerDisplayName ?? '').trim();

  if (!meetUrl) throw new Error('Please paste a Google Meet link.');
  if (!displayName) throw new Error('Please enter a display name.');
  // Owner name is the privacy lock — captions from anyone else are
  // refused by the core wake gate. Surfacing the requirement up front
  // keeps the user from sitting through the join only to find the bot
  // ignores them; matches the message the inline alert would show.
  if (!ownerDisplayName) {
    throw new Error(
      'Please enter your own name as it will appear in the Meet so CloserEdge AI knows who to listen to.'
    );
  }
  // Refuse early outside the desktop shell so the browser dev surface
  // (`pnpm dev`) doesn't mint a stray request_id on the core for a join
  // attempt that has no chance of opening a CEF window.
  if (!isTauri()) {
    throw new Error(
      'Joining a Meet call requires the desktop app. Run `pnpm tauri dev` and try again.'
    );
  }

  const rpcResult = await callCoreRpc<CoreJoinResponse>({
    method: 'openhuman.meet_join_call',
    params: { meet_url: meetUrl, display_name: displayName },
  });

  if (!rpcResult?.ok || !rpcResult.request_id) {
    throw new Error('Core rejected the meet_join_call request.');
  }

  let windowLabel: string;
  try {
    windowLabel = await invoke<string>('meet_call_open_window', {
      args: {
        request_id: rpcResult.request_id,
        meet_url: rpcResult.meet_url,
        display_name: rpcResult.display_name,
        // Owner name doesn't round-trip through meet_join_call (the
        // RPC is platform-agnostic validation only) — pass it
        // directly to the shell so the meet_audio start path can
        // hand it to the wake-word gate. See feat/mascot-meet-flowA
        // Plan C — owner-only privacy lock.
        owner_display_name: ownerDisplayName,
      },
    });
  } catch (err) {
    // Tauri v2 rejects with a String (the Err side of `Result<_, String>`),
    // not a JS Error. Wrap so the UI catch block — which checks
    // `instanceof Error` — surfaces the real reason instead of a fallback.
    const reason =
      err instanceof Error ? err.message : typeof err === 'string' ? err : JSON.stringify(err);
    console.error('[meet-call] meet_call_open_window invoke rejected:', err);
    throw new Error(`meet_call_open_window failed: ${reason}`);
  }

  return {
    requestId: rpcResult.request_id,
    meetUrl: rpcResult.meet_url,
    displayName: rpcResult.display_name,
    ownerDisplayName,
    windowLabel,
  };
}

export async function closeMeetCall(requestId: string): Promise<boolean> {
  if (!isTauri()) return false;
  return invoke<boolean>('meet_call_close_window', { requestId });
}

/**
 * One completed Meet call as persisted by the core in the JSONL
 * recent-calls log (written by `handle_stop_session`). Same shape
 * as `MeetCallRecord` in `src/openhuman/meet_agent/store.rs` —
 * snake_case fields because the core surfaces them verbatim.
 */
export interface MeetCallRecord {
  request_id: string;
  meet_url: string;
  bot_display_name: string;
  owner_display_name: string;
  started_at_ms: number;
  ended_at_ms: number;
  listened_seconds: number;
  spoken_seconds: number;
  turn_count: number;
}

interface CoreListCallsResponse {
  ok: boolean;
  calls: MeetCallRecord[];
  count: number;
}

/**
 * Fetch the most recent completed Meet calls (newest first). Used
 * by the Skills "Meeting Bots" modal to render a history list
 * underneath the join form. Returns an empty array on a fresh
 * install (no recorded calls yet) — the core treats a missing
 * JSONL file as "no rows" rather than an error.
 */
export async function listMeetCalls(limit = 20): Promise<MeetCallRecord[]> {
  const result = await callCoreRpc<CoreListCallsResponse>({
    method: 'openhuman.meet_agent_list_calls',
    params: { limit },
  });
  if (!result?.ok) {
    throw new Error('Core rejected the meet_agent_list_calls request.');
  }
  return result.calls ?? [];
}
