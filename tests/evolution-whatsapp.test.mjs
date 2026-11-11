import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getEvolutionSetupStatus,
  isEvolutionDevelopmentTestSendAuthorized,
  normalizeEvolutionRecipient,
  prepareEvolutionQaPack,
  registerEvolutionDevelopmentTestApi,
  sendEvolutionQaPack,
} from '../src/server/evolutionWhatsApp.ts';

const readyEnv = {
  NODE_ENV: 'development',
  EVOLUTION_API_URL: 'http://localhost:8080',
  EVOLUTION_API_KEY: 'test-only-key',
  EVOLUTION_INSTANCE: 'bookourspace-dev',
  EVOLUTION_DEV_TEST_ENABLED: '1',
  EVOLUTION_DEV_TEST_RECIPIENT: '9966191813',
};

test('Evolution recipient normalization is fixed to the Indian QA destination format', () => {
  assert.equal(normalizeEvolutionRecipient('9966191813'), '919966191813');
  assert.equal(normalizeEvolutionRecipient('+91 99661 91813'), '919966191813');
  assert.equal(normalizeEvolutionRecipient('919966191813'), '919966191813');
  assert.equal(normalizeEvolutionRecipient('555'), null);
});

test('Evolution sending stays blocked outside development and until explicitly enabled', () => {
  const status = getEvolutionSetupStatus({});
  assert.equal(status.sendEnabled, false);
  assert.ok(status.blockedReasons.includes('EVOLUTION_NOT_DEVELOPMENT'));
  assert.ok(status.blockedReasons.includes('EVOLUTION_DEV_TEST_DISABLED'));

  assert.equal(isEvolutionDevelopmentTestSendAuthorized({ to: '9966191813', confirmSend: true }, readyEnv), true);
  assert.equal(isEvolutionDevelopmentTestSendAuthorized({ to: '9000000000', confirmSend: true }, readyEnv), false);
  assert.equal(isEvolutionDevelopmentTestSendAuthorized({ to: '9966191813', confirmSend: false }, readyEnv), false);
  assert.equal(getEvolutionSetupStatus({ ...readyEnv, EVOLUTION_DEV_TEST_RECIPIENT: '9000000000' }).sendEnabled, false);
});

test('Evolution QA pack sends four text samples and branded media through the mock transport', async () => {
  const requests = [];
  const fetcher = async (input, init) => {
    requests.push({ input, init });
    return { ok: true, status: 201, json: async () => ({}), text: async () => '' };
  };
  const result = await sendEvolutionQaPack({
    recipient: '919966191813',
    bookingId: 'pg-qa-test',
    guestName: 'BookOurSpace QA',
    propertyName: 'QA PG',
    roomType: 'Single occupancy',
    checkIn: '2026-12-10',
    checkOut: '2026-12-11',
    amountPaise: 125000,
  }, { env: readyEnv, fetcher, explicitAuthorization: true, retryDelayMs: 0 });

  assert.deepEqual(result, { ok: true, sent: 4, mediaSent: 6, recipient: '919966191813' });
  assert.equal(requests.filter(({ input }) => input.includes('/message/sendText/')).length, 4);
  assert.equal(requests.filter(({ input }) => input.includes('/message/sendMedia/')).length, 6);
  const firstBody = JSON.parse(requests[0].init.body);
  assert.equal(firstBody.number, '919966191813');
  assert.match(firstBody.text, /development QA sample/);
  assert.equal(requests[0].init.headers.apikey, 'test-only-key');
});

test('Evolution QA pack never calls the transport when gates are closed', async () => {
  let calls = 0;
  const result = await sendEvolutionQaPack({ recipient: '9966191813', bookingId: 'blocked', guestName: 'QA', propertyName: 'QA', roomType: 'QA', checkIn: '2026-12-10', checkOut: '2026-12-11', amountPaise: 0 }, {
    env: { ...readyEnv, EVOLUTION_DEV_TEST_ENABLED: '0' },
    explicitAuthorization: true,
    fetcher: async () => { calls += 1; throw new Error('should not call'); },
  });
  assert.equal(result.ok, false);
  assert.equal(calls, 0);
});

test('Evolution QA preparation builds four messages and branded media without sending', async () => {
  const prepared = await prepareEvolutionQaPack({
    recipient: '9966191813', bookingId: 'prepared-only', guestName: 'QA', propertyName: 'QA PG',
    roomType: 'Single occupancy', checkIn: '2026-12-10', checkOut: '2026-12-11', amountPaise: 125000,
  });
  assert.deepEqual(prepared.map((item) => item.kind), ['confirmation', 'cancellation', 'invoice_offer', 'alert']);
  assert.equal(prepared.reduce((sum, item) => sum + item.media.length, 0), 6);
  assert.equal(prepared.filter((item) => item.media.some((media) => media.mediatype === 'document')).length, 2);
  assert.equal(prepared.every((item) => item.text.includes('development QA sample')), true);
});

test('Evolution sender requires explicit authorization and deduplicates a completed QA pack', async () => {
  const requests = [];
  const fetcher = async (input, init) => {
    requests.push({ input, init });
    return { ok: true, status: 201, json: async () => ({}), text: async () => '' };
  };
  const details = {
    recipient: '9966191813', bookingId: 'dedupe-test', guestName: 'QA', propertyName: 'QA PG',
    roomType: 'Single occupancy', checkIn: '2026-12-10', checkOut: '2026-12-11', amountPaise: 0,
  };
  const unauthorized = await sendEvolutionQaPack(details, { env: readyEnv, fetcher, retryDelayMs: 0 });
  assert.deepEqual(unauthorized, { ok: false, error: 'EVOLUTION_EXPLICIT_AUTHORIZATION_REQUIRED' });
  const first = await sendEvolutionQaPack(details, { env: readyEnv, fetcher, explicitAuthorization: true, retryDelayMs: 0 });
  assert.equal(first.ok, true);
  const requestCount = requests.length;
  const duplicate = await sendEvolutionQaPack(details, { env: readyEnv, fetcher, explicitAuthorization: true, retryDelayMs: 0 });
  assert.deepEqual(duplicate, { ok: false, error: 'EVOLUTION_QA_DUPLICATE_BLOCKED' });
  assert.equal(requests.length, requestCount);
});

test('Evolution sender retries transient failures but does not retry permanent failures', async () => {
  let attempts = 0;
  const retryingFetcher = async () => {
    attempts += 1;
    if (attempts === 1) return { ok: false, status: 503, json: async () => ({}), text: async () => '' };
    return { ok: true, status: 201, json: async () => ({}), text: async () => '' };
  };
  const result = await sendEvolutionQaPack({
    recipient: '9966191813', bookingId: 'retry-test', guestName: 'QA', propertyName: 'QA PG',
    roomType: 'Single occupancy', checkIn: '2026-12-10', checkOut: '2026-12-11', amountPaise: 0,
  }, { env: readyEnv, fetcher: retryingFetcher, explicitAuthorization: true, retryDelayMs: 0 });
  assert.equal(result.ok, true);
  assert.equal(attempts, 11);

  let permanentAttempts = 0;
  const permanent = await sendEvolutionQaPack({
    recipient: '9966191813', bookingId: 'permanent-test', guestName: 'QA', propertyName: 'QA PG',
    roomType: 'Single occupancy', checkIn: '2026-12-10', checkOut: '2026-12-11', amountPaise: 0,
  }, { env: readyEnv, fetcher: async () => { permanentAttempts += 1; return { ok: false, status: 400, json: async () => ({}), text: async () => '' }; }, explicitAuthorization: true, retryDelayMs: 0 });
  assert.equal(permanent.ok, false);
  assert.equal(permanentAttempts, 1);
});

test('Evolution route enforces admin authorization and is not registered in production', async () => {
  const routes = [];
  const app = { post: (path, handler) => routes.push({ path, handler }) };
  registerEvolutionDevelopmentTestApi(app, { env: readyEnv, isAdmin: () => false });
  assert.equal(routes.length, 1);
  const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; } };
  await routes[0].handler({ body: { to: '9966191813', confirmSend: true } }, response);
  assert.equal(response.statusCode, 401);

  const productionRoutes = [];
  registerEvolutionDevelopmentTestApi({ post: (path, handler) => productionRoutes.push({ path, handler }) }, { env: { ...readyEnv, NODE_ENV: 'production' }, isAdmin: () => true });
  assert.equal(productionRoutes.length, 0);
});
