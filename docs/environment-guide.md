# CloserEdge AI -- Environment Variable Guide

> Copy `.env.closeredge` to `.env` and fill in your values.
> Frontend-only overrides go in `app/.env.local` (only `VITE_`-prefixed vars are browser-exposed).

---

## Quick Start: What Do I Actually Need?

| Deployment          | Minimum Required Variables                                                                                  |
|---------------------|-------------------------------------------------------------------------------------------------------------|
| **Local desktop**   | One LLM API key (`ANTHROPIC_API_KEY` or `OPENAI_API_KEY`), `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`   |
| **Docker / cloud**  | Same as local + `CLOSEREDGE_CORE_TOKEN` + `CLOSEREDGE_SUPABASE_URL` + `CLOSEREDGE_SUPABASE_SERVICE_ROLE_KEY`|
| **Full production** | All of the above + `STRIPE_*` keys + `COMPOSIO_API_KEY` + voice keys (if Pro/Elite)                        |

---

## Variable Reference by Section

### App Environment

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CLOSEREDGE_APP_ENV` | No | `production` | Environment selector: `production` or `staging`. Controls backend URL defaults and workspace directory. |
| `BACKEND_URL` | No | Derived from `APP_ENV` | Primary backend URL. Production: `https://api.closeredge.ai`. Staging: `https://staging-api.closeredge.ai`. |
| `VITE_CLOSEREDGE_APP_ENV` | No | Mirrors `CLOSEREDGE_APP_ENV` | Frontend mirror of app environment. |
| `VITE_BACKEND_URL` | No | Mirrors `BACKEND_URL` | Frontend mirror of backend URL. Only used when running outside Tauri (web preview, Storybook). |

### Supabase Auth

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_SUPABASE_URL` | **Yes** | -- | Supabase project URL. Used by the frontend for client-side auth and data access. |
| `VITE_SUPABASE_ANON_KEY` | **Yes** | -- | Supabase anonymous (public) key for client-side auth. |
| `CLOSEREDGE_SUPABASE_URL` | **Server** | -- | Server-side Supabase URL. Used by webhook functions and admin operations. |
| `CLOSEREDGE_SUPABASE_SERVICE_ROLE_KEY` | **Server** | -- | Server-side Supabase service role key. Bypasses RLS for direct DB writes. |
| `JWT_TOKEN` | No | -- | Session JWT for QuickJS skills sandbox OAuth proxy and debug scripts. Get from login flow or browser devtools. |

### LLM Model Routing

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | **One required** | -- | Anthropic API key for direct Claude access. |
| `OPENAI_API_KEY` | **One required** | -- | OpenAI API key for GPT models. |
| `OPENROUTER_API_KEY` | **One required** | -- | OpenRouter API key (recommended for production). Routes to multiple providers with cost management. |
| `CLOSEREDGE_MODEL_PROVIDER` | No | `anthropic` | Active provider: `openrouter`, `anthropic`, or `openai`. |
| `CLOSEREDGE_MODEL` | No | Provider default | Override the default model. E.g. `claude-sonnet-4-20250514`. |
| `CLOSEREDGE_TEMPERATURE` | No | `0.7` | Default LLM temperature (0.0 - 2.0). |
| `CLOSEREDGE_REASONING_ENABLED` | No | -- | Enable reasoning/thinking mode for supported models. |

**Provider model defaults:**

| Provider | Fast | Balanced | Powerful | Coding |
|----------|------|----------|----------|--------|
| OpenRouter | claude-haiku-4.5 | claude-sonnet-4 | claude-opus-4 | claude-sonnet-4 |
| Anthropic | claude-haiku-4.5 | claude-sonnet-4 | claude-opus-4 | claude-sonnet-4 |
| OpenAI | gpt-4.1-mini | gpt-4.1 | o3 | gpt-4.1 |

### Core Process

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CLOSEREDGE_CORE_HOST` | No | `127.0.0.1` | Bind address. Use `0.0.0.0` for Docker/cloud. |
| `CLOSEREDGE_CORE_PORT` | No | `7788` | Core server port. |
| `CLOSEREDGE_CORE_RPC_URL` | No | `http://127.0.0.1:7788/rpc` | JSON-RPC endpoint URL. |
| `CLOSEREDGE_CORE_TOKEN` | **Cloud** | -- | Bearer token for `/rpc` auth. **Required for Docker/cloud/VPS.** Generate with `openssl rand -hex 32`. Desktop auto-generates per launch. |
| `CLOSEREDGE_CORE_ALLOWED_ORIGINS` | No | -- | Extra CORS origins (comma-separated) for JSON-RPC. Tauri and loopback are always allowed. |
| `CLOSEREDGE_CORE_RUN_MODE` | No | `child` | Run mode: `child` (spawns sidecar) or `inprocess`. |
| `CLOSEREDGE_CORE_BIN` | No | Auto-detect | Override path to closeredge core binary. |
| `CLOSEREDGE_DOTENV_PATH` | No | -- | Explicit .env path for `closeredge serve`. Must be set in parent environment. |
| `CLOSEREDGE_WORKSPACE` | No | `~/.closeredge` | Workspace directory. Staging uses `~/.closeredge-staging`. |
| `CLOSEREDGE_MAX_ACTIONS_PER_HOUR` | No | `20` | Safety cap for side-effecting tool actions per rolling hour. Set to 0 to block all. |
| `CLOSEREDGE_TOOL_TIMEOUT_SECS` | No | `120` | Operator override for tool/agent action timeout (1-3600 seconds). |
| `CLOSEREDGE_OUTPUT_LANGUAGE` | No | -- | Language for background LLM artifacts. Accepts locale tags like `zh-CN`. |

### Agent Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CLOSEREDGE_AGENT` | **Yes** | `eden` | Which product agent to activate. See agent types below. |
| `CLOSEREDGE_TIER` | **Yes** | `foundation` | Subscription tier. Controls feature gates. |

**Agent types:**

| Agent | Industry | Description |
|-------|----------|-------------|
| `eden` | Residential real estate | Lead capture, nurture, transaction coordination |
| `crest` | Commercial real estate | Tenant screening, lease management, deal flow |
| `forge` | Home services | Lead routing, job scheduling, customer follow-up |
| `haven` | Medical/dental | Patient scheduling, follow-ups, review management |
| `lexis` | Law office | Intake automation, case management, client communication |
| `nora` | Property management | Tenant communication, maintenance coordination, lease tracking |

**Tier feature matrix:**

| Feature | Foundation | Pro | Elite |
|---------|-----------|-----|-------|
| Core agents | Yes | Yes | Yes |
| Gmail/Calendar | Yes | Yes | Yes |
| Telegram/SMS | Yes | Yes | Yes |
| Brain Vault | Yes | Yes | Yes |
| Voice | -- | Yes | Yes |
| CRM Integration | -- | Yes | Yes |
| Advanced agents | -- | Yes | Yes |
| Strategy sessions | -- | -- | Yes |
| Custom brain tuning | -- | -- | Yes |
| Dedicated manager | -- | -- | Yes |

### Integrations (Composio)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `COMPOSIO_API_KEY` | No | -- | Composio API key for third-party integrations (Gmail, Calendar, CRM connectors). Set per client in Railway env vars. |

### Voice (Pro/Elite Tiers)

| Variable | Required | Tier | Default | Description |
|----------|----------|------|---------|-------------|
| `ELEVENLABS_API_KEY` | Pro+ | Pro, Elite | -- | ElevenLabs TTS API key for voice synthesis. |
| `ELEVENLABS_VOICE_ID` | No | Pro, Elite | `JBFqnCBsd6RMkjVDRZzb` ("George") | ElevenLabs voice ID. Override to A/B test voices. |
| `GROQ_API_KEY` | Pro+ | Pro, Elite | -- | Groq API key for Whisper STT (speech-to-text). |

### Stripe Billing

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `STRIPE_SECRET_KEY` | **Billing** | -- | Stripe secret key for server-side operations. Used by webhook handler and checkout scripts. |
| `STRIPE_WEBHOOK_SECRET` | **Billing** | -- | Stripe webhook signing secret for signature verification. |
| `VITE_STRIPE_CUSTOMER_PORTAL_URL` | No | `https://billing.stripe.com/p/login/test` | Stripe Customer Portal URL for subscription management UI. |

### Telegram

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CLOSEREDGE_TELEGRAM_BOT_USERNAME` | No | `closeredge_bot` | Bot username for managed DM linking. |
| `VITE_TELEGRAM_BOT_USERNAME` | No | `closeredge_bot` | Frontend mirror of bot username. |
| `CLOSEREDGE_TELEGRAM_API_BASE` | No | `https://api.telegram.org` | Override Telegram Bot API base URL. Used for E2E test mocking. |

### Web Search

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CLOSEREDGE_WEB_SEARCH_MAX_RESULTS` | No | `5` | Max results per web search query. |
| `CLOSEREDGE_WEB_SEARCH_TIMEOUT_SECS` | No | `10` | Search request timeout in seconds. |
| `SELTZ_API_KEY` | No | -- | Seltz search API key (fast, independent index). |
| `SELTZ_API_URL` | No | `https://api.seltz.ai/v1` | Override Seltz API base URL. |
| `CLOSEREDGE_SELTZ_MAX_RESULTS` | No | `10` | Default max Seltz results (1-20). |
| `QUERIT_API_KEY` | No | -- | Querit search API key. |
| `CLOSEREDGE_SEARXNG_ENABLED` | No | `false` | Enable the SearXNG search tool. |
| `CLOSEREDGE_SEARXNG_BASE_URL` | No | `http://localhost:8080` | SearXNG instance base URL. |
| `CLOSEREDGE_SEARXNG_MAX_RESULTS` | No | `10` | Max SearXNG results per query (1-50). |
| `CLOSEREDGE_SEARXNG_DEFAULT_LANGUAGE` | No | `en` | Default search language. |
| `CLOSEREDGE_SEARXNG_TIMEOUT_SECONDS` | No | `10` | SearXNG request timeout. |

### Local AI

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CLOSEREDGE_LOCAL_AI_TIER` | No | -- | Override model tier: `low`, `medium`, `high`. |
| `CLOSEREDGE_OLLAMA_BASE_URL` | No | `http://localhost:11434` | Ollama HTTP server URL. |
| `CLOSEREDGE_LM_STUDIO_BASE_URL` | No | `http://localhost:1234/v1` | LM Studio OpenAI-compatible server URL. |
| `WHISPER_BIN` | No | Auto-detect | Override path to whisper binary. |
| `PIPER_BIN` | No | Auto-detect | Override path to piper binary. |
| `OLLAMA_BIN` | No | Auto-detect | Override path to ollama binary. |

### Proxy

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CLOSEREDGE_PROXY_ENABLED` | No | `false` | Enable proxy routing. |
| `CLOSEREDGE_HTTP_PROXY` | No | -- | HTTP proxy URL. |
| `CLOSEREDGE_HTTPS_PROXY` | No | -- | HTTPS proxy URL. |
| `CLOSEREDGE_ALL_PROXY` | No | -- | Catch-all proxy URL. |
| `CLOSEREDGE_NO_PROXY` | No | -- | Comma-separated hosts to bypass proxy. |
| `CLOSEREDGE_PROXY_SCOPE` | No | -- | Proxy scope. |
| `CLOSEREDGE_PROXY_SERVICES` | No | -- | Comma-separated services to proxy. |

### Skills

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SKILLS_REGISTRY_URL` | No | -- | Override skills registry URL. Supports HTTP URLs and local file paths. |
| `SKILLS_LOCAL_DIR` | No | -- | Local skills source directory for development. |
| `VITE_SKILLS_GITHUB_REPO` | No | `closeredgeai/closeredge-skills` | GitHub repo for skills browser UI. |
| `CLOSEREDGE_SKILLS_WORKING_MEMORY_ENABLED` | No | `true` | Enable sync-derived user working memory extraction. |

### Python Runtime

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CLOSEREDGE_RUNTIME_PYTHON_ENABLED` | No | `true` | Enable Python for MCP servers and integrations. |
| `CLOSEREDGE_RUNTIME_PYTHON_MINIMUM_VERSION` | No | `3.12.0` | Minimum acceptable interpreter version. |
| `CLOSEREDGE_RUNTIME_PYTHON_PREFER_SYSTEM` | No | `false` | Reuse host interpreter before managed runtime. |
| `CLOSEREDGE_RUNTIME_PYTHON_PREFERRED_COMMAND` | No | `python3.12` | Preferred executable name or absolute path. |
| `CLOSEREDGE_RUNTIME_PYTHON_MANAGED_RELEASE_TAG` | No | Latest | Pin a specific python-build-standalone release. |
| `CLOSEREDGE_RUNTIME_PYTHON_CACHE_DIR` | No | -- | Cache directory for managed CPython installs. |

### Wallet RPC (Crypto)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CLOSEREDGE_WALLET_RPC_EVM` | No | `https://ethereum-rpc.publicnode.com` | EVM chain RPC URL. |
| `CLOSEREDGE_WALLET_RPC_BTC` | No | `https://blockstream.info/api` | Bitcoin chain RPC URL. |
| `CLOSEREDGE_WALLET_RPC_SOLANA` | No | `https://api.mainnet-beta.solana.com` | Solana chain RPC URL. |
| `CLOSEREDGE_WALLET_RPC_TRON` | No | `https://api.trongrid.io` | Tron chain RPC URL. |

### Error Reporting and Analytics

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CLOSEREDGE_CORE_SENTRY_DSN` | No | -- | Sentry DSN for Rust core error reporting. No PII is sent. |
| `VITE_SENTRY_DSN` | No | -- | Sentry DSN for React frontend. |
| `SENTRY_URL` | No | `sentry.io` | Override Sentry server URL. |
| `CLOSEREDGE_BUILD_SHA` | No | -- | Short git SHA for Sentry release tags. CI sets automatically. |
| `VITE_BUILD_SHA` | No | -- | Frontend mirror of build SHA. |
| `CLOSEREDGE_ANALYTICS_ENABLED` | No | `true` | Enable anonymized analytics and crash reports. |
| `VITE_GA_MEASUREMENT_ID` | No | -- | Google Analytics 4 Measurement ID. Leave blank to disable. |
| `VITE_GA_FORCE_DEV` | No | `false` | Force GA in dev builds for debugging. |

### Logging

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `RUST_LOG` | No | `info` | Rust log level filter. Common values: `error`, `warn`, `info`, `debug`, `trace`. |
| `RUST_BACKTRACE` | No | `0` | Set to `1` for full backtraces on panic. |

### Runtime Flags

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CLOSEREDGE_BROWSER_ALLOW_ALL` | No | `0` | Allow browser automation on all domains. |
| `CLOSEREDGE_LOG_PROMPTS` | No | `0` | Log full LLM prompts to console. |
| `VITE_CONSUMER_FIRST_SESSION` | No | `false` | Enable consumer first-session UX experiments. |

### Auto-Update

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CLOSEREDGE_AUTO_UPDATE_RESTART_STRATEGY` | No | `self_replace` | Headless update restart contract: `self_replace` or `supervisor`. |
| `CLOSEREDGE_AUTO_UPDATE_RPC_MUTATIONS_ENABLED` | No | `true` | Allow RPC callers to invoke update operations. Disable on exposed servers. |

### Docker / Cloud Deploy

These are typically set by `docker-compose.yml` or the cloud platform, not in `.env`:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CLOSEREDGE_CORE_MEM_LIMIT` | No | `4g` | Docker container memory limit. |
| `CLOSEREDGE_CORE_CPUS` | No | `2.0` | Docker container CPU limit. |
| `XDG_CACHE_HOME` | No | Platform default | Cache directory inside container. |
| `TMPDIR` | No | `/tmp` | Temp directory inside container. |

### Development and Testing

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_DEV_JWT_TOKEN` | No | -- | Auto-inject JWT token to skip login flow (dev only). |
| `VITE_DEV_FORCE_ONBOARDING` | No | `false` | Force onboarding flow to always show (dev only). |
| `CLOSEREDGE_DEV_PORT` | No | `1420` | Vite dev-server port. Use 1422, 1424, etc. for parallel sessions. |
| `CLOSEREDGE_SERVICE_MOCK` | No | `0` | Enable mock service mode. |
| `CLOSEREDGE_SERVICE_MOCK_STATE_FILE` | No | -- | Path to mock state file. |
| `VITE_SENTRY_SMOKE_TEST` | No | `false` | Fire one Sentry diagnostic event on init. |
| `SENTRY_AUTH_TOKEN` | No | -- | CI-only: Sentry source-map upload token. |
| `SENTRY_ORG` | No | -- | CI-only: Sentry organization slug. |
| `SENTRY_PROJECT` | No | -- | CI-only: Sentry project slug. |
| `SENTRY_RELEASE` | No | -- | CI-only: Sentry release tag override. |

---

## Where Variables Are Loaded

| Layer | File | Scope |
|-------|------|-------|
| Root `.env` | `.env` (root) | Rust core, Tauri shell, scripts. Loaded via `source scripts/load-dotenv.sh`. |
| Frontend `.env.local` | `app/.env.local` | Vite dev server. Only `VITE_`-prefixed vars are browser-exposed. |
| Docker | `docker-compose.yml` | Container environment. Reads from root `.env` via `env_file`. |
| Cloud (Railway) | `railway.toml` + Railway dashboard | Platform env vars. |
| Cloud (Fly.io) | `.fly/fly.toml` + `fly secrets set` | Platform env vars. |
| Cloud (DigitalOcean) | `.do/deploy.template.yaml` + App Platform UI | Platform env vars. |
| Supabase Edge Functions | Supabase dashboard | `STRIPE_*`, `SUPABASE_*` for webhook handler. |
