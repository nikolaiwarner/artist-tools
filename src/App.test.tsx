import { render, screen, fireEvent } from '@testing-library/react';
import { HashRouter } from 'react-router-dom';
import { describe, expect, it, beforeEach, vi } from 'vitest';

const autoSyncMock = vi.fn((_serverUrl?: string, _syncKey?: string, _callbacks?: unknown) => vi.fn());

vi.mock('./sync/yjsAutoSync', () => ({
  startYjsAutoSync: (serverUrl: string, syncKey: string, callbacks: unknown) =>
    autoSyncMock(serverUrl, syncKey, callbacks),
}));

function makeStorage(): Storage {
  const store: Record<string, string> = {};
  return {
    get length() {
      return Object.keys(store).length;
    },
    clear: () => {
      Object.keys(store).forEach((key) => delete store[key]);
    },
    getItem: (key: string) => store[key] ?? null,
    key: (index: number) => Object.keys(store)[index] ?? null,
    removeItem: (key: string) => {
      delete store[key];
    },
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
  } as Storage;
}

import App from './App';

describe('App shell', () => {
  beforeEach(() => {
    autoSyncMock.mockClear();
    vi.stubGlobal('localStorage', makeStorage());
  });

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

  it('boots background auto-sync from saved settings on app mount', () => {
    localStorage.setItem(
      'artist-tools.sync',
      JSON.stringify({ serverUrl: 'http://127.0.0.1:3579', syncKey: 'room-1' })
    );

    render(
      <HashRouter>
        <App />
      </HashRouter>
    );

    expect(autoSyncMock).toHaveBeenCalledWith(
      'http://127.0.0.1:3579',
      'room-1',
      expect.any(Object)
    );
  });
});
