# TypeScript Build Notes

Status of the OpenHuman-to-CloserEdge rename as it affects the TypeScript build.

## Missing Dependencies

| Package | Needed by | Status |
|---------|-----------|--------|
| `@supabase/supabase-js` | `app/src/lib/supabase.ts`, `app/src/hooks/useAuth.ts`, `app/src/hooks/useSubscription.ts` | **Added to app/package.json** -- run `pnpm install` |

Dependencies already present that were called out for verification:
- `three` (v0.183.2) -- in `app/package.json` dependencies
- `@types/three` (v0.183.1) -- in `app/package.json` dependencies
- `recharts` (v2.15.0) -- in `app/package.json` dependencies
- `@react-three/fiber` and `@react-three/drei` -- **not needed**; `BrainVisualization.tsx` uses raw Three.js directly

## Import Issues Found and Fixed

### 1. `@/` path alias was not configured

Six new files imported `supabase` using `@/lib/supabase` but the `@/` alias was not
defined in either `tsconfig.json` or `vite.config.ts`.

**Files affected:**
- `app/src/features/hivemind/hivemindService.ts`
- `app/src/features/warroom/warRoomOrchestrator.ts`
- `app/src/features/adversary/adversaryService.ts`
- `app/src/features/memory/memoryService.ts`
- `app/src/features/memory/memoryIngest.ts`
- `app/src/features/memory/memoryConsolidate.ts`

**Fix applied:** Added `"@/*": ["src/*"]` to `tsconfig.json` paths and
`"@": resolve(__dirname, "src")` to `vite.config.ts` resolve.alias.
This is a better fix than changing all 6 files to relative imports -- it makes
future files easier to write.

### 2. No `@closeredge/*` or `openhuman` import issues in new files

No new file imports from `@closeredge/*` or `@openhuman/*` module paths.
Existing files use relative imports throughout.

## Path Alias Changes

| File | Old | New | Notes |
|------|-----|-----|-------|
| `app/tsconfig.json` | `@openhuman/skill-types` | `@closeredge/skill-types` | Unused but renamed for consistency |
| `app/tsconfig.json` | _(none)_ | `@/*` -> `src/*` | New alias for Supabase imports |
| `app/vite.config.ts` | _(none)_ | `@` -> `src/` | New Vite resolve alias to match tsconfig |

## Env Var Rename (Partial -- in progress)

The codebase is mid-rename from `VITE_OPENHUMAN_*` to `VITE_CLOSEREDGE_*`:

| Location | Uses | Status |
|----------|------|--------|
| `app/src/utils/config.ts` | `VITE_CLOSEREDGE_*` | Already renamed |
| `app/package.json` build:web | `VITE_CLOSEREDGE_TARGET` | Already renamed |
| `app/vite.config.ts` | Was `VITE_OPENHUMAN_TARGET` | **Fixed** -- now reads `VITE_CLOSEREDGE_TARGET` first, falls back to `VITE_OPENHUMAN_TARGET` |
| `app/vite.config.ts` | Was `OPENHUMAN_DEV_PORT` | **Fixed** -- now reads `CLOSEREDGE_DEV_PORT` first, falls back |
| `app/src/vite-env.d.ts` | Had only `VITE_OPENHUMAN_*` types | **Fixed** -- added `VITE_CLOSEREDGE_*` declarations |
| `app/scripts/e2e-web-build.sh` | Still uses `VITE_OPENHUMAN_*` | Works via fallback -- rename later |
| `app/src/services/coreRpcClient.ts` | Comments reference `VITE_OPENHUMAN_CORE_RPC_URL` | Comment-only, no code change needed |

## Steps to Get TypeScript Compilation Green

1. **Install dependencies:**
   ```bash
   cd app && pnpm install
   ```

2. **Verify TypeScript compiles:**
   ```bash
   cd app && pnpm compile
   ```

3. **If `@closeredge/skill-types` errors:** The target file `src/lib/skills/types.ts`
   does not exist yet. This alias is unused -- if it causes errors, remove it from
   tsconfig.json paths until the skills types module is created.

4. **Remaining env var cleanup (non-blocking):** The `e2e-web-build.sh` script still
   sets `VITE_OPENHUMAN_*` env vars. The vite.config.ts fallback chain handles this
   gracefully. A full rename of the shell script can be done in a follow-up pass.

5. **`noUnusedLocals` / `noUnusedParameters`:** The tsconfig has strict unused-variable
   checks enabled. New component files may trigger these if any variable is declared
   but not referenced. Fix individually as they surface.
