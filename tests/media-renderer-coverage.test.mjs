import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('listing and private profile media do not bypass the shared SafeImage resolver', () => {
  const venueAgenda = source('src/components/VenueAgendaView.tsx');
  const stayDetail = source('src/components/stay/StayDetail.tsx');
  const hostProfile = source('src/components/stay/StayHostProfileModal.tsx');

  assert.match(venueAgenda, /<SafeImage[\s\S]*category="venues"[\s\S]*src=\{String\(photo\)\}/);
  assert.doesNotMatch(venueAgenda, /<img[^>]+src=\{String\(photo\)\}/);
  assert.match(stayDetail, /<SafeImage category="general" src=\{item\.hostAvatarUrl\}/);
  assert.doesNotMatch(stayDetail, /<img[^>]+src=\{item\.hostAvatarUrl\}/);
  assert.match(hostProfile, /<SafeImage category="general" src=\{profile\.host\.avatarUrl\}/);
  assert.doesNotMatch(hostProfile, /<img[^>]+src=\{profile\.host\.avatarUrl\}/);
});
