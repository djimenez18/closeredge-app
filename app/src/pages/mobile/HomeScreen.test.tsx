import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

const listProfiles = vi.fn();
vi.mock('../../services/transport/profileStore', () => ({ listProfiles: () => listProfiles() }));

const isHealthy = vi.fn();
vi.mock('../../services/transport/TransportManager', () => ({
  createTransportManager: () => ({
    getTransport: async () => ({ kind: 'lan', isHealthy: () => isHealthy() }),
  }),
}));

const dispatch = vi.fn();
vi.mock('../../store/hooks', () => ({
  useAppDispatch: () => dispatch,
  useAppSelector: (selector: (s: unknown) => unknown) => selector({ theme: { mode: 'dark' } }),
}));

vi.mock('../../utils/config', () => ({ BACKEND_URL: 'http://localhost:9999' }));

const HomeScreen = (await import('./HomeScreen')).default;

const renderHome = () =>
  render(
    <MemoryRouter initialEntries={['/home']}>
      <HomeScreen />
    </MemoryRouter>
  );

describe('HomeScreen', () => {
  beforeEach(() => {
    navigate.mockReset();
    dispatch.mockReset();
    listProfiles.mockReset();
    isHealthy.mockReset();
    listProfiles.mockReturnValue([{ id: 'p1', label: 'Office desktop' }]);
    isHealthy.mockResolvedValue(true);
  });

  it('renders a time-aware greeting', () => {
    renderHome();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(
      /Good (morning|afternoon|evening)/
    );
  });

  it('shows the paired desktop label and a live health result', async () => {
    renderHome();
    expect(screen.getByText('Office desktop')).toBeInTheDocument();
    expect(await screen.findByText(/Connected/)).toBeInTheDocument();
  });

  it('shows Unreachable when the health probe fails', async () => {
    isHealthy.mockResolvedValue(false);
    renderHome();
    expect(await screen.findByText(/Unreachable/)).toBeInTheDocument();
  });

  it('navigates to /chat from the hero CTA', async () => {
    renderHome();
    await userEvent.click(screen.getByTestId('home-talk-cta'));
    expect(navigate).toHaveBeenCalledWith('/chat');
  });

  it('dispatches a theme change from the toggle', async () => {
    renderHome();
    await userEvent.click(screen.getByRole('button', { name: 'Toggle dark mode' }));
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ payload: 'light' }));
  });

  it('navigates to device settings from Manage', async () => {
    renderHome();
    await userEvent.click(screen.getByRole('button', { name: 'Manage' }));
    expect(navigate).toHaveBeenCalledWith('/settings/devices');
  });
});
