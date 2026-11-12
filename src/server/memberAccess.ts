import type { AccessScope } from '../lib/businessAccess';
import { accessScopeFrom } from '../lib/businessAccess';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
}

/**
 * Resolve the access scope a member holds inside one business.
 *
 * Returns `null` for unrestricted members (owners included, and members with
 * no grant row), so callers read `null` as "nothing is denied".
 */
export async function loadMemberAccessScope(
  db: Queryable,
  businessId: string,
  userId: string,
): Promise<AccessScope | null> {
  if (!UUID.test(String(businessId || '')) || !UUID.test(String(userId || ''))) return null;
  const { rows } = await db.query(
    `select m.role as member_role, ma.allowed_modules, ma.allowed_sections
       from public.business_members m
       left join public.business_member_access ma
              on ma.business_id = m.business_id and ma.user_id = m.user_id
      where m.business_id = $1 and m.user_id = $2 and m.status = 'active'
      limit 1`,
    [businessId, userId],
  );
  const row = rows[0];
  if (!row) return null;
  if (String(row.member_role || '') === 'owner') return null;
  return accessScopeFrom({
    allowed_modules: Array.isArray(row.allowed_modules) ? (row.allowed_modules as string[]) : null,
    allowed_sections: (row.allowed_sections as Record<string, string[]>) || null,
  });
}

/** True when the grant table has not been migrated in this environment yet. */
export function isMissingAccessSchema(error: unknown): boolean {
  const code = String((error as { code?: string } | null)?.code || '');
  return code === '42P01' || code === '42703';
}
