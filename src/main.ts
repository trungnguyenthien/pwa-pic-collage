import type { ToolTab, ExportOptions, AspectRatioPreset, ScannerOutputPreset, ScannerFilterType, QueueItem } from './types';
import { HistoryManager } from './core/HistoryManager';
import { CanvasManager } from './core/CanvasManager';
import { ImageExporter } from './core/ImageExporter';
import { QueueManager } from './core/QueueManager';
import { CropUI } from './modules/crop/CropUI';
import { ResizeUI } from './modules/resize/ResizeUI';
import { ScannerUI } from './modules/scanner/ScannerUI';
import { CollageUI } from './modules/collage/CollageUI';

// Vite CSS imports for reliable HMR and bundling
import './styles/variables.css';
import './styles/components.css';
import './styles/overlays.css';
import './styles/main.css';

class PicStudioApp {
  private history: HistoryManager;
  private canvasManager: CanvasManager;
  private queueManager: QueueManager;

  private cropUI: CropUI;
  private resizeUI: ResizeUI;
  private scannerUI: ScannerUI;
  private collageUI: CollageUI;

  private currentTab: ToolTab = 'crop';
  private swRegistration: ServiceWorkerRegistration | null = null;
  private deferredInstallPrompt: any = null;

  // Export Modal state
  private exportFormat: 'image/webp' | 'image/jpeg' | 'image/png' = 'image/webp';
  private exportQuality: number = 0.9;
  private exportScope: 'current' | 'all' = 'current';

  constructor() {
    this.history = new HistoryManager(10);

    const canvas = document.getElementById('mainCanvas') as HTMLCanvasElement;
    const stageEl = document.getElementById('canvasStage') as HTMLElement;
    const viewportEl = document.getElementById('viewport') as HTMLElement;

    this.canvasManager = new CanvasManager(canvas, stageEl, viewportEl, this.history);
    this.queueManager = new QueueManager();

    const cropOverlay = document.getElementById('cropOverlay') as HTMLElement;
    const scannerOverlay = document.getElementById('scannerOverlay') as HTMLElement;
    const panelResize = document.getElementById('panelResize') as HTMLElement;
    const panelCollage = document.getElementById('panelCollage') as HTMLElement;

    this.cropUI = new CropUI(cropOverlay, this.canvasManager);
    this.resizeUI = new ResizeUI(panelResize, this.canvasManager);
    this.scannerUI = new ScannerUI(scannerOverlay, this.canvasManager);
    this.collageUI = new CollageUI(panelCollage, this.canvasManager);

    this.init();
  }

  private init(): void {
    this.bindHeaderActions();
    this.bindFileLoading();
    this.bindQueue();
    this.bindNavigationTabs();
    this.bindCropPanel();
    this.bindScannerPanel();
    this.bindExportModal();
    this.setupPWA();
    this.setupURLParams();

    // Setup history UI updates
    const btnUndo = document.getElementById('btnUndo') as HTMLButtonElement;
    const btnRedo = document.getElementById('btnRedo') as HTMLButtonElement;
    this.history.onChange((canUndo, canRedo) => {
      btnUndo.disabled = !canUndo;
      btnRedo.disabled = !canRedo;
    });

    btnUndo.onclick = () => {
      const canvas = this.canvasManager.getCanvas();
      const ctx = this.canvasManager.getContext();
      if (this.history.undo(ctx, canvas)) {
        this.queueManager.updateActiveCanvas(canvas);
        this.canvasManager.fitToViewport();
        this.showSnackbar('Đã hoàn tác (Undo)');
      }
    };

    btnRedo.onclick = () => {
      const canvas = this.canvasManager.getCanvas();
      const ctx = this.canvasManager.getContext();
      if (this.history.redo(ctx, canvas)) {
        this.queueManager.updateActiveCanvas(canvas);
        this.canvasManager.fitToViewport();
        this.showSnackbar('Đã làm lại (Redo)');
      }
    };

    // Update HUD dimensions on image load
    this.canvasManager.onImageLoaded((w, h) => {
      this.showWorkspace();
      const hudDim = document.getElementById('hudDimensions');
      if (hudDim) hudDim.textContent = `${w} × ${h} px`;
      this.switchTab(this.currentTab);
    });

    // Notify on tool apply & sync with queue
    this.cropUI.onApply(() => {
      this.queueManager.updateActiveCanvas(this.canvasManager.getCanvas());
      this.showSnackbar('Đã cắt ảnh thành công');
    });
    this.resizeUI.onApply(() => {
      this.queueManager.updateActiveCanvas(this.canvasManager.getCanvas());
      this.showSnackbar('Đã đổi kích thước thành công');
    });
    this.scannerUI.onApply(() => {
      this.queueManager.updateActiveCanvas(this.canvasManager.getCanvas());
      this.showSnackbar('Đã nắn phẳng tài liệu');
    });
    this.collageUI.onApply(() => {
      this.queueManager.updateActiveCanvas(this.canvasManager.getCanvas());
      this.showSnackbar('Đã ghép ảnh thành công');
    });
  }

  private showWorkspace(): void {
    const dropzone = document.getElementById('dropzone') as HTMLElement;
    const stage = document.getElementById('canvasStage') as HTMLElement;
    dropzone.classList.add('hidden');
    stage.classList.remove('hidden');
  }

  private bindHeaderActions(): void {
    const brandHome = document.getElementById('brandHome');
    if (brandHome) {
      brandHome.onclick = () => {
        if (!this.canvasManager.getHasImage()) return;
        if (confirm('Bạn có muốn tải ảnh mới hoặc đặt lại vùng làm việc?')) {
          location.reload();
        }
      };
    }
  }

  private loadQueueItemToCanvas(item: QueueItem): void {
    this.canvasManager.loadFromCanvas(item.canvas);
    this.showWorkspace();
    const hudDim = document.getElementById('hudDimensions');
    if (hudDim) hudDim.textContent = `${item.canvas.width} × ${item.canvas.height} px`;
    this.switchTab(this.currentTab);
  }

  private bindFileLoading(): void {
    const fileInput = document.getElementById('mainFileInput') as HTMLInputElement;
    const btnUpload = document.getElementById('btnUploadTrigger') as HTMLButtonElement;
    const btnSample = document.getElementById('btnSampleDocTrigger') as HTMLButtonElement;
    const dropzone = document.getElementById('dropzone') as HTMLElement;
    const viewport = document.getElementById('viewport') as HTMLElement;

    btnUpload.onclick = () => fileInput.click();
    fileInput.onchange = async () => {
      if (fileInput.files && fileInput.files.length > 0) {
        const isFirstLoad = this.queueManager.getItems().length === 0;
        const count = fileInput.files.length;
        await this.queueManager.addFiles(fileInput.files);
        fileInput.value = '';
        if (isFirstLoad) {
          const active = this.queueManager.getActiveItem();
          if (active) this.loadQueueItemToCanvas(active);
        }
        const total = this.queueManager.getItems().length;
        this.showSnackbar(`Đã thêm ${count} ảnh vào hàng đợi (${total} ảnh)`);
      }
    };

    // Sample document button
    btnSample.onclick = () => {
      const img = new Image();
      img.src = './samples/skewed-document.jpg';
      img.onload = async () => {
        const item = await this.queueManager.addImage(img, 'skewed-document.jpg');
        this.loadQueueItemToCanvas(item);
        this.switchTab('scanner');
        this.showSnackbar('Đã tải tài liệu mẫu. Hãy kéo 4 góc và bấm "Nắn Phẳng Ảnh"!');
      };
      img.onerror = () => this.showSnackbar('Không tìm thấy ảnh mẫu.');
    };

    // Drag and Drop
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('dragover');
    };
    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('dragover');
    };
    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('dragover');

      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        const isFirstLoad = this.queueManager.getItems().length === 0;
        const count = e.dataTransfer.files.length;
        await this.queueManager.addFiles(e.dataTransfer.files);
        if (isFirstLoad) {
          const active = this.queueManager.getActiveItem();
          if (active) this.loadQueueItemToCanvas(active);
        }
        const total = this.queueManager.getItems().length;
        this.showSnackbar(`Đã thêm ${count} ảnh vào hàng đợi (${total} ảnh)`);
      }
    };

    viewport.addEventListener('dragover', handleDragOver);
    viewport.addEventListener('dragleave', handleDragLeave);
    viewport.addEventListener('drop', handleDrop);

    // Paste from clipboard (Ctrl+V / Cmd+V)
    window.addEventListener('paste', async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) files.push(file);
        }
      }
      if (files.length > 0) {
        const isFirstLoad = this.queueManager.getItems().length === 0;
        await this.queueManager.addFiles(files);
        if (isFirstLoad) {
          const active = this.queueManager.getActiveItem();
          if (active) this.loadQueueItemToCanvas(active);
        }
        const total = this.queueManager.getItems().length;
        this.showSnackbar(`Đã dán ${files.length} ảnh vào hàng đợi (${total} ảnh)!`);
      }
    });

    // Keyboard shortcuts (Ctrl+Z, Ctrl+Y)
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        const btnUndo = document.getElementById('btnUndo') as HTMLButtonElement;
        if (!btnUndo.disabled) btnUndo.click();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) {
        e.preventDefault();
        const btnRedo = document.getElementById('btnRedo') as HTMLButtonElement;
        if (!btnRedo.disabled) btnRedo.click();
      }
    });
  }

  private bindQueue(): void {
    const queueBar = document.getElementById('queueBar') as HTMLElement;
    const queueList = document.getElementById('queueList') as HTMLElement;
    const fileInput = document.getElementById('mainFileInput') as HTMLInputElement;

    // Keyboard navigation: [ (prev) and ] (next) or Alt+Arrows
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === '[' || (e.altKey && e.key === 'ArrowLeft')) {
        const item = this.queueManager.prev();
        if (item) this.loadQueueItemToCanvas(item);
      } else if (e.key === ']' || (e.altKey && e.key === 'ArrowRight')) {
        const item = this.queueManager.next();
        if (item) this.loadQueueItemToCanvas(item);
      }
    });

    // Queue slider interaction: select / remove / add
    queueList.onclick = (e) => {
      const target = e.target as HTMLElement;

      // Click Add Photo (+) card
      const addBtn = target.closest('#btnQueueAddMore');
      if (addBtn) {
        fileInput.click();
        return;
      }

      // Click Remove button (×)
      const removeBtn = target.closest('[data-remove-idx]') as HTMLElement;
      if (removeBtn) {
        e.stopPropagation();
        const removeIdx = parseInt(removeBtn.dataset.removeIdx || '-1', 10);
        if (removeIdx >= 0) {
          const isActive = removeIdx === this.queueManager.getActiveIndex();
          this.queueManager.removeItem(removeIdx);
          if (isActive) {
            const nextActive = this.queueManager.getActiveItem();
            if (nextActive) {
              this.loadQueueItemToCanvas(nextActive);
            } else {
              // Queue became empty
              const dropzone = document.getElementById('dropzone') as HTMLElement;
              const stage = document.getElementById('canvasStage') as HTMLElement;
              dropzone.classList.remove('hidden');
              stage.classList.add('hidden');
              const hudDim = document.getElementById('hudDimensions');
              if (hudDim) hudDim.textContent = 'PicStudio Ready';
            }
          }
        }
        return;
      }

      // Click Photo card to select
      const card = target.closest('[data-queue-idx]') as HTMLElement;
      if (card) {
        const idx = parseInt(card.dataset.queueIdx || '-1', 10);
        if (idx >= 0 && idx !== this.queueManager.getActiveIndex()) {
          const item = this.queueManager.selectItem(idx);
          if (item) {
            this.loadQueueItemToCanvas(item);
          }
        }
      }
    };

    // React to queue changes
    this.queueManager.onChange((items, activeIndex) => {
      if (items.length === 0) {
        queueBar.classList.add('hidden');
        return;
      }

      queueBar.classList.remove('hidden');

      const cardsHtml = items.map((item, idx) => {
        const isActive = idx === activeIndex;
        return `
          <div class="queue-slide-card ${isActive ? 'active' : ''}" data-queue-idx="${idx}" title="${item.name} (${item.canvas.width}×${item.canvas.height})">
            <img src="${item.thumbnailUrl}" alt="${item.name}" loading="lazy" />
            <span class="queue-index-badge">${idx + 1}</span>
            ${item.isModified ? '<span class="queue-status-dot" title="Đã chỉnh sửa"></span>' : ''}
            <button class="queue-remove-btn" data-remove-idx="${idx}" title="Xoá ảnh này" aria-label="Xoá">&times;</button>
          </div>
        `;
      }).join('');

      // Minimalist Add (+) card at the end of the slide
      const addCardHtml = `
        <button class="queue-slide-add-card" id="btnQueueAddMore" title="Thêm ảnh vào hàng đợi" aria-label="Thêm ảnh">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </button>
      `;

      queueList.innerHTML = cardsHtml + addCardHtml;

      // Scroll active item into view smoothly
      const activeEl = queueList.querySelector(`.queue-slide-card[data-queue-idx="${activeIndex}"]`) as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
      }
    });
  }

  private bindNavigationTabs(): void {
    const navButtons = document.querySelectorAll('.bottom-nav .nav-tab, .desktop-tab-btn');
    navButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = (btn as HTMLElement).dataset.tab as ToolTab;
        if (tab) {
          this.switchTab(tab);
        }
      });
    });
  }

  public switchTab(tab: ToolTab): void {
    this.currentTab = tab;

    // 1. Update Navigation Buttons active state
    document.querySelectorAll('.bottom-nav .nav-tab').forEach((el) => {
      const btn = el as HTMLElement;
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    document.querySelectorAll('.desktop-tab-btn').forEach((el) => {
      const btn = el as HTMLElement;
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    // 2. Hide all tool panels
    document.querySelectorAll('.tool-panel').forEach((panel) => {
      panel.classList.remove('active');
    });

    // 3. Deactivate overlays
    this.cropUI.deactivate();
    this.scannerUI.deactivate();

    // 4. Activate selected tool
    switch (tab) {
      case 'crop': {
        const panel = document.getElementById('panelCrop');
        if (panel) panel.classList.add('active');
        if (this.canvasManager.getHasImage()) {
          this.cropUI.activate();
        }
        break;
      }
      case 'resize': {
        const panel = document.getElementById('panelResize');
        if (panel) panel.classList.add('active');
        if (this.canvasManager.getHasImage()) {
          this.resizeUI.activate();
        }
        break;
      }
      case 'scanner': {
        const panel = document.getElementById('panelScanner');
        if (panel) panel.classList.add('active');
        if (this.canvasManager.getHasImage()) {
          this.scannerUI.activate();
        }
        break;
      }
      case 'collage': {
        const panel = document.getElementById('panelCollage');
        if (panel) panel.classList.add('active');
        this.showWorkspace();
        this.collageUI.activate();
        break;
      }
    }
  }

  private bindCropPanel(): void {
    // Aspect ratio chips
    document.querySelectorAll('#panelCrop [data-crop-ratio]').forEach((el) => {
      const btn = el as HTMLButtonElement;
      btn.onclick = () => {
        document.querySelectorAll('#panelCrop [data-crop-ratio]').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        const ratio = btn.dataset.cropRatio as AspectRatioPreset;
        this.cropUI.setPreset(ratio);
      };
    });

    // Rotate & Flip buttons
    const btnRotL = document.getElementById('btnRotateLeft');
    const btnRotR = document.getElementById('btnRotateRight');
    const btnFlipH = document.getElementById('btnFlipH');
    const btnResetCrop = document.getElementById('btnResetCrop');
    const btnApplyCrop = document.getElementById('btnApplyCropAction');

    if (btnRotL) btnRotL.onclick = () => this.cropUI.rotate(-90);
    if (btnRotR) btnRotR.onclick = () => this.cropUI.rotate(90);
    if (btnFlipH) btnFlipH.onclick = () => this.cropUI.flip(true, false);
    if (btnResetCrop) btnResetCrop.onclick = () => this.cropUI.setPreset('free');
    if (btnApplyCrop) btnApplyCrop.onclick = () => this.cropUI.applyCrop();
  }

  private bindScannerPanel(): void {
    // Preset chips
    document.querySelectorAll('#panelScanner [data-scanner-preset]').forEach((el) => {
      const btn = el as HTMLButtonElement;
      btn.onclick = () => {
        document.querySelectorAll('#panelScanner [data-scanner-preset]').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        const preset = btn.dataset.scannerPreset as ScannerOutputPreset;
        this.scannerUI.setPreset(preset);
      };
    });

    // Filter chips
    document.querySelectorAll('#panelScanner [data-scanner-filter]').forEach((el) => {
      const btn = el as HTMLButtonElement;
      btn.onclick = () => {
        document.querySelectorAll('#panelScanner [data-scanner-filter]').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        const filter = btn.dataset.scannerFilter as ScannerFilterType;
        this.scannerUI.setFilter(filter);
      };
    });

    const btnResetPins = document.getElementById('btnResetScannerPins');
    const btnApplyWarp = document.getElementById('btnApplyWarpAction');

    if (btnResetPins) btnResetPins.onclick = () => this.scannerUI.resetQuad();
    if (btnApplyWarp) btnApplyWarp.onclick = () => this.scannerUI.applyWarp();
  }

  private bindExportModal(): void {
    const modal = document.getElementById('exportModal') as HTMLElement;
    const btnExportOpen = document.getElementById('btnExport') as HTMLButtonElement;
    const btnClose = document.getElementById('btnCloseExportModal') as HTMLButtonElement;
    const btnDownload = document.getElementById('btnExportDownload') as HTMLButtonElement;
    const btnShare = document.getElementById('btnExportShare') as HTMLButtonElement;

    const previewCanvas = document.getElementById('exportPreviewCanvas') as HTMLCanvasElement;
    const dimLabel = document.getElementById('exportDimLabel') as HTMLElement;
    const sizeEst = document.getElementById('exportSizeEst') as HTMLElement;
    const exportScopeGroup = document.getElementById('exportScopeGroup') as HTMLElement;
    const btnScopeCurrent = document.getElementById('btnExportScopeCurrent') as HTMLButtonElement;
    const btnScopeAll = document.getElementById('btnExportScopeAll') as HTMLButtonElement;
    const exportAllCount = document.getElementById('exportAllCount') as HTMLElement;

    const qualityGroup = document.getElementById('qualitySliderGroup') as HTMLElement;
    const qualitySlider = document.getElementById('exportQualitySlider') as HTMLInputElement;
    const qualityVal = document.getElementById('exportQualityVal') as HTMLElement;

    const updatePreviewInfo = () => {
      const dims = this.canvasManager.getDimensions();
      dimLabel.textContent = `${dims.width} × ${dims.height} px`;

      // Estimate file size based on megapixel count and quality
      const pixels = dims.width * dims.height;
      let estBytes = pixels * 0.15;
      if (this.exportFormat === 'image/jpeg') estBytes = pixels * 0.22 * this.exportQuality;
      if (this.exportFormat === 'image/webp') estBytes = pixels * 0.12 * this.exportQuality;
      if (this.exportFormat === 'image/png') estBytes = pixels * 0.75;

      const items = this.queueManager.getItems();
      if (this.exportScope === 'all' && items.length > 1) {
        sizeEst.textContent = `Ước tính cả hàng đợi (${items.length} ảnh): ~${ImageExporter.formatBytes(estBytes * items.length)}`;
      } else {
        sizeEst.textContent = `Ước tính: ~${ImageExporter.formatBytes(estBytes)}`;
      }

      // Draw thumbnail onto preview canvas
      const srcCanvas = this.canvasManager.getCanvas();
      previewCanvas.width = 120;
      previewCanvas.height = 120;
      const ctx = previewCanvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, 120, 120);
        const ratio = srcCanvas.width / srcCanvas.height;
        let dw = 120;
        let dh = 120;
        if (ratio > 1) dh = 120 / ratio;
        else dw = 120 * ratio;
        ctx.drawImage(srcCanvas, (120 - dw) / 2, (120 - dh) / 2, dw, dh);
      }
    };

    btnExportOpen.onclick = () => {
      const items = this.queueManager.getItems();
      if (!this.canvasManager.getHasImage() && items.length === 0 && this.currentTab !== 'collage') {
        this.showSnackbar('Vui lòng tải ảnh lên trước khi xuất.');
        return;
      }

      if (items.length > 1) {
        exportScopeGroup.classList.remove('hidden');
        if (exportAllCount) exportAllCount.textContent = items.length.toString();
        btnScopeCurrent.classList.toggle('active', this.exportScope === 'current');
        btnScopeAll.classList.toggle('active', this.exportScope === 'all');
      } else {
        exportScopeGroup.classList.add('hidden');
        this.exportScope = 'current';
      }

      updatePreviewInfo();
      modal.classList.add('open');
    };

    btnClose.onclick = () => modal.classList.remove('open');
    modal.onclick = (e) => {
      if (e.target === modal) modal.classList.remove('open');
    };

    // Export Scope selection
    if (btnScopeCurrent && btnScopeAll) {
      btnScopeCurrent.onclick = () => {
        btnScopeCurrent.classList.add('active');
        btnScopeAll.classList.remove('active');
        this.exportScope = 'current';
        updatePreviewInfo();
      };
      btnScopeAll.onclick = () => {
        btnScopeAll.classList.add('active');
        btnScopeCurrent.classList.remove('active');
        this.exportScope = 'all';
        updatePreviewInfo();
      };
    }

    // Format selection
    modal.querySelectorAll('[data-export-fmt]').forEach((el) => {
      const btn = el as HTMLButtonElement;
      btn.onclick = () => {
        modal.querySelectorAll('[data-export-fmt]').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        this.exportFormat = btn.dataset.exportFmt as any;
        if (this.exportFormat === 'image/png') {
          qualityGroup.classList.add('hidden');
        } else {
          qualityGroup.classList.remove('hidden');
        }
        updatePreviewInfo();
      };
    });

    qualitySlider.oninput = () => {
      const q = parseInt(qualitySlider.value, 10);
      this.exportQuality = q / 100;
      qualityVal.textContent = `${q}%`;
      updatePreviewInfo();
    };

    // Execute Download
    btnDownload.onclick = async () => {
      const opts: ExportOptions = {
        format: this.exportFormat,
        quality: this.exportQuality,
      };
      const ext = this.exportFormat === 'image/png' ? 'png' : (this.exportFormat === 'image/jpeg' ? 'jpg' : 'webp');
      const items = this.queueManager.getItems();

      if (this.exportScope === 'all' && items.length > 1) {
        btnDownload.disabled = true;
        const originalText = btnDownload.textContent;
        btnDownload.textContent = 'Đang xuất hàng loạt...';
        try {
          for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const { blob } = await ImageExporter.exportCanvas(item.canvas, opts);
            const cleanName = item.name.replace(/\.[^/.]+$/, '');
            const filename = `${cleanName}_picstudio_${i + 1}.${ext}`;
            await ImageExporter.downloadOrShare(blob, filename);
            if (i < items.length - 1) {
              await new Promise(r => setTimeout(r, 200));
            }
          }
          modal.classList.remove('open');
          this.showSnackbar(`Đã tải về toàn bộ ${items.length} ảnh thành công!`);
        } catch (err) {
          alert('Lỗi khi xuất ảnh hàng loạt: ' + err);
        } finally {
          btnDownload.disabled = false;
          btnDownload.textContent = originalText;
        }
      } else {
        const canvas = this.canvasManager.getCanvas();
        try {
          const { blob } = await ImageExporter.exportCanvas(canvas, opts);
          const activeItem = this.queueManager.getActiveItem();
          const baseName = activeItem ? activeItem.name.replace(/\.[^/.]+$/, '') : `picstudio_${Date.now()}`;
          const filename = `${baseName}.${ext}`;

          await ImageExporter.downloadOrShare(blob, filename, () => {
            modal.classList.remove('open');
            this.showSnackbar('Đã lưu ảnh về máy!');
          });
        } catch (err) {
          alert('Lỗi khi xuất ảnh: ' + err);
        }
      }
    };

    // Execute Web Share
    btnShare.onclick = async () => {
      const opts: ExportOptions = {
        format: this.exportFormat,
        quality: this.exportQuality,
      };
      const canvas = this.canvasManager.getCanvas();
      try {
        const { blob } = await ImageExporter.exportCanvas(canvas, opts);
        const activeItem = this.queueManager.getActiveItem();
        const baseName = activeItem ? activeItem.name.replace(/\.[^/.]+$/, '') : `picstudio_${Date.now()}`;
        const ext = this.exportFormat === 'image/png' ? 'png' : (this.exportFormat === 'image/jpeg' ? 'jpg' : 'webp');
        const filename = `${baseName}.${ext}`;

        await ImageExporter.downloadOrShare(blob, filename, () => {
          modal.classList.remove('open');
          this.showSnackbar('Chia sẻ ảnh thành công!');
        });
      } catch (err) {
        alert('Lỗi khi chia sẻ ảnh: ' + err);
      }
    };
  }

  /**
   * PWA Setup compliant with pwa-standards.md:
   * - Relative scope registration
   * - Force Update button (#btnUpdateApp)
   * - Install button pattern (#btnInstall) with iOS modal fallback
   */
  private setupPWA(): void {
    const btnUpdateApp = document.getElementById('btnUpdateApp') as HTMLButtonElement;
    const btnInstall = document.getElementById('btnInstall') as HTMLButtonElement;
    const updateText = document.getElementById('updateAppText') as HTMLElement;
    const iosModal = document.getElementById('iosInstallModal') as HTMLElement;
    const btnCloseIos = document.getElementById('btnCloseIosModal') as HTMLButtonElement;
    const btnOkIos = document.getElementById('btnOkIosModal') as HTMLButtonElement;

    // Check Standalone mode
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;

    // 1. Force Update Button Handler
    btnUpdateApp.onclick = async () => {
      if (!navigator.onLine) {
        this.showSnackbar('Không thể cập nhật khi đang offline.');
        return;
      }

      btnUpdateApp.disabled = true;
      updateText.innerHTML = '<span class="spinner"></span> Đang tải...';

      try {
        if (this.swRegistration) {
          await this.swRegistration.update();
          if (this.swRegistration.waiting) {
            this.swRegistration.waiting.postMessage({ action: 'skipWaiting' });
          }
        }

        // Clean caches
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map(k => caches.delete(k)));
        }

        this.showSnackbar('Đang khởi động lại ứng dụng...');
        setTimeout(() => {
          window.location.href = window.location.pathname + '?forceUpdate=' + Date.now();
        }, 600);
      } catch (err) {
        console.warn('Force update error:', err);
        window.location.reload();
      }
    };

    // 2. Install Button Handler
    if (!isStandalone) {
      // Android / Chrome: beforeinstallprompt
      window.addEventListener('beforeinstallprompt', (e: Event) => {
        e.preventDefault();
        this.deferredInstallPrompt = e;
        btnInstall.classList.remove('hidden');
      });

      // iOS Safari detection
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
      const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
      if (isIOS && isSafari) {
        btnInstall.classList.remove('hidden');
      }

      btnInstall.onclick = async () => {
        if (this.deferredInstallPrompt) {
          this.deferredInstallPrompt.prompt();
          const { outcome } = await this.deferredInstallPrompt.userChoice;
          if (outcome === 'accepted') {
            btnInstall.classList.add('hidden');
          }
          this.deferredInstallPrompt = null;
        } else {
          // Open iOS install modal
          iosModal.classList.add('open');
        }
      };
    }

    if (btnCloseIos) btnCloseIos.onclick = () => iosModal.classList.remove('open');
    if (btnOkIos) btnOkIos.onclick = () => iosModal.classList.remove('open');
    if (iosModal) {
      iosModal.onclick = (e) => {
        if (e.target === iosModal) iosModal.classList.remove('open');
      };
    }

    // Clean legacy picstudio-v1 caches if present
    if ('caches' in window) {
      caches.keys().then((keys) => {
        keys.forEach((key) => {
          if (key === 'picstudio-v1') {
            caches.delete(key);
          }
        });
      });
    }

    // 3. Register Service Worker with relative scope
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('./sw.js', { scope: './' })
          .then((reg) => {
            this.swRegistration = reg;
            // Immediate check for update
            reg.update();

            // Detect new worker in background
            reg.addEventListener('updatefound', () => {
              const newWorker = reg.installing;
              if (newWorker) {
                newWorker.addEventListener('statechange', () => {
                  if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    // Update Ready state
                    btnUpdateApp.classList.add('btn-pulse');
                    btnUpdateApp.classList.remove('btn-secondary');
                    btnUpdateApp.classList.add('btn-tonal');
                    updateText.textContent = 'Update Ready';
                    this.showSnackbar('Đã có bản cập nhật mới! Nhấn "Update Ready" để áp dụng.', 6000);
                  }
                });
              }
            });
          })
          .catch((err) => {
            console.warn('Service Worker registration skipped:', err);
          });
      });
    }
  }

  private setupURLParams(): void {
    const params = new URLSearchParams(window.location.search);
    const tool = params.get('tool');
    if (tool && ['crop', 'resize', 'scanner', 'collage'].includes(tool)) {
      this.switchTab(tool as ToolTab);
    }
  }

  public showSnackbar(text: string, duration: number = 3200): void {
    const snackbar = document.getElementById('snackbar') as HTMLElement;
    const snackbarText = document.getElementById('snackbarText') as HTMLElement;
    if (!snackbar || !snackbarText) return;

    snackbarText.textContent = text;
    snackbar.classList.add('show');
    setTimeout(() => {
      snackbar.classList.remove('show');
    }, duration);
  }
}

// Start application
window.addEventListener('DOMContentLoaded', () => {
  new PicStudioApp();
});
