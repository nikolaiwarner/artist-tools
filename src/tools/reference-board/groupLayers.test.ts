import { describe, expect, it } from 'vitest';

import type { CanvasLayer, GroupLayer, ImageLayer, TextLayer } from './types';
import {
  collectLayerSubtreeIds,
  collectLayersForClipboard,
  getSelectionRootIds,
  groupSelection,
  pasteLayersFromClipboard,
  ungroupSelection,
} from './groupLayers';

function makeImage(overrides: Partial<ImageLayer> = {}): ImageLayer {
  return {
    id: 'image-1',
    projectId: 'project-1',
    type: 'image',
    imageId: 'asset-1',
    x: 0,
    y: 0,
    width: 200,
    height: 100,
    rotation: 0,
    opacity: 1,
    zIndex: 1,
    scaleX: 1,
    scaleY: 1,
    flipX: false,
    flipY: false,
    ...overrides,
  };
}

function makeText(overrides: Partial<TextLayer> = {}): TextLayer {
  return {
    id: 'text-1',
    projectId: 'project-1',
    type: 'text',
    text: 'hello',
    x: 0,
    y: 0,
    rotation: 0,
    opacity: 1,
    zIndex: 1,
    fontSize: 24,
    fontFamily: 'IBM Plex Sans',
    bold: false,
    italic: false,
    fill: '#000000',
    align: 'left',
    width: 180,
    scaleX: 1,
    scaleY: 1,
    ...overrides,
  };
}

function makeGroup(overrides: Partial<GroupLayer> = {}): GroupLayer {
  return {
    id: 'group-1',
    projectId: 'project-1',
    type: 'group',
    x: 0,
    y: 0,
    rotation: 0,
    opacity: 1,
    zIndex: 1,
    scaleX: 1,
    scaleY: 1,
    ...overrides,
  };
}

function byId(layers: CanvasLayer[], id: string): CanvasLayer {
  const layer = layers.find((candidate) => candidate.id === id);
  if (!layer) {
    throw new Error(`missing layer: ${id}`);
  }
  return layer;
}

describe('group layer helpers', () => {
  it('collects subtree ids recursively for nested groups', () => {
    const layers: CanvasLayer[] = [
      makeGroup({ id: 'group-root' }),
      makeGroup({ id: 'group-nested', parentId: 'group-root' }),
      makeImage({ id: 'image-a', parentId: 'group-root' }),
      makeText({ id: 'text-nested', parentId: 'group-nested' }),
      makeText({ id: 'text-outside' }),
    ];

    expect(collectLayerSubtreeIds(layers, 'group-root')).toEqual(
      new Set(['group-root', 'group-nested', 'image-a', 'text-nested'])
    );
  });

  it('normalizes selection roots so descendants of selected groups are excluded', () => {
    const layers: CanvasLayer[] = [
      makeGroup({ id: 'group-root' }),
      makeGroup({ id: 'group-nested', parentId: 'group-root' }),
      makeImage({ id: 'image-a', parentId: 'group-root' }),
      makeText({ id: 'text-nested', parentId: 'group-nested' }),
    ];

    const roots = getSelectionRootIds(layers, ['group-root', 'image-a', 'text-nested']);

    expect(roots).toEqual(['group-root']);
  });

  it('groups selected roots under a new group in shared parent space', () => {
    const layers: CanvasLayer[] = [
      makeGroup({ id: 'outer', x: 40, y: 80 }),
      makeImage({ id: 'image-a', parentId: 'outer', x: 20, y: 30, zIndex: 5 }),
      makeText({ id: 'text-a', parentId: 'outer', x: 200, y: 120, zIndex: 9 }),
    ];

    const result = groupSelection({
      layers,
      selectedIds: ['image-a', 'text-a'],
      projectId: 'project-1',
      createId: () => 'new-group',
    });

    expect(result).not.toBeNull();
    const nextLayers = result!.layers;
    const group = byId(nextLayers, 'new-group') as GroupLayer;
    const image = byId(nextLayers, 'image-a');
    const text = byId(nextLayers, 'text-a');

    expect(group.parentId).toBe('outer');
    expect(group.zIndex).toBe(5);
    expect(image.parentId).toBe('new-group');
    expect(text.parentId).toBe('new-group');
    expect(image.x).toBe(0);
    expect(image.y).toBe(0);
    expect(text.x).toBe(180);
    expect(text.y).toBe(90);
  });

  it('ungroups while preserving child world transforms', () => {
    const layers: CanvasLayer[] = [
      makeGroup({ id: 'root-group', x: 20, y: 30 }),
      makeGroup({ id: 'nested-group', parentId: 'root-group', x: 100, y: 50, scaleX: 2, scaleY: 2, rotation: 15 }),
      makeImage({ id: 'image-a', parentId: 'nested-group', x: 10, y: 5, scaleX: 1.2, scaleY: 0.8, rotation: 20 }),
    ];

    const result = ungroupSelection({
      layers,
      selectedGroupIds: ['nested-group'],
    });

    expect(result.layers.find((layer) => layer.id === 'nested-group')).toBeUndefined();
    const image = byId(result.layers, 'image-a');

    expect(image.parentId).toBe('root-group');
    expect(image.x).toBeCloseTo(116.730326, 6);
    expect(image.y).toBeCloseTo(64.835639, 6);
    expect(image.scaleX).toBeCloseTo(2.4, 6);
    expect(image.scaleY).toBeCloseTo(1.6, 6);
    expect(image.rotation).toBeCloseTo(35, 6);
  });

  it('collects clipboard layers including descendants for selected groups', () => {
    const layers: CanvasLayer[] = [
      makeGroup({ id: 'group-root', zIndex: 10 }),
      makeText({ id: 'text-a', parentId: 'group-root', zIndex: 11 }),
      makeImage({ id: 'image-a', parentId: 'group-root', zIndex: 12 }),
      makeText({ id: 'text-outside', zIndex: 2 }),
    ];

    const copied = collectLayersForClipboard(layers, ['group-root']);

    expect(copied.map((layer) => layer.id)).toEqual(['group-root', 'text-a', 'image-a']);
  });

  it('pastes nested clipboard layers with id remapping and root offset', () => {
    const clipboardLayers: CanvasLayer[] = [
      makeGroup({ id: 'group-root', zIndex: 2 }),
      makeImage({ id: 'image-a', parentId: 'group-root', x: 15, y: 25, zIndex: 3 }),
    ];

    const result = pasteLayersFromClipboard({
      clipboardLayers,
      projectId: 'project-1',
      nextZIndex: 100,
      createId: (() => {
        const ids = ['group-copy', 'image-copy'];
        let index = 0;
        return () => ids[index++];
      })(),
      offset: { x: 20, y: 20 },
    });

    expect(result.layers).toHaveLength(2);
    const groupCopy = byId(result.layers, 'group-copy') as GroupLayer;
    const imageCopy = byId(result.layers, 'image-copy') as ImageLayer;

    expect(groupCopy.parentId).toBeUndefined();
    expect(groupCopy.x).toBe(20);
    expect(groupCopy.y).toBe(20);
    expect(groupCopy.zIndex).toBe(100);

    expect(imageCopy.parentId).toBe('group-copy');
    expect(imageCopy.x).toBe(15);
    expect(imageCopy.y).toBe(25);
  });
});
