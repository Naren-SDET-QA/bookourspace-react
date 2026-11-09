import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
  parsePrivacyConsent,
  parseUtmFromSearch,
  shouldShowCookieBanner,
  stripUtmFromSearch,
} from '../src/lib/privacyConsent.ts';

test('cookie banner stays off on native shells and after a stored choice', () => {
  assert.equal(shouldShowCookieBanner(true, null), false);
  assert.equal(shouldShowCookieBanner(false, null), true);
  assert.equal(shouldShowCookieBanner(false, JSON.stringify({ choice: 'essential', at: '2026-11-08' })), false);
  assert.equal(parsePrivacyConsent('not-json'), null);
  assert.equal(parsePrivacyConsent(JSON.stringify({ choice: 'analytics', at: '2026-11-08' }))?.choice, 'analytics');
});

test('production login stays Google-only and password visibility is limited to CVV', async () => {
  const [modal, login, html] = await Promise.all([
    readFile(new URL('../src/components/PaymentModal.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/SimpleLoginPage.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
  ]);
  assert.match(modal, /Show CVV/);
  assert.match(modal, /type=\{showCvv \? 'text' : 'password'\}/);
  assert.doesNotMatch(login, /type=["']password["']/);
  assert.match(html, /Continue with Google/);
});

test('UTM campaign tags parse and strip without extra tracking parameters', () => {
  const parsed = parseUtmFromSearch('?utm_source=google&utm_medium=cpc&utm_campaign=stays&foo=1');
  assert.deepEqual(parsed, { utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'stays' });
  assert.equal(parseUtmFromSearch('?city=hyderabad'), null);
  assert.equal(stripUtmFromSearch('?utm_source=google&city=hyderabad'), '?city=hyderabad');
  assert.equal(stripUtmFromSearch('?utm_campaign=x'), '');
});
