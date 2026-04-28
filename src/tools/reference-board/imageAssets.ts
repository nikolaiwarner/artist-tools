import type { CanvasLayer, ImageLayer } from './types';

export function getImageAssetIdsForLayer(layer: ImageLayer): string[] {
  return layer.maskImageId ? [layer.imageId, layer.maskImageId] : [layer.imageId];
}

export function getReferencedImageAssetIds(layers: CanvasLayer[]): Set<string> {
  const assetIds = new Set<string>();

  for (const layer of layers) {
    if (layer.type !== 'image') continue;
    for (const imageAssetId of getImageAssetIdsForLayer(layer)) {
      assetIds.add(imageAssetId);
    }
  }

  return assetIds;
}

export function collectUnreferencedImageAssetIds(
  deletedLayers: CanvasLayer[],
  remainingLayers: CanvasLayer[],
): string[] {
  const stillReferenced = getReferencedImageAssetIds(remainingLayers);
  const imageAssetIdsToDelete: string[] = [];
  const seen = new Set<string>();

  for (const layer of deletedLayers) {
    if (layer.type !== 'image') continue;

    for (const imageAssetId of getImageAssetIdsForLayer(layer)) {
      if (stillReferenced.has(imageAssetId)) continue;
      if (seen.has(imageAssetId)) continue;
      seen.add(imageAssetId);
      imageAssetIdsToDelete.push(imageAssetId);
    }
  }

  return imageAssetIdsToDelete;
}
