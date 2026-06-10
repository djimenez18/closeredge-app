/**
 * AppRoutesIOS — routes for the iOS + Android app targets.
 *
 * The filename is iOS-historic; the routes apply to every mobile target.
 *
 * Two phases:
 *   1. Unpaired — /welcome (log in with the CloserEdge account, or scan a
 *      QR). Either path writes a profile to profileStore → /home.
 *   2. Paired — /home, /chat, /settings/* are reachable. A mobile tab bar
 *      sits at the bottom of the viewport. Any unknown path falls back to
 *      /home.
 *
 * Surfaces:
 *   - /home — HomeScreen, the CloserEdge command center (mobile-native).
 *   - /chat — MascotScreen: animated mascot + streaming chat + hold-to-talk
 *     voice (PTT) + spoken replies. Calls core RPC through the
 *     TransportManager bound to the saved profile.
 *   - /settings — the desktop Settings page, reused as-is.
 *   - /human — legacy alias for the old default route; redirects to /chat.
 */
import debug from 'debug';
import { type FC } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import MobileTabBar from './components/ios/MobileTabBar';
import { MascotScreen } from './pages/ios/MascotScreen';
import { PairScreen } from './pages/ios/PairScreen';
import HomeScreen from './pages/mobile/HomeScreen';
import { LoginScreen } from './pages/mobile/LoginScreen';
import { WelcomeScreen } from './pages/mobile/WelcomeScreen';
import Settings from './pages/Settings';
import { listProfiles } from './services/transport/profileStore';

const log = debug('mobile:routes');

const isPaired = (): boolean => listProfiles().length > 0;

const IOSDefaultRedirect: FC = () => {
  const paired = isPaired();
  log('[mobile] default redirect paired=%s', paired);
  return <Navigate to={paired ? '/home' : '/welcome'} replace />;
};

/** Wraps a paired-state route with the mobile tab bar. */
const MobileShell: FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="relative h-screen flex flex-col overflow-hidden">
    <div className="flex-1 overflow-hidden relative">{children}</div>
    <MobileTabBar />
  </div>
);

/** Bounces to /pair when no profile exists; otherwise renders children. */
const RequirePairing: FC<{ children: React.ReactNode }> = ({ children }) => {
  if (!isPaired()) {
    log('[mobile] no pairing — redirecting to /welcome');
    return <Navigate to="/welcome" replace />;
  }
  return <MobileShell>{children}</MobileShell>;
};

const AppRoutesIOS: FC = () => {
  return (
    <Routes>
      {/* Unpaired entry — log in (account pairing) or scan a QR. */}
      <Route path="/welcome" element={<WelcomeScreen />} />
      <Route path="/login" element={<LoginScreen />} />
      <Route path="/pair" element={<PairScreen />} />

      {/* Home — the CloserEdge command center. */}
      <Route
        path="/home"
        element={
          <RequirePairing>
            <HomeScreen />
          </RequirePairing>
        }
      />

      {/* Chat — mascot + voice + streaming chat. */}
      <Route
        path="/chat"
        element={
          <RequirePairing>
            <MascotScreen />
          </RequirePairing>
        }
      />

      {/* Legacy alias: the pre-redesign default route. */}
      <Route path="/human" element={<Navigate to="/chat" replace />} />

      <Route
        path="/settings/*"
        element={
          <RequirePairing>
            <Settings />
          </RequirePairing>
        }
      />

      <Route path="*" element={<IOSDefaultRedirect />} />
    </Routes>
  );
};

export default AppRoutesIOS;
