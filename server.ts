import 'dotenv/config';
import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { resolveSupabaseProjectConfig } from './src/lib/supabaseProjectConfig';
import { GoogleIdentityClaims, verifyGoogleIdTokenClaims } from './src/server/googleIdTokenVerifier';
import {
  DEFAULT_MARKET_SECTION_VISIBILITY,
  isMarketSectionId,
  normalizeMarketSectionVisibility,
} from './src/shared/marketSectionVisibility';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serverSupabaseConfig = resolveSupabaseProjectConfig({
  url: process.env.SUPABASE_URL,
  projectId: process.env.SUPABASE_PROJECT_ID,
  allowedProjectRefs: process.env.SUPABASE_ALLOWED_PROJECT_REFS,
});
const SERVER_SUPABASE_PROJECT_ID = serverSupabaseConfig.projectId;
const SERVER_SUPABASE_URL = serverSupabaseConfig.url;
const serverServiceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const serverSupabase: SupabaseClient | null = serverSupabaseConfig.ok && serverServiceRoleKey
  ? createClient(SERVER_SUPABASE_URL, serverServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
  : null;

function requireServerSupabase(res: express.Response): SupabaseClient | null {
  if (serverSupabase) return serverSupabase;
  res.status(503).json({
    ok: false,
    error: 'BOOKING_DATABASE_UNAVAILABLE',
    message: 'The server-side Supabase database connection is not configured.',
  });
  return null;
}

const GOOGLE_OAUTH_STATE_COOKIE = 'bos_google_oauth_state';
const googleOAuthStates = new Map<string, { role: string; expiresAt: number }>();
let googleJwksCache: { keys?: Array<Record<string, unknown>> } | null = null;
let googleJwksCacheExpiresAt = 0;

function configuredAppOrigin(): string | null {
  const raw = String(process.env.APP_URL || '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const local = ['localhost', '127.0.0.1'].includes(url.hostname);
    if ((!local && url.protocol !== 'https:') || (local && !['http:', 'https:'].includes(url.protocol)) ||
        url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) return null;
    return url.origin;
  } catch {
    return null;
  }
}

async function verifyGoogleIdToken(idToken: string, clientId: string): Promise<GoogleIdentityClaims | null> {
  if (!idToken || !clientId) return null;
  try {
    if (!googleJwksCache || googleJwksCacheExpiresAt <= Date.now()) {
      const response = await fetch('https://www.googleapis.com/oauth2/v3/certs');
      if (!response.ok) return null;
      const keys = await response.json() as { keys?: Array<Record<string, unknown>> };
      if (!Array.isArray(keys.keys)) return null;
      const cacheControl = response.headers.get('cache-control') || '';
      const maxAge = Number(cacheControl.match(/max-age=(\d+)/i)?.[1] || 300);
      googleJwksCache = keys;
      googleJwksCacheExpiresAt = Date.now() + Math.min(Math.max(maxAge, 60), 3600) * 1000;
    }
    return verifyGoogleIdTokenClaims(idToken, clientId, googleJwksCache);
  } catch {
    return null;
  }
}

const DATA_FILE_PATH = path.join(__dirname, 'live-page-config.json');

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
    console.error('Error loading live-page-config.json:', err);
  }
  return {
    published: null,
    draft: null,
    versions: [],
    auditLogs: [],
    billingRecords: DEFAULT_BILLING_RECORDS,
  };
}

function saveServerStore(data: ServerStoreData) {
  try {
    fs.writeFileSync(DATA_FILE_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving live-page-config.json:', err);
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({
    limit: '10mb',
    verify: (req, _res, buffer) => {
      (req as express.Request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
    },
  }));

  // 1. GET Live Page Config (OTA endpoint consumed by Web, Android, and iOS clients)
  app.get('/api/live-page-config', (_req, res) => {
    const store = loadServerStore();
    const latestVersion = store.versions[0] || null;
    res.json({
      ok: true,
      published: store.published,
      draft: store.draft,
      versions: store.versions,
      auditLogs: store.auditLogs,
      otaSync: {
        web: 'synced',
        android: 'synced',
        ios: 'synced',
        activeVersion: latestVersion ? latestVersion.versionId : 'v1.0.0',
        lastPublishedAt: latestVersion ? latestVersion.publishedAt : 'Default Baseline',
      },
    });
  });

  // 2. POST Save Draft (Authorized Admin only)
  app.post('/api/live-page-config/draft', (req, res) => {
    const role = req.headers['x-admin-role'] || req.body?.role;
    if (role !== 'admin') {
      res.status(403).json({
        ok: false,
        error: 'Unauthorized: Only an authenticated Admin can save page editor drafts.',
      });
      return;
    }

    const { config, pageId = 'global', summary = 'Saved draft changes', actor = 'Narendra (Super Admin)' } = req.body || {};
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
      actor,
      role: 'admin',
      action: 'Saved Page Draft',
      pageId,
      details: summary,
    };
    store.auditLogs = [auditEntry, ...store.auditLogs].slice(0, 200);
    saveServerStore(store);

    res.json({
      ok: true,
      draft: store.draft,
      auditLogs: store.auditLogs,
      savedAt: now,
    });
  });

  // 3. POST Publish Live Config across Web, Android, and iOS (Authorized Admin only)
  app.post('/api/live-page-config/publish', (req, res) => {
    const role = req.headers['x-admin-role'] || req.body?.role;
    if (role !== 'admin') {
      res.status(403).json({
        ok: false,
        error: 'Unauthorized: Only an authenticated Admin can publish live page updates.',
      });
      return;
    }

    const {
      config,
      pageId = 'all_pages',
      summary = 'Published live page updates to Web, Android & iOS',
      actor = 'Narendra (Super Admin)',
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
      publishedBy: actor,
    };

    const versionEntry = {
      versionId,
      versionNumber: nextNumber,
      publishedAt: now,
      publishedBy: actor,
      summary,
      platforms: ['Web SPA', 'Android APK/Bundle (OTA)', 'iOS IPA (OTA)'],
      configSnapshot: updatedPublished,
    };

    const auditEntry = {
      id: `AUD-PUB-${Date.now().toString().slice(-5)}`,
      timestamp: now,
      actor,
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
    saveServerStore(store);

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
  app.post('/api/live-page-config/rollback', (req, res) => {
    const role = req.headers['x-admin-role'] || req.body?.role;
    if (role !== 'admin') {
      res.status(403).json({
        ok: false,
        error: 'Unauthorized: Only an authenticated Admin can rollback versions.',
      });
      return;
    }

    const { versionId, actor = 'Narendra (Super Admin)' } = req.body || {};
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
      publishedBy: actor,
    };

    const auditEntry = {
      id: `AUD-RBK-${Date.now().toString().slice(-5)}`,
      timestamp: now,
      actor,
      role: 'admin',
      action: `Rolled Back to ${versionId}`,
      pageId: 'all_pages',
      details: `Restored snapshot "${targetVersion.summary}" (${versionId}) across Web, Android & iOS`,
      versionId,
    };

    store.published = restored;
    store.draft = restored;
    store.auditLogs = [auditEntry, ...store.auditLogs].slice(0, 200);
    saveServerStore(store);

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
      console.error('Gemini Quick Book error, using smart ranker fallback:', error?.message || error);
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

  const AUTH_STORE_FILE_PATH = path.join(__dirname, 'authoritative-marketplace-store.json');
  const configuredHmacSecret = process.env.BOS_SERVER_HMAC_SECRET?.trim();
  if (process.env.NODE_ENV === 'production' && !configuredHmacSecret) {
    throw new Error('BOS_SERVER_HMAC_SECRET must be configured before production startup.');
  }
  const SERVER_HMAC_SECRET = configuredHmacSecret || crypto.randomBytes(32).toString('hex');

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
    userId: string;
    amount: number;
    merchantVpa: string;
    planOrListing: string;
    status: 'created' | 'pending_provider_reconciliation' | 'verified' | 'rejected';
    utrNumber?: string;
    gatewaySignature?: string;
    paymentVerificationToken?: string;
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
    name: string;
    email: string;
    phone: string;
    role: 'customer' | 'provider' | 'admin';
    providerId?: string;
    googleSub?: string;
    avatarUrl?: string;
    authProvider: 'google';
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
    checkedInPasses: Record<string, { checkedInAt: string; checkedInBy: string }>;
    users: AuthoritativeUserRecord[];
    notifications: AuthoritativeNotificationRecord[];
    notificationCampaigns: AuthoritativeNotificationCampaign[];
    providerListings: Record<string, AuthoritativeProviderListingRecord>;
    adminModules: Record<string, any>;
    revokedTokens: Record<string, number>;
  }

  function loadAuthoritativeStore(): AuthoritativeStore {
    try {
      if (fs.existsSync(AUTH_STORE_FILE_PATH)) {
        const parsed = JSON.parse(fs.readFileSync(AUTH_STORE_FILE_PATH, 'utf-8'));
        return {
          seatLocks: parsed.seatLocks || {},
          bookings: Array.isArray(parsed.bookings) ? parsed.bookings : [],
          enquiries: Array.isArray(parsed.enquiries) ? parsed.enquiries : [],
          paymentIntents: parsed.paymentIntents || {},
          usedUtrs: parsed.usedUtrs || {},
          checkedInPasses: parsed.checkedInPasses || {},
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
      console.error('Failed to read authoritative store, initializing clean store:', err);
    }
    return {
      seatLocks: {},
      bookings: [],
      enquiries: [],
      paymentIntents: {},
      usedUtrs: {},
      checkedInPasses: {},
      users: [...INITIAL_SEED_USERS],
      notifications: [...INITIAL_SEED_NOTIFICATIONS],
      notificationCampaigns: [...INITIAL_SEED_CAMPAIGNS],
      providerListings: {},
      adminModules: {},
      revokedTokens: {},
    };
  }

  function saveAuthoritativeStore(store: AuthoritativeStore): boolean {
    try {
      fs.writeFileSync(AUTH_STORE_FILE_PATH, JSON.stringify(store, null, 2), 'utf-8');
      return true;
    } catch (err) {
      console.error('Failed to persist authoritative store:', err);
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
    email?: string;
    name?: string;
    role: 'customer' | 'provider' | 'admin';
    providerId?: string;
    phone?: string;
    authProvider?: 'google';
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
    const withExpiry: SessionClaims = {
      ...claims,
      expiresAt: claims.expiresAt || Date.now() + 7 * 24 * 60 * 60 * 1000,
    };
    const payloadB64 = Buffer.from(JSON.stringify(withExpiry), 'utf-8').toString('base64url');
    const sig = computeHmac(payloadB64, 'SESSION_TOKEN');
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
    if (!rawHeader || !rawHeader.includes('.')) return null;
    const [payloadB64, sig] = rawHeader.split('.');
    if (!payloadB64 || !sig) return null;
    const expectedSig = computeHmac(payloadB64, 'SESSION_TOKEN');
    if (!safeTimingEqualHex(sig, expectedSig)) return null;
    try {
      const parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8')) as SessionClaims;
      if (!parsed || !parsed.userId || !['customer', 'provider', 'admin'].includes(parsed.role)) {
        return null;
      }
      if (parsed.expiresAt && parsed.expiresAt < Date.now()) {
        return null;
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

  const SUPABASE_PROJECT_ID = SERVER_SUPABASE_PROJECT_ID;
  const SUPABASE_PROJECT_URL = SERVER_SUPABASE_URL;
  const SUPABASE_AUTH_CALLBACK_URL = SUPABASE_PROJECT_URL
    ? `${SUPABASE_PROJECT_URL}/auth/v1/callback`
    : '';

  function authenticateOrRegisterGoogleUser(params: {
    email: string;
    name?: string;
    googleSub?: string;
    avatarUrl?: string;
    phone?: string;
    requestedRole?: string;
    allowRoleChange?: boolean;
    city?: string;
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
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return {
        ok: false,
        status: 400,
        error: 'INVALID_GOOGLE_EMAIL',
        message: 'A valid Google account email address is required for Google OAuth sign-in.',
      };
    }

    const store = loadAuthoritativeStore();
    const cleanSub = String(params.googleSub || `google-${cleanEmail}`).trim();
    const nowIso = new Date().toISOString();

    const adminAllowlist = new Set([
      'admin@bookourspace.in',
      'monapatisravya28@gmail.com',
      ...(process.env.BOS_ADMIN_EMAILS
        ? process.env.BOS_ADMIN_EMAILS.split(',').map((e) => e.trim().toLowerCase())
        : []),
    ]);

    // Check if user already exists by googleSub or email
    const existingUser = store.users.find(
      (u) =>
        u.email.toLowerCase() === cleanEmail ||
        (cleanSub && u.googleSub && u.googleSub === cleanSub)
    );

    if (existingUser) {
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
      if (reqRole === 'admin' && existingUser.role !== 'admin' && !adminAllowlist.has(cleanEmail)) {
        return {
          ok: false,
          status: 403,
          error: 'ADMIN_ESCALATION_DENIED',
          message: 'Cannot self-escalate to Admin role. Only authorized administrators have Admin Console access.',
        };
      }

      // Existing user sign-in: preserve existing role and data by default
      existingUser.lastLoginAt = nowIso;
      existingUser.googleSub = existingUser.googleSub || cleanSub;
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
      if (adminAllowlist.has(cleanEmail)) {
        existingUser.role = 'admin';
      } else if (
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

      saveAuthoritativeStore(store);

      const claims: SessionClaims = {
        userId: existingUser.id,
        email: existingUser.email,
        name: existingUser.name,
        role: existingUser.role,
        providerId:
          existingUser.role === 'provider'
            ? existingUser.providerId || `prov-${existingUser.id.toLowerCase()}`
            : undefined,
        phone: existingUser.phone,
        authProvider: 'google',
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

    // Automatic New-User Registration via Google OAuth:
    // Automatically creates a Customer profile ('customer') for new users (unless allowlisted Admin or explicit provider registration)
    const reqRole = String(params.requestedRole || 'customer').toLowerCase();
    if (reqRole === 'admin' && !adminAllowlist.has(cleanEmail)) {
      return {
        ok: false,
        status: 403,
        error: 'ADMIN_ESCALATION_DENIED',
        message: 'New accounts cannot self-register as Admin.',
      };
    }

    const assignedRole: 'customer' | 'provider' | 'admin' = adminAllowlist.has(cleanEmail)
      ? 'admin'
      : params.allowRoleChange === true && reqRole === 'provider'
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
      name: displayName,
      email: cleanEmail,
      phone: (params.phone && params.phone.trim()) || '+91 98480 12345',
      role: assignedRole,
      providerId: assignedRole === 'provider' ? `prov-${newId.toLowerCase()}` : undefined,
      googleSub: cleanSub,
      avatarUrl:
        params.avatarUrl ||
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
      authProvider: 'google',
      verified: true,
      kycDocument: 'Google OAuth 2.0 Verified',
      accountStatus: 'active',
      city: (params.city && params.city.trim()) || 'Hyderabad',
      joinedAt: nowIso.slice(0, 10),
      lastLoginAt: nowIso,
      listingsCount: 0,
      bookingsCount: 0,
      totalSpentOrEarned: 0,
      permissions:
        assignedRole === 'admin'
          ? ['full_admin_access', 'approve_providers', 'manage_payments', 'manage_ads']
          : assignedRole === 'provider'
          ? ['create_listing', 'respond_enquiries', 'receive_payouts']
          : ['book_services', 'post_reviews', 'chat_provider'],
      publishState: 'published',
    };

    store.users.unshift(newUser);

    appendAuthoritativeNotification(store, {
      recipientUserId: newUser.id,
      targetRole: assignedRole === 'provider' ? 'providers' : 'customers',
      title: '🎉 Welcome to BookOurSpace (Google Verified)',
      message: `Account registered automatically via Google OAuth for ${newUser.name} (${newUser.email}) as ${assignedRole.toUpperCase()}.`,
      type: 'approval',
    });

    saveAuthoritativeStore(store);

    const claims: SessionClaims = {
      userId: newUser.id,
      email: newUser.email,
      name: newUser.name,
      role: newUser.role,
      providerId: newUser.providerId,
      phone: newUser.phone,
      authProvider: 'google',
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
  // 1. GOOGLE-ONLY OAUTH 2.0 AND SESSION ENDPOINTS
  // ============================================================================

  // 1A. Google authorization-code flow. The server owns the OAuth state and verifies
  // Google's signed ID token before creating an authoritative session.
  app.get('/api/auth/google/url', (req, res) => {
    const appOrigin = configuredAppOrigin();
    const googleClientId = String(process.env.GOOGLE_CLIENT_ID || '').trim();
    const googleClientSecret = String(process.env.GOOGLE_CLIENT_SECRET || '').trim();
    const requestedRole = String(req.query.role || 'customer').toLowerCase();
    if (!serverSupabaseConfig.ok || !appOrigin || !googleClientId || !googleClientSecret ||
        !['customer', 'provider', 'admin'].includes(requestedRole)) {
      res.status(503).json({ ok: false, error: 'GOOGLE_OAUTH_NOT_CONFIGURED' });
      return;
    }

    const state = crypto.randomBytes(32).toString('base64url');
    const expiresAt = Date.now() + 10 * 60 * 1000;
    googleOAuthStates.set(state, { role: requestedRole, expiresAt });
    for (const [knownState, value] of googleOAuthStates) {
      if (value.expiresAt <= Date.now()) googleOAuthStates.delete(knownState);
    }
    const callbackUrl = `${appOrigin}/auth/callback`;
    const secureCookie = appOrigin.startsWith('https://') ? '; Secure' : '';
    res.setHeader('Set-Cookie', `${GOOGLE_OAUTH_STATE_COOKIE}=${state}; HttpOnly; SameSite=Lax; Path=/auth/callback; Max-Age=600${secureCookie}`);
    const params = new URLSearchParams({
      client_id: googleClientId,
      redirect_uri: callbackUrl,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'online',
      prompt: 'select_account',
      state,
    });
    res.json({ ok: true, configured: true, authProvider: 'google', url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`, callbackUrl });
  });

  function sendGoogleOAuthPopupResult(res: express.Response, appOrigin: string, payload: Record<string, unknown>, status = 200) {
    const safePayload = JSON.stringify(payload).replace(/</g, '\\u003c');
    const safeOrigin = JSON.stringify(appOrigin).replace(/</g, '\\u003c');
    res.status(status).type('html').send(`<!doctype html><meta charset="utf-8"><title>Google sign-in</title><script>
      if (window.opener) { window.opener.postMessage(${safePayload}, ${safeOrigin}); window.close(); }
      else { window.location.replace(${safeOrigin}); }
    </script><p>Google sign-in could not be completed. Return to BookOurSpace and try again.</p>`);
  }

  app.get(['/auth/callback', '/auth/callback/'], async (req, res) => {
    const appOrigin = configuredAppOrigin();
    const callbackUrl = appOrigin ? `${appOrigin}/auth/callback` : '';
    const state = String(req.query.state || '').trim();
    const code = String(req.query.code || '').trim();
    const suppliedIdentity = ['email', 'google_email', 'name', 'google_name', 'sub', 'google_sub', 'avatar', 'google_avatar']
      .some((key) => Object.prototype.hasOwnProperty.call(req.query, key));
    const cookieHeader = String(req.headers.cookie || '');
    const stateCookie = cookieHeader.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${GOOGLE_OAUTH_STATE_COOKIE}=`))?.slice(GOOGLE_OAUTH_STATE_COOKIE.length + 1);
    const stateEntry = googleOAuthStates.get(state);
    res.setHeader('Set-Cookie', `${GOOGLE_OAUTH_STATE_COOKIE}=; HttpOnly; SameSite=Lax; Path=/auth/callback; Max-Age=0${appOrigin?.startsWith('https://') ? '; Secure' : ''}`);

    if (!appOrigin || !serverSupabaseConfig.ok || suppliedIdentity || !code || !state || stateCookie !== state || !stateEntry || stateEntry.expiresAt <= Date.now()) {
      if (state) googleOAuthStates.delete(state);
      res.status(400).send('Google sign-in could not be verified. Start sign-in again from BookOurSpace.');
      return;
    }
    googleOAuthStates.delete(state); // one-time state prevents callback replay

    const googleClientId = String(process.env.GOOGLE_CLIENT_ID || '').trim();
    const googleClientSecret = String(process.env.GOOGLE_CLIENT_SECRET || '').trim();
    if (!googleClientId || !googleClientSecret) {
      res.status(503).send('Google sign-in is not configured.');
      return;
    }

    let identity: Awaited<ReturnType<typeof verifyGoogleIdToken>> = null;
    try {
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code, client_id: googleClientId, client_secret: googleClientSecret, redirect_uri: callbackUrl, grant_type: 'authorization_code' }),
      });
      if (tokenResponse.ok) {
        const tokenData: any = await tokenResponse.json();
        identity = await verifyGoogleIdToken(String(tokenData.id_token || ''), googleClientId);
      }
    } catch {
      identity = null;
    }
    if (!identity) {
      sendGoogleOAuthPopupResult(res, appOrigin, { type: 'OAUTH_AUTH_ERROR', error: 'GOOGLE_ID_TOKEN_INVALID', message: 'Google could not verify this sign-in. Please try again.' }, 401);
      return;
    }

    const authResult = authenticateOrRegisterGoogleUser({
      email: identity.email,
      name: identity.name,
      googleSub: identity.sub,
      avatarUrl: identity.picture,
      requestedRole: stateEntry.role,
      allowRoleChange: false,
    });
    if (!authResult.ok) {
      sendGoogleOAuthPopupResult(res, appOrigin, { type: 'OAUTH_AUTH_ERROR', error: authResult.error, accountStatus: authResult.accountStatus, message: authResult.message }, authResult.status);
      return;
    }
    sendGoogleOAuthPopupResult(res, appOrigin, {
      type: 'OAUTH_AUTH_SUCCESS',
      isNewUser: authResult.isNewUser,
      user: authResult.user,
      sessionToken: authResult.sessionToken,
      redirectTarget: authResult.redirectTarget,
    });
  });

  // 1C. The API accepts a Google ID token only. Email, role, and profile fields from the
  // request body are never used as identity or administrator evidence.
  app.post('/api/auth/google/authenticate', async (req, res) => {
    const googleClientId = String(process.env.GOOGLE_CLIENT_ID || '').trim();
    const idToken = typeof req.body?.idToken === 'string' ? req.body.idToken : '';
    if (!serverSupabaseConfig.ok || !googleClientId || !idToken) {
      res.status(401).json({ ok: false, error: 'GOOGLE_OAUTH_PROOF_REQUIRED', message: 'Complete Google sign-in to continue.' });
      return;
    }
    const identity = await verifyGoogleIdToken(idToken, googleClientId);
    if (!identity) {
      res.status(401).json({ ok: false, error: 'GOOGLE_ID_TOKEN_INVALID' });
      return;
    }
    const requestedRole = ['customer', 'provider', 'admin'].includes(String(req.body?.requestedRole || '').toLowerCase())
      ? String(req.body.requestedRole).toLowerCase()
      : 'customer';
    const result = authenticateOrRegisterGoogleUser({
      email: identity.email,
      name: identity.name,
      googleSub: identity.sub,
      avatarUrl: identity.picture,
      requestedRole,
      allowRoleChange: false,
    });
    if (!result.ok) {
      res.status(result.status).json({ ok: false, error: result.error, message: result.message, accountStatus: result.accountStatus });
      return;
    }
    res.status(result.isNewUser ? 201 : 200).json({
      ok: true, authProvider: 'google', supabaseProjectId: SUPABASE_PROJECT_ID,
      isNewUser: result.isNewUser, user: result.user, sessionToken: result.sessionToken,
      claims: result.claims, redirectTarget: result.redirectTarget,
    });
  });

  // 1D. VERIFY ACTIVE SESSION & ENFORCE MID-SESSION ACCOUNT BLOCKING
  app.get('/api/auth/me', (req, res) => {
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

    const effectiveRole = matchedUser ? matchedUser.role : claims.role;
    res.json({
      ok: true,
      authenticated: true,
      authProvider: 'google',
      supabaseProjectId: SUPABASE_PROJECT_ID,
      claims: {
        ...claims,
        role: effectiveRole,
      },
      user: matchedUser || null,
      redirectTarget: resolveRoleRedirectTarget(effectiveRole),
    });
  });

  // 1E. LOGOUT / REVOKE SESSION TOKEN
  app.post('/api/auth/logout', (req, res) => {
    const rawHeader = extractRawTokenFromRequest(req);
    if (rawHeader && rawHeader.includes('.')) {
      const sig = rawHeader.split('.')[1];
      if (sig) {
        const store = loadAuthoritativeStore();
        store.revokedTokens[sig] = Date.now();
        saveAuthoritativeStore(store);
      }
    }
    res.json({ ok: true, loggedOut: true });
  });

  // 1E-2. PROTECTED ROUTE & ROLE-BASED NAVIGATION GUARD ENDPOINT
  app.get('/api/auth/protected/:routeTarget', (req, res) => {
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
        role: effectiveRole,
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
        role: effectiveRole,
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
  app.post('/api/auth/session', (req, res) => {
    const { userId, email, name, role, providerId, phone, adminPasscode } = req.body || {};
    const requestedRole = String(role || 'customer').toLowerCase();
    if (!['customer', 'provider', 'admin'].includes(requestedRole)) {
      res.status(400).json({ ok: false, error: 'INVALID_ROLE' });
      return;
    }

    const store = loadAuthoritativeStore();
    const blocked = findBlockedUserInStore(store, userId, email);
    if (blocked) {
      res.status(403).json({
        ok: false,
        error: 'ACCOUNT_BLOCKED',
        accountStatus: blocked.accountStatus,
        message: `Account "${blocked.name}" (${blocked.email}) is ${blocked.accountStatus.toUpperCase()}. Session creation denied.`,
      });
      return;
    }

    // Prevent arbitrary unverified self-escalation to admin unless valid admin key/passcode is supplied
    if (requestedRole === 'admin') {
      const expectedAdminPasscode = process.env.BOS_ADMIN_PASSCODE?.trim();
      if (!expectedAdminPasscode || adminPasscode !== expectedAdminPasscode) {
        res.status(403).json({
          ok: false,
          error: 'ADMIN_ESCALATION_DENIED',
          message: 'Cannot self-escalate to admin role without verified admin credentials.',
        });
        return;
      }
    }

    const claims: SessionClaims = {
      userId: String(userId || `usr-${Date.now()}`),
      email: email ? String(email) : undefined,
      name: name ? String(name) : undefined,
      role: requestedRole as SessionClaims['role'],
      providerId: requestedRole === 'provider' ? String(providerId || userId || 'prov-1') : undefined,
      phone: phone ? String(phone) : undefined,
      authProvider: 'google',
      issuedAt: Date.now(),
    };

    const token = signSessionToken(claims);
    res.json({
      ok: true,
      sessionToken: token,
      claims,
      redirectTarget: resolveRoleRedirectTarget(claims.role),
    });
  });

  // 2. GET AUTHORITATIVE SEAT LOCKS FOR A MOVIE / SHOWTIME
  app.get('/api/seats/locks', async (req, res) => {
    const listingId = String(req.query.listingId || '').trim();
    const dateIso = String(req.query.dateIso || '').trim();
    const showtime = String(req.query.showtime || '').trim();

    if (!listingId || !dateIso || !showtime) {
      res.status(400).json({ ok: false, error: 'listingId, dateIso, and showtime are required' });
      return;
    }

    const db = requireServerSupabase(res);
    if (!db) return;
    const { data, error } = await db
      .from('seat_locks')
      .select('seat_id, session_id, status, expires_at')
      .eq('listing_id', listingId)
      .eq('show_date', dateIso)
      .eq('show_time', showtime)
      .or(`status.eq.booked,expires_at.gt.${new Date().toISOString()}`);
    if (error) {
      res.status(503).json({ ok: false, error: 'SEAT_INVENTORY_UNAVAILABLE' });
      return;
    }
    const rows = data || [];
    const bookedSeats = rows.filter((row) => row.status === 'booked').map((row) => row.seat_id);
    const heldSeats = rows
      .filter((row) => row.status === 'held')
      .map((row) => ({ seatId: row.seat_id, expiresAt: Date.parse(row.expires_at) }));
    const allLocked = Array.from(new Set([...bookedSeats, ...heldSeats.map((h) => h.seatId)]));
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
  app.post('/api/seats/hold', async (req, res) => {
    const { listingId, dateIso, showtime, seats, ttlSeconds } = req.body || {};
    const sessionClaims = verifySessionTokenFromRequest(req);
    if (!sessionClaims) {
      res.status(401).json({ ok: false, error: 'UNAUTHORIZED_SESSION' });
      return;
    }
    const store = loadAuthoritativeStore();
    if (findBlockedUserInStore(store, sessionClaims.userId, sessionClaims.email)) {
      res.status(403).json({ ok: false, error: 'ACCOUNT_BLOCKED' });
      return;
    }

    const cleanListingId = String(listingId || '').trim();
    const cleanDateIso = String(dateIso || '').trim();
    const cleanShowtime = String(showtime || '').trim();
    const cleanSessionId = sessionClaims.userId;
    const seatList: string[] = Array.isArray(seats)
      ? Array.from(new Set(seats.map((s: any) => String(s || '').trim().toUpperCase()).filter(Boolean)))
      : [];

    if (!cleanListingId || !cleanDateIso || !cleanShowtime || !cleanSessionId || seatList.length === 0) {
      res.status(400).json({ ok: false, error: 'INVALID_HOLD_REQUEST' });
      return;
    }
    const db = requireServerSupabase(res);
    if (!db) return;
    const { data, error } = await db.rpc('hold_movie_seats_atomic', {
      p_listing_id: cleanListingId,
      p_show_date: cleanDateIso,
      p_show_time: cleanShowtime,
      p_seats: seatList,
      p_session_id: cleanSessionId,
      p_ttl_seconds: Math.max(60, Math.min(900, Number(ttlSeconds) || 300)),
    });
    if (error || !data?.ok) {
      res.status(409).json({
        ok: false,
        error: data?.error || 'SEAT_CONFLICT',
        conflictingSeats: data?.conflictingSeats || [],
        message: data?.message || 'One or more seats are unavailable.',
      });
      return;
    }
    const expiresAt = Date.parse(data.expiresAt);
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
  app.post('/api/seats/release', async (req, res) => {
    const { listingId, dateIso, showtime, seats } = req.body || {};
    const claims = verifySessionTokenFromRequest(req);
    if (!claims) {
      res.status(401).json({ ok: false, error: 'UNAUTHORIZED_SESSION' });
      return;
    }
    const cleanListingId = String(listingId || '').trim();
    const cleanDateIso = String(dateIso || '').trim();
    const cleanShowtime = String(showtime || '').trim();
    const cleanSessionId = claims.userId;
    const seatList: string[] = Array.isArray(seats)
      ? seats.map((s: any) => String(s || '').trim().toUpperCase())
      : [];

    const db = requireServerSupabase(res);
    if (!db) return;
    let query = db.from('seat_locks').delete({ count: 'exact' })
      .eq('session_id', cleanSessionId).eq('status', 'held');
    if (cleanListingId) query = query.eq('listing_id', cleanListingId);
    if (cleanDateIso) query = query.eq('show_date', cleanDateIso);
    if (cleanShowtime) query = query.eq('show_time', cleanShowtime);
    if (seatList.length) query = query.in('seat_id', seatList);
    const { count, error } = await query;
    if (error) {
      res.status(503).json({ ok: false, error: 'SEAT_RELEASE_FAILED' });
      return;
    }
    res.json({ ok: true, releasedCount: count || 0 });
  });

  // 5. SERVER-SIDE UPI PAYMENT INTENT CREATION
  app.post('/api/payments/create-intent', async (req, res) => {
    const claims = verifySessionTokenFromRequest(req);
    if (!claims) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED_SESSION' });
    const blocked = findBlockedUserInStore(loadAuthoritativeStore(), claims.userId, claims.email);
    if (blocked) return res.status(403).json({ ok: false, error: 'ACCOUNT_BLOCKED' });

    const amount = Number(req.body?.amount);
    const purpose = String(req.body?.purpose || 'booking');
    const listingId = String(req.body?.listingId || '').trim() || null;
    const idempotencyKey = String(req.headers['x-idempotency-key'] || req.body?.idempotencyKey || '').trim();
    if (!Number.isFinite(amount) || amount <= 0 || amount > 10000000 || !idempotencyKey) {
      return res.status(400).json({ ok: false, error: 'INVALID_PAYMENT_INTENT' });
    }
    if (!['booking', 'subscription', 'service'].includes(purpose)) {
      return res.status(400).json({ ok: false, error: 'INVALID_PAYMENT_PURPOSE' });
    }

    const db = requireServerSupabase(res);
    if (!db) return;
    const intentId = `INT-${crypto.randomUUID()}`;
    const requestedProvider = String(req.body?.provider || 'upi');
    if (!['upi', 'razorpay'].includes(requestedProvider)) return res.status(400).json({ ok: false, error: 'INVALID_PAYMENT_PROVIDER' });
    if (requestedProvider === 'razorpay' && (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET)) {
      return res.status(503).json({ ok: false, error: 'RAZORPAY_NOT_CONFIGURED' });
    }
    const merchantVpa = (process.env.BOS_UPI_MERCHANT_VPA || '').trim();
    if (requestedProvider === 'upi' && !merchantVpa) return res.status(503).json({ ok: false, error: 'UPI_MERCHANT_NOT_CONFIGURED' });
    const intent = {
      intent_id: intentId,
      actor_id: claims.userId,
      user_id: null,
      amount,
      merchant_vpa: requestedProvider === 'upi' ? merchantVpa : 'razorpay',
      status: 'created',
      payment_provider: requestedProvider,
      purpose,
      listing_id: listingId,
      idempotency_key: idempotencyKey,
    };
    const { data, error } = await db.from('payment_verifications').insert(intent).select('intent_id, amount, merchant_vpa, status, created_at').single();
    if (error?.code === '23505') {
      const existing = await db.from('payment_verifications')
        .select('intent_id, amount, merchant_vpa, status, created_at')
        .eq('actor_id', claims.userId).eq('idempotency_key', idempotencyKey).maybeSingle();
      if (existing.data) return res.json({ ok: true, ...existing.data, intentId: existing.data.intent_id });
    }
    if (error || !data) return res.status(503).json({ ok: false, error: 'PAYMENT_INTENT_CREATE_FAILED' });
    return res.status(201).json({ ok: true, intentId: data.intent_id, amount: data.amount, merchantVpa: data.merchant_vpa, status: data.status, createdAt: data.created_at });
  });

  // 6. Legacy public settlement endpoint. A caller cannot mint its own payment proof.
  app.post('/api/payments/webhook-settle', (req, res) => {
    res.status(410).json({
      ok: false,
      error: 'PAYMENT_PROVIDER_NOT_CONFIGURED',
      message: 'Payment settlement must be confirmed by a configured provider webhook.',
    });
  });

  // Razorpay webhook is the only automatic payment settlement boundary.
  app.post('/api/payments/razorpay/webhook', async (req, res) => {
    const secret = (process.env.RAZORPAY_WEBHOOK_SECRET || '').trim();
    if (!secret) return res.status(503).json({ ok: false, error: 'RAZORPAY_WEBHOOK_NOT_CONFIGURED' });
    const rawBody = (req as express.Request & { rawBody?: Buffer }).rawBody;
    const signature = String(req.headers['x-razorpay-signature'] || '').trim();
    const eventId = String(req.headers['x-razorpay-event-id'] || '').trim();
    if (!rawBody || !signature || !eventId) return res.status(400).json({ ok: false, error: 'INVALID_WEBHOOK_HEADERS' });
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    if (!safeTimingEqualHex(signature, expected)) return res.status(401).json({ ok: false, error: 'INVALID_WEBHOOK_SIGNATURE' });
    let event: any;
    try { event = JSON.parse(rawBody.toString('utf8')); } catch { return res.status(400).json({ ok: false, error: 'INVALID_WEBHOOK_BODY' }); }
    const type = String(event?.event || '');
    const payment = event?.payload?.payment?.entity;
    const refund = event?.payload?.refund?.entity;
    const db = requireServerSupabase(res);
    if (!db) return;
    const { data, error } = await db.rpc('process_razorpay_event', {
      p_event_id: eventId,
      p_event_type: type,
      p_payload_sha256: crypto.createHash('sha256').update(rawBody).digest('hex'),
      p_order_id: payment?.order_id || null,
      p_amount_paise: Number(payment?.amount ?? refund?.amount ?? 0),
      p_provider_payment_id: payment?.id || refund?.payment_id || null,
      p_provider_refund_id: refund?.id || null,
      p_actor_hint: null,
    });
    if (error || !data?.ok) return res.status(503).json({ ok: false, error: 'WEBHOOK_PROCESSING_FAILED' });
    return res.json({ ok: true, duplicate: Boolean(data.duplicate), ignored: Boolean(data.ignored) });
  });

  app.post('/api/payments/razorpay/create-order', async (req, res) => {
    const claims = verifySessionTokenFromRequest(req);
    if (!claims) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED_SESSION' });
    const keyId = (process.env.RAZORPAY_KEY_ID || '').trim();
    const keySecret = (process.env.RAZORPAY_KEY_SECRET || '').trim();
    if (!keyId || !keySecret) return res.status(503).json({ ok: false, error: 'RAZORPAY_NOT_CONFIGURED' });
    const db = requireServerSupabase(res);
    if (!db) return;
    const intentId = String(req.body?.intentId || '').trim();
    const found = await db.from('payment_verifications').select('intent_id, amount, status, payment_provider, actor_id, provider_order_id')
      .eq('intent_id', intentId).eq('actor_id', claims.userId).eq('payment_provider', 'razorpay').maybeSingle();
    if (found.error || !found.data) return res.status(404).json({ ok: false, error: 'PAYMENT_INTENT_NOT_FOUND' });
    if (found.data.provider_order_id) return res.json({ ok: true, orderId: found.data.provider_order_id, amount: Number(found.data.amount), currency: 'INR', keyId });
    if (found.data.status !== 'created') return res.status(409).json({ ok: false, error: 'PAYMENT_INTENT_NOT_OPEN' });
    const basic = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
    const providerResponse = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST', headers: { authorization: `Basic ${basic}`, 'content-type': 'application/json' },
      body: JSON.stringify({ amount: Math.round(Number(found.data.amount) * 100), currency: 'INR', receipt: intentId, notes: { payment_intent_id: intentId } }),
    });
    const order = await providerResponse.json().catch(() => ({}));
    if (!providerResponse.ok || !order.id) return res.status(502).json({ ok: false, error: 'RAZORPAY_ORDER_CREATE_FAILED' });
    const saved = await db.from('payment_verifications').update({ provider_order_id: order.id, updated_at: new Date().toISOString() })
      .eq('intent_id', intentId).eq('actor_id', claims.userId).is('provider_order_id', null).select('provider_order_id').maybeSingle();
    if (saved.error || !saved.data) return res.status(409).json({ ok: false, error: 'RAZORPAY_ORDER_RACE' });
    return res.status(201).json({ ok: true, orderId: saved.data.provider_order_id, amount: Number(found.data.amount), currency: 'INR', keyId });
  });

  // 7. Record a customer UTR for manual bank reconciliation. A browser can never verify settlement.
  app.post('/api/payments/verify-upi', async (req, res) => {
    const claims = verifySessionTokenFromRequest(req);
    if (!claims) return res.status(401).json({ ok: false, verified: false, error: 'UNAUTHORIZED_SESSION' });
    const intentId = String(req.body?.intentId || '').trim();
    const utrNumber = String(req.body?.utrNumber || '').trim().replace(/\s+/g, '').toUpperCase();
    if (!intentId || !/^[A-Z0-9]{12,22}$/.test(utrNumber)) {
      return res.status(400).json({ ok: false, verified: false, error: 'INVALID_UPI_SUBMISSION' });
    }
    const db = requireServerSupabase(res);
    if (!db) return;
    const { data: intent, error: lookupError } = await db.from('payment_verifications')
      .select('intent_id, actor_id, amount, merchant_vpa, status, utr_number, payment_provider')
      .eq('intent_id', intentId).eq('actor_id', claims.userId).maybeSingle();
    if (lookupError || !intent) return res.status(404).json({ ok: false, verified: false, error: 'PAYMENT_INTENT_NOT_FOUND' });
    if (intent.payment_provider !== 'upi') return res.status(409).json({ ok: false, verified: false, error: 'PAYMENT_PROVIDER_MISMATCH' });
    if (intent.status === 'verified' && intent.utr_number === utrNumber) {
      return res.json({ ok: true, verified: true, status: 'verified', intentId, utrNumber, amount: intent.amount,
        message: 'Payment is verified in the server reconciliation ledger.' });
    }
    if (intent.utr_number && intent.utr_number !== utrNumber) {
      return res.status(409).json({ ok: false, verified: false, error: 'UTR_ALREADY_SUBMITTED' });
    }
    if (intent.payment_provider !== 'upi' || !['created', 'pending_reconciliation'].includes(intent.status)) {
      return res.status(409).json({ ok: false, verified: false, error: 'PAYMENT_NOT_SUBMITTABLE', status: intent.status });
    }
    let updateIntent = db.from('payment_verifications').update({
      utr_number: utrNumber,
      status: 'pending_reconciliation',
      updated_at: new Date().toISOString(),
    }).eq('intent_id', intentId).eq('actor_id', claims.userId).in('status', ['created', 'pending_reconciliation']);
    updateIntent = intent.utr_number ? updateIntent.eq('utr_number', utrNumber) : updateIntent.is('utr_number', null);
    const { data, error } = await updateIntent.select('intent_id, status, utr_number').maybeSingle();
    if (error?.code === '23505') return res.status(409).json({ ok: false, verified: false, error: 'DUPLICATE_UTR_REPLAY' });
    if (!data && !error) return res.status(409).json({ ok: false, verified: false, error: 'UTR_ALREADY_SUBMITTED' });
    if (error || !data) return res.status(503).json({ ok: false, verified: false, error: 'UPI_RECONCILIATION_SUBMISSION_FAILED' });
    return res.status(202).json({
      ok: true, verified: false, status: data.status, intentId: data.intent_id, utrNumber: data.utr_number,
      message: 'Payment reference recorded and awaiting independent bank reconciliation.',
    });
  });

  // 7A. Only an administrator may record a bank-reconciliation decision.
  app.post('/api/admin/payments/:intentId/reconcile', async (req, res) => {
    const claims = verifySessionTokenFromRequest(req);
    if (!claims || claims.role !== 'admin') return res.status(claims ? 403 : 401).json({ ok: false, error: 'FORBIDDEN_ADMIN_ONLY' });
    const reason = String(req.body?.reason || '').trim();
    if (reason.length < 8) return res.status(400).json({ ok: false, error: 'ADMIN_REASON_REQUIRED' });
    const db = requireServerSupabase(res);
    if (!db) return;
    const { data, error } = await db.rpc('approve_upi_reconciliation', {
      p_intent_id: String(req.params.intentId), p_admin_actor_id: claims.userId,
      p_reason: reason, p_approve: req.body?.approve === true,
    });
    if (error || !data?.ok) return res.status(409).json({ ok: false, error: data?.error || 'RECONCILIATION_FAILED' });
    return res.json({ ok: true, status: data.status });
  });

  app.post('/api/admin/refunds/:refundId/reconcile', async (req, res) => {
    const claims = verifySessionTokenFromRequest(req);
    if (!claims || claims.role !== 'admin') return res.status(claims ? 403 : 401).json({ ok: false, error: 'FORBIDDEN_ADMIN_ONLY' });
    const reason = String(req.body?.reason || '').trim();
    if (reason.length < 8) return res.status(400).json({ ok: false, error: 'ADMIN_REASON_REQUIRED' });
    const db = requireServerSupabase(res);
    if (!db) return;
    const { data, error } = await db.rpc('review_manual_refund', {
      p_refund_id: String(req.params.refundId), p_admin_actor_id: claims.userId,
      p_reason: reason, p_approve: req.body?.approve === true,
    });
    if (error || !data?.ok) return res.status(409).json({ ok: false, error: data?.error || 'REFUND_RECONCILIATION_FAILED' });
    return res.json({ ok: true, status: data.status });
  });

  // 8. Database-authoritative booking creation. The RPC owns inventory locking and idempotency.
  app.post('/api/bookings/atomic', async (req, res) => {
    const claims = verifySessionTokenFromRequest(req);
    if (!claims) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED_SESSION' });
    const blocked = findBlockedUserInStore(loadAuthoritativeStore(), claims.userId, claims.email);
    if (blocked) return res.status(403).json({ ok: false, error: 'ACCOUNT_BLOCKED' });

    const body = req.body || {};
    const idempotencyKey = String(req.headers['x-idempotency-key'] || body.idempotencyKey || '').trim();
    const listingId = String(body.listingId || '').trim();
    const scheduledDate = String(body.scheduledDate || '').trim();
    const timeSlot = String(body.timeSlot || '').trim();
    const totalAmount = Number(body.totalAmount);
    const seats: string[] = Array.isArray(body.seats)
      ? Array.from(new Set(body.seats.map((seat: unknown) => String(seat || '').trim().toUpperCase()).filter(Boolean)))
      : [];
    if (!idempotencyKey || !listingId || !/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate) || !timeSlot || !Number.isFinite(totalAmount) || totalAmount < 0) {
      return res.status(400).json({ ok: false, error: 'INVALID_BOOKING_INPUT' });
    }
    const db = requireServerSupabase(res);
    if (!db) return;
    const bookingId = String(body.id || `bk-${crypto.randomUUID()}`);
    const passCode = `BOS-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
    const { qrSignature, qrPassToken } = signQrPassPayload({ passCode, bookingId, listingId, scheduledDate, seats });
    const mode = body.paymentMode === 'pay_qr' ? 'pay_qr' : 'pay_later';
    const checkoutDate = String(body.checkOutDate || scheduledDate);
    const result = await db.rpc('create_booking_transaction', {
      p_actor_id: claims.userId,
      p_booking_id: bookingId,
      p_idempotency_key: idempotencyKey,
      p_listing_id: listingId,
      p_listing_title: String(body.listingTitle || 'BookOurSpace Listing'),
      p_customer_name: String(body.customerName || claims.name || 'Customer'),
      p_customer_phone: String(body.customerPhone || claims.phone || ''),
      p_customer_address: String(body.customerAddress || ''),
      p_scheduled_date: scheduledDate,
      p_check_out_date: checkoutDate,
      p_time_slot: timeSlot,
      p_show_time: String(body.showtime || ''),
      p_screen_id: String(body.screenId || ''),
      p_total_amount: totalAmount,
      p_payment_intent_id: String(body.paymentIntentId || ''),
      p_payment_mode: mode,
      p_seats: seats,
      p_session_id: claims.userId,
      p_pass_code: passCode,
      p_qr_signature: qrSignature,
      p_qr_pass_token: qrPassToken,
      p_notes: String(body.notes || ''),
    });
    if (result.error) return res.status(503).json({ ok: false, error: 'BOOKING_DATABASE_ERROR' });
    const payload = result.data;
    if (!payload?.ok) {
      const status = payload?.error === 'PAYMENT_NOT_VERIFIED' ? 402 : payload?.error === 'SLOT_OR_SEAT_UNAVAILABLE' ? 409 : 400;
      return res.status(status).json({ ok: false, error: payload?.error || 'BOOKING_REJECTED' });
    }
    const row = payload.booking || {};
    const booking = {
      id: row.id, idempotencyKey: row.idempotency_key, listingId: row.listing_id,
      listingTitle: row.listing_title, providerId: row.provider_id, customerUserId: row.actor_id,
      customerName: row.customer_name, customerPhone: row.customer_phone, customerAddress: row.customer_address,
      scheduledDate: row.scheduled_date, checkInDate: row.check_in_date, checkOutDate: row.check_out_date,
      timeSlot: row.time_slot || row.scheduled_time, showtime: row.show_time, screenId: row.cinema_screen_id, totalAmount: Number(row.total_amount),
      paymentStatus: row.payment_status, status: row.status, paymentIntentId: row.payment_intent_id,
      paymentUtr: row.payment_utr, passCode: row.pass_code, qrSignature: row.qr_signature,
      qrPassToken: row.qr_pass_token, checkedInAt: row.checked_in_at, cancelledAt: row.cancelled_at,
      refundStatus: row.refund_status, createdAt: row.created_at,
      seats,
    };
    return res.status(payload.idempotentReplay ? 200 : 201).json({ ok: true, idempotentReplay: Boolean(payload.idempotentReplay), booking });
  });

  // 9. Verify server-issued passes against the booking ledger; check-in is atomic.
  app.post('/api/passes/verify', async (req, res) => {
    const claims = verifySessionTokenFromRequest(req);
    const { passToken, passCode, signature, markCheckedIn } = req.body || {};
    let cleanCode = String(passCode || '').trim().toUpperCase();
    let providedSig = String(signature || '').trim().toUpperCase();
    const rawToken = String(passToken || '').trim();
    if (rawToken.includes('.')) {
      const parts = rawToken.split('.');
      cleanCode = parts[0].trim().toUpperCase();
      providedSig = parts.slice(1).join('.').trim().toUpperCase();
    } else if (!cleanCode && rawToken) cleanCode = rawToken.toUpperCase();
    if (!cleanCode) return res.status(400).json({ ok: false, verified: false, error: 'MISSING_PASS_CODE' });
    if (markCheckedIn && (!claims || !['provider', 'admin'].includes(claims.role))) {
      return res.status(claims ? 403 : 401).json({ ok: false, verified: false, error: 'SCANNER_ROLE_REQUIRED' });
    }
    const db = requireServerSupabase(res);
    if (!db) return;
    let query = db.from('bookings').select('id, actor_id, listing_id, listing_title, customer_name, scheduled_date, scheduled_time, time_slot, show_time, total_amount, payment_status, status, checked_in_at, pass_code, qr_signature, qr_pass_token, expires_at, refund_status');
    let result = await query.eq('pass_code', cleanCode).maybeSingle();
    if (!result.data && !result.error) result = await db.from('bookings').select('id, actor_id, listing_id, listing_title, customer_name, scheduled_date, scheduled_time, time_slot, show_time, total_amount, payment_status, status, checked_in_at, pass_code, qr_signature, qr_pass_token, expires_at, refund_status').eq('id', cleanCode).maybeSingle();
    if (!result.data && rawToken) result = await db.from('bookings').select('id, actor_id, listing_id, listing_title, customer_name, scheduled_date, scheduled_time, time_slot, show_time, total_amount, payment_status, status, checked_in_at, pass_code, qr_signature, qr_pass_token, expires_at, refund_status').eq('qr_pass_token', rawToken).maybeSingle();
    const row = result.data;
    if (result.error || !row) return res.status(404).json({ ok: false, verified: false, error: 'PASS_NOT_FOUND_OR_FORGED' });
    const seatResult = await db.from('seat_locks').select('seat_id').eq('booking_id', row.id).eq('status', 'booked');
    if (seatResult.error) return res.status(503).json({ ok: false, verified: false, error: 'PASS_INVENTORY_UNAVAILABLE' });
    const seats = (seatResult.data || []).map((seat) => seat.seat_id).sort();
    const expected = signQrPassPayload({ passCode: row.pass_code, bookingId: row.id, listingId: row.listing_id, scheduledDate: row.scheduled_date, seats });
    if (!providedSig || !safeTimingEqualHex(providedSig, expected.qrSignature) || row.qr_signature !== expected.qrSignature) {
      return res.status(403).json({ ok: false, verified: false, error: 'INVALID_OR_FORGED_QR_SIGNATURE' });
    }
    if (row.status !== 'confirmed' || ['refund_pending', 'refunded', 'failed'].includes(row.payment_status)) {
      return res.status(403).json({ ok: false, verified: false, error: 'BOOKING_NOT_VALID' });
    }
    if (seats.length && row.payment_status !== 'verified') return res.status(403).json({ ok: false, verified: false, error: 'PAYMENT_NOT_VERIFIED' });
    if (row.checked_in_at) return res.status(409).json({ ok: false, verified: true, alreadyCheckedIn: true, error: 'PASS_ALREADY_USED', checkedInAt: row.checked_in_at });
    if (markCheckedIn) {
      const checkedInAt = new Date().toISOString();
      const updated = await db.from('bookings').update({ checked_in_at: checkedInAt }).eq('id', row.id).eq('status', 'confirmed').is('checked_in_at', null).select('checked_in_at').maybeSingle();
      if (updated.error || !updated.data) return res.status(409).json({ ok: false, verified: false, error: 'PASS_ALREADY_USED' });
      row.checked_in_at = updated.data.checked_in_at;
    }
    return res.json({ ok: true, verified: true, passCode: row.pass_code, qrPassToken: row.qr_pass_token, booking: {
      id: row.id, listingId: row.listing_id, listingTitle: row.listing_title, customerName: row.customer_name,
      scheduledDate: row.scheduled_date, timeSlot: row.time_slot || row.scheduled_time, showtime: row.show_time,
      seats, totalAmount: Number(row.total_amount), paymentStatus: row.payment_status, status: row.status, checkedInAt: row.checked_in_at || null,
    }});
  });

  // 10. STRICT CUSTOMER / PROVIDER / ADMIN ROLE ISOLATION ENDPOINTS (With Live Account Blocking Check)
  app.get('/api/isolation/bookings', async (req, res) => {
    const claims = verifySessionTokenFromRequest(req);
    if (!claims) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED_SESSION' });
    const blocked = findBlockedUserInStore(loadAuthoritativeStore(), claims.userId, claims.email);
    if (blocked) return res.status(403).json({ ok: false, error: 'ACCOUNT_BLOCKED' });
    const db = requireServerSupabase(res);
    if (!db) return;
    const page = Math.max(0, Number.parseInt(String(req.query.page || '0'), 10) || 0);
    const limit = Math.max(1, Math.min(100, Number.parseInt(String(req.query.limit || '25'), 10) || 25));
    let query = db.from('bookings').select('id, idempotency_key, actor_id, listing_id, listing_title, provider_id, customer_name, customer_phone, customer_address, scheduled_date, scheduled_time, time_slot, show_time, check_in_date, check_out_date, total_amount, payment_status, payment_intent_id, payment_utr, status, pass_code, qr_signature, qr_pass_token, checked_in_at, cancelled_at, refund_amount, refund_status, created_at', { count: 'exact' }).order('created_at', { ascending: false }).range(page * limit, (page + 1) * limit - 1);
    if (claims.role === 'customer') query = query.eq('actor_id', claims.userId);
    else if (claims.role === 'provider') query = query.eq('provider_id', claims.providerId || claims.userId);
    const { data, error, count } = await query;
    if (error) return res.status(503).json({ ok: false, error: 'BOOKINGS_UNAVAILABLE' });
    const rows = data || [];
    const seatQuery = rows.length ? await db.from('seat_locks').select('booking_id, seat_id').in('booking_id', rows.map((row) => row.id)).eq('status', 'booked') : { data: [], error: null };
    if (seatQuery.error) return res.status(503).json({ ok: false, error: 'BOOKING_SEATS_UNAVAILABLE' });
    const seatsByBooking = new Map<string, string[]>();
    for (const seat of seatQuery.data || []) seatsByBooking.set(seat.booking_id, [...(seatsByBooking.get(seat.booking_id) || []), seat.seat_id]);
    const bookings = rows.map((row) => ({
      id: row.id, idempotencyKey: row.idempotency_key, listingId: row.listing_id, listingTitle: row.listing_title,
      providerId: row.provider_id, customerUserId: row.actor_id, customerName: row.customer_name, customerPhone: row.customer_phone,
      customerAddress: row.customer_address, scheduledDate: row.scheduled_date, checkInDate: row.check_in_date,
      checkOutDate: row.check_out_date, timeSlot: row.time_slot || row.scheduled_time, showtime: row.show_time,
      totalAmount: Number(row.total_amount), paymentStatus: row.payment_status, paymentIntentId: row.payment_intent_id,
      paymentUtr: row.payment_utr, status: row.status, passCode: row.pass_code, qrSignature: row.qr_signature,
      qrPassToken: row.qr_pass_token, checkedInAt: row.checked_in_at, cancelledAt: row.cancelled_at,
      refundAmount: Number(row.refund_amount || 0), refundStatus: row.refund_status, createdAt: row.created_at,
      seats: seatsByBooking.get(row.id) || [],
    }));
    return res.json({ ok: true, role: claims.role, userId: claims.role === 'customer' ? claims.userId : undefined,
      providerId: claims.role === 'provider' ? claims.providerId : undefined, bookings, page, limit,
      total: count || 0, hasMore: (page + 1) * limit < (count || 0), nextPage: (page + 1) * limit < (count || 0) ? page + 1 : null });
  });

  app.get('/api/isolation/admin-summary', async (req, res) => {
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

    const db = requireServerSupabase(res);
    if (!db) return;
    const [bookings, locks, intents, verified, pending] = await Promise.all([
      db.from('bookings').select('id', { count: 'exact', head: true }),
      db.from('seat_locks').select('id', { count: 'exact', head: true }).eq('status', 'held').gt('expires_at', new Date().toISOString()),
      db.from('payment_verifications').select('intent_id', { count: 'exact', head: true }),
      db.from('payment_verifications').select('intent_id', { count: 'exact', head: true }).eq('status', 'verified'),
      db.from('payment_verifications').select('intent_id', { count: 'exact', head: true }).eq('status', 'pending_reconciliation'),
    ]);
    if ([bookings, locks, intents, verified, pending].some((result) => result.error)) {
      return res.status(503).json({ ok: false, error: 'ADMIN_SUMMARY_UNAVAILABLE' });
    }
    return res.json({
      ok: true,
      role: 'admin',
      totalUsers: store.users.length,
      blockedUsersCount: store.users.filter(
        (u) => u.accountStatus === 'suspended' || u.accountStatus === 'blocked'
      ).length,
      totalBookings: bookings.count || 0,
      totalActiveSeatLocks: locks.count || 0,
      totalPaymentIntents: intents.count || 0,
      verifiedPaymentsCount: verified.count || 0,
      pendingReconciliationCount: pending.count || 0,
    });
  });

  app.get('/api/admin/payment-reconciliation', async (req, res) => {
    const claims = verifySessionTokenFromRequest(req);
    if (!claims || claims.role !== 'admin') return res.status(claims ? 403 : 401).json({ ok: false, error: 'FORBIDDEN_ADMIN_ONLY' });
    const db = requireServerSupabase(res);
    if (!db) return;
    const page = Math.max(0, Number.parseInt(String(req.query.page || '0'), 10) || 0);
    const limit = Math.max(1, Math.min(100, Number.parseInt(String(req.query.limit || '25'), 10) || 25));
    const [payments, refunds] = await Promise.all([
      db.from('payment_verifications').select('intent_id, actor_id, amount, merchant_vpa, utr_number, purpose, listing_id, booking_id, created_at, updated_at', { count: 'exact' }).eq('payment_provider', 'upi').eq('status', 'pending_reconciliation').order('created_at', { ascending: true }).range(page * limit, (page + 1) * limit - 1),
      db.from('payment_refunds').select('id, booking_id, payment_intent_id, actor_id, amount, reason, created_at', { count: 'exact' }).eq('status', 'pending_manual').order('created_at', { ascending: true }).range(page * limit, (page + 1) * limit - 1),
    ]);
    if (payments.error || refunds.error) return res.status(503).json({ ok: false, error: 'RECONCILIATION_QUEUE_UNAVAILABLE' });
    return res.json({ ok: true, payments: payments.data || [], refunds: refunds.data || [], page, limit,
      paymentCount: payments.count || 0, refundCount: refunds.count || 0 });
  });

  // ============================================================================
  // 11. AUTHORITATIVE USER MANAGEMENT & ACCOUNT BLOCKING API (/api/admin/users)
  // ============================================================================
  app.get('/api/admin/users', (_req, res) => {
    const store = loadAuthoritativeStore();
    res.json({
      ok: true,
      users: store.users,
    });
  });

  app.post('/api/admin/users', (req, res) => {
    const claims = verifySessionTokenFromRequest(req);
    if (claims && claims.role !== 'admin') {
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
    const role: 'customer' | 'provider' | 'admin' = ['customer', 'provider', 'admin'].includes(body.role)
      ? body.role
      : 'provider';
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
      providerId: role === 'provider' ? `prov-${id.toLowerCase()}` : undefined,
      authProvider: 'google',
      verified: body.verified !== undefined ? Boolean(body.verified) : role !== 'provider',
      kycDocument: String(body.kycDocument || 'Aadhaar + Trade KYC Verified'),
      accountStatus: body.accountStatus || 'active',
      city: String(body.city || 'Hyderabad'),
      joinedAt: String(body.joinedAt || new Date().toISOString().slice(0, 10)),
      lastLoginAt: new Date().toISOString(),
      listingsCount: Number(body.listingsCount) || 0,
      bookingsCount: Number(body.bookingsCount) || 0,
      totalSpentOrEarned: Number(body.totalSpentOrEarned) || 0,
      gstin: body.gstin ? String(body.gstin) : undefined,
      permissions: Array.isArray(body.permissions)
        ? body.permissions
        : role === 'admin'
        ? ['full_admin_access']
        : role === 'provider'
        ? ['create_listing', 'respond_enquiries']
        : ['book_services'],
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

  app.patch('/api/admin/users/:id/status', (req, res) => {
    const claims = verifySessionTokenFromRequest(req);
    if (claims && claims.role !== 'admin') {
      res.status(403).json({
        ok: false,
        error: 'FORBIDDEN_ADMIN_ONLY',
        message: 'Only administrators can suspend, block, or reactivate user accounts.',
      });
      return;
    }

    const targetId = String(req.params.id || '').trim();
    const nextStatus = String(req.body?.status || req.body?.accountStatus || '').trim();
    if (!['active', 'suspended', 'blocked', 'pending_verification'].includes(nextStatus)) {
      res.status(400).json({ ok: false, error: 'INVALID_ACCOUNT_STATUS' });
      return;
    }

    const store = loadAuthoritativeStore();
    const user = store.users.find(
      (u) => u.id.toLowerCase() === targetId.toLowerCase() || u.email.toLowerCase() === targetId.toLowerCase()
    );
    if (!user) {
      res.status(404).json({ ok: false, error: 'USER_NOT_FOUND' });
      return;
    }

    user.accountStatus = nextStatus as AuthoritativeUserRecord['accountStatus'];

    // If a provider is suspended or blocked, also reject/hide their authoritative provider listings
    if (user.role === 'provider') {
      for (const listing of Object.values(store.providerListings)) {
        if (
          listing.ownerUserId === user.id ||
          listing.providerId === user.providerId ||
          listing.providerPhone === user.phone
        ) {
          listing.status =
            nextStatus === 'suspended' || nextStatus === 'blocked' ? 'rejected' : 'active';
          listing.updatedAt = new Date().toISOString();
        }
      }
    }

    appendAuthoritativeNotification(store, {
      recipientUserId: user.id,
      targetRole: 'admin',
      title:
        nextStatus === 'suspended' || nextStatus === 'blocked'
          ? `🚫 User Account ${nextStatus.toUpperCase()}: ${user.name}`
          : `✅ User Account Reactivated: ${user.name}`,
      message: `Account ${user.email} (${user.role}) status changed to ${nextStatus.toUpperCase()} by Super Admin.`,
      type: 'security',
    });

    saveAuthoritativeStore(store);

    res.json({
      ok: true,
      user: { ...user, status: user.accountStatus },
      users: store.users.map((u) => ({ ...u, status: u.accountStatus })),
    });
  });

  app.patch('/api/admin/users/:id/role', (req, res) => {
    const claims = verifySessionTokenFromRequest(req);
    if (claims && claims.role !== 'admin') {
      res.status(403).json({
        ok: false,
        error: 'FORBIDDEN_ADMIN_ONLY',
        message: 'Only administrators can modify user roles.',
      });
      return;
    }

    const targetId = String(req.params.id || '').trim();
    const nextRole = String(req.body?.role || '').trim().toLowerCase();
    if (!['customer', 'provider', 'admin'].includes(nextRole)) {
      res.status(400).json({ ok: false, error: 'INVALID_ROLE' });
      return;
    }

    const store = loadAuthoritativeStore();
    const user = store.users.find(
      (u) => u.id.toLowerCase() === targetId.toLowerCase() || u.email.toLowerCase() === targetId.toLowerCase()
    );
    if (!user) {
      res.status(404).json({ ok: false, error: 'USER_NOT_FOUND' });
      return;
    }

    user.role = nextRole as AuthoritativeUserRecord['role'];
    if (user.role === 'provider' && !user.providerId) {
      user.providerId = `prov-${user.id.toLowerCase()}`;
    }

    appendAuthoritativeNotification(store, {
      recipientUserId: user.id,
      targetRole: 'admin',
      title: `🛡️ Role Updated: ${user.name}`,
      message: `${user.name} (${user.email}) role changed to ${nextRole.toUpperCase()}.`,
      type: 'security',
    });

    saveAuthoritativeStore(store);
    res.json({
      ok: true,
      user,
      users: store.users,
    });
  });

  app.patch('/api/admin/users/:id/verify', (req, res) => {
    const claims = verifySessionTokenFromRequest(req);
    if (claims && claims.role !== 'admin') {
      res.status(403).json({ ok: false, error: 'FORBIDDEN_ADMIN_ONLY' });
      return;
    }

    const targetId = String(req.params.id || '').trim();
    const store = loadAuthoritativeStore();
    const user = store.users.find(
      (u) => u.id.toLowerCase() === targetId.toLowerCase() || u.email.toLowerCase() === targetId.toLowerCase()
    );
    if (!user) {
      res.status(404).json({ ok: false, error: 'USER_NOT_FOUND' });
      return;
    }

    user.verified = req.body?.verified !== undefined ? Boolean(req.body.verified) : !user.verified;
    if (user.verified && user.accountStatus === 'pending_verification') {
      user.accountStatus = 'active';
    }
    saveAuthoritativeStore(store);

    res.json({
      ok: true,
      user,
      users: store.users,
    });
  });

  // ============================================================================
  // 12. AUTHORITATIVE NOTIFICATION MANAGEMENT & SEGMENT BROADCAST (/api/notifications)
  // ============================================================================
  app.get('/api/notifications', (req, res) => {
    const claims = verifySessionTokenFromRequest(req);
    const roleFilter = String(req.query.role || claims?.role || 'customer').toLowerCase();
    const userIdFilter = String(req.query.userId || claims?.userId || '').trim();

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
      campaigns: store.notificationCampaigns,
    });
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

    if (claims && claims.role !== 'admin') {
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
    const { id, notificationId, userId } = req.body || {};
    const claims = verifySessionTokenFromRequest(req);
    const effectiveUserId = String(claims?.userId || userId || 'guest');
    const cleanId = String(notificationId || id || '').trim();

    const store = loadAuthoritativeStore();
    const target = store.notifications.find((n) => n.id === cleanId);
    if (target) {
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
    const store = loadAuthoritativeStore();
    if (!claims || claims.role === 'admin') {
      store.notifications = [];
    } else {
      store.notifications = store.notifications.filter(
        (n) => n.recipientUserId && n.recipientUserId !== claims.userId
      );
    }
    saveAuthoritativeStore(store);
    res.json({ ok: true, notifications: store.notifications });
  });

  // ============================================================================
  // 13. PROVIDER PERMISSIONS & LISTING OWNERSHIP ENFORCEMENT (/api/provider/listings)
  // ============================================================================
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
      isFeatured: Boolean(body.isFeatured),
      isVerified: claims.role === 'admin',
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
    if (updates.isFeatured !== undefined) existing.isFeatured = Boolean(updates.isFeatured);
    if (updates.status !== undefined && (claims.role === 'admin' || updates.status !== 'active')) {
      existing.status = updates.status;
    }
    if (updates.isVerified !== undefined && claims.role === 'admin') {
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

  // ============================================================================
  // 14. ALL 17 ADMIN MODULES AUTHORITATIVE STATE SYNC (/api/admin/modules)
  // ============================================================================
  // Public navigation config contains visibility only. Admin updates are persisted
  // in the authoritative store and require a current, active server-side admin.
  app.get('/api/market-sections', (_req, res) => {
    const store = loadAuthoritativeStore();
    const saved = store.adminModules.market_section_visibility?.payload;
    res.json({ ok: true, sections: normalizeMarketSectionVisibility(saved) });
  });

  app.put('/api/admin/market-sections/:sectionId', (req, res) => {
    const claims = verifySessionTokenFromRequest(req);
    if (!claims) {
      res.status(401).json({ ok: false, error: 'UNAUTHORIZED_SESSION' });
      return;
    }
    if (claims.role !== 'admin') {
      res.status(403).json({ ok: false, error: 'FORBIDDEN_ADMIN_ONLY' });
      return;
    }

    const store = loadAuthoritativeStore();
    const blocked = findBlockedUserInStore(store, claims.userId, claims.email);
    const currentAdmin = store.users.find(
      (user) => user.id.toLowerCase() === claims.userId.toLowerCase() ||
        (claims.email && user.email.toLowerCase() === claims.email.toLowerCase())
    );
    if (blocked || !currentAdmin || currentAdmin.role !== 'admin') {
      res.status(403).json({ ok: false, error: blocked ? 'ACCOUNT_BLOCKED' : 'FORBIDDEN_ADMIN_ONLY' });
      return;
    }

    const sectionId = String(req.params.sectionId || '');
    if (!isMarketSectionId(sectionId) || typeof req.body?.enabled !== 'boolean') {
      res.status(400).json({ ok: false, error: 'INVALID_MARKET_SECTION_SETTING' });
      return;
    }

    const existing = normalizeMarketSectionVisibility(
      store.adminModules.market_section_visibility?.payload || DEFAULT_MARKET_SECTION_VISIBILITY
    );
    const next = { ...existing, [sectionId]: req.body.enabled };
    if (!Object.values(next).some(Boolean)) {
      res.status(409).json({ ok: false, error: 'AT_LEAST_ONE_SECTION_REQUIRED' });
      return;
    }

    store.adminModules.market_section_visibility = {
      payload: next,
      updatedBy: claims.userId,
      updatedAt: new Date().toISOString(),
    };
    if (!saveAuthoritativeStore(store)) {
      res.status(500).json({ ok: false, error: 'MARKET_SECTION_SAVE_FAILED' });
      return;
    }
    res.json({ ok: true, sections: next });
  });

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

  app.get('/api/admin/modules', (_req, res) => {
    const store = loadAuthoritativeStore();
    res.json({
      ok: true,
      supportedModules: ALL_17_ADMIN_MODULE_IDS,
      moduleCount: ALL_17_ADMIN_MODULE_IDS.length,
      modules: store.adminModules,
    });
  });

  app.put('/api/admin/modules/:moduleKey', (req, res) => {
    const claims = verifySessionTokenFromRequest(req);
    if (claims && claims.role !== 'admin') {
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

  // 15A. GET AUTHORITATIVE CINEMA INVENTORY, SCREENS, POLICIES, BOOKINGS, REFUNDS & AUDIT LOGS
  app.get('/api/movies/inventory', async (req, res) => {
    const claims = verifySessionTokenFromRequest(req);
    const store = loadAuthoritativeStore();
    const engine = getCinemaModuleStore(store);

    let cinemaScreens: any[] = engine.screens;
    if (serverSupabase) {
      const databaseScreens = await serverSupabase.from('cinema_screens').select('*').order('cinema_listing_id').order('screen_name');
      if (databaseScreens.error) return res.status(503).json({ ok: false, error: 'CINEMA_SCREEN_INVENTORY_UNAVAILABLE' });
      if (databaseScreens.data?.length) cinemaScreens = databaseScreens.data.map((row: any) => ({
        id: row.id, screenId: row.id, listingId: row.cinema_listing_id, cinemaListingId: row.cinema_listing_id,
        cinemaName: row.cinema_title, cinemaTitle: row.cinema_title, area: row.area, screenName: row.screen_name,
        projectionFormat: row.format, soundFormat: row.sound_system, format: row.format, soundSystem: row.sound_system,
        totalSeats: row.total_seats, tiers: row.tiers, seatTiers: row.tiers, wheelchairSeats: row.wheelchair_seats,
        showtimes: row.showtimes, cancellationAllowed: row.cancellation_allowed,
        cancellationCutoffMins: row.cancellation_cutoff_minutes, cancellationCutoffMinutes: row.cancellation_cutoff_minutes,
        refundPercent: row.refund_percent, convenienceFeePerSeat: Number(row.convenience_fee_per_seat),
        gstPercent: Number(row.gst_percent), updatedAt: row.updated_at,
      }));
    }

    const normalizedScreens = cinemaScreens.map((s: any) => ({
      ...s,
      id: s.id || s.screenId,
      screenId: s.screenId || s.id,
      cinemaListingId: s.cinemaListingId || s.listingId,
      listingId: s.listingId || s.cinemaListingId,
      cinemaTitle: s.cinemaTitle || s.cinemaName,
      cinemaName: s.cinemaName || s.cinemaTitle,
      area: s.area || 'Hyderabad',
      format: s.format || `${s.projectionFormat || '4K Laser'} · ${s.soundFormat || 'Dolby Atmos'}`,
      soundSystem: s.soundSystem || s.soundFormat || 'Dolby Atmos',
      totalSeats: s.totalSeats || 80,
      tiers: Array.isArray(s.tiers)
        ? s.tiers
        : Array.isArray(s.seatTiers)
        ? s.seatTiers.map((t: any) => ({
            name: t.name,
            rows: t.rows,
            price: t.price || Math.round(250 * (t.priceMultiplier || 1)),
          }))
        : [],
      cancellationAllowed: s.cancellationAllowed !== undefined ? s.cancellationAllowed : true,
      cancellationCutoffMinutes: s.cancellationCutoffMinutes ?? s.cancellationCutoffMins ?? 120,
      convenienceFeePerSeat: s.convenienceFeePerSeat ?? 28,
      gstPercent: s.gstPercent ?? 18,
    }));

    const page = Math.max(0, Number.parseInt(String(req.query.page || '0'), 10) || 0);
    const limit = Math.max(1, Math.min(100, Number.parseInt(String(req.query.limit || '25'), 10) || 25));
    let visibleBookings: any[] = [];
    let refunds: any[] = [];
    let visibleBookingCount = 0;
    if (claims) {
      const db = requireServerSupabase(res);
      if (!db) return;
      const configuredMovieListingIds = normalizedScreens
        .map((screen: any) => String(screen.cinemaListingId || screen.listingId || ''))
        .filter((id: string) => /^[A-Za-z0-9_-]+$/.test(id));
      const movieFilters = ['listing_id.like.movie-%', 'listing_id.like.listing-movie-%',
        ...configuredMovieListingIds.map((id: string) => `listing_id.eq.${id}`)];
      let bookingQuery = db.from('bookings').select('id, actor_id, listing_id, listing_title, provider_id, customer_name, customer_phone, scheduled_date, scheduled_time, time_slot, show_time, total_amount, payment_status, status, pass_code, qr_signature, qr_pass_token, checked_in_at, cancelled_at, refund_amount, refund_status, created_at', { count: 'exact' }).order('created_at', { ascending: false }).range(page * limit, (page + 1) * limit - 1);
      bookingQuery = bookingQuery.or(movieFilters.join(','));
      if (claims.role === 'customer') bookingQuery = bookingQuery.eq('actor_id', claims.userId);
      if (claims.role === 'provider') bookingQuery = bookingQuery.eq('provider_id', claims.providerId || claims.userId);
      const bookingsResult = await bookingQuery;
      if (bookingsResult.error) return res.status(503).json({ ok: false, error: 'MOVIE_INVENTORY_UNAVAILABLE' });
      visibleBookingCount = bookingsResult.count || 0;
      const rows = bookingsResult.data || [];
      const seatResult = rows.length ? await db.from('seat_locks').select('booking_id, seat_id').in('booking_id', rows.map((booking) => booking.id)).eq('status', 'booked') : { data: [], error: null };
      if (seatResult.error) return res.status(503).json({ ok: false, error: 'MOVIE_SEATS_UNAVAILABLE' });
      const seats = new Map<string, string[]>();
      for (const item of seatResult.data || []) seats.set(item.booking_id, [...(seats.get(item.booking_id) || []), item.seat_id]);
      const movieRows = rows;
      visibleBookings = movieRows.map((booking) => ({
        id: booking.id, listingId: booking.listing_id, listingTitle: booking.listing_title,
        providerId: booking.provider_id, customerUserId: booking.actor_id, customerName: booking.customer_name,
        customerPhone: booking.customer_phone, scheduledDate: booking.scheduled_date,
        timeSlot: booking.time_slot || booking.scheduled_time, showtime: booking.show_time,
        seats: seats.get(booking.id) || [], totalAmount: Number(booking.total_amount),
        paymentStatus: booking.payment_status, status: booking.status, passCode: booking.pass_code,
        qrSignature: booking.qr_signature, qrPassToken: booking.qr_pass_token, checkedInAt: booking.checked_in_at,
        cancelledAt: booking.cancelled_at, refundAmount: Number(booking.refund_amount || 0),
        refundStatus: booking.refund_status, createdAt: booking.created_at,
      }));
      const movieBookingIds = movieRows.map((booking) => booking.id);
      if (movieBookingIds.length) {
        const refundResult = await db.from('payment_refunds').select('id, booking_id, amount, status, reason, provider_refund_id, created_at, processed_at').in('booking_id', movieBookingIds).order('created_at', { ascending: false });
        if (refundResult.error) return res.status(503).json({ ok: false, error: 'MOVIE_REFUNDS_UNAVAILABLE' });
        refunds = refundResult.data || [];
      }
    }

    const normalizedAuditLogs = (engine.auditLogs || []).map((l: any) => ({
      ...l,
      targetId: l.targetId || l.details || l.id,
      createdAt: l.createdAt || l.timestamp || new Date().toISOString(),
    }));

    res.json({
      ok: true,
      screens: normalizedScreens,
      offers: engine.promos,
      promos: engine.promos,
      bookings: visibleBookings,
      refunds,
      page,
      limit,
      total: visibleBookingCount,
      hasMore: (page + 1) * limit < visibleBookingCount,
      nextPage: (page + 1) * limit < visibleBookingCount ? page + 1 : null,
      supportTickets: (engine.supportTickets || []).map((t: any) => ({
        ...t,
        id: t.id || t.ticketId,
        ticketId: t.ticketId || t.id,
        description: t.description || t.message || t.subject,
      })),
      auditLogs: normalizedAuditLogs,
    });
  });

  // 15B. CREATE OR UPDATE CINEMA SCREEN, SEAT LAYOUT, SHOWTIMES & CANCELLATION POLICY (Provider / Admin Only)
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

    const store = loadAuthoritativeStore();
    const blocked = findBlockedUserInStore(store, claims.userId, claims.email);
    if (blocked) {
      res.status(403).json({ ok: false, error: 'ACCOUNT_BLOCKED' });
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

    const body = req.body || {};
    const listingId = String(body.listingId || body.cinemaListingId || 'movie-hyd-1').trim();
    const screenId = String(body.screenId || body.id || `scr-${listingId}`).trim();
    const db = requireServerSupabase(res);
    if (!db) return;
    if (claims.role === 'provider') {
      const owner = await db.from('listings').select('owner_id').eq('id', listingId).maybeSingle();
      if (owner.error || !owner.data || ![claims.userId, claims.providerId].includes(String(owner.data.owner_id))) {
        return res.status(403).json({ ok: false, error: 'FORBIDDEN_LISTING_OWNER' });
      }
    }
    const engine = getCinemaModuleStore(store);

    const existingIdx = engine.screens.findIndex(
      (s: any) =>
        s.screenId === screenId ||
        s.id === screenId ||
        s.listingId === listingId ||
        s.cinemaListingId === listingId
    );
    const prevScreen: any =
      existingIdx >= 0 ? engine.screens[existingIdx] : DEFAULT_CINEMA_SCREENS[0];

    const updatedScreen: any = {
      ...prevScreen,
      id: screenId,
      screenId,
      listingId,
      cinemaListingId: listingId,
      cinemaName: String(body.cinemaName || body.cinemaTitle || prevScreen.cinemaName).trim(),
      cinemaTitle: String(body.cinemaTitle || body.cinemaName || prevScreen.cinemaName).trim(),
      screenName: String(body.screenName || prevScreen.screenName).trim(),
      soundFormat: String(body.soundFormat || body.soundSystem || prevScreen.soundFormat).trim(),
      projectionFormat: String(body.projectionFormat || body.format || prevScreen.projectionFormat).trim(),
      showtimes: Array.isArray(body.showtimes)
        ? body.showtimes.map((t: any) => String(t).trim()).filter(Boolean)
        : prevScreen.showtimes,
      cancellationCutoffMins:
        body.cancellationCutoffMins !== undefined
          ? Math.max(0, Number(body.cancellationCutoffMins))
          : body.cancellationCutoffMinutes !== undefined
          ? Math.max(0, Number(body.cancellationCutoffMinutes))
          : prevScreen.cancellationCutoffMins,
      refundPercent:
        body.refundPercent !== undefined
          ? Math.min(100, Math.max(0, Number(body.refundPercent)))
          : prevScreen.refundPercent,
      fnbDeliveryEnabled:
        body.fnbDeliveryEnabled !== undefined
          ? Boolean(body.fnbDeliveryEnabled)
          : prevScreen.fnbDeliveryEnabled,
      wheelchairSeats: Array.isArray(body.wheelchairSeats)
        ? body.wheelchairSeats.map((s: any) => String(s).trim().toUpperCase())
        : prevScreen.wheelchairSeats,
      seatTiers: Array.isArray(body.seatTiers) ? body.seatTiers : prevScreen.seatTiers,
      tiers: Array.isArray(body.tiers)
        ? body.tiers
        : prevScreen.tiers ||
          (prevScreen.seatTiers || []).map((t: any) => ({
            name: t.name,
            rows: t.rows,
            price: Math.round(250 * (t.priceMultiplier || 1)),
          })),
      updatedAt: new Date().toISOString(),
    };

    const screenSave = await db.from('cinema_screens').upsert({
      id: screenId,
      cinema_listing_id: listingId,
      cinema_title: updatedScreen.cinemaTitle,
      area: updatedScreen.area || 'Hyderabad',
      screen_name: updatedScreen.screenName,
      format: updatedScreen.projectionFormat,
      sound_system: updatedScreen.soundFormat,
      total_seats: Number(updatedScreen.totalSeats || 80),
      tiers: updatedScreen.tiers,
      wheelchair_seats: updatedScreen.wheelchairSeats,
      showtimes: updatedScreen.showtimes,
      cancellation_allowed: updatedScreen.cancellationAllowed !== false,
      cancellation_cutoff_minutes: updatedScreen.cancellationCutoffMins,
      refund_percent: updatedScreen.refundPercent,
      convenience_fee_per_seat: Number(updatedScreen.convenienceFeePerSeat || 0),
      gst_percent: Number(updatedScreen.gstPercent || 0),
      updated_at: updatedScreen.updatedAt,
    }, { onConflict: 'id' });
    if (screenSave.error) return res.status(503).json({ ok: false, error: 'CINEMA_SCREEN_SAVE_FAILED' });

    if (existingIdx >= 0) {
      engine.screens[existingIdx] = updatedScreen;
    } else {
      engine.screens.unshift(updatedScreen);
    }

    engine.auditLogs.unshift({
      id: `MOV-AUD-${Date.now().toString().slice(-5)}`,
      timestamp: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      actor: claims.name || claims.email || claims.userId,
      role: claims.role,
      action: 'UPDATED_SCREEN_AND_POLICY',
      targetId: updatedScreen.screenId,
      details: `Updated ${updatedScreen.cinemaName} (${updatedScreen.screenName}) — Refund Policy: ${updatedScreen.refundPercent}%.`,
    });

    saveAuthoritativeStore(store);

    res.json({
      ok: true,
      screen: updatedScreen,
      screens: engine.screens,
      auditLogs: engine.auditLogs,
    });
  });

  // 15C. Cancellation is transactional; refunds remain pending until a provider event or bank reconciliation.
  app.post('/api/movies/bookings/:id/cancel', async (req, res) => {
    const claims = verifySessionTokenFromRequest(req);
    if (!claims) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED_SESSION' });
    const blocked = findBlockedUserInStore(loadAuthoritativeStore(), claims.userId, claims.email);
    if (blocked) return res.status(403).json({ ok: false, error: 'ACCOUNT_BLOCKED' });
    const db = requireServerSupabase(res);
    if (!db) return;
    const key = String(req.params.id || '').trim();
    let lookup = await db.from('bookings').select('id, actor_id, listing_id, payment_intent_id, status, pass_code')
      .eq('id', key).maybeSingle();
    if (!lookup.data) lookup = await db.from('bookings').select('id, actor_id, listing_id, payment_intent_id, status, pass_code')
      .eq('pass_code', key.toUpperCase()).maybeSingle();
    const booking = lookup.data;
    if (lookup.error || !booking) return res.status(404).json({ ok: false, error: 'BOOKING_NOT_FOUND' });
    let authorized = claims.role === 'admin' || booking.actor_id === claims.userId;
    if (claims.role === 'provider') {
      const listing = await db.from('listings').select('owner_id').eq('id', booking.listing_id).maybeSingle();
      authorized = Boolean(listing.data && (String(listing.data.owner_id) === claims.userId || String(listing.data.owner_id) === claims.providerId));
    }
    if (!authorized) return res.status(403).json({ ok: false, error: 'FORBIDDEN_NOT_BOOKING_OWNER' });
    const result = await db.rpc('cancel_booking_transaction', {
      p_booking_id: booking.id, p_actor_id: booking.actor_id, p_reason: String(req.body?.reason || 'Customer requested cancellation'),
    });
    if (result.error || !result.data?.ok) {
      const code = result.data?.error || 'CANCELLATION_FAILED';
      return res.status(code === 'BOOKING_NOT_FOUND' ? 404 : 409).json({ ok: false, error: code });
    }
    const payload = result.data;
    let refund: any = null;
    if (payload.refundId) {
      const refundQuery = await db.from('payment_refunds')
        .select('id, booking_id, payment_intent_id, amount, status, reason, provider_refund_id, created_at')
        .eq('id', payload.refundId).maybeSingle();
      refund = refundQuery.data;
      const keyId = (process.env.RAZORPAY_KEY_ID || '').trim();
      const keySecret = (process.env.RAZORPAY_KEY_SECRET || '').trim();
      if (refund && payload.paymentProvider === 'razorpay' && payload.providerPaymentId && keyId && keySecret && !refund.provider_refund_id) {
        const authorization = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
        const providerResponse = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(payload.providerPaymentId)}/refund`, {
          method: 'POST', headers: { authorization: `Basic ${authorization}`, 'content-type': 'application/json', 'X-Refund-Idempotency': `refund-${refund.id}` },
          body: JSON.stringify({ amount: Math.round(Number(refund.amount) * 100), notes: { booking_id: booking.id, refund_id: refund.id } }),
        });
        const providerRefund = await providerResponse.json().catch(() => ({}));
        if (providerResponse.ok && providerRefund.id) {
          const savedRefund = await db.from('payment_refunds').update({ provider_refund_id: providerRefund.id, status: 'provider_pending', updated_at: new Date().toISOString() })
            .eq('id', refund.id).is('provider_refund_id', null).select('id, amount, status, provider_refund_id').maybeSingle();
          if (savedRefund.data) refund = { ...refund, ...savedRefund.data };
        }
      }
    }
    return res.json({ ok: true, booking: payload.booking, refund, refundAmount: Number(payload.refundAmount || 0),
      message: refund?.status === 'processed' ? 'Cancellation and verified refund are complete.' :
        refund ? 'Cancellation is complete; the refund remains pending provider or bank confirmation.' : 'Booking cancelled. No refundable payment was recorded.' });
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
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`BookOurSpace Full-Stack Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
