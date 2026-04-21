import { render, screen, fireEvent } from '@testing-library/react';
import { HashRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import App from './App';

describe('App shell', () => {
  it('uses the compact barebones theme container', () => {
    const { container } = render(
      <HashRouter>
        <App />
      </HashRouter>
    );

    expect(container.querySelector('.theme-barebones')).toBeInTheDocument();
  });

  it('renders a menu toggle button', () => {
    render(
      <HashRouter>
        <App />
      </HashRouter>
    );

    expect(screen.getByRole('button', { name: /open menu/i })).toBeInTheDocument();
  });

  it('nav drawer is hidden by default and visible after toggle', async () => {
    const { container } = render(
      <HashRouter>
        <App />
      </HashRouter>
    );

    // Drawer exists in DOM but is not open
    expect(container.querySelector('.nav-drawer')).toBeInTheDocument();
    expect(container.querySelector('.nav-drawer.open')).not.toBeInTheDocument();

    // Open the menu
    fireEvent.click(screen.getByRole('button', { name: /open menu/i }));
    expect(container.querySelector('.nav-drawer.open')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: /primary/i })).toBeInTheDocument();
  });
});
