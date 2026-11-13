import assert from 'node:assert/strict';
import { localDatabaseEnv, seedLocal } from './database';

const env = localDatabaseEnv(process.env.BOS_DEMO_DATABASE_URL || 'postgresql://postgres:postgres@localhost:55422/postgres');
const first = seedLocal(env, process.env.BOS_DEMO_DATE);
const second = seedLocal(env, process.env.BOS_DEMO_DATE);
for (const [key, value] of Object.entries({ profiles: 6, listings: 29, movies: 4, cinemas: 4, showtimes: 16, favorites: 3, notifications: 3 })) {
  assert.equal(first[key], value, `Unexpected ${key}; existing data was preserved.`);
  assert.equal(second[key], value, `Second seed duplicated ${key}.`);
}
console.log(JSON.stringify({ idempotent: true, counts: second }, null, 2));
