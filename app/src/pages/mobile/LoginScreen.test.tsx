import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

const signInWithPassword = vi.fn();
const getSession = vi.fn();
vi.mock('../../lib/supabase', () => ({
  supabaseConfigured: true,
  supabase: {
    auth: {
      signInWithPassword: (...args: unknown[]) => signInWithPassword(...args),
      getSession: () => getSession(),
    },
  },
}));

const listRegisteredDesktops = vi.fn();
vi.mock('../../services/deviceRegistry', () => ({
  listRegisteredDesktops: () => listRegisteredDesktops(),
}));

const connectFromPairPayload = vi.fn();
vi.mock('../../services/transport/connectFromPairPayload', () => ({
  connectFromPairPayload: (...args: unknown[]) => connectFromPairPayload(...args),
}));

const { LoginScreen } = await import('./LoginScreen');

const desktop = (overrides: Record<string, unknown> = {}) => ({
  id: 'row-1',
  desktopInstallId: 'install-1',
  deviceLabel: 'Diego’s Desktop',
  payload: {
    channelId: 'chan-1',
    pairingToken: 'tok',
    corePubkey: 'pk',
    expiresAt: Math.floor(Date.now() / 1000) + 600,
  },
  lastSeenAt: new Date().toISOString(),
  online: true,
  ...overrides,
});

const renderLogin = () =>
  render(
    <MemoryRouter initialEntries={['/login']}>
      <LoginScreen />
    </MemoryRouter>
  );

describe('LoginScreen', () => {
  beforeEach(() => {
    navigate.mockReset();
    signInWithPassword.mockReset();
    getSession.mockReset();
    listRegisteredDesktops.mockReset();
    connectFromPairPayload.mockReset();
    getSession.mockResolvedValue({ data: { session: null } });
  });

  it('signs in then lists the account desktops', async () => {
    signInWithPassword.mockResolvedValue({ error: null });
    listRegisteredDesktops.mockResolvedValue([desktop()]);

    renderLogin();
    await userEvent.type(screen.getByLabelText('Email'), 'diego@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'hunter22');
    await userEvent.click(screen.getByTestId('login-submit'));

    expect(await screen.findByText('Diego’s Desktop')).toBeInTheDocument();
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'diego@example.com',
      password: 'hunter22',
    });
  });

  it('shows the sign-in error and stays on credentials', async () => {
    signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } });

    renderLogin();
    await userEvent.type(screen.getByLabelText('Email'), 'diego@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong');
    await userEvent.click(screen.getByTestId('login-submit'));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid login credentials');
    expect(listRegisteredDesktops).not.toHaveBeenCalled();
  });

  it('skips credentials when a session already exists', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    listRegisteredDesktops.mockResolvedValue([desktop()]);

    renderLogin();
    expect(await screen.findByText('Diego’s Desktop')).toBeInTheDocument();
  });

  it('connects to a desktop and navigates home', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    listRegisteredDesktops.mockResolvedValue([desktop()]);
    connectFromPairPayload.mockResolvedValue({ kind: 'ok' });

    renderLogin();
    await userEvent.click(await screen.findByTestId('desktop-install-1'));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/home', { replace: true }));
    expect(connectFromPairPayload).toHaveBeenCalledWith(
      expect.objectContaining({ channelId: 'chan-1' }),
      'Diego’s Desktop'
    );
  });

  it('surfaces a connect failure and returns to the device list', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    listRegisteredDesktops.mockResolvedValue([desktop()]);
    connectFromPairPayload.mockResolvedValue({ kind: 'unhealthy' });

    renderLogin();
    await userEvent.click(await screen.findByTestId('desktop-install-1'));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Couldn't reach/);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('offers QR fallback when no desktops are registered', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    listRegisteredDesktops.mockResolvedValue([]);

    renderLogin();
    await userEvent.click(await screen.findByText('Pair with QR code instead'));
    expect(navigate).toHaveBeenCalledWith('/pair');
  });

  it('disables offline desktops', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    listRegisteredDesktops.mockResolvedValue([desktop({ online: false })]);

    renderLogin();
    expect(await screen.findByTestId('desktop-install-1')).toBeDisabled();
  });
});
