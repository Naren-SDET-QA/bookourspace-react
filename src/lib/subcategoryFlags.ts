import {
  loadMarketplaceVisibility,
  saveMarketplaceVisibilityPatch,
  SUBCATEGORY_FLAGS_EVENT,
  type VisibilitySaveResult,
} from './marketplaceVisibility';

export { SUBCATEGORY_FLAGS_EVENT };

function normalise(name: string): string {
  return (name || '').trim().toLocaleLowerCase();
}

export function isSubcategoryEnabled(name: string): boolean {
  const target = normalise(name);
  if (!target) return true;
  return !loadMarketplaceVisibility().disabledSubcategories.some((value) => normalise(value) === target);
}

export async function setSubcategoryEnabled(name: string, enabled: boolean): Promise<VisibilitySaveResult> {
  const trimmed = name.trim();
  if (!trimmed) return 'failed';
  const current = loadMarketplaceVisibility().disabledSubcategories;
  const disabled = current.filter((value) => normalise(value) !== normalise(trimmed));
  if (!enabled) disabled.push(trimmed);
  return saveMarketplaceVisibilityPatch({ disabledSubcategories: disabled });
}

export function getDisabledSubcategories(): string[] {
  return loadMarketplaceVisibility().disabledSubcategories;
}
