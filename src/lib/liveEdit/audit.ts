import { supabase } from '../supabaseClient';
import { describeDatabaseError, isMissingDatabaseObjectError } from './dbErrors';
import type { LiveEditAuditEvent, LiveEditAuditEventInput } from './types';

export interface LiveEditAuditWriteResult {
  ok: boolean;
  code?: string;
  message: string;
  blocked: boolean;
}

export interface LiveEditAuditListResult {
  ok: boolean;
  events: LiveEditAuditEvent[];
  message: string;
  blocked: boolean;
}

export interface LiveEditAuditProbe {
  status: 'ready' | 'missing' | 'unknown';
  message: string;
}

export interface LiveEditAuditSink {
  readonly kind: 'supabase' | 'memory';
  record(event: LiveEditAuditEvent): Promise<LiveEditAuditWriteResult>;
  list(listingId: string, limit?: number): Promise<LiveEditAuditListResult>;
  probe(): Promise<LiveEditAuditProbe>;
}

const REDACTED_KEYS = /(email|phone|mobile|token|secret|password|upi|vpa|authorization|cookie)/i;
const MAX_AUDIT_STRING = 2000;

export function redactAuditValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[truncated]';
  if (typeof value === 'string') {
    return value.length > MAX_AUDIT_STRING ? `${value.slice(0, MAX_AUDIT_STRING)}…` : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((entry) => redactAuditValue(entry, depth + 1));
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      result[key] = REDACTED_KEYS.test(key) ? '[redacted]' : redactAuditValue(entry, depth + 1);
    }
    return result;
  }
  return String(value);
}

function newEventId(): string {
  const cryptoApi = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  // The audit table keys on uuid, so the fallback must also be a valid uuid.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function buildAuditEvent(input: LiveEditAuditEventInput): LiveEditAuditEvent {
  const changedFields = [...new Set(input.changedFields.filter(Boolean))].slice(0, 80);
  if (changedFields.length === 0) {
    throw new Error('LIVE_EDIT_AUDIT_WITHOUT_CHANGES');
  }
  const summary = `${input.actorRole} ${input.action} for ${input.module}/${input.listingId}: ${changedFields
    .slice(0, 8)
    .join(', ')}`.slice(0, 500);
  return {
    ...input,
    id: newEventId(),
    changedFields,
    summary,
    before: redactAuditValue(input.before) as Record<string, unknown>,
    after: redactAuditValue(input.after) as Record<string, unknown>,
  };
}

interface AuditRow {
  id: string;
  actor_user_id: string;
  actor_role: string;
  module: string;
  listing_id: string;
  listing_title: string;
  action: string;
  changed_fields: string[] | null;
  summary: string;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  source: string;
  occurred_at: string;
}

function toAuditEvent(row: AuditRow): LiveEditAuditEvent {
  return {
    id: String(row.id),
    action:
      row.action === 'cinema_screen.update'
        || row.action === 'cinema_screen.create'
        || row.action === 'cinema_screen.owner_assigned'
        || row.action === 'cinema_screen.owner_revoked'
        ? row.action
        : 'listing.update',
    module: row.module as LiveEditAuditEvent['module'],
    listingId: String(row.listing_id),
    listingTitle: String(row.listing_title || ''),
    actorUserId: String(row.actor_user_id),
    actorRole: row.actor_role as LiveEditAuditEvent['actorRole'],
    changedFields: Array.isArray(row.changed_fields) ? row.changed_fields.map(String) : [],
    occurredAt: String(row.occurred_at),
    before: row.before_state || {},
    after: row.after_state || {},
    source:
      row.source === 'server_listing_trigger'
        || row.source === 'server_cinema_api'
        || row.source === 'server_cinema_trigger'
        || row.source === 'server_cinema_owner_trigger'
        ? row.source
        : 'live_edit_ui',
    summary: String(row.summary || ''),
  };
}

/**
 * Supabase-backed audit sink.
 *
 * Expected object (install this table + RLS in the database project):
 *
 *   create table public.live_edit_audit_events (
 *     id uuid primary key,
 *     actor_user_id uuid not null references auth.users(id) on delete restrict,
 *     actor_role text not null check (actor_role in ('provider','admin','super_admin')),
 *     module text not null,
 *     listing_id text not null,
 *     listing_title text not null default '',
 *     action text not null check (action in ('listing.update','cinema_screen.update')),
 *     changed_fields text[] not null,
 *     summary text not null,
 *     before_state jsonb not null default '{}'::jsonb,
 *     after_state jsonb not null default '{}'::jsonb,
 *     source text not null default 'live_edit_ui',
 *     occurred_at timestamptz not null default now()
 *   );
 *
 * Insert/select policies must derive the actor from `auth.uid()`; the client is
 * not trusted to name the actor. No UPDATE/DELETE privilege is expected, so the
 * trail is append-only.
 */
export function createSupabaseLiveEditAuditSink(): LiveEditAuditSink {
  return {
    kind: 'supabase',
    async record(event) {
      if (!supabase) {
        return {
          ok: false,
          code: 'SUPABASE_NOT_CONFIGURED',
          message: 'Supabase is not configured, so the audit event was not recorded.',
          blocked: true,
        };
      }
      try {
        const { error } = await supabase.from('live_edit_audit_events').insert({
          id: event.id,
          actor_user_id: event.actorUserId,
          actor_role: event.actorRole,
          module: event.module,
          listing_id: event.listingId,
          listing_title: event.listingTitle,
          action: event.action,
          changed_fields: event.changedFields,
          summary: event.summary,
          before_state: event.before,
          after_state: event.after,
          source: event.source,
          occurred_at: event.occurredAt,
        });
        if (error) {
          const missing = isMissingDatabaseObjectError(error);
          return {
            ok: false,
            code: missing ? 'AUDIT_TABLE_MISSING' : error.code || 'AUDIT_INSERT_FAILED',
            message: missing
              ? 'Audit trail is BLOCKED: public.live_edit_audit_events is not installed in this project.'
              : `Audit event was not recorded (${describeDatabaseError(error)}).`,
            blocked: missing,
          };
        }
        return { ok: true, message: 'Audit event recorded.', blocked: false };
      } catch (error) {
        return {
          ok: false,
          code: 'AUDIT_INSERT_FAILED',
          message: `Audit event was not recorded (${error instanceof Error ? error.message : 'network error'}).`,
          blocked: false,
        };
      }
    },
    async list(listingId, limit = 20) {
      if (!supabase) {
        return { ok: false, events: [], message: 'Supabase is not configured.', blocked: true };
      }
      try {
        const { data, error } = await supabase
          .from('live_edit_audit_events')
          .select(
            'id, actor_user_id, actor_role, module, listing_id, listing_title, action, changed_fields, summary, before_state, after_state, source, occurred_at'
          )
          .eq('listing_id', listingId)
          .order('occurred_at', { ascending: false })
          .limit(Math.min(Math.max(limit, 1), 100));
        if (error) {
          const missing = isMissingDatabaseObjectError(error);
          return {
            ok: false,
            events: [],
            message: missing
              ? 'Audit trail is BLOCKED: public.live_edit_audit_events is not installed in this project.'
              : `Audit history could not be read (${describeDatabaseError(error)}).`,
            blocked: missing,
          };
        }
        return {
          ok: true,
          events: (data || []).map((row) => toAuditEvent(row as unknown as AuditRow)),
          message: 'Audit history loaded.',
          blocked: false,
        };
      } catch (error) {
        return {
          ok: false,
          events: [],
          message: `Audit history could not be read (${error instanceof Error ? error.message : 'network error'}).`,
          blocked: false,
        };
      }
    },
    async probe() {
      if (!supabase) return { status: 'missing', message: 'Supabase is not configured.' };
      try {
        const { error } = await supabase.from('live_edit_audit_events').select('id').limit(1);
        if (!error) return { status: 'ready', message: 'Audit table is installed.' };
        if (isMissingDatabaseObjectError(error)) {
          return {
            status: 'missing',
            message: 'public.live_edit_audit_events is not installed; audit events are BLOCKED.',
          };
        }
        return { status: 'unknown', message: `Audit table probe failed (${describeDatabaseError(error)}).` };
      } catch (error) {
        return {
          status: 'unknown',
          message: `Audit table probe failed (${error instanceof Error ? error.message : 'network error'}).`,
        };
      }
    },
  };
}

/** In-memory sink for tests and local harnesses only. Never used in the app. */
export function createMemoryLiveEditAuditSink(): LiveEditAuditSink {
  const events: LiveEditAuditEvent[] = [];
  return {
    kind: 'memory',
    async record(event) {
      events.unshift(event);
      return { ok: true, message: 'Audit event recorded (memory sink).', blocked: false };
    },
    async list(listingId, limit = 20) {
      return {
        ok: true,
        events: events.filter((event) => event.listingId === listingId).slice(0, limit),
        message: 'Audit history loaded (memory sink).',
        blocked: false,
      };
    },
    async probe() {
      return { status: 'ready', message: 'Memory audit sink is ready.' };
    },
  };
}
