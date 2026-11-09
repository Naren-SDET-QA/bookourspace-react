import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const [, , phase, baseUrl, secret, ownerA, ownerB, admin, customerA, customerB, distDirectory] = process.argv;
const failed = [];
let checks = 0;
const listingId = 'lst-pg-booking-e2e';
const token = (userId, role, email) => {
  const payload = Buffer.from(JSON.stringify({ userId: `LEGACY-${role}`, supabaseUserId: userId, email, name: role, role, authProvider: 'google', providerId: role === 'provider' ? `provider-${userId}` : undefined, issuedAt: Date.now(), expiresAt: Date.now() + 3600000 })).toString('base64url');
  return `${payload}.${crypto.createHmac('sha256', `${secret}:SESSION_TOKEN_V2`).update(payload).digest('hex')}`;
};
const ownerToken = token(ownerA, 'provider', 'provider.a@example.test');
const otherOwnerToken = token(ownerB, 'provider', 'provider.b@example.test');
const adminToken = token(admin, 'admin', 'admin@example.test');
// The email has to match the seeded profile, because the durable
// PostgreSQL profile is the authority the server answers with.
const customerToken = token(customerA, 'customer', 'customer.c@example.test');
const customerBToken = token(customerB, 'customer', 'customer.b@example.test');

async function call(method, path, auth, body) {
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { 'content-type': 'application/json', connection: 'close', ...(auth ? { authorization: `Bearer ${auth}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json().catch(() => null) };
  } catch (error) {
    return { status: 0, body: null, transportError: error instanceof Error ? error.message : 'request failed', method, path };
  }
}
function check(name, ok, detail = '') {
  checks += 1;
  if (!ok) failed.push(name);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`);
}

async function phase1() {
  console.log('PG phase 1 — owner inventory, customer reservation and safety');
  const created = await call('POST', '/api/provider/listings', ownerToken, {
    id: listingId, requestId: 'pg-booking-e2e-registration', title: 'PG booking integration listing',
    categoryId: 'pg-boys', subcategory: 'Single Sharing', entityType: 'pg', price: 8000,
    priceUnit: 'per month', payload: { city: 'Test City', area: 'Test Area' },
  });
  check('provider submits PG listing', created.status === 201 || created.status === 200, String(created.status));
  const inventory = await call('PUT', `/api/provider/pg/listings/${listingId}/inventory`, ownerToken, {
    roomName: 'Single bed', monthlyRentRupees: 8000, securityDepositRupees: 16000,
    occupancyPerBed: 1, bedLabels: ['Bed 1', 'Bed 2'], amenities: ['Wi-Fi'],
  });
  check('owner creates beds and pricing before review using real PostgreSQL', inventory.status === 200 && inventory.body?.inventory?.roomTypeId, JSON.stringify(inventory.body));
  const roomTypeId = inventory.body?.inventory?.roomTypeId;
  const pendingFeed = await call('GET', '/api/marketplace/listings', null);
  check('pending PG inventory remains hidden from customer feed', pendingFeed.status === 200 && !pendingFeed.body?.listings?.some((listing) => listing.id === listingId));
  const reviewed = await call('PATCH', `/api/admin/provider/listings/${listingId}/review`, adminToken, { decision: 'active' });
  check('authorized Admin approves the PG after owner inventory setup', reviewed.status === 200, JSON.stringify(reviewed.body));
  check('another provider cannot change PG inventory', (await call('PUT', `/api/provider/pg/listings/${listingId}/inventory`, otherOwnerToken, { roomTypeId, roomName: 'Other', monthlyRentRupees: 1, securityDepositRupees: 0, occupancyPerBed: 1, bedLabels: ['A'] })).status === 403);
  check('non-authenticated visitor cannot create a reservation', (await call('POST', '/api/pg/bookings', null, {})).status === 401);
  const start = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const availabilityUrl = `/api/pg/listings/${listingId}/inventory?moveIn=${start}&months=2`;
  const ownerInventory = await call('GET', availabilityUrl, ownerToken);
  const bedIds = (ownerInventory.body?.roomTypes?.[0]?.beds || []).map((bed) => bed.id);
  const blockInput = { unitId: bedIds[0], startsOn: start, endsOn: new Date(Date.parse(`${start}T00:00:00Z`) + 60 * 86400000).toISOString().slice(0, 10), reason: 'Integration test block' };
  check('owner inventory includes their private bed identifiers for calendar management', ownerInventory.status === 200 && bedIds.length === 2);
  const unauthorizedBlock = await call('POST', `/api/provider/pg/listings/${listingId}/blocks`, otherOwnerToken, blockInput);
  check('different provider cannot block another owner bed', unauthorizedBlock.status === 403, JSON.stringify(unauthorizedBlock.body));
  const createdBlock = await call('POST', `/api/provider/pg/listings/${listingId}/blocks`, ownerToken, blockInput);
  check('owner date block persists in PostgreSQL', createdBlock.status === 201 && createdBlock.body?.source === 'postgres', JSON.stringify(createdBlock.body));
  const overlappingBlock = await call('POST', `/api/provider/pg/listings/${listingId}/blocks`, ownerToken, blockInput);
  check('overlapping active blocks are rejected by the PostgreSQL exclusion constraint', overlappingBlock.status === 409 && overlappingBlock.body?.error === 'PG_BLOCK_OVERLAP', JSON.stringify(overlappingBlock.body));
  const blockAvailability = await call('GET', availabilityUrl, null);
  check('blocked bed is excluded from public availability', blockAvailability.body?.roomTypes?.[0]?.availableBeds === 1);
  const blockedBooking = await call('POST', '/api/pg/bookings', customerToken, { listingId, roomTypeId, moveIn: start, months: 2, beds: 2, occupants: 2, idempotencyKey: 'pg-blocked-bed-conflict-01' });
  check('booking cannot allocate a bed during its owner block', blockedBooking.status === 409, JSON.stringify(blockedBooking.body));
  const removedBlock = await call('DELETE', `/api/provider/pg/listings/${listingId}/blocks/${createdBlock.body?.block?.id}`, ownerToken);
  check('owner can restore the bed calendar after the block', removedBlock.status === 200 && removedBlock.body?.removed === true, JSON.stringify(removedBlock.body));
  const restoredAvailability = await call('GET', availabilityUrl, null);
  check('restoring a block returns the bed to PostgreSQL availability', restoredAvailability.body?.roomTypes?.[0]?.availableBeds === 2);
  const blockRaceInput = { ...blockInput, reason: 'Concurrent booking-block test' };
  const [bookingVsBlock, blockVsBooking] = await Promise.all([
    call('POST', '/api/pg/bookings', customerToken, { listingId, roomTypeId, moveIn: start, months: 2, beds: 1, occupants: 1, idempotencyKey: 'pg-block-booking-race-01' }),
    call('POST', `/api/provider/pg/listings/${listingId}/blocks`, ownerToken, blockRaceInput),
  ]);
  const raceSafe = (bookingVsBlock.status === 201 && blockVsBooking.status === 409)
    || (bookingVsBlock.status === 409 && blockVsBooking.status === 201);
  check('concurrent owner block and customer booking serialize without overlapping use', raceSafe, JSON.stringify([bookingVsBlock.status, blockVsBooking.status]));
  if (blockVsBooking.body?.block?.id) await call('DELETE', `/api/provider/pg/listings/${listingId}/blocks/${blockVsBooking.body.block.id}`, ownerToken);
  if (bookingVsBlock.body?.booking?.bookingId) {
    const raceCancellation = await call('POST', `/api/pg/bookings/${bookingVsBlock.body.booking.bookingId}/cancel`, customerToken, {});
    check('race-winner booking is cancelled before availability-count assertion', raceCancellation.status === 200 && raceCancellation.body?.booking?.status === 'cancelled', JSON.stringify(raceCancellation.body));
  }
  const publicInventory = await call('GET', availabilityUrl, null);
  check('public inventory reports live PostgreSQL bed count', publicInventory.status === 200 && publicInventory.body?.roomTypes?.[0]?.availableBeds === 2, JSON.stringify(publicInventory.body));
  const publicFeed = await call('GET', '/api/marketplace/listings', null);
  check('approved PG appears in the canonical PostgreSQL customer feed', publicFeed.status === 200 && publicFeed.body?.source === 'postgresql' && publicFeed.body?.listings?.some((listing) => listing.id === listingId), JSON.stringify(publicFeed.body));
  check('public feed does not expose physical bed labels', publicInventory.body?.roomTypes?.[0]?.beds?.length === 0);
  const paymentCapabilities = await call('GET', '/api/pg/payment-capabilities', null);
  check('online payment remains unverified without a signed settlement provider', paymentCapabilities.status === 200 && paymentCapabilities.body?.settlementVerification === 'unavailable');
  const browserTest = spawnSync(process.execPath, ['tests/pg-browser-e2e.mjs', baseUrl, 'PG booking integration listing', distDirectory], {
    encoding: 'utf8',
    stdio: 'inherit',
    env: { ...process.env, BOS_E2E_CUSTOMER_SESSION: customerToken, BOS_E2E_OWNER_SESSION: ownerToken },
  });
  check('Playwright PG discovery, owner inventory and signed local-customer booking/cancellation journey', browserTest.status === 0, `browser test exit=${browserTest.status}`);
  const room = publicInventory.body?.roomTypes?.[0];
  const occupancyViolation = await call('POST', '/api/pg/bookings', customerToken, { listingId, roomTypeId, moveIn: start, months: 2, beds: 1, occupants: 2, idempotencyKey: 'pg-occupancy-fail-001' });
  check('occupancy limit enforced by PostgreSQL', occupancyViolation.status === 400, JSON.stringify(occupancyViolation));

  const firstRequest = { listingId, roomTypeId, moveIn: start, months: 2, beds: 1, occupants: 1, idempotencyKey: 'pg-customer-a-request-01' };
  const first = await call('POST', '/api/pg/bookings', customerToken, firstRequest);
  check('customer creates reservation and gets confirmed reservation / pay-later (not paid)', first.status === 201 && first.body?.booking?.status === 'confirmed' && first.body?.booking?.paymentStatus === 'pay_later' && first.body?.booking?.totalDuePaise === 3200000, JSON.stringify(first.body));
  const reservationBlocks = await Promise.all(bedIds.map((unitId, index) => call('POST', `/api/provider/pg/listings/${listingId}/blocks`, ownerToken, { ...blockInput, unitId, reason: `Reserved bed conflict ${index}` })));
  const successfulProbe = reservationBlocks.find((result) => result.status === 201);
  if (successfulProbe?.body?.block?.id) await call('DELETE', `/api/provider/pg/listings/${listingId}/blocks/${successfulProbe.body.block.id}`, ownerToken);
  check('owner date block cannot overlap a confirmed customer allocation', reservationBlocks.some((result) => result.status === 409), JSON.stringify(reservationBlocks.map((result) => result.status)));
  const replay = await call('POST', '/api/pg/bookings', customerToken, firstRequest);
  check('duplicate request returns original booking without consuming another bed', replay.status === 200 && replay.body?.booking?.bookingId === first.body?.booking?.bookingId && replay.body?.booking?.replayed === true, JSON.stringify(replay.body));
  const concurrentDuplicates = await Promise.all([
    call('POST', '/api/pg/bookings', customerToken, firstRequest),
    call('POST', '/api/pg/bookings', customerToken, firstRequest),
  ]);
  check('concurrent duplicate requests resolve to one idempotent booking', concurrentDuplicates.every((result) => [200, 201].includes(result.status) && result.body?.booking?.bookingId === first.body?.booking?.bookingId));
  const conflict = await call('POST', '/api/pg/bookings', customerToken, { ...firstRequest, beds: 2 });
  check('idempotency key cannot be replayed with altered booking details', conflict.status === 409, JSON.stringify(conflict.body));

  const reservedAllocation = spawnSync('psql', [
    '-h', '127.0.0.1', '-p', String(process.env.BOS_TEST_PGPORT || ''), '-U', 'postgres', '-d', String(process.env.BOS_TEST_PGDB || ''),
    '-At', '-v', 'ON_ERROR_STOP=1', '-c',
    `select u.label from public.stay_allocations a join public.stay_units u on u.id=a.unit_id where a.booking_id='${first.body.booking.bookingId}' and a.status='confirmed' order by u.label limit 1`,
  ], { encoding: 'utf8', env: { ...process.env, PGPASSWORD: '' } });
  const reservedLabel = reservedAllocation.status === 0 ? reservedAllocation.stdout.trim() : '';
  check('test identifies the actual reserved bed from PostgreSQL before removal attempt', Boolean(reservedLabel), reservedAllocation.stderr.trim());
  const failedEdit = await call('PUT', `/api/provider/pg/listings/${listingId}/inventory`, ownerToken, {
    roomTypeId, roomName: 'Single bed', monthlyRentRupees: 1, securityDepositRupees: 0,
    occupancyPerBed: 1, bedLabels: ['Bed 1', 'Bed 2'].filter((label) => label !== reservedLabel),
  });
  check('reserved-bed removal fails as an atomic inventory update', failedEdit.status === 409, JSON.stringify(failedEdit.body));
  const afterFailedEdit = await call('GET', availabilityUrl, null);
  check('failed inventory write rolls price/bed changes back', afterFailedEdit.body?.roomTypes?.[0]?.monthlyRentPaise === 800000 && afterFailedEdit.body?.roomTypes?.[0]?.totalBeds === 2);

  const [concurrentA, concurrentB] = await Promise.all([
    call('POST', '/api/pg/bookings', customerBToken, { ...firstRequest, idempotencyKey: 'pg-customer-b-race-01' }),
    call('POST', '/api/pg/bookings', customerToken, { ...firstRequest, idempotencyKey: 'pg-customer-a-race-02' }),
  ]);
  const raceSuccesses = [concurrentA, concurrentB].filter((result) => result.status === 201).length;
  check('overlapping concurrent bookings allocate the final bed at most once', raceSuccesses === 1 && [concurrentA, concurrentB].some((result) => result.status === 409), JSON.stringify([concurrentA, concurrentB]));

  const bookingsCustomer = await call('GET', '/api/pg/bookings', customerToken);
  check('customer My Bookings includes their own PG reservation', bookingsCustomer.status === 200 && bookingsCustomer.body?.bookings?.some((booking) => booking.bookingId === first.body.booking.bookingId), JSON.stringify(bookingsCustomer.body));
  const bookingsOtherCustomer = await call('GET', '/api/pg/bookings', customerBToken);
  check('another customer cannot see customer A PG reservations', bookingsOtherCustomer.status === 200 && bookingsOtherCustomer.body?.bookings?.every((booking) => booking.bookingId !== first.body.booking.bookingId));
  const bookingsOwner = await call('GET', '/api/pg/bookings', ownerToken);
  check('listing owner and Admin can view PG reservation operations', bookingsOwner.status === 200 && bookingsOwner.body?.bookings?.some((booking) => booking.bookingId === first.body.booking.bookingId));
  const bookingsAdmin = await call('GET', '/api/pg/bookings', adminToken);
  check('authorized Admin can review PG reservation records', bookingsAdmin.status === 200 && bookingsAdmin.body?.bookings?.length >= 1);
  const afterLease = new Date(Date.parse(`${start}T00:00:00Z`) + 70 * 86400000).toISOString().slice(0, 10);
  const persistentBlock = await call('POST', `/api/provider/pg/listings/${listingId}/blocks`, ownerToken, {
    unitId: bedIds[0], startsOn: afterLease,
    endsOn: new Date(Date.parse(`${afterLease}T00:00:00Z`) + 2 * 86400000).toISOString().slice(0, 10),
    reason: 'Restart persistence check',
  });
  check('owner date block is written before API restart', persistentBlock.status === 201, JSON.stringify(persistentBlock.body));
  if (first.body?.booking?.bookingId) {
    const forbiddenCancel = await call('POST', `/api/pg/bookings/${first.body.booking.bookingId}/cancel`, customerBToken, {});
    check('another customer cannot cancel someone else reservation', forbiddenCancel.status === 403);
  } else check('another customer cannot cancel someone else reservation', false, 'no booking was created');
}

async function phase2() {
  console.log('PG phase 2 — restart persistence and cancellation');
  const bookings = await call('GET', '/api/pg/bookings', customerToken);
  const booking = bookings.body?.bookings?.find((item) => item.listingId === listingId);
  check('reservation and payment-due state persist after API restart', bookings.status === 200 && Boolean(booking) && booking.paymentStatus === 'pay_later', JSON.stringify(bookings.body));
  if (booking) {
    const cancelled = await call('POST', `/api/pg/bookings/${booking.bookingId}/cancel`, customerToken, {});
    check('customer cancels future reservation without claiming a refund', cancelled.status === 200 && cancelled.body?.booking?.status === 'cancelled' && cancelled.body?.booking?.refundPaise === 0 && cancelled.body?.booking?.paymentStatus === 'pay_later', JSON.stringify(cancelled.body));
    const replay = await call('POST', `/api/pg/bookings/${booking.bookingId}/cancel`, customerToken, {});
    check('duplicate cancellation is safely rejected', replay.status === 409);
  }
  const persistedBlocks = await call('GET', `/api/provider/pg/listings/${listingId}/blocks`, ownerToken);
  const persistedBlock = persistedBlocks.body?.blocks?.find((block) => block.reason === 'Restart persistence check');
  check('owner date block survives API restart in PostgreSQL', persistedBlocks.status === 200 && Boolean(persistedBlock), JSON.stringify(persistedBlocks.body));
  if (persistedBlock) {
    const restored = await call('DELETE', `/api/provider/pg/listings/${listingId}/blocks/${persistedBlock.id}`, ownerToken);
    check('owner can remove the persisted date block after restart', restored.status === 200 && restored.body?.removed === true);
  }
  const secondCustomerBookings = await call('GET', '/api/pg/bookings', customerBToken);
  for (const other of secondCustomerBookings.body?.bookings || []) {
    if (other.listingId === listingId && other.status === 'confirmed') {
      await call('POST', `/api/pg/bookings/${other.bookingId}/cancel`, customerBToken, {});
    }
  }
  // The phase-1 race may have been won by either customer, so every remaining
  // confirmed reservation for this listing has to be released before the
  // availability assertion. Cancelling only one of them makes the check
  // depend on who won the race.
  const allCustomerBookings = await call('GET', '/api/pg/bookings', customerToken);
  for (const other of allCustomerBookings.body?.bookings || []) {
    if (other.listingId === listingId && other.status === 'confirmed') {
      await call('POST', `/api/pg/bookings/${other.bookingId}/cancel`, customerToken, {});
    }
  }
  const inventory = await call('GET', `/api/pg/listings/${listingId}/inventory?moveIn=${new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)}&months=2`, null);
  check('cancelled inventory is released back to availability', inventory.status === 200 && inventory.body?.roomTypes?.[0]?.availableBeds === 2, JSON.stringify(inventory.body));
}

if (phase === 'phase1') await phase1();
else if (phase === 'phase2') await phase2();
else throw new Error('phase must be phase1 or phase2');
console.log(`PG ${phase}: ${checks - failed.length}/${checks} checks passed`);
if (failed.length) process.exitCode = 1;
