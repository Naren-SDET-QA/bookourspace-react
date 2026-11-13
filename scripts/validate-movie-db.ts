import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Explicit operator command only: remote validation changes ALWAYS roll back.
// Use --with-migration before first apply; omit after the migration is applied.
const root = process.cwd();
const temp = mkdtempSync(path.join(tmpdir(), 'bos-movie-validation-'));
try {
  const migration = process.argv.includes('--with-migration')
    ? readFileSync(path.join(root, 'supabase/migrations/20261102124513_movie_visibility_management.sql'), 'utf8').replace(/^begin;\s*$/im, '').replace(/^commit;\s*$/im, '')
    : '';
  const checks = readFileSync(path.join(root, 'supabase/tests/movie_visibility_rollback.sql'), 'utf8');
  const guard = readFileSync(path.join(root,'supabase/schema_and_rls.sql'),'utf8').match(/DO \$visibility_guard\$[\s\S]*?END \$visibility_guard\$;/)?.[0];
  if(!guard) throw new Error('Legacy visibility guard is missing.');
  const legacyChecks = readFileSync(path.join(root,'supabase/tests/movie_legacy_rls_rollback.sql'),'utf8').replace('-- INSERT_VISIBILITY_GUARD',guard);
  const filename = path.join(temp, 'rollback.sql');
  writeFileSync(filename, `begin;\n${migration}\n${checks}\n${legacyChecks}\nrollback;`);
  const executable = process.platform === 'win32' ? 'powershell.exe' : 'supabase';
  const args = ['db', 'query', '--linked', '--workdir', root, '--file', filename, '--output-format', 'json'];
  const output = process.platform === 'win32'
    ? execFileSync(executable, ['-NoProfile','-Command', '& supabase @args', ...args], { encoding: 'utf8', timeout: 120000 })
    : execFileSync(executable, args, { encoding: 'utf8', timeout: 120000 });
  console.log(output);
} finally {
  rmSync(temp, { recursive: true, force: true });
}
