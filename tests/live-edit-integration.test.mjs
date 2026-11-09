import assert from 'node:assert/strict';

import { buildAuditEvent, createMemoryLiveEditAuditSink, redactAuditValue } from '../src/lib/liveEdit/audit.ts';
import { describeDatabaseError, isMissingDatabaseObjectError } from '../src/lib/liveEdit/dbErrors.ts';
import { probeLiveEditIntegration } from '../src/lib/liveEdit/integration.ts';
import { subscribeToLiveEditChanges } from '../src/lib/liveEdit/realtime.ts';

let failures = 0;
function test(name, callback) {
  try {
    callback();
    console.log(`  PASS  ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`  FAIL  ${name}\n        ${error.message}`);
    process.exitCode = 1;
  }
}

async function testAsync(name, callback) {
  try {
    await callback();
    console.log(`  PASS  ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`  FAIL  ${name}\n        ${error.message}`);
    process.exitCode = 1;
  }
}

function probeDeps(statuses) {
  return {
    async probeTable(table) {
      return statuses[table] || 'ready';
    },
    async checkCinemaStore() {
      return statuses.cinema || 'ready';
    },
    now: () => '2026-11-05T00:00:00.000Z',
  };
}

const AUDIT_INPUT = {
  action: 'listing.update',
  module: 'pg_hostels',
  listingId: 'pg-1',
  listingTitle: 'Sri Sai PG',
  actorUserId: 'user-1',
  actorRole: 'provider',
  changedFields: ['title', 'price'],
  occurredAt: '2026-11-05T00:00:00.000Z',
  before: { title: 'Old', price: '8500', providerPhone: '9848022338' },
  after: { title: 'New', price: '9000', providerPhone: '9848022338' },
  source: 'live_edit_ui',
};

console.log('Live Edit integration, audit and realtime');

test('missing-object errors are detected by code and message', () => {
  assert.equal(isMissingDatabaseObjectError({ code: 'PGRST205', message: 'Could not find the table' }), true);
  assert.equal(isMissingDatabaseObjectError({ code: '42P01' }), true);
  assert.equal(isMissingDatabaseObjectError({ message: 'relation "x" does not exist' }), true);
  assert.equal(isMissingDatabaseObjectError({ code: '42501', message: 'permission denied' }), false);
  assert.equal(isMissingDatabaseObjectError(null), false);
  assert.match(describeDatabaseError({ code: 'PGRST205', message: 'missing table' }), /PGRST205: missing table/);
});

test('audit events are summarised and PII is redacted', () => {
  const event = buildAuditEvent(AUDIT_INPUT);
  assert.equal(event.action, 'listing.update');
  assert.equal(event.actorUserId, 'user-1');
  assert.equal(event.changedFields.length, 2);
  assert.match(event.summary, /provider listing\.update/);
  assert.equal(event.before.providerPhone, '[redacted]');
  assert.equal(event.after.providerPhone, '[redacted]');
  assert.ok(event.id.length > 10);

  assert.throws(
    () => buildAuditEvent({ ...AUDIT_INPUT, changedFields: [] }),
    /LIVE_EDIT_AUDIT_WITHOUT_CHANGES/
  );
  const truncated = redactAuditValue('x'.repeat(3000));
  assert.ok(truncated.length < 3000);
  assert.equal(redactAuditValue({ authorization: 'Bearer secret' }).authorization, '[redacted]');
});

test('the memory audit sink is append-only per listing and scoped by id', async () => {
  const sink = createMemoryLiveEditAuditSink();
  const event = buildAuditEvent(AUDIT_INPUT);
  const result = await sink.record(event);
  assert.equal(result.ok, true);
  assert.equal(result.blocked, false);
  const listed = await sink.list('pg-1');
  assert.equal(listed.events.length, 1);
  assert.equal((await sink.list('other')).events.length, 0);
  assert.equal((await sink.probe()).status, 'ready');
});

await testAsync('the integration probe reports BLOCKED for every missing object', async () => {
  const allReady = await probeLiveEditIntegration(probeDeps({}));
  assert.equal(allReady.blocked, false);
  assert.equal(allReady.checkedAt, '2026-11-05T00:00:00.000Z');

  const missingListings = await probeLiveEditIntegration(probeDeps({ listings: 'missing' }));
  assert.equal(missingListings.blocked, true);
  assert.ok(missingListings.messages.some((message) => /public\.listings is not installed/.test(message)));

  const missingAudit = await probeLiveEditIntegration(probeDeps({ live_edit_audit_events: 'missing' }));
  assert.equal(missingAudit.blocked, true);
  assert.ok(missingAudit.messages.some((message) => /audit event can be recorded|live_edit_audit_events/.test(message)));

  const missingAssignments = await probeLiveEditIntegration(
    probeDeps({ live_edit_admin_assignments: 'missing' })
  );
  assert.equal(missingAssignments.blocked, true);
  assert.ok(missingAssignments.messages.some((message) => /assigned scope and are denied/.test(message)));
});

await testAsync('the probe does not invent readiness when cinema is unavailable', async () => {
  const status = await probeLiveEditIntegration(probeDeps({ cinema: 'unknown' }));
  assert.ok(status.messages.some((message) => /Cinema screen editing could not be verified/.test(message)));
});

test('realtime infers the module and unsubscribes cleanly', () => {
  const listeners = {};
  let handler = null;
  let removed = null;
  const channel = {
    on(event, filter, callback) {
      assert.equal(event, 'postgres_changes');
      assert.equal(filter.table, 'listings');
      handler = callback;
      return channel;
    },
    subscribe(callback) {
      listeners.status = callback;
      return channel;
    },
  };
  const client = {
    channel() {
      return channel;
    },
    removeChannel(target) {
      removed = target;
    },
  };

  const changes = [];
  const statuses = [];
  const unsubscribe = subscribeToLiveEditChanges({
    client,
    onListingChange: (change) => changes.push(change),
    onStatus: (status, message) => statuses.push({ status, message }),
  });

  listeners.status('SUBSCRIBED');
  assert.equal(statuses[0].status, 'subscribed');

  handler({
    eventType: 'UPDATE',
    new: {
      id: 'pg-1',
      category_id: 'pg-luxury',
      subcategory: 'Luxury PG',
      entity_type: 'property',
      title: 'PG',
      payload: { module: 'pg_hostels' },
    },
  });
  assert.equal(changes.length, 1);
  assert.equal(changes[0].listingId, 'pg-1');
  assert.equal(changes[0].module, 'pg_hostels');
  assert.equal(changes[0].eventType, 'UPDATE');

  handler({
    eventType: 'INSERT',
    new: {
      id: 'movie-1',
      category_id: 'movie-imax',
      subcategory: 'IMAX',
      entity_type: 'movie',
      title: 'Cinema',
      payload: {},
    },
  });
  assert.equal(changes[1].module, 'movies');

  unsubscribe();
  assert.equal(removed, channel);

  // A client that throws on channel creation degrades to a status instead of crashing.
  const failed = subscribeToLiveEditChanges({
    client: {
      channel() {
        throw new Error('realtime disabled');
      },
      removeChannel() {},
    },
    onListingChange: () => {},
    onStatus: (status, message) => statuses.push({ status, message }),
  });
  assert.equal(statuses.at(-1).status, 'unavailable');
  assert.match(statuses.at(-1).message, /realtime disabled/);
  failed();
});

console.log(failures === 0 ? '\nLive Edit integration checks passed' : `\n${failures} Live Edit integration check(s) failed`);
