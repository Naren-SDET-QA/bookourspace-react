import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import express from 'express';
import { loadApprovedPublicListingMedia } from '../src/server/postgresPool.ts';
import { registerStaySearchApi } from '../src/server/staySearchApi.ts';

test('loadApprovedPublicListingMedia enforces active/public/ready predicates in BEGIN READ ONLY', async () => {
  const queries = [];
  const client = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (sql.includes('from public.media_assets asset')) {
        return {
          rows: [
            {
              listing_id: 'listing-1',
              images: ['storage://bos-public-media/owner-1/listing-1/original.jpg'],
            },
          ],
        };
      }
      return { rows: [] };
    },
  };

  const map = await loadApprovedPublicListingMedia(client, ['listing-1', 'listing-1', ''], {
    requireStayApproved: true,
  });

  assert.equal(queries[0].sql, 'BEGIN READ ONLY');
  assert.match(queries[1].sql, /l\.status = 'active'/);
  assert.match(queries[1].sql, /l\.is_verified is true and l\.verified_by is not null/);
  assert.match(queries[1].sql, /asset\.bucket_id = 'bos-public-media'/);
  assert.match(queries[1].sql, /asset\.privacy = 'public'/);
  assert.match(queries[1].sql, /asset\.processing_status = 'ready'/);
  assert.deepEqual(queries[1].params, [['listing-1']]);
  assert.equal(queries[2].sql, 'COMMIT');
  assert.deepEqual(map.get('listing-1'), ['storage://bos-public-media/owner-1/listing-1/original.jpg']);
});

test('staySearchApi never queries media_assets while SET LOCAL ROLE anon is active', async () => {
  let inAnonRole = false;
  const pool = {
    async connect() {
      return {
        async query(sql) {
          if (sql === 'BEGIN') return { rows: [] };
          if (sql === 'SET LOCAL ROLE anon') {
            inAnonRole = true;
            return { rows: [] };
          }
          if (sql === 'COMMIT' || sql === 'ROLLBACK') {
            inAnonRole = false;
            return { rows: [] };
          }
          if (inAnonRole && sql.includes('media_assets')) {
            throw Object.assign(new Error('permission denied for table media_assets'), { code: '42501' });
          }
          if (sql.includes('platform_module_flags')) return { rows: [{ is_enabled: true }] };
          if (sql.includes('with base as')) {
            return {
              rows: [
                {
                  total: 1,
                  rows: [
                    {
                      id: 'prop-1',
                      listing_id: 'listing-1',
                      name: 'Verified Stay',
                      property_type: 'hotel',
                      place_type: 'entire_home',
                      city: 'Hyderabad',
                      payload: { images: [] },
                      amenities: [],
                    },
                  ],
                },
              ],
            };
          }
          if (sql.includes('from public.media_assets asset')) {
            return {
              rows: [
                {
                  listing_id: 'listing-1',
                  images: ['storage://bos-public-media/owner-1/listing-1/cover.jpg'],
                },
              ],
            };
          }
          return { rows: [] };
        },
        release() {},
      };
    },
  };

  const app = express();
  registerStaySearchApi(app, {
    verifySession: () => null,
    env: { NODE_ENV: 'test', BOS_LISTINGS_DATABASE_URL: 'postgres://postgres@127.0.0.1:55432/bos_test?sslmode=disable' },
    pool,
  });

  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/stays/search`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.items.length, 1);
    assert.deepEqual(body.items[0].images, ['storage://bos-public-media/owner-1/listing-1/cover.jpg']);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
