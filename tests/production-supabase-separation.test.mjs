import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import {
  assertProductionSupabaseEnvironment,
  DEVELOPMENT_SUPABASE_PROJECT_REFS,
  isDevelopmentSupabaseProjectRef,
  PRODUCTION_SUPABASE_PROJECT_ID_VAR,
} from '../src/server/supabaseProductionGuard.ts';

const DEV_REF = 'obkfgxjzlscungkhbyvq';
const PROD_REF = 'productionreferenc01';

const productionEnvironment = (overrides = {}) => ({
  NODE_ENV: 'production',
  [PRODUCTION_SUPABASE_PROJECT_ID_VAR]: PROD_REF,
  SUPABASE_PROJECT_ID: PROD_REF,
  SUPABASE_URL: `https://${PROD_REF}.supabase.co`,
  VITE_SUPABASE_PROJECT_ID: PROD_REF,
  VITE_SUPABASE_URL: `https://${PROD_REF}.supabase.co`,
  ...overrides,
});

test('the designated development projects are recognised as development', () => {
  for (const ref of DEVELOPMENT_SUPABASE_PROJECT_REFS) {
    assert.equal(isDevelopmentSupabaseProjectRef(ref), true);
    assert.equal(isDevelopmentSupabaseProjectRef(` ${ref.toUpperCase()} `), true);
  }
  assert.equal(isDevelopmentSupabaseProjectRef(PROD_REF), false);
  assert.equal(isDevelopmentSupabaseProjectRef(''), false);
});

test('development and test environments are unaffected by the production guard', () => {
  assert.doesNotThrow(() =>
    assertProductionSupabaseEnvironment({
      NODE_ENV: 'development',
      VITE_SUPABASE_PROJECT_ID: DEV_REF,
      VITE_SUPABASE_URL: `https://${DEV_REF}.supabase.co`,
      VITE_SUPABASE_DEVELOPMENT_PROJECT_ID: DEV_REF,
    }),
  );
  assert.equal(assertProductionSupabaseEnvironment({ NODE_ENV: 'test' }).projectId, '');
});

test('production fails closed without an explicit production project reference', () => {
  assert.throws(
    () => assertProductionSupabaseEnvironment({ NODE_ENV: 'production' }),
    /PRODUCTION_SUPABASE_PROJECT_ID_REQUIRED/,
  );
  assert.throws(
    () =>
      assertProductionSupabaseEnvironment({
        NODE_ENV: 'production',
        SUPABASE_PROJECT_ID: PROD_REF,
        SUPABASE_URL: `https://${PROD_REF}.supabase.co`,
      }),
    /PRODUCTION_SUPABASE_PROJECT_ID_REQUIRED/,
  );
});

test('production refuses the development project declared as its target', () => {
  assert.throws(
    () =>
      assertProductionSupabaseEnvironment(
        productionEnvironment({
          [PRODUCTION_SUPABASE_PROJECT_ID_VAR]: DEV_REF,
          SUPABASE_PROJECT_ID: DEV_REF,
          SUPABASE_URL: `https://${DEV_REF}.supabase.co`,
          VITE_SUPABASE_PROJECT_ID: DEV_REF,
          VITE_SUPABASE_URL: `https://${DEV_REF}.supabase.co`,
        }),
      ),
    /PRODUCTION_SUPABASE_TARGET_IS_DEVELOPMENT:obkfgxjzlscungkhbyvq/,
  );
});

test('production refuses a development project reference in any single variable', () => {
  for (const variable of ['SUPABASE_PROJECT_ID', 'VITE_SUPABASE_PROJECT_ID']) {
    assert.throws(
      () => assertProductionSupabaseEnvironment(productionEnvironment({ [variable]: DEV_REF })),
      /PRODUCTION_SUPABASE_TARGET_IS_DEVELOPMENT/,
      `${variable} must not name the development project`,
    );
  }
  for (const variable of ['SUPABASE_URL', 'VITE_SUPABASE_URL']) {
    assert.throws(
      () =>
        assertProductionSupabaseEnvironment(
          productionEnvironment({ [variable]: `https://${DEV_REF}.supabase.co` }),
        ),
      /PRODUCTION_SUPABASE_TARGET_IS_DEVELOPMENT/,
      `${variable} must not point at the development project`,
    );
  }
});

test('production refuses a target also designated for development in the same process', () => {
  assert.throws(
    () =>
      assertProductionSupabaseEnvironment(
        productionEnvironment({ VITE_SUPABASE_DEVELOPMENT_PROJECT_ID: PROD_REF }),
      ),
    /PRODUCTION_SUPABASE_TARGET_IS_DEVELOPMENT:productionreferenc01/,
  );
});

test('production refuses disagreeing Supabase variables', () => {
  assert.throws(
    () => assertProductionSupabaseEnvironment(productionEnvironment({ SUPABASE_PROJECT_ID: 'otherprojectref0001' })),
    /PRODUCTION_SUPABASE_PROJECT_ID_CONFLICT:SUPABASE_PROJECT_ID=otherprojectref0001/,
  );
  assert.throws(
    () =>
      assertProductionSupabaseEnvironment(
        productionEnvironment({ VITE_SUPABASE_URL: 'https://otherprojectref0001.supabase.co' }),
      ),
    /PRODUCTION_SUPABASE_PROJECT_ID_CONFLICT:VITE_SUPABASE_URL=otherprojectref0001/,
  );
  assert.throws(
    () => assertProductionSupabaseEnvironment(productionEnvironment({ [PRODUCTION_SUPABASE_PROJECT_ID_VAR]: 'Bad Ref' })),
    /PRODUCTION_SUPABASE_PROJECT_ID_INVALID/,
  );
});

test('production accepts a consistent dedicated production project', () => {
  const target = assertProductionSupabaseEnvironment(productionEnvironment());
  assert.equal(target.projectId, PROD_REF);
});

test('the production server invokes the Supabase separation guard before listening', async () => {
  const source = await readFile(new URL('../server.ts', import.meta.url), 'utf8');
  const guardIndex = source.indexOf('assertProductionSupabaseEnvironment();');
  const listenIndex = source.indexOf('httpServer.listen(');
  assert.notEqual(guardIndex, -1, 'production startup must call the Supabase separation guard');
  assert.notEqual(listenIndex, -1);
  assert.ok(guardIndex < listenIndex, 'Supabase separation guard must run before the HTTP listener');
});

test('no deployment configuration names a development Supabase project', async () => {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  const deployDirectory = path.join(root, 'deploy');
  const auditedExtensions = new Set(['.yaml', '.yml', '.example', '.md', '.sh', '.py', '.json']);

  const walk = async (directory) => {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) files.push(...(await walk(entryPath)));
      else if (auditedExtensions.has(path.extname(entry.name))) files.push(entryPath);
    }
    return files;
  };

  const files = await walk(deployDirectory);
  assert.ok(files.length > 0, 'deployment configuration files were found');

  for (const file of files) {
    const contents = await readFile(file, 'utf8');
    for (const ref of DEVELOPMENT_SUPABASE_PROJECT_REFS) {
      assert.equal(
        contents.includes(ref),
        false,
        `${path.relative(root, file)} must not reference the development project ${ref}`,
      );
    }
  }
});

test('production deployment templates require an explicit Supabase project substitution', async () => {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  const productionEnv = await readFile(path.join(root, 'deploy/env.production.example'), 'utf8');
  assert.match(productionEnv, /^BOS_PRODUCTION_SUPABASE_PROJECT_ID=__PRODUCTION_SUPABASE_PROJECT_REF__$/m);
  assert.match(productionEnv, /^VITE_SUPABASE_URL=https:\/\/__PRODUCTION_SUPABASE_PROJECT_REF__\.supabase\.co$/m);

  const service = await readFile(path.join(root, 'deploy/cloudrun/service.yaml'), 'utf8');
  assert.match(service, /name: SUPABASE_PROJECT_ID\s*\n\s*value: "\$\{SUPABASE_PROJECT_ID\}"/);
  assert.match(service, /name: BOS_PRODUCTION_SUPABASE_PROJECT_ID/);

  const cloudbuild = await readFile(path.join(root, 'deploy/cloudrun/cloudbuild.yaml'), 'utf8');
  assert.match(cloudbuild, /_VITE_SUPABASE_PROJECT_ID: "REPLACE_WITH_PRODUCTION_SUPABASE_PROJECT_REF"/);
  assert.match(cloudbuild, /Refusing to build production with a development Supabase project reference/);

  const nativeBuild = await readFile(path.join(root, 'deploy/native/build-production.sh'), 'utf8');
  assert.match(nativeBuild, /a release build must not target the development Supabase project/);
});
