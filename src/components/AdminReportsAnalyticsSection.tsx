import React, { useState, useMemo } from 'react';
import {
  BarChart3,
  Calendar,
  Download,
  FileText,
  Printer,
  ShieldCheck,
  Lock,
  Users,
  Building2,
  CreditCard,
  Megaphone,
  TrendingUp,
  CheckCircle2,
  Filter,
  RefreshCw,
} from 'lucide-react';
import {
  MarketplaceListing,
  Booking,
  PaymentTransaction,
  CategoryDef,
} from '../types/marketplace';
import {
  AdminManagedUser,
  AdminRolePermissions,
  AdminRefundRecord,
  AdminPayoutRecord,
  AdminPaymentSettings,
  AdminAdCampaign,
  AdminAuditLogEntry,
} from '../utils/adminEnterpriseStore';

interface AdminReportsAnalyticsSectionProps {
  users: AdminManagedUser[];
  listings: MarketplaceListing[];
  bookings: Booking[];
  transactions: PaymentTransaction[];
  refunds: AdminRefundRecord[];
  payouts: AdminPayoutRecord[];
  paymentSettings: AdminPaymentSettings;
  ads: AdminAdCampaign[];
  categories: CategoryDef[];
  rolePerms: AdminRolePermissions[];
  onToggleRoleViewReportsPermission: (role: 'customer' | 'provider' | 'admin') => void;
  onLogAction: (
    section: AdminAuditLogEntry['section'],
    action: string,
    details: string,
    status?: AdminAuditLogEntry['status']
  ) => void;
  onNotify: (msg: string) => void;
}

type ReportTabId =
  | 'executive_overview'
  | 'user_kyc_report'
  | 'listings_bookings_report'
  | 'financial_gst_report'
  | 'ad_performance_report';

export const AdminReportsAnalyticsSection: React.FC<
  AdminReportsAnalyticsSectionProps
> = ({
  users,
  listings,
  bookings,
  transactions,
  refunds,
  payouts,
  paymentSettings,
  ads,
  categories,
  rolePerms,
  onToggleRoleViewReportsPermission,
  onLogAction,
  onNotify,
}) => {
  // Active Report View Tab
  const [activeReportTab, setActiveReportTab] =
    useState<ReportTabId>('executive_overview');

  // Role-Protection Access Control & Role Inspector State
  const [activeViewerRole, setActiveViewerRole] = useState<
    'admin' | 'provider' | 'customer'
  >('admin');

  // Date Range Filter State (defaults to wide range covering 2025-2027 so all seeded + new records are visible by default)
  const [startDate, setStartDate] = useState<string>('2025-01-01');
  const [endDate, setEndDate] = useState<string>('2026-12-31');
  const [datePreset, setDatePreset] = useState<
    '7d' | '30d' | '90d' | '2026' | 'all'
  >('all');
  const [roleFilter, setRoleFilter] = useState<
    'all' | 'customer' | 'provider' | 'admin'
  >('all');
  const [isPrintPreviewOpen, setIsPrintPreviewOpen] = useState(false);

  // Check if activeViewerRole has permission to view & export reports
  const currentRolePermObj = rolePerms.find((r) => r.role === activeViewerRole);
  const isRoleAuthorizedForReports =
    activeViewerRole === 'admin'
      ? currentRolePermObj?.canViewReports !== false
      : !!currentRolePermObj?.canViewReports;

  const applyDatePreset = (preset: '7d' | '30d' | '90d' | '2026' | 'all') => {
    setDatePreset(preset);
    const today = new Date('2026-10-28T12:00:00');
    if (preset === 'all') {
      setStartDate('2025-01-01');
      setEndDate('2026-12-31');
      return;
    }
    if (preset === '2026') {
      setStartDate('2026-01-01');
      setEndDate('2026-12-31');
      return;
    }
    const days = preset === '7d' ? 7 : preset === '30d' ? 30 : 90;
    const past = new Date(today.getTime() - days * 86400000);
    setStartDate(past.toISOString().slice(0, 10));
    setEndDate('2026-12-31');
  };

  // Helper to check if a date string falls inside [startDate, endDate]
  const isWithinDateRange = (rawDate?: string): boolean => {
    if (!rawDate) return true;
    const match = rawDate.match(/\d{4}-\d{2}-\d{2}/);
    if (!match) return true; // Keep relative dates like "Today" or "Just now"
    const normalized = match[0];
    if (startDate && normalized < startDate) return false;
    if (endDate && normalized > endDate) return false;
    return true;
  };

  // Date-Filtered Datasets
  const filteredUsers = useMemo(
    () =>
      users.filter(
        (u) =>
          isWithinDateRange(u.joinedAt) &&
          (roleFilter === 'all' || u.role === roleFilter)
      ),
    [users, startDate, endDate, roleFilter]
  );

  const filteredListings = useMemo(
    () => listings.filter((l) => isWithinDateRange(l.createdAt)),
    [listings, startDate, endDate]
  );

  const filteredBookings = useMemo(
    () =>
      bookings.filter(
        (b) =>
          isWithinDateRange(b.scheduledDate) || isWithinDateRange(b.createdAt)
      ),
    [bookings, startDate, endDate]
  );

  const filteredTransactions = useMemo(
    () => transactions.filter((t) => isWithinDateRange(t.date)),
    [transactions, startDate, endDate]
  );

  const filteredRefunds = useMemo(
    () => refunds.filter((r) => isWithinDateRange(r.requestedAt)),
    [refunds, startDate, endDate]
  );

  const filteredPayouts = useMemo(
    () => payouts.filter((p) => isWithinDateRange(p.payoutDate)),
    [payouts, startDate, endDate]
  );

  const filteredAds = useMemo(
    () =>
      ads.filter(
        (a) => isWithinDateRange(a.startDate) || isWithinDateRange(a.endDate)
      ),
    [ads, startDate, endDate]
  );

  // Computed Financial & Operational Metrics for the Date Range
  const filteredPlatformRevenue = useMemo(
    () =>
      filteredTransactions
        .filter((t) => t.status === 'success')
        .reduce((sum, t) => sum + t.amount, 0),
    [filteredTransactions]
  );

  const filteredBookingsGMV = useMemo(
    () => filteredBookings.reduce((sum, b) => sum + b.totalAmount, 0),
    [filteredBookings]
  );

  const filteredCommissionEarned = useMemo(
    () =>
      Math.round(
        ((filteredPlatformRevenue + filteredBookingsGMV) *
          paymentSettings.platformCommissionPercent) /
          100
      ),
    [
      filteredPlatformRevenue,
      filteredBookingsGMV,
      paymentSettings.platformCommissionPercent,
    ]
  );

  const filteredGstCollected = useMemo(
    () =>
      Math.round(
        (filteredPlatformRevenue * paymentSettings.gstPercent) /
          (100 + paymentSettings.gstPercent)
      ),
    [filteredPlatformRevenue, paymentSettings.gstPercent]
  );

  const filteredAdSpend = useMemo(
    () => filteredAds.reduce((sum, a) => sum + a.amountSpent, 0),
    [filteredAds]
  );

  const filteredAdImpressions = useMemo(
    () => filteredAds.reduce((sum, a) => sum + a.impressions, 0),
    [filteredAds]
  );

  const filteredAdClicks = useMemo(
    () => filteredAds.reduce((sum, a) => sum + a.clicks, 0),
    [filteredAds]
  );

  // Section Breakdown for Visual Chart
  const sectionPerformanceBreakdown = useMemo(() => {
    const sections = [
      { id: 'pg_hostels', label: 'PGs & Hostels', prefix: 'pg-' },
      { id: 'classes', label: 'Classes & Coaching', prefix: 'class-' },
      { id: 'venues', label: 'Function Halls & Venues', prefix: 'venue-' },
      { id: 'services', label: 'Home & Local Services', prefix: 'cat-' },
      { id: 'hotel_stay', label: 'Hotels & Stay', prefix: 'hotel-' },
      { id: 'movies', label: 'Movies & Events', prefix: 'movie-' },
    ];
    return sections.map((sec) => {
      const matched = filteredListings.filter((l) =>
        l.categoryId.startsWith(sec.prefix)
      );
      const views = matched.reduce((s, l) => s + (l.viewsCount || 0), 0);
      const enquiriesCount = matched.reduce(
        (s, l) => s + (l.enquiriesCount || 0),
        0
      );
      return {
        ...sec,
        listingsCount: matched.length,
        views,
        enquiriesCount,
      };
    });
  }, [filteredListings]);

  // CSV Export Helper
  const handleExportCSV = () => {
    if (!isRoleAuthorizedForReports) {
      onNotify('🚫 Access Denied: Active role does not have Report Export permission.');
      return;
    }

    let csvRows: string[] = [];
    let fileLabel: string = activeReportTab;

    if (activeReportTab === 'user_kyc_report') {
      csvRows = [
        'User ID,Name,Role,Phone,Email,City,KYC Verified,KYC Document,Account Status,Joined Date,Total Value (INR)',
        ...filteredUsers.map(
          (u) =>
            `"${u.id}","${u.name}","${u.role}","${u.phone}","${u.email}","${u.city}","${
              u.verified ? 'YES' : 'NO'
            }","${u.kycDocument}","${u.accountStatus}","${u.joinedAt}",${u.totalSpentOrEarned}`
        ),
      ];
    } else if (activeReportTab === 'listings_bookings_report') {
      csvRows = [
        'Listing ID,Title,Subcategory,Provider,City,Area,Price (INR),Status,Verified,Views,Created Date',
        ...filteredListings.map(
          (l) =>
            `"${l.id}","${l.title.replace(/"/g, '""')}","${l.subcategory}","${
              l.providerName
            }","${l.location.city}","${l.location.area}",${l.price},"${l.status}","${
              l.isVerified ? 'YES' : 'NO'
            }",${l.viewsCount},"${l.createdAt}"`
        ),
      ];
    } else if (activeReportTab === 'financial_gst_report') {
      csvRows = [
        'Transaction ID,Invoice Number,Date,Type,Plan/Description,Payment Method,Status,Gross Amount (INR),GST Included (INR)',
        ...filteredTransactions.map((t) => {
          const gstAmt = Math.round(
            (t.amount * paymentSettings.gstPercent) /
              (100 + paymentSettings.gstPercent)
          );
          return `"${t.id}","${t.invoiceNumber}","${t.date}","${t.type}","${t.planName}","${t.paymentMethod}","${t.status}",${t.amount},${gstAmt}`;
        }),
      ];
    } else if (activeReportTab === 'ad_performance_report') {
      csvRows = [
        'Campaign ID,Campaign Name,Advertiser,Placement,Section,City,Status,Start Date,End Date,Impressions,Clicks,CTR (%),Amount Spent (INR),Total Budget (INR)',
        ...filteredAds.map((a) => {
          const ctr =
            a.impressions > 0
              ? ((a.clicks / a.impressions) * 100).toFixed(2)
              : '0.00';
          return `"${a.id}","${a.campaignName}","${a.advertiserName}","${a.placement}","${a.targetSection}","${a.targetCity}","${a.status}","${a.startDate}","${a.endDate}",${a.impressions},${a.clicks},${ctr},${a.amountSpent},${a.totalBudget}`;
        }),
      ];
    } else {
      fileLabel = 'executive_summary';
      csvRows = [
        'Metric,Date Range Start,Date Range End,Value',
        `"Filtered Users","${startDate}","${endDate}",${filteredUsers.length}`,
        `"Filtered Listings","${startDate}","${endDate}",${filteredListings.length}`,
        `"Confirmed Bookings","${startDate}","${endDate}",${filteredBookings.length}`,
        `"Platform Fee Revenue (INR)","${startDate}","${endDate}",${filteredPlatformRevenue}`,
        `"Bookings GMV (INR)","${startDate}","${endDate}",${filteredBookingsGMV}`,
        `"Estimated Commission (INR)","${startDate}","${endDate}",${filteredCommissionEarned}`,
        `"GST Tax Collected (INR)","${startDate}","${endDate}",${filteredGstCollected}`,
        `"Ad Campaign Spend (INR)","${startDate}","${endDate}",${filteredAdSpend}`,
        `"Ad Impressions","${startDate}","${endDate}",${filteredAdImpressions}`,
        `"Ad Clicks","${startDate}","${endDate}",${filteredAdClicks}`,
      ];
    }

    const blob = new Blob([csvRows.join('\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `BookOurSpace_${fileLabel}_${startDate}_to_${endDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    onLogAction(
      'Reports & Analytics',
      `Exported CSV Report (${fileLabel})`,
      `Exported date-filtered CSV (${startDate} to ${endDate}) as role "${activeViewerRole}"`,
      'published'
    );
    onNotify(`📊 Exported ${fileLabel.toUpperCase()} CSV (${startDate} → ${endDate})!`);
  };

  // JSON Export Helper
  const handleExportJSON = () => {
    if (!isRoleAuthorizedForReports) {
      onNotify('🚫 Access Denied: Active role does not have Report Export permission.');
      return;
    }

    const payload = {
      reportMetadata: {
        platform: 'BookOurSpace Enterprise Analytics',
        generatedAt: new Date().toISOString(),
        exportedByRole: activeViewerRole,
        dateFilter: { startDate, endDate, preset: datePreset },
      },
      summaryMetrics: {
        usersCount: filteredUsers.length,
        listingsCount: filteredListings.length,
        bookingsCount: filteredBookings.length,
        platformFeeRevenue: filteredPlatformRevenue,
        bookingsGMV: filteredBookingsGMV,
        commissionEarned: filteredCommissionEarned,
        gstCollected: filteredGstCollected,
        adSpend: filteredAdSpend,
        adImpressions: filteredAdImpressions,
        adClicks: filteredAdClicks,
      },
      users: filteredUsers,
      listings: filteredListings,
      bookings: filteredBookings,
      transactions: filteredTransactions,
      refunds: filteredRefunds,
      payouts: filteredPayouts,
      ads: filteredAds,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `BookOurSpace_Analytics_${startDate}_to_${endDate}.json`;
    a.click();
    URL.revokeObjectURL(url);

    onLogAction(
      'Reports & Analytics',
      'Exported Full JSON Analytics Bundle',
      `Downloaded JSON report (${startDate} to ${endDate}) with ${filteredUsers.length} users & ${filteredTransactions.length} transactions`,
      'published'
    );
    onNotify(`📦 Exported Full Date-Filtered JSON Bundle (${startDate} → ${endDate})!`);
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-4 sm:p-6 shadow-xs space-y-5">
      {/* Top Section Header & Role-Protected Access Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-black uppercase tracking-wider text-teal-700 dark:text-teal-500">
              Dedicated Section • Date-Filtered & Role-Protected BI
            </span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase flex items-center gap-1 ${
                isRoleAuthorizedForReports
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                  : 'bg-rose-100 text-rose-800'
              }`}
            >
              {isRoleAuthorizedForReports ? (
                <ShieldCheck className="w-3 h-3" />
              ) : (
                <Lock className="w-3 h-3" />
              )}
              <span>
                {isRoleAuthorizedForReports
                  ? `RBAC Verified: ${activeViewerRole.toUpperCase()} Access Granted`
                  : `RBAC Locked: ${activeViewerRole.toUpperCase()} Restricted`}
              </span>
            </span>
          </div>
          <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white flex items-center gap-2 mt-1">
            <BarChart3 className="w-5 h-5 text-teal-700" />
            <span>
              Reports & Analytics (Date-Filtered, Role-Protected Views & Exports)
            </span>
          </h3>
          <p className="text-xs text-slate-500">
            Filter platform metrics by date range and role permissions. Export clean CSV spreadsheets, JSON bundles, or printable executive summaries.
          </p>
        </div>

        {/* Export Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!isRoleAuthorizedForReports}
            onClick={handleExportCSV}
            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-xs font-black flex items-center gap-1.5 shadow-2xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>

          <button
            type="button"
            disabled={!isRoleAuthorizedForReports}
            onClick={handleExportJSON}
            className="px-3.5 py-2 rounded-xl bg-[#0B8F76] hover:bg-indigo-800 disabled:opacity-40 text-white text-xs font-black flex items-center gap-1.5 shadow-2xs cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Export JSON</span>
          </button>

          <button
            type="button"
            disabled={!isRoleAuthorizedForReports}
            onClick={() => {
              setIsPrintPreviewOpen(true);
              onLogAction(
                'Reports & Analytics',
                'Opened Printable Executive Report',
                `Generated executive report view (${startDate} to ${endDate})`,
                'published'
              );
            }}
            className="px-3.5 py-2 rounded-xl bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 disabled:opacity-40 text-white text-xs font-black flex items-center gap-1.5 shadow-2xs cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5 text-amber-300" />
            <span>Print / PDF Report</span>
          </button>
        </div>
      </div>

      {/* Role-Based Access Control (RBAC) Bar & Date-Range Filter Toolbar */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs">
        {/* Date Filter Controls (8 cols) */}
        <div className="lg:col-span-8 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 font-black text-slate-700 dark:text-slate-200 mr-1">
            <Calendar className="w-4 h-4 text-teal-700" />
            <span>Date Filter:</span>
          </div>

          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setDatePreset('all');
              }}
              className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold text-xs"
            />
            <span className="text-slate-400 font-bold">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setDatePreset('all');
              }}
              className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold text-xs"
            />
          </div>

          {/* Quick Date Range Presets */}
          <div className="flex items-center gap-1 flex-wrap">
            {(
              [
                ['7d', 'Last 7D'],
                ['30d', 'Last 30D'],
                ['90d', 'Last 90D'],
                ['2026', 'Year 2026'],
                ['all', 'All Time'],
              ] as const
            ).map(([presetId, label]) => (
              <button
                key={presetId}
                type="button"
                onClick={() => applyDatePreset(presetId)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-black cursor-pointer transition ${
                  datePreset === presetId
                    ? 'bg-[#0B8F76] text-white'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Role-Protection Inspector & Access Matrix Control (4 cols) */}
        <div className="lg:col-span-4 flex flex-wrap items-center justify-between lg:justify-end gap-2 border-t lg:border-t-0 lg:border-l border-slate-200 dark:border-slate-700 pt-2 lg:pt-0 lg:pl-3">
          <div className="flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-amber-600" />
            <span className="font-bold text-[11px] text-slate-600 dark:text-slate-300">
              View as Role:
            </span>
            <select
              value={activeViewerRole}
              onChange={(e) => setActiveViewerRole(e.target.value as any)}
              className="px-2 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-black text-[11px] cursor-pointer"
            >
              <option value="admin">Super Admin (Authorized)</option>
              <option value="provider">Provider / Owner</option>
              <option value="customer">Customer</option>
            </select>
          </div>

          <label className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={isRoleAuthorizedForReports}
              onChange={() => onToggleRoleViewReportsPermission(activeViewerRole)}
              className="w-3.5 h-3.5 accent-indigo-600 cursor-pointer"
            />
            <span>Allow {activeViewerRole}</span>
          </label>
        </div>
      </div>

      {/* Role-Protected Lock Screen if Current Role Lacks `canViewReports` Permission */}
      {!isRoleAuthorizedForReports ? (
        <div className="p-8 sm:p-12 rounded-3xl bg-rose-50/70 dark:bg-rose-950/30 border-2 border-dashed border-rose-300 dark:border-rose-800 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-rose-600 text-white flex items-center justify-center mx-auto shadow-md">
            <Lock className="w-6 h-6" />
          </div>
          <h4 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
            Role-Protected Report View: Access Restricted for "{activeViewerRole.toUpperCase()}"
          </h4>
          <p className="text-xs text-slate-600 dark:text-slate-300 max-w-md mx-auto">
            Financial, KYC, and Ad Analytics reports are protected by Role-Based Access Control (RBAC). Switch back to <strong>Super Admin</strong> or grant the <code>canViewReports</code> permission for this role to view or export data.
          </p>
          <div className="flex items-center justify-center gap-2 pt-2">
            <button
              type="button"
              onClick={() => setActiveViewerRole('admin')}
              className="px-4 py-2 rounded-xl bg-[#0B8F76] text-white text-xs font-black cursor-pointer"
            >
              Switch to Super Admin View
            </button>
            <button
              type="button"
              onClick={() => onToggleRoleViewReportsPermission(activeViewerRole)}
              className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black cursor-pointer"
            >
              Grant Report Access to "{activeViewerRole}"
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Sub-Navigation Tabs for the 5 Report Categories */}
          <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 dark:border-slate-800 pb-3">
            {[
              {
                id: 'executive_overview' as ReportTabId,
                label: '1. Executive Overview & Charts',
                icon: TrendingUp,
              },
              {
                id: 'user_kyc_report' as ReportTabId,
                label: `2. User & KYC Report (${filteredUsers.length})`,
                icon: Users,
              },
              {
                id: 'listings_bookings_report' as ReportTabId,
                label: `3. Listings & Bookings (${filteredListings.length} / ${filteredBookings.length})`,
                icon: Building2,
              },
              {
                id: 'financial_gst_report' as ReportTabId,
                label: `4. Financial, GST & Payouts (₹${filteredPlatformRevenue.toLocaleString('en-IN')})`,
                icon: CreditCard,
              },
              {
                id: 'ad_performance_report' as ReportTabId,
                label: `5. Ad Performance (${filteredAds.length})`,
                icon: Megaphone,
              },
            ].map((tab) => {
              const Icon = tab.icon;
              const isSelected = activeReportTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveReportTab(tab.id)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer transition ${
                    isSelected
                      ? 'bg-[#0B8F76] text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* =================================================================
              TAB 1: EXECUTIVE OVERVIEW & VISUAL CHARTS
             ================================================================= */}
          {activeReportTab === 'executive_overview' && (
            <div className="space-y-5">
              {/* Top 4 Date-Filtered KPI Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-4 rounded-2xl bg-teal-50/70 dark:bg-indigo-950/30 border border-teal-200 dark:border-teal-900">
                  <span className="text-[10px] font-black uppercase text-teal-700 dark:text-teal-300">
                    Filtered Users ({startDate} → {endDate})
                  </span>
                  <div className="text-2xl font-black text-slate-900 dark:text-white mt-1 tabular-nums">
                    {filteredUsers.length}
                  </div>
                  <div className="text-[11px] text-emerald-600 font-bold mt-0.5">
                    {filteredUsers.filter((u) => u.verified).length} KYC Verified
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900">
                  <span className="text-[10px] font-black uppercase text-emerald-700 dark:text-emerald-300">
                    Platform & GST Revenue
                  </span>
                  <div className="text-2xl font-black text-emerald-700 dark:text-emerald-300 mt-1 tabular-nums">
                    ₹{filteredPlatformRevenue.toLocaleString('en-IN')}
                  </div>
                  <div className="text-[11px] text-slate-500 font-bold mt-0.5">
                    Includes ₹{filteredGstCollected.toLocaleString('en-IN')} GST ({paymentSettings.gstPercent}%)
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-purple-50/70 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-900">
                  <span className="text-[10px] font-black uppercase text-purple-700 dark:text-purple-300">
                    Confirmed Bookings GMV
                  </span>
                  <div className="text-2xl font-black text-purple-700 dark:text-purple-300 mt-1 tabular-nums">
                    ₹{filteredBookingsGMV.toLocaleString('en-IN')}
                  </div>
                  <div className="text-[11px] text-slate-500 font-bold mt-0.5">
                    {filteredBookings.length} Bookings • ₹
                    {filteredCommissionEarned.toLocaleString('en-IN')} Commission
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900">
                  <span className="text-[10px] font-black uppercase text-amber-800 dark:text-amber-300">
                    Sponsored Ad Impressions
                  </span>
                  <div className="text-2xl font-black text-amber-600 mt-1 tabular-nums">
                    {filteredAdImpressions.toLocaleString()}
                  </div>
                  <div className="text-[11px] text-slate-500 font-bold mt-0.5">
                    {filteredAdClicks.toLocaleString()} Clicks • ₹
                    {filteredAdSpend.toLocaleString('en-IN')} Spend
                  </div>
                </div>
              </div>

              {/* Visual Bar Chart: Section-by-Section Marketplace Performance */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200">
                      Marketplace Section Views & Demand Breakdown
                    </h4>
                    <span className="text-[10px] font-bold text-teal-700">
                      {filteredListings.length} Active Listings
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    {sectionPerformanceBreakdown.map((sec) => {
                      const maxViews = Math.max(
                        1,
                        ...sectionPerformanceBreakdown.map((s) => s.views)
                      );
                      const pct = Math.min(
                        100,
                        Math.max(8, Math.round((sec.views / maxViews) * 100))
                      );
                      return (
                        <div key={sec.id} className="space-y-1 text-xs">
                          <div className="flex items-center justify-between font-bold">
                            <span>{sec.label}</span>
                            <span className="text-[11px] text-slate-500 tabular-nums">
                              {sec.listingsCount} posts • {sec.views.toLocaleString()}{' '}
                              views • {sec.enquiriesCount} leads
                            </span>
                          </div>
                          <div className="w-full h-2.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-[#0B8F76] to-amber-500 transition-all duration-300"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Financial & Tax Health Summary Card */}
                <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200">
                      Financial, Commission & GST Tax Summary
                    </h4>
                    <span className="text-[10px] font-black px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                      GSTIN: {paymentSettings.companyGstin}
                    </span>
                  </div>

                  <div className="divide-y divide-slate-200 dark:divide-slate-700">
                    <div className="py-2 flex items-center justify-between">
                      <span className="text-slate-600 dark:text-slate-300">
                        Gross Subscription & Plan Receipts
                      </span>
                      <span className="font-black tabular-nums">
                        ₹{filteredPlatformRevenue.toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div className="py-2 flex items-center justify-between">
                      <span className="text-slate-600 dark:text-slate-300">
                        CGST (9%) + SGST (9%) Collected ({paymentSettings.gstPercent}%)
                      </span>
                      <span className="font-black text-teal-700 tabular-nums">
                        ₹{filteredGstCollected.toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div className="py-2 flex items-center justify-between">
                      <span className="text-slate-600 dark:text-slate-300">
                        Platform Commission ({paymentSettings.platformCommissionPercent}%)
                      </span>
                      <span className="font-black text-emerald-600 tabular-nums">
                        ₹{filteredCommissionEarned.toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div className="py-2 flex items-center justify-between">
                      <span className="text-slate-600 dark:text-slate-300">
                        Provider Payouts Settled / Scheduled
                      </span>
                      <span className="font-black text-amber-600 tabular-nums">
                        ₹
                        {filteredPayouts
                          .reduce((s, p) => s + p.netPayout, 0)
                          .toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div className="py-2 flex items-center justify-between">
                      <span className="text-slate-600 dark:text-slate-300">
                        Customer Refunds Processed / Pending
                      </span>
                      <span className="font-black text-rose-600 tabular-nums">
                        ₹
                        {filteredRefunds
                          .reduce((s, r) => s + r.amount, 0)
                          .toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* =================================================================
              TAB 2: USER & KYC REPORT (DATE & ROLE FILTERED)
             ================================================================= */}
          {activeReportTab === 'user_kyc_report' && (
            <div className="space-y-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-black text-sm">
                  Date-Filtered User Registrations & KYC Audit ({filteredUsers.length})
                </div>
                <div className="flex items-center gap-2">
                  <Filter className="w-3.5 h-3.5 text-slate-400" />
                  <span className="font-bold text-slate-500">Filter by Role:</span>
                  <select
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value as any)}
                    className="px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold"
                  >
                    <option value="all">All Roles</option>
                    <option value="provider">Providers / Owners</option>
                    <option value="customer">Customers</option>
                    <option value="admin">Admins</option>
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-[10px] uppercase text-slate-400">
                      <th className="py-2.5 px-3">User ID & Name</th>
                      <th className="py-2.5 px-3">Role</th>
                      <th className="py-2.5 px-3">City</th>
                      <th className="py-2.5 px-3">Joined Date</th>
                      <th className="py-2.5 px-3">KYC Status</th>
                      <th className="py-2.5 px-3 text-right">Volume (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredUsers.map((u) => (
                      <tr key={u.id}>
                        <td className="py-2.5 px-3">
                          <div className="font-black text-slate-900 dark:text-white">
                            {u.name}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {u.id} • {u.phone}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 uppercase font-black text-[10px]">
                          {u.role}
                        </td>
                        <td className="py-2.5 px-3">{u.city}</td>
                        <td className="py-2.5 px-3 font-mono">{u.joinedAt}</td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                              u.verified
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {u.verified ? 'KYC Verified' : 'Pending KYC'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-black tabular-nums">
                          ₹{u.totalSpentOrEarned.toLocaleString('en-IN')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* =================================================================
              TAB 3: LISTINGS & BOOKINGS REPORT
             ================================================================= */}
          {activeReportTab === 'listings_bookings_report' && (
            <div className="space-y-4 text-xs">
              <div className="font-black text-sm">
                Marketplace Listings ({filteredListings.length}) & Confirmed Bookings ({filteredBookings.length})
              </div>
              <div className="overflow-x-auto max-h-80">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-[10px] uppercase text-slate-400">
                      <th className="py-2.5 px-3">Listing Title</th>
                      <th className="py-2.5 px-3">Subcategory</th>
                      <th className="py-2.5 px-3">Provider</th>
                      <th className="py-2.5 px-3">Area</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3 text-right">Views / Price</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredListings.slice(0, 40).map((l) => (
                      <tr key={l.id}>
                        <td className="py-2.5 px-3 font-black text-slate-900 dark:text-white max-w-xs truncate">
                          {l.title}
                        </td>
                        <td className="py-2.5 px-3">{l.subcategory}</td>
                        <td className="py-2.5 px-3">{l.providerName}</td>
                        <td className="py-2.5 px-3">{l.location.area}</td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                              l.status === 'active'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {l.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold tabular-nums">
                          {l.viewsCount} views • ₹{l.price.toLocaleString('en-IN')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* =================================================================
              TAB 4: FINANCIAL, GST & PAYOUTS REPORT
             ================================================================= */}
          {activeReportTab === 'financial_gst_report' && (
            <div className="space-y-4 text-xs">
              <div className="font-black text-sm">
                GST Tax Ledger & Payment Transactions ({filteredTransactions.length})
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-[10px] uppercase text-slate-400">
                      <th className="py-2.5 px-3">Invoice #</th>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Plan / Description</th>
                      <th className="py-2.5 px-3">Method</th>
                      <th className="py-2.5 px-3 text-right">Taxable Base</th>
                      <th className="py-2.5 px-3 text-right">
                        GST ({paymentSettings.gstPercent}%)
                      </th>
                      <th className="py-2.5 px-3 text-right">Total (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredTransactions.map((tx) => {
                      const gst = Math.round(
                        (tx.amount * paymentSettings.gstPercent) /
                          (100 + paymentSettings.gstPercent)
                      );
                      const base = tx.amount - gst;
                      return (
                        <tr key={tx.id}>
                          <td className="py-2.5 px-3 font-mono font-bold">
                            {tx.invoiceNumber}
                          </td>
                          <td className="py-2.5 px-3">{tx.date}</td>
                          <td className="py-2.5 px-3 font-bold">{tx.planName}</td>
                          <td className="py-2.5 px-3">{tx.paymentMethod}</td>
                          <td className="py-2.5 px-3 text-right tabular-nums">
                            ₹{base.toLocaleString('en-IN')}
                          </td>
                          <td className="py-2.5 px-3 text-right text-teal-700 font-bold tabular-nums">
                            ₹{gst.toLocaleString('en-IN')}
                          </td>
                          <td className="py-2.5 px-3 text-right font-black text-emerald-600 tabular-nums">
                            ₹{tx.amount.toLocaleString('en-IN')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* =================================================================
              TAB 5: AD PERFORMANCE REPORT
             ================================================================= */}
          {activeReportTab === 'ad_performance_report' && (
            <div className="space-y-4 text-xs">
              <div className="font-black text-sm">
                Sponsored Ad Campaigns Performance ({filteredAds.length})
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-[10px] uppercase text-slate-400">
                      <th className="py-2.5 px-3">Campaign & Advertiser</th>
                      <th className="py-2.5 px-3">Placement & Section</th>
                      <th className="py-2.5 px-3">Schedule</th>
                      <th className="py-2.5 px-3 text-right">Impressions</th>
                      <th className="py-2.5 px-3 text-right">Clicks (CTR)</th>
                      <th className="py-2.5 px-3 text-right">Spend / Budget</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredAds.map((ad) => {
                      const ctr =
                        ad.impressions > 0
                          ? ((ad.clicks / ad.impressions) * 100).toFixed(2)
                          : '0.00';
                      return (
                        <tr key={ad.id}>
                          <td className="py-2.5 px-3">
                            <div className="font-black text-slate-900 dark:text-white">
                              {ad.campaignName}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {ad.advertiserName}
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="font-bold">{ad.placement}</span> •{' '}
                            <span className="text-slate-500">
                              {ad.targetSection}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[11px]">
                            {ad.startDate} → {ad.endDate}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold tabular-nums">
                            {ad.impressions.toLocaleString()}
                          </td>
                          <td className="py-2.5 px-3 text-right font-black text-teal-700 tabular-nums">
                            {ad.clicks.toLocaleString()} ({ctr}%)
                          </td>
                          <td className="py-2.5 px-3 text-right font-black tabular-nums">
                            ₹{ad.amountSpent.toLocaleString('en-IN')} / ₹
                            {ad.totalBudget.toLocaleString('en-IN')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Printable Executive PDF Report Modal */}
      {isPrintPreviewOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white text-slate-900 rounded-3xl max-w-3xl w-full p-6 sm:p-8 shadow-2xl space-y-5 my-6 border-2 border-indigo-600">
            <div className="flex items-center justify-between border-b-2 border-slate-200 pb-4">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-teal-700">
                  OFFICIAL ENTERPRISE REPORT • ROLE-VERIFIED ({activeViewerRole.toUpperCase()})
                </span>
                <h3 className="text-xl font-black text-slate-950">
                  BookOurSpace — Executive Analytics & GST Statement
                </h3>
                <p className="text-xs text-slate-500">
                  Date Filter: {startDate} to {endDate} • GSTIN:{' '}
                  {paymentSettings.companyGstin}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-4 py-2 rounded-xl bg-[#0B8F76] text-white text-xs font-black flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print / Save as PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsPrintPreviewOpen(false)}
                  className="px-3 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer"
                >
                  Close ✕
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-[10px] font-bold uppercase text-slate-400">
                  Users (Filtered)
                </div>
                <div className="text-lg font-black">{filteredUsers.length}</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-[10px] font-bold uppercase text-slate-400">
                  Platform Revenue
                </div>
                <div className="text-lg font-black text-emerald-700">
                  ₹{filteredPlatformRevenue.toLocaleString('en-IN')}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-[10px] font-bold uppercase text-slate-400">
                  GST Collected ({paymentSettings.gstPercent}%)
                </div>
                <div className="text-lg font-black text-teal-700">
                  ₹{filteredGstCollected.toLocaleString('en-IN')}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-[10px] font-bold uppercase text-slate-400">
                  Ad Campaign Spend
                </div>
                <div className="text-lg font-black text-amber-700">
                  ₹{filteredAdSpend.toLocaleString('en-IN')}
                </div>
              </div>
            </div>

            <div className="text-xs space-y-2">
              <div className="font-black uppercase text-slate-500 text-[10px]">
                Recent Transactions in Selected Date Window
              </div>
              <table className="w-full text-left border border-slate-200 text-[11px]">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="p-2">Invoice</th>
                    <th className="p-2">Date</th>
                    <th className="p-2">Description</th>
                    <th className="p-2 text-right">Amount (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredTransactions.slice(0, 8).map((tx) => (
                    <tr key={tx.id}>
                      <td className="p-2 font-mono">{tx.invoiceNumber}</td>
                      <td className="p-2">{tx.date}</td>
                      <td className="p-2 font-bold">{tx.planName}</td>
                      <td className="p-2 text-right font-black">
                        ₹{tx.amount.toLocaleString('en-IN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
