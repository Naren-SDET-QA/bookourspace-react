import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import net from 'node:net';
import { after, before, test } from 'node:test';
import { chromium, expect } from '@playwright/test';
import pg from 'pg';

/**
 * Dynamic Super Admin Service Builder E2E.
 *
 * Runs against the real Express server and a disposable PostgreSQL database
 * supplied by supabase/tests/run_services_e2e.sh. It exercises Human Help,
 * Medicine Delivery, Water Bottle Delivery and a newly created custom category
 * from configuration through booking, document review and completion.
 */

const { Pool } = pg;
const connectionString = process.env.BOS_LISTINGS_DATABASE_URL;
const SECRET = 'service-builder-e2e-secret';
const TENANT = 'default';

const superAdmin = '5e000000-0000-4000-8000-000000000001';
const admin = '5e000000-0000-4000-8000-000000000002';
const customer = '5e000000-0000-4000-8000-000000000003';
const humanProvider = '5e000000-0000-4000-8000-000000000004';
const medicineProvider = '5e000000-0000-4000-8000-000000000005';
const unlicensedProvider = '5e000000-0000-4000-8000-000000000006';
const waterProvider = '5e000000-0000-4000-8000-000000000007';
const customProvider = '5e000000-0000-4000-8000-000000000008';

const listings = {
  human: 'sb-e2e-human-help',
  medicine: 'sb-e2e-medicine',
  medicineUnlicensed: 'sb-e2e-medicine-unlicensed',
  water: 'sb-e2e-water',
  custom: 'sb-e2e-pet-grooming',
  noPayment: 'sb-e2e-no-payment',
  approval: 'sb-e2e-admin-approval',
};

let pool;
let child;
let serverUrl;
let serverStderr = '';
const available = Boolean(connectionString);

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function token(id, role, email) {
  const payload = Buffer.from(JSON.stringify({
    userId: `USR-${role}-${id.slice(-4)}`,
    supabaseUserId: id,
    email,
    name: `${role} service builder`,
    role,
    authProvider: 'google',
    issuedAt: Date.now(),
    expiresAt: Date.now() + 10 * 60_000,
  })).toString('base64url');
  const signature = createHmac('sha256', `${SECRET}:SESSION_TOKEN_V2`).update(payload).digest('hex');
  return `${payload}.${signature}`;
}

const superToken = token(superAdmin, 'admin', 'super-builder@example.test');
const adminToken = token(admin, 'admin', 'builder-admin@example.test');
const customerToken = token(customer, 'customer', 'builder-customer@example.test');
const humanToken = token(humanProvider, 'provider', 'human-provider@example.test');
const medicineToken = token(medicineProvider, 'provider', 'medicine-provider@example.test');
const unlicensedToken = token(unlicensedProvider, 'provider', 'unlicensed-provider@example.test');
const waterToken = token(waterProvider, 'provider', 'water-provider@example.test');
const customToken = token(customProvider, 'provider', 'custom-provider@example.test');

async function request(method, path, authToken, body) {
  const response = await fetch(`${serverUrl}${path}`, {
    method,
    headers: {
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}

async function startServer(port) {
  serverUrl = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'server.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      VITE_ENABLE_DEMO_DATA: 'false',
      DISABLE_HMR: 'true',
      PORT: String(port),
      BOS_SERVER_HMAC_SECRET: SECRET,
      BOS_LISTINGS_DATABASE_URL: connectionString,
      BOS_SERVICE_TENANT_ID: TENANT,
      BOS_SERVICES_UPI_VPA: 'bookourspace@okhdfcbank',
      BOS_SERVICES_UPI_NAME: 'BookOurSpace Services',
      BOS_PAYMENT_SANDBOX: '1',
      BOS_PAYMENT_SANDBOX_SECRET: `${SECRET}-sandbox`,
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  child.stderr.on('data', (chunk) => {
    serverStderr = `${serverStderr}${chunk.toString()}`.slice(-12000);
    if (process.env.BOS_E2E_DEBUG_SERVER === '1') process.stderr.write(chunk);
  });
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`server exited (${child.exitCode}): ${serverStderr}`);
    try {
      const response = await fetch(`${serverUrl}/api/auth/me`);
      if (response.status === 401) return;
    } catch { /* starting */ }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error(`server did not become ready: ${serverStderr}`);
}

async function stopServer() {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await new Promise((resolve) => child.once('exit', resolve));
}

function targetDate(daysAhead = 3) {
  return new Date(Date.now() + daysAhead * 86_400_000).toISOString().slice(0, 10);
}

function customCategory(overrides = {}) {
  return {
    schemaVersion: 1,
    name: 'Pet Grooming',
    description: 'At-home grooming by verified providers.',
    icon: 'paw-print',
    imageUrl: '',
    accentColor: '#7C3AED',
    deliveryKind: 'human_help',
    bookingType: 'scheduled',
    providerAssignment: 'customer_selects',
    deliveryModes: ['on_site'],
    pricing: { mode: 'fixed', amount: 499, currency: 'INR', unit: 'per pet', quantityEnabled: true, minQuantity: 1, maxQuantity: 3 },
    recurring: { enabled: false, frequencies: ['weekly'], defaultFrequency: 'weekly', maxOccurrences: 4 },
    toggles: {
      gpsTracking: true, liveMap: true, customerOtp: false, prescriptionVerification: false,
      documentVerification: false, payment: true, deliveryConfirmation: true,
    },
    fields: [
      { key: 'petType', label: 'Pet type', type: 'select', required: true, options: ['Dog', 'Cat'], maxLength: 50 },
      { key: 'groomingNotes', label: 'Grooming notes', type: 'textarea', required: false, maxLength: 300 },
    ],
    documents: [],
    approvalWorkflow: { requiresProviderAcceptance: true, requiresDocumentVerification: false, requiresAdminApproval: false },
    validation: { minLeadTimeMinutes: 0, maxAdvanceDays: 30, requiresServiceAddress: true, requiresPhone: true, notesRequired: false },
    legacyCategoryIds: [],
    requiresLicensedPharmacy: false,
    ...overrides,
  };
}

async function seedUsers() {
  for (const [id, email, name, role, isSuperAdmin] of [
    [superAdmin, 'super-builder@example.test', 'Super Builder', 'admin', true],
    [admin, 'builder-admin@example.test', 'Builder Admin', 'admin', false],
    [customer, 'builder-customer@example.test', 'Builder Customer', 'customer', false],
    [humanProvider, 'human-provider@example.test', 'Human Help Provider', 'provider', false],
    [medicineProvider, 'medicine-provider@example.test', 'Licensed Pharmacy', 'provider', false],
    [unlicensedProvider, 'unlicensed-provider@example.test', 'Unlicensed Provider', 'provider', false],
    [waterProvider, 'water-provider@example.test', 'Water Provider', 'provider', false],
    [customProvider, 'custom-provider@example.test', 'Pet Groomer', 'provider', false],
  ]) {
    await pool.query(
      `insert into auth.users (id, email, raw_user_meta_data)
       values ($1, $2, jsonb_build_object('full_name', $3::text)) on conflict (id) do nothing`,
      [id, email, name],
    );
    await pool.query(
      `insert into public.profiles (id, role, account_status, full_name, email, is_super_admin)
       values ($1, $2, 'active', $3, $4, $5)
       on conflict (id) do update
         set role = excluded.role,
             account_status = 'active',
             full_name = excluded.full_name,
             email = excluded.email,
             is_super_admin = excluded.is_super_admin`,
      [id, role, name, email, isSuperAdmin],
    );
  }
}

async function seedListingsAndCredentials() {
  await pool.query(
    `delete from public.service_bookings
      where customer_id = $1 or provider_id = any($2::uuid[])`,
    [customer, [humanProvider, medicineProvider, unlicensedProvider, waterProvider, customProvider]],
  );
  await pool.query('delete from public.listings where id = any($1::text[])', [Object.values(listings)]);
  await pool.query('delete from public.service_provider_credentials where provider_id = any($1::uuid[])', [
    [medicineProvider, unlicensedProvider, customProvider, humanProvider],
  ]);
  await pool.query('delete from public.service_category_configs where id = any($1::text[])', [['pet_grooming', 'no_payment_service', 'approval_service', 'tenant_b_service']]);

  for (const [id, owner, title, categoryId, price, unit] of [
    [listings.human, humanProvider, 'Human Help E2E', 'human_help', 199, 'per task'],
    [listings.medicine, medicineProvider, 'Licensed Pharmacy E2E', 'medicine_delivery', 250, 'per order'],
    [listings.medicineUnlicensed, unlicensedProvider, 'Unlicensed Pharmacy E2E', 'medicine_delivery', 250, 'per order'],
    [listings.water, waterProvider, 'Water Delivery E2E', 'water_delivery', 40, 'per can'],
    [listings.custom, customProvider, 'Pet Grooming E2E', 'pet_grooming', 499, 'per pet'],
    [listings.noPayment, customProvider, 'Community Cleanup E2E', 'no_payment_service', 0, 'per task'],
    [listings.approval, humanProvider, 'Admin Approval Errand E2E', 'approval_service', 120, 'per task'],
  ]) {
    await pool.query(
      `insert into public.listings (id, owner_id, title, category_id, subcategory, entity_type, price, price_unit, status, payload)
       values ($1, $2, $3, $4, $5, 'service', $6, $7, 'active', '{"sectionType":"services"}'::jsonb)
       on conflict (id) do update
         set owner_id = excluded.owner_id, title = excluded.title, category_id = excluded.category_id,
             subcategory = excluded.subcategory, price = excluded.price, price_unit = excluded.price_unit,
             status = 'active', payload = excluded.payload`,
      [id, owner, title, categoryId, title, price, unit],
    );
  }

  await pool.query(
    `insert into public.service_provider_credentials
      (tenant_id, provider_id, category_id, credential_type, license_number, issuing_authority, expires_on, status, reviewed_by, reviewed_at, review_note)
     values ($1, $2, 'medicine_delivery', 'pharmacy_license', 'TS-PHARMA-0001', 'Telangana Drugs Control', current_date + 365, 'verified', $3, now(), 'E2E seeded verified pharmacy licence')`,
    [TENANT, medicineProvider, superAdmin],
  );
  await pool.query(
    `insert into public.service_provider_credentials
      (tenant_id, provider_id, category_id, credential_type, license_number, issuing_authority, expires_on, status)
     values ($1, $2, null, 'professional_license', 'PET-GROOM-7788', 'State Skill Board', current_date + 365, 'pending')`,
    [TENANT, customProvider],
  );
}

before(async () => {
  if (!available) return;
  pool = new Pool({ connectionString });
  await seedUsers();
  await seedListingsAndCredentials();
  await startServer(await freePort());
});

after(async () => {
  if (!available) return;
  await stopServer();
  await pool?.end();
});

const dbTest = (name, fn) => test(name, { skip: !available }, fn);

dbTest('baseline categories are public and medicine is forced into the regulated rules', async () => {
  const response = await request('GET', '/api/service-catalog');
  assert.equal(response.status, 200);
  const ids = response.data.categories.map((category) => category.id);
  assert.deepEqual(ids.sort(), ['human_help', 'medicine_delivery', 'water_delivery']);
  const medicine = response.data.categories.find((category) => category.id === 'medicine_delivery');
  assert.equal(medicine.config.toggles.prescriptionVerification, true);
  assert.equal(medicine.config.toggles.documentVerification, true);
  assert.equal(medicine.config.approvalWorkflow.requiresDocumentVerification, true);
  assert.equal(medicine.config.requiresLicensedPharmacy, true);
  assert.equal(medicine.config.documents.some((document) => document.key === 'prescription' && document.required), true);
});

dbTest('only a Super Admin can save, publish or disable a category', async () => {
  const saveBody = { config: customCategory(), summary: 'Create Pet Grooming', expectedVersion: null };
  const anonymous = await request('POST', '/api/admin/service-catalog/pet_grooming/draft', null, saveBody);
  assert.equal(anonymous.status, 401);
  const customerAttempt = await request('POST', '/api/admin/service-catalog/pet_grooming/draft', customerToken, saveBody);
  assert.equal(customerAttempt.status, 403);
  const adminAttempt = await request('POST', '/api/admin/service-catalog/pet_grooming/draft', adminToken, saveBody);
  assert.equal(adminAttempt.status, 403);
  assert.equal(adminAttempt.data.error, 'SERVICE_CATALOG_SUPER_ADMIN_REQUIRED');
  const adminList = await request('GET', '/api/admin/service-catalog', adminToken);
  assert.equal(adminList.status, 200);
  assert.equal(adminList.data.actor.role, 'admin');
});

let customVersionId;
let customPublishedVersion;

dbTest('custom category draft, publish, version conflict, disable and re-enable', async () => {
  const save = await request('POST', '/api/admin/service-catalog/pet_grooming/draft', superToken, {
    config: customCategory(),
    summary: 'Create Pet Grooming',
    expectedVersion: null,
  });
  assert.equal(save.status, 200);
  assert.equal(save.data.version.status, 'draft');
  customVersionId = save.data.version.versionId;
  assert.equal(save.data.version.config.name, 'Pet Grooming');

  const draftPublic = await request('GET', '/api/service-catalog');
  assert.equal(draftPublic.data.categories.some((category) => category.id === 'pet_grooming'), false);

  const publish = await request('POST', '/api/admin/service-catalog/pet_grooming/publish', superToken, {
    versionId: customVersionId,
  });
  assert.equal(publish.status, 200);
  assert.equal(publish.data.version.status, 'published');
  customPublishedVersion = publish.data.version;

  const publicAfter = await request('GET', '/api/service-catalog');
  const created = publicAfter.data.categories.find((category) => category.id === 'pet_grooming');
  assert.ok(created);
  assert.equal(created.config.icon, 'paw-print');
  assert.equal(created.config.fields[0].key, 'petType');
  assert.equal(created.config.toggles.customerOtp, false);

  const secondDraft = await request('POST', '/api/admin/service-catalog/pet_grooming/draft', superToken, {
    config: customCategory({ name: 'Pet Grooming Deluxe' }),
    summary: 'Second draft',
    expectedVersion: 1,
  });
  assert.equal(secondDraft.status, 200);
  const stale = await request('POST', '/api/admin/service-catalog/pet_grooming/draft', superToken, {
    config: customCategory({ name: 'Stale write' }),
    summary: 'Stale write',
    expectedVersion: 1,
  });
  assert.equal(stale.status, 409);
  assert.equal(stale.data.error, 'SERVICE_CATALOG_VERSION_CONFLICT');

  const disabled = await request('POST', '/api/admin/service-catalog/pet_grooming/enabled', superToken, {
    enabled: false,
    reason: 'E2E temporary disable',
  });
  assert.equal(disabled.status, 200);
  const hidden = await request('GET', '/api/service-catalog');
  assert.equal(hidden.data.categories.some((category) => category.id === 'pet_grooming'), false);

  const enabled = await request('POST', '/api/admin/service-catalog/pet_grooming/enabled', superToken, {
    enabled: true,
    reason: 'E2E re-enable',
  });
  assert.equal(enabled.status, 200);
  const visible = await request('GET', '/api/service-catalog');
  assert.equal(visible.data.categories.some((category) => category.id === 'pet_grooming'), true);
});

dbTest('a second category can be created for a service that does not collect payment', async () => {
  const config = customCategory({
    name: 'Community Cleanup',
    icon: 'leaf',
    fields: [{ key: 'area', label: 'Area', type: 'text', required: true, maxLength: 120 }],
    toggles: {
      gpsTracking: false, liveMap: false, customerOtp: false, prescriptionVerification: false,
      documentVerification: false, payment: false, deliveryConfirmation: false,
    },
  });
  const save = await request('POST', '/api/admin/service-catalog/no_payment_service/draft', superToken, {
    config,
    summary: 'Create free community service',
    expectedVersion: null,
  });
  assert.equal(save.status, 200);
  const publish = await request('POST', '/api/admin/service-catalog/no_payment_service/publish', superToken, {
    versionId: save.data.version.versionId,
  });
  assert.equal(publish.status, 200);
  const publicList = await request('GET', '/api/service-catalog');
  const stored = publicList.data.categories.find((category) => category.id === 'no_payment_service');
  assert.equal(stored.config.toggles.payment, false);
  assert.equal(stored.config.toggles.gpsTracking, false);
});

dbTest('an approval workflow can require an administrator to accept a booking', async () => {
  const config = customCategory({
    name: 'Admin Approval Errand',
    icon: 'briefcase',
    fields: [{ key: 'task', label: 'Task', type: 'text', required: true, maxLength: 120 }],
    approvalWorkflow: { requiresProviderAcceptance: true, requiresDocumentVerification: false, requiresAdminApproval: true },
    toggles: {
      gpsTracking: false, liveMap: false, customerOtp: false, prescriptionVerification: false,
      documentVerification: false, payment: true, deliveryConfirmation: false,
    },
  });
  const save = await request('POST', '/api/admin/service-catalog/approval_service/draft', superToken, {
    config,
    summary: 'Create admin-approval category',
    expectedVersion: null,
  });
  assert.equal(save.status, 200);
  const publish = await request('POST', '/api/admin/service-catalog/approval_service/publish', superToken, {
    versionId: save.data.version.versionId,
  });
  assert.equal(publish.status, 200);

  const booking = await request('POST', '/api/services/bookings', customerToken, {
    idempotencyKey: randomUUID(),
    listingId: listings.approval,
    categoryConfigId: 'approval_service',
    scheduledDate: targetDate(4),
    timeSlot: '18:00',
    serviceAddress: 'Office 5, Hitech City, Hyderabad',
    customerPhone: '+91 90000 00006',
    paymentMode: 'pay_after_service',
    quantity: 1,
    fieldValues: { task: 'Collect signed documents' },
  });
  assert.equal(booking.status, 201, JSON.stringify(booking.data));
  const bookingId = booking.data.booking.id;
  const providerDenied = await request('POST', `/api/services/bookings/${bookingId}/actions`, humanToken, { action: 'accept' });
  assert.equal(providerDenied.status, 409);
  assert.equal(providerDenied.data.error, 'ADMIN_APPROVAL_REQUIRED');
  const adminAccepted = await request('POST', `/api/services/bookings/${bookingId}/actions`, adminToken, { action: 'accept' });
  assert.equal(adminAccepted.status, 200, JSON.stringify(adminAccepted.data));
  assert.equal(adminAccepted.data.booking.status, 'accepted');
});

dbTest('medicine toggles are forced on even when the Super Admin saves them off', async () => {
  const current = await request('GET', '/api/service-catalog/medicine_delivery');
  const config = current.data.category.config;
  const disabled = {
    ...config,
    toggles: {
      ...config.toggles,
      prescriptionVerification: false,
      documentVerification: false,
      customerOtp: true,
    },
    documents: [],
    approvalWorkflow: { ...config.approvalWorkflow, requiresDocumentVerification: false },
    requiresLicensedPharmacy: false,
  };
  const save = await request('POST', '/api/admin/service-catalog/medicine_delivery/draft', superToken, {
    config: disabled,
    summary: 'Attempt to disable medicine controls (must be forced back on)',
    expectedVersion: 1,
  });
  assert.equal(save.status, 200);
  assert.equal(save.data.version.config.toggles.prescriptionVerification, true);
  assert.equal(save.data.version.config.toggles.documentVerification, true);
  assert.equal(save.data.version.config.requiresLicensedPharmacy, true);
  assert.equal(save.data.version.config.toggles.customerOtp, true);
  assert.equal(save.data.version.config.documents.some((document) => document.key === 'prescription' && document.required && document.verificationRequired), true);
  const publish = await request('POST', '/api/admin/service-catalog/medicine_delivery/publish', superToken, {
    versionId: save.data.version.versionId,
  });
  assert.equal(publish.status, 200);
  const publicAfter = await request('GET', '/api/service-catalog/medicine_delivery');
  assert.equal(publicAfter.data.category.config.toggles.prescriptionVerification, true);
});

dbTest('Human Help uses saved fields and completes with a real OTP handover', async () => {
  const booking = await request('POST', '/api/services/bookings', customerToken, {
    idempotencyKey: randomUUID(),
    listingId: listings.human,
    categoryConfigId: 'human_help',
    scheduledDate: targetDate(3),
    timeSlot: '10:00',
    serviceAddress: 'Flat 101, Madhapur, Hyderabad',
    customerPhone: '+91 90000 00001',
    paymentMode: 'pay_after_service',
    quantity: 2,
    fieldValues: { taskType: 'Errand', taskDetails: 'Collect a parcel and buy groceries.' },
  });
  assert.equal(booking.status, 201, JSON.stringify(booking.data));
  assert.equal(booking.data.booking.categoryConfigId, 'human_help');
  assert.equal(booking.data.booking.categoryConfigVersion, 1);
  assert.equal(booking.data.booking.quantity, 2);
  assert.equal(booking.data.booking.fieldValues.taskType, 'Errand');
  assert.equal(booking.data.booking.deliveryMode, 'on_site');

  const missingField = await request('POST', '/api/services/bookings', customerToken, {
    idempotencyKey: randomUUID(),
    listingId: listings.human,
    categoryConfigId: 'human_help',
    scheduledDate: targetDate(4),
    timeSlot: '11:00',
    serviceAddress: 'Flat 101, Madhapur, Hyderabad',
    customerPhone: '+91 90000 00001',
    paymentMode: 'pay_after_service',
    quantity: 1,
    fieldValues: { taskType: 'Errand' },
  });
  assert.equal(missingField.status, 400);
  assert.equal(missingField.data.error, 'SERVICE_REQUIRED_FIELDS_MISSING');

  const unknownField = await request('POST', '/api/services/bookings', customerToken, {
    idempotencyKey: randomUUID(),
    listingId: listings.human,
    categoryConfigId: 'human_help',
    scheduledDate: targetDate(5),
    timeSlot: '11:00',
    serviceAddress: 'Flat 101, Madhapur, Hyderabad',
    customerPhone: '+91 90000 00001',
    paymentMode: 'pay_after_service',
    quantity: 1,
    fieldValues: { taskType: 'Errand', taskDetails: 'Help', unexpected: 'x' },
  });
  assert.equal(unknownField.status, 400);
  assert.equal(unknownField.data.error, 'SERVICE_UNKNOWN_FIELD');

  const bookingId = booking.data.booking.id;
  assert.equal((await request('POST', `/api/services/bookings/${bookingId}/actions`, humanToken, { action: 'accept' })).status, 200);
  assert.equal((await request('POST', `/api/services/bookings/${bookingId}/actions`, humanToken, { action: 'start' })).status, 200);
  const otp = await request('POST', `/api/services/bookings/${bookingId}/otp`, customerToken, {});
  assert.equal(otp.status, 201);
  assert.match(otp.data.code, /^\d{6}$/);
  const verify = await request('POST', `/api/services/bookings/${bookingId}/verify-otp`, humanToken, { code: otp.data.code });
  assert.equal(verify.status, 200);
  assert.equal(verify.data.verified, true);
  const complete = await request('POST', `/api/services/bookings/${bookingId}/actions`, humanToken, { action: 'complete' });
  assert.equal(complete.status, 200, JSON.stringify(complete.data));
  assert.equal(complete.data.booking.status, 'completed');
  assert.ok(complete.data.booking.deliveryConfirmedAt);
});

dbTest('Water uses quantity and a recurring schedule through the same booking engine', async () => {
  const booking = await request('POST', '/api/services/bookings', customerToken, {
    idempotencyKey: randomUUID(),
    listingId: listings.water,
    categoryConfigId: 'water_delivery',
    scheduledDate: targetDate(3),
    timeSlot: '12:00',
    serviceAddress: 'Flat 202, Gachibowli, Hyderabad',
    customerPhone: '+91 90000 00002',
    paymentMode: 'pay_after_service',
    quantity: 3,
    recurrence: { frequency: 'weekly', occurrences: 4 },
    fieldValues: { bottleSize: '20L can', deliveryInstructions: 'Leave at the door' },
  });
  assert.equal(booking.status, 201, JSON.stringify(booking.data));
  assert.equal(booking.data.booking.quantity, 3);
  assert.equal(booking.data.booking.recurrenceFrequency, 'weekly');
  assert.equal(booking.data.booking.recurrenceOccurrences, 4);
  assert.equal(booking.data.booking.deliveryMode, 'home_delivery');

  const bookingId = booking.data.booking.id;
  assert.equal((await request('POST', `/api/services/bookings/${bookingId}/actions`, waterToken, { action: 'accept' })).status, 200);
  assert.equal((await request('POST', `/api/services/bookings/${bookingId}/actions`, waterToken, { action: 'start' })).status, 200);
  const otp = await request('POST', `/api/services/bookings/${bookingId}/otp`, customerToken, {});
  assert.equal(otp.status, 201);
  assert.equal((await request('POST', `/api/services/bookings/${bookingId}/verify-otp`, waterToken, { code: otp.data.code })).data.verified, true);
  const complete = await request('POST', `/api/services/bookings/${bookingId}/actions`, waterToken, { action: 'complete' });
  assert.equal(complete.status, 200, JSON.stringify(complete.data));
});

dbTest('a newly created custom category books at its saved price and completes', async () => {
  const booking = await request('POST', '/api/services/bookings', customerToken, {
    idempotencyKey: randomUUID(),
    listingId: listings.custom,
    categoryConfigId: 'pet_grooming',
    scheduledDate: targetDate(3),
    timeSlot: '13:00',
    serviceAddress: 'Flat 303, Kondapur, Hyderabad',
    customerPhone: '+91 90000 00003',
    paymentMode: 'pay_after_service',
    quantity: 2,
    fieldValues: { petType: 'Dog', groomingNotes: 'Short cut please' },
  });
  assert.equal(booking.status, 201, JSON.stringify(booking.data));
  assert.equal(booking.data.booking.amount, 998);
  assert.equal(booking.data.booking.amountBasis, 'per pet × 2');
  assert.equal(booking.data.booking.assignmentMode, 'customer_selects');
  assert.equal(booking.data.booking.deliveryMode, 'on_site');

  const bookingId = booking.data.booking.id;
  assert.equal((await request('POST', `/api/services/bookings/${bookingId}/actions`, customToken, { action: 'accept' })).status, 200);
  assert.equal((await request('POST', `/api/services/bookings/${bookingId}/actions`, customToken, { action: 'start' })).status, 200);
  const confirmed = await request('POST', `/api/services/bookings/${bookingId}/confirm-delivery`, customToken, {});
  assert.equal(confirmed.status, 200, JSON.stringify(confirmed.data));
  assert.ok(confirmed.data.booking.deliveryConfirmedAt);
  const complete = await request('POST', `/api/services/bookings/${bookingId}/actions`, customToken, { action: 'complete' });
  assert.equal(complete.status, 200, JSON.stringify(complete.data));
  assert.equal(complete.data.booking.status, 'completed');
});

dbTest('a category with payment disabled forces pay-later and rejects a payment intent', async () => {
  const booking = await request('POST', '/api/services/bookings', customerToken, {
    idempotencyKey: randomUUID(),
    listingId: listings.noPayment,
    categoryConfigId: 'no_payment_service',
    scheduledDate: targetDate(3),
    timeSlot: '14:00',
    serviceAddress: 'Community Hall, Madhapur, Hyderabad',
    customerPhone: '+91 90000 00004',
    paymentMode: 'upi_intent',
    quantity: 1,
    fieldValues: { area: 'Madhapur' },
  });
  assert.equal(booking.status, 201, JSON.stringify(booking.data));
  assert.equal(booking.data.booking.paymentEnabled, false);
  assert.equal(booking.data.booking.paymentMode, 'pay_after_service');

  const intent = await request('POST', `/api/services/bookings/${booking.data.booking.id}/payment-intent`, customerToken, {
    idempotencyKey: randomUUID(),
  });
  assert.equal(intent.status, 409);
  assert.equal(intent.data.error, 'PAYMENT_DISABLED_FOR_SERVICE');
});

dbTest('rollback restores a prior published configuration with a new version', async () => {
  const detail = await request('GET', '/api/admin/service-catalog/pet_grooming', superToken);
  const draft = detail.data.category.draft;
  assert.ok(draft, JSON.stringify(detail.data.category));
  const published = await request('POST', '/api/admin/service-catalog/pet_grooming/publish', superToken, {
    versionId: draft.versionId,
  });
  assert.equal(published.status, 200);
  const deluxe = await request('GET', '/api/service-catalog/pet_grooming');
  assert.equal(deluxe.data.category.config.name, 'Pet Grooming Deluxe');

  const rollback = await request('POST', '/api/admin/service-catalog/pet_grooming/rollback', superToken, {
    targetVersionId: customPublishedVersion.versionId,
  });
  assert.equal(rollback.status, 200, JSON.stringify(rollback.data));
  assert.equal(rollback.data.version.status, 'published');
  assert.ok(rollback.data.version.versionNumber > 2);
  const restored = await request('GET', '/api/service-catalog/pet_grooming');
  assert.equal(restored.data.category.config.name, 'Pet Grooming');
});

dbTest('medicine requires a verified pharmacy and a prescription, then blocks and releases handover', async () => {
  const missingPrescription = await request('POST', '/api/services/bookings', customerToken, {
    idempotencyKey: randomUUID(),
    listingId: listings.medicine,
    categoryConfigId: 'medicine_delivery',
    scheduledDate: targetDate(3),
    timeSlot: '15:00',
    serviceAddress: 'Flat 404, Banjara Hills, Hyderabad',
    customerPhone: '+91 90000 00005',
    paymentMode: 'pay_after_service',
    quantity: 1,
    documents: [],
    fieldValues: { deliveryPreference: 'Home delivery' },
  });
  assert.equal(missingPrescription.status, 400);
  assert.equal(missingPrescription.data.error, 'SERVICE_REQUIRED_DOCUMENTS_MISSING');

  const unlicensed = await request('POST', '/api/services/bookings', customerToken, {
    idempotencyKey: randomUUID(),
    listingId: listings.medicineUnlicensed,
    categoryConfigId: 'medicine_delivery',
    scheduledDate: targetDate(3),
    timeSlot: '16:00',
    serviceAddress: 'Flat 404, Banjara Hills, Hyderabad',
    customerPhone: '+91 90000 00005',
    paymentMode: 'pay_after_service',
    quantity: 1,
    documents: [{ key: 'prescription', reference: 'storage://bos-private-documents/e2e/prescription.pdf', mimeType: 'application/pdf' }],
    fieldValues: { deliveryPreference: 'Home delivery' },
  });
  assert.equal(unlicensed.status, 409);
  assert.equal(unlicensed.data.error, 'LICENSED_PHARMACY_REQUIRED');

  const booking = await request('POST', '/api/services/bookings', customerToken, {
    idempotencyKey: randomUUID(),
    listingId: listings.medicine,
    categoryConfigId: 'medicine_delivery',
    scheduledDate: targetDate(3),
    timeSlot: '17:00',
    serviceAddress: 'Flat 404, Banjara Hills, Hyderabad',
    customerPhone: '+91 90000 00005',
    paymentMode: 'pay_after_service',
    quantity: 1,
    documents: [{ key: 'prescription', reference: 'storage://bos-private-documents/e2e/prescription.pdf', mimeType: 'application/pdf' }],
    fieldValues: { deliveryPreference: 'Home delivery' },
  });
  assert.equal(booking.status, 201, JSON.stringify(booking.data));
  assert.equal(booking.data.booking.prescriptionStatus, 'pending');
  assert.equal(booking.data.booking.deliveryMode, 'home_delivery');
  assert.equal(booking.data.booking.documents.length, 1);
  assert.equal(booking.data.booking.documents[0].status, 'pending');

  const bookingId = booking.data.booking.id;
  assert.equal((await request('POST', `/api/services/bookings/${bookingId}/actions`, medicineToken, { action: 'accept' })).status, 200);
  assert.equal((await request('POST', `/api/services/bookings/${bookingId}/actions`, medicineToken, { action: 'start' })).status, 200);

  const blockedComplete = await request('POST', `/api/services/bookings/${bookingId}/actions`, medicineToken, { action: 'complete' });
  assert.equal(blockedComplete.status, 409);
  assert.equal(blockedComplete.data.error, 'PRESCRIPTION_NOT_VERIFIED');

  const blockedOtp = await request('POST', `/api/services/bookings/${bookingId}/otp`, customerToken, {});
  assert.equal(blockedOtp.status, 409);
  assert.equal(blockedOtp.data.error, 'PRESCRIPTION_NOT_VERIFIED');

  const queue = await request('GET', '/api/admin/service-catalog/verifications', adminToken);
  assert.equal(queue.status, 200);
  const document = queue.data.documents.find((entry) => entry.bookingId === bookingId);
  assert.ok(document, JSON.stringify(queue.data));
  const decision = await request('POST', `/api/admin/service-catalog/documents/${document.id}/decision`, adminToken, {
    status: 'verified',
    note: 'Prescription checked against the issuing doctor and dosage.',
  });
  assert.equal(decision.status, 200, JSON.stringify(decision.data));

  const refreshed = await request('GET', '/api/services/bookings', customerToken);
  const verifiedBooking = refreshed.data.bookings.find((entry) => entry.id === bookingId);
  assert.equal(verifiedBooking.prescriptionStatus, 'verified');
  assert.equal(verifiedBooking.documents[0].status, 'verified');

  const otp = await request('POST', `/api/services/bookings/${bookingId}/otp`, customerToken, {});
  assert.equal(otp.status, 201, JSON.stringify(otp.data));
  assert.match(otp.data.code, /^\d{6}$/);
  const verify = await request('POST', `/api/services/bookings/${bookingId}/verify-otp`, medicineToken, { code: otp.data.code });
  assert.equal(verify.status, 200);
  assert.equal(verify.data.verified, true);

  const complete = await request('POST', `/api/services/bookings/${bookingId}/actions`, medicineToken, { action: 'complete' });
  assert.equal(complete.status, 200, JSON.stringify(complete.data));
  assert.equal(complete.data.booking.status, 'completed');
  assert.equal(complete.data.booking.prescriptionStatus, 'verified');
});

dbTest('a provider can submit a licence through the server and see its review status', async () => {
  const submitted = await request('POST', '/api/services/provider/credentials', unlicensedToken, {
    credentialType: 'pharmacy_license',
    licenseNumber: 'TS-UNLIC-0099',
    issuingAuthority: 'Telangana Drugs Control',
    expiresOn: new Date(Date.now() + 300 * 86_400_000).toISOString().slice(0, 10),
    categoryId: 'medicine_delivery',
    documentReference: 'storage://bos-private-documents/e2e/pharmacy-licence.pdf',
  });
  assert.equal(submitted.status, 201, JSON.stringify(submitted.data));
  assert.equal(submitted.data.credential.status, 'pending');
  assert.equal(submitted.data.credential.licenseNumber, 'TS-UNLIC-0099');

  const own = await request('GET', '/api/services/provider/credentials', unlicensedToken);
  assert.equal(own.status, 200);
  assert.ok(own.data.credentials.some((credential) => credential.licenseNumber === 'TS-UNLIC-0099'));
});

dbTest('admin reviews a provider licence and the audit trail records every decision', async () => {
  const queue = await request('GET', '/api/admin/service-catalog/verifications', adminToken);
  const credential = queue.data.credentials.find((entry) => entry.providerId === customProvider);
  assert.ok(credential, JSON.stringify(queue.data.credentials));
  const decision = await request('POST', `/api/admin/service-catalog/credentials/${credential.id}/decision`, adminToken, {
    status: 'verified',
    note: 'Licence number and expiry checked against the state register.',
  });
  assert.equal(decision.status, 200, JSON.stringify(decision.data));
  assert.equal(decision.data.credential.status, 'verified');

  const audit = await request('GET', '/api/admin/service-catalog/audit?limit=200', adminToken);
  assert.equal(audit.status, 200);
  const actions = audit.data.audit.map((entry) => entry.action);
  for (const action of ['category_created', 'category_published', 'category_rolled_back', 'category_disabled', 'category_enabled', 'document_reviewed', 'credential_reviewed']) {
    assert.ok(actions.includes(action), `missing audit action ${action}: ${actions.join(',')}`);
  }
  const auditRows = await pool.query('select count(*)::int as count from public.service_category_config_audit');
  assert.ok(auditRows.rows[0].count > 0);
  await assert.rejects(
    pool.query("update public.service_category_config_audit set summary = 'tampered' where id = (select min(id) from public.service_category_config_audit)"),
    /SERVICE_CATALOG_AUDIT_IMMUTABLE/,
  );
});

dbTest('tenant isolation hides another tenant and RLS hides drafts from anonymous readers', async () => {
  const tenantConfig = customCategory({ name: 'Tenant B Service' });
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(
      `insert into public.service_category_configs (id, tenant_id, enabled) values ('tenant_b_service', 'tenant_b', true)
       on conflict (id) do update set tenant_id = 'tenant_b', enabled = true`,
    );
    const inserted = await client.query(
      `insert into public.service_category_config_versions
        (category_id, tenant_id, version_number, status, config, summary, published_at)
       values ('tenant_b_service', 'tenant_b', 1, 'published', $1::jsonb, 'Tenant B', now())
       on conflict (category_id, version_number) do update set config = excluded.config
       returning id`,
      [JSON.stringify(tenantConfig)],
    );
    await client.query(
      'update public.service_category_configs set current_version_id = $1 where id = $2',
      [inserted.rows[0].id, 'tenant_b_service'],
    );
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }

  const publicList = await request('GET', '/api/service-catalog');
  assert.equal(publicList.data.categories.some((category) => category.id === 'tenant_b_service'), false);
  const adminList = await request('GET', '/api/admin/service-catalog', superToken);
  assert.equal(adminList.data.categories.some((category) => category.id === 'tenant_b_service'), false);

  const anonClient = await pool.connect();
  try {
    await anonClient.query('begin');
    await anonClient.query('set local role anon');
    await anonClient.query("select set_config('request.tenant_id', 'default', true)");
    const drafts = await anonClient.query("select count(*)::int as count from public.service_category_config_versions where status = 'draft'");
    assert.equal(drafts.rows[0].count, 0);
    const tenantB = await anonClient.query("select count(*)::int as count from public.service_category_configs where tenant_id = 'tenant_b'");
    assert.equal(tenantB.rows[0].count, 0);
    const published = await anonClient.query("select count(*)::int as count from public.service_category_config_versions where status = 'published'");
    assert.ok(published.rows[0].count >= 4);
    await anonClient.query('rollback');
  } catch (error) {
    await anonClient.query('rollback');
    throw error;
  } finally {
    anonClient.release();
  }
});

dbTest('configuration and bookings persist across a server restart', async () => {
  await stopServer();
  await startServer(await freePort());
  const publicList = await request('GET', '/api/service-catalog');
  assert.equal(publicList.data.categories.some((category) => category.id === 'pet_grooming'), true);
  const bookings = await request('GET', '/api/services/bookings', customerToken);
  assert.ok(bookings.data.bookings.some((booking) => booking.categoryConfigId === 'medicine_delivery'));
  assert.ok(bookings.data.bookings.some((booking) => booking.categoryConfigId === 'pet_grooming'));
});


dbTest('browser: Super Admin builder, dynamic customer form and provider dashboard work end-to-end', async () => {
  const browser = await chromium.launch();
  const browserErrors = [];
  const openAs = async (authToken) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
    await context.addInitScript((value) => {
      try {
        localStorage.setItem('bos_session_token_v1', value);
        localStorage.setItem('bos_entry_choice_v1', 'signed-in');
        localStorage.setItem('bos_privacy_consent_v1', JSON.stringify({ choice: 'essential', at: '2026-01-01T00:00:00.000Z' }));
        localStorage.setItem('bos_section_styles_v2', JSON.stringify({ pg: 'style3', stay: 'airbnb', services: 'old' }));
      } catch { /* storage unavailable */ }
    }, authToken);
    await context.route('**/*', async (route) => {
      try {
        if (new URL(route.request().url()).origin === serverUrl) await route.continue();
        else await route.abort('blockedbyclient');
      } catch { /* page closed */ }
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => {
      if (error.message !== 'WebSocket closed without opened.') browserErrors.push(error.message);
    });
    await page.goto(`${serverUrl}/#services/old`, { waitUntil: 'domcontentloaded' });
    return { context, page };
  };

  const contexts = [];
  try {
    const customerBrowser = await openAs(customerToken);
    contexts.push(customerBrowser.context);
    const customerPage = customerBrowser.page;
    await expect(customerPage.getByRole('heading', { name: /Hire a professional for the job at hand/i })).toBeVisible({ timeout: 30_000 });
    await customerPage.evaluate(() => window.dispatchEvent(new Event('bos-marketplace-listings-updated')));
    await expect(customerPage.getByRole('button', { name: 'View details for Pet Grooming E2E' })).toBeVisible({ timeout: 30_000 });
    await customerPage.getByRole('button', { name: 'View details for Pet Grooming E2E' }).click();
    const detail = customerPage.getByRole('dialog').filter({ has: customerPage.getByRole('heading', { name: 'Pet Grooming E2E' }) });
    await detail.getByRole('button', { name: 'Book this service' }).click();
    const dialog = customerPage.locator('[aria-labelledby="service-booking-title"]');
    await expect(dialog.getByLabel('Pet type')).toBeVisible();
    await dialog.getByLabel('Service date').fill(targetDate(3));
    await dialog.getByLabel('Pet type').selectOption('Dog');
    await dialog.getByLabel('Grooming notes').fill('Short summer cut');
    await dialog.getByLabel(/Quantity/).fill('2');
    await dialog.getByLabel('Service address').fill('Flat 501, Kondapur, Hyderabad');
    await dialog.getByLabel('Contact phone').fill('+91 90000 00007');
    const slot = dialog.getByLabel('Available time');
    await expect.poll(async () => slot.locator('option').count(), { timeout: 15_000 }).toBeGreaterThan(1);
    await dialog.getByRole('button', { name: 'Request booking' }).click();
    await expect(dialog).toContainText('Booking requested', { timeout: 15_000 });
    await expect(dialog).toContainText('petType');
    const reference = (await dialog.innerText()).match(/Reference\s+([A-Z0-9-]+)/i)?.[1];
    assert.ok(reference, 'dynamic booking should display its server reference');
    await dialog.getByRole('button', { name: 'Done' }).click();

    const providerBrowser = await openAs(customToken);
    contexts.push(providerBrowser.context);
    const providerPage = providerBrowser.page;
    await expect(providerPage.getByRole('button', { name: 'My service jobs' })).toBeVisible({ timeout: 30_000 });
    await providerPage.getByRole('button', { name: 'My service jobs' }).click();
    const job = providerPage.locator('article').filter({ hasText: reference });
    await expect(job).toContainText('Pet Grooming');
    await expect(job).toContainText('petType');
    await expect(job).toContainText('Dog');
    await job.getByRole('button', { name: 'Accept job' }).click();
    await job.getByRole('button', { name: 'Start service' }).click();
    await job.getByRole('button', { name: 'Confirm handover' }).click();
    await expect(job).toContainText('Handover: confirmed');
    await job.getByRole('button', { name: 'Mark completed' }).click();
    await expect(job).toContainText('completed');

    const adminBrowser = await openAs(superToken);
    contexts.push(adminBrowser.context);
    const adminPage = adminBrowser.page;
    await expect(adminPage.getByRole('button', { name: 'Build', exact: true })).toBeVisible({ timeout: 30_000 });
    await adminPage.getByRole('button', { name: 'Build', exact: true }).click();
    await expect(adminPage.getByText('Universal Live Builder')).toBeVisible();
    const builderHeader = adminPage.locator('header').filter({ hasText: 'Universal Live Builder' });
    await builderHeader.getByRole('button', { name: 'Services', exact: true }).click();
    const builderPanel = adminPage.locator('[class*="z-[9990]"]');
    await expect(builderPanel.getByText('Service categories & booking forms')).toBeVisible({ timeout: 15_000 });
    await expect(builderPanel.getByRole('button', { name: /Pet Grooming/ }).first()).toBeVisible({ timeout: 15_000 });
    await builderPanel.getByRole('button', { name: /Pet Grooming/ }).first().click();
    await expect(builderPanel.getByRole('heading', { name: 'Customer booking fields' })).toBeVisible();
    await expect(builderPanel.getByRole('heading', { name: 'Required documents' })).toBeVisible();
    await expect(builderPanel.getByRole('heading', { name: 'Feature toggles' })).toBeVisible();

    const persisted = await pool.query(
      `select status, category_config_id, amount from public.service_bookings
        where booking_ref = $1`,
      [reference],
    );
    assert.equal(persisted.rows[0].status, 'completed');
    assert.equal(persisted.rows[0].category_config_id, 'pet_grooming');
    assert.equal(Number(persisted.rows[0].amount), 998);
    assert.deepEqual(browserErrors, [], 'browser journey should not raise uncaught page errors');
  } finally {
    for (const context of contexts) await context.close();
    await browser.close();
  }
});
