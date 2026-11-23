#!/usr/bin/env node
/**
 * Production build guard.
 *
 * Two checks, both fail-closed, neither needs a network call or a credential:
 *
 *   --prebuild   Refuse to start a production build unless the Supabase target
 *                is explicitly declared and is not a development project.
 *                Vite inlines `VITE_*` values at build time, so a bundle built
 *                with the development target cannot be corrected later on the
 *                server: the browser would talk to development data.
 *
 *   (default)    Scan the built output for a development project reference and
 *                for server-only secret material. A production bundle must
 *                contain neither.
 *
 * Usage:
 *   node scripts/verify-production-bundle.mjs --prebuild
 *   node scripts/verify-production-bundle.mjs [--dir dist]
 *
 * Exit 0 prints a PASS line; exit 1 prints the exact violation and fix.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GUARD_SOURCE = path.join(REPO_ROOT, 'src/server/supabaseProductionGuard.ts');

export const BUNDLE_SCAN_EXTENSIONS = new Set([
  '.js', '.mjs', '.cjs', '.css', '.html', '.htm', '.json', '.webmanifest', '.txt', '.svg', '.map',
]);

/**
 * Server-only material that must never reach a browser bundle.
 *
 * These are matched as complete values, not bare prefixes: the Supabase client
 * legitimately tests `key.startsWith('sb_secret_')` to reject a secret key, and
 * that guard string must not be reported as a leaked key.
 */
export const BUNDLE_SECRET_MARKERS = [
  { pattern: /sb_secret_[A-Za-z0-9_-]{20,}/, label: 'a Supabase secret key' },
  {
    pattern: /(?:SUPABASE_SERVICE_ROLE_KEY|RAZORPAY_KEY_SECRET|BOS_SERVER_HMAC_SECRET)\s*[=:]\s*["'`]?[A-Za-z0-9_\-+/=]{16,}/,
    label: 'a server-only secret assignment',
  },
];

const PRIVATE_KEY_PATTERN = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/;
const PROJECT_REF_PATTERN = /^[a-z0-9][a-z0-9-]{2,62}$/;
const CREDENTIAL_URL_PATTERN = /postgres(?:ql)?:\/\/[^\s"'`]+:[^\s"'`@/]+@/;

/**
 * Reads the development project references from the server guard so the build
 * check and the runtime check can never drift apart.
 */
export function readDevelopmentProjectRefs(guardSourcePath = GUARD_SOURCE) {
  const source = fs.readFileSync(guardSourcePath, 'utf8');
  const block = source.match(
    /export const DEVELOPMENT_SUPABASE_PROJECT_REFS\s*=\s*\[([\s\S]*?)\]\s*as const;/,
  );
  if (!block) {
    throw new Error('GUARD_SOURCE_UNREADABLE: DEVELOPMENT_SUPABASE_PROJECT_REFS not found');
  }
  const refs = [...block[1].matchAll(/'([^']+)'/g)].map((match) => match[1].trim().toLowerCase());
  if (refs.length === 0) {
    throw new Error('GUARD_SOURCE_UNREADABLE: DEVELOPMENT_SUPABASE_PROJECT_REFS is empty');
  }
  return refs;
}

function projectRefFromUrl(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return '';
  try {
    const hostname = new URL(raw).hostname.toLowerCase();
    if (!hostname.endsWith('.supabase.co')) return '';
    return hostname.slice(0, -'.supabase.co'.length);
  } catch {
    return '';
  }
}

function cleanRef(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/**
 * Pre-build gate. Returns the declared production project reference or throws.
 * Applies to every `build:production` run, whatever NODE_ENV says, because the
 * mistake this prevents is a build-time inlining, not a runtime behaviour.
 */
export function assertProductionBuildEnvironment(env = process.env, developmentRefs = readDevelopmentProjectRefs()) {
  const declared = cleanRef(env.BOS_PRODUCTION_SUPABASE_PROJECT_ID);
  const target = cleanRef(env.VITE_SUPABASE_PROJECT_ID);
  const targetFromUrl = projectRefFromUrl(env.VITE_SUPABASE_URL);
  const effective = target || targetFromUrl;

  if (!effective) {
    throw new Error(
      'PRODUCTION_BUILD_SUPABASE_REF_REQUIRED: set VITE_SUPABASE_PROJECT_ID (or VITE_SUPABASE_URL) to the production project before building; the client bundle would otherwise ship without a usable Supabase target.',
    );
  }
  if (developmentRefs.includes(effective)) {
    throw new Error(
      `PRODUCTION_BUILD_TARGET_IS_DEVELOPMENT:${effective}:VITE_SUPABASE_PROJECT_ID: a production bundle must never inline a development project reference.`,
    );
  }
  if (target && targetFromUrl && target !== targetFromUrl) {
    throw new Error(
      `PRODUCTION_BUILD_SUPABASE_TARGET_CONFLICT:VITE_SUPABASE_PROJECT_ID=${target},VITE_SUPABASE_URL=${targetFromUrl}`,
    );
  }
  const developmentAllowlist = cleanRef(env.VITE_SUPABASE_DEVELOPMENT_PROJECT_ID);
  if (developmentAllowlist && developmentRefs.includes(developmentAllowlist)) {
    throw new Error(
      `PRODUCTION_BUILD_DEVELOPMENT_ALLOWLIST_PRESENT:${developmentAllowlist}:VITE_SUPABASE_DEVELOPMENT_PROJECT_ID must be unset for a production build; it would inline a development project reference into the client bundle.`,
    );
  }
  if (declared && developmentRefs.includes(declared)) {
    throw new Error(
      `PRODUCTION_BUILD_TARGET_IS_DEVELOPMENT:${declared}:BOS_PRODUCTION_SUPABASE_PROJECT_ID`,
    );
  }
  if (declared && declared !== effective) {
    throw new Error(
      `PRODUCTION_BUILD_SUPABASE_TARGET_CONFLICT:BOS_PRODUCTION_SUPABASE_PROJECT_ID=${declared},VITE_SUPABASE_PROJECT_ID=${effective}`,
    );
  }

  // The browser resolver accepts a hosted target only when it is explicitly
  // declared as development or as production. Omitting the production
  // declaration would inline a URL the client rejects at runtime, so the
  // artifact would ship unable to reach Supabase at all.
  const productionDeclaration = cleanRef(env.VITE_SUPABASE_PRODUCTION_PROJECT_ID);
  if (!productionDeclaration) {
    throw new Error(
      `PRODUCTION_BUILD_PRODUCTION_TARGET_UNDECLARED: set VITE_SUPABASE_PRODUCTION_PROJECT_ID=${effective} so the built client accepts the production project; without it the client resolver refuses every hosted target.`,
    );
  }
  if (!PROJECT_REF_PATTERN.test(productionDeclaration)) {
    throw new Error(
      `PRODUCTION_BUILD_PRODUCTION_TARGET_INVALID:${productionDeclaration}:VITE_SUPABASE_PRODUCTION_PROJECT_ID`,
    );
  }
  if (developmentRefs.includes(productionDeclaration)) {
    throw new Error(
      `PRODUCTION_BUILD_TARGET_IS_DEVELOPMENT:${productionDeclaration}:VITE_SUPABASE_PRODUCTION_PROJECT_ID`,
    );
  }
  if (productionDeclaration !== effective) {
    throw new Error(
      `PRODUCTION_BUILD_SUPABASE_TARGET_CONFLICT:VITE_SUPABASE_PRODUCTION_PROJECT_ID=${productionDeclaration},VITE_SUPABASE_PROJECT_ID=${effective}`,
    );
  }
  return effective;
}

function listBundleFiles(root) {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!BUNDLE_SCAN_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
      files.push(full);
    }
  };
  walk(root);
  return files;
}

/**
 * Post-build scan. Returns every violation: development project references and
 * server-only secret material found in shipped text assets.
 */
export function scanBundle(bundleDir, developmentRefs = readDevelopmentProjectRefs()) {
  const root = path.resolve(bundleDir);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new Error(`BUNDLE_DIRECTORY_MISSING: ${root}`);
  }
  const violations = [];
  for (const file of listBundleFiles(root)) {
    const relative = path.relative(root, file).split(path.sep).join('/');
    const content = fs.readFileSync(file, 'utf8');
    for (const ref of developmentRefs) {
      if (content.toLowerCase().includes(ref)) {
        violations.push({
          file: relative,
          kind: 'development_project_reference',
          detail: ref,
          fix: 'Rebuild with the production Supabase target (npm run build:production) and re-deploy the bundle.',
        });
      }
    }
    for (const { pattern, label } of BUNDLE_SECRET_MARKERS) {
      if (pattern.test(content)) {
        violations.push({
          file: relative,
          kind: 'server_secret_material',
          detail: label,
          fix: 'Remove the value from any VITE_* or client-inlined source; server secrets belong only in the runtime environment.',
        });
      }
    }
    if (PRIVATE_KEY_PATTERN.test(content)) {
      violations.push({
        file: relative,
        kind: 'private_key_material',
        detail: 'a PEM private key block',
        fix: 'Remove the key from the repository and rotate it; it must never be part of a build input.',
      });
    }
    if (CREDENTIAL_URL_PATTERN.test(content)) {
      violations.push({
        file: relative,
        kind: 'credential_in_url',
        detail: 'a PostgreSQL URL containing an inline password',
        fix: 'Keep database URLs server-only and out of every VITE_* variable.',
      });
    }
  }
  return violations;
}

function formatViolations(violations) {
  const lines = [`FAIL production bundle check: ${violations.length} violation(s)`];
  for (const violation of violations) {
    lines.push(`  - ${violation.file}: ${violation.kind} (${violation.detail})`);
    lines.push(`    fix: ${violation.fix}`);
  }
  return lines.join('\n');
}

function main(argv = process.argv.slice(2)) {
  const prebuild = argv.includes('--prebuild');
  const dirIndex = argv.indexOf('--dir');
  const dir = dirIndex >= 0 ? argv[dirIndex + 1] : 'dist';
  if (prebuild) {
    const ref = assertProductionBuildEnvironment();
    console.log(`PASS production build target declared: ${ref}`);
    return 0;
  }
  const violations = scanBundle(path.resolve(REPO_ROOT, dir));
  if (violations.length > 0) {
    console.error(formatViolations(violations));
    console.error('\nDo not deploy this bundle. Rebuild with `npm run build:production` once the production Supabase target is configured.');
    return 1;
  }
  console.log(`PASS production bundle clean: no development project reference or server secret in ${dir}`);
  return 0;
}

const invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedDirectly) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(`FAIL production build guard: ${error?.message || error}`);
    process.exitCode = 1;
  }
}
