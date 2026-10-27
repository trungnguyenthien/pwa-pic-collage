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

  public activate(): void {
    this.canvasManager.setGesturesEnabled(false);
    this.container.classList.remove('hidden');
    this.render();
    this.resetCropBox();
  }

  public deactivate(): void {
    this.canvasManager.setGesturesEnabled(true);
    this.container.classList.add('hidden');
    this.container.innerHTML = '';
    this.cropBoxEl = null;
    this.isDraggingBox = false;
  }

  public setPreset(preset: AspectRatioPreset): void {
    this.currentPreset = preset;
    const dims = this.canvasManager.getDimensions();
    this.cropBox = CropEngine.getDefaultCropBox(dims.width, dims.height, preset);
    this.syncDOM();
  }

  /**
   * Increase or decrease crop frame size by button
   */
  public resizeCropFrame(expand: boolean, percent: number = 0.1): void {
    const dims = this.canvasManager.getDimensions();
    const ratio = CropEngine.getAspectRatioValue(this.currentPreset);

    const deltaW = Math.max(30, Math.round(dims.width * percent));
    let newW = expand ? this.cropBox.width + deltaW : this.cropBox.width - deltaW;
    let newH = ratio ? newW / ratio : (expand ? this.cropBox.height + Math.max(30, Math.round(dims.height * percent)) : this.cropBox.height - Math.max(30, Math.round(dims.height * percent)));

    const minSize = 50;
    if (newW < minSize) {
      newW = minSize;
      if (ratio) newH = newW / ratio;
    }
    if (newH < minSize) {
      newH = minSize;
      if (ratio) newW = newH * ratio;
    }

    if (newW > dims.width) {
      newW = dims.width;
      if (ratio) newH = newW / ratio;
    }
    if (newH > dims.height) {
      newH = dims.height;
      if (ratio) newW = newH * ratio;
    }

    // Keep crop box centered around current center
    const curCenterX = this.cropBox.x + this.cropBox.width / 2;
    const curCenterY = this.cropBox.y + this.cropBox.height / 2;

    let newX = Math.round(curCenterX - newW / 2);
    let newY = Math.round(curCenterY - newH / 2);

    newX = Math.max(0, Math.min(dims.width - Math.round(newW), newX));
    newY = Math.max(0, Math.min(dims.height - Math.round(newH), newY));

    this.cropBox = {
      x: newX,
      y: newY,
      width: Math.round(newW),
      height: Math.round(newH),
    };
    this.syncDOM();
  }

  /**
   * Reset crop frame to maximum fit within the image
   */
  public maximizeCropFrame(): void {
    const dims = this.canvasManager.getDimensions();
    this.cropBox = CropEngine.getDefaultCropBox(dims.width, dims.height, this.currentPreset);
    this.syncDOM();
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
