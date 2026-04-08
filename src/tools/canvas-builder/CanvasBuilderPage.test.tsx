import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { CanvasBuilderPage } from './CanvasBuilderPage';

describe('CanvasBuilderPage', () => {
  it('renders a live shopping list from artist inputs', async () => {
    const user = userEvent.setup();

    render(<CanvasBuilderPage />);

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

    render(<CanvasBuilderPage />);

    const widthInput = screen.getByLabelText(/canvas width/i);
    const heightInput = screen.getByLabelText(/canvas height/i);

    await user.clear(widthInput);
    await user.type(widthInput, '20');
    await user.clear(heightInput);
    await user.type(heightInput, '10');

    expect(screen.getByRole('img', { name: /canvas preview diagram/i })).toBeInTheDocument();
    expect(screen.getAllByText(/20 in width/i)).toHaveLength(2);
    expect(screen.getAllByText(/10 in height/i)).toHaveLength(2);
  });

  it('shows one or two support braces in the diagram based on threshold rules', async () => {
    const user = userEvent.setup();

    const { container } = render(<CanvasBuilderPage />);

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

    const { container } = render(<CanvasBuilderPage />);

    expect(screen.getByText(/1\.5 in bar width/i)).toBeInTheDocument();
    expect(container.querySelectorAll('[data-testid="mitre-cut"]')).toHaveLength(4);

    const woodWidthInput = screen.getByLabelText(/stretcher width/i);
    await user.clear(woodWidthInput);
    await user.type(woodWidthInput, '2.25');

    expect(screen.getByText(/2\.25 in bar width/i)).toBeInTheDocument();
  });
});