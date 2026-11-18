import type express from 'express';
import { logSafeError } from './safeLogging';
import {
  ServiceBookingRepository,
  ServiceBookingRepositoryError,
} from './serviceBookingRepository';
import { ProviderListingRepositoryError, type ProviderListingActor } from './providerListingRepository';
import { hasVerifiedSupabaseIdentity } from './authIdentity';
import { isTrackingTokenFormat } from '../lib/trackingShare';
import { isLiveDeliveryStatus } from '../lib/deliveryTracking';
import { sendWhatsAppBookingMessageWithRetry } from './whatsappBookingNotifications';

export interface TrackingShareApiDependencies {
  repository: ServiceBookingRepository;
  verifySession: (request: express.Request) => ProviderListingActor | null;
  env?: NodeJS.ProcessEnv;
}

function sendError(response: express.Response, error: unknown): void {
  if (error instanceof ProviderListingRepositoryError || error instanceof ServiceBookingRepositoryError) {
    response.status(error.httpStatus).json({ ok: false, error: error.code });
    return;
  }
  logSafeError('tracking-share', 'repository', error);
  response.status(500).json({ ok: false, error: 'TRACKING_SHARE_ERROR' });
}

function requestOrigin(request: express.Request, env: NodeJS.ProcessEnv): string {
  const appUrl = String(env.APP_URL || '').trim();
  if (appUrl) return appUrl.replace(/\/+$/, '');
  const host = String(request.headers.host || '').split(',')[0].trim();
  const proto = String(request.headers['x-forwarded-proto'] || request.protocol || 'http').split(',')[0].trim();
  if (!host) return 'http://127.0.0.1:3000';
  return `${proto}://${host}`;
}

async function maybeWhatsApp(
  repository: ServiceBookingRepository,
  bookingId: string,
  event: 'booking_confirmed' | 'provider_on_the_way',
  trackingUrl: string,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  try {
    const state = await repository.trackingWhatsAppDispatchState(bookingId);
    if (!state) return;
    if (event === 'provider_on_the_way' && state.locationCount < 1) return;
    if (event === 'booking_confirmed' && !isLiveDeliveryStatus(state.status)) return;
    const url = trackingUrl || state.lastTrackingUrl;
    if (!url) return;
    const result = await sendWhatsAppBookingMessageWithRetry({
      event,
      to: state.customerPhone,
      bookingRef: state.bookingRef,
      trackingUrl: url,
      optIn: state.whatsappOptIn,
      alreadySent: event === 'booking_confirmed' ? state.confirmationSent : state.onTheWaySent,
    }, env);
    await repository.markWhatsAppSent(bookingId, event, {
      status: result.ok ? 'sent' : result.skipped ? 'skipped' : 'failed',
      error: result.error,
      providerMessageId: result.providerMessageId,
      trackingUrl: url,
    });
  } catch (error) {
    logSafeError('tracking-share', `whatsapp ${event}`, error);
  }
}

export function registerTrackingShareApi(app: express.Express, dependencies: TrackingShareApiDependencies): void {
  const { repository, verifySession } = dependencies;
  const env = dependencies.env || process.env;

  app.post('/api/services/bookings/:id/tracking/share-link', async (request, response) => {
    const actor = verifySession(request);
    if (!actor) {
      response.status(401).json({ ok: false, error: 'UNAUTHORIZED_SESSION' });
      return;
    }
    if (!['customer', 'admin'].includes(actor.role) || !hasVerifiedSupabaseIdentity(actor)) {
      response.status(403).json({ ok: false, error: 'FORBIDDEN_ROLE' });
      return;
    }
    try {
      const origin = requestOrigin(request, env);
      const issued = await repository.issueTrackingShareLink(actor, String(request.params.id || ''), {
        origin,
        whatsappOptIn: request.body?.whatsappOptIn === true,
      });
      response.setHeader('cache-control', 'no-store');
      response.status(201).json({ ok: true, ...issued, source: 'postgres' });
      void maybeWhatsApp(repository, String(request.params.id || ''), 'booking_confirmed', issued.url, env);
    } catch (error) {
      sendError(response, error);
    }
  });

  app.get('/api/track/:token', async (request, response) => {
    const token = String(request.params.token || '');
    if (!isTrackingTokenFormat(token)) {
      response.status(404).json({ ok: false, error: 'TRACKING_LINK_NOT_FOUND' });
      return;
    }
    try {
      const snapshot = await repository.publicTrackingSnapshotByToken(token);
      response.setHeader('cache-control', 'no-store');
      response.json({ ok: true, snapshot, source: 'postgres' });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.get('/api/admin/gps-tracking/capacity', async (request, response) => {
    const actor = verifySession(request);
    if (!actor) {
      response.status(401).json({ ok: false, error: 'UNAUTHORIZED_SESSION' });
      return;
    }
    if (actor.role !== 'admin' || !hasVerifiedSupabaseIdentity(actor)) {
      response.status(403).json({ ok: false, error: 'GPS_POLICY_ADMIN_REQUIRED' });
      return;
    }
    try {
      const capacity = await repository.gpsCapacitySnapshot();
      response.setHeader('cache-control', 'no-store');
      response.json({ ok: true, capacity, source: 'postgres' });
    } catch (error) {
      sendError(response, error);
    }
  });
}

export async function notifyProviderOnTheWayIfNeeded(
  repository: ServiceBookingRepository,
  bookingId: string,
  trackingUrl: string,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  await maybeWhatsApp(repository, bookingId, 'provider_on_the_way', trackingUrl, env);
}

export async function notifyBookingConfirmedIfNeeded(
  repository: ServiceBookingRepository,
  bookingId: string,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  const origin = String(env.APP_URL || '').trim().replace(/\/+$/, '') || 'http://127.0.0.1:3000';
  let trackingUrl = '';
  try {
    const issued = await repository.ensureTrackingShareLinkOnAccept(bookingId, origin);
    trackingUrl = issued?.url || '';
  } catch (error) {
    logSafeError('tracking-share', 'issue confirmation tracking link', error);
  }
  await maybeWhatsApp(repository, bookingId, 'booking_confirmed', trackingUrl, env);
}
