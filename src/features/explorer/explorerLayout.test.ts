import assert from 'node:assert/strict';
import test from 'node:test';
import { explorerLayoutOptions, normalizeExplorerLayout } from './explorerLayout';

test('keeps both classic and Airbnb-inspired explorer layouts available', () => {
  assert.deepEqual(
    explorerLayoutOptions.map((option) => option.id),
    ['classic', 'airbnb']
  );
  assert.equal(normalizeExplorerLayout('classic'), 'classic');
  assert.equal(normalizeExplorerLayout('airbnb'), 'airbnb');
});

test('uses the Airbnb-inspired explorer layout for unknown stored preferences', () => {
  assert.equal(normalizeExplorerLayout('unknown-layout'), 'airbnb');
});
