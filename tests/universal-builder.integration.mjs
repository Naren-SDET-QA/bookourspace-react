#!/usr/bin/env node
/**
 * Universal Live Builder HTTP integration assertions.
 *
 * Drives the real Express API against a disposable PostgreSQL database with
 * signed admin/super-admin/customer sessions. It never touches Supabase or a
 * hosted database.
 *
 * Usage: node tests/universal-builder.integration.mjs <baseUrl> <hmacSecret> <superId> <adminId> <customerId>
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const [base, secret, superId, adminId, customerId] = process.argv.slice(2);
if (!base || !secret || !superId || !adminId || !customerId) {
  console.error('usage: universal-builder.integration.mjs <baseUrl> <hmacSecret> <superId> <adminId> <customerId>');
  process.exit(2);
}

let checks = 0;
function pass(message) {
  checks += 1;
  console.log(`  PASS  ${message}`);
}

function mint(userId, role, name) {
  const payload = Buffer.from(JSON.stringify({
    userId,
    supabaseUserId: userId,
    role,
    name,
    issuedAt: Date.now(),
    expiresAt: Date.now() + 60 * 60 * 1000,
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', `${secret}:SESSION_TOKEN_V2`).update(payload).digest('hex');
  return `${payload}.${signature}`;
}

const SUPER = mint(superId, 'admin', 'Super Admin');
const ADMIN = mint(adminId, 'admin', 'Admin');
const CUSTOMER = mint(customerId, 'customer', 'Customer');

async function call(method, path, { token, body } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers['x-bos-session-token'] = token;
  const response = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({}));
  return { status: response.status, json, headers: response.headers };
}

function expectedStatus(result, status, label) {
  assert.equal(result.status, status, `${label}: expected ${status} got ${result.status} ${JSON.stringify(result.json)}`);
}

function block(id, type, props = {}) {
  return { id, type, visible: true, props };
}

console.log('=== A. registry and public reads ===');
{
  const registry = await call('GET', '/api/builder/registry');
  expectedStatus(registry, 200, 'registry');
  assert.ok(Array.isArray(registry.json.registry.components));
  assert.ok(registry.json.registry.components.length >= 25);
  pass('public component registry lists the reviewed components');

  const publicPage = await call('GET', '/api/builder/pages/pg_hostels');
  expectedStatus(publicPage, 200, 'public page');
  assert.equal(publicPage.json.page.pageKey, 'pg_hostels');
  assert.equal(publicPage.json.page.document.blocks.length, 0);
  assert.ok(publicPage.headers.get('etag'));
  pass('baseline published page is served with an ETag');

  const anonymousDraft = await call('GET', '/api/builder/pages/pg_hostels?mode=admin');
  expectedStatus(anonymousDraft, 401, 'anonymous draft');
  const anonymousWrite = await call('POST', '/api/builder/pages/pg_hostels/draft', {
    body: { document: { pageKey: 'pg_hostels' }, expectedVersion: 0, summary: 'x' },
  });
  expectedStatus(anonymousWrite, 401, 'anonymous write');
  pass('anonymous reads and writes are rejected');

  const customerRead = await call('GET', '/api/builder/pages/pg_hostels?mode=admin', { token: CUSTOMER });
  expectedStatus(customerRead, 403, 'customer admin read');
  pass('a customer session cannot read builder drafts');

  const customerWrite = await call('POST', '/api/builder/pages/pg_hostels/draft', {
    token: CUSTOMER,
    body: { document: { pageKey: 'pg_hostels' }, expectedVersion: 0, summary: 'x' },
  });
  expectedStatus(customerWrite, 403, 'customer write');
  pass('a customer session cannot save configuration');
}

console.log('=== B. draft → publish → rollback ===');
let publishedVersion = 0;
{
  const document = {
    schemaVersion: 1,
    pageKey: 'pg_hostels',
    title: 'PGs and Hostels',
    module: 'pg_hostels',
    description: 'Verified PGs',
    theme: { primaryColor: '#4338CA', accentColor: '#FFE500', buttonRadius: 'rounded-xl' },
    navigation: [{ id: 'nav_explore', label: 'Explore', href: '/#listings', visible: true }],
    blocks: [
      block('heading_0001', 'heading', { text: 'Verified PGs near you', level: 'h1' }),
      block('hero_000001', 'hero', { headline: 'Zero brokerage', ctaLabel: 'Explore', ctaAction: 'open_booking' }),
    ],
  };

  const adminList = await call('GET', '/api/builder/pages', { token: ADMIN });
  expectedStatus(adminList, 200, 'admin list');
  assert.equal(adminList.json.actor.role, 'admin');
  assert.ok(adminList.json.pages.length >= 6);
  pass('admin page list reports the database role, not the token role');

  const draft = await call('POST', '/api/builder/pages/pg_hostels/draft', {
    token: ADMIN,
    body: { document, expectedVersion: 1, summary: 'First real draft' },
  });
  expectedStatus(draft, 200, 'save draft');
  assert.equal(draft.json.page.status, 'draft');
  assert.equal(draft.json.page.versionNumber, 2);
  const draftId = draft.json.page.versionId;
  pass('admin (non-super) can save a draft');

  const publishAsAdmin = await call('POST', '/api/builder/pages/pg_hostels/publish', {
    token: ADMIN,
    body: { versionId: draftId },
  });
  expectedStatus(publishAsAdmin, 403, 'admin publish');
  assert.equal(publishAsAdmin.json.error, 'BUILDER_SUPER_ADMIN_REQUIRED');
  pass('publishing requires Super Admin');

  const published = await call('POST', '/api/builder/pages/pg_hostels/publish', {
    token: SUPER,
    body: { versionId: draftId },
  });
  expectedStatus(published, 200, 'super publish');
  assert.equal(published.json.page.status, 'published');
  publishedVersion = published.json.page.versionNumber;
  pass(`Super Admin published v${publishedVersion}`);

  const publicAfter = await call('GET', '/api/builder/pages/pg_hostels');
  expectedStatus(publicAfter, 200, 'public after publish');
  assert.equal(publicAfter.json.page.versionNumber, publishedVersion);
  assert.equal(publicAfter.json.page.document.blocks.length, 2);
  assert.equal(publicAfter.json.page.document.blocks[0].props.text, 'Verified PGs near you');
  pass('the public client sees the newly published blocks without a deploy');

  const unsafe = await call('POST', '/api/builder/pages/pg_hostels/draft', {
    token: ADMIN,
    body: {
      document: { ...document, blocks: [block('heading_0002', 'heading', { text: '<script>alert(1)</script>' })] },
      expectedVersion: publishedVersion,
      summary: 'unsafe',
    },
  });
  expectedStatus(unsafe, 400, 'unsafe content');
  pass('server-side validation rejects executable content');

  const unknown = await call('POST', '/api/builder/pages/pg_hostels/draft', {
    token: ADMIN,
    body: {
      document: { ...document, blocks: [block('custom_0001', 'custom_html', {})] },
      expectedVersion: publishedVersion,
      summary: 'unknown component',
    },
  });
  expectedStatus(unknown, 400, 'unknown component');
  assert.equal(unknown.json.error, 'BUILDER_UNKNOWN_COMPONENT');
  pass('server-side validation rejects unreviewed components');

  const conflict = await call('POST', '/api/builder/pages/pg_hostels/draft', {
    token: ADMIN,
    body: { document, expectedVersion: 1, summary: 'stale' },
  });
  expectedStatus(conflict, 409, 'stale version');
  assert.equal(conflict.json.error, 'BUILDER_VERSION_CONFLICT');
  pass('optimistic concurrency rejects a stale draft save');

  const versions = await call('GET', '/api/builder/pages/pg_hostels/versions', { token: ADMIN });
  expectedStatus(versions, 200, 'versions');
  assert.ok(versions.json.versions.length >= 2);
  pass('version history is returned');

  const rollback = await call('POST', '/api/builder/pages/pg_hostels/rollback', {
    token: SUPER,
    body: { targetVersionId: versions.json.versions.find((version) => version.versionNumber === 1).versionId },
  });
  expectedStatus(rollback, 200, 'rollback');
  assert.equal(rollback.json.page.status, 'published');
  assert.equal(rollback.json.page.document.blocks.length, 0);
  pass('rollback publishes a new version with the restored document');

  const publicRollback = await call('GET', '/api/builder/pages/pg_hostels');
  expectedStatus(publicRollback, 200, 'public rollback');
  assert.equal(publicRollback.json.page.versionNumber, rollback.json.page.versionNumber);
  assert.equal(publicRollback.json.page.document.blocks.length, 0);
  pass('the public client follows a rollback');
}

console.log('=== B2. six-page publish and rollback ===');
{
  const pages = ['pg_hostels', 'classes', 'venues', 'services', 'hotel_stay', 'movies'];
  for (const pageKey of pages) {
    const versions = await call('GET', `/api/builder/pages/${pageKey}/versions`, { token: ADMIN });
    expectedStatus(versions, 200, `${pageKey} versions`);
    const baseline = versions.json.versions.find((version) => version.versionNumber === 1);
    assert.ok(baseline, `${pageKey} baseline version`);
    const latest = versions.json.versions[0].versionNumber;
    const document = {
      schemaVersion: 1,
      pageKey,
      title: `${pageKey} live`,
      module: pageKey,
      description: 'Six-page propagation probe',
      theme: { primaryColor: '#4338CA' },
      navigation: [],
      blocks: [block(`heading_${pageKey}`, 'heading', { text: `${pageKey} published heading`, level: 'h1' })],
    };
    const draft = await call('POST', `/api/builder/pages/${pageKey}/draft`, {
      token: ADMIN,
      body: { document, expectedVersion: latest, summary: `${pageKey} propagation probe` },
    });
    expectedStatus(draft, 200, `${pageKey} draft`);
    const published = await call('POST', `/api/builder/pages/${pageKey}/publish`, {
      token: SUPER,
      body: { versionId: draft.json.page.versionId },
    });
    expectedStatus(published, 200, `${pageKey} publish`);
    const publicPage = await call('GET', `/api/builder/pages/${pageKey}`);
    expectedStatus(publicPage, 200, `${pageKey} public read`);
    assert.equal(publicPage.json.page.document.blocks[0].props.text, `${pageKey} published heading`);
    const rolled = await call('POST', `/api/builder/pages/${pageKey}/rollback`, {
      token: SUPER,
      body: { targetVersionId: baseline.versionId },
    });
    expectedStatus(rolled, 200, `${pageKey} rollback`);
    const after = await call('GET', `/api/builder/pages/${pageKey}`);
    expectedStatus(after, 200, `${pageKey} public after rollback`);
    assert.equal(after.json.page.document.blocks.length, 0);
    pass(`${pageKey}: publish propagated to the public read and rollback restored the baseline`);
  }
}

console.log('=== C. module builder and records ===');
{
  const schools = {
    schemaVersion: 1,
    key: 'schools',
    label: 'Schools',
    module: 'classes',
    description: 'Schools that post jobs',
    fields: [
      { key: 'name', label: 'School name', type: 'text', required: true },
      { key: 'city', label: 'City', type: 'text', required: false },
    ],
    relations: [],
    listView: { columns: ['name', 'city'], searchFields: ['name'] },
    permissions: { read: 'public', write: 'admin' },
  };
  const draft = await call('POST', '/api/builder/entities/schools/draft', {
    token: ADMIN,
    body: { schema: schools, expectedVersion: 0, summary: 'School directory' },
  });
  expectedStatus(draft, 200, 'entity draft');
  const publish = await call('POST', '/api/builder/entities/schools/publish', {
    token: SUPER,
    body: { versionId: draft.json.version.id },
  });
  expectedStatus(publish, 200, 'entity publish');
  pass('a new School module is defined and published');

  const jobs = {
    ...schools,
    key: 'jobs',
    label: 'Jobs',
    fields: [
      { key: 'title', label: 'Job title', type: 'text', required: true },
      { key: 'salary', label: 'Salary', type: 'money', required: false, min: 0 },
      { key: 'school_id', label: 'School', type: 'relation', required: true, relationTarget: 'schools' },
    ],
    relations: [{ key: 'school', target: 'schools', type: 'belongs_to', required: true }],
    listView: { columns: ['title'], searchFields: ['title'] },
  };
  const jobDraft = await call('POST', '/api/builder/entities/jobs/draft', {
    token: ADMIN,
    body: { schema: jobs, expectedVersion: 0, summary: 'School jobs' },
  });
  expectedStatus(jobDraft, 200, 'job draft');
  const jobPublish = await call('POST', '/api/builder/entities/jobs/publish', {
    token: SUPER,
    body: { versionId: jobDraft.json.version.id },
  });
  expectedStatus(jobPublish, 200, 'job publish');
  pass('Job belongs to School is enforced against a published target');

  const missingRelation = await call('POST', '/api/builder/entities/applications/draft', {
    token: ADMIN,
    body: {
      schema: {
        ...schools,
        key: 'applications',
        label: 'Applications',
        fields: [{ key: 'name', label: 'Applicant', type: 'text', required: true }],
        relations: [{ key: 'job', target: 'missing_jobs', type: 'belongs_to', required: true }],
        listView: { columns: ['name'], searchFields: ['name'] },
      },
      expectedVersion: 0,
      summary: 'Application',
    },
  });
  expectedStatus(missingRelation, 200, 'application draft');
  const missingPublish = await call('POST', '/api/builder/entities/applications/publish', {
    token: SUPER,
    body: { versionId: missingRelation.json.version.id },
  });
  expectedStatus(missingPublish, 409, 'unpublished relation target');
  assert.equal(missingPublish.json.error, 'BUILDER_RELATION_TARGET_UNPUBLISHED');
  pass('a relation to an unpublished module cannot be published');

  const record = await call('POST', '/api/builder/entities/schools/records', {
    token: ADMIN,
    body: { data: { name: 'Delhi Public School', city: 'Hyderabad' } },
  });
  expectedStatus(record, 200, 'record create');
  assert.equal(record.json.record.data.name, 'Delhi Public School');
  pass('a record is stored against the published module');

  const badRecord = await call('POST', '/api/builder/entities/schools/records', {
    token: ADMIN,
    body: { data: { name: 'X', injected: 'DROP TABLE profiles' } },
  });
  expectedStatus(badRecord, 400, 'record unknown field');
  pass('records reject fields outside the published schema');

  const invalidMoney = await call('POST', '/api/builder/entities/jobs/records', {
    token: ADMIN,
    body: { data: { title: 'Teacher', salary: 1.999, school_id: record.json.record.id } },
  });
  expectedStatus(invalidMoney, 400, 'money precision');
  pass('money values keep at most two decimals');

  const list = await call('GET', '/api/builder/entities/schools/records', { token: ADMIN });
  expectedStatus(list, 200, 'record list');
  assert.equal(list.json.records.length, 1);
  pass('records are listed from PostgreSQL');

  const schoolsState = await call('GET', '/api/builder/entities/schools?mode=admin', { token: ADMIN });
  expectedStatus(schoolsState, 200, 'school state');
  const schoolV1 = schoolsState.json.versions.find((version) => Number(version.versionNumber) === 1);
  assert.ok(schoolV1, 'school v1');
  const changed = { ...schools, label: 'Schools v2' };
  const changeDraft = await call('POST', '/api/builder/entities/schools/draft', {
    token: ADMIN,
    body: { schema: changed, expectedVersion: 1, summary: 'Rename schools' },
  });
  expectedStatus(changeDraft, 200, 'school change draft');
  const changePublish = await call('POST', '/api/builder/entities/schools/publish', {
    token: SUPER,
    body: { versionId: changeDraft.json.version.id },
  });
  expectedStatus(changePublish, 200, 'school change publish');
  const entityRollback = await call('POST', '/api/builder/entities/schools/rollback', {
    token: SUPER,
    body: { targetVersionId: schoolV1.versionId },
  });
  expectedStatus(entityRollback, 200, 'entity rollback');
  const restoredEntity = await call('GET', '/api/builder/entities/schools');
  expectedStatus(restoredEntity, 200, 'restored entity');
  assert.equal(restoredEntity.json.entity.schema.label, 'Schools');
  const adminEntityRollback = await call('POST', '/api/builder/entities/schools/rollback', {
    token: ADMIN,
    body: { targetVersionId: schoolV1.versionId },
  });
  expectedStatus(adminEntityRollback, 403, 'admin entity rollback');
  pass('module rollback restores the prior published schema and requires Super Admin');
}

console.log('=== D. reports, audit and RLS helpers ===');
{
  const report = await call('GET', '/api/builder/reports/listings_by_module', { token: ADMIN });
  expectedStatus(report, 200, 'report');
  assert.equal(report.json.report.metric, 'listings_by_module');
  assert.ok(Array.isArray(report.json.report.rows));
  pass('approved report metric executes a fixed server-side query');

  const unknownMetric = await call('GET', '/api/builder/reports/raw_sql', { token: ADMIN });
  expectedStatus(unknownMetric, 400, 'unknown metric');
  pass('arbitrary metric names are rejected');

  const audit = await call('GET', '/api/builder/audit', { token: ADMIN });
  expectedStatus(audit, 200, 'audit');
  const actions = audit.json.entries.map((entry) => entry.action);
  for (const action of ['page_draft_saved', 'page_published', 'page_rolled_back', 'entity_published', 'entity_rolled_back', 'record_created']) {
    assert.ok(actions.includes(action), `audit missing ${action}`);
  }
  assert.ok(audit.json.entries.every((entry) => entry.actor_role === 'admin' || entry.actor_role === 'super_admin'));
  pass('page, module and record changes are audited with a server-derived role');

  // Leave one draft in place so the SQL step can prove RLS hides drafts from
  // anonymous readers while the published version stays visible.
  const classVersions = await call('GET', '/api/builder/pages/classes/versions', { token: ADMIN });
  expectedStatus(classVersions, 200, 'class versions');
  const classLatest = classVersions.json.versions[0].versionNumber;
  const rlsDraft = await call('POST', '/api/builder/pages/classes/draft', {
    token: ADMIN,
    body: {
      document: {
        schemaVersion: 1,
        pageKey: 'classes',
        title: 'Classes',
        module: 'classes',
        description: 'Draft kept for the RLS probe',
        theme: { primaryColor: '#4338CA' },
        navigation: [],
        blocks: [block('heading_1000', 'heading', { text: 'Draft only' })],
      },
      expectedVersion: classLatest,
      summary: 'RLS probe draft',
    },
  });
  expectedStatus(rlsDraft, 200, 'rls probe draft');
  pass('a draft remains unpublished for the RLS probe');
}

console.log('=== E. PostgreSQL legacy live-page config ===');
{
  const anonymous = await call('GET', '/api/live-page-config');
  expectedStatus(anonymous, 200, 'legacy anonymous read');
  assert.equal(anonymous.json.ok, true);
  pass('legacy live-page-config answers from PostgreSQL instead of 503');

  const draft = await call('POST', '/api/live-page-config/draft', {
    token: ADMIN,
    body: {
      config: { pages: { pg_hostels: { heroBanner: { headline: 'Legacy PG probe' } } } },
      summary: 'Legacy persistence probe',
    },
  });
  expectedStatus(draft, 200, 'legacy draft');
  const privateDraftRead = await call('GET', '/api/live-page-config');
  expectedStatus(privateDraftRead, 200, 'published config while draft exists');
  assert.notEqual(privateDraftRead.json.published?.pages?.pg_hostels?.heroBanner?.headline, 'Legacy PG probe');
  const baselineVersionId = privateDraftRead.json.published?.versionId;
  assert.ok(baselineVersionId, 'published baseline version is available for rollback');
  const publishAsAdmin = await call('POST', '/api/live-page-config/publish', { token: ADMIN, body: {} });
  expectedStatus(publishAsAdmin, 403, 'legacy publish as non-super admin');
  assert.equal(publishAsAdmin.json.error, 'BUILDER_SUPER_ADMIN_REQUIRED');
  const publishedConfig = await call('POST', '/api/live-page-config/publish', { token: SUPER, body: {} });
  expectedStatus(publishedConfig, 200, 'legacy publish');
  const publicConfig = await call('GET', '/api/live-page-config');
  expectedStatus(publicConfig, 200, 'legacy public read');
  assert.ok(publicConfig.json.published?.versionId);
  assert.equal(publicConfig.json.otaSync.activeVersion, publishedConfig.json.versionId);
  assert.equal(publicConfig.json.published?.pages?.pg_hostels?.heroBanner?.headline, 'Legacy PG probe');
  pass('Admin drafts stay private until Super Admin publishes; the published version is served publicly');

  const rollbackAsAdmin = await call('POST', '/api/live-page-config/rollback', {
    token: ADMIN,
    body: { versionId: baselineVersionId },
  });
  expectedStatus(rollbackAsAdmin, 403, 'live page rollback as regular Admin');
  assert.equal(rollbackAsAdmin.json.error, 'BUILDER_SUPER_ADMIN_REQUIRED');
  const rollback = await call('POST', '/api/live-page-config/rollback', {
    token: SUPER,
    body: { versionId: baselineVersionId },
  });
  expectedStatus(rollback, 200, 'live page rollback as Super Admin');
  assert.equal(rollback.json.published.versionId, rollback.json.versionId);
  assert.ok(rollback.json.auditLogs.some((entry) => entry.action === 'live_page_rolled_back'));
  const afterRollback = await call('GET', '/api/live-page-config');
  expectedStatus(afterRollback, 200, 'public read after rollback');
  assert.notEqual(afterRollback.json.published?.pages?.pg_hostels?.heroBanner?.headline, 'Legacy PG probe');
  pass('only Super Admin can roll back; the restored published state and audit row are visible');

  const anonymousModules = await call('GET', '/api/admin/modules');
  expectedStatus(anonymousModules, 401, 'anonymous admin modules read');
  const customerModules = await call('GET', '/api/admin/modules', { token: CUSTOMER });
  expectedStatus(customerModules, 403, 'customer admin modules read');
  const adminModules = await call('GET', '/api/admin/modules', { token: ADMIN });
  expectedStatus(adminModules, 200, 'Admin module settings read');
  assert.ok(adminModules.json.modules.app_settings);
  const customerModuleWrite = await call('PUT', '/api/admin/modules/app_settings', {
    token: CUSTOMER,
    body: { payload: { routeOwnershipProbe: 'customer-denied' } },
  });
  expectedStatus(customerModuleWrite, 403, 'customer Admin module settings write');
  const adminModuleWrite = await call('PUT', '/api/admin/modules/app_settings', {
    token: ADMIN,
    body: { payload: { routeOwnershipProbe: 'database-admin-write' } },
  });
  expectedStatus(adminModuleWrite, 200, 'Admin module settings write');
  assert.equal(adminModuleWrite.json.moduleState.payload.routeOwnershipProbe, 'database-admin-write');
  const reloadedAdminModules = await call('GET', '/api/admin/modules', { token: ADMIN });
  assert.equal(reloadedAdminModules.json.modules.app_settings.payload.routeOwnershipProbe, 'database-admin-write');
  pass('Admin module routes retain role checks and PostgreSQL persistence');

  const adminStyleWrite = await call('POST', '/api/live-page-config/section-styles', {
    token: ADMIN,
    body: { styles: { classes: 'timetable', venues: 'agenda' } },
  });
  expectedStatus(adminStyleWrite, 403, 'section styles as non-super admin');
  assert.equal(adminStyleWrite.json.error, 'BUILDER_SUPER_ADMIN_REQUIRED');
  const invalidStyle = await call('POST', '/api/live-page-config/section-styles', {
    token: SUPER,
    body: { styles: { classes: 'compact' } },
  });
  expectedStatus(invalidStyle, 400, 'invalid section style');
  const publishedStyles = await call('POST', '/api/live-page-config/section-styles', {
    token: SUPER,
    body: { styles: { classes: 'timetable', venues: 'agenda' } },
  });
  expectedStatus(publishedStyles, 200, 'section style publish');
  const publicStyles = await call('GET', '/api/live-page-config');
  expectedStatus(publicStyles, 200, 'published styles for customer');
  assert.equal(publicStyles.json.published?.sectionStyles?.classes, 'timetable');
  assert.equal(publicStyles.json.published?.sectionStyles?.venues, 'agenda');
  pass('only Super Admin can publish allowlisted timetable and agenda styles for all clients');

  const adminAccess = await call('GET', '/api/platform-settings/access', { token: ADMIN });
  expectedStatus(adminAccess, 200, 'regular admin visibility access');
  assert.equal(adminAccess.json.canManage, false);
  const superAccess = await call('GET', '/api/platform-settings/access', { token: SUPER });
  expectedStatus(superAccess, 200, 'super admin visibility access');
  assert.equal(superAccess.json.canManage, true);

  const moduleRows = await call('GET', '/api/modules');
  expectedStatus(moduleRows, 200, 'public module flag snapshot');
  const ecommerce = moduleRows.json.modules.find((row) => row.module_key === 'ecommerce');
  assert.ok(ecommerce);
  const deniedModuleWrite = await call('PATCH', '/api/platform-settings/module-flags/ecommerce', {
    token: ADMIN,
    body: { allow_contact_owner: false },
  });
  expectedStatus(deniedModuleWrite, 403, 'regular admin module visibility write');
  const invalidModuleWrite = await call('PATCH', '/api/platform-settings/module-flags/ecommerce', {
    token: SUPER,
    body: { allow_online_booking: true },
  });
  expectedStatus(invalidModuleWrite, 400, 'module visibility allowlist');
  const moduleWrite = await call('PATCH', '/api/platform-settings/module-flags/ecommerce', {
    token: SUPER,
    body: { allow_contact_owner: !ecommerce.allow_contact_owner },
  });
  expectedStatus(moduleWrite, 200, 'super admin module visibility write');
  assert.equal(moduleWrite.json.module.allow_contact_owner, !ecommerce.allow_contact_owner);
  const changedModuleRows = await call('GET', '/api/modules');
  assert.equal(changedModuleRows.json.modules.find((row) => row.module_key === 'ecommerce').allow_contact_owner, !ecommerce.allow_contact_owner);
  const moduleRestore = await call('PATCH', '/api/platform-settings/module-flags/ecommerce', {
    token: SUPER,
    body: { allow_contact_owner: ecommerce.allow_contact_owner },
  });
  expectedStatus(moduleRestore, 200, 'restore module visibility fixture');
  pass('module flags are server-authorized to Super Admin and immediately persist to the public module feed');

  const originalVisibility = publicStyles.json.published?.visibility ?? {
    popularCategoriesDisabledCities: ['Hyderabad'],
    disabledSubcategories: [],
  };
  const deniedVisibility = await call('POST', '/api/live-page-config/visibility', {
    token: ADMIN,
    body: { visibility: { popularCategoriesDisabledCities: [] } },
  });
  expectedStatus(deniedVisibility, 403, 'regular admin visibility publish');
  const invalidVisibility = await call('POST', '/api/live-page-config/visibility', {
    token: SUPER,
    body: { visibility: { routes: { '/admin': false } } },
  });
  expectedStatus(invalidVisibility, 400, 'visibility schema allowlist');
  const visibilityWrite = await call('POST', '/api/live-page-config/visibility', {
    token: SUPER,
    body: { visibility: { popularCategoriesDisabledCities: ['Testville'], disabledSubcategories: ['Test category'] } },
  });
  expectedStatus(visibilityWrite, 200, 'super admin visibility publish');
  assert.deepEqual(visibilityWrite.json.visibility.popularCategoriesDisabledCities, ['Testville']);
  assert.deepEqual(visibilityWrite.json.visibility.disabledSubcategories, ['Test category']);
  const customerVisibility = await call('GET', '/api/live-page-config');
  expectedStatus(customerVisibility, 200, 'customer published visibility read');
  assert.deepEqual(customerVisibility.json.published?.visibility?.disabledSubcategories, ['Test category']);
  const restoreVisibility = await call('POST', '/api/live-page-config/visibility', {
    token: SUPER,
    body: { visibility: originalVisibility },
  });
  expectedStatus(restoreVisibility, 200, 'restore visibility fixture');
  pass('category and home visibility publish to a new central version; anonymous customers receive only published settings');

  const customerDraft = await call('POST', '/api/live-page-config/draft', {
    token: CUSTOMER,
    body: { config: { pages: {} } },
  });
  expectedStatus(customerDraft, 403, 'legacy customer write');
  pass('legacy configuration writes remain admin-only');
}

console.log('=== F. approved policy configuration ===');
{
  const anonymous = await call('GET', '/api/admin/policies');
  expectedStatus(anonymous, 401, 'anonymous policies');
  const customer = await call('GET', '/api/admin/policies', { token: CUSTOMER });
  expectedStatus(customer, 403, 'customer policies');
  const admin = await call('GET', '/api/admin/policies', { token: ADMIN });
  expectedStatus(admin, 200, 'admin policies');
  assert.ok(Array.isArray(admin.json.policies.payment.methods));
  pass('policy configuration is admin-only');

  const saved = await call('PUT', '/api/admin/policies', {
    token: ADMIN,
    body: {
      policies: {
        ...admin.json.policies,
        payment: { ...admin.json.policies.payment, depositDisplayPercent: 35 },
      },
    },
  });
  expectedStatus(saved, 200, 'save policies');
  assert.equal(saved.json.policies.payment.depositDisplayPercent, 35);
  pass('approved policy values are validated and stored');

  const outOfRange = await call('PUT', '/api/admin/policies', {
    token: ADMIN,
    body: { policies: { payment: { depositDisplayPercent: 500 } } },
  });
  expectedStatus(outOfRange, 400, 'policy range');
  assert.equal(outOfRange.json.error, 'POLICY_INVALID');
  const unknownKey = await call('PUT', '/api/admin/policies', {
    token: ADMIN,
    body: { policies: { payment: { capture: 'always' } } },
  });
  expectedStatus(unknownKey, 400, 'policy allowlist');
  pass('policy payloads reject unknown keys and out-of-range values');
}

console.log(`\nALL ${checks} UNIVERSAL BUILDER CHECKS PASSED`);
