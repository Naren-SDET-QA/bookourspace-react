import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

import {
  permissionForProviderRoute,
  providerModuleForPath,
  sectionForProviderPath,
} from '../src/lib/businessAccess.ts';
import {
  customerModuleForPath,
  customerSectionForPath,
} from '../src/server/customerPermissions.ts';

const server = fs.readFileSync(path.join(process.cwd(), 'server.ts'), 'utf8');

function gateArray(index) {
  const matches = Array.from(server.matchAll(/app\.use\(\[([^\]]+)\], async \(req, res, next\) => \{/g));
  assert.ok(matches[index], `gate ${index} not found`);
  return Array.from(matches[index][1].matchAll(/'([^']+)'/g)).map((entry) => entry[1]);
}

const providerGate = gateArray(0);
const customerGate = gateArray(1);

test('every provider-owned API family is behind the engine-backed business gate', () => {
  for (const prefix of [
    '/api/provider',
    '/api/stays/host',
    '/api/movies/screens',
    '/api/movies/showtimes',
    '/api/services/provider',
    '/api/services/workers',
    '/api/services/earnings',
    '/api/services/payment-claims',
    '/api/provider-portal',
    '/api/pg/bookings',
    '/api/venue-bookings',
    '/api/stays/bookings',
  ]) {
    assert.ok(providerGate.includes(prefix), `${prefix} must be covered by the provider gate`);
  }
});

test('the public showtime read is deliberately exempt from the provider gate', () => {
  assert.match(server, /req\.method === 'GET' \|\| req\.method === 'HEAD'\)[\s\S]{0,120}\/api\/movies\/showtimes/);
});

test('showtime mutation resolves to the movies category through the shared catalog', () => {
  assert.equal(providerModuleForPath('/api/movies/showtimes/scr-1'), 'movies');
  assert.equal(sectionForProviderPath('/api/movies/showtimes/scr-1'), 'showtimes');
  assert.deepEqual(permissionForProviderRoute('PUT', '/api/movies/showtimes/scr-1'), {
    moduleKey: 'movies',
    action: 'edit',
    sectionKey: 'showtimes',
  });
  assert.deepEqual(permissionForProviderRoute('GET', '/api/movies/showtimes'), {
    moduleKey: 'movies',
    action: 'view',
    sectionKey: 'showtimes',
  });
});

test('every customer booking and support family is behind the customer gate', () => {
  for (const prefix of [
    '/api/stays/bookings',
    '/api/stays/holds',
    '/api/stays/requests',
    '/api/stays/wishlists',
    '/api/pg/bookings',
    '/api/venue-bookings',
    '/api/services/bookings',
    '/api/classes/enrollments',
  ]) {
    assert.ok(customerGate.includes(prefix), `${prefix} must be covered by the customer gate`);
  }
});

test('movie customer routes keep their existing handler authorization', () => {
  // Cinema support and cancellation are display-only today and enforce their
  // own session/ownership rules; they deliberately do not consume category
  // grants, so a grant edit must not change their contract error codes.
  assert.equal(customerModuleForPath('/api/movies/bookings/bk-1/cancel'), null);
  assert.equal(customerModuleForPath('/api/movies/support'), null);
  assert.equal(customerSectionForPath('/api/movies/support'), null);
});

test('both gates delegate their decision to the shared engine', () => {
  const gateStart = server.indexOf('app.use([\'/api/provider\'');
  assert.ok(gateStart > 0, 'provider gate not found');
  const gateEnd = server.indexOf('registerStayHostApi(app', gateStart);
  assert.ok(gateEnd > gateStart, 'provider gate end not found');
  const slice = server.slice(gateStart, gateEnd);
  assert.match(slice, /const decision = authorize\(/);
  assert.doesNotMatch(slice, /evaluateProviderBusinessContext\(/);

  const customerStart = server.indexOf('Customer module, section and action enforcement');
  const customerEnd = server.indexOf('registerStayHostApi(app', customerStart);
  const customerSlice = server.slice(customerStart, customerEnd);
  assert.match(customerSlice, /grants: rows as Array</);
  assert.match(customerSlice, /evaluateCustomerPermission\(/);
});
