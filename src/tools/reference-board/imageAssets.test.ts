import { describe, expect, it } from 'vitest';

import type { ImageLayer } from './types';
import {
  collectUnreferencedImageAssetIds,
  getImageAssetIdsForLayer,
  getReferencedImageAssetIds,
} from './imageAssets';

function makeImageLayer(overrides: Partial<ImageLayer> = {}): ImageLayer {
  return {
    id: 'layer-1',
    projectId: 'proj-1',
    type: 'image',
    imageId: 'img-1',
    x: 0,
    y: 0,
    rotation: 0,
    opacity: 1,
    zIndex: 1,
    width: 400,
    height: 300,
    scaleX: 1,
    scaleY: 1,
    flipX: false,
    flipY: false,
    ...overrides,
  };
}

describe('image asset helpers', () => {
  it('returns both the base image and mask image ids for a masked layer', () => {
    const layer = makeImageLayer({ imageId: 'img-base', maskImageId: 'img-mask' });

    expect(getImageAssetIdsForLayer(layer)).toEqual(['img-base', 'img-mask']);
  });

  it('collects all referenced asset ids across layers without duplicates', () => {
    const layers = [
      makeImageLayer({ id: 'layer-a', imageId: 'img-base', maskImageId: 'img-mask' }),
      makeImageLayer({ id: 'layer-b', imageId: 'img-base', maskImageId: 'img-mask' }),
      makeImageLayer({ id: 'layer-c', imageId: 'img-other' }),
    ];

    expect(getReferencedImageAssetIds(layers)).toEqual(new Set(['img-base', 'img-mask', 'img-other']));
  });

  it('deletes a unique mask asset when its last referencing layer is removed', () => {
    const deletedLayers = [
      makeImageLayer({ id: 'layer-a', imageId: 'img-base', maskImageId: 'img-mask-unique' }),
    ];
    const remainingLayers = [
      makeImageLayer({ id: 'layer-b', imageId: 'img-base' }),
    ];

    expect(collectUnreferencedImageAssetIds(deletedLayers, remainingLayers)).toEqual(['img-mask-unique']);
  });

  it('keeps shared mask assets when another layer still references them', () => {
    const deletedLayers = [
      makeImageLayer({ id: 'layer-a', imageId: 'img-base-a', maskImageId: 'img-mask-shared' }),
    ];
    const remainingLayers = [
      makeImageLayer({ id: 'layer-b', imageId: 'img-base-b', maskImageId: 'img-mask-shared' }),
    ];

    expect(collectUnreferencedImageAssetIds(deletedLayers, remainingLayers)).toEqual(['img-base-a']);
  });
});
