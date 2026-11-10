import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const component = await readFile(new URL('../src/components/SpotlightModuleTabs.tsx', import.meta.url), 'utf8');

test('Spotlight module tabs cover the six marketplace modules once', () => {
  const modules = ['pg_hostels', 'classes', 'venues', 'services', 'hotel_stay', 'movies'];
  for (const moduleId of modules) {
    assert.equal((component.match(new RegExp(`id: '${moduleId}'`, 'g')) || []).length, 1, moduleId);
  }
  assert.match(component, /data-testid=\{`market-section-\$\{tab\.id\}`\}/);
});
test('Spotlight module tabs preserve accessible selection and keyboard navigation', () => {
  assert.match(component, /role="tablist"/);
  assert.match(component, /aria-selected=\{isActive\}/);
  assert.match(component, /aria-pressed=\{isActive\}/);
  assert.match(component, /ArrowRight/);
  assert.match(component, /ArrowLeft/);
  assert.match(component, /Home/);
  assert.match(component, /End/);
  assert.match(component, /motion-reduce:transition-none/);
});
test('Spotlight module tabs add no heavy animation runtime', () => {
  assert.doesNotMatch(component, /three|webgl|gsap|lenis|canvas/i);
});
