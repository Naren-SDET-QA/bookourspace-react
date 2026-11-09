import test from 'node:test';
import assert from 'node:assert/strict';
import { getNativePosition } from '../src/lib/nativeLocation.ts';
import { nearestCity } from '../src/data/indiaLocations.ts';

const granted = async () => ({ location: 'granted', coarseLocation: 'granted' });

test('native GPS prefers a fresh precise fix while retaining approximate permission compatibility', async () => {
  const calls = [];
  const position = await getNativePosition(async (options) => {
    calls.push(options);
    return { coords: { latitude: 19.076, longitude: 72.8777 } };
  }, granted, granted);
  assert.deepEqual(position.coords, { latitude: 19.076, longitude: 72.8777 });
  assert.deepEqual(calls, [{ enableHighAccuracy: true, timeout: 30_000, maximumAge: 0, enableLocationFallback: true }]);
});

test('native GPS retries a transient native location failure with a bounded second request', async () => {
  const calls = [];
  const position = await getNativePosition(async (options) => {
    calls.push(options);
    if (calls.length === 1) throw Object.assign(new Error('provider unavailable'), { code: 'OS-PLUG-GLOC-0002' });
    return { coords: { latitude: 17.385, longitude: 78.4867 } };
  }, granted, granted);
  assert.equal(position.coords.latitude, 17.385);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1], { enableHighAccuracy: false, timeout: 12_000, maximumAge: 0, enableLocationFallback: true });
});

test('native GPS does not retry a denied permission as a lower accuracy request', async () => {
  let positionCalls = 0;
  await assert.rejects(
    getNativePosition(async () => { positionCalls += 1; throw Object.assign(new Error('Location access denied'), { code: 'OS-PLUG-GLOC-0003' }); }, granted, granted),
    /LOCATION_PERMISSION_DENIED/,
  );
  assert.equal(positionCalls, 1);
});

test('native GPS does not call the location provider when permission is denied', async () => {
  let positionCalls = 0;
  await assert.rejects(
    getNativePosition(async () => { positionCalls += 1; return { coords: { latitude: 0, longitude: 0 } }; },
      async () => ({ location: 'denied', coarseLocation: 'denied' }),
      async () => ({ location: 'denied', coarseLocation: 'denied' })),
    /LOCATION_PERMISSION_DENIED/,
  );
  assert.equal(positionCalls, 0);
});

test('simulated Hyderabad coordinates resolve to Hyderabad', () => {
  assert.equal(nearestCity(17.385, 78.4867).name, 'Hyderabad');
});

test('native GPS diagnostics contain timing and codes but never coordinates', async () => {
  const events = [];
  await getNativePosition(
    async () => ({ coords: { latitude: 17.385, longitude: 78.4867 } }),
    granted,
    granted,
    (event) => events.push(event),
  );
  assert.ok(events.some((event) => event.stage === 'position-read' && event.outcome === 'success'));
  assert.ok(events.every((event) => Number.isFinite(event.durationMs)));
  assert.ok(events.every((event) => !('latitude' in event) && !('longitude' in event) && !('coords' in event)));
});
