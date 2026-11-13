import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialListings} from '../../data/seedData';
import {nonCinemaPublicListings} from './publicListings';

test('public marketplace never falls back to local movie listings and preserves the other five modules',()=>{
  const result=nonCinemaPublicListings(initialListings);
  assert.equal(result.some(item=>item.categoryId.startsWith('movie-')||item.customFieldValues?.sectionType==='movies'),false);
  for(const item of initialListings.filter(item=>!item.categoryId.startsWith('movie-')&&item.customFieldValues?.sectionType!=='movies'))assert.ok(result.includes(item));
});
