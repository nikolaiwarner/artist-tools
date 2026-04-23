import { startYjsAutoSync, type AutoSyncCallbacks } from './yjsAutoSync';
import type { SyncConnectionStatus, SyncSettings } from './syncTypes';

const STORAGE_KEY = 'artist-tools.sync';

type RuntimeState = {
  connectionStatus: SyncConnectionStatus;
  statusMessage: string;
};

const listeners = new Set<(state: RuntimeState) => void>();

let runtimeState: RuntimeState = {
  connectionStatus: 'disconnected',
  statusMessage: 'Enter server URL and sync key to connect',
};
let stopSync: (() => void) | null = null;
let activeSignature = '';

function emitState() {
  listeners.forEach((listener) => listener(runtimeState));
}

function setRuntimeState(next: RuntimeState) {
  runtimeState = next;
  emitState();
}

export function getSyncSettingsFromStorage(): SyncSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw) as SyncSettings;
    }
  } catch {
    // ignore invalid settings
  }
  return { serverUrl: '', syncKey: '' };
}

export function saveSyncSettingsToStorage(settings: SyncSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function getSyncRuntimeState(): RuntimeState {
  return runtimeState;
}

export function subscribeSyncRuntime(listener: (state: RuntimeState) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function applySyncSettings(
  settings: SyncSettings,
  callbacks: Pick<AutoSyncCallbacks, 'onInfo' | 'onError' | 'onConnectionStatus'> = {}
): void {
  const serverUrl = settings.serverUrl.trim();
  const syncKey = settings.syncKey.trim();

  const signature = `${serverUrl}::${syncKey}`;
  if (!serverUrl || !syncKey) {
    if (stopSync) {
      stopSync();
      stopSync = null;
    }
    activeSignature = '';
    setRuntimeState({
      connectionStatus: 'disconnected',
      statusMessage: 'Enter server URL and sync key to connect',
    });
    return;
  }

  if (signature === activeSignature && stopSync) {
    return;
  }

  if (stopSync) {
    stopSync();
    stopSync = null;
  }

  activeSignature = signature;
  setRuntimeState({
    connectionStatus: 'connecting',
    statusMessage: 'Connecting…',
  });

  stopSync = startYjsAutoSync(serverUrl, syncKey, {
    onInfo: (message) => {
      setRuntimeState({
        ...runtimeState,
        statusMessage: message,
      });
      callbacks.onInfo?.(message);
    },
    onError: (message) => {
      setRuntimeState({
        connectionStatus: 'error',
        statusMessage: `Auto-sync error: ${message}`,
      });
      callbacks.onError?.(message);
    },
    onConnectionStatus: (status) => {
      setRuntimeState({
        ...runtimeState,
        connectionStatus: status,
      });
      callbacks.onConnectionStatus?.(status);
    },
  });
}

export function bootstrapSyncFromStorage(): void {
  applySyncSettings(getSyncSettingsFromStorage());
}
