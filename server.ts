import express from 'express';
import { createServer } from 'node:http';
import dotenv from 'dotenv';
import { hasAdminAuthorization } from './src/server/adminAuthorization';
import { resolveSupabaseConfig } from './src/lib/supabaseConfig';
import {
  canLinkSupabaseAuthIdentity,
  isValidSupabaseAuthUserId,
  verifySupabaseGoogleIdentity,
  verifySupabaseEmailIdentity,
  verifySupabaseSuperAdmin,
  manageSupabaseUserAccess,
  listSupabaseUserProfiles,
} from './src/server/supabaseGoogleIdentity';
import { assertPostgresConnectionTarget, assertProductionPersistenceReady } from './src/server/persistencePolicy';
import { assertProductionSupabaseEnvironment } from './src/server/supabaseProductionGuard';
import { closeSharedPostgresPool, initializePostgresRuntime } from './src/server/postgresPool';
import { registerPlatformApi } from './src/server/platformApi';
import { registerMoviesShowtimesApi } from './src/server/moviesShowtimesApi';
import { PlatformSettingsRepository, registerPlatformSettingsApi } from './src/server/platformSettingsApi';
import { registerStayApi } from './src/server/stayApi';
import { registerStayHostApi } from './src/server/stayHostApi';
import { registerStayAdminApi } from './src/server/stayAdminApi';
import { registerDevDemoSessionApi } from './src/server/devDemoSessionApi';
import { registerStaySearchApi } from './src/server/staySearchApi';
import { registerLocationSearchApi } from './src/server/locationSearchApi';
import { registerStayPayments } from './src/server/stayPayments';
import { ProviderListingRepository, type CinemaScreenRecord } from './src/server/providerListingRepository';
import { LiveEditValidationError, validateCinemaScreenUpdate } from './src/server/liveEditValidation';
import { registerProviderListingsApi } from './src/server/providerListingsApi';
import { ServiceBookingRepository } from './src/server/serviceBookingRepository';
import { registerServiceBookingApi } from './src/server/serviceBookingApi';
import { registerServiceCommerceApi } from './src/server/serviceCommerceApi';
import { registerProviderOperationsApi } from './src/server/providerOperationsApi';
import { registerServiceDispatchApi } from './src/server/serviceDispatchApi';
import { ClassEnrollmentRepository } from './src/server/classEnrollmentRepository';
import { registerClassEnrollmentApi } from './src/server/classEnrollmentApi';
import { InstituteWorkspaceRepository } from './src/server/instituteWorkspaceRepository';
import { registerInstituteWorkspaceApi } from './src/server/instituteWorkspaceApi';
import { PgBookingRepository } from './src/server/pgBookingRepository';
import { registerPgBookingsApi } from './src/server/pgBookingsApi';
import { PgPaymentRepository } from './src/server/pgPaymentRepository';
import { registerPgPaymentsApi } from './src/server/pgPaymentsApi';
import { registerPgAdminApi } from './src/server/pgAdminApi';
import { PlatformBuilderRepository, registerPlatformBuilderApi } from './src/server/platformBuilderRepository';

import { VenueBookingRepository } from './src/server/venueBookingRepository';
import { registerVenueBookingsApi } from './src/server/venueBookingsApi';
import { registerMediaValidationApi } from './src/server/mediaValidationApi';
import { registerAccountClosureApi } from './src/server/accountClosureApi';
import { registerResendDevelopmentTestApi } from './src/server/resendEmail';
import { registerEvolutionDevelopmentTestApi } from './src/server/evolutionWhatsApp';
import { sendBookingNotificationEmails } from './src/server/bookingNotificationEmails';
import { buildWhatsAppFaqReply } from './src/server/whatsappFaq';
import { sendPgQaSampleEmails } from './src/server/pgQaEmailSamples';
import { createNativeAppCorsMiddleware } from './src/server/nativeAppCors';
import { createDistributedApiRateLimitMiddleware } from './src/server/distributedApiRateLimit';
import { apiNoStoreByDefault } from './src/server/apiCachePrivacy';
import { logSafeError } from './src/server/safeLogging';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load the same local env file Vite uses. Existing process variables remain
// authoritative; .env.local is considered before the base .env file.
dotenv.config({
  path: [path.join(__dirname, '.env.local'), path.join(__dirname, '.env')],
  quiet: true,
});

const DATA_FILE_PATH = path.join(__dirname, 'live-page-config.json');

/**
 * Production never reads or writes the legacy JSON compatibility stores.
 * Every route that still depends on one fails closed with a 503 instead of
 * silently serving non-durable, non-transactional state.
 */
const IS_PRODUCTION_RUNTIME = process.env.NODE_ENV === 'production';
const REVOKED_SESSION_SIGNATURES = new Set<string>();

function assertJsonStoreAllowed(storeName: 'live_page_config' | 'marketplace'): void {
  if (IS_PRODUCTION_RUNTIME) {
    throw new Error(`PERSISTENCE_JSON_STORE_UNAVAILABLE_IN_PRODUCTION:${storeName}`);
  }
}

interface ServerStoreData {
  published: Record<string, any> | null;
  draft: Record<string, any> | null;
  versions: Array<{
    versionId: string;
    versionNumber: number;
    publishedAt: string;
    publishedBy: string;
    summary: string;
    platforms: string[];
    configSnapshot: Record<string, any>;
  }>;
  auditLogs: Array<{
    id: string;
    timestamp: string;
    actor: string;
    role: string;
    action: string;
    pageId: string;
    details: string;
    versionId?: string;
  }>;
  billingRecords: Array<{
    id: string;
    cycleId: string;
    invoiceNumber: string;
    providerId: string;
    providerName: string;
    providerEmail: string;
    moduleName: string;
    billingType: 'platform_commission' | 'provider_subscription';
    planOrCommissionLabel: string;
    baseAmount: number;
    gstAmount: number;
    totalAmount: number;
    emailStatus: 'sent' | 'delivered' | 'opened' | 'queued';
    paymentStatus: 'paid' | 'invoice_sent' | 'auto_scheduled' | 'overdue';
    billingPeriod: string;
    generatedAt: string;
    lastEmailSentAt: string;
  }>;
}

const DEFAULT_BILLING_RECORDS: ServerStoreData['billingRecords'] = [
  {
    id: 'BILL-2026-101',
    cycleId: 'CYC-2026-10',
    invoiceNumber: 'INV-BOS-CYC-8801',
    providerId: 'prov-pg-1',
    providerName: 'Sri Sai Executive Co-Living PG',
    providerEmail: 'billing@srisaipg.in',
    moduleName: 'PGs & Hostels',
    billingType: 'platform_commission',
    planOrCommissionLabel: '10% Platform Commission (14 Confirmed Bookings)',
    baseAmount: 11800,
    gstAmount: 2124,
    totalAmount: 13924,
    emailStatus: 'opened',
    paymentStatus: 'paid',
    billingPeriod: 'Oct 2026 Cycle',
    generatedAt: '2026-10-28 09:00:00',
    lastEmailSentAt: '2026-10-28 09:00:12',
  },
  {
    id: 'BILL-2026-102',
    cycleId: 'CYC-2026-10',
    invoiceNumber: 'INV-BOS-CYC-8802',
    providerId: 'prov-class-1',
    providerName: 'Apex AI & Full-Stack Coaching Hub',
    providerEmail: 'accounts@apexacademy.in',
    moduleName: 'Classes & Coaching',
    billingType: 'provider_subscription',
    planOrCommissionLabel: 'BOS Enterprise Partner Subscription (Monthly)',
    baseAmount: 2499,
    gstAmount: 450,
    totalAmount: 2949,
    emailStatus: 'delivered',
    paymentStatus: 'paid',
    billingPeriod: 'Oct 2026 Cycle',
    generatedAt: '2026-10-28 09:00:00',
    lastEmailSentAt: '2026-10-28 09:00:18',
  },
  {
    id: 'BILL-2026-103',
    cycleId: 'CYC-2026-10',
    invoiceNumber: 'INV-BOS-CYC-8803',
    providerId: 'prov-venue-1',
    providerName: 'Royal Nizam Grand Convention & Banquet',
    providerEmail: 'finance@royalnizamhalls.com',
    moduleName: 'Function Halls & Venues',
    billingType: 'platform_commission',
    planOrCommissionLabel: '10% Platform Commission (4 Wedding Venue Bookings)',
    baseAmount: 28500,
    gstAmount: 5130,
    totalAmount: 33630,
    emailStatus: 'sent',
    paymentStatus: 'invoice_sent',
    billingPeriod: 'Oct 2026 Cycle',
    generatedAt: '2026-10-29 18:30:00',
    lastEmailSentAt: '2026-10-29 18:30:08',
  },
  {
    id: 'BILL-2026-104',
    cycleId: 'CYC-2026-10',
    invoiceNumber: 'INV-BOS-CYC-8804',
    providerId: 'prov-hotel-1',
    providerName: 'Deccan Crown Business Suites & Stay',
    providerEmail: 'accounts@deccancrown.in',
    moduleName: 'Hotels & Stay',
    billingType: 'platform_commission',
    planOrCommissionLabel: '10% Platform Commission (19 Hourly & Night Stays)',
    baseAmount: 9400,
    gstAmount: 1692,
    totalAmount: 11092,
    emailStatus: 'delivered',
    paymentStatus: 'invoice_sent',
    billingPeriod: 'Oct 2026 Cycle',
    generatedAt: '2026-10-29 18:30:00',
    lastEmailSentAt: '2026-10-29 18:30:15',
  },
  {
    id: 'BILL-2026-105',
    cycleId: 'CYC-2026-10',
    invoiceNumber: 'INV-BOS-CYC-8805',
    providerId: 'prov-service-1',
    providerName: 'Hyderabad Rapid Home Care & AC Services',
    providerEmail: 'support@hydrapidcare.in',
    moduleName: 'Home & Local Services',
    billingType: 'provider_subscription',
    planOrCommissionLabel: 'BOS Pro Verified Partner Plan (Monthly)',
    baseAmount: 999,
    gstAmount: 180,
    totalAmount: 1179,
    emailStatus: 'sent',
    paymentStatus: 'overdue',
    billingPeriod: 'Oct 2026 Cycle',
    generatedAt: '2026-10-25 10:00:00',
    lastEmailSentAt: '2026-10-29 11:15:00',
  },
  {
    id: 'BILL-2026-106',
    cycleId: 'CYC-2026-10',
    invoiceNumber: 'INV-BOS-CYC-8806',
    providerId: 'prov-movie-1',
    providerName: 'Asian Multiplex & IMAX Screens',
    providerEmail: 'settlements@asianmultiplex.in',
    moduleName: 'Movies & Multiplex',
    billingType: 'platform_commission',
    planOrCommissionLabel: '10% Platform Convenience Commission (312 Tickets)',
    baseAmount: 6840,
    gstAmount: 1231,
    totalAmount: 8071,
    emailStatus: 'queued',
    paymentStatus: 'auto_scheduled',
    billingPeriod: 'Oct 2026 Cycle',
    generatedAt: '2026-10-30 08:00:00',
    lastEmailSentAt: 'Scheduled EOD',
  },
];

function loadServerStore(): ServerStoreData {
  assertJsonStoreAllowed('live_page_config');
  try {
    if (fs.existsSync(DATA_FILE_PATH)) {
      const raw = fs.readFileSync(DATA_FILE_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      return {
        published: parsed.published || null,
        draft: parsed.draft || null,
        versions: Array.isArray(parsed.versions) ? parsed.versions : [],
        auditLogs: Array.isArray(parsed.auditLogs) ? parsed.auditLogs : [],
        billingRecords: Array.isArray(parsed.billingRecords)
          ? parsed.billingRecords
          : DEFAULT_BILLING_RECORDS,
      };
    }
  } catch (err) {
    logSafeError('server', 'load live page configuration', err);
  }
  return {
    published: null,
    draft: null,
    versions: [],
    auditLogs: [],
    billingRecords: DEFAULT_BILLING_RECORDS,
  };
}

function saveServerStore(data: ServerStoreData): boolean {
  assertJsonStoreAllowed('live_page_config');
  const temporaryPath = `${DATA_FILE_PATH}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, JSON.stringify(data, null, 2), { encoding: 'utf-8', flag: 'wx' });
    fs.renameSync(temporaryPath, DATA_FILE_PATH);
    return true;
  } catch {
    try { fs.rmSync(temporaryPath, { force: true }); } catch { /* Preserve the prior store on failed writes. */ }
    return false;
  }
}

async function startServer() {
  // Google AI Studio previews do not provide the production PostgreSQL pool.
  // In that preview only, allow the UI/server to boot as a read-only frontend preview;
  // Cloud Run production still fails closed and readiness reports 503.
  // Never allow this preview fallback on Cloud Run (K_SERVICE is set there).
  const aiStudioPreview = !process.env.K_SERVICE && (
    process.env.BOS_AI_STUDIO_PREVIEW === '1'
    || process.cwd().startsWith('/app/applet')
    || process.env.AI_STUDIO === 'true'
  );

  // Prevent production from silently using the local JSON compatibility
  // stores. A verified transactional PostgreSQL adapter is still required.
  if (!aiStudioPreview) {
    assertProductionPersistenceReady();
  }

  let hasConfiguredPostgresTarget = Boolean(
    String(process.env.BOS_LISTINGS_DATABASE_URL || process.env.BOS_PG_URL || '').trim(),
  );
  let pgRuntimePool: Awaited<ReturnType<typeof initializePostgresRuntime>> | undefined;
  if (process.env.NODE_ENV === 'production' || hasConfiguredPostgresTarget) {
    try {
      if (aiStudioPreview && hasConfiguredPostgresTarget) {
        assertPostgresConnectionTarget(
          String(process.env.BOS_LISTINGS_DATABASE_URL || '').trim(),
          process.env,
        );
      }
      if (!aiStudioPreview || hasConfiguredPostgresTarget) {
        pgRuntimePool = await initializePostgresRuntime();
      }
    } catch (error) {
      if (!aiStudioPreview) throw error;
      const safeReason = error instanceof Error
        ? String(error.message || 'DATABASE_UNAVAILABLE').split(':')[0].replace(/[^A-Z0-9_]/g, '').slice(0, 64)
        : 'DATABASE_UNAVAILABLE';
      console.warn(`[ai-studio] PostgreSQL is unavailable (${safeReason || 'UNKNOWN'}); starting a frontend-only preview without server persistence.`);
      // The configured target is preserved deliberately. Clearing it would
      // silently discard operator configuration and hide a real outage; the
      // preview simply runs without a pool, and every database-backed route
      // reports the failure instead of falling back to demo inventory.
      pgRuntimePool = undefined;
    }
  }

  const configuredHmacSecret = (process.env.BOS_SERVER_HMAC_SECRET || '').trim();
  if (process.env.NODE_ENV === 'production' && !aiStudioPreview && !configuredHmacSecret) {
    throw new Error('BOS_SERVER_HMAC_SECRET_REQUIRED');
  }
  const SERVER_HMAC_SECRET = configuredHmacSecret || crypto.randomBytes(32).toString('hex');
  if (!configuredHmacSecret) {
    console.warn('BOS_SERVER_HMAC_SECRET is unset; using an ephemeral development-only signing key.');
  }

  // Listing persistence can use a disposable local PostgreSQL repository in
  // development/test. An explicitly configured but unavailable DB fails
  // startup; it never falls back to the JSON compatibility store.
  const providerListingRepository = ProviderListingRepository.fromEnvironment();
  // Classes & Training enrollment shares the single local PostgreSQL selector.
  const classEnrollmentRepository = ClassEnrollmentRepository.fromEnvironment();
  const instituteWorkspaceRepository = InstituteWorkspaceRepository.fromEnvironment();
  if (providerListingRepository) {
    try {
      await providerListingRepository.verifyConnection();
    } catch {
      await providerListingRepository.close();
      throw new Error('BOS_LISTINGS_DATABASE_UNAVAILABLE');
    }
  }
  if (instituteWorkspaceRepository) {
    try {
      await instituteWorkspaceRepository.verifyConnection();
    } catch {
      throw new Error('INSTITUTE_WORKSPACE_POSTGRES_UNAVAILABLE');
    }
  }

  // The Services booking lifecycle shares the same canonical local database.
  // An explicitly configured but unavailable database fails startup rather
  // than silently falling back to file state.
  const serviceBookingRepository = ServiceBookingRepository.fromEnvironment();
  if (serviceBookingRepository) {
    try {
      await serviceBookingRepository.verifyConnection();
    } catch {
      await serviceBookingRepository.close();
      throw new Error('SERVICE_BOOKINGS_DATABASE_UNAVAILABLE');
    }
  }

  // PG reservations use shared PostgreSQL inventory and remain pay-later.
  // This repository never starts or verifies a payment provider transaction.
  const pgBookingRepository = PgBookingRepository.fromEnvironment();
  if (pgBookingRepository) {
    try {
      await pgBookingRepository.verifyConnection();
    } catch {
      await pgBookingRepository.close();
      throw new Error('PG_BOOKINGS_POSTGRES_UNAVAILABLE');
    }
  }

  // PG money movement uses the central pool while retaining its own narrow
  // repository methods and provider-signed settlement paths.
  const pgPaymentRepository = PgPaymentRepository.fromEnvironment();
  if (pgPaymentRepository) {
    try {
      await pgPaymentRepository.verifyConnection();
    } catch {
      await pgPaymentRepository.close();
      throw new Error('PG_PAYMENTS_DATABASE_UNAVAILABLE');
    }
  }

  // Universal Live Builder configuration is PostgreSQL-authoritative. It is
  // optional outside production so read-only routes still work without a DB,
  // but every builder route fails closed with 503 when it is not attached.
  const platformBuilderRepository = PlatformBuilderRepository.fromEnvironment();
  const platformSettingsRepository = PlatformSettingsRepository.fromEnvironment();
  if (platformBuilderRepository) {
    try {
      await platformBuilderRepository.verifyConnection();
    } catch {
      throw new Error('PLATFORM_BUILDER_DATABASE_UNAVAILABLE');
    }
  }

  const venueBookingRepository = VenueBookingRepository.fromEnvironment();
  if (venueBookingRepository) {
    try {
      await venueBookingRepository.verifyConnection();
    } catch {
      await venueBookingRepository.close();
      throw new Error('VENUE_BOOKINGS_POSTGRES_UNAVAILABLE');
    }
  }

  // Production has no JSON fallback for any marketplace domain, so every
  // domain repository must be attached before the listener opens.
  if (process.env.NODE_ENV === 'production' && (!aiStudioPreview || Boolean(pgRuntimePool))) {
    const missingRepositories = [
      ['stay_search', pgRuntimePool],
      ['listings', providerListingRepository],
      ['classes', classEnrollmentRepository],
      ['institute_workspace', instituteWorkspaceRepository],
      ['services', serviceBookingRepository],
      ['pg_bookings', pgBookingRepository],
      ['payments', pgPaymentRepository],
      ['venues', venueBookingRepository],
    ].filter(([, repository]) => !repository).map(([name]) => name);
    if (missingRepositories.length > 0) {
      throw new Error(`PRODUCTION_POSTGRES_REPOSITORY_REQUIRED:${missingRepositories.join(',')}`);
    }
  }

  const app = express();
  app.disable('x-powered-by');
  app.use(apiNoStoreByDefault);
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
    res.setHeader('Content-Security-Policy', "frame-ancestors 'self'");
    res.setHeader('X-DNS-Prefetch-Control', 'off');
    if (process.env.NODE_ENV === 'production') {
      const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() || req.protocol;
      if (req.secure || proto === 'https') {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      }
    }
    next();
  });
  const PORT = Number(process.env.PORT) || 3000;
  // Vite middleware mode does not own the HTTP server. Providing this parent
  // server to Vite lets its dev WebSocket share the application port instead
  // of advertising an unreachable standalone HMR port to browser clients.
  const httpServer = createServer(app);

  // Express 4 does not catch a rejected promise from an async route handler.
  // Without this, one failing request would terminate the whole booking
  // server as an unhandled rejection. Every handler is wrapped so that a
  // failure becomes a normal error response on the request that caused it.
  const wrapAsyncHandler = (handler: any) => {
    // A four-argument function is an Express error handler and must keep its
    // original shape; everything else may reject.
    if (typeof handler !== 'function' || handler.length === 4) return handler;
    return function wrappedAsyncHandler(this: any, ...handlerArgs: any[]) {
      let result: any;
      try {
        result = handler.apply(this, handlerArgs);
      } catch (error) {
        return handlerArgs[2]?.(error);
      }
      if (result && typeof result.then === 'function') {
        result.catch((error: unknown) => handlerArgs[2]?.(error));
      }
      return result;
    };
  };
  for (const method of ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'all', 'use'] as const) {
    const original = (app as any)[method].bind(app);
    (app as any)[method] = (...routeArgs: any[]) => {
      const wrapped = routeArgs.map((argument) => {
        if (typeof argument === 'function') return wrapAsyncHandler(argument);
        if (Array.isArray(argument)) return argument.map((entry) => (typeof entry === 'function' ? wrapAsyncHandler(entry) : entry));
        return argument;
      });
      return original(...wrapped);
    };
  }
  // Liveness is process-only: a transient PostgreSQL outage must not make Cloud
  // Run restart an otherwise healthy container. Canonical path: GET /health/live.
  app.get(['/health/live', '/api/live', '/api/health/live', '/live'], (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ ok: true, service: 'bookourspace-api', probe: 'liveness' });
  });

  // Database readiness. Canonical path: GET /api/health. Cloud Run readiness
  // probe uses this so production traffic is not routed while PostgreSQL is down.
  app.get(['/api/health', '/api/ready', '/health'], async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!pgRuntimePool) {
      res.status(503).json({ ok: false, error: 'DATABASE_UNAVAILABLE' });
      return;
    }
    try {
      await pgRuntimePool.query('select 1 as healthy');
      res.status(200).json({ ok: true, service: 'bookourspace-api' });
    } catch {
      res.status(503).json({ ok: false, error: 'DATABASE_UNAVAILABLE' });
    }
  });

  // Native Capacitor origins used by this app unless the server operator supplies
  // an exact comma-separated BOS_NATIVE_APP_ORIGINS allowlist.
  app.use(createNativeAppCorsMiddleware());
  app.use(createDistributedApiRateLimitMiddleware({
    pool: pgRuntimePool || null,
    hmacSecret: SERVER_HMAC_SECRET,
    enabled: process.env.NODE_ENV === 'test'
      ? process.env.BOS_TEST_RATE_LIMIT === '1'
      : process.env.NODE_ENV === 'production' || Boolean(pgRuntimePool),
  }));
  app.use(express.json({ limit: '10mb', verify: (req, _res, buffer) => { (req as any).rawBody = Buffer.from(buffer); } }));

  // A database-free process is a frontend preview by default. The legacy JSON
  // compatibility routes remain available only to the test harness or to an
  // explicitly opted-in local development process. NODE_ENV=staging can never
  // enable this mode, so a missing database cannot become a staging fallback.
  const localJsonCompatibilityEnabled =
    process.env.NODE_ENV === 'test' ||
    (process.env.NODE_ENV === 'development' && process.env.BOS_ENABLE_LOCAL_JSON_COMPATIBILITY === '1');
  const databaseFreeFrontendPreview = !hasConfiguredPostgresTarget && !localJsonCompatibilityEnabled;
  const isAllowedDatabaseFreePreviewRoute = (req: express.Request): boolean => {
    const path = req.path;
    if (req.method === 'GET' || req.method === 'HEAD') {
      return (
        /^\/api\/(health|ready|live)$/.test(path) ||
        path === '/api/auth/google/url' ||
        path === '/api/live-page-config' ||
        /^\/api\/modules$/.test(path) ||
        /^\/api\/marketplace\/(listings|categories)(?:\/[^/]+)?$/.test(path) ||
        /^\/api\/locations\//.test(path) ||
        (path === '/api/movies/inventory' && process.env.VITE_ENABLE_DEMO_DATA === 'true')
      );
    }
    return (
      path === '/api/ai/quick-book' ||
      path === '/api/auth/logout' ||
      /^\/api\/locations\/(nearest|external\/autocomplete|external\/resolve)$/.test(path)
    );
  };
  app.use((req, res, next) => {
    if (!databaseFreeFrontendPreview || !req.path.startsWith('/api/') || isAllowedDatabaseFreePreviewRoute(req)) {
      next();
      return;
    }
    res.status(503).json({
      ok: false,
      error: 'DATABASE_REQUIRED_FOR_SERVER_ROUTE',
      message: 'This preview serves the frontend only. Configure the development PostgreSQL target for server-backed routes.',
    });
  });
  registerResendDevelopmentTestApi(app, {
    env: process.env,
    isAdmin: (request) => {
      const claims = verifySessionTokenFromRequest(request);
      return Boolean(claims && hasCurrentAdminSession(claims));
    },
  });

  registerEvolutionDevelopmentTestApi(app, {
    env: process.env,
    isAdmin: (request) => {
      const claims = verifySessionTokenFromRequest(request);
      return Boolean(claims && hasCurrentAdminSession(claims));
    },
  });

  // Sends a complete, fixed-recipient PG QA sample pack in development only.
  // Every sample is marked developmentOnlyTest and remains subject to the
  // Resend API key/domain checks; production and inbound receiving are never
  // enabled by this route.
  if (process.env.NODE_ENV === 'development') {
    app.post('/api/dev/resend/pg-samples', async (req, res) => {
      const claims = verifySessionTokenFromRequest(req);
      if (!claims || !hasCurrentAdminSession(claims)) {
        res.status(401).json({ ok: false, error: 'UNAUTHORIZED_SESSION' });
        return;
      }
      const recipient = String(process.env.RESEND_DEV_TEST_RECIPIENT || '').trim().toLowerCase();
      if (req.body?.confirmSend !== true || !recipient || String(req.body?.to || '').trim().toLowerCase() !== recipient) {
        res.status(400).json({ ok: false, error: 'RESEND_EXPLICIT_TEST_AUTHORIZATION_REQUIRED', requirement: 'POST the configured test recipient with confirmSend=true.' });
        return;
      }
      const results = await sendPgQaSampleEmails({
        recipient,
        bookingId: 'pg-qa-sample-20261111',
        guestName: 'BookOurSpace QA',
        propertyName: 'Sri Sai Executive PG — QA Sample',
        roomType: 'Single occupancy room',
        checkIn: '2026-12-10',
        checkOut: '2026-12-11',
        amountPaise: 125000,
      }, { env: process.env });
      const failed = results.filter((result) => !result.ok);
      if (failed.length > 0) {
        res.status(503).json({ ok: false, sent: results.filter((result) => result.ok).length, failed: failed.map((result) => ({ error: result.error, blockedReasons: result.blockedReasons })) });
        return;
      }
      res.json({ ok: true, sent: results.length, ids: results.map((result) => result.ok ? result.id : null), recipient, samples: ['confirmation', 'cancellation', 'invoice_offer', 'alert'] });
    });
  }
  // 0. PostgreSQL-backed live page configuration and admin module settings.
  //    Exactly one route owner is registered per process: PostgreSQL when
  //    configured, otherwise the local-only JSON compatibility handlers.
  if (platformSettingsRepository) {
    registerPlatformSettingsApi(app, {
      repository: platformSettingsRepository,
      verifySession: (request) => verifySessionTokenFromRequest(request),
    });
  }

  // 1. GET Live Page Config (OTA endpoint consumed by Web, Android, and iOS clients)
  if (!platformSettingsRepository) app.get('/api/live-page-config', (req, res) => {
    const store = loadServerStore();
    const claims = verifySessionTokenFromRequest(req);
    const isAdmin = Boolean(claims && hasCurrentAdminSession(claims));
    const latestVersion = store.versions[0] || null;
    res.json({
      ok: true,
      published: store.published,
      ...(isAdmin ? { draft: store.draft, versions: store.versions, auditLogs: store.auditLogs } : {}),
      otaSync: {
        web: 'synced',
        android: 'synced',
        ios: 'synced',
        activeVersion: isAdmin && latestVersion ? latestVersion.versionId : String(store.published?.versionId || 'v1.0.0'),
        lastPublishedAt: isAdmin && latestVersion ? latestVersion.publishedAt : String(store.published?.lastPublishedAt || 'Default Baseline'),
      },
    });
  });

  // 2. POST Save Draft (Authorized Admin only)
  if (!platformSettingsRepository) app.post('/api/live-page-config/draft', (req, res) => {
    const claims = verifySessionTokenFromRequest(req);
    if (!claims || !hasCurrentAdminSession(claims)) {
      res.status(claims ? 403 : 401).json({ ok: false, error: claims ? 'FORBIDDEN_ADMIN_ONLY' : 'UNAUTHORIZED_SESSION' });
      return;
    }

    const { config, pageId = 'global', summary = 'Saved draft changes' } = req.body || {};
    if (!config) {
      res.status(400).json({ ok: false, error: 'Missing config payload' });
      return;
    }

    const store = loadServerStore();
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    store.draft = config;

    const auditEntry = {
      id: `AUD-PAGE-${Date.now().toString().slice(-5)}`,
      timestamp: now,
      actor: claims.name || claims.userId,
      role: 'admin',
      action: 'Saved Page Draft',
      pageId,
      details: summary,
    };
    store.auditLogs = [auditEntry, ...store.auditLogs].slice(0, 200);
    if (!saveServerStore(store)) {
      res.status(500).json({ ok: false, error: 'CONFIG_PERSIST_FAILED' });
      return;
    }

    res.json({
      ok: true,
      draft: store.draft,
      auditLogs: store.auditLogs,
      savedAt: now,
    });
  });

  // 3. POST Publish Live Config across Web, Android, and iOS (Authorized Admin only)
  if (!platformSettingsRepository) app.post('/api/live-page-config/publish', (req, res) => {
    const claims = verifySessionTokenFromRequest(req);
    if (!claims || !hasCurrentAdminSession(claims)) {
      res.status(claims ? 403 : 401).json({ ok: false, error: claims ? 'FORBIDDEN_ADMIN_ONLY' : 'UNAUTHORIZED_SESSION' });
      return;
    }

    const {
      config,
      pageId = 'all_pages',
      summary = 'Published live page updates to Web, Android & iOS',
    } = req.body || {};

    const store = loadServerStore();
    const toPublish = config || store.draft || store.published;
    if (!toPublish) {
      res.status(400).json({ ok: false, error: 'No configuration found to publish.' });
      return;
    }

    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const nextNumber = (store.versions[0]?.versionNumber || 0) + 1;
    const versionId = `v1.${nextNumber}.0`;

    const updatedPublished = {
      ...toPublish,
      versionId,
      lastPublishedAt: now,
      publishedBy: claims.name || claims.userId,
    };

    const versionEntry = {
      versionId,
      versionNumber: nextNumber,
      publishedAt: now,
      publishedBy: claims.name || claims.userId,
      summary,
      platforms: ['Web SPA', 'Android APK/Bundle (OTA)', 'iOS IPA (OTA)'],
      configSnapshot: updatedPublished,
    };

    const auditEntry = {
      id: `AUD-PUB-${Date.now().toString().slice(-5)}`,
      timestamp: now,
      actor: claims.name || claims.userId,
      role: 'admin',
      action: `Published ${versionId} (OTA)`,
      pageId,
      details: `${summary} — Live across Android, iOS & Web`,
      versionId,
    };

    store.published = updatedPublished;
    store.draft = updatedPublished;
    store.versions = [versionEntry, ...store.versions].slice(0, 50);
    store.auditLogs = [auditEntry, ...store.auditLogs].slice(0, 200);
    if (!saveServerStore(store)) {
      res.status(500).json({ ok: false, error: 'CONFIG_PERSIST_FAILED' });
      return;
    }

    res.json({
      ok: true,
      published: store.published,
      draft: store.draft,
      versions: store.versions,
      auditLogs: store.auditLogs,
      versionId,
      publishedAt: now,
    });
  });

  // 4. POST Rollback to a Previous Version (Authorized Admin only)
  if (!platformSettingsRepository) app.post('/api/live-page-config/rollback', (req, res) => {
    const claims = verifySessionTokenFromRequest(req);
    if (!claims || !hasCurrentAdminSession(claims)) {
      res.status(claims ? 403 : 401).json({ ok: false, error: claims ? 'FORBIDDEN_ADMIN_ONLY' : 'UNAUTHORIZED_SESSION' });
      return;
    }

    const { versionId } = req.body || {};
    const store = loadServerStore();
    const targetVersion = store.versions.find((v) => v.versionId === versionId);
    if (!targetVersion) {
      res.status(404).json({ ok: false, error: `Version ${versionId} not found.` });
      return;
    }

    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const restored = {
      ...targetVersion.configSnapshot,
      versionId: `${targetVersion.versionId}-rollback`,
      lastPublishedAt: now,
      publishedBy: claims.name || claims.userId,
    };

    const auditEntry = {
      id: `AUD-RBK-${Date.now().toString().slice(-5)}`,
      timestamp: now,
      actor: claims.name || claims.userId,
      role: 'admin',
      action: `Rolled Back to ${versionId}`,
      pageId: 'all_pages',
      details: `Restored snapshot "${targetVersion.summary}" (${versionId}) across Web, Android & iOS`,
      versionId,
    };

    store.published = restored;
    store.draft = restored;
    store.auditLogs = [auditEntry, ...store.auditLogs].slice(0, 200);
    if (!saveServerStore(store)) {
      res.status(500).json({ ok: false, error: 'CONFIG_PERSIST_FAILED' });
      return;
    }

    res.json({
      ok: true,
      published: store.published,
      draft: store.draft,
      versions: store.versions,
      auditLogs: store.auditLogs,
    });
  });

  // 5. GET & POST Automated Billing Engine Endpoints
  app.get('/api/billing/records', (_req, res) => {
    const store = loadServerStore();
    res.json({
      ok: true,
      records: store.billingRecords,
    });
  });

  app.post('/api/billing/run-cycle', (req, res) => {
    const {
      cycleName = 'End-of-Cycle Automated Run',
      commissionPercent = 10,
      gstPercent = 18,
      newRecords = [],
    } = req.body || {};

    const store = loadServerStore();
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

    // Update any auto_scheduled records to invoice_sent & email sent, plus prepend any newly generated cycle invoices
    const updatedExisting = store.billingRecords.map((rec) =>
      rec.paymentStatus === 'auto_scheduled'
        ? {
            ...rec,
            paymentStatus: 'invoice_sent' as const,
            emailStatus: 'sent' as const,
            lastEmailSentAt: now,
          }
        : rec
    );

    const combined = [...newRecords, ...updatedExisting];
    store.billingRecords = combined.slice(0, 100);

    const auditEntry = {
      id: `AUD-BILL-${Date.now().toString().slice(-5)}`,
      timestamp: now,
      actor: 'Automated Billing Engine',
      role: 'admin',
      action: 'Executed Billing Cycle & Dispatched Invoices',
      pageId: 'payment_management',
      details: `${cycleName}: Generated GST invoices (${commissionPercent}% commission, ${gstPercent}% GST) & sent provider emails.`,
    };
    store.auditLogs = [auditEntry, ...store.auditLogs].slice(0, 200);
    saveServerStore(store);

    res.json({
      ok: true,
      records: store.billingRecords,
      auditLogs: store.auditLogs,
      executedAt: now,
    });
  });

  // 6. POST AI Quick Book Concierge Endpoint (Server-Side @google/genai with gemini-3.8-flash)
  app.post('/api/ai/quick-book', async (req, res) => {
    const {
      userMessage = '',
      chatHistory = [],
      activeFilters = {},
      candidateListings = [],
      language = 'en',
    } = req.body || {};

    interface CandidateSummary {
      id: string;
      title: string;
      categoryId: string;
      subcategory: string;
      sectionType: string;
      city: string;
      area: string;
      price: number;
      priceUnit: string;
      rating: number;
      reviewCount: number;
      verified: boolean;
      featured: boolean;
      supportsHourly: boolean;
      tags: string[];
      highlights: string[];
    }

    const candidates: CandidateSummary[] = Array.isArray(candidateListings)
      ? candidateListings.slice(0, 18).map((c: any) => ({
          id: String(c.id || ''),
          title: String(c.title || ''),
          categoryId: String(c.categoryId || ''),
          subcategory: String(c.subcategory || ''),
          sectionType: String(c.sectionType || activeFilters.activeMarketSection || ''),
          city: String(c.city || 'Hyderabad'),
          area: String(c.area || ''),
          price: Number(c.price) || 0,
          priceUnit: String(c.priceUnit || 'per_visit'),
          rating: Number(c.rating) || 4.7,
          reviewCount: Number(c.reviewCount) || 25,
          verified: Boolean(c.verified),
          featured: Boolean(c.featured),
          supportsHourly: Boolean(c.supportsHourly),
          tags: Array.isArray(c.tags) ? c.tags.slice(0, 6) : [],
          highlights: Array.isArray(c.highlights) ? c.highlights.slice(0, 5) : [],
        }))
      : [];

    // Deterministic intelligent ranker (used as baseline and fallback if API key is missing)
    const buildSmartRankedResponse = (reasonNote?: string) => {
      const q = String(userMessage || '').toLowerCase();
      const wantsAutoBook =
        q.includes('book now') ||
        q.includes('quick book') ||
        q.includes('instant book') ||
        q.includes('confirm') ||
        q.includes('immediately') ||
        q.includes('బుక్ చేయండి');

      const wantsHourly =
        Boolean(activeFilters.hourlyBookingOnly) ||
        q.includes('hour') ||
        q.includes('3h') ||
        q.includes('6h') ||
        q.includes('hourly');

      // Extract budget if mentioned (e.g., "under 15000", "below 1000")
      const budgetMatch = q.match(/(?:under|below|max|within|budget|₹|rs\.?)\s*(\d[\d,]*)/i);
      const maxBudget = budgetMatch ? Number(budgetMatch[1].replace(/,/g, '')) : null;

      // Extract guest count if mentioned (e.g., "500 guests", "200 people", "300 pax")
      const guestMatch = q.match(/(\d+)\s*(?:guests|people|pax|members|seats|persons)/i);
      const guestCount = guestMatch ? `${guestMatch[1]} Guests` : '';

      const scored = candidates.map((item) => {
        let score = 78;
        const reasons: string[] = [];

        if (item.verified) {
          score += 5;
          reasons.push('BOS Verified Provider');
        }
        if (item.featured) {
          score += 4;
        }
        if (item.rating >= 4.7) {
          score += 6;
          reasons.push(`Top rated (${item.rating}★ from ${item.reviewCount} reviews)`);
        }

        const searchable = `${item.title} ${item.subcategory} ${item.area} ${item.city} ${item.tags.join(' ')} ${item.highlights.join(' ')}`.toLowerCase();
        const words = q
          .split(/[^a-z0-9\u0C00-\u0C7F]+/i)
          .filter((w) => w.length >= 3 && !['the', 'and', 'for', 'with', 'near', 'best', 'book', 'need', 'want'].includes(w));

        let keywordHits = 0;
        for (const w of words) {
          if (searchable.includes(w)) {
            keywordHits += 1;
          }
        }
        if (keywordHits > 0) {
          score += Math.min(12, keywordHits * 4);
          reasons.push(`Direct match for your "${words.slice(0, 3).join(', ')}" preference`);
        }

        if (
          activeFilters.selectedArea &&
          activeFilters.selectedArea !== 'all' &&
          item.area.toLowerCase().includes(String(activeFilters.selectedArea).toLowerCase())
        ) {
          score += 6;
          reasons.push(`Located in your filtered area (${item.area})`);
        } else if (item.area && q.includes(item.area.toLowerCase())) {
          score += 7;
          reasons.push(`Prime location in ${item.area}`);
        }

        if (
          activeFilters.selectedSubcategory &&
          activeFilters.selectedSubcategory !== 'all' &&
          item.subcategory.toLowerCase() === String(activeFilters.selectedSubcategory).toLowerCase()
        ) {
          score += 6;
          reasons.push(`Matches your "${item.subcategory}" category filter`);
        }

        if (wantsHourly && item.supportsHourly) {
          score += 7;
          reasons.push('Supports flexible Hourly Booking');
        }

        if (maxBudget && item.price <= maxBudget) {
          score += 6;
          reasons.push(`Fits within your ₹${maxBudget.toLocaleString('en-IN')} budget`);
        }

        const clampedScore = Math.min(99, Math.max(75, score));
        if (reasons.length === 0) {
          reasons.push(
            `High-converting ${item.subcategory || 'marketplace'} option in ${item.area || item.city} matching your active filters`
          );
        }

        return {
          item,
          score: clampedScore,
          reasons,
        };
      });

      scored.sort((a, b) => b.score - a.score || b.item.rating - a.item.rating);
      const topPicks = scored.slice(0, 3);

      const sectionLabelMap: Record<string, string> = {
        venues: 'Function Halls & Event Venues',
        services: 'Home & Local Services',
        hotel_stay: 'Hotels & Hourly Stay',
        pg_hostels: 'PGs & Co-Living Hostels',
        classes: 'Classes & Coaching Institutes',
        movies: 'Movies & Multiplexes',
      };
      const secName =
        sectionLabelMap[String(activeFilters.activeMarketSection || '')] || 'Marketplace Listings';

      const topTitle = topPicks[0]?.item.title || 'our top verified listing';
      const replyText =
        language === 'te'
          ? `మీ ప్రస్తుత ఫిల్టర్‌లు (${secName}${activeFilters.selectedArea && activeFilters.selectedArea !== 'all' ? `, ${activeFilters.selectedArea}` : ''}) మరియు మీ అభిరుచుల ఆధారంగా నేను అత్యుత్తమ ఎంపికలను విశ్లేషించాను. "${topTitle}" అత్యధిక మ్యాచ్ స్కోర్ (${topPicks[0]?.score || 96}%) తో మొదటి స్థానంలో ఉంది. ఏదైనా కార్డ్‌పై "Select & Quick Book" క్లిక్ చేయగానే బుకింగ్ ఫ్లో వెంటనే ప్రారంభమవుతుంది!`
          : `Based on your active filters (${secName}${activeFilters.selectedArea && activeFilters.selectedArea !== 'all' ? ` • ${activeFilters.selectedArea}` : ''}${activeFilters.selectedSubcategory && activeFilters.selectedSubcategory !== 'all' ? ` • ${activeFilters.selectedSubcategory}` : ''}) and preferences, I analyzed ${candidates.length} available options. "${topTitle}" is your #1 match (${topPicks[0]?.score || 96}% fit). Select any recommendation below to immediately launch your pre-filled booking flow!`;

      return {
        ok: true,
        modelUsed: reasonNote ? 'bos-smart-ranker-fallback' : 'gemini-3.8-flash',
        assistantReply: replyText,
        extractedPreferences: {
          occasionOrNeed:
            activeFilters.selectedSubcategory && activeFilters.selectedSubcategory !== 'all'
              ? String(activeFilters.selectedSubcategory)
              : secName,
          preferredArea:
            activeFilters.selectedArea && activeFilters.selectedArea !== 'all'
              ? String(activeFilters.selectedArea)
              : topPicks[0]?.item.area || String(activeFilters.selectedCity || 'Hyderabad'),
          budgetSummary: maxBudget
            ? `Up to ₹${maxBudget.toLocaleString('en-IN')}`
            : activeFilters.selectedPriceRange && activeFilters.selectedPriceRange !== 'all'
            ? String(activeFilters.selectedPriceRange)
            : 'Best Value / Flexible',
          guestCountOrCapacity: guestCount || (activeFilters.activeMarketSection === 'venues' ? '250 - 500 Guests' : 'Standard'),
          preferredDate: String(activeFilters.filterStartDate || new Date().toISOString().slice(0, 10)),
          checkOutDate: String(activeFilters.filterEndDate || ''),
          suggestedStayMode: wantsHourly ? 'hourly' : 'daily',
          autoBookBestMatch: wantsAutoBook,
        },
        recommendations: topPicks.map((pick, idx) => ({
          listingId: pick.item.id,
          matchScore: pick.score,
          matchHeadline:
            idx === 0
              ? '🏆 Best Overall Match for Your Filters'
              : idx === 1
              ? '⚡ Best Value & Rated Alternative'
              : '✨ Verified Popular Option Nearby',
          whyItMatches: pick.reasons.join(' • '),
          suggestedSlotOrPackage: wantsHourly
            ? '3-Hour / 6-Hour Flexible Express Slot'
            : activeFilters.filterStartDate
            ? `Reserved for ${activeFilters.filterStartDate}${activeFilters.filterEndDate ? ` → ${activeFilters.filterEndDate}` : ''}`
            : 'Today / Priority Instant Confirmation Slot',
          estimatedPriceLabel: `₹${pick.item.price.toLocaleString('en-IN')} (${pick.item.priceUnit.replace(/_/g, ' ')})`,
          keyHighlights:
            pick.item.highlights.length > 0
              ? pick.item.highlights.slice(0, 3)
              : [
                  `${pick.item.rating}★ (${pick.item.reviewCount} reviews)`,
                  pick.item.area || pick.item.city,
                  pick.item.verified ? 'BOS Verified Partner' : 'Instant Booking Available',
                ],
        })),
      };
    };

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || candidates.length === 0) {
      res.json(buildSmartRankedResponse('no_api_key_or_empty_candidates'));
      return;
    }

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });

      const historyContext = Array.isArray(chatHistory)
        ? chatHistory
            .slice(-6)
            .map((m: any) => `${m.role === 'user' ? 'Customer' : 'Assistant'}: ${m.text}`)
            .join('\n')
        : '';

      const prompt = `
Customer Request: "${userMessage}"
Preferred UI Language: "${language === 'te' ? 'Telugu (or bilingual Telugu + English)' : 'English'}"

Active Search Filters in UI:
${JSON.stringify(activeFilters, null, 2)}

Recent Conversation History:
${historyContext || 'None'}

Available Candidate Listings (from current filtered marketplace pool):
${JSON.stringify(candidates, null, 2)}

Task:
1. Analyze the customer's natural language request combined with their Active Search Filters.
2. Select up to 3 best-matching listings from the Available Candidate Listings list above (use exact "id" values from candidateListings as "listingId").
3. Explain clearly why each listing matches their preferences, budget, location, date range, or capacity needs.
4. Set "autoBookBestMatch" to true ONLY if the user explicitly asks to book immediately / right now / auto-book the best option.
`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          systemInstruction:
            'You are the BookOurSpace AI Quick Book Concierge. You analyze customer preferences and active UI search filters to recommend the best venue, hotel stay, PG hostel, coaching class, movie, or local home service from the provided candidateListings array. Always return valid JSON matching the schema and only reference listingId values that exist in candidateListings.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              assistantReply: {
                type: Type.STRING,
                description: 'Friendly, concise concierge response summarizing why the top recommendations fit the user request and active filters.',
              },
              extractedPreferences: {
                type: Type.OBJECT,
                properties: {
                  occasionOrNeed: { type: Type.STRING },
                  preferredArea: { type: Type.STRING },
                  budgetSummary: { type: Type.STRING },
                  guestCountOrCapacity: { type: Type.STRING },
                  preferredDate: { type: Type.STRING },
                  checkOutDate: { type: Type.STRING },
                  suggestedStayMode: {
                    type: Type.STRING,
                    description: 'One of: hourly, daily, weekly, monthly',
                  },
                  autoBookBestMatch: { type: Type.BOOLEAN },
                },
                required: [
                  'occasionOrNeed',
                  'preferredArea',
                  'budgetSummary',
                  'guestCountOrCapacity',
                  'preferredDate',
                  'checkOutDate',
                  'suggestedStayMode',
                  'autoBookBestMatch',
                ],
              },
              recommendations: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    listingId: {
                      type: Type.STRING,
                      description: 'Exact id of the listing from candidateListings',
                    },
                    matchScore: {
                      type: Type.NUMBER,
                      description: 'Match percentage between 80 and 99',
                    },
                    matchHeadline: { type: Type.STRING },
                    whyItMatches: { type: Type.STRING },
                    suggestedSlotOrPackage: { type: Type.STRING },
                    estimatedPriceLabel: { type: Type.STRING },
                    keyHighlights: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                  },
                  required: [
                    'listingId',
                    'matchScore',
                    'matchHeadline',
                    'whyItMatches',
                    'suggestedSlotOrPackage',
                    'estimatedPriceLabel',
                    'keyHighlights',
                  ],
                },
              },
            },
            required: ['assistantReply', 'extractedPreferences', 'recommendations'],
          },
        },
      });

      const rawText = response.text || '';
      const parsed = JSON.parse(rawText);

      // Ensure recommended listingIds actually exist in candidates; if Gemini returned fewer or invalid IDs, enrich from fallback
      const validRecs = Array.isArray(parsed.recommendations)
        ? parsed.recommendations.filter((r: any) =>
            candidates.some((c) => c.id === r.listingId)
          )
        : [];

      if (validRecs.length === 0) {
        res.json(buildSmartRankedResponse());
        return;
      }

      res.json({
        ok: true,
        modelUsed: 'gemini-3.8-flash',
        assistantReply: parsed.assistantReply,
        extractedPreferences: parsed.extractedPreferences,
        recommendations: validRecs.slice(0, 3),
      });
    } catch (error: any) {
      logSafeError('gemini', 'quick book; using ranker fallback', error);
      res.json(buildSmartRankedResponse('fallback_on_error'));
    }
  });

  // ============================================================================
  // AUTHORITATIVE MULTI-USER TRANSACTION ENGINE
  // - Atomic Seat Holds & Bookings (prevents concurrent double-booking)
  // - Idempotency Keys (prevents duplicate bookings on retry/double-submit)
  // - Server-Side UPI Payment Verification (UTR alone != verified payment)
  // - Cryptographic HMAC-SHA256 QR Pass Signing & Verification
  // - Customer / Provider / Admin Role Isolation
  // ============================================================================

  const AUTH_STORE_FILE_PATH =
    process.env.NODE_ENV === 'test' && process.env.BOS_TEST_AUTHORITATIVE_STORE_PATH
      ? path.resolve(process.env.BOS_TEST_AUTHORITATIVE_STORE_PATH)
      : path.join(__dirname, 'authoritative-marketplace-store.json');

  // Payment settlement is intentionally unavailable until a trusted provider webhook is implemented.
  // This server-side kill switch cannot be enabled by a client request.
  const TRUSTED_PAYMENT_PROVIDER_CONFIGURED = false;

  interface SeatLockEntry {
    key: string; // `${listingId}::${dateIso}::${showtime}::${seatId}`
    listingId: string;
    dateIso: string;
    showtime: string;
    seatId: string;
    sessionId: string;
    userId: string;
    status: 'held' | 'booked';
    bookingId?: string;
    expiresAt: number; // epoch ms
    createdAt: string;
  }

  interface PaymentIntentRecord {
    intentId: string;
    ownerUserId: string;
    amount: number;
    currency: 'INR';
    purpose: 'booking' | 'subscription' | 'service';
    listingId?: string;
    merchantVpa: string;
    planOrListing: string;
    status: 'created' | 'pending_provider_reconciliation' | 'verified' | 'rejected';
    utrNumber?: string;
    gatewaySignature?: string;
    paymentVerificationToken?: string;
    settlementSource?: 'trusted_provider_webhook';
    providerPaymentId?: string;
    settledAt?: string;
    consumedByBookingId?: string;
    createdAt: string;
    updatedAt: string;
  }

  interface AuthoritativeBookingRecord {
    id: string;
    idempotencyKey: string;
    listingId: string;
    listingTitle: string;
    providerId: string;
    customerUserId: string;
    customerName: string;
    customerPhone: string;
    customerAddress: string;
    scheduledDate: string;
    checkInDate?: string;
    checkOutDate?: string;
    timeSlot: string;
    showtime?: string;
    seats?: string[];
    screenId?: string;
    screenName?: string;
    foodAddons?: string[];
    baseAmount?: number;
    taxAmount?: number;
    discountAmount?: number;
    promoCode?: string;
    totalAmount: number;
    paymentMode: 'pay_later' | 'pay_qr';
    paymentStatus: 'pay_later' | 'pending_verification' | 'verified' | 'refunded' | 'failed';
    paymentIntentId?: string;
    paymentUtr?: string;
    status: 'confirmed' | 'cancelled' | 'completed';
    passCode: string;
    qrSignature: string;
    qrPassToken: string;
    checkedInAt?: string;
    cancelledAt?: string;
    cancellationReason?: string;
    refundAmount?: number;
    refundStatus?: 'none' | 'initiated' | 'completed';
    expiresAtIso?: string;
    notes?: string;
    createdAt: string;
  }

  interface AuthoritativeEnquiryRecord {
    id: string;
    listingId: string;
    providerId: string;
    customerUserId: string;
    customerName: string;
    customerPhone: string;
    message: string;
    createdAt: string;
  }

  interface AuthoritativeUserRecord {
    id: string;
    /** Supabase Auth UUID from the server-verified Google session, when linked. */
    supabaseUserId?: string;
    name: string;
    email: string;
    phone: string;
    role: 'customer' | 'provider' | 'admin';
    providerId?: string;
    googleSub?: string;
    avatarUrl?: string;
    authProvider: 'google' | 'email_otp';
    verified: boolean;
    kycDocument: string;
    accountStatus: 'active' | 'suspended' | 'blocked' | 'pending_verification';
    city: string;
    joinedAt: string;
    lastLoginAt: string;
    listingsCount: number;
    bookingsCount: number;
    totalSpentOrEarned: number;
    gstin?: string;
    permissions: string[];
    publishState: 'draft' | 'published';
  }

  interface AuthoritativeNotificationRecord {
    id: string;
    recipientUserId?: string;
    targetRole: 'all_users' | 'customer' | 'customers' | 'provider' | 'providers' | 'admin' | 'vip_subscribers';
    title: string;
    message: string;
    time: string;
    type: 'enquiry' | 'payment' | 'approval' | 'report' | 'booking' | 'security';
    read: boolean;
    readByUserIds: string[];
    linkId?: string;
    createdAt: string;
  }

  interface AuthoritativeNotificationCampaign {
    id: string;
    title: string;
    message: string;
    segmentRole: string;
    activitySegment: string;
    channel: string;
    scheduledFor: string;
    sentAt: string;
    status: 'Dispatched' | 'Scheduled';
    reachCount: number;
  }

  interface AuthoritativeProviderListingRecord {
    id: string;
    title: string;
    categoryId: string;
    subcategory: string;
    price: number;
    providerId: string;
    ownerUserId: string;
    providerName: string;
    providerPhone: string;
    status: 'pending_approval' | 'active' | 'rejected' | 'expired';
    isFeatured?: boolean;
    isVerified?: boolean;
    updatedAt: string;
    payload?: Record<string, any>;
  }

  const INITIAL_SEED_USERS: AuthoritativeUserRecord[] = [
    {
      id: 'USR-1001',
      name: 'Ramesh Kumar (Sri Sai Executive PG)',
      email: 'ramesh.srisaipg@bookourspace.in',
      phone: '+91 98480 22338',
      role: 'provider',
      providerId: 'prov-1',
      googleSub: 'google-sub-1001',
      authProvider: 'google',
      verified: true,
      kycDocument: 'GSTIN + Aadhaar Verified',
      accountStatus: 'active',
      city: 'Hyderabad (Madhapur)',
      joinedAt: '2026-08-14',
      lastLoginAt: '2026-10-30T08:00:00.000Z',
      listingsCount: 4,
      bookingsCount: 28,
      totalSpentOrEarned: 142000,
      gstin: '36AABCS1429B1Z1',
      permissions: ['create_listing', 'respond_enquiries', 'receive_payouts'],
      publishState: 'published',
    },
    {
      id: 'USR-1002',
      name: 'Anitha Reddy (Lakshmi Grand Convention)',
      email: 'anitha.venues@bookourspace.in',
      phone: '+91 99891 44552',
      role: 'provider',
      providerId: 'prov-2',
      googleSub: 'google-sub-1002',
      authProvider: 'google',
      verified: true,
      kycDocument: 'Trade License + PAN Verified',
      accountStatus: 'active',
      city: 'Hyderabad (Gachibowli)',
      joinedAt: '2026-09-02',
      lastLoginAt: '2026-10-30T08:15:00.000Z',
      listingsCount: 2,
      bookingsCount: 15,
      totalSpentOrEarned: 485000,
      gstin: '36AADCL8821K1Z9',
      permissions: ['create_listing', 'respond_enquiries', 'receive_payouts', 'featured_boost'],
      publishState: 'published',
    },
    {
      id: 'USR-1003',
      name: 'Srinivas Rao (Apex AI & Python Coaching)',
      email: 'srinivas.classes@bookourspace.in',
      phone: '+91 97012 88990',
      role: 'provider',
      providerId: 'prov-3',
      googleSub: 'google-sub-1003',
      authProvider: 'google',
      verified: false,
      kycDocument: 'Institute Certificate Pending',
      accountStatus: 'pending_verification',
      city: 'Hyderabad (Ameerpet)',
      joinedAt: '2026-10-19',
      lastLoginAt: '2026-10-30T08:30:00.000Z',
      listingsCount: 2,
      bookingsCount: 9,
      totalSpentOrEarned: 36000,
      permissions: ['create_listing', 'respond_enquiries'],
      publishState: 'published',
    },
    {
      id: 'USR-1004',
      name: 'Ananya Sharma',
      email: 'ananya.sharma@gmail.com',
      phone: '+91 98480 12345',
      role: 'customer',
      googleSub: 'google-sub-1004',
      authProvider: 'google',
      verified: true,
      kycDocument: 'Google OAuth Verified',
      accountStatus: 'active',
      city: 'Hyderabad (Kondapur)',
      joinedAt: '2026-09-10',
      lastLoginAt: '2026-10-30T09:00:00.000Z',
      listingsCount: 0,
      bookingsCount: 5,
      totalSpentOrEarned: 18500,
      permissions: ['book_services', 'post_reviews', 'chat_provider'],
      publishState: 'published',
    },
    {
      id: 'USR-1005',
      name: 'Vikram Aditya',
      email: 'vikram.aditya@gmail.com',
      phone: '+91 90001 55667',
      role: 'customer',
      googleSub: 'google-sub-1005',
      authProvider: 'google',
      verified: true,
      kycDocument: 'Google OAuth Verified',
      accountStatus: 'active',
      city: 'Hyderabad (Kukatpally)',
      joinedAt: '2026-10-01',
      lastLoginAt: '2026-10-30T09:10:00.000Z',
      listingsCount: 0,
      bookingsCount: 3,
      totalSpentOrEarned: 9200,
      permissions: ['book_services', 'post_reviews'],
      publishState: 'published',
    },
    {
      id: 'USR-1006',
      name: 'Narendra (Platform Super Admin)',
      email: 'admin@bookourspace.in',
      phone: '+91 99999 88888',
      role: 'admin',
      googleSub: 'google-sub-1006',
      authProvider: 'google',
      verified: true,
      kycDocument: 'Root Security Key + Google OAuth',
      accountStatus: 'active',
      city: 'Hyderabad HQ',
      joinedAt: '2026-01-01',
      lastLoginAt: '2026-10-30T09:30:00.000Z',
      listingsCount: 0,
      bookingsCount: 0,
      totalSpentOrEarned: 0,
      permissions: [
        'full_admin_access',
        'approve_providers',
        'manage_payments',
        'manage_ads',
        'view_reports',
        'manage_theme',
      ],
      publishState: 'published',
    },
    {
      id: 'USR-1007',
      name: 'Sravya Monapati (Super Admin)',
      email: 'monapatisravya28@gmail.com',
      phone: '+91 98480 99999',
      role: 'admin',
      googleSub: 'google-sub-1007',
      authProvider: 'google',
      verified: true,
      kycDocument: 'Google OAuth Root Owner Verified',
      accountStatus: 'active',
      city: 'Hyderabad HQ',
      joinedAt: '2026-01-01',
      lastLoginAt: '2026-10-30T09:45:00.000Z',
      listingsCount: 0,
      bookingsCount: 0,
      totalSpentOrEarned: 0,
      permissions: [
        'full_admin_access',
        'approve_providers',
        'manage_payments',
        'manage_ads',
        'view_reports',
        'manage_theme',
      ],
      publishState: 'published',
    },
  ];

  const INITIAL_SEED_NOTIFICATIONS: AuthoritativeNotificationRecord[] = [
    {
      id: 'notif-1',
      targetRole: 'all_users',
      title: '⚡ New Enquiry Received',
      message: 'Ananya Sharma enquired for 3BHK Deep Home & Kitchen Sanitization',
      time: '10 mins ago',
      type: 'enquiry',
      read: false,
      readByUserIds: [],
      createdAt: '2026-10-30T09:00:00.000Z',
    },
    {
      id: 'notif-2',
      targetRole: 'providers',
      title: '💳 Platform Fee Paid',
      message: '₹499 credited for Pro Specialist Plan renewal',
      time: '1 hour ago',
      type: 'payment',
      read: false,
      readByUserIds: [],
      createdAt: '2026-10-30T08:30:00.000Z',
    },
    {
      id: 'notif-3',
      targetRole: 'admin',
      title: '🛡️ Listing Pending Approval',
      message: 'Dr. Srinivas Home Physiotherapy requires Admin moderation',
      time: '2 hours ago',
      type: 'approval',
      read: true,
      readByUserIds: ['USR-1006'],
      createdAt: '2026-10-30T07:30:00.000Z',
    },
  ];

  const INITIAL_SEED_CAMPAIGNS: AuthoritativeNotificationCampaign[] = [
    {
      id: 'NOTIF-901',
      title: 'Weekend Banquet & Stay Flash Offer — 15% Off',
      message:
        'Book verified Banquet Halls or Hourly Hotels this weekend and get instant GST invoice + 15% cashback.',
      segmentRole: 'Customers',
      activitySegment: 'Viewed Hotel/Venue in last 7 days',
      channel: 'Push + In-App',
      scheduledFor: 'Immediate',
      sentAt: 'Today, 09:30 AM',
      status: 'Dispatched',
      reachCount: 1420,
    },
    {
      id: 'NOTIF-902',
      title: 'Provider KYC & GSTIN Verification Reminder',
      message:
        'Update your GSTIN and Student Success stats to unlock the Verified Royal Choice badge.',
      segmentRole: 'Providers',
      activitySegment: 'Pending KYC / Active Providers',
      channel: 'Push + In-App',
      scheduledFor: 'Today, 06:00 PM',
      sentAt: 'Today, 10:15 AM',
      status: 'Scheduled',
      reachCount: 318,
    },
  ];

  interface AuthoritativeStore {
    seatLocks: Record<string, SeatLockEntry>;
    bookings: AuthoritativeBookingRecord[];
    enquiries: AuthoritativeEnquiryRecord[];
    paymentIntents: Record<string, PaymentIntentRecord>;
    usedUtrs: Record<string, { intentId: string; status: string; recordedAt: string }>;
    /** Razorpay payment ids already settled against exactly one order intent. */
    usedRazorpayPaymentIds: Record<string, string>;
    /** Provider webhook event ids, recorded once for idempotent callbacks. */
    razorpayWebhookEvents: Record<string, { eventType?: string; intentId?: string; status?: string; receivedAt?: string }>;
    checkedInPasses: Record<string, { checkedInAt: string; checkedInBy: string }>;
    passVerificationAudit: Array<{
      id: string;
      occurredAt: string;
      actorUserId: string;
      actorRole: 'provider' | 'admin';
      action: 'check_in';
      bookingId: string;
      listingId: string;
      previousState: 'confirmed';
      newState: 'checked_in';
      reason: string;
    }>;
    users: AuthoritativeUserRecord[];
    notifications: AuthoritativeNotificationRecord[];
    notificationCampaigns: AuthoritativeNotificationCampaign[];
    providerListings: Record<string, AuthoritativeProviderListingRecord>;
    adminModules: Record<string, any>;
    revokedTokens: Record<string, number>;
  }

  function loadAuthoritativeStore(): AuthoritativeStore {
    assertJsonStoreAllowed('marketplace');
    try {
      if (fs.existsSync(AUTH_STORE_FILE_PATH)) {
        const parsed = JSON.parse(fs.readFileSync(AUTH_STORE_FILE_PATH, 'utf-8'));
        return {
          seatLocks: parsed.seatLocks || {},
          bookings: Array.isArray(parsed.bookings) ? parsed.bookings : [],
          enquiries: Array.isArray(parsed.enquiries) ? parsed.enquiries : [],
          paymentIntents: parsed.paymentIntents || {},
          usedUtrs: parsed.usedUtrs || {},
          usedRazorpayPaymentIds: parsed.usedRazorpayPaymentIds || {},
          razorpayWebhookEvents: parsed.razorpayWebhookEvents || {},
          checkedInPasses: parsed.checkedInPasses || {},
          passVerificationAudit: Array.isArray(parsed.passVerificationAudit) ? parsed.passVerificationAudit : [],
          users:
            Array.isArray(parsed.users) && parsed.users.length > 0
              ? parsed.users
              : [...INITIAL_SEED_USERS],
          notifications:
            Array.isArray(parsed.notifications) && parsed.notifications.length > 0
              ? parsed.notifications
              : [...INITIAL_SEED_NOTIFICATIONS],
          notificationCampaigns:
            Array.isArray(parsed.notificationCampaigns) && parsed.notificationCampaigns.length > 0
              ? parsed.notificationCampaigns
              : [...INITIAL_SEED_CAMPAIGNS],
          providerListings: parsed.providerListings || {},
          adminModules: parsed.adminModules || {},
          revokedTokens: parsed.revokedTokens || {},
        };
      }
    } catch (err) {
      logSafeError('server', 'read compatibility store', err);
    }
    return {
      seatLocks: {},
      bookings: [],
      enquiries: [],
      paymentIntents: {},
      usedUtrs: {},
      usedRazorpayPaymentIds: {},
      razorpayWebhookEvents: {},
      checkedInPasses: {},
      passVerificationAudit: [],
      users: [...INITIAL_SEED_USERS],
      notifications: [...INITIAL_SEED_NOTIFICATIONS],
      notificationCampaigns: [...INITIAL_SEED_CAMPAIGNS],
      providerListings: {},
      adminModules: {},
      revokedTokens: {},
    };
  }

  function saveAuthoritativeStore(store: AuthoritativeStore): boolean {
    assertJsonStoreAllowed('marketplace');
    const tempPath = `${AUTH_STORE_FILE_PATH}.tmp-${process.pid}`;
    try {
      fs.writeFileSync(tempPath, JSON.stringify(store, null, 2), { encoding: 'utf-8', mode: 0o600 });
      fs.renameSync(tempPath, AUTH_STORE_FILE_PATH);
      return true;
    } catch (err) {
      logSafeError('server', 'persist compatibility store', err);
      try {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      } catch {}
      return false;
    }
  }

  function computeHmac(payload: string, domainPrefix: string): string {
    return crypto
      .createHmac('sha256', `${SERVER_HMAC_SECRET}:${domainPrefix}`)
      .update(payload)
      .digest('hex');
  }

  function safeTimingEqualHex(a: string, b: string): boolean {
    if (!a || !b || a.length !== b.length) return false;
    try {
      return crypto.timingSafeEqual(Buffer.from(a, 'utf-8'), Buffer.from(b, 'utf-8'));
    } catch {
      return false;
    }
  }

  function signQrPassPayload(data: {
    passCode: string;
    bookingId: string;
    listingId: string;
    scheduledDate: string;
    seats?: string[];
  }): { qrSignature: string; qrPassToken: string } {
    const canonical = [
      String(data.passCode || '').trim().toUpperCase(),
      String(data.bookingId || '').trim(),
      String(data.listingId || '').trim(),
      String(data.scheduledDate || '').trim(),
      Array.isArray(data.seats) && data.seats.length > 0 ? [...data.seats].sort().join(',') : 'NO_SEATS',
    ].join('|');
    const qrSignature = computeHmac(canonical, 'QR_PASS').slice(0, 24).toUpperCase();
    const cleanCode = String(data.passCode || '').trim().toUpperCase();
    return {
      qrSignature,
      qrPassToken: `${cleanCode}.${qrSignature}`,
    };
  }

  interface SessionClaims {
    userId: string;
    /** Verified Supabase Auth identity, separate from legacy API user IDs. */
    supabaseUserId?: string;
    email?: string;
    name?: string;
    role: 'customer' | 'provider' | 'admin';
    providerId?: string;
    phone?: string;
    authProvider?: 'google' | 'email_otp';
    issuedAt: number;
    expiresAt?: number;
  }

  function resolveRoleRedirectTarget(
    role: 'customer' | 'provider' | 'admin'
  ): 'marketplace' | 'provider_portal' | 'admin_console' {
    if (role === 'admin') return 'admin_console';
    if (role === 'provider') return 'provider_portal';
    return 'marketplace';
  }

  function signSessionToken(claims: SessionClaims): string {
    const requestedExpiry = Number(claims.expiresAt);
    const expiresAt = Number.isFinite(requestedExpiry) && requestedExpiry > Date.now()
      ? requestedExpiry
      : Date.now() + 7 * 24 * 60 * 60 * 1000;
    const withExpiry: SessionClaims = {
      ...claims,
      expiresAt,
    };
    const payloadB64 = Buffer.from(JSON.stringify(withExpiry), 'utf-8').toString('base64url');
    const sig = computeHmac(payloadB64, 'SESSION_TOKEN_V2');
    return `${payloadB64}.${sig}`;
  }

  function extractRawTokenFromRequest(req: express.Request): string {
    return (
      String(req.headers['x-bos-session-token'] || '') ||
      String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
    ).trim();
  }

  function verifySessionTokenFromRequest(req: express.Request): SessionClaims | null {
    const rawHeader = extractRawTokenFromRequest(req);
    if (!rawHeader || rawHeader.length > 16384) return null;
    const parts = rawHeader.split('.');
    if (parts.length !== 2) return null;
    const [payloadB64, sig] = parts;
    if (!payloadB64 || !/^[a-f0-9]{64}$/i.test(sig)) return null;
    const expectedSig = computeHmac(payloadB64, 'SESSION_TOKEN_V2');
    if (!safeTimingEqualHex(sig, expectedSig)) return null;
    try {
      const parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8')) as SessionClaims;
      if (!parsed || typeof parsed.userId !== 'string' || !parsed.userId.trim() || !['customer', 'provider', 'admin'].includes(parsed.role)) {
        return null;
      }
      if (typeof parsed.expiresAt !== 'number' || !Number.isFinite(parsed.expiresAt) || parsed.expiresAt <= Date.now()) {
        return null;
      }
      if (typeof parsed.issuedAt !== 'number' || !Number.isFinite(parsed.issuedAt) || parsed.issuedAt > Date.now() + 60_000) {
        return null;
      }
      if (IS_PRODUCTION_RUNTIME) {
        // Token revocation is never read from the local JSON file in
        // production; the process keeps an in-memory revocation set for the
        // lifetime of this instance.
        if (REVOKED_SESSION_SIGNATURES.has(sig)) return null;
        return parsed;
      }
      const store = loadAuthoritativeStore();
      if (store.revokedTokens && store.revokedTokens[sig]) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  function hasCurrentAdminSession(claims: SessionClaims | null): boolean {
    if (!claims) return false;
    // Production admin authority comes from the database-backed Supabase
    // profile checks, never from the local compatibility store. Routes that
    // still rely on this legacy check fail closed in production.
    if (IS_PRODUCTION_RUNTIME) return false;
    const store = loadAuthoritativeStore();
    const currentUser = store.users.find(
      (user) =>
        (claims.supabaseUserId && user.supabaseUserId?.toLowerCase() === claims.supabaseUserId.toLowerCase()) ||
        (!claims.supabaseUserId && user.id.toLowerCase() === claims.userId.toLowerCase())
    );
    if (!currentUser || currentUser.accountStatus !== 'active') return false;
    return hasAdminAuthorization(claims, currentUser.role);
  }

  /**
   * Checks whether a user ID or email is blocked/suspended in the authoritative store.
   */
  function findBlockedUserInStore(
    store: AuthoritativeStore,
    userId?: string,
    email?: string
  ): AuthoritativeUserRecord | null {
    const cleanId = String(userId || '').trim().toLowerCase();
    const cleanEmail = String(email || '').trim().toLowerCase();
    for (const u of store.users) {
      const idMatch = cleanId && u.id.toLowerCase() === cleanId;
      const emailMatch = cleanEmail && u.email.toLowerCase() === cleanEmail;
      if ((idMatch || emailMatch) && (u.accountStatus === 'suspended' || u.accountStatus === 'blocked')) {
        return u;
      }
    }
    return null;
  }

  function appendAuthoritativeNotification(
    store: AuthoritativeStore,
    params: {
      title: string;
      message: string;
      type?: AuthoritativeNotificationRecord['type'];
      targetRole?: AuthoritativeNotificationRecord['targetRole'];
      recipientUserId?: string;
      linkId?: string;
    }
  ): AuthoritativeNotificationRecord {
    const item: AuthoritativeNotificationRecord = {
      id: `notif-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
      recipientUserId: params.recipientUserId,
      targetRole: params.targetRole || 'all_users',
      title: params.title,
      message: params.message,
      time: 'Just now',
      type: params.type || 'booking',
      read: false,
      readByUserIds: [],
      linkId: params.linkId,
      createdAt: new Date().toISOString(),
    };
    store.notifications.unshift(item);
    if (store.notifications.length > 250) {
      store.notifications = store.notifications.slice(0, 250);
    }
    return item;
  }

  function findAuthoritativeUser(store: AuthoritativeStore, userId?: string, providerId?: string): AuthoritativeUserRecord | null {
    const cleanUserId = String(userId || '').trim().toLowerCase();
    const cleanProviderId = String(providerId || '').trim().toLowerCase();
    return store.users.find((user) =>
      (cleanUserId && (user.id.toLowerCase() === cleanUserId || String(user.supabaseUserId || '').toLowerCase() === cleanUserId))
      || (cleanProviderId && String(user.providerId || '').toLowerCase() === cleanProviderId)
    ) || null;
  }

  function dispatchAuthoritativeBookingEmails(
    details: Parameters<typeof sendBookingNotificationEmails>[0],
  ): void {
    void sendBookingNotificationEmails(details, { env: process.env })
      .catch((error) => logSafeError('notifications', 'dispatch booking notification emails', error));
  }

  // Same resolver as the browser client: without an explicit URL no target is
  // selected, and an invalid configuration fails closed instead of falling
  // back to production.
  const serverSupabaseConfig = resolveSupabaseConfig({
    url: process.env.VITE_SUPABASE_URL,
    projectId: process.env.VITE_SUPABASE_PROJECT_ID,
    developmentProjectId: process.env.VITE_SUPABASE_DEVELOPMENT_PROJECT_ID,
    publishableKey: process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    anonKey: process.env.VITE_SUPABASE_ANON_KEY,
  });
  if (serverSupabaseConfig.errors.length > 0) {
    console.error(
      `[Supabase Configuration] Server: ${serverSupabaseConfig.errors.join(' ')} Supabase auth stays disabled.`
    );
  }
  const SUPABASE_PROJECT_ID = serverSupabaseConfig.projectId;
  const SUPABASE_PROJECT_URL = serverSupabaseConfig.projectUrl;
  const SUPABASE_AUTH_CALLBACK_URL = serverSupabaseConfig.authCallbackUrl;
  registerMediaValidationApi(app, {
    projectUrl: SUPABASE_PROJECT_URL,
    publishableKey: serverSupabaseConfig.publishableKey,
    // Server-only. Never expose this value in Vite-prefixed variables or logs.
    serverSecretKey: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    pool: pgRuntimePool || null,
  });
  registerAccountClosureApi(app, {
    projectUrl: SUPABASE_PROJECT_URL,
    publishableKey: serverSupabaseConfig.publishableKey,
    serverSecretKey: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  });

  function authenticateOrRegisterUser(params: {
    supabaseUserId: string;
    email: string;
    name?: string;
    googleSub?: string;
    avatarUrl?: string;
    phone?: string;
    requestedRole?: string;
    allowRoleChange?: boolean;
    city?: string;
    authProvider?: 'google' | 'email_otp';
  }):
    | {
        ok: true;
        isNewUser: boolean;
        user: AuthoritativeUserRecord;
        sessionToken: string;
        claims: SessionClaims;
        redirectTarget: 'marketplace' | 'provider_portal' | 'admin_console';
      }
    | {
        ok: false;
        status: number;
        error: string;
        accountStatus?: string;
        message: string;
      } {
    const cleanEmail = String(params.email || '').trim().toLowerCase();
    const cleanSupabaseUserId = String(params.supabaseUserId || '').trim().toLowerCase();
    if (!isValidSupabaseAuthUserId(cleanSupabaseUserId)) {
      return {
        ok: false,
        status: 401,
        error: 'INVALID_VERIFIED_AUTH_IDENTITY',
        message: 'The verified Supabase Auth identity is invalid.',
      };
    }
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return {
        ok: false,
        status: 400,
        error: 'INVALID_AUTH_EMAIL',
        message: 'A valid email address is required for sign-in.',
      };
    }

    const store = loadAuthoritativeStore();
    const authProvider = params.authProvider || 'google';
    const cleanSub = String(params.googleSub || (authProvider === 'google' ? `google-${cleanEmail}` : '')).trim();
    const nowIso = new Date().toISOString();

    // Check if user already exists by googleSub or email
    const existingUser = store.users.find(
      (u) =>
        (u.supabaseUserId && u.supabaseUserId.toLowerCase() === cleanSupabaseUserId) ||
        u.email.toLowerCase() === cleanEmail ||
        (cleanSub && u.googleSub && u.googleSub === cleanSub)
    );

    if (existingUser) {
      // Link a legacy record once to a verified Auth UUID. Once linked, a
      // different identity cannot take it over through matching email data.
      if (!canLinkSupabaseAuthIdentity(existingUser.supabaseUserId, cleanSupabaseUserId)) {
        return {
          ok: false,
          status: 409,
          error: 'AUTH_IDENTITY_ALREADY_LINKED',
          message: 'This account is linked to a different verified sign-in identity.',
        };
      }

      // ENFORCE ACCOUNT BLOCKING: Immediately deny suspended or blocked accounts
      if (existingUser.accountStatus === 'suspended' || existingUser.accountStatus === 'blocked') {
        return {
          ok: false,
          status: 403,
          error: 'ACCOUNT_BLOCKED',
          accountStatus: existingUser.accountStatus,
          message: `Account "${existingUser.email}" is ${existingUser.accountStatus.toUpperCase()} by the Administrator. Sign-in and platform access are denied.`,
        };
      }

      // Reject any unauthorized attempt to escalate an existing non-admin account to admin
      const reqRole = String(params.requestedRole || '').toLowerCase();
      if (reqRole === 'admin' && existingUser.role !== 'admin') {
        return {
          ok: false,
          status: 403,
          error: 'ADMIN_ESCALATION_DENIED',
          message: 'Cannot self-escalate to Admin role. Only authorized administrators have Admin Console access.',
        };
      }

      // Existing user sign-in: preserve existing role and data by default
      existingUser.lastLoginAt = nowIso;
      existingUser.supabaseUserId = cleanSupabaseUserId;
      existingUser.googleSub = existingUser.googleSub || cleanSub || undefined;
      existingUser.authProvider = authProvider;
      if (params.name && params.name.trim() && !existingUser.name) {
        existingUser.name = params.name.trim();
      }
      if (params.phone && params.phone.trim() && !existingUser.phone) {
        existingUser.phone = params.phone.trim();
      }
      if (params.avatarUrl && params.avatarUrl.trim()) {
        existingUser.avatarUrl = params.avatarUrl.trim();
      }

      // Ensure allowlisted super admin always retains admin role
      if (
        params.allowRoleChange === true &&
        reqRole &&
        ['customer', 'provider'].includes(reqRole) &&
        existingUser.role !== 'admin'
      ) {
        existingUser.role = reqRole as 'customer' | 'provider';
        if (existingUser.role === 'provider' && !existingUser.providerId) {
          existingUser.providerId = `prov-${existingUser.id.toLowerCase()}`;
        }
      }

      if (!saveAuthoritativeStore(store)) {
        return {
          ok: false,
          status: 503,
          error: 'ACCOUNT_PERSISTENCE_UNAVAILABLE',
          message: 'The account could not be persisted. Please try again later.',
        };
      }

      const claims: SessionClaims = {
        userId: existingUser.id,
        supabaseUserId: cleanSupabaseUserId,
        email: existingUser.email,
        name: existingUser.name,
        role: existingUser.role,
        providerId:
          existingUser.role === 'provider'
            ? existingUser.providerId || `prov-${existingUser.id.toLowerCase()}`
            : undefined,
        phone: existingUser.phone,
        authProvider,
        issuedAt: Date.now(),
      };
      const sessionToken = signSessionToken(claims);

      return {
        ok: true,
        isNewUser: false,
        user: existingUser,
        sessionToken,
        claims,
        redirectTarget: resolveRoleRedirectTarget(existingUser.role),
      };
    }

    // Automatic New-User Registration via a verified Auth identity:
    // new signups always begin as customers. Provider promotion happens
    // through the reviewed registration workflow; Admin requires bootstrap.
    const reqRole = String(params.requestedRole || 'customer').toLowerCase();
    if (reqRole === 'admin') {
      return {
        ok: false,
        status: 403,
        error: 'ADMIN_ESCALATION_DENIED',
        message: 'New accounts cannot self-register as Admin.',
      };
    }

    const assignedRole: 'customer' | 'provider' = params.allowRoleChange === true && reqRole === 'provider'
      ? 'provider'
      : 'customer';

    const newId = `USR-${Date.now().toString().slice(-6)}-${Math.floor(10 + Math.random() * 89)}`;
    const displayName =
      (params.name && params.name.trim()) ||
      cleanEmail
        .split('@')[0]
        .replace(/[._-]+/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());

    const newUser: AuthoritativeUserRecord = {
      id: newId,
      supabaseUserId: cleanSupabaseUserId,
      name: displayName,
      email: cleanEmail,
      phone: (params.phone && params.phone.trim()) || '',
      role: assignedRole,
      providerId: assignedRole === 'provider' ? `prov-${newId.toLowerCase()}` : undefined,
      ...(cleanSub ? { googleSub: cleanSub } : {}),
      avatarUrl:
        params.avatarUrl ||
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
      authProvider,
      verified: true,
      kycDocument: 'Google OAuth 2.0 Verified',
      accountStatus: 'active',
      city: (params.city && params.city.trim()) || '',
      joinedAt: nowIso.slice(0, 10),
      lastLoginAt: nowIso,
      listingsCount: 0,
      bookingsCount: 0,
      totalSpentOrEarned: 0,
      permissions:
        assignedRole === 'provider'
          ? ['create_listing', 'respond_enquiries', 'receive_payouts']
          : ['book_services', 'post_reviews', 'chat_provider'],
      publishState: 'published',
    };

    store.users.unshift(newUser);

    appendAuthoritativeNotification(store, {
      recipientUserId: newUser.id,
      targetRole: assignedRole === 'provider' ? 'providers' : 'customers',
      title: '🎉 Welcome to BookOurSpace',
      message: `Account registered automatically via verified ${authProvider === 'google' ? 'Google' : 'email OTP'} for ${newUser.name} (${newUser.email}) as ${assignedRole.toUpperCase()}.`,
      type: 'approval',
    });

    if (!saveAuthoritativeStore(store)) {
      // Do not return an authenticated session for a user record that failed
      // to persist in the current compatibility store.
      return {
        ok: false,
        status: 503,
        error: 'ACCOUNT_PERSISTENCE_UNAVAILABLE',
        message: 'The account could not be persisted. Please try again later.',
      };
    }

    const claims: SessionClaims = {
      userId: newUser.id,
      supabaseUserId: cleanSupabaseUserId,
      email: newUser.email,
      name: newUser.name,
      role: newUser.role,
      providerId: newUser.providerId,
      phone: newUser.phone,
      authProvider,
      issuedAt: Date.now(),
    };
    const sessionToken = signSessionToken(claims);

    return {
      ok: true,
      isNewUser: true,
      user: newUser,
      sessionToken,
      claims,
      redirectTarget: resolveRoleRedirectTarget(newUser.role),
    };
  }

  function pruneExpiredSeatHolds(store: AuthoritativeStore): boolean {
    const now = Date.now();
    let changed = false;
    for (const [key, entry] of Object.entries(store.seatLocks)) {
      if (entry.status === 'held' && entry.expiresAt <= now) {
        delete store.seatLocks[key];
        changed = true;
      }
    }
    return changed;
  }

  // ============================================================================
  // 1. GOOGLE-ONLY OAUTH 2.0, SUPABASE OAUTH & SESSION ENDPOINTS
  //    Supabase project: whatever is explicitly configured, never implicit
  // ============================================================================

  // 1A. GET GOOGLE OAUTH AUTHORIZATION URL (Supabase OAuth + Popup Flow for Iframe Preview & Cloud Run)
  app.get('/api/auth/google/url', (req, res) => {
    const requestOrigin = process.env.APP_URL?.replace(/\/+$/, '') || `${req.protocol}://${req.get('host')}`;
    const callbackUrl = `${requestOrigin}/auth/callback`;
    const configured = Boolean(
      SUPABASE_PROJECT_URL && SUPABASE_PROJECT_ID && serverSupabaseConfig.publishableKey
    );
    const supabaseAuthorizeUrl = configured
      ? `${SUPABASE_PROJECT_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(callbackUrl)}&access_type=offline&prompt=select_account`
      : '';
    res.status(configured ? 200 : 503).json({
      ok: configured,
      configured,
      googleCloudConfigured: false,
      supabaseConfigured: configured,
      supabaseProjectId: SUPABASE_PROJECT_ID || undefined,
      supabaseUrl: SUPABASE_PROJECT_URL || undefined,
      supabaseAuthorizeUrl: supabaseAuthorizeUrl || undefined,
      supabaseAuthCallbackUrl: SUPABASE_AUTH_CALLBACK_URL || undefined,
      authProvider: 'google',
      url: supabaseAuthorizeUrl || undefined,
      callbackUrl,
      message: configured
        ? 'Google sign-in is delegated to Supabase Auth for the explicitly configured project.'
        : 'Google sign-in is unavailable until a valid Supabase Auth project is configured.',
    });
  });

  // 1B. SUPABASE & GOOGLE OAUTH CALLBACK HANDLER (/auth/callback & /auth/callback/)
  app.get(['/auth/callback', '/auth/callback/'], (req, res) => {
    // Let the Supabase client finish its PKCE/implicit callback in the SPA.
    // URL-supplied email/name/sub fields are never used as authentication proof.
    const safeQuery = new URLSearchParams();
    for (const key of ['code', 'state', 'error', 'error_description']) {
      const value = req.query[key];
      if (typeof value === 'string' && value.length <= 4096) safeQuery.set(key, value);
    }
    const query = safeQuery.toString();
    const redirectPath = `/${query ? `?${query}` : ''}`;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'self'");
    res.type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Completing sign-in</title></head><body><p>Completing secure sign-in…</p><script>window.location.replace(${JSON.stringify(redirectPath)} + window.location.hash)</script></body></html>`);
  });

  // 1C. AUTHORITATIVE GOOGLE OAUTH AUTHENTICATE / AUTO-REGISTER ENDPOINT
  app.post('/api/auth/google/authenticate', async (req, res) => {
    const accessToken = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    if (!accessToken) {
      res.status(401).json({ ok: false, error: 'VERIFIED_GOOGLE_SESSION_REQUIRED', message: 'Sign in through the configured Google provider before requesting an application session.' });
      return;
    }
    if (!SUPABASE_PROJECT_URL || !serverSupabaseConfig.publishableKey) {
      res.status(503).json({ ok: false, error: 'SUPABASE_AUTH_NOT_CONFIGURED', message: 'Google sign-in verification is unavailable until Supabase Auth is configured.' });
      return;
    }
    const identity = await verifySupabaseGoogleIdentity({
      projectUrl: SUPABASE_PROJECT_URL,
      publishableKey: serverSupabaseConfig.publishableKey,
      accessToken,
    });
    if (!identity) {
      res.status(401).json({ ok: false, error: 'INVALID_GOOGLE_SESSION', message: 'Supabase Auth did not verify an active Google identity.' });
      return;
    }

    // Production identity is PostgreSQL-only. The legacy JSON store is never
    // read or written for a production sign-in: the verified Google identity
    // maps to a durable profile row and the session role comes from that row.
    if (IS_PRODUCTION_RUNTIME) {
      if (!providerListingRepository) {
        res.status(503).json({ ok: false, error: 'AUTH_PROFILE_PERSISTENCE_UNAVAILABLE' });
        return;
      }
      try {
        const identityActor = {
          userId: '',
          supabaseUserId: identity.id,
          email: identity.email,
          name: identity.name || identity.email,
          googleSub: identity.googleSub,
          avatarUrl: identity.avatarUrl,
          authProvider: 'google' as const,
          role: 'customer' as const,
        };
        const existingProfile = await providerListingRepository.profileForIdentity(identityActor);
        const profile = existingProfile || await providerListingRepository.provisionGoogleProfile(identityActor);
        const profileRole = String(profile.role) as SessionClaims['role'];
        if (!['customer', 'provider', 'admin'].includes(profileRole) || profile.account_status !== 'active') {
          res.status(403).json({ ok: false, error: 'AUTH_PROFILE_INACTIVE' });
          return;
        }
        const providerId = profileRole === 'provider' ? `prov-${identity.id.slice(0, 8).toLowerCase()}` : undefined;
        const claims: SessionClaims = {
          userId: String(profile.id),
          supabaseUserId: identity.id,
          email: identity.email,
          name: identity.name || profile.full_name || identity.email,
          phone: '',
          role: profileRole,
          ...(providerId ? { providerId } : {}),
          authProvider: 'google',
          issuedAt: Date.now(),
          expiresAt: Date.now() + 12 * 60 * 60_000,
        };
        res.status(existingProfile ? 200 : 201).json({
          ok: true,
          authProvider: 'google',
          supabaseProjectId: SUPABASE_PROJECT_ID,
          isNewUser: !existingProfile,
          user: {
            id: String(profile.id),
            supabaseUserId: identity.id,
            name: claims.name,
            email: identity.email,
            phone: '',
            role: profileRole,
            providerId,
            googleSub: identity.googleSub || '',
            authProvider: 'google',
            verified: true,
            accountStatus: 'active',
            city: '',
            avatarUrl: profile.avatar_url || identity.avatarUrl || '',
            joinedAt: new Date().toISOString().slice(0, 10),
            lastLoginAt: new Date().toISOString(),
            listingsCount: 0,
            bookingsCount: 0,
            totalSpentOrEarned: 0,
          },
          sessionToken: signSessionToken(claims),
          claims,
          redirectTarget: resolveRoleRedirectTarget(profileRole),
        });
        return;
      } catch (error) {
        logSafeError('auth', 'profile provisioning', error);
        res.status(503).json({ ok: false, error: 'AUTH_PROFILE_PERSISTENCE_UNAVAILABLE' });
        return;
      }
    }

    // Identity and email come only from Supabase Auth. New users are customers;
    // existing server-assigned roles and the server-side admin allowlist remain authoritative.
    const result = authenticateOrRegisterUser({
      supabaseUserId: identity.id,
      email: identity.email,
      name: identity.name,
      googleSub: identity.googleSub,
      avatarUrl: identity.avatarUrl,
      requestedRole: 'customer',
      allowRoleChange: false,
    });

    if (!result.ok) {
      res.status(result.status).json(result);
      return;
    }

    let responseSessionToken = result.sessionToken;
    let responseClaims = result.claims;
    let responseUser = result.user;
    let responseRedirectTarget = result.redirectTarget;
    if (providerListingRepository) {
      try {
        const profile = await providerListingRepository.provisionGoogleProfile({
          userId: result.user.id,
          supabaseUserId: identity.id,
          email: identity.email,
          name: identity.name,
          googleSub: identity.googleSub,
          avatarUrl: identity.avatarUrl,
          authProvider: 'google',
          role: 'customer',
        });
        const profileRole = String(profile.role) as SessionClaims['role'];
        if (!['customer', 'provider', 'admin'].includes(profileRole) || profile.account_status !== 'active') {
          res.status(403).json({ ok: false, error: 'AUTH_PROFILE_INACTIVE' });
          return;
        }
        const store = loadAuthoritativeStore();
        const storedUser = store.users.find((user) => user.id === result.user.id);
        if (!storedUser) {
          res.status(503).json({ ok: false, error: 'ACCOUNT_PERSISTENCE_UNAVAILABLE' });
          return;
        }
        storedUser.role = profileRole;
        storedUser.supabaseUserId = identity.id;
        if (profileRole === 'provider' && !storedUser.providerId) {
          storedUser.providerId = `prov-${identity.id.slice(0, 8).toLowerCase()}`;
        }
        if (!saveAuthoritativeStore(store)) {
          res.status(503).json({ ok: false, error: 'ACCOUNT_PERSISTENCE_UNAVAILABLE' });
          return;
        }
        responseUser = storedUser;
        responseClaims = {
          ...result.claims,
          role: profileRole,
          providerId: profileRole === 'provider' ? storedUser.providerId : undefined,
        };
        responseSessionToken = signSessionToken(responseClaims);
        responseRedirectTarget = resolveRoleRedirectTarget(profileRole);
      } catch (error) {
        // Do not issue a browser session when configured durable identity
        // provisioning failed. Error details may contain private SQL data.
        const diagnostic = process.env.NODE_ENV === 'test'
          ? (error instanceof Error ? error.message.slice(0, 240) : 'UNKNOWN_PROFILE_ERROR')
          : undefined;
        res.status(503).json({
          ok: false,
          error: 'AUTH_PROFILE_PERSISTENCE_UNAVAILABLE',
          ...(diagnostic ? { diagnostic } : {}),
        });
        return;
      }
    }

    res.status(result.isNewUser ? 201 : 200).json({
      ok: true,
      authProvider: 'google',
      supabaseProjectId: SUPABASE_PROJECT_ID,
      isNewUser: result.isNewUser,
      user: responseUser,
      sessionToken: responseSessionToken,
      claims: responseClaims,
      redirectTarget: responseRedirectTarget,
    });
  });

  // Email OTP is an additional Supabase Auth identity. The code is issued and
  // verified by Supabase Auth; this endpoint only exchanges the verified
  // Supabase session for the same server-authoritative BOS session used by
  // Google sign-in.
  app.post('/api/auth/email-otp/authenticate', async (req, res) => {
    const accessToken = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    if (!accessToken) {
      res.status(401).json({ ok: false, error: 'VERIFIED_EMAIL_OTP_SESSION_REQUIRED', message: 'Verify the email code before requesting an application session.' });
      return;
    }
    if (!SUPABASE_PROJECT_URL || !serverSupabaseConfig.publishableKey) {
      res.status(503).json({ ok: false, error: 'SUPABASE_AUTH_NOT_CONFIGURED', message: 'Email OTP sign-in is unavailable until Supabase Auth is configured.' });
      return;
    }
    const identity = await verifySupabaseEmailIdentity({
      projectUrl: SUPABASE_PROJECT_URL,
      publishableKey: serverSupabaseConfig.publishableKey,
      accessToken,
    });
    if (!identity) {
      res.status(401).json({ ok: false, error: 'INVALID_EMAIL_OTP_SESSION', message: 'Supabase Auth did not verify an active email OTP identity.' });
      return;
    }

    const result = authenticateOrRegisterUser({
      supabaseUserId: identity.id,
      email: identity.email,
      name: identity.name,
      authProvider: 'email_otp',
      requestedRole: 'customer',
      allowRoleChange: false,
    });
    if (!result.ok) {
      res.status(result.status).json(result);
      return;
    }

    let responseSessionToken = result.sessionToken;
    let responseClaims = result.claims;
    let responseUser = result.user;
    let responseRedirectTarget = result.redirectTarget;

    if (IS_PRODUCTION_RUNTIME) {
      if (!providerListingRepository) {
        res.status(503).json({ ok: false, error: 'AUTH_PROFILE_PERSISTENCE_UNAVAILABLE' });
        return;
      }
      try {
        const profile = await providerListingRepository.profileForIdentity({
          userId: '',
          supabaseUserId: identity.id,
          email: identity.email,
          name: identity.name || identity.email,
          authProvider: 'email_otp',
          role: 'customer',
        });
        const profileRole = String(profile?.role || '') as SessionClaims['role'];
        if (!profile || !['customer', 'provider', 'admin'].includes(profileRole) || profile.account_status !== 'active') {
          res.status(403).json({ ok: false, error: 'AUTH_PROFILE_INACTIVE' });
          return;
        }
        const claims: SessionClaims = {
          userId: String(profile.id),
          supabaseUserId: identity.id,
          email: identity.email,
          name: identity.name || profile.full_name || identity.email,
          phone: profile.phone || '',
          role: profileRole,
          authProvider: 'email_otp',
          issuedAt: Date.now(),
          expiresAt: Date.now() + 12 * 60 * 60_000,
        };
        responseClaims = claims;
        responseSessionToken = signSessionToken(claims);
        responseRedirectTarget = resolveRoleRedirectTarget(profileRole);
        responseUser = {
          ...result.user,
          id: String(profile.id),
          supabaseUserId: identity.id,
          name: claims.name || identity.email,
          email: identity.email,
          phone: claims.phone || '',
          role: profileRole,
          authProvider: 'email_otp' as const,
          verified: true,
          accountStatus: profile.account_status,
        };
      } catch (error) {
        logSafeError('auth', 'email OTP profile lookup', error);
        res.status(503).json({ ok: false, error: 'AUTH_PROFILE_PERSISTENCE_UNAVAILABLE' });
        return;
      }
    } else if (providerListingRepository) {
      try {
        const profile = await providerListingRepository.profileForIdentity({
          userId: result.user.id,
          supabaseUserId: identity.id,
          email: identity.email,
          name: identity.name || identity.email,
          authProvider: 'email_otp',
          role: result.user.role,
        });
        if (profile) {
          const profileRole = String(profile.role) as SessionClaims['role'];
          const store = loadAuthoritativeStore();
          const storedUser = store.users.find((user) => user.id === result.user.id);
          if (storedUser) {
            storedUser.role = profileRole;
            storedUser.supabaseUserId = identity.id;
            storedUser.authProvider = 'email_otp';
            if (!saveAuthoritativeStore(store)) {
              res.status(503).json({ ok: false, error: 'ACCOUNT_PERSISTENCE_UNAVAILABLE' });
              return;
            }
            responseUser = storedUser;
            responseClaims = { ...result.claims, role: profileRole, authProvider: 'email_otp' };
            responseSessionToken = signSessionToken(responseClaims);
            responseRedirectTarget = resolveRoleRedirectTarget(profileRole);
          }
        }
      } catch (error) {
        logSafeError('auth', 'email OTP profile sync', error);
        res.status(503).json({ ok: false, error: 'AUTH_PROFILE_PERSISTENCE_UNAVAILABLE' });
        return;
      }
    }

    res.status(result.isNewUser ? 201 : 200).json({
      ok: true,
      authProvider: 'email_otp',
      supabaseProjectId: SUPABASE_PROJECT_ID,
      isNewUser: result.isNewUser,
      user: responseUser,
      sessionToken: responseSessionToken,
      claims: responseClaims,
      redirectTarget: responseRedirectTarget,
    });
  });

  // 1D. VERIFY ACTIVE SESSION & ENFORCE MID-SESSION ACCOUNT BLOCKING
  // Missing browser-facing API surface (marketplace, cancellation quotes,
  // refunds, Super Admin governance, SMS, Razorpay). Providers fail closed.
  registerPlatformApi(app, {
    verifySession: verifySessionTokenFromRequest,
    loadStore: loadAuthoritativeStore,
    saveStore: saveAuthoritativeStore,
    signSession: signSessionToken,
    hmacSecret: SERVER_HMAC_SECRET,
    findBlockedUser: findBlockedUserInStore,
    verifySuperAdmin: async (req) => {
      const accessToken = String(req.headers['x-supabase-access-token'] || '').trim();
      if (!SUPABASE_PROJECT_URL || !serverSupabaseConfig.publishableKey || !accessToken) return null;
      return verifySupabaseSuperAdmin({
        projectUrl: SUPABASE_PROJECT_URL,
        publishableKey: serverSupabaseConfig.publishableKey,
        accessToken,
      });
    },
    manageUserAccess: async (req, targetUserId, action, reason) => {
      const accessToken = String(req.headers['x-supabase-access-token'] || '').trim();
      if (!SUPABASE_PROJECT_URL || !serverSupabaseConfig.publishableKey || !accessToken) return null;
      return manageSupabaseUserAccess({
        projectUrl: SUPABASE_PROJECT_URL,
        publishableKey: serverSupabaseConfig.publishableKey,
        accessToken,
        targetUserId,
        action,
        reason,
      });
    },
    providerListingRepository,
    env: process.env,
  });

  // Public Stay discovery search, availability calendar and reviews. Registered
  // before the inventory routes so the literal `/api/stays/search` path wins
  // over the parameterised listing routes.
  registerStaySearchApi(app, {
    verifySession: verifySessionTokenFromRequest,
    env: process.env,
    pool: pgRuntimePool,
  });

  // Compact India location catalog autocomplete and nearest-city lookup. The
  // Google Places fallback is server-only and remains unavailable until a
  // restricted server credential is explicitly configured.
  registerLocationSearchApi(app, {
    env: process.env,
    pool: pgRuntimePool || undefined,
  });

  // Host-owned stay inventory, blocks, bookings and payout status.
  registerStayHostApi(app, {
    verifySession: verifySessionTokenFromRequest,
    env: process.env,
  });

  registerStayAdminApi(app, {
    verifySession: verifySessionTokenFromRequest,
    env: process.env,
  });

  // Stay availability, holds, bookings and cancellations (PostgreSQL only).
  registerStayApi(app, {
    verifySession: verifySessionTokenFromRequest,
    env: process.env,
  });

  // Stay checkout, UPI intents, pay-after-service, signed settlement and refunds.
  registerStayPayments(app, {
    verifySession: verifySessionTokenFromRequest,
    env: process.env,
  });

  // PG payment obligations, UPI intents, provider-signed settlement,
  // cancellation/refund quotes, owner check-in/out and admin adjustments.
  // Registered before the generic PG booking routes so that the cancellation
  // contract (409 + refund quote instead of a 200 with a failure body) is the
  // one the browser sees.
  // PG administrator operations, disputes, offline collection claims,
  // server-backed invoices and the trusted provider settlement webhook.
  // Registered first so that the explicit `payment-claim` route is matched
  // before the generic `:action` wildcard below.
  // Versioned, registry-driven page/module configuration. Registered before
  // the payment wildcards so `/api/builder/*` is never shadowed.
  registerPlatformBuilderApi(app, {
    repository: platformBuilderRepository,
    verifySession: verifySessionTokenFromRequest,
  });

  registerPgAdminApi(app, {
    repository: pgPaymentRepository,
    verifySession: verifySessionTokenFromRequest,
    env: process.env,
  });

  registerPgPaymentsApi(app, {
    repository: pgPaymentRepository,
    verifySession: verifySessionTokenFromRequest,
    env: process.env,
  });

  registerPgBookingsApi(app, {
    repository: pgBookingRepository,
    verifySession: verifySessionTokenFromRequest,
  });

  registerVenueBookingsApi(app, {
    repository: venueBookingRepository,
    verifySession: verifySessionTokenFromRequest,
    env: process.env,
  });

  // Local demo identities for the seeded stays database. Hard-disabled in
  // production and limited to the two seeded accounts.
  registerDevDemoSessionApi(app, {
    signSession: signSessionToken,
    env: process.env,
  });

  app.get('/api/auth/me', async (req, res) => {
    const claims = verifySessionTokenFromRequest(req);
    if (!claims) {
      res.status(401).json({ ok: false, error: 'UNAUTHORIZED_SESSION' });
      return;
    }

    if (IS_PRODUCTION_RUNTIME) {
      if (!providerListingRepository || !claims.supabaseUserId || !['google', 'email_otp'].includes(String(claims.authProvider))) {
        res.status(503).json({ ok: false, error: 'AUTH_PROFILE_UNAVAILABLE' });
        return;
      }
      try {
        const profile = await providerListingRepository.profileForIdentity(claims);
        if (!profile) {
          res.status(503).json({ ok: false, error: 'AUTH_PROFILE_NOT_PROVISIONED' });
          return;
        }
        const role = String(profile.role) as SessionClaims['role'];
        if (!['customer', 'provider', 'admin'].includes(role) || profile.account_status !== 'active') {
          res.status(403).json({ ok: false, error: 'AUTH_PROFILE_INACTIVE' });
          return;
        }
        const providerId = role === 'provider'
          ? claims.providerId || `prov-${claims.supabaseUserId.slice(0, 8).toLowerCase()}`
          : undefined;
        const refreshedClaims: SessionClaims = {
          ...claims,
          userId: String(profile.id),
          role,
          providerId,
        };
        res.json({
          ok: true,
          authenticated: true,
          authProvider: 'google',
          supabaseProjectId: SUPABASE_PROJECT_ID,
          claims: refreshedClaims,
          sessionToken: signSessionToken(refreshedClaims),
          user: {
            id: String(profile.id),
            supabaseUserId: claims.supabaseUserId,
            name: profile.full_name || claims.name || profile.email || 'BookOurSpace User',
            email: profile.email || claims.email || '',
            phone: claims.phone || '',
            role,
            providerId,
            googleSub: String((claims as any).googleSub || ''),
            authProvider: 'google',
            verified: true,
            accountStatus: 'active',
            status: 'active',
            city: '',
            avatarUrl: profile.avatar_url || '',
            joinedAt: new Date().toISOString().slice(0, 10),
            lastLoginAt: new Date().toISOString(),
            listingsCount: 0,
            bookingsCount: 0,
            totalSpentOrEarned: 0,
          },
          redirectTarget: resolveRoleRedirectTarget(role),
        });
        return;
      } catch (error) {
        logSafeError('auth', 'production profile lookup', error);
        res.status(503).json({ ok: false, error: 'AUTH_PROFILE_UNAVAILABLE' });
        return;
      }
    }

    const store = loadAuthoritativeStore();
    const blocked = findBlockedUserInStore(store, claims.userId, claims.email);
    if (blocked) {
      res.status(403).json({
        ok: false,
        error: 'ACCOUNT_BLOCKED',
        accountStatus: blocked.accountStatus,
        message: `Your account (${blocked.email}) has been ${blocked.accountStatus} by an Administrator.`,
      });
      return;
    }

    const matchedUser = store.users.find(
      (u) =>
        u.id.toLowerCase() === claims.userId.toLowerCase() ||
        (claims.email && u.email.toLowerCase() === claims.email.toLowerCase())
    );

    let effectiveRole = matchedUser ? matchedUser.role : claims.role;
    let refreshedSessionToken: string | undefined;
    if (providerListingRepository && claims.supabaseUserId && claims.authProvider === 'google') {
      try {
        const profile = await providerListingRepository.profileForIdentity(claims);
        if (!profile) {
          console.error('[auth] no profile row for verified identity');
          res.status(503).json({ ok: false, error: 'AUTH_PROFILE_NOT_PROVISIONED' });
          return;
        }
        effectiveRole = String(profile.role) as SessionClaims['role'];
        if (!['customer', 'provider', 'admin'].includes(effectiveRole) || profile.account_status !== 'active') {
          res.status(403).json({ ok: false, error: 'AUTH_PROFILE_INACTIVE' });
          return;
        }
        if (matchedUser) {
          matchedUser.role = effectiveRole;
          matchedUser.supabaseUserId = claims.supabaseUserId;
          if (effectiveRole === 'provider' && !matchedUser.providerId) {
            matchedUser.providerId = `prov-${claims.supabaseUserId.slice(0, 8).toLowerCase()}`;
          }
          if (!saveAuthoritativeStore(store)) {
            res.status(503).json({ ok: false, error: 'ACCOUNT_PERSISTENCE_UNAVAILABLE' });
            return;
          }
        }
        const refreshedClaims: SessionClaims = {
          ...claims,
          role: effectiveRole as SessionClaims['role'],
          providerId: effectiveRole === 'provider' ? matchedUser?.providerId || claims.providerId || `prov-${claims.supabaseUserId.slice(0, 8).toLowerCase()}` : undefined,
        };
        refreshedSessionToken = signSessionToken(refreshedClaims);
      } catch (error) {
        // A silent 503 hides the real reason, so it is logged before the
        // fail-closed response.
        logSafeError('auth', 'profile lookup', error);
        res.status(503).json({ ok: false, error: 'AUTH_PROFILE_UNAVAILABLE' });
        return;
      }
    }
    // A durable PostgreSQL identity must not need a legacy JSON compatibility
    // record to be usable in the browser. Without this fallback a verified
    // Google/Supabase user whose profile exists only in PostgreSQL would get
    // `user: null`, and the client would drop an otherwise valid session.
    const verifiedSessionUser = matchedUser || {
      id: claims.userId,
      name: claims.name || claims.email || 'BookOurSpace User',
      email: claims.email || '',
      phone: claims.phone || '',
      role: effectiveRole,
      providerId: effectiveRole === 'provider'
        ? claims.providerId || (claims.supabaseUserId ? `prov-${claims.supabaseUserId.slice(0, 8).toLowerCase()}` : undefined)
        : undefined,
      googleSub: String((claims as any).googleSub || ''),
      authProvider: 'google',
      verified: true,
      accountStatus: 'active',
      status: 'active',
      city: '',
      joinedAt: new Date().toISOString().slice(0, 10),
      lastLoginAt: new Date().toISOString(),
      listingsCount: 0,
      bookingsCount: 0,
      totalSpentOrEarned: 0,
    };

    res.json({
      ok: true,
      authenticated: true,
      authProvider: 'google',
      supabaseProjectId: SUPABASE_PROJECT_ID,
      claims: {
        ...claims,
        role: effectiveRole as SessionClaims['role'],
      },
      ...(refreshedSessionToken ? { sessionToken: refreshedSessionToken } : {}),
      user: verifiedSessionUser,
      redirectTarget: resolveRoleRedirectTarget(effectiveRole),
    });
  });

  // 1E. LOGOUT / REVOKE SESSION TOKEN

  // Local development sign-in. Disabled in production and unless explicitly
  // opted in; it only selects an existing seeded profile, never creates one.
  app.post('/api/auth/local-dev/session', async (req, res) => {
    if (process.env.NODE_ENV === 'production' || String(process.env.BOS_LOCAL_DEV_AUTH || '') !== '1') {
      res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      return;
    }
    if (!pgRuntimePool) {
      res.status(503).json({ ok: false, error: 'DATABASE_UNAVAILABLE' });
      return;
    }
    const requested = String(req.body?.role || 'customer');
    const role = requested === 'admin' ? 'admin' : requested === 'provider' ? 'provider' : 'customer';
    const requestedEmail = String(req.body?.email || '').trim().toLowerCase();
    try {
      const result = requestedEmail
        ? await pgRuntimePool.query(
            `select p.id, p.email, p.full_name, p.role, p.is_super_admin
               from public.profiles p
              where p.account_status = 'active' and lower(p.email) = $1
              limit 1`,
            [requestedEmail],
          )
        : await pgRuntimePool.query(
            `select p.id, p.email, p.full_name, p.role, p.is_super_admin
               from public.profiles p
              where p.account_status = 'active'
                and (case when $1 = 'admin' then (p.is_super_admin is true or p.role = 'admin') else p.role = $1 end)
                and (
                  $1 <> 'provider'
                  or exists (
                    select 1
                      from public.listings l
                     where l.owner_id = p.id
                       and (
                         lower(coalesce(l.category_id, '')) like 'pg-%'
                         or lower(coalesce(l.entity_type, '')) like '%pg%'
                       )
                  )
                )
              order by (p.is_super_admin is true) desc, p.created_at asc
              limit 1`,
            [role],
          );
      const profile = result.rows[0];
      if (!profile) {
        res.status(404).json({ ok: false, error: 'LOCAL_DEMO_USER_NOT_FOUND' });
        return;
      }
      const effectiveRole = profile.is_super_admin ? 'admin' : profile.role;
      const sessionToken = signSessionToken({
        userId: String(profile.id),
        supabaseUserId: String(profile.id),
        email: String(profile.email),
        name: String(profile.full_name || profile.email),
        phone: '',
        role: effectiveRole as SessionClaims['role'],
        authProvider: 'google',
        issuedAt: Date.now(),
        expiresAt: Date.now() + 12 * 60 * 60 * 1000,
      });
      res.json({
        ok: true,
        sessionToken,
        role: effectiveRole as SessionClaims['role'],
        user: { id: profile.id, email: profile.email, name: profile.full_name || profile.email, role: effectiveRole },
      });
    } catch {
      res.status(500).json({ ok: false, error: 'LOCAL_DEV_SESSION_FAILED' });
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    const rawHeader = extractRawTokenFromRequest(req);
    if (rawHeader && rawHeader.includes('.')) {
      const sig = rawHeader.split('.')[1];
      if (sig) {
        if (IS_PRODUCTION_RUNTIME) {
          REVOKED_SESSION_SIGNATURES.add(sig);
        } else {
          const store = loadAuthoritativeStore();
          store.revokedTokens[sig] = Date.now();
          saveAuthoritativeStore(store);
        }
      }
    }
    res.json({ ok: true, loggedOut: true });
  });

  // 1E-2. PROTECTED ROUTE & ROLE-BASED NAVIGATION GUARD ENDPOINT
  app.get('/api/auth/protected/:routeTarget', async (req, res) => {
    const routeTarget = String(req.params.routeTarget || 'marketplace').toLowerCase();
    if (routeTarget === 'marketplace') {
      res.json({
        ok: true,
        allowed: true,
        routeTarget: 'marketplace',
        publicRoute: true,
      });
      return;
    }

    const claims = verifySessionTokenFromRequest(req);
    if (!claims) {
      res.status(401).json({
        ok: false,
        allowed: false,
        routeTarget,
        error: 'UNAUTHORIZED_SESSION',
        redirectTarget: 'marketplace',
        message: 'Authentication required. Please sign in with Google to access this protected route.',
      });
      return;
    }

    if (IS_PRODUCTION_RUNTIME) {
      if (!providerListingRepository || !claims.supabaseUserId || !['google', 'email_otp'].includes(String(claims.authProvider))) {
        res.status(503).json({ ok: false, allowed: false, routeTarget, error: 'AUTH_PROFILE_UNAVAILABLE' });
        return;
      }
      try {
        const profile = await providerListingRepository.profileForIdentity(claims);
        if (!profile) {
          res.status(403).json({ ok: false, allowed: false, routeTarget, error: 'AUTH_PROFILE_NOT_PROVISIONED', redirectTarget: 'marketplace' });
          return;
        }
        const role = String(profile.role) as SessionClaims['role'];
        if (!['customer', 'provider', 'admin'].includes(role) || profile.account_status !== 'active') {
          res.status(403).json({ ok: false, allowed: false, routeTarget, error: 'AUTH_PROFILE_INACTIVE', redirectTarget: 'marketplace' });
          return;
        }
        const roleRedirect = resolveRoleRedirectTarget(role);
        if (routeTarget === 'admin_console' && role !== 'admin') {
          res.status(403).json({ ok: false, allowed: false, routeTarget, role, redirectTarget: roleRedirect, error: 'FORBIDDEN_ADMIN_ONLY' });
          return;
        }
        if (routeTarget === 'provider_portal' && role !== 'provider' && role !== 'admin') {
          res.status(403).json({ ok: false, allowed: false, routeTarget, role, redirectTarget: roleRedirect, error: 'FORBIDDEN_PROVIDER_OR_ADMIN_ONLY' });
          return;
        }
        res.json({
          ok: true,
          allowed: true,
          routeTarget,
          role,
          redirectTarget: roleRedirect,
          user: {
            id: String(profile.id),
            supabaseUserId: claims.supabaseUserId,
            name: profile.full_name || claims.name || profile.email || 'BookOurSpace User',
            email: profile.email || claims.email || '',
            role,
            accountStatus: 'active',
            authProvider: 'google',
          },
        });
        return;
      } catch (error) {
        logSafeError('auth', 'production route guard', error);
        res.status(503).json({ ok: false, allowed: false, routeTarget, error: 'AUTH_PROFILE_UNAVAILABLE' });
        return;
      }
    }

    const store = loadAuthoritativeStore();
    const blocked = findBlockedUserInStore(store, claims.userId, claims.email);
    if (blocked) {
      res.status(403).json({
        ok: false,
        allowed: false,
        routeTarget,
        error: 'ACCOUNT_BLOCKED',
        accountStatus: blocked.accountStatus,
        redirectTarget: 'marketplace',
        message: `Account "${blocked.email}" is ${blocked.accountStatus}. Access to protected routes is denied.`,
      });
      return;
    }

    const matchedUser = store.users.find(
      (u) =>
        u.id.toLowerCase() === claims.userId.toLowerCase() ||
        (claims.email && u.email.toLowerCase() === claims.email.toLowerCase())
    );
    const effectiveRole = matchedUser ? matchedUser.role : claims.role;
    const roleRedirect = resolveRoleRedirectTarget(effectiveRole);

    if (routeTarget === 'admin_console' && effectiveRole !== 'admin') {
      res.status(403).json({
        ok: false,
        allowed: false,
        routeTarget,
        role: effectiveRole as SessionClaims['role'],
        redirectTarget: roleRedirect,
        error: 'FORBIDDEN_ADMIN_ONLY',
        message: `Role "${effectiveRole}" cannot access Admin Console. Redirecting to ${roleRedirect}.`,
      });
      return;
    }

    if (routeTarget === 'provider_portal' && effectiveRole !== 'provider' && effectiveRole !== 'admin') {
      res.status(403).json({
        ok: false,
        allowed: false,
        routeTarget,
        role: effectiveRole as SessionClaims['role'],
        redirectTarget: roleRedirect,
        error: 'FORBIDDEN_PROVIDER_OR_ADMIN_ONLY',
        message: `Role "${effectiveRole}" cannot access Provider Portal. Redirecting to ${roleRedirect}.`,
      });
      return;
    }

    res.json({
      ok: true,
      allowed: true,
      routeTarget,
      role: effectiveRole,
      redirectTarget: roleRedirect,
      user: matchedUser || null,
    });
  });

  // 1F. ISSUE ROLE-ISOLATED SESSION TOKEN (Checks Account Blocking + Admin Passcode)
  app.post('/api/auth/session', (_req, res) => {
    res.status(410).json({
      ok: false,
      error: 'UNVERIFIED_SESSION_ISSUANCE_DISABLED',
      message: 'Application sessions can only be issued after server verification of a Supabase Google access token.',
    });
  });

  // Movies V1 is discovery and showtimes only. Refuse legacy seat/payment
  // endpoints before they can read or mutate an existing ticket/hold.
  app.use(['/api/seats', '/api/movies/bookings'], (_req, res) => {
    res.status(410).json({
      ok: false,
      error: 'MOVIES_V1_DISPLAY_ONLY',
      message: 'Movies V1 supports location-based discovery and showtimes only.',
    });
  });

  // 2. Legacy movie-seat endpoints remain hard-disabled until booking is an
  // approved product capability.
  app.get('/api/seats/locks', (req, res) => {
    const listingId = String(req.query.listingId || '').trim();
    const dateIso = String(req.query.dateIso || '').trim();
    const showtime = String(req.query.showtime || '').trim();

    if (!listingId || !dateIso || !showtime) {
      res.status(400).json({ ok: false, error: 'listingId, dateIso, and showtime are required' });
      return;
    }

    const store = loadAuthoritativeStore();
    if (pruneExpiredSeatHolds(store)) {
      saveAuthoritativeStore(store);
    }

    // Baseline occupied seats (C4, C5, E7) + all dynamically held/booked seats
    const bookedSeats = new Set<string>(['C4', 'C5', 'E7']);
    const heldSeats: Array<{ seatId: string; sessionId: string; expiresAt: number }> = [];
    const prefix = `${listingId}::${dateIso}::${showtime}::`;

    for (const [key, lock] of Object.entries(store.seatLocks)) {
      if (!key.startsWith(prefix)) continue;
      if (lock.status === 'booked') {
        bookedSeats.add(lock.seatId);
      } else if (lock.status === 'held' && lock.expiresAt > Date.now()) {
        heldSeats.push({
          seatId: lock.seatId,
          sessionId: lock.sessionId,
          expiresAt: lock.expiresAt,
        });
      }
    }

    const allLocked = Array.from(new Set([...Array.from(bookedSeats), ...heldSeats.map((h) => h.seatId)]));
    res.json({
      ok: true,
      listingId,
      dateIso,
      showtime,
      lockedSeats: allLocked,
      bookedSeats: Array.from(bookedSeats),
      heldSeats,
    });
  });

  // 3. ATOMIC SEAT HOLD (Prevents Race Conditions Between Concurrent Users + Blocks Suspended Users)
  app.post('/api/seats/hold', (req, res) => {
    const { listingId, dateIso, showtime, seats, sessionId, userId, ttlSeconds } = req.body || {};
    const sessionClaims = verifySessionTokenFromRequest(req);
    const store = loadAuthoritativeStore();

    const blocked = findBlockedUserInStore(
      store,
      sessionClaims?.userId || userId,
      sessionClaims?.email
    );
    if (blocked) {
      res.status(403).json({
        ok: false,
        error: 'ACCOUNT_BLOCKED',
        message: 'Suspended or blocked accounts cannot lock seats.',
      });
      return;
    }

    const cleanListingId = String(listingId || '').trim();
    const cleanDateIso = String(dateIso || '').trim();
    const cleanShowtime = String(showtime || '').trim();
    const cleanSessionId = String(sessionId || '').trim();
    const seatList: string[] = Array.isArray(seats)
      ? Array.from(new Set(seats.map((s: any) => String(s || '').trim().toUpperCase()).filter(Boolean)))
      : [];

    if (!cleanListingId || !cleanDateIso || !cleanShowtime || !cleanSessionId || seatList.length === 0) {
      res.status(400).json({
        ok: false,
        error: 'INVALID_HOLD_REQUEST',
        message: 'listingId, dateIso, showtime, sessionId, and non-empty seats[] are required.',
      });
      return;
    }

    pruneExpiredSeatHolds(store);

    const baselineSold = new Set(['C4', 'C5', 'E7']);
    const conflictingSeats: string[] = [];
    const now = Date.now();

    for (const seatId of seatList) {
      if (baselineSold.has(seatId)) {
        conflictingSeats.push(seatId);
        continue;
      }
      const key = `${cleanListingId}::${cleanDateIso}::${cleanShowtime}::${seatId}`;
      const existing = store.seatLocks[key];
      if (existing) {
        if (existing.status === 'booked') {
          conflictingSeats.push(seatId);
        } else if (existing.status === 'held' && existing.sessionId !== cleanSessionId && existing.expiresAt > now) {
          conflictingSeats.push(seatId);
        }
      }
    }

    if (conflictingSeats.length > 0) {
      saveAuthoritativeStore(store);
      res.status(409).json({
        ok: false,
        error: 'SEAT_CONFLICT',
        conflictingSeats,
        message: `Seats ${conflictingSeats.join(', ')} are already locked or booked by another customer.`,
      });
      return;
    }

    const ttlMs = Math.max(60, Math.min(900, Number(ttlSeconds) || 300)) * 1000;
    const expiresAt = now + ttlMs;

    for (const seatId of seatList) {
      const key = `${cleanListingId}::${cleanDateIso}::${cleanShowtime}::${seatId}`;
      store.seatLocks[key] = {
        key,
        listingId: cleanListingId,
        dateIso: cleanDateIso,
        showtime: cleanShowtime,
        seatId,
        sessionId: cleanSessionId,
        userId: String(sessionClaims?.userId || userId || cleanSessionId),
        status: 'held',
        expiresAt,
        createdAt: new Date(now).toISOString(),
      };
    }

    saveAuthoritativeStore(store);
    const lockToken = computeHmac(
      `${cleanListingId}|${cleanDateIso}|${cleanShowtime}|${seatList.sort().join(',')}|${cleanSessionId}`,
      'SEAT_HOLD'
    );

    res.json({
      ok: true,
      listingId: cleanListingId,
      dateIso: cleanDateIso,
      showtime: cleanShowtime,
      heldSeats: seatList,
      sessionId: cleanSessionId,
      expiresAt,
      lockToken,
    });
  });

  // 4. RELEASE HELD SEATS
  app.post('/api/seats/release', (req, res) => {
    const { listingId, dateIso, showtime, seats, sessionId } = req.body || {};
    const cleanListingId = String(listingId || '').trim();
    const cleanDateIso = String(dateIso || '').trim();
    const cleanShowtime = String(showtime || '').trim();
    const cleanSessionId = String(sessionId || '').trim();
    const seatList: string[] = Array.isArray(seats)
      ? seats.map((s: any) => String(s || '').trim().toUpperCase())
      : [];

    const store = loadAuthoritativeStore();
    let releasedCount = 0;

    for (const [key, entry] of Object.entries(store.seatLocks)) {
      if (
        entry.status === 'held' &&
        entry.sessionId === cleanSessionId &&
        (!cleanListingId || entry.listingId === cleanListingId) &&
        (!cleanDateIso || entry.dateIso === cleanDateIso) &&
        (!cleanShowtime || entry.showtime === cleanShowtime) &&
        (seatList.length === 0 || seatList.includes(entry.seatId))
      ) {
        delete store.seatLocks[key];
        releasedCount++;
      }
    }

    if (releasedCount > 0) {
      saveAuthoritativeStore(store);
    }

    res.json({ ok: true, releasedCount });
  });

  // 5. SERVER-SIDE PAYMENT INTENT CREATION
  app.post('/api/payments/create-intent', (req, res) => {
    const claims = verifySessionTokenFromRequest(req);
    if (!claims || claims.role !== 'customer') {
      res.status(claims ? 403 : 401).json({
        ok: false,
        error: claims ? 'CUSTOMER_SESSION_REQUIRED' : 'UNAUTHORIZED_SESSION',
        message: 'Sign in with a customer account before creating a payment intent.',
      });
      return;
    }

    if (!TRUSTED_PAYMENT_PROVIDER_CONFIGURED) {
      res.status(503).json({
        ok: false,
        error: 'PAYMENT_PROVIDER_NOT_CONFIGURED',
        message: 'Online payment verification is unavailable. Do not send payment; use an offline option if offered.',
      });
      return;
    }

    // Keep closed until intent creation is backed by a trusted provider and server-side quote.
    res.status(503).json({
      ok: false,
      error: 'PAYMENT_PROVIDER_NOT_CONFIGURED',
      message: 'Online payment verification is unavailable.',
    });
  });

  // 6. A client request is not a bank/provider webhook and cannot mint payment proof.
  app.post('/api/payments/webhook-settle', (req, res) => {
    res.status(410).json({
      ok: false,
      error: 'PAYMENT_PROVIDER_NOT_CONFIGURED',
      message: 'Settlement must be confirmed by an independently verified payment provider or bank reconciliation.',
    });
  });

  // 7. UTR submission records reconciliation only. It cannot establish settlement.
  app.post('/api/payments/verify-upi', (req, res) => {
    const { intentId, utrNumber } = req.body || {};
    const claims = verifySessionTokenFromRequest(req);
    const cleanIntentId = String(intentId || '').trim();
    const cleanUtr = String(utrNumber || '').trim().replace(/\s+/g, '');

    if (!claims || claims.role !== 'customer') {
      res.status(claims ? 403 : 401).json({
        ok: false,
        verified: false,
        error: claims ? 'CUSTOMER_SESSION_REQUIRED' : 'UNAUTHORIZED_SESSION',
        message: 'Sign in with the customer account that owns this payment intent.',
      });
      return;
    }

    if (!/^[A-Za-z0-9]{12,22}$/.test(cleanUtr)) {
      res.status(400).json({
        ok: false,
        verified: false,
        error: 'INVALID_UTR_FORMAT',
        message: 'A valid 12-digit NPCI UTR reference number is required.',
      });
      return;
    }

    const store = loadAuthoritativeStore();
    const blocked = findBlockedUserInStore(store, claims.userId, claims.email);
    if (blocked) {
      res.status(403).json({ ok: false, verified: false, error: 'ACCOUNT_BLOCKED' });
      return;
    }
    const intent = cleanIntentId ? store.paymentIntents[cleanIntentId] : undefined;
    if (!intent) {
      res.status(404).json({ ok: false, verified: false, error: 'PAYMENT_INTENT_NOT_FOUND' });
      return;
    }
    if (intent.ownerUserId !== claims.userId) {
      res.status(403).json({ ok: false, verified: false, error: 'PAYMENT_INTENT_OWNER_MISMATCH' });
      return;
    }

    // A customer retry can read a provider-verified result but cannot downgrade or change it.
    if (intent.status === 'verified') {
      if (intent.settlementSource !== 'trusted_provider_webhook' || !intent.providerPaymentId || !intent.settledAt) {
        res.status(409).json({ ok: false, verified: false, error: 'UNTRUSTED_LEGACY_VERIFICATION' });
        return;
      }
      if (intent.utrNumber !== cleanUtr) {
        res.status(409).json({ ok: false, verified: false, error: 'VERIFIED_UTR_IMMUTABLE' });
        return;
      }
      if (!TRUSTED_PAYMENT_PROVIDER_CONFIGURED) {
        res.status(503).json({
          ok: false,
          verified: false,
          status: 'pending_provider_reconciliation',
          error: 'PAYMENT_PROVIDER_NOT_CONFIGURED',
          message: 'Payment verification is unavailable. No new payment confirmation was issued.',
        });
        return;
      }
      res.json({
        ok: true,
        verified: true,
        status: 'verified',
        intentId: intent.intentId,
        utrNumber: intent.utrNumber,
        amount: intent.amount,
        paymentVerificationToken: intent.paymentVerificationToken,
        message: 'Existing provider-verified payment remains verified.',
      });
      return;
    }

    // Anti-replay: reject if UTR was already used on a different payment intent
    const existingUtr = store.usedUtrs[cleanUtr];
    if (existingUtr && (existingUtr.intentId !== cleanIntentId || existingUtr.status === 'verified')) {
      res.status(409).json({
        ok: false,
        verified: false,
        error: existingUtr.intentId !== cleanIntentId ? 'DUPLICATE_UTR_REPLAY' : 'VERIFIED_UTR_IMMUTABLE',
        message: `UTR ${cleanUtr} was already submitted for transaction ${existingUtr.intentId}. Replay rejected.`,
      });
      return;
    }

    if (!TRUSTED_PAYMENT_PROVIDER_CONFIGURED) {
      intent.utrNumber = cleanUtr;
      intent.status = 'pending_provider_reconciliation';
      intent.updatedAt = new Date().toISOString();
      store.usedUtrs[cleanUtr] = {
        intentId: intent.intentId,
        status: 'pending_provider_reconciliation',
        recordedAt: intent.updatedAt,
      };
      if (!saveAuthoritativeStore(store)) {
        res.status(500).json({ ok: false, verified: false, error: 'PAYMENT_RECONCILIATION_PERSIST_FAILED' });
        return;
      }
      res.status(503).json({
        ok: false,
        verified: false,
        status: 'pending_provider_reconciliation',
        error: 'PAYMENT_PROVIDER_NOT_CONFIGURED',
        intentId: intent.intentId,
        utrNumber: cleanUtr,
        message: 'Payment verification is unavailable. This UTR is unverified; no booking or paid status was created.',
      });
      return;
    }

    res.status(503).json({
      ok: false,
      verified: false,
      status: 'pending_provider_reconciliation',
      error: 'PAYMENT_PROVIDER_NOT_CONFIGURED',
    });
  });

  // 8. ATOMIC BOOKING CREATION (Enforces Account Blocking, Idempotency, Seat/Slot Concurrency & Signs QR Pass)
  app.post('/api/bookings/atomic', (req, res) => {
    const body = req.body || {};
    const sessionClaims = verifySessionTokenFromRequest(req);
    const store = loadAuthoritativeStore();

    if (!sessionClaims || sessionClaims.role !== 'customer') {
      res.status(sessionClaims ? 403 : 401).json({
        ok: false,
        error: sessionClaims ? 'CUSTOMER_SESSION_REQUIRED' : 'UNAUTHORIZED_SESSION',
        message: 'A verified customer session is required to create a booking.',
      });
      return;
    }

    // Enforce account blocking on bookings
    const blocked = findBlockedUserInStore(
      store,
      sessionClaims.userId,
      sessionClaims.email
    );
    if (blocked) {
      res.status(403).json({
        ok: false,
        error: 'ACCOUNT_BLOCKED',
        accountStatus: blocked.accountStatus,
        message: `Account "${blocked.name}" is ${blocked.accountStatus}. Booking creation is blocked.`,
      });
      return;
    }

    const idempotencyKey = String(body.idempotencyKey || req.headers['x-idempotency-key'] || '').trim();
    if (!idempotencyKey) {
      res.status(400).json({
        ok: false,
        error: 'MISSING_IDEMPOTENCY_KEY',
        message: 'idempotencyKey is required to prevent duplicate bookings.',
      });
      return;
    }

    const listingId = String(body.listingId || '').trim();
    const scheduledDate = String(body.scheduledDate || '').trim();
    const timeSlot = String(body.timeSlot || '').trim();
    if (!listingId || !scheduledDate || !timeSlot) {
      res.status(400).json({
        ok: false,
        error: 'MISSING_REQUIRED_FIELDS',
        message: 'listingId, scheduledDate, and timeSlot are required.',
      });
      return;
    }

    const screeningConfig = store.adminModules.movies_cinema_engine?.screens;
    const movieScreens = Array.isArray(screeningConfig) && screeningConfig.length > 0
      ? screeningConfig
      : DEFAULT_CINEMA_SCREENS;
    const isMovieBooking = movieScreens.some(
      (screen: CinemaScreenConfig) => String(screen.listingId || '').trim() === listingId
    ) || [body.module, body.moduleKey, body.entityType, body.categoryId]
      .some((value) => /movie|cinema/i.test(String(value || '')));
    if (isMovieBooking) {
      res.status(410).json({
        ok: false,
        error: 'MOVIES_V1_DISPLAY_ONLY',
        message: 'Movies V1 supports location-based discovery and showtimes only.',
      });
      return;
    }

    pruneExpiredSeatHolds(store);

    // 8A. IDEMPOTENCY CHECK: Return existing booking if idempotencyKey was already processed
    const existingByIdempotency = store.bookings.find(
      (b) => b.idempotencyKey === idempotencyKey && b.customerUserId === sessionClaims.userId
    );
    if (existingByIdempotency) {
      res.json({
        ok: true,
        idempotentReplay: true,
        booking: existingByIdempotency,
      });
      return;
    }

    const seats: string[] = Array.isArray(body.seats)
      ? Array.from(new Set(body.seats.map((s: any) => String(s || '').trim().toUpperCase()).filter(Boolean)))
      : [];
    const showtime = String(body.showtime || timeSlot).trim();
    const sessionId = String(body.sessionId || sessionClaims?.userId || 'direct-session').trim();
    const now = Date.now();

    const configuredCinemaScreens = store.adminModules.movies_cinema_engine?.screens;
    const cinemaScreens: CinemaScreenConfig[] = Array.isArray(configuredCinemaScreens) && configuredCinemaScreens.length > 0
      ? configuredCinemaScreens
      : DEFAULT_CINEMA_SCREENS;
    const isMovieListing = cinemaScreens.some(
      (screen: CinemaScreenConfig) => String(screen.listingId || '').trim() === listingId
    );
    if (seats.length > 0 && !isMovieListing) {
      res.status(400).json({ ok: false, error: 'MOVIE_LISTING_REQUIRED', message: 'Seat bookings must reference a server-configured cinema.' });
      return;
    }
    if (isMovieListing && (seats.length === 0 || !showtime)) {
      res.status(400).json({ ok: false, error: 'MOVIE_SEATS_AND_SHOWTIME_REQUIRED' });
      return;
    }

    // 8B. MOVIE SEAT CONCURRENCY CHECK & ATOMIC RESERVATION
    if (seats.length > 0) {
      const baselineSold = new Set(['C4', 'C5', 'E7']);
      const conflictingSeats: string[] = [];

      for (const seatId of seats) {
        if (baselineSold.has(seatId)) {
          conflictingSeats.push(seatId);
          continue;
        }
        const key = `${listingId}::${scheduledDate}::${showtime}::${seatId}`;
        const lock = store.seatLocks[key];
        if (lock) {
          if (lock.status === 'booked') {
            conflictingSeats.push(seatId);
          } else if (lock.status === 'held' && lock.sessionId !== sessionId && lock.expiresAt > now) {
            conflictingSeats.push(seatId);
          }
        }
      }

      if (conflictingSeats.length > 0) {
        saveAuthoritativeStore(store);
        res.status(409).json({
          ok: false,
          error: 'SEAT_ALREADY_BOOKED',
          conflictingSeats,
          message: `Cannot complete booking: seat(s) ${conflictingSeats.join(', ')} were already booked by another user.`,
        });
        return;
      }
    } else {
      // 8C. EXCLUSIVE SLOT CONCURRENCY GUARD (Prevents duplicate concurrent slot bookings)
      const duplicateSlotBooking = store.bookings.find(
        (b) =>
          b.status === 'confirmed' &&
          b.listingId === listingId &&
          b.scheduledDate === scheduledDate &&
          b.timeSlot === timeSlot &&
          (body.exclusiveSlot !== false || b.customerPhone === String(body.customerPhone || '').trim())
      );

      if (duplicateSlotBooking) {
        res.status(409).json({
          ok: false,
          error: 'SLOT_ALREADY_BOOKED',
          conflictingBookingId: duplicateSlotBooking.id,
          message: `Slot "${timeSlot}" on ${scheduledDate} for listing ${listingId} is already reserved.`,
        });
        return;
      }
    }

    // 8D. Apply payment requirements from server policy. Client flags are ignored.
    if (body.paymentMode !== undefined && !['pay_later', 'pay_qr'].includes(String(body.paymentMode))) {
      res.status(400).json({ ok: false, error: 'INVALID_PAYMENT_MODE' });
      return;
    }
    const paymentMode: 'pay_later' | 'pay_qr' = body.paymentMode === 'pay_qr' ? 'pay_qr' : 'pay_later';
    let paymentStatus: 'pay_later' | 'pending_verification' | 'verified' = 'pay_later';
    const paymentIntentId = paymentMode === 'pay_qr' && body.paymentIntentId ? String(body.paymentIntentId).trim() : undefined;
    const paymentUtr = paymentMode === 'pay_qr' && body.paymentUtr ? String(body.paymentUtr).trim() : undefined;
    const paymentRequired = paymentMode === 'pay_qr' || isMovieListing || seats.length > 0;
    if (isMovieListing && paymentMode !== 'pay_qr') {
      res.status(402).json({
        ok: false,
        error: 'PAYMENT_REQUIRED',
        message: 'Cinema tickets require verified online payment; offline booking is unavailable.',
      });
      return;
    }

    let verifiedIntent: PaymentIntentRecord | undefined;
    if (paymentRequired) {
      if (!sessionClaims || sessionClaims.role !== 'customer') {
        res.status(sessionClaims ? 403 : 401).json({
          ok: false,
          error: sessionClaims ? 'CUSTOMER_SESSION_REQUIRED' : 'UNAUTHORIZED_SESSION',
          message: 'A signed-in customer session is required for payment-required bookings.',
        });
        return;
      }

      verifiedIntent = paymentIntentId ? store.paymentIntents[paymentIntentId] : undefined;
      const intentUtrRecord = verifiedIntent?.utrNumber ? store.usedUtrs[verifiedIntent.utrNumber] : undefined;
      const submittedToken = String(body.paymentVerificationToken || '');
      const expectedToken = verifiedIntent?.utrNumber && verifiedIntent
        ? computeHmac(
            `${verifiedIntent.intentId}|${verifiedIntent.utrNumber}|VERIFIED|${verifiedIntent.amount.toFixed(2)}`,
            'PAYMENT_VERIFIED_TOKEN'
          )
        : '';
      const requestedAmount = Number(body.totalAmount);
      const sameAmount = Number.isFinite(requestedAmount) && Math.round(requestedAmount * 100) ===
        Math.round((verifiedIntent?.amount || 0) * 100);
      const trustedSettlementRecord = Boolean(
        verifiedIntent &&
          verifiedIntent.status === 'verified' &&
          verifiedIntent.settlementSource === 'trusted_provider_webhook' &&
          verifiedIntent.providerPaymentId &&
          verifiedIntent.settledAt &&
          verifiedIntent.paymentVerificationToken &&
          expectedToken &&
          safeTimingEqualHex(verifiedIntent.paymentVerificationToken, expectedToken) &&
          intentUtrRecord?.intentId === verifiedIntent.intentId &&
          intentUtrRecord.status === 'verified'
      );
      const bindingMatches = Boolean(
        verifiedIntent &&
          verifiedIntent.currency === 'INR' &&
          verifiedIntent.purpose === 'booking' &&
          verifiedIntent.listingId === listingId &&
          verifiedIntent.ownerUserId === sessionClaims.userId &&
          sameAmount &&
          submittedToken &&
          verifiedIntent.paymentVerificationToken &&
          safeTimingEqualHex(submittedToken, verifiedIntent.paymentVerificationToken)
      );

      if (!trustedSettlementRecord) {
        res.status(402).json({
          ok: false,
          error: TRUSTED_PAYMENT_PROVIDER_CONFIGURED ? 'PAYMENT_NOT_VERIFIED' : 'PAYMENT_PROVIDER_NOT_CONFIGURED',
          paymentStatus: 'pending_verification',
          message: TRUSTED_PAYMENT_PROVIDER_CONFIGURED
            ? 'A trusted provider settlement matching this customer, listing, purpose, and amount is required.'
            : 'Online payment verification is unavailable. No paid booking was created; choose an offline option if offered.',
        });
        return;
      }
      if (!bindingMatches) {
        res.status(402).json({
          ok: false,
          error: 'PAYMENT_INTENT_BINDING_MISMATCH',
          paymentStatus: 'pending_verification',
          message: 'The verified payment does not belong to this customer, listing, purpose, or amount.',
        });
        return;
      }
      if (verifiedIntent?.consumedByBookingId) {
        res.status(409).json({ ok: false, error: 'PAYMENT_INTENT_ALREADY_CONSUMED', message: 'This payment intent has already been used.' });
        return;
      }
      if (!TRUSTED_PAYMENT_PROVIDER_CONFIGURED) {
        res.status(503).json({
          ok: false,
          error: 'PAYMENT_PROVIDER_NOT_CONFIGURED',
          paymentStatus: 'pending_verification',
          message: 'Online payment verification is disabled. No paid booking was created.',
        });
        return;
      }
      paymentStatus = 'verified';
    }

    if (paymentRequired && paymentStatus !== 'verified') {
      res.status(402).json({
        ok: false,
        error: 'PAYMENT_NOT_VERIFIED',
        paymentStatus,
        message:
          'Payment is not server-verified. Submitting a UTR or screenshot alone cannot confirm a ticket until bank settlement verification completes.',
      });
      return;
    }

    const bookingId = String(body.id || `bk-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`);
    const rawPassCode = String(
      body.passCode ||
        body.invoiceNumber ||
        `BOS-PASS-${bookingId.replace(/[^A-Za-z0-9]/g, '').slice(-6).toUpperCase()}`
    )
      .trim()
      .toUpperCase();

    const { qrSignature, qrPassToken } = signQrPassPayload({
      passCode: rawPassCode,
      bookingId,
      listingId,
      scheduledDate,
      seats,
    });

    // Atomically mark all seats as 'booked'
    if (seats.length > 0) {
      for (const seatId of seats) {
        const key = `${listingId}::${scheduledDate}::${showtime}::${seatId}`;
        store.seatLocks[key] = {
          key,
          listingId,
          dateIso: scheduledDate,
          showtime,
          seatId,
          sessionId,
          userId: String(sessionClaims?.userId || body.customerUserId || sessionId),
          status: 'booked',
          bookingId,
          expiresAt: now + 365 * 24 * 60 * 60 * 1000,
          createdAt: new Date(now).toISOString(),
        };
      }
    }

    const customerUserId = sessionClaims.userId;
    const expiresAtDate = new Date(`${scheduledDate}T23:59:59.000Z`);
    const expiresAtIso = Number.isNaN(expiresAtDate.getTime())
      ? new Date(now + 48 * 60 * 60 * 1000).toISOString()
      : new Date(expiresAtDate.getTime() + 6 * 60 * 60 * 1000).toISOString();

    const newBooking: AuthoritativeBookingRecord = {
      id: bookingId,
      idempotencyKey,
      listingId,
      listingTitle: String(body.listingTitle || 'BookOurSpace Listing'),
      providerId: String(body.providerId || 'prov-1'),
      customerUserId,
      customerName: String(body.customerName || 'Guest Customer'),
      customerPhone: String(body.customerPhone || '9848012345'),
      customerAddress: String(body.customerAddress || 'Hyderabad'),
      scheduledDate,
      checkInDate: body.checkInDate ? String(body.checkInDate) : scheduledDate,
      checkOutDate: body.checkOutDate ? String(body.checkOutDate) : scheduledDate,
      timeSlot,
      showtime: seats.length > 0 ? showtime : undefined,
      seats: seats.length > 0 ? seats : undefined,
      screenId: body.screenId ? String(body.screenId) : undefined,
      screenName: body.screenName ? String(body.screenName) : undefined,
      foodAddons: Array.isArray(body.foodAddons) ? body.foodAddons.map(String) : undefined,
      baseAmount: body.baseAmount !== undefined ? Number(body.baseAmount) : undefined,
      taxAmount: body.taxAmount !== undefined ? Number(body.taxAmount) : undefined,
      discountAmount: body.discountAmount !== undefined ? Number(body.discountAmount) : undefined,
      promoCode: body.promoCode ? String(body.promoCode) : undefined,
      totalAmount: Number(body.totalAmount) || 0,
      paymentMode,
      paymentStatus,
      paymentIntentId,
      paymentUtr,
      status: 'confirmed',
      passCode: rawPassCode,
      qrSignature,
      qrPassToken,
      expiresAtIso,
      notes: body.notes ? String(body.notes) : undefined,
      createdAt: new Date(now).toISOString(),
    };

    store.bookings.unshift(newBooking);
    if (paymentRequired && verifiedIntent) {
      verifiedIntent.consumedByBookingId = bookingId;
      verifiedIntent.updatedAt = new Date(now).toISOString();
    }

    const customerUser = findAuthoritativeUser(store, customerUserId);
    const providerUser = findAuthoritativeUser(store, undefined, newBooking.providerId);
    appendAuthoritativeNotification(store, {
      recipientUserId: customerUserId,
      targetRole: 'customer',
      title: 'New booking confirmed',
      message: `${newBooking.listingTitle} is confirmed for ${newBooking.scheduledDate} (${newBooking.timeSlot}). Your signed pass is ${newBooking.passCode}.`,
      type: 'booking',
      linkId: newBooking.id,
    });
    if (providerUser) {
      appendAuthoritativeNotification(store, {
        recipientUserId: providerUser.id,
        targetRole: 'provider',
        title: 'New booking received',
        message: `${newBooking.customerName} booked "${newBooking.listingTitle}" for ${newBooking.scheduledDate} (${newBooking.timeSlot}).`,
        type: 'booking',
        linkId: newBooking.id,
      });
    }

    if (!saveAuthoritativeStore(store)) {
      res.status(500).json({ ok: false, error: 'BOOKING_PERSIST_FAILED', message: 'The booking was not confirmed because persistence failed.' });
      return;
    }

    dispatchAuthoritativeBookingEmails([
      ...(customerUser?.email ? [{
        kind: 'new_booking_confirmed' as const,
        recipient: customerUser.email,
        recipientName: customerUser.name,
        bookingId: newBooking.id,
        listingTitle: newBooking.listingTitle,
        status: newBooking.status,
        scheduledDate: newBooking.scheduledDate,
        timeSlot: newBooking.timeSlot,
      }] : []),
      ...(providerUser?.email ? [{
        kind: 'new_booking_received' as const,
        recipient: providerUser.email,
        recipientName: providerUser.name,
        bookingId: newBooking.id,
        listingTitle: newBooking.listingTitle,
        status: newBooking.status,
        scheduledDate: newBooking.scheduledDate,
        timeSlot: newBooking.timeSlot,
      }] : []),
    ]);

    res.status(201).json({
      ok: true,
      idempotentReplay: false,
      booking: newBooking,
    });
  });

  // 9. CRYPTOGRAPHIC QR PASS SIGNING & VERIFICATION ENDPOINTS
  let passCheckInQueue: Promise<void> = Promise.resolve();
  const withPassCheckInLock = async <T>(operation: () => Promise<T>): Promise<T> => {
    const previous = passCheckInQueue;
    let release!: () => void;
    passCheckInQueue = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  };

  app.post('/api/passes/verify', async (req, res) => {
    const claims = verifySessionTokenFromRequest(req);
    if (!claims) {
      res.status(401).json({ ok: false, verified: false, error: 'UNAUTHORIZED_SESSION' });
      return;
    }
    if (!['google', 'email_otp'].includes(String(claims.authProvider)) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(claims.supabaseUserId || ''))) {
      res.status(401).json({ ok: false, verified: false, error: 'VERIFIED_GOOGLE_IDENTITY_REQUIRED' });
      return;
    }

    const body = req.body || {};
    const rawToken = String(body.passToken || '').trim();
    let cleanCode = String(body.passCode || '').trim().toUpperCase();
    let providedSig = String(body.signature || '').trim().toUpperCase();
    if (rawToken.length > 500 || cleanCode.length > 120 || providedSig.length > 128) {
      res.status(400).json({ ok: false, verified: false, error: 'INVALID_PASS_TOKEN' });
      return;
    }
    if (rawToken.includes('.')) {
      const parts = rawToken.split('.');
      cleanCode = parts[0].trim().toUpperCase();
      providedSig = parts.slice(1).join('.').trim().toUpperCase();
    } else if (!cleanCode && rawToken) {
      cleanCode = rawToken.toUpperCase();
    }
    if (!cleanCode || !providedSig) {
      res.status(400).json({ ok: false, verified: false, error: 'MISSING_PASS_CODE_OR_SIGNATURE' });
      return;
    }
    const markCheckedIn = body.markCheckedIn === true;

    const response = (status: number, error: string, message?: string) => ({
      status,
      body: { ok: false, verified: false, error, ...(message ? { message } : {}) },
    });
    const verifiedResponse = (booking: {
      id: string;
      listingId: string;
      listingTitle: string;
      customerName: string;
      scheduledDate: string;
      timeSlot?: string;
      showtime?: string;
      seats?: string[];
      screenName?: string;
      passCode: string;
      checkedInAt?: string | null;
    }) => ({
      status: 200,
      body: {
        ok: true,
        verified: true,
        booking: {
          id: booking.id,
          listingId: booking.listingId,
          listingTitle: booking.listingTitle,
          customerName: booking.customerName,
          scheduledDate: booking.scheduledDate,
          timeSlot: booking.timeSlot,
          showtime: booking.showtime,
          seats: booking.seats,
          screenName: booking.screenName,
          passCode: booking.passCode,
          checkedInAt: booking.checkedInAt || null,
        },
      },
    });

    try {
      if (pgRuntimePool) {
        const client = await pgRuntimePool.connect();
        let transactionOpen = false;
        try {
          await client.query('begin');
          transactionOpen = true;
          const actorId = String(claims.supabaseUserId).toLowerCase();
          const profileResult = await client.query(
            `select role, account_status from public.profiles where id = $1::uuid limit 1`,
            [actorId],
          );
          const profile = profileResult.rows[0];
          if (!profile || profile.account_status !== 'active') {
            await client.query('rollback');
            transactionOpen = false;
            res.status(403).json({ ok: false, verified: false, error: 'ACTIVE_PROFILE_REQUIRED' });
            return;
          }
          const actorRole = String(profile.role);
          if (!['provider', 'admin'].includes(actorRole) || claims.role !== actorRole) {
            await client.query('rollback');
            transactionOpen = false;
            res.status(403).json({ ok: false, verified: false, error: 'PROVIDER_OR_ADMIN_REQUIRED' });
            return;
          }

          const result = await client.query(
            `select b.id, b.listing_id, b.listing_title, b.provider_id, b.customer_name,
                    b.scheduled_date, b.scheduled_time, b.status, b.payload,
                    b.qr_signature, b.qr_pass_token, b.payment_mode, b.payment_status,
                    l.owner_id
               from public.bookings b
               left join public.listings l on l.id = b.listing_id
              where upper(b.id) = $1
                 or upper(coalesce(b.payload ->> 'passCode', '')) = $1
                 or b.qr_pass_token = $2
              order by case when b.qr_pass_token = $2 then 0 else 1 end
              limit 1
              for update of b`,
            [cleanCode, rawToken],
          );
          const row = result.rows[0];
          if (!row) {
            await client.query('rollback');
            transactionOpen = false;
            res.status(404).json({ ok: false, verified: false, error: 'PASS_NOT_FOUND' });
            return;
          }
          if (actorRole === 'provider' && String(row.owner_id || '').toLowerCase() !== actorId) {
            await client.query('rollback');
            transactionOpen = false;
            res.status(403).json({ ok: false, verified: false, error: 'FORBIDDEN_NOT_LISTING_OWNER' });
            return;
          }

          const payload = row.payload && typeof row.payload === 'object' ? row.payload as Record<string, unknown> : {};
          const passCode = String(payload.passCode || cleanCode).trim().toUpperCase();
          const seats = Array.isArray(payload.seats) ? payload.seats.map(String) : [];
          const expected = signQrPassPayload({
            passCode,
            bookingId: String(row.id),
            listingId: String(row.listing_id),
            scheduledDate: String(row.scheduled_date),
            seats,
          });
          if (!row.qr_signature || !safeTimingEqualHex(String(row.qr_signature).toUpperCase(), expected.qrSignature) || !safeTimingEqualHex(providedSig, expected.qrSignature)) {
            await client.query('rollback');
            transactionOpen = false;
            res.status(403).json({ ok: false, verified: false, error: 'INVALID_OR_FORGED_QR_SIGNATURE' });
            return;
          }
          if (String(row.status) === 'cancelled') {
            await client.query('rollback');
            transactionOpen = false;
            res.status(403).json({ ok: false, verified: false, error: 'BOOKING_CANCELLED' });
            return;
          }
          if (String(row.payment_mode) === 'pay_qr' && String(row.payment_status) !== 'verified') {
            await client.query('rollback');
            transactionOpen = false;
            res.status(403).json({ ok: false, verified: false, error: 'PAYMENT_NOT_VERIFIED' });
            return;
          }
          const expiryValue = payload.expiresAtIso ?? payload.expiresAt;
          const expiry = typeof expiryValue === 'string' ? Date.parse(expiryValue) : Number.NaN;
          if (!Number.isFinite(expiry)) {
            await client.query('rollback');
            transactionOpen = false;
            res.status(403).json({ ok: false, verified: false, error: 'TICKET_EXPIRY_REQUIRED' });
            return;
          }
          if (expiry <= Date.now()) {
            await client.query('rollback');
            transactionOpen = false;
            res.status(403).json({ ok: false, verified: false, error: 'TICKET_EXPIRED' });
            return;
          }
          if (String(row.status) === 'checked_in' || payload.checkedInAt) {
            await client.query('rollback');
            transactionOpen = false;
            res.status(409).json({ ok: false, verified: false, alreadyCheckedIn: true, error: 'PASS_ALREADY_USED' });
            return;
          }
          if (String(row.status) !== 'confirmed') {
            await client.query('rollback');
            transactionOpen = false;
            res.status(409).json({ ok: false, verified: false, error: 'PASS_NOT_CHECKIN_ELIGIBLE' });
            return;
          }

          let checkedInAt: string | null = null;
          if (markCheckedIn) {
            const update = await client.query(
              `update public.bookings
                  set status = 'checked_in',
                      payload = jsonb_set(coalesce(payload, '{}'::jsonb), '{checkedInAt}', to_jsonb(now()::text), true)
                where id = $1 and status = 'confirmed'
                returning payload ->> 'checkedInAt' as checked_in_at`,
              [row.id],
            );
            if (!update.rows[0]) {
              await client.query('rollback');
              transactionOpen = false;
              res.status(409).json({ ok: false, verified: false, alreadyCheckedIn: true, error: 'PASS_ALREADY_USED' });
              return;
            }
            checkedInAt = String(update.rows[0].checked_in_at || new Date().toISOString());
            await client.query(
              `insert into public.stay_audit_events (allocation_id, event, detail, actor)
               values (null, 'legacy_pass_checked_in', $1::jsonb, $2::uuid)`,
              [JSON.stringify({
                bookingId: String(row.id),
                listingId: String(row.listing_id),
                actorRole,
                action: 'check_in',
                previousState: 'confirmed',
                newState: 'checked_in',
                reason: 'Valid, unexpired booking pass presented by an authorized verifier.',
              }), actorId],
            );
          }
          await client.query('commit');
          transactionOpen = false;
          const success = verifiedResponse({
            id: String(row.id),
            listingId: String(row.listing_id),
            listingTitle: String(row.listing_title || ''),
            customerName: String(row.customer_name || ''),
            scheduledDate: String(row.scheduled_date || ''),
            timeSlot: String(payload.timeSlot || row.scheduled_time || ''),
            showtime: typeof payload.showtime === 'string' ? payload.showtime : undefined,
            seats,
            screenName: typeof payload.screenName === 'string' ? payload.screenName : undefined,
            passCode,
            checkedInAt,
          });
          res.status(success.status).json(success.body);
          return;
        } finally {
          if (transactionOpen) await client.query('rollback').catch(() => {});
          client.release();
        }
      }

      if (IS_PRODUCTION_RUNTIME) {
        res.status(503).json({ ok: false, verified: false, error: 'PASS_PERSISTENCE_UNAVAILABLE' });
        return;
      }

      const outcome = await withPassCheckInLock(async () => {
        const store = loadAuthoritativeStore();
        const currentUser = store.users.find((user) =>
          user.supabaseUserId?.toLowerCase() === String(claims.supabaseUserId).toLowerCase() &&
          user.id.toLowerCase() === claims.userId.toLowerCase()
        );
        if (!currentUser || !['google', 'email_otp'].includes(String(currentUser.authProvider)) || currentUser.accountStatus !== 'active' || currentUser.role !== claims.role) {
          return response(403, 'ACTIVE_PROFILE_REQUIRED');
        }
        if (currentUser.role !== 'provider' && currentUser.role !== 'admin') return response(403, 'PROVIDER_OR_ADMIN_REQUIRED');
        const verifierRole: 'provider' | 'admin' = currentUser.role;
        if (currentUser.role === 'provider' && (!currentUser.providerId || claims.providerId !== currentUser.providerId)) {
          return response(403, 'SESSION_ROLE_MISMATCH');
        }

        const booking = store.bookings.find((record) =>
          String(record.passCode || '').toUpperCase() === cleanCode ||
          String(record.qrPassToken || '').toUpperCase() === rawToken.toUpperCase() ||
          String(record.id || '').toUpperCase() === cleanCode
        );
        if (!booking) return response(404, 'PASS_NOT_FOUND');
        if (currentUser.role === 'provider') {
          const listing = store.providerListings[booking.listingId];
          const ownsListing = Boolean(listing && (
            listing.ownerUserId === currentUser.id ||
            listing.ownerUserId === currentUser.supabaseUserId ||
            (listing.providerId && listing.providerId === currentUser.providerId && booking.providerId === currentUser.providerId)
          ));
          if (!ownsListing) return response(403, 'FORBIDDEN_NOT_LISTING_OWNER');
        }

        const expected = signQrPassPayload({
          passCode: booking.passCode,
          bookingId: booking.id,
          listingId: booking.listingId,
          scheduledDate: booking.scheduledDate,
          seats: booking.seats,
        });
        if (!providedSig || !safeTimingEqualHex(providedSig, expected.qrSignature) || !safeTimingEqualHex(String(booking.qrSignature || ''), expected.qrSignature)) {
          return response(403, 'INVALID_OR_FORGED_QR_SIGNATURE');
        }
        if (booking.status === 'cancelled') return response(403, 'BOOKING_CANCELLED');
        if (booking.paymentMode === 'pay_qr' && booking.paymentStatus !== 'verified') return response(403, 'PAYMENT_NOT_VERIFIED');
        const expiry = typeof booking.expiresAtIso === 'string' ? Date.parse(booking.expiresAtIso) : Number.NaN;
        if (!Number.isFinite(expiry)) return response(403, 'TICKET_EXPIRY_REQUIRED');
        if (expiry <= Date.now()) return response(403, 'TICKET_EXPIRED');

        const checkIn = store.checkedInPasses[booking.passCode];
        if (booking.checkedInAt || checkIn) {
          return { status: 409, body: { ok: false, verified: false, alreadyCheckedIn: true, error: 'PASS_ALREADY_USED' } };
        }
        if (booking.status !== 'confirmed') return response(409, 'PASS_NOT_CHECKIN_ELIGIBLE');

        let checkedInAt: string | null = null;
        if (markCheckedIn) {
          checkedInAt = new Date().toISOString();
          booking.checkedInAt = checkedInAt;
          store.checkedInPasses[booking.passCode] = { checkedInAt, checkedInBy: currentUser.supabaseUserId || currentUser.id };
          store.passVerificationAudit.push({
            id: crypto.randomUUID(),
            occurredAt: checkedInAt,
            actorUserId: currentUser.supabaseUserId || currentUser.id,
            actorRole: verifierRole,
            action: 'check_in',
            bookingId: booking.id,
            listingId: booking.listingId,
            previousState: 'confirmed',
            newState: 'checked_in',
            reason: 'Valid, unexpired booking pass presented by an authorized verifier.',
          });
          if (!saveAuthoritativeStore(store)) return response(503, 'PASS_PERSISTENCE_FAILED');
        }
        return verifiedResponse({
          id: booking.id,
          listingId: booking.listingId,
          listingTitle: booking.listingTitle,
          customerName: booking.customerName,
          scheduledDate: booking.scheduledDate,
          timeSlot: booking.timeSlot,
          showtime: booking.showtime,
          seats: booking.seats,
          screenName: booking.screenName,
          passCode: booking.passCode,
          checkedInAt,
        });
      });
      res.status(outcome.status).json(outcome.body);
    } catch (error) {
      logSafeError('passes', 'verify booking QR', error);
      res.status(503).json({ ok: false, verified: false, error: 'PASS_VERIFICATION_UNAVAILABLE' });
    }
  });

  // 10. STRICT CUSTOMER / PROVIDER / ADMIN ROLE ISOLATION ENDPOINTS (With Live Account Blocking Check)
  app.get('/api/isolation/bookings', (req, res) => {
    const claims = verifySessionTokenFromRequest(req);
    if (!claims) {
      res.status(401).json({
        ok: false,
        error: 'UNAUTHORIZED_SESSION',
        message: 'Valid signed session token (x-bos-session-token or Authorization Bearer) is required.',
      });
      return;
    }

    const store = loadAuthoritativeStore();
    const blocked = findBlockedUserInStore(store, claims.userId, claims.email);
    if (blocked) {
      res.status(403).json({
        ok: false,
        error: 'ACCOUNT_BLOCKED',
        accountStatus: blocked.accountStatus,
        message: 'Access denied: account has been suspended or blocked by Admin.',
      });
      return;
    }

    if (claims.role === 'admin') {
      res.json({
        ok: true,
        role: 'admin',
        bookings: store.bookings,
      });
      return;
    }

    if (claims.role === 'provider') {
      const providerBookings = store.bookings.filter(
        (b) => b.providerId === claims.providerId || b.providerId === claims.userId
      );
      res.json({
        ok: true,
        role: 'provider',
        providerId: claims.providerId,
        bookings: providerBookings,
      });
      return;
    }

    // Customer role: strictly isolated to own customerUserId
    const customerBookings = store.bookings.filter((b) => b.customerUserId === claims.userId);
    res.json({
      ok: true,
      role: 'customer',
      userId: claims.userId,
      bookings: customerBookings,
    });
  });

  app.get('/api/isolation/admin-summary', (req, res) => {
    const claims = verifySessionTokenFromRequest(req);
    if (!claims) {
      res.status(401).json({ ok: false, error: 'UNAUTHORIZED_SESSION' });
      return;
    }
    const store = loadAuthoritativeStore();
    const blocked = findBlockedUserInStore(store, claims.userId, claims.email);
    if (blocked) {
      res.status(403).json({ ok: false, error: 'ACCOUNT_BLOCKED' });
      return;
    }
    if (claims.role !== 'admin') {
      res.status(403).json({
        ok: false,
        error: 'FORBIDDEN_ADMIN_ONLY',
        message: `Role "${claims.role}" is strictly forbidden from accessing Admin platform telemetry and financial ledgers.`,
      });
      return;
    }

    res.json({
      ok: true,
      role: 'admin',
      totalUsers: store.users.length,
      blockedUsersCount: store.users.filter(
        (u) => u.accountStatus === 'suspended' || u.accountStatus === 'blocked'
      ).length,
      totalBookings: store.bookings.length,
      totalActiveSeatLocks: Object.keys(store.seatLocks).length,
      totalPaymentIntents: Object.keys(store.paymentIntents).length,
      verifiedPaymentsCount: Object.values(store.paymentIntents).filter((p) => p.status === 'verified').length,
      pendingReconciliationCount: Object.values(store.paymentIntents).filter(
        (p) => p.status === 'pending_provider_reconciliation'
      ).length,
    });
  });

  // ============================================================================
  // 11. AUTHORITATIVE USER MANAGEMENT & ACCOUNT BLOCKING API (/api/admin/users)
  // ============================================================================
  const mutateSupabaseUserFromRequest = async (
    req: express.Request,
    targetUserId: string,
    action: 'promote' | 'demote' | 'set_provider' | 'suspend' | 'activate' | 'block' | 'require_verification' | 'verify' | 'unverify',
    reason: string,
  ) => {
    const claims = verifySessionTokenFromRequest(req);
    const accessToken = String(req.headers['x-supabase-access-token'] || '').trim();
    if (!claims?.supabaseUserId || !SUPABASE_PROJECT_URL || !serverSupabaseConfig.publishableKey || !accessToken) return null;
    return manageSupabaseUserAccess({
      projectUrl: SUPABASE_PROJECT_URL,
      publishableKey: serverSupabaseConfig.publishableKey,
      accessToken,
      expectedActorUserId: claims.supabaseUserId,
      targetUserId,
      action,
      reason,
    });
  };

  app.get('/api/admin/users', async (_req, res) => {
    const claims = verifySessionTokenFromRequest(_req);
    if (!claims) {
      res.status(401).json({ ok: false, error: 'UNAUTHORIZED_SESSION' });
      return;
    }
    if (process.env.NODE_ENV === 'production') {
      const accessToken = String(_req.headers['x-supabase-access-token'] || '').trim();
      if (!SUPABASE_PROJECT_URL || !serverSupabaseConfig.publishableKey || !accessToken || !claims.supabaseUserId) {
        res.status(503).json({ ok: false, error: 'DATABASE_AUTHORITY_UNAVAILABLE' });
        return;
      }
      const profiles = await listSupabaseUserProfiles({
        projectUrl: SUPABASE_PROJECT_URL,
        publishableKey: serverSupabaseConfig.publishableKey,
        accessToken,
        expectedActorUserId: claims.supabaseUserId,
      });
      if (!profiles) {
        res.status(403).json({ ok: false, error: 'CURRENT_DATABASE_ADMIN_REQUIRED' });
        return;
      }
      res.json({
        ok: true,
        users: profiles.map((profile: any) => ({
          id: profile.id,
          supabaseUserId: profile.id,
          name: profile.full_name || profile.email || 'Google user',
          email: profile.email,
          phone: profile.phone || '',
          role: profile.role,
          accountStatus: profile.account_status,
          verified: profile.verified === true,
          city: profile.city || '',
          authProvider: 'google',
        })),
        source: 'supabase',
      });
      return;
    }
    if (!hasCurrentAdminSession(claims)) {
      res.status(403).json({ ok: false, error: 'FORBIDDEN_ADMIN_ONLY' });
      return;
    }
    const store = loadAuthoritativeStore();
    res.json({
      ok: true,
      users: store.users,
    });
  });

  app.post('/api/admin/users', (req, res) => {
    const claims = verifySessionTokenFromRequest(req);
    if (!claims) {
      res.status(401).json({ ok: false, error: 'UNAUTHORIZED_SESSION' });
      return;
    }
    if (process.env.NODE_ENV === 'production') {
      res.status(409).json({ ok: false, error: 'GOOGLE_SIGNUP_REQUIRED', message: 'Managed user profiles are created only through verified Google sign-in.' });
      return;
    }
    if (!hasCurrentAdminSession(claims)) {
      res.status(403).json({
        ok: false,
        error: 'FORBIDDEN_ADMIN_ONLY',
        message: 'Only administrators can create managed user accounts.',
      });
      return;
    }

    const body = req.body || {};
    const name = String(body.name || '').trim();
    const phone = String(body.phone || '').trim();
    if (!name || !phone) {
      res.status(400).json({ ok: false, error: 'NAME_AND_PHONE_REQUIRED' });
      return;
    }

    const store = loadAuthoritativeStore();
    // Managed accounts must complete verified Google sign-in. This compatibility
    // endpoint cannot mint provider/Admin roles from browser-supplied fields.
    const role: 'customer' | 'provider' | 'admin' = 'customer';
    const id = String(body.id || `USR-${Date.now().toString().slice(-4)}`);
    const email =
      String(body.email || '').trim().toLowerCase() ||
      `${name.toLowerCase().replace(/[^a-z0-9]+/g, '.')}@bookourspace.in`;

    const existingIdx = store.users.findIndex(
      (u) => u.id === id || u.email.toLowerCase() === email
    );
    const record: AuthoritativeUserRecord = {
      id,
      name,
      email,
      phone,
      role,
      authProvider: 'google',
      verified: false,
      kycDocument: String(body.kycDocument || 'Aadhaar + Trade KYC Verified'),
      accountStatus: body.accountStatus || 'active',
      city: String(body.city || 'Hyderabad'),
      joinedAt: String(body.joinedAt || new Date().toISOString().slice(0, 10)),
      lastLoginAt: new Date().toISOString(),
      listingsCount: Number(body.listingsCount) || 0,
      bookingsCount: Number(body.bookingsCount) || 0,
      totalSpentOrEarned: Number(body.totalSpentOrEarned) || 0,
      gstin: body.gstin ? String(body.gstin) : undefined,
      permissions: ['book_services'],
      publishState: body.publishState === 'draft' ? 'draft' : 'published',
    };

    if (existingIdx >= 0) {
      store.users[existingIdx] = record;
    } else {
      store.users.unshift(record);
    }
    saveAuthoritativeStore(store);

    res.status(201).json({
      ok: true,
      user: record,
      users: store.users,
    });
  });

  app.patch('/api/admin/users/:id/status', async (req, res) => {
    if (!verifySessionTokenFromRequest(req)) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED_SESSION' });
    const nextStatus = String(req.body?.status || req.body?.accountStatus || '').trim();
    const action = ({ active: 'activate', suspended: 'suspend', blocked: 'block', pending_verification: 'require_verification' } as Record<string, any>)[nextStatus];
    const reason = String(req.body?.reason || '').trim();
    if (!action) return res.status(400).json({ ok: false, error: 'INVALID_ACCOUNT_STATUS' });
    if (reason.length < 5) return res.status(400).json({ ok: false, error: 'AUDIT_REASON_REQUIRED' });
    const user = await mutateSupabaseUserFromRequest(req, String(req.params.id || ''), action, reason);
    if (!user) return res.status(503).json({ ok: false, error: 'DATABASE_AUTHORITY_UNAVAILABLE' });
    res.json({ ok: true, user: { id: user.id, email: user.email, role: user.role, accountStatus: user.account_status, verified: user.verified }, source: 'supabase' });
  });

  app.patch('/api/admin/users/:id/role', async (req, res) => {
    if (!verifySessionTokenFromRequest(req)) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED_SESSION' });
    const nextRole = String(req.body?.role || '').trim().toLowerCase();
    const action = ({ customer: 'demote', provider: 'set_provider', admin: 'promote' } as Record<string, any>)[nextRole];
    const reason = String(req.body?.reason || '').trim();
    if (!action) return res.status(400).json({ ok: false, error: 'INVALID_ROLE' });
    if (reason.length < 5) return res.status(400).json({ ok: false, error: 'AUDIT_REASON_REQUIRED' });
    const user = await mutateSupabaseUserFromRequest(req, String(req.params.id || ''), action, reason);
    if (!user) return res.status(503).json({ ok: false, error: 'DATABASE_AUTHORITY_UNAVAILABLE' });
    res.json({ ok: true, user: { id: user.id, email: user.email, role: user.role, accountStatus: user.account_status, verified: user.verified }, source: 'supabase' });
  });

  app.patch('/api/admin/users/:id/verify', async (req, res) => {
    if (!verifySessionTokenFromRequest(req)) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED_SESSION' });
    const verified = req.body?.verified === true;
    const reason = String(req.body?.reason || '').trim();
    if (reason.length < 5) return res.status(400).json({ ok: false, error: 'AUDIT_REASON_REQUIRED' });
    const user = await mutateSupabaseUserFromRequest(req, String(req.params.id || ''), verified ? 'verify' : 'unverify', reason);
    if (!user) return res.status(503).json({ ok: false, error: 'DATABASE_AUTHORITY_UNAVAILABLE' });
    res.json({ ok: true, user: { id: user.id, email: user.email, role: user.role, accountStatus: user.account_status, verified: user.verified }, source: 'supabase' });
  });

  // ============================================================================
  // 12. AUTHORITATIVE NOTIFICATION MANAGEMENT & SEGMENT BROADCAST (/api/notifications)
  // ============================================================================
  app.get('/api/notifications', (req, res) => {
    const claims = verifySessionTokenFromRequest(req);
    if (!claims) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED_SESSION' });
    const isAdmin = claims.role === 'admin' && hasCurrentAdminSession(claims);
    if (claims.role === 'admin' && !isAdmin) return res.status(403).json({ ok: false, error: 'FORBIDDEN_ADMIN_ONLY' });
    // Caller-provided role and userId are presentation hints only. Authorization
    // and personal notification scope always come from the signed session.
    const roleFilter = isAdmin ? 'admin' : claims.role;
    const userIdFilter = claims.userId.trim();

    const store = loadAuthoritativeStore();
    const visible = store.notifications
      .filter((n) => {
        if (roleFilter === 'admin') return true;
        if (n.recipientUserId && userIdFilter && n.recipientUserId === userIdFilter) return true;
        if (n.recipientUserId && n.recipientUserId !== userIdFilter) return false;
        if (n.targetRole === 'all_users') return true;
        if (
          roleFilter === 'customer' &&
          (n.targetRole === 'customer' || n.targetRole === 'customers')
        ) {
          return true;
        }
        if (
          roleFilter === 'provider' &&
          (n.targetRole === 'provider' || n.targetRole === 'providers')
        ) {
          return true;
        }
        return false;
      })
      .map((n) => ({
        ...n,
        read: n.read || (userIdFilter ? n.readByUserIds.includes(userIdFilter) : false),
      }));

    res.json({
      ok: true,
      notifications: visible,
      campaigns: isAdmin ? store.notificationCampaigns : [],
    });
  });

  // Development-safe automated FAQ response. It returns the reply to the
  // authenticated customer and records an in-app notification; no WhatsApp
  // provider or outbound message is invoked by this endpoint.
  app.post('/api/whatsapp/faq-reply', (req, res) => {
    if (IS_PRODUCTION_RUNTIME) return res.status(503).json({ ok: false, error: 'WHATSAPP_PROVIDER_NOT_CONFIGURED' });
    const claims = verifySessionTokenFromRequest(req);
    if (!claims) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED_SESSION' });
    if (claims.role !== 'customer') return res.status(403).json({ ok: false, error: 'CUSTOMER_SESSION_REQUIRED' });
    const question = String(req.body?.question || '').trim();
    if (!question || question.length > 500) return res.status(400).json({ ok: false, error: 'FAQ_QUESTION_REQUIRED' });
    const reply = buildWhatsAppFaqReply(question);
    const store = loadAuthoritativeStore();
    appendAuthoritativeNotification(store, {
      recipientUserId: claims.userId,
      targetRole: 'customer',
      title: 'WhatsApp FAQ message',
      message: reply,
      type: 'booking',
    });
    saveAuthoritativeStore(store);
    res.json({ ok: true, automated: true, channel: 'whatsapp', delivery: 'api_response', reply });
  });

  app.post('/api/notifications/send', (req, res) => {
    const claims = verifySessionTokenFromRequest(req);
    const store = loadAuthoritativeStore();

    if (claims) {
      const blocked = findBlockedUserInStore(store, claims.userId, claims.email);
      if (blocked) {
        res.status(403).json({ ok: false, error: 'ACCOUNT_BLOCKED' });
        return;
      }
    }

    const {
      title,
      message,
      type,
      targetRole,
      recipientUserId,
      linkId,
      activitySegment,
      channel,
      scheduledFor,
      recordCampaign,
    } = req.body || {};

    const cleanTitle = String(title || '').trim();
    const cleanMsg = String(message || '').trim();
    if (!cleanTitle || !cleanMsg) {
      res.status(400).json({ ok: false, error: 'TITLE_AND_MESSAGE_REQUIRED' });
      return;
    }

    const normalizedTarget = (
      ['all_users', 'all', 'customer', 'customers', 'provider', 'providers', 'admin', 'vip_subscribers'].includes(
        String(targetRole || '')
      )
        ? String(targetRole) === 'all'
          ? 'all_users'
          : String(targetRole)
        : 'all_users'
    ) as AuthoritativeNotificationRecord['targetRole'];

    if (!claims) {
      res.status(401).json({ ok: false, error: 'UNAUTHORIZED_SESSION' });
      return;
    }
    if (!hasCurrentAdminSession(claims)) {
      res.status(403).json({
        ok: false,
        error: 'FORBIDDEN_ADMIN_ONLY',
        message: 'Only administrators can broadcast notifications or dispatch campaigns.',
      });
      return;
    }

    const createdNotif = appendAuthoritativeNotification(store, {
      title: cleanTitle,
      message: cleanMsg,
      type: type || 'approval',
      targetRole: normalizedTarget,
      recipientUserId: recipientUserId ? String(recipientUserId) : undefined,
      linkId: linkId ? String(linkId) : undefined,
    });

    let createdCampaign: AuthoritativeNotificationCampaign | null = null;
    if (recordCampaign || activitySegment || channel) {
      const isScheduled = Boolean(scheduledFor && scheduledFor !== 'Immediate');
      createdCampaign = {
        id: `NOTIF-${Math.floor(1000 + Math.random() * 9000)}`,
        title: cleanTitle,
        message: cleanMsg,
        segmentRole: normalizedTarget,
        activitySegment: String(activitySegment || 'active_7d'),
        channel: String(channel || 'Push + In-App'),
        scheduledFor: String(scheduledFor || 'Immediate'),
        sentAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status: isScheduled ? 'Scheduled' : 'Dispatched',
        reachCount:
          normalizedTarget === 'all_users'
            ? Math.max(1738, store.users.length)
            : normalizedTarget === 'customers' || normalizedTarget === 'customer'
            ? 1420
            : 298,
      };
      store.notificationCampaigns.unshift(createdCampaign);
    }

    saveAuthoritativeStore(store);

    res.status(201).json({
      ok: true,
      notification: createdNotif,
      campaign: createdCampaign,
      notifications: store.notifications,
      campaigns: store.notificationCampaigns,
    });
  });

  app.post('/api/notifications/read', (req, res) => {
    const claims = verifySessionTokenFromRequest(req);
    if (!claims) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED_SESSION' });
    const isAdmin = claims.role === 'admin' && hasCurrentAdminSession(claims);
    if (claims.role === 'admin' && !isAdmin) return res.status(403).json({ ok: false, error: 'FORBIDDEN_ADMIN_ONLY' });
    const { id, notificationId } = req.body || {};
    const effectiveUserId = claims.userId.trim();
    const cleanId = String(notificationId || id || '').trim();

    const store = loadAuthoritativeStore();
    const target = store.notifications.find((n) => n.id === cleanId);
    if (target && (isAdmin || !target.recipientUserId || target.recipientUserId === effectiveUserId)) {
      target.read = true;
      if (!target.readByUserIds.includes(effectiveUserId)) {
        target.readByUserIds.push(effectiveUserId);
      }
      saveAuthoritativeStore(store);
    }
    res.json({ ok: true, id: cleanId });
  });

  app.post('/api/notifications/clear', (req, res) => {
    const claims = verifySessionTokenFromRequest(req);
    if (!claims) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED_SESSION' });
    const isAdmin = claims.role === 'admin' && hasCurrentAdminSession(claims);
    if (claims.role === 'admin' && !isAdmin) return res.status(403).json({ ok: false, error: 'FORBIDDEN_ADMIN_ONLY' });
    const store = loadAuthoritativeStore();
    if (isAdmin) {
      store.notifications = [];
    } else {
      // A user can clear only notifications explicitly addressed to them.
      // Broadcast records are shared and remain available to other users.
      store.notifications = store.notifications.filter((n) => n.recipientUserId !== claims.userId);
    }
    saveAuthoritativeStore(store);
    res.json({ ok: true, notifications: store.notifications });
  });

  // ============================================================================
  // 12B. HOME & LOCAL SERVICES BOOKING LIFECYCLE (/api/services/*)
  // ============================================================================
  if (serviceBookingRepository) {
    registerServiceBookingApi(app, {
      repository: serviceBookingRepository,
      verifySession: verifySessionTokenFromRequest,
      env: process.env,
    });
  }

  // Shared provider portal read model. This endpoint is database-backed and
  // fails closed when the local migration/database is unavailable.
  registerProviderOperationsApi(app, {
    verifySession: verifySessionTokenFromRequest,
    env: process.env,
  });
  registerServiceDispatchApi(app, {
    verifySession: verifySessionTokenFromRequest,
    env: process.env,
  });

  // Real slot availability, provider schedule/profile and server-verified UPI
  // settlement. Fails closed with 503 when PostgreSQL is not configured.
  registerServiceCommerceApi(app, {
    verifySession: verifySessionTokenFromRequest,
    env: process.env,
  });

  // ============================================================================
  // 12C. CLASSES & TRAINING BATCH + ENROLLMENT LIFECYCLE (/api/classes/*)
  // ============================================================================
  if (classEnrollmentRepository) {
    registerClassEnrollmentApi(app, {
      repository: classEnrollmentRepository,
      verifySession: verifySessionTokenFromRequest,
    });
  }

  // Institute Owner workspace. Membership, branch scope and permissions are
  // checked by the repository and again by PostgreSQL RLS for every mutation.
  if (instituteWorkspaceRepository) {
    registerInstituteWorkspaceApi(app, {
      repository: instituteWorkspaceRepository,
      verifySession: verifySessionTokenFromRequest,
    });
  } else {
    app.use('/api/institute', (_request, response) => {
      response.status(503).json({ ok: false, error: 'DATABASE_REQUIRED_FOR_INSTITUTE_WORKSPACE' });
    });
  }

  // ============================================================================
  // 13. PROVIDER PERMISSIONS & LISTING OWNERSHIP ENFORCEMENT (/api/provider/listings)
  // ============================================================================
  if (providerListingRepository) {
    registerProviderListingsApi(app, {
      repository: providerListingRepository,
      verifySession: verifySessionTokenFromRequest,
    });
  } else {
  app.get('/api/provider/listings', (req, res) => {
    const claims = verifySessionTokenFromRequest(req);
    const store = loadAuthoritativeStore();

    if (claims) {
      const blocked = findBlockedUserInStore(store, claims.userId, claims.email);
      if (blocked) {
        res.status(403).json({ ok: false, error: 'ACCOUNT_BLOCKED' });
        return;
      }
    }

    const allProviderListings = Object.values(store.providerListings);
    if (!claims || claims.role === 'admin') {
      res.json({ ok: true, listings: allProviderListings });
      return;
    }

    const ownListings = allProviderListings.filter(
      (l) => l.ownerUserId === claims.userId || l.providerId === claims.providerId
    );
    res.json({ ok: true, listings: ownListings });
  });

  app.post('/api/provider/listings', (req, res) => {
    const claims = verifySessionTokenFromRequest(req);
    if (!claims) {
      res.status(401).json({ ok: false, error: 'UNAUTHORIZED_SESSION' });
      return;
    }

    const store = loadAuthoritativeStore();
    const blocked = findBlockedUserInStore(store, claims.userId, claims.email);
    if (blocked) {
      res.status(403).json({
        ok: false,
        error: 'ACCOUNT_BLOCKED',
        message: 'Suspended or blocked accounts cannot create listings.',
      });
      return;
    }

    if (claims.role !== 'provider' && claims.role !== 'admin') {
      res.status(403).json({
        ok: false,
        error: 'FORBIDDEN_PROVIDER_ROLE_REQUIRED',
        message: 'Only Provider or Admin accounts can create provider listings.',
      });
      return;
    }

    const body = req.body || {};
    const listingId = String(body.id || `list-${Date.now()}`);
    const record: AuthoritativeProviderListingRecord = {
      id: listingId,
      title: String(body.title || 'Provider Listing').trim(),
      categoryId: String(body.categoryId || 'pg-boys'),
      subcategory: String(body.subcategory || 'General'),
      price: Number(body.price) || 0,
      providerId: String(claims.providerId || `prov-${claims.userId.toLowerCase()}`),
      ownerUserId: claims.userId,
      providerName: String(body.providerName || claims.name || 'Verified Provider'),
      providerPhone: String(body.providerPhone || claims.phone || '+91 98480 22338'),
      status: claims.role === 'admin' && body.status === 'active' ? 'active' : 'pending_approval',
      // The JSON compatibility store cannot perform a fresh database check.
      // Protected fields therefore require the signed Super Admin scope; a
      // normal admin/provider token cannot self-feature or self-verify here.
      isFeatured: claims.role === 'admin' && (claims as { scope?: string }).scope === 'super_admin' && Boolean(body.isFeatured),
      isVerified: claims.role === 'admin' && (claims as { scope?: string }).scope === 'super_admin',
      updatedAt: new Date().toISOString(),
      payload: body.payload || {},
    };

    store.providerListings[listingId] = record;

    appendAuthoritativeNotification(store, {
      targetRole: 'admin',
      title: '🛡️ Provider Listing Submitted for Review',
      message: `"${record.title}" submitted by ${record.providerName} (${record.providerId})`,
      type: 'approval',
      linkId: record.id,
    });

    saveAuthoritativeStore(store);
    res.status(201).json({ ok: true, listing: record });
  });

  app.patch('/api/provider/listings/:id', (req, res) => {
    const claims = verifySessionTokenFromRequest(req);
    if (!claims) {
      res.status(401).json({ ok: false, error: 'UNAUTHORIZED_SESSION' });
      return;
    }

    const store = loadAuthoritativeStore();
    const blocked = findBlockedUserInStore(store, claims.userId, claims.email);
    if (blocked) {
      res.status(403).json({ ok: false, error: 'ACCOUNT_BLOCKED' });
      return;
    }

    const listingId = String(req.params.id || '').trim();
    const existing = store.providerListings[listingId];
    if (!existing) {
      res.status(404).json({ ok: false, error: 'LISTING_NOT_FOUND' });
      return;
    }

    const isOwner =
      existing.ownerUserId === claims.userId ||
      (claims.providerId && existing.providerId === claims.providerId);

    if (!isOwner && claims.role !== 'admin') {
      res.status(403).json({
        ok: false,
        error: 'FORBIDDEN_NOT_LISTING_OWNER',
        message: `Provider "${claims.userId}" cannot modify listing "${listingId}" owned by "${existing.ownerUserId}".`,
      });
      return;
    }

    // Prevent non-admin providers from self-approving their own pending_approval listing
    const updates = req.body || {};
    if (updates.status === 'active' && claims.role !== 'admin' && existing.status !== 'active') {
      res.status(403).json({
        ok: false,
        error: 'FORBIDDEN_ADMIN_APPROVAL_REQUIRED',
        message: 'Only an Administrator can approve a pending listing to go live.',
      });
      return;
    }

    if (updates.title !== undefined) existing.title = String(updates.title);
    if (updates.price !== undefined) existing.price = Number(updates.price);
    if (updates.isFeatured !== undefined && claims.role === 'admin' && (claims as { scope?: string }).scope === 'super_admin') {
      existing.isFeatured = Boolean(updates.isFeatured);
    }
    if (updates.status !== undefined && (claims.role === 'admin' || updates.status !== 'active')) {
      existing.status = updates.status;
    }
    if (updates.isVerified !== undefined && claims.role === 'admin' && (claims as { scope?: string }).scope === 'super_admin') {
      existing.isVerified = Boolean(updates.isVerified);
    }
    existing.updatedAt = new Date().toISOString();

    saveAuthoritativeStore(store);
    res.json({ ok: true, listing: existing });
  });

  app.delete('/api/provider/listings/:id', (req, res) => {
    const claims = verifySessionTokenFromRequest(req);
    if (!claims) {
      res.status(401).json({ ok: false, error: 'UNAUTHORIZED_SESSION' });
      return;
    }

    const store = loadAuthoritativeStore();
    const blocked = findBlockedUserInStore(store, claims.userId, claims.email);
    if (blocked) {
      res.status(403).json({ ok: false, error: 'ACCOUNT_BLOCKED' });
      return;
    }

    const listingId = String(req.params.id || '').trim();
    const existing = store.providerListings[listingId];
    if (!existing) {
      res.status(404).json({ ok: false, error: 'LISTING_NOT_FOUND' });
      return;
    }

    const isOwner =
      existing.ownerUserId === claims.userId ||
      (claims.providerId && existing.providerId === claims.providerId);

    if (!isOwner && claims.role !== 'admin') {
      res.status(403).json({
        ok: false,
        error: 'FORBIDDEN_NOT_LISTING_OWNER',
        message: 'Providers can only delete their own listings.',
      });
      return;
    }

    delete store.providerListings[listingId];
    saveAuthoritativeStore(store);
    res.json({ ok: true, deletedId: listingId });
  });
  }

  // ============================================================================
  // 14. ALL 17 ADMIN MODULES AUTHORITATIVE STATE SYNC (/api/admin/modules)
  // ============================================================================
  const ALL_17_ADMIN_MODULE_IDS = [
    'user_management',
    'payment_management',
    'ad_management',
    'analytics_performance',
    'reports_analytics',
    'theme_management',
    'integrations',
    'data_management',
    'announcements_status',
    'dashboard',
    'content_management',
    'listings_venues',
    'bookings_events',
    'feature_management',
    'audit_logs',
    'notifications_mgmt',
    'app_settings',
  ] as const;

  if (!platformSettingsRepository) app.get('/api/admin/modules', (_req, res) => {
    const claims = verifySessionTokenFromRequest(_req);
    if (!claims) {
      res.status(401).json({ ok: false, error: 'UNAUTHORIZED_SESSION' });
      return;
    }
    if (!hasCurrentAdminSession(claims)) {
      res.status(403).json({ ok: false, error: 'FORBIDDEN_ADMIN_ONLY' });
      return;
    }
    const store = loadAuthoritativeStore();
    res.json({
      ok: true,
      supportedModules: ALL_17_ADMIN_MODULE_IDS,
      moduleCount: ALL_17_ADMIN_MODULE_IDS.length,
      modules: store.adminModules,
    });
  });

  if (!platformSettingsRepository) app.put('/api/admin/modules/:moduleKey', (req, res) => {
    const claims = verifySessionTokenFromRequest(req);
    if (!claims) {
      res.status(401).json({ ok: false, error: 'UNAUTHORIZED_SESSION' });
      return;
    }
    if (!hasCurrentAdminSession(claims)) {
      res.status(403).json({
        ok: false,
        error: 'FORBIDDEN_ADMIN_ONLY',
        message: 'Only Super Admin accounts can modify enterprise admin module configurations.',
      });
      return;
    }

    const moduleKey = String(req.params.moduleKey || '').trim();
    if (!moduleKey) {
      res.status(400).json({ ok: false, error: 'MISSING_MODULE_KEY' });
      return;
    }

    const store = loadAuthoritativeStore();
    store.adminModules[moduleKey] = {
      payload: req.body?.payload ?? req.body,
      updatedBy: claims?.name || claims?.userId || 'Super Admin',
      updatedAt: new Date().toISOString(),
    };
    saveAuthoritativeStore(store);

    res.json({
      ok: true,
      moduleKey,
      moduleState: store.adminModules[moduleKey],
    });
  });

  // Showtimes-only Movies directory (no seats, booking, payments or tickets).
  registerMoviesShowtimesApi(app, {
    pool: pgRuntimePool,
    verifySession: (request) => verifySessionTokenFromRequest(request),
    env: process.env,
  });

  // ============================================================================
  // 15. AUTHORITATIVE MOVIES & CINEMA ENGINE (/api/movies/*)
  //     - Screens, Seat Layouts, Showtimes & Cinema-Specific Cancellation Policies
  //     - Atomic Ticket Cancellation, Seat Lock Release & Refund Ledger
  //     - Customer Support / Dispute Tickets & Cinema Audit Logs
  // ============================================================================
  interface CinemaScreenConfig {
    screenId: string;
    listingId: string;
    cinemaName: string;
    screenName: string;
    soundFormat: string;
    projectionFormat: string;
    showtimes: string[];
    cancellationCutoffMins: number;
    refundPercent: number;
    fnbDeliveryEnabled: boolean;
    wheelchairSeats: string[];
    seatTiers: Array<{
      id: string;
      name: string;
      priceMultiplier: number;
      rows: string[];
      seatsPerRow: number;
    }>;
    updatedAt: string;
  }

  const DEFAULT_CINEMA_SCREENS: CinemaScreenConfig[] = [
    {
      screenId: 'scr-amb-1',
      listingId: 'movie-hyd-1',
      cinemaName: 'AMB Cinemas Gachibowli',
      screenName: 'Screen 1 · Barco Flagship Laser & VIP M-Lounge',
      soundFormat: 'Dolby Atmos 64-Ch',
      projectionFormat: 'Barco 4K RGB Laser',
      showtimes: ['10:30 AM', '01:45 PM', '04:50 PM', '07:55 PM', '10:55 PM'],
      cancellationCutoffMins: 120,
      refundPercent: 80,
      fnbDeliveryEnabled: true,
      wheelchairSeats: ['A1', 'A8'],
      seatTiers: [
        { id: 'recliner', name: 'VIP M-Lounge Recliner', priceMultiplier: 1.5, rows: ['A', 'B'], seatsPerRow: 8 },
        { id: 'prime', name: 'Prime Executive 4K', priceMultiplier: 1.0, rows: ['C', 'D', 'E', 'F'], seatsPerRow: 10 },
        { id: 'classic', name: 'Classic Balcony', priceMultiplier: 0.75, rows: ['G', 'H'], seatsPerRow: 10 },
      ],
      updatedAt: '2026-10-30T08:00:00.000Z',
    },
    {
      screenId: 'scr-prasads-pcx',
      listingId: 'movie-hyd-2',
      cinemaName: 'Prasads Multiplex PCX',
      screenName: 'PCX Giant Screen (64ft x 101ft Dual 4K)',
      soundFormat: 'QSC Dolby Atmos',
      projectionFormat: 'Dual Christie 4K 3D',
      showtimes: ['08:15 AM', '11:30 AM', '02:45 PM', '06:15 PM', '09:45 PM'],
      cancellationCutoffMins: 180,
      refundPercent: 75,
      fnbDeliveryEnabled: true,
      wheelchairSeats: ['A1', 'A8'],
      seatTiers: [
        { id: 'recliner', name: 'PCX Lounger Pod', priceMultiplier: 1.5, rows: ['A', 'B'], seatsPerRow: 8 },
        { id: 'prime', name: 'PCX Prime Eye-Level', priceMultiplier: 1.0, rows: ['C', 'D', 'E', 'F'], seatsPerRow: 10 },
        { id: 'classic', name: 'Classic Orchestra', priceMultiplier: 0.75, rows: ['G', 'H'], seatsPerRow: 10 },
      ],
      updatedAt: '2026-10-30T08:00:00.000Z',
    },
    {
      screenId: 'scr-aaa-epiq',
      listingId: 'movie-hyd-3',
      cinemaName: 'AAA Cinemas Ameerpet',
      screenName: 'Screen 1 · EPIQ Giant Format & LED Lounge',
      soundFormat: 'Dolby Atmos Immersive',
      projectionFormat: 'EPIQ 4K Laser',
      showtimes: ['10:00 AM', '01:15 PM', '04:30 PM', '07:45 PM', '10:45 PM'],
      cancellationCutoffMins: 120,
      refundPercent: 80,
      fnbDeliveryEnabled: true,
      wheelchairSeats: ['A1', 'A8'],
      seatTiers: [
        { id: 'recliner', name: 'Sky Lounge Recliner', priceMultiplier: 1.5, rows: ['A', 'B'], seatsPerRow: 8 },
        { id: 'prime', name: 'EPIQ Prime Gold', priceMultiplier: 1.0, rows: ['C', 'D', 'E', 'F'], seatsPerRow: 10 },
        { id: 'classic', name: 'Executive Silver', priceMultiplier: 0.75, rows: ['G', 'H'], seatsPerRow: 10 },
      ],
      updatedAt: '2026-10-30T08:00:00.000Z',
    },
    {
      screenId: 'scr-sudarshan-35mm',
      listingId: 'movie-hyd-4',
      cinemaName: 'Sudarshan 35MM Cinemas',
      screenName: 'Main Auditorium · 4K RGB Laser Mass Hub',
      soundFormat: 'Dolby Atmos Thunder',
      projectionFormat: '4K RGB Laser',
      showtimes: ['11:00 AM', '02:15 PM', '06:00 PM', '09:30 PM'],
      cancellationCutoffMins: 60,
      refundPercent: 85,
      fnbDeliveryEnabled: false,
      wheelchairSeats: ['A1', 'A8'],
      seatTiers: [
        { id: 'recliner', name: 'Upper Balcony Dress Circle', priceMultiplier: 1.4, rows: ['A', 'B'], seatsPerRow: 8 },
        { id: 'prime', name: 'Royal Balcony', priceMultiplier: 1.0, rows: ['C', 'D', 'E', 'F'], seatsPerRow: 10 },
        { id: 'classic', name: 'First Class Stall', priceMultiplier: 0.75, rows: ['G', 'H'], seatsPerRow: 10 },
      ],
      updatedAt: '2026-10-30T08:00:00.000Z',
    },
    {
      screenId: 'scr-binge-private',
      listingId: 'movie-hyd-5',
      cinemaName: 'Binge Celebration Theatres',
      screenName: 'Private Luxury Pod · 135" 4K Dolby Atmos',
      soundFormat: 'Dolby Atmos 7.1.4',
      projectionFormat: '135" 4K Cinema Screen',
      showtimes: ['10:00 AM', '01:30 PM', '05:00 PM', '08:30 PM'],
      cancellationCutoffMins: 240,
      refundPercent: 90,
      fnbDeliveryEnabled: true,
      wheelchairSeats: ['A1', 'A8'],
      seatTiers: [
        { id: 'recliner', name: 'Private VIP Celebration Pod', priceMultiplier: 1.2, rows: ['A', 'B'], seatsPerRow: 8 },
        { id: 'prime', name: 'Luxury Lounge Sofa', priceMultiplier: 1.0, rows: ['C', 'D', 'E', 'F'], seatsPerRow: 10 },
        { id: 'classic', name: 'Companion Seating', priceMultiplier: 0.85, rows: ['G', 'H'], seatsPerRow: 10 },
      ],
      updatedAt: '2026-10-30T08:00:00.000Z',
    },
  ];

  const DEFAULT_MOVIE_PROMOS = [
    {
      code: 'BOSMOVIE100',
      title: 'Flat ₹100 Off on 2+ Movie Tickets',
      description: 'Valid on all BookOurSpace multiplex & PCX bookings with 2 or more seats',
      minAmount: 300,
      flatDiscount: 100,
      percentDiscount: 0,
      maxDiscount: 100,
    },
    {
      code: 'BOSFIRST',
      title: '15% Instant Savings (Up to ₹150)',
      description: 'Special BookOurSpace Direct UPI verified booking offer',
      minAmount: 200,
      flatDiscount: 0,
      percentDiscount: 15,
      maxDiscount: 150,
    },
    {
      code: 'RECLINER20',
      title: '20% Off on VIP Recliner & F&B Combos',
      description: 'Applicable on orders above ₹500 including snacks or recliner seats',
      minAmount: 500,
      flatDiscount: 0,
      percentDiscount: 20,
      maxDiscount: 200,
    },
  ];

  function getCinemaModuleStore(store: AuthoritativeStore) {
    if (!store.adminModules.movies_cinema_engine) {
      store.adminModules.movies_cinema_engine = {
        screens: DEFAULT_CINEMA_SCREENS,
        promos: DEFAULT_MOVIE_PROMOS,
        refunds: [],
        supportTickets: [],
        auditLogs: [
          {
            id: 'MOV-AUD-101',
            timestamp: new Date().toISOString(),
            actor: 'System Architecture',
            role: 'admin',
            action: 'INITIALIZED_CINEMA_ENGINE',
            details: 'Loaded 5 Hyderabad multiplex screens, seat layouts, and cancellation policies.',
          },
        ],
      };
    }
    const engine = store.adminModules.movies_cinema_engine;
    if (!Array.isArray(engine.screens) || engine.screens.length === 0) {
      engine.screens = DEFAULT_CINEMA_SCREENS;
    }
    if (!Array.isArray(engine.promos) || engine.promos.length === 0) {
      engine.promos = DEFAULT_MOVIE_PROMOS;
    }
    if (!Array.isArray(engine.refunds)) engine.refunds = [];
    if (!Array.isArray(engine.supportTickets)) engine.supportTickets = [];
    if (!Array.isArray(engine.auditLogs)) engine.auditLogs = [];
    return engine;
  }

  function normalizeCinemaScreenRecord(record: CinemaScreenRecord): any {
    const tiers = Array.isArray(record.tiers) && record.tiers.length > 0
      ? record.tiers
      : (Array.isArray(record.seatTiers) ? record.seatTiers : []).map((tier: any) => ({
          name: tier?.name,
          rows: Array.isArray(tier?.rows) ? tier.rows : [],
          price: tier?.price ?? Math.round(250 * Number(tier?.priceMultiplier ?? 1)),
        }));
    return {
      id: record.screenId,
      screenId: record.screenId,
      listingId: record.listingId,
      cinemaListingId: record.listingId,
      cinemaName: record.cinemaName,
      cinemaTitle: record.cinemaName,
      area: record.area,
      screenName: record.screenName,
      format: record.format,
      projectionFormat: record.format,
      soundFormat: record.soundSystem,
      soundSystem: record.soundSystem,
      totalSeats: record.totalSeats,
      tiers,
      seatTiers: record.seatTiers,
      wheelchairSeats: record.wheelchairSeats,
      showtimes: record.showtimes,
      cancellationAllowed: record.cancellationAllowed,
      cancellationCutoffMins: record.cancellationCutoffMinutes,
      cancellationCutoffMinutes: record.cancellationCutoffMinutes,
      refundPercent: record.refundPercent,
      convenienceFeePerSeat: record.convenienceFeePerSeat,
      gstPercent: record.gstPercent,
      fnbDeliveryEnabled: record.fnbDeliveryEnabled,
      rowVersion: record.rowVersion,
      updatedAt: record.updatedAt,
    };
  }

  function normalizeStoredCinemaScreen(screen: any): any {
    return {
      ...screen,
      id: screen.id || screen.screenId,
      screenId: screen.screenId || screen.id,
      cinemaListingId: screen.cinemaListingId || screen.listingId,
      listingId: screen.listingId || screen.cinemaListingId,
      cinemaTitle: screen.cinemaTitle || screen.cinemaName,
      cinemaName: screen.cinemaName || screen.cinemaTitle,
      area: screen.area || 'Hyderabad',
      format: screen.format || screen.projectionFormat || '4K Laser · Dolby Atmos',
      projectionFormat: screen.projectionFormat || screen.format,
      soundFormat: screen.soundFormat || screen.soundSystem || 'Dolby Atmos',
      soundSystem: screen.soundSystem || screen.soundFormat || 'Dolby Atmos',
      totalSeats: screen.totalSeats || 80,
      tiers: Array.isArray(screen.tiers)
        ? screen.tiers
        : Array.isArray(screen.seatTiers)
        ? screen.seatTiers.map((tier: any) => ({
            name: tier.name,
            rows: tier.rows,
            price: tier.price || Math.round(250 * (tier.priceMultiplier || 1)),
          }))
        : [],
      cancellationAllowed: screen.cancellationAllowed !== undefined ? screen.cancellationAllowed : true,
      cancellationCutoffMins: screen.cancellationCutoffMins ?? screen.cancellationCutoffMinutes ?? 120,
      cancellationCutoffMinutes: screen.cancellationCutoffMinutes ?? screen.cancellationCutoffMins ?? 120,
      convenienceFeePerSeat: screen.convenienceFeePerSeat ?? 28,
      gstPercent: screen.gstPercent ?? 18,
      fnbDeliveryEnabled: screen.fnbDeliveryEnabled === true,
    };
  }

  // 15A. PUBLIC CINEMA DISCOVERY — screens, offers and showtimes only.
  //     Booking records, refunds, support tickets and audit logs are NOT part
  //     of this response: it is anonymous and must never expose customer data.
  app.get('/api/movies/inventory', async (_req, res) => {
    // Keep the explicitly non-production fixture used by local UI/privacy
    // tests. Production discovery never reads or mutates a JSON store.
    if (!IS_PRODUCTION_RUNTIME && !providerListingRepository) {
      const store = loadAuthoritativeStore();
      if (pruneExpiredSeatHolds(store)) saveAuthoritativeStore(store);
      const engine = getCinemaModuleStore(store);
      res.json({
        ok: true,
        screens: engine.screens.map(normalizeStoredCinemaScreen),
        offers: engine.promos,
        promos: engine.promos,
      });
      return;
    }

    if (!providerListingRepository) {
      res.status(503).json({
        ok: false,
        error: 'CINEMA_INVENTORY_UNAVAILABLE',
        message: 'Cinema inventory requires the PostgreSQL listing repository.',
      });
      return;
    }

    let normalizedScreens: any[];
    try {
      // Screen records and showtimes are authoritative PostgreSQL data. An
      // empty catalogue stays empty instead of silently reviving JSON/demo
      // screens in production.
      const records = await providerListingRepository.listPublicCinemaScreens();
      normalizedScreens = records.map(normalizeCinemaScreenRecord);
    } catch {
      res.status(503).json({
        ok: false,
        error: 'CINEMA_INVENTORY_UNAVAILABLE',
        message: 'The PostgreSQL cinema screen inventory is unavailable.',
      });
      return;
    }

    res.json({
      ok: true,
      screens: normalizedScreens,
      // Promotions remain the existing read-only product defaults until a
      // database-backed admin configuration store is approved and installed.
      offers: DEFAULT_MOVIE_PROMOS,
      promos: DEFAULT_MOVIE_PROMOS,
    });
  });

  const isMovieBookingRecord = (booking: AuthoritativeBookingRecord): boolean =>
    booking.listingId.startsWith('movie-') ||
    booking.listingId.startsWith('listing-movie-') ||
    (Array.isArray(booking.seats) && booking.seats.length > 0);

  // Ticket projection for a customer's own history: no name, phone, email or address.
  const customerMovieTicket = (booking: AuthoritativeBookingRecord) => ({
    id: booking.id,
    listingId: booking.listingId,
    listingTitle: booking.listingTitle,
    providerId: booking.providerId,
    scheduledDate: booking.scheduledDate,
    timeSlot: booking.timeSlot,
    showtime: booking.showtime,
    seats: booking.seats || [],
    screenId: booking.screenId,
    screenName: booking.screenName,
    foodAddons: booking.foodAddons || [],
    baseAmount: booking.baseAmount,
    taxAmount: booking.taxAmount,
    discountAmount: booking.discountAmount,
    promoCode: booking.promoCode,
    totalAmount: booking.totalAmount,
    paymentMode: booking.paymentMode,
    paymentStatus: booking.paymentStatus,
    status: booking.status,
    passCode: booking.passCode,
    qrSignature: booking.qrSignature,
    qrPassToken: booking.qrPassToken,
    checkedInAt: booking.checkedInAt,
    cancelledAt: booking.cancelledAt,
    cancellationReason: booking.cancellationReason,
    refundAmount: booking.refundAmount,
    refundStatus: booking.refundStatus,
    createdAt: booking.createdAt,
  });

  // 15A-2. A CUSTOMER'S OWN MOVIE BOOKINGS (session required, own records only).
  app.get('/api/movies/my-bookings', (req, res) => {
    const claims = verifySessionTokenFromRequest(req);
    if (!claims) {
      res.status(401).json({ ok: false, error: 'UNAUTHORIZED_SESSION', message: 'A signed session is required.' });
      return;
    }
    if (claims.role !== 'customer') {
      res.status(403).json({ ok: false, error: 'MOVIE_BOOKINGS_CUSTOMER_ONLY', message: 'Only a customer may read their own movie booking history here.' });
      return;
    }
    const store = loadAuthoritativeStore();
    const bookings = store.bookings
      .filter((booking) => isMovieBookingRecord(booking) && booking.customerUserId === claims.userId)
      .map(customerMovieTicket);
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({ ok: true, bookings });
  });

  // 15A-3. ADMIN MOVIE RECORDS — verified Admin session only (server-side).
  app.get('/api/admin/movies/records', (req, res) => {
    const claims = verifySessionTokenFromRequest(req);
    if (!claims) {
      res.status(401).json({ ok: false, error: 'UNAUTHORIZED_SESSION', message: 'A signed session is required.' });
      return;
    }
    if (claims.role !== 'admin' || !hasCurrentAdminSession(claims)) {
      res.status(403).json({ ok: false, error: 'FORBIDDEN_ADMIN_ONLY', message: 'Bookings, refunds, support tickets and audit logs require a verified Admin session.' });
      return;
    }
    const store = loadAuthoritativeStore();
    const engine = getCinemaModuleStore(store);
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({
      ok: true,
      bookings: store.bookings.filter(isMovieBookingRecord),
      refunds: engine.refunds || [],
      supportTickets: (engine.supportTickets || []).map((ticket: any) => ({
        ...ticket,
        id: ticket.id || ticket.ticketId,
        ticketId: ticket.ticketId || ticket.id,
        description: ticket.description || ticket.message || ticket.subject,
      })),
      auditLogs: (engine.auditLogs || []).map((log: any) => ({
        ...log,
        targetId: log.targetId || log.details || log.id,
        createdAt: log.createdAt || log.timestamp || new Date().toISOString(),
      })),
    });
  });

  // 15B. CINEMA SCREEN WRITES — PostgreSQL only, ownership/assignment checked,
  //      optimistic concurrency + durable audit in the same transaction.
  app.put('/api/movies/screens', async (req, res) => {
    const claims = verifySessionTokenFromRequest(req);
    if (!claims) {
      res.status(401).json({
        ok: false,
        error: 'UNAUTHORIZED_SESSION',
        message: 'Authentication required to manage cinema screens.',
      });
      return;
    }
    if (claims.role !== 'provider' && claims.role !== 'admin') {
      res.status(403).json({
        ok: false,
        error: 'FORBIDDEN_PROVIDER_OR_ADMIN_ONLY',
        message: 'Customer accounts cannot modify cinema screens, seat layouts, or pricing policies.',
      });
      return;
    }
    if (!providerListingRepository) {
      res.status(503).json({
        ok: false,
        error: 'LIVE_EDIT_SECURITY_UNAVAILABLE',
        message: 'Cinema screen edits require the PostgreSQL Live Edit security layer. No screen was changed.',
      });
      return;
    }

    const body = (req.body || {}) as Record<string, unknown>;
    const requestedScreenId = String(body.screenId || body.id || '').trim();
    const requestedListingId = String(body.listingId || body.cinemaListingId || '').trim();

    try {
      const existingRecord = await providerListingRepository.findPublicCinemaScreen(
        requestedScreenId || requestedListingId,
      );
      if (existingRecord) {
        if (requestedScreenId && existingRecord.screenId !== requestedScreenId) {
          res.status(400).json({
            ok: false,
            error: 'SCREEN_TARGET_MISMATCH',
            message: 'The screen and listing identifiers do not refer to the same cinema screen.',
          });
          return;
        }
        if (requestedListingId && existingRecord.listingId !== requestedListingId) {
          res.status(400).json({
            ok: false,
            error: 'SCREEN_TARGET_MISMATCH',
            message: 'The screen and listing identifiers do not refer to the same cinema screen.',
          });
          return;
        }
      } else if (claims.role === 'provider') {
        res.status(403).json({
          ok: false,
          error: 'FORBIDDEN_CINEMA_SCREEN',
          message: 'This cinema screen is not owned by your account or covered by an assignment.',
        });
        return;
      }

      const previous = existingRecord
        ? normalizeCinemaScreenRecord(existingRecord)
        : {
            screenId: requestedScreenId || `scr-${crypto.randomUUID()}`,
            listingId: requestedListingId,
            cinemaName: '',
            screenName: '',
            format: '',
            projectionFormat: '',
            soundFormat: '',
            soundSystem: '',
            showtimes: [],
            cancellationCutoffMins: 0,
            cancellationCutoffMinutes: 0,
            refundPercent: 0,
            convenienceFeePerSeat: 0,
            gstPercent: 0,
            fnbDeliveryEnabled: false,
            wheelchairSeats: [],
            tiers: [],
            seatTiers: [],
            totalSeats: 80,
            cancellationAllowed: true,
          };

      let validated;
      try {
        validated = validateCinemaScreenUpdate(body, previous as Record<string, unknown>);
      } catch (error) {
        if (error instanceof LiveEditValidationError) {
          res.status(400).json({ ok: false, error: error.code, message: error.message });
          return;
        }
        throw error;
      }

      const screenId = existingRecord ? existingRecord.screenId : previous.screenId;
      const listingId = existingRecord ? existingRecord.listingId : (requestedListingId || '');
      if (!listingId) {
        res.status(400).json({
          ok: false,
          error: 'INVALID_CINEMA_FIELDS',
          message: 'A cinema listing id is required for a new screen.',
        });
        return;
      }

      const expectedUpdatedAt = existingRecord
        ? String(body.expectedUpdatedAt || body.updatedAt || '').trim() || undefined
        : undefined;

      const saved = await providerListingRepository.saveCinemaScreen(claims, {
        screenId,
        listingId,
        cinemaName: validated.cinemaName,
        screenName: validated.screenName,
        area: String(body.area || previous.area || 'Hyderabad').trim() || 'Hyderabad',
        format: validated.projectionFormat,
        soundSystem: validated.soundFormat,
        totalSeats: validated.totalSeats,
        tiers: validated.tiers,
        wheelchairSeats: validated.wheelchairSeats,
        showtimes: validated.showtimes,
        cancellationAllowed: validated.cancellationAllowed,
        cancellationCutoffMinutes: validated.cancellationCutoffMins,
        refundPercent: validated.refundPercent,
        convenienceFeePerSeat: validated.convenienceFeePerSeat,
        gstPercent: validated.gstPercent,
        fnbDeliveryEnabled: validated.fnbDeliveryEnabled,
        expectedUpdatedAt,
      });

      res.json({
        ok: true,
        screen: normalizeCinemaScreenRecord(saved.screen),
        auditEventId: saved.auditEventId,
        unchanged: saved.unchanged === true,
      });
    } catch (error: any) {
      const code = String(error?.code || error?.message || 'CINEMA_SCREEN_UPDATE_FAILED');
      const status =
        Number(error?.status) ||
        Number(error?.httpStatus) ||
        (code === 'FORBIDDEN_CINEMA_SCREEN' ? 403 : 500);
      const messages: Record<string, string> = {
        FORBIDDEN_CINEMA_SCREEN: 'This cinema screen is not owned by your account or covered by an assignment.',
        CONCURRENT_MODIFICATION: 'This cinema screen changed after you opened it. Reload before saving.',
        ACTIVE_PROFILE_REQUIRED: 'An active, server-verified profile is required.',
        SESSION_ROLE_MISMATCH: 'The signed session role does not match the current database profile.',
        AUDIT_PERSISTENCE_FAILED: 'The cinema screen change was not saved because its audit event could not be persisted.',
        INVALID_CINEMA_FIELDS: 'One or more cinema screen fields are invalid.',
        CINEMA_SCREEN_NOT_FOUND: 'The cinema screen no longer exists.',
        SUPER_ADMIN_REQUIRED: 'This operation requires a fresh Super Admin check.',
      };
      res.status(status).json({
        ok: false,
        error: code,
        message: messages[code] || 'The cinema screen edit failed. No unconfirmed change was reported.',
      });
    }
  });

  // 15B2. VERIFIED CINEMA OWNERSHIP ASSIGNMENT (Super Admin only).
  app.post('/api/movies/screens/:screenId/owner', async (req, res) => {
    const claims = verifySessionTokenFromRequest(req);
    if (!claims) {
      res.status(401).json({ ok: false, error: 'UNAUTHORIZED_SESSION' });
      return;
    }
    if (claims.role !== 'admin') {
      res.status(403).json({ ok: false, error: 'FORBIDDEN_ADMIN_REQUIRED' });
      return;
    }
    if (!providerListingRepository) {
      res.status(503).json({ ok: false, error: 'LIVE_EDIT_SECURITY_UNAVAILABLE' });
      return;
    }
    if (!Object.prototype.hasOwnProperty.call(req.body || {}, 'ownerUserId')) {
      res.status(400).json({ ok: false, error: 'OWNER_USER_ID_REQUIRED' });
      return;
    }
    const ownerUserId = req.body?.ownerUserId == null ? null : String(req.body.ownerUserId).trim();
    try {
      const result = await providerListingRepository.setCinemaScreenOwner(
        claims,
        String(req.params.screenId || '').trim(),
        ownerUserId,
      );
      res.json({ ok: true, ...result });
    } catch (error: any) {
      const code = String(error?.code || error?.message || 'CINEMA_OWNER_ASSIGNMENT_FAILED');
      const status = Number(error?.status) || Number(error?.httpStatus) || 500;
      res.status(status).json({ ok: false, error: code, message: code });
    }
  });

  // 15C. ATOMIC TICKET CANCELLATION, SEAT LOCK RELEASE & REFUND ENGINE
  app.post('/api/movies/bookings/:id/cancel', (req, res) => {
    const claims = verifySessionTokenFromRequest(req);
    const bookingIdOrPass = String(req.params.id || '').trim();
    const { reason = 'Customer requested cancellation' } = req.body || {};

    if (!claims) {
      res.status(401).json({ ok: false, error: 'UNAUTHORIZED_SESSION', message: 'A signed customer or authorized provider session is required.' });
      return;
    }

    const store = loadAuthoritativeStore();
    const blocked = findBlockedUserInStore(store, claims.userId, claims.email);
    if (blocked) {
      res.status(403).json({ ok: false, error: 'ACCOUNT_BLOCKED' });
      return;
    }

    const booking = store.bookings.find(
      (b) =>
        b.id === bookingIdOrPass ||
        b.passCode.toUpperCase() === bookingIdOrPass.toUpperCase()
    );

    if (!booking) {
      res.status(404).json({
        ok: false,
        error: 'BOOKING_NOT_FOUND',
        message: `Booking "${bookingIdOrPass}" was not found.`,
      });
      return;
    }

    // Ownership is established only by a signed server session. Body phone/session IDs
    // are user input and cannot authorize cancellation.
    const isOwner = Boolean(claims && booking.customerUserId === claims.userId && claims.role === 'customer');
    const isAuthorizedAdmin = Boolean(claims && claims.role === 'admin' && hasCurrentAdminSession(claims));
    const isAuthorizedProvider = Boolean(
      claims && claims.role === 'provider' && claims.providerId && booking.providerId === claims.providerId
    );
    const isProviderOrAdmin = isAuthorizedAdmin || isAuthorizedProvider;

    if (!isOwner && !isProviderOrAdmin) {
      res.status(403).json({
        ok: false,
        error: 'FORBIDDEN_NOT_BOOKING_OWNER',
        message: 'You can only cancel your own movie bookings unless you are an authorized Provider or Admin.',
      });
      return;
    }

    if (booking.status === 'cancelled') {
      res.status(409).json({
        ok: false,
        error: 'ALREADY_CANCELLED',
        message: `Booking ${booking.passCode} has already been cancelled and refunded.`,
      });
      return;
    }

    // Reject cancellation if QR ticket was already scanned at the theatre gate
    const checkInRecord = store.checkedInPasses[booking.passCode];
    if (checkInRecord || booking.checkedInAt) {
      res.status(409).json({
        ok: false,
        error: 'CANNOT_CANCEL_USED_TICKET',
        checkedInAt: checkInRecord?.checkedInAt || booking.checkedInAt,
        message: `Cannot cancel ticket ${booking.passCode} because it was already scanned for theatre entry at ${checkInRecord?.checkedInAt || booking.checkedInAt}.`,
      });
      return;
    }

    // Cancellation does not equal a financial refund. Until a real provider refund
    // workflow is configured, preserve the booking and seat locks for paid bookings.
    if (booking.paymentStatus !== 'pay_later') {
      res.status(503).json({
        ok: false,
        error: 'REFUND_PROVIDER_NOT_CONFIGURED',
        message: 'Cancellation cannot complete because no verified refund provider is configured. The booking and seats were left unchanged.',
      });
      return;
    }

    const engine = getCinemaModuleStore(store);

    // Atomically release all locked seats for this booking so other users can book them immediately
    const releasedSeats: string[] = [];
    if (Array.isArray(booking.seats) && booking.seats.length > 0) {
      const showtimeKey = booking.showtime || booking.timeSlot.split('·')[0].trim();
      for (const seatId of booking.seats) {
        const lockKey = `${booking.listingId}::${booking.scheduledDate}::${showtimeKey}::${seatId}`;
        if (store.seatLocks[lockKey]) {
          delete store.seatLocks[lockKey];
          releasedSeats.push(seatId);
        }
        for (const [k, v] of Object.entries(store.seatLocks)) {
          if (v.bookingId === booking.id && v.seatId === seatId) {
            delete store.seatLocks[k];
            if (!releasedSeats.includes(seatId)) releasedSeats.push(seatId);
          }
        }
      }
    }

    const nowIso = new Date().toISOString();
    booking.status = 'cancelled';
    booking.cancelledAt = nowIso;
    booking.cancellationReason = String(reason);
    const cancellationRecord = {
      id: `MOV-CANCEL-${crypto.randomUUID()}`,
      bookingId: booking.id,
      passCode: booking.passCode,
      releasedSeats,
      reason: String(reason),
      status: 'cancelled_without_payment',
      processedAt: nowIso,
    };
    engine.auditLogs.unshift({
      id: `MOV-AUD-${Date.now().toString().slice(-5)}`,
      timestamp: nowIso,
      createdAt: nowIso,
      actor: claims?.name || booking.customerName || 'Customer',
      role: claims?.role || 'customer',
      action: 'UNPAID_BOOKING_CANCELLED',
      targetId: booking.passCode,
      details: `Cancelled unpaid booking ${booking.passCode} (${booking.listingTitle}). Released seats [${releasedSeats.join(', ')}]. No payment or refund was recorded.`,
    });

    const customerUser = findAuthoritativeUser(store, booking.customerUserId);
    const providerUser = findAuthoritativeUser(store, undefined, booking.providerId);
    appendAuthoritativeNotification(store, {
      recipientUserId: booking.customerUserId,
      targetRole: 'customer',
      title: 'Booking cancelled',
      message: `Pass ${booking.passCode} cancelled. Seats ${releasedSeats.join(', ')} released. No payment or refund was recorded.`,
      type: 'booking',
      linkId: booking.id,
    });
    if (providerUser) {
      appendAuthoritativeNotification(store, {
        recipientUserId: providerUser.id,
        targetRole: 'provider',
        title: 'Booking cancelled',
        message: `Pass ${booking.passCode} for "${booking.listingTitle}" was cancelled. No payment or refund was recorded.`,
        type: 'booking',
        linkId: booking.id,
      });
    }

    if (!saveAuthoritativeStore(store)) {
      res.status(500).json({ ok: false, error: 'CANCELLATION_PERSIST_FAILED', message: 'Cancellation could not be persisted; no cancellation confirmation was issued.' });
      return;
    }

    dispatchAuthoritativeBookingEmails([
      ...(customerUser?.email ? [{
        kind: 'booking_cancelled' as const,
        recipient: customerUser.email,
        recipientName: customerUser.name,
        bookingId: booking.id,
        listingTitle: booking.listingTitle,
        status: booking.status,
        scheduledDate: booking.scheduledDate,
        timeSlot: booking.timeSlot,
        reason: booking.cancellationReason,
      }] : []),
      ...(providerUser?.email ? [{
        kind: 'booking_cancelled' as const,
        recipient: providerUser.email,
        recipientName: providerUser.name,
        bookingId: booking.id,
        listingTitle: booking.listingTitle,
        status: booking.status,
        scheduledDate: booking.scheduledDate,
        timeSlot: booking.timeSlot,
        reason: booking.cancellationReason,
      }] : []),
    ]);

    res.json({
      ok: true,
      booking,
      refund: null,
      cancellation: cancellationRecord,
      releasedSeats,
      message: `Unpaid ticket ${booking.passCode} cancelled. Seats ${releasedSeats.join(', ')} released. No refund was due.`,
    });
  });

  // 15D. CUSTOMER CINEMA SUPPORT & DISPUTE TICKETS
  app.post('/api/movies/support', (req, res) => {
    const claims = verifySessionTokenFromRequest(req);
    const {
      bookingId,
      passCode,
      category,
      issueCategory,
      subject,
      message,
      description,
      customerName,
      customerPhone,
    } = req.body || {};

    const finalSubject = String(subject || issueCategory || category || 'Cinema Support Request').trim();
    const finalMessage = String(message || description || '').trim();

    if (!finalMessage) {
      res.status(400).json({
        ok: false,
        error: 'MESSAGE_REQUIRED',
        message: 'Support ticket description is required.',
      });
      return;
    }

    const store = loadAuthoritativeStore();
    const engine = getCinemaModuleStore(store);
    const nowIso = new Date().toISOString();
    const tId = `SUP-MOV-${Date.now().toString().slice(-6)}`;

    const ticket = {
      id: tId,
      ticketId: tId,
      bookingId: String(bookingId || ''),
      passCode: String(passCode || ''),
      category: String(category || issueCategory || 'refund_status'),
      issueCategory: String(issueCategory || category || 'refund_status'),
      subject: finalSubject,
      message: finalMessage,
      description: finalMessage,
      customerUserId: claims?.userId || 'guest',
      customerName: String(customerName || claims?.name || 'Movie Customer'),
      customerPhone: String(customerPhone || claims?.phone || '+91 98480 12345'),
      status: 'open',
      resolutionNote: '',
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    engine.supportTickets.unshift(ticket);
    engine.auditLogs.unshift({
      id: `MOV-AUD-${Date.now().toString().slice(-5)}`,
      timestamp: nowIso,
      createdAt: nowIso,
      actor: ticket.customerName,
      role: claims?.role || 'customer',
      action: 'CREATED_SUPPORT_TICKET',
      targetId: ticket.id,
      details: `Ticket ${ticket.ticketId} (${ticket.category}): ${ticket.description}`,
    });

    saveAuthoritativeStore(store);
    res.status(201).json({ ok: true, ticket, supportTicket: ticket });
  });

  app.patch('/api/movies/support/:ticketId', (req, res) => {
    const claims = verifySessionTokenFromRequest(req);
    if (claims && claims.role === 'customer') {
      res.status(403).json({
        ok: false,
        error: 'FORBIDDEN_PROVIDER_OR_ADMIN_ONLY',
        message: 'Only Cinema Providers or Admins can resolve support tickets.',
      });
      return;
    }

    const ticketId = String(req.params.ticketId || '').trim();
    const { status = 'resolved', resolutionNote = 'Resolved by Cinema Desk' } = req.body || {};

    const store = loadAuthoritativeStore();
    const engine = getCinemaModuleStore(store);
    const target = engine.supportTickets.find((t: any) => t.ticketId === ticketId || t.id === ticketId);
    if (!target) {
      res.status(404).json({ ok: false, error: 'SUPPORT_TICKET_NOT_FOUND' });
      return;
    }

    target.status = status;
    target.resolutionNote = String(resolutionNote);
    target.updatedAt = new Date().toISOString();

    engine.auditLogs.unshift({
      id: `MOV-AUD-${Date.now().toString().slice(-5)}`,
      timestamp: target.updatedAt,
      createdAt: target.updatedAt,
      actor: claims?.name || claims?.userId || 'Cinema Admin',
      role: claims?.role || 'admin',
      action: 'RESOLVED_SUPPORT_TICKET',
      targetId: ticketId,
      details: `Ticket ${ticketId} marked ${status}: ${resolutionNote}`,
    });

    saveAuthoritativeStore(store);
    res.json({ ok: true, ticket: target, supportTicket: target });
  });

  // Vite dev middleware or production static serving
  const distPath = path.join(__dirname, 'dist');
  const useVitePreviewMiddleware =
    process.env.NODE_ENV !== 'production'
    || (aiStudioPreview && !fs.existsSync(path.join(distPath, 'index.html')));
  if (useVitePreviewMiddleware) {
    const { createServer: createViteServer } = await import('vite');
    // HMR must never fight for a fixed port: honour DISABLE_HMR (tests, CI) and
    // allow an explicit port so parallel runs cannot collide with another process.
    const hmrDisabled = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: { server: httpServer },
        ws: { server: httpServer },
        hmr: hmrDisabled ? false : undefined,
        watch: hmrDisabled ? null : {},
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath, {
      setHeaders: (response, filePath) => {
        const relativePath = path.relative(distPath, filePath).split(path.sep).join('/');
        const fileName = path.basename(filePath);
        if (fileName === 'index.html') {
          response.setHeader('Cache-Control', 'no-cache');
        } else if (/^assets\/.*-[a-f0-9_-]{8,}\.[a-z0-9]+$/i.test(relativePath)) {
          response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else {
          // Public, unhashed brand/media files revalidate daily. Authenticated
          // APIs are registered before static serving and set their own policy.
          response.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
        }
      },
    }));
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // A rejected request must never take the booking server down, and it must
  // never leak an internal message to the browser.
  app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logSafeError('server', 'unhandled request', error);
    if (res.headersSent) return;
    if (String(error?.message || '').startsWith('PERSISTENCE_JSON_STORE_UNAVAILABLE_IN_PRODUCTION')) {
      res.status(503).json({
        ok: false,
        error: 'PERSISTENCE_JSON_STORE_UNAVAILABLE_IN_PRODUCTION',
        message: 'This operation still depends on the legacy JSON compatibility store, which is disabled in production. No data was read or written.',
      });
      return;
    }
    res.status(500).json({ ok: false, error: 'INTERNAL_ERROR', message: 'The request could not be completed. Nothing was charged.' });
  });

  if (process.env.NODE_ENV === 'production' && !aiStudioPreview && process.env.BOS_POSTGRES_LOCAL_TEST_MODE !== 'true') {
    const appUrl = String(process.env.APP_URL || '').trim();
    if (!appUrl) {
      throw new Error('PRODUCTION_APP_URL_REQUIRED');
    }
    let parsedAppUrl: URL;
    try {
      parsedAppUrl = new URL(appUrl);
    } catch {
      throw new Error('PRODUCTION_APP_URL_INVALID');
    }
    if (parsedAppUrl.protocol !== 'https:') {
      throw new Error('PRODUCTION_APP_URL_HTTPS_REQUIRED');
    }
  }

  if (!aiStudioPreview) {
    // Production must target a dedicated production Supabase project. An
    // undeclared target, or one that names the development project, fails
    // closed here — after the persistence and APP_URL gates, and before the
    // listener opens — instead of deploying against development data.
    assertProductionSupabaseEnvironment();
  }

  httpServer.on('error', (error: any) => {
    const code = String(error?.code || 'UNKNOWN').replace(/[^A-Z0-9_]/gi, '').slice(0, 40) || 'UNKNOWN';
    console.error(`[server] HTTP listener failed on 0.0.0.0:${PORT}:`, code);
    process.exit(1);
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`BookOurSpace Full-Stack Server running on http://0.0.0.0:${PORT}`);
  });
  httpServer.on('close', () => {
    void closeSharedPostgresPool();
  });
  if (providerListingRepository) {
    httpServer.on('close', () => {
      void providerListingRepository.close();
    });
  }
  if (serviceBookingRepository) {
    httpServer.on('close', () => {
      void serviceBookingRepository.close();
    });
  }
  if (pgBookingRepository) {
    httpServer.on('close', () => {
      void pgBookingRepository.close();
    });
  }
  if (pgPaymentRepository) {
    httpServer.on('close', () => {
      void pgPaymentRepository.close();
    });
  }
  if (venueBookingRepository) {
    httpServer.on('close', () => {
      void venueBookingRepository.close();
    });
  }
}

startServer().catch((error: any) => {
  const safeReason = String(error?.message || 'STARTUP_FAILED')
    .replace(/postgres(?:ql)?:\/\/\S+/gi, '[redacted-db-url]')
    .replace(/password=\S+/gi, 'password=[redacted]');
  console.error('[server] startup failed:', safeReason);
  process.exit(1);
});
