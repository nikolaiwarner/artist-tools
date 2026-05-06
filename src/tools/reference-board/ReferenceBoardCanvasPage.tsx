import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Image as KonvaImage, Group, Layer, Line, Rect, Text as KonvaText, Transformer } from 'react-konva';
import type Konva from 'konva';
import useImage from 'use-image';

import {
  bringForward,
  bringToFront,
  getProject,
  sendBackward,
  sendToBack,
  updateProject,
  updateThumbnail,
  updateViewport,
} from './referenceBoard';
import {
  collectUnreferencedImageAssetIds,
  getReferencedImageAssetIds,
} from './imageAssets';
import { generateMaskDataUrlFromImage } from './backgroundMask';
import {
  deleteImage,
  deleteLayer,
  deleteProjectData,
  loadImage,
  loadLayersForProject,
  saveImage,
  saveLayer,
} from './db';
import { ArrowLeft, ImagePlus, Type, Square, Download, Undo2, Redo2, Camera } from 'lucide-react';
import type { CanvasLayer, CropRect, ImageLayer, ShapeLayer, TextLayer, Viewport } from './types';
import { CanvasStage } from './components/CanvasStage';
import { ContextMenu } from './components/ContextMenu';
import { LayerPanel } from './components/LayerPanel';
import { TextEditor } from './components/TextEditor';
import { CameraSourcePanel, type CameraFacingMode } from '../../components/CameraSourcePanel';
import { SYNC_APPLIED_EVENT, type SyncAppliedDetail } from '../../sync/syncData';

const DEFAULT_CANVAS_BACKGROUND_COLOR = '#1f1f1f';
const PROJECTS_STORAGE_KEY = 'artist-tools.reference-board.projects';
const LAYER_CLIPBOARD_KIND = 'artist-tools/reference-board-layers';

// ── History management ───────────────────────────────────────────────────────

interface HistoryState {
  layers: CanvasLayer[];
}

class UndoRedoManager {
  private undoStack: HistoryState[] = [];
  private redoStack: HistoryState[] = [];
  private maxSize = 50;

  push(state: HistoryState) {
    this.undoStack.push(state);
    this.redoStack = []; // Clear redo when a new action is taken
    if (this.undoStack.length > this.maxSize) {
      this.undoStack.shift();
    }
  }

  canUndo() {
    return this.undoStack.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  undo() {
    if (!this.canUndo()) return null;
    const state = this.undoStack.pop()!;
    // Current state goes to redo
    return state;
  }

  redo() {
    if (!this.canRedo()) return null;
    const state = this.redoStack.pop()!;
    return state;
  }

  saveRedo(state: HistoryState) {
    this.redoStack.push(state);
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

function newId(): string {
  return crypto.randomUUID();
}

function nextZIndex(layers: CanvasLayer[]): number {
  return layers.length === 0 ? 1 : Math.max(...layers.map((l) => l.zIndex)) + 1;
}

interface LayerClipboardPayload {
  kind: typeof LAYER_CLIPBOARD_KIND;
  sourceProjectId: string;
  copiedAt: number;
  layers: CanvasLayer[];
}

function cloneLayerForClipboard(layer: CanvasLayer): CanvasLayer {
  if (layer.type === 'image') {
    return {
      ...layer,
      crop: layer.crop ? { ...layer.crop } : undefined,
    } as ImageLayer;
  }

  if (layer.type === 'shape') {
    return { ...layer } as ShapeLayer;
  }

  return { ...layer } as TextLayer;
}

function parseLayerClipboardPayload(rawText: string): LayerClipboardPayload | null {
  if (!rawText) return null;

  try {
    const parsed = JSON.parse(rawText) as Partial<LayerClipboardPayload>;
    if (parsed.kind !== LAYER_CLIPBOARD_KIND) return null;
    if (typeof parsed.sourceProjectId !== 'string') return null;
    if (!Array.isArray(parsed.layers)) return null;

    return {
      kind: LAYER_CLIPBOARD_KIND,
      sourceProjectId: parsed.sourceProjectId,
      copiedAt: typeof parsed.copiedAt === 'number' ? parsed.copiedAt : Date.now(),
      layers: parsed.layers as CanvasLayer[],
    };
  } catch {
    return null;
  }
}

export interface SelectionBox {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

interface BoundsRect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface SelectionResult {
  selectedId: string | null;
  multiSelectedIds: Set<string>;
}

interface MaskEditorState {
  layerId: string;
  imageDataUrl: string;
  initialMaskDataUrl?: string;
  width: number;
  height: number;
}

const SELECTION_CLICK_SLOP = 4;
const TEXT_LINE_HEIGHT_MULTIPLIER = 1.2;

export function stageToWorldPoint(point: { x: number; y: number }, viewport: Viewport): { x: number; y: number } {
  return {
    x: (point.x - viewport.x) / viewport.scale,
    y: (point.y - viewport.y) / viewport.scale,
  };
}

function getLayerBounds(layer: CanvasLayer): BoundsRect {
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

  if (layer.type === 'shape') {
    const width = layer.width * Math.abs(layer.scaleX);
    const height = layer.height * Math.abs(layer.scaleY);
    return {
      minX: layer.x,
      minY: layer.y,
      maxX: layer.x + width,
      maxY: layer.y + height,
    };
  }

  const lines = Math.max(1, layer.text.split('\n').length);
  const width = layer.width * Math.abs(layer.scaleX);
  const height = layer.fontSize * TEXT_LINE_HEIGHT_MULTIPLIER * lines * Math.abs(layer.scaleY);
  return {
    minX: layer.x,
    minY: layer.y,
    maxX: layer.x + width,
    maxY: layer.y + height,
  };
}

function normalizeBox(box: SelectionBox): BoundsRect {
  return {
    minX: Math.min(box.startX, box.endX),
    minY: Math.min(box.startY, box.endY),
    maxX: Math.max(box.startX, box.endX),
    maxY: Math.max(box.startY, box.endY),
  };
}

function shouldTreatAsClick(box: SelectionBox): boolean {
  return (
    Math.abs(box.endX - box.startX) < SELECTION_CLICK_SLOP
    && Math.abs(box.endY - box.startY) < SELECTION_CLICK_SLOP
  );
}

export function computeSelectionResult(layers: CanvasLayer[], box: SelectionBox): SelectionResult {
  if (shouldTreatAsClick(box)) {
    return { selectedId: null, multiSelectedIds: new Set() };
  }

  const normalized = normalizeBox(box);
  const selectedLayerIds = layers
    .filter((layer) => {
      const bounds = getLayerBounds(layer);
      // Select if the selection box intersects the layer (not requires full containment)
      return !(
        bounds.maxX < normalized.minX
        || bounds.minX > normalized.maxX
        || bounds.maxY < normalized.minY
        || bounds.minY > normalized.maxY
      );
    })
    .map((layer) => layer.id);

  if (selectedLayerIds.length === 0) {
    return { selectedId: null, multiSelectedIds: new Set() };
  }

  if (selectedLayerIds.length === 1) {
    return {
      selectedId: selectedLayerIds[0],
      multiSelectedIds: new Set(selectedLayerIds),
    };
  }

  return {
    selectedId: null,
    multiSelectedIds: new Set(selectedLayerIds),
  };
}

export function computeMultiDragPositions(
  layers: CanvasLayer[],
  draggedLayerIds: Set<string>,
  startPositions: Map<string, { x: number; y: number }>,
  deltaX: number,
  deltaY: number,
): CanvasLayer[] {
  return layers.map((layer) => {
    if (!draggedLayerIds.has(layer.id)) return layer;
    const start = startPositions.get(layer.id);
    if (!start) return layer;
    return {
      ...layer,
      x: start.x + deltaX,
      y: start.y + deltaY,
    };
  });
}

export function collectUnreferencedImageIds(deletedLayers: CanvasLayer[], remainingLayers: CanvasLayer[]): string[] {
  return collectUnreferencedImageAssetIds(deletedLayers, remainingLayers);
}

export function withTransformerNodesPreserved(
  transformer: Konva.Transformer | null,
  action: () => void,
): void {
  if (!transformer) {
    action();
    return;
  }

  const previousNodes = transformer.nodes();
  transformer.nodes([]);

  try {
    action();
  } finally {
    transformer.nodes(previousNodes);
    transformer.getLayer()?.batchDraw();
  }
}

// Capture stage with background color (for thumbnails)
function captureStageWithBackground(stage: Konva.Stage, backgroundColor: string, width: number, height: number, options: { pixelRatio?: number; mimeType?: string; quality?: number }): string {
  const pixelRatio = options.pixelRatio ?? 1;
  const pw = Math.round(width * pixelRatio);
  const ph = Math.round(height * pixelRatio);

  // Render stage content onto an offscreen canvas, then composite over a background fill.
  // Using a Konva rect layer for the background fails because the stage translate offsets
  // world-space (0,0) away from the capture origin.
  const stageCanvas = stage.toCanvas({ pixelRatio });

  const compositeCanvas = document.createElement('canvas');
  compositeCanvas.width = pw;
  compositeCanvas.height = ph;
  const ctx = compositeCanvas.getContext('2d')!;
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, pw, ph);
  ctx.drawImage(stageCanvas, 0, 0);

  return compositeCanvas.toDataURL(options.mimeType ?? 'image/jpeg', options.quality);
}

// Capture stage transparent (for exports)
function captureStageTransparent(stage: Konva.Stage, options: { mimeType?: string; pixelRatio?: number }): string {
  return stage.toDataURL(options);
}

// ── Image compression ──────────────────────────────────────────────────────────

function dataUrlByteLength(dataUrl: string): number {
  return new TextEncoder().encode(dataUrl).length;
}

function pickSmallestDataUrl(candidates: string[]): string {
  if (candidates.length === 0) return '';
  return candidates.reduce((smallest, current) => {
    return dataUrlByteLength(current) < dataUrlByteLength(smallest) ? current : smallest;
  });
}

async function compressImage(dataUrl: string, maxDim = 2400, quality = 0.85): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = dataUrl;
  });

  const targetBytes = 4 * 1024 * 1024;
  let attemptMaxDim = maxDim;
  let attemptQuality = quality;
  let bestResult = dataUrl;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    let w = img.naturalWidth;
    let h = img.naturalHeight;
    if (w > attemptMaxDim || h > attemptMaxDim) {
      const ratio = Math.min(attemptMaxDim / w, attemptMaxDim / h);
      w = Math.max(1, Math.round(w * ratio));
      h = Math.max(1, Math.round(h * ratio));
    }

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, w, h);

    const candidates = [
      canvas.toDataURL('image/jpeg', attemptQuality),
      canvas.toDataURL('image/webp', attemptQuality),
      canvas.toDataURL('image/png'),
    ];
    const smallestCandidate = pickSmallestDataUrl(candidates);
    if (dataUrlByteLength(smallestCandidate) < dataUrlByteLength(bestResult)) {
      bestResult = smallestCandidate;
    }

    if (dataUrlByteLength(bestResult) <= targetBytes) {
      break;
    }

    attemptMaxDim = Math.max(960, Math.round(attemptMaxDim * 0.82));
    attemptQuality = Math.max(0.55, attemptQuality - 0.1);
  }

  return bestResult;
}

async function normalizeMaskImage(dataUrl: string, width: number, height: number): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = dataUrl;
  });

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}

function createMaskedImageCanvas(
  image: HTMLImageElement | HTMLCanvasElement,
  mask: HTMLImageElement | HTMLCanvasElement,
): HTMLCanvasElement {
  const imageWidth = image instanceof HTMLImageElement ? image.naturalWidth : image.width;
  const imageHeight = image instanceof HTMLImageElement ? image.naturalHeight : image.height;
  const width = Math.max(1, Math.round(imageWidth));
  const height = Math.max(1, Math.round(imageHeight));

  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = width;
  maskCanvas.height = height;
  const maskCtx = maskCanvas.getContext('2d')!;
  maskCtx.drawImage(mask, 0, 0, width, height);

  const maskImageData = maskCtx.getImageData(0, 0, width, height);
  for (let index = 0; index < maskImageData.data.length; index += 4) {
    const red = maskImageData.data[index];
    const green = maskImageData.data[index + 1];
    const blue = maskImageData.data[index + 2];
    const alpha = maskImageData.data[index + 3];
    const luminance = Math.round((red + green + blue) / 3);
    maskImageData.data[index] = 255;
    maskImageData.data[index + 1] = 255;
    maskImageData.data[index + 2] = 255;
    maskImageData.data[index + 3] = Math.round((luminance / 255) * alpha);
  }
  maskCtx.putImageData(maskImageData, 0, 0);

  const compositeCanvas = document.createElement('canvas');
  compositeCanvas.width = width;
  compositeCanvas.height = height;
  const compositeCtx = compositeCanvas.getContext('2d')!;
  compositeCtx.drawImage(image, 0, 0, width, height);
  compositeCtx.globalCompositeOperation = 'destination-in';
  compositeCtx.drawImage(maskCanvas, 0, 0, width, height);
  compositeCtx.globalCompositeOperation = 'source-over';
  return compositeCanvas;
}

// ── Image node (loads dataUrl from IndexedDB async) ──────────────────────────

interface ImageNodeProps {
  layer: ImageLayer;
  isSelected: boolean;
  isMultiSelected: boolean;
  isCropEditing: boolean;
  transformerRef: React.RefObject<Konva.Transformer | null>;
  imageCache: Map<string, string>;
  onClick: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onTap: () => void;
  onDragStart: () => void;
  onDragMove: (x: number, y: number) => void;
  onDragEnd: (x: number, y: number) => void;
  onTransformEnd: (scaleX: number, scaleY: number, rotation: number) => void;
  onContextMenu: (e: Konva.KonvaEventObject<MouseEvent>) => void;
}

function ImageNode({
  layer,
  isSelected,
  isMultiSelected,
  isCropEditing,
  transformerRef,
  imageCache,
  onClick,
  onTap,
  onDragStart,
  onDragMove,
  onDragEnd,
  onTransformEnd,
  onContextMenu,
}: ImageNodeProps) {
  const nodeRef = useRef<Konva.Image>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dataUrl = imageCache.get(layer.imageId) ?? '';
  const maskDataUrl = layer.maskImageId ? imageCache.get(layer.maskImageId) ?? '' : '';
  const [img] = useImage(dataUrl);
  const [maskImg] = useImage(maskDataUrl);
  const renderedImage = useMemo(() => {
    if (!img) return undefined;
    if (!maskImg) return img;
    return createMaskedImageCanvas(img, maskImg);
  }, [img, maskImg]);

  useEffect(() => {
    if (isSelected && transformerRef.current && nodeRef.current) {
      transformerRef.current.nodes([nodeRef.current]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected, transformerRef]);

  const handleTouchStart = () => {
    // Start long-press timer (500ms)
    longPressTimerRef.current = setTimeout(() => {
      const node = nodeRef.current;
      if (node) {
        const stage = node.getStage();
        if (stage) {
          const pointerPos = stage.getPointerPosition();
          if (pointerPos) {
            // Create a synthetic context menu event
            const evt = new MouseEvent('contextmenu', {
              bubbles: true,
              cancelable: true,
              clientX: pointerPos.x,
              clientY: pointerPos.y,
            });
            // Trigger context menu handler
            onContextMenu({ evt } as Konva.KonvaEventObject<MouseEvent>);
          }
        }
      }
    }, 500);
  };

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleDragStart = () => {
    // Cancel long-press timer when drag starts (prevents context menu from firing after drag)
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    onDragStart();
  };

  const scaleX = layer.scaleX * (layer.flipX ? -1 : 1);
  const scaleY = layer.scaleY * (layer.flipY ? -1 : 1);

  return (
    <KonvaImage
      ref={nodeRef}
      image={renderedImage}
      x={layer.x}
      y={layer.y}
      width={(!isCropEditing && layer.crop) ? layer.crop.width * layer.width : layer.width}
      height={(!isCropEditing && layer.crop) ? layer.crop.height * layer.height : layer.height}
      scaleX={scaleX}
      scaleY={scaleY}
      rotation={layer.rotation}
      opacity={layer.opacity}
      offsetX={layer.flipX ? ((!isCropEditing && layer.crop) ? layer.crop.width * layer.width : layer.width) : 0}
      offsetY={layer.flipY ? ((!isCropEditing && layer.crop) ? layer.crop.height * layer.height : layer.height) : 0}
      crop={
        (!isCropEditing && layer.crop)
          ? {
            x: layer.crop.x * layer.width,
            y: layer.crop.y * layer.height,
            width: layer.crop.width * layer.width,
            height: layer.crop.height * layer.height,
          }
          : undefined
      }
      draggable
      onClick={onClick}
      onTap={onTap}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onDragStart={handleDragStart}
      onDragMove={(e) => onDragMove(e.target.x(), e.target.y())}
      onDragEnd={(e) => onDragEnd(e.target.x(), e.target.y())}
      shadowEnabled={isMultiSelected}
      shadowColor="#4da3ff"
      shadowBlur={14}
      shadowOpacity={0.9}
      onTransformEnd={(e) => {
        const node = e.target;
        onTransformEnd(
          Math.abs(node.scaleX()) * (layer.flipX ? 1 : Math.sign(node.scaleX())),
          Math.abs(node.scaleY()) * (layer.flipY ? 1 : Math.sign(node.scaleY())),
          node.rotation()
        );
        node.scaleX(layer.flipX ? -1 : 1);
        node.scaleY(layer.flipY ? -1 : 1);
      }}
      onContextMenu={onContextMenu}
    />
  );
}

// ── Text node ────────────────────────────────────────────────────────────────

interface TextNodeProps {
  layer: TextLayer;
  isSelected: boolean;
  isMultiSelected: boolean;
  isEditing: boolean;
  transformerRef: React.RefObject<Konva.Transformer | null>;
  onClick: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onTap: () => void;
  onDblClick: () => void;
  onDragStart: () => void;
  onDragMove: (x: number, y: number) => void;
  onDragEnd: (x: number, y: number) => void;
  onTransformEnd: (scaleX: number, scaleY: number, rotation: number) => void;
  onContextMenu: (e: Konva.KonvaEventObject<MouseEvent>) => void;
}

function TextNode({
  layer,
  isSelected,
  isMultiSelected,
  isEditing,
  transformerRef,
  onClick,
  onTap,
  onDblClick,
  onDragStart,
  onDragMove,
  onDragEnd,
  onTransformEnd,
  onContextMenu,
}: TextNodeProps) {
  const nodeRef = useRef<Konva.Text>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isSelected && transformerRef.current && nodeRef.current) {
      transformerRef.current.nodes([nodeRef.current]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected, transformerRef]);

  const handleTouchStart = () => {
    // Start long-press timer (500ms)
    longPressTimerRef.current = setTimeout(() => {
      const node = nodeRef.current;
      if (node) {
        const stage = node.getStage();
        if (stage) {
          const pointerPos = stage.getPointerPosition();
          if (pointerPos) {
            // Create a synthetic context menu event
            const evt = new MouseEvent('contextmenu', {
              bubbles: true,
              cancelable: true,
              clientX: pointerPos.x,
              clientY: pointerPos.y,
            });
            // Trigger context menu handler
            onContextMenu({ evt } as Konva.KonvaEventObject<MouseEvent>);
          }
        }
      }
    }, 500);
  };

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleDragStart = () => {
    // Cancel long-press timer when drag starts (prevents context menu from firing after drag)
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    onDragStart();
  };

  const fontStyle = [layer.italic ? 'italic' : '', layer.bold ? 'bold' : '']
    .filter(Boolean)
    .join(' ') || 'normal';

  return (
    <KonvaText
      ref={nodeRef}
      text={layer.text}
      x={layer.x}
      y={layer.y}
      width={layer.width}
      scaleX={layer.scaleX}
      scaleY={layer.scaleY}
      rotation={layer.rotation}
      opacity={layer.opacity}
      fontSize={layer.fontSize}
      fontFamily={layer.fontFamily}
      fontStyle={fontStyle}
      fill={layer.fill}
      align={layer.align}
      visible={!isEditing}
      draggable
      onClick={onClick}
      onTap={onTap}
      onDblClick={onDblClick}
      onDblTap={onDblClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onDragStart={handleDragStart}
      onDragMove={(e) => onDragMove(e.target.x(), e.target.y())}
      onDragEnd={(e) => onDragEnd(e.target.x(), e.target.y())}
      shadowEnabled={isMultiSelected}
      shadowColor="#4da3ff"
      shadowBlur={12}
      shadowOpacity={0.9}
      onTransformEnd={(e) => {
        const node = e.target;
        onTransformEnd(node.scaleX(), node.scaleY(), node.rotation());
        node.scaleX(1);
        node.scaleY(1);
      }}
      onContextMenu={onContextMenu}
    />
  );
}

interface ShapeNodeProps {
  layer: ShapeLayer;
  isSelected: boolean;
  isMultiSelected: boolean;
  transformerRef: React.RefObject<Konva.Transformer | null>;
  onClick: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onTap: () => void;
  onDragStart: () => void;
  onDragMove: (x: number, y: number) => void;
  onDragEnd: (x: number, y: number) => void;
  onTransformEnd: (scaleX: number, scaleY: number, rotation: number) => void;
  onContextMenu: (e: Konva.KonvaEventObject<MouseEvent>) => void;
}

function ShapeNode({
  layer,
  isSelected,
  isMultiSelected,
  transformerRef,
  onClick,
  onTap,
  onDragStart,
  onDragMove,
  onDragEnd,
  onTransformEnd,
  onContextMenu,
}: ShapeNodeProps) {
  const nodeRef = useRef<Konva.Rect>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isSelected && transformerRef.current && nodeRef.current) {
      transformerRef.current.nodes([nodeRef.current]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected, transformerRef]);

  const handleTouchStart = () => {
    longPressTimerRef.current = setTimeout(() => {
      const node = nodeRef.current;
      if (!node) return;
      const stage = node.getStage();
      const pointerPos = stage?.getPointerPosition();
      if (!pointerPos) return;

      const evt = new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: pointerPos.x,
        clientY: pointerPos.y,
      });

      onContextMenu({ evt } as Konva.KonvaEventObject<MouseEvent>);
    }, 500);
  };

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleDragStart = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    onDragStart();
  };

  return (
    <Rect
      ref={nodeRef}
      x={layer.x}
      y={layer.y}
      width={layer.width}
      height={layer.height}
      scaleX={layer.scaleX}
      scaleY={layer.scaleY}
      rotation={layer.rotation}
      opacity={layer.opacity}
      fill={layer.fill}
      stroke={layer.stroke}
      strokeWidth={layer.strokeWidth}
      draggable
      onClick={onClick}
      onTap={onTap}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onDragStart={handleDragStart}
      onDragMove={(e) => onDragMove(e.target.x(), e.target.y())}
      onDragEnd={(e) => onDragEnd(e.target.x(), e.target.y())}
      shadowEnabled={isMultiSelected}
      shadowColor="#4da3ff"
      shadowBlur={12}
      shadowOpacity={0.9}
      onTransformEnd={(e) => {
        const node = e.target;
        onTransformEnd(node.scaleX(), node.scaleY(), node.rotation());
        node.scaleX(1);
        node.scaleY(1);
      }}
      onContextMenu={onContextMenu}
    />
  );
}

// ── Main canvas page ─────────────────────────────────────────────────────────

export function ReferenceBoardCanvasPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const thumbnailTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewportSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dbMutationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const scheduleThumbnailRef = useRef<() => void>(() => undefined);
  const copiedLayersRef = useRef<CanvasLayer[]>([]);
  const layersRef = useRef<CanvasLayer[]>([]);
  const historyManagerRef = useRef(new UndoRedoManager());

  const [layers, setLayers] = useState<CanvasLayer[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  // Keep a ref in sync so scheduleThumbnail can read current layers without being a dependency
  useEffect(() => { layersRef.current = layers; }, [layers]);
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, scale: 1 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [multiSelectedIds, setMultiSelectedIds] = useState<Set<string>>(new Set());
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; layerId: string; layerType: string } | null>(null);
  const [canvasContextMenu, setCanvasContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [imageCache, setImageCache] = useState<Map<string, string>>(new Map());
  const [cropLayerId, setCropLayerId] = useState<string | null>(null);
  const [cropState, setCropState] = useState<CropRect | null>(null);
  const [loading, setLoading] = useState(true);
  const [canvasBackgroundColor, setCanvasBackgroundColor] = useState(DEFAULT_CANVAS_BACKGROUND_COLOR);
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  const [maskDetectingLayerId, setMaskDetectingLayerId] = useState<string | null>(null);
  const [maskEditor, setMaskEditor] = useState<MaskEditorState | null>(null);
  const [showCameraCapture, setShowCameraCapture] = useState(false);
  const [cameraFacingMode, setCameraFacingMode] = useState<CameraFacingMode>('environment');
  const isSelectingRef = useRef(false);
  const selectionStartRef = useRef<{ x: number; y: number } | null>(null);
  const multiDragStartPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const multiDragAnchorRef = useRef<{ layerId: string; x: number; y: number } | null>(null);

  const project = useMemo(() => (projectId ? getProject(projectId) : null), [projectId]);

  const reloadProjectMeta = useCallback(() => {
    if (!projectId) return;
    const nextProject = getProject(projectId);
    if (!nextProject) {
      navigate('/tools/reference-board');
      return;
    }
    setViewport(nextProject.viewport);
    setCanvasBackgroundColor(nextProject.canvasBackgroundColor ?? DEFAULT_CANVAS_BACKGROUND_COLOR);
  }, [navigate, projectId]);

  const reloadCanvasData = useCallback(async () => {
    if (!projectId) return;
    const loadedLayers = await loadLayersForProject(projectId);
    setLayers(loadedLayers);
    const cache = new Map<string, string>();
    await Promise.all(
      Array.from(getReferencedImageAssetIds(loadedLayers)).map(async (imageAssetId) => {
        const dataUrl = await loadImage(imageAssetId);
        if (dataUrl) cache.set(imageAssetId, dataUrl);
      })
    );
    setImageCache(cache);
    setLoading(false);
  }, [projectId]);

  // Load layers + images on mount
  useEffect(() => {
    if (!projectId) return;
    reloadProjectMeta();
    void reloadCanvasData();
  }, [projectId, reloadCanvasData, reloadProjectMeta]);

  // React to remote sync apply events while this canvas is open.
  useEffect(() => {
    if (!projectId) return;

    const onSyncApplied = (event: Event) => {
      const detail = (event as CustomEvent<SyncAppliedDetail>).detail;
      if (!detail) return;

      if (detail.kind === 'ls' && detail.key === PROJECTS_STORAGE_KEY) {
        reloadProjectMeta();
        return;
      }

      if (detail.kind === 'db-image') {
        void reloadCanvasData();
        return;
      }

      if (detail.kind === 'db-layer') {
        if (!detail.projectId || detail.projectId === projectId) {
          void reloadCanvasData();
        }
      }
    };

    window.addEventListener(SYNC_APPLIED_EVENT, onSyncApplied);
    return () => window.removeEventListener(SYNC_APPLIED_EVENT, onSyncApplied);
  }, [projectId, reloadCanvasData, reloadProjectMeta]);

  function handleCanvasBackgroundColorChange(color: string) {
    setCanvasBackgroundColor(color);
    if (!projectId) return;
    updateProject(projectId, { canvasBackgroundColor: color });
  }

  const queueDbMutation = useCallback((mutation: () => Promise<void>) => {
    dbMutationQueueRef.current = dbMutationQueueRef.current
      .then(mutation)
      .catch(() => undefined);
  }, []);

  const persistHistoryTransition = useCallback((fromLayers: CanvasLayer[], toLayers: CanvasLayer[], imageCacheSnapshot: Map<string, string>) => {
    const toLayerIds = new Set(toLayers.map((layer) => layer.id));
    const deletedLayers = fromLayers.filter((layer) => !toLayerIds.has(layer.id));

    queueDbMutation(async () => {
      for (const layer of deletedLayers) {
        await deleteLayer(layer.id);
      }

      const imageAssetIdsToDelete = collectUnreferencedImageIds(deletedLayers, toLayers);
      for (const imageAssetId of imageAssetIdsToDelete) {
        await deleteImage(imageAssetId);
      }

      for (const layer of toLayers) {
        await saveLayer(layer);
      }

      const imageAssetIdsInState = getReferencedImageAssetIds(toLayers);

      for (const imageAssetId of imageAssetIdsInState) {
        const dataUrl = imageCacheSnapshot.get(imageAssetId);
        if (dataUrl) {
          await saveImage(imageAssetId, dataUrl);
        }
      }
    });
  }, [queueDbMutation]);

  // Helper to save state to history before making changes
  const saveToHistory = useCallback(() => {
    historyManagerRef.current.push({ layers });
    setCanUndo(historyManagerRef.current.canUndo());
    setCanRedo(historyManagerRef.current.canRedo());
  }, [layers]);

  // Undo handler
  const handleUndo = useCallback(() => {
    const history = historyManagerRef.current;
    if (!history.canUndo()) return;

    // Save current state to redo
    history.saveRedo({ layers });

    const previousState = history.undo();
    if (previousState) {
      setLayers(previousState.layers);
      persistHistoryTransition(layers, previousState.layers, new Map(imageCache));
      setSelectedId(null);
      setMultiSelectedIds(new Set());
      scheduleThumbnailRef.current();
    }

    setCanUndo(history.canUndo());
    setCanRedo(history.canRedo());
  }, [imageCache, layers, persistHistoryTransition]);

  // Redo handler
  const handleRedo = useCallback(() => {
    const history = historyManagerRef.current;
    if (!history.canRedo()) return;

    const nextState = history.redo();
    if (nextState) {
      setLayers(nextState.layers);
      persistHistoryTransition(layers, nextState.layers, new Map(imageCache));
      setSelectedId(null);
      setMultiSelectedIds(new Set());
      scheduleThumbnailRef.current();
    }

    setCanUndo(history.canUndo());
    setCanRedo(history.canRedo());
  }, [imageCache, layers, persistHistoryTransition]);

  // Debounced viewport save
  const handleViewportChange = useCallback(
    (vp: Viewport) => {
      setViewport(vp);
      if (!projectId) return;
      if (viewportSaveTimerRef.current) clearTimeout(viewportSaveTimerRef.current);
      viewportSaveTimerRef.current = setTimeout(() => {
        updateViewport(projectId, vp);
      }, 500);
    },
    [projectId]
  );

  const captureThumbnailNow = useCallback(() => {
    if (!projectId) return;

    const stage = stageRef.current;
    const allLayers = layersRef.current;
    if (!stage || allLayers.length === 0) return;

    // Compute bounding box of all layers in world space
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const layer of allLayers) {
      const bounds = getLayerBounds(layer);
      minX = Math.min(minX, bounds.minX);
      minY = Math.min(minY, bounds.minY);
      maxX = Math.max(maxX, bounds.maxX);
      maxY = Math.max(maxY, bounds.maxY);
    }

    const pad = 20;
    const worldW = Math.max(1, maxX - minX + pad * 2);
    const worldH = Math.max(1, maxY - minY + pad * 2);

    let dataUrl = '';
    withTransformerNodesPreserved(transformerRef.current, () => {
      const saved = {
        x: stage.x(),
        y: stage.y(),
        scaleX: stage.scaleX(),
        scaleY: stage.scaleY(),
        width: stage.width(),
        height: stage.height(),
      };

      stage.setAttrs({
        x: -(minX - pad),
        y: -(minY - pad),
        scaleX: 1,
        scaleY: 1,
        width: Math.round(worldW),
        height: Math.round(worldH),
      });

      dataUrl = captureStageWithBackground(
        stage,
        canvasBackgroundColor,
        Math.round(worldW),
        Math.round(worldH),
        { pixelRatio: 0.5, mimeType: 'image/jpeg', quality: 0.9 }
      );

      stage.setAttrs(saved);
      stage.batchDraw();
    });

    updateThumbnail(projectId, dataUrl);
  }, [canvasBackgroundColor, projectId]);

  // Debounced thumbnail generation — captures all layers regardless of current viewport
  const scheduleThumbnail = useCallback(() => {
    if (!projectId) return;
    if (thumbnailTimerRef.current) clearTimeout(thumbnailTimerRef.current);
    thumbnailTimerRef.current = setTimeout(() => {
      captureThumbnailNow();
    }, 2000);
  }, [captureThumbnailNow, projectId]);

  const handleExitToProjects = useCallback(() => {
    if (thumbnailTimerRef.current) {
      clearTimeout(thumbnailTimerRef.current);
      thumbnailTimerRef.current = null;
    }
    captureThumbnailNow();
    navigate('/tools/reference-board');
  }, [captureThumbnailNow, navigate]);

  useEffect(() => {
    scheduleThumbnailRef.current = scheduleThumbnail;
  }, [scheduleThumbnail]);

  // Update a layer in state + persist
  const updateLayer = useCallback(
    (id: string, patch: Partial<CanvasLayer>) => {
      setLayers((prev) => {
        const next = prev.map((l) => (l.id === id ? ({ ...l, ...patch } as CanvasLayer) : l));
        const updated = next.find((l) => l.id === id);
        if (updated) void saveLayer(updated);
        scheduleThumbnail();
        return next;
      });
    },
    [scheduleThumbnail]
  );

  const handleCopyLayers = useCallback(() => {
    if (!projectId) return false;

    const selectedIds = multiSelectedIds.size > 0
      ? Array.from(multiSelectedIds)
      : selectedId
        ? [selectedId]
        : [];

    if (selectedIds.length === 0) return false;

    const copied = layers
      .filter((layer) => selectedIds.includes(layer.id))
      .sort((a, b) => a.zIndex - b.zIndex)
      .map(cloneLayerForClipboard);

    if (copied.length === 0) return false;
    copiedLayersRef.current = copied;

    const payload: LayerClipboardPayload = {
      kind: LAYER_CLIPBOARD_KIND,
      sourceProjectId: projectId,
      copiedAt: Date.now(),
      layers: copied,
    };

    const clipboard = globalThis.navigator?.clipboard;
    if (clipboard && typeof clipboard.writeText === 'function') {
      void clipboard.writeText(JSON.stringify(payload)).catch(() => undefined);
    }

    return true;
  }, [layers, multiSelectedIds, projectId, selectedId]);

  const handlePasteLayers = useCallback(async (clipboardLayers: CanvasLayer[], sourceProjectId?: string) => {
    if (!projectId || clipboardLayers.length === 0) return false;

    let copied = clipboardLayers.map(cloneLayerForClipboard);
    const isCrossProjectPaste = !!sourceProjectId && sourceProjectId !== projectId;

    if (isCrossProjectPaste) {
      const imageAssetIdMap = new Map<string, string>();
      const nextCache = new Map(imageCache);

      const copyImageAsset = async (sourceAssetId: string): Promise<string> => {
        const mappedAssetId = imageAssetIdMap.get(sourceAssetId);
        if (mappedAssetId) return mappedAssetId;

        const dataUrl = nextCache.get(sourceAssetId) ?? await loadImage(sourceAssetId);
        if (!dataUrl) {
          return sourceAssetId;
        }

        const pastedAssetId = newId();
        imageAssetIdMap.set(sourceAssetId, pastedAssetId);
        nextCache.set(pastedAssetId, dataUrl);
        await saveImage(pastedAssetId, dataUrl);
        return pastedAssetId;
      };

      copied = await Promise.all(copied.map(async (layer) => {
        if (layer.type !== 'image') return layer;

        const pastedImageId = await copyImageAsset(layer.imageId);
        const pastedMaskImageId = layer.maskImageId
          ? await copyImageAsset(layer.maskImageId)
          : undefined;

        return {
          ...layer,
          imageId: pastedImageId,
          ...(pastedMaskImageId ? { maskImageId: pastedMaskImageId } : {}),
        } as ImageLayer;
      }));

      setImageCache(nextCache);
    }

    saveToHistory();

    let zIndex = nextZIndex(layers);
    const pastedIds: string[] = [];
    const pasted = copied.map((layer) => {
      const id = newId();
      pastedIds.push(id);
      const newLayer: CanvasLayer = {
        ...layer,
        id,
        projectId,
        x: layer.x + 20,
        y: layer.y + 20,
        zIndex: zIndex++,
      };
      void saveLayer(newLayer);
      return newLayer;
    });

    scheduleThumbnail();
    setLayers((prev) => [...prev, ...pasted]);

    if (pastedIds.length === 1) {
      setSelectedId(pastedIds[0]);
      setMultiSelectedIds(new Set([pastedIds[0]]));
    } else if (pastedIds.length > 1) {
      setSelectedId(null);
      setMultiSelectedIds(new Set(pastedIds));
    }

    return pastedIds.length > 0;
  }, [imageCache, layers, projectId, saveToHistory, scheduleThumbnail]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (editingTextId) return;
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement) return;

      // Undo: Ctrl+Z or Cmd+Z
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
      // Redo: Ctrl+Shift+Z or Cmd+Shift+Z
      else if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        handleRedo();
      }
      // Copy selected layer(s): Ctrl/Cmd+C
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        if (handleCopyLayers()) {
          e.preventDefault();
        }
      }
      // Delete selected layers
      else if ((e.key === 'Delete' || e.key === 'Backspace') && (selectedId || multiSelectedIds.size > 0)) {
        e.preventDefault();
        if (selectedId) {
          handleDeleteLayer(selectedId);
        } else {
          handleDeleteLayers(Array.from(multiSelectedIds));
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, multiSelectedIds, editingTextId, handleUndo, handleRedo, handleCopyLayers]);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (editingTextId) return;
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement) return;

      const items = e.clipboardData?.items;
      const imageFiles: File[] = [];
      if (items && items.length > 0) {
        for (const item of Array.from(items)) {
          if (!item.type.startsWith('image/')) continue;
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }

      // Pasted image files should always take precedence over layer payloads.
      if (imageFiles.length > 0) {
        copiedLayersRef.current = [];
        e.preventDefault();
        void importFiles(imageFiles);
        return;
      }

      const clipboardText = e.clipboardData?.getData('text/plain') ?? '';
      const clipboardPayload = parseLayerClipboardPayload(clipboardText);

      if (clipboardPayload && clipboardPayload.layers.length > 0) {
        copiedLayersRef.current = clipboardPayload.layers.map(cloneLayerForClipboard);
        e.preventDefault();
        void handlePasteLayers(clipboardPayload.layers, clipboardPayload.sourceProjectId);
        return;
      }

      // Fallback for environments where clipboard text is unavailable.
      if (copiedLayersRef.current.length > 0) {
        e.preventDefault();
        void handlePasteLayers(copiedLayersRef.current, projectId);
      }
    };

    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [editingTextId, handlePasteLayers, importFiles, projectId]);

  useEffect(() => {
    if (selectedId || cropLayerId) return;
    if (transformerRef.current) {
      transformerRef.current.nodes([]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [selectedId, cropLayerId]);

  // ── Layer operations ──────────────────────────────────────────────────────

  function handleDeleteLayers(layerIds: string[]) {
    if (layerIds.length === 0) return;

    const layerIdSet = new Set(layerIds);
    saveToHistory();

    setLayers((prev) => {
      const deletedLayers = prev.filter((layer) => layerIdSet.has(layer.id));
      if (deletedLayers.length === 0) return prev;

      const remainingLayers = prev.filter((layer) => !layerIdSet.has(layer.id));
      for (const layer of deletedLayers) {
        queueDbMutation(() => deleteLayer(layer.id));
      }

      const imageIdsToDelete = collectUnreferencedImageIds(deletedLayers, remainingLayers);
      for (const imageId of imageIdsToDelete) {
        queueDbMutation(() => deleteImage(imageId));
      }

      scheduleThumbnail();
      return remainingLayers;
    });

    if (selectedId && layerIdSet.has(selectedId)) {
      setSelectedId(null);
    }

    setMultiSelectedIds((prev) => {
      const next = new Set([...prev].filter((id) => !layerIdSet.has(id)));
      return next;
    });
  }

  function handleDeleteLayer(id: string) {
    handleDeleteLayers([id]);
  }

  function handleLayerClick(layerId: string, shiftKey: boolean) {
    if (cropLayerId) return;
    if (shiftKey) {
      // Shift-click: toggle this layer in/out of multi-selection
      setMultiSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(layerId)) {
          next.delete(layerId);
        } else {
          next.add(layerId);
        }
        // Ensure selectedId stays consistent: single item → that item; multiple → null
        const ids = Array.from(next);
        setSelectedId(ids.length === 1 ? ids[0] : null);
        return next;
      });
    } else {
      setSelectedId(layerId);
      setMultiSelectedIds(new Set([layerId]));
    }
  }

  function handleLayerDragStart(layerId: string) {
    if (cropLayerId) return;

    saveToHistory();

    if (multiSelectedIds.size > 1 && multiSelectedIds.has(layerId)) {
      const startPositions = new Map<string, { x: number; y: number }>();
      for (const layer of layers) {
        if (multiSelectedIds.has(layer.id)) {
          startPositions.set(layer.id, { x: layer.x, y: layer.y });
        }
      }

      const anchor = startPositions.get(layerId);
      if (anchor) {
        multiDragStartPositionsRef.current = startPositions;
        multiDragAnchorRef.current = { layerId, x: anchor.x, y: anchor.y };
      }
      return;
    }

    setSelectedId(layerId);
    setMultiSelectedIds(new Set([layerId]));
  }

  function handleLayerDragMove(layerId: string, x: number, y: number) {
    const anchor = multiDragAnchorRef.current;
    if (!anchor || anchor.layerId !== layerId) return;

    const deltaX = x - anchor.x;
    const deltaY = y - anchor.y;
    const selected = new Set(multiDragStartPositionsRef.current.keys());

    setLayers((prev) =>
      computeMultiDragPositions(prev, selected, multiDragStartPositionsRef.current, deltaX, deltaY)
    );
  }

  function handleLayerDragEnd(layerId: string, x: number, y: number) {
    const anchor = multiDragAnchorRef.current;
    if (anchor && anchor.layerId === layerId) {
      const movedIds = new Set(multiDragStartPositionsRef.current.keys());
      setLayers((prev) => {
        for (const layer of prev) {
          if (movedIds.has(layer.id)) {
            void saveLayer(layer);
          }
        }
        return prev;
      });
      scheduleThumbnail();
      multiDragAnchorRef.current = null;
      multiDragStartPositionsRef.current = new Map();
      return;
    }

    updateLayer(layerId, { x, y });
  }

  function handleDuplicateLayer(id: string) {
    saveToHistory();
    setLayers((prev) => {
      const layer = prev.find((l) => l.id === id);
      if (!layer) return prev;
      const newLayer: CanvasLayer = {
        ...layer,
        id: newId(),
        x: layer.x + 20,
        y: layer.y + 20,
        zIndex: nextZIndex(prev),
      };
      void saveLayer(newLayer);
      scheduleThumbnail();
      return [...prev, newLayer];
    });
  }

  function handleLayerOrder(
    id: string,
    op: 'front' | 'back' | 'forward' | 'backward'
  ) {
    saveToHistory();
    setLayers((prev) => {
      const ops = { front: bringToFront, back: sendToBack, forward: bringForward, backward: sendBackward };
      const reordered = ops[op](prev, id) as CanvasLayer[];
      reordered.forEach((l) => {
        const orig = prev.find((p) => p.id === l.id);
        if (orig && orig.zIndex !== l.zIndex) void saveLayer(l);
      });
      return reordered;
    });
  }

  function handleFlipH(id: string) {
    const layer = layers.find((l) => l.id === id) as ImageLayer | undefined;
    if (!layer || layer.type !== 'image') return;
    updateLayer(id, { flipX: !layer.flipX } as Partial<CanvasLayer>);
  }

  function handleFlipV(id: string) {
    const layer = layers.find((l) => l.id === id) as ImageLayer | undefined;
    if (!layer || layer.type !== 'image') return;
    updateLayer(id, { flipY: !layer.flipY } as Partial<CanvasLayer>);
  }

  async function startMaskDraw(layerId: string) {
    const layer = layersRef.current.find((candidate) => candidate.id === layerId) as ImageLayer | undefined;
    if (!layer || layer.type !== 'image') return;
    if (maskDetectingLayerId) return;

    const imageDataUrl = imageCache.get(layer.imageId);
    if (!imageDataUrl) return;

    const width = Math.max(1, Math.round(layer.width));
    const height = Math.max(1, Math.round(layer.height));
    const currentMaskDataUrl = layer.maskImageId ? imageCache.get(layer.maskImageId) : undefined;
    const initialMaskDataUrl = currentMaskDataUrl
      ? await normalizeMaskImage(currentMaskDataUrl, width, height)
      : undefined;

    setMaskEditor({
      layerId,
      imageDataUrl,
      initialMaskDataUrl,
      width,
      height,
    });
  }

  async function handleApplyDrawnMask(maskDataUrl: string) {
    const editorState = maskEditor;
    if (!editorState) return;

    const layer = layersRef.current.find((candidate) => candidate.id === editorState.layerId) as ImageLayer | undefined;
    if (!layer || layer.type !== 'image') {
      setMaskEditor(null);
      return;
    }

    saveToHistory();

    const normalizedMaskDataUrl = await normalizeMaskImage(maskDataUrl, layer.width, layer.height);
    const maskImageId = newId();

    await saveImage(maskImageId, normalizedMaskDataUrl);
    setImageCache((currentCache) => new Map(currentCache).set(maskImageId, normalizedMaskDataUrl));

    setLayers((prev) => {
      const next = prev.map((candidate) => (
        candidate.id === editorState.layerId
          ? ({ ...candidate, maskImageId } as CanvasLayer)
          : candidate
      ));
      const updatedLayer = next.find((candidate) => candidate.id === editorState.layerId);
      if (updatedLayer) {
        void saveLayer(updatedLayer);
      }

      const imageAssetIdsToDelete = collectUnreferencedImageAssetIds([layer], next);
      for (const imageAssetId of imageAssetIdsToDelete) {
        queueDbMutation(() => deleteImage(imageAssetId));
        setImageCache((currentCache) => {
          const nextCache = new Map(currentCache);
          nextCache.delete(imageAssetId);
          return nextCache;
        });
      }

      scheduleThumbnail();
      return next;
    });

    setMaskEditor(null);
  }

  function handleCancelMaskDraw() {
    setMaskEditor(null);
  }

  async function handleDetectMask(layerId: string) {
    if (maskDetectingLayerId) return;

    const layer = layersRef.current.find((candidate) => candidate.id === layerId) as ImageLayer | undefined;
    if (!layer || layer.type !== 'image') return;
    const imageDataUrl = imageCache.get(layer.imageId);
    if (!imageDataUrl) return;

    setMaskDetectingLayerId(layerId);

    try {
      const maskDataUrl = await generateMaskDataUrlFromImage(imageDataUrl);
      const maskImageId = newId();

      saveToHistory();

      await saveImage(maskImageId, maskDataUrl);
      setImageCache((currentCache) => new Map(currentCache).set(maskImageId, maskDataUrl));

      setLayers((prev) => {
        const next = prev.map((candidate) => (
          candidate.id === layerId
            ? ({ ...candidate, maskImageId } as CanvasLayer)
            : candidate
        ));
        const updatedLayer = next.find((candidate) => candidate.id === layerId);
        if (updatedLayer) {
          void saveLayer(updatedLayer);
        }

        const imageAssetIdsToDelete = collectUnreferencedImageAssetIds([layer], next);
        for (const imageAssetId of imageAssetIdsToDelete) {
          queueDbMutation(() => deleteImage(imageAssetId));
          setImageCache((currentCache) => {
            const nextCache = new Map(currentCache);
            nextCache.delete(imageAssetId);
            return nextCache;
          });
        }

        scheduleThumbnail();
        return next;
      });
    } catch (error) {
      console.error('Reference Board mask detection failed', error);
    } finally {
      setMaskDetectingLayerId((current) => (current === layerId ? null : current));
    }
  }

  function handleClearMask(layerId: string) {
    const layer = layers.find((candidate) => candidate.id === layerId) as ImageLayer | undefined;
    if (!layer?.maskImageId) return;

    saveToHistory();

    setLayers((prev) => {
      const next = prev.map((candidate) => (
        candidate.id === layerId
          ? ({ ...candidate, maskImageId: undefined } as CanvasLayer)
          : candidate
      ));
      const updatedLayer = next.find((candidate) => candidate.id === layerId);
      if (updatedLayer) {
        void saveLayer(updatedLayer);
      }

      const imageAssetIdsToDelete = collectUnreferencedImageAssetIds([layer], next);
      for (const imageAssetId of imageAssetIdsToDelete) {
        queueDbMutation(() => deleteImage(imageAssetId));
        setImageCache((currentCache) => {
          const nextCache = new Map(currentCache);
          nextCache.delete(imageAssetId);
          return nextCache;
        });
      }

      scheduleThumbnail();
      return next;
    });
  }

  // ── File import ───────────────────────────────────────────────────────────

  async function importImageDataUrls(rawDataUrls: string[]) {
    if (rawDataUrls.length === 0) {
      return;
    }

    saveToHistory();
    const stage = stageRef.current;
    const centerX = stage ? (stage.width() / 2 - viewport.x) / viewport.scale : 300;
    const centerY = stage ? (stage.height() / 2 - viewport.y) / viewport.scale : 200;
    let nextLayerZIndex = nextZIndex(layersRef.current);

    for (const rawDataUrl of rawDataUrls) {
      const dataUrl = await compressImage(rawDataUrl);
      const { width, height } = await getImageDimensions(dataUrl);
      const imageId = newId();
      await saveImage(imageId, dataUrl);
      setImageCache((currentCache) => new Map(currentCache).set(imageId, dataUrl));

      const layer: ImageLayer = {
        id: newId(),
        projectId: projectId!,
        type: 'image',
        imageId,
        x: centerX - width / 2,
        y: centerY - height / 2,
        width,
        height,
        rotation: 0,
        opacity: 1,
        zIndex: nextLayerZIndex,
        scaleX: 1,
        scaleY: 1,
        flipX: false,
        flipY: false,
      };

      nextLayerZIndex += 1;
      setLayers((prev) => [...prev, layer]);
      await saveLayer(layer);
      scheduleThumbnail();
    }
  }

  async function importFiles(files: FileList | File[]) {
    const rawDataUrls: string[] = [];

    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      rawDataUrls.push(await readFileAsDataUrl(file));
    }

    await importImageDataUrls(rawDataUrls);
  }

  async function handleCameraCapture(dataUrl: string) {
    setShowCameraCapture(false);
    await importImageDataUrls([dataUrl]);
  }

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault();
    if (e.dataTransfer.files.length > 0) void importFiles(e.dataTransfer.files);
  }

  // ── Add text ──────────────────────────────────────────────────────────────

  function handleAddText() {
    saveToHistory();
    const stage = stageRef.current;
    const centerX = stage ? (stage.width() / 2 - viewport.x) / viewport.scale : 300;
    const centerY = stage ? (stage.height() / 2 - viewport.y) / viewport.scale : 200;

    const layer: TextLayer = {
      id: newId(),
      projectId: projectId!,
      type: 'text',
      text: 'Double-click to edit',
      x: centerX - 100,
      y: centerY - 20,
      rotation: 0,
      opacity: 1,
      zIndex: nextZIndex(layers),
      fontSize: 24,
      fontFamily: 'IBM Plex Sans',
      bold: false,
      italic: false,
      fill: '#171717',
      align: 'left',
      width: 300,
      scaleX: 1,
      scaleY: 1,
    };

    setLayers((prev) => [...prev, layer]);
    void saveLayer(layer);
    setSelectedId(layer.id);
    scheduleThumbnail();
  }

  function handleAddShape() {
    saveToHistory();
    const stage = stageRef.current;
    const centerX = stage ? (stage.width() / 2 - viewport.x) / viewport.scale : 300;
    const centerY = stage ? (stage.height() / 2 - viewport.y) / viewport.scale : 200;

    const layer: ShapeLayer = {
      id: newId(),
      projectId: projectId!,
      type: 'shape',
      shape: 'rectangle',
      x: centerX - 120,
      y: centerY - 80,
      rotation: 0,
      opacity: 1,
      zIndex: nextZIndex(layers),
      width: 240,
      height: 160,
      stroke: '#4da3ff',
      strokeWidth: 4,
      fill: 'transparent',
      scaleX: 1,
      scaleY: 1,
    };

    setLayers((prev) => [...prev, layer]);
    void saveLayer(layer);
    setSelectedId(layer.id);
    setMultiSelectedIds(new Set([layer.id]));
    scheduleThumbnail();
  }

  // ── Context menu ──────────────────────────────────────────────────────────

  function handleContextMenu(e: Konva.KonvaEventObject<MouseEvent>, layerId: string) {
    e.evt.preventDefault();
    e.evt.stopPropagation();
    setCanvasContextMenu(null);
    setSelectedId(layerId);
    const layer = layers.find((l) => l.id === layerId);
    setContextMenu({ x: e.evt.clientX, y: e.evt.clientY, layerId, layerType: layer?.type ?? 'image' });
  }

  function handleCanvasContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    if (copiedLayersRef.current.length === 0) return;
    setContextMenu(null);
    setCanvasContextMenu({ x: e.clientX, y: e.clientY });
  }

  // ── Box select handlers ────────────────────────────────────────────────────

  function handleSelectionStart(x: number, y: number) {
    const worldPoint = stageToWorldPoint({ x, y }, viewport);
    isSelectingRef.current = true;
    selectionStartRef.current = worldPoint;
    setSelectionBox({ startX: worldPoint.x, startY: worldPoint.y, endX: worldPoint.x, endY: worldPoint.y });
  }

  function handleSelectionMove(x: number, y: number) {
    if (!isSelectingRef.current || !selectionStartRef.current) return;
    const worldPoint = stageToWorldPoint({ x, y }, viewport);
    setSelectionBox({
      startX: selectionStartRef.current.x,
      startY: selectionStartRef.current.y,
      endX: worldPoint.x,
      endY: worldPoint.y,
    });
  }

  function handleSelectionEnd() {
    if (!isSelectingRef.current || !selectionBox || !selectionStartRef.current) {
      isSelectingRef.current = false;
      setSelectionBox(null);
      selectionStartRef.current = null;
      return;
    }

    isSelectingRef.current = false;
    const box = selectionBox;
    setSelectionBox(null);
    selectionStartRef.current = null;

    const result = computeSelectionResult(layers, box);
    setSelectedId(result.selectedId);
    setMultiSelectedIds(result.multiSelectedIds);
  }

  // ── Crop helpers ──────────────────────────────────────────────────────────

  function startCrop(layerId: string) {
    const layer = layers.find((l) => l.id === layerId) as ImageLayer | undefined;
    if (!layer) return;
    setCropLayerId(layerId);
    setCropState(layer.crop ?? { x: 0, y: 0, width: 1, height: 1 });
  }

  function handleApplyCrop() {
    if (cropLayerId && cropState) {
      updateLayer(cropLayerId, { crop: cropState } as Partial<CanvasLayer>);
    }
    setCropLayerId(null);
    setCropState(null);
  }

  function handleCancelCrop() {
    setCropLayerId(null);
    setCropState(null);
  }

  // ── Download / export ─────────────────────────────────────────────────────

  function handleDownload() {
    const stage = stageRef.current;
    if (!stage || layers.length === 0) return;

    // Compute approximate bounding box of all layers in world space
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const layer of layers) {
      const bounds = getLayerBounds(layer);
      minX = Math.min(minX, bounds.minX);
      minY = Math.min(minY, bounds.minY);
      maxX = Math.max(maxX, bounds.maxX);
      maxY = Math.max(maxY, bounds.maxY);
    }

    const pad = 40;
    const worldW = Math.max(1, maxX - minX + pad * 2);
    const worldH = Math.max(1, maxY - minY + pad * 2);

    let dataUrl = '';
    withTransformerNodesPreserved(transformerRef.current, () => {
      const saved = {
        x: stage.x(), y: stage.y(),
        scaleX: stage.scaleX(), scaleY: stage.scaleY(),
        width: stage.width(), height: stage.height(),
      };

      stage.setAttrs({
        x: -(minX - pad),
        y: -(minY - pad),
        scaleX: 1, scaleY: 1,
        width: Math.round(worldW),
        height: Math.round(worldH),
      });

      dataUrl = captureStageTransparent(stage, { mimeType: 'image/png', pixelRatio: 1 });

      stage.setAttrs(saved);
      stage.batchDraw();
    });

    const link = document.createElement('a');
    link.download = `${project?.name ?? 'canvas'}.png`;
    link.href = dataUrl;
    link.click();
  }

  // ── Sorted layers ─────────────────────────────────────────────────────────

  const sortedLayers = useMemo(
    () => [...layers].sort((a, b) => a.zIndex - b.zIndex),
    [layers]
  );

  const selectedLayer = useMemo(
    () => layers.find((l) => l.id === selectedId) ?? null,
    [layers, selectedId]
  );

  // ── Crop overlay state ────────────────────────────────────────────────────

  const cropLayer = cropLayerId ? (layers.find((l) => l.id === cropLayerId) as ImageLayer | undefined) : undefined;

  if (!project && !loading) {
    return (
      <section className="tool-layout">
        <div className="tool-hero">
          <p>Project not found.</p>
          <button onClick={handleExitToProjects}>Back to projects</button>
        </div>
      </section>
    );
  }

  return (
    <section
      className="refboard-canvas-page"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleFileDrop}
    >
      {/* Toolbar */}
      <div className="refboard-toolbar">
        <button className="refboard-toolbar-btn" onClick={handleExitToProjects} title="Back to projects">
          <ArrowLeft size={16} />
        </button>
        <span className="refboard-project-title">{project?.name ?? ''}</span>

        <div className="refboard-toolbar-actions">
          <button
            className="refboard-toolbar-btn"
            onClick={handleUndo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
          >
            <Undo2 size={16} />
          </button>
          <button
            className="refboard-toolbar-btn"
            onClick={handleRedo}
            disabled={!canRedo}
            title="Redo (Ctrl+Shift+Z)"
            aria-label="Redo"
          >
            <Redo2 size={16} />
          </button>
          <label className="refboard-toolbar-btn refboard-toolbar-color">
            <input
              type="color"
              className="refboard-toolbar-color-input"
              value={canvasBackgroundColor}
              aria-label="Canvas background color"
              title="Canvas background color"
              onChange={(e) => handleCanvasBackgroundColorChange(e.target.value)}
            />
          </label>
          <label className="refboard-toolbar-btn" title="Import images">
            <ImagePlus size={16} />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => {
                if (e.target.files) void importFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </label>
          <button
            className="refboard-toolbar-btn"
            onClick={() => setShowCameraCapture(true)}
            title="Capture image from camera"
            aria-label="Capture image from camera"
          >
            <Camera size={16} />
          </button>
          <button className="refboard-toolbar-btn" onClick={handleAddText} title="Add text layer">
            <Type size={16} />
          </button>
          <button className="refboard-toolbar-btn" onClick={handleAddShape} title="Add box layer">
            <Square size={16} />
          </button>
          <button className="refboard-toolbar-btn" onClick={handleDownload} title="Export canvas as PNG" disabled={layers.length === 0}>
            <Download size={16} />
          </button>
        </div>
      </div>

      <div className="refboard-editor-body">
        {/* Canvas */}
        <div
          className="refboard-canvas-wrap"
          data-testid="canvas-wrap"
          style={{
            backgroundColor: canvasBackgroundColor,
            backgroundSize: `${40 * viewport.scale}px ${40 * viewport.scale}px`,
            backgroundPosition: `${viewport.x}px ${viewport.y}px`,
          }}
          onContextMenu={handleCanvasContextMenu}
        >
          {loading && <div className="refboard-loading">Loading…</div>}
          <CanvasStage
            viewport={viewport}
            onViewportChange={handleViewportChange}
            stageRef={stageRef}
            selectionBox={selectionBox}
            onSelectionStart={handleSelectionStart}
            onSelectionMove={handleSelectionMove}
            onSelectionEnd={handleSelectionEnd}
            onBackgroundClick={() => {
              setSelectedId(null);
              setMultiSelectedIds(new Set());
              if (transformerRef.current) {
                transformerRef.current.nodes([]);
                transformerRef.current.getLayer()?.batchDraw();
              }
            }}
          >
            {sortedLayers.map((layer) =>
              layer.type === 'image' ? (
                <ImageNode
                  key={layer.id}
                  layer={layer as ImageLayer}
                  isSelected={selectedId === layer.id && !cropLayerId}
                  isMultiSelected={multiSelectedIds.size > 1 && multiSelectedIds.has(layer.id)}
                  isCropEditing={cropLayerId === layer.id}
                  transformerRef={transformerRef}
                  imageCache={imageCache}
                  onClick={(e) => handleLayerClick(layer.id, e.evt.shiftKey)}
                  onTap={() => handleLayerClick(layer.id, false)}
                  onDragStart={() => handleLayerDragStart(layer.id)}
                  onDragMove={(x, y) => handleLayerDragMove(layer.id, x, y)}
                  onDragEnd={(x, y) => { if (!cropLayerId) handleLayerDragEnd(layer.id, x, y); }}
                  onTransformEnd={(scaleX, scaleY, rotation) =>
                    updateLayer(layer.id, { scaleX, scaleY, rotation } as Partial<ImageLayer>)
                  }
                  onContextMenu={(e) => handleContextMenu(e, layer.id)}
                />
              ) : layer.type === 'shape' ? (
                <ShapeNode
                  key={layer.id}
                  layer={layer as ShapeLayer}
                  isSelected={selectedId === layer.id && !cropLayerId}
                  isMultiSelected={multiSelectedIds.size > 1 && multiSelectedIds.has(layer.id)}
                  transformerRef={transformerRef}
                  onClick={(e) => handleLayerClick(layer.id, e.evt.shiftKey)}
                  onTap={() => handleLayerClick(layer.id, false)}
                  onDragStart={() => handleLayerDragStart(layer.id)}
                  onDragMove={(x, y) => handleLayerDragMove(layer.id, x, y)}
                  onDragEnd={(x, y) => handleLayerDragEnd(layer.id, x, y)}
                  onTransformEnd={(scaleX, scaleY, rotation) =>
                    updateLayer(layer.id, { scaleX, scaleY, rotation } as Partial<ShapeLayer>)
                  }
                  onContextMenu={(e) => handleContextMenu(e, layer.id)}
                />
              ) : (
                <TextNode
                  key={layer.id}
                  layer={layer as TextLayer}
                  isSelected={selectedId === layer.id && editingTextId !== layer.id && !cropLayerId}
                  isMultiSelected={multiSelectedIds.size > 1 && multiSelectedIds.has(layer.id)}
                  isEditing={editingTextId === layer.id}
                  transformerRef={transformerRef}
                  onClick={(e) => handleLayerClick(layer.id, e.evt.shiftKey)}
                  onTap={() => handleLayerClick(layer.id, false)}
                  onDblClick={() => setEditingTextId(layer.id)}
                  onDragStart={() => handleLayerDragStart(layer.id)}
                  onDragMove={(x, y) => handleLayerDragMove(layer.id, x, y)}
                  onDragEnd={(x, y) => handleLayerDragEnd(layer.id, x, y)}
                  onTransformEnd={(scaleX, scaleY, rotation) =>
                    updateLayer(layer.id, { scaleX, scaleY, rotation } as Partial<TextLayer>)
                  }
                  onContextMenu={(e) => handleContextMenu(e, layer.id)}
                />
              )
            )}
            {cropLayerId && cropState && cropLayer && (
              <CropHandles
                layer={cropLayer}
                crop={cropState}
                viewportScale={viewport.scale}
                onCropChange={setCropState}
              />
            )}
            <Transformer ref={transformerRef} visible={!cropLayerId} />
          </CanvasStage>
        </div>

        {/* Layer panel */}
        {selectedLayer && (
          <LayerPanel
            layer={selectedLayer}
            onUpdate={(patch) => updateLayer(selectedLayer.id, patch)}
            onDelete={() => handleDeleteLayer(selectedLayer.id)}
            onDuplicate={() => handleDuplicateLayer(selectedLayer.id)}
            onBringToFront={() => handleLayerOrder(selectedLayer.id, 'front')}
            onBringForward={() => handleLayerOrder(selectedLayer.id, 'forward')}
            onSendBackward={() => handleLayerOrder(selectedLayer.id, 'backward')}
            onSendToBack={() => handleLayerOrder(selectedLayer.id, 'back')}
            onFlipH={selectedLayer.type === 'image' ? () => handleFlipH(selectedLayer.id) : undefined}
            onFlipV={selectedLayer.type === 'image' ? () => handleFlipV(selectedLayer.id) : undefined}
            onCropStart={selectedLayer.type === 'image' ? () => startCrop(selectedLayer.id) : undefined}
            onMaskDrawStart={selectedLayer.type === 'image' ? () => void startMaskDraw(selectedLayer.id) : undefined}
            onClearMask={selectedLayer.type === 'image' ? () => handleClearMask(selectedLayer.id) : undefined}
            onDetectMask={selectedLayer.type === 'image' ? () => void handleDetectMask(selectedLayer.id) : undefined}
            isDetectingMask={selectedLayer.type === 'image' && maskDetectingLayerId === selectedLayer.id}
          />
        )}

        {!selectedLayer && multiSelectedIds.size > 1 && (
          <aside className="refboard-multi-select-panel" aria-label="Multi-selection status">
            <p className="refboard-panel-eyebrow">Selection</p>
            <p>{multiSelectedIds.size} layers selected</p>
            <button
              className="refboard-delete-btn"
              onClick={() => handleDeleteLayers(Array.from(multiSelectedIds))}
            >
              Delete selected layers
            </button>
          </aside>
        )}
      </div>

      {/* Text overlay editor */}
      {editingTextId && (() => {
        const tl = layers.find((l) => l.id === editingTextId) as TextLayer | undefined;
        if (!tl) return null;
        return (
          <TextEditor
            stageRef={stageRef}
            viewport={viewport}
            layerX={tl.x}
            layerY={tl.y}
            layerRotation={tl.rotation}
            layerScale={tl.scaleX}
            fontSize={tl.fontSize}
            fontFamily={tl.fontFamily}
            bold={tl.bold}
            italic={tl.italic}
            fill={tl.fill}
            width={tl.width}
            value={tl.text}
            onChange={(text) => updateLayer(editingTextId, { text } as Partial<TextLayer>)}
            onBlur={() => setEditingTextId(null)}
          />
        );
      })()}

      {/* Crop canvas actions */}
      {cropLayerId && cropState && (
        <div className="refboard-crop-canvas-actions">
          <button onClick={handleApplyCrop} className="refboard-crop-apply-btn">Apply</button>
          <button onClick={handleCancelCrop}>Cancel</button>
        </div>
      )}

      {/* Mask drawing editor */}
      {maskEditor && (
        <MaskDrawEditor
          imageDataUrl={maskEditor.imageDataUrl}
          initialMaskDataUrl={maskEditor.initialMaskDataUrl}
          width={maskEditor.width}
          height={maskEditor.height}
          onApply={(nextMaskDataUrl) => void handleApplyDrawnMask(nextMaskDataUrl)}
          onCancel={handleCancelMaskDraw}
        />
      )}

      {showCameraCapture && (
        <div className="refboard-camera-backdrop" role="presentation" onClick={() => setShowCameraCapture(false)}>
          <div
            className="refboard-camera-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Camera capture"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="refboard-camera-dialog-head">
              <p className="refboard-panel-eyebrow" style={{ marginBottom: 0 }}>Camera Capture</p>
              <button type="button" onClick={() => setShowCameraCapture(false)} aria-label="Close camera capture">Close</button>
            </div>
            <CameraSourcePanel
              facingMode={cameraFacingMode}
              onFacingModeChange={setCameraFacingMode}
              showUpload={false}
              showCaptureButton
              captureButtonLabel="Capture photo"
              controlsClassName="poster-controls refboard-camera-controls"
              sourcePanelClassName="refboard-camera-source"
              sourceFrameClassName="refboard-camera-frame"
              sourceClassName="poster-source"
              onCapture={(dataUrl) => {
                void handleCameraCapture(dataUrl);
              }}
            />
          </div>
        </div>
      )}

      {/* Context menu */}
      {canvasContextMenu && (
        <ContextMenu
          x={canvasContextMenu.x}
          y={canvasContextMenu.y}
          onClose={() => setCanvasContextMenu(null)}
          onPaste={() => void handlePasteLayers(copiedLayersRef.current, copiedLayersRef.current[0]?.projectId)}
        />
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onCopy={() => {
            const layerToCopy = layers.find((l) => l.id === contextMenu.layerId);
            if (layerToCopy && projectId) {
              const copied = [cloneLayerForClipboard(layerToCopy)];
              copiedLayersRef.current = copied;
              const payload: LayerClipboardPayload = {
                kind: LAYER_CLIPBOARD_KIND,
                sourceProjectId: projectId,
                copiedAt: Date.now(),
                layers: copied,
              };
              const clipboard = globalThis.navigator?.clipboard;
              if (clipboard && typeof clipboard.writeText === 'function') {
                void clipboard.writeText(JSON.stringify(payload)).catch(() => undefined);
              }
            }
          }}
          onDelete={() => handleDeleteLayer(contextMenu.layerId)}
          onDuplicate={() => handleDuplicateLayer(contextMenu.layerId)}
          onBringToFront={() => handleLayerOrder(contextMenu.layerId, 'front')}
          onSendToBack={() => handleLayerOrder(contextMenu.layerId, 'back')}
          onBringForward={() => handleLayerOrder(contextMenu.layerId, 'forward')}
          onSendBackward={() => handleLayerOrder(contextMenu.layerId, 'backward')}
          onCropStart={contextMenu.layerType === 'image' ? () => startCrop(contextMenu.layerId) : undefined}
          cropLabel={(() => {
            const l = layers.find((layer) => layer.id === contextMenu.layerId) as ImageLayer | undefined;
            return l?.crop ? 'Edit Crop' : 'Crop Image';
          })()}
        />
      )}
    </section>
  );
}

interface MaskDrawEditorProps {
  imageDataUrl: string;
  initialMaskDataUrl?: string;
  width: number;
  height: number;
  onApply: (maskDataUrl: string) => void;
  onCancel: () => void;
}

function MaskDrawEditor({
  imageDataUrl,
  initialMaskDataUrl,
  width,
  height,
  onApply,
  onCancel,
}: MaskDrawEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const [brushSize, setBrushSize] = useState(24);
  const [mode, setMode] = useState<'hide' | 'reveal'>('hide');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let canceled = false;

    async function initializeMaskCanvas() {
      const canvas = canvasRef.current;
      if (!canvas) return;

      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) return;

      if (!initialMaskDataUrl) {
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, width, height);
        if (!canceled) setReady(true);
        return;
      }

      const maskImage = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = initialMaskDataUrl;
      }).catch(() => null);

      if (!maskImage) {
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, width, height);
        if (!canceled) setReady(true);
        return;
      }

      context.clearRect(0, 0, width, height);
      context.drawImage(maskImage, 0, 0, width, height);
      if (!canceled) setReady(true);
    }

    void initializeMaskCanvas();

    return () => {
      canceled = true;
    };
  }, [height, initialMaskDataUrl, width]);

  function eventToCanvasPoint(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / Math.max(1, rect.width);
    const scaleY = canvas.height / Math.max(1, rect.height);
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;
    return {
      x: Math.max(0, Math.min(canvas.width, x)),
      y: Math.max(0, Math.min(canvas.height, y)),
    };
  }

  function drawStroke(from: { x: number; y: number }, to: { x: number; y: number }) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    context.save();
    context.strokeStyle = mode === 'hide' ? '#000000' : '#ffffff';
    context.lineWidth = brushSize;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
    context.restore();
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!ready) return;
    isDrawingRef.current = true;
    const point = eventToCanvasPoint(event);
    lastPointRef.current = point;
    drawStroke(point, point);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!isDrawingRef.current) return;
    const point = eventToCanvasPoint(event);
    const previousPoint = lastPointRef.current ?? point;
    drawStroke(previousPoint, point);
    lastPointRef.current = point;
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (isDrawingRef.current) {
      isDrawingRef.current = false;
      lastPointRef.current = null;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleApply() {
    const canvas = canvasRef.current;
    if (!canvas || !ready) return;
    onApply(canvas.toDataURL('image/png'));
  }

  return (
    <div className="refboard-mask-editor-backdrop">
      <div className="refboard-mask-editor" role="dialog" aria-label="Mask Editor" aria-modal="true">
        <div className="refboard-mask-editor-head">
          <p className="refboard-panel-eyebrow" style={{ marginBottom: 0 }}>Mask Editor</p>
          <p style={{ fontSize: '0.8rem' }}>Paint black to hide, white to reveal.</p>
        </div>

        <div className="refboard-mask-editor-toolbar">
          <button
            className={mode === 'hide' ? 'refboard-toggle-active' : ''}
            onClick={() => setMode('hide')}
            type="button"
          >
            Hide
          </button>
          <button
            className={mode === 'reveal' ? 'refboard-toggle-active' : ''}
            onClick={() => setMode('reveal')}
            type="button"
          >
            Reveal
          </button>
          <label className="refboard-mask-editor-brush">
            Brush
            <input
              type="range"
              min={4}
              max={96}
              step={2}
              value={brushSize}
              onChange={(event) => setBrushSize(parseInt(event.target.value, 10))}
            />
            <span>{brushSize}px</span>
          </label>
        </div>

        <div className="refboard-mask-editor-stage">
          <img src={imageDataUrl} alt="Mask editing base" draggable={false} />
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          />
        </div>

        <div className="refboard-mask-editor-actions">
          <button onClick={onCancel} type="button">Cancel</button>
          <button onClick={handleApply} type="button" className="refboard-crop-apply-btn" disabled={!ready}>Apply Mask</button>
        </div>
      </div>
    </div>
  );
}

// ── Crop handles (Konva overlay) ─────────────────────────────────────────────

interface CropHandlesProps {
  layer: ImageLayer;
  crop: CropRect;
  viewportScale: number;
  onCropChange: (crop: CropRect) => void;
}

function CropHandles({ layer, crop, viewportScale, onCropChange }: CropHandlesProps) {
  const SHADE = 'rgba(0,0,0,0.6)';
  const zoomSafeScale = Math.max(0.05, viewportScale || 1);
  const invScale = 1 / ((Math.abs(layer.scaleX) || 1) * zoomSafeScale);
  const sw = 1.25 * invScale; // keep border visible at any zoom
  const hs = 14 * invScale; // keep handles easy to grab at any zoom

  const cx = crop.x * layer.width;
  const cy = crop.y * layer.height;
  const cw = crop.width * layer.width;
  const ch = crop.height * layer.height;

  const groupProps = {
    x: layer.x,
    y: layer.y,
    offsetX: layer.flipX ? layer.width : 0,
    offsetY: layer.flipY ? layer.height : 0,
    scaleX: layer.scaleX * (layer.flipX ? -1 : 1),
    scaleY: layer.scaleY * (layer.flipY ? -1 : 1),
    rotation: layer.rotation,
  };

  const handles = [
    { name: 'tl', x: cx, y: cy },
    { name: 'tm', x: cx + cw / 2, y: cy },
    { name: 'tr', x: cx + cw, y: cy },
    { name: 'mr', x: cx + cw, y: cy + ch / 2 },
    { name: 'br', x: cx + cw, y: cy + ch },
    { name: 'bm', x: cx + cw / 2, y: cy + ch },
    { name: 'bl', x: cx, y: cy + ch },
    { name: 'ml', x: cx, y: cy + ch / 2 },
  ];

  function applyHandleDrag(name: string, rawX: number, rawY: number) {
    const nx = Math.max(0, Math.min(layer.width, rawX));
    const ny = Math.max(0, Math.min(layer.height, rawY));

    const L0 = crop.x * layer.width;
    const T0 = crop.y * layer.height;
    const R0 = (crop.x + crop.width) * layer.width;
    const B0 = (crop.y + crop.height) * layer.height;

    let L = L0, T = T0, R = R0, B = B0;
    if (name === 'tl') { L = nx; T = ny; }
    else if (name === 'tm') { T = ny; }
    else if (name === 'tr') { R = nx; T = ny; }
    else if (name === 'mr') { R = nx; }
    else if (name === 'br') { R = nx; B = ny; }
    else if (name === 'bm') { B = ny; }
    else if (name === 'bl') { L = nx; B = ny; }
    else if (name === 'ml') { L = nx; }

    const minW = Math.max(2, layer.width * 0.02);
    const minH = Math.max(2, layer.height * 0.02);
    if (R - L < minW) { if (name.includes('l')) L = R - minW; else R = L + minW; }
    if (B - T < minH) { if (name.includes('t')) T = B - minH; else B = T + minH; }

    onCropChange({
      x: Math.max(0, L) / layer.width,
      y: Math.max(0, T) / layer.height,
      width: (Math.min(R, layer.width) - Math.max(0, L)) / layer.width,
      height: (Math.min(B, layer.height) - Math.max(0, T)) / layer.height,
    });
  }

  return (
    <Group {...groupProps}>
      {/* Shade outside crop area */}
      <Rect x={0} y={0} width={layer.width} height={cy} fill={SHADE} listening={false} />
      <Rect x={0} y={cy + ch} width={layer.width} height={layer.height - cy - ch} fill={SHADE} listening={false} />
      <Rect x={0} y={cy} width={cx} height={ch} fill={SHADE} listening={false} />
      <Rect x={cx + cw} y={cy} width={layer.width - cx - cw} height={ch} fill={SHADE} listening={false} />

      {/* Crop border */}
      <Rect
        x={cx} y={cy} width={cw} height={ch}
        stroke="rgba(255,255,255,0.85)"
        strokeWidth={sw}
        fill="rgba(255,255,255,0.04)"
        draggable
        onDragMove={(e) => {
          const node = e.target;
          const nx = Math.max(0, Math.min(layer.width - cw, node.x()));
          const ny = Math.max(0, Math.min(layer.height - ch, node.y()));
          node.x(nx);
          node.y(ny);
          onCropChange({ x: nx / layer.width, y: ny / layer.height, width: crop.width, height: crop.height });
        }}
        onDragEnd={(e) => { e.target.x(cx); e.target.y(cy); }}
      />

      {/* Rule-of-thirds lines */}
      <Line points={[cx + cw / 3, cy, cx + cw / 3, cy + ch]} stroke="rgba(255,255,255,0.25)" strokeWidth={sw} listening={false} />
      <Line points={[cx + 2 * cw / 3, cy, cx + 2 * cw / 3, cy + ch]} stroke="rgba(255,255,255,0.25)" strokeWidth={sw} listening={false} />
      <Line points={[cx, cy + ch / 3, cx + cw, cy + ch / 3]} stroke="rgba(255,255,255,0.25)" strokeWidth={sw} listening={false} />
      <Line points={[cx, cy + 2 * ch / 3, cx + cw, cy + 2 * ch / 3]} stroke="rgba(255,255,255,0.25)" strokeWidth={sw} listening={false} />

      {/* Resize handles */}
      {handles.map((h) => (
        <Rect
          key={h.name}
          x={h.x - hs / 2}
          y={h.y - hs / 2}
          width={hs}
          height={hs}
          fill="white"
          stroke="rgba(0,0,0,0.35)"
          strokeWidth={sw}
          draggable
          onDragMove={(e) => {
            const node = e.target;
            const rawX = node.x() + hs / 2;
            const rawY = node.y() + hs / 2;
            const clampedX = Math.max(0, Math.min(layer.width, rawX));
            const clampedY = Math.max(0, Math.min(layer.height, rawY));
            node.x(clampedX - hs / 2);
            node.y(clampedY - hs / 2);
            applyHandleDrag(h.name, clampedX, clampedY);
          }}
        />
      ))}
    </Group>
  );
}

// ── Utility helpers ───────────────────────────────────────────────────────────

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function getImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 400, height: 300 });
    img.src = dataUrl;
  });
}
