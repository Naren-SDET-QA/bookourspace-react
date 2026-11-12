import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const original = read('supabase/migrations/20261112100000_provider_portal_operations.sql');
const repair = read('supabase/migrations/20261113010000_provider_portal_membership_guard.sql');

test('the legacy self-grant predicate is removed, not merely re-scoped', () => {
  assert.match(original, /with check \(public\.is_admin\(\) or invited_by = auth\.uid\(\)\)/);
  assert.match(repair, /drop policy if exists provider_portal_memberships_write/);
  assert.doesNotMatch(repair, /with check \(public\.is_admin\(\) or invited_by = auth\.uid\(\)\)/);
  assert.doesNotMatch(repair, /create policy provider_portal_memberships_write/);
});

test('direct membership writes require an active administrator', () => {
  const policy = repair.match(/create policy provider_portal_memberships_admin_write[\s\S]*?;/i);
  assert.ok(policy, 'administrator-only policy must exist');
  assert.match(policy[0], /using \(public\.is_admin\(\)\)/);
  assert.match(policy[0], /with check \(public\.is_admin\(\)\)/);
});

test('invitations need an existing scope permission and start invited', () => {
  assert.match(repair, /provider_portal_can_access\(p_property_id, p_listing_id, 'manage_workers'\)/);
  assert.match(repair, /PROVIDER_PORTAL_INVITE_FORBIDDEN/);
  assert.match(repair, /'invited', auth\.uid\(\)/);
  assert.match(repair, /grant execute on function public\.provider_portal_invite_member\(uuid, text, uuid, text, jsonb\) to authenticated/);
});

test('acceptance can only move the invited user own row from invited to active', () => {
  assert.match(repair, /where id = p_membership_id\s+and user_id = auth\.uid\(\)\s+and status = 'invited'/);
  assert.match(repair, /set status = 'active'/);
  assert.match(repair, /grant execute on function public\.provider_portal_accept_invitation\(uuid\) to authenticated/);
  const acceptBody = repair
    .split('create or replace function public.provider_portal_accept_invitation')[1]
    .split('revoke all on function public.provider_portal_accept_invitation')[0];
  assert.doesNotMatch(acceptBody, /portal_role\s*=/);
  assert.doesNotMatch(acceptBody, /permissions\s*=/);
  assert.doesNotMatch(acceptBody, /invited_by\s*=/);
});
