import { describe, expect, it, vi } from 'vitest';

import {
  collectUnreferencedImageIds,
  computeMultiDragPositions,
  computeSelectionResult,
  stageToWorldPoint,
  withTransformerNodesPreserved,
  type SelectionBox,
} from './ReferenceBoardCanvasPage';
import type { CanvasLayer, ImageLayer, TextLayer } from './types';

function makeImageLayer(overrides: Partial<ImageLayer> = {}): ImageLayer {
  return {
    id: 'img-1',
    projectId: 'project-1',
    type: 'image',
    imageId: 'image-1',
    x: 50,
    y: 60,
    width: 100,
    height: 80,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    opacity: 1,
    zIndex: 1,
    flipX: false,
    flipY: false,
    ...overrides,
  };
}

function makeTextLayer(overrides: Partial<TextLayer> = {}): TextLayer {
  return {
    id: 'text-1',
    projectId: 'project-1',
    type: 'text',
    text: 'hello',
    x: 200,
    y: 220,
    width: 180,
    fontSize: 24,
    fontFamily: 'IBM Plex Sans',
    bold: false,
    italic: false,
    fill: '#000000',
    align: 'left',
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    opacity: 1,
    zIndex: 2,
    ...overrides,
  };
}

describe('selection helpers', () => {
  it('converts stage coordinates to world coordinates using viewport', () => {
    const world = stageToWorldPoint({ x: 300, y: 250 }, { x: 100, y: 50, scale: 2 });
    expect(world).toEqual({ x: 100, y: 100 });
  });

  it('selects layers that intersect the selection box, including partial overlaps', () => {
    const image = makeImageLayer({ id: 'inside-image' });
    const text = makeTextLayer({ id: 'inside-text', x: 220, y: 230, width: 150, fontSize: 20 });
    // Partially outside the box on the right and bottom — but still intersects
    const partiallyOutside = makeImageLayer({
      id: 'partial-image',
      x: 330,
      y: 290,
      width: 120,
      height: 80,
    });
    // Completely outside — no overlap at all
    const fullyOutside = makeImageLayer({
      id: 'outside-image',
      x: 600,
      y: 600,
      width: 80,
      height: 60,
    });

    const box: SelectionBox = {
      startX: 40,
      startY: 40,
      endX: 400,
      endY: 350,
    };

    const result = computeSelectionResult([image, text, partiallyOutside, fullyOutside], box);
    expect(result.multiSelectedIds).toEqual(new Set(['inside-image', 'inside-text', 'partial-image']));
    expect(result.selectedId).toBeNull();
    expect(result.multiSelectedIds.has('outside-image')).toBe(false);
  });

  it('returns single-selected state when exactly one layer matches', () => {
    const layer = makeImageLayer({ id: 'one' });
    const box: SelectionBox = {
      startX: 0,
      startY: 0,
      endX: 300,
      endY: 300,
    };

    const result = computeSelectionResult([layer], box);
    expect(result.multiSelectedIds).toEqual(new Set(['one']));
    expect(result.selectedId).toBe('one');
  });

  it('clears selection state when no layers match', () => {
    const layer = makeImageLayer({ id: 'none', x: 1000, y: 1000 });
    const box: SelectionBox = {
      startX: 0,
      startY: 0,
      endX: 50,
      endY: 50,
    };

    const result = computeSelectionResult([layer], box);
    expect(result.multiSelectedIds).toEqual(new Set());
    expect(result.selectedId).toBeNull();
  });

  it('moves all selected layers together during multi-drag', () => {
    const layers: CanvasLayer[] = [
      makeImageLayer({ id: 'img-a', x: 100, y: 100 }),
      makeImageLayer({ id: 'img-b', x: 300, y: 250 }),
      makeTextLayer({ id: 'text-c', x: 500, y: 400 }),
    ];

    const startPositions = new Map<string, { x: number; y: number }>([
      ['img-a', { x: 100, y: 100 }],
      ['img-b', { x: 300, y: 250 }],
    ]);

    const next = computeMultiDragPositions(layers, new Set(['img-a', 'img-b']), startPositions, 40, -20);

    expect(next.find((l) => l.id === 'img-a')).toMatchObject({ x: 140, y: 80 });
    expect(next.find((l) => l.id === 'img-b')).toMatchObject({ x: 340, y: 230 });
    expect(next.find((l) => l.id === 'text-c')).toMatchObject({ x: 500, y: 400 });
  });

  it('returns only image ids that become unreferenced after deletion', () => {
    const deleted: CanvasLayer[] = [
      makeImageLayer({ id: 'img-layer-1', imageId: 'shared-image' }),
      makeImageLayer({ id: 'img-layer-2', imageId: 'delete-image' }),
      makeTextLayer({ id: 'text-layer-1' }),
    ];

    const remaining: CanvasLayer[] = [
      makeImageLayer({ id: 'img-layer-3', imageId: 'shared-image' }),
      makeTextLayer({ id: 'text-layer-2' }),
    ];

    const imageIds = collectUnreferencedImageIds(deleted, remaining);

    expect(imageIds).toEqual(['delete-image']);
  });

  it('restores transformer nodes after running an action', () => {
    const firstNode = { id: 'node-1' };
    const secondNode = { id: 'node-2' };
    const originalNodes = [firstNode, secondNode];
    let currentNodes = originalNodes;
    const batchDraw = vi.fn();

    const transformer = {
      nodes: vi.fn((nodes?: unknown[]) => {
        if (nodes === undefined) return currentNodes;
        currentNodes = nodes as typeof currentNodes;
        return transformer;
      }),
      getLayer: vi.fn(() => ({ batchDraw })),
    };

    const action = vi.fn(() => {
      expect(currentNodes).toEqual([]);
    });

    withTransformerNodesPreserved(transformer as never, action);

    expect(action).toHaveBeenCalledTimes(1);
    expect(currentNodes).toBe(originalNodes);
    expect(batchDraw).toHaveBeenCalledTimes(1);
  });

  it('restores transformer nodes even when action throws', () => {
    const originalNodes = [{ id: 'node-1' }];
    let currentNodes = originalNodes;
    const batchDraw = vi.fn();

    const transformer = {
      nodes: vi.fn((nodes?: unknown[]) => {
        if (nodes === undefined) return currentNodes;
        currentNodes = nodes as typeof currentNodes;
        return transformer;
      }),
      getLayer: vi.fn(() => ({ batchDraw })),
    };

    expect(() =>
      withTransformerNodesPreserved(transformer as never, () => {
        throw new Error('capture failed');
      })
    ).toThrowError('capture failed');

    expect(currentNodes).toBe(originalNodes);
    expect(batchDraw).toHaveBeenCalledTimes(1);
  });
});
