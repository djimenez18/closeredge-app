import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

// supabaseConfigured is read at module scope by the component, so the mock
// value must be set before import; both states are covered via vi.doMock in
// the unconfigured test below.
vi.mock('../../lib/supabase', () => ({ supabaseConfigured: true, supabase: {} }));

const { WelcomeScreen } = await import('./WelcomeScreen');

const renderWelcome = () =>
  render(
    <MemoryRouter initialEntries={['/welcome']}>
      <WelcomeScreen />
    </MemoryRouter>
  );

describe('WelcomeScreen', () => {
  beforeEach(() => navigate.mockReset());

  it('offers login as the primary action when Supabase is configured', async () => {
    renderWelcome();
    await userEvent.click(screen.getByTestId('welcome-login'));
    expect(navigate).toHaveBeenCalledWith('/login');
  });

  it('keeps QR pairing available as a secondary action', async () => {
    renderWelcome();
    await userEvent.click(screen.getByTestId('welcome-scan-qr'));
    expect(navigate).toHaveBeenCalledWith('/pair');
  });
});
