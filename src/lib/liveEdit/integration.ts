import { fetchMoviesInventory, supabase } from '../supabaseClient';
import { isMissingDatabaseObjectError } from './dbErrors';
import type { LiveEditIntegrationStatus, LiveEditTableStatus } from './types';

export interface LiveEditIntegrationDeps {
  probeTable(table: string): Promise<LiveEditTableStatus>;
  checkCinemaStore(): Promise<LiveEditTableStatus>;
  isSupabaseConfigured?(): boolean;
  now?(): string;
}

export const LIVE_EDIT_EXPECTED_TABLES = [
  'listings',
  'live_edit_audit_events',
  'live_edit_admin_assignments',
] as const;

async function probeSupabaseTable(table: string): Promise<LiveEditTableStatus> {
  if (!supabase) return 'missing';
  try {
    const { error } = await supabase.from(table).select('id').limit(1);
    if (!error) return 'ready';
    if (isMissingDatabaseObjectError(error)) return 'missing';
    // 42501/RLS denial means the object exists but this role cannot read it.
    if (String(error.code || '') === '42501' || /permission denied/i.test(error.message || '')) {
      return 'ready';
    }
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

async function defaultCinemaStoreCheck(): Promise<LiveEditTableStatus> {
  try {
    const inventory = await fetchMoviesInventory();
    return inventory.ok ? 'ready' : 'unknown';
  } catch {
    return 'unknown';
  }
}

export const defaultLiveEditIntegrationDeps: LiveEditIntegrationDeps = {
  probeTable: probeSupabaseTable,
  checkCinemaStore: defaultCinemaStoreCheck,
  isSupabaseConfigured: () => Boolean(supabase),
};

/**
 * Read-only probe of the hosted integration. It never creates objects and never
 * claims a capability it could not verify; the panel renders the messages
 * verbatim so a missing schema reads as BLOCKED rather than as an empty list.
 */
export async function probeLiveEditIntegration(
  deps: LiveEditIntegrationDeps = defaultLiveEditIntegrationDeps
): Promise<LiveEditIntegrationStatus> {
  const [listingsTable, auditTable, assignmentsTable, cinemaStore] = await Promise.all([
    deps.probeTable('listings'),
    deps.probeTable('live_edit_audit_events'),
    deps.probeTable('live_edit_admin_assignments'),
    deps.checkCinemaStore(),
  ]);

  const messages: string[] = [];
  const configured = deps.isSupabaseConfigured ? deps.isSupabaseConfigured() : true;
  if (!configured) {
    messages.push(
      'BLOCKED: Supabase is not configured in this build, so no listing, audit or assignment object can be reached.'
    );
  }
  if (listingsTable === 'missing' && configured) {
    messages.push(
      'BLOCKED: public.listings is not installed in the connected Supabase project, so listing Live Edit cannot load or save.'
    );
  }
  if (auditTable === 'missing' && configured) {
    messages.push(
      'BLOCKED: public.live_edit_audit_events is not installed. Saves can be confirmed by the server, but no audit event can be recorded.'
    );
  }
  if (assignmentsTable === 'missing' && configured) {
    messages.push(
      'BLOCKED: public.live_edit_admin_assignments is not installed. Non-Super-Admin administrators have no assigned scope and are denied editing.'
    );
  }
  if (cinemaStore !== 'ready') {
    messages.push('Cinema screen editing could not be verified against the server.');
  }
  if (messages.length === 0) {
    messages.push('Live Edit integration objects are available.');
  }

  return {
    checkedAt: (deps.now ?? (() => new Date().toISOString()))(),
    listingsTable,
    auditTable,
    assignmentsTable,
    realtimeListings: listingsTable === 'ready' ? 'unknown' : 'missing',
    cinemaStore,
    blocked: !configured || listingsTable === 'missing' || auditTable === 'missing' || assignmentsTable === 'missing',
    messages,
  };
}
