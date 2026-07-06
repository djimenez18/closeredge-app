import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import BillingPanel from './BillingPanel';

describe('<BillingPanel />', () => {
  it('redirects to the in-app subscription page (no external billing dashboard)', () => {
    render(
      <MemoryRouter initialEntries={['/settings/billing']}>
        <Routes>
          <Route path="/settings/billing" element={<BillingPanel />} />
          <Route path="/subscription" element={<div data-testid="subscription-page" />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByTestId('subscription-page')).toBeInTheDocument();
  });
});
