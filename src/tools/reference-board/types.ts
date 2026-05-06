export interface ProjectMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
  thumbnailDataUrl?: string;
  canvasBackgroundColor?: string;
  viewport: Viewport;
}

export interface Viewport {
  x: number;
  y: number;
  scale: number;
}

interface BaseLayer {
  id: string;
  projectId: string;
  type: 'image' | 'text' | 'shape';
  x: number;
  y: number;
  rotation: number;
  opacity: number;
  zIndex: number;
}

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ImageLayer extends BaseLayer {
  type: 'image';
  imageId: string;
  maskImageId?: string;
  tonalMode?: 'color' | 'grayscale';
  posterizeLevels?: number;
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
  flipX: boolean;
  flipY: boolean;
  crop?: CropRect;
}

export interface TextLayer extends BaseLayer {
  type: 'text';
  text: string;
  fontSize: number;
  fontFamily: string;
  bold: boolean;
  italic: boolean;
  fill: string;
  align: 'left' | 'center' | 'right';
  width: number;
  scaleX: number;
  scaleY: number;
}

export interface ShapeLayer extends BaseLayer {
  type: 'shape';
  shape: 'rectangle';
  width: number;
  height: number;
  stroke: string;
  strokeWidth: number;
  fill: string;
  scaleX: number;
  scaleY: number;
}

export type CanvasLayer = ImageLayer | TextLayer | ShapeLayer;
