import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { AppShellProvider } from '../../components/AppShellContext';
import { CanvasBuilderPage } from './CanvasBuilderPage';

function renderPage() {
  return render(
    <AppShellProvider value={{ menuOpen: false, openMenu: () => { }, closeMenu: () => { } }}>
      <CanvasBuilderPage />
    </AppShellProvider>
  );
}

describe('CanvasBuilderPage', () => {
  it('renders a live shopping list from artist inputs', async () => {
    const user = userEvent.setup();

    renderPage();

    const widthInput = screen.getByLabelText(/canvas width/i);
    const heightInput = screen.getByLabelText(/canvas height/i);
    const quantityInput = screen.getByLabelText(/quantity/i);

    await user.clear(widthInput);
    await user.type(widthInput, '30');
    await user.clear(heightInput);
    await user.type(heightInput, '40');
    await user.clear(quantityInput);
    await user.type(quantityInput, '2');

    expect(screen.getByText(/30 in width bars/i)).toBeInTheDocument();
    expect(screen.getAllByText(/4 pieces/i)).toHaveLength(3);
    expect(screen.getByText(/fabric cut size/i)).toBeInTheDocument();
    expect(screen.getByText(/39 in x 49 in/i)).toBeInTheDocument();
  });

  it('renders a live scale diagram with dimension labels', async () => {
    const user = userEvent.setup();

    const { container } = renderPage();

    const widthInput = screen.getByLabelText(/canvas width/i);
    const heightInput = screen.getByLabelText(/canvas height/i);

    await user.clear(widthInput);
    await user.type(widthInput, '20');
    await user.clear(heightInput);
    await user.type(heightInput, '10');

    expect(screen.getByRole('img', { name: /canvas preview diagram/i })).toBeInTheDocument();
    expect(screen.getAllByText(/20 in width/i)).toHaveLength(2);
    expect(screen.getAllByText(/10 in height/i)).toHaveLength(2);

    const widthLabel = Array.from(container.querySelectorAll('text')).find((node) => node.textContent?.includes('20 in width'));

    expect(widthLabel).toHaveAttribute('y');
    expect(Number(widthLabel?.getAttribute('y'))).toBeGreaterThanOrEqual(12);
  });

  it('shows one or two support braces in the diagram based on threshold rules', async () => {
    const user = userEvent.setup();

    const { container } = renderPage();

    const widthInput = screen.getByLabelText(/canvas width/i);
    const heightInput = screen.getByLabelText(/canvas height/i);

    await user.clear(widthInput);
    await user.type(widthInput, '48');
    await user.clear(heightInput);
    await user.type(heightInput, '24');

    expect(container.querySelectorAll('[data-testid="support-brace"]')).toHaveLength(1);

    await user.clear(heightInput);
    await user.type(heightInput, '48');

    expect(container.querySelectorAll('[data-testid="support-brace"]')).toHaveLength(2);
  });

  it('shows stretcher bar width and four mitre cuts in the diagram', async () => {
    const user = userEvent.setup();

    const { container } = renderPage();

    expect(screen.getByText(/bar width: 1\.5 in/i)).toBeInTheDocument();
    expect(container.querySelectorAll('[data-testid="mitre-cut"]')).toHaveLength(4);

    const woodWidthInput = screen.getByLabelText(/stretcher width/i);
    await user.clear(woodWidthInput);
    await user.type(woodWidthInput, '2.25');

    expect(screen.getByText(/bar width: 2\.25 in/i)).toBeInTheDocument();
  });

  it('indicates wire hanger screw positions based on canvas size', async () => {
    const user = userEvent.setup();

    const { container } = renderPage();

    const widthInput = screen.getByLabelText(/canvas width/i);
    const heightInput = screen.getByLabelText(/canvas height/i);

    await user.clear(widthInput);
    await user.type(widthInput, '30');
    await user.clear(heightInput);
    await user.type(heightInput, '40');

    expect(container.querySelectorAll('[data-testid="hanger-screw"]')).toHaveLength(2);
    expect(container.querySelector('[data-testid="hanger-wire"]')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="hanger-offset-line"]')).toBeInTheDocument();
    expect(screen.getByText(/hanger screws/i)).toBeInTheDocument();
    expect(screen.getByText(/down from top/i)).toBeInTheDocument();
  });

  it('shows additional hanger guidance when one-third height exceeds 12 inches', async () => {
    const user = userEvent.setup();

    renderPage();

    const heightInput = screen.getByLabelText(/canvas height/i);

    await user.clear(heightInput);
    await user.type(heightInput, '60');

    expect(screen.getByText(/hanger screws: 12 in down from top/i)).toBeInTheDocument();
    expect(screen.getByText(/very tall canvas: consider cleat or two-hook hanging/i)).toBeInTheDocument();
  });

  it('allows toggling hanger placement visibility and defaults to on', async () => {
    const user = userEvent.setup();

    const { container } = renderPage();

    const hangerToggle = screen.getByLabelText(/show hanger placement/i);

    expect(hangerToggle).toBeChecked();
    expect(container.querySelectorAll('[data-testid="hanger-screw"]')).toHaveLength(2);

    await user.click(hangerToggle);

    expect(hangerToggle).not.toBeChecked();
    expect(container.querySelectorAll('[data-testid="hanger-screw"]')).toHaveLength(0);
    expect(container.querySelector('[data-testid="hanger-wire"]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-testid="hanger-offset-line"]')).not.toBeInTheDocument();
    expect(screen.queryByText(/hanger screws:/i)).not.toBeInTheDocument();
  });
});