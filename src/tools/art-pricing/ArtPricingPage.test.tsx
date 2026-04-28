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

    // Tuned defaults include overhead and a higher floor; this scenario settles at the floor.
    expect(screen.getAllByText(/\$150\.00/).length).toBeGreaterThan(0);
  });

  it('shows the advanced section only after toggle', async () => {
    const user = userEvent.setup();

    renderPage();

    expect(screen.queryByLabelText(/hourly rate/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /advanced/i }));

    expect(screen.getByLabelText(/hourly rate/i)).toBeInTheDocument();
  });

  it('shows realistic default placeholders in advanced inputs', async () => {
    const user = userEvent.setup();

    renderPage();

    await user.click(screen.getByRole('button', { name: /advanced/i }));

    expect(screen.getByLabelText(/hourly rate/i)).toHaveAttribute('placeholder', '45');
    expect(screen.getByLabelText(/area rate/i)).toHaveAttribute('placeholder', '4');
    expect(screen.getByLabelText(/size exponent/i)).toHaveAttribute('placeholder', '0.75');
    expect(screen.getByLabelText(/time vs area weight/i)).toHaveAttribute('placeholder', '0.6');
    expect(screen.getByLabelText(/fixed overhead/i)).toHaveAttribute('placeholder', '20');
    expect(screen.getByLabelText(/minimum price/i)).toHaveAttribute('placeholder', '150');
    expect(screen.getByLabelText(/gallery commission/i)).toHaveAttribute('placeholder', '50');
  });

  it('shows succinct in-context default info for inputs', async () => {
    const user = userEvent.setup();

    renderPage();

    expect(screen.getByText('Default: 2 hrs')).toBeInTheDocument();
    expect(screen.getByText('Default: 1.0')).toBeInTheDocument();
    expect(screen.getByText('Default: $0')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /advanced/i }));
    expect(screen.getByText('Default: 45')).toBeInTheDocument();
    expect(screen.getByText('Default: 0.75')).toBeInTheDocument();
    expect(screen.getByText('Default: Included in list price')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /reverse/i }));
    expect(screen.getByText('Default: 1:1')).toBeInTheDocument();
  });

  it('shows a short explanation for each section fields', async () => {
    const user = userEvent.setup();

    renderPage();

    expect(screen.getByText('Your studio labor time.')).toBeInTheDocument();
    expect(screen.getByText('Cost of paint, canvas, and supplies.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /advanced/i }));
    expect(screen.getByText('Your target pay per studio hour.')).toBeInTheDocument();
    expect(screen.getByText('How strongly bigger work scales price.')).toBeInTheDocument();
    expect(screen.getByText('Whether gallery cut is added or absorbed.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /reverse/i }));
    expect(screen.getByText('The selling price you want to hit.')).toBeInTheDocument();
    expect(screen.getByText('Shape of the canvas (width to height).')).toBeInTheDocument();
  });

  it('shows the reverse calculator only after toggle', async () => {
    const user = userEvent.setup();

    renderPage();

    expect(screen.queryByLabelText(/target price/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /reverse/i }));

    expect(screen.getByLabelText(/target price/i)).toBeInTheDocument();
  });

  it('shows an easy-to-understand explanation section', () => {
    renderPage();

    expect(screen.getByText(/how this tool works/i)).toBeInTheDocument();
    expect(screen.getByText(/simple idea:/i)).toBeInTheDocument();
  });
});
