import { MediaInspectionError, inspectMediaFile } from './inspection';
import { sanitizeSvgFile } from './sanitizeSvg';

export interface ImageVariant {
  width: number;
  height: number;
  mimeType: string;
  file: File;
}

export interface ProcessedImage {
  original: File;
  width: number;
  height: number;
  variants: ImageVariant[];
}

const TARGET_WIDTHS = [160, 400, 800, 1200, 1920] as const;

/** Create smaller AVIF derivatives where supported, otherwise WebP. The original is always returned and
 * never mutated; GIF remains animated and unsupported decoders fail closed. */
export async function createResponsiveImageVariants(file: File): Promise<ProcessedImage> {
  const inspected = await inspectMediaFile(file);
  if (inspected.kind !== 'image') throw new MediaInspectionError('IMAGE_REQUIRED', 'Choose an image file.');
  if (inspected.format === 'gif') {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => null);
    if (!bitmap) throw new MediaInspectionError('IMAGE_DECODE_UNAVAILABLE', 'This GIF cannot be decoded for a preview.');
    const result = { original: file, width: bitmap.width, height: bitmap.height, variants: [] };
    bitmap.close();
    return result;
  }
  const source = inspected.format === 'svg' ? await sanitizeSvgFile(file) : file;
  if (inspected.format === 'svg') {
    const markup = await source.text();
    const viewBox = /\bviewBox\s*=\s*["']\s*[-\d.]+[ ,]+[-\d.]+[ ,]+([\d.]+)[ ,]+([\d.]+)\s*["']/i.exec(markup);
    const widthAttr = /\bwidth\s*=\s*["']([\d.]+)/i.exec(markup);
    const heightAttr = /\bheight\s*=\s*["']([\d.]+)/i.exec(markup);
    return {
      original: source,
      width: Number(widthAttr?.[1] ?? viewBox?.[1] ?? 0),
      height: Number(heightAttr?.[1] ?? viewBox?.[2] ?? 0),
      variants: [],
    };
  }
  const bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' }).catch(() => null);
  if (!bitmap) throw new MediaInspectionError('IMAGE_DECODE_UNAVAILABLE', 'This image format is not supported by this device for safe conversion.');
  try {
    const variants: ImageVariant[] = [];
    for (const width of TARGET_WIDTHS) {
      if (width >= bitmap.width) continue; // never upscale.
      const height = Math.max(1, Math.round(bitmap.height * width / bitmap.width));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { alpha: true });
      if (!context) throw new MediaInspectionError('CANVAS_UNAVAILABLE', 'Image conversion is unavailable on this device.');
      context.drawImage(bitmap, 0, 0, width, height);
      const encode = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.9));
      const avif = await encode('image/avif');
      const blob = avif?.type === 'image/avif' ? avif : await encode('image/webp');
      if (!blob || (blob.type !== 'image/avif' && blob.type !== 'image/webp')) {
        canvas.width = 0;
        canvas.height = 0;
        break;
      }
      // Never keep a larger derivative; the unmodified source remains available.
      if (blob.size >= source.size) {
        canvas.width = 0;
        canvas.height = 0;
        continue;
      }
      const extension = blob.type === 'image/avif' ? 'avif' : 'webp';
      variants.push({
        width,
        height,
        mimeType: blob.type,
        file: new File([blob], `${file.name.replace(/\.[^.]*$/, '')}-${width}.${extension}`, { type: blob.type, lastModified: file.lastModified }),
      });
      canvas.width = 0;
      canvas.height = 0;
    }
    return { original: file, width: bitmap.width, height: bitmap.height, variants };
  } finally {
    bitmap.close();
  }
}
