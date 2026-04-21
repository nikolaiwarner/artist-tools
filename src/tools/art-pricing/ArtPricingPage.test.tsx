import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { AppShellProvider } from '../../components/AppShellContext';
import { ArtPricingPage } from './ArtPricingPage';

function renderPage() {
  return render(
    <AppShellProvider value={{ menuOpen: false, openMenu: () => { }, closeMenu: () => { } }}>
      <ArtPricingPage />
    </AppShellProvider>
  );
}

describe('ArtPricingPage', () => {
  it('renders without crashing', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: /art pricing calculator/i })).toBeInTheDocument();
  });

  it('shows a placeholder prompt when dimensions and time are empty', () => {
    renderPage();

    expect(screen.getByText(/enter time and dimensions/i)).toBeInTheDocument();
  });

  it('displays a calculated price when time, width and height are filled in', async () => {
    const user = userEvent.setup();

    renderPage();

    await user.clear(screen.getByLabelText(/time spent/i));
    await user.type(screen.getByLabelText(/time spent/i), '2');
    await user.clear(screen.getByLabelText(/width/i));
    await user.type(screen.getByLabelText(/width/i), '10');
    await user.clear(screen.getByLabelText(/height/i));
    await user.type(screen.getByLabelText(/height/i), '10');

    // timeCost=150, areaCost=60, blended=105, finalPrice=max(105,100)=105
    expect(screen.getAllByText(/\$105/).length).toBeGreaterThan(0);
  });

  it('shows the advanced section only after toggle', async () => {
    const user = userEvent.setup();

    renderPage();

    expect(screen.queryByLabelText(/hourly rate/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /advanced/i }));

    expect(screen.getByLabelText(/hourly rate/i)).toBeInTheDocument();
  });

  it('shows the reverse calculator only after toggle', async () => {
    const user = userEvent.setup();

    renderPage();

    expect(screen.queryByLabelText(/target price/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /reverse/i }));

    expect(screen.getByLabelText(/target price/i)).toBeInTheDocument();
  });
});
