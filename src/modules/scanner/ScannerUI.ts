import type { Point, Quadrilateral, ScannerFilterType, ScannerOutputPreset } from '../../types';
import { CanvasManager } from '../../core/CanvasManager';
import { PerspectiveWarp } from './PerspectiveWarp';
import { DocumentFilter } from './DocumentFilter';

export class ScannerUI {
  private container: HTMLElement;
  private canvasManager: CanvasManager;

  private quad: Quadrilateral = {
    tl: { x: 0, y: 0 },
    tr: { x: 0, y: 0 },
    br: { x: 0, y: 0 },
    bl: { x: 0, y: 0 },
  };

  private currentPreset: ScannerOutputPreset = 'auto';
  private currentFilter: ScannerFilterType = 'original';
  private activePin: keyof Quadrilateral | null = null;

  // Magnifier Loupe elements
  private loupeEl: HTMLElement | null = null;
  private loupeCanvas: HTMLCanvasElement | null = null;
  private loupeCtx: CanvasRenderingContext2D | null = null;
  private svgPolygonEl: SVGPolygonElement | null = null;

  private onApplyCallback?: () => void;

  constructor(container: HTMLElement, canvasManager: CanvasManager) {
    this.container = container;
    this.canvasManager = canvasManager;

    this.canvasManager.onImageLoaded(() => {
      this.resetQuad();
    });

    this.canvasManager.onTransform(() => {
      this.syncDOM();
    });
  }

  private isPointerEventsSetup: boolean = false;

  public activate(): void {
    this.container.classList.remove('hidden');
    this.render();
    this.resetQuad();
  }

  public deactivate(): void {
    this.container.classList.add('hidden');
    this.container.innerHTML = '';
    this.activePin = null;
  }

  public setPreset(preset: ScannerOutputPreset): void {
    this.currentPreset = preset;
  }

  public setFilter(filter: ScannerFilterType): void {
    this.currentFilter = filter;
  }

  public resetQuad(): void {
    const dims = this.canvasManager.getDimensions();
    const marginX = dims.width * 0.1;
    const marginY = dims.height * 0.1;

    this.quad = {
      tl: { x: Math.round(marginX), y: Math.round(marginY) },
      tr: { x: Math.round(dims.width - marginX), y: Math.round(marginY) },
      br: { x: Math.round(dims.width - marginX), y: Math.round(dims.height - marginY) },
      bl: { x: Math.round(marginX), y: Math.round(dims.height - marginY) },
    };

    this.syncDOM();
  }

  public applyWarp(): void {
    const sourceCanvas = this.canvasManager.getCanvas();
    const dims = this.canvasManager.getDimensions();

    const targetDims = PerspectiveWarp.calculateTargetDimensions(
      this.quad,
      this.currentPreset,
      dims.width,
      dims.height
    );

    // 1. Perspective Transform
    let warped = PerspectiveWarp.warpPerspective(
      sourceCanvas,
      this.quad,
      targetDims.width,
      targetDims.height
    );

    // 2. Document Enhancement Filter
    if (this.currentFilter !== 'original') {
      warped = DocumentFilter.applyFilter(warped, this.currentFilter);
    }

    // 3. Put back onto main canvas
    const canvas = this.canvasManager.getCanvas();
    const ctx = this.canvasManager.getContext();

    this.canvasManager.syncStageDimensions(warped.width, warped.height);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(warped, 0, 0);

    this.canvasManager.getHistory().pushState(ctx, canvas.width, canvas.height);
    this.canvasManager.fitToViewport();
    this.resetQuad();

    if (this.onApplyCallback) this.onApplyCallback();
  }

  public onApply(cb: () => void): void {
    this.onApplyCallback = cb;
  }

  private render(): void {
    this.container.innerHTML = `
      <svg class="scanner-svg" id="scannerSvg">
        <polygon class="scanner-quad" id="scannerPolygon" points="0,0 0,0 0,0 0,0" />
      </svg>
      <div class="scanner-pin" data-pin="tl" id="pinTL"><div class="scanner-pin-dot"></div></div>
      <div class="scanner-pin" data-pin="tr" id="pinTR"><div class="scanner-pin-dot"></div></div>
      <div class="scanner-pin" data-pin="br" id="pinBR"><div class="scanner-pin-dot"></div></div>
      <div class="scanner-pin" data-pin="bl" id="pinBL"><div class="scanner-pin-dot"></div></div>

      <!-- Magnifier Loupe -->
      <div class="magnifier-loupe" id="scannerLoupe">
        <canvas class="magnifier-canvas" id="scannerLoupeCanvas" width="120" height="120"></canvas>
        <div class="magnifier-crosshair"></div>
      </div>
    `;

    this.svgPolygonEl = this.container.querySelector('#scannerPolygon');
    this.loupeEl = this.container.querySelector('#scannerLoupe');
    this.loupeCanvas = this.container.querySelector('#scannerLoupeCanvas');
    if (this.loupeCanvas) {
      this.loupeCtx = this.loupeCanvas.getContext('2d', { willReadFrequently: true });
    }

    this.setupPointerEvents();
    this.syncDOM();
  }

  private syncDOM(): void {
    const pinTL = this.container.querySelector('#pinTL') as HTMLElement | null;
    const pinTR = this.container.querySelector('#pinTR') as HTMLElement | null;
    const pinBR = this.container.querySelector('#pinBR') as HTMLElement | null;
    const pinBL = this.container.querySelector('#pinBL') as HTMLElement | null;

    if (pinTL) { pinTL.style.left = `${this.quad.tl.x}px`; pinTL.style.top = `${this.quad.tl.y}px`; }
    if (pinTR) { pinTR.style.left = `${this.quad.tr.x}px`; pinTR.style.top = `${this.quad.tr.y}px`; }
    if (pinBR) { pinBR.style.left = `${this.quad.br.x}px`; pinBR.style.top = `${this.quad.br.y}px`; }
    if (pinBL) { pinBL.style.left = `${this.quad.bl.x}px`; pinBL.style.top = `${this.quad.bl.y}px`; }

    if (this.svgPolygonEl) {
      const pointsStr = `${this.quad.tl.x},${this.quad.tl.y} ${this.quad.tr.x},${this.quad.tr.y} ${this.quad.br.x},${this.quad.br.y} ${this.quad.bl.x},${this.quad.bl.y}`;
      this.svgPolygonEl.setAttribute('points', pointsStr);
    }
  }

  private setupPointerEvents(): void {
    if (this.isPointerEventsSetup) return;
    this.isPointerEventsSetup = true;

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      const pinKey = target.closest('.scanner-pin')?.getAttribute('data-pin') as keyof Quadrilateral | null;
      if (!pinKey) return;

      e.preventDefault();
      e.stopPropagation();
      this.activePin = pinKey;
      target.setPointerCapture(e.pointerId);

      this.showLoupe(this.quad[pinKey]);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!this.activePin) return;

      const transform = this.canvasManager.getTransform();
      const dims = this.canvasManager.getDimensions();
      const stageRect = this.container.getBoundingClientRect();

      // Convert client coordinates to stage canvas pixel coordinates
      const stageX = (e.clientX - stageRect.left) / transform.scale;
      const stageY = (e.clientY - stageRect.top) / transform.scale;

      const clampedX = Math.max(0, Math.min(dims.width, Math.round(stageX)));
      const clampedY = Math.max(0, Math.min(dims.height, Math.round(stageY)));

      this.quad[this.activePin] = { x: clampedX, y: clampedY };
      this.syncDOM();

      this.showLoupe({ x: clampedX, y: clampedY });
    };

    const onPointerUp = () => {
      this.activePin = null;
      this.hideLoupe();
    };

    this.container.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  }

  private showLoupe(canvasPoint: Point): void {
    if (!this.loupeEl || !this.loupeCtx || !this.loupeCanvas) return;

    // Position loupe offset above finger by 80px
    const transform = this.canvasManager.getTransform();

    // Position relative to stage container
    const posX = canvasPoint.x;
    const posY = canvasPoint.y - (80 / transform.scale);

    this.loupeEl.style.left = `${posX}px`;
    this.loupeEl.style.top = `${posY}px`;
    this.loupeEl.classList.add('active');

    // Draw zoomed 2.5x view onto loupe canvas
    const srcCanvas = this.canvasManager.getCanvas();
    const zoomSize = 48; // Capture 48x48 region around pin
    const half = zoomSize / 2;

    this.loupeCtx.clearRect(0, 0, this.loupeCanvas.width, this.loupeCanvas.height);
    this.loupeCtx.imageSmoothingEnabled = false; // Pixelate for accuracy

    this.loupeCtx.drawImage(
      srcCanvas,
      canvasPoint.x - half,
      canvasPoint.y - half,
      zoomSize,
      zoomSize,
      0,
      0,
      this.loupeCanvas.width,
      this.loupeCanvas.height
    );
  }

  private hideLoupe(): void {
    if (this.loupeEl) {
      this.loupeEl.classList.remove('active');
    }
  }
}
