import type { Point, Quadrilateral, ScannerOutputPreset } from '../../types';

export class PerspectiveWarp {
  public static distance(p1: Point, p2: Point): number {
    return Math.hypot(p2.x - p1.x, p2.y - p1.y);
  }

  public static calculateTargetDimensions(
    quad: Quadrilateral,
    preset: ScannerOutputPreset = 'auto',
    origWidth: number = 1000,
    origHeight: number = 1000
  ): { width: number; height: number } {
    // Natural dimensions measured from 4 corners
    const topW = this.distance(quad.tl, quad.tr);
    const bottomW = this.distance(quad.bl, quad.br);
    const leftH = this.distance(quad.tl, quad.bl);
    const rightH = this.distance(quad.tr, quad.br);

    let naturalW = Math.max(topW, bottomW);
    let naturalH = Math.max(leftH, rightH);

    if (preset === 'auto') {
      return {
        width: Math.max(100, Math.round(naturalW)),
        height: Math.max(100, Math.round(naturalH)),
      };
    }

    let targetRatio = 1;
    switch (preset) {
      case 'a4-portrait':
        targetRatio = 1 / 1.4142; // A4 portrait
        break;
      case 'a4-landscape':
        targetRatio = 1.4142;     // A4 landscape
        break;
      case 'id-card':
        targetRatio = 85.60 / 53.98; // ISO ID-1
        break;
      case 'receipt':
        targetRatio = 1 / 2.2;    // Long receipt
        break;
      case 'source':
        targetRatio = origWidth / origHeight;
        break;
    }

    let w = naturalW;
    let h = w / targetRatio;
    if (h < naturalH) {
      h = naturalH;
      w = h * targetRatio;
    }

    return {
      width: Math.max(100, Math.round(w)),
      height: Math.max(100, Math.round(h)),
    };
  }

  /**
   * Solves 3x3 homography matrix mapping from destination [0, W]x[0, H] back to source quad (Inverse Homography)
   */
  public static getInverseHomographyMatrix(
    srcQuad: Quadrilateral,
    dstW: number,
    dstH: number
  ): number[] {
    // Destination corners: (0,0), (W,0), (W,H), (0,H)
    // Source corners: tl, tr, br, bl
    const dst = [
      { x: 0, y: 0 },
      { x: dstW, y: 0 },
      { x: dstW, y: dstH },
      { x: 0, y: dstH }
    ];
    const src = [srcQuad.tl, srcQuad.tr, srcQuad.br, srcQuad.bl];

    // Build 8x8 system: A * h = b
    const A: number[][] = [];
    const b: number[] = [];

    for (let i = 0; i < 4; i++) {
      const u = dst[i].x;
      const v = dst[i].y;
      const x = src[i].x;
      const y = src[i].y;

      A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]);
      b.push(x);
      A.push([0, 0, 0, u, v, 1, -u * y, -v * y]);
      b.push(y);
    }

    // Solve Gaussian Elimination
    const h = this.solveGaussian(A, b);
    return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1.0];
  }

  private static solveGaussian(A: number[][], b: number[]): number[] {
    const n = 8;
    for (let i = 0; i < n; i++) {
      // Find pivot
      let maxEl = Math.abs(A[i][i]);
      let maxRow = i;
      for (let k = i + 1; k < n; k++) {
        if (Math.abs(A[k][i]) > maxEl) {
          maxEl = Math.abs(A[k][i]);
          maxRow = k;
        }
      }

      // Swap rows
      for (let k = i; k < n; k++) {
        const tmp = A[maxRow][k];
        A[maxRow][k] = A[i][k];
        A[i][k] = tmp;
      }
      const tmpB = b[maxRow];
      b[maxRow] = b[i];
      b[i] = tmpB;

      // Pivot to 0
      for (let k = i + 1; k < n; k++) {
        const c = -A[k][i] / (A[i][i] || 1e-8);
        for (let j = i; j < n; j++) {
          if (i === j) A[k][j] = 0;
          else A[k][j] += c * A[i][j];
        }
        b[k] += c * b[i];
      }
    }

    // Back substitution
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      x[i] = b[i] / (A[i][i] || 1e-8);
      for (let k = i - 1; k >= 0; k--) {
        b[k] -= A[k][i] * x[i];
      }
    }
    return x;
  }

  /**
   * Warps the source quad into a flat rectified rectangle with bilinear interpolation
   */
  public static warpPerspective(
    sourceCanvas: HTMLCanvasElement,
    quad: Quadrilateral,
    targetWidth: number,
    targetHeight: number
  ): HTMLCanvasElement {
    const srcCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });
    if (!srcCtx) return sourceCanvas;

    const srcW = sourceCanvas.width;
    const srcH = sourceCanvas.height;
    const srcData = srcCtx.getImageData(0, 0, srcW, srcH);
    const srcPixels = srcData.data;

    const outCanvas = document.createElement('canvas');
    outCanvas.width = targetWidth;
    outCanvas.height = targetHeight;
    const outCtx = outCanvas.getContext('2d');
    if (!outCtx) return sourceCanvas;

    const outData = outCtx.createImageData(targetWidth, targetHeight);
    const outPixels = outData.data;

    // Inverse homography matrix
    const H = this.getInverseHomographyMatrix(quad, targetWidth, targetHeight);
    const h0 = H[0], h1 = H[1], h2 = H[2];
    const h3 = H[3], h4 = H[4], h5 = H[5];
    const h6 = H[6], h7 = H[7], h8 = H[8];

    let outIdx = 0;

    for (let y = 0; y < targetHeight; y++) {
      for (let x = 0; x < targetWidth; x++) {
        // Homography projection
        const w = h6 * x + h7 * y + h8;
        const invW = 1.0 / (w || 1e-8);
        const sx = (h0 * x + h1 * y + h2) * invW;
        const sy = (h3 * x + h4 * y + h5) * invW;

        if (sx >= 0 && sx < srcW - 1 && sy >= 0 && sy < srcH - 1) {
          // Bilinear interpolation
          const x0 = Math.floor(sx);
          const y0 = Math.floor(sy);
          const x1 = x0 + 1;
          const y1 = y0 + 1;

          const dx = sx - x0;
          const dy = sy - y0;
          const w00 = (1 - dx) * (1 - dy);
          const w01 = dx * (1 - dy);
          const w10 = (1 - dx) * dy;
          const w11 = dx * dy;

          const idx00 = (y0 * srcW + x0) * 4;
          const idx01 = (y0 * srcW + x1) * 4;
          const idx10 = (y1 * srcW + x0) * 4;
          const idx11 = (y1 * srcW + x1) * 4;

          outPixels[outIdx] = Math.round(
            w00 * srcPixels[idx00] + w01 * srcPixels[idx01] +
            w10 * srcPixels[idx10] + w11 * srcPixels[idx11]
          );
          outPixels[outIdx + 1] = Math.round(
            w00 * srcPixels[idx00 + 1] + w01 * srcPixels[idx01 + 1] +
            w10 * srcPixels[idx10 + 1] + w11 * srcPixels[idx11 + 1]
          );
          outPixels[outIdx + 2] = Math.round(
            w00 * srcPixels[idx00 + 2] + w01 * srcPixels[idx01 + 2] +
            w10 * srcPixels[idx10 + 2] + w11 * srcPixels[idx11 + 2]
          );
          outPixels[outIdx + 3] = 255;
        } else {
          outPixels[outIdx + 3] = 0; // Transparent
        }

        outIdx += 4;
      }
    }

    outCtx.putImageData(outData, 0, 0);
    return outCanvas;
  }
}
