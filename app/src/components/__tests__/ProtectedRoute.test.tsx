import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import ProtectedRoute from '../ProtectedRoute';

const mockUseCoreState = vi.fn();

vi.mock('../../providers/CoreStateProvider', () => ({ useCoreState: () => mockUseCoreState() }));

function renderRoute(routes: React.ReactNode, initialEntries = ['/']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>{routes}</Routes>
    </MemoryRouter>
  );
}

describe('ProtectedRoute', () => {
  it('renders a loading screen while bootstrapping', () => {
    mockUseCoreState.mockReturnValue({ isBootstrapping: true, snapshot: { sessionToken: null } });

    renderRoute(
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <div>Protected Content</div>
          </ProtectedRoute>
        }
      />
    );

    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('renders children when a session token exists', () => {
    mockUseCoreState.mockReturnValue({
      isBootstrapping: false,
      snapshot: { sessionToken: 'valid-jwt' },
    });

    renderRoute(
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <div>Protected Content</div>
          </ProtectedRoute>
        }
      />
    );

    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  // The auth check is temporarily bypassed in the CloserEdge fork (see the
  // TODO in ProtectedRoute.tsx) — until Supabase auth replaces OpenHuman
  // auth, protected children render even without a session token.
  it('renders children without a token while the auth gate is bypassed (requireAuth=true)', () => {
    mockUseCoreState.mockReturnValue({ isBootstrapping: false, snapshot: { sessionToken: null } });

    renderRoute(
      <>
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <div>Dashboard</div>
            </ProtectedRoute>
          }
        />
        <Route path="/" element={<div>Landing</div>} />
      </>,
      ['/dashboard']
    );

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.queryByText('Landing')).not.toBeInTheDocument();
  });

  it('ignores custom redirectTo without a token while the auth gate is bypassed', () => {
    mockUseCoreState.mockReturnValue({ isBootstrapping: false, snapshot: { sessionToken: null } });

    renderRoute(
      <>
        <Route
          path="/custom"
          element={
            <ProtectedRoute redirectTo="/login">
              <div>Custom Protected</div>
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<div>Login Page</div>} />
      </>,
      ['/custom']
    );

    expect(screen.getByText('Custom Protected')).toBeInTheDocument();
    expect(screen.queryByText('Login Page')).not.toBeInTheDocument();
  });
});
