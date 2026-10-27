import type { AspectRatioPreset, Rect } from '../../types';
import { CanvasManager } from '../../core/CanvasManager';
import { CropEngine } from './CropEngine';

export class CropUI {
  private container: HTMLElement;
  private canvasManager: CanvasManager;
  private cropBoxEl: HTMLElement | null = null;

  private currentPreset: AspectRatioPreset = 'free';
  private cropBox: Rect = { x: 0, y: 0, width: 0, height: 0 };
  private isDraggingBox: boolean = false;
  private dragStartX: number = 0;
  private dragStartY: number = 0;
  private initialCropBox: Rect = { x: 0, y: 0, width: 0, height: 0 };

  private onApplyCallback?: () => void;

  constructor(container: HTMLElement, canvasManager: CanvasManager) {
    this.container = container;
    this.canvasManager = canvasManager;

    this.canvasManager.onImageLoaded(() => {
      this.resetCropBox();
    });

    this.canvasManager.onTransform(() => {
      this.syncDOM();
    });
  }

  private isPointerEventsSetup: boolean = false;

  private cropBoxChangeCallbacks: Array<(percent: number) => void> = [];

  public activate(): void {
    this.canvasManager.setGesturesEnabled(false);
    this.container.classList.remove('hidden');
    this.render();
    this.resetCropBox();
    this.notifyCropBoxChange();
  }

  public deactivate(): void {
    this.canvasManager.setGesturesEnabled(true);
    this.container.classList.add('hidden');
    this.container.innerHTML = '';
    this.cropBoxEl = null;
    this.isDraggingBox = false;
  }

  public onCropBoxChange(cb: (percent: number) => void): void {
    this.cropBoxChangeCallbacks.push(cb);
  }

  private notifyCropBoxChange(): void {
    const pct = this.getFrameSizePercent();
    for (const cb of this.cropBoxChangeCallbacks) {
      cb(pct);
    }
  }

  public setPreset(preset: AspectRatioPreset): void {
    this.currentPreset = preset;
    const dims = this.canvasManager.getDimensions();
    this.cropBox = CropEngine.getDefaultCropBox(dims.width, dims.height, preset);
    this.syncDOM();
    this.notifyCropBoxChange();
  }

  public getCurrentPreset(): AspectRatioPreset {
    return this.currentPreset;
  }

  /**
   * Set crop frame size as percentage of the maximum possible box for current preset
   * @param percent Value between 15 and 100
   */
  public setFrameSizePercent(percent: number): void {
    const dims = this.canvasManager.getDimensions();
    if (dims.width <= 0 || dims.height <= 0) return;

    const clampedPercent = Math.max(15, Math.min(100, percent));
    const ratio = CropEngine.getAspectRatioValue(this.currentPreset);

    let maxW = dims.width;
    let maxH = dims.height;
    if (ratio) {
      maxH = maxW / ratio;
      if (maxH > dims.height) {
        maxH = dims.height;
        maxW = maxH * ratio;
      }
    }

    const scale = clampedPercent / 100;
    const newW = Math.max(50, Math.round(maxW * scale));
    const newH = Math.max(50, ratio ? Math.round(newW / ratio) : Math.round(maxH * scale));

    const curCenterX = this.cropBox.x + this.cropBox.width / 2;
    const curCenterY = this.cropBox.y + this.cropBox.height / 2;

    let newX = Math.round(curCenterX - newW / 2);
    let newY = Math.round(curCenterY - newH / 2);

    newX = Math.max(0, Math.min(dims.width - newW, newX));
    newY = Math.max(0, Math.min(dims.height - newH, newY));

    this.cropBox = {
      x: newX,
      y: newY,
      width: newW,
      height: newH,
    };
    this.syncDOM();
    this.notifyCropBoxChange();
  }

  /**
   * Get current crop frame size as percentage of maximum possible box
   */
  public getFrameSizePercent(): number {
    const dims = this.canvasManager.getDimensions();
    if (dims.width <= 0 || dims.height <= 0) return 85;

    const ratio = CropEngine.getAspectRatioValue(this.currentPreset);
    let maxW = dims.width;
    let maxH = dims.height;
    if (ratio) {
      maxH = maxW / ratio;
      if (maxH > dims.height) {
        maxH = dims.height;
        maxW = maxH * ratio;
      }
    }

    if (maxW <= 0) return 85;
    const pct = Math.round((this.cropBox.width / maxW) * 100);
    return Math.max(15, Math.min(100, pct));
  }

  /**
   * Increase or decrease crop frame size by button (maintained for fallback)
   */
  public resizeCropFrame(expand: boolean, percent: number = 0.1): void {
    const curPct = this.getFrameSizePercent();
    const targetPct = expand ? curPct + percent * 100 : curPct - percent * 100;
    this.setFrameSizePercent(targetPct);
  }

  /**
   * Reset crop frame to maximum fit within the image
   */
  public maximizeCropFrame(): void {
    this.setFrameSizePercent(100);
  }

  public rotate(angle: number): void {
    const canvas = this.canvasManager.getCanvas();
    const rotated = CropEngine.rotate(canvas, angle);
    this.replaceCanvasContent(rotated);
  }

  public flip(horizontal: boolean, vertical: boolean): void {
    const canvas = this.canvasManager.getCanvas();
    const flipped = CropEngine.flip(canvas, horizontal, vertical);
    this.replaceCanvasContent(flipped);
  }

  public applyCrop(): void {
    const canvas = this.canvasManager.getCanvas();
    const cropped = CropEngine.applyCrop(canvas, this.cropBox);
    this.replaceCanvasContent(cropped);
    if (this.onApplyCallback) this.onApplyCallback();
  }

  public onApply(cb: () => void): void {
    this.onApplyCallback = cb;
  }

  public getCropBox(): Rect {
    return { ...this.cropBox };
  }

  private resetCropBox(): void {
    const dims = this.canvasManager.getDimensions();
    this.cropBox = CropEngine.getDefaultCropBox(dims.width, dims.height, this.currentPreset);
    this.syncDOM();
    this.notifyCropBoxChange();
  }

  private replaceCanvasContent(newCanvas: HTMLCanvasElement): void {
    const canvas = this.canvasManager.getCanvas();
    const ctx = this.canvasManager.getContext();

    this.canvasManager.syncStageDimensions(newCanvas.width, newCanvas.height);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(newCanvas, 0, 0);

    this.canvasManager.getHistory().pushState(ctx, canvas.width, canvas.height);
    this.canvasManager.fitToViewport();
    this.resetCropBox();
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="crop-box" id="cropBox">
        <div class="crop-grid">
          <div class="crop-grid-line"></div>
          <div class="crop-grid-line"></div>
          <div></div>
          <div class="crop-grid-line"></div>
          <div class="crop-grid-line"></div>
          <div></div>
          <div class="crop-grid-line"></div>
          <div class="crop-grid-line"></div>
          <div></div>
        </div>
        <div class="crop-corner crop-corner-tl"></div>
        <div class="crop-corner crop-corner-tr"></div>
        <div class="crop-corner crop-corner-bl"></div>
        <div class="crop-corner crop-corner-br"></div>
      </div>
    `;

    this.cropBoxEl = this.container.querySelector('#cropBox');
    this.setupPointerEvents();
    this.syncDOM();
  }

  private syncDOM(): void {
    if (!this.cropBoxEl) return;
    if (this.cropBox.width === 0 || this.cropBox.height === 0) {
      const dims = this.canvasManager.getDimensions();
      if (dims.width > 0 && dims.height > 0) {
        this.cropBox = CropEngine.getDefaultCropBox(dims.width, dims.height, this.currentPreset);
      }
    }
    this.cropBoxEl.style.left = `${this.cropBox.x}px`;
    this.cropBoxEl.style.top = `${this.cropBox.y}px`;
    this.cropBoxEl.style.width = `${this.cropBox.width}px`;
    this.cropBoxEl.style.height = `${this.cropBox.height}px`;
  }

  private setupPointerEvents(): void {
    if (this.isPointerEventsSetup) return;
    this.isPointerEventsSetup = true;

    // Pan gesture: Drag anywhere inside the crop box to move it
    this.container.addEventListener('pointerdown', (e) => {
      const target = e.target as HTMLElement;

      if (target === this.cropBoxEl || this.cropBoxEl?.contains(target)) {
        e.preventDefault();
        e.stopPropagation();
        this.isDraggingBox = true;
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;
        this.initialCropBox = { ...this.cropBox };
        this.cropBoxEl?.setPointerCapture(e.pointerId);
      }
    });

    const onPointerMove = (e: PointerEvent) => {
      if (!this.isDraggingBox) return;
      const transform = this.canvasManager.getTransform();
      const dims = this.canvasManager.getDimensions();

      // Delta in canvas pixel space
      const dx = (e.clientX - this.dragStartX) / transform.scale;
      const dy = (e.clientY - this.dragStartY) / transform.scale;

      let nx = this.initialCropBox.x + dx;
      let ny = this.initialCropBox.y + dy;

      nx = Math.max(0, Math.min(dims.width - this.initialCropBox.width, nx));
      ny = Math.max(0, Math.min(dims.height - this.initialCropBox.height, ny));

      this.cropBox.x = Math.round(nx);
      this.cropBox.y = Math.round(ny);
      this.syncDOM();
    };

    const onPointerUp = () => {
      this.isDraggingBox = false;
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  }
}
