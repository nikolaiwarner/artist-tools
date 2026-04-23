import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShellProvider } from '../components/AppShellContext';
import { SyncPage } from './SyncPage';

const autoSyncMock = vi.fn((_serverUrl: string, _syncKey: string, _callbacks: unknown) => vi.fn());

vi.mock('./yjsAutoSync', () => ({
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

function renderSyncPage() {
  return render(
    <AppShellProvider value={{ menuOpen: false, openMenu: vi.fn(), closeMenu: vi.fn() }}>
      <SyncPage />
    </AppShellProvider>
  );
}

describe('SyncPage', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeStorage());
    autoSyncMock.mockClear();
  });

  it('does not save or connect while typing until confirm is clicked', () => {
    renderSyncPage();

    fireEvent.change(screen.getByLabelText(/server url/i), {
      target: { value: 'http://127.0.0.1:3579' },
    });
    fireEvent.change(screen.getByLabelText(/sync key/i), {
      target: { value: 'abc123' },
    });

    expect(localStorage.getItem('artist-tools.sync')).toBe('{"serverUrl":"","syncKey":""}');
    expect(autoSyncMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /save and connect/i }));

    expect(localStorage.getItem('artist-tools.sync')).toContain('127.0.0.1:3579');
    expect(autoSyncMock).toHaveBeenCalledWith(
      'http://127.0.0.1:3579',
      'abc123',
      expect.any(Object)
    );
  });

  it('generate key only updates draft until confirm is clicked', () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('11111111-1111-4111-8111-111111111111');
    renderSyncPage();

    fireEvent.change(screen.getByLabelText(/server url/i), {
      target: { value: 'http://127.0.0.1:3579' },
    });
    fireEvent.click(screen.getByRole('button', { name: /generate/i }));

    expect(screen.getByLabelText(/sync key/i)).toHaveValue('11111111-1111-4111-8111-111111111111');
    expect(localStorage.getItem('artist-tools.sync')).toBe('{"serverUrl":"","syncKey":""}');
    expect(autoSyncMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /save and connect/i }));

    expect(localStorage.getItem('artist-tools.sync')).toContain('11111111-1111-4111-8111-111111111111');
    expect(autoSyncMock).toHaveBeenCalledWith(
      'http://127.0.0.1:3579',
      '11111111-1111-4111-8111-111111111111',
      expect.any(Object)
    );
  });
});
