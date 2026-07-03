/**
 * AdminRoute -- protected route that gates access to the admin panel.
 *
 * Checks Supabase auth for admin role:
 *   1. Supabase user metadata (`user.user_metadata.role === 'admin'`)
 *   2. OR email matches a hard-coded admin list (Diego + Sarah)
 *
 * Non-admins are redirected to /home.
 */
import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';

import { supabase } from '../../lib/supabase';

// Hard-coded admin emails for bootstrapping.  Once user_metadata.role
// is reliably set in Supabase these can be removed.
const ADMIN_EMAILS = new Set([
  'diego.jimenez1118@gmail.com',
  'sarah@closeredge.ai',
  'admin@closeredge.ai',
]);

interface AdminRouteProps {
  children: React.ReactNode;
}

export default function AdminRoute({ children }: AdminRouteProps) {
  // In dev mode, bypass the admin role check so the page is always accessible.
  const devBypass = import.meta.env.DEV;

  const [state, setState] = useState<'loading' | 'authorized' | 'denied'>(
    devBypass ? 'authorized' : 'loading'
  );

  useEffect(() => {
    // Skip the Supabase admin check entirely in dev mode.
    if (devBypass) return;

    let cancelled = false;

    async function checkAdmin() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (cancelled) return;

      if (!user) {
        setState('denied');
        return;
      }

      // Check user_metadata for an explicit admin role.
      const metaRole = (user.user_metadata as Record<string, unknown>)?.role;
      if (metaRole === 'admin') {
        setState('authorized');
        return;
      }

      // Fallback: check hard-coded email list.
      if (user.email && ADMIN_EMAILS.has(user.email.toLowerCase())) {
        setState('authorized');
        return;
      }

      setState('denied');
    }

    void checkAdmin();

    return () => {
      cancelled = true;
    };
  }, [devBypass]);

  if (state === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-neutral-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-neutral-500">Verifying admin access...</p>
        </div>
      </div>
    );
  }

  if (state === 'denied') {
    return <Navigate to="/home" replace />;
  }

  return <>{children}</>;
}
