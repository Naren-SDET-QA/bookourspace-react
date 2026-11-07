/**
 * Global subcategory enable/disable flags controlled from the Admin console.
 * Shares the same store used by the spotlight subcategory strip so an admin
 * toggle in Content Management → Categories immediately hides the chip in the
 * public marketplace bar.
 */

const KEY = 'bos_disabled_spotlight_subcategories_v1';
export const SUBCATEGORY_FLAGS_EVENT = 'bos-subcategory-flags-changed';

function read(): string[] {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map((s) => String(s)) : [];
  } catch {
    return [];
  }
}

function write(list: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable */
  }
  try {
    window.dispatchEvent(new Event(SUBCATEGORY_FLAGS_EVENT));
  } catch {
    /* no window */
  }
}

export function isSubcategoryEnabled(name: string): boolean {
  if (!name) return true;
  const target = name.trim().toLowerCase();
  return !read().some((s) => s.trim().toLowerCase() === target);
}

export function setSubcategoryEnabled(name: string, enabled: boolean) {
  const trimmed = name.trim();
  if (!trimmed) return;
  const current = read();
  const exists = current.some((s) => s.trim().toLowerCase() === trimmed.toLowerCase());
  if (enabled) {
    write(current.filter((s) => s.trim().toLowerCase() !== trimmed.toLowerCase()));
  } else if (!exists) {
    write([...current, trimmed]);
  }
}

export function getDisabledSubcategories(): string[] {
  return read();
}
