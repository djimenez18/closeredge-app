# Build Readiness Assessment

> Generated: 2026-06-01
> Platform: Windows 11 (x86_64-pc-windows-msvc)
> Project: closeredge-app v0.57.5

---

## 1. Rust Build Readiness

### Crate Naming (PASS)

| Item | Value | Status |
|------|-------|--------|
| Root `Cargo.toml` package name | `closeredge` | OK |
| Root `[lib]` name | `closeredge_core` | OK |
| Root binary name | `closeredge-core` (at `src/main.rs`) | OK |
| `src/main.rs` uses | `closeredge_core::core::observability::*` | OK -- matches lib name |
| `src/lib.rs` exports | `pub mod api; pub mod core; pub mod openhuman; pub mod rpc;` | OK |
| Tauri `[lib]` name | `closeredge` (at `app/src-tauri/`) | OK |
| Tauri depends on core | `closeredge_core = { path = "../..", package = "closeredge" }` | OK |

The lib name `closeredge_core` matches what `src/main.rs` imports. No naming conflicts.

### Feature Flags Referencing "openhuman" (PASS)

No `#[cfg(feature = "...openhuman...")]` guards exist in the Rust source. The `openhuman` name
survives only as:
- A module path: `src/openhuman/` (the core domain logic module)
- Environment variable names: `OPENHUMAN_CORE_SENTRY_DSN`, `OPENHUMAN_SENTRY_DSN`, `OPENHUMAN_DEV_PORT`, `OPENHUMAN_DOTENV_PATH`

These are runtime env vars, not compile-time feature gates. They do not block the build.

### Defined Feature Flags

| Feature | Purpose | Default |
|---------|---------|---------|
| `sandbox-landlock` | Linux Landlock sandbox | off |
| `sandbox-bubblewrap` | Linux Bubblewrap sandbox | off |
| `channel-matrix` | Matrix chat channel | off |
| `peripheral-rpi` | Raspberry Pi GPIO | off |
| `browser-native` / `fantoccini` | WebDriver browser automation | off |
| `whatsapp-web` | WhatsApp Web connector | off |
| `e2e-test-support` | Exposes `test_reset` RPC | off |

No features are enabled by default. A basic dev build compiles with no feature flags.

### Rust Toolchain (NEEDS ATTENTION)

| Requirement | Value |
|-------------|-------|
| Required | Rust 1.93.0 (pinned in `rust-toolchain.toml`) |
| Components | `rustfmt`, `clippy` |
| Currently installed | `1.93.0-x86_64-pc-windows-msvc` (installed but not active default) |

The toolchain 1.93.0 is installed but the active default is `stable`. The `rust-toolchain.toml`
file will auto-select 1.93.0 when building from the repo directory, so this should work
automatically via rustup's override mechanism.

### System Dependencies (Windows)

From the Dockerfile and `run-dev-win.sh`, the following are required on Windows:

| Dependency | Status | Notes |
|------------|--------|-------|
| Visual Studio 2022 Build Tools | INSTALLED | `C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools` |
| MSVC C++ (x86/x64) tools | INSTALLED | vswhere confirms component present |
| Windows SDK 10.0.26100.0 | INSTALLED | `kernel32.lib` found |
| CMake | **MISSING** | Not found at `C:\Program Files\CMake\bin\` |
| Ninja | **MISSING** | Not found on PATH or common locations |
| LLVM/Clang (`LIBCLANG_PATH`) | **MISSING** | Not found at `C:\Program Files\LLVM\bin\` |
| Git for Windows | INSTALLED | bash available |
| Node.js v24.13.0 | INSTALLED | Meets `>=24.0.0` requirement |

### Patched Dependencies

| Crate | Cargo.toml URL | Cargo.lock URL | Risk |
|-------|---------------|----------------|------|
| `whisper-rs-sys` | `closeredgeai/whisper-rs-sys` | `tinyhumansai/whisper-rs-sys` | WARNING: Cargo.toml was renamed to `closeredgeai` but Cargo.lock still points to `tinyhumansai`. A fresh `cargo update` will fail if the `closeredgeai` repo doesn't exist or isn't accessible. |

The vendored Tauri CEF fork is present as a git submodule at
`app/src-tauri/vendor/tauri-cef` (checked out at commit `c90c8a33`). Submodules are initialized.

---

## 2. Frontend Build Readiness

### Package Manager

| Item | Required | Installed | Status |
|------|----------|-----------|--------|
| pnpm | 10.10.0 (from `packageManager` field) | **NOT INSTALLED** | BLOCKING |
| Node.js | >=24.0.0 (from `app/package.json` engines) | v24.13.0 | OK |

pnpm is not currently on PATH. `corepack enable` fails with EPERM (needs admin privileges
to write to the Node.js install directory).

### Workspace Structure

```
pnpm-workspace.yaml:
  - app                          (main Tauri + React app)
  - packages/tauri-plugin-ptt    (PTT plugin guest-js bindings)
```

### Key Frontend Dependencies

| Category | Packages |
|----------|----------|
| Framework | React 19.1, React Router 7.13 |
| Build | Vite 8, TypeScript ~5.8.3, TailwindCSS 3.4 |
| Desktop | Tauri 2.10 (CEF fork), `@tauri-apps/api` 2.10 |
| State | Redux Toolkit 2.11, redux-persist 6 |
| Media | Remotion 4, PixiJS 8, Three.js 0.183, Rive |
| Auth | Supabase JS 2.49 |
| Testing | Vitest 4, Playwright 1.56 |

### What `pnpm install && pnpm build` Would Produce

1. `pnpm install` -- installs deps for `app/` and `packages/tauri-plugin-ptt/`
2. `pnpm build` -- delegates to `pnpm --filter closeredge-app build`
3. Which runs `tsc && vite build` inside `app/`
4. Produces `app/dist/` with the static frontend bundle

---

## 3. Development Workflow

### Starting the Dev Server (Desktop App on Windows)

```bash
# From repo root:
pnpm dev:app:win
# Which runs: "C:/Program Files/Git/bin/bash.exe" scripts/run-dev-win.sh
```

The `run-dev-win.sh` script does extensive environment setup:
1. Loads `.env` via `scripts/load-dotenv.sh`
2. Restores Windows PATH (MSYS strips it)
3. Bootstraps MSVC env (vcvars64.bat)
4. Discovers and patches Windows SDK paths
5. Pins MSVC linker to avoid Git's `link.exe` conflict
6. Finds pnpm, Node.js, cargo, ninja on disk
7. Runs `pnpm tauri:ensure` (installs vendored CEF-aware cargo-tauri CLI)
8. Stages CEF runtime DLLs next to debug binary (~270MB first run)
9. Launches `cargo-tauri dev` with a vite wrapper .bat

### Starting Just the Frontend Dev Server

```bash
cd app && pnpm dev      # Vite dev server on localhost:1420
```

### Building the Desktop App

```bash
# macOS
cd app && pnpm macos:build:release

# Windows (from Git Bash)
pnpm dev:app:win   # dev mode only; release build follows similar pattern
```

### Build Order

1. Install pnpm + system deps (CMake, Ninja, LLVM)
2. `git submodule update --init --recursive` (if not already done)
3. `pnpm install` (installs JS deps for all workspace packages)
4. `pnpm tauri:ensure` (builds vendored cargo-tauri CLI from source)
5. `pnpm dev:app:win` (builds Rust core + Tauri shell + starts Vite)

---

## 4. Blockers

### BLOCKING (Must Fix Before Build)

| # | Issue | Fix |
|---|-------|-----|
| B1 | **pnpm not installed** -- `corepack enable` fails with EPERM in non-admin shell | Install pnpm globally: `npm install -g pnpm@10.10.0`, or run `corepack enable` from an admin terminal |
| B2 | **CMake not installed** -- Required by `whisper-rs-sys` (builds whisper.cpp), `cef-dll-sys`, and other native crates | Install CMake: `winget install Kitware.CMake` or download from cmake.org. Add to PATH. |
| B3 | **Ninja not installed** -- `CMAKE_GENERATOR=Ninja` is set explicitly in `run-dev-win.sh` | Install Ninja: `winget install Ninja-build.Ninja` or `choco install ninja` |
| B4 | **LLVM/Clang not installed** -- `LIBCLANG_PATH` is set to `C:\Program Files\LLVM\bin` in `run-dev-win.sh`; required by `whisper-rs-sys` bindgen | Install LLVM: `winget install LLVM.LLVM` (installs to `C:\Program Files\LLVM\`) |
| B5 | **whisper-rs-sys git URL mismatch** -- Cargo.toml references `closeredgeai/whisper-rs-sys` but Cargo.lock has `tinyhumansai/whisper-rs-sys`. If Cargo.lock is stale or gets regenerated, the build will try `closeredgeai/` which may not exist. | Verify the `closeredgeai/whisper-rs-sys` GitHub repo exists and is accessible. If the repo was renamed from `tinyhumansai`, run `cargo update -p whisper-rs-sys` to update the lockfile. If the repo doesn't exist, update `Cargo.toml` to point to `tinyhumansai/whisper-rs-sys`. |

### WARNING (Should Fix)

| # | Issue | Impact |
|---|-------|--------|
| W1 | **Rust 1.93.0 not the active default** -- `stable` is the system default; `rust-toolchain.toml` should auto-override, but some IDE/tool integrations may use the wrong toolchain | Run `rustup default 1.93.0` or verify `rustup override` is picking up `rust-toolchain.toml` |
| W2 | **No `.env` file present** -- `.env.example` exists but `.env` was not found in root | Copy `.env.example` to `.env` and fill in at minimum one LLM API key (`OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`, or `OPENAI_API_KEY`) |
| W3 | **CEF runtime not yet staged** -- First `dev:app:win` run copies ~270MB of CEF binaries; this takes time and disk space | Expected on first run. Ensure ~1GB free disk space for CEF + Rust target directory. |

### INFO (Nice to Have)

| # | Note |
|---|------|
| I1 | The `openhuman` module name and `OPENHUMAN_*` env vars are legacy naming from before the rename to CloserEdge. They work fine but could be confusing for new contributors. |
| I2 | The `motosan-ai-oauth` crate is published to crates.io (confirmed in Cargo.lock). No private registry access needed. |
| I3 | Git submodules are properly initialized (tauri-cef and tauri-plugin-notification). |
| I4 | The app requires Supabase credentials for auth (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) to function at runtime, but this does not block the build. |

---

## 5. Estimated Effort

### To Get a Dev Build Running

| Task | Time Estimate | Dependency |
|------|---------------|------------|
| Install pnpm | 2 minutes | None |
| Install CMake + Ninja + LLVM | 10 minutes | None (parallel with pnpm) |
| `pnpm install` | 2-5 minutes | pnpm installed |
| Resolve whisper-rs-sys URL | 5-15 minutes | Internet access, may need repo owner |
| First `cargo tauri dev` build | 15-45 minutes | All above complete (compiles ~500 Rust crates + whisper.cpp C++) |
| CEF runtime staging | 2-5 minutes | Automatic on first dev run |

**Total estimated wall time: 30-75 minutes** (mostly Rust compile time)

### Critical Path

```
Install pnpm ──> pnpm install ──> pnpm dev:app:win
                                       |
Install CMake+Ninja+LLVM ──────────────┘
                                       |
Verify whisper-rs-sys URL ─────────────┘
```

The long pole is the Rust compilation (~500+ crates including native C/C++ builds for
whisper-rs-sys and CEF). Subsequent incremental builds are much faster (seconds for
Rust changes, instant for frontend-only changes via Vite HMR).

---

## 6. First Build Guide (Windows)

### Prerequisites Checklist

- [ ] Windows 11 with Git for Windows installed
- [ ] Rust via rustup (1.93.0 toolchain)
- [ ] Node.js >= 24.0.0
- [ ] Visual Studio 2022 Build Tools with "Desktop development with C++" workload

### Step 1: Install Missing Build Tools

Open an **administrator** PowerShell terminal:

```powershell
# Install pnpm (either method works)
corepack enable
corepack prepare pnpm@10.10.0 --activate
# OR
npm install -g pnpm@10.10.0

# Install CMake
winget install Kitware.CMake --accept-package-agreements

# Install Ninja
winget install Ninja-build.Ninja --accept-package-agreements

# Install LLVM (provides libclang for bindgen)
winget install LLVM.LLVM --accept-package-agreements
```

Close and reopen your terminal so PATH changes take effect.

### Step 2: Verify Rust Toolchain

```bash
# From the repo root, rustup should auto-detect rust-toolchain.toml
cd closeredge-app
rustup show active-toolchain
# Should print: 1.93.0-x86_64-pc-windows-msvc

# If not, install it:
rustup install 1.93.0
```

### Step 3: Initialize Submodules

```bash
git submodule update --init --recursive
```

### Step 4: Configure Environment

```bash
cp .env.example .env
# Edit .env and set at minimum:
#   ANTHROPIC_API_KEY=sk-ant-...   (or OPENAI_API_KEY or OPENROUTER_API_KEY)
#   CLOSEREDGE_MODEL_PROVIDER=anthropic
```

### Step 5: Install JavaScript Dependencies

```bash
pnpm install
```

### Step 6: Build and Run (Dev Mode)

```bash
# Windows -- uses Git Bash internally
pnpm dev:app:win
```

This will:
1. Bootstrap the MSVC environment
2. Build the vendored `cargo-tauri` CLI (first run only, ~5 min)
3. Stage the CEF runtime (~270MB, first run only)
4. Start Vite dev server on localhost:1420
5. Compile the Rust core + Tauri shell
6. Launch the desktop app

### Step 7: Verify

The CloserEdge AI desktop window should appear. The Vite dev server provides HMR for
frontend changes. Rust changes require a rebuild (automatic via `cargo tauri dev`).

### Alternative: Frontend-Only Development

If you only need to work on the React frontend without the desktop shell:

```bash
cd app
pnpm dev          # Vite dev server at http://localhost:1420
```

Note: Tauri APIs will not be available in browser-only mode. The app detects this
and falls back gracefully where possible.

### Alternative: Rust Core Only (Headless Server)

```bash
# Build just the core binary (no Tauri, no frontend)
cargo build --bin closeredge-core

# Run the JSON-RPC server
cargo run --bin closeredge-core -- serve
# Listens on http://127.0.0.1:7788 by default
```

### Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| `LNK2038: mismatch detected for '_ITERATOR_DEBUG_LEVEL'` | whisper-rs-sys CRT mismatch | Ensure the patched `whisper-rs-sys` fork is used (check `[patch.crates-io]`) |
| `LNK1181: cannot open input file 'kernel32.lib'` | Windows SDK not on LIB path | `run-dev-win.sh` auto-patches this; verify SDK installed via VS Installer |
| `'pnpm' is not recognized` | pnpm not on PATH in cmd.exe subprocess | `run-dev-win.sh` handles this; ensure pnpm is globally installed |
| `libcef.dll not found` | CEF runtime not staged | Delete `app/src-tauri/target/debug/` and re-run; script will re-stage |
| `cef::initialize(...) != 1` | Second instance running | Close existing CloserEdge AI process |
| `error: linker 'link.exe' not found` | MSVC env not loaded | Run from `pnpm dev:app:win` which bootstraps vcvars64 |
| `Extra operand '...rcgu.o'` from link.exe | Git's GNU `link.exe` found instead of MSVC's | `run-dev-win.sh` pins the linker; verify `CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_LINKER` is set |
