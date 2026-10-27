import type { AspectRatioPreset, Rect } from '../../types';
import { CanvasManager } from '../../core/CanvasManager';
import { CropEngine } from './CropEngine';

export class CropUI {
  private container: HTMLElement;
  private canvasManager: CanvasManager;
  private cropBoxEl: HTMLElement | null = null;

  private currentPreset: AspectRatioPreset = 'free';
  private cropBox: Rect = { x: 0, y: 0, width: 0, height: 0 };
  private activeHandle: string | null = null;
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
    this.container.classList.remove('hidden');
    this.render();
    this.resetCropBox();
  }

  public deactivate(): void {
    this.container.classList.add('hidden');
    this.container.innerHTML = '';
    this.cropBoxEl = null;
    this.activeHandle = null;
    this.isDraggingBox = false;
  }

  public setPreset(preset: AspectRatioPreset): void {
    this.currentPreset = preset;
    const dims = this.canvasManager.getDimensions();
    this.cropBox = CropEngine.getDefaultCropBox(dims.width, dims.height, preset);
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
        <div class="crop-handle crop-handle-tl" data-handle="tl"></div>
        <div class="crop-handle crop-handle-tc" data-handle="tc"></div>
        <div class="crop-handle crop-handle-tr" data-handle="tr"></div>
        <div class="crop-handle crop-handle-ml" data-handle="ml"></div>
        <div class="crop-handle crop-handle-mr" data-handle="mr"></div>
        <div class="crop-handle crop-handle-bl" data-handle="bl"></div>
        <div class="crop-handle crop-handle-bc" data-handle="bc"></div>
        <div class="crop-handle crop-handle-br" data-handle="br"></div>
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

    // Handle drag on handles or body
    this.container.addEventListener('pointerdown', (e) => {
      const target = e.target as HTMLElement;
      const handle = target.dataset.handle;

      if (handle) {
        e.preventDefault();
        e.stopPropagation();
        this.activeHandle = handle;
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;
        this.initialCropBox = { ...this.cropBox };
        target.setPointerCapture(e.pointerId);
      } else if (target === this.cropBoxEl || this.cropBoxEl?.contains(target)) {
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
      if (!this.activeHandle && !this.isDraggingBox) return;
      const transform = this.canvasManager.getTransform();
      const dims = this.canvasManager.getDimensions();

      // Delta in canvas pixel space
      const dx = (e.clientX - this.dragStartX) / transform.scale;
      const dy = (e.clientY - this.dragStartY) / transform.scale;

      if (this.isDraggingBox) {
        let nx = this.initialCropBox.x + dx;
        let ny = this.initialCropBox.y + dy;

        nx = Math.max(0, Math.min(dims.width - this.initialCropBox.width, nx));
        ny = Math.max(0, Math.min(dims.height - this.initialCropBox.height, ny));

        this.cropBox.x = Math.round(nx);
        this.cropBox.y = Math.round(ny);
        this.syncDOM();
        return;
      }

      if (this.activeHandle) {
        this.handleResize(this.activeHandle, dx, dy, dims.width, dims.height);
        this.syncDOM();
      }
    };

    const onPointerUp = () => {
      this.activeHandle = null;
      this.isDraggingBox = false;
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  }

  private handleResize(
    handle: string,
    dx: number,
    dy: number,
    maxWidth: number,
    maxHeight: number
  ): void {
    const initial = this.initialCropBox;
    const ratio = CropEngine.getAspectRatioValue(this.currentPreset);

    let x = initial.x;
    let y = initial.y;
    let w = initial.width;
    let h = initial.height;

    const minSize = 20;

    if (handle.includes('r')) {
      w = Math.max(minSize, initial.width + dx);
    }
    if (handle.includes('l')) {
      const newW = Math.max(minSize, initial.width - dx);
      x = initial.x + (initial.width - newW);
      w = newW;
    }
    if (handle.includes('b')) {
      h = Math.max(minSize, initial.height + dy);
    }
    if (handle.includes('t')) {
      const newH = Math.max(minSize, initial.height - dy);
      y = initial.y + (initial.height - newH);
      h = newH;
    }

    // Lock aspect ratio if required
    if (ratio) {
      if (handle === 'tc' || handle === 'bc') {
        w = h * ratio;
        x = initial.x + (initial.width - w) / 2;
      } else if (handle === 'ml' || handle === 'mr') {
        h = w / ratio;
        y = initial.y + (initial.height - h) / 2;
      } else {
        // Corner handles: sync height to width
        h = w / ratio;
        if (handle.includes('t')) {
          y = initial.y + initial.height - h;
        }
      }
    }

    // Clamp inside image bounds
    if (x < 0) { w += x; x = 0; }
    if (y < 0) { h += y; y = 0; }
    if (x + w > maxWidth) { w = maxWidth - x; }
    if (y + h > maxHeight) { h = maxHeight - y; }

    this.cropBox = {
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(w),
      height: Math.round(h),
    };
  }
}
