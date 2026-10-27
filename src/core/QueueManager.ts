import type { QueueItem } from '../types';

export class QueueManager {
  private items: QueueItem[] = [];
  private activeIndex: number = -1;
  private onChangeCallbacks: ((items: QueueItem[], activeIndex: number) => void)[] = [];

  public getItems(): QueueItem[] {
    return [...this.items];
  }

  public getActiveIndex(): number {
    return this.activeIndex;
  }

  public getActiveItem(): QueueItem | null {
    if (this.activeIndex >= 0 && this.activeIndex < this.items.length) {
      return this.items[this.activeIndex];
    }
    return null;
  }

  public async addFiles(files: FileList | File[]): Promise<void> {
    const fileArray = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (fileArray.length === 0) return;

    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      await this.loadFile(file);
    }

    if (this.activeIndex === -1 && this.items.length > 0) {
      this.activeIndex = 0;
    }
    this.notify();
  }

  public async addImage(img: HTMLImageElement, name: string = 'Ảnh'): Promise<QueueItem> {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(img, 0, 0);
    }

    const thumb = this.generateThumbnail(canvas);
    const item: QueueItem = {
      id: `queue_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name,
      canvas,
      thumbnailUrl: thumb,
      isModified: false,
    };

    this.items.push(item);
    if (this.activeIndex === -1) {
      this.activeIndex = 0;
    }
    this.notify();
    return item;
  }

  public selectItem(index: number): QueueItem | null {
    if (index >= 0 && index < this.items.length) {
      this.activeIndex = index;
      this.notify();
      return this.items[index];
    }
    return null;
  }

  public next(): QueueItem | null {
    if (this.items.length === 0) return null;
    const nextIdx = (this.activeIndex + 1) % this.items.length;
    return this.selectItem(nextIdx);
  }

  public prev(): QueueItem | null {
    if (this.items.length === 0) return null;
    const prevIdx = (this.activeIndex - 1 + this.items.length) % this.items.length;
    return this.selectItem(prevIdx);
  }

  public updateActiveCanvas(newCanvas: HTMLCanvasElement): void {
    const item = this.getActiveItem();
    if (!item) return;

    // Clone into item's canvas
    const cloned = document.createElement('canvas');
    cloned.width = newCanvas.width;
    cloned.height = newCanvas.height;
    const ctx = cloned.getContext('2d');
    if (ctx) {
      ctx.drawImage(newCanvas, 0, 0);
    }

    item.canvas = cloned;
    item.thumbnailUrl = this.generateThumbnail(cloned);
    item.isModified = true;
    this.notify();
  }

  public removeItem(index: number): boolean {
    if (index < 0 || index >= this.items.length) return false;

    this.items.splice(index, 1);
    if (this.items.length === 0) {
      this.activeIndex = -1;
    } else if (this.activeIndex >= this.items.length) {
      this.activeIndex = this.items.length - 1;
    }
    this.notify();
    return true;
  }

  public clear(): void {
    this.items = [];
    this.activeIndex = -1;
    this.notify();
  }

  public onChange(cb: (items: QueueItem[], activeIndex: number) => void): void {
    this.onChangeCallbacks.push(cb);
    cb(this.items, this.activeIndex);
  }

  private notify(): void {
    this.onChangeCallbacks.forEach(cb => cb(this.items, this.activeIndex));
  }

  private generateThumbnail(sourceCanvas: HTMLCanvasElement): string {
    const thumbCanvas = document.createElement('canvas');
    const size = 180;
    thumbCanvas.width = size;
    thumbCanvas.height = size;
    const ctx = thumbCanvas.getContext('2d');
    if (!ctx) return '';

    // Center-crop (cover) so photo fills the slide card without letterboxing
    const scale = Math.max(size / sourceCanvas.width, size / sourceCanvas.height);
    const sw = size / scale;
    const sh = size / scale;
    const sx = (sourceCanvas.width - sw) / 2;
    const sy = (sourceCanvas.height - sh) / 2;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, size, size);
    return thumbCanvas.toDataURL('image/jpeg', 0.85);
  }

  private loadFile(file: File): Promise<void> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.src = e.target?.result as string;
        img.onload = () => {
          this.addImage(img, file.name);
          resolve();
        };
        img.onerror = () => resolve();
      };
      reader.onerror = () => resolve();
      reader.readAsDataURL(file);
    });
  }
}
