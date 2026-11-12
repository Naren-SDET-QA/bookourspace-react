import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('business ownership migrations define all required entities and modules', () => {
  const phase1 = read('supabase/migrations/20261112010000_business_ownership_phase1.sql');
  const phase2 = read('supabase/migrations/20261112020000_business_ownership_phase2_backfill.sql');
  const phase3 = read('supabase/migrations/20261112030000_business_ownership_phase3_rls.sql');
  for (const table of ['businesses', 'business_members', 'business_invitations', 'business_module_access', 'business_audit_events']) {
    assert.match(phase1, new RegExp(`create table if not exists public\\.${table}`), table);
  }
  for (const module of ['pg_hostels', 'classes', 'venues', 'services', 'hotel_stay', 'movies']) {
    assert.match(phase1, new RegExp(module), module);
  }
  assert.match(phase1, /provider_registration_requests_provider_type_check[\s\S]*movies/);
  assert.match(phase2, /business_backfill_review/);
  assert.match(phase2, /owner_module_backfill_v1/);
  assert.match(phase3, /can_access_business_module/);
  assert.match(phase3, /drop policy if exists "Active listings are viewable by everyone, owners view own"/);
  assert.match(phase3, /business_publicly_available/);
});

test('protected audit history has no client update/delete grants', () => {
  const phase1 = read('supabase/migrations/20261112010000_business_ownership_phase1.sql');
  assert.match(phase1, /revoke insert, update, delete on public\.business_audit_events from authenticated/);
  assert.match(phase1, /grant select on public\.businesses[^;]*business_audit_events to authenticated/);
});

test('Provider Portal exposes a business switcher and business-scoped owner context', () => {
  const provider = read('src/components/ProviderDashboard.tsx');
  const owner = read('src/components/pg/PgOwnerDashboard.tsx');
  assert.match(provider, /fetchBusinesses\(\)/);
  assert.match(provider, /Select business/);
  assert.match(provider, /businessScopedListings|businessListings/);
  assert.match(provider, /approval_status !== 'approved'/);
  assert.match(owner, /businessName/);
  assert.match(owner, /businessRole/);
});

test('business API derives ownership from the session, never the request body', () => {
  const api = read('src/server/businessApi.ts');
  assert.match(api, /verifySession/);
  assert.match(api, /actor\.supabaseUserId/);
  assert.doesNotMatch(api, /body\?\.owner_user_id/);
  assert.match(api, /approval_status, created_by/);
});

test('provider APIs require server-verified business context', () => {
  const server = read('server.ts');
  assert.match(server, /app\.use\(\['\/api\/provider'/);
  assert.match(server, /BUSINESS_CONTEXT_REQUIRED/);
  assert.match(server, /BUSINESS_ACCESS_DENIED/);
  assert.match(server, /x-business-id/);
  assert.match(server, /res\.locals\.businessContext/);
});

test('phase 4 and 5 close invoice, enquiry, contact, claim and transfer gaps', () => {
  const phase4 = read('supabase/migrations/20261112040000_business_ownership_phase4_rls.sql');
  const phase5 = read('supabase/migrations/20261112050000_business_ownership_phase5_transfer.sql');
  assert.match(phase4, /pg_invoices/);
  assert.match(phase4, /enquiries/);
  assert.match(phase4, /provider_contact_settings/);
  assert.match(phase4, /payment_claims/);
  assert.match(phase5, /business_ownership_transfers/);
  assert.match(phase5, /record_business_transfer_audit/);
  const api = read('src/server/businessApi.ts');
  assert.match(api, /ownership-transfer/);
  assert.match(api, /business-ownership-transfers\/accept/);
  assert.match(api, /is_super_admin/);
});

test('admin and staff business controls are present', () => {
  assert.match(read('src/components/admin/BusinessAccessPanel.tsx'), /Approve|Suspend|Revoke/);
  assert.match(read('src/components/admin/BusinessAccessPanel.tsx'), /admin\/businesses/);
  assert.match(read('src/components/pg/BusinessStaffPanel.tsx'), /Invite staff/);
  assert.match(read('src/components/pg/BusinessTransferPanel.tsx'), /Request transfer/);
  assert.match(read('src/components/business/BusinessInvitationAccept.tsx'), /business-invitations\/accept/);
});
