import type { ScannerFilterType } from '../../types';

export class DocumentFilter {
  public static applyFilter(
    sourceCanvas: HTMLCanvasElement,
    filterType: ScannerFilterType
  ): HTMLCanvasElement {
    if (filterType === 'original') return sourceCanvas;

    const outCanvas = document.createElement('canvas');
    outCanvas.width = sourceCanvas.width;
    outCanvas.height = sourceCanvas.height;

    const ctx = outCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return sourceCanvas;

    ctx.drawImage(sourceCanvas, 0, 0);
    const imgData = ctx.getImageData(0, 0, outCanvas.width, outCanvas.height);
    const data = imgData.data;
    const len = data.length;

    if (filterType === 'grayscale') {
      for (let i = 0; i < len; i += 4) {
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        data[i] = gray;
        data[i + 1] = gray;
        data[i + 2] = gray;
      }
    } else if (filterType === 'magic-scan') {
      // Magic Scan: Adaptive document contrast boost (whiten paper, darken text)
      for (let i = 0; i < len; i += 4) {
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        // S-curve contrast boost
        let enhanced = gray;
        if (gray > 140) {
          // Whiten paper
          enhanced = Math.min(255, gray + (255 - gray) * 0.65);
        } else {
          // Darken text
          enhanced = Math.max(0, gray * 0.65);
        }
        data[i] = enhanced;
        data[i + 1] = enhanced;
        data[i + 2] = enhanced;
      }
    }

    ctx.putImageData(imgData, 0, 0);
    return outCanvas;
  }
}
