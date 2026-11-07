import { MediaInspectionError } from './inspection';

const ELEMENTS = new Set([
  'svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
  'defs', 'linearGradient', 'radialGradient', 'stop', 'clipPath', 'mask', 'title', 'desc',
]);
const ATTRIBUTES = new Set([
  'xmlns', 'width', 'height', 'viewBox', 'preserveAspectRatio', 'id', 'fill', 'fill-rule',
  'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray',
  'stroke-dashoffset', 'opacity', 'fill-opacity', 'stroke-opacity', 'transform', 'd', 'points',
  'x', 'y', 'x1', 'x2', 'y1', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'offset', 'stop-color',
  'stop-opacity', 'gradientUnits', 'gradientTransform', 'clip-rule', 'clip-path', 'mask',
]);

/** Keep SVG as an image-only allowlist: no scripts, style blocks, links, foreign
 * content, event handlers, CSS, or external references survive serialization. */
export function sanitizeSvgMarkup(markup: string): string {
  if (markup.length > 1024 * 1024) {
    throw new MediaInspectionError('SVG_TOO_LARGE', 'SVG files must be no larger than 1 MB.');
  }
  if (typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') {
    throw new MediaInspectionError('SVG_SANITIZER_UNAVAILABLE', 'A secure SVG parser is unavailable in this runtime.');
  }
  const document = new DOMParser().parseFromString(markup, 'image/svg+xml');
  if (document.querySelector('parsererror') || document.documentElement.localName.toLowerCase() !== 'svg') {
    throw new MediaInspectionError('SVG_INVALID', 'The SVG document is malformed.');
  }

  const visit = (element: Element): void => {
    for (const child of Array.from(element.children)) {
      if (!ELEMENTS.has(child.localName)) {
        child.remove();
        continue;
      }
      visit(child);
    }
    for (const attr of Array.from(element.attributes)) {
      const value = attr.value.trim();
      const isSvgNamespace = attr.name === 'xmlns' && value === 'http://www.w3.org/2000/svg';
      const isSafeReference = !/url\s*\(/i.test(value) || /^url\(\s*#[A-Za-z_][\w:.-]*\s*\)$/i.test(value);
      if (!ATTRIBUTES.has(attr.name) || /^on/i.test(attr.name) || !isSafeReference || (!isSvgNamespace && /(?:javascript|data|https?):/i.test(value))) {
        element.removeAttribute(attr.name);
      }
    }
  };
  visit(document.documentElement);
  const output = new XMLSerializer().serializeToString(document.documentElement);
  if (/<(?:script|foreignObject|iframe|object|embed)\b|\son\w+\s*=|\b(?:href|src)\s*=\s*["']?(?:javascript:|data:|https?:)/i.test(output)) {
    throw new MediaInspectionError('SVG_UNSAFE_CONTENT', 'The SVG contains content that cannot be safely removed.');
  }
  return output;
}

export async function sanitizeSvgFile(file: File): Promise<File> {
  const markup = await file.text();
  const safe = sanitizeSvgMarkup(markup);
  return new File([safe], file.name.replace(/\.[^.]*$/, '') + '.svg', { type: 'image/svg+xml', lastModified: file.lastModified });
}
