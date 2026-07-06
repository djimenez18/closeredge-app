import React, { createContext, useContext } from 'react';

import { useAuth, type UseAuthReturn } from '../../hooks/useAuth';
import AuthScreen from './AuthScreen';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const AuthContext = createContext<UseAuthReturn | null>(null);

/**
 * Consume the auth context.
 *
 * Must be called from a component that is a descendant of `<AuthProvider>`.
 */
export function useAuthContext(): UseAuthReturn {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuthContext must be used within an <AuthProvider>');
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface AuthProviderProps {
  children: React.ReactNode;
}

/**
 * Wraps the app with Supabase auth state.
 *
 * - While the initial session check is in progress, a loading spinner is shown.
 * - If no session exists, the `<AuthScreen>` is rendered instead of children.
 * - Once authenticated, `children` are rendered and auth state is available
 *   via `useAuthContext()`.
 */
const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const auth = useAuth();

  // Initial loading -- checking for an existing session.
  if (auth.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <svg className="h-8 w-8 animate-spin text-[#7C3AED]" viewBox="0 0 24 24" fill="none">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
            />
          </svg>
          <span className="text-sm text-gray-500">Loading...</span>
        </div>
      </div>
    );
  }

  // Not authenticated -- show the login / signup screen.
  if (!auth.session) {
    return (
      <AuthContext.Provider value={auth}>
        <AuthScreen />
      </AuthContext.Provider>
    );
  }

  // Authenticated -- render app content.
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
};

export default AuthProvider;
