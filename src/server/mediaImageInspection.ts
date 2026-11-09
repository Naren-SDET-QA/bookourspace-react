import { createHash } from 'node:crypto';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import sharp from 'sharp';
import { inspectMediaBytes, type MediaFormat } from '../lib/media/inspection';

export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 40_000_000;
export const MAX_IMAGE_DIMENSION = 12_000;

const SVG_ELEMENTS = new Set([
  'svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
  'defs', 'linearGradient', 'radialGradient', 'stop', 'clipPath', 'mask', 'title', 'desc',
]);
const SVG_ATTRIBUTES = new Set([
  'xmlns', 'width', 'height', 'viewBox', 'preserveAspectRatio', 'id', 'fill', 'fill-rule',
  'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray',
  'stroke-dashoffset', 'opacity', 'fill-opacity', 'stroke-opacity', 'transform', 'd', 'points',
  'x', 'y', 'x1', 'x2', 'y1', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'offset', 'stop-color',
  'stop-opacity', 'gradientUnits', 'gradientTransform', 'clip-rule', 'clip-path', 'mask',
]);

export interface InspectedServerImage {
  format: Extract<MediaFormat, 'jpeg' | 'png' | 'webp' | 'avif' | 'heic' | 'gif' | 'svg'>;
  mimeType: string;
  width: number;
  height: number;
  bytes: number;
  sha256: string;
  sanitizedBytes: Buffer;
}

function sanitizeSvg(bytes: Buffer): Buffer {
  if (bytes.length > 1024 * 1024) throw new Error('MEDIA_SVG_TOO_LARGE');
  const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error('MEDIA_SVG_DTD_FORBIDDEN');
  const parser = new DOMParser({
    onError: () => { throw new Error('MEDIA_SVG_XML_INVALID'); },
  });
  const document = parser.parseFromString(source, 'image/svg+xml');
  const root = document.documentElement;
  if (!root || root.localName !== 'svg' || root.nodeName.includes(':')) throw new Error('MEDIA_SVG_ROOT_INVALID');
  if (root.getAttribute('xmlns') !== 'http://www.w3.org/2000/svg') throw new Error('MEDIA_SVG_NAMESPACE_INVALID');

  const inspectNode = (node: any, insideText: boolean) => {
    if (node.nodeType === 1) {
      const element = node;
      if (element.prefix || !SVG_ELEMENTS.has(element.localName)) throw new Error('MEDIA_SVG_ELEMENT_FORBIDDEN');
      for (let i = 0; i < element.attributes.length; i += 1) {
        const attribute = element.attributes.item(i)!;
        const name = attribute.name;
        const value = attribute.value.trim();
        if (attribute.prefix || !SVG_ATTRIBUTES.has(name) || /[\u0000-\u001f\u007f]/.test(value)) {
          throw new Error('MEDIA_SVG_ATTRIBUTE_FORBIDDEN');
        }
        if (name === 'xmlns') {
          if (value !== 'http://www.w3.org/2000/svg') throw new Error('MEDIA_SVG_NAMESPACE_INVALID');
          continue;
        }
        if (/url\s*\(/i.test(value) && !/^url\(\s*#[A-Za-z_][\w:.-]*\s*\)$/.test(value)) {
          throw new Error('MEDIA_SVG_EXTERNAL_REFERENCE_FORBIDDEN');
        }
        if (/javascript:|data:|https?:|file:|@import|expression\s*\(/i.test(value)) {
          throw new Error('MEDIA_SVG_ACTIVE_VALUE_FORBIDDEN');
        }
      }
      for (let child = element.firstChild; child; child = child.nextSibling) {
        inspectNode(child, element.localName === 'title' || element.localName === 'desc');
      }
      return;
    }
    if (node.nodeType === 3) {
      if (!insideText && (node.nodeValue || '').trim()) throw new Error('MEDIA_SVG_TEXT_NODE_FORBIDDEN');
      return;
    }
    // Comments, processing instructions, CDATA, and entity references are not
    // needed for an image-only SVG and are rejected rather than preserved.
    if (node.nodeType !== 9 && node.nodeType !== 11) throw new Error('MEDIA_SVG_NODE_FORBIDDEN');
    for (let child = node.firstChild; child; child = child.nextSibling) inspectNode(child, insideText);
  };
  inspectNode(document, false);
  return Buffer.from(new XMLSerializer().serializeToString(document), 'utf8');
}

/** Verify content signatures, parse and fully decode bytes server-side, and
 * reject oversized, malformed, animated, or active SVG payloads. The source
 * bytes are returned unchanged except that safe SVG is canonicalized. */
export async function inspectServerImage(input: Uint8Array): Promise<InspectedServerImage> {
  const original = Buffer.from(input);
  if (!original.length || original.length > MAX_IMAGE_BYTES) throw new Error('MEDIA_IMAGE_SIZE_INVALID');
  const detected = inspectMediaBytes(original);
  if (detected.kind !== 'image') throw new Error('MEDIA_IMAGE_REQUIRED');
  if (!['jpeg', 'png', 'webp', 'avif', 'heic', 'gif', 'svg'].includes(detected.format)) {
    throw new Error('MEDIA_IMAGE_FORMAT_UNSUPPORTED');
  }

  const safeBytes = detected.format === 'svg' ? sanitizeSvg(original) : original;
  const decoder = sharp(safeBytes, {
    failOn: 'error',
    limitInputPixels: MAX_IMAGE_PIXELS,
    animated: true,
    density: 72,
  });
  const metadata = await decoder.metadata();
  let width = metadata.width || 0;
  let height = metadata.pageHeight || metadata.height || 0;
  if ([5, 6, 7, 8].includes(metadata.orientation || 0)) [width, height] = [height, width];
  const pages = metadata.pages || 1;
  const pixels = width * height * pages;
  if (!width || !height || width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION ||
      pages > (detected.format === 'gif' ? 100 : 1) || pixels > MAX_IMAGE_PIXELS) {
    throw new Error('MEDIA_IMAGE_DIMENSIONS_INVALID');
  }
  const decoderFormat = metadata.format === 'heif' && (detected.format === 'avif' || detected.format === 'heic')
    ? detected.format
    : metadata.format;
  if (decoderFormat !== detected.format) throw new Error('MEDIA_IMAGE_SIGNATURE_DECODE_MISMATCH');

  // Force a full pixel decode rather than accepting header metadata alone.
  await decoder.rotate().resize({ width: 1, height: 1, fit: 'inside', withoutEnlargement: true }).raw().toBuffer();
  const mimeType = detected.mimeType;
  return {
    format: detected.format as InspectedServerImage['format'],
    mimeType,
    width,
    height,
    bytes: original.length,
    sha256: createHash('sha256').update(original).digest('hex'),
    sanitizedBytes: safeBytes,
  };
}

/** Compare a derivative to a same-sized Lanczos downsample of the preserved
 * original. Reject variants below a conservative 30 dB PSNR floor so very
 * aggressive lossy encodes are never made customer-visible. */
export async function assertVariantVisualQuality(originalBytes: Uint8Array, variantBytes: Uint8Array): Promise<number> {
  const originalMeta = await sharp(originalBytes, { failOn: 'error', limitInputPixels: MAX_IMAGE_PIXELS }).metadata();
  const variantMeta = await sharp(variantBytes, { failOn: 'error', limitInputPixels: MAX_IMAGE_PIXELS }).metadata();
  const width = variantMeta.width || 0;
  const height = variantMeta.height || 0;
  const originalWidth = originalMeta.width || 0;
  const originalHeight = originalMeta.height || 0;
  const orientedOriginalWidth = [5, 6, 7, 8].includes(originalMeta.orientation || 0) ? originalHeight : originalWidth;
  const orientedOriginalHeight = [5, 6, 7, 8].includes(originalMeta.orientation || 0) ? originalWidth : originalHeight;
  if (!width || !height || !orientedOriginalWidth || !orientedOriginalHeight || width > orientedOriginalWidth || height > orientedOriginalHeight ||
      Math.abs((width / height) - (orientedOriginalWidth / orientedOriginalHeight)) > 0.01) {
    throw new Error('MEDIA_VARIANT_GEOMETRY_INVALID');
  }
  const [reference, actual] = await Promise.all([
    sharp(originalBytes, { failOn: 'error', limitInputPixels: MAX_IMAGE_PIXELS })
      .rotate().resize(width, height, { fit: 'fill', kernel: 'lanczos3', fastShrinkOnLoad: false })
      .removeAlpha().toColourspace('srgb').raw().toBuffer(),
    sharp(variantBytes, { failOn: 'error', limitInputPixels: MAX_IMAGE_PIXELS })
      .rotate().removeAlpha().toColourspace('srgb').raw().toBuffer(),
  ]);
  if (reference.length !== actual.length || reference.length === 0) throw new Error('MEDIA_VARIANT_DECODE_MISMATCH');
  let squaredError = 0;
  for (let index = 0; index < reference.length; index += 1) {
    const delta = reference[index] - actual[index];
    squaredError += delta * delta;
  }
  const meanSquaredError = squaredError / reference.length;
  const psnr = meanSquaredError === 0 ? Number.POSITIVE_INFINITY : 10 * Math.log10((255 * 255) / meanSquaredError);
  if (psnr < 30) throw new Error('MEDIA_VARIANT_VISUAL_QUALITY_TOO_LOW');
  return psnr;
}
