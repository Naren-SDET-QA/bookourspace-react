import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveSupabaseProjectConfig } from '../src/lib/supabaseProjectConfig.ts';

const projectRef = 'abcdefghijklmnopqrst';
const approved = {
  url: `https://${projectRef}.supabase.co`,
  projectId: projectRef,
  allowedProjectRefs: projectRef,
};

test('missing Supabase configuration fails closed without selecting a default project', () => {
  assert.deepEqual(resolveSupabaseProjectConfig({}), {
    ok: false,
    url: '',
    projectId: '',
    error: 'missing_configuration',
  });
});

test('an explicitly configured and approved project is accepted', () => {
  assert.deepEqual(resolveSupabaseProjectConfig(approved), {
    ok: true,
    url: approved.url,
    projectId: projectRef,
  });
});

test('unknown project references are rejected unless allowlisted', () => {
  assert.equal(
    resolveSupabaseProjectConfig({ ...approved, allowedProjectRefs: 'zyxwvutsrqponmlkjihg' }).error,
    'unapproved_project'
  );
});

test('malformed and non-HTTPS URLs are rejected', () => {
  assert.equal(resolveSupabaseProjectConfig({ ...approved, url: 'not-a-url' }).error, 'invalid_url');
  assert.equal(resolveSupabaseProjectConfig({ ...approved, url: `http://${projectRef}.supabase.co` }).error, 'invalid_url');
});

test('URL project reference mismatch is rejected', () => {
  assert.equal(
    resolveSupabaseProjectConfig({ ...approved, url: 'https://zyxwvutsrqponmlkjihg.supabase.co' }).error,
    'project_ref_mismatch'
  );
});
