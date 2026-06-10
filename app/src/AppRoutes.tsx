import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import AppRoutesIOS from './AppRoutesIOS';
import DefaultRedirect from './components/DefaultRedirect';
import ProtectedRoute from './components/ProtectedRoute';
import RouteLoadingScreen from './components/RouteLoadingScreen';
import HumanPage from './features/human/HumanPage';
import { getIsMobile } from './lib/platform';
import Accounts from './pages/Accounts';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminLayout from './pages/admin/AdminLayout';
import AdminRoute from './pages/admin/AdminRoute';
import AgentHealth from './pages/admin/AgentHealth';
import Analytics from './pages/admin/Analytics';
import ClientDetail from './pages/admin/ClientDetail';
import ClientsList from './pages/admin/ClientsList';
import AgentWorkflows from './pages/AgentWorkflows';
import Channels from './pages/Channels';
import Home from './pages/Home';
import Intelligence from './pages/Intelligence';
import Notifications from './pages/Notifications';
import Onboarding from './pages/onboarding/Onboarding';
import Routines from './pages/Routines';
import Settings from './pages/Settings';
import SkillNew from './pages/SkillNew';
import Skills from './pages/Skills';
import SkillsRun from './pages/SkillsRun';
import WebCallbackPage from './pages/WebCallbackPage';

// ── Lazy-loaded CloserEdge feature pages ────────────────────────────
const HiveMindPage = lazy(() =>
  import('./features/hivemind/HiveMindPage').then(m => ({ default: m.HiveMindPage }))
);
const WarRoomPage = lazy(() =>
  import('./features/warroom/WarRoomPage').then(m => ({ default: m.WarRoomPage }))
);
const AdversaryPage = lazy(() =>
  import('./features/adversary/AdversaryPage').then(m => ({ default: m.AdversaryPage }))
);
const MemoryExplorer = lazy(() =>
  import('./features/memory/MemoryExplorer').then(m => ({ default: m.MemoryExplorer }))
);
const SubscriptionPage = lazy(() => import('./pages/SubscriptionPage'));

const AppRoutes = () => {
  // Mobile target (iOS or Android): pair → Human/Chat/Settings only.
  // Desktop routes are not rendered.
  if (getIsMobile()) {
    return <AppRoutesIOS />;
  }

  return (
    <Routes>
      {/* TODO: Restore Welcome gate once Supabase auth fully replaces OpenHuman auth */}
      <Route path="/" element={<Navigate to="/home" replace />} />

      <Route path="/callback/:kind" element={<WebCallbackPage />} />
      <Route path="/callback/:kind/:status" element={<WebCallbackPage />} />

      {/* Onboarding (full-page stepper, gated by onboarding_completed) */}
      <Route
        path="/onboarding/*"
        element={
          <ProtectedRoute requireAuth={true}>
            <Onboarding />
          </ProtectedRoute>
        }
      />

      {/* Protected routes */}
      <Route
        path="/home"
        element={
          <ProtectedRoute requireAuth={true}>
            <Home />
          </ProtectedRoute>
        }
      />

      <Route
        path="/human"
        element={
          <ProtectedRoute requireAuth={true}>
            <HumanPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/intelligence"
        element={
          <ProtectedRoute requireAuth={true}>
            <Intelligence />
          </ProtectedRoute>
        }
      />

      {/* Skills lives at /skills with its 4 sub-tabs (Composio / Channels /
          MCP Servers / Runners). The scheduled-skills dashboard concept
          composes INSIDE the Runners sub-tab, not as a separate top-level
          page — the bottom-bar "Connections" entry has always pointed at
          /skills to surface Composio integrations + MCP, and that muscle
          memory is restored here.
          `/skills/new` is the create-a-skill authoring page.
          Order matters: keep `/skills/new` before `/skills` so it wins the
          prefix match. */}
      <Route
        path="/skills/new"
        element={
          <ProtectedRoute requireAuth={true}>
            <SkillNew />
          </ProtectedRoute>
        }
      />

      <Route
        path="/skills/run"
        element={
          <ProtectedRoute requireAuth={true}>
            <SkillsRun />
          </ProtectedRoute>
        }
      />

      <Route
        path="/skills"
        element={
          <ProtectedRoute requireAuth={true}>
            <Skills />
          </ProtectedRoute>
        }
      />

      {/* Unified chat = agent + connected web apps. Replaces the old
          /conversations and /accounts routes. */}
      <Route
        path="/chat"
        element={
          <ProtectedRoute requireAuth={true}>
            <Accounts />
          </ProtectedRoute>
        }
      />

      <Route
        path="/channels"
        element={
          <ProtectedRoute requireAuth={true}>
            <Channels />
          </ProtectedRoute>
        }
      />

      <Route
        path="/notifications"
        element={
          <ProtectedRoute requireAuth={true}>
            <Notifications />
          </ProtectedRoute>
        }
      />

      <Route
        path="/routines"
        element={
          <ProtectedRoute requireAuth={true}>
            <Routines />
          </ProtectedRoute>
        }
      />

      <Route
        path="/workflows"
        element={
          <ProtectedRoute requireAuth={true}>
            <AgentWorkflows />
          </ProtectedRoute>
        }
      />

      {/* Admin panel (role-gated) */}
      <Route
        path="/admin"
        element={
          <AdminRoute>
            <AdminLayout />
          </AdminRoute>
        }>
        <Route index element={<AdminDashboard />} />
        <Route path="clients" element={<ClientsList />} />
        <Route path="clients/:clientId" element={<ClientDetail />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="agents" element={<AgentHealth />} />
        <Route path="settings/*" element={<Settings />} />
      </Route>

      {/* ── CloserEdge feature pages (lazy-loaded) ───────────────── */}
      <Route
        path="/hivemind"
        element={
          <ProtectedRoute requireAuth={true}>
            <Suspense fallback={<RouteLoadingScreen />}>
              <HiveMindPage />
            </Suspense>
          </ProtectedRoute>
        }
      />

      <Route
        path="/warroom"
        element={
          <ProtectedRoute requireAuth={true}>
            <Suspense fallback={<RouteLoadingScreen />}>
              <WarRoomPage />
            </Suspense>
          </ProtectedRoute>
        }
      />

      <Route
        path="/adversary"
        element={
          <ProtectedRoute requireAuth={true}>
            <Suspense fallback={<RouteLoadingScreen />}>
              <AdversaryPage />
            </Suspense>
          </ProtectedRoute>
        }
      />

      <Route
        path="/memory"
        element={
          <ProtectedRoute requireAuth={true}>
            <Suspense fallback={<RouteLoadingScreen />}>
              <MemoryExplorer />
            </Suspense>
          </ProtectedRoute>
        }
      />

      <Route
        path="/subscription"
        element={
          <ProtectedRoute requireAuth={true}>
            <Suspense fallback={<RouteLoadingScreen />}>
              <SubscriptionPage />
            </Suspense>
          </ProtectedRoute>
        }
      />

      <Route path="/webhooks" element={<Navigate to="/settings/webhooks-triggers" replace />} />

      <Route
        path="/settings/*"
        element={
          <ProtectedRoute requireAuth={true}>
            <Settings />
          </ProtectedRoute>
        }
      />

      {/* Default redirect based on auth status */}
      <Route path="*" element={<DefaultRedirect />} />
    </Routes>
  );
};

export default AppRoutes;
