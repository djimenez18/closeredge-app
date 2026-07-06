# CloserEdge AI Build Inventory

> Complete inventory of every file created or modified during the white-labeling and build process.
> Generated: 2026-06-01

---

## Summary

| Metric | Count |
|---|---|
| **New files created** | 79 |
| **Upstream files modified** | 274 |
| **Total new lines of code** | 17,381 |
| **Modified file delta** | +3,570 / -3,323 (net +247) |

### Files by Language

| Language | Files | Lines |
|---|---|---|
| TypeScript (.ts / .tsx) | 41 | 13,767 |
| Markdown (.md) | 7 | 1,172 |
| Rust (.rs) | 1 | 509 |
| HTML (.html) | 8 | 497 |
| SQL (.sql) | 4 | 493 |
| JSON (.json) | 13 | 434 |
| Env / Config (.env, .railwayignore) | 2 | 418 |
| TOML (.toml) | 2 | 63 |
| Shell (.sh) | 1 | 28 |
| **Total** | **79** | **17,381** |

---

## 1. Agent Definitions (`agents/closeredge/`)

| File | Size | Lines | Purpose | Key Exports |
|---|---|---|---|---|
| `README.md` | 1.7 KB | 32 | Documentation for agent config schema | -- |
| `adversary-agent.json` | 1.7 KB | 53 | Adversary stress-test agent definition (Lexis child, elite-tier) | name, slug, parent_product, tier_required |
| `crest.json` | 837 B | 16 | Crest agent config -- commercial real estate | name, slug, industry, tagline |
| `eden.json` | 748 B | 16 | Eden agent config -- residential real estate | name, slug, industry, tagline |
| `forge.json` | 787 B | 16 | Forge agent config -- home services / contractors | name, slug, industry, tagline |
| `haven.json` | 813 B | 16 | Haven agent config -- healthcare / dental practice | name, slug, industry, tagline |
| `lexis.json` | 749 B | 16 | Lexis agent config -- legal | name, slug, industry, tagline |
| `model-config.json` | 2.0 KB | 53 | LLM provider routing config (OpenRouter, fallbacks, per-tier models) | model_routing.providers, tier_overrides |
| `nora.json` | 891 B | 19 | Nora agent config -- property management | name, slug, industry, tagline |
| `tier-config.json` | 1.6 KB | 68 | Subscription tier feature gates (Foundation / Pro / Elite) | tiers.foundation, tiers.pro, tiers.elite |

**Subtotal: 10 files, 305 lines**

---

## 2. Auth Components (`app/src/components/auth/`)

| File | Size | Lines | Purpose | Key Exports |
|---|---|---|---|---|
| `AuthProvider.tsx` | 2.7 KB | 89 | React context provider wrapping Supabase auth state | `useAuthContext()`, `default AuthProvider` |
| `AuthScreen.tsx` | 13.5 KB | 415 | Full login / signup screen with email + social auth | `default AuthScreen` |
| `ForgotPassword.tsx` | 4.3 KB | 133 | Password reset flow via Supabase | `default ForgotPassword` |

**Subtotal: 3 files, 637 lines**

---

## 3. Subscription Components (`app/src/components/subscription/`)

| File | Size | Lines | Purpose | Key Exports |
|---|---|---|---|---|
| `PaymentBanner.tsx` | 4.6 KB | 137 | Dismissable banner for overdue / expiring subscriptions | `default PaymentBanner` |
| `SubscriptionGate.tsx` | 8.0 KB | 200 | HOC that restricts children based on subscription status | `useIsReadOnly()`, `default SubscriptionGate` |
| `SubscriptionStatus.tsx` | 6.2 KB | 169 | Badge / card showing current tier and renewal date | `default SubscriptionStatus` |

**Subtotal: 3 files, 506 lines**

---

## 4. Admin Dashboard (`app/src/pages/admin/`)

| File | Size | Lines | Purpose | Key Exports |
|---|---|---|---|---|
| `AdminDashboard.tsx` | 15.5 KB | 465 | Main admin home -- revenue, active clients, agent KPIs | `default AdminDashboard` |
| `AdminLayout.tsx` | 7.9 KB | 217 | Shell layout with sidebar nav for admin section | `default AdminLayout` |
| `AdminRoute.tsx` | 2.2 KB | 85 | Protected route guard requiring admin role | `default AdminRoute` |
| `AgentHealth.tsx` | 13.1 KB | 408 | Agent uptime, error rate, response latency dashboard | `default AgentHealth` |
| `Analytics.tsx` | 13.1 KB | 423 | Usage analytics -- conversations, tokens, cost breakdown | `default Analytics` |
| `ClientDetail.tsx` | 21.6 KB | 622 | Single client drilldown -- subscription, usage, agent logs | `default ClientDetail` |
| `ClientsList.tsx` | 14.0 KB | 433 | Paginated client list with search / filter | `default ClientsList` |
| `charts/SimpleChart.tsx` | 13.9 KB | 467 | Reusable SVG chart components | `BarChart`, `HorizontalBarChart`, `StackedBarChart`, `LineChart`, `DonutChart`, `FunnelChart` |

**Subtotal: 8 files, 3,120 lines**

---

## 5. Hive Mind Feature (`app/src/features/hivemind/`)

| File | Size | Lines | Purpose | Key Exports |
|---|---|---|---|---|
| `BrainVisualization.tsx` | 35.6 KB | 960 | WebGL / Canvas neural-network-style agent activity graph | `BrainVisualization` |
| `HiveMindFeed.tsx` | 9.0 KB | 252 | Real-time activity feed of cross-agent actions | `HiveMindFeed` |
| `HiveMindPage.tsx` | 11.7 KB | 276 | Top-level page composing feed + visualization | `HiveMindPage` |
| `hivemindService.ts` | 5.3 KB | 169 | Supabase CRUD for hive_mind table | `HiveMindEntry`, `AgentStats`, `fetchHiveMindEntries`, `logHiveMindEntry`, `getAgentStats`, `searchHiveMind` |

**Subtotal: 4 files, 1,657 lines**

---

## 6. War Room Feature (`app/src/features/warroom/`)

| File | Size | Lines | Purpose | Key Exports |
|---|---|---|---|---|
| `AgentRoster.tsx` | 12.0 KB | 330 | Agent selection panel with status indicators | `CLOSEREDGE_AGENTS`, `AGENT_COLORS`, `AGENT_INITIALS`, `AgentRoster` |
| `WarRoomChat.tsx` | 16.7 KB | 481 | Multi-agent chat interface with threaded messages | `WarRoomChat` |
| `WarRoomPage.tsx` | 15.6 KB | 403 | Top-level War Room layout combining roster + chat | `WarRoomPage` |
| `warRoomOrchestrator.ts` | 18.9 KB | 604 | Meeting lifecycle, transcript, event bus for multi-agent sessions | `Meeting`, `WarRoomOrchestrator`, `getOrchestrator` |
| `warRoomRouter.ts` | 9.4 KB | 290 | Message routing logic -- mention detection, agent selection, fallback | `routeMessage`, `interventionGate`, `isGreeting`, `extractMentions` |
| `warRoomToolPolicy.ts` | 5.3 KB | 178 | Per-agent tool allow/deny policy with audit log | `WarRoomToolPolicy`, `logToolCall`, `buildToolPolicy`, `isToolAllowed` |

**Subtotal: 6 files, 2,286 lines**

---

## 7. Adversary Feature (`app/src/features/adversary/`)

| File | Size | Lines | Purpose | Key Exports |
|---|---|---|---|---|
| `AdversaryPage.tsx` | 27.1 KB | 664 | Document upload + stress-test launcher UI | `AdversaryPage` |
| `AdversaryResults.tsx` | 18.6 KB | 540 | Results viewer with severity badges and export | `AdversaryResults` |
| `adversaryPrompts.ts` | 5.2 KB | 69 | System prompts for opposing-counsel, judge, cross-exam modes | `ADVERSARY_SYSTEM_PROMPT`, `JUDGE_PERSPECTIVE_PROMPT`, `CROSS_EXAMINATION_PROMPT`, `DOCUMENT_ATTACK_VECTORS` |
| `adversaryService.ts` | 10.1 KB | 316 | LLM-powered document analysis and stress testing | `analyzeDocument`, `runStressTest`, `getCounterArgument`, `exportReport` |

**Subtotal: 4 files, 1,589 lines**

---

## 8. Memory Feature (`app/src/features/memory/`)

| File | Size | Lines | Purpose | Key Exports |
|---|---|---|---|---|
| `MemoryExplorer.tsx` | 22.6 KB | 666 | Memory browser with search, filter, relevance scores | `MemoryExplorer` |
| `memoryConsolidate.ts` | 9.2 KB | 258 | Periodic memory consolidation and deduplication | `consolidateMemories`, `scheduleConsolidation` |
| `memoryIngest.ts` | 10.9 KB | 317 | Entity extraction, importance scoring, conversation ingestion | `extractEntities`, `scoreImportance`, `ingestConversationTurn` |
| `memoryService.ts` | 16.4 KB | 591 | Core CRUD -- recall, store, forget, search, batch update | `recallMemories`, `storeMemory`, `forgetMemory`, `searchMemories`, `getMemoryStats` |
| `memoryTypes.ts` | 3.0 KB | 119 | TypeScript interfaces for memory domain | `Memory`, `Consolidation`, `MemoryResult`, `MemoryFilter`, `MemoryStats` |

**Subtotal: 5 files, 1,951 lines**

---

## 9. Hooks (`app/src/hooks/`)

| File | Size | Lines | Purpose | Key Exports |
|---|---|---|---|---|
| `useAuth.ts` | 6.0 KB | 169 | React hook wrapping Supabase auth with session management | `UseAuthReturn`, `useAuth` |
| `useSubscription.ts` | 5.4 KB | 197 | Subscription state, tier checks, access-level resolution | `AgentType`, `SubscriptionTier`, `AccessLevel`, `Subscription`, `useSubscription` |

**Subtotal: 2 files, 366 lines**

---

## 10. Lib (`app/src/lib/`)

| File | Size | Lines | Purpose | Key Exports |
|---|---|---|---|---|
| `supabase.ts` | 503 B | 13 | Supabase client singleton from env vars | `supabase` |

**Subtotal: 1 file, 13 lines**

---

## 11. Navigation (`app/src/navigation/`)

| File | Size | Lines | Purpose | Key Exports |
|---|---|---|---|---|
| `closeredgeNav.ts` | 1.4 KB | 38 | CloserEdge-specific nav items (Hive Mind, War Room, Adversary, Memory, Admin) | `CloserEdgeNavItem`, `default closeredgeNav` |

**Subtotal: 1 file, 38 lines**

---

## 12. Pages (`app/src/pages/`)

| File | Size | Lines | Purpose | Key Exports |
|---|---|---|---|---|
| `SubscriptionPage.tsx` | 1.7 KB | 52 | Stripe checkout redirect and plan selection | `default SubscriptionPage` |

**Subtotal: 1 file, 52 lines**

---

## 13. Supabase (`supabase/`)

| File | Size | Lines | Purpose | Key Exports |
|---|---|---|---|---|
| `migrations/001_subscription_schema.sql` | 8.4 KB | 183 | Tables: customers, subscriptions, invoices, dunning_events; RLS policies; indexes | customers, subscriptions, invoices tables |
| `migrations/002_hivemind_schema.sql` | 965 B | 31 | Table: hive_mind; cross-agent knowledge sharing | hive_mind table |
| `migrations/003_warroom_schema.sql` | 4.5 KB | 108 | Tables: warroom_meetings, warroom_turns, warroom_tool_calls | warroom_meetings, warroom_turns tables |
| `migrations/004_memory_schema.sql` | 6.2 KB | 171 | Tables: memories, consolidations; FTS index; temporal decay function | memories, consolidations tables |
| `functions/stripe-webhook/index.ts` | 20.9 KB | 651 | Deno Edge Function handling Stripe webhook events | serve() handler |
| `functions/stripe-webhook/README.md` | 3.8 KB | 109 | Webhook deployment and testing docs | -- |

**Subtotal: 6 files, 1,253 lines**

---

## 14. Scripts (`scripts/`)

| File | Size | Lines | Purpose | Key Exports |
|---|---|---|---|---|
| `setup-closeredge.sh` | 787 B | 28 | One-shot env setup: copies .env, runs migrations | -- |
| `stripe-checkout-config.ts` | 12.6 KB | 439 | Stripe Checkout Session creation with tier-specific line items | checkout session builder |
| `stripe-products.json` | 2.5 KB | 100 | Stripe product / price ID mapping for Foundation / Pro / Elite | product definitions |
| `stripe-setup.ts` | 13.1 KB | 462 | Stripe product + price seeding script | setup runner |
| `STRIPE_SETUP_PENDING.md` | 600 B | 18 | Status doc for Stripe integration | -- |

**Subtotal: 5 files, 1,047 lines**

---

## 15. Rust Subscription Module (`src/subscription/`)

| File | Size | Lines | Purpose | Key Exports |
|---|---|---|---|---|
| `mod.rs` | 17.0 KB | 509 | Server-side subscription enforcement: tier checks, feature gates, caching | `Tier`, `AccessLevel`, `AgentType`, `SubscriptionRecord`, `tier_allows_feature`, `resolve_access_level`, `conversation_limit` |
| `access_control.json` | 1.6 KB | 43 | Per-tier feature and integration allow-lists | feature_gates, integration_gates |

**Subtotal: 2 files, 552 lines**

---

## 16. Config (`config/`)

| File | Size | Lines | Purpose | Key Exports |
|---|---|---|---|---|
| `closeredge-defaults.toml` | 1.2 KB | 45 | Default config: product name, workspace dir, API endpoints, feature flags | [general], [api], [features] |

**Subtotal: 1 file, 45 lines**

---

## 17. Templates (`templates/dunning/`)

| File | Size | Lines | Purpose | Key Exports |
|---|---|---|---|---|
| `payment-failed-day0.html` | 3.3 KB | 50 | Day 0: payment failed notification email | -- |
| `payment-reminder-day3.html` | 3.5 KB | 51 | Day 3: gentle payment reminder | -- |
| `features-warning-day5.html` | 4.0 KB | 58 | Day 5: features will be limited warning | -- |
| `degraded-day7.html` | 4.4 KB | 61 | Day 7: features now limited notification | -- |
| `suspended-day14.html` | 4.6 KB | 62 | Day 14: account suspended | -- |
| `final-warning-day21.html` | 4.7 KB | 63 | Day 21: data preserved, reactivate anytime | -- |
| `data-export-reminder-day90.html` | 6.5 KB | 89 | Day 90: data will be removed in 30 days | -- |
| `reactivated.html` | 4.6 KB | 63 | Welcome-back confirmation on reactivation | -- |
| `sms-templates.json` | 504 B | 6 | SMS fallback templates for dunning stages | -- |

**Subtotal: 9 files, 503 lines**

---

## 18. Deployment / Environment

| File | Size | Lines | Purpose | Key Exports |
|---|---|---|---|---|
| `.env.closeredge` | 19.7 KB | 405 | Complete environment template with all CloserEdge-specific vars | SUPABASE_URL, STRIPE keys, agent API keys |
| `.railwayignore` | 108 B | 13 | Railway deployment ignore rules | -- |
| `railway.json` | 261 B | 12 | Railway service config | -- |
| `railway.toml` | 374 B | 18 | Railway build + deploy settings | -- |

**Subtotal: 4 files, 448 lines**

---

## 19. Documentation (`docs/`)

| File | Size | Lines | Purpose |
|---|---|---|---|
| `build-notes.md` | 11.5 KB | 290 | Build process notes, decisions, and blockers |
| `environment-guide.md` | 16.2 KB | 280 | Complete env var reference and setup guide |
| `subscription-gating-design.md` | 14.4 KB | 357 | Architecture design doc for subscription / tier gating |
| `typescript-build-notes.md` | 4.0 KB | 86 | TypeScript-specific build config and gotchas |

**Subtotal: 4 files, 1,013 lines**

---

## 20. Key Modified Files (White-Label Rename)

274 upstream files were modified, primarily for the `openhuman` -> `closeredge` rename. Key modifications:

| File | Change Summary |
|---|---|
| `Cargo.toml` | Package name `openhuman` -> `closeredge`, bin `openhuman-core` -> `closeredge-core`, lib `openhuman_core` -> `closeredge_core` |
| `Dockerfile` | Binary paths and build targets renamed |
| `app/package.json` | Package name and scripts updated |
| `app/index.html` | Title changed to CloserEdge AI |
| `app/src-tauri/tauri.conf.json` | App identifier, window title, bundle ID |
| `app/src/App.tsx` | Imports AuthProvider and SubscriptionGate wrappers |
| `app/src/AppRoutes.tsx` | Added lazy-loaded routes for HiveMind, WarRoom, Adversary, Memory, Admin |
| `app/src/SOUL.md` | Brand personality / tone updated |
| `.env.example` | New CloserEdge-specific env vars added |
| `.do/app.yaml` | DigitalOcean app spec renamed |
| `.fly/fly.toml` | Fly.io config renamed |
| `app/src-tauri/src/*.rs` (20+ files) | Crate references `openhuman_core` -> `closeredge_core` |
| `src/**/*.rs` (40+ files) | Module paths and crate name references |
| `tests/**/*.rs` (70+ files) | Test imports updated to `closeredge_core` |

**Total modified file delta: +3,570 insertions / -3,323 deletions**

---

## Grand Totals

| Category | Files | Lines |
|---|---|---|
| Agent Definitions | 10 | 305 |
| Auth Components | 3 | 637 |
| Subscription Components | 3 | 506 |
| Admin Dashboard | 8 | 3,120 |
| Hive Mind Feature | 4 | 1,657 |
| War Room Feature | 6 | 2,286 |
| Adversary Feature | 4 | 1,589 |
| Memory Feature | 5 | 1,951 |
| Hooks | 2 | 366 |
| Lib | 1 | 13 |
| Navigation | 1 | 38 |
| Pages | 1 | 52 |
| Supabase (migrations + functions) | 6 | 1,253 |
| Scripts | 5 | 1,047 |
| Rust Subscription Module | 2 | 552 |
| Config | 1 | 45 |
| Dunning Templates | 9 | 503 |
| Deployment / Environment | 4 | 448 |
| Documentation | 4 | 1,013 |
| **New Files Total** | **79** | **17,381** |
| Modified Files (rename delta) | 274 | +247 net |
