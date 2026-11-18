import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { estimateGpsInfrastructureCost, estimateGpsLoad, gpsCapacityVerdict } from '../src/lib/gpsCapacity.ts';

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('1,000-device GPS math matches the requested write volume and stays unproven', () => {
  const load = estimateGpsLoad(1000, 10);
  assert.equal(load.updatesPerSecond, 100);
  assert.equal(load.updatesPerMinute, 6_000);
  assert.equal(load.updatesPerHour, 360_000);
  assert.equal(load.updatesPerDay, 8_640_000);
  assert.equal(load.peakRealtimeConnections, 2_000);
  assert.equal(gpsCapacityVerdict(null), 'unproven');
  assert.equal(gpsCapacityVerdict(250), 'partial');
  assert.equal(gpsCapacityVerdict(1000), 'proven');
  const cost = estimateGpsInfrastructureCost(load);
  assert.equal(cost.provenAtDevices, null);
  assert.match(cost.compute, /unproven|benchmark/i);
});

test('admin capacity panel does not duplicate the global kill switch or expose coordinates', () => {
  const panel = source('src/components/admin/AdminGpsTrackingPanel.tsx');
  assert.match(panel, /admin-gps-capacity/);
  assert.match(panel, /emergency kill switch/);
  assert.match(panel, /fetchAdminGpsCapacity/);
  assert.doesNotMatch(panel, /latitude|longitude/);
  assert.match(source('src/server/trackingShareApi.ts'), /\/api\/admin\/gps-tracking\/capacity/);
  assert.match(source('src/server/serviceBookingRepository.ts'), /gps_active_session_count/);
  assert.match(source('scripts/gps-load-test.mjs'), /BOS_GPS_LOAD_TEST/);
  assert.match(source('scripts/gps-load-test.mjs'), /Refusing a Supabase-hosted origin/);
  assert.match(source('src/server/postgresPool.ts'), /DEFAULT_PG_POOL_MAX = 40/);
  assert.match(source('scripts/gps-isolated-schema.sql'), /idx_service_tracking_locations_received_at/);
  assert.match(source('scripts/gps-isolated-schema.sql'), /purge_old_service_tracking_locations/);
});
