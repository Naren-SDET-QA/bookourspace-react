import assert from 'node:assert/strict';

import { createLiveEditRepository } from '../src/lib/liveEdit/repository.ts';
import { createMemoryLiveEditAuditSink } from '../src/lib/liveEdit/audit.ts';
import { randomUUID } from 'node:crypto';
import { draftFromListing } from '../src/lib/liveEdit/mapping.ts';

let failures = 0;
async function test(name, callback) {
  try {
    await callback();
    console.log(`  PASS  ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`  FAIL  ${name}\n        ${error.message}`);
    process.exitCode = 1;
  }
}

const ALL_MODULES = ['pg_hostels', 'classes', 'venues', 'services', 'hotel_stay', 'movies'];

const PROVIDER_CAPABILITIES = {
  scope: 'owned',
  canEditContent: true,
  canEditPricing: true,
  canEditImages: true,
  canEditFacilities: true,
  canEditCategories: true,
  canEditAvailability: true,
  canEditModerationAvailability: false,
  canEditVerification: false,
  canEditCinemaScreens: false,
  canChangePublicationStatus: false,
  readOnlyFields: [],
};

function providerAuthority(userId = 'user-1') {
  return {
    ok: true,
    actor: { userId, role: 'provider' },
    scope: 'owned',
    modules: [...ALL_MODULES],
    assignments: [],
    capabilities: PROVIDER_CAPABILITIES,
  };
}

function platformAuthority() {
  return {
    ok: true,
    actor: { userId: 'root-1', role: 'super_admin' },
    scope: 'platform',
    modules: 'all',
    assignments: [],
    capabilities: { ...PROVIDER_CAPABILITIES, scope: 'platform', canEditModerationAvailability: true, canEditVerification: true, canEditCinemaScreens: true },
  };
}

function pgRow(overrides = {}) {
  return {
    id: 'pg-1',
    owner_id: 'user-1',
    title: 'Original PG title',
    category_id: 'pg-professionals',
    subcategory: 'IT employee PG',
    entity_type: 'property',
    price: 8500,
    price_unit: '/month',
    status: 'pending_approval',
    provider_availability_status: 'not_reported',
    is_verified: false,
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-02T00:00:00.000Z',
    provider_name: 'Owner',
    payload: {
      description: 'Original description',
      images: ['https://images.example.com/pg-1.jpg'],
      facilities: ['Wi-Fi'],
      location: { city: 'Hyderabad', area: 'Madhapur' },
      customFieldValues: { genderPolicy: 'Men Only', bedsAvailable: 4 },
    },
    ...overrides,
  };
}

function createFakeServer(options = {}) {
  const rows = new Map((options.rows || [pgRow()]).map((row) => [row.id, row]));
  const calls = { save: [], cinema: [], list: [] };
  let clock = 0;
  const nowTick = () => `2026-10-02T00:00:0${(clock += 1)}.000Z`;
  const screens = options.screens || [
    {
      screenId: 'scr-1',
      cinemaListingId: 'movie-hyd-1',
      cinemaName: 'Prasads Multiplex',
      screenName: 'Screen 3',
      projectionFormat: 'IMAX 3D',
      soundFormat: 'Dolby Atmos',
      showtimes: ['10:30', '14:00'],
      cancellationCutoffMins: 120,
      refundPercent: 50,
      tiers: [
        { name: 'Gold', rows: ['A', 'B'], price: 350 },
        { name: 'Executive', rows: ['C'], price: 250 },
      ],
    },
  ];

  return {
    rows,
    calls,
    deps: {
      async fetchListings(admin) {
        calls.list.push({ admin });
        if (options.listFailure) return options.listFailure;
        const all = [...rows.values()];
        const visible = admin ? all : all.filter((row) => row.owner_id === 'user-1');
        return {
          ok: true,
          httpStatus: 200,
          source: options.source ?? 'postgres',
          listings: visible.map((row) => ({ ...row })),
        };
      },
      async saveListing(listingId, body) {
        calls.save.push({ listingId, body });
        if (options.saveResponse) return options.saveResponse;
        const row = rows.get(listingId);
        if (!row) return { ok: false, httpStatus: 404, error: 'LISTING_NOT_FOUND' };
        if (body.expectedUpdatedAt && body.expectedUpdatedAt !== row.updated_at) {
          return { ok: false, httpStatus: 409, error: 'CONCURRENT_MODIFICATION' };
        }
        const next = {
          ...row,
          title: body.title,
          price: body.price,
          price_unit: body.priceUnit,
          provider_availability_status: body.providerAvailabilityStatus ?? row.provider_availability_status,
          updated_at: nowTick(),
          payload: options.ignorePayload ? row.payload : { ...(body.payload || {}) },
        };
        rows.set(listingId, next);
        return {
          ok: true,
          httpStatus: 200,
          listing: next,
          auditEventId: options.noAuditEventId ? undefined : randomUUID(),
        };
      },
      async fetchCinemaInventory() {
        return { ok: true, screens };
      },
      async updateCinemaScreen(body) {
        calls.cinema.push(body);
        if (options.cinemaSaveResponse) return options.cinemaSaveResponse;
        const index = screens.findIndex((screen) => screen.screenId === body.screenId);
        if (index < 0) return { ok: false, httpStatus: 404, error: 'CINEMA_SCREEN_NOT_FOUND' };
        const next = {
          ...screens[index],
          cinemaName: body.cinemaName,
          screenName: body.screenName,
          showtimes: body.showtimes,
          refundPercent: body.refundPercent,
          tiers: body.tiers,
        };
        screens[index] = next;
        return {
          ok: true,
          httpStatus: 200,
          screen: next,
          auditEventId: options.noAuditEventId ? undefined : randomUUID(),
        };
      },
    },
  };
}

async function firstListing(repo, authority, module = 'pg_hostels') {
  const result = await repo.list(authority, module);
  assert.equal(result.ok, true, result.message);
  assert.ok(result.listings[0], 'expected a listing');
  return result.listings[0];
}

console.log('Live Edit repository');

await test('listing load keeps only rows the verified actor may edit', async () => {
  const server = createFakeServer({
    rows: [pgRow(), pgRow({ id: 'pg-2', owner_id: 'user-2', title: 'Other PG' })],
  });
  const repo = createLiveEditRepository({ deps: server.deps, auditSink: createMemoryLiveEditAuditSink() });
  const result = await repo.list(providerAuthority(), 'pg_hostels');
  assert.equal(result.ok, true);
  assert.equal(result.source, 'supabase_listings');
  assert.deepEqual(result.listings.map((listing) => listing.id), ['pg-1']);
  assert.equal(server.calls.list[0].admin, false);
});

await test('a non-PostgreSQL fallback is reported BLOCKED instead of used', async () => {
  const server = createFakeServer({ source: 'json_store' });
  const repo = createLiveEditRepository({ deps: server.deps, auditSink: createMemoryLiveEditAuditSink() });
  const result = await repo.list(providerAuthority(), 'pg_hostels');
  assert.equal(result.ok, false);
  assert.equal(result.blocked, true);
  assert.equal(result.errorCode, 'PERSISTENCE_NOT_POSTGRES');
  assert.match(result.message, /BLOCKED|not using PostgreSQL/i);
});

await test('server failures preserve the blocked signal', async () => {
  const server = createFakeServer({
    listFailure: { ok: false, httpStatus: 503, listings: [], error: 'LISTING_REPOSITORY_ERROR' },
  });
  const repo = createLiveEditRepository({ deps: server.deps, auditSink: createMemoryLiveEditAuditSink() });
  const result = await repo.list(providerAuthority(), 'pg_hostels');
  assert.equal(result.ok, false);
  assert.equal(result.blocked, true);
});

await test('a save is only reported after a confirming read, with an audit event', async () => {
  const server = createFakeServer();
  const audit = createMemoryLiveEditAuditSink();
  const repo = createLiveEditRepository({ deps: server.deps, auditSink: audit, now: () => '2026-11-05T00:00:00.000Z' });
  const listing = await firstListing(repo, providerAuthority());
  const draft = draftFromListing(listing);
  draft.title = 'Updated PG title';
  draft.price = '9100';
  draft.availability.status = 'available';
  draft.availability.unitsAvailable = '3';
  draft.details.bedsAvailable = '3';

  const result = await repo.save(providerAuthority(), listing, draft);
  assert.equal(result.status, 'saved', result.message);
  assert.equal(result.persisted, true);
  assert.equal(result.verified, true);
  assert.equal(result.audit.status, 'recorded');
  assert.equal(result.listing.title, 'Updated PG title');
  assert.equal(result.listing.price, 9100);

  const [call] = server.calls.save;
  assert.equal(call.listingId, 'pg-1');
  assert.equal(call.body.status, undefined);
  assert.equal(call.body.isVerified, undefined);
  assert.equal(call.body.providerAvailabilityStatus, undefined);
  assert.deepEqual(call.body.payload.location, { city: 'Hyderabad', area: 'Madhapur' });
  assert.equal(call.body.payload.customFieldValues.bedsAvailable, 3);
  assert.equal(call.body.payload.description, 'Original description');

  assert.match(result.audit.message, /Audit event .* was recorded by the server/);
});

await test('a concurrent edit is rejected without an audit event', async () => {
  const server = createFakeServer({
    saveResponse: { ok: false, httpStatus: 409, error: 'CONCURRENT_MODIFICATION' },
  });
  const audit = createMemoryLiveEditAuditSink();
  const repo = createLiveEditRepository({ deps: server.deps, auditSink: audit });
  const listing = await firstListing(repo, providerAuthority());
  const draft = { ...draftFromListing(listing), title: 'New title' };
  const result = await repo.save(providerAuthority(), listing, draft);
  assert.equal(result.status, 'rejected');
  assert.equal(result.persisted, false);
  assert.equal(result.errorCode, 'CONCURRENT_MODIFICATION');
  assert.match(result.message, /changed after you opened it/i);
  assert.equal(result.audit.status, 'skipped');
  assert.equal((await audit.list('pg-1')).events.length, 0);
});

await test('a server that ignores the payload is not reported as saved', async () => {
  const server = createFakeServer({ ignorePayload: true });
  const audit = createMemoryLiveEditAuditSink();
  const repo = createLiveEditRepository({ deps: server.deps, auditSink: audit });
  const listing = await firstListing(repo, providerAuthority());
  const draft = { ...draftFromListing(listing), description: 'A description the server ignores' };
  const result = await repo.save(providerAuthority(), listing, draft);
  assert.equal(result.status, 'rejected', result.message);
  assert.equal(result.errorCode, 'PERSISTENCE_NOT_CONFIRMED');
  assert.equal(result.persisted, false);
  assert.equal((await audit.list('pg-1')).events.length, 0);
});

await test('providers cannot save another owner’s listing before any network call', async () => {
  const server = createFakeServer();
  const repo = createLiveEditRepository({ deps: server.deps, auditSink: createMemoryLiveEditAuditSink() });
  const listing = await firstListing(repo, providerAuthority());
  const foreign = { ...listing, ownerId: 'user-2' };
  const draft = { ...draftFromListing(foreign), title: 'Hijack attempt' };
  const result = await repo.save(providerAuthority(), foreign, draft);
  assert.equal(result.status, 'rejected');
  assert.equal(result.persisted, false);
  assert.match(result.message, /own listings/i);
  assert.equal(server.calls.save.length, 0);
});

await test('invalid drafts never reach the server', async () => {
  const server = createFakeServer();
  const repo = createLiveEditRepository({ deps: server.deps, auditSink: createMemoryLiveEditAuditSink() });
  const listing = await firstListing(repo, providerAuthority());
  const draft = { ...draftFromListing(listing), title: 'A' };
  const result = await repo.save(providerAuthority(), listing, draft);
  assert.equal(result.status, 'rejected');
  assert.equal(result.errorCode, 'VALIDATION_FAILED');
  assert.equal(server.calls.save.length, 0);
});

await test('a server response without an audit id is surfaced as BLOCKED, not audited', async () => {
  const server = createFakeServer({ noAuditEventId: true });
  const repo = createLiveEditRepository({ deps: server.deps, auditSink: createMemoryLiveEditAuditSink() });
  const listing = await firstListing(repo, providerAuthority());
  const result = await repo.save(providerAuthority(), listing, {
    ...draftFromListing(listing),
    title: 'Saved without audit id',
  });
  assert.equal(result.status, 'saved');
  assert.equal(result.persisted, true);
  assert.equal(result.audit.status, 'blocked');
  assert.match(result.audit.message, /BLOCKED/);
});

await test('Super Admin moderation availability is sent; verification still excluded', async () => {
  const server = createFakeServer();
  const repo = createLiveEditRepository({ deps: server.deps, auditSink: createMemoryLiveEditAuditSink() });
  const listing = await firstListing(repo, platformAuthority());
  const draft = draftFromListing(listing);
  draft.availability.status = 'sold_out';
  const result = await repo.save(platformAuthority(), listing, draft);
  assert.equal(result.status, 'saved', result.message);
  assert.equal(server.calls.save[0].body.providerAvailabilityStatus, 'unavailable');
  assert.equal(server.calls.save[0].body.isVerified, undefined);
});

await test('cinema screen saves use the screen endpoint and verify the re-read', async () => {
  const server = createFakeServer();
  const audit = createMemoryLiveEditAuditSink();
  const repo = createLiveEditRepository({ deps: server.deps, auditSink: audit });
  const result = await repo.list(platformAuthority(), 'movies');
  assert.equal(result.ok, true);
  assert.equal(result.source, 'server_cinema_store');
  const listing = result.listings[0];
  const draft = draftFromListing(listing);
  draft.details.showtimes = '18:15, 10:30';
  draft.details.refundPercent = '40';
  draft.title = 'Prasads IMAX';

  const saved = await repo.save(platformAuthority(), listing, draft);
  assert.equal(saved.status, 'saved', saved.message);
  assert.equal(saved.persisted, true);
  assert.deepEqual(server.calls.cinema[0].showtimes, ['18:15', '10:30']);
  assert.equal(server.calls.cinema[0].cinemaName, 'Prasads IMAX');
  assert.equal(server.calls.cinema[0].refundPercent, 40);
  assert.equal(saved.audit.status, 'recorded');
  assert.match(saved.audit.message, /server/);
});

await test('providers are refused cinema screen editing', async () => {
  const server = createFakeServer();
  const repo = createLiveEditRepository({ deps: server.deps, auditSink: createMemoryLiveEditAuditSink() });
  const result = await repo.list(providerAuthority(), 'movies');
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, 'CINEMA_SCREEN_SCOPE_REQUIRED');
});

await test('a cinema screen that does not persist is rejected', async () => {
  const server = createFakeServer({
    cinemaSaveResponse: { ok: true, httpStatus: 200, screen: {} },
  });
  const repo = createLiveEditRepository({ deps: server.deps, auditSink: createMemoryLiveEditAuditSink() });
  const list = await repo.list(platformAuthority(), 'movies');
  const listing = list.listings[0];
  const draft = { ...draftFromListing(listing), title: 'A different name' };
  const result = await repo.save(platformAuthority(), listing, draft);
  assert.equal(result.status, 'rejected');
  assert.equal(result.errorCode, 'PERSISTENCE_NOT_CONFIRMED');
});

await test('a denied authority is rejected before any repository work', async () => {
  const server = createFakeServer();
  const repo = createLiveEditRepository({ deps: server.deps, auditSink: createMemoryLiveEditAuditSink() });
  const denied = { ok: false, code: 'NOT_AUTHENTICATED', message: 'Sign in.', blocked: false };
  const list = await repo.list(denied, 'pg_hostels');
  assert.equal(list.ok, false);
  assert.equal(list.message, 'Sign in.');
  const save = await repo.save(denied, { id: 'pg-1', module: 'pg_hostels', ownerId: 'user-1' }, {});
  assert.equal(save.status, 'rejected');
  assert.equal(save.errorCode, 'NOT_AUTHENTICATED');
});

console.log(failures === 0 ? '\nLive Edit repository checks passed' : `\n${failures} Live Edit repository check(s) failed`);
