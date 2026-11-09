import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The Theme Management quick-selects must offer distinct, real artwork.
 * A duplicated URL made both buttons render as selected, produced duplicate
 * React keys, and pointed a named option at the wrong image.
 */
test('built-in logo emblem options are unique and reference real assets', async () => {
  const source = await readFile(path.join(root, 'src/components/AdminThemeManagementSection.tsx'), 'utf8');
  const start = source.indexOf('const BUILTIN_LOGO_EMBLEMS');
  assert.ok(start > 0, 'the built-in logo emblem list must exist');
  const end = source.indexOf('];', start);
  const block = source.slice(start, end);

  const literalUrls = [...block.matchAll(/url:\s*'([^']+)'/g)].map((match) => match[1]);
  const constantUrls = [...block.matchAll(/url:\s*(BOS_OFFICIAL_LOGO_STATIC)/g)].map(() => 'BOS_OFFICIAL_LOGO_STATIC');
  const entries = [...literalUrls, ...constantUrls];
  assert.ok(entries.length >= 2, 'at least two emblem choices are offered');
  assert.equal(new Set(entries).size, entries.length, `emblem URLs must be unique: ${entries.join(', ')}`);

  const labels = [...block.matchAll(/label:\s*'([^']+)'/g)].map((match) => match[1]);
  assert.equal(new Set(labels).size, labels.length, 'emblem labels must be unique');

  for (const url of literalUrls) {
    const assetPath = path.join(root, 'public', url.replace(/^\//, ''));
    await assert.doesNotReject(stat(assetPath), `${url} must be a served asset`);
  }
});

test('the official logo lockup constant is a served asset', async () => {
  const source = await readFile(path.join(root, 'src/components/BOSOfficialLogo.tsx'), 'utf8');
  const match = source.match(/export const BOS_OFFICIAL_LOGO_STATIC = '([^']+)'/);
  assert.ok(match, 'BOS_OFFICIAL_LOGO_STATIC must be declared');
  await assert.doesNotReject(stat(path.join(root, 'public', match[1].replace(/^\//, ''))));
});
