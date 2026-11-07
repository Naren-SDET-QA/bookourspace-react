import crypto from 'node:crypto';

/**
 * HTTP-level integration assertions for the PostgreSQL provider listing slice.
 * Run by supabase/tests/run_pg_integration.sh, which owns the database and the
 * server lifecycle (including the restart between phases).
 *
 * Usage: node tests/pg-listings.integration.mjs <phase1|phase2> <baseUrl> <secret> <uuidA> <uuidB> <uuidAdmin> <uuidCustomer>
 */

const [, , phase, baseUrl, secret, A, B, ADMIN, CUSTOMER] = process.argv;
const failures = [];
let checks = 0;

function check(name, condition, detail) {
  checks += 1;
  if (condition) {
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function sign(claims) {
  const payload = Buffer.from(
    JSON.stringify({
      ...claims,
      issuedAt: Date.now(),
      expiresAt: Date.now() + 60 * 60 * 1000,
    }),
    'utf8'
  ).toString('base64url');
  const sig = crypto
    .createHmac('sha256', `${secret}:SESSION_TOKEN_V2`)
    .update(payload)
    .digest('hex');
  return `${payload}.${sig}`;
}

const tokenA = sign({
  userId: 'USR-A-LEGACY',
  supabaseUserId: A,
  email: 'provider.a@example.test',
  name: 'Provider A',
  role: 'provider',
  providerId: 'prov-a',
  authProvider: 'google',
});
const tokenB = sign({
  userId: 'USR-B-LEGACY',
  supabaseUserId: B,
  email: 'provider.b@example.test',
  name: 'Provider B',
  role: 'provider',
  providerId: 'prov-b',
  authProvider: 'google',
});
const tokenAdmin = sign({
  userId: 'USR-ADMIN-LEGACY',
  supabaseUserId: ADMIN,
  email: 'admin@example.test',
  name: 'Admin',
  role: 'admin',
  authProvider: 'google',
});
const tokenCustomer = sign({
  userId: 'USR-C-LEGACY',
  supabaseUserId: CUSTOMER,
  email: 'customer@example.test',
  name: 'Customer',
  role: 'customer',
  authProvider: 'google',
});
// No UUID anywhere: the route must refuse to guess an identity.
const tokenUnmapped = sign({
  userId: 'USR-NO-UUID',
  email: 'nomap@example.test',
  name: 'No UUID',
  role: 'provider',
  authProvider: 'google',
});

async function call(method, path, token, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['x-bos-session-token'] = token;
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  let json = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }
  return { status: response.status, body: json };
}

const LISTING_A = 'lst-it-a-001';
const LISTING_A2 = 'lst-it-a-002';
const LISTING_B = 'lst-it-b-001';

async function phase1() {
  console.log('PHASE 1 — create, ownership, idempotency, conflict safety');

  const unauth = await call('POST', '/api/provider/listings', null, {
    title: 'Unauthenticated listing',
    categoryId: 'pg-boys',
    subcategory: 'Single',
    price: 100,
  });
  check('unauthenticated create is 401', unauth.status === 401, `got ${unauth.status}`);

  const created = await call('POST', '/api/provider/listings', tokenA, {
    id: LISTING_A,
    requestId: 'req-it-1',
    title: 'A PG Listing',
    categoryId: 'pg-boys',
    subcategory: 'Single Sharing',
    entityType: 'property',
    price: 7200,
    priceUnit: 'per month',
    payload: { area: 'Madhapur', amenities: ['wifi'] },
    // Hostile client input: must be ignored in favour of the session identity.
    ownerUserId: B,
    userId: B,
  });
  check('provider A create is 201', created.status === 201, `got ${created.status} ${JSON.stringify(created.body)}`);
  const listing = created.body?.listing || {};
  check('create preserves category', listing.categoryId === 'pg-boys', listing.categoryId);
  check('create preserves subcategory', listing.subcategory === 'Single Sharing', listing.subcategory);
  check('create preserves entity type', listing.entityType === 'property', listing.entityType);
  check('create preserves price unit', listing.priceUnit === 'per month', listing.priceUnit);
  check('create preserves numeric price', listing.price === 7200, String(listing.price));
  check('owner is the session Auth UUID, not the body', listing.ownerUserId === A, listing.ownerUserId);
  check('provider id comes from claims', listing.providerId === 'prov-a', listing.providerId);
  check('provider cannot self-approve on create', listing.status === 'pending_approval', listing.status);
  check('payload survives', listing.payload?.area === 'Madhapur', JSON.stringify(listing.payload));

  const replay = await call('POST', '/api/provider/listings', tokenA, {
    id: 'lst-it-a-999',
    requestId: 'req-it-1',
    title: 'Duplicate submit',
    categoryId: 'pg-boys',
    subcategory: 'Single Sharing',
    price: 7200,
  });
  check('same requestId replays the original row', replay.status === 200 && replay.body?.listing?.id === LISTING_A, `${replay.status} ${replay.body?.listing?.id}`);
  check('replay is flagged idempotent', replay.body?.idempotent === true, String(replay.body?.idempotent));

  const duplicateId = await call('POST', '/api/provider/listings', tokenA, {
    id: LISTING_A,
    requestId: 'req-it-2-different',
    title: 'Conflicting id',
    categoryId: 'pg-boys',
    subcategory: 'Double Sharing',
    price: 1,
  });
  check('duplicate id with a new requestId is 409', duplicateId.status === 409, `got ${duplicateId.status} ${JSON.stringify(duplicateId.body)}`);

  const second = await call('POST', '/api/provider/listings', tokenA, {
    id: LISTING_A2,
    requestId: 'req-it-2',
    title: 'A Second Listing',
    categoryId: 'classes',
    subcategory: 'UPSC',
    price: 3500,
    ownerUserId: B,
  });
  check('A can create a second listing', second.status === 201, `got ${second.status}`);
  check('derived entity type for a course', second.body?.listing?.entityType === 'course', second.body?.listing?.entityType);
  check('second listing still owned by A', second.body?.listing?.ownerUserId === A, second.body?.listing?.ownerUserId);

  const foreignPatch = await call('PATCH', `/api/provider/listings/${LISTING_A}`, tokenB, {
    title: 'Hijacked',
  });
  check('provider B cannot edit A listing', foreignPatch.status === 404, `got ${foreignPatch.status}`);
  const foreignDelete = await call('DELETE', `/api/provider/listings/${LISTING_A}`, tokenB);
  check('provider B cannot deactivate A listing', foreignDelete.status === 404, `got ${foreignDelete.status}`);

  const bCreate = await call('POST', '/api/provider/listings', tokenB, {
    id: LISTING_B,
    requestId: 'req-it-b',
    title: 'B Listing',
    categoryId: 'pg-girls',
    subcategory: 'Single',
    price: 5000,
  });
  check('provider B can create an own listing', bCreate.status === 201, `got ${bCreate.status}`);

  const bList = await call('GET', '/api/provider/listings', tokenB);
  const bIds = (bList.body?.listings || []).map((entry) => entry.id);
  check('provider B list hides A listings', bList.status === 200 && !bIds.includes(LISTING_A), JSON.stringify(bIds));
  check('provider B list shows only own listing', bIds.length === 1 && bIds[0] === LISTING_B, JSON.stringify(bIds));

  const stale = await call('PATCH', `/api/provider/listings/${LISTING_A}`, tokenA, {
    title: 'Stale write',
    expectedUpdatedAt: '2000-01-01T00:00:00.000Z',
  });
  check('stale expectedUpdatedAt is 409', stale.status === 409, `got ${stale.status}`);

  const updated = await call('PATCH', `/api/provider/listings/${LISTING_A}`, tokenA, {
    title: 'A PG Listing (updated)',
    price: 7800,
    payload: { area: 'Gachibowli' },
  });
  check('owner can update title', updated.status === 200 && updated.body?.listing?.title === 'A PG Listing (updated)', `${updated.status} ${updated.body?.listing?.title}`);
  check('update keeps price unit', updated.body?.listing?.priceUnit === 'per month', updated.body?.listing?.priceUnit);
  check('update keeps entity type', updated.body?.listing?.entityType === 'property', updated.body?.listing?.entityType);
  check('update merges payload', updated.body?.listing?.payload?.area === 'Gachibowli', JSON.stringify(updated.body?.listing?.payload));

  const selfApprove = await call('PATCH', `/api/provider/listings/${LISTING_A}`, tokenA, {
    status: 'active',
  });
  check('provider cannot self-approve', selfApprove.status === 403, `got ${selfApprove.status}`);

  const customer = await call('GET', '/api/provider/listings', tokenCustomer);
  check('customer cannot use provider listings API', customer.status === 403, `got ${customer.status}`);

  const unmapped = await call('GET', '/api/provider/listings', tokenUnmapped);
  check('unmapped identity is refused', unmapped.status === 403 && unmapped.body?.error === 'POSTGRES_IDENTITY_UNMAPPED', `${unmapped.status} ${unmapped.body?.error}`);

  const adminList = await call('GET', '/api/provider/listings', tokenAdmin);
  const adminIds = (adminList.body?.listings || []).map((entry) => entry.id).sort();
  check(
    'admin sees every provider listing',
    adminList.status === 200 && adminIds.join(',') === [LISTING_A, LISTING_A2, LISTING_B].join(','),
    `status=${adminList.status} error=${adminList.body?.error || 'none'} listings=${JSON.stringify(adminIds)}`
  );
}

async function phase2() {
  console.log('PHASE 2 — after server restart: persistence and isolation');

  const aList = await call('GET', '/api/provider/listings', tokenA);
  const ids = (aList.body?.listings || []).map((entry) => entry.id);
  check('listing survives server restart', aList.status === 200 && ids.includes(LISTING_A), `${aList.status} ${JSON.stringify(ids)}`);
  const persisted = (aList.body?.listings || []).find((entry) => entry.id === LISTING_A) || {};
  check('persisted title is the updated one', persisted.title === 'A PG Listing (updated)', persisted.title);
  check('persisted price is durable', persisted.price === 7800, String(persisted.price));
  check('persisted contract fields are intact', persisted.categoryId === 'pg-boys' && persisted.entityType === 'property' && persisted.priceUnit === 'per month', JSON.stringify(persisted));

  const stillForbidden = await call('PATCH', `/api/provider/listings/${LISTING_A}`, tokenB, {
    title: 'Still hijacking',
  });
  check('provider B still cannot edit after restart', stillForbidden.status === 404, `got ${stillForbidden.status}`);

  const deactivateForeign = await call('DELETE', `/api/provider/listings/${LISTING_A}`, tokenB);
  check('provider B still cannot deactivate after restart', deactivateForeign.status === 404, `got ${deactivateForeign.status}`);

  const deactivated = await call('DELETE', `/api/provider/listings/${LISTING_A}`, tokenA);
  check('owner can deactivate', deactivated.status === 200 && deactivated.body?.listing?.status === 'archived', `${deactivated.status} ${deactivated.body?.listing?.status}`);

  const after = await call('GET', '/api/provider/listings', tokenA);
  const archived = (after.body?.listings || []).find((entry) => entry.id === LISTING_A);
  check('deactivated listing remains visible to its owner as archived', archived?.status === 'archived', archived?.status);
  check('second listing is untouched by deactivation', (after.body?.listings || []).some((entry) => entry.id === LISTING_A2 && entry.status === 'pending_approval'));
}

try {
  if (phase === 'phase1') await phase1();
  else if (phase === 'phase2') await phase2();
  else throw new Error(`unknown phase ${phase}`);
} catch (error) {
  failures.push(`exception: ${error?.message || error}`);
  console.log(`  FAIL  unexpected exception — ${error?.message || error}`);
}

console.log(`  checks=${checks} failures=${failures.length}`);
if (failures.length > 0) {
  console.log(`  FAILED: ${failures.join(' | ')}`);
  process.exit(1);
}
