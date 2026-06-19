#!/usr/bin/env node
/**
 * check-mobile-signin.mjs — live end-to-end check of the mobile login-first
 * sign-in flow against the real Supabase backend. No app or device needed.
 *
 * It runs the exact calls LoginScreen makes:
 *   1. supabase.auth.signInWithPassword(...)          (the sign-in)
 *   2. select from device_registry                     (listRegisteredDesktops)
 * With --roundtrip it also publishes a synthetic desktop row (as the desktop's
 * Cloud Pairing would), reads it back as the phone would, then deletes it —
 * proving RLS own-row write + the full publish→discover path.
 *
 * No credentials are stored or printed. You supply a TEST account you created
 * (Supabase dashboard → Authentication → Users → Add user) or your real one.
 *
 * Run from the `app/` directory (so @supabase/supabase-js resolves):
 *   # PowerShell
 *   $env:SUPABASE_URL="https://njysnjppkachrcgxmsiw.supabase.co"
 *   $env:SUPABASE_ANON_KEY="<your anon key>"
 *   $env:TEST_EMAIL="tester@example.com"
 *   $env:TEST_PASSWORD="<password>"
 *   node scripts/check-mobile-signin.mjs --roundtrip
 *
 *   # bash
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... TEST_EMAIL=... TEST_PASSWORD=... \
 *     node scripts/check-mobile-signin.mjs --roundtrip
 */
import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_ANON_KEY, TEST_EMAIL, TEST_PASSWORD } = process.env;
const roundtrip = process.argv.includes('--roundtrip');

const ok = m => console.log('  ✓ ' + m);
const bad = m => {
  console.error('  ✗ ' + m);
  process.exitCode = 1;
};

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !TEST_EMAIL || !TEST_PASSWORD) {
  console.error('Missing env: set SUPABASE_URL, SUPABASE_ANON_KEY, TEST_EMAIL, TEST_PASSWORD.');
  process.exit(2);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Same column list LoginScreen's listRegisteredDesktops() selects.
const SELECT =
  'id, desktop_install_id, device_label, channel_id, core_pubkey, pairing_token, rpc_url, token_expires_at, last_seen_at';

console.log('1) Sign in (supabase.auth.signInWithPassword)');
const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
  email: TEST_EMAIL,
  password: TEST_PASSWORD,
});
if (authErr || !auth?.session) {
  bad(`sign-in failed: ${authErr?.message ?? 'no session returned'}`);
  process.exit(1);
}
const uid = auth.user.id;
ok(`signed in as ${auth.user.email} (uid ${uid.slice(0, 8)}…)`);

console.log('2) Read device_registry (listRegisteredDesktops)');
const { data: rows, error: readErr } = await supabase
  .from('device_registry')
  .select(SELECT)
  .order('last_seen_at', { ascending: false });
if (readErr) {
  bad(`device_registry read failed: ${readErr.message}`);
} else {
  ok(`table readable under RLS — ${rows.length} desktop(s) registered for this account`);
  if (rows.length === 0) {
    console.log('    (none yet — open the desktop app, sign in to the SAME account, and turn on');
    console.log('     Settings → Devices → Cloud Pairing so it publishes a row)');
  }
}

if (roundtrip) {
  console.log('3) Publish → discover → cleanup round-trip (RLS own-row write)');
  const installId = 'signin-check-' + uid.slice(0, 8);
  const row = {
    user_id: uid,
    desktop_install_id: installId,
    device_label: 'Sign-in check (synthetic)',
    channel_id: 'chk-' + Date.now(),
    core_pubkey: 'chk-pubkey',
    pairing_token: 'chk-token',
    rpc_url: null,
    token_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    last_seen_at: new Date().toISOString(),
  };
  const { error: insErr } = await supabase
    .from('device_registry')
    .upsert(row, { onConflict: 'user_id,desktop_install_id' });
  if (insErr) {
    bad(`publish (RLS insert) failed: ${insErr.message}`);
  } else {
    ok('published a synthetic desktop row (own-row insert works)');
    const { data: back, error: rbErr } = await supabase
      .from('device_registry')
      .select('device_label')
      .eq('desktop_install_id', installId);
    if (rbErr || !back?.length) bad(`read-back failed: ${rbErr?.message ?? 'row not visible'}`);
    else ok('phone-side read sees the published desktop (publish → discover works)');
    const { error: delErr } = await supabase
      .from('device_registry')
      .delete()
      .eq('desktop_install_id', installId);
    if (delErr) bad(`cleanup delete failed: ${delErr.message}`);
    else ok('cleaned up the synthetic row');
  }
}

await supabase.auth.signOut();
console.log(
  process.exitCode ? '\nFAIL' : '\nPASS — mobile sign-in path verified live against Supabase'
);
