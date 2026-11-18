import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  buildTrackingShareMessage,
  canAccessTrackingLink,
  isTrackingTokenFormat,
  publicTrackingUrl,
  readPublicTrackingToken,
  sanitizePublicTrackingSnapshot,
  trackingUrlContainsSecrets,
  whatsappShareHref,
} from '../src/lib/trackingShare.ts';
import { generateTrackingToken, hashTrackingToken } from '../src/server/trackingToken.ts';

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('tracking tokens are unguessable hashed secrets without booking IDs or coordinates', () => {
  const token = generateTrackingToken(() => Buffer.alloc(32, 7));
  assert.equal(isTrackingTokenFormat(token), true);
  assert.equal(hashTrackingToken(token).length, 64);
  assert.notEqual(hashTrackingToken(token), token);
  const url = publicTrackingUrl('https://bookourspace.com', token);
  assert.equal(url, `https://bookourspace.com/track/${token}`);
  assert.equal(trackingUrlContainsSecrets(url), false);
  assert.equal(trackingUrlContainsSecrets(`${url}?lat=17.4`), true);
  assert.equal(trackingUrlContainsSecrets(`https://bookourspace.com/track/${token}/c0a11e00-1111-4111-8111-000000000101`), true);
  assert.equal(readPublicTrackingToken({ pathname: `/track/${token}`, hash: '' }), token);
  assert.equal(readPublicTrackingToken({ pathname: '/', hash: `#track/${token}` }), token);
});

test('expired, revoked and terminal bookings cannot use a tracking link', () => {
  assert.equal(canAccessTrackingLink({ status: 'accepted' }), true);
  assert.equal(canAccessTrackingLink({ status: 'travelling' }), true);
  assert.equal(canAccessTrackingLink({ status: 'completed' }), false);
  assert.equal(canAccessTrackingLink({ status: 'cancelled' }), false);
  assert.equal(canAccessTrackingLink({ status: 'accepted', revokedAt: '2026-11-18T00:00:00.000Z' }), false);
  assert.equal(canAccessTrackingLink({
    status: 'accepted',
    expiresAt: '2020-01-01T00:00:00.000Z',
    now: Date.parse('2026-11-18T00:00:00.000Z'),
  }), false);
});

test('public snapshots strip identities and share copy stays booking-scoped', () => {
  const clean = sanitizePublicTrackingSnapshot({
    bookingRef: 'BOS-1',
    customerId: 'secret-customer',
    providerId: 'secret-provider',
    assigneeId: 'secret-assignee',
    assigneeLabel: 'secret-name',
    events: [{ id: 1 }],
    latestLocation: { latitude: 17.4, longitude: 78.3 },
  });
  assert.equal(clean.customerId, undefined);
  assert.equal(clean.providerId, undefined);
  assert.equal(clean.assigneeId, undefined);
  assert.equal(clean.assigneeLabel, undefined);
  assert.equal(clean.events, undefined);
  assert.equal(clean.bookingRef, 'BOS-1');
  const message = buildTrackingShareMessage({ bookingRef: 'BOS-1', trackingUrl: 'https://bookourspace.com/track/abc' });
  assert.match(message, /BOS-1/);
  assert.match(whatsappShareHref(message), /^https:\/\/wa\.me\/\?text=/);
});

test('share APIs, panel and migration stay booking-scoped and hashed', () => {
  const sql = source('supabase/migrations/20261118200000_service_tracking_share_links.sql');
  assert.match(sql, /token_hash text not null unique/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on table public\.service_tracking_links from public, anon/);
  assert.doesNotMatch(sql, /grant select on table public\.service_tracking_links to anon/);
  assert.match(source('src/components/tracking/DeliveryTrackingPanel.tsx'), /TrackingShareBar/);
  assert.match(source('src/components/tracking/TrackingShareBar.tsx'), /Copy Tracking Link/);
  assert.match(source('src/components/tracking/TrackingShareBar.tsx'), /Share Tracking Link/);
  assert.match(source('src/components/tracking/TrackingShareBar.tsx'), /Share on WhatsApp/);
  assert.match(source('src/server/trackingShareApi.ts'), /\/api\/track\/:token/);
  assert.doesNotMatch(source('src/server/trackingShareApi.ts'), /WHATSAPP_ACCESS_TOKEN/);
  assert.match(source('src/server/trackingShareApi.ts'), /notifyBookingConfirmedIfNeeded/);
  assert.match(source('src/server/serviceBookingRepository.ts'), /ensureTrackingShareLinkOnAccept/);
});
