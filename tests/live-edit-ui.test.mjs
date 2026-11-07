import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { LiveEditForm } from '../src/components/liveEdit/LiveEditForm.tsx';
import { LiveEditPanel } from '../src/components/liveEdit/LiveEditPanel.tsx';
import { LiveEditEntryButton } from '../src/components/liveEdit/LiveEditEntryButton.tsx';
import { draftFromListing } from '../src/lib/liveEdit/mapping.ts';
import { LIVE_EDIT_MODULES } from '../src/lib/liveEdit/types.ts';

let failures = 0;
function test(name, callback) {
  try {
    callback();
    console.log(`  PASS  ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`  FAIL  ${name}\n        ${error.message}`);
    process.exitCode = 1;
  }
}

const CAPABILITIES = {
  scope: 'owned',
  canEditContent: true,
  canEditPricing: true,
  canEditImages: true,
  canEditFacilities: true,
  canEditCategories: true,
  canEditAvailability: true,
  canEditModerationAvailability: false,
  canEditVerification: false,
  canEditCinemaScreens: false,
  canChangePublicationStatus: false,
  readOnlyFields: [],
};

const MODULE_FIXTURES = {
  pg_hostels: {
    categoryId: 'pg-luxury',
    entityType: 'property',
    price: 9000,
    priceUnit: '/month',
    details: { genderPolicy: 'Men Only', bedsAvailable: 4 },
  },
  classes: {
    categoryId: 'class-software',
    entityType: 'course',
    price: 15000,
    priceUnit: '/course',
    details: { modeLabel: 'Live Online', batchCapacity: 60 },
  },
  venues: {
    categoryId: 'venue-marriage',
    entityType: 'venue',
    price: 85000,
    priceUnit: '/day',
    details: { capacity: 1200, acType: 'Central AC' },
  },
  services: {
    categoryId: 'cat-4',
    entityType: 'service',
    price: 499,
    priceUnit: '/visit',
    details: { serviceWarranty: '60 days', visitCharge: 99 },
  },
  hotel_stay: {
    categoryId: 'hotel-hourly',
    entityType: 'property',
    price: 1800,
    priceUnit: '/hour',
    details: { checkInTime: '12:00 PM', coupleFriendly: true },
  },
  movies: {
    categoryId: 'movie-imax',
    entityType: 'movie',
    price: 350,
    priceUnit: '/ticket',
    details: {
      format: 'IMAX 3D',
      soundSystem: 'Dolby Atmos',
      showtimes: '10:30, 18:00',
      tierPricing: 'Gold = 350\nExecutive = 250',
      refundPercent: 50,
    },
  },
};

function makeListing(module, overrides = {}) {
  const fixture = MODULE_FIXTURES[module];
  return {
    id: `${module}-1`,
    module,
    ownerId: 'user-1',
    title: module === 'movies' ? 'Prasads Multiplex' : `${module} listing`,
    description: module === 'movies' ? '' : 'A detailed description.',
    categoryId: fixture.categoryId,
    subcategory: module === 'movies' ? 'Screen 3' : 'Standard',
    entityType: fixture.entityType,
    price: fixture.price,
    priceUnit: fixture.priceUnit,
    images: module === 'movies' ? [] : ['https://images.example.com/one.jpg'],
    facilities: module === 'movies' ? [] : ['Wi-Fi'],
    availability: { status: 'available', note: '2 left', nextAvailableFrom: '2026-12-01', unitsAvailable: 2 },
    details: fixture.details,
    status: 'active',
    isVerified: false,
    providerAvailabilityStatus: 'not_reported',
    updatedAt: '2026-10-02T00:00:00.000Z',
    source: module === 'movies' ? 'server_cinema_store' : 'supabase_listings',
    raw: {},
    ...overrides,
  };
}

function renderForm(module, overrides = {}) {
  const listing = overrides.listing || makeListing(module);
  const draft = overrides.draft || draftFromListing(listing);
  return renderToStaticMarkup(
    React.createElement(LiveEditForm, {
      module,
      listing,
      draft,
      errors: overrides.errors || {},
      capabilities: overrides.capabilities || CAPABILITIES,
      readOnly: overrides.readOnly ?? false,
      readOnlyReason: overrides.readOnlyReason,
      saving: overrides.saving ?? false,
      dirty: overrides.dirty ?? true,
      feedback: overrides.feedback ?? null,
      auditNotice: overrides.auditNotice ?? null,
      categoryOptions: overrides.categoryOptions || [],
      subcategoryOptions: overrides.subcategoryOptions || [],
      onDraftChange: () => {},
      onSave: () => {},
      onCancel: () => {},
      onReload: () => {},
    })
  );
}

function attributeFor(html, testId, attribute) {
  const match = html.match(new RegExp(`<button[^>]*data-testid="${testId}"[^>]*>`));
  assert.ok(match, `button ${testId} should render`);
  const withoutClass = match[0].replace(/class="[^"]*"/g, '');
  return { tag: match[0], has: new RegExp(`\\s${attribute}(=|[\\s>])`).test(withoutClass) };
}

console.log('Live Edit UI');

test('every module renders its editable sections', () => {
  for (const module of LIVE_EDIT_MODULES) {
    const html = renderForm(module);
    assert.ok(html.includes('data-testid="live-edit-form"'), `${module}: form`);
    assert.ok(html.includes('data-testid="live-edit-title"'), `${module}: title`);
    assert.ok(html.includes('data-testid="live-edit-save"'), `${module}: save`);
    assert.ok(html.includes('data-testid="live-edit-cancel"'), `${module}: cancel`);
    assert.ok(html.includes('Audit trail') === false, `${module}: audit trail lives in the panel, not the form`);
    if (module !== 'movies') {
      assert.ok(html.includes('data-testid="live-edit-price"'), `${module}: price`);
      assert.ok(html.includes('live-edit-category'), `${module}: category`);
      assert.ok(html.includes('Images ('), `${module}: images section`);
      assert.ok(html.includes('Facilities'), `${module}: facilities section`);
      assert.ok(html.includes('Availability'), `${module}: availability section`);
    } else {
      assert.ok(!html.includes('data-testid="live-edit-price"'), 'movies: price is managed via seat tiers');
      assert.ok(html.includes('data-testid="live-edit-screen-name"'), 'movies: screen name');
      assert.ok(html.includes('Showtimes'), 'movies: showtimes');
      assert.ok(html.includes('Seat tiers'), 'movies: tier pricing');
      assert.ok(html.includes('Not editable in this build'), 'movies: blocked fields are explained');
      assert.ok(html.includes('MOVIES_MODULE_DISPLAY_ONLY'), 'movies: server policy is quoted');
    }
  }
});

test('save reflects dirty state and never renders as enabled when clean', () => {
  const clean = attributeFor(renderForm('pg_hostels', { dirty: false }), 'live-edit-save', 'disabled');
  assert.equal(clean.has, true);
  const dirty = attributeFor(renderForm('pg_hostels', { dirty: true }), 'live-edit-save', 'disabled');
  assert.equal(dirty.has, false);
  const saving = renderForm('pg_hostels', { dirty: true, saving: true });
  assert.ok(saving.includes('Saving…'), 'saving label');
  assert.equal(attributeFor(saving, 'live-edit-save', 'disabled').has, true);
});

test('read-only authority disables saving and explains why', () => {
  const html = renderForm('pg_hostels', {
    readOnly: true,
    readOnlyReason: 'You can only edit your own listings.',
    dirty: true,
  });
  assert.ok(html.includes('data-testid="live-edit-readonly"'));
  assert.ok(html.includes('You can only edit your own listings.'));
  assert.equal(attributeFor(html, 'live-edit-save', 'disabled').has, true);
  assert.ok(html.includes('disabled=""'));
});

test('field errors, success and error feedback are announced accessibly', () => {
  const errors = renderForm('pg_hostels', {
    errors: { title: 'Title must be between 2 and 160 characters.', 'images.0': 'Images must be secure https:// URLs or public Storage references.' },
  });
  assert.ok(errors.includes('Title must be between 2 and 160 characters.'));
  assert.ok(errors.includes('Images must be secure https:// URLs or public Storage references.'));
  assert.ok(/role="alert"/.test(errors));

  const success = renderForm('pg_hostels', {
    feedback: { tone: 'success', text: 'Listing changes saved and confirmed by the server.' },
    auditNotice: 'Audit event recorded against your verified identity.',
  });
  assert.ok(success.includes('data-testid="live-edit-success"'));
  assert.ok(success.includes('data-testid="live-edit-audit"'));
  assert.ok(success.includes('Audit event recorded'));

  const failure = renderForm('pg_hostels', {
    feedback: { tone: 'error', text: 'This listing changed after you opened it. Reload before saving.' },
  });
  assert.ok(failure.includes('data-testid="live-edit-error"'));
  assert.ok(failure.includes('Reload before saving'));
});

test('the blocked audit notice is surfaced exactly as reported', () => {
  const html = renderForm('pg_hostels', {
    feedback: {
      tone: 'warning',
      text: 'Listing changes saved and confirmed by the server. Audit trail is BLOCKED: public.live_edit_audit_events is not installed in this project.',
    },
    auditNotice: 'Audit BLOCKED — Audit trail is BLOCKED: public.live_edit_audit_events is not installed in this project.',
  });
  assert.ok(html.includes('BLOCKED'));
  assert.ok(html.includes('live_edit_audit_events'));
});

test('the panel renders a dialog and verifies identity before loading data', () => {
  const html = renderToStaticMarkup(
    React.createElement(LiveEditPanel, { open: true, onClose: () => {} })
  );
  assert.ok(html.includes('data-testid="live-edit-panel"'));
  assert.ok(html.includes('role="dialog"'));
  assert.ok(html.includes('aria-modal="true"'));
  assert.ok(html.includes('Verifying your verified Supabase profile and scope'));
  assert.ok(!html.includes('live-edit-denied'));
  assert.ok(html.includes('Checking integration'));
});

test('the entry button is additive and labelled', () => {
  const html = renderToStaticMarkup(React.createElement(LiveEditEntryButton, { label: 'Live Edit' }));
  assert.ok(html.includes('data-testid="live-edit-entry"'));
  assert.ok(html.includes('Live Edit'));
  assert.ok(!html.includes('data-testid="live-edit-panel"'), 'panel stays closed until clicked');
});

test('Live Edit UI never reads a client-side role selector or local storage', () => {
  const files = [
    'src/components/liveEdit/LiveEditForm.tsx',
    'src/components/liveEdit/LiveEditPanel.tsx',
    'src/components/liveEdit/LiveEditEntryButton.tsx',
  ];
  for (const file of files) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /\buserRole\b/, `${file} must not read userRole`);
    assert.doesNotMatch(source, /\bsetUserRole\b/, `${file} must not set a role`);
    assert.doesNotMatch(source, /localStorage|sessionStorage/, `${file} must not persist role state`);
    assert.doesNotMatch(source, /Role:\s*(customer|provider|admin)/i, `${file} must not render a role switcher`);
  }
  const panel = readFileSync(new URL('../src/components/liveEdit/LiveEditPanel.tsx', import.meta.url), 'utf8');
  assert.match(panel, /resolveLiveEditAuthority/);
  assert.match(panel, /canEditListing/);
  assert.match(panel, /Audit trail/);
  assert.match(panel, /Realtime/);
  assert.match(panel, /BLOCKED/);

  const form = readFileSync(new URL('../src/components/liveEdit/LiveEditForm.tsx', import.meta.url), 'utf8');
  assert.match(form, /Saving…/);
  assert.match(form, /Save changes/);
  assert.match(form, />\s*Cancel\s*</);
});

test('the repository verifies persistence and audits with a server identity', () => {
  const source = readFileSync(new URL('../src/lib/liveEdit/repository.ts', import.meta.url), 'utf8');
  assert.match(source, /Read-after-write verification/);
  assert.match(source, /PERSISTENCE_NOT_POSTGRES/);
  assert.match(source, /PERSISTENCE_NOT_CONFIRMED/);
  assert.match(source, /auditEventId/);
  assert.match(source, /AUDIT_PERSISTENCE_FAILED/);
  assert.match(source, /canEditListing/);
  assert.doesNotMatch(source, /localStorage|sessionStorage/);
  const mapping = readFileSync(new URL('../src/lib/liveEdit/mapping.ts', import.meta.url), 'utf8');
  assert.match(mapping, /expectedUpdatedAt/);
  assert.match(mapping, /providerAvailabilityStatus/);
});

test('the admin and provider surfaces expose an additive entry point', () => {
  const admin = readFileSync(new URL('../src/components/AdminMarketplaceListings.tsx', import.meta.url), 'utf8');
  assert.match(admin, /import \{ LiveEditEntryButton \}/);
  assert.match(admin, /<LiveEditEntryButton initialModule="pg_hostels" \/>/);

  const provider = readFileSync(new URL('../src/components/ProviderDashboard.tsx', import.meta.url), 'utf8');
  assert.match(provider, /import \{ LiveEditEntryButton \}/);
  assert.match(provider, /<LiveEditEntryButton/);
});

console.log(failures === 0 ? '\nLive Edit UI checks passed' : `\n${failures} Live Edit UI check(s) failed`);
