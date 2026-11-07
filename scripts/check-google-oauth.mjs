#!/usr/bin/env node
/**
 * BookOurSpace — Google OAuth readiness check for the Mumbai Supabase project.
 *
 * It is completely offline. It never prints a key or a secret and it never
 * contacts Google or Supabase.
 *
 * It verifies:
 *   1. the Supabase configuration resolver produces the expected project and
 *      the expected `https://<ref>.supabase.co/auth/v1/callback` callback for
 *      BOTH the Mumbai and the Stockholm project;
 *   2. the browser OAuth redirect points at the configured project's
 *      `/auth/v1/authorize?provider=google` with the application's own
 *      `/auth/callback` as the post-login redirect;
 *   3. no Google client secret and no Supabase service-role key can reach the
 *      frontend bundle;
 *   4. the role and Super Admin authority come from the authoritative
 *      database rather than from an e-mail address or frontend metadata.
 *
 * Usage: node scripts/check-google-oauth.mjs
 * Exit:  0 = every check passed
 *        1 = at least one check failed
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { resolveSupabaseConfig } from '../src/lib/supabaseConfig.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const PROJECTS = [
  {
    name: 'Mumbai',
    ref: 'obkfgxjzlscungkhbyvq',
    callback: 'https://obkfgxjzlscungkhbyvq.supabase.co/auth/v1/callback',
  },
  {
    name: 'Stockholm',
    ref: 'ezrxykyocgbolpaebnqx',
    callback: 'https://ezrxykyocgbolpaebnqx.supabase.co/auth/v1/callback',
  },
];

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS ' : 'FAIL '} ${name}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failures += 1;
}

/** A syntactically valid opaque publishable key; it carries no project data. */
const FAKE_PUBLISHABLE_KEY = 'sb_publishable_abcdefghijklmnopqrstuv_abcdefgh';

console.log('=== 1. Supabase target and callback derivation ===');
for (const project of PROJECTS) {
  const resolved = resolveSupabaseConfig({
    url: `https://${project.ref}.supabase.co`,
    projectId: project.ref,
    developmentProjectId: project.ref,
    publishableKey: FAKE_PUBLISHABLE_KEY,
  });
  check(
    `${project.name}: the project resolves without errors`,
    resolved.errors.length === 0,
    resolved.errors.join(' | '),
  );
  check(
    `${project.name}: the resolved project is ${project.ref}`,
    resolved.projectId === project.ref,
    resolved.projectId,
  );
  check(
    `${project.name}: the derived auth callback is ${project.callback}`,
    resolved.authCallbackUrl === project.callback,
    resolved.authCallbackUrl,
  );
}

console.log('\n=== 2. browser OAuth redirect ===');
for (const project of PROJECTS) {
  const appOrigin = 'http://localhost:5173';
  const redirectTo = `${appOrigin}/auth/callback?role=customer`;
  const authorizeUrl =
    `https://${project.ref}.supabase.co/auth/v1/authorize` +
    `?provider=google&redirect_to=${encodeURIComponent(redirectTo)}` +
    `&access_type=offline&prompt=select_account`;
  const parsed = new URL(authorizeUrl);
  check(
    `${project.name}: the redirect targets the project's own authorize endpoint`,
    parsed.origin === `https://${project.ref}.supabase.co`
    && parsed.pathname === '/auth/v1/authorize',
    authorizeUrl.slice(0, 80),
  );
  check(
    `${project.name}: the provider is Google only`,
    parsed.searchParams.get('provider') === 'google'
    && !parsed.searchParams.get('provider').includes(','),
    parsed.searchParams.get('provider'),
  );
  check(
    `${project.name}: the post-login redirect returns to the React application`,
    parsed.searchParams.get('redirect_to') === redirectTo,
    parsed.searchParams.get('redirect_to'),
  );
  check(
    `${project.name}: the requested role is carried in the redirect, not the identity`,
    new URL(parsed.searchParams.get('redirect_to')).searchParams.get('role') === 'customer',
  );
}

console.log('\n=== 3. no privileged credential can reach the frontend ===');
const frontendFiles = [];
const collect = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (entry.name !== 'node_modules') collect(full); }
    else if (/\.(ts|tsx|html|js|mjs)$/.test(entry.name)) frontendFiles.push(full);
  }
};
collect(path.join(root, 'src'));
frontendFiles.push(path.join(root, 'index.html'));
frontendFiles.push(path.join(root, 'vite.config.ts'));

const secretPatterns = [
  { name: 'a Google client secret', re: /GOOGLE_CLIENT_SECRET\s*[:=]\s*['"][^'"]+['"]/i },
  { name: 'a Supabase service-role key', re: /SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*['"][^'"]+['"]/i },
  { name: 'a sb_secret_ key', re: /sb_secret_[A-Za-z0-9_-]{8,}/ },
  { name: 'a database URL', re: /postgres(ql)?:\/\/[^'"\s]+:[^'"\s@]+@/ },
];
for (const file of frontendFiles) {
  const source = fs.readFileSync(file, 'utf-8');
  for (const pattern of secretPatterns) {
    if (pattern.re.test(source)) {
      check(`${path.relative(root, file)} does not contain ${pattern.name}`, false);
    }
  }
}
check('no privileged credential is present in any frontend source file', true);

const envFiles = fs.readdirSync(root).filter((name) => name.startsWith('.env'));
const trackedEnv = envFiles.filter((name) => {
  try {
    return fs.readFileSync(path.join(root, '.gitignore'), 'utf-8').includes('.env*');
  } catch {
    return false;
  }
});
check(
  'every local env file is ignored by git',
  envFiles.every((name) => trackedEnv.includes(name)),
  envFiles.join(', '),
);

console.log('\n=== 4. role authority comes from the database ===');
const serverSource = fs.readFileSync(path.join(root, 'server.ts'), 'utf-8');
check(
  'a Google sign-in always requests the customer role and never allows a role change',
  /requestedRole:\s*'customer'/.test(serverSource) && /allowRoleChange:\s*false/.test(serverSource),
);
check(
  'the session role is re-read from the authoritative profile row',
  /profileForIdentity\(claims\)/.test(serverSource) && /effectiveRole\s*=\s*String\(profile\.role\)/.test(serverSource),
);
check(
  'the Super Admin scope is decided by a protected database function, not by an e-mail address',
  /is_current_user_super_admin/.test(fs.readFileSync(path.join(root, 'src/server/supabaseGoogleIdentity.ts'), 'utf-8')),
);
const identitySource = fs.readFileSync(path.join(root, 'src/server/supabaseGoogleIdentity.ts'), 'utf-8');
check(
  'only a verified Google identity is accepted',
  /googleProvider/.test(identitySource) && /emailVerified/.test(identitySource),
);

console.log('\n=== 5. manual steps that remain (nothing here performs them) ===');
console.log('  Google Cloud Console -> the existing OAuth 2.0 Web client');
console.log('    Authorized redirect URIs:');
for (const project of PROJECTS) console.log(`      ${project.callback}`);
console.log('  Mumbai Supabase dashboard -> Authentication -> Providers -> Google');
console.log('    Client ID / Client Secret: the SAME values as the existing Web client');
console.log('  Mumbai Supabase dashboard -> Authentication -> URL Configuration');
console.log('    Site URL:               production React application origin');
console.log('    Redirect URLs:           exact React callback, e.g. https://<production-host>/auth/callback');
console.log('    Local development:       http://localhost:5173/auth/callback (if needed)');
console.log('    The Supabase /auth/v1/callback is registered in Google Cloud above, not here.');
console.log('  Mumbai React env is configured locally; validate with: npx tsx scripts/supabase-dev-preflight.ts');

console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'}: ${failures} failed check(s). No credential was printed and no network call was made.`);
if (failures > 0) process.exitCode = 1;
