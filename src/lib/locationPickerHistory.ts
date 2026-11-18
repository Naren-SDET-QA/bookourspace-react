/**
 * Location picker overlay history.
 *
 * Opening the picker pushes one same-URL history entry. Browser / Android Back
 * pops that entry and closes only the picker. The section hash is never
 * rewritten, so Services Triangle and Classes Style 4 stay put.
 */
import { useEffect, useRef } from 'react';

export const LOCATION_PICKER_HISTORY_KEY = 'bosLocationPicker';

export function isLocationPickerHistoryState(state: unknown): boolean {
  return Boolean(
    state
    && typeof state === 'object'
    && !Array.isArray(state)
    && (state as Record<string, unknown>)[LOCATION_PICKER_HISTORY_KEY] === true,
  );
}

export function buildLocationPickerHistoryState(previous: unknown): Record<string, unknown> {
  const base = previous && typeof previous === 'object' && !Array.isArray(previous)
    ? { ...(previous as Record<string, unknown>) }
    : {};
  return { ...base, [LOCATION_PICKER_HISTORY_KEY]: true };
}

export function currentLocationUrl(): string {
  if (typeof window === 'undefined') return '';
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

export type LocationPickerHistoryAction = 'push' | 'back' | 'none';

/** Decide how to keep React `open` in sync with history without duplicate entries. */
export function locationPickerHistoryAction(
  open: boolean,
  currentState: unknown,
): LocationPickerHistoryAction {
  const onPicker = isLocationPickerHistoryState(currentState);
  if (open && !onPicker) return 'push';
  if (!open && onPicker) return 'back';
  return 'none';
}

export function applyLocationPickerHistoryAction(
  action: LocationPickerHistoryAction,
  historyLike: Pick<History, 'pushState' | 'back' | 'state'>,
  url: string,
): void {
  if (action === 'push') {
    historyLike.pushState(buildLocationPickerHistoryState(historyLike.state), '', url);
    return;
  }
  if (action === 'back') historyLike.back();
}

/**
 * Keep the location picker on a single history entry.
 * Forward after Back reopens it; explicit close / select pops the same entry.
 */
export function useLocationPickerHistory(
  open: boolean,
  setOpen: (open: boolean) => void,
): void {
  const skipPopRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const action = locationPickerHistoryAction(open, window.history.state);
    if (action === 'back') skipPopRef.current = true;
    applyLocationPickerHistoryAction(action, window.history, currentLocationUrl());
  }, [open]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onPop = () => {
      if (skipPopRef.current) {
        skipPopRef.current = false;
        return;
      }
      setOpen(isLocationPickerHistoryState(window.history.state));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [setOpen]);
}
