import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  bookingConfirmedCopy,
  getWhatsAppSetupStatus,
  normalizeWhatsAppRecipient,
  providerOnTheWayCopy,
  sendWhatsAppBookingMessage,
  sendWhatsAppBookingMessageWithRetry,
} from '../src/server/whatsappBookingNotifications.ts';

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('WhatsApp booking messages stay gated on opt-in, templates and server secrets', () => {
  const status = getWhatsAppSetupStatus({});
  assert.equal(status.sendEnabled, false);
  assert.ok(status.blockedReasons.includes('WHATSAPP_ACCESS_TOKEN_MISSING'));
  assert.equal(normalizeWhatsAppRecipient('9966191813'), '919966191813');
  assert.match(bookingConfirmedCopy('BOS-9', 'https://bookourspace.com/track/x'), /Booking reference: BOS-9/);
  assert.match(providerOnTheWayCopy('https://bookourspace.com/track/x'), /on the way/i);
  assert.doesNotMatch(source('src/server/whatsappBookingNotifications.ts'), /VITE_WHATSAPP/);
  assert.match(source('.env.example'), /WHATSAPP_TEMPLATE_BOOKING_CONFIRMED/);
  assert.match(source('src/server/serviceBookingApi.ts'), /notifyProviderOnTheWayIfNeeded/);
  assert.match(source('src/server/serviceBookingApi.ts'), /notifyBookingConfirmedIfNeeded/);
  assert.match(source('src/server/trackingShareApi.ts'), /isLiveDeliveryStatus\(state\.status\)/);
  assert.doesNotMatch(source('src/server/trackingShareApi.ts'), /state\.status !== 'requested'/);
  assert.match(source('src/server/serviceBookingRepository.ts'), /ensureTrackingShareLinkOnAccept/);
  assert.match(source('src/components/ServiceBookingPanel.tsx'), /whatsappOptIn/);
});

test('WhatsApp sender skips duplicates and missing opt-in without calling Meta', async () => {
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'wamid.1' }] }), text: async () => '' };
  };
  const skippedOptIn = await sendWhatsAppBookingMessage({
    event: 'booking_confirmed', to: '9966191813', bookingRef: 'BOS-1',
    trackingUrl: 'https://bookourspace.com/track/x', optIn: false, alreadySent: false,
  }, {}, fetcher);
  assert.equal(skippedOptIn.skipped, true);
  const skippedDup = await sendWhatsAppBookingMessage({
    event: 'provider_on_the_way', to: '9966191813', bookingRef: 'BOS-1',
    trackingUrl: 'https://bookourspace.com/track/x', optIn: true, alreadySent: true,
  }, {}, fetcher);
  assert.equal(skippedDup.error, 'WHATSAPP_ALREADY_SENT');
  assert.equal(calls, 0);
});

test('WhatsApp retries provider failures and never invents credentials', async () => {
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    return { ok: false, status: 503, json: async () => ({}), text: async () => 'down' };
  };
  const env = {
    WHATSAPP_SEND_ENABLED: '1',
    WHATSAPP_ACCESS_TOKEN: 'test-token',
    WHATSAPP_PHONE_NUMBER_ID: '123',
    WHATSAPP_TEMPLATE_BOOKING_CONFIRMED: 'bos_booking_confirmed',
    WHATSAPP_TEMPLATE_PROVIDER_ON_THE_WAY: 'bos_provider_on_the_way',
  };
  const result = await sendWhatsAppBookingMessageWithRetry({
    event: 'booking_confirmed', to: '9966191813', bookingRef: 'BOS-1',
    trackingUrl: 'https://bookourspace.com/track/x', optIn: true, alreadySent: false,
  }, env, fetcher, 3);
  assert.equal(result.ok, false);
  assert.equal(calls, 3);
  assert.equal(getWhatsAppSetupStatus({}).configured, false);
});
