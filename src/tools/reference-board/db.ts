import { openDB, type IDBPDatabase } from 'idb';
import type { CanvasLayer } from './types';

const DB_NAME = 'reference-board';
const DB_VERSION = 1;
const IMAGES_STORE = 'images';
const LAYERS_STORE = 'layers';

interface ReferenceBoardDB {
  [IMAGES_STORE]: {
    key: string;
    value: string; // dataUrl
  };
  [LAYERS_STORE]: {
    key: string;
    value: CanvasLayer;
    indexes: { 'by-project': string };
  };
}

let _db: IDBPDatabase<ReferenceBoardDB> | null = null;

function emitDBChange(): void {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  window.dispatchEvent(new CustomEvent('artist-tools:reference-board-db-change'));
}

async function getDB(): Promise<IDBPDatabase<ReferenceBoardDB>> {
  if (_db) return _db;
  _db = await openDB<ReferenceBoardDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(IMAGES_STORE)) {
        db.createObjectStore(IMAGES_STORE);
      }
      if (!db.objectStoreNames.contains(LAYERS_STORE)) {
        const layerStore = db.createObjectStore(LAYERS_STORE, { keyPath: 'id' });
        layerStore.createIndex('by-project', 'projectId');
      }
    },
  });
  return _db;
}

export async function saveImage(imageId: string, dataUrl: string): Promise<void> {
  const db = await getDB();
  await db.put(IMAGES_STORE, dataUrl, imageId);
  emitDBChange();
}

export async function loadImage(imageId: string): Promise<string | undefined> {
  const db = await getDB();
  return db.get(IMAGES_STORE, imageId);
}

export async function deleteImage(imageId: string): Promise<void> {
  const db = await getDB();
  await db.delete(IMAGES_STORE, imageId);
  emitDBChange();
}

export async function saveLayer(layer: CanvasLayer): Promise<void> {
  const db = await getDB();
  await db.put(LAYERS_STORE, layer);
  emitDBChange();
}

export async function loadLayersForProject(projectId: string): Promise<CanvasLayer[]> {
  const db = await getDB();
  return db.getAllFromIndex(LAYERS_STORE, 'by-project', projectId);
}

export async function deleteLayer(layerId: string): Promise<void> {
  const db = await getDB();
  await db.delete(LAYERS_STORE, layerId);
  emitDBChange();
}

export async function deleteProjectData(projectId: string): Promise<void> {
  const db = await getDB();
  const layers = await db.getAllFromIndex(LAYERS_STORE, 'by-project', projectId);
  const tx = db.transaction([IMAGES_STORE, LAYERS_STORE], 'readwrite');
  for (const layer of layers) {
    tx.objectStore(LAYERS_STORE).delete(layer.id);
    if (layer.type === 'image') {
      tx.objectStore(IMAGES_STORE).delete(layer.imageId);
    }
  }
  await tx.done;
  emitDBChange();
}

export async function estimateProjectStorageBytes(projectId: string): Promise<number> {
  const db = await getDB();
  const layers = await db.getAllFromIndex(LAYERS_STORE, 'by-project', projectId);

  const textEncoder = new TextEncoder();
  let total = 0;
  const seenImageIds = new Set<string>();

  for (const layer of layers) {
    total += textEncoder.encode(JSON.stringify(layer)).length;
    if (layer.type === 'image' && !seenImageIds.has(layer.imageId)) {
      seenImageIds.add(layer.imageId);
      const dataUrl = await db.get(IMAGES_STORE, layer.imageId);
      if (dataUrl) {
        total += textEncoder.encode(dataUrl).length;
      }
    }
  }

  return total;
}

export async function exportAllDBData(): Promise<{ images: Record<string, string>; layers: CanvasLayer[] }> {
  const db = await getDB();
  const [imageKeys, imageValues, layers] = await Promise.all([
    db.getAllKeys(IMAGES_STORE),
    db.getAll(IMAGES_STORE),
    db.getAll(LAYERS_STORE),
  ]);
  const images: Record<string, string> = {};
  imageKeys.forEach((key, i) => {
    images[key as string] = imageValues[i];
  });
  return { images, layers };
}

export async function importAllDBData(data: { images: Record<string, string>; layers: CanvasLayer[] }): Promise<void> {
  const db = await getDB();
  const tx = db.transaction([IMAGES_STORE, LAYERS_STORE], 'readwrite');
  tx.objectStore(IMAGES_STORE).clear();
  tx.objectStore(LAYERS_STORE).clear();
  for (const [key, value] of Object.entries(data.images)) {
    tx.objectStore(IMAGES_STORE).put(value, key);
  }
  for (const layer of data.layers) {
    tx.objectStore(LAYERS_STORE).put(layer);
  }
  await tx.done;
  emitDBChange();
}

export function resetDBForTesting(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
  if (typeof indexedDB !== 'undefined') {
    indexedDB.deleteDatabase(DB_NAME);
  }
}
