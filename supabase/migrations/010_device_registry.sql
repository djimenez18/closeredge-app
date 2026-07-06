-- Device registry: lets a logged-in phone discover and pair with the
-- account's desktops without scanning a QR code ("QR over the cloud").
--
-- The desktop, when Cloud Pairing is enabled, periodically calls the same
-- core RPC the QR modal uses (devices_create_pairing) and upserts the
-- resulting pairing payload here. A phone logged into the same account
-- reads the row and runs the exact same E2E handshake the QR flow uses —
-- the Rust core cannot tell the difference.
--
-- Security model:
--   * RLS: only the owning user can read/write their rows. The pairing
--     token is as sensitive as the QR code itself; account credentials
--     replace physical proximity as the trust proof.
--   * Tokens are short-lived (core-enforced expiry) and refreshed by the
--     desktop while it runs; stale rows simply fail the handshake.
--   * The E2E tunnel crypto (X25519 + XChaCha20-Poly1305) is unchanged —
--     Supabase never sees message plaintext, only the bootstrap payload.

create table if not exists public.device_registry (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Stable per-desktop identity (the pairing channel id rotates per token,
  -- so identity is the install id the desktop persists locally).
  desktop_install_id text not null,
  device_label text not null,
  channel_id text not null,
  core_pubkey text not null,
  pairing_token text not null,
  rpc_url text,
  token_expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, desktop_install_id)
);

alter table public.device_registry enable row level security;

create policy "device_registry_select_own" on public.device_registry
  for select using (auth.uid() = user_id);
create policy "device_registry_insert_own" on public.device_registry
  for insert with check (auth.uid() = user_id);
create policy "device_registry_update_own" on public.device_registry
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "device_registry_delete_own" on public.device_registry
  for delete using (auth.uid() = user_id);

create index if not exists device_registry_user_id_idx
  on public.device_registry (user_id);
