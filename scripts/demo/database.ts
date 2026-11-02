import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { assertLocalDatabaseUrl } from '../../src/lib/localDemoSafety';
import { buildDemoCatalog, renderDemoSeed } from './catalog';

export function localDatabaseEnv(value: string) {
  const url = new URL(assertLocalDatabaseUrl(value));
  // Never touch the already-running stack on 54322 or a default installed database.
  if (url.port !== '55422' || url.pathname !== '/postgres') throw new Error('Demo seed only accepts the dedicated React stack at port 55422, database postgres.');
  return { ...process.env, PGHOST: url.hostname === '[::1]' ? '::1' : url.hostname, PGPORT: url.port, PGDATABASE: 'postgres', PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGCONNECT_TIMEOUT: '5', PGOPTIONS: '-c bookourspace.local_demo=on' };
}

export function queryLocal(sql: string, env: NodeJS.ProcessEnv) {
  try {
    return execFileSync(process.env.BOS_DEMO_PSQL || 'psql', ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1'], {
      env, input: sql, encoding: 'utf8', timeout: 60000, maxBuffer: 2 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch (error: any) {
    // Do not print the process environment or SQL, which can contain fixture account data.
    const diagnostic = String(error.stderr || '').split('\n').filter((line: string) => /ERROR:|FATAL:/.test(line)).slice(0, 3).join('\n');
    throw new Error(diagnostic || 'Local PostgreSQL command failed. Check the isolated stack and psql installation.');
  }
}

export const catalogCountsSql = `select json_build_object(
 'profiles',(select count(*) from public.profiles where id::text like 'd3a00000-%'),
 'listings',(select count(*) from public.listings where id like 'demo-%'),
 'movies',(select count(*) from public.movie_titles where id like 'demo-%'),
 'cinemas',(select count(*) from public.movie_theatres where id like 'demo-%'),
 'showtimes',(select count(*) from public.movie_showtimes where id like 'demo-%'),
 'favorites',(select count(*) from public.user_favorites where user_id='d3a00000-0000-4000-8000-000000000100'),
 'notifications',(select count(*) from public.notifications where id like 'demo-%'),
 'catalog_bytes',(select sum(pg_column_size(l)) from public.listings l where id like 'demo-%'),
 'database_bytes',pg_database_size(current_database()));`;

export function seedLocal(env: NodeJS.ProcessEnv, date = new Date().toISOString().slice(0, 10)) {
  const catalog = buildDemoCatalog(date);
  queryLocal(renderDemoSeed(catalog), env);
  return JSON.parse(queryLocal(catalogCountsSql, env));
}

export function installBaseSchema(env: NodeJS.ProcessEnv) {
  queryLocal(readFileSync('supabase/schema_and_rls.sql', 'utf8'), env);
}
