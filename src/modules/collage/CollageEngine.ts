import type { CollageCell, CollageConfig, Rect } from '../../types';

export class CollageEngine {
  public static calculateBoardSize(
    aspectRatio: '1:1' | '4:5' | '16:9' | '9:16' | '4:3',
    baseSize: number = 1600
  ): { width: number; height: number } {
    let ratio = 1;
    switch (aspectRatio) {
      case '1:1': ratio = 1; break;
      case '4:5': ratio = 4 / 5; break;
      case '16:9': ratio = 16 / 9; break;
      case '9:16': ratio = 9 / 16; break;
      case '4:3': ratio = 4 / 3; break;
    }

    if (ratio >= 1) {
      return { width: baseSize, height: Math.round(baseSize / ratio) };
    } else {
      return { width: Math.round(baseSize * ratio), height: baseSize };
    }
  }

  public static calculateGridCells(
    boardWidth: number,
    boardHeight: number,
    config: CollageConfig
  ): Rect[] {
    const { rows, cols, margin, gap } = config;
    const availW = boardWidth - margin * 2 - gap * (cols - 1);
    const availH = boardHeight - margin * 2 - gap * (rows - 1);

    const cellW = availW / cols;
    const cellH = availH / rows;

    const cells: Rect[] = [];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        cells.push({
          x: margin + c * (cellW + gap),
          y: margin + r * (cellH + gap),
          width: cellW,
          height: cellH,
        });
      }
    }

    return cells;
  }

  public static renderCollage(
    config: CollageConfig,
    cells: CollageCell[],
    baseSize: number = 1600
  ): HTMLCanvasElement {
    const boardDims = this.calculateBoardSize(config.aspectRatio, baseSize);
    const canvas = document.createElement('canvas');
    canvas.width = boardDims.width;
    canvas.height = boardDims.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // 1. Draw Background
    if (config.bgType === 'solid') {
      ctx.fillStyle = config.bgColor || '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else if (config.bgType === 'gradient') {
      const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      grad.addColorStop(0, '#06b6d4');
      grad.addColorStop(1, '#8b5cf6');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } // If transparent, leave blank

    // 2. Calculate cell bounds
    const gridRects = this.calculateGridCells(canvas.width, canvas.height, config);

    // 3. Draw each cell
    gridRects.forEach((rect, idx) => {
      const cellData = cells[idx];

      ctx.save();

      // Clip with rounded rectangle
      ctx.beginPath();
      if (config.radius > 0) {
        ctx.roundRect(rect.x, rect.y, rect.width, rect.height, config.radius);
      } else {
        ctx.rect(rect.x, rect.y, rect.width, rect.height);
      }
      ctx.clip();

      if (cellData && cellData.image) {
        const img = cellData.image;

        // Calculate aspect fill
        const imgRatio = img.naturalWidth / img.naturalHeight;
        const cellRatio = rect.width / rect.height;

        let drawW = rect.width;
        let drawH = rect.height;

        if (imgRatio > cellRatio) {
          drawW = rect.height * imgRatio;
        } else {
          drawH = rect.width / imgRatio;
        }

        drawW *= (cellData.zoom || 1);
        drawH *= (cellData.zoom || 1);

        const centerX = rect.x + rect.width / 2 + (cellData.offsetX || 0);
        const centerY = rect.y + rect.height / 2 + (cellData.offsetY || 0);

        ctx.translate(centerX, centerY);
        if (cellData.rotation) {
          ctx.rotate((cellData.rotation * Math.PI) / 180);
        }

        ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
      } else {
        // Empty cell placeholder
        ctx.fillStyle = '#f1f5f9';
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

        ctx.fillStyle = '#94a3b8';
        ctx.font = 'bold 24px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`+ Ô ${idx + 1}`, rect.x + rect.width / 2, rect.y + rect.height / 2);
      }

      ctx.restore();
    });

    return canvas;
  }
}
