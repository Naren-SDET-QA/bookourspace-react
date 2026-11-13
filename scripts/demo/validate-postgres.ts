import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { queryLocal, seedLocal, installBaseSchema } from './database';

// Fresh native PostgreSQL contract harness, separate from all Supabase stacks.
// This command is NOT Supabase E2E and never claims to test Auth/Realtime/Storage.
const bin = process.env.BOS_DEMO_PG_BIN || (process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/18/bin' : '/usr/lib/postgresql/18/bin');
const exe = (name: string) => path.join(bin, `${name}${process.platform === 'win32' ? '.exe' : ''}`);
const directory = mkdtempSync(path.join(tmpdir(), 'bos-react-pg-contract-'));
const data = path.join(directory, 'data');
const env = { ...process.env, PGHOST: '127.0.0.1', PGPORT: '55432', PGDATABASE: 'postgres', PGUSER: 'postgres', PGCONNECT_TIMEOUT: '5', PGOPTIONS: '-c bookourspace.local_demo=on' };
process.env.BOS_DEMO_PSQL = exe('psql');
let started = false;
try {
  execFileSync(exe('initdb'), ['-D', data, '-U', 'postgres', '--auth=trust', '--encoding=UTF8', '--locale=C'], { stdio: 'pipe', timeout: 60000 });
  started = true;
  // Inherited pipe handles can keep spawnSync open after pg_ctl exits on Windows.
  execFileSync(exe('pg_ctl'), ['-D', data, '-l', path.join(directory, 'postgres.log'), '-o', '-p 55432 -h 127.0.0.1', '-w', 'start'], { stdio: 'ignore', timeout: 30000 });
  queryLocal(readFileSync('scripts/demo/postgres-fixture.sql', 'utf8'), env);
  for (const filename of readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) {
    queryLocal(readFileSync(path.join('supabase/migrations', filename), 'utf8'), env);
  }
  installBaseSchema(env);
  // The existing visibility contract expects an empty catalog and rolls all fixtures back.
  queryLocal(`begin;\n${readFileSync('supabase/tests/movie_visibility_rollback.sql', 'utf8')}\nrollback;`, env);
  const first = seedLocal(env);
  const second = seedLocal(env);
  for (const [key, count] of Object.entries({ profiles: 6, listings: 29, movies: 4, cinemas: 4, showtimes: 16, favorites: 3, notifications: 3 })) {
    assert.equal(first[key], count, key);
    assert.equal(second[key], count, `${key} after second seed`);
  }
  queryLocal(readFileSync('scripts/demo/catalog-rls.sql', 'utf8'), env);
  // Reseeding must preserve a disabled theatre and its visibility version.
  queryLocal("update public.movie_theatres set is_visible=false,visibility_version=7 where id='demo-theatre-1';", env);
  seedLocal(env);
  assert.equal(queryLocal("select is_visible::text||':'||visibility_version from public.movie_theatres where id='demo-theatre-1';", env), 'false:7');
  assert.equal(queryLocal("begin;set local role anon;select count(*) from public.movies_now_showing();rollback;", env), '12');
  // Separate PostgreSQL connections race with the same visibility version.
  // This checks actual database locking; Auth/Realtime remain fixture interfaces.
  queryLocal("insert into auth.users(id,email) values('00000000-0000-4000-8000-000000000777','concurrency-audit@example.invalid'); insert into cinema_private.admin_permissions(user_id,role,can_manage_visibility) values('00000000-0000-4000-8000-000000000777','super_admin',true);", env);
  const queryConcurrent = (sql: string) => new Promise<string>((resolve, reject) => {
    const child = spawn(exe('psql'), ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1'], { env, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = ''; let error = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { error += chunk; });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(output) : reject(new Error(error)));
    child.stdin.end(sql);
  });
  const raceSql = `begin; set local role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000777',true); select public.manage_movie_visibility('theatre','[{"id":"demo-theatre-1","visible":true,"version":7}]','Concurrent audit update'); commit;`;
  const race = await Promise.allSettled([queryConcurrent(raceSql), queryConcurrent(raceSql)]);
  assert.equal(race.filter(result => result.status === 'fulfilled').length, 1, 'Exactly one concurrent visibility edit succeeds');
  const conflict = race.find(result => result.status === 'rejected') as PromiseRejectedResult;
  assert.match(String(conflict.reason), /Visibility changed; refresh before retrying/);
  assert.equal(queryLocal("select visibility_version from public.movie_theatres where id='demo-theatre-1';", env), '8');
  const report = { engine: 'Native PostgreSQL contract harness; NOT Supabase E2E', freshClusterReplay: true, existingMovieVisibilityContract: true, catalogRls: true, idempotentSeed: true, visibilityPreservedOnReseed: true, concurrentVisibilityUpdates: true, counts: second, localClusterDirectory: directory };
  mkdirSync('output/demo', { recursive: true });
  writeFileSync('output/demo/postgres-validation.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (started && existsSync(path.join(data, 'postmaster.pid'))) execFileSync(exe('pg_ctl'), ['-D', data, '-w', '-m', 'fast', 'stop'], { stdio: 'ignore', timeout: 30000 });
  // Retain only this stopped, isolated cluster for inspection; never delete user files.
}
