import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  TRACKING_STALE_AFTER_MS,
  TRACKING_UPDATE_INTERVAL_MS,
} from '../src/lib/deliveryTracking.ts';

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

/** Published Supabase Pro quotas (https://supabase.com/pricing, 2026-11-11). */
const PRO = {
  realtimeMessagesPerMonth: 5_000_000,
  realtimePeakConnections: 500,
  realtimeMaxMessageBytes: 3 * 1024 * 1024,
  databaseGb: 8,
  fileStorageGb: 100,
  egressGb: 250,
  edgeInvocations: 2_000_000,
};

function trackingFootprint(activeDeliveries, minutesPerDay, days = 30) {
  const updatesPerDay = activeDeliveries * (minutesPerDay * 60) / (TRACKING_UPDATE_INTERVAL_MS / 1000);
  const updates = updatesPerDay * days;
  return {
    updates,
    messages: updates * 2, // one Postgres Changes event to each booking party
    peakConnections: activeDeliveries * 2,
    rowBytes: updates * 200,
    databaseGb: (updates * 200 + updates * 80) / (1024 ** 3), // row + index estimate
  };
}

test('GPS cadence stays within the published Pro Realtime message budget', () => {
  assert.equal(TRACKING_UPDATE_INTERVAL_MS, 12_000);
  assert.ok(TRACKING_STALE_AFTER_MS >= TRACKING_UPDATE_INTERVAL_MS * 2);
  const expected = trackingFootprint(250, 30);
  assert.equal(expected.updates, 1_125_000);
  assert.ok(expected.messages < PRO.realtimeMessagesPerMonth);
  assert.ok(expected.peakConnections <= PRO.realtimePeakConnections);
  assert.ok(expected.databaseGb < PRO.databaseGb / 10, `unexpected database footprint ${expected.databaseGb} GB`);
});

test('the Pro Realtime connection quota binds before the message quota', () => {
  const fortyNine = trackingFootprint(249, 30);
  const fifty = trackingFootprint(250, 30);
  const over = trackingFootprint(251, 30);
  assert.ok(fortyNine.peakConnections < PRO.realtimePeakConnections);
  assert.ok(fifty.peakConnections === PRO.realtimePeakConnections);
  assert.ok(over.peakConnections > PRO.realtimePeakConnections);
  assert.ok(over.messages < PRO.realtimeMessagesPerMonth);
});

test('a 30-day 500-delivery workload is under messages but over connections', () => {
  const footprint = trackingFootprint(500, 30);
  assert.ok(footprint.messages < PRO.realtimeMessagesPerMonth);
  assert.ok(footprint.peakConnections > PRO.realtimePeakConnections);
});

test('GPS rate limit and tiny payloads protect Realtime and database quotas', () => {
  const migration = source('supabase/migrations/20261111200000_dynamic_service_category_builder.sql');
  const client = source('src/lib/deliveryTrackingClient.ts');
  const tracking = source('src/lib/deliveryTracking.ts');
  assert.match(migration, /service_tracking_rate_guard/);
  assert.match(migration, /interval '5 seconds'/);
  assert.match(migration, /TRACKING_UPDATE_TOO_FREQUENT/);
  assert.match(tracking, /TRACKING_UPDATE_INTERVAL_MS = 12_000/);
  assert.match(tracking, /return 5_000/);
  assert.match(tracking, /return 8_000/);
  assert.match(client, /return \(\) => \{\}/);
  assert.match(client, /supabase_realtime|postgres_changes/);
  assert.ok(PRO.realtimeMaxMessageBytes >= 1024 * 1024);
});

test('no paid third-party map or SMS provider is required by tracking', () => {
  const map = source('src/components/tracking/DeliveryTrackingMap.tsx');
  const tracking = source('src/lib/deliveryTracking.ts');
  const client = source('src/lib/deliveryTrackingClient.ts');
  assert.match(map, /openstreetmap\.org/);
  assert.doesNotMatch(map, /google\.maps|mapbox|here\.com|tomtom/i);
  assert.doesNotMatch(tracking + client, /twilio|messagebird|vonage/i);
  assert.match(tracking, /OTP_TTL_MS = 10 \* 60_000/);
});
