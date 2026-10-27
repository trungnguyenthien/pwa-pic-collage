import type { CollageCell, CollageConfig } from '../../types';
import { CanvasManager } from '../../core/CanvasManager';
import { CollageEngine } from './CollageEngine';

export class CollageUI {
  private panelEl: HTMLElement;
  private canvasManager: CanvasManager;

  private config: CollageConfig = {
    rows: 2,
    cols: 2,
    margin: 24,
    gap: 16,
    radius: 16,
    aspectRatio: '1:1',
    bgColor: '#ffffff',
    bgType: 'solid',
  };

  private cells: CollageCell[] = [];
  private loadedImages: HTMLImageElement[] = [];

  private onApplyCallback?: () => void;

  constructor(panelEl: HTMLElement, canvasManager: CanvasManager) {
    this.panelEl = panelEl;
    this.canvasManager = canvasManager;
    this.initCells();
  }

  public activate(): void {
    // If main canvas already has an image and no images in collage yet, seed first image
    if (this.canvasManager.getHasImage() && this.loadedImages.length === 0) {
      const img = new Image();
      img.src = this.canvasManager.getCanvas().toDataURL();
      img.onload = () => {
        this.addImage(img);
      };
    }

    this.renderPanel();
    this.updatePreview();
  }

  public addImage(img: HTMLImageElement): void {
    this.loadedImages.push(img);
    this.assignImagesToCells();
    this.renderPanel();
    this.updatePreview();
  }

  public addImages(files: FileList | File[]): void {
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.src = e.target?.result as string;
        img.onload = () => {
          this.addImage(img);
        };
      };
      reader.readAsDataURL(file);
    });
  }

  public onApply(cb: () => void): void {
    this.onApplyCallback = cb;
  }

  private initCells(): void {
    const total = this.config.rows * this.config.cols;
    this.cells = [];
    for (let i = 0; i < total; i++) {
      this.cells.push({
        id: `cell_${i}`,
        image: null,
        offsetX: 0,
        offsetY: 0,
        zoom: 1,
        rotation: 0,
      });
    }
    this.assignImagesToCells();
  }

  private assignImagesToCells(): void {
    this.cells.forEach((cell, idx) => {
      cell.image = this.loadedImages[idx % this.loadedImages.length] || null;
    });
  }

  public updatePreview(): void {
    const rendered = CollageEngine.renderCollage(this.config, this.cells, 1400);

    const canvas = this.canvasManager.getCanvas();
    const ctx = this.canvasManager.getContext();

    canvas.width = rendered.width;
    canvas.height = rendered.height;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(rendered, 0, 0);

    this.canvasManager.fitToViewport();
  }

  private renderPanel(): void {
    this.panelEl.innerHTML = `
      <div class="tool-panel-header">
        <span class="tool-panel-title">Ghép Ảnh (Collage)</span>
        <button class="btn btn-tonal btn-sm" id="btnAddPhotoCollage">
          + Thêm ảnh
        </button>
        <input type="file" id="collageFileInput" multiple accept="image/*" class="hidden">
      </div>

      <!-- Quick Layout Presets -->
      <div>
        <label class="form-label" style="display:block; margin-bottom: 6px;">Bố Cục Lưới:</label>
        <div class="chip-group">
          <button class="chip btn-sm ${this.config.rows === 1 && this.config.cols === 2 ? 'active' : ''}" data-layout="1x2">1 × 2</button>
          <button class="chip btn-sm ${this.config.rows === 2 && this.config.cols === 1 ? 'active' : ''}" data-layout="2x1">2 × 1</button>
          <button class="chip btn-sm ${this.config.rows === 2 && this.config.cols === 2 ? 'active' : ''}" data-layout="2x2">2 × 2</button>
          <button class="chip btn-sm ${this.config.rows === 2 && this.config.cols === 3 ? 'active' : ''}" data-layout="2x3">2 × 3</button>
          <button class="chip btn-sm ${this.config.rows === 3 && this.config.cols === 2 ? 'active' : ''}" data-layout="3x2">3 × 2</button>
          <button class="chip btn-sm ${this.config.rows === 3 && this.config.cols === 3 ? 'active' : ''}" data-layout="3x3">3 × 3</button>
        </div>
      </div>

      <!-- Aspect Ratio Presets -->
      <div>
        <label class="form-label" style="display:block; margin-bottom: 6px;">Tỉ Lệ Khung:</label>
        <div class="chip-group">
          <button class="chip btn-sm ${this.config.aspectRatio === '1:1' ? 'active' : ''}" data-ratio="1:1">1:1 Vuông</button>
          <button class="chip btn-sm ${this.config.aspectRatio === '4:5' ? 'active' : ''}" data-ratio="4:5">4:5 Insta</button>
          <button class="chip btn-sm ${this.config.aspectRatio === '16:9' ? 'active' : ''}" data-ratio="16:9">16:9 Rộng</button>
          <button class="chip btn-sm ${this.config.aspectRatio === '9:16' ? 'active' : ''}" data-ratio="9:16">9:16 Story</button>
          <button class="chip btn-sm ${this.config.aspectRatio === '4:3' ? 'active' : ''}" data-ratio="4:3">4:3 Chuẩn</button>
        </div>
      </div>

      <!-- Sliders: Gap, Margin, Radius -->
      <div class="form-group">
        <div class="slider-container">
          <span style="font-size: 12px; width: 80px; font-weight: 600; color: var(--text-muted);">Rãnh cách:</span>
          <input type="range" class="slider-input" id="sliderGap" min="0" max="40" value="${this.config.gap}">
          <span class="slider-val tabular-nums" id="valGap">${this.config.gap}px</span>
        </div>
        <div class="slider-container">
          <span style="font-size: 12px; width: 80px; font-weight: 600; color: var(--text-muted);">Căn lề ngoài:</span>
          <input type="range" class="slider-input" id="sliderMargin" min="0" max="60" value="${this.config.margin}">
          <span class="slider-val tabular-nums" id="valMargin">${this.config.margin}px</span>
        </div>
        <div class="slider-container">
          <span style="font-size: 12px; width: 80px; font-weight: 600; color: var(--text-muted);">Bo tròn góc:</span>
          <input type="range" class="slider-input" id="sliderRadius" min="0" max="40" value="${this.config.radius}">
          <span class="slider-val tabular-nums" id="valRadius">${this.config.radius}px</span>
        </div>
      </div>

      <!-- Background Style -->
      <div>
        <label class="form-label" style="display:block; margin-bottom: 6px;">Màu Nền:</label>
        <div class="chip-group">
          <button class="chip btn-sm ${this.config.bgType === 'solid' && this.config.bgColor === '#ffffff' ? 'active' : ''}" data-bg="solid-#ffffff">Trắng</button>
          <button class="chip btn-sm ${this.config.bgType === 'solid' && this.config.bgColor === '#f8fafc' ? 'active' : ''}" data-bg="solid-#f8fafc">Xám nhạt</button>
          <button class="chip btn-sm ${this.config.bgType === 'solid' && this.config.bgColor === '#0f172a' ? 'active' : ''}" data-bg="solid-#0f172a">Đen</button>
          <button class="chip btn-sm ${this.config.bgType === 'solid' && this.config.bgColor === '#fef3c7' ? 'active' : ''}" data-bg="solid-#fef3c7">Kem</button>
          <button class="chip btn-sm ${this.config.bgType === 'gradient' ? 'active' : ''}" data-bg="gradient">Gradient</button>
          <button class="chip btn-sm ${this.config.bgType === 'transparent' ? 'active' : ''}" data-bg="transparent">Trong suốt</button>
        </div>
      </div>

      <!-- Action Bar -->
      <div class="tool-action-bar">
        <span style="font-size: 12px; color: var(--text-muted);">
          Đã nạp: <strong>${this.loadedImages.length}</strong> ảnh
        </span>
        <button class="btn btn-primary btn-sm" id="btnApplyCollage">
          Áp Dụng Ghép Ảnh
        </button>
      </div>
    `;

    this.bindEvents();
  }

  private bindEvents(): void {
    // Add photo
    const btnAddPhoto = this.panelEl.querySelector('#btnAddPhotoCollage') as HTMLButtonElement;
    const fileInput = this.panelEl.querySelector('#collageFileInput') as HTMLInputElement;

    btnAddPhoto.onclick = () => fileInput.click();
    fileInput.onchange = () => {
      if (fileInput.files && fileInput.files.length > 0) {
        this.addImages(fileInput.files);
        fileInput.value = '';
      }
    };

    // Layout presets
    this.panelEl.querySelectorAll('[data-layout]').forEach(el => {
      const btn = el as HTMLButtonElement;
      btn.onclick = () => {
        const [r, c] = (btn.dataset.layout || '2x2').split('x').map(Number);
        this.config.rows = r;
        this.config.cols = c;
        this.initCells();
        this.renderPanel();
        this.updatePreview();
      };
    });

    // Aspect ratio
    this.panelEl.querySelectorAll('[data-ratio]').forEach(el => {
      const btn = el as HTMLButtonElement;
      btn.onclick = () => {
        this.config.aspectRatio = (btn.dataset.ratio || '1:1') as any;
        this.renderPanel();
        this.updatePreview();
      };
    });

    // Sliders
    const sliderGap = this.panelEl.querySelector('#sliderGap') as HTMLInputElement;
    const valGap = this.panelEl.querySelector('#valGap') as HTMLElement;
    sliderGap.oninput = () => {
      this.config.gap = parseInt(sliderGap.value, 10);
      valGap.textContent = `${this.config.gap}px`;
      this.updatePreview();
    };

    const sliderMargin = this.panelEl.querySelector('#sliderMargin') as HTMLInputElement;
    const valMargin = this.panelEl.querySelector('#valMargin') as HTMLElement;
    sliderMargin.oninput = () => {
      this.config.margin = parseInt(sliderMargin.value, 10);
      valMargin.textContent = `${this.config.margin}px`;
      this.updatePreview();
    };

    const sliderRadius = this.panelEl.querySelector('#sliderRadius') as HTMLInputElement;
    const valRadius = this.panelEl.querySelector('#valRadius') as HTMLElement;
    sliderRadius.oninput = () => {
      this.config.radius = parseInt(sliderRadius.value, 10);
      valRadius.textContent = `${this.config.radius}px`;
      this.updatePreview();
    };

    // Backgrounds
    this.panelEl.querySelectorAll('[data-bg]').forEach(el => {
      const btn = el as HTMLButtonElement;
      btn.onclick = () => {
        const val = btn.dataset.bg || 'solid-#ffffff';
        if (val.startsWith('solid-')) {
          this.config.bgType = 'solid';
          this.config.bgColor = val.replace('solid-', '');
        } else if (val === 'gradient') {
          this.config.bgType = 'gradient';
        } else if (val === 'transparent') {
          this.config.bgType = 'transparent';
        }
        this.renderPanel();
        this.updatePreview();
      };
    });

    // Apply button
    const btnApply = this.panelEl.querySelector('#btnApplyCollage') as HTMLButtonElement;
    btnApply.onclick = () => {
      const canvas = this.canvasManager.getCanvas();
      const ctx = this.canvasManager.getContext();
      this.canvasManager.getHistory().pushState(ctx, canvas.width, canvas.height);
      if (this.onApplyCallback) this.onApplyCallback();
    };
  }
}
