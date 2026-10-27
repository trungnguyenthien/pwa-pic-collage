export class ResizeEngine {
  public static calculateDimensions(
    originalWidth: number,
    originalHeight: number,
    targetWidth?: number,
    targetHeight?: number,
    maintainAspectRatio: boolean = true
  ): { width: number; height: number } {
    if (!maintainAspectRatio) {
      return {
        width: Math.max(1, Math.round(targetWidth || originalWidth)),
        height: Math.max(1, Math.round(targetHeight || originalHeight)),
      };
    }

    const ratio = originalWidth / originalHeight;

    if (targetWidth && !targetHeight) {
      return {
        width: Math.max(1, Math.round(targetWidth)),
        height: Math.max(1, Math.round(targetWidth / ratio)),
      };
    }

    if (targetHeight && !targetWidth) {
      return {
        width: Math.max(1, Math.round(targetHeight * ratio)),
        height: Math.max(1, Math.round(targetHeight)),
      };
    }

    if (targetWidth && targetHeight) {
      // Fit within max box
      const scaleW = targetWidth / originalWidth;
      const scaleH = targetHeight / originalHeight;
      const scale = Math.min(scaleW, scaleH);
      return {
        width: Math.max(1, Math.round(originalWidth * scale)),
        height: Math.max(1, Math.round(originalHeight * scale)),
      };
    }

    return { width: originalWidth, height: originalHeight };
  }

  public static calculateByPercent(
    originalWidth: number,
    originalHeight: number,
    percent: number
  ): { width: number; height: number } {
    const factor = percent / 100;
    return {
      width: Math.max(1, Math.round(originalWidth * factor)),
      height: Math.max(1, Math.round(originalHeight * factor)),
    };
  }

  public static clampMaxDimension(
    originalWidth: number,
    originalHeight: number,
    maxDim: number
  ): { width: number; height: number } {
    const maxCurrent = Math.max(originalWidth, originalHeight);
    if (maxCurrent <= maxDim) {
      return { width: originalWidth, height: originalHeight };
    }
    const factor = maxDim / maxCurrent;
    return {
      width: Math.max(1, Math.round(originalWidth * factor)),
      height: Math.max(1, Math.round(originalHeight * factor)),
    };
  }

  /**
   * Multi-step downscaling to avoid aliasing and preserve sharp text
   * Scales down by half repeatedly until within 2x of target, then final scale
   */
  public static multiStepResize(
    sourceCanvas: HTMLCanvasElement,
    targetWidth: number,
    targetHeight: number
  ): HTMLCanvasElement {
    let currentCanvas = sourceCanvas;
    let curW = sourceCanvas.width;
    let curH = sourceCanvas.height;

    // Step down by half if scaling down significantly (> 2x)
    while (curW / 2 >= targetWidth && curH / 2 >= targetHeight) {
      const stepCanvas = document.createElement('canvas');
      curW = Math.floor(curW / 2);
      curH = Math.floor(curH / 2);
      stepCanvas.width = curW;
      stepCanvas.height = curH;

      const stepCtx = stepCanvas.getContext('2d');
      if (!stepCtx) break;
      stepCtx.imageSmoothingEnabled = true;
      stepCtx.imageSmoothingQuality = 'high';
      stepCtx.drawImage(currentCanvas, 0, 0, curW, curH);

      currentCanvas = stepCanvas;
    }

    // Final target resize
    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = targetWidth;
    outputCanvas.height = targetHeight;
    const outCtx = outputCanvas.getContext('2d');
    if (!outCtx) return currentCanvas;

    outCtx.imageSmoothingEnabled = true;
    outCtx.imageSmoothingQuality = 'high';
    outCtx.drawImage(currentCanvas, 0, 0, targetWidth, targetHeight);

    return outputCanvas;
  }
}
