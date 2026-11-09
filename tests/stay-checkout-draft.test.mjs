import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  clearStayCheckoutDraft,
  patchStayCheckoutDraft,
  readStayCheckoutDraft,
  stayCheckoutDraftPending,
  STAY_CHECKOUT_DRAFT_KEY,
} from '../src/lib/stayCheckoutDraft.ts';

function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); },
    map,
  };
}

test('stay checkout draft merges guest details without dropping the listing', () => {
  const storage = memoryStorage();
  patchStayCheckoutDraft({ stayStyle: 'airbnb', listingId: 'stay-1', item: { id: 'p1', listingId: 'stay-1' }, checkIn: '2026-12-01', checkOut: '2026-12-03', guests: 2 }, storage);
  patchStayCheckoutDraft({ guestName: 'Ada Lovelace', guestPhone: '9876543210', paymentMode: 'pay_after_service' }, storage);
  const draft = readStayCheckoutDraft(storage);
  assert.equal(draft.listingId, 'stay-1');
  assert.equal(draft.item.id, 'p1');
  assert.equal(draft.guestName, 'Ada Lovelace');
  assert.equal(draft.paymentMode, 'pay_after_service');
  assert.equal(stayCheckoutDraftPending(storage), true);
  clearStayCheckoutDraft(storage);
  assert.equal(readStayCheckoutDraft(storage), null);
  assert.equal(storage.map.has(STAY_CHECKOUT_DRAFT_KEY), false);
});

test('Stay 1 and Stay 2 checkout keep Continue with Google and Confirm Reservation', async () => {
  const panel = await readFile(new URL('../src/components/StayCheckoutPanel.tsx', import.meta.url), 'utf8');
  const detail = await readFile(new URL('../src/components/stay/StayDetail.tsx', import.meta.url), 'utf8');
  const page = await readFile(new URL('../src/components/stay/StayCheckoutPage.tsx', import.meta.url), 'utf8');
  const stay1 = await readFile(new URL('../src/components/HotelsStayExperience.tsx', import.meta.url), 'utf8');
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(panel, /Continue with Google/);
  assert.match(panel, /Confirm Reservation/);
  assert.match(panel, /verifyStayRazorpayPayment/);
  assert.match(panel, /paymentMode === 'pay_after_service'/);
  assert.doesNotMatch(detail, /Sign in to book/);
  assert.match(detail, /onReserve\(\)/);
  assert.match(page, /Continue with Google/);
  assert.match(stay1, /onSignIn=\{onSignIn\}/);
  assert.match(app, /stayStyle === 'old' \? '#stays\/old' : '#stays'/);
});
