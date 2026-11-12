import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  assertLoopbackTarget,
  sanitizeSqlForRollbackDryRun,
} from '../scripts/migration-dry-run.mjs';

test('migration dry-run unconditionally refuses remote database targets', () => {
  assert.throws(
    () =>
      assertLoopbackTarget(
        'postgresql://postgres.obkfgxjzlscungkhbyvq:pass@aws-0-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=verify-full',
      ),
    /DRY_RUN_REMOTE_REFUSED/,
  );
  assert.throws(
    () =>
      assertLoopbackTarget(
        'postgresql://postgres:pass@db.obkfgxjzlscungkhbyvq.supabase.co:5432/postgres?sslmode=require',
      ),
    /DRY_RUN_REMOTE_REFUSED/,
  );

  assert.equal(assertLoopbackTarget('postgres://postgres@127.0.0.1:55440/bookourspace_dev').hostname, '127.0.0.1');
  assert.equal(assertLoopbackTarget('postgres://postgres@localhost:5432/test').hostname, 'localhost');
});

test('migration dry-run strips top-level BEGIN/COMMIT while preserving PL/pgSQL dollar-quoted blocks', () => {
  const sampleSql = `
-- comment before begin
begin;

create or replace function public.sample_fn() returns void language plpgsql as $$
begin
  -- inner plpgsql begin/end must remain intact!
  perform 1;
end;
$$;

do $block$
begin
  raise notice 'inside do block';
end;
$block$;

commit;
`;
  const result = sanitizeSqlForRollbackDryRun(sampleSql, 'sample.sql');
  assert.equal(result.strippedBoundaries, 2);
  assert.equal(result.statementCount, 2);
  assert.ok(!/^\s*begin\s*;/im.test(result.sql));
  assert.ok(!/^\s*commit\s*;/im.test(result.sql));
  assert.ok(result.sql.includes('create or replace function public.sample_fn()'));
  assert.ok(result.sql.includes('perform 1;'));
  assert.ok(result.sql.includes("raise notice 'inside do block';"));
});

test('migration dry-run rejects non-transactional SQL statements', () => {
  assert.throws(
    () => sanitizeSqlForRollbackDryRun('CREATE INDEX CONCURRENTLY idx_x ON public.t(id);', 'bad.sql'),
    /DRY_RUN_NON_TRANSACTIONAL_SQL/,
  );
});

test('migration dry-run safely strips top-level BEGIN/COMMIT across all manifest migrations', () => {
  const manifest = JSON.parse(fs.readFileSync(path.resolve('supabase/MIGRATION_MANIFEST.json'), 'utf8'));
  assert.equal(manifest.migrations.length, manifest.migrationCount);
  let totalStripped = 0;
  for (const m of manifest.migrations) {
    const sql = fs.readFileSync(path.resolve(m.file), 'utf8');
    const res = sanitizeSqlForRollbackDryRun(sql, path.basename(m.file));
    totalStripped += res.strippedBoundaries;
  }
  assert.ok(totalStripped > 0);
});
