import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:net';

// Audit only the current server in a separate process and disposable local store.
// Provider credentials are intentionally blank, and no external mutation is tested.
const reserve = createServer();
await new Promise<void>(resolve => reserve.listen(0, '127.0.0.1', resolve));
const port = (reserve.address() as { port: number }).port;
await new Promise<void>(resolve => reserve.close(() => resolve()));
const directory = await mkdtemp(path.join(tmpdir(), 'bos-reality-audit-'));
const storePath = path.join(directory, 'store.json');
const server = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
  cwd: process.cwd(),
  env: {
    ...process.env, NODE_ENV: 'test', PORT: String(port),
    BOS_AUTH_STORE_FILE_PATH: storePath,
    BOS_SERVER_HMAC_SECRET: 'isolated-audit-test-secret-not-for-deployment',
    BOS_ALLOW_SIMULATED_PAYMENT_SETTLEMENT: 'false',
    RAZORPAY_KEY_ID: '', RAZORPAY_KEY_SECRET: '',
    MOVIES_SUPABASE_URL: '', VITE_MOVIES_SUPABASE_URL: '',
    MOVIES_SUPABASE_PUBLISHABLE_KEY: '', VITE_MOVIES_SUPABASE_PUBLISHABLE_KEY: '',
  }, stdio: 'ignore',
});
const base = `http://127.0.0.1:${port}`;
const results: Array<Record<string, unknown>> = [];
const request = async (route: string, body?: object, headers: Record<string, string> = {}) => {
  const response = await fetch(`${base}${route}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', ...headers },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000),
  });
  const data = await response.json();
  return { response, data };
};
try {
  let started = false;
  for (let attempt = 0; attempt < 150; attempt++) {
    try { await request('/api/auth/me'); started = true; break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!started) throw new Error('Isolated audit server did not start');
  for (const route of ['/api/auth/me', '/api/admin/users', '/api/billing/records', '/api/admin/modules', '/api/admin/movies/access']) {
    const { response, data } = await request(route);
    results.push({ check: 'unauthenticated read', route, status: response.status, error: data.error, returnedArrays: Object.keys(data).filter(key => Array.isArray(data[key])) });
  }
  const spoof = await request('/api/auth/google/authenticate', { email: 'audit-unverified@example.com', name: 'Isolated Audit', googleSub: 'unverified-client-claim', authProvider: 'google' });
  results.push({ check: 'unverified Google identity accepted', status: spoof.response.status, tokenIssued: Boolean(spoof.data.sessionToken) });
  const session = await request('/api/auth/session', { userId: 'another-customer', role: 'customer', email: 'unverified-session@example.com' });
  results.push({ check: 'unverified session identity accepted', status: session.response.status, tokenIssued: Boolean(session.data.sessionToken) });
  for (const [route, headers] of [
    ['/api/admin/users', {}],
    ['/api/live-page-config/draft', { 'x-admin-role': 'admin' }],
  ] as Array<[string, Record<string, string>]>) {
    const { response, data } = await request(route, {}, headers);
    results.push({ check: 'privileged handler reached with no verified identity (invalid payload, no write)', route, status: response.status, error: data.error });
  }
  const bookingBody = { idempotencyKey: 'isolated-audit-booking', listingId: 'nonexistent-audit-listing', scheduledDate: '2099-01-10', checkInDate: '2099-01-10', checkOutDate: '2099-01-12', timeSlot: '14:00', totalAmount: 1, paymentMode: 'pay_later' };
  const booking = await request('/api/bookings/atomic', bookingBody);
  results.push({ check: 'unauthenticated invented listing booking', status: booking.response.status, bookingStatus: booking.data.booking?.status, amount: booking.data.booking?.totalAmount });
  const replay = await request('/api/bookings/atomic', bookingBody, { Authorization: `Bearer ${session.data.sessionToken}` });
  results.push({ check: 'cross-identity idempotency replay', status: replay.response.status, otherBookingReturned: replay.data.booking?.id === booking.data.booking?.id });
  const overlap = await request('/api/bookings/atomic', { ...bookingBody, idempotencyKey: 'overlap-audit', scheduledDate: '2099-01-11', checkInDate: '2099-01-11', checkOutDate: '2099-01-13' });
  results.push({ check: 'overlapping multi-night stay', status: overlap.response.status, bookingStatus: overlap.data.booking?.status });
  const intent = await request('/api/payments/create-intent', { amount: 1, merchantVpa: 'audit@example', planOrListing: 'isolated audit' });
  const upi = await request('/api/payments/verify-upi', { intentId: intent.data.intentId, utrNumber: '123456789012', amount: 1 });
  results.push({ check: 'UPI raw UTR never settles', status: upi.response.status, verified: upi.data.verified });
  const settlement = await request('/api/payments/webhook-settle', { intentId: intent.data.intentId, utrNumber: '123456789012', amount: 1 });
  results.push({ check: 'disabled simulated settlement', status: settlement.response.status, error: settlement.data.error });
  const data = JSON.parse(await readFile(storePath, 'utf8'));
  results.push({ check: 'isolated JSON persistence', bookingCount: data.bookings.length, paymentIntentCount: Object.keys(data.paymentIntents).length, persistence: 'local JSON, not PostgreSQL' });
  await mkdir('output/audit', { recursive: true });
  await writeFile('output/audit/api-findings.json', JSON.stringify({ date: '2026-11-02', isolation: 'temporary JSON store; provider credentials blank; no production mutations', results }, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally {
  server.kill();
  // Keep the fixture store outside the repository for investigation; never output its tokens or customer details.
}
