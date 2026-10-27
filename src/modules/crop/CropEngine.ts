import type { AspectRatioPreset, Rect } from '../../types';

export class CropEngine {
  public static getAspectRatioValue(preset: AspectRatioPreset): number | null {
    switch (preset) {
      case '1:1': return 1;
      case '4:3': return 4 / 3;
      case '3:4': return 3 / 4;
      case '16:9': return 16 / 9;
      case '9:16': return 9 / 16;
      case '2:3': return 2 / 3;
      case '3:2': return 3 / 2;
      case 'A4': return 1 / 1.4142; // ISO 216 portrait
      case 'free':
      default:
        return null;
    }
  }

  public static getDefaultCropBox(
    imgWidth: number,
    imgHeight: number,
    preset: AspectRatioPreset = 'free'
  ): Rect {
    const ratio = this.getAspectRatioValue(preset);
    if (!ratio) {
      // Freeform: 90% centered box
      const marginX = imgWidth * 0.05;
      const marginY = imgHeight * 0.05;
      return {
        x: Math.round(marginX),
        y: Math.round(marginY),
        width: Math.round(imgWidth * 0.9),
        height: Math.round(imgHeight * 0.9),
      };
    }

    let w = imgWidth * 0.85;
    let h = w / ratio;
    if (h > imgHeight * 0.85) {
      h = imgHeight * 0.85;
      w = h * ratio;
    }

    return {
      x: Math.round((imgWidth - w) / 2),
      y: Math.round((imgHeight - h) / 2),
      width: Math.round(w),
      height: Math.round(h),
    };
  }

  public static applyCrop(
    sourceCanvas: HTMLCanvasElement,
    cropBox: Rect
  ): HTMLCanvasElement {
    const cropped = document.createElement('canvas');
    cropped.width = Math.max(1, Math.round(cropBox.width));
    cropped.height = Math.max(1, Math.round(cropBox.height));

    const ctx = cropped.getContext('2d');
    if (!ctx) return sourceCanvas;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.drawImage(
      sourceCanvas,
      cropBox.x,
      cropBox.y,
      cropBox.width,
      cropBox.height,
      0,
      0,
      cropped.width,
      cropped.height
    );

    return cropped;
  }

  public static rotate(
    sourceCanvas: HTMLCanvasElement,
    angleDeg: number
  ): HTMLCanvasElement {
    const rotated = document.createElement('canvas');
    const is90or270 = Math.abs(angleDeg % 180) === 90;

    rotated.width = is90or270 ? sourceCanvas.height : sourceCanvas.width;
    rotated.height = is90or270 ? sourceCanvas.width : sourceCanvas.height;

    const ctx = rotated.getContext('2d');
    if (!ctx) return sourceCanvas;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.translate(rotated.width / 2, rotated.height / 2);
    ctx.rotate((angleDeg * Math.PI) / 180);
    ctx.drawImage(sourceCanvas, -sourceCanvas.width / 2, -sourceCanvas.height / 2);

    return rotated;
  }

  public static flip(
    sourceCanvas: HTMLCanvasElement,
    horizontal: boolean,
    vertical: boolean
  ): HTMLCanvasElement {
    const flipped = document.createElement('canvas');
    flipped.width = sourceCanvas.width;
    flipped.height = sourceCanvas.height;

    const ctx = flipped.getContext('2d');
    if (!ctx) return sourceCanvas;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.translate(horizontal ? flipped.width : 0, vertical ? flipped.height : 0);
    ctx.scale(horizontal ? -1 : 1, vertical ? -1 : 1);
    ctx.drawImage(sourceCanvas, 0, 0);

    return flipped;
  }
}
