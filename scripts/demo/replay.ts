import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { localDatabaseEnv, installBaseSchema } from './database';

// This is a destructive reset of ONLY the newly configured local React stack.
if (!process.argv.includes('--reset-react-demo')) throw new Error('Pass --reset-react-demo to reset only the dedicated bookourspace-react-demo local stack.');
const config = readFileSync('supabase/config.toml', 'utf8');
if (!config.includes('project_id = "bookourspace-react-demo"') || !config.includes('port = 55422')) throw new Error('Unexpected local project configuration; reset refused.');
const env = localDatabaseEnv(process.env.BOS_DEMO_DATABASE_URL || 'postgresql://postgres:postgres@localhost:55422/postgres');
const command = process.platform === 'win32' ? 'powershell.exe' : 'supabase';
const args = process.platform === 'win32' ? ['-NoProfile', '-Command', 'supabase db reset --local --no-seed'] : ['db', 'reset', '--local', '--no-seed'];
const result = spawnSync(command, args, { stdio: 'inherit', timeout: 180000 });
if (result.error || result.status !== 0) throw new Error('Dedicated local reset failed. No hosted fallback is allowed.');
installBaseSchema(env);
await import('./seed');
