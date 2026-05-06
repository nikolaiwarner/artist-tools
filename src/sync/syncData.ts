import { exportAllDBData, importAllDBData, saveImage, deleteImage, saveLayer, deleteLayer } from '../tools/reference-board/db';
import type { CanvasLayer } from '../tools/reference-board/types';

export interface SyncSnapshot {
  version: 1;
  timestamp: number;
  localStorage: Record<string, string>;
  indexedDB: {
    images: Record<string, string>;
    layers: CanvasLayer[];
  };
}

export interface BackupDocument {
  format: 'artist-tools-backup';
  version: 1;
  exportedAt: number;
  snapshot: SyncSnapshot;
}

const LOCAL_STORAGE_PREFIX = 'artist-tools.';
// Exclude sync settings from the snapshot so they're device-local.
// This intentionally covers both the current key and legacy variants like artist-tools.sync.settings.
const EXCLUDED_PREFIXES = ['artist-tools.sync'];
const DB_CHANGE_EVENT = 'artist-tools:reference-board-db-change';
export const SYNC_APPLIED_EVENT = 'artist-tools:sync-applied';
const BACKUP_FORMAT = 'artist-tools-backup';
const textEncoder = new TextEncoder();
export const MAX_YJS_SYNC_IMAGE_BYTES = 4 * 1024 * 1024;

export interface CollectAllEntriesOptions {
  maxImageBytes?: number;
}

export interface CollectedEntries {
  entries: Map<string, string>;
  skippedImageEntryKeys: Set<string>;
  skippedImageCount: number;
  skippedImageBytes: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!isRecord(value)) return false;
  return Object.values(value).every((entry) => typeof entry === 'string');
}

function isValidSnapshot(value: unknown): value is SyncSnapshot {
  if (!isRecord(value)) return false;
  if (value.version !== 1 || typeof value.timestamp !== 'number') return false;

  if (!isStringRecord(value.localStorage)) return false;

  if (!isRecord(value.indexedDB)) return false;
  if (!isStringRecord(value.indexedDB.images)) return false;
  if (!Array.isArray(value.indexedDB.layers)) return false;

  return true;
}

export type SyncAppliedDetail =
  | { kind: 'ls'; key: string }
  | { kind: 'db-image'; id: string }
  | { kind: 'db-layer'; id: string; projectId?: string };

const subscribers = new Set<() => void>();
let unpatchLocalStorage: (() => void) | null = null;
let eventListenersAttached = false;

function notifySubscribers(): void {
  subscribers.forEach((fn) => fn());
}

function isExcludedKey(key: string): boolean {
  return EXCLUDED_PREFIXES.some((prefix) => key === prefix || key.startsWith(`${prefix}.`));
}

function attachEventListeners(): void {
  if (typeof window === 'undefined' || eventListenersAttached) return;
  const onChange = () => notifySubscribers();
  window.addEventListener(DB_CHANGE_EVENT, onChange);
  window.addEventListener('storage', onChange);
  eventListenersAttached = true;
}

function patchLocalStorageMethods(): void {
  if (typeof Storage === 'undefined' || unpatchLocalStorage) return;

  const proto = Storage.prototype;
  const originalSetItem = proto.setItem;
  const originalRemoveItem = proto.removeItem;
  const originalClear = proto.clear;

  proto.setItem = function patchedSetItem(this: Storage, key: string, value: string): void {
    originalSetItem.call(this, key, value);
    notifySubscribers();
  };

  proto.removeItem = function patchedRemoveItem(this: Storage, key: string): void {
    originalRemoveItem.call(this, key);
    notifySubscribers();
  };

  proto.clear = function patchedClear(this: Storage): void {
    originalClear.call(this);
    notifySubscribers();
  };

  unpatchLocalStorage = () => {
    proto.setItem = originalSetItem;
    proto.removeItem = originalRemoveItem;
    proto.clear = originalClear;
    unpatchLocalStorage = null;
  };
}

export function subscribeToLocalDataChanges(onChange: () => void): () => void {
  subscribers.add(onChange);
  patchLocalStorageMethods();
  attachEventListeners();

  return () => {
    subscribers.delete(onChange);
  };
}

export async function collectSnapshot(): Promise<SyncSnapshot> {
  // Collect all artist-tools.* localStorage entries
  const localStorageData: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(LOCAL_STORAGE_PREFIX) && !isExcludedKey(key)) {
      localStorageData[key] = localStorage.getItem(key) ?? '';
    }
  }

  // Collect all IndexedDB data from the reference board
  const indexedDB = await exportAllDBData();

  return {
    version: 1,
    timestamp: Date.now(),
    localStorage: localStorageData,
    indexedDB,
  };
}

export async function restoreSnapshot(snapshot: SyncSnapshot): Promise<void> {
  // Restore localStorage entries
  for (const [key, value] of Object.entries(snapshot.localStorage)) {
    if (key.startsWith(LOCAL_STORAGE_PREFIX) && !isExcludedKey(key)) {
      localStorage.setItem(key, value);
    }
  }

  // Restore IndexedDB
  await importAllDBData(snapshot.indexedDB);
}

export function buildBackupDocument(snapshot: SyncSnapshot): BackupDocument {
  return {
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt: Date.now(),
    snapshot,
  };
}

export function parseBackupDocument(jsonText: string): SyncSnapshot {
  let parsed: unknown;

  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('Invalid backup file: could not parse JSON.');
  }

  if (!isRecord(parsed)) {
    throw new Error('Invalid backup file format.');
  }

  if (parsed.format !== BACKUP_FORMAT || parsed.version !== 1 || typeof parsed.exportedAt !== 'number') {
    throw new Error('Invalid backup file format.');
  }

  if (!isValidSnapshot(parsed.snapshot)) {
    throw new Error('Invalid backup file format.');
  }

  return parsed.snapshot;
}

// ── Granular entry API ────────────────────────────────────────────────────────
// Each piece of local data is represented as a flat Yjs map entry with a
// prefixed string key, allowing the Yjs CRDT to merge changes independently.

export const GRANULAR_LS_PREFIX = 'ls:';
export const GRANULAR_IMAGE_PREFIX = 'db:image:';
export const GRANULAR_IMAGE_META_PREFIX = 'db:image-meta:';
export const GRANULAR_IMAGE_CHUNK_PREFIX = 'db:image-chunk:';
export const GRANULAR_LAYER_PREFIX = 'db:layer:';

type ChunkedImageMeta = {
  parts: number;
};

const pendingChunkedImageMeta = new Map<string, ChunkedImageMeta>();
const pendingChunkedImageParts = new Map<string, Map<number, string>>();

function splitStringIntoChunks(value: string, maxChunkBytes: number): string[] {
  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < value.length) {
    let end = Math.min(cursor + maxChunkBytes, value.length);
    // Data URLs are ASCII, but this keeps behavior safe if a non-ASCII string appears.
    while (end > cursor && textEncoder.encode(value.slice(cursor, end)).length > maxChunkBytes) {
      end -= 1;
    }
    if (end === cursor) {
      end = Math.min(cursor + 1, value.length);
    }
    chunks.push(value.slice(cursor, end));
    cursor = end;
  }
  return chunks;
}

async function tryCommitChunkedImage(imageId: string): Promise<boolean> {
  const meta = pendingChunkedImageMeta.get(imageId);
  const partsMap = pendingChunkedImageParts.get(imageId);
  if (!meta || !partsMap) return false;
  if (!Number.isInteger(meta.parts) || meta.parts <= 0) return false;
  if (partsMap.size < meta.parts) return false;

  const orderedParts: string[] = [];
  for (let i = 0; i < meta.parts; i++) {
    const part = partsMap.get(i);
    if (typeof part !== 'string') return false;
    orderedParts.push(part);
  }

  await saveImage(imageId, orderedParts.join(''));
  pendingChunkedImageMeta.delete(imageId);
  pendingChunkedImageParts.delete(imageId);
  return true;
}

/** Collect all syncable local data as a flat yjsKey → value map. */
export async function collectAllEntries(options: CollectAllEntriesOptions = {}): Promise<CollectedEntries> {
  const entries = new Map<string, string>();
  const skippedImageEntryKeys = new Set<string>();
  const maxImageBytes = options.maxImageBytes ?? Number.POSITIVE_INFINITY;
  let skippedImageBytes = 0;

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(LOCAL_STORAGE_PREFIX) && !isExcludedKey(key)) {
      entries.set(`${GRANULAR_LS_PREFIX}${key}`, localStorage.getItem(key) ?? '');
    }
  }

  const { images, layers } = await exportAllDBData();
  for (const [id, dataUrl] of Object.entries(images)) {
    const imageEntryKey = `${GRANULAR_IMAGE_PREFIX}${id}`;
    const imageBytes = textEncoder.encode(dataUrl).length;
    if (imageBytes > maxImageBytes) {
      const chunks = splitStringIntoChunks(dataUrl, maxImageBytes);
      entries.set(`${GRANULAR_IMAGE_META_PREFIX}${id}`, JSON.stringify({ parts: chunks.length }));
      chunks.forEach((chunk, index) => {
        entries.set(`${GRANULAR_IMAGE_CHUNK_PREFIX}${id}:${index}`, chunk);
      });
      continue;
    }
    entries.set(imageEntryKey, dataUrl);
  }
  for (const layer of layers) {
    entries.set(`${GRANULAR_LAYER_PREFIX}${layer.id}`, JSON.stringify(layer));
  }

  return {
    entries,
    skippedImageEntryKeys,
    skippedImageCount: skippedImageEntryKeys.size,
    skippedImageBytes,
  };
}

/**
 * Apply a single granular entry received from Yjs to local state.
 * Pass null as value to delete the entry.
 */
export async function applyEntry(yjsKey: string, value: string | null): Promise<void> {
  if (yjsKey.startsWith(GRANULAR_LS_PREFIX)) {
    const lsKey = yjsKey.slice(GRANULAR_LS_PREFIX.length);
    if (!lsKey.startsWith(LOCAL_STORAGE_PREFIX) || isExcludedKey(lsKey)) return;
    if (value === null) {
      localStorage.removeItem(lsKey);
    } else {
      localStorage.setItem(lsKey, value);
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent<SyncAppliedDetail>(SYNC_APPLIED_EVENT, {
        detail: { kind: 'ls', key: lsKey },
      }));
    }
  } else if (yjsKey.startsWith(GRANULAR_IMAGE_PREFIX)) {
    const imageId = yjsKey.slice(GRANULAR_IMAGE_PREFIX.length);
    pendingChunkedImageMeta.delete(imageId);
    pendingChunkedImageParts.delete(imageId);
    if (value === null) {
      await deleteImage(imageId);
    } else {
      await saveImage(imageId, value);
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent<SyncAppliedDetail>(SYNC_APPLIED_EVENT, {
        detail: { kind: 'db-image', id: imageId },
      }));
    }
  } else if (yjsKey.startsWith(GRANULAR_IMAGE_META_PREFIX)) {
    const imageId = yjsKey.slice(GRANULAR_IMAGE_META_PREFIX.length);
    if (value === null) {
      pendingChunkedImageMeta.delete(imageId);
      pendingChunkedImageParts.delete(imageId);
      await deleteImage(imageId);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent<SyncAppliedDetail>(SYNC_APPLIED_EVENT, {
          detail: { kind: 'db-image', id: imageId },
        }));
      }
      return;
    }

    const parsed = JSON.parse(value) as ChunkedImageMeta;
    pendingChunkedImageMeta.set(imageId, parsed);
    const committed = await tryCommitChunkedImage(imageId);
    if (committed && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent<SyncAppliedDetail>(SYNC_APPLIED_EVENT, {
        detail: { kind: 'db-image', id: imageId },
      }));
    }
  } else if (yjsKey.startsWith(GRANULAR_IMAGE_CHUNK_PREFIX)) {
    const suffix = yjsKey.slice(GRANULAR_IMAGE_CHUNK_PREFIX.length);
    const delimiterIndex = suffix.lastIndexOf(':');
    if (delimiterIndex === -1) return;
    const imageId = suffix.slice(0, delimiterIndex);
    const partIndex = Number(suffix.slice(delimiterIndex + 1));
    if (!Number.isInteger(partIndex) || partIndex < 0) return;

    const parts = pendingChunkedImageParts.get(imageId) ?? new Map<number, string>();
    if (value === null) {
      parts.delete(partIndex);
    } else {
      parts.set(partIndex, value);
    }

    if (parts.size === 0) {
      pendingChunkedImageParts.delete(imageId);
    } else {
      pendingChunkedImageParts.set(imageId, parts);
    }

    const committed = await tryCommitChunkedImage(imageId);
    if (committed && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent<SyncAppliedDetail>(SYNC_APPLIED_EVENT, {
        detail: { kind: 'db-image', id: imageId },
      }));
    }
  } else if (yjsKey.startsWith(GRANULAR_LAYER_PREFIX)) {
    const layerId = yjsKey.slice(GRANULAR_LAYER_PREFIX.length);
    if (value === null) {
      await deleteLayer(layerId);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent<SyncAppliedDetail>(SYNC_APPLIED_EVENT, {
          detail: { kind: 'db-layer', id: layerId },
        }));
      }
    } else {
      const layer = JSON.parse(value) as CanvasLayer;
      await saveLayer(layer);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent<SyncAppliedDetail>(SYNC_APPLIED_EVENT, {
          detail: { kind: 'db-layer', id: layerId, projectId: layer.projectId },
        }));
      }
    }
  }
}
