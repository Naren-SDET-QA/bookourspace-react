/**
 * Local-only seed for public.india_locations.
 * Does not write to hosted Supabase. Uses BOS_LISTINGS_DATABASE_URL (loopback).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { ALL_CITIES, INDIA_PIN_PREFIXES, INDIAN_STATES } from '../src/data/indiaLocations.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const coverageDir = path.join(root, 'src/data/serviceCoverage');

type Kind = 'state' | 'district' | 'mandal' | 'city' | 'town' | 'village' | 'pincode';

interface Row {
  kind: Kind;
  name: string;
  aliases: string[];
  state: string;
  stateCode: string;
  district: string;
  mandal: string;
  pincode: string | null;
  lat: number | null;
  lng: number | null;
  popular: boolean;
  source: string;
}

function norm(value: string): string {
  return value.trim().toLowerCase();
}

const STATE_CODES = new Map(INDIAN_STATES.map((state) => [state.name, state.code]));

function stateCodeOf(state: string): string {
  return STATE_CODES.get(state) || 'IN';
}

function push(rows: Row[], row: Row, seen: Set<string>) {
  const name = row.name.trim();
  if (!name) return;
  const key = `${row.kind}|${norm(name)}|${row.state}|${row.district}|${row.mandal}|${row.pincode ?? ''}`;
  if (seen.has(key)) return;
  seen.add(key);
  rows.push({
    ...row,
    name,
    aliases: [...new Set(row.aliases.map((alias) => alias.trim()).filter(Boolean))],
  });
}

function loadCoverage(rows: Row[], seen: Set<string>): void {
  const files = fs.readdirSync(coverageDir).filter((name) => name.endsWith('.json'));
  for (const file of files) {
    const payload = JSON.parse(fs.readFileSync(path.join(coverageDir, file), 'utf8')) as {
      state?: string;
      districts?: Array<{ name: string; mandals?: Array<{ name: string; villages?: string[] }> }>;
    };
    const state = String(payload.state || '').trim();
    if (!state) continue;
    const code = stateCodeOf(state);
    push(rows, {
      kind: 'state', name: state, aliases: [code], state, stateCode: code, district: state, mandal: '',
      pincode: null, lat: null, lng: null, popular: false, source: 'lgd',
    }, seen);
    for (const district of payload.districts || []) {
      const districtName = String(district.name || '').trim();
      if (!districtName) continue;
      push(rows, {
        kind: 'district', name: districtName, aliases: [], state, stateCode: code, district: districtName, mandal: '',
        pincode: null, lat: null, lng: null, popular: false, source: 'lgd',
      }, seen);
      for (const mandal of district.mandals || []) {
        const mandalName = String(mandal.name || '').trim();
        if (!mandalName) continue;
        push(rows, {
          kind: 'mandal', name: mandalName, aliases: [], state, stateCode: code, district: districtName, mandal: mandalName,
          pincode: null, lat: null, lng: null, popular: false, source: 'lgd',
        }, seen);
        for (const village of mandal.villages || []) {
          push(rows, {
            kind: 'village', name: String(village || ''), aliases: [], state, stateCode: code, district: districtName,
            mandal: mandalName, pincode: null, lat: null, lng: null, popular: false, source: 'lgd',
          }, seen);
        }
      }
    }
  }
}

function curatedRows(rows: Row[], seen: Set<string>): void {
  for (const state of INDIAN_STATES) {
    push(rows, {
      kind: 'state', name: state.name, aliases: [state.code], state: state.name, stateCode: state.code,
      district: state.name, mandal: '', pincode: null, lat: null, lng: null, popular: false, source: 'curated',
    }, seen);
    for (const district of state.districts) {
      push(rows, {
        kind: 'district', name: district.name, aliases: [], state: state.name, stateCode: state.code,
        district: district.name, mandal: '', pincode: null, lat: null, lng: null, popular: false, source: 'curated',
      }, seen);
    }
  }
  for (const city of ALL_CITIES) {
    push(rows, {
      kind: city.type === 'town' ? 'town' : 'city',
      name: city.name,
      aliases: city.aliases ?? [],
      state: city.state,
      stateCode: stateCodeOf(city.state),
      district: city.district,
      mandal: '',
      pincode: null,
      lat: city.lat,
      lng: city.lng,
      popular: Boolean(city.popular),
      source: 'curated',
    }, seen);
  }
  for (const prefix of INDIA_PIN_PREFIXES) {
    push(rows, {
      kind: 'pincode',
      name: prefix.name,
      aliases: [],
      state: prefix.state,
      stateCode: stateCodeOf(prefix.state),
      district: prefix.district,
      mandal: '',
      pincode: prefix.prefix,
      lat: null,
      lng: null,
      popular: false,
      source: 'pin_prefix',
    }, seen);
  }
}

async function main() {
  const connectionString = String(process.env.BOS_LISTINGS_DATABASE_URL || '').trim();
  if (!connectionString) throw new Error('BOS_LISTINGS_DATABASE_URL is required');
  const url = new URL(connectionString);
  if (!['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
    throw new Error('india location seed is loopback-only');
  }
  const started = Date.now();
  const rows: Row[] = [];
  const seen = new Set<string>();
  curatedRows(rows, seen);
  loadCoverage(rows, seen);
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query('begin');
    await client.query('truncate public.india_locations restart identity');
    const batchSize = 1200;
    for (let offset = 0; offset < rows.length; offset += batchSize) {
      const slice = rows.slice(offset, offset + batchSize);
      const values: unknown[] = [];
      const tuples = slice.map((row, index) => {
        const base = index * 13;
        values.push(
          row.name, row.district, row.state, row.stateCode, row.kind, row.lat, row.lng,
          row.popular, row.aliases, row.mandal, row.pincode, row.kind, row.source,
        );
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}::text[], $${base + 10}, $${base + 11}, $${base + 12}, $${base + 13})`;
      });
      await client.query(
        `insert into public.india_locations
           (name, district, state, state_code, location_type, latitude, longitude, is_popular, aliases, mandal, pincode, kind, source)
         values ${tuples.join(',')}`,
        values,
      );
    }
    await client.query('analyze public.india_locations');
    const stats = await client.query(`
      select count(*)::int as rows,
             pg_total_relation_size('public.india_locations')::bigint as bytes
        from public.india_locations
    `);
    const sampleStarted = Date.now();
    const sample = await client.query(`select name, kind, rank from public.search_india_locations('Hyderabad', 10)`);
    await client.query('commit');
    console.log(JSON.stringify({
      ok: true,
      rows: stats.rows[0].rows,
      bytes: Number(stats.rows[0].bytes),
      prepared: rows.length,
      seedMs: Date.now() - started,
      searchMs: Date.now() - sampleStarted,
      sample: sample.rows,
    }));
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
