import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { assertLocalHttpUrl } from '../../src/lib/localDemoSafety';

const url = assertLocalHttpUrl(process.env.BOS_DEMO_SUPABASE_URL || 'http://localhost:55421');
if (new URL(url).port !== '55421') throw new Error('Use the isolated React Supabase stack at port 55421.');
const key = process.env.BOS_DEMO_ANON_KEY || '';
if (!key || key.startsWith('sb_secret_')) throw new Error('Set BOS_DEMO_ANON_KEY to the dedicated local stack anon/publishable key. Never use a hosted or service-role key.');
if (key.startsWith('eyJ')) {
  const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());
  if (payload.role !== 'anon') throw new Error('Local browser key must have the anon role.');
}
const health = await fetch(`${url}/auth/v1/health`, { headers: { apikey: key }, signal: AbortSignal.timeout(5000) });
if (!health.ok) throw new Error('Dedicated local Supabase Auth is unavailable; demo start refused.');
const temp = mkdtempSync(path.join(tmpdir(), 'bos-react-demo-'));
// Vite must not discover .env.local, and inherited credentials must not reach this process.
const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^(VITE_|MOVIES_|RAZORPAY_|GOOGLE_|GEMINI_|SUPABASE_|BOS_)/.test(name)));
Object.assign(env, {
  NODE_ENV: 'development', PORT: '3400', BOS_LOCAL_DEMO: 'true', VITE_LOCAL_DEMO: 'true',
  VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: key,
  VITE_MOVIES_SUPABASE_URL: url, VITE_MOVIES_SUPABASE_PUBLISHABLE_KEY: key,
  BOS_AUTH_STORE_FILE_PATH: path.join(temp, 'authoritative-store.json'), BOS_DEMO_ENV_DIR: temp,
  BOS_ALLOW_SIMULATED_PAYMENT_SETTLEMENT: 'false',
});
const child = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], { env, stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => child.kill(signal));
child.on('exit', code => { process.exitCode = code || 0; });
