import type { CanvasLayer, GroupLayer, ImageLayer, TextLayer } from './types';

interface TransformData {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
}

interface GroupSelectionInput {
  layers: CanvasLayer[];
  selectedIds: string[];
  projectId: string;
  createId: () => string;
}

interface GroupSelectionResult {
  layers: CanvasLayer[];
  groupId: string;
}

interface UngroupSelectionInput {
  layers: CanvasLayer[];
  selectedGroupIds: string[];
}

interface UngroupSelectionResult {
  layers: CanvasLayer[];
  ungroupedIds: string[];
}

interface PasteLayersInput {
  clipboardLayers: CanvasLayer[];
  projectId: string;
  nextZIndex: number;
  createId: () => string;
  offset?: { x: number; y: number };
}

interface PasteLayersResult {
  layers: CanvasLayer[];
  pastedRootIds: string[];
}

function normalizeRotation(rotation: number): number {
  let normalized = rotation % 360;
  if (normalized <= -180) normalized += 360;
  if (normalized > 180) normalized -= 360;
  return normalized;
}

function cloneLayer(layer: CanvasLayer): CanvasLayer {
  if (layer.type === 'image') {
    return {
      ...layer,
      crop: layer.crop ? { ...layer.crop } : undefined,
    } as ImageLayer;
  }

  if (layer.type === 'text') {
    return { ...layer } as TextLayer;
  }

  return { ...layer } as CanvasLayer;
}

function getScaleX(layer: CanvasLayer): number {
  if (layer.type === 'image') {
    return layer.scaleX * (layer.flipX ? -1 : 1);
  }

  if (layer.type === 'group' || layer.type === 'shape' || layer.type === 'grid' || layer.type === 'text') {
    return layer.scaleX;
  }

  return 1;
}

function getScaleY(layer: CanvasLayer): number {
  if (layer.type === 'image') {
    return layer.scaleY * (layer.flipY ? -1 : 1);
  }

  if (layer.type === 'group' || layer.type === 'shape' || layer.type === 'grid' || layer.type === 'text') {
    return layer.scaleY;
  }

  return 1;
}

function matrixFromTransform(transform: TransformData): [number, number, number, number, number, number] {
  const radians = (transform.rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const a = cos * transform.scaleX;
  const b = sin * transform.scaleX;
  const c = -sin * transform.scaleY;
  const d = cos * transform.scaleY;
  const e = transform.x;
  const f = transform.y;
  return [a, b, c, d, e, f];
}

function multiplyMatrix(
  left: [number, number, number, number, number, number],
  right: [number, number, number, number, number, number],
): [number, number, number, number, number, number] {
  const [a1, b1, c1, d1, e1, f1] = left;
  const [a2, b2, c2, d2, e2, f2] = right;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

function invertMatrix(matrix: [number, number, number, number, number, number]): [number, number, number, number, number, number] {
  const [a, b, c, d, e, f] = matrix;
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-12) {
    return [1, 0, 0, 1, 0, 0];
  }

  const invDet = 1 / det;
  const na = d * invDet;
  const nb = -b * invDet;
  const nc = -c * invDet;
  const nd = a * invDet;
  const ne = -(na * e + nc * f);
  const nf = -(nb * e + nd * f);
  return [na, nb, nc, nd, ne, nf];
}

function matrixToTransform(matrix: [number, number, number, number, number, number]): TransformData {
  const [a, b, c, d, e, f] = matrix;
  const scaleX = Math.sqrt(a * a + b * b);
  const rotationRadians = Math.atan2(b, a);
  const rotation = normalizeRotation((rotationRadians * 180) / Math.PI);
  const det = a * d - b * c;
  const scaleY = scaleX === 0 ? 0 : det / scaleX;

  return {
    x: e,
    y: f,
    rotation,
    scaleX,
    scaleY,
  };
}

function getLayerTransform(layer: CanvasLayer): TransformData {
  return {
    x: layer.x,
    y: layer.y,
    rotation: layer.rotation,
    scaleX: getScaleX(layer),
    scaleY: getScaleY(layer),
  };
}

function getParentMap(layers: CanvasLayer[]): Map<string, string | undefined> {
  const map = new Map<string, string | undefined>();
  for (const layer of layers) {
    map.set(layer.id, layer.parentId);
  }
  return map;
}

function buildLayerIndex(layers: CanvasLayer[]): Map<string, CanvasLayer> {
  const map = new Map<string, CanvasLayer>();
  for (const layer of layers) {
    map.set(layer.id, layer);
  }
  return map;
}

export function isGroupLayer(layer: CanvasLayer): layer is GroupLayer {
  return layer.type === 'group';
}

export function collectLayerSubtreeIds(layers: CanvasLayer[], rootId: string): Set<string> {
  const subtreeIds = new Set<string>();
  const stack = [rootId];

  while (stack.length > 0) {
    const currentId = stack.pop()!;
    if (subtreeIds.has(currentId)) continue;
    subtreeIds.add(currentId);

    for (const layer of layers) {
      if (layer.parentId === currentId) {
        stack.push(layer.id);
      }
    }
  }

  return subtreeIds;
}

export function getSelectionRootIds(layers: CanvasLayer[], selectedIds: string[]): string[] {
  if (selectedIds.length === 0) return [];
  const layerIndex = buildLayerIndex(layers);
  const selectedIdSet = new Set(selectedIds);

  return selectedIds.filter((layerId) => {
    let currentParentId = layerIndex.get(layerId)?.parentId;
    while (currentParentId) {
      if (selectedIdSet.has(currentParentId)) {
        return false;
      }
      currentParentId = layerIndex.get(currentParentId)?.parentId;
    }

    return true;
  });
}

export function collectLayersForClipboard(layers: CanvasLayer[], selectedIds: string[]): CanvasLayer[] {
  const rootIds = getSelectionRootIds(layers, selectedIds);
  const subtreeIds = new Set<string>();

  for (const rootId of rootIds) {
    const ids = collectLayerSubtreeIds(layers, rootId);
    for (const id of ids) {
      subtreeIds.add(id);
    }
  }

  return layers
    .filter((layer) => subtreeIds.has(layer.id))
    .sort((left, right) => left.zIndex - right.zIndex)
    .map(cloneLayer);
}

function getWorldBoundsForLayer(layer: CanvasLayer): { minX: number; minY: number; maxX: number; maxY: number } {
  if (layer.type === 'image') {
    const width = (layer.crop ? layer.crop.width * layer.width : layer.width) * Math.abs(layer.scaleX);
    const height = (layer.crop ? layer.crop.height * layer.height : layer.height) * Math.abs(layer.scaleY);
    return {
      minX: layer.x,
      minY: layer.y,
      maxX: layer.x + width,
      maxY: layer.y + height,
    };
  }

  if (layer.type === 'text') {
    const lines = Math.max(1, layer.text.split('\n').length);
    const width = layer.width * Math.abs(layer.scaleX);
    const height = layer.fontSize * 1.2 * lines * Math.abs(layer.scaleY);
    return {
      minX: layer.x,
      minY: layer.y,
      maxX: layer.x + width,
      maxY: layer.y + height,
    };
  }

  if (layer.type === 'shape' || layer.type === 'grid') {
    const width = layer.width * Math.abs(layer.scaleX);
    const height = layer.height * Math.abs(layer.scaleY);
    return {
      minX: layer.x,
      minY: layer.y,
      maxX: layer.x + width,
      maxY: layer.y + height,
    };
  }

  return {
    minX: layer.x,
    minY: layer.y,
    maxX: layer.x,
    maxY: layer.y,
  };
}

export function groupSelection(input: GroupSelectionInput): GroupSelectionResult | null {
  const { layers, selectedIds, projectId, createId } = input;
  const rootIds = getSelectionRootIds(layers, selectedIds);
  if (rootIds.length < 2) {
    return null;
  }

  const selectedRoots = layers.filter((layer) => rootIds.includes(layer.id));
  if (selectedRoots.length < 2) return null;

  const parentId = selectedRoots[0].parentId;
  const hasMixedParents = selectedRoots.some((layer) => layer.parentId !== parentId);
  if (hasMixedParents) {
    return null;
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;

  for (const layer of selectedRoots) {
    const bounds = getWorldBoundsForLayer(layer);
    minX = Math.min(minX, bounds.minX);
    minY = Math.min(minY, bounds.minY);
  }

  const groupId = createId();
  const nextGroup: GroupLayer = {
    id: groupId,
    projectId,
    type: 'group',
    parentId,
    x: minX,
    y: minY,
    rotation: 0,
    opacity: 1,
    zIndex: Math.min(...selectedRoots.map((layer) => layer.zIndex)),
    scaleX: 1,
    scaleY: 1,
  };

  const selectedRootIdSet = new Set(rootIds);
  const nextLayers = layers.map((layer) => {
    if (!selectedRootIdSet.has(layer.id)) return layer;

    return {
      ...layer,
      parentId: groupId,
      x: layer.x - minX,
      y: layer.y - minY,
    } as CanvasLayer;
  });

  return {
    layers: [...nextLayers, nextGroup],
    groupId,
  };
}

function computeWorldMatrix(layerIndex: Map<string, CanvasLayer>, layerId: string): [number, number, number, number, number, number] {
  const layer = layerIndex.get(layerId);
  if (!layer) {
    return [1, 0, 0, 1, 0, 0];
  }

  const local = matrixFromTransform(getLayerTransform(layer));
  if (!layer.parentId) return local;
  const parentWorld = computeWorldMatrix(layerIndex, layer.parentId);
  return multiplyMatrix(parentWorld, local);
}

function applyTransformToLayer(layer: CanvasLayer, transform: TransformData): CanvasLayer {
  if (layer.type === 'image') {
    const flipX = transform.scaleX < 0;
    const flipY = transform.scaleY < 0;
    return {
      ...layer,
      x: transform.x,
      y: transform.y,
      rotation: transform.rotation,
      scaleX: Math.abs(transform.scaleX),
      scaleY: Math.abs(transform.scaleY),
      flipX,
      flipY,
    };
  }

  if (layer.type === 'group' || layer.type === 'shape' || layer.type === 'grid' || layer.type === 'text') {
    return {
      ...layer,
      x: transform.x,
      y: transform.y,
      rotation: transform.rotation,
      scaleX: transform.scaleX,
      scaleY: transform.scaleY,
    };
  }

  return layer;
}

export function ungroupSelection(input: UngroupSelectionInput): UngroupSelectionResult {
  const { layers, selectedGroupIds } = input;
  const groupIdSet = new Set(selectedGroupIds);
  const layerIndex = buildLayerIndex(layers);
  const nextLayers = [...layers];

  for (const groupId of selectedGroupIds) {
    const groupLayer = layerIndex.get(groupId);
    if (!groupLayer || !isGroupLayer(groupLayer)) continue;

    const parentId = groupLayer.parentId;
    const parentWorldMatrix: [number, number, number, number, number, number] = parentId
      ? computeWorldMatrix(layerIndex, parentId)
      : [1, 0, 0, 1, 0, 0];
    const inverseParentWorld = invertMatrix(parentWorldMatrix);

    for (let index = 0; index < nextLayers.length; index += 1) {
      const layer = nextLayers[index];
      if (layer.parentId !== groupId) continue;

      const childWorld = computeWorldMatrix(layerIndex, layer.id);
      const childInParent = multiplyMatrix(inverseParentWorld, childWorld);
      const relativeTransform = matrixToTransform(childInParent);
      const updatedLayer = applyTransformToLayer(
        {
          ...layer,
          parentId,
          zIndex: layer.zIndex,
        },
        relativeTransform,
      );

      nextLayers[index] = updatedLayer;
      layerIndex.set(layer.id, updatedLayer);
    }
  }

  const filteredLayers = nextLayers.filter((layer) => !groupIdSet.has(layer.id));
  return {
    layers: filteredLayers,
    ungroupedIds: selectedGroupIds.filter((id) => layerIndex.has(id)),
  };
}

export function pasteLayersFromClipboard(input: PasteLayersInput): PasteLayersResult {
  const { clipboardLayers, projectId, nextZIndex, createId } = input;
  const offsetX = input.offset?.x ?? 20;
  const offsetY = input.offset?.y ?? 20;

  if (clipboardLayers.length === 0) {
    return { layers: [], pastedRootIds: [] };
  }

  const sorted = [...clipboardLayers].sort((left, right) => left.zIndex - right.zIndex);
  const idMap = new Map<string, string>();

  for (const layer of sorted) {
    idMap.set(layer.id, createId());
  }

  const copiedIdSet = new Set(sorted.map((layer) => layer.id));
  const rootIds = sorted
    .filter((layer) => !layer.parentId || !copiedIdSet.has(layer.parentId))
    .map((layer) => layer.id);
  const rootIdSet = new Set(rootIds);

  let zIndexCursor = nextZIndex;
  const nextLayers = sorted.map((layer) => {
    const nextId = idMap.get(layer.id)!;
    const nextParentId = layer.parentId ? idMap.get(layer.parentId) : undefined;
    const isRoot = rootIdSet.has(layer.id);

    const nextLayer: CanvasLayer = {
      ...cloneLayer(layer),
      id: nextId,
      projectId,
      parentId: nextParentId,
      x: isRoot ? layer.x + offsetX : layer.x,
      y: isRoot ? layer.y + offsetY : layer.y,
      zIndex: isRoot ? zIndexCursor++ : layer.zIndex,
    } as CanvasLayer;

    return nextLayer;
  });

  return {
    layers: nextLayers,
    pastedRootIds: rootIds.map((id) => idMap.get(id)!),
  };
}
