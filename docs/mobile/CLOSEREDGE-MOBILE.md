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

## Shipping without a Mac (verified June 2026)

Nobody on this team owns a Mac. The entire iOS pipeline runs on GitHub's
macOS runners, which are **free and unlimited for this public repo**.
`.github/workflows/ios-build.yml` has two lanes:

| Lane | Needs | Produces |
|---|---|---|
| iOS `simulator` | nothing (no Apple account) | unsigned simulator `.app` zip artifact; auto-upload to Appetize.io |
| iOS `device` | Apple Developer ($99/yr) + secrets below | signed IPA → TestFlight |
| Android `apk` (`android-build.yml`) | nothing | debug-signed universal APK (arm64+x86_64) artifact; auto-upload to Appetize.io |

**Live browser previews** (update automatically on every mobile push):
- iOS: <https://appetize.io/app/psqslz4vyzt3oewxzgq52cousm>
- Android: <https://appetize.io/app/inbahrpsux255ut6dv5zxonza4>

Appetize account: Diego's GitHub OAuth. Secrets wired:
`APPETIZE_API_TOKEN`, `APPETIZE_PUBLIC_KEY` (iOS), `APPETIZE_ANDROID_PUBLIC_KEY`.
(Gotcha: set gh secrets with `echo -n |` — `printf |` from git-bash on
Windows contaminated the values and produced Appetize 401/400s.)

**One-time setup, in order:**

1. **Enable workflows** (fork repos ship with Actions unregistered): repo →
   Actions tab → "I understand my workflows, go ahead and enable them".
2. **Browser testing today, $0**: run the `iOS Build` workflow; download the
   simulator zip artifact and upload it at appetize.io (free: 30 streaming
   min/month, 2 concurrent devices). For automatic uploads add the
   `APPETIZE_API_TOKEN` secret (and `APPETIZE_PUBLIC_KEY` after the first
   upload so the same browser URL keeps updating). **Appetize has no
   microphone input on any plan** — PTT voice is smoke-test only there.
3. **TestFlight on a real iPhone** (full voice testing): enroll in the
   Apple Developer Program ($99/yr — works entirely from a Windows
   browser), then in App Store Connect → Users & Access → Integrations
   create an **API key** (Admin role) and set repo secrets:
   `APPLE_API_ISSUER` (issuer UUID), `APPLE_API_KEY_ID` (key id),
   `APPLE_API_KEY_CONTENT` (the .p8 file, base64), `APPLE_TEAM_ID`
   (10-char team id), then set repo **variable** `IOS_SIGNING_READY=true`.
   Tauri's automatic signing creates certificates and profiles itself — no
   human ever touches a certificate. Install builds on the iPhone via the
   TestFlight app (internal testers: no review; first-ever build can take
   ~24 h to process — later ones are minutes).
4. **App Store release**: manage the listing/screenshots entirely from the
   browser in App Store Connect; the same lane's IPA is the store build.

**Escape hatches** (rarely needed):
- USB sideload from Windows: Sideloadly (free Apple ID = 3 apps/7-day
  resign; paid account = 1 year). iPhone UDID without any computer:
  udid.tech in Safari.
- Interactive macOS for one-off debugging: Scaleway Mac mini M4 at
  €0.22/hr (24 h minimum ≈ €5.30/day, VNC+SSH from Windows) or MacinCloud
  PAYG ($1/hr, ~$25 prepaid minimum, RDP).
- Real-device cloud in the browser: BrowserStack App Live (~$29–39/mo)
  once signing exists — it resigns dev IPAs automatically.

CI image note: jobs pin `macos-15` (Xcode 16.4, iOS 18.x simulators) —
`macos-latest` flips to macOS 26 in June 2026 and Xcode 26 still has CI
hangs (actions/runner-images#13264). Revisit the pin when that closes.

## Merge plan across the three active streams

| Stream | Repo / branch | Files touched | Conflicts with this branch |
|---|---|---|---|
| Desktop app research & design | `closeredge-app` / `feat/subscription-gating-and-win-launch` | Rust core (`src/subscription/*`, `core/dispatch`), `app/src/{hooks,components/subscription,pages/SubscriptionPage,services/coreRpcClient}`, desktop `src-tauri`, `.gitignore` | **None** — file sets are disjoint |
| Mobile (this) | `closeredge-app` / `feat/mobile-app` | `src-tauri-mobile/*`, `pages/{ios,mobile}/*`, `components/{ios,mobile}/*`, `AppRoutesIOS*`, `BootCheckGate.tsx`, `platform.ts`, `App.tsx` (1 line), `tailwind.config.js` + `en.ts` (additive) | — |
| Main session | `closeredgeai` / `feat/research-toolkit-grok` | Deploy/marketing monorepo + `dist/railway` regen | **Different repo** — no interaction |

Recommended order:
1. Desktop branch merges to `closeredge-app` main first (older, active session
   owns the main checkout).
2. This branch rebases on the result and merges second. Worktree:
   `closeredge-app-mobile`.
3. `closeredgeai` merges independently; nothing here regenerates
   `dist/railway`.

**Trial-merge result vs. the desktop rebrand commit (`c91d443d`, verified
with `git merge-tree`):** four shared files; three auto-merge
(`App.tsx`, `BootCheckGate.tsx`, `tailwind.config.js`) and exactly one
textual conflict — one line in `en.ts` where both branches rebranded
`iosPair.step.openDesktop` ("on your desktop" vs "on desktop"). Pick either.

**Post-merge follow-ups (semantic, not textual):**
- **AuthProvider + SubscriptionGate gate mobile with no mobile branch** —
  same class as the BootCheckGate bug fixed on this branch. `useAuth`
  always consults Supabase (placeholder client when env unset), so a mobile
  build without Supabase env boots to an unwinnable login wall instead of
  `/pair`. Until mobile auth/entitlements are designed, add the same
  `getIsMobile()` pass-through both gates' siblings use, or decide mobile
  auth deliberately.
- Mobile inherits the new brand type system (`display` → Cormorant
  Garamond, `sans` → DM Sans) and warm-dark neutrals automatically —
  re-run the visual check (`?platform=ios`) after rebase.
- Desktop added shared brand assets (`app/public/brand/closeredge-mark.svg`
  etc.). `CloserEdgeBrand.tsx` keeps its inline SVG (no asset fetch in the
  phone webview); consolidate later if desired.

Shared-asset note: the brand mark SVG lives in marketing
(`closeredgeai/logos/`) and is vendored here as
`components/mobile/CloserEdgeBrand.tsx` + `icon-source.png`. If marketing
updates the logo, regenerate both.
