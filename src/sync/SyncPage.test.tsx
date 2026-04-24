import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShellProvider } from '../components/AppShellContext';
import { SyncPage } from './SyncPage';

const syncDataMocks = vi.hoisted(() => ({
  collectSnapshot: vi.fn(),
  restoreSnapshot: vi.fn(),
  buildBackupDocument: vi.fn((snapshot) => ({
    format: 'artist-tools-backup',
    version: 1,
    exportedAt: 1713980001000,
    snapshot,
  })),
  parseBackupDocument: vi.fn(),
}));

const autoSyncMock = vi.fn((_serverUrl: string, _syncKey: string, _callbacks: unknown) => vi.fn());

vi.mock('./yjsAutoSync', () => ({
  startYjsAutoSync: (serverUrl: string, syncKey: string, callbacks: unknown) =>
    autoSyncMock(serverUrl, syncKey, callbacks),
}));

vi.mock('./syncData', () => ({
  collectSnapshot: syncDataMocks.collectSnapshot,
  restoreSnapshot: syncDataMocks.restoreSnapshot,
  buildBackupDocument: syncDataMocks.buildBackupDocument,
  parseBackupDocument: syncDataMocks.parseBackupDocument,
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
    syncDataMocks.collectSnapshot.mockReset();
    syncDataMocks.restoreSnapshot.mockReset();
    syncDataMocks.buildBackupDocument.mockClear();
    syncDataMocks.parseBackupDocument.mockReset();
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

  it('exports a full backup file from snapshot data', async () => {
    syncDataMocks.collectSnapshot.mockResolvedValue({
      version: 1,
      timestamp: 1713980000000,
      localStorage: {
        'artist-tools.art-pricing': '{"x":1}',
      },
      indexedDB: {
        images: { image1: 'data:image/png;base64,abc' },
        layers: [],
      },
    });

    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    if (!URL.createObjectURL) {
      URL.createObjectURL = () => 'blob:test';
    }
    if (!URL.revokeObjectURL) {
      URL.revokeObjectURL = () => { };
    }

    const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => { });
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);

    renderSyncPage();

    fireEvent.click(screen.getByRole('button', { name: /export backup/i }));

    await screen.findByText(/backup exported/i);
    expect(syncDataMocks.collectSnapshot).toHaveBeenCalledTimes(1);
    expect(syncDataMocks.buildBackupDocument).toHaveBeenCalledTimes(1);
    expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURLSpy).toHaveBeenCalledTimes(1);

    createObjectURLSpy.mockRestore();
    revokeObjectURLSpy.mockRestore();
    clickSpy.mockRestore();
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  });

  it('imports backup JSON file and restores snapshot', async () => {
    syncDataMocks.restoreSnapshot.mockResolvedValue(undefined);

    renderSyncPage();

    const snapshot = {
      version: 1,
      timestamp: 1713980000000,
      localStorage: {
        'artist-tools.canvas-builder': '{"width":20}',
      },
      indexedDB: {
        images: {},
        layers: [],
      },
    };
    const backupJson = JSON.stringify({
      format: 'artist-tools-backup',
      version: 1,
      exportedAt: 1713980001000,
      snapshot,
    });
    syncDataMocks.parseBackupDocument.mockReturnValue(snapshot);

    const input = screen.getByLabelText(/import backup file/i) as HTMLInputElement;
    const file = new File([backupJson], 'artist-tools-backup.json', {
      type: 'application/json',
    });
    Object.defineProperty(file, 'text', {
      value: vi.fn().mockResolvedValue(backupJson),
    });

    fireEvent.change(input, { target: { files: [file] } });

    await screen.findByText(/backup imported/i);
    expect(syncDataMocks.parseBackupDocument).toHaveBeenCalledWith(backupJson);
    expect(syncDataMocks.restoreSnapshot).toHaveBeenCalledWith(snapshot);
  });
});
