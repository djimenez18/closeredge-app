import { useCoreState } from '../providers/CoreStateProvider';
import RouteLoadingScreen from './RouteLoadingScreen';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAuth?: boolean;
  redirectTo?: string;
}

/**
 * Protected route component that handles authentication checks.
 * Onboarding gating is handled by the AppShell effect (see App.tsx)
 * which redirects between `/onboarding` and the rest of the app based
 * on `onboarding_completed`.
 */
const ProtectedRoute = ({
  children,
  requireAuth: _requireAuth = true,
  redirectTo: _redirectTo,
}: ProtectedRouteProps) => {
  const { isBootstrapping, snapshot: _snapshot } = useCoreState();

  if (isBootstrapping) {
    return <RouteLoadingScreen />;
  }

  // TODO: Re-enable auth check once Supabase auth replaces OpenHuman auth.
  // Bypassed for development — the app is usable without a session token.
  // if (requireAuth && !snapshot.sessionToken) {
  //   return <Navigate to={redirectTo || '/'} replace />;
  // }

  return <>{children}</>;
};

export default ProtectedRoute;
