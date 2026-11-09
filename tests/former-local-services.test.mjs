import assert from 'node:assert/strict';
import {
  filterFormerLocalServices,
  formerLocalServiceCategories,
  parseFormerLocalServiceRow,
} from '../src/lib/formerLocalServices.ts';
import { servicesCategories } from '../src/data/servicesStayMoviesData.ts';

const results = [];
function test(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
    console.log(`  PASS  ${name}`);
  } catch (error) {
    results.push({ name, ok: false });
    console.error(`  FAIL  ${name}\n        ${error.message}`);
  }
}

function row(overrides = {}) {
  return {
    id: 'rural-001',
    title: 'Fresh cow milk',
    category_id: 'rural-dairy',
    subcategory: 'Fresh cow milk',
    price: 62,
    price_unit: 'per litre',
    status: 'active',
    payload: {
      providerName: 'Village Dairy Cooperative',
      location: { city: 'Nirmal', area: 'North village' },
      description: 'Provider entered listing description.',
      images: ['https://media.example.test/milk.jpg'],
      isVerified: true,
    },
    provider_availability_status: 'available',
    is_verified: false,
    ...overrides,
  };
}

console.log('\nFormer Local Services\n');

test('Milk & Dairy and both Farm & Village categories remain in Services', () => {
  assert.deepEqual(formerLocalServiceCategories.map((item) => item.id), [
    'rural-dairy', 'rural-farm-support', 'rural-livestock',
  ]);
  assert.ok(servicesCategories.some((item) => item.id === 'rural-dairy'));
  assert.ok(servicesCategories.length > formerLocalServiceCategories.length);
});

test('only active allowed Supabase listings become provider cards', () => {
  assert.ok(parseFormerLocalServiceRow(row()));
  assert.equal(parseFormerLocalServiceRow(row({ status: 'pending_approval' })), null);
  assert.equal(parseFormerLocalServiceRow(row({ category_id: 'unrelated-category' })), null);
  assert.equal(parseFormerLocalServiceRow(row({ title: '' })), null);
});

test('provider verification is read from protected database column, never legacy JSON', () => {
  const unverified = parseFormerLocalServiceRow(row());
  assert.equal(unverified.verified, false);
  assert.equal(parseFormerLocalServiceRow(row({ is_verified: true })).verified, true);
});

test('public Storage refs and HTTPS photos both become the card image', () => {
  const storage = parseFormerLocalServiceRow(row({
    payload: {
      providerName: 'Village Dairy Cooperative',
      location: { city: 'Nirmal', area: 'North village' },
      images: ['storage://bos-public-media/owner/rural/milk.webp'],
    },
  }));
  assert.equal(storage.image, 'storage://bos-public-media/owner/rural/milk.webp');
  const httpsCard = parseFormerLocalServiceRow(row());
  assert.equal(httpsCard.image, 'https://media.example.test/milk.jpg');
});

test('missing location, price, provider, and availability remain missing', () => {
  const card = parseFormerLocalServiceRow(row({
    price: 0,
    price_unit: '',
    provider_availability_status: null,
    payload: { location: {}, images: [], isVerified: true },
  }));
  assert.equal(card.price, null);
  assert.equal(card.city, '');
  assert.equal(card.area, '');
  assert.equal(card.providerName, '');
  assert.equal(card.availability, 'not_reported');
  assert.equal(card.image, null);
});

test('rural search matches actual provider, category and location values', () => {
  const card = parseFormerLocalServiceRow(row());
  const cards = [card];
  const filters = { categoryId: 'all', query: 'nirmal', verifiedOnly: false, availableOnly: false, maxPrice: null };
  assert.equal(filterFormerLocalServices(cards, filters).length, 1);
  assert.equal(filterFormerLocalServices(cards, { ...filters, query: 'imaginary village' }).length, 0);
});

test('category, verified, provider-reported availability and real listed-price filters compose', () => {
  const dairy = parseFormerLocalServiceRow(row());
  const farm = parseFormerLocalServiceRow(row({ id: 'rural-002', category_id: 'rural-farm-support', price: 400, provider_availability_status: 'unavailable' }));
  const cards = [dairy, farm];
  const base = { categoryId: 'all', query: '', verifiedOnly: false, availableOnly: false, maxPrice: null };
  assert.deepEqual(filterFormerLocalServices(cards, { ...base, categoryId: 'rural-dairy' }).map((item) => item.id), ['rural-001']);
  assert.deepEqual(filterFormerLocalServices(cards, { ...base, verifiedOnly: true }).map((item) => item.id), []);
  assert.deepEqual(filterFormerLocalServices(cards, { ...base, availableOnly: true }).map((item) => item.id), ['rural-001']);
  assert.deepEqual(filterFormerLocalServices(cards, { ...base, maxPrice: 100 }).map((item) => item.id), ['rural-001']);
});

test('availability is labeled only as a provider report', () => {
  assert.equal(parseFormerLocalServiceRow(row({ provider_availability_status: 'available' })).availability, 'available');
  assert.equal(parseFormerLocalServiceRow(row({ provider_availability_status: 'unsupported' })).availability, 'not_reported');
});

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length) process.exitCode = 1;
