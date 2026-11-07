#!/usr/bin/env node
/**
 * Real two-context browser propagation check against the disposable builder
 * harness. It uses the actual Vite app, builder client, Express API and local
 * PostgreSQL; only the database/session fixtures are synthetic.
 *
 * Usage: node tests/universal-builder.browser.integration.mjs <baseUrl> <hmacSecret> <superId>
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { chromium } from '@playwright/test';

const [base, secret, superId] = process.argv.slice(2);
if (!base || !secret || !superId) {
  console.error('usage: universal-builder.browser.integration.mjs <baseUrl> <hmacSecret> <superId>');
  process.exit(2);
}

const tokenPayload = Buffer.from(JSON.stringify({
  userId: superId,
  supabaseUserId: superId,
  role: 'admin',
  name: 'Super Admin',
  issuedAt: Date.now(),
  expiresAt: Date.now() + 60 * 60 * 1000,
})).toString('base64url');
const tokenSignature = crypto.createHmac('sha256', `${secret}:SESSION_TOKEN_V2`).update(tokenPayload).digest('hex');
const token = `${tokenPayload}.${tokenSignature}`;

const MODULES = [
  { pageKey: 'pg_hostels', hash: '#pg', title: 'PGs' },
  { pageKey: 'classes', hash: '#classes', title: 'Classes' },
  { pageKey: 'venues', hash: '#venues', title: 'Venues' },
  { pageKey: 'services', hash: '#services', title: 'Services' },
  { pageKey: 'hotel_stay', hash: '#stays', title: 'Stays' },
  { pageKey: 'movies', hash: '#movies', title: 'Movies' },
];

function documentFor(pageKey, title, headline, extraBlocks = []) {
  return {
    schemaVersion: 1,
    pageKey,
    title,
    module: pageKey,
    description: 'Cross-session browser propagation probe',
    theme: { primaryColor: '#4338CA', accentColor: '#FFE500', buttonRadius: 'rounded-xl' },
    navigation: [],
    blocks: [
      { id: `heading_${pageKey}_probe`, type: 'heading', visible: true, props: { text: headline, level: 'h1' }, style: {}, children: [] },
      ...extraBlocks,
    ],
  };
}

const browser = await chromium.launch({ headless: true });
let adminContext;
let customerContext;
try {
  adminContext = await browser.newContext();
  await adminContext.addInitScript((sessionToken) => {
    localStorage.setItem('bos_session_token_v1', sessionToken);
    localStorage.setItem('bos_entry_choice_v1', 'guest');
  }, token);
  const admin = await adminContext.newPage();
  admin.setDefaultTimeout(8_000);
  await admin.goto(`${base}/`, { waitUntil: 'domcontentloaded', timeout: 15_000 });
  await admin.locator('#root').waitFor({ state: 'attached' });

  customerContext = await browser.newContext();
  await customerContext.addInitScript(() => localStorage.setItem('bos_entry_choice_v1', 'guest'));
  const customer = await customerContext.newPage();
  customer.setDefaultTimeout(15_000);

  let classesInitialVersionId = '';
  for (const module of MODULES) {
    const before = `${module.pageKey} before second browser publish`;
    const updated = `${module.pageKey} updated from Super Admin browser`;
    const extraBlocks = module.pageKey === 'movies'
      ? [{
          id: 'booking_movies_probe',
          type: 'booking_widget',
          visible: true,
          props: { module: 'movies', mode: 'enquiry' },
          style: {},
          children: [],
        }]
      : [];

    const initial = await admin.evaluate(async ({ pageKey, document }) => {
      const client = await import('/src/lib/builder/client.ts');
      const state = await client.fetchAdminPage(pageKey);
      const draft = await client.savePageDraft(pageKey, document, state.versions[0]?.versionNumber ?? 0, 'two-browser baseline');
      return client.publishPage(pageKey, draft.versionId);
    }, { pageKey: module.pageKey, document: documentFor(module.pageKey, module.title, before, extraBlocks) });
    assert.equal(initial.status, 'published');
    if (module.pageKey === 'classes') classesInitialVersionId = initial.versionId;

    await customer.goto(`${base}/${module.hash}`, { waitUntil: 'domcontentloaded', timeout: 20_000 });
    await customer.locator('#root').waitFor({ state: 'attached' });
    await customer.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    const region = customer.locator(`[data-builder-page="${module.pageKey}"]`);
    await region.waitFor({ state: 'visible', timeout: 20_000 });
    const customerText = () => region.textContent();
    await assertEventually(async () => assert.match(await customerText() ?? '', new RegExp(before.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))));
    if (module.pageKey === 'movies') {
      assert.doesNotMatch(await customerText() ?? '', /Check availability and book/i);
    }
    console.log(`  PASS  independent customer browser rendered the published ${module.pageKey} page`);

    const next = await admin.evaluate(async ({ pageKey, document }) => {
      const client = await import('/src/lib/builder/client.ts');
      const state = await client.fetchAdminPage(pageKey);
      const draft = await client.savePageDraft(pageKey, document, state.versions[0]?.versionNumber ?? 0, 'publish from independent Super Admin session');
      return client.publishPage(pageKey, draft.versionId);
    }, { pageKey: module.pageKey, document: documentFor(module.pageKey, module.title, updated, extraBlocks) });
    assert.equal(next.status, 'published');
    await customer.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await assertEventually(async () => assert.match(await customerText() ?? '', new RegExp(updated.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))));
    console.log(`  PASS  independent customer browser revalidated the ${module.pageKey} Super Admin publication`);

    const rolled = await admin.evaluate(async ({ pageKey, targetVersionId }) => {
      const client = await import('/src/lib/builder/client.ts');
      return client.rollbackPage(pageKey, targetVersionId);
    }, { pageKey: module.pageKey, targetVersionId: initial.versionId });
    assert.equal(rolled.status, 'published');
    await customer.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await assertEventually(async () => assert.match(await customerText() ?? '', new RegExp(before.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))));
    assert.doesNotMatch(await customerText() ?? '', new RegExp(updated.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    console.log(`  PASS  independent customer browser observed the ${module.pageKey} rollback`);
  }

  const finalDraft = await admin.evaluate(async (document) => {
    const client = await import('/src/lib/builder/client.ts');
    const state = await client.fetchAdminPage('classes');
    return client.savePageDraft('classes', document, state.versions[0]?.versionNumber ?? 0, 'unpublished browser-session RLS probe');
  }, documentFor('classes', 'Classes', 'Unpublished browser draft'));
  assert.equal(finalDraft.status, 'draft');
  assert.ok(classesInitialVersionId);
} finally {
  await customerContext?.close();
  await adminContext?.close();
  await browser.close();
}

async function assertEventually(assertion, attempts = 80) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try { await assertion(); return; } catch (error) { lastError = error; }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw lastError;
}
