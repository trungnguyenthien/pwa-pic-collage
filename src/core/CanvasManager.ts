import { HistoryManager } from './HistoryManager';

export class CanvasManager {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private stageEl: HTMLElement;
  private viewportEl: HTMLElement;
  private history: HistoryManager;

  // Viewport transforms (Pan & Zoom)
  private scale: number = 1;
  private panX: number = 0;
  private panY: number = 0;

  // Image source state
  private hasImage: boolean = false;
  private originalWidth: number = 0;
  private originalHeight: number = 0;
  private onImageLoadedCallbacks: ((w: number, h: number) => void)[] = [];
  private onTransformCallbacks: (() => void)[] = [];

  constructor(
    canvas: HTMLCanvasElement,
    stageEl: HTMLElement,
    viewportEl: HTMLElement,
    history: HistoryManager
  ) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Could not get 2D canvas context');
    this.ctx = ctx;
    this.stageEl = stageEl;
    this.viewportEl = viewportEl;
    this.history = history;

    this.setupViewportEvents();
  }

  public getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  public getContext(): CanvasRenderingContext2D {
    return this.ctx;
  }

  public getHistory(): HistoryManager {
    return this.history;
  }

  public getDimensions(): { width: number; height: number } {
    return { width: this.canvas.width, height: this.canvas.height };
  }

  public getTransform(): { scale: number; panX: number; panY: number } {
    return { scale: this.scale, panX: this.panX, panY: this.panY };
  }

  public getHasImage(): boolean {
    return this.hasImage;
  }

  public syncStageDimensions(width: number, height: number): void {
    if (this.canvas.width !== width) {
      this.canvas.width = width;
    }
    if (this.canvas.height !== height) {
      this.canvas.height = height;
    }
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.stageEl.style.width = `${width}px`;
    this.stageEl.style.height = `${height}px`;
  }

  public loadFromCanvas(sourceCanvas: HTMLCanvasElement): void {
    this.originalWidth = sourceCanvas.width;
    this.originalHeight = sourceCanvas.height;

    this.syncStageDimensions(this.originalWidth, this.originalHeight);

    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.drawImage(sourceCanvas, 0, 0);

    this.hasImage = true;
    this.history.clear();
    this.history.pushState(this.ctx, this.canvas.width, this.canvas.height);

    this.fitToViewport();
    this.notifyImageLoaded(this.originalWidth, this.originalHeight);
  }

  public async loadImage(src: string | File): Promise<void> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        this.originalWidth = img.naturalWidth;
        this.originalHeight = img.naturalHeight;

        this.syncStageDimensions(this.originalWidth, this.originalHeight);

        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = 'high';
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.drawImage(img, 0, 0);

        this.hasImage = true;
        this.history.clear();
        this.history.pushState(this.ctx, this.canvas.width, this.canvas.height);

        this.fitToViewport();
        this.notifyImageLoaded(this.originalWidth, this.originalHeight);
        resolve();
      };
      img.onerror = (e) => reject(e);

      if (typeof src === 'string') {
        img.src = src;
      } else {
        img.src = URL.createObjectURL(src);
      }
    });
  }

  public fitToViewport(): void {
    if (!this.hasImage || this.canvas.width === 0 || this.canvas.height === 0) return;

    const viewportRect = this.viewportEl.getBoundingClientRect();
    const paddingX = 16;
    const barHeight = 46;
    const paddingY = barHeight + 8;
    const availW = Math.max(100, (viewportRect.width || window.innerWidth) - paddingX * 2);
    const availH = Math.max(100, (viewportRect.height || window.innerHeight) - paddingY * 2);

    const scaleW = availW / this.canvas.width;
    const scaleH = availH / this.canvas.height;
    // Always fit frame immediately: scale up or down to maximize available display area
    this.scale = Math.min(scaleW, scaleH);

    this.panX = 0;
    this.panY = 0;
    this.applyTransform();
  }

  private gesturesEnabled: boolean = true;

  public setGesturesEnabled(enabled: boolean): void {
    this.gesturesEnabled = enabled;
  }

  public getGesturesEnabled(): boolean {
    return this.gesturesEnabled;
  }

  public applyTransform(): void {
    this.stageEl.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.scale})`;
    this.notifyTransform();
  }

  public zoom(delta: number, centerX?: number, centerY?: number): void {
    const oldScale = this.scale;
    const newScale = Math.min(5, Math.max(0.1, oldScale + delta));
    if (newScale === oldScale) return;

    if (centerX !== undefined && centerY !== undefined) {
      // Zoom centered at pointer position
      const factor = newScale / oldScale;
      this.panX = centerX - (centerX - this.panX) * factor;
      this.panY = centerY - (centerY - this.panY) * factor;
    }

    this.scale = newScale;
    this.applyTransform();
  }

  /**
   * Zoom image in by 20%
   */
  public zoomIn(factor: number = 1.2): void {
    if (!this.hasImage) return;
    this.scale = Math.min(5, +(this.scale * factor).toFixed(4));
    this.applyTransform();
  }

  /**
   * Zoom image out by 20%
   */
  public zoomOut(factor: number = 1.2): void {
    if (!this.hasImage) return;
    this.scale = Math.max(0.1, +(this.scale / factor).toFixed(4));
    this.applyTransform();
  }

  /**
   * Pan image by 10% of displayed size, minimum 50px
   */
  public panByDirection(dir: 'up' | 'down' | 'left' | 'right'): void {
    if (!this.hasImage) return;
    const stepX = Math.max(50, Math.round(this.canvas.width * this.scale * 0.1));
    const stepY = Math.max(50, Math.round(this.canvas.height * this.scale * 0.1));

    switch (dir) {
      case 'left':
        this.panX -= stepX;
        break;
      case 'right':
        this.panX += stepX;
        break;
      case 'up':
        this.panY -= stepY;
        break;
      case 'down':
        this.panY += stepY;
        break;
    }
    this.applyTransform();
  }

  public resetPan(): void {
    this.panX = 0;
    this.panY = 0;
    this.applyTransform();
  }

  public setPan(x: number, y: number): void {
    this.panX = x;
    this.panY = y;
    this.applyTransform();
  }

  private setupViewportEvents(): void {
    // Wheel Zoom (only if gestures are enabled)
    this.viewportEl.addEventListener('wheel', (e) => {
      if (!this.gesturesEnabled) return;
      if (e.target !== this.viewportEl && !this.stageEl.contains(e.target as Node)) return;
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.08 : -0.08;
      this.zoom(delta, e.clientX, e.clientY);
    }, { passive: false });

    // Touch Pinch-to-zoom (only if gestures are enabled)
    let initialDistance = 0;
    let initialScale = 1;

    this.viewportEl.addEventListener('touchstart', (e) => {
      if (!this.gesturesEnabled) return;
      if (e.touches.length === 2) {
        e.preventDefault();
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        initialDistance = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        initialScale = this.scale;
      }
    }, { passive: false });

    this.viewportEl.addEventListener('touchmove', (e) => {
      if (!this.gesturesEnabled) return;
      if (e.touches.length === 2) {
        e.preventDefault();
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        if (initialDistance > 0) {
          const ratio = dist / initialDistance;
          this.scale = Math.min(5, Math.max(0.1, initialScale * ratio));
          this.applyTransform();
        }
      }
    }, { passive: false });

    // Auto-refit on container resize (orientation change, window resize)
    if (typeof ResizeObserver !== 'undefined') {
      let resizeTimer: any = null;
      const ro = new ResizeObserver(() => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          if (this.hasImage) {
            this.fitToViewport();
          }
        }, 100);
      });
      ro.observe(this.viewportEl);
    } else {
      window.addEventListener('resize', () => {
        if (this.hasImage) {
          this.fitToViewport();
        }
      });
    }
  }

  public onImageLoaded(cb: (w: number, h: number) => void): void {
    this.onImageLoadedCallbacks.push(cb);
  }

  public onTransform(cb: () => void): void {
    this.onTransformCallbacks.push(cb);
  }

  private notifyImageLoaded(w: number, h: number): void {
    this.onImageLoadedCallbacks.forEach(cb => cb(w, h));
  }

  private notifyTransform(): void {
    this.onTransformCallbacks.forEach(cb => cb());
  }
}
