import type { Session, User } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from '../lib/supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseAuthReturn {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    metadata: { businessName: string; contactName: string; businessType: string }
  ) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const mountedRef = useRef(true);

  // Bootstrap: read the current session once, then subscribe to changes.
  useEffect(() => {
    mountedRef.current = true;

    // Get the initial session.
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      if (!mountedRef.current) return;
      setSession(currentSession);
      setUser(currentSession?.user ?? null);
      setIsLoading(false);
    });

    // Listen for auth state changes (sign-in, sign-out, token refresh, etc.)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!mountedRef.current) return;
      setSession(newSession);
      setUser(newSession?.user ?? null);
      setIsLoading(false);
    });

    return () => {
      mountedRef.current = false;
      subscription.unsubscribe();
    };
  }, []);

  // ------------------------------------------------------------------
  // signIn
  // ------------------------------------------------------------------
  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      if (error.message.includes('Invalid login credentials')) {
        throw new Error('The email or password you entered is incorrect.');
      }
      if (error.message.includes('Email not confirmed')) {
        throw new Error('Please verify your email address before signing in.');
      }
      throw error;
    }
  }, []);

  // ------------------------------------------------------------------
  // signUp
  // ------------------------------------------------------------------
  const signUp = useCallback(
    async (
      email: string,
      password: string,
      metadata: { businessName: string; contactName: string; businessType: string }
    ) => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            business_name: metadata.businessName,
            contact_name: metadata.contactName,
            business_type: metadata.businessType,
          },
        },
      });

      if (error) {
        if (error.message.includes('already registered')) {
          throw new Error('This email is already registered. Please sign in instead.');
        }
        if (error.message.includes('password')) {
          throw new Error(
            'Password is too weak. Please use at least 8 characters with a mix of letters, numbers, and symbols.'
          );
        }
        throw error;
      }

      // If the session is available immediately (email confirmation disabled),
      // insert the customer row in `public.customers`.
      if (data.session && data.user) {
        const { error: insertError } = await supabase
          .from('customers')
          .insert({
            id: data.user.id,
            email: email.toLowerCase(),
            business_name: metadata.businessName.trim(),
            contact_name: metadata.contactName.trim(),
            business_type: metadata.businessType,
            created_at: new Date().toISOString(),
          });

        if (insertError) {
          // Log but don't throw -- the auth account was already created.
          // The customer row can be back-filled via a database trigger or admin flow.
          console.error('[useAuth] Failed to insert customer row:', insertError.message);
        }
      }
    },
    []
  );

  // ------------------------------------------------------------------
  // signOut
  // ------------------------------------------------------------------
  const signOut = useCallback(async () => {
    // Clear the subscription module-level cache so stale data is never
    // served to a different user who signs in later.  The cache variable
    // lives inside useSubscription.ts as a module `let`.  Because we
    // cannot modify that file, we force-clear by dynamically importing
    // the module and resetting the binding -- but the simplest portable
    // approach is to rely on the fact that `fetchSubscription()` already
    // guards with `supabase.auth.getUser()` and returns null when there
    // is no user.  We still dispatch a custom event so any mounted
    // useSubscription instance can call its own `refresh()`.
    window.dispatchEvent(new CustomEvent('closeredge:signout'));

    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  // ------------------------------------------------------------------
  // resetPassword
  // ------------------------------------------------------------------
  const resetPassword = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) throw error;
  }, []);

  return { user, session, isLoading, signIn, signUp, signOut, resetPassword };
}
