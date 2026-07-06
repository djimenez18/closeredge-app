import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SUBSCRIPTION_ROUTE } from '../../../constants/links';
import { COMMUNITY_URL } from '../../../utils/links';
import { openUrl } from '../../../utils/openUrl';
import {
  CommunityBanner,
  EarlyBirdyBanner,
  PromotionalCreditsBanner,
  UsageLimitBanner,
} from '../HomeBanners';

vi.mock('../../../utils/openUrl', () => ({ openUrl: vi.fn() }));

const mockNavigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async importOriginal => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

describe('HomeBanners', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('navigates to the in-app subscription page from the usage limit banner', () => {
    render(
      <UsageLimitBanner
        tone="warning"
        icon="⏳"
        title="Limit"
        message="Usage is capped."
        ctaLabel="Buy top-up credits"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Buy top-up credits' }));

    expect(mockNavigate).toHaveBeenCalledWith(SUBSCRIPTION_ROUTE);
    expect(openUrl).not.toHaveBeenCalled();
  });

  it('renders danger tone styles for UsageLimitBanner', () => {
    render(
      <UsageLimitBanner
        tone="danger"
        icon="⚠️"
        title="Out of Usage"
        message="You are out of budget."
        ctaLabel="Get a subscription"
      />
    );
    expect(screen.getByText('Out of Usage')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Get a subscription' }));
    expect(mockNavigate).toHaveBeenCalledWith(SUBSCRIPTION_ROUTE);
  });

  it('navigates to the in-app subscription page from the promotional credits banner', () => {
    render(<PromotionalCreditsBanner promoCredits={12} />);

    fireEvent.click(screen.getByRole('button', { name: 'Get a subscription' }));

    expect(mockNavigate).toHaveBeenCalledWith(SUBSCRIPTION_ROUTE);
    expect(openUrl).not.toHaveBeenCalled();
  });

  it('opens the community URL through openUrl from the community banner', () => {
    render(<CommunityBanner />);

    fireEvent.click(screen.getByRole('button', { name: /join our community/i }));

    expect(openUrl).toHaveBeenCalledWith(COMMUNITY_URL);
  });

  describe('EarlyBirdyBanner', () => {
    it('renders the discount code and headline', () => {
      render(<EarlyBirdyBanner />);

      expect(screen.getByText('The first 1,000 users get 60% off.')).toBeInTheDocument();
      expect(screen.getByText('EARLYBIRDY')).toBeInTheDocument();
    });

    it('navigates to the in-app subscription page when the subscription link is clicked', () => {
      render(<EarlyBirdyBanner />);

      fireEvent.click(screen.getByRole('button', { name: /first subscription/i }));

      expect(mockNavigate).toHaveBeenCalledWith(SUBSCRIPTION_ROUTE);
      expect(openUrl).not.toHaveBeenCalled();
    });

    it('does not render a dismiss button when onDismiss is not provided', () => {
      render(<EarlyBirdyBanner />);

      expect(
        screen.queryByRole('button', { name: /dismiss early bird banner/i })
      ).not.toBeInTheDocument();
    });

    it('renders an accessible dismiss button when onDismiss is provided', () => {
      const onDismiss = vi.fn();
      render(<EarlyBirdyBanner onDismiss={onDismiss} />);

      expect(
        screen.getByRole('button', { name: /dismiss early bird banner/i })
      ).toBeInTheDocument();
    });

    it('calls onDismiss when the dismiss button is clicked', () => {
      const onDismiss = vi.fn();
      render(<EarlyBirdyBanner onDismiss={onDismiss} />);

      fireEvent.click(screen.getByRole('button', { name: /dismiss early bird banner/i }));

      expect(onDismiss).toHaveBeenCalledOnce();
    });

    it('does not navigate when the dismiss button is clicked', () => {
      const onDismiss = vi.fn();
      render(<EarlyBirdyBanner onDismiss={onDismiss} />);

      fireEvent.click(screen.getByRole('button', { name: /dismiss early bird banner/i }));

      expect(mockNavigate).not.toHaveBeenCalled();
      expect(openUrl).not.toHaveBeenCalled();
    });
  });
});
