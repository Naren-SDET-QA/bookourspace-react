import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  DELIVERY_TRACKING_CONFIG,
  canCreateDeliveryOtp,
  canPublishHelperLocation,
  canViewBookingTracking,
  deliveryKindFor,
  isLiveDeliveryStatus,
  isLocationStale,
  isValidCoordinate,
  isTerminalDeliveryStatus,
  normalizeOtp,
  trackingStatusLabel,
} from '../src/lib/deliveryTracking.ts';

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('all three delivery kinds share one typed tracking contract', () => {
  assert.deepEqual(Object.keys(DELIVERY_TRACKING_CONFIG).sort(), ['human_help', 'medicine_delivery', 'water_delivery']);
  assert.equal(DELIVERY_TRACKING_CONFIG.medicine_delivery.requiresPrescription, true);
  assert.equal(DELIVERY_TRACKING_CONFIG.water_delivery.supportsRecurrence, true);
  assert.equal(DELIVERY_TRACKING_CONFIG.human_help.requiresPrescription, false);
  assert.equal(deliveryKindFor({ categoryId: 'medicine-delivery' }), 'medicine_delivery');
  assert.equal(deliveryKindFor({ title: '20L water bottle' }), 'water_delivery');
  assert.equal(deliveryKindFor({ title: 'Shopping assistant' }), 'human_help');
});

test('GPS validation rejects impossible coordinates and stale rows', () => {
  assert.equal(isValidCoordinate(17.4485, 78.3748), true);
  assert.equal(isValidCoordinate(91, 78), false);
  assert.equal(isValidCoordinate(17, 181), false);
  assert.equal(isValidCoordinate(Number.NaN, 78), false);
  assert.equal(isLocationStale(new Date(Date.now() - 1000)), false);
  assert.equal(isLocationStale(new Date(Date.now() - 60_000)), true);
});

test('booking-specific access and helper publishing rules are enforced', () => {
  assert.equal(canViewBookingTracking({ actorId: 'customer', customerId: 'customer', providerId: 'helper' }), true);
  assert.equal(canViewBookingTracking({ actorId: 'helper', customerId: 'customer', providerId: 'helper' }), true);
  assert.equal(canViewBookingTracking({ actorId: 'stranger', customerId: 'customer', providerId: 'helper' }), false);
  assert.equal(canViewBookingTracking({ actorId: 'admin', customerId: 'customer', providerId: 'helper', isAdmin: true }), true);
  assert.equal(canPublishHelperLocation({ actorId: 'helper', providerId: 'helper', status: 'accepted', trackingEnabled: true }), true);
  assert.equal(canPublishHelperLocation({ actorId: 'customer', providerId: 'helper', status: 'accepted', trackingEnabled: true }), false);
  assert.equal(canPublishHelperLocation({ actorId: 'helper', providerId: 'helper', status: 'completed', trackingEnabled: false }), false);
  assert.equal(isTerminalDeliveryStatus('completed'), true);
  assert.equal(isLiveDeliveryStatus('in_progress'), true);
  assert.equal(trackingStatusLabel('accepted'), 'Helper assigned');
});

test('OTP generation is customer-only, single-use and prescription gated', () => {
  assert.equal(normalizeOtp('12 34 56'), '123456');
  assert.equal(normalizeOtp('12345'), null);
  assert.equal(canCreateDeliveryOtp({ actorId: 'c', customerId: 'c', status: 'accepted', trackingEnabled: true, requiresPrescription: false, prescriptionStatus: 'not_required' }), true);
  assert.equal(canCreateDeliveryOtp({ actorId: 'c', customerId: 'c', status: 'accepted', trackingEnabled: true, requiresPrescription: true, prescriptionStatus: 'pending' }), false);
  assert.equal(canCreateDeliveryOtp({ actorId: 'c', customerId: 'c', status: 'accepted', trackingEnabled: true, requiresPrescription: true, prescriptionStatus: 'verified' }), true);
  assert.equal(canCreateDeliveryOtp({ actorId: 'h', customerId: 'c', status: 'accepted', trackingEnabled: true, requiresPrescription: false, prescriptionStatus: 'not_required' }), false);
});

test('tracking migration is additive and secures RLS, OTP and realtime', () => {
  const migration = source('supabase/migrations/20261111190000_universal_delivery_tracking.sql');
  assert.match(migration, /service_tracking_locations/);
  assert.match(migration, /service_delivery_otps/);
  assert.match(migration, /service_delivery_profiles/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /Assigned helper publishes live location/);
  assert.match(migration, /b\.customer_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /b\.provider_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /revoke all on public\.service_delivery_otps/);
  assert.match(migration, /encode\(digest\(v_code, 'sha256'\), 'hex'\)/);
  assert.match(migration, /OTP_ALREADY_USED/);
  assert.match(migration, /PRESCRIPTION_NOT_VERIFIED/);
  assert.match(migration, /tracking_stopped_at/);
  assert.match(migration, /trg_stop_delivery_tracking_on_terminal/);
  assert.match(migration, /trg_ensure_service_delivery_profile/);
  assert.match(migration, /review_delivery_prescription/);
  assert.match(migration, /alter publication supabase_realtime add table public\.service_tracking_locations/);
  assert.doesNotMatch(migration, /delete from public\.service_bookings/i);
});

test('client uses real browser GPS and Leaflet OSM, never a simulated path', () => {
  const hook = source('src/hooks/useDeviceLocation.ts');
  const map = source('src/components/tracking/DeliveryTrackingMap.tsx');
  const client = source('src/lib/deliveryTrackingClient.ts');
  assert.match(hook, /navigator\.geolocation\.watchPosition/);
  assert.match(hook, /enableHighAccuracy: true/);
  assert.match(hook, /visibilitychange/);
  assert.match(map, /tile\.openstreetmap\.org/);
  assert.match(map, /openstreetmap\.org\/copyright/);
  assert.match(client, /service_tracking_locations/);
  assert.match(client, /create_delivery_otp/);
  assert.match(client, /verify_delivery_otp/);
  assert.match(client, /postgres_changes/);
  assert.doesNotMatch(hook, /Math\.random\(\).*latitude|mock.*location|fake.*gps/i);
});

test('customer and provider booking surfaces expose real tracking entry points', () => {
  const customer = source('src/components/ServiceCustomerBookings.tsx');
  const provider = source('src/components/ServiceOperationsWorkspace.tsx');
  assert.match(customer, /DeliveryTrackingPanel/);
  assert.match(customer, /Track live/);
  assert.match(provider, /HelperTrackingPublisher/);
  assert.match(provider, /Share live GPS/);
});
