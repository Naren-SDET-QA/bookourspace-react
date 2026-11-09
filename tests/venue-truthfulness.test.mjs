import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('venue cards never invent ratings, partner status, or photo-gallery counts', () => {
  const source = read('src/components/HallsMandapExperience.tsx');
  assert.doesNotMatch(source, /ratingFor|BookOurSpace Partner/);
  assert.doesNotMatch(source, /\[0,\s*1,\s*2\]/);
  assert.match(source, /listing\.isVerified/);
});

test('venue details show ratings only when a real review count is present', () => {
  const source = read('src/components/VenueDetailModal.tsx');
  assert.doesNotMatch(source, /providerRating\s*\|\|\s*4\.5|reviewCount\s*\|\|\s*0/);
  assert.match(source, /typeof listing\.providerRating === 'number'/);
  assert.match(source, /listing\.reviewCount > 0/);
});

test('venue details read the field names the owner wizard actually submits', () => {
  const source = read('src/components/VenueDetailModal.tsx');
  assert.match(source, /field\(listing, 'capacity'\) \|\| field\(listing, 'seatingCapacity'\)/);
  assert.match(source, /field\(listing, 'acType'\).*field\(listing, 'acHallType'\)/);
  assert.match(source, /field\(listing, 'decorationPolicy'\).*field\(listing, 'decorationSound'\)/);
});

test('venue listing wizard does not seed example price, venue name, or cover photo', () => {
  const source = read('src/components/PostListingWizard.tsx');
  const venueConfig = source.slice(source.indexOf("if (section === 'venues')"), source.indexOf('// 4. HOME & URBAN SERVICES'));
  assert.match(venueConfig, /providerNameEn: 'Enter your registered venue or business name'/);
  assert.match(venueConfig, /coverImageUrl: ''/);
  assert.match(venueConfig, /defaultPrice: ''/);
});

test('visible venue capacity, food, amenity and catering filters use submitted listing fields', () => {
  const source = read('src/components/HallsMandapExperience.tsx');
  assert.match(source, /setMinimumCapacity/);
  assert.match(source, /seatingCapacity/);
  assert.match(source, /setFoodFilter/);
  assert.match(source, /setAmenityFilter/);
  assert.match(source, /setCateringFilter/);
  assert.match(source, /customFieldValues\?\.cateringPolicy/);
});
