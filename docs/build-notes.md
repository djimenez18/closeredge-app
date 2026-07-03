# Rust Crate Naming: Rebrand Build Notes

## Current State

### Cargo.toml (rebranded)
- Package name: `closeredge`
- Binary: `closeredge-core` (path: `src/main.rs`)
- Library: `closeredge_core` (crate-type: `rlib`)

### Source Structure (unchanged)
- `src/lib.rs` declares `pub mod openhuman` (the actual module tree lives at `src/openhuman/`)
- `src/main.rs` uses `closeredge_core::` everywhere (already correct)
- `tests/` (114 files) all use `closeredge_core::` (already correct)
- Internal modules use `use crate::openhuman::` (works regardless of crate name)

### Why It Compiles

The Rust module system separates the **crate name** (set by `[lib] name` in
Cargo.toml) from the **module tree** (set by `pub mod` declarations in
`lib.rs`). The Cargo.toml renames the crate to `closeredge_core`, so external
consumers (binaries, integration tests) write `closeredge_core::openhuman::*`.
Inside the crate itself, code uses `crate::openhuman::*` which resolves
correctly regardless of the crate's public name.

No compatibility shim is needed in `lib.rs` because:
1. The `src/openhuman/` directory is a **module**, not the crate root.
2. All external access paths go through `closeredge_core::openhuman::...`
3. All internal access paths go through `crate::openhuman::...`
4. Neither of these reference the old crate name `openhuman_core`.

## What Was Fixed

### Compilation-breaking issues (fixed)
Four binary crates in `src/bin/` still used `use openhuman_core::` import
statements, which fail because the crate is now named `closeredge_core`:

| File | Occurrences | Status |
|------|-------------|--------|
| `src/bin/slack_backfill.rs` | 11 (imports + comments) | Fixed |
| `src/bin/gmail_backfill_3d.rs` | 7 (imports) | Fixed |
| `src/bin/inference_probe.rs` | 6 (imports + comments) | Fixed |
| `src/bin/memory_tree_init_smoke.rs` | 2 (imports) | Fixed |

### Doc-test issues (fixed)
Three files had `openhuman_core::` in rustdoc code examples (`/// use
openhuman_core::...`). These would fail `cargo test --doc`:

| File | Status |
|------|--------|
| `src/openhuman/util.rs` | Fixed |
| `src/openhuman/tools/schema.rs` | Fixed |
| `src/openhuman/tokenjuice/mod.rs` | Fixed |

## What Still References "openhuman_core" (non-breaking)

### Tracing/logging targets (low priority)
Several `tracing::` macros use `target: "openhuman_core::config"` etc. These
affect log filtering (e.g. `RUST_LOG=openhuman_core::config=debug`) but do not
break compilation. They should be updated when a full rename pass is done.

Files: `src/openhuman/config/ops.rs` (6 occurrences), `src/core/logging.rs`
(filter construction for autocomplete mode).

### Code comments (cosmetic)
Descriptive comments in `src/core/observability.rs`, `src/openhuman/agent/bus.rs`,
`src/core/event_bus/testing.rs`, `src/openhuman/accessibility/automation_state.rs`,
and `src/openhuman/memory_tree/retrieval/benchmarks.rs` mention `openhuman_core`
as prose. No runtime or compile-time impact.

### On-disk data format markers (DO NOT CHANGE)
`src/openhuman/memory_store/content/compose.rs` writes `"openhuman_core_version: ..."`
into memory-tree `.md` files and parses it back. This is a **serialized data
format string**. Changing it would break backward compatibility with all
existing user workspaces. Leave as-is permanently, or introduce versioned
migration logic.

## Environment Variables (still OPENHUMAN_*)

All environment variables still use the `OPENHUMAN_` prefix. There are ~140
unique env vars. Renaming these is a **breaking change** for every user's
`.env` file, CI pipeline, Docker Compose config, and systemd unit. This should
be done as a coordinated release with migration support.

### Critical env vars (most impactful)

| Current Name | Purpose | Suggested New Name |
|---|---|---|
| `OPENHUMAN_WORKSPACE` | Root workspace directory | `CLOSEREDGE_WORKSPACE` |
| `OPENHUMAN_CORE_TOKEN` | RPC auth token | `CLOSEREDGE_CORE_TOKEN` |
| `OPENHUMAN_CORE_HOST` | Server bind address | `CLOSEREDGE_CORE_HOST` |
| `OPENHUMAN_CORE_PORT` | Server listen port | `CLOSEREDGE_CORE_PORT` |
| `OPENHUMAN_CORE_SENTRY_DSN` | Error tracking DSN | `CLOSEREDGE_CORE_SENTRY_DSN` |
| `OPENHUMAN_SENTRY_DSN` | Legacy Sentry DSN | `CLOSEREDGE_SENTRY_DSN` |
| `OPENHUMAN_APP_ENV` | staging/production | `CLOSEREDGE_APP_ENV` |
| `OPENHUMAN_DOTENV_PATH` | Custom .env path | `CLOSEREDGE_DOTENV_PATH` |
| `OPENHUMAN_BUILD_SHA` | Git SHA at build time | `CLOSEREDGE_BUILD_SHA` |
| `OPENHUMAN_CORE_ALLOWED_ORIGINS` | CORS allowlist | `CLOSEREDGE_CORE_ALLOWED_ORIGINS` |
| `OPENHUMAN_CORE_RPC_URL` | RPC base URL | `CLOSEREDGE_CORE_RPC_URL` |
| `OPENHUMAN_TAURI_VERSION` | Desktop shell version | `CLOSEREDGE_TAURI_VERSION` |

### Full env var list (sorted)

<details>
<summary>All ~140 OPENHUMAN_* environment variables</summary>

- `OPENHUMAN_ALL_PROXY`
- `OPENHUMAN_ANALYTICS_ENABLED`
- `OPENHUMAN_APPROVAL_GATE`
- `OPENHUMAN_APP_ENV`
- `OPENHUMAN_APP_VERSION`
- `OPENHUMAN_AUTO_UPDATE_ENABLED`
- `OPENHUMAN_AUTO_UPDATE_INTERVAL_MINUTES`
- `OPENHUMAN_AUTO_UPDATE_RESTART_STRATEGY`
- `OPENHUMAN_AUTO_UPDATE_RPC_MUTATIONS_ENABLED`
- `OPENHUMAN_BATTERY_CHARGE`
- `OPENHUMAN_BRAVE_API_KEY`
- `OPENHUMAN_BROWSER_ALLOW_ALL`
- `OPENHUMAN_BROWSER_ALLOW_ALL_RPC_ENABLE`
- `OPENHUMAN_BUILD_SHA`
- `OPENHUMAN_CEF_COOKIES_DB`
- `OPENHUMAN_CODEGRAPH_DENSE_MIN_FILES`
- `OPENHUMAN_CONTEXT_AUTOCOMPACT_ENABLED`
- `OPENHUMAN_CONTEXT_ENABLED`
- `OPENHUMAN_CONTEXT_MICROCOMPACT_ENABLED`
- `OPENHUMAN_CONTEXT_SUMMARIZER_MODEL`
- `OPENHUMAN_CONTEXT_TOOL_RESULT_BUDGET_BYTES`
- `OPENHUMAN_CORE_ALLOWED_ORIGINS`
- `OPENHUMAN_CORE_BIN`
- `OPENHUMAN_CORE_HOST`
- `OPENHUMAN_CORE_PORT`
- `OPENHUMAN_CORE_RPC_PORT`
- `OPENHUMAN_CORE_RPC_URL`
- `OPENHUMAN_CORE_SENTRY_DSN`
- `OPENHUMAN_CORE_TOKEN`
- `OPENHUMAN_CURL_LIVE_TEST`
- `OPENHUMAN_DEPLOYMENT`
- `OPENHUMAN_DICTATION_ACTIVATION_MODE`
- `OPENHUMAN_DICTATION_ENABLED`
- `OPENHUMAN_DICTATION_HOTKEY`
- `OPENHUMAN_DICTATION_LLM_REFINEMENT`
- `OPENHUMAN_DICTATION_STREAMING`
- `OPENHUMAN_DICTATION_STREAMING_INTERVAL_MS`
- `OPENHUMAN_DISABLE_CHANNEL_LISTENERS`
- `OPENHUMAN_DOTENV_PATH`
- `OPENHUMAN_EMAIL_CAPTURE_DIR`
- `OPENHUMAN_GITBOOKS_LIVE_TEST`
- `OPENHUMAN_HOME`
- `OPENHUMAN_HTTPS_PROXY`
- `OPENHUMAN_HTTP_PROXY`
- `OPENHUMAN_KEYRING_BACKEND`
- `OPENHUMAN_LEARNING_ENABLED`
- `OPENHUMAN_LEARNING_EPISODIC_CAPTURE_ENABLED`
- `OPENHUMAN_LEARNING_EXPLICIT_PREFERENCES_ENABLED`
- `OPENHUMAN_LEARNING_MAX_REFLECTIONS_PER_SESSION`
- `OPENHUMAN_LEARNING_MIN_TURN_COMPLEXITY`
- `OPENHUMAN_LEARNING_REFLECTION_ENABLED`
- `OPENHUMAN_LEARNING_REFLECTION_SOURCE`
- `OPENHUMAN_LEARNING_STM_RECALL_ENABLED`
- `OPENHUMAN_LEARNING_TOOL_MEMORY_CAPTURE_ENABLED`
- `OPENHUMAN_LEARNING_TOOL_TRACKING_ENABLED`
- `OPENHUMAN_LEARNING_UNIFIED_COMPACTION_ENABLED`
- `OPENHUMAN_LEARNING_USER_PROFILE_ENABLED`
- `OPENHUMAN_LIVE_LMSTUDIO_MODEL`
- `OPENHUMAN_LIVE_OLLAMA_MODEL`
- `OPENHUMAN_LM_STUDIO_BASE_URL`
- `OPENHUMAN_LOCAL_AI_TIER`
- `OPENHUMAN_LOCAL_INFERENCE_URL`
- `OPENHUMAN_LOG_FILE_CONSTRAINTS`
- `OPENHUMAN_LOG_PROMPTS`
- `OPENHUMAN_LSP_ENABLED`
- `OPENHUMAN_MAX_ACTIONS_PER_HOUR`
- `OPENHUMAN_MEMORY_EMBED_ENDPOINT`
- `OPENHUMAN_MEMORY_EMBED_MODEL`
- `OPENHUMAN_MEMORY_EMBED_RATE_LIMIT`
- `OPENHUMAN_MEMORY_EMBED_STRICT`
- `OPENHUMAN_MEMORY_EMBED_TIMEOUT_MS`
- `OPENHUMAN_MEMORY_EXTRACT_ENDPOINT`
- `OPENHUMAN_MEMORY_EXTRACT_MODEL`
- `OPENHUMAN_MEMORY_EXTRACT_TIMEOUT_MS`
- `OPENHUMAN_MEMORY_SUMMARISE_ENDPOINT`
- `OPENHUMAN_MEMORY_SUMMARISE_MODEL`
- `OPENHUMAN_MEMORY_SUMMARISE_TIMEOUT_MS`
- `OPENHUMAN_MEMORY_TREE_CLOUD_LLM_MODEL`
- `OPENHUMAN_MEMORY_TREE_CONTENT_DIR`
- `OPENHUMAN_MEMORY_TREE_LLM_BACKEND`
- `OPENHUMAN_MEMORY_TREE_SMART_WALK_MODEL`
- `OPENHUMAN_MODEL`
- `OPENHUMAN_NODE_CACHE_DIR`
- `OPENHUMAN_NODE_ENABLED`
- `OPENHUMAN_NODE_PREFER_SYSTEM`
- `OPENHUMAN_NODE_VERSION`
- `OPENHUMAN_NO_PROXY`
- `OPENHUMAN_OLLAMA_BASE_URL`
- `OPENHUMAN_OLLAMA_INSTALL_DIR`
- `OPENHUMAN_ON_AC_POWER`
- `OPENHUMAN_OUTPUT_LANGUAGE`
- `OPENHUMAN_PARALLEL_API_KEY`
- `OPENHUMAN_PIPER_RELEASE_BASE_URL`
- `OPENHUMAN_PIPER_VOICES_BASE_URL`
- `OPENHUMAN_PROJECTS_DIR`
- `OPENHUMAN_PROMPT_DUMP_DIR`
- `OPENHUMAN_PROMPT_INJECTION_CLASSIFIER`
- `OPENHUMAN_PROXY_ENABLED`
- `OPENHUMAN_PROXY_SCOPE`
- `OPENHUMAN_PROXY_SERVICES`
- `OPENHUMAN_QUERIT_API_KEY`
- `OPENHUMAN_REASONING_ENABLED`
- `OPENHUMAN_RESTART_DELAY_MS`
- `OPENHUMAN_RUNTIME_PYTHON_CACHE_DIR`
- `OPENHUMAN_RUNTIME_PYTHON_ENABLED`
- `OPENHUMAN_RUNTIME_PYTHON_MANAGED_RELEASE_TAG`
- `OPENHUMAN_RUNTIME_PYTHON_MINIMUM_VERSION`
- `OPENHUMAN_RUNTIME_PYTHON_PREFERRED_COMMAND`
- `OPENHUMAN_RUNTIME_PYTHON_PREFER_SYSTEM`
- `OPENHUMAN_SCREEN_INTELLIGENCE_MOCK_VISION_JSON`
- `OPENHUMAN_SEARCH_ENGINE`
- `OPENHUMAN_SEARCH_MAX_RESULTS`
- `OPENHUMAN_SEARCH_TIMEOUT_SECS`
- `OPENHUMAN_SEARXNG_BASE_URL`
- `OPENHUMAN_SEARXNG_DEFAULT_LANGUAGE`
- `OPENHUMAN_SEARXNG_ENABLED`
- `OPENHUMAN_SEARXNG_MAX_RESULTS`
- `OPENHUMAN_SEARXNG_TIMEOUT_SECONDS`
- `OPENHUMAN_SEARXNG_TIMEOUT_SECS`
- `OPENHUMAN_SELTZ_API_KEY`
- `OPENHUMAN_SELTZ_API_URL`
- `OPENHUMAN_SELTZ_MAX_RESULTS`
- `OPENHUMAN_SENTRY_DSN`
- `OPENHUMAN_SERVICE_MOCK`
- `OPENHUMAN_SERVICE_MOCK_STATE_FILE`
- `OPENHUMAN_SLACK_BACKFILL_DAYS`
- `OPENHUMAN_SLACK_DUMP_DIR`
- `OPENHUMAN_SLACK_INTER_CALL_PACING_MS`
- `OPENHUMAN_TAURI_VERSION`
- `OPENHUMAN_TELEGRAM_API_BASE`
- `OPENHUMAN_TELEGRAM_BOT_API_BASE`
- `OPENHUMAN_TELEGRAM_BOT_USERNAME`
- `OPENHUMAN_TEMPERATURE`
- `OPENHUMAN_TEST_EXTRACT_CHUNK_BUDGET`
- `OPENHUMAN_TEST_FLAG_A`
- `OPENHUMAN_TEST_HANDOFF_THRESHOLD_TOKENS`
- `OPENHUMAN_TEST_OS_KEYCHAIN`
- `OPENHUMAN_TEST_VAR`
- `OPENHUMAN_TOOL_TIMEOUT_SECS`
- `OPENHUMAN_TRIGGER_TRIAGE_DISABLED`
- `OPENHUMAN_WALLET_RPC_ARBITRUM`
- `OPENHUMAN_WALLET_RPC_BASE`
- `OPENHUMAN_WALLET_RPC_BSC`
- `OPENHUMAN_WALLET_RPC_BTC`
- `OPENHUMAN_WALLET_RPC_EVM`
- `OPENHUMAN_WALLET_RPC_OPTIMISM`
- `OPENHUMAN_WALLET_RPC_POLYGON`
- `OPENHUMAN_WALLET_RPC_SOLANA`
- `OPENHUMAN_WALLET_RPC_TRON`
- `OPENHUMAN_WEBVIEW_APIS_PORT`
- `OPENHUMAN_WEB_SEARCH_ENABLED`
- `OPENHUMAN_WEB_SEARCH_MAX_RESULTS`
- `OPENHUMAN_WEB_SEARCH_TIMEOUT_SECS`
- `OPENHUMAN_WHISPER_MODELS_BASE_URL`
- `OPENHUMAN_WORKSPACE`

</details>

## Steps for Full Rename (Low Priority)

A complete rename from `openhuman` to `closeredge` in the Rust source would
touch approximately:

- **176 files** using `use crate::openhuman::` (internal module references)
- **~1003 occurrences** of the `OPENHUMAN_` prefix across the codebase
- **The `src/openhuman/` directory** itself (rename to `src/closeredge/`)
- **On-disk data format** in `memory_store/content/compose.rs` (needs migration)
- **All tracing targets** (`target: "openhuman_core::..."`)
- **All gitbooks/docs** referencing old names
- **CI/CD pipelines** (`.github/workflows/`)
- **TypeScript frontend** (`app/` directory references to env vars, binary names)

### Recommended approach

1. **Phase 1** (done): Cargo.toml rename + bin import fixes (this document)
2. **Phase 2**: Rename `src/openhuman/` to `src/closeredge/`, bulk-update all
   `crate::openhuman::` to `crate::closeredge::` and `pub mod openhuman` to
   `pub mod closeredge` in lib.rs. Add `pub use closeredge as openhuman;` shim
   in lib.rs for backward compat during transition.
3. **Phase 3**: Introduce dual-read env vars (`CLOSEREDGE_WORKSPACE` with
   `OPENHUMAN_WORKSPACE` fallback) via a helper function, migrate over 2-3
   releases.
4. **Phase 4**: Remove old `OPENHUMAN_*` fallbacks, update all docs and CI.
5. **Phase 5**: Remove `openhuman_core_version` from on-disk format (needs
   content migration or version-aware parser).
