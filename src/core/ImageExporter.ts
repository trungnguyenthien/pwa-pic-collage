import type { ExportOptions } from '../types';

export class ImageExporter {
  public static async exportCanvas(
    canvas: HTMLCanvasElement,
    options: ExportOptions
  ): Promise<{ blob: Blob; url: string }> {
    let wakeLock: any = null;
    try {
      if ('wakeLock' in navigator && (navigator as any).wakeLock) {
        wakeLock = await (navigator as any).wakeLock.request('screen').catch(() => null);
      }
    } catch {
      // Ignore wake lock failure if not permitted
    }

    try {
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => {
            if (b) resolve(b);
            else reject(new Error('Failed to generate image blob'));
          },
          options.format,
          options.quality
        );
      });

      const url = URL.createObjectURL(blob);
      return { blob, url };
    } finally {
      if (wakeLock) {
        try {
          await wakeLock.release();
        } catch {
          // Ignore
        }
      }
    }
  }

  public static async downloadOrShare(
    blob: Blob,
    fileName: string,
    onSuccess?: () => void,
    onError?: (err: any) => void
  ): Promise<void> {
    const file = new File([blob], fileName, { type: blob.type });

    // iOS Safari & Mobile Share Target: Prefer Web Share API if file sharing is supported
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: 'PicStudio Image',
          text: 'Chỉnh sửa bởi PicStudio PWA',
        });
        if (onSuccess) onSuccess();
        return;
      } catch (err: any) {
        if (err.name === 'AbortError') {
          // User cancelled sharing sheet, not an error
          return;
        }
        console.warn('Web Share failed, falling back to download link:', err);
      }
    }

    // Android / Desktop Chrome Fallback: Temporary <a> click
    try {
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Revoke Object URL safely after a delay
      setTimeout(() => {
        URL.revokeObjectURL(blobUrl);
      }, 60000);

      if (onSuccess) onSuccess();
    } catch (e) {
      if (onError) onError(e);
      else alert('Không thể tải tệp xuống máy.');
    }
  }

  public static formatBytes(bytes: number, decimals: number = 1): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }
}
