import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';
import { evaluateStayCancellation } from './src/features/stays/stayCancellation';
import { isSimulatedPaymentSettlementAllowed } from './src/lib/paymentSecurity';
import { isCapturedRazorpayPayment, isValidRazorpayPaymentSignature } from './src/lib/razorpaySecurity';
import { createMovieRouter } from './src/server/movieRoutes';
import { localDemoMiddleware } from './src/server/localDemo';
import { assertLocalHttpUrl } from './src/lib/localDemoSafety';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const localDemo = process.env.BOS_LOCAL_DEMO === 'true';
if (localDemo) {
  if (process.env.NODE_ENV === 'production') throw new Error('Local demo cannot run in production.');
  assertLocalHttpUrl(process.env.VITE_SUPABASE_URL || '');
  assertLocalHttpUrl(process.env.VITE_MOVIES_SUPABASE_URL || '');
  if (!process.env.BOS_AUTH_STORE_FILE_PATH || !process.env.BOS_DEMO_ENV_DIR) throw new Error('Use npm run demo:start for an isolated runtime.');
} else {
  dotenv.config({ path: path.join(__dirname, '.env.local') });
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
  app.use(express.json({ limit: '10mb' }));
  if (localDemo) app.use(localDemoMiddleware(process.env.VITE_SUPABASE_URL!));
  app.use(createMovieRouter());

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

  const AUTH_STORE_FILE_PATH =
    process.env.BOS_AUTH_STORE_FILE_PATH || path.join(__dirname, 'authoritative-marketplace-store.json');
  const SERVER_HMAC_SECRET =
    process.env.BOS_SERVER_HMAC_SECRET || 'bos-production-hmac-secret-2026-v1-a9f8e7d6c5b4';
  const RAZORPAY_KEY_ID = String(process.env.RAZORPAY_KEY_ID || '').trim();
  const RAZORPAY_KEY_SECRET = String(process.env.RAZORPAY_KEY_SECRET || '').trim();

  const razorpayApiRequest = async <T>(endpoint: string, init: RequestInit = {}): Promise<T> => {
    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
      throw new Error('RAZORPAY_NOT_CONFIGURED');
    }

    const authorization = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64');
    const response = await fetch(`https://api.razorpay.com/v1/${endpoint.replace(/^\//, '')}`, {
      ...init,
      headers: {
        Authorization: `Basic ${authorization}`,
        'content-type': 'application/json',
        ...(init.headers || {}),
      },
    });
    const data = (await response.json().catch(() => ({}))) as T & { error?: { description?: string } };
    if (!response.ok) {
      throw new Error(data?.error?.description || 'RAZORPAY_API_ERROR');
    }
    return data;
  };

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
    provider?: 'upi' | 'razorpay';
    razorpayOrderId?: string;
    razorpayPaymentId?: string;
    razorpaySignature?: string;
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
    paymentMode: 'pay_later' | 'pay_qr' | 'razorpay';
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

  function saveAuthoritativeStore(store: AuthoritativeStore): void {
    try {
      fs.writeFileSync(AUTH_STORE_FILE_PATH, JSON.stringify(store, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to persist authoritative store:', err);
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

  const SUPABASE_PROJECT_ID = 'ezrxykyocgbolpaebnqx';
  const rawEnvSupabaseUrl = (process.env.VITE_SUPABASE_URL || '').trim();
  const SUPABASE_PROJECT_URL =
    rawEnvSupabaseUrl && rawEnvSupabaseUrl.includes(SUPABASE_PROJECT_ID)
      ? rawEnvSupabaseUrl.replace(/\/+$/, '')
      : `https://${SUPABASE_PROJECT_ID}.supabase.co`;
  const SUPABASE_AUTH_CALLBACK_URL = `${SUPABASE_PROJECT_URL}/auth/v1/callback`;

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
  // 1. GOOGLE-ONLY OAUTH 2.0, SUPABASE OAUTH & SESSION ENDPOINTS
  //    Configured for Supabase Project: ezrxykyocgbolpaebnqx
  // ============================================================================

  // 1A. GET GOOGLE OAUTH AUTHORIZATION URL (Supabase OAuth + Popup Flow for Iframe Preview & Cloud Run)
  app.get('/api/auth/google/url', (req, res) => {
    const requestedRole = String(req.query.role || 'customer').toLowerCase();
    const requestOrigin =
      String(req.query.origin || '').trim() ||
      process.env.APP_URL?.replace(/\/+$/, '') ||
      `${req.protocol}://${req.get('host')}`;
    const callbackUrl = `${requestOrigin}/auth/callback`;
    const devCallbackUrl =
      'https://ais-dev-2sp75t3mb2qar3lhuhwjxd-429336547561.asia-southeast1.run.app/auth/callback';
    const sharedCallbackUrl =
      'https://ais-pre-2sp75t3mb2qar3lhuhwjxd-429336547561.asia-southeast1.run.app/auth/callback';

    const supabaseAuthorizeUrl = `${SUPABASE_PROJECT_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(
      `${callbackUrl}?role=${encodeURIComponent(requestedRole)}`
    )}&access_type=offline&prompt=select_account`;

    const googleClientId =
      process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '';
    const isRealGoogleConfigured =
      Boolean(googleClientId) &&
      !googleClientId.includes('your-google-oauth-client-id');

    const supabasePublishableKey = (
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY ||
      ''
    ).trim();
    const isSupabaseKeyConfigured =
      Boolean(supabasePublishableKey) &&
      supabasePublishableKey !== 'your-supabase-publishable-or-anon-key';

    const statePayload = Buffer.from(
      JSON.stringify({
        role: requestedRole,
        origin: requestOrigin,
        supabaseProjectId: SUPABASE_PROJECT_ID,
        ts: Date.now(),
      }),
      'utf-8'
    ).toString('base64url');

    if (isRealGoogleConfigured) {
      const params = new URLSearchParams({
        client_id: googleClientId,
        redirect_uri: callbackUrl,
        response_type: 'code',
        scope: 'openid email profile',
        access_type: 'offline',
        prompt: 'select_account',
        state: statePayload,
      });
      res.json({
        ok: true,
        configured: true,
        googleCloudConfigured: true,
        supabaseConfigured: isSupabaseKeyConfigured,
        supabaseProjectId: SUPABASE_PROJECT_ID,
        supabaseUrl: SUPABASE_PROJECT_URL,
        supabaseAuthorizeUrl,
        supabaseAuthCallbackUrl: SUPABASE_AUTH_CALLBACK_URL,
        authProvider: 'google',
        url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
        callbackUrl,
        devCallbackUrl,
        sharedCallbackUrl,
      });
      return;
    }

    // Return popup URL to the built-in Supabase + Google OAuth callback handler
    const fallbackParams = new URLSearchParams({
      oauth_picker: '1',
      role: requestedRole,
      state: statePayload,
    });
    res.json({
      ok: true,
      configured: isSupabaseKeyConfigured,
      googleCloudConfigured: false,
      supabaseConfigured: isSupabaseKeyConfigured,
      supabaseProjectId: SUPABASE_PROJECT_ID,
      supabaseUrl: SUPABASE_PROJECT_URL,
      supabaseAuthorizeUrl,
      supabaseAuthCallbackUrl: SUPABASE_AUTH_CALLBACK_URL,
      authProvider: 'google',
      url: `${callbackUrl}?${fallbackParams.toString()}`,
      callbackUrl,
      devCallbackUrl,
      sharedCallbackUrl,
      message:
        'Configured for Supabase project ezrxykyocgbolpaebnqx Google OAuth popup flow.',
    });
  });

  // 1B. SUPABASE & GOOGLE OAUTH CALLBACK HANDLER (/auth/callback & /auth/callback/)
  app.get(['/auth/callback', '/auth/callback/'], async (req, res) => {
    const code = String(req.query.code || '').trim();
    const stateRaw = String(req.query.state || '').trim();
    const oauthPicker = String(req.query.oauth_picker || '') === '1';
    let requestedRole = String(req.query.role || 'customer').toLowerCase();

    if (stateRaw) {
      try {
        const parsedState = JSON.parse(Buffer.from(stateRaw, 'base64url').toString('utf-8'));
        if (parsedState?.role) requestedRole = String(parsedState.role).toLowerCase();
      } catch {
        // ignore malformed state
      }
    }

    let googleEmail = String(req.query.google_email || req.query.email || '').trim();
    let googleName = String(req.query.google_name || req.query.name || '').trim();
    let googleSub = String(req.query.google_sub || req.query.sub || '').trim();
    let googleAvatar = String(req.query.google_avatar || req.query.avatar || '').trim();

    // If a real OAuth authorization code was returned by Google, exchange it for tokens and userinfo
    const googleClientId =
      process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '';
    const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
    if (code && googleClientId && googleClientSecret && !googleClientId.includes('your-google-oauth-client-id')) {
      try {
        const requestOrigin =
          process.env.APP_URL?.replace(/\/+$/, '') || `${req.protocol}://${req.get('host')}`;
        const callbackUrl = `${requestOrigin}/auth/callback`;
        const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code,
            client_id: googleClientId,
            client_secret: googleClientSecret,
            redirect_uri: callbackUrl,
            grant_type: 'authorization_code',
          }),
        });
        const tokenData: any = await tokenResp.json();
        if (tokenData && tokenData.access_token) {
          const profileResp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${tokenData.access_token}` },
          });
          const profileData: any = await profileResp.json();
          if (profileData && profileData.email) {
            googleEmail = String(profileData.email);
            googleName = String(profileData.name || '');
            googleSub = String(profileData.id || '');
            googleAvatar = String(profileData.picture || '');
          }
        }
      } catch (err) {
        console.error('Google OAuth token exchange error:', err);
      }
    }

    // When opened as a Supabase OAuth redirect (e.g. /auth/callback#access_token=...) or interactive popup picker
    if (!googleEmail) {
      const store = loadAuthoritativeStore();
      const sampleAccounts = store.users.slice(0, 6);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Sign in with Google — BookOurSpace (Supabase ${SUPABASE_PROJECT_ID})</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; color: #0f172a; margin: 0; padding: 24px; display: flex; justify-content: center; align-items: center; min-height: 90vh; }
    .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 20px; max-width: 440px; width: 100%; padding: 24px; box-shadow: 0 20px 25px -5px rgba(15,23,42,0.1); }
    .title { font-size: 18px; font-weight: 800; margin: 8px 0 4px; }
    .sub { font-size: 12px; color: #64748b; margin-bottom: 16px; }
    .acct { display: flex; align-items: center; justify-content: space-between; width: 100%; text-align: left; padding: 10px 12px; margin-bottom: 8px; border: 1px solid #e2e8f0; border-radius: 12px; background: #f8fafc; cursor: pointer; text-decoration: none; color: inherit; box-sizing: border-box; }
    .acct:hover { border-color: #4338ca; background: #eef2ff; }
    .badge { font-size: 10px; font-weight: 800; text-transform: uppercase; padding: 2px 8px; border-radius: 99px; background: #e0e7ff; color: #3730a3; }
    .blocked { background: #fee2e2; color: #991b1b; }
    input { width: 100%; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 10px; font-size: 13px; margin-bottom: 10px; box-sizing: border-box; }
    button.primary { width: 100%; padding: 11px; border: none; border-radius: 12px; background: #4338ca; color: #fff; font-weight: 800; font-size: 13px; cursor: pointer; }
    .supa-btn { display: block; width: 100%; text-align: center; padding: 10px 12px; margin-bottom: 12px; border-radius: 12px; border: 1px solid #cbd5e1; background: #fff; color: #0f172a; font-weight: 800; font-size: 12px; text-decoration: none; box-sizing: border-box; }
    .supa-btn:hover { background: #f1f5f9; border-color: #4338ca; }
  </style>
</head>
<body>
  <div class="card" id="oauth-card">
    <div style="font-size:11px;font-weight:800;color:#4338ca;">GOOGLE OAUTH 2.0 • SUPABASE (${SUPABASE_PROJECT_ID})</div>
    <div class="title">Sign in with Google</div>
    <div class="sub" id="status-sub">New users automatically receive a Customer profile. Existing users keep their assigned role and data.</div>
    <a class="supa-btn" href="${SUPABASE_PROJECT_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(
        `${req.protocol}://${req.get('host')}/auth/callback`
      )}">
      Redirect via Supabase Auth (${SUPABASE_PROJECT_ID}.supabase.co)
    </a>
    ${sampleAccounts
      .map(
        (u) => `
      <a class="acct" href="/auth/callback?google_email=${encodeURIComponent(
        u.email
      )}&google_name=${encodeURIComponent(u.name)}&google_sub=${encodeURIComponent(
          u.googleSub || `google-${u.id}`
        )}">
        <div>
          <div style="font-weight:700;font-size:13px;">${u.name}</div>
          <div style="font-size:11px;color:#64748b;">${u.email}</div>
        </div>
        <span class="badge ${
          u.accountStatus === 'suspended' || u.accountStatus === 'blocked' ? 'blocked' : ''
        }">${
          u.accountStatus === 'suspended' || u.accountStatus === 'blocked'
            ? u.accountStatus
            : u.role
        }</span>
      </a>`
      )
      .join('')}
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:14px 0;" />
    <form method="GET" action="/auth/callback">
      <input type="email" name="google_email" required placeholder="new.customer@gmail.com" />
      <input type="text" name="google_name" placeholder="Full Name (New Customer Auto-Registration)" />
      <button type="submit" class="primary">Continue with Google</button>
    </form>
  </div>
  <script>
    (async function handleSupabaseHashCallback() {
      try {
        const hash = window.location.hash ? window.location.hash.substring(1) : '';
        if (!hash) return;
        const params = new URLSearchParams(hash);
        const accessToken = params.get('access_token');
        if (!accessToken) return;
        document.getElementById('status-sub').innerText = 'Verifying Supabase Google OAuth session...';
        let email = '';
        let name = '';
        let sub = '';
        let avatar = '';
        const parts = accessToken.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
          email = payload.email || (payload.user_metadata && payload.user_metadata.email) || '';
          name = (payload.user_metadata && (payload.user_metadata.full_name || payload.user_metadata.name)) || '';
          sub = payload.sub || '';
          avatar = (payload.user_metadata && (payload.user_metadata.avatar_url || payload.user_metadata.picture)) || '';
        }
        if (email) {
          const resp = await fetch('/api/auth/google/authenticate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              authProvider: 'google',
              supabaseProjectId: ${JSON.stringify(SUPABASE_PROJECT_ID)},
              email,
              name,
              googleSub: sub,
              avatarUrl: avatar
            })
          });
          const data = await resp.json();
          if (resp.ok && data.ok && window.opener) {
            window.opener.postMessage({
              type: 'OAUTH_AUTH_SUCCESS',
              isNewUser: data.isNewUser,
              user: data.user,
              sessionToken: data.sessionToken,
              redirectTarget: data.redirectTarget
            }, '*');
            window.close();
            return;
          }
        }
      } catch (e) {
        console.error('Supabase hash callback parse error:', e);
      }
    })();
  </script>
</body>
</html>`);
      return;
    }

    const authResult = authenticateOrRegisterGoogleUser({
      email: googleEmail,
      name: googleName,
      googleSub,
      avatarUrl: googleAvatar,
      requestedRole,
      allowRoleChange: false,
    });

    if (!authResult.ok) {
      res.status(authResult.status).send(`<!DOCTYPE html>
<html>
  <body>
    <script>
      if (window.opener) {
        window.opener.postMessage(${JSON.stringify({
          type: 'OAUTH_AUTH_ERROR',
          error: authResult.error,
          accountStatus: authResult.accountStatus,
          message: authResult.message,
        })}, '*');
        window.close();
      } else {
        document.body.innerText = ${JSON.stringify(authResult.message)};
      }
    </script>
  </body>
</html>`);
      return;
    }

    res.send(`<!DOCTYPE html>
<html>
  <body>
    <script>
      if (window.opener) {
        window.opener.postMessage(${JSON.stringify({
          type: 'OAUTH_AUTH_SUCCESS',
          isNewUser: authResult.isNewUser,
          user: authResult.user,
          sessionToken: authResult.sessionToken,
          redirectTarget: authResult.redirectTarget,
        })}, '*');
        window.close();
      } else {
        window.location.href = '/';
      }
    </script>
    <p>Google authentication successful. Closing window...</p>
  </body>
</html>`);
  });

  // 1C. AUTHORITATIVE GOOGLE OAUTH AUTHENTICATE / AUTO-REGISTER ENDPOINT
  app.post('/api/auth/google/authenticate', (req, res) => {
    const {
      email,
      name,
      googleSub,
      avatarUrl,
      phone,
      requestedRole,
      allowRoleChange,
      city,
      authProvider,
    } = req.body || {};

    // Enforce Google-only login policy
    if (authProvider && String(authProvider).toLowerCase() !== 'google') {
      res.status(400).json({
        ok: false,
        error: 'GOOGLE_OAUTH_ONLY',
        message: 'Only Google OAuth authentication is permitted. Password and non-Google logins are disabled.',
      });
      return;
    }

    const result = authenticateOrRegisterGoogleUser({
      email: String(email || ''),
      name: name ? String(name) : undefined,
      googleSub: googleSub ? String(googleSub) : undefined,
      avatarUrl: avatarUrl ? String(avatarUrl) : undefined,
      phone: phone ? String(phone) : undefined,
      requestedRole: requestedRole ? String(requestedRole) : undefined,
      allowRoleChange: Boolean(allowRoleChange),
      city: city ? String(city) : undefined,
    });

    if (!result.ok) {
      res.status(result.status).json(result);
      return;
    }

    res.status(result.isNewUser ? 201 : 200).json({
      ok: true,
      authProvider: 'google',
      supabaseProjectId: SUPABASE_PROJECT_ID,
      isNewUser: result.isNewUser,
      user: result.user,
      sessionToken: result.sessionToken,
      claims: result.claims,
      redirectTarget: result.redirectTarget,
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
      const expectedAdminPasscode = process.env.BOS_ADMIN_PASSCODE || 'bos-admin-2026-verified';
      if (adminPasscode !== expectedAdminPasscode) {
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

  // 5. SERVER-SIDE UPI PAYMENT INTENT CREATION
  app.post('/api/payments/create-intent', (req, res) => {
    const { amount, merchantVpa, planOrListing, userId } = req.body || {};
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      res.status(400).json({ ok: false, error: 'INVALID_AMOUNT' });
      return;
    }

    const intentId = `INT-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const nowIso = new Date().toISOString();
    const store = loadAuthoritativeStore();

    const record: PaymentIntentRecord = {
      intentId,
      userId: String(userId || 'guest'),
      amount: numericAmount,
      merchantVpa: String(merchantVpa || 'bookourspace@okhdfcbank').trim(),
      planOrListing: String(planOrListing || 'BookOurSpace Service').trim(),
      status: 'created',
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    store.paymentIntents[intentId] = record;
    saveAuthoritativeStore(store);

    res.json({
      ok: true,
      intentId,
      amount: record.amount,
      merchantVpa: record.merchantVpa,
      status: record.status,
      createdAt: nowIso,
    });
  });

  // 5B. RAZORPAY TEST/LIVE ORDER CREATION (SECRET STAYS SERVER-SIDE)
  app.post('/api/payments/razorpay/order', async (req, res) => {
    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
      res.status(503).json({ ok: false, error: 'RAZORPAY_NOT_CONFIGURED' });
      return;
    }

    const { amount, planOrListing, userId } = req.body || {};
    const numericAmount = Number(amount);
    const amountInPaise = Math.round(numericAmount * 100);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0 || amountInPaise < 100) {
      res.status(400).json({ ok: false, error: 'INVALID_AMOUNT' });
      return;
    }

    const intentId = `RZP-INT-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const nowIso = new Date().toISOString();
    const store = loadAuthoritativeStore();

    try {
      const order = await razorpayApiRequest<{
        id: string;
        amount: number;
        currency: string;
        status: string;
        receipt?: string;
      }>('orders', {
        method: 'POST',
        body: JSON.stringify({
          amount: amountInPaise,
          currency: 'INR',
          receipt: intentId.slice(0, 40),
          notes: {
            bookourspace_intent_id: intentId,
            plan_or_listing: String(planOrListing || 'BookOurSpace Stay').slice(0, 200),
          },
        }),
      });

      if (!order.id || order.amount !== amountInPaise || order.currency !== 'INR') {
        res.status(502).json({ ok: false, error: 'RAZORPAY_ORDER_INVALID' });
        return;
      }

      store.paymentIntents[intentId] = {
        intentId,
        userId: String(userId || 'guest'),
        amount: numericAmount,
        merchantVpa: '',
        planOrListing: String(planOrListing || 'BookOurSpace Stay').trim(),
        status: 'created',
        provider: 'razorpay',
        razorpayOrderId: order.id,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      saveAuthoritativeStore(store);

      res.json({
        ok: true,
        keyId: RAZORPAY_KEY_ID,
        intentId,
        orderId: order.id,
        amount: numericAmount,
        amountInPaise,
        currency: order.currency,
        status: order.status,
      });
    } catch (error: any) {
      console.error('Razorpay order creation failed:', error?.message || 'RAZORPAY_API_ERROR');
      res.status(502).json({ ok: false, error: 'RAZORPAY_ORDER_FAILED' });
    }
  });

  // 5C. RAZORPAY CHECKOUT SIGNATURE + CAPTURE VALIDATION
  app.post('/api/payments/razorpay/verify', async (req, res) => {
    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
      res.status(503).json({ ok: false, verified: false, error: 'RAZORPAY_NOT_CONFIGURED' });
      return;
    }

    const { intentId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body || {};
    const cleanIntentId = String(intentId || '').trim();
    const cleanOrderId = String(razorpayOrderId || '').trim();
    const cleanPaymentId = String(razorpayPaymentId || '').trim();
    const cleanSignature = String(razorpaySignature || '').trim();
    if (!cleanIntentId || !cleanOrderId || !cleanPaymentId || !cleanSignature) {
      res.status(400).json({ ok: false, verified: false, error: 'INVALID_RAZORPAY_PAYLOAD' });
      return;
    }

    const store = loadAuthoritativeStore();
    const intent = store.paymentIntents[cleanIntentId];
    if (!intent || intent.provider !== 'razorpay' || intent.razorpayOrderId !== cleanOrderId) {
      res.status(404).json({ ok: false, verified: false, error: 'RAZORPAY_INTENT_NOT_FOUND' });
      return;
    }

    if (
      !isValidRazorpayPaymentSignature(
        cleanOrderId,
        cleanPaymentId,
        cleanSignature,
        RAZORPAY_KEY_SECRET
      )
    ) {
      res.status(400).json({ ok: false, verified: false, error: 'RAZORPAY_SIGNATURE_INVALID' });
      return;
    }

    if (intent.status === 'verified') {
      if (intent.razorpayPaymentId === cleanPaymentId) {
        res.json({
          ok: true,
          verified: true,
          status: 'verified',
          intentId: cleanIntentId,
          paymentId: cleanPaymentId,
          paymentVerificationToken: intent.paymentVerificationToken,
          idempotentReplay: true,
        });
      } else {
        res.status(409).json({ ok: false, verified: false, error: 'RAZORPAY_PAYMENT_REPLAY' });
      }
      return;
    }

    try {
      const payment = await razorpayApiRequest<{
        id: string;
        order_id?: string;
        amount: number;
        currency: string;
        status: string;
      }>(`payments/${encodeURIComponent(cleanPaymentId)}`);
      const expectedAmountInPaise = Math.round(intent.amount * 100);
      if (!isCapturedRazorpayPayment(payment, {
        paymentId: cleanPaymentId,
        orderId: cleanOrderId,
        amountInPaise: expectedAmountInPaise,
      })) {
        res.status(409).json({ ok: false, verified: false, error: 'RAZORPAY_PAYMENT_NOT_CAPTURED' });
        return;
      }

      const verificationToken = computeHmac(
        `${intent.intentId}|${cleanPaymentId}|RAZORPAY|VERIFIED|${intent.amount.toFixed(2)}`,
        'RAZORPAY_PAYMENT_VERIFIED'
      );
      intent.status = 'verified';
      intent.razorpayPaymentId = cleanPaymentId;
      intent.razorpaySignature = cleanSignature;
      intent.paymentVerificationToken = verificationToken;
      intent.updatedAt = new Date().toISOString();
      saveAuthoritativeStore(store);

      res.json({
        ok: true,
        verified: true,
        status: 'verified',
        intentId: cleanIntentId,
        paymentId: cleanPaymentId,
        paymentVerificationToken: verificationToken,
      });
    } catch (error: any) {
      console.error('Razorpay payment validation failed:', error?.message || 'RAZORPAY_API_ERROR');
      res.status(502).json({ ok: false, verified: false, error: 'RAZORPAY_PAYMENT_LOOKUP_FAILED' });
    }
  });

  // 6. SIMULATED / GATEWAY NPCI WEBHOOK SETTLEMENT (Generates Authoritative Server Gateway Signature)
  app.post('/api/payments/webhook-settle', (req, res) => {
    if (!isSimulatedPaymentSettlementAllowed(process.env)) {
      res.status(403).json({
        ok: false,
        error: 'SIMULATED_SETTLEMENT_DISABLED',
        message: 'Simulated settlement is disabled. Only a real provider webhook can mark a payment verified.',
      });
      return;
    }

    const { intentId, utrNumber, amount } = req.body || {};
    const cleanIntentId = String(intentId || '').trim();
    const cleanUtr = String(utrNumber || '').trim().replace(/\s+/g, '');

    if (!cleanIntentId || !/^[A-Za-z0-9]{12,22}$/.test(cleanUtr)) {
      res.status(400).json({
        ok: false,
        error: 'INVALID_SETTLEMENT_PAYLOAD',
        message: 'Valid intentId and 12-to-22 character alphanumeric bank UTR are required.',
      });
      return;
    }

    const store = loadAuthoritativeStore();
    const intent = store.paymentIntents[cleanIntentId];
    if (!intent) {
      res.status(404).json({ ok: false, error: 'PAYMENT_INTENT_NOT_FOUND' });
      return;
    }

    const existingUtr = store.usedUtrs[cleanUtr];
    if (existingUtr && existingUtr.intentId !== cleanIntentId) {
      res.status(409).json({
        ok: false,
        error: 'DUPLICATE_UTR_REPLAY',
        message: `UTR ${cleanUtr} has already been used for another transaction (${existingUtr.intentId}).`,
      });
      return;
    }

    const effectiveAmount = Number(amount ?? intent.amount);
    const gatewaySignature = computeHmac(
      `${cleanIntentId}|${effectiveAmount.toFixed(2)}|${cleanUtr}|${intent.merchantVpa}`,
      'UPI_GATEWAY_WEBHOOK'
    );

    res.json({
      ok: true,
      intentId: cleanIntentId,
      utrNumber: cleanUtr,
      amount: effectiveAmount,
      gatewaySignature,
    });
  });

  // 7. SERVER-SIDE UPI PAYMENT VERIFICATION (Enforces: UTR alone != verified payment)
  app.post('/api/payments/verify-upi', (req, res) => {
    const { intentId, utrNumber, gatewaySignature, amount, merchantVpa } = req.body || {};
    const cleanIntentId = String(intentId || '').trim();
    const cleanUtr = String(utrNumber || '').trim().replace(/\s+/g, '');
    const cleanSig = String(gatewaySignature || '').trim();

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
    let intent = cleanIntentId ? store.paymentIntents[cleanIntentId] : undefined;

    // Anti-replay: reject if UTR was already used on a different payment intent
    const existingUtr = store.usedUtrs[cleanUtr];
    if (existingUtr && existingUtr.intentId !== cleanIntentId) {
      res.status(409).json({
        ok: false,
        verified: false,
        error: 'DUPLICATE_UTR_REPLAY',
        message: `UTR ${cleanUtr} was already submitted for transaction ${existingUtr.intentId}. Replay rejected.`,
      });
      return;
    }

    if (!intent) {
      const generatedIntentId = cleanIntentId || `INT-${Date.now()}`;
      intent = {
        intentId: generatedIntentId,
        userId: 'guest',
        amount: Number(amount) || 1,
        merchantVpa: String(merchantVpa || 'bookourspace@okhdfcbank').trim(),
        planOrListing: 'Direct UPI Payment',
        status: 'created',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      store.paymentIntents[generatedIntentId] = intent;
    }

    const expectedSig = computeHmac(
      `${intent.intentId}|${intent.amount.toFixed(2)}|${cleanUtr}|${intent.merchantVpa}`,
      'UPI_GATEWAY_WEBHOOK'
    );

    const hasValidGatewayProof = cleanSig.length > 0 && safeTimingEqualHex(cleanSig, expectedSig);

    // CRITICAL SECURITY RULE: UTR alone != success!
    if (!hasValidGatewayProof) {
      intent.utrNumber = cleanUtr;
      intent.status = 'pending_provider_reconciliation';
      intent.updatedAt = new Date().toISOString();
      store.usedUtrs[cleanUtr] = {
        intentId: intent.intentId,
        status: 'pending_provider_reconciliation',
        recordedAt: intent.updatedAt,
      };
      saveAuthoritativeStore(store);

      res.status(202).json({
        ok: true,
        verified: false,
        status: 'pending_provider_reconciliation',
        intentId: intent.intentId,
        utrNumber: cleanUtr,
        message:
          'UTR recorded as Pending Bank Reconciliation. Submitting a UTR number alone does not mark payment as verified until bank/gateway webhook confirmation.',
      });
      return;
    }

    // Cryptographic gateway/webhook signature verified
    const verificationToken = computeHmac(
      `${intent.intentId}|${cleanUtr}|VERIFIED|${intent.amount.toFixed(2)}`,
      'PAYMENT_VERIFIED_TOKEN'
    );

    intent.utrNumber = cleanUtr;
    intent.gatewaySignature = cleanSig;
    intent.status = 'verified';
    intent.paymentVerificationToken = verificationToken;
    intent.updatedAt = new Date().toISOString();

    store.usedUtrs[cleanUtr] = {
      intentId: intent.intentId,
      status: 'verified',
      recordedAt: intent.updatedAt,
    };
    saveAuthoritativeStore(store);

    res.json({
      ok: true,
      verified: true,
      status: 'verified',
      intentId: intent.intentId,
      utrNumber: cleanUtr,
      amount: intent.amount,
      paymentVerificationToken: verificationToken,
      message: 'Payment cryptographically verified via bank/gateway settlement signature.',
    });
  });

  // 8. ATOMIC BOOKING CREATION (Enforces Account Blocking, Idempotency, Seat/Slot Concurrency & Signs QR Pass)
  app.post('/api/bookings/atomic', (req, res) => {
    const body = req.body || {};
    const sessionClaims = verifySessionTokenFromRequest(req);
    const store = loadAuthoritativeStore();

    // Enforce account blocking on bookings
    const blocked = findBlockedUserInStore(
      store,
      sessionClaims?.userId || body.customerUserId,
      sessionClaims?.email || body.customerEmail
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

    pruneExpiredSeatHolds(store);

    // 8A. IDEMPOTENCY CHECK: Return existing booking if idempotencyKey was already processed
    const existingByIdempotency = store.bookings.find((b) => b.idempotencyKey === idempotencyKey);
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

    // 8D. SERVER-SIDE PAYMENT STATUS RESOLUTION (Never trust client 'paid' boolean without intent verification)
    const paymentMode: 'pay_later' | 'pay_qr' | 'razorpay' =
      body.paymentMode === 'razorpay' ? 'razorpay' : body.paymentMode === 'pay_qr' ? 'pay_qr' : 'pay_later';
    let paymentStatus: 'pay_later' | 'pending_verification' | 'verified' = 'pay_later';
    const paymentIntentId = body.paymentIntentId ? String(body.paymentIntentId).trim() : undefined;
    const paymentUtr = body.paymentUtr ? String(body.paymentUtr).trim() : undefined;

    if (paymentMode === 'pay_qr' || paymentMode === 'razorpay') {
      const intent = paymentIntentId ? store.paymentIntents[paymentIntentId] : undefined;
      if (
        intent &&
        intent.status === 'verified' &&
        (paymentMode === 'pay_qr' ? !intent.provider || intent.provider === 'upi' : intent.provider === 'razorpay') &&
        (!body.paymentVerificationToken ||
          intent.paymentVerificationToken === String(body.paymentVerificationToken))
      ) {
        paymentStatus = 'verified';
      } else {
        // Even if client claims QR paid or submits a raw UTR, server marks it pending_verification until webhook proof
        paymentStatus = 'pending_verification';
      }
    }

    // Strict Movie Checkout Rule: Never confirm booking when requireVerifiedPayment is set unless paymentStatus === 'verified'
    if (body.requireVerifiedPayment === true && paymentStatus !== 'verified') {
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

    const customerUserId = String(sessionClaims?.userId || body.customerUserId || 'customer-guest');
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

    appendAuthoritativeNotification(store, {
      recipientUserId: customerUserId,
      targetRole: 'all_users',
      title: '📅 Booking Confirmed & Signed QR Pass Ready',
      message: `${newBooking.customerName} booked "${newBooking.listingTitle}" for ${newBooking.scheduledDate} (${newBooking.timeSlot}). Pass: ${newBooking.passCode}`,
      type: 'booking',
      linkId: newBooking.id,
    });

    saveAuthoritativeStore(store);

    res.status(201).json({
      ok: true,
      idempotentReplay: false,
      booking: newBooking,
    });
  });

  // 8E. AUTHORITATIVE STAY CANCELLATION & REFUND INITIATION
  // Refunds remain initiated until a real payment-provider reconciliation marks them complete.
  app.post('/api/bookings/:id/cancel', (req, res) => {
    const claims = verifySessionTokenFromRequest(req);
    if (!claims) {
      res.status(401).json({ ok: false, error: 'UNAUTHORIZED_SESSION', message: 'Sign in to cancel a stay booking.' });
      return;
    }

    const store = loadAuthoritativeStore();
    const blocked = findBlockedUserInStore(store, claims.userId, claims.email);
    if (blocked) {
      res.status(403).json({ ok: false, error: 'ACCOUNT_BLOCKED' });
      return;
    }

    const bookingId = String(req.params.id || '').trim();
    const booking = store.bookings.find((candidate) => candidate.id === bookingId);
    if (!booking) {
      res.status(404).json({ ok: false, error: 'BOOKING_NOT_FOUND', message: `Booking "${bookingId}" was not found.` });
      return;
    }

    if (Array.isArray(booking.seats) && booking.seats.length > 0) {
      res.status(409).json({
        ok: false,
        error: 'USE_MOVIE_CANCELLATION_ENDPOINT',
        message: 'Movie seat bookings must use the cinema cancellation workflow.',
      });
      return;
    }

    const isOwner = booking.customerUserId === claims.userId;
    const isProviderOrAdmin = claims.role === 'provider' || claims.role === 'admin';
    if (!isOwner && !isProviderOrAdmin) {
      res.status(403).json({
        ok: false,
        error: 'FORBIDDEN_NOT_BOOKING_OWNER',
        message: 'You can only cancel your own stay bookings unless you are an authorized provider or admin.',
      });
      return;
    }

    if (booking.status === 'cancelled') {
      res.status(409).json({
        ok: false,
        error: 'ALREADY_CANCELLED',
        booking,
        message: 'This stay booking has already been cancelled.',
      });
      return;
    }

    const checkInDate = booking.checkInDate || booking.scheduledDate;
    const cancellation = evaluateStayCancellation({
      totalAmount: booking.totalAmount,
      checkInAt: `${checkInDate}T12:00:00.000Z`,
      cancellationAllowed: true,
      cancellationCutoffMinutes: 1440,
      refundPercent: 80,
      paymentStatus: booking.paymentStatus,
    });

    if (!cancellation.allowed) {
      res.status(409).json({
        ok: false,
        error: 'CANCELLATION_NOT_ALLOWED',
        refund: cancellation,
        message: cancellation.reason || 'This stay can no longer be cancelled under its policy.',
      });
      return;
    }

    const nowIso = new Date().toISOString();
    booking.status = 'cancelled';
    booking.cancelledAt = nowIso;
    booking.cancellationReason = String(req.body?.reason || 'Customer requested cancellation').slice(0, 240);
    booking.refundAmount = cancellation.refundAmount;
    booking.refundStatus = cancellation.refundStatus;

    appendAuthoritativeNotification(store, {
      recipientUserId: booking.customerUserId,
      targetRole: 'all_users',
      title: cancellation.refundStatus === 'initiated' ? '↩️ Stay Cancelled · Refund Initiated' : '⚠️ Stay Booking Cancelled',
      message:
        cancellation.refundStatus === 'initiated'
          ? `Booking ${booking.passCode} was cancelled. ₹${cancellation.refundAmount} refund is pending payment-provider reconciliation.`
          : `Booking ${booking.passCode} was cancelled. ${cancellation.reason || 'No online refund is due.'}`,
      type: 'payment',
      linkId: booking.id,
    });

    saveAuthoritativeStore(store);

    res.json({
      ok: true,
      booking,
      refund: {
        refundAmount: cancellation.refundAmount,
        refundPercent: cancellation.refundPercent,
        status: cancellation.refundStatus,
        message:
          cancellation.refundStatus === 'initiated'
            ? 'Refund initiated and awaiting payment-provider reconciliation.'
            : cancellation.reason || 'No online refund is due.',
      },
      message: `Stay booking ${booking.passCode} cancelled successfully.`,
    });
  });

  // 9. CRYPTOGRAPHIC QR PASS SIGNING & VERIFICATION ENDPOINTS
  app.post('/api/passes/verify', (req, res) => {
    const { passToken, passCode, signature, markCheckedIn, verifierRole } = req.body || {};
    const store = loadAuthoritativeStore();

    let cleanCode = String(passCode || '').trim().toUpperCase();
    let providedSig = String(signature || '').trim().toUpperCase();

    const rawToken = String(passToken || '').trim();
    if (rawToken.includes('.')) {
      const parts = rawToken.split('.');
      cleanCode = parts[0].trim().toUpperCase();
      providedSig = parts.slice(1).join('.').trim().toUpperCase();
    } else if (!cleanCode && rawToken) {
      cleanCode = rawToken.toUpperCase();
    }

    if (!cleanCode) {
      res.status(400).json({ ok: false, verified: false, error: 'MISSING_PASS_CODE' });
      return;
    }

    // Look up authoritative booking by passCode or qrPassToken or bookingId
    const booking = store.bookings.find(
      (b) =>
        b.passCode.toUpperCase() === cleanCode ||
        b.qrPassToken.toUpperCase() === rawToken.toUpperCase() ||
        b.id.toUpperCase() === cleanCode
    );

    if (!booking) {
      res.status(403).json({
        ok: false,
        verified: false,
        error: 'PASS_NOT_FOUND_OR_FORGED',
        message: `QR Pass "${cleanCode}" does not match any server-issued booking record.`,
      });
      return;
    }

    // Verify cryptographic HMAC signature
    const expected = signQrPassPayload({
      passCode: booking.passCode,
      bookingId: booking.id,
      listingId: booking.listingId,
      scheduledDate: booking.scheduledDate,
      seats: booking.seats,
    });

    if (!providedSig || !safeTimingEqualHex(providedSig, expected.qrSignature)) {
      res.status(403).json({
        ok: false,
        verified: false,
        error: 'INVALID_OR_FORGED_QR_SIGNATURE',
        message: 'Cryptographic HMAC-SHA256 signature is missing or invalid. Forged QR passes are rejected.',
      });
      return;
    }

    if (booking.status === 'cancelled') {
      res.status(403).json({
        ok: false,
        verified: false,
        error: 'BOOKING_CANCELLED',
        message: `QR Pass ${booking.passCode} has been cancelled and refunded. Theatre entry is denied.`,
      });
      return;
    }

    if (booking.paymentMode === 'pay_qr' && booking.paymentStatus !== 'verified') {
      res.status(403).json({
        ok: false,
        verified: false,
        error: 'PAYMENT_NOT_VERIFIED',
        message: `QR Pass ${booking.passCode} payment is pending bank settlement verification. Entry is denied.`,
      });
      return;
    }

    if (booking.expiresAtIso && new Date(booking.expiresAtIso).getTime() < Date.now()) {
      res.status(403).json({
        ok: false,
        verified: false,
        error: 'TICKET_EXPIRED',
        message: `QR Pass ${booking.passCode} expired at ${booking.expiresAtIso}.`,
      });
      return;
    }

    const existingCheckIn = store.checkedInPasses[booking.passCode];
    if (markCheckedIn) {
      if (existingCheckIn) {
        res.status(409).json({
          ok: false,
          verified: true,
          alreadyCheckedIn: true,
          error: 'PASS_ALREADY_USED',
          checkedInAt: existingCheckIn.checkedInAt,
          message: `QR Pass ${booking.passCode} was already scanned and used at ${existingCheckIn.checkedInAt}.`,
        });
        return;
      }

      const checkedInAt = new Date().toISOString();
      store.checkedInPasses[booking.passCode] = {
        checkedInAt,
        checkedInBy: String(verifierRole || 'provider_scanner'),
      };
      booking.checkedInAt = checkedInAt;
      saveAuthoritativeStore(store);
    }

    res.json({
      ok: true,
      verified: true,
      passCode: booking.passCode,
      qrPassToken: booking.qrPassToken,
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
        foodAddons: booking.foodAddons,
        totalAmount: booking.totalAmount,
        paymentStatus: booking.paymentStatus,
        status: booking.status,
        checkedInAt: booking.checkedInAt || existingCheckIn?.checkedInAt || null,
      },
    });
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
  app.get('/api/movies/inventory', (req, res) => {
    const claims = verifySessionTokenFromRequest(req);
    const store = loadAuthoritativeStore();
    if (pruneExpiredSeatHolds(store)) {
      saveAuthoritativeStore(store);
    }
    const engine = getCinemaModuleStore(store);

    const normalizedScreens = engine.screens.map((s: any) => ({
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

    const movieBookings = store.bookings.filter(
      (b) =>
        b.listingId.startsWith('movie-') ||
        b.listingId.startsWith('listing-movie-') ||
        (Array.isArray(b.seats) && b.seats.length > 0)
    );

    const visibleBookings =
      !claims
        ? movieBookings
        : claims.role === 'admin' || claims.role === 'provider'
        ? movieBookings
        : movieBookings.filter((b) => b.customerUserId === claims.userId);

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
      refunds: engine.refunds || [],
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
  app.put('/api/movies/screens', (req, res) => {
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

  // 15C. ATOMIC TICKET CANCELLATION, SEAT LOCK RELEASE & REFUND ENGINE
  app.post('/api/movies/bookings/:id/cancel', (req, res) => {
    const claims = verifySessionTokenFromRequest(req);
    const bookingIdOrPass = String(req.params.id || '').trim();
    const { reason = 'Customer requested cancellation', sessionId, customerPhone } = req.body || {};

    const store = loadAuthoritativeStore();
    if (claims) {
      const blocked = findBlockedUserInStore(store, claims.userId, claims.email);
      if (blocked) {
        res.status(403).json({ ok: false, error: 'ACCOUNT_BLOCKED' });
        return;
      }
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

    const cleanReqPhone = String(customerPhone || '').replace(/\D/g, '');
    const cleanBookingPhone = String(booking.customerPhone || '').replace(/\D/g, '');

    // Verify ownership or provider/admin privileges
    const isOwner =
      (claims && booking.customerUserId === claims.userId) ||
      (sessionId && booking.customerUserId === String(sessionId)) ||
      (cleanReqPhone && cleanReqPhone === cleanBookingPhone) ||
      !claims;
    const isProviderOrAdmin =
      claims && (claims.role === 'admin' || claims.role === 'provider');

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

    const engine = getCinemaModuleStore(store);
    const screenConfig: any = engine.screens.find(
      (s: any) => s.listingId === booking.listingId || s.cinemaListingId === booking.listingId
    );
    const refundPercent = screenConfig ? screenConfig.refundPercent : 80;
    const refundAmount = Math.round((booking.totalAmount * refundPercent) / 100);
    const cancellationFee = Math.max(0, booking.totalAmount - refundAmount);

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
    booking.paymentStatus = 'refunded';
    booking.cancelledAt = nowIso;
    booking.cancellationReason = String(reason);
    booking.refundAmount = refundAmount;
    booking.refundStatus = 'completed';

    const refundRecord = {
      id: `RFD-MOV-${Date.now().toString().slice(-6)}`,
      refundId: `RFD-MOV-${Date.now().toString().slice(-6)}`,
      bookingId: booking.id,
      passCode: booking.passCode,
      listingId: booking.listingId,
      listingTitle: booking.listingTitle,
      customerUserId: booking.customerUserId,
      customerName: booking.customerName,
      originalAmount: booking.totalAmount,
      refundPercent,
      cancellationFee,
      refundAmount,
      releasedSeats,
      reason: String(reason),
      status: 'processed',
      processedAt: nowIso,
    };

    engine.refunds.unshift(refundRecord);
    engine.auditLogs.unshift({
      id: `MOV-AUD-${Date.now().toString().slice(-5)}`,
      timestamp: nowIso,
      createdAt: nowIso,
      actor: claims?.name || booking.customerName || 'Customer',
      role: claims?.role || 'customer',
      action: 'BOOKING_CANCELLED_AND_REFUNDED',
      targetId: booking.passCode,
      details: `Cancelled ${booking.passCode} (${booking.listingTitle}). Released seats [${releasedSeats.join(', ')}]. Refunded ₹${refundAmount} (${refundPercent}% policy).`,
    });

    appendAuthoritativeNotification(store, {
      recipientUserId: booking.customerUserId,
      targetRole: 'all_users',
      title: `💸 Movie Ticket Cancelled & ₹${refundAmount} Refund Processed`,
      message: `Pass ${booking.passCode} cancelled. Seats ${releasedSeats.join(', ')} released. Refund ₹${refundAmount} (${refundPercent}%) initiated to source UPI.`,
      type: 'payment',
      linkId: booking.id,
    });

    saveAuthoritativeStore(store);

    res.json({
      ok: true,
      booking,
      refund: refundRecord,
      releasedSeats,
      message: `Ticket ${booking.passCode} cancelled. Seats ${releasedSeats.join(', ')} released and ₹${refundAmount} (${refundPercent}%) refunded.`,
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
  if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      ...(localDemo ? { envDir: process.env.BOS_DEMO_ENV_DIR } : {}),
      server: {
        middlewareMode: true,
        // Payment/order writes are authoritative runtime state, not source changes.
        // Watching this file would reload the SPA in the middle of checkout.
        watch: { ignored: ['**/authoritative-marketplace-store.json'] },
      },
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
  app.listen(PORT, localDemo ? '127.0.0.1' : '0.0.0.0', () => {
    console.log(`BookOurSpace Full-Stack Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
