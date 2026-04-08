import { render, screen } from '@testing-library/react';
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
    expect(screen.getByRole('navigation', { name: /primary/i })).toBeInTheDocument();
  });
});
