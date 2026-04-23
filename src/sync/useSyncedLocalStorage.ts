import { useCallback, useEffect, useState } from 'react';
import { SYNC_APPLIED_EVENT, type SyncAppliedDetail } from './syncData';

/**
 * Like useState but backed by localStorage. Re-reads from localStorage when
 * a remote sync update is applied (artist-tools:sync-applied event).
 *
 * @param storageKey - The full localStorage key (e.g. 'artist-tools.art-pricing')
 * @param defaultValue - Value to use when nothing is stored yet
 * @param parse - How to deserialize the stored JSON string; merges with defaultValue by default
 */
export function useSyncedLocalStorage<T>(
  storageKey: string,
  defaultValue: T,
  parse: (raw: string) => T
): [T, (updater: T | ((prev: T) => T)) => void] {
  function readFromStorage(): T {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw !== null) return parse(raw);
    } catch {
      // ignore parse errors
    }
    return defaultValue;
  }

  const [state, setStateRaw] = useState<T>(readFromStorage);

  // Write back to localStorage whenever state changes
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      // ignore storage errors
    }
  }, [storageKey, state]);

  // Re-read from localStorage when remote sync writes this key
  useEffect(() => {
    function onSyncApplied(e: Event) {
      const detail = (e as CustomEvent<SyncAppliedDetail>).detail;
      if (detail && detail.kind === 'ls' && detail.key === storageKey) {
        setStateRaw(readFromStorage());
      }
    }
    window.addEventListener(SYNC_APPLIED_EVENT, onSyncApplied);
    return () => window.removeEventListener(SYNC_APPLIED_EVENT, onSyncApplied);
  }, [storageKey]);

  const setState = useCallback(
    (updater: T | ((prev: T) => T)) => setStateRaw(updater),
    []
  );

  return [state, setState];
}
