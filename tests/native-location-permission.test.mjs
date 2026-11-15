import assert from 'node:assert/strict';
import test from 'node:test';
import { requestNativeLocationAccess } from '../src/lib/nativeLocationPermission.ts';

test('native location permission reports a denial returned by the prompt', async () => {
  const access = await requestNativeLocationAccess(
    async () => ({ location: 'denied', coarseLocation: 'denied' }),
    async () => ({ location: 'denied', coarseLocation: 'denied' }),
    20,
    20,
  );
  assert.equal(access, 'denied');
});

test('native location permission recovers a denied status when the iOS prompt promise hangs', async () => {
  const access = await requestNativeLocationAccess(
    () => new Promise(() => {}),
    async () => ({ location: 'denied', coarseLocation: 'denied' }),
    5,
    20,
  );
  assert.equal(access, 'denied');
});

test('native location permission allows retry after a hung denied prompt', async () => {
  let attempts = 0;
  const requestPermissions = async () => {
    attempts += 1;
    return attempts === 1
      ? await new Promise(() => {})
      : { location: 'granted', coarseLocation: 'granted' };
  };
  const checkPermissions = async () => ({ location: 'denied', coarseLocation: 'denied' });

  assert.equal(await requestNativeLocationAccess(requestPermissions, checkPermissions, 5, 20), 'denied');
  assert.equal(await requestNativeLocationAccess(requestPermissions, checkPermissions, 20, 20), 'granted');
});

test('native location permission returns unavailable after bounded prompt and status checks', async () => {
  const access = await requestNativeLocationAccess(
    () => new Promise(() => {}),
    () => new Promise(() => {}),
    5,
    5,
  );
  assert.equal(access, 'unavailable');
});

test('native location permission recognizes permission-denied errors', async () => {
  const access = await requestNativeLocationAccess(
    async () => { throw new Error('Location permission denied'); },
    async () => ({ location: 'prompt', coarseLocation: 'prompt' }),
    20,
    20,
  );
  assert.equal(access, 'denied');
});
