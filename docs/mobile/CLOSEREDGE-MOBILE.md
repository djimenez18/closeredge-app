# CloserEdge AI Mobile (iOS + Android)

Your AI employee, in your pocket. The mobile app pairs with the CloserEdge AI
desktop core and gives agents a fast, voice-first way to work with their AI
from anywhere: hold to talk, get spoken replies, and see exactly what their
AI is connected to.

## Product pillars

1. **Voice-first.** The hero interaction is hold-to-talk (on-device speech
   recognition) with streaming replies and TTS. Typing is always available,
   never required.
2. **Honest state.** Every status shown is real: the connection card on Home
   runs a live transport health probe; nothing is mocked.
3. **Branded and modern.** CloserEdge identity throughout — the chevron mark,
   the violet `edge` palette, light/dark themes with a one-tap toggle.
4. **Seamless pairing.** Scan a QR from the desktop Devices panel; transport
   automatically picks LAN → E2E-encrypted tunnel → cloud relay.

## What ships on this branch (`feat/mobile-app`)

- **White-label**: `app/src-tauri-mobile` is now `CloserEdge AI` /
  `com.closeredge.ai`, with brand icons for iOS + Android generated from
  `icon-source.png` (regenerate via `tauri icon icon-source.png -o icons`).
  iOS privacy strings rebranded.
- **Home command center** (`/home`, new `pages/mobile/HomeScreen.tsx`):
  time-aware greeting, live desktop-connection card (label + health +
  transport kind), hero "Talk to your AI" CTA, suggestion chips, theme toggle.
- **Chat** (`/chat`): the previously-orphaned `MascotScreen` is now the chat
  surface — animated mascot, streaming chat over core RPC, PTT voice, spoken
  replies — restyled to the brand. (It was built upstream but never routed;
  the old route pointed at the desktop Accounts page.)
- **Routes** (`AppRoutesIOS.tsx`): paired default is `/home`; `/human` is a
  legacy alias → `/chat`. The desktop-layout `HumanPage` (which reserved a
  436px sidebar) no longer renders on phones.
- **BootCheckGate mobile bypass** (bug fix): the desktop/web boot check
  (local sidecar vs. cloud RPC picker) used to gate the mobile app too, which
  can never succeed on a phone. Mobile's real gate is `RequirePairing`.
- **Tab bar**: Home / Chat / Settings, brand active states, safe-area insets,
  light/dark aware.
- **Theme**: `edge` violet palette added to Tailwind (from the logo
  gradients); Home and the tab bar fully support the existing
  light/dark/system ThemeProvider; toggle surfaced on Home.
- **Dev loop on any OS**: `?platform=ios` (or `android`) on the Vite dev URL
  forces the mobile shell in a desktop browser — dev-only
  (`import.meta.env.DEV`), never active in production.

## Architecture (unchanged, now actually reachable)

```
Phone (Tauri 2, app/src-tauri-mobile)
  └─ React app → AppRoutesIOS (mobile shell)
       └─ TransportManager (per saved ConnectionProfile)
            1. LAN HTTP        — same network, zero latency
            2. Socket tunnel   — XChaCha20-Poly1305 over X25519, blind relay
            3. Cloud HTTP      — fallback
                 └─ Desktop core (Rust) — chat RPC, devices, settings
```

Pairing: desktop Settings → Devices → "Pair phone" QR → phone scans →
keypair + profile saved → tunnel handshake. See `docs/ios/SETUP.md` for
build/signing; `pnpm tauri:ios:dev`, `pnpm tauri:android:dev`.

## Roadmap (next branches)

- Push notifications (APNs/FCM) — today delivery requires foreground.
- Direct-to-cloud profiles: connect straight to a Railway-hosted Eden tier
  (closeredgeai `dist/railway` packages) without a desktop in the loop.
- Real-estate surfaces on Home: today's showings, hot leads, pipeline glance
  (CRM RPC), artifacts viewer.
- Keychain/Keystore storage for the tunnel symmetric key (upstream TODO).
- Biometric app lock.

## Merge plan across the three active streams

| Stream | Repo / branch | Files touched | Conflicts with this branch |
|---|---|---|---|
| Desktop app research & design | `closeredge-app` / `feat/subscription-gating-and-win-launch` | Rust core (`src/subscription/*`, `core/dispatch`), `app/src/{hooks,components/subscription,pages/SubscriptionPage,services/coreRpcClient}`, desktop `src-tauri`, `.gitignore` | **None** — file sets are disjoint |
| Mobile (this) | `closeredge-app` / `feat/mobile-app` | `src-tauri-mobile/*`, `pages/{ios,mobile}/*`, `components/{ios,mobile}/*`, `AppRoutesIOS*`, `BootCheckGate.tsx`, `platform.ts`, `App.tsx` (1 line), `tailwind.config.js` + `en.ts` (additive) | — |
| Main session | `closeredgeai` / `feat/research-toolkit-grok` | Deploy/marketing monorepo + `dist/railway` regen | **Different repo** — no interaction |

Recommended order:
1. Desktop branch merges to `closeredge-app` main first (older, active session
   owns the main checkout).
2. This branch rebases on the result (expected clean — disjoint files) and
   merges second. Worktree: `closeredge-app-mobile`.
3. `closeredgeai` merges independently; nothing here regenerates
   `dist/railway`.

Shared-asset note: the brand mark SVG lives in marketing
(`closeredgeai/logos/`) and is vendored here as
`components/mobile/CloserEdgeBrand.tsx` + `icon-source.png`. If marketing
updates the logo, regenerate both.
