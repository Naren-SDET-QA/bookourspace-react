import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  effectiveGpsFlags,
  gpsShareState,
  gpsShareStateLabel,
  overlayBookingGps,
  parseGpsToggleMap,
} from '../src/lib/gpsPolicy.ts';

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('GPS share states are Disabled, Waiting, Live, Stale and Stopped', () => {
  const base = { trackingEnabled: true, status: 'accepted', hasLocation: false };
  assert.equal(gpsShareState({ ...base, trackingEnabled: false }), 'disabled');
  assert.equal(gpsShareStateLabel('disabled'), 'Disabled');
  assert.equal(gpsShareState(base), 'waiting');
  assert.equal(gpsShareStateLabel('waiting'), 'Waiting');
  assert.equal(gpsShareState({ ...base, hasLocation: true, stale: false }), 'live');
  assert.equal(gpsShareStateLabel('live'), 'Live');
  assert.equal(gpsShareState({ ...base, hasLocation: true, stale: true }), 'stale');
  assert.equal(gpsShareStateLabel('stale'), 'Stale');
  assert.equal(gpsShareState({ ...base, status: 'completed', hasLocation: true, stale: false }), 'stopped');
  assert.equal(gpsShareState({
    ...base,
    hasLocation: true,
    stale: false,
    trackingStartedAt: '2026-11-18T10:00:00.000Z',
    trackingStoppedAt: '2026-11-18T10:05:00.000Z',
  }), 'stopped');
  assert.equal(gpsShareStateLabel('stopped'), 'Stopped');
});

test('admin GPS overlay hides live tracking without a redeploy', () => {
  const live = {
    categoryId: 'water_delivery',
    categoryConfigId: null,
    trackingEnabled: true,
    liveMapEnabled: true,
    status: 'accepted',
  };
  const policy = {
    globalEnabled: true,
    categoryOverrides: {},
    catalogToggles: { water_delivery: { gpsTracking: true, liveMap: true } },
  };
  assert.deepEqual(overlayBookingGps(policy, live), { trackingEnabled: true, liveMapEnabled: true });
  assert.equal(overlayBookingGps({ ...policy, globalEnabled: false }, live).trackingEnabled, false);
  assert.equal(overlayBookingGps({
    ...policy,
    categoryOverrides: { water_delivery: { gpsTracking: false, liveMap: false } },
  }, live).trackingEnabled, false);
  assert.equal(overlayBookingGps(policy, { ...live, status: 'completed' }).trackingEnabled, false);
  assert.deepEqual(
    effectiveGpsFlags({
      globalEnabled: true,
      categoryGpsTracking: true,
      categoryLiveMap: false,
      profileTrackingEnabled: true,
      profileLiveMapEnabled: true,
      status: 'travelling',
    }),
    { trackingEnabled: true, liveMapEnabled: false },
  );
  assert.deepEqual(parseGpsToggleMap({ water_delivery: { gpsTracking: false } }).water_delivery, {
    gpsTracking: false,
    liveMap: false,
  });
});

test('admin GPS policy is persisted with admin-only RPCs and live overlay', () => {
  const sql = source('supabase/migrations/20261118190000_admin_gps_policy.sql');
  assert.match(sql, /create table if not exists public\.service_gps_policy/);
  assert.match(sql, /admin_set_gps_global/);
  assert.match(sql, /admin_set_category_gps/);
  assert.match(sql, /gps_effective_enabled/);
  assert.match(sql, /if not public\.is_admin\(\)/);
  assert.match(sql, /public\.gps_effective_enabled\(service_tracking_locations\.booking_id\)/);
  assert.doesNotMatch(sql, /platform_admin_module_registry/);
  const api = source('src/server/gpsPolicyApi.ts');
  assert.match(api, /\/api\/admin\/gps-tracking/);
  assert.match(api, /GPS_POLICY_ADMIN_REQUIRED/);
  assert.match(source('src/components/admin/AdminGpsTrackingPanel.tsx'), /Global GPS/);
  assert.match(source('src/components/admin/AdminGpsTrackingPanel.tsx'), /Manual test mode/);
  assert.match(source('src/components/admin/AdminGpsTrackingPanel.tsx'), /admin-gps-capacity/);
  assert.match(source('src/components/AdminDashboard.tsx'), /gps_tracking/);
  assert.match(source('src/components/tracking/DeliveryTrackingPanel.tsx'), /gpsShareStateLabel/);
  assert.match(source('src/components/ServiceCustomerBookings.tsx'), /GPS tracking is disabled for this service/);
  assert.match(source('src/server/serviceBookingRepository.ts'), /overlayBookingGps/);
});
