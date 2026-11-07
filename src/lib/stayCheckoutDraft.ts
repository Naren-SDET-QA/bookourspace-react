/** Session draft so Google sign-in can return to the same Stay 1 / Stay 2 checkout. */

export const STAY_CHECKOUT_DRAFT_KEY = 'bos_stay_checkout_v1';

export type StayCheckoutPaymentMode = 'upi' | 'pay_after_service' | 'razorpay';

export interface StayCheckoutDraft {
  stayStyle?: 'old' | 'airbnb';
  listingId?: string;
  item?: unknown;
  property?: unknown;
  checkIn?: string;
  checkOut?: string;
  guests?: number;
  guestName?: string;
  guestPhone?: string;
  guestAddress?: string;
  roomTypeId?: string;
  units?: number;
  paymentMode?: StayCheckoutPaymentMode;
}

export interface StayDraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function defaultStorage(): StayDraftStorage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function readStayCheckoutDraft(storage?: StayDraftStorage | null): StayCheckoutDraft | null {
  const store = storage === undefined ? defaultStorage() : storage;
  if (!store) return null;
  try {
    const raw = store.getItem(STAY_CHECKOUT_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StayCheckoutDraft;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function patchStayCheckoutDraft(
  patch: StayCheckoutDraft,
  storage?: StayDraftStorage | null,
): StayCheckoutDraft {
  const store = storage === undefined ? defaultStorage() : storage;
  const current = readStayCheckoutDraft(store) || {};
  const next: StayCheckoutDraft = { ...current };
  for (const [key, value] of Object.entries(patch) as Array<[keyof StayCheckoutDraft, StayCheckoutDraft[keyof StayCheckoutDraft]]>) {
    if (value !== undefined) next[key] = value as never;
  }
  if (!store) return next;
  try {
    store.setItem(STAY_CHECKOUT_DRAFT_KEY, JSON.stringify(next));
  } catch {
    /* private mode */
  }
  return next;
}

export function clearStayCheckoutDraft(storage?: StayDraftStorage | null): void {
  const store = storage === undefined ? defaultStorage() : storage;
  try {
    store?.removeItem(STAY_CHECKOUT_DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

export function stayCheckoutDraftPending(storage?: StayDraftStorage | null): boolean {
  const draft = readStayCheckoutDraft(storage);
  return Boolean(draft?.listingId || draft?.item || draft?.property);
}
