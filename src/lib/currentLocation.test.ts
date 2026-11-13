import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findNearestHyderabadArea,
  getGeolocationErrorMessage,
  type BrowserCoordinates,
} from './currentLocation';

test('resolves a browser position to the nearest supported Hyderabad area', () => {
  const coordinates: BrowserCoordinates = {
    latitude: 17.4401,
    longitude: 78.3489,
  };

  assert.equal(findNearestHyderabadArea(coordinates), 'Gachibowli Financial District');
});

test('does not pretend a position outside Hyderabad is a supported locality', () => {
  const coordinates: BrowserCoordinates = {
    latitude: 12.9716,
    longitude: 77.5946,
  };

  assert.equal(findNearestHyderabadArea(coordinates), null);
});

test('returns actionable browser geolocation error messages', () => {
  assert.match(getGeolocationErrorMessage({ code: 1 }), /permission/i);
  assert.match(getGeolocationErrorMessage({ code: 2 }), /detected/i);
  assert.match(getGeolocationErrorMessage({ code: 3 }), /timed out/i);
  assert.match(getGeolocationErrorMessage({ code: 99 }), /unavailable/i);
});
