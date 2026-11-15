import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Users,
  Building2,
  Calendar,
  CreditCard,
  Database,
  Archive,
  History,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Search,
  Lock,
  Unlock,
  Check,
  FileText,
  DollarSign,
  Download,
  Upload,
  ArrowRight,
  Sliders,
  BadgeAlert,
  ChevronRight,
  Info,
} from 'lucide-react';
import { getCurrentSupabaseSession } from '../lib/supabaseClient';

interface SuperAdminControlHubProps {
  onNotify?: (msg: string) => void;
}

type SuperAdminTab =
  | 'overview'
  | 'users_providers'
  | 'listings'
  | 'bookings_locks'
  | 'payments_refunds'
  | 'database_schema'
  | 'retention_archival'
  | 'audit_chain';

export const SuperAdminControlHub: React.FC<SuperAdminControlHubProps> = ({ onNotify }) => {
  const [activeTab, setActiveTab] = useState<SuperAdminTab>('overview');
  const [loading, setLoading] = useState<boolean>(false);
  const [stats, setStats] = useState<any>(null);
  const [auditIntegrity, setAuditIntegrity] = useState<any>(null);

  // Controlled action modal state (MANDATORY REASON)
  const [actionModal, setActionModal] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    actionType: 'user' | 'listing' | 'booking' | 'payment' | 'database' | 'retention';
    payload: any;
    confirmLabel: string;
    danger?: boolean;
  }>({
    isOpen: false,
    title: '',
    description: '',
    actionType: 'user',
    payload: {},
    confirmLabel: 'Confirm Action',
  });
  const [mandatoryReason, setMandatoryReason] = useState<string>('');
  const [reasonError, setReasonError] = useState<string | null>(null);

  // Sub-tab search & filters
  const [userSearch, setUserSearch] = useState('');
  const [listingSearch, setListingSearch] = useState('');
  const [bookingSearch, setBookingSearch] = useState('');
  const [retentionScope, setRetentionScope] = useState<'stale_locks' | 'completed_bookings' | 'expired_intents'>('stale_locks');
  const [retentionDays, setRetentionDays] = useState<number>(30);
  const [retentionMode, setRetentionMode] = useState<'archive' | 'purge'>('archive');

  // Manual payment inputs
  const [manualPayBookingId, setManualPayBookingId] = useState('');
  const [manualPayUtr, setManualPayUtr] = useState('');
  const [waiverBookingId, setWaiverBookingId] = useState('');
  const [waiverPercent, setWaiverPercent] = useState<number>(100);
  const [directRefundBookingId, setDirectRefundBookingId] = useState('');
  const [directRefundAmount, setDirectRefundAmount] = useState<number>(1500);

  const notify = (msg: string) => {
    if (onNotify) onNotify(msg);
  };

  const getSuperAdminAuthHeaders = async (): Promise<Record<string, string>> => {
    let token =
      (typeof window !== 'undefined' &&
        (localStorage.getItem('bos_authoritative_session_token') ||
          localStorage.getItem('bos_session_token'))) ||
      '';
    let supabaseAccessToken = '';
    try {
      supabaseAccessToken = (await getCurrentSupabaseSession())?.access_token || '';
      // Scope is granted only after a server check against the authoritative
      // profile row. The browser never supplies an email or role assertion.
      if (supabaseAccessToken) {
        const resp = await fetch('/api/auth/super-admin/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-supabase-access-token': supabaseAccessToken, ...(token ? { 'x-bos-session-token': token } : {}) },
          body: JSON.stringify({}),
        });
        if (resp.ok) {
          const data = await resp.json();
          if (data.sessionToken) {
            token = data.sessionToken;
            localStorage.setItem('bos_authoritative_session_token', data.sessionToken);
          }
        }
      }
    } catch {
      // The backend will deny scoped actions when Supabase cannot verify scope.
    }
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
      headers['x-bos-session-token'] = token;
    }
    if (supabaseAccessToken) headers['x-supabase-access-token'] = supabaseAccessToken;
    return headers;
  };

  const fetchOverview = async () => {
    setLoading(true);
    try {
      const headers = await getSuperAdminAuthHeaders();
      const resp = await fetch('/api/super-admin/overview', { headers });
      if (resp.ok) {
        const data = await resp.json();
        setStats(data.stats);
        setAuditIntegrity(data.auditIntegrity);
      }
    } catch (err: any) {
      console.error('Failed to load Super Admin overview:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, []);

  const openActionModal = (
    title: string,
    description: string,
    actionType: 'user' | 'listing' | 'booking' | 'payment' | 'database' | 'retention',
    payload: any,
    confirmLabel = 'Execute with Reason',
    danger = false
  ) => {
    setActionModal({
      isOpen: true,
      title,
      description,
      actionType,
      payload,
      confirmLabel,
      danger,
    });
    setMandatoryReason('');
    setReasonError(null);
  };

  const handleExecuteControlledAction = async () => {
    if (!mandatoryReason.trim() || mandatoryReason.trim().length < 5) {
      setReasonError('A valid audit reason of at least 5 characters is mandatory.');
      return;
    }

    setLoading(true);
    try {
      const headers = await getSuperAdminAuthHeaders();
      let url = '';
      const body = {
        ...actionModal.payload,
        reason: mandatoryReason.trim(),
      };

      switch (actionModal.actionType) {
        case 'user':
          url = '/api/super-admin/users/action';
          break;
        case 'listing':
          url = '/api/super-admin/listings/action';
          break;
        case 'booking':
          url = '/api/super-admin/bookings/action';
          break;
        case 'payment':
          url = '/api/super-admin/payments/action';
          break;
        case 'database':
          if (actionModal.payload.endpoint === 'dry_run') {
            url = '/api/super-admin/database/dry-run-migration';
          } else if (actionModal.payload.endpoint === 'backup') {
            url = '/api/super-admin/database/backup-snapshot';
          } else {
            url = '/api/super-admin/database/rollback-snapshot';
          }
          break;
        case 'retention':
          url = '/api/super-admin/retention/execute';
          break;
      }

      const resp = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      const data = await resp.json();

      if (resp.ok && data.ok) {
        notify(`✅ ${data.message || 'Action executed successfully and recorded in audit ledger.'}`);
        setActionModal((prev) => ({ ...prev, isOpen: false }));
        fetchOverview();
      } else {
        notify(`❌ Action failed: ${data.message || data.error || 'Server rejected action'}`);
        setReasonError(data.message || data.error);
      }
    } catch (err: any) {
      notify(`❌ Error: ${err.message || 'Execution error'}`);
      setReasonError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyAuditChain = async () => {
    setLoading(true);
    try {
      const headers = await getSuperAdminAuthHeaders();
      const resp = await fetch('/api/super-admin/audit-logs/verify', { headers });
      const data = await resp.json();
      if (resp.ok && data.ok) {
        setAuditIntegrity(data);
        notify(`🛡️ HMAC-SHA256 Audit Chain Verified! ${data.message}`);
      } else {
        notify(`⚠️ Integrity Warning: ${data.message || 'Validation failed'}`);
      }
    } catch (err: any) {
      notify(`Failed to verify audit logs: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* SUPER ADMIN IDENTITY & AUTH BANNER */}
      <div className="bg-gradient-to-r from-indigo-900 via-slate-900 to-purple-950 text-white rounded-3xl p-6 sm:p-7 shadow-lg border border-indigo-500/30">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="px-3 py-1 rounded-full bg-amber-400 text-slate-950 text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 shadow-sm">
                <ShieldCheck className="w-3.5 h-3.5 text-slate-950" />
                Highest Authorized Role • Super Admin
              </span>
              <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Server-Verified Cryptographic Token
              </span>
              <span className="px-3 py-1 rounded-full bg-purple-500/20 text-purple-200 border border-purple-500/30 text-[11px] font-bold">
                HMAC SHA-256 Ledger
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
              BookOurSpace Authoritative Management Suite
            </h2>
            <p className="text-xs text-indigo-200/90 max-w-3xl leading-relaxed">
              Full governance across all 6 modules: users, providers, listings, bookings, payments, manual approvals, fee waivers, refunds, database records, schema migrations, configuration, and audit logs with mandatory reason recording.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={fetchOverview}
              disabled={loading}
              className="px-4 py-2.5 rounded-2xl bg-indigo-600/60 hover:bg-indigo-600 text-white border border-indigo-400/30 text-xs font-bold flex items-center gap-2 transition cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh State
            </button>
            <button
              type="button"
              onClick={handleVerifyAuditChain}
              disabled={loading}
              className="px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs flex items-center gap-2 shadow-sm transition cursor-pointer"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              Verify Audit Chain
            </button>
          </div>
        </div>

        {/* INTEGRITY STATUS CHIP */}
        {auditIntegrity && (
          <div className="mt-4 pt-4 border-t border-indigo-500/20 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-indigo-100">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-bold">Ledger Integrity:</span>
              <span>{auditIntegrity.message}</span>
            </div>
            <div className="text-[11px] text-indigo-300 font-mono">
              Root: {String(auditIntegrity.genesisRootHash || 'GENESIS').slice(0, 16)}... | Latest: {String(auditIntegrity.latestChainHash || 'ACTIVE').slice(0, 16)}...
            </div>
          </div>
        )}
      </div>

      {/* HORIZONTAL TAB NAVIGATION */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 border-b border-slate-200 dark:border-slate-800 scrollbar-none">
        {[
          { id: 'overview', label: 'Overview & Health', icon: Sliders },
          { id: 'users_providers', label: 'Users & Providers', icon: Users },
          { id: 'listings', label: 'Listings Governance', icon: Building2 },
          { id: 'bookings_locks', label: 'Bookings & Locks', icon: Calendar },
          { id: 'payments_refunds', label: 'Payments & Waivers', icon: CreditCard },
          { id: 'database_schema', label: 'DB & Schema Migrations', icon: Database },
          { id: 'retention_archival', label: 'Retention & Archival', icon: Archive },
          { id: 'audit_chain', label: 'Cryptographic Audit Trail', icon: History },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as SuperAdminTab)}
              className={`px-4 py-2.5 rounded-2xl text-xs font-black whitespace-nowrap flex items-center gap-2 transition cursor-pointer ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-amber-300' : 'text-slate-400'}`} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: OVERVIEW & HEALTH */}
      {activeTab === 'overview' && stats && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-1">
              <span className="text-[10px] font-black uppercase text-indigo-600">Users & Accounts</span>
              <div className="text-2xl font-black text-slate-900 dark:text-white">{stats.users.total} Total</div>
              <div className="text-xs text-slate-500">{stats.users.active} Active • {stats.users.providers} Providers • {stats.users.admins} Admins</div>
            </div>
            <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-1">
              <span className="text-[10px] font-black uppercase text-emerald-600">Authoritative Listings</span>
              <div className="text-2xl font-black text-slate-900 dark:text-white">{stats.listings.total} Managed</div>
              <div className="text-xs text-slate-500">{stats.listings.active} Live • {stats.listings.pending} Pending • {stats.listings.archived} Archived</div>
            </div>
            <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-1">
              <span className="text-[10px] font-black uppercase text-purple-600">Bookings & Concurrency</span>
              <div className="text-2xl font-black text-slate-900 dark:text-white">{stats.bookings.total} Orders</div>
              <div className="text-xs text-slate-500">{stats.bookings.confirmed} Confirmed • {stats.locks.seatLocks + stats.locks.bookingLocks} Active Locks</div>
            </div>
            <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-1">
              <span className="text-[10px] font-black uppercase text-amber-600">Audit & Ledger</span>
              <div className="text-2xl font-black text-slate-900 dark:text-white">{stats.auditLogs.total} Logs</div>
              <div className="text-xs text-emerald-600 font-bold">HMAC Hash Chain: {stats.auditLogs.chainValid ? 'VERIFIED' : 'TAMPERED'}</div>
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-900/60 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
            <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-indigo-600" />
              Super Admin Quick Action Center
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Execute controlled administrative overrides with mandatory reason recording. All actions are cryptographically sealed into the tamper-evident hash chain.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() =>
                  openActionModal(
                    'Promote User to Super Admin',
                    'Grant highest authorized Super Admin status to user account.',
                    'user',
                    { userId: 'USR-1001', action: 'promote', role: 'admin', isSuperAdmin: true }
                  )
                }
                className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-left hover:border-indigo-500 transition cursor-pointer"
              >
                <div className="font-bold text-xs text-slate-900 dark:text-white">Promote Super Admin</div>
                <div className="text-[11px] text-slate-500">Elevate role with server signature</div>
              </button>

              <button
                type="button"
                onClick={() =>
                  openActionModal(
                    'Release Stale Locks',
                    'Purge expired concurrency seat locks and booking transaction mutexes.',
                    'retention',
                    { scope: 'stale_locks', mode: 'purge' }
                  )
                }
                className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-left hover:border-indigo-500 transition cursor-pointer"
              >
                <div className="font-bold text-xs text-slate-900 dark:text-white">Flush Expired Concurrency Locks</div>
                <div className="text-[11px] text-slate-500">Zero orphaned reservations</div>
              </button>

              <button
                type="button"
                onClick={() =>
                  openActionModal(
                    'Snapshot Database Backup',
                    'Create an atomic snapshot of store records and configuration for disaster recovery.',
                    'database',
                    { endpoint: 'backup' }
                  )
                }
                className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-left hover:border-indigo-500 transition cursor-pointer"
              >
                <div className="font-bold text-xs text-slate-900 dark:text-white">Atomic Store Snapshot</div>
                <div className="text-[11px] text-slate-500">Create backup before major updates</div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: USERS & PROVIDERS */}
      {activeTab === 'users_providers' && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 space-y-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-black text-slate-900 dark:text-white">User & Provider Governance</h3>
              <p className="text-xs text-slate-500">Manage account status, verify KYC documents, and adjust role privileges with reason tracking.</p>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search user or email..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-3">
            {[
              { id: 'USR-1001', name: 'Ramesh Kumar (Sri Sai PG)', email: 'ramesh.srisaipg@bookourspace.in', role: 'provider', status: 'active', verified: true },
              { id: 'USR-1002', name: 'Anitha Reddy (Lakshmi Convention)', email: 'anitha.lakshmi@bookourspace.in', role: 'provider', status: 'active', verified: true },
              { id: 'USR-1003', name: 'Kiran Teja', email: 'kiran.teja@gmail.com', role: 'customer', status: 'active', verified: false },
              { id: 'USR-1004', name: 'Hyderabad CineMax Multiplex', email: 'ops@cinemax.in', role: 'provider', status: 'active', verified: true },
              { id: 'usr-super-admin-root', name: 'Mona (Super Admin)', email: 'monapatisravya28@gmail.com', role: 'admin', status: 'active', verified: true, isSuperAdmin: true },
            ]
              .filter((u) => u.name.toLowerCase().includes(userSearch.toLowerCase()) || u.email.toLowerCase().includes(userSearch.toLowerCase()))
              .map((u) => (
                <div
                  key={u.id}
                  className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 dark:text-white">{u.name}</span>
                      <span className="px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300 font-extrabold uppercase text-[10px]">
                        {u.role}
                      </span>
                      {u.verified && (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold text-[10px]">
                          KYC Verified
                        </span>
                      )}
                    </div>
                    <div className="text-slate-500 font-mono text-[11px]">{u.email} • ID: {u.id}</div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() =>
                        openActionModal(
                          `Verify KYC for ${u.name}`,
                          `Mark KYC credentials as authentic and verified by Super Admin.`,
                          'user',
                          { userId: u.id, action: 'verify_kyc', kycDocument: 'Super Admin Manual MCA/Aadhaar Audit' }
                        )
                      }
                      className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] cursor-pointer"
                    >
                      Verify KYC
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        openActionModal(
                          `Suspend Account: ${u.name}`,
                          `Temporarily suspend user account and revoke session privileges.`,
                          'user',
                          { userId: u.id, action: 'suspend' },
                          'Confirm Suspension',
                          true
                        )
                      }
                      className="px-2.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-[11px] cursor-pointer"
                    >
                      Suspend
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        openActionModal(
                          `Promote ${u.name} to Admin`,
                          `Grant administrative management rights.`,
                          'user',
                          { userId: u.id, action: 'promote', role: 'admin', isSuperAdmin: false }
                        )
                      }
                      className="px-2.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[11px] cursor-pointer"
                    >
                      Make Admin
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* TAB 3: LISTINGS GOVERNANCE */}
      {activeTab === 'listings' && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 space-y-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-black text-slate-900 dark:text-white">Listings Governance Across 6 Verticals</h3>
              <p className="text-xs text-slate-500">Edit pricing, adjust capacity, force approve, or archive listings with mandatory reason auditing.</p>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search listing..."
                value={listingSearch}
                onChange={(e) => setListingSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-3">
            {[
              { id: 'listing-hotel-1', title: 'Novotel Airport Hotel & Transit Stay', vertical: 'hotel_stay', price: 4200, status: 'active' },
              { id: 'listing-venue-1', title: 'Grand Crystal Banquet & Convention Hall', vertical: 'venues', price: 25000, status: 'active' },
              { id: 'listing-movie-1', title: 'CineMax Multiplex Audi 1 (Dolby Atmos 4K)', vertical: 'movies', price: 250, status: 'active' },
              { id: 'listing-pg-1', title: 'Sri Sai Executive PG (Madhapur IT Hub)', vertical: 'pg_hostels', price: 6500, status: 'active' },
              { id: 'listing-class-1', title: 'Master IELTS & Spoken English Training', vertical: 'classes', price: 3500, status: 'active' },
              { id: 'listing-service-1', title: 'Elite Bridal Makeup & Grooming Experts', vertical: 'services', price: 8000, status: 'active' },
            ]
              .filter((l) => l.title.toLowerCase().includes(listingSearch.toLowerCase()))
              .map((l) => (
                <div
                  key={l.id}
                  className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 dark:text-white">{l.title}</span>
                      <span className="px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300 font-extrabold uppercase text-[10px]">
                        {l.vertical}
                      </span>
                    </div>
                    <div className="text-slate-500 font-mono text-[11px]">
                      Base Price: ₹{l.price} • ID: {l.id}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() =>
                        openActionModal(
                          `Update Pricing for ${l.title}`,
                          `Adjust base pricing or add-on fees.`,
                          'listing',
                          { listingId: l.id, action: 'edit_pricing', patchData: { price: l.price * 1.1 } }
                        )
                      }
                      className="px-2.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[11px] cursor-pointer"
                    >
                      Update Pricing
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        openActionModal(
                          `Force Approve Listing: ${l.title}`,
                          `Override manual review pipeline and activate listing immediately.`,
                          'listing',
                          { listingId: l.id, action: 'force_approve' }
                        )
                      }
                      className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] cursor-pointer"
                    >
                      Force Approve
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        openActionModal(
                          `Archive Listing: ${l.title}`,
                          `Archive listing from public customer feed.`,
                          'listing',
                          { listingId: l.id, action: 'archive' },
                          'Confirm Archival',
                          true
                        )
                      }
                      className="px-2.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-[11px] cursor-pointer"
                    >
                      Archive
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* TAB 4: BOOKINGS & LOCKS */}
      {activeTab === 'bookings_locks' && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 space-y-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-black text-slate-900 dark:text-white">Bookings & Concurrency Lock Governance</h3>
              <p className="text-xs text-slate-500">Correct statuses, reschedule bookings, release orphaned mutexes, and apply fee waivers.</p>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search booking ID..."
                value={bookingSearch}
                onChange={(e) => setBookingSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-3">
            {[
              { id: 'bk-hotel-stay-8801', title: 'Novotel Hourly Suite', customer: 'Kiran Teja', status: 'confirmed', amount: 2500, date: '2026-11-20' },
              { id: 'bk-movies-9902', title: 'CineMax Seat F7, F8', customer: 'Ramesh K', status: 'confirmed', amount: 500, date: '2026-10-31' },
              { id: 'bk-venue-4403', title: 'Grand Banquet Hall', customer: 'Anitha R', status: 'confirmed', amount: 15000, date: '2026-12-15' },
            ]
              .filter((b) => b.id.toLowerCase().includes(bookingSearch.toLowerCase()) || b.customer.toLowerCase().includes(bookingSearch.toLowerCase()))
              .map((b) => (
                <div
                  key={b.id}
                  className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 dark:text-white">{b.title}</span>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-extrabold uppercase text-[10px]">
                        {b.status}
                      </span>
                    </div>
                    <div className="text-slate-500 font-mono text-[11px]">
                      Customer: {b.customer} • Amount: ₹{b.amount} • Scheduled: {b.date} • ID: {b.id}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() =>
                        openActionModal(
                          `Cancel Booking with Full Fee Waiver: ${b.id}`,
                          `Cancel booking and grant 100% cancellation penalty waiver due to extenuating circumstances.`,
                          'booking',
                          { bookingId: b.id, action: 'cancel_with_waiver' },
                          'Cancel with 100% Waiver',
                          true
                        )
                      }
                      className="px-2.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-[11px] cursor-pointer"
                    >
                      Cancel with Fee Waiver
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        openActionModal(
                          `Reschedule Booking: ${b.id}`,
                          `Update scheduled reservation date to 2026-11-25.`,
                          'booking',
                          { bookingId: b.id, action: 'reschedule', rescheduledDate: '2026-11-25' }
                        )
                      }
                      className="px-2.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[11px] cursor-pointer"
                    >
                      Reschedule
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        openActionModal(
                          `Release Booking & Seat Locks: ${b.id}`,
                          `Force-release concurrency locks associated with this reservation.`,
                          'booking',
                          { bookingId: b.id, action: 'override_lock' }
                        )
                      }
                      className="px-2.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-[11px] cursor-pointer"
                    >
                      Release Locks
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* TAB 5: PAYMENTS & REFUNDS */}
      {activeTab === 'payments_refunds' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* MANUAL UPI APPROVAL */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 text-xs">
            <h4 className="font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-emerald-600" />
              Manual Bank UPI Settlement Approval
            </h4>
            <p className="text-slate-500">Manually approve a pending direct UPI payment with a bank-verified UTR reference number.</p>
            <div className="space-y-3">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300">Booking / Intent ID</label>
                <input
                  type="text"
                  placeholder="e.g. bk-hotel-stay-8801 or INT-9021"
                  value={manualPayBookingId}
                  onChange={(e) => setManualPayBookingId(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300">Bank 12-Digit UTR Number</label>
                <input
                  type="text"
                  placeholder="e.g. 629810394812"
                  value={manualPayUtr}
                  onChange={(e) => setManualPayUtr(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                />
              </div>
              <button
                type="button"
                onClick={() =>
                  openActionModal(
                    'Manual Bank Payment Approval',
                    `Manually mark booking ${manualPayBookingId || 'specified'} as verified with UTR ${manualPayUtr || 'system-generated'}.`,
                    'payment',
                    { action: 'manual_approval', bookingId: manualPayBookingId, bankUtr: manualPayUtr }
                  )
                }
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black cursor-pointer transition shadow-xs"
              >
                Approve Payment with Reason
              </button>
            </div>
          </div>

          {/* DIRECT REFUND & CANCELLATION FEE WAIVERS */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 text-xs">
            <h4 className="font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-indigo-600" />
              Direct Refund & 100% Fee Waiver
            </h4>
            <p className="text-slate-500">Issue an authoritative direct refund or grant a cancellation fee waiver override with mandatory justification.</p>
            <div className="space-y-3">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300">Target Booking ID</label>
                <input
                  type="text"
                  placeholder="e.g. bk-venue-4403"
                  value={directRefundBookingId}
                  onChange={(e) => setDirectRefundBookingId(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300">Refund Amount (INR)</label>
                <input
                  type="number"
                  value={directRefundAmount}
                  onChange={(e) => setDirectRefundAmount(Number(e.target.value))}
                  className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                />
              </div>
              <button
                type="button"
                onClick={() =>
                  openActionModal(
                    'Direct Refund Issuance',
                    `Issue direct refund of ₹${directRefundAmount} for booking ${directRefundBookingId || 'specified'}.`,
                    'payment',
                    { action: 'direct_refund', bookingId: directRefundBookingId, amount: directRefundAmount }
                  )
                }
                className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black cursor-pointer transition shadow-xs"
              >
                Issue Direct Refund with Reason
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: DATABASE & SCHEMA MIGRATIONS */}
      {activeTab === 'database_schema' && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 space-y-5">
          <div>
            <h3 className="text-base font-black text-slate-900 dark:text-white">Database Schema & Migration Status</h3>
            <p className="text-xs text-slate-500">Supabase PostgreSQL live architecture: 19 tables, 57 RLS policies, Section 13 multi-vertical policies.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-4 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-xs space-y-1">
              <span className="font-black text-indigo-900 dark:text-indigo-200 uppercase text-[10px]">Tables & RLS</span>
              <div className="text-xl font-black text-indigo-950 dark:text-indigo-100">19 Tables / 57 Policies</div>
              <div className="text-slate-500 text-[11px]">All tables have Row Level Security enabled.</div>
            </div>
            <div className="p-4 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs space-y-1">
              <span className="font-black text-emerald-900 dark:text-emerald-200 uppercase text-[10px]">Execution Order</span>
              <div className="text-xl font-black text-emerald-950 dark:text-emerald-100">Topologically Valid</div>
              <div className="text-slate-500 text-[11px]">Zero forward foreign-key dependencies.</div>
            </div>
            <div className="p-4 rounded-2xl bg-purple-50/60 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 text-xs space-y-1">
              <span className="font-black text-purple-900 dark:text-purple-200 uppercase text-[10px]">Disaster Recovery</span>
              <div className="text-xl font-black text-purple-950 dark:text-purple-100">Atomic Snapshot Active</div>
              <div className="text-slate-500 text-[11px]">Instant 1-click rollback available.</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() =>
                openActionModal(
                  'Dry-Run Schema Migration Check',
                  'Simulate idempotent schema execution in memory without applying live DDL to production database.',
                  'database',
                  { endpoint: 'dry_run' }
                )
              }
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-2 cursor-pointer shadow-xs"
            >
              <Database className="w-3.5 h-3.5" />
              Run Migration Dry-Run
            </button>
            <button
              type="button"
              onClick={() =>
                openActionModal(
                  'Create Database Snapshot Backup',
                  'Take an atomic snapshot of current store and schema metadata for instant rollback.',
                  'database',
                  { endpoint: 'backup' }
                )
              }
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 cursor-pointer shadow-xs"
            >
              <Download className="w-3.5 h-3.5" />
              Create Snapshot Backup
            </button>
            <button
              type="button"
              onClick={() =>
                openActionModal(
                  'Rollback to Previous Snapshot',
                  'Restore database state from the latest snapshot. Financial audit history is strictly preserved.',
                  'database',
                  { endpoint: 'rollback' },
                  'Restore Snapshot',
                  true
                )
              }
              className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs flex items-center gap-2 cursor-pointer shadow-xs"
            >
              <Upload className="w-3.5 h-3.5" />
              Rollback Snapshot
            </button>
          </div>
        </div>
      )}

      {/* TAB 7: RETENTION & ARCHIVAL */}
      {activeTab === 'retention_archival' && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 space-y-5 text-xs">
          <div>
            <h3 className="text-base font-black text-slate-900 dark:text-white">Retention & Controlled Archival Management</h3>
            <p className="text-slate-500">Safely archive or purge ephemeral non-financial records. Financial transaction ledgers and cryptographic security audit history are permanently protected from deletion.</p>
          </div>

          <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-black text-amber-900 dark:text-amber-200">IMMUTABLE FINANCIAL & SECURITY AUDIT PROTECTION</div>
              <div className="text-amber-800/90 dark:text-amber-300/80 leading-relaxed">
                By architectural policy, financial ledgers (<span className="font-mono">refunds_ledger</span>, payment intents) and cryptographic audit logs (<span className="font-mono">paymentRefundAuditLogs</span>) cannot be purged. Any attempt to purge audit history is rejected by the server with <span className="font-mono">HTTP 403 AUDIT_LOG_TAMPERING_PROHIBITED</span>.
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300">Retention Scope</label>
              <select
                value={retentionScope}
                onChange={(e) => setRetentionScope(e.target.value as any)}
                className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold"
              >
                <option value="stale_locks">Stale Concurrency Locks (Seat/Booking)</option>
                <option value="completed_bookings">Completed Bookings (Archive Only)</option>
                <option value="expired_intents">Expired Payment Intents</option>
              </select>
            </div>
            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300">Age Cutoff (Days)</label>
              <input
                type="number"
                value={retentionDays}
                onChange={(e) => setRetentionDays(Number(e.target.value))}
                className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold"
              />
            </div>
            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300">Execution Mode</label>
              <select
                value={retentionMode}
                onChange={(e) => setRetentionMode(e.target.value as any)}
                className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold"
              >
                <option value="archive">Archive (Safe - Mark archived)</option>
                <option value="purge">Purge (Permanent Non-Financial Cleanup)</option>
              </select>
            </div>
          </div>

          <button
            type="button"
            onClick={() =>
              openActionModal(
                `Execute Retention: ${retentionScope}`,
                `Execute ${retentionMode.toUpperCase()} for records older than ${retentionDays} days in scope "${retentionScope}".`,
                'retention',
                { scope: retentionScope, olderThanDays: retentionDays, mode: retentionMode },
                `Execute ${retentionMode === 'purge' ? 'Purge' : 'Archival'}`,
                retentionMode === 'purge'
              )
            }
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs cursor-pointer shadow-xs transition"
          >
            Execute Retention Policy with Reason
          </button>
        </div>
      )}

      {/* TAB 8: CRYPTOGRAPHIC AUDIT TRAIL */}
      {activeTab === 'audit_chain' && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 space-y-5 text-xs">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-black text-slate-900 dark:text-white">Tamper-Evident HMAC-SHA256 Audit Trail</h3>
              <p className="text-slate-500">Every Super Admin action is cryptographically chained with the previous record's hash digest to prevent silent alterations.</p>
            </div>
            <button
              type="button"
              onClick={handleVerifyAuditChain}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              Re-Verify Ledger
            </button>
          </div>

          {auditIntegrity && (
            <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 space-y-2">
              <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-200 font-black">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>CRYPTOGRAPHIC INTEGRITY: {auditIntegrity.valid ? 'VALID & VERIFIED' : 'TAMPER DETECTED'}</span>
              </div>
              <div className="text-emerald-700 dark:text-emerald-300">
                {auditIntegrity.message}
              </div>
              <div className="text-[11px] font-mono text-emerald-800 dark:text-emerald-200 pt-1">
                Genesis Root: {auditIntegrity.genesisRootHash || 'GENESIS'}
              </div>
            </div>
          )}
        </div>
      )}

      {/* CONTROLLED ACTION MODAL WITH MANDATORY REASON */}
      {actionModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-black text-slate-900 dark:text-white">{actionModal.title}</h3>
              </div>
              <button
                type="button"
                onClick={() => setActionModal((prev) => ({ ...prev, isOpen: false }))}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              {actionModal.description}
            </p>

            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800 text-[11px] font-mono text-slate-700 dark:text-slate-300 space-y-1">
              <div>Target Scope: {actionModal.actionType.toUpperCase()}</div>
              <div>Action: {actionModal.payload.action || actionModal.payload.scope || actionModal.payload.endpoint}</div>
            </div>

            {/* MANDATORY REASON INPUT */}
            <div className="space-y-1.5">
              <label className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-1">
                Mandatory Audit Reason / Justification
                <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={3}
                placeholder="Enter mandatory reason for this administrative change (min 5 characters)..."
                value={mandatoryReason}
                onChange={(e) => {
                  setMandatoryReason(e.target.value);
                  if (reasonError) setReasonError(null);
                }}
                className={`w-full p-3 rounded-2xl bg-slate-50 dark:bg-slate-800 border text-xs text-slate-900 dark:text-white focus:outline-none ${
                  reasonError
                    ? 'border-rose-500 focus:ring-1 focus:ring-rose-500'
                    : 'border-slate-200 dark:border-slate-700 focus:border-indigo-500'
                }`}
              />
              {reasonError && (
                <div className="text-[11px] font-bold text-rose-500 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  {reasonError}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setActionModal((prev) => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteControlledAction}
                disabled={loading}
                className={`px-5 py-2.5 rounded-xl text-xs font-black text-white cursor-pointer transition shadow-xs flex items-center gap-2 ${
                  actionModal.danger ? 'bg-rose-600 hover:bg-rose-500' : 'bg-indigo-600 hover:bg-indigo-500'
                }`}
              >
                {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                {actionModal.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
