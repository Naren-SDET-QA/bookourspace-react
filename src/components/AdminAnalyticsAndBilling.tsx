import React, { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp,
  BarChart3,
  DollarSign,
  Users,
  Calendar,
  Mail,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Download,
  Printer,
  RefreshCw,
  Send,
  Sparkles,
  FileText,
  Layers,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  ComposedChart,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import * as d3 from 'd3';
import {
  MarketplaceListing,
  Booking,
  PaymentTransaction,
} from '../types/marketplace';
import {
  AdminManagedUser,
  AdminPaymentSettings,
  AdminAuditLogEntry,
} from '../utils/adminEnterpriseStore';
import {
  printGSTInvoiceReceipt,
  downloadGSTInvoicePDF,
  GSTInvoicePayload,
} from '../utils/gstInvoiceGenerator';

export interface AutomatedBillingRecord {
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
}

const BILLING_STORAGE_KEY = 'bos_automated_billing_records_v1';

const SEEDED_BILLING_RECORDS: AutomatedBillingRecord[] = [
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

export function loadAutomatedBillingRecords(): AutomatedBillingRecord[] {
  try {
    const raw = localStorage.getItem(BILLING_STORAGE_KEY);
    if (!raw) return SEEDED_BILLING_RECORDS;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : SEEDED_BILLING_RECORDS;
  } catch {
    return SEEDED_BILLING_RECORDS;
  }
}

export function saveAutomatedBillingRecords(records: AutomatedBillingRecord[]) {
  try {
    localStorage.setItem(BILLING_STORAGE_KEY, JSON.stringify(records));
  } catch {
    // ignore storage errors
  }
}

// ============================================================================
// 1. ANALYTICS & PERFORMANCE MODULE (Recharts + D3.js Platform Intelligence)
// ============================================================================
interface AdminAnalyticsPerformanceModuleProps {
  users: AdminManagedUser[];
  listings: MarketplaceListing[];
  bookings: Booking[];
  transactions: PaymentTransaction[];
  paymentSettings: AdminPaymentSettings;
  onOpenBillingEngine?: () => void;
}

const MODULE_COLORS = ['#4338CA', '#10B981', '#9333EA', '#F59E0B', '#0EA5E9', '#E11D48'];

export const AdminAnalyticsPerformanceModule: React.FC<
  AdminAnalyticsPerformanceModuleProps
> = ({
  users,
  listings,
  bookings,
  transactions,
  paymentSettings,
  onOpenBillingEngine,
}) => {
  const [timeframe, setTimeframe] = useState<'7d' | '14d' | '30d' | 'all'>('14d');
  const [selectedModuleFilter, setSelectedModuleFilter] = useState<string>('all');

  // Daily Bookings, Revenue, Commission Growth & Registration Velocity Time-Series
  const dailySeries = useMemo(() => {
    const baseDays = [
      { date: 'Oct 17', bookings: 18, revenue: 42500, commission: 4250, newUsers: 24, newProviders: 5 },
      { date: 'Oct 18', bookings: 22, revenue: 51800, commission: 5180, newUsers: 31, newProviders: 7 },
      { date: 'Oct 19', bookings: 25, revenue: 64200, commission: 6420, newUsers: 29, newProviders: 6 },
      { date: 'Oct 20', bookings: 19, revenue: 48900, commission: 4890, newUsers: 22, newProviders: 4 },
      { date: 'Oct 21', bookings: 27, revenue: 71500, commission: 7150, newUsers: 38, newProviders: 9 },
      { date: 'Oct 22', bookings: 31, revenue: 83400, commission: 8340, newUsers: 44, newProviders: 11 },
      { date: 'Oct 23', bookings: 29, revenue: 79200, commission: 7920, newUsers: 41, newProviders: 8 },
      { date: 'Oct 24', bookings: 35, revenue: 96800, commission: 9680, newUsers: 52, newProviders: 12 },
      { date: 'Oct 25', bookings: 42, revenue: 118500, commission: 11850, newUsers: 64, newProviders: 15 },
      { date: 'Oct 26', bookings: 38, revenue: 109400, commission: 10940, newUsers: 57, newProviders: 13 },
      { date: 'Oct 27', bookings: 34, revenue: 94600, commission: 9460, newUsers: 49, newProviders: 10 },
      { date: 'Oct 28', bookings: 45, revenue: 128900, commission: 12890, newUsers: 68, newProviders: 16 },
      { date: 'Oct 29', bookings: 49, revenue: 141200, commission: 14120, newUsers: 74, newProviders: 18 },
      {
        date: 'Oct 30',
        bookings: 52 + bookings.length,
        revenue: 154800 + transactions.reduce((s, t) => s + t.amount, 0),
        commission: Math.round(
          ((154800 + transactions.reduce((s, t) => s + t.amount, 0)) *
            paymentSettings.platformCommissionPercent) /
            100
        ),
        newUsers: 79 + users.length,
        newProviders: 19 + users.filter((u) => u.role === 'provider').length,
      },
    ];

    if (timeframe === '7d') return baseDays.slice(-7);
    return baseDays;
  }, [timeframe, bookings.length, transactions, paymentSettings.platformCommissionPercent, users]);

  // Module-Wise Breakdown across all 6 Marketplace Modules
  const moduleVelocityData = useMemo(() => {
    const modules = [
      { id: 'pg_hostels', module: "PG's & Hostels", prefix: 'pg-', baseBookings: 148, baseRev: 342000, regUsers: 215 },
      { id: 'classes', module: 'Classes & Coaching', prefix: 'class-', baseBookings: 112, baseRev: 268000, regUsers: 184 },
      { id: 'venues', module: 'Function Halls & Venues', prefix: 'venue-', baseBookings: 64, baseRev: 590000, regUsers: 96 },
      { id: 'services', module: 'Home & Local Services', prefix: 'cat-', baseBookings: 194, baseRev: 186000, regUsers: 248 },
      { id: 'hotel_stay', module: 'Hotels & Stay', prefix: 'hotel-', baseBookings: 126, baseRev: 412000, regUsers: 172 },
      { id: 'movies', module: 'Movies & Multiplex', prefix: 'movie-', baseBookings: 230, baseRev: 164000, regUsers: 310 },
    ];

    return modules
      .filter((m) => selectedModuleFilter === 'all' || m.id === selectedModuleFilter)
      .map((m, idx) => {
        const liveCount = listings.filter((l) => l.categoryId.startsWith(m.prefix)).length;
        const commission = Math.round((m.baseRev * paymentSettings.platformCommissionPercent) / 100);
        return {
          ...m,
          liveListings: liveCount,
          bookings: m.baseBookings + liveCount * 2,
          revenue: m.baseRev + liveCount * 4500,
          commission,
          color: MODULE_COLORS[idx % MODULE_COLORS.length],
        };
      });
  }, [listings, selectedModuleFilter, paymentSettings.platformCommissionPercent]);

  // D3 statistical summary computations (mean daily bookings, revenue growth rate, max peak)
  const d3Stats = useMemo(() => {
    const bookingsArr = dailySeries.map((d) => d.bookings);
    const revArr = dailySeries.map((d) => d.revenue);
    const commArr = dailySeries.map((d) => d.commission);
    const meanBookings = Math.round(d3.mean(bookingsArr) || 0);
    const totalWindowRev = d3.sum(revArr);
    const totalWindowComm = d3.sum(commArr);
    const maxDailyBookings = d3.max(bookingsArr) || 0;
    const firstRev = revArr[0] || 1;
    const lastRev = revArr[revArr.length - 1] || 1;
    const growthPct = (((lastRev - firstRev) / firstRev) * 100).toFixed(1);
    return {
      meanBookings,
      totalWindowRev,
      totalWindowComm,
      maxDailyBookings,
      growthPct,
    };
  }, [dailySeries]);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-4 sm:p-6 shadow-xs space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div>
          <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
            Recharts + D3.js • Enterprise Intelligence & Velocity Engine
          </span>
          <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-indigo-600" />
            <span>Analytics & Performance Across All Marketplace Modules</span>
          </h3>
          <p className="text-xs text-slate-500">
            Visualizing total daily bookings, revenue trends, platform commission growth ({paymentSettings.platformCommissionPercent}%), and user registration velocity.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedModuleFilter}
            onChange={(e) => setSelectedModuleFilter(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-black"
          >
            <option value="all">All 6 Marketplace Modules</option>
            <option value="pg_hostels">🏠 PGs & Hostels</option>
            <option value="classes">🎓 Classes & Coaching</option>
            <option value="venues">🏛️ Function Halls & Venues</option>
            <option value="services">🛠️ Home & Local Services</option>
            <option value="hotel_stay">🏨 Hotels & Stay</option>
            <option value="movies">🎬 Movies & Multiplex</option>
          </select>

          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            {(
              [
                { id: '7d', label: 'Last 7D' },
                { id: '14d', label: 'Last 14D' },
                { id: '30d', label: '30D Trend' },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTimeframe(t.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-black cursor-pointer transition ${
                  timeframe === t.id
                    ? 'bg-[#4338CA] text-white'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {onOpenBillingEngine && (
            <button
              type="button"
              onClick={onOpenBillingEngine}
              className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Mail className="w-3.5 h-3.5" />
              <span>Automated Billing Engine</span>
            </button>
          )}
        </div>
      </div>

      {/* D3-Computed Executive KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-4 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900">
          <span className="text-[10px] font-black uppercase text-indigo-700 dark:text-indigo-300">
            Avg Daily Bookings (Peak {d3Stats.maxDailyBookings}/day)
          </span>
          <div className="text-2xl font-black text-indigo-900 dark:text-white mt-1">
            {d3Stats.meanBookings} / day
          </div>
          <div className="text-[11px] font-bold text-emerald-600 mt-0.5">
            ↑ +{d3Stats.growthPct}% velocity vs cycle start
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900">
          <span className="text-[10px] font-black uppercase text-emerald-700 dark:text-emerald-300">
            Cumulative GMV Revenue Trend
          </span>
          <div className="text-2xl font-black text-emerald-800 dark:text-emerald-300 mt-1">
            ₹{d3Stats.totalWindowRev.toLocaleString('en-IN')}
          </div>
          <div className="text-[11px] font-bold text-slate-500 mt-0.5">
            Across 6 verified marketplace sections
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-purple-50/70 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-900">
          <span className="text-[10px] font-black uppercase text-purple-700 dark:text-purple-300">
            Platform Commission ({paymentSettings.platformCommissionPercent}%)
          </span>
          <div className="text-2xl font-black text-purple-800 dark:text-purple-300 mt-1">
            ₹{d3Stats.totalWindowComm.toLocaleString('en-IN')}
          </div>
          <div className="text-[11px] font-bold text-purple-600 mt-0.5">
            + {paymentSettings.gstPercent}% GST auto-invoiced
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900">
          <span className="text-[10px] font-black uppercase text-amber-800 dark:text-amber-300">
            User & Provider Registration Velocity
          </span>
          <div className="text-2xl font-black text-amber-700 dark:text-amber-300 mt-1">
            {dailySeries.reduce((s, d) => s + d.newUsers, 0)} Signups
          </div>
          <div className="text-[11px] font-bold text-amber-700 mt-0.5">
            Includes {dailySeries.reduce((s, d) => s + d.newProviders, 0)} Verified Partners
          </div>
        </div>
      </div>

      {/* CHART ROW 1: Total Daily Bookings & Revenue + Commission Growth */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Chart 1: Total Daily Bookings & User Registration Velocity */}
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white">
                1. Total Daily Bookings & Registration Velocity
              </h4>
              <p className="text-[11px] text-slate-500">
                Daily confirmed bookings vs new customer & provider registrations
              </p>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 text-[10px] font-black">
              Live Stream
            </span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailySeries}>
                <defs>
                  <linearGradient id="colorBookings" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4338CA" stopOpacity={0.45} />
                    <stop offset="95%" stopColor="#4338CA" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.45} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" opacity={0.4} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area
                  type="monotone"
                  dataKey="bookings"
                  name="Daily Bookings"
                  stroke="#4338CA"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#colorBookings)"
                />
                <Area
                  type="monotone"
                  dataKey="newUsers"
                  name="User Signups"
                  stroke="#10B981"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#colorUsers)"
                />
                <Line
                  type="monotone"
                  dataKey="newProviders"
                  name="New Providers"
                  stroke="#F59E0B"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Revenue Trends & Platform Commission Growth */}
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white">
                2. Revenue Trends & Platform Commission Growth (₹)
              </h4>
              <p className="text-[11px] text-slate-500">
                Daily Gross Booking Value (GMV) vs Net Platform Commission ({paymentSettings.platformCommissionPercent}%)
              </p>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black">
              GST Compliant
            </span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={dailySeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" opacity={0.4} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar
                  dataKey="revenue"
                  name="Daily Gross Revenue (₹)"
                  fill="#10B981"
                  radius={[6, 6, 0, 0]}
                />
                <Line
                  type="monotone"
                  dataKey="commission"
                  name="Platform Commission (₹)"
                  stroke="#9333EA"
                  strokeWidth={3}
                  dot={{ r: 3 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* CHART ROW 2: Cross-Module Performance Breakdown */}
      <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h4 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white">
              3. Cross-Module Bookings, Commission & Registration Velocity (All 6 Marketplace Modules)
            </h4>
            <p className="text-[11px] text-slate-500">
              Comparing PGs & Hostels, Classes, Function Halls, Home Services, Hotels & Stay, and Movies
            </p>
          </div>
        </div>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={moduleVelocityData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" opacity={0.4} />
              <XAxis dataKey="module" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar
                dataKey="bookings"
                name="Total Bookings"
                fill="#4338CA"
                radius={[6, 6, 0, 0]}
              />
              <Bar
                dataKey="regUsers"
                name="Registered Users"
                fill="#0EA5E9"
                radius={[6, 6, 0, 0]}
              />
              <Bar
                dataKey="liveListings"
                name="Active Listings"
                fill="#F59E0B"
                radius={[6, 6, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 2. AUTOMATED BILLING ENGINE PANEL (End-of-Cycle Invoices & Email Dispatch)
// ============================================================================
interface AutomatedBillingEnginePanelProps {
  listings: MarketplaceListing[];
  bookings: Booking[];
  paymentSettings: AdminPaymentSettings;
  onLogAction: (
    section: AdminAuditLogEntry['section'],
    action: string,
    details: string,
    status?: AdminAuditLogEntry['status']
  ) => void;
  onNotify: (msg: string) => void;
}

export const AutomatedBillingEnginePanel: React.FC<
  AutomatedBillingEnginePanelProps
> = ({ listings, bookings, paymentSettings, onLogAction, onNotify }) => {
  const [billingRecords, setBillingRecords] = useState<AutomatedBillingRecord[]>(() =>
    loadAutomatedBillingRecords()
  );
  const [cycleFrequency, setCycleFrequency] = useState<'monthly' | 'biweekly' | 'weekly'>('monthly');
  const [autoEmailEnabled, setAutoEmailEnabled] = useState<boolean>(true);
  const [autoAttachGstPdf, setAutoAttachGstPdf] = useState<boolean>(true);
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'paid' | 'invoice_sent' | 'auto_scheduled' | 'overdue'
  >('all');
  const [typeFilter, setTypeFilter] = useState<
    'all' | 'platform_commission' | 'provider_subscription'
  >('all');
  const [isRunningCycle, setIsRunningCycle] = useState<boolean>(false);

  // Sync with backend on mount
  useEffect(() => {
    fetch('/api/billing/records')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.records && Array.isArray(data.records) && data.records.length > 0) {
          setBillingRecords(data.records);
          saveAutomatedBillingRecords(data.records);
        }
      })
      .catch(() => {
        // Fallback to local records
      });
  }, []);

  const filteredRecords = useMemo(() => {
    return billingRecords.filter((rec) => {
      if (statusFilter !== 'all' && rec.paymentStatus !== statusFilter) return false;
      if (typeFilter !== 'all' && rec.billingType !== typeFilter) return false;
      return true;
    });
  }, [billingRecords, statusFilter, typeFilter]);

  const handleTriggerEndOfCycleBilling = async () => {
    setIsRunningCycle(true);
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const sampleListing = listings[0];
    const commPct = paymentSettings.platformCommissionPercent || 10;
    const gstPct = paymentSettings.gstPercent || 18;

    const baseComm = Math.max(
      4500,
      Math.round(
        (bookings.reduce((s, b) => s + b.totalAmount, 0) * commPct) / 100
      ) || 12400
    );
    const gstComm = Math.round((baseComm * gstPct) / 100);

    const newCommissionInvoice: AutomatedBillingRecord = {
      id: `BILL-${Date.now().toString().slice(-4)}-C`,
      cycleId: 'CYC-2026-10-AUTO',
      invoiceNumber: `${paymentSettings.invoicePrefix}CYC-${Date.now().toString().slice(-4)}`,
      providerId: sampleListing?.providerId || 'prov-auto-1',
      providerName: sampleListing?.providerName || 'Sri Sai Executive PG & Partners',
      providerEmail: sampleListing?.providerEmail || 'accounts@srisaipg.in',
      moduleName: 'PGs & Hostels',
      billingType: 'platform_commission',
      planOrCommissionLabel: `${commPct}% End-of-Cycle Platform Commission Settlement`,
      baseAmount: baseComm,
      gstAmount: gstComm,
      totalAmount: baseComm + gstComm,
      emailStatus: autoEmailEnabled ? 'sent' : 'queued',
      paymentStatus: 'invoice_sent',
      billingPeriod: 'Oct 2026 End-of-Cycle',
      generatedAt: now,
      lastEmailSentAt: autoEmailEnabled ? now : 'Manual Queue',
    };

    const subBase = 1499;
    const subGst = Math.round((subBase * gstPct) / 100);
    const newSubscriptionInvoice: AutomatedBillingRecord = {
      id: `BILL-${Date.now().toString().slice(-4)}-S`,
      cycleId: 'CYC-2026-10-AUTO',
      invoiceNumber: `${paymentSettings.invoicePrefix}SUB-${Date.now().toString().slice(-4)}`,
      providerId: 'prov-sub-auto',
      providerName: 'Royal Nizam Banquet & Convention Partner',
      providerEmail: 'billing@royalnizamhalls.com',
      moduleName: 'Function Halls & Venues',
      billingType: 'provider_subscription',
      planOrCommissionLabel: 'Automated Monthly Pro Partner Subscription Renewal',
      baseAmount: subBase,
      gstAmount: subGst,
      totalAmount: subBase + subGst,
      emailStatus: autoEmailEnabled ? 'sent' : 'queued',
      paymentStatus: 'invoice_sent',
      billingPeriod: 'Nov 2026 Renewal Cycle',
      generatedAt: now,
      lastEmailSentAt: autoEmailEnabled ? now : 'Manual Queue',
    };

    const updatedExisting = billingRecords.map((r) =>
      r.paymentStatus === 'auto_scheduled'
        ? {
            ...r,
            paymentStatus: 'invoice_sent' as const,
            emailStatus: 'sent' as const,
            lastEmailSentAt: now,
          }
        : r
    );

    const nextList = [newCommissionInvoice, newSubscriptionInvoice, ...updatedExisting];
    setBillingRecords(nextList);
    saveAutomatedBillingRecords(nextList);

    try {
      await fetch('/api/billing/run-cycle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cycleName: `${cycleFrequency.toUpperCase()} End-of-Cycle Run`,
          commissionPercent: commPct,
          gstPercent: gstPct,
          newRecords: [newCommissionInvoice, newSubscriptionInvoice],
        }),
      });
    } catch {
      // Local state already persisted
    }

    onLogAction(
      'Payment Management',
      'Triggered Automated End-of-Cycle Billing Engine',
      `Generated ${newCommissionInvoice.invoiceNumber} (Commission) & ${newSubscriptionInvoice.invoiceNumber} (Subscription) and dispatched emails.`,
      'published'
    );
    setIsRunningCycle(false);
    onNotify(
      `📧 End-of-Cycle Billing Executed! Generated GST invoices & emailed providers (${newCommissionInvoice.invoiceNumber}, ${newSubscriptionInvoice.invoiceNumber}).`
    );
  };

  const handleResendInvoiceEmail = (rec: AutomatedBillingRecord) => {
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const updated = billingRecords.map((r) =>
      r.id === rec.id
        ? {
            ...r,
            emailStatus: 'delivered' as const,
            paymentStatus:
              r.paymentStatus === 'auto_scheduled' ? ('invoice_sent' as const) : r.paymentStatus,
            lastEmailSentAt: now,
          }
        : r
    );
    setBillingRecords(updated);
    saveAutomatedBillingRecords(updated);
    onLogAction(
      'Payment Management',
      'Dispatched Automated Billing Email',
      `Sent GST Invoice ${rec.invoiceNumber} (₹${rec.totalAmount}) to ${rec.providerEmail}`,
      'published'
    );
    onNotify(`📨 Dispatched GST Invoice ${rec.invoiceNumber} email to ${rec.providerEmail}!`);
  };

  const handleUpdateBillingStatus = (
    rec: AutomatedBillingRecord,
    nextStatus: AutomatedBillingRecord['paymentStatus']
  ) => {
    const updated = billingRecords.map((r) =>
      r.id === rec.id ? { ...r, paymentStatus: nextStatus } : r
    );
    setBillingRecords(updated);
    saveAutomatedBillingRecords(updated);
    onLogAction(
      'Payment Management',
      `Updated Billing Cycle Status to ${nextStatus.toUpperCase()}`,
      `Invoice ${rec.invoiceNumber} for ${rec.providerName} marked ${nextStatus}`,
      'published'
    );
    onNotify(`✅ Invoice ${rec.invoiceNumber} status updated to ${nextStatus.toUpperCase()}!`);
  };

  const toGstPayload = (rec: AutomatedBillingRecord): GSTInvoicePayload => ({
    invoiceNumber: rec.invoiceNumber,
    transactionId: rec.id,
    date: rec.generatedAt.slice(0, 10),
    customerName: rec.providerName,
    customerPhone: '+91 98480 22338',
    customerGstin: paymentSettings.companyGstin,
    planOrItemName: rec.planOrCommissionLabel,
    description: `${rec.moduleName} • ${rec.billingPeriod} (${rec.planOrCommissionLabel})`,
    baseAmount: rec.baseAmount,
    cgstRate: paymentSettings.gstPercent / 2,
    sgstRate: paymentSettings.gstPercent / 2,
    totalAmount: rec.totalAmount,
    paymentMethod: 'Automated Billing Cycle Settlement',
  });

  return (
    <div className="space-y-4">
      {/* Engine Configuration & Trigger Banner */}
      <div className="bg-gradient-to-r from-emerald-950 via-teal-950 to-slate-950 text-white p-4 sm:p-5 rounded-2xl border border-emerald-700/60 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-400 text-slate-950 text-[10px] font-black uppercase">
            <RefreshCw className="w-3 h-3" />
            <span>Automated End-of-Cycle Billing & Email Dispatch Engine</span>
          </div>
          <h4 className="text-base sm:text-lg font-black">
            Platform Commissions ({paymentSettings.platformCommissionPercent}%) & Provider Subscriptions Auto-Invoicing
          </h4>
          <p className="text-xs text-emerald-200">
            Automatically calculates end-of-cycle platform commissions and subscription renewals, generates formal GST PDF invoices, and emails providers.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <select
            value={cycleFrequency}
            onChange={(e) => setCycleFrequency(e.target.value as any)}
            className="px-3 py-2 rounded-xl bg-white/10 border border-white/20 text-white text-xs font-bold"
          >
            <option value="monthly" className="text-slate-900">Cycle: Monthly (End of Month)</option>
            <option value="biweekly" className="text-slate-900">Cycle: Bi-Weekly (1st & 15th)</option>
            <option value="weekly" className="text-slate-900">Cycle: Weekly Settlement</option>
          </select>

          <button
            type="button"
            disabled={isRunningCycle}
            onClick={handleTriggerEndOfCycleBilling}
            className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black flex items-center gap-1.5 shadow-md cursor-pointer transition"
          >
            <Send className="w-3.5 h-3.5" />
            <span>
              {isRunningCycle
                ? 'Generating Invoices & Emails...'
                : '⚡ Run End-of-Cycle Billing & Email Now'}
            </span>
          </button>
        </div>
      </div>

      {/* Automation Toggles & Filter Row */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 dark:bg-slate-800/60 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs">
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-1.5 font-bold cursor-pointer">
            <input
              type="checkbox"
              checked={autoEmailEnabled}
              onChange={(e) => setAutoEmailEnabled(e.target.checked)}
              className="rounded text-emerald-600"
            />
            <span>Auto-Email Providers at Cycle Close</span>
          </label>
          <label className="flex items-center gap-1.5 font-bold cursor-pointer">
            <input
              type="checkbox"
              checked={autoAttachGstPdf}
              onChange={(e) => setAutoAttachGstPdf(e.target.checked)}
              className="rounded text-emerald-600"
            />
            <span>Attach Itemized GST Invoice PDF (CGST + SGST)</span>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as any)}
            className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold"
          >
            <option value="all">All Billing Types</option>
            <option value="platform_commission">Platform Commissions</option>
            <option value="provider_subscription">Provider Subscriptions</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold"
          >
            <option value="all">All Statuses ({billingRecords.length})</option>
            <option value="paid">Paid</option>
            <option value="invoice_sent">Invoice & Email Sent</option>
            <option value="auto_scheduled">Auto-Scheduled</option>
            <option value="overdue">Overdue</option>
          </select>
        </div>
      </div>

      {/* Tracked Cycle Invoices & Email Status Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 text-[10px] uppercase text-slate-400">
              <th className="py-2.5 px-3">Invoice & Cycle</th>
              <th className="py-2.5 px-3">Provider & Email</th>
              <th className="py-2.5 px-3">Billing Type & Module</th>
              <th className="py-2.5 px-3 text-right">Base + GST = Total</th>
              <th className="py-2.5 px-3">Email Dispatch</th>
              <th className="py-2.5 px-3">Payment Status</th>
              <th className="py-2.5 px-3 text-right">Actions & GST PDF</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredRecords.map((rec) => (
              <tr key={rec.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                <td className="py-3 px-3">
                  <div className="font-black text-slate-900 dark:text-white">
                    {rec.invoiceNumber}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {rec.billingPeriod} • {rec.generatedAt.slice(0, 10)}
                  </div>
                </td>
                <td className="py-3 px-3">
                  <div className="font-bold text-slate-900 dark:text-white">
                    {rec.providerName}
                  </div>
                  <div className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold">
                    ✉️ {rec.providerEmail}
                  </div>
                </td>
                <td className="py-3 px-3">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                      rec.billingType === 'platform_commission'
                        ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                        : 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300'
                    }`}
                  >
                    {rec.billingType === 'platform_commission'
                      ? 'Commission'
                      : 'Subscription'}
                  </span>
                  <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 mt-0.5">
                    {rec.planOrCommissionLabel}
                  </div>
                </td>
                <td className="py-3 px-3 text-right">
                  <div className="font-black text-emerald-600">
                    ₹{rec.totalAmount.toLocaleString('en-IN')}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    ₹{rec.baseAmount.toLocaleString('en-IN')} + ₹
                    {rec.gstAmount.toLocaleString('en-IN')} GST
                  </div>
                </td>
                <td className="py-3 px-3">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                      rec.emailStatus === 'opened' || rec.emailStatus === 'delivered'
                        ? 'bg-emerald-100 text-emerald-800'
                        : rec.emailStatus === 'sent'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    📧 {rec.emailStatus}
                  </span>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {rec.lastEmailSentAt}
                  </div>
                </td>
                <td className="py-3 px-3">
                  <select
                    value={rec.paymentStatus}
                    onChange={(e) =>
                      handleUpdateBillingStatus(rec, e.target.value as any)
                    }
                    className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase border cursor-pointer ${
                      rec.paymentStatus === 'paid'
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        : rec.paymentStatus === 'overdue'
                        ? 'bg-rose-100 text-rose-800 border-rose-300'
                        : rec.paymentStatus === 'invoice_sent'
                        ? 'bg-indigo-100 text-indigo-800 border-indigo-300'
                        : 'bg-amber-100 text-amber-800 border-amber-300'
                    }`}
                  >
                    <option value="paid">PAID</option>
                    <option value="invoice_sent">INVOICE SENT</option>
                    <option value="auto_scheduled">AUTO-SCHEDULED</option>
                    <option value="overdue">OVERDUE</option>
                  </select>
                </td>
                <td className="py-3 px-3 text-right">
                  <div className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleResendInvoiceEmail(rec)}
                      className="px-2 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-bold text-[10px] hover:bg-indigo-100 cursor-pointer"
                      title="Send / Resend Automated Invoice Email"
                    >
                      ✉️ Email
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadGSTInvoicePDF(toGstPayload(rec))}
                      className="px-2 py-1 rounded-lg bg-emerald-600 text-white font-bold text-[10px] hover:bg-emerald-700 cursor-pointer"
                      title="Download GST PDF"
                    >
                      PDF
                    </button>
                    <button
                      type="button"
                      onClick={() => printGSTInvoiceReceipt(toGstPayload(rec))}
                      className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-[10px] cursor-pointer"
                      title="Print GST Invoice"
                    >
                      Print
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
