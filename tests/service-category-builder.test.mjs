import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  applyServiceCategoryHardRules,
  assertServiceBookingWindow,
  categoryConfigForListing,
  computeServiceBookingAmount,
  createDefaultServiceCategoryConfig,
  isMedicineServiceCategory,
  normalizeServiceBookingDocuments,
  normalizeServiceBookingFieldValues,
  normalizeServiceCategoryConfig,
  normalizeServiceRecurrence,
  serviceCatalogErrorMessage,
  serviceCategoryIconEmoji,
  ServiceCatalogValidationError,
} from '../src/lib/serviceCatalog.ts';

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

function throwsCode(code) {
  return (error) => error instanceof ServiceCatalogValidationError && error.code === code;
}

function medicineConfig(overrides = {}) {
  return normalizeServiceCategoryConfig('medicine_delivery', {
    name: 'Medicine Delivery',
    icon: 'pill',
    deliveryKind: 'medicine_delivery',
    bookingType: 'scheduled',
    providerAssignment: 'customer_selects',
    deliveryModes: ['home_delivery'],
    pricing: { mode: 'quote', amount: 0, unit: 'per order', quantityEnabled: true, minQuantity: 1, maxQuantity: 5 },
    recurring: { enabled: false, frequencies: ['weekly'], defaultFrequency: 'weekly', maxOccurrences: 12 },
    toggles: {
      gpsTracking: true, liveMap: true, customerOtp: true, prescriptionVerification: false,
      documentVerification: false, payment: true, deliveryConfirmation: true,
    },
    fields: [
      { key: 'deliveryPreference', label: 'Delivery preference', type: 'select', required: true, options: ['Home', 'Pickup'] },
    ],
    documents: [],
    approvalWorkflow: { requiresProviderAcceptance: true, requiresDocumentVerification: false, requiresAdminApproval: false },
    validation: { minLeadTimeMinutes: 60, maxAdvanceDays: 14, requiresServiceAddress: true, requiresPhone: true },
    legacyCategoryIds: [],
    ...overrides,
  });
}

test('a new category normalizes to a safe, generic configuration', () => {
  const config = normalizeServiceCategoryConfig('pet_grooming', {
    name: 'Pet Grooming',
    description: 'At-home grooming',
    icon: 'paw-print',
    imageUrl: 'https://example.test/pet.jpg',
    bookingType: 'scheduled',
    providerAssignment: 'customer_selects',
    deliveryModes: ['on_site'],
    pricing: { mode: 'fixed', amount: 499, unit: 'per pet', quantityEnabled: true, minQuantity: 1, maxQuantity: 3 },
    toggles: { gpsTracking: false, liveMap: false, customerOtp: false, payment: false, deliveryConfirmation: true },
    fields: [{ key: 'petType', label: 'Pet type', type: 'select', required: true, options: ['Dog', 'Cat'], maxLength: 50 }],
    documents: [{ key: 'vaccination', label: 'Vaccination card', required: false, verificationRequired: false }],
    legacyCategoryIds: ['cat-4'],
  });
  assert.equal(config.name, 'Pet Grooming');
  assert.equal(config.pricing.amount, 499);
  assert.equal(config.toggles.gpsTracking, false);
  assert.equal(config.toggles.customerOtp, false);
  assert.equal(config.toggles.payment, false);
  assert.equal(config.fields[0].options.length, 2);
  assert.equal(config.legacyCategoryIds[0], 'cat-4');
  assert.deepEqual(config.deliveryModes, ['on_site']);
  assert.equal(isMedicineServiceCategory('pet_grooming', config), false);
});

test('unsafe or unknown configuration is rejected instead of ignored', () => {
  assert.throws(
    () => normalizeServiceCategoryConfig('bad', { ...createDefaultServiceCategoryConfig(), script: '<script>' }),
    (error) => error instanceof ServiceCatalogValidationError && error.code === 'SERVICE_CATALOG_UNKNOWN_FIELD',
  );
  assert.throws(
    () => normalizeServiceCategoryConfig('bad', { ...createDefaultServiceCategoryConfig(), imageUrl: 'data:image/png;base64,xx' }),
    throwsCode('SERVICE_CATALOG_INVALID_IMAGE'),
  );
  assert.throws(
    () => normalizeServiceCategoryConfig('bad', { ...createDefaultServiceCategoryConfig(), imageUrl: 'javascript:alert(1)' }),
    throwsCode('SERVICE_CATALOG_INVALID_IMAGE'),
  );
  assert.throws(
    () => normalizeServiceCategoryConfig('Bad Key', createDefaultServiceCategoryConfig()),
    throwsCode('SERVICE_CATALOG_INVALID_KEY'),
  );
  assert.throws(
    () => normalizeServiceCategoryConfig('bad', {
      ...createDefaultServiceCategoryConfig(),
      fields: [
        { key: 'sameKey', label: 'One', type: 'text', required: false },
        { key: 'sameKey', label: 'Two', type: 'text', required: false },
      ],
    }),
    throwsCode('SERVICE_CATALOG_DUPLICATE_FIELD_KEY'),
  );
});

test('medicine hard rules cannot be switched off by an administrator', () => {
  const config = medicineConfig();
  assert.equal(config.deliveryKind, 'medicine_delivery');
  assert.equal(config.requiresLicensedPharmacy, true);
  assert.equal(config.toggles.prescriptionVerification, true);
  assert.equal(config.toggles.documentVerification, true);
  assert.equal(config.approvalWorkflow.requiresDocumentVerification, true);
  assert.equal(config.documents.some((document) => document.key === 'prescription' && document.required && document.verificationRequired), true);

  // Even a category that merely names itself medicine is forced into the rule.
  const renamed = normalizeServiceCategoryConfig('custom_medical_run', {
    ...createDefaultServiceCategoryConfig('Prescription pickup'),
    toggles: { ...createDefaultServiceCategoryConfig().toggles, prescriptionVerification: false, documentVerification: false },
  });
  assert.equal(isMedicineServiceCategory('custom_medical_run', renamed), true);
  assert.equal(renamed.toggles.prescriptionVerification, true);
  assert.equal(renamed.documents[0].key, 'prescription');
});

test('custom field values are typed, option-checked and unknown keys rejected', () => {
  const config = normalizeServiceCategoryConfig('pet_grooming', {
    ...createDefaultServiceCategoryConfig('Pet Grooming'),
    fields: [
      { key: 'petType', label: 'Pet type', type: 'select', required: true, options: ['Dog', 'Cat'] },
      { key: 'notes', label: 'Notes', type: 'textarea', required: false, maxLength: 20 },
      { key: 'agree', label: 'Agree', type: 'checkbox', required: false },
      { key: 'count', label: 'Count', type: 'number', required: false },
    ],
  });
  assert.deepEqual(
    normalizeServiceBookingFieldValues(config, { petType: 'Dog', notes: 'Friendly', agree: true, count: 2 }),
    { petType: 'Dog', notes: 'Friendly', agree: true, count: 2 },
  );
  assert.throws(() => normalizeServiceBookingFieldValues(config, { petType: 'Bird' }), throwsCode('SERVICE_INVALID_FIELD_VALUE'));
  assert.throws(() => normalizeServiceBookingFieldValues(config, {}), throwsCode('SERVICE_REQUIRED_FIELDS_MISSING'));
  assert.throws(() => normalizeServiceBookingFieldValues(config, { petType: 'Dog', secret: 'x' }), throwsCode('SERVICE_UNKNOWN_FIELD'));
  assert.throws(() => normalizeServiceBookingFieldValues(config, { petType: 'Dog', notes: 'x'.repeat(21) }), throwsCode('SERVICE_INVALID_FIELD_VALUE'));
});

test('required documents and medicine prescriptions are enforced client-side too', () => {
  const config = medicineConfig();
  assert.throws(
    () => normalizeServiceBookingDocuments(config, []),
    throwsCode('SERVICE_REQUIRED_DOCUMENTS_MISSING'),
  );
  const documents = normalizeServiceBookingDocuments(config, [
    { key: 'prescription', reference: 'storage://bos-private-documents/test/prescription.pdf', mimeType: 'application/pdf' },
  ]);
  assert.equal(documents.length, 1);
  assert.equal(documents[0].key, 'prescription');
  assert.throws(
    () => normalizeServiceBookingDocuments(config, [{ key: 'prescription', reference: 'data:application/pdf;base64,xx' }]),
    throwsCode('SERVICE_INVALID_DOCUMENT_REFERENCE'),
  );
});

test('pricing, quantity and recurring schedules follow the saved configuration', () => {
  const perUnit = normalizeServiceCategoryConfig('custom_water', {
    ...createDefaultServiceCategoryConfig('Water cans'),
    pricing: { mode: 'per_unit', amount: 45, unit: 'per 20L can', quantityEnabled: true, minQuantity: 1, maxQuantity: 5 },
    recurring: { enabled: true, frequencies: ['weekly', 'monthly'], defaultFrequency: 'weekly', maxOccurrences: 8 },
  });
  assert.deepEqual(computeServiceBookingAmount(perUnit, 999, 3), { amount: 135, quantity: 3, basis: 'per 20L can × 3' });
  assert.throws(() => computeServiceBookingAmount(perUnit, 0, 6), throwsCode('SERVICE_INVALID_QUANTITY'));
  assert.deepEqual(normalizeServiceRecurrence(perUnit, { frequency: 'weekly', occurrences: 4 }), { frequency: 'weekly', occurrences: 4 });
  assert.deepEqual(normalizeServiceRecurrence(perUnit, null), { frequency: 'none', occurrences: null });
  assert.throws(() => normalizeServiceRecurrence(perUnit, { frequency: 'daily', occurrences: 2 }), throwsCode('RECURRING_NOT_AVAILABLE'));
});

test('booking window validation is category-specific and timezone safe', () => {
  const config = normalizeServiceCategoryConfig('scheduled_service', {
    ...createDefaultServiceCategoryConfig('Scheduled service'),
    validation: { minLeadTimeMinutes: 60, maxAdvanceDays: 2, requiresServiceAddress: true, requiresPhone: true },
  });
  const now = new Date('2026-11-11T10:00:00.000Z');
  assert.doesNotThrow(() => assertServiceBookingWindow(config, '2026-11-13', '09:00', now));
  assert.throws(() => assertServiceBookingWindow(config, '2026-11-14', '09:00', now), throwsCode('SERVICE_DATE_TOO_FAR'));
  assert.throws(() => assertServiceBookingWindow(config, '2026-11-10', '09:00', now), throwsCode('SERVICE_DATE_IN_PAST'));
  assert.throws(() => assertServiceBookingWindow(config, '2026-11-11', '10:30', now), throwsCode('SERVICE_LEAD_TIME_NOT_MET'));
});

test('published catalog resolves a listing through explicit or legacy category ids', () => {
  const config = normalizeServiceCategoryConfig('pet_grooming', {
    ...createDefaultServiceCategoryConfig('Pet Grooming'),
    legacyCategoryIds: ['cat-4'],
  });
  const catalog = [{ id: 'pet_grooming', tenantId: 'default', enabled: true, versionNumber: 1, config }];
  assert.equal(categoryConfigForListing(catalog, 'pet_grooming')?.config.name, 'Pet Grooming');
  assert.equal(categoryConfigForListing(catalog, 'cat-4')?.config.name, 'Pet Grooming');
  assert.equal(categoryConfigForListing(catalog, 'unknown'), null);
  assert.equal(serviceCategoryIconEmoji('droplets'), '💧');
});

test('medicine helper is idempotent and preserves admin-selected toggles that are allowed', () => {
  const base = createDefaultServiceCategoryConfig('Medicine Delivery');
  const once = applyServiceCategoryHardRules('medicine_delivery', base);
  const twice = applyServiceCategoryHardRules('medicine_delivery', once);
  assert.deepEqual(twice, once);
  assert.equal(twice.toggles.customerOtp, true);
  assert.equal(twice.toggles.gpsTracking, true);
  assert.equal(twice.toggles.payment, true);
});

test('user-facing messages cover the new validation codes', () => {
  assert.match(serviceCatalogErrorMessage({ code: 'MEDICINE_PRESCRIPTION_REQUIRED' }), /prescription/i);
  assert.match(serviceCatalogErrorMessage({ code: 'LICENSED_PHARMACY_REQUIRED' }), /licensed pharmacy/i);
  assert.match(serviceCatalogErrorMessage({ code: 'DELIVERY_CONFIRMATION_REQUIRED' }), /confirm/i);
  assert.match(serviceCatalogErrorMessage({ code: 'SERVICE_CATALOG_VERSION_CONFLICT' }), /draft/i);
});

test('migration adds versioned categories, RLS, audit, tenant scoping and medicine guards', () => {
  const migration = source('supabase/migrations/20261111200000_dynamic_service_category_builder.sql');
  assert.match(migration, /create table if not exists public\.service_category_configs/);
  assert.match(migration, /create table if not exists public\.service_category_config_versions/);
  assert.match(migration, /create table if not exists public\.service_category_config_audit/);
  assert.match(migration, /service_catalog_apply_hard_rules/);
  assert.match(migration, /service_catalog_is_medicine/);
  assert.match(migration, /requiresLicensedPharmacy/);
  assert.match(migration, /service_provider_has_license/);
  assert.match(migration, /service_booking_documents/);
  assert.match(migration, /service_booking_field_values/);
  assert.match(migration, /service_provider_credentials/);
  assert.match(migration, /create policy "Enabled service categories are public"/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /tenant_id/);
  assert.match(migration, /service_catalog_audit_immutable/);
  assert.match(migration, /trg_service_booking_requirements/);
  assert.match(migration, /deferrable initially deferred/);
  assert.match(migration, /MEDICINE_PRESCRIPTION_REQUIRED/);
  assert.match(migration, /LICENSED_PHARMACY_REQUIRED/);
  assert.match(migration, /OTP_DISABLED_FOR_SERVICE/);
  assert.match(migration, /DELIVERY_CONFIRMATION_REQUIRED/);
  assert.match(migration, /PAYMENT_DISABLED_FOR_SERVICE/);
  assert.match(migration, /delivery_mode/);
  assert.match(migration, /groceries_delivery/);
  assert.match(migration, /revoke all on function public\.service_catalog_save_draft/);
  assert.match(migration, /grant execute on function public\.service_catalog_save_draft\(uuid, text, text, jsonb, text, bigint\) to service_role/);
  assert.match(migration, /alter publication supabase_realtime add table public\.service_category_configs/);
  assert.doesNotMatch(migration, /delete from public\.service_bookings/i);
  assert.doesNotMatch(migration, /delete from public\.service_delivery_profiles/i);
});

test('the builder, customer form and provider dashboards are configuration-driven', () => {
  const builder = source('src/components/serviceCatalog/ServiceCategoryBuilder.tsx');
  const fields = source('src/components/serviceCatalog/DynamicBookingFields.tsx');
  const bookingPanel = source('src/components/ServiceBookingPanel.tsx');
  const ops = source('src/components/ServiceOperationsWorkspace.tsx');
  const customer = source('src/components/ServiceCustomerBookings.tsx');
  const discovery = source('src/components/ServicesDiscoverySection.tsx');
  const tracking = source('src/components/tracking/DeliveryTrackingPanel.tsx');

  assert.match(builder, /createDefaultServiceCategoryConfig/);
  assert.match(builder, /Save draft/);
  assert.match(builder, /Save & publish/);
  assert.match(builder, /Disable category/);
  assert.match(builder, /Verification queue/);
  assert.match(builder, /Licence/);
  assert.match(fields, /config\.fields\.map/);
  assert.match(fields, /config\.documents\.map/);
  assert.match(fields, /Delivery option/);
  assert.match(fields, /config\.recurring\.enabled/);
  assert.match(bookingPanel, /DynamicBookingFields/);
  assert.match(bookingPanel, /normalizeServiceBookingDocuments/);
  assert.match(bookingPanel, /categoryConfigId/);
  assert.match(ops, /categoryConfigForListing/);
  assert.match(ops, /booking\.fieldValues/);
  assert.match(ops, /booking\.documents/);
  assert.match(ops, /Confirm handover/);
  assert.match(customer, /booking\.fieldValues/);
  assert.match(customer, /booking\.trackingEnabled/);
  assert.match(discovery, /dynamicServiceCategories/);
  assert.match(tracking, /snapshot\.liveMapEnabled/);
  assert.match(tracking, /snapshot\.otpEnabled/);
});
