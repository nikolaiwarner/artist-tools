import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { collectAllEntries, applyEntry, subscribeToLocalDataChanges } from './syncData';

const WRITE_DEBOUNCE_MS = 150;
// v2 map name ensures clean separation from any legacy single-blob data
const ROOT_MAP_NAME = 'artist-tools-sync-v2';

export type AutoSyncCallbacks = {
  onInfo?: (message: string) => void;
  onError?: (message: string) => void;
  onConnectionStatus?: (status: 'connecting' | 'connected' | 'disconnected' | 'error') => void;
};

export function startYjsAutoSync(
  serverUrl: string,
  key: string,
  callbacks: AutoSyncCallbacks = {}
): () => void {
  const doc = new Y.Doc();
  const root = doc.getMap<string>(ROOT_MAP_NAME);
  const wsBaseUrl = `${serverUrl.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:').replace(/\/$/, '')}/yjs-ws`;
  const provider = new WebsocketProvider(wsBaseUrl, key, doc);

  let stopped = false;
  let initialized = false;
  let applyingRemote = false;
  let writeTimer: ReturnType<typeof setTimeout> | null = null;
  // Tracks the last state we wrote to Yjs so we only send actual diffs
  let lastKnownEntries: Map<string, string> = new Map();

  async function applyRemoteChanges(keysChanged: Set<string>): Promise<void> {
    if (applyingRemote || !initialized) return;
    applyingRemote = true;
    try {
      for (const changedKey of keysChanged) {
        const value = root.get(changedKey) ?? null;
        await applyEntry(changedKey, value);
        if (value !== null) {
          lastKnownEntries.set(changedKey, value);
        } else {
          lastKnownEntries.delete(changedKey);
        }
      }
      callbacks.onInfo?.(
        `Auto-synced ${keysChanged.size} change(s) at ${new Date().toLocaleTimeString()}`
      );
    } catch (err) {
      callbacks.onError?.(err instanceof Error ? err.message : String(err));
    } finally {
      applyingRemote = false;
    }
  }

  async function pushLocalToYjs(): Promise<void> {
    if (stopped || applyingRemote) return;
    try {
      const currentEntries = await collectAllEntries();
      doc.transact(() => {
        for (const [k, v] of currentEntries) {
          if (lastKnownEntries.get(k) !== v) {
            root.set(k, v);
          }
        }
        for (const k of lastKnownEntries.keys()) {
          if (!currentEntries.has(k)) {
            root.delete(k);
          }
        }
      });
      lastKnownEntries = currentEntries;
    } catch (err) {
      callbacks.onError?.(err instanceof Error ? err.message : String(err));
    }
  }

  function scheduleLocalWrite(): void {
    if (stopped || !initialized || applyingRemote) return;
    if (writeTimer) clearTimeout(writeTimer);
    writeTimer = setTimeout(() => void pushLocalToYjs(), WRITE_DEBOUNCE_MS);
  }

  const unlistenLocalChanges = subscribeToLocalDataChanges(scheduleLocalWrite);

  root.observe((event: Y.YMapEvent<string>, transaction: Y.Transaction) => {
    if (!initialized) return;
    if (transaction.local) return;
    void applyRemoteChanges(event.keysChanged);
  });

  callbacks.onConnectionStatus?.('connecting');
  provider.on('status', (event: { status: string }) => {
    if (event.status === 'connected') {
      callbacks.onConnectionStatus?.('connected');
    } else {
      callbacks.onConnectionStatus?.('disconnected');
    }
    callbacks.onInfo?.(`Auto-sync ${event.status}`);
  });

  provider.on('connection-error', () => {
    callbacks.onConnectionStatus?.('error');
  });

  provider.on('sync', (isSynced: boolean) => {
    if (!isSynced || initialized || stopped) return;

    void (async () => {
      try {
        // Collect the full remote state from Yjs
        const remoteEntries = new Map<string, string>();
        root.forEach((value: string, k: string) => remoteEntries.set(k, value));

        if (remoteEntries.size > 0) {
          // Remote-first: apply every remote entry to local state
          applyingRemote = true;
          for (const [k, v] of remoteEntries) {
            await applyEntry(k, v);
          }
          applyingRemote = false;
          lastKnownEntries = new Map(remoteEntries);
          callbacks.onInfo?.('Auto-sync initialized from remote data');
        } else {
          callbacks.onInfo?.('Auto-sync initialized from local data');
        }

        // Push any local entries not yet in the remote Yjs doc
        await pushLocalToYjs();
        initialized = true;
      } catch (err) {
        applyingRemote = false;
        callbacks.onConnectionStatus?.('error');
        callbacks.onError?.(err instanceof Error ? err.message : String(err));
      }
    })();
  });

  return () => {
    stopped = true;
    if (writeTimer) clearTimeout(writeTimer);
    unlistenLocalChanges();
    provider.destroy();
    doc.destroy();
  };
}
