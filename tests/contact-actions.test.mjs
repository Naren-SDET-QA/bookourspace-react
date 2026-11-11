import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { BOS_CALL_HREF, BOS_CONTACT_PHONE, BOS_CONTACT_PHONE_E164, whatsappHref } from '../src/lib/contactNumbers.ts';

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('the public BookOurSpace contact number is shared consistently', () => {
  assert.equal(BOS_CONTACT_PHONE, '9966191813');
  assert.equal(BOS_CONTACT_PHONE_E164, '919966191813');
  assert.equal(BOS_CALL_HREF, 'tel:+919966191813');
  assert.equal(whatsappHref('Hello world'), 'https://wa.me/919966191813?text=Hello%20world');
  assert.equal(whatsappHref(''), 'https://wa.me/919966191813');
});

test('PG call and WhatsApp actions are never dead when owner contact is unavailable', () => {
  const pg = source('src/components/pg/PgStyleThreeDetail.tsx');
  assert.match(pg, /BOS_CALL_HREF/);
  assert.match(pg, /fallbackWhatsapp/);
  assert.match(pg, /Call Owner · \{BOS_CONTACT_PHONE\}/);
  assert.match(pg, /WhatsApp · \{BOS_CONTACT_PHONE\}/);
  assert.doesNotMatch(pg, /disabled=\{!canCall \|\| ownerBusy\}/);
  assert.doesNotMatch(pg, /disabled=\{!canWhatsapp \|\| ownerBusy\}/);
});

test('Classes Call Institute falls back to the public number', () => {
  const classes = source('src/components/classes/ClassesStyleThreeDetail.tsx');
  assert.match(classes, /BOS_CALL_HREF/);
  assert.match(classes, /Call Institute · \{BOS_CONTACT_PHONE\}/);
});

test('the global hover layer covers buttons, links, cards and form controls', () => {
  const css = source('src/index.css');
  assert.match(css, /button:not\(:disabled\):hover/);
  assert.match(css, /a\[href\]:hover/);
  assert.match(css, /article\[aria-label\]:hover/);
  assert.match(css, /input:not\(:disabled\):hover/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});
