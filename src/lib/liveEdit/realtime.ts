import { supabase } from '../supabaseClient';
import { inferLiveEditModule } from './moduleInference';
import type { LiveEditModule } from './types';

export type LiveEditRealtimeStatus = 'subscribed' | 'unavailable' | 'closed';

export interface LiveEditRealtimeChange {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  listingId: string;
  module: LiveEditModule | null;
  row: Record<string, unknown>;
}

export interface SubscribeLiveEditOptions {
  onListingChange(change: LiveEditRealtimeChange): void;
  onStatus?(status: LiveEditRealtimeStatus, message?: string): void;
  /** Injectable for tests; defaults to the shared Supabase client. */
  client?: typeof supabase;
}

/**
 * Realtime for the listings table.
 *
 * Supabase Realtime evaluates RLS for the subscribed session, so a provider only
 * receives rows visible to that provider and an admin receives what the admin
 * policies expose. A missing table or blocked Realtime channel degrades to a
 * clear `unavailable` status instead of pretending the screen is live.
 */
export function subscribeToLiveEditChanges(options: SubscribeLiveEditOptions): () => void {
  const client = options.client ?? supabase;
  if (!client) {
    options.onStatus?.('unavailable', 'Supabase Realtime is not configured.');
    return () => undefined;
  }

  let channel: ReturnType<typeof client.channel> | null = null;
  try {
    channel = client
      .channel('live-edit-listings')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'listings' },
        (payload: { eventType?: string; new?: Record<string, unknown>; old?: Record<string, unknown> }) => {
          const row = (payload.new || payload.old || {}) as Record<string, unknown>;
          const listingId = String(row.id || '');
          if (!listingId) return;
          const module = inferLiveEditModule({
            categoryId: row.category_id,
            subcategory: row.subcategory,
            entityType: row.entity_type,
            title: row.title,
            payload:
              row.payload && typeof row.payload === 'object'
                ? (row.payload as Record<string, unknown>)
                : null,
          });
          options.onListingChange({
            eventType:
              payload.eventType === 'INSERT' || payload.eventType === 'DELETE'
                ? payload.eventType
                : 'UPDATE',
            listingId,
            module,
            row,
          });
        }
      )
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') options.onStatus?.('subscribed', 'Realtime connected.');
        else if (status === 'CHANNEL_ERROR')
          options.onStatus?.('unavailable', 'Realtime channel error; refresh to see other changes.');
        else if (status === 'TIMED_OUT')
          options.onStatus?.('unavailable', 'Realtime timed out; refresh to see other changes.');
        else if (status === 'CLOSED') options.onStatus?.('closed');
      });
  } catch (error) {
    options.onStatus?.(
      'unavailable',
      error instanceof Error ? error.message : 'Realtime subscription failed.'
    );
  }

  return () => {
    try {
      if (channel) void client.removeChannel(channel);
    } catch {
      /* unloading a failed channel is best effort */
    }
  };
}
