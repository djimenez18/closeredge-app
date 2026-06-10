import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Stub out the surfaces the mobile shell routes to so we can mount
// `<AppRoutesIOS />` without dragging the full Redux + provider tree along.
vi.mock('./pages/mobile/HomeScreen', () => ({
  default: () => <div data-testid="page-home">home</div>,
}));
vi.mock('./pages/ios/MascotScreen', () => ({
  MascotScreen: () => <div data-testid="page-chat">chat</div>,
}));
vi.mock('./pages/Settings', () => ({
  default: () => <div data-testid="page-settings">settings</div>,
}));
vi.mock('./pages/ios/PairScreen', () => ({
  PairScreen: () => <div data-testid="page-pair">pair</div>,
}));
vi.mock('./pages/mobile/WelcomeScreen', () => ({
  WelcomeScreen: () => <div data-testid="page-welcome">welcome</div>,
}));
vi.mock('./pages/mobile/LoginScreen', () => ({
  LoginScreen: () => <div data-testid="page-login">login</div>,
}));
vi.mock('./components/ios/MobileTabBar', () => ({
  default: () => <nav data-testid="mobile-tab-bar">tabs</nav>,
}));

const listProfiles = vi.fn();
vi.mock('./services/transport/profileStore', () => ({ listProfiles: () => listProfiles() }));

const AppRoutesIOS = (await import('./AppRoutesIOS')).default;

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutesIOS />
    </MemoryRouter>
  );

describe('AppRoutesIOS', () => {
  beforeEach(() => listProfiles.mockReset());
  afterEach(() => vi.clearAllMocks());

  describe('unpaired (no saved profile)', () => {
    beforeEach(() => listProfiles.mockReturnValue([]));

    it('redirects unknown paths to /welcome', () => {
      renderAt('/');
      expect(screen.getByTestId('page-welcome')).toBeInTheDocument();
    });

    it('renders the PairScreen at /pair', () => {
      renderAt('/pair');
      expect(screen.getByTestId('page-pair')).toBeInTheDocument();
    });

    it('renders the LoginScreen at /login', () => {
      renderAt('/login');
      expect(screen.getByTestId('page-login')).toBeInTheDocument();
    });

    it('bounces /home back to /welcome when no profile exists', () => {
      renderAt('/home');
      expect(screen.getByTestId('page-welcome')).toBeInTheDocument();
      expect(screen.queryByTestId('page-home')).not.toBeInTheDocument();
    });

    it('bounces /chat back to /welcome when no profile exists', () => {
      renderAt('/chat');
      expect(screen.getByTestId('page-welcome')).toBeInTheDocument();
      expect(screen.queryByTestId('page-chat')).not.toBeInTheDocument();
    });
  });

  describe('paired (profile exists)', () => {
    beforeEach(() => listProfiles.mockReturnValue([{ id: 'p1' }]));

    it('renders HomeScreen with the mobile tab bar', () => {
      renderAt('/home');
      expect(screen.getByTestId('page-home')).toBeInTheDocument();
      expect(screen.getByTestId('mobile-tab-bar')).toBeInTheDocument();
    });

    it('renders the chat surface at /chat', () => {
      renderAt('/chat');
      expect(screen.getByTestId('page-chat')).toBeInTheDocument();
      expect(screen.getByTestId('mobile-tab-bar')).toBeInTheDocument();
    });

    it('redirects the legacy /human route to /chat', () => {
      renderAt('/human');
      expect(screen.getByTestId('page-chat')).toBeInTheDocument();
    });

    it('renders Settings at /settings/devices via nested route', () => {
      renderAt('/settings/devices');
      expect(screen.getByTestId('page-settings')).toBeInTheDocument();
      expect(screen.getByTestId('mobile-tab-bar')).toBeInTheDocument();
    });

    it('redirects unknown paths to /home when paired', () => {
      renderAt('/');
      expect(screen.getByTestId('page-home')).toBeInTheDocument();
    });
  });
});
