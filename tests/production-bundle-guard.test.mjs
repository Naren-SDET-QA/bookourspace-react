import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import {
  assertProductionBuildEnvironment,
  readDevelopmentProjectRefs,
  scanBundle,
} from '../scripts/verify-production-bundle.mjs';

const DEVELOPMENT_REF = readDevelopmentProjectRefs()[0];
const PRODUCTION_REF = 'prodrefabcdefghijklmnop';

const created = [];
function tempBundle(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bos-bundle-guard-'));
  created.push(dir);
  for (const [name, content] of Object.entries(files)) {
    const target = path.join(dir, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  return dir;
}

afterEach(() => {
  while (created.length > 0) {
    fs.rmSync(created.pop(), { recursive: true, force: true });
  }
});

describe('production build environment gate', () => {
  it('refuses a build with no Supabase target at all', () => {
    assert.throws(
      () => assertProductionBuildEnvironment({}),
      /PRODUCTION_BUILD_SUPABASE_REF_REQUIRED/,
    );
  });

  it('refuses the development project as the build target', () => {
    assert.throws(
      () => assertProductionBuildEnvironment({ VITE_SUPABASE_PROJECT_ID: DEVELOPMENT_REF }),
      /PRODUCTION_BUILD_TARGET_IS_DEVELOPMENT/,
    );
  });

  it('refuses a development project hidden in VITE_SUPABASE_URL', () => {
    assert.throws(
      () => assertProductionBuildEnvironment({
        VITE_SUPABASE_URL: `https://${DEVELOPMENT_REF}.supabase.co`,
      }),
      /PRODUCTION_BUILD_TARGET_IS_DEVELOPMENT/,
    );
  });

  it('refuses a declared production ref that is a development project', () => {
    assert.throws(
      () => assertProductionBuildEnvironment({
        BOS_PRODUCTION_SUPABASE_PROJECT_ID: DEVELOPMENT_REF,
        VITE_SUPABASE_PROJECT_ID: PRODUCTION_REF,
        VITE_SUPABASE_URL: `https://${PRODUCTION_REF}.supabase.co`,
      }),
      /PRODUCTION_BUILD_TARGET_IS_DEVELOPMENT/,
    );
  });

  it('refuses a project id and URL that describe different projects', () => {
    assert.throws(
      () => assertProductionBuildEnvironment({
        VITE_SUPABASE_PROJECT_ID: PRODUCTION_REF,
        VITE_SUPABASE_URL: 'https://anotherprodref000000000.supabase.co',
      }),
      /PRODUCTION_BUILD_SUPABASE_TARGET_CONFLICT/,
    );
  });

  it('accepts a dedicated production target and rejects a mismatched declaration', () => {
    assert.equal(
      assertProductionBuildEnvironment({
        VITE_SUPABASE_PROJECT_ID: PRODUCTION_REF,
        VITE_SUPABASE_URL: `https://${PRODUCTION_REF}.supabase.co`,
        VITE_SUPABASE_PRODUCTION_PROJECT_ID: PRODUCTION_REF,
        BOS_PRODUCTION_SUPABASE_PROJECT_ID: PRODUCTION_REF,
      }),
      PRODUCTION_REF,
    );
    assert.throws(
      () => assertProductionBuildEnvironment({
        VITE_SUPABASE_PROJECT_ID: PRODUCTION_REF,
        BOS_PRODUCTION_SUPABASE_PROJECT_ID: 'otherprodref0000000000000',
      }),
      /PRODUCTION_BUILD_SUPABASE_TARGET_CONFLICT/,
    );
  });
});


  it('refuses a production build that still carries the development allowlist', () => {
    assert.throws(
      () => assertProductionBuildEnvironment({
        VITE_SUPABASE_PROJECT_ID: PRODUCTION_REF,
        VITE_SUPABASE_URL: `https://${PRODUCTION_REF}.supabase.co`,
        VITE_SUPABASE_DEVELOPMENT_PROJECT_ID: DEVELOPMENT_REF,
      }),
      /PRODUCTION_BUILD_DEVELOPMENT_ALLOWLIST_PRESENT/,
    );
  });

describe('production bundle scan', () => {
  it('accepts a bundle with no development reference or secret', () => {
    const dir = tempBundle({
      'assets/index-abc.js': `const url="https://${PRODUCTION_REF}.supabase.co";`,
      'index.html': '<div id="root"></div>',
    });
    assert.deepEqual(scanBundle(dir), []);
  });

  it('rejects a bundle that inlines the development project reference', () => {
    const dir = tempBundle({
      'assets/supabaseClient-abc.js': `const url="https://${DEVELOPMENT_REF}.supabase.co";`,
    });
    const violations = scanBundle(dir);
    assert.equal(violations.length, 1);
    assert.equal(violations[0].kind, 'development_project_reference');
    assert.equal(violations[0].file, 'assets/supabaseClient-abc.js');
  });

  it('rejects nested bundles, not only top-level assets', () => {
    const dir = tempBundle({
      'chunks/deep/nested-abc.js': `/* ${DEVELOPMENT_REF} */`,
    });
    assert.equal(scanBundle(dir).length, 1);
  });

  it('rejects server secret material and inline database credentials', () => {
    // Assembled at runtime so this fixture is not itself a scanner finding.
    const fakeSecretKey = ['sb', 'secret', 'abcdefghijklmnopqrstuvwx'].join('_');
    const fakeDatabaseUrl = ['postgresql://postgres.projectref', 'pw@host:5432/postgres'].join(':');
    const dir = tempBundle({
      'assets/a.js': `const k="${fakeSecretKey}";`,
      'assets/b.js': `const u="${fakeDatabaseUrl}";`,
    });
    const kinds = scanBundle(dir).map((violation) => violation.kind);
    assert.deepEqual(kinds, ['server_secret_material', 'credential_in_url']);
  });


  it('does not flag the Supabase client prefix test as a leaked secret', () => {
    const dir = tempBundle({
      'assets/supabase-client.js': 'const isKey=e=>e.startsWith(`sb_publishable_`)||e.startsWith(`sb_secret_`);',
    });
    assert.deepEqual(scanBundle(dir), []);
  });

  it('fails closed when the bundle directory does not exist', () => {
    assert.throws(() => scanBundle(path.join(os.tmpdir(), 'bos-missing-bundle-dir')), /BUNDLE_DIRECTORY_MISSING/);
  });
});

describe('production client target declaration', () => {
  const base = {
    VITE_SUPABASE_PROJECT_ID: PRODUCTION_REF,
    VITE_SUPABASE_URL: `https://${PRODUCTION_REF}.supabase.co`,
  };

  it('refuses a build that omits VITE_SUPABASE_PRODUCTION_PROJECT_ID', () => {
    assert.throws(
      () => assertProductionBuildEnvironment(base),
      /PRODUCTION_BUILD_PRODUCTION_TARGET_UNDECLARED/,
    );
  });

  it('refuses a production declaration that names the development project', () => {
    assert.throws(
      () => assertProductionBuildEnvironment({
        ...base,
        VITE_SUPABASE_PRODUCTION_PROJECT_ID: DEVELOPMENT_REF,
      }),
      /PRODUCTION_BUILD_TARGET_IS_DEVELOPMENT/,
    );
  });

  it('refuses a production declaration that names another project', () => {
    assert.throws(
      () => assertProductionBuildEnvironment({
        ...base,
        VITE_SUPABASE_PRODUCTION_PROJECT_ID: 'otherprodref0000000000000',
      }),
      /PRODUCTION_BUILD_SUPABASE_TARGET_CONFLICT/,
    );
  });

  it('accepts a production declaration that matches the build target', () => {
    assert.equal(
      assertProductionBuildEnvironment({ ...base, VITE_SUPABASE_PRODUCTION_PROJECT_ID: PRODUCTION_REF }),
      PRODUCTION_REF,
    );
  });
});
