import assert from 'node:assert/strict';
import test from 'node:test';
import { logSafeError, safeErrorCode } from '../src/server/safeLogging.ts';

test('safe server diagnostics retain bounded error codes but never log error details', () => {
  const secret = 'private-value-do-not-log';
  const events = [];
  const original = console.error;
  console.error = (...args) => events.push(args.join(' '));
  try {
    const error = Object.assign(new Error(secret), {
      code: '23505', detail: secret, hint: secret, where: secret, stack: secret,
    });
    assert.equal(safeErrorCode(error), '23505');
    logSafeError('db/payments', 'settle booking', error);
  } finally {
    console.error = original;
  }
  assert.equal(events.length, 1);
  assert.match(events[0], /\[dbpayments\] settle booking failed 23505/);
  assert.equal(events[0].includes(secret), false);
});

test('untrusted error codes are discarded instead of copied into logs', () => {
  assert.equal(safeErrorCode({ code: '23505 DETAIL secret' }), 'UNCLASSIFIED');
  assert.equal(safeErrorCode(new Error('private SQL text')), 'UNCLASSIFIED');
});
