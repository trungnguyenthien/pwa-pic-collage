export type ToolTab = 'crop' | 'resize' | 'scanner' | 'collage';

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type AspectRatioPreset = 'free' | '1:1' | '4:3' | '3:4' | '16:9' | '9:16' | '2:3' | '3:2' | 'A4';

export interface CropState {
  box: Rect;
  aspectRatio: AspectRatioPreset;
  rotation: number; // 0, 90, 180, 270
  flipH: boolean;
  flipV: boolean;
}

export interface ResizeState {
  mode: 'percent' | 'dimensions';
  percent: number;
  width: number;
  height: number;
  maintainAspectRatio: boolean;
  maxDimension?: number;
}

export type ScannerOutputPreset = 'auto' | 'a4-portrait' | 'a4-landscape' | 'id-card' | 'receipt' | 'source';
export type ScannerFilterType = 'original' | 'magic-scan' | 'grayscale';

export interface Quadrilateral {
  tl: Point; // Top-Left
  tr: Point; // Top-Right
  br: Point; // Bottom-Right
  bl: Point; // Bottom-Left
}

export interface CollageCell {
  id: string;
  image: HTMLImageElement | null;
  offsetX: number;
  offsetY: number;
  zoom: number;
  rotation: number;
}

export interface CollageConfig {
  rows: number;
  cols: number;
  margin: number;
  gap: number;
  radius: number;
  aspectRatio: '1:1' | '4:5' | '16:9' | '9:16' | '4:3';
  bgColor: string;
  bgType: 'solid' | 'gradient' | 'transparent';
}

export interface ExportOptions {
  format: 'image/webp' | 'image/jpeg' | 'image/png';
  quality: number; // 0.1 to 1.0
  fileName?: string;
}

export interface QueueItem {
  id: string;
  name: string;
  canvas: HTMLCanvasElement;
  thumbnailUrl: string;
  isModified: boolean;
}

