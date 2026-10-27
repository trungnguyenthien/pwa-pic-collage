import { CanvasManager } from '../../core/CanvasManager';
import { ResizeEngine } from './ResizeEngine';

export class ResizeUI {
  private panelEl: HTMLElement;
  private canvasManager: CanvasManager;

  private currentPercent: number = 100;
  private targetWidth: number = 0;
  private targetHeight: number = 0;
  private maintainAspectRatio: boolean = true;

  private onApplyCallback?: () => void;

  constructor(panelEl: HTMLElement, canvasManager: CanvasManager) {
    this.panelEl = panelEl;
    this.canvasManager = canvasManager;

    this.canvasManager.onImageLoaded((w, h) => {
      this.targetWidth = w;
      this.targetHeight = h;
      this.currentPercent = 100;
      this.syncUI();
    });
  }

  public activate(): void {
    const dims = this.canvasManager.getDimensions();
    this.targetWidth = dims.width;
    this.targetHeight = dims.height;
    this.currentPercent = 100;
    this.render();
    this.syncUI();
  }

  public onApply(cb: () => void): void {
    this.onApplyCallback = cb;
  }

  private render(): void {
    const dims = this.canvasManager.getDimensions();
    this.panelEl.innerHTML = `
      <div class="tool-panel-header">
        <span class="tool-panel-title">Đổi Kích Thước (Resize)</span>
        <span class="tabular-nums" style="font-size: 12px; color: var(--text-muted);" id="originalDimTag">
          Gốc: ${dims.width} × ${dims.height} px
        </span>
      </div>

      <!-- Mode Selector Tabs -->
      <div class="chip-group">
        <button class="chip active" id="btnModePercent">Phần trăm (%)</button>
        <button class="chip" id="btnModeDimensions">Kích thước Pixel (W × H)</button>
      </div>

      <!-- Percent Controls View -->
      <div id="percentControlsView" class="form-group">
        <div class="slider-container">
          <input type="range" class="slider-input" id="resizePercentSlider" min="10" max="300" step="5" value="100">
          <span class="slider-val tabular-nums" id="resizePercentVal">100%</span>
        </div>
        <div class="chip-group" style="margin-top: 4px;">
          <button class="chip btn-sm" data-pct="25">25%</button>
          <button class="chip btn-sm" data-pct="50">50%</button>
          <button class="chip btn-sm" data-pct="75">75%</button>
          <button class="chip btn-sm active" data-pct="100">100%</button>
          <button class="chip btn-sm" data-pct="150">150%</button>
          <button class="chip btn-sm" data-pct="200">200%</button>
        </div>
      </div>

      <!-- Dimensions Controls View -->
      <div id="dimensionsControlsView" class="form-group hidden">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Rộng (px)</label>
            <input type="number" class="form-input tabular-nums" id="resizeWidthInput" min="1" value="${dims.width}">
          </div>
          <div style="display: flex; align-items: center; padding-top: 18px;">
            <label class="toggle-switch" title="Khóa đúng tỉ lệ ảnh">
              <input type="checkbox" id="resizeRatioLock" checked>
              <span class="switch-track"></span>
            </label>
          </div>
          <div class="form-group">
            <label class="form-label">Cao (px)</label>
            <input type="number" class="form-input tabular-nums" id="resizeHeightInput" min="1" value="${dims.height}">
          </div>
        </div>

        <div style="margin-top: 6px;">
          <span class="form-label" style="display: block; margin-bottom: 6px;">Giới hạn cạnh tối đa:</span>
          <div class="chip-group">
            <button class="chip btn-sm" data-max="1920">Max 1920px (FHD)</button>
            <button class="chip btn-sm" data-max="1080">Max 1080px</button>
            <button class="chip btn-sm" data-max="800">Max 800px</button>
          </div>
        </div>
      </div>

      <!-- Preview Summary & Actions -->
      <div class="tool-action-bar">
        <div style="font-size: 13px; font-weight: 600; color: var(--text-main);" id="newDimensionsPreview" class="tabular-nums">
          Mới: ${dims.width} × ${dims.height} px
        </div>
        <button class="btn btn-primary btn-sm" id="btnApplyResize">
          Áp Dụng Đổi Cỡ
        </button>
      </div>
    `;

    this.bindEvents();
  }

  private bindEvents(): void {
    const btnModePercent = this.panelEl.querySelector('#btnModePercent') as HTMLButtonElement;
    const btnModeDimensions = this.panelEl.querySelector('#btnModeDimensions') as HTMLButtonElement;
    const percentView = this.panelEl.querySelector('#percentControlsView') as HTMLElement;
    const dimensionsView = this.panelEl.querySelector('#dimensionsControlsView') as HTMLElement;

    btnModePercent.onclick = () => {
      btnModePercent.classList.add('active');
      btnModeDimensions.classList.remove('active');
      percentView.classList.remove('hidden');
      dimensionsView.classList.add('hidden');
      this.syncUI();
    };

    btnModeDimensions.onclick = () => {
      btnModeDimensions.classList.add('active');
      btnModePercent.classList.remove('active');
      dimensionsView.classList.remove('hidden');
      percentView.classList.add('hidden');
      this.syncUI();
    };

    // Percent slider & buttons
    const slider = this.panelEl.querySelector('#resizePercentSlider') as HTMLInputElement;
    const sliderVal = this.panelEl.querySelector('#resizePercentVal') as HTMLElement;
    slider.oninput = () => {
      this.currentPercent = parseInt(slider.value, 10);
      sliderVal.textContent = `${this.currentPercent}%`;
      const dims = this.canvasManager.getDimensions();
      const res = ResizeEngine.calculateByPercent(dims.width, dims.height, this.currentPercent);
      this.targetWidth = res.width;
      this.targetHeight = res.height;
      this.updatePreviewText();
    };

    this.panelEl.querySelectorAll('#percentControlsView .chip[data-pct]').forEach(el => {
      const btn = el as HTMLButtonElement;
      btn.onclick = () => {
        this.panelEl.querySelectorAll('#percentControlsView .chip[data-pct]').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        this.currentPercent = parseInt(btn.dataset.pct || '100', 10);
        slider.value = this.currentPercent.toString();
        sliderVal.textContent = `${this.currentPercent}%`;
        const dims = this.canvasManager.getDimensions();
        const res = ResizeEngine.calculateByPercent(dims.width, dims.height, this.currentPercent);
        this.targetWidth = res.width;
        this.targetHeight = res.height;
        this.updatePreviewText();
      };
    });

    // Dimensions inputs
    const widthInput = this.panelEl.querySelector('#resizeWidthInput') as HTMLInputElement;
    const heightInput = this.panelEl.querySelector('#resizeHeightInput') as HTMLInputElement;
    const lockCheckbox = this.panelEl.querySelector('#resizeRatioLock') as HTMLInputElement;

    lockCheckbox.onchange = () => {
      this.maintainAspectRatio = lockCheckbox.checked;
    };

    widthInput.oninput = () => {
      const val = parseInt(widthInput.value, 10);
      if (isNaN(val) || val <= 0) return;
      this.targetWidth = val;
      const dims = this.canvasManager.getDimensions();
      if (this.maintainAspectRatio) {
        const ratio = dims.width / dims.height;
        this.targetHeight = Math.round(val / ratio);
        heightInput.value = this.targetHeight.toString();
      }
      this.updatePreviewText();
    };

    heightInput.oninput = () => {
      const val = parseInt(heightInput.value, 10);
      if (isNaN(val) || val <= 0) return;
      this.targetHeight = val;
      const dims = this.canvasManager.getDimensions();
      if (this.maintainAspectRatio) {
        const ratio = dims.width / dims.height;
        this.targetWidth = Math.round(val * ratio);
        widthInput.value = this.targetWidth.toString();
      }
      this.updatePreviewText();
    };

    // Max dimension clamping presets
    this.panelEl.querySelectorAll('#dimensionsControlsView .chip[data-max]').forEach(el => {
      const btn = el as HTMLButtonElement;
      btn.onclick = () => {
        const max = parseInt(btn.dataset.max || '1920', 10);
        const dims = this.canvasManager.getDimensions();
        const res = ResizeEngine.clampMaxDimension(dims.width, dims.height, max);
        this.targetWidth = res.width;
        this.targetHeight = res.height;
        widthInput.value = res.width.toString();
        heightInput.value = res.height.toString();
        this.updatePreviewText();
      };
    });

    // Apply button
    const btnApply = this.panelEl.querySelector('#btnApplyResize') as HTMLButtonElement;
    btnApply.onclick = () => {
      this.applyResize();
    };
  }

  private applyResize(): void {
    if (this.targetWidth <= 0 || this.targetHeight <= 0) return;

    const sourceCanvas = this.canvasManager.getCanvas();
    const resized = ResizeEngine.multiStepResize(sourceCanvas, this.targetWidth, this.targetHeight);

    const canvas = this.canvasManager.getCanvas();
    const ctx = this.canvasManager.getContext();

    canvas.width = resized.width;
    canvas.height = resized.height;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(resized, 0, 0);

    this.canvasManager.getHistory().pushState(ctx, canvas.width, canvas.height);
    this.canvasManager.fitToViewport();

    this.syncUI();
    if (this.onApplyCallback) this.onApplyCallback();
  }

  private syncUI(): void {
    const dims = this.canvasManager.getDimensions();
    const origTag = this.panelEl.querySelector('#originalDimTag');
    if (origTag) origTag.textContent = `Gốc: ${dims.width} × ${dims.height} px`;

    const widthInput = this.panelEl.querySelector('#resizeWidthInput') as HTMLInputElement | null;
    const heightInput = this.panelEl.querySelector('#resizeHeightInput') as HTMLInputElement | null;
    if (widthInput) widthInput.value = dims.width.toString();
    if (heightInput) heightInput.value = dims.height.toString();

    this.targetWidth = dims.width;
    this.targetHeight = dims.height;
    this.updatePreviewText();
  }

  private updatePreviewText(): void {
    const previewEl = this.panelEl.querySelector('#newDimensionsPreview');
    if (previewEl) {
      previewEl.textContent = `Mới: ${this.targetWidth} × ${this.targetHeight} px`;
    }
  }
}
