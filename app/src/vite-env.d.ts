/// <reference types="vite/client" />

interface ImportMetaEnv {
  // CloserEdge env vars (canonical)
  readonly VITE_CLOSEREDGE_APP_ENV?: string;
  readonly VITE_CLOSEREDGE_CORE_RPC_URL?: string;
  readonly VITE_CLOSEREDGE_E2E_DEFAULT_CORE_MODE?: string;
  readonly VITE_CLOSEREDGE_E2E_RESTART_APP_AS_RELOAD?: string;
  readonly VITE_CLOSEREDGE_TARGET?: string;
  // Legacy aliases (kept for backward compatibility with CI / scripts)
  readonly VITE_OPENHUMAN_APP_ENV?: string;
  readonly VITE_OPENHUMAN_CORE_RPC_URL?: string;
  readonly VITE_OPENHUMAN_E2E_DEFAULT_CORE_MODE?: string;
  readonly VITE_OPENHUMAN_E2E_RESTART_APP_AS_RELOAD?: string;
  // Shared
  readonly VITE_BACKEND_URL?: string;
  readonly VITE_SKILLS_GITHUB_REPO?: string;
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_SENTRY_SMOKE_TEST?: string;
  readonly VITE_BUILD_SHA?: string;
  readonly VITE_DEV_JWT_TOKEN?: string;
  readonly VITE_DEV_FORCE_ONBOARDING?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_CONSUMER_FIRST_SESSION?: string;
  readonly VITE_GA_MEASUREMENT_ID?: string;
  readonly VITE_GA_FORCE_DEV?: string;
  readonly VITE_TOOL_TIMEOUT_SECS?: string;
  readonly VITE_CORE_RPC_TIMEOUT_MS?: string;
  readonly VITE_TELEGRAM_BOT_USERNAME?: string;
  readonly VITE_MINIMUM_SUPPORTED_APP_VERSION?: string;
  readonly VITE_LATEST_APP_DOWNLOAD_URL?: string;
  readonly VITE_MASCOT_VOICE_ID?: string;
  readonly VITE_MASCOT_VOICE_MODEL_ID?: string;
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly MODE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Node.js polyfills for browser
declare global {
  interface Window {
    Buffer: typeof Buffer;
    process: typeof process;
    util: typeof import('util');
  }
  var Buffer: typeof import('buffer').Buffer;
  var process: typeof import('process');
  var util: typeof import('util');
}
