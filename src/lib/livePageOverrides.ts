import type { InspectedDomElementOverride, LivePageEditorConfig } from '../utils/livePageEditorStore';

/**
 * Stable DOM key for admin inline edits.
 *
 * The old key contained `Date.now()`, so a published text override could never
 * find its element after a reload. A structural path (tag + nth-of-type) is
 * reproducible, and the original text is kept as a fallback when the DOM shape
 * shifts between an authenticated admin and an anonymous visitor.
 */
export function buildStableDomKey(pageId: string, element: HTMLElement): string {
  const parts: string[] = [];
  let node: HTMLElement | null = element;
  while (node && node !== document.body && node.parentElement) {
    const parent: HTMLElement = node.parentElement;
    const tag = node.tagName.toLowerCase();
    const siblings = Array.from(parent.children).filter((child) => child.tagName === node!.tagName);
    const index = siblings.indexOf(node) + 1;
    parts.unshift(`${tag}:nth-of-type(${index})`);
    node = parent;
  }
  return `path:${pageId}:${parts.join('>')}`;
}

function selectorFor(override: InspectedDomElementOverride): string | null {
  if (override.selectorKey.startsWith('path:')) {
    const prefix = `path:${override.pageId}:`;
    if (!override.selectorKey.startsWith(prefix)) return null;
    const selector = override.selectorKey.slice(prefix.length);
    return selector || null;
  }
  return `[data-bos-dom-key="${override.selectorKey.replace(/"/g, '\\"')}"]`;
}

function findTarget(override: InspectedDomElementOverride): HTMLElement | null {
  const selector = selectorFor(override);
  if (selector) {
    try {
      const found = document.querySelector<HTMLElement>(selector);
      if (found) return found;
    } catch {
      // Invalid selectors are ignored; fall back to text matching.
    }
  }
  // Fallback: the page may render a different sibling structure for guests.
  if (override.originalText) {
    const original = override.originalText.trim();
    const candidates = Array.from(
      document.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,p,span,button,a,label,li'),
    );
    const match = candidates.find(
      (element) =>
        !element.closest('[data-bos-live-editor-ui="true"]') &&
        (element.textContent || '').trim() === original,
    );
    if (match) return match;
  }
  return null;
}

/** Apply every published inline override for the active page. */
export function applyLivePageOverrides(config: LivePageEditorConfig | null | undefined, pageId: string): void {
  const overrides = config?.domOverrides || {};
  for (const raw of Object.values(overrides)) {
    const override = raw as InspectedDomElementOverride;
    if (!override?.selectorKey || override.pageId !== pageId) continue;
    const target = findTarget(override);
    if (!target || target.closest('[data-bos-live-editor-ui="true"]')) continue;

    const stamp = [
      override.updatedAt,
      override.customText ?? '',
      override.hidden ? '1' : '0',
      override.customTextColor ?? '',
      override.customBgColor ?? '',
      override.customImageUrl ?? '',
    ].join('|');
    if (target.dataset.bosOverrideStamp === stamp) continue;

    if (override.hidden !== undefined) target.style.display = override.hidden ? 'none' : '';
    if (override.customBgColor) target.style.backgroundColor = override.customBgColor;
    if (override.customTextColor) target.style.color = override.customTextColor;
    if (target.tagName === 'IMG' && override.customImageUrl) {
      (target as HTMLImageElement).src = override.customImageUrl;
    } else if (override.customText !== undefined && target.childNodes.length <= 2 && override.customText.trim()) {
      target.textContent = override.customText;
    }
    target.dataset.bosOverrideStamp = stamp;
  }
}
