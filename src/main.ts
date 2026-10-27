import type { ToolTab, ExportOptions, AspectRatioPreset, ScannerOutputPreset, ScannerFilterType } from './types';
import { HistoryManager } from './core/HistoryManager';
import { CanvasManager } from './core/CanvasManager';
import { ImageExporter } from './core/ImageExporter';
import { CropUI } from './modules/crop/CropUI';
import { ResizeUI } from './modules/resize/ResizeUI';
import { ScannerUI } from './modules/scanner/ScannerUI';
import { CollageUI } from './modules/collage/CollageUI';

class PicStudioApp {
  private history: HistoryManager;
  private canvasManager: CanvasManager;

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

  constructor() {
    this.history = new HistoryManager(10);

    const canvas = document.getElementById('mainCanvas') as HTMLCanvasElement;
    const stageEl = document.getElementById('canvasStage') as HTMLElement;
    const viewportEl = document.getElementById('viewport') as HTMLElement;

    this.canvasManager = new CanvasManager(canvas, stageEl, viewportEl, this.history);

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
        this.canvasManager.fitToViewport();
        this.showSnackbar('Đã hoàn tác (Undo)');
      }
    };

    btnRedo.onclick = () => {
      const canvas = this.canvasManager.getCanvas();
      const ctx = this.canvasManager.getContext();
      if (this.history.redo(ctx, canvas)) {
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

    // Notify on tool apply
    this.cropUI.onApply(() => this.showSnackbar('Đã cắt ảnh thành công'));
    this.resizeUI.onApply(() => this.showSnackbar('Đã đổi kích thước thành công'));
    this.scannerUI.onApply(() => this.showSnackbar('Đã nắn phẳng tài liệu'));
    this.collageUI.onApply(() => this.showSnackbar('Đã ghép ảnh thành công'));
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

  private bindFileLoading(): void {
    const fileInput = document.getElementById('mainFileInput') as HTMLInputElement;
    const btnUpload = document.getElementById('btnUploadTrigger') as HTMLButtonElement;
    const btnSample = document.getElementById('btnSampleDocTrigger') as HTMLButtonElement;
    const dropzone = document.getElementById('dropzone') as HTMLElement;
    const viewport = document.getElementById('viewport') as HTMLElement;

    btnUpload.onclick = () => fileInput.click();
    fileInput.onchange = () => {
      if (fileInput.files && fileInput.files.length > 0) {
        this.canvasManager.loadImage(fileInput.files[0]);
        fileInput.value = '';
      }
    };

    // Sample document button
    btnSample.onclick = () => {
      this.canvasManager.loadImage('./samples/skewed-document.jpg')
        .then(() => {
          this.switchTab('scanner');
          this.showSnackbar('Đã tải tài liệu mẫu. Hãy kéo 4 góc và bấm "Nắn Phẳng Ảnh"!');
        })
        .catch(() => this.showSnackbar('Không tìm thấy ảnh mẫu.'));
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
    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('dragover');

      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        if (file.type.startsWith('image/')) {
          this.canvasManager.loadImage(file);
        }
      }
    };

    viewport.addEventListener('dragover', handleDragOver);
    viewport.addEventListener('dragleave', handleDragLeave);
    viewport.addEventListener('drop', handleDrop);

    // Paste from clipboard (Ctrl+V / Cmd+V)
    window.addEventListener('paste', (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            this.canvasManager.loadImage(file);
            this.showSnackbar('Đã dán ảnh từ clipboard!');
            break;
          }
        }
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
      sizeEst.textContent = `Ước tính: ~${ImageExporter.formatBytes(estBytes)}`;

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
      if (!this.canvasManager.getHasImage() && this.currentTab !== 'collage') {
        this.showSnackbar('Vui lòng tải ảnh lên trước khi xuất.');
        return;
      }
      updatePreviewInfo();
      modal.classList.add('open');
    };

    btnClose.onclick = () => modal.classList.remove('open');
    modal.onclick = (e) => {
      if (e.target === modal) modal.classList.remove('open');
    };

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
      const canvas = this.canvasManager.getCanvas();
      try {
        const { blob } = await ImageExporter.exportCanvas(canvas, opts);
        const ext = this.exportFormat === 'image/png' ? 'png' : (this.exportFormat === 'image/jpeg' ? 'jpg' : 'webp');
        const filename = `picstudio_${Date.now()}.${ext}`;

        await ImageExporter.downloadOrShare(blob, filename, () => {
          modal.classList.remove('open');
          this.showSnackbar('Đã lưu ảnh về máy!');
        });
      } catch (err) {
        alert('Lỗi khi xuất ảnh: ' + err);
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
        const ext = this.exportFormat === 'image/png' ? 'png' : (this.exportFormat === 'image/jpeg' ? 'jpg' : 'webp');
        const filename = `picstudio_${Date.now()}.${ext}`;

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

    // 3. Register Service Worker with relative scope
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('./sw.js', { scope: './' })
          .then((reg) => {
            this.swRegistration = reg;

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
