import { spawn } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import net from 'node:net';
import pg from 'pg';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SECRET = 'bos-local-postgres-stay-test-secret';
const customer = 'c3fee3b2-3d2f-4e5f-8d1c-2b3c4d5e6f70';
const CS = 'postgres://postgres@127.0.0.1:5544/bos_test';

function freePort() {
  return new Promise((res, rej) => {
    const s = net.createServer();
    s.once('error', rej);
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => res(p));
    });
  });
}

function tok({ authId, role, userId, email }) {
  const payload = Buffer.from(JSON.stringify({ userId, supabaseUserId: authId, email, name: role, phone: '+91 9', role, authProvider: 'google', issuedAt: Date.now(), expiresAt: Date.now() + 600000 })).toString('base64url');
  return `${payload}.${createHmac('sha256', `${SECRET}:SESSION_TOKEN_V2`).update(payload).digest('hex')}`;
}

const pool = new pg.Pool({ connectionString: CS });
const r = await pool.query(`select p.listing_id, rt.id as room_type_id from stay_properties p join stay_room_types rt on rt.property_id=p.id join stay_units u on u.room_type_id=rt.id limit 1`);
const { listing_id, room_type_id } = r.rows[0];
const port = await freePort();
const child = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'server.ts'], {
  env: { ...process.env, NODE_ENV: 'test', PORT: String(port), BOS_SERVER_HMAC_SECRET: SECRET, BOS_LISTINGS_DATABASE_URL: CS, RAZORPAY_KEY_ID: '', RAZORPAY_KEY_SECRET: '', RAZORPAY_WEBHOOK_SECRET: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let err = '';
child.stderr.on('data', (d) => { err += d; });
const url = `http://127.0.0.1:${port}`;
for (let i = 0; i < 120; i++) { try { const res = await fetch(`${url}/api/auth/me`); if (res.status === 401) break; } catch {} await sleep(150); }
const token = tok({ authId: customer, role: 'customer', userId: 'USR-STAY-C', email: 'stay-customer@example.test' });
const d1 = '2027-07-10', d2 = '2027-07-12';
const hold = await fetch(`${url}/api/stays/${listing_id}/holds`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ roomTypeId: room_type_id, checkIn: d1, checkOut: d2 }) }).then((x) => x.json());
console.log('HOLD', JSON.stringify(hold).slice(0, 200));
if (!hold.ok) { console.log('SERVER_ERR', err.slice(-800)); await pool.end(); child.kill('SIGTERM'); process.exit(0); }
const holdToken = hold.holds[0].holdToken;
const bookingId = `paid-${randomUUID().slice(0, 8)}`;
await pool.query(`insert into public.bookings (id, listing_id, customer_id, user_id, status, payment_status) values ($1,$2,$3,$3,'confirmed','verified')`, [bookingId, listing_id, customer]);
const c2 = await pool.connect();
let raw = '';
try {
  await c2.query('begin');
  await c2.query('set local role authenticated');
  await c2.query("select set_config('request.jwt.claim.sub',$1,true)", [customer]);
  await c2.query("select set_config('request.jwt.claim.role','authenticated',true)");
  const rr = await c2.query('select public.stay_confirm_booking($1,$2) as r', [holdToken, bookingId]);
  raw = JSON.stringify(rr.rows[0]);
} catch (e) { raw = 'ERR ' + e.message; } finally { try { await c2.query('rollback'); } catch {} c2.release(); }
console.log('RAW_SQL', raw);
const confirm = await fetch(`${url}/api/stays/holds/${holdToken}/confirm`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ bookingId }) }).then((x) => x.json()).catch((e) => ({ err: e.message }));
console.log('API', JSON.stringify(confirm).slice(0, 300));
console.log('SERVER_ERR', err.slice(-500));
await pool.end();
child.kill('SIGTERM');
