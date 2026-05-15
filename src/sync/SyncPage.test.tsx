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
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        startedAt: Date.now(),
        uptimeMs: 1000,
        activeDocs: 0,
        roomsTracked: 0,
        metrics: {
          startedAt: Date.now(),
          inboundMessages: 0,
          outboundMessages: 0,
          inboundBytes: 0,
          outboundBytes: 0,
          inboundSyncMessages: 0,
          outboundSyncMessages: 0,
          inboundAwarenessMessages: 0,
          outboundAwarenessMessages: 0,
          persistenceWrites: 0,
          persistenceBytes: 0,
        },
        rooms: [],
      }),
    }));
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

  it('refreshes server stats from the configured sync server', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        startedAt: 1713980000000,
        uptimeMs: 120000,
        activeDocs: 2,
        roomsTracked: 3,
        metrics: {
          startedAt: 1713980000000,
          inboundMessages: 12,
          outboundMessages: 18,
          inboundBytes: 1048576,
          outboundBytes: 2097152,
          inboundSyncMessages: 10,
          outboundSyncMessages: 14,
          inboundAwarenessMessages: 2,
          outboundAwarenessMessages: 4,
          persistenceWrites: 3,
          persistenceBytes: 4096,
        },
        rooms: [
          {
            key: 'room-a',
            activeConnections: 2,
            createdAt: 1713980000000,
            lastActivityAt: 1713980050000,
            inboundMessages: 8,
            outboundMessages: 10,
            inboundBytes: 512000,
            outboundBytes: 768000,
            inboundSyncMessages: 7,
            outboundSyncMessages: 8,
            inboundAwarenessMessages: 1,
            outboundAwarenessMessages: 2,
            persistenceWrites: 2,
            persistenceBytes: 2048,
          },
        ],
      }),
    } as Response);

    renderSyncPage();

    fireEvent.change(screen.getByLabelText(/server url/i), {
      target: { value: 'http://127.0.0.1:3579' },
    });
    fireEvent.change(screen.getByLabelText(/sync key/i), {
      target: { value: 'abc123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save and connect/i }));

    fireEvent.click(screen.getByRole('button', { name: /refresh server stats/i }));

    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:3579/stats');
    expect(await screen.findByText(/outbound: 2.00 mb/i)).toBeInTheDocument();
    expect(await screen.findByText(/inbound: 1.00 mb/i)).toBeInTheDocument();
    expect(await screen.findByText(/active docs: 2/i)).toBeInTheDocument();
    expect(await screen.findByText(/rooms tracked: 3/i)).toBeInTheDocument();
  });

  it('shows an error when stats refresh fails', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      json: async () => ({}),
    } as Response);

    renderSyncPage();

    fireEvent.change(screen.getByLabelText(/server url/i), {
      target: { value: 'http://127.0.0.1:3579' },
    });
    fireEvent.change(screen.getByLabelText(/sync key/i), {
      target: { value: 'abc123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save and connect/i }));
    fireEvent.click(screen.getByRole('button', { name: /refresh server stats/i }));

    expect(await screen.findByText(/server responded 503/i)).toBeInTheDocument();
  });

  it('auto-refreshes server stats every 30 seconds when enabled', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockClear();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        startedAt: 1713980000000,
        uptimeMs: 120000,
        activeDocs: 1,
        roomsTracked: 1,
        metrics: {
          inboundMessages: 1,
          outboundMessages: 1,
          inboundBytes: 100,
          outboundBytes: 200,
        },
      }),
    } as Response);

    renderSyncPage();

    fireEvent.change(screen.getByLabelText(/server url/i), {
      target: { value: 'http://127.0.0.1:3579' },
    });
    fireEvent.change(screen.getByLabelText(/sync key/i), {
      target: { value: 'abc123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save and connect/i }));

    fireEvent.click(screen.getByLabelText(/auto refresh server stats/i));

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    await vi.advanceTimersByTimeAsync(30000);

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    expect(fetchMock).toHaveBeenNthCalledWith(1, 'http://127.0.0.1:3579/stats');
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'http://127.0.0.1:3579/stats');
  });
});
