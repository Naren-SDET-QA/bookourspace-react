import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'dotenv';
import { preflightDevelopmentSupabaseConfig } from '../src/lib/supabaseConfig';

const envPath = path.resolve(process.cwd(), '.env.local');

if (!fs.existsSync(envPath)) {
  console.error('FAIL: .env.local is missing. Create it from the setup instructions, then rerun this preflight.');
  process.exit(1);
}

let env: Record<string, string>;
try {
  env = parse(fs.readFileSync(envPath));
} catch {
  console.error('FAIL: .env.local could not be read or parsed. Values were not displayed.');
  process.exit(1);
}

const result = preflightDevelopmentSupabaseConfig({
  url: env.VITE_SUPABASE_URL,
  projectId: env.VITE_SUPABASE_PROJECT_ID,
  developmentProjectId: env.VITE_SUPABASE_DEVELOPMENT_PROJECT_ID,
  publishableKey: env.VITE_SUPABASE_PUBLISHABLE_KEY,
  anonKey: env.VITE_SUPABASE_ANON_KEY,
});

if (!result.ok) {
  for (const error of result.errors) console.error(`FAIL: ${error}`);
  console.error('No key values were displayed. No network request or cloud operation was performed.');
  process.exit(1);
}

console.log(`PASS: local development configuration format is valid for project ${result.projectId}.`);
console.log('The key value was not displayed. No network request or cloud operation was performed.');
console.log('Opaque publishable-key ownership cannot be verified offline; confirm it came from this project’s dashboard.');
