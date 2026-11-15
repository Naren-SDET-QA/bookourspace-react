import { getSharedPostgresPool, isPostgresConfigured } from './postgresPool';

export interface IndiaLocationHit {
  kind: string;
  name: string;
  state: string;
  district: string;
  mandal: string;
  pincode: string | null;
  lat: number | null;
  lng: number | null;
  label: string;
  aliases: string[];
  source: 'directory';
  rank: number;
}

/**
 * Compatibility helper for server callers. It uses only the normalized
 * PostgreSQL catalog; the browser never receives a bundled India dataset and
 * this helper never calls or caches an external geocoder.
 */
export async function searchIndiaLocationDirectory(query: string, env: NodeJS.ProcessEnv = process.env): Promise<IndiaLocationHit[]> {
  const needle = query.trim().normalize('NFKC').slice(0, 80);
  if (!needle || !isPostgresConfigured(env)) return [];
  const connectionString = String(env.BOS_LISTINGS_DATABASE_URL || '').trim();
  const pool = getSharedPostgresPool(connectionString, env);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE service_role');
    await client.query("select set_config('statement_timeout', '700ms', true)");
    const result = await client.query(
      'select id, kind, name, state, district, mandal, pincode, lat, lng, aliases, rank from public.search_india_locations($1, 10)',
      [needle],
    );
    await client.query('COMMIT');
    return result.rows.map((row) => {
      const name = String(row.name || '');
      const state = String(row.state || '');
      const district = String(row.district || '');
      const mandal = String(row.mandal || '');
      const kind = String(row.kind || 'city');
      const pincode = row.pincode ? String(row.pincode) : null;
      const label = kind === 'pincode' && pincode
        ? `${name} · PIN ${pincode}, ${state}`
        : kind === 'village' && mandal
          ? `${name}, ${mandal}, ${district}, ${state}`
          : name === district ? `${name}, ${state}` : `${name}, ${district}, ${state}`;
      return {
        kind,
        name,
        state,
        district,
        mandal,
        pincode,
        lat: row.lat == null ? null : Number(row.lat),
        lng: row.lng == null ? null : Number(row.lng),
        label,
        aliases: Array.isArray(row.aliases) ? row.aliases.map(String) : [],
        source: 'directory' as const,
        rank: Number(row.rank) || 0,
      };
    });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* preserve original error */ }
    throw error;
  } finally {
    client.release();
  }
}
