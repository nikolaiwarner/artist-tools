import { beforeEach, describe, expect, it, vi } from 'vitest';
import { collectSnapshot, restoreSnapshot, collectAllEntries, applyEntry } from './syncData';

const dbMocks = vi.hoisted(() => ({
  exportAllDBData: vi.fn(),
  importAllDBData: vi.fn(),
  saveImage: vi.fn(),
  deleteImage: vi.fn(),
  saveLayer: vi.fn(),
  deleteLayer: vi.fn(),
}));

vi.mock('../tools/reference-board/db', () => ({
  exportAllDBData: dbMocks.exportAllDBData,
  importAllDBData: dbMocks.importAllDBData,
  saveImage: dbMocks.saveImage,
  deleteImage: dbMocks.deleteImage,
  saveLayer: dbMocks.saveLayer,
  deleteLayer: dbMocks.deleteLayer,
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

describe('syncData', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeStorage());
    dbMocks.exportAllDBData.mockReset();
    dbMocks.importAllDBData.mockReset();
    dbMocks.saveImage.mockReset();
    dbMocks.deleteImage.mockReset();
    dbMocks.saveLayer.mockReset();
    dbMocks.deleteLayer.mockReset();
  });

  it('collectSnapshot includes artist-tools localStorage keys except sync settings', async () => {
    localStorage.setItem('artist-tools.art-pricing', '{"x":1}');
    localStorage.setItem('artist-tools.canvas-builder', '{"y":2}');
    localStorage.setItem('artist-tools.sync', '{"serverUrl":"http://example"}');
    localStorage.setItem('artist-tools.sync.settings', '{"enabled":false}');
    localStorage.setItem('other-app', 'ignored');

    dbMocks.exportAllDBData.mockResolvedValue({ images: { img1: 'data:1' }, layers: [] });

    const snapshot = await collectSnapshot();

    expect(snapshot.version).toBe(1);
    expect(snapshot.localStorage).toEqual({
      'artist-tools.art-pricing': '{"x":1}',
      'artist-tools.canvas-builder': '{"y":2}',
    });
    expect(snapshot.indexedDB).toEqual({ images: { img1: 'data:1' }, layers: [] });
  });

  it('restoreSnapshot updates provided artist-tools keys without deleting missing keys', async () => {
    localStorage.setItem('artist-tools.art-pricing', 'old-pricing');
    localStorage.setItem('artist-tools.to-remove', 'stale');
    localStorage.setItem('artist-tools.sync', 'keep-me');
    localStorage.setItem('artist-tools.sync.settings', 'keep-settings');

    await restoreSnapshot({
      version: 1,
      timestamp: Date.now(),
      localStorage: {
        'artist-tools.art-pricing': 'new-pricing',
        'artist-tools.canvas-builder': 'new-canvas',
      },
      indexedDB: {
        images: { img1: 'data:image' },
        layers: [],
      },
    });

    expect(localStorage.getItem('artist-tools.art-pricing')).toBe('new-pricing');
    expect(localStorage.getItem('artist-tools.canvas-builder')).toBe('new-canvas');
    expect(localStorage.getItem('artist-tools.to-remove')).toBe('stale');
    expect(localStorage.getItem('artist-tools.sync')).toBe('keep-me');
    expect(localStorage.getItem('artist-tools.sync.settings')).toBe('keep-settings');
    expect(dbMocks.importAllDBData).toHaveBeenCalledWith({ images: { img1: 'data:image' }, layers: [] });
  });

  describe('collectAllEntries', () => {
    it('returns ls:-prefixed entries for non-excluded localStorage keys', async () => {
      localStorage.setItem('artist-tools.art-pricing', '{"x":1}');
      localStorage.setItem('artist-tools.canvas-builder', '{"y":2}');
      localStorage.setItem('artist-tools.sync', 'excluded');
      localStorage.setItem('artist-tools.sync.settings', 'also-excluded');
      localStorage.setItem('other-app', 'ignored');
      dbMocks.exportAllDBData.mockResolvedValue({ images: {}, layers: [] });

      const entries = await collectAllEntries();

      expect(entries.get('ls:artist-tools.art-pricing')).toBe('{"x":1}');
      expect(entries.get('ls:artist-tools.canvas-builder')).toBe('{"y":2}');
      expect(entries.has('ls:artist-tools.sync')).toBe(false);
      expect(entries.has('ls:artist-tools.sync.settings')).toBe(false);
      expect(entries.has('ls:other-app')).toBe(false);
    });

    it('returns db:image: entries for IndexedDB images', async () => {
      dbMocks.exportAllDBData.mockResolvedValue({
        images: { img1: 'data:image/png;base64,abc', img2: 'data:image/jpeg;base64,xyz' },
        layers: [],
      });

      const entries = await collectAllEntries();

      expect(entries.get('db:image:img1')).toBe('data:image/png;base64,abc');
      expect(entries.get('db:image:img2')).toBe('data:image/jpeg;base64,xyz');
    });

    it('returns db:layer: entries as JSON strings for IndexedDB layers', async () => {
      const layer = { id: 'layer1', type: 'text' as const, projectId: 'p1', x: 0, y: 0, width: 100, height: 50, text: 'hello', fontSize: 14, color: '#000', rotation: 0 };
      dbMocks.exportAllDBData.mockResolvedValue({ images: {}, layers: [layer] });

      const entries = await collectAllEntries();

      expect(JSON.parse(entries.get('db:layer:layer1')!)).toMatchObject({ id: 'layer1', type: 'text' });
    });
  });

  describe('applyEntry', () => {
    it('dispatches sync-applied ls event with key details', async () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

      await applyEntry('ls:artist-tools.art-pricing', '{"price":100}');

      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'artist-tools:sync-applied',
          detail: { kind: 'ls', key: 'artist-tools.art-pricing' },
        })
      );
    });

    it('sets localStorage value for ls: key', async () => {
      await applyEntry('ls:artist-tools.art-pricing', '{"price":100}');
      expect(localStorage.getItem('artist-tools.art-pricing')).toBe('{"price":100}');
    });

    it('removes localStorage key when value is null', async () => {
      localStorage.setItem('artist-tools.art-pricing', 'old');
      await applyEntry('ls:artist-tools.art-pricing', null);
      expect(localStorage.getItem('artist-tools.art-pricing')).toBeNull();
    });

    it('ignores ls: keys that are excluded sync settings', async () => {
      await applyEntry('ls:artist-tools.sync', 'should-not-set');
      expect(localStorage.getItem('artist-tools.sync')).toBeNull();
    });

    it('ignores ls: keys outside the artist-tools. namespace', async () => {
      await applyEntry('ls:other-app', 'should-not-set');
      expect(localStorage.getItem('other-app')).toBeNull();
    });

    it('calls saveImage for db:image: key with a value', async () => {
      dbMocks.saveImage.mockResolvedValue(undefined);
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
      await applyEntry('db:image:img1', 'data:image/png;base64,abc');
      expect(dbMocks.saveImage).toHaveBeenCalledWith('img1', 'data:image/png;base64,abc');
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'artist-tools:sync-applied',
          detail: { kind: 'db-image', id: 'img1' },
        })
      );
    });

    it('calls deleteImage for db:image: key with null', async () => {
      dbMocks.deleteImage.mockResolvedValue(undefined);
      await applyEntry('db:image:img1', null);
      expect(dbMocks.deleteImage).toHaveBeenCalledWith('img1');
    });

    it('calls saveLayer with parsed layer for db:layer: key with a value', async () => {
      dbMocks.saveLayer.mockResolvedValue(undefined);
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
      const layer = { id: 'layer1', type: 'text', projectId: 'p1', x: 0, y: 0, width: 100, height: 50, text: 'hi', fontSize: 12, color: '#000', rotation: 0 };
      await applyEntry('db:layer:layer1', JSON.stringify(layer));
      expect(dbMocks.saveLayer).toHaveBeenCalledWith(layer);
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'artist-tools:sync-applied',
          detail: { kind: 'db-layer', id: 'layer1', projectId: 'p1' },
        })
      );
    });

    it('calls deleteLayer for db:layer: key with null', async () => {
      dbMocks.deleteLayer.mockResolvedValue(undefined);
      await applyEntry('db:layer:layer1', null);
      expect(dbMocks.deleteLayer).toHaveBeenCalledWith('layer1');
    });

    it('ignores unknown key prefixes', async () => {
      await expect(applyEntry('unknown:whatever', 'value')).resolves.toBeUndefined();
    });
  });
});
