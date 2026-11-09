import React, { lazy, Suspense, useState, useEffect, useMemo } from 'react';
import SafeImage from './SafeImage';
import {
  Layers,
  ShieldCheck,
  DollarSign,
  CheckCircle2,
  XCircle,
  Sparkles,
  Plus,
  Edit3,
  Trash2,
  AlertTriangle,
  Check,
  Search,
  TrendingUp,
  CreditCard,
  Tag,
  Clock,
  Eye,
  Users,
  Megaphone,
  Calendar,
  BarChart3,
  Sliders,
  Settings,
  FileText,
  Printer,
  Download,
  Lock,
  Unlock,
  UserCheck,
  UserX,
  RefreshCw,
  Building2,
  Home,
  History,
  Send,
  Upload,
  Palette,
  Plug,
  Database,
  Bell,
  MapPin,
} from 'lucide-react';
import { useMarketplace } from '../context/MarketplaceContext';
import { fetchPgAdminBookings } from '../lib/pgBookingClient';
import { LastUpdated } from './ui/LastUpdated';
import { PostingPlan, MarketplaceListing } from '../types/marketplace';
const SupremeAdminControlPanel = lazy(() => import('./SupremeAdminControlPanel').then((module) => ({ default: module.SupremeAdminControlPanel })));
const PgAdminWorkspace = lazy(() => import('./PgAdminWorkspace').then((module) => ({ default: module.PgAdminWorkspace })));
const AdminReportsAnalyticsSection = lazy(() => import('./AdminReportsAnalyticsSection').then((module) => ({ default: module.AdminReportsAnalyticsSection })));
const AdminThemeManagementSection = lazy(() => import('./AdminThemeManagementSection').then((module) => ({ default: module.AdminThemeManagementSection })));
const AdminIntegrationsSection = lazy(() => import('./AdminIntegrationsSection').then((module) => ({ default: module.AdminIntegrationsSection })));
const AdminDataManagementSection = lazy(() => import('./AdminDataManagementSection').then((module) => ({ default: module.AdminDataManagementSection })));
const AdminAnnouncementsSection = lazy(() => import('./AdminAnnouncementsSection').then((module) => ({ default: module.AdminAnnouncementsSection })));
const AdminPlatformModuleSettings = lazy(() => import('./AdminPlatformModuleSettings').then((module) => ({ default: module.AdminPlatformModuleSettings })));
const AdminMarketplaceListings = lazy(() => import('./AdminMarketplaceListings').then((module) => ({ default: module.AdminMarketplaceListings })));
const AdminStayInventory = lazy(() => import('./AdminStayInventory').then((module) => ({ default: module.AdminStayInventory })));
const AdminAnalyticsPerformanceModule = lazy(() => import('./AdminAnalyticsAndBilling').then((module) => ({ default: module.AdminAnalyticsPerformanceModule })));
const AutomatedBillingEnginePanel = lazy(() => import('./AdminAnalyticsAndBilling').then((module) => ({ default: module.AutomatedBillingEnginePanel })));
const AdminAdPerformanceChart = lazy(() => import('./AdminAdPerformanceChart').then((module) => ({ default: module.AdminAdPerformanceChart })));
import {
  AdminManagedUser,
  AdminRolePermissions,
  AdminRefundRecord,
  AdminPayoutRecord,
  AdminPaymentSettings,
  AdminAdCampaign,
  AdminContentSettings,
  AdminBookingDispute,
  AdminManagedEvent,
  AdminAppSettings,
  AdminThemeSettings,
  AdminAuditLogEntry,
  loadAdminUsers,
  saveAdminUsers,
  loadRolePermissions,
  saveRolePermissions,
  loadAdminRefunds,
  saveAdminRefunds,
  loadAdminPayouts,
  saveAdminPayouts,
  loadAdminPaymentSettings,
  saveAdminPaymentSettings,
  loadAdminAds,
  saveAdminAds,
  loadAdminContentSettings,
  saveAdminContentSettings,
  loadAdminDisputes,
  saveAdminDisputes,
  loadAdminEvents,
  saveAdminEvents,
  loadAdminAppSettings,
  saveAdminAppSettings,
  loadAdminThemeSettings,
  loadAdminAuditLogs,
  appendAdminAuditLog,
} from '../utils/adminEnterpriseStore';
import { isSubcategoryEnabled, setSubcategoryEnabled } from '../lib/subcategoryFlags';
import { isPopularCategoriesVisible, setPopularCategoriesVisible } from '../lib/homeVisibilitySettings';
import { loadSectionStyles, saveSectionStyles, type SectionStyles } from '../lib/sectionStyleSettings';
import {
  ModularTemplateConfig,
  loadModularTemplates,
  saveModularTemplates,
  ALL_SIX_MARKET_MODULES,
  SpotlightModuleSectionKey,
  loadSpotlightSubcategoriesModuleMap,
  saveSpotlightSubcategoriesModuleMap,
  toggleSpotlightSubcategoriesForSection,
  loadSearchDateRangeModuleMap,
  saveSearchDateRangeModuleMap,
  toggleSearchDateRangeForSection,
  HomeScreenLayoutStyle,
  loadHomeScreenLayoutStyle,
  saveHomeScreenLayoutStyle,
} from './ModularSystemEngine';
import {
  printGSTInvoiceReceipt,
  downloadGSTInvoicePDF,
  GSTInvoicePayload,
} from '../utils/gstInvoiceGenerator';
import {
  fetchServerAdminUsers,
  createServerAdminUser,
  updateServerAdminUserStatus,
  updateServerAdminUserRole,
  updateServerAdminUserVerify,
  sendServerNotification,
  updateRlsListing,
} from '../lib/supabaseClient';

interface AdminDashboardProps {
  onApprovedNavigateToApp?: (listing: MarketplaceListing) => void;
  onOpenLivePageEditor?: () => void;
  /** Controlled section so the console tab bar in App can drive the workspace. */
  section?: SuperAdminSectionId;
  onSectionChange?: (section: SuperAdminSectionId) => void;
}

export type SuperAdminSectionId =
  | 'user_management'
  | 'payment_management'
  | 'ad_management'
  | 'analytics_performance'
  | 'reports_analytics'
  | 'theme_management'
  | 'integrations'
  | 'data_management'
  | 'announcements_status'
  | 'dashboard'
  | 'content_management'
  | 'listings_venues'
  | 'pg_hostels'
  | 'bookings_events'
  | 'feature_management'
  | 'audit_logs'
  | 'notifications_mgmt'
  | 'app_settings';

// Financial state changes stay unavailable until a server-verified, audited
// payment/refund/settlement workflow is connected to this console.
const FINANCIAL_ADMIN_MUTATIONS_READY = false;

interface SensitiveActionModalState {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  onApprovedNavigateToApp,
  onOpenLivePageEditor,
  section,
  onSectionChange,
}) => {
  const {
    categories,
    addCategory,
    deleteCategory,
    addSubcategoryToCategory,
    deleteSubcategoryFromCategory,
    addCustomFieldToCategory,
    deleteCustomFieldFromCategory,
    postingPlans,
    updatePostingPlan,
    listings,
    updateListing,
    applyListingUpdateLocal,
    updateListingStatus,
    deleteListing,
    bookings,
    transactions,
    recordPayment,
    pushSystemNotification,
  } = useMarketplace();

  // Left Sidebar Active Section — starts with User Management, Payment Management, and Ad Management at the top
  const [internalSection, setInternalSection] =
    useState<SuperAdminSectionId>('dashboard');
  const activeSection = section ?? internalSection;
  const setActiveSection = (next: SuperAdminSectionId) => {
    setInternalSection(next);
    onSectionChange?.(next);
  };

  // The PG operations badge counts the real PostgreSQL reservations. It is
  // only a hint; the server authorises every operation underneath it.
  const [pgAdminBookingCount, setPgAdminBookingCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    void fetchPgAdminBookings(50)
      .then((result) => {
        if (!cancelled) setPgAdminBookingCount(result.bookings?.length || 0);
      })
      .catch(() => {
        if (!cancelled) setPgAdminBookingCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Toast feedback
  const [adminToast, setAdminToast] = useState<string | null>(null);
  const showAdminNotification = (msg: string) => {
    setAdminToast(msg);
    setTimeout(() => setAdminToast(null), 3800);
  };

  // Notifications Management State
  const [notifTitle, setNotifTitle] = useState<string>('');
  const [notifMessage, setNotifMessage] = useState<string>('');
  const [notifSegmentRole, setNotifSegmentRole] = useState<string>('all_users');
  const [notifActivitySegment, setNotifActivitySegment] = useState<string>('active_7d');
  const [notifScheduleTime, setNotifScheduleTime] = useState<string>('');
  const [notifChannel, setNotifChannel] = useState<'push_and_inapp' | 'in_app_only' | 'push_only'>('push_and_inapp');
  const [sentNotificationsHistory, setSentNotificationsHistory] = useState<
    {
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
    }[]
  >([
    {
      id: 'NOTIF-901',
      title: 'Weekend Banquet & Stay Flash Offer — 15% Off',
      message: 'Book verified Banquet Halls or Hourly Hotels this weekend and get instant GST invoice + 15% cashback.',
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
      message: 'Update your GSTIN and Student Success stats to unlock the Verified Royal Choice badge.',
      segmentRole: 'Providers',
      activitySegment: 'Pending KYC / Active Providers',
      channel: 'Push + In-App',
      scheduledFor: 'Today, 06:00 PM',
      sentAt: 'Today, 10:15 AM',
      status: 'Scheduled',
      reachCount: 318,
    },
  ]);

  // Sensitive Action Confirmation Modal
  const [confirmModal, setConfirmModal] = useState<SensitiveActionModalState>({
    isOpen: false,
    title: '',
    description: '',
    confirmLabel: 'Confirm Action',
    onConfirm: () => {},
  });

  const requestSensitiveConfirmation = (
    title: string,
    description: string,
    confirmLabel: string,
    onConfirm: () => void,
    danger = false
  ) => {
    setConfirmModal({
      isOpen: true,
      title,
      description,
      confirmLabel,
      danger,
      onConfirm,
    });
  };

  // Persistent Enterprise Stores
  const [users, setUsers] = useState<AdminManagedUser[]>(() => loadAdminUsers());
  const [rolePerms, setRolePerms] = useState<AdminRolePermissions[]>(() =>
    loadRolePermissions()
  );
  const [refunds, setRefunds] = useState<AdminRefundRecord[]>(() =>
    loadAdminRefunds()
  );
  const [payouts, setPayouts] = useState<AdminPayoutRecord[]>(() =>
    loadAdminPayouts()
  );
  const [paymentSettings, setPaymentSettings] = useState<AdminPaymentSettings>(
    () => loadAdminPaymentSettings()
  );
  const [ads, setAds] = useState<AdminAdCampaign[]>(() => loadAdminAds());
  const [contentSettings, setContentSettings] = useState<AdminContentSettings>(
    () => loadAdminContentSettings()
  );
  const [disputes, setDisputes] = useState<AdminBookingDispute[]>(() =>
    loadAdminDisputes()
  );
  const [events, setEvents] = useState<AdminManagedEvent[]>(() =>
    loadAdminEvents()
  );
  const [appSettings, setAppSettings] = useState<AdminAppSettings>(() =>
    loadAdminAppSettings()
  );
  const [themeSettings, setThemeSettings] = useState<AdminThemeSettings>(() =>
    loadAdminThemeSettings()
  );
  const [auditLogs, setAuditLogs] = useState<AdminAuditLogEntry[]>(() =>
    loadAdminAuditLogs()
  );
  const [modularTemplates, setModularTemplates] = useState<
    ModularTemplateConfig[]
  >(() => loadModularTemplates());
  const [spotlightModuleMap, setSpotlightModuleMap] = useState<
    Record<SpotlightModuleSectionKey, boolean>
  >(() => loadSpotlightSubcategoriesModuleMap());
  const [dateRangeModuleMap, setDateRangeModuleMap] = useState<
    Record<SpotlightModuleSectionKey, boolean>
  >(() => loadSearchDateRangeModuleMap());
  const [homeScreenStyle, setHomeScreenStyle] = useState<HomeScreenLayoutStyle>(() =>
    loadHomeScreenLayoutStyle()
  );

  // Preview Mode Toggle (Draft / Preview / Publish workflow)
  const [isPreviewDrawerOpen, setIsPreviewDrawerOpen] = useState(false);

  const logAction = (
    section: AdminAuditLogEntry['section'],
    action: string,
    details: string,
    status: AdminAuditLogEntry['status'] = 'published'
  ) => {
    const updated = appendAdminAuditLog(section, action, details, status);
    setAuditLogs(updated);
  };

  // Sync modular templates, theme settings & authoritative server users
  useEffect(() => {
    const syncAll = () => {
      setModularTemplates(loadModularTemplates());
      setSpotlightModuleMap(loadSpotlightSubcategoriesModuleMap());
      setDateRangeModuleMap(loadSearchDateRangeModuleMap());
      setAuditLogs(loadAdminAuditLogs());
      setThemeSettings(loadAdminThemeSettings());
    };
    void fetchServerAdminUsers().then((serverUsers) => {
      if (serverUsers && serverUsers.length > 0) {
        setUsers((prev) => {
          const mappedServer: AdminManagedUser[] = serverUsers.map((su) => {
            const existing = prev.find(
              (p) => p.id === su.id || p.email.toLowerCase() === su.email.toLowerCase()
            );
            return {
              id: su.id,
              name: su.name,
              email: su.email,
              phone: su.phone || existing?.phone || '+91 98480 00000',
              role: su.role,
              verified: Boolean(su.verified),
              kycDocument: existing?.kycDocument || 'Google OAuth 2.0 + KYC Verified',
              accountStatus:
                su.status === 'blocked' || su.status === 'suspended'
                  ? 'suspended'
                  : su.status === 'pending_verification'
                  ? 'pending_verification'
                  : 'active',
              city: su.city || existing?.city || 'Hyderabad',
              joinedAt: su.joinedAt || existing?.joinedAt || '2026-10-29',
              listingsCount: su.totalListings ?? existing?.listingsCount ?? 0,
              bookingsCount: su.totalBookings ?? existing?.bookingsCount ?? 0,
              totalSpentOrEarned: existing?.totalSpentOrEarned ?? 0,
              permissions:
                su.role === 'admin'
                  ? ['full_admin_access']
                  : su.role === 'provider'
                  ? ['create_listing', 'respond_enquiries']
                  : ['book_services'],
              publishState: 'published',
            };
          });
          const serverEmails = new Set(mappedServer.map((m) => m.email.toLowerCase()));
          const serverIds = new Set(mappedServer.map((m) => m.id));
          const merged = [
            ...mappedServer,
            ...prev.filter(
              (p) => !serverIds.has(p.id) && !serverEmails.has(p.email.toLowerCase())
            ),
          ];
          return merged;
        });
      }
    });
    window.addEventListener('bos-dynamic-schema-updated', syncAll);
    window.addEventListener('bos-admin-enterprise-updated', syncAll);
    window.addEventListener('bos-theme-settings-updated', syncAll);
    return () => {
      window.removeEventListener('bos-dynamic-schema-updated', syncAll);
      window.removeEventListener('bos-admin-enterprise-updated', syncAll);
      window.removeEventListener('bos-theme-settings-updated', syncAll);
    };
  }, []);

  // ============================================================================
  // 1. USER MANAGEMENT STATE & HANDLERS
  // ============================================================================
  const [userSubTab, setUserSubTab] = useState<
    'all_users' | 'verification' | 'suspensions' | 'roles_permissions'
  >('all_users');
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<
    'all' | 'customer' | 'provider' | 'admin'
  >('all');
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPhone, setNewUserPhone] = useState('');
  const [newUserRole, setNewUserRole] = useState<
    'customer' | 'provider' | 'admin'
  >('provider');
  const [newUserCity, setNewUserCity] = useState('Hyderabad');
  const [newUserGstin, setNewUserGstin] = useState('');
  const [newUserKyc, setNewUserKyc] = useState('Aadhaar + Trade KYC Verified');

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (userRoleFilter !== 'all' && u.role !== userRoleFilter) return false;
      if (userSubTab === 'verification' && u.verified) return false;
      if (userSubTab === 'suspensions' && u.accountStatus !== 'suspended')
        return false;
      if (!userSearch.trim()) return true;
      const q = userSearch.toLowerCase();
      return (
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.phone.toLowerCase().includes(q) ||
        u.city.toLowerCase().includes(q)
      );
    });
  }, [users, userRoleFilter, userSubTab, userSearch]);

  const handleCreateUser = (
    e: React.FormEvent,
    publishState: 'draft' | 'published' = 'published'
  ) => {
    e.preventDefault();
    if (!newUserName.trim() || !newUserPhone.trim()) return;
    const created: AdminManagedUser = {
      id: `USR-${Date.now().toString().slice(-4)}`,
      name: newUserName.trim(),
      email:
        newUserEmail.trim() ||
        `${newUserName.trim().toLowerCase().replace(/\s+/g, '.')}@bookourspace.in`,
      phone: newUserPhone.trim(),
      role: newUserRole,
      verified: newUserRole !== 'provider',
      kycDocument: newUserKyc.trim() || 'KYC Submitted',
      accountStatus: 'active',
      city: newUserCity.trim() || 'Hyderabad',
      joinedAt: new Date().toISOString().slice(0, 10),
      listingsCount: 0,
      bookingsCount: 0,
      totalSpentOrEarned: 0,
      gstin: newUserGstin.trim() || undefined,
      permissions:
        newUserRole === 'admin'
          ? ['full_admin_access']
          : newUserRole === 'provider'
          ? ['create_listing', 'respond_enquiries']
          : ['book_services'],
      publishState,
    };
    const next = [created, ...users];
    setUsers(next);
    saveAdminUsers(next);
    void createServerAdminUser({
      name: created.name,
      email: created.email,
      phone: created.phone,
      role: created.role,
      city: created.city,
    });
    logAction(
      'User Management',
      publishState === 'published' ? 'Created & Published User' : 'Saved User Draft',
      `Added ${created.role.toUpperCase()} "${created.name}" (${created.phone})`,
      publishState === 'published' ? 'published' : 'draft_saved'
    );
    setNewUserName('');
    setNewUserEmail('');
    setNewUserPhone('');
    setNewUserGstin('');
    setIsAddingUser(false);
    showAdminNotification(
      `✅ User "${created.name}" (${created.role}) saved to database!`
    );
  };

  const handleToggleUserVerification = (targetUser: AdminManagedUser) => {
    const nextVerified = !targetUser.verified;
    const updated = users.map((u) =>
      u.id === targetUser.id
        ? {
            ...u,
            verified: nextVerified,
            accountStatus: nextVerified ? ('active' as const) : u.accountStatus,
            publishState: 'published' as const,
          }
        : u
    );
    setUsers(updated);
    saveAdminUsers(updated);
    void updateServerAdminUserVerify(
      targetUser.id,
      nextVerified,
      `${nextVerified ? 'Verify' : 'Revoke verification for'} ${targetUser.email}: administrator confirmed KYC review.`,
    );

    // Sync verification status to matching listings in MarketplaceContext
    listings.forEach((l) => {
      if (
        l.providerPhone === targetUser.phone ||
        l.providerName.toLowerCase().includes(targetUser.name.split(' ')[0].toLowerCase())
      ) {
        updateListing(l.id, { isVerified: nextVerified });
      }
    });

    logAction(
      'User Management',
      nextVerified ? 'Verified User KYC' : 'Revoked User Verification',
      `${nextVerified ? 'Verified' : 'Unverified'} ${targetUser.name} (${targetUser.id})`,
      'sensitive_confirmed'
    );
    showAdminNotification(
      `🛡️ ${targetUser.name} is now ${nextVerified ? 'KYC VERIFIED' : 'Unverified'} across the app!`
    );
  };

  const handleToggleSuspendUser = (targetUser: AdminManagedUser) => {
    const willSuspend = targetUser.accountStatus !== 'suspended';
    requestSensitiveConfirmation(
      willSuspend
        ? `Suspend / Block User "${targetUser.name}"?`
        : `Reactivate User "${targetUser.name}"?`,
      willSuspend
        ? `Suspending ${targetUser.name} (${targetUser.role}) will immediately block their Google OAuth session, restrict API/booking access, and hide any associated provider listings from the marketplace.`
        : `Reactivating ${targetUser.name} will restore their account permissions and active listings.`,
      willSuspend ? 'Yes, Suspend / Block Account' : 'Yes, Reactivate Account',
      () => {
        const updated = users.map((u) =>
          u.id === targetUser.id
            ? {
                ...u,
                accountStatus: willSuspend
                  ? ('suspended' as const)
                  : ('active' as const),
              }
            : u
        );
        setUsers(updated);
        saveAdminUsers(updated);
        void updateServerAdminUserStatus(
          targetUser.id,
          willSuspend ? 'suspended' : 'active',
          `${willSuspend ? 'Suspend' : 'Reactivate'} ${targetUser.email}: administrator confirmed the account review.`,
        );

        // Also update provider's listings status in MarketplaceContext
        listings.forEach((l) => {
          if (l.providerPhone === targetUser.phone) {
            updateListingStatus(l.id, willSuspend ? 'rejected' : 'active');
          }
        });

        logAction(
          'User Management',
          willSuspend ? 'Suspended User Account' : 'Reactivated User Account',
          `${willSuspend ? 'Suspended' : 'Restored'} ${targetUser.name} (${targetUser.phone})`,
          'sensitive_confirmed'
        );
        showAdminNotification(
          willSuspend
            ? `🚫 Account "${targetUser.name}" suspended and blocked on server.`
            : `✅ Account "${targetUser.name}" reactivated.`
        );
      },
      willSuspend
    );
  };

  const handleChangeUserRole = (
    targetUser: AdminManagedUser,
    nextRole: 'customer' | 'provider' | 'admin'
  ) => {
    if (targetUser.role === nextRole) return;
    requestSensitiveConfirmation(
      `Change Role for "${targetUser.name}"?`,
      `Are you sure you want to change ${targetUser.name}'s role from ${targetUser.role.toUpperCase()} to ${nextRole.toUpperCase()}? This updates their access permissions immediately.`,
      `Confirm Role: ${nextRole.toUpperCase()}`,
      () => {
        const updated = users.map((u) =>
          u.id === targetUser.id ? { ...u, role: nextRole } : u
        );
        setUsers(updated);
        saveAdminUsers(updated);
        void updateServerAdminUserRole(
          targetUser.id,
          nextRole,
          `Change ${targetUser.email} role from ${targetUser.role} to ${nextRole}: administrator confirmed the access review.`,
        );
        logAction(
          'User Management',
          'Changed User Role',
          `Changed ${targetUser.name} role from ${targetUser.role} to ${nextRole}`,
          'sensitive_confirmed'
        );
        showAdminNotification(
          `✅ Updated ${targetUser.name} role to ${nextRole.toUpperCase()}.`
        );
      }
    );
  };

  const handleToggleRolePermission = (
    role: 'customer' | 'provider' | 'admin',
    permKey: keyof Omit<AdminRolePermissions, 'role' | 'label'>
  ) => {
    const updated = rolePerms.map((rp) =>
      rp.role === role ? { ...rp, [permKey]: !rp[permKey] } : rp
    );
    setRolePerms(updated);
    saveRolePermissions(updated);
    logAction(
      'User Management',
      'Updated Role Permissions Matrix',
      `Toggled ${String(permKey)} for role "${role.toUpperCase()}"`,
      'published'
    );
    showAdminNotification(`✅ Saved permission matrix for ${role.toUpperCase()}`);
  };

  // ============================================================================
  // 2. PAYMENT MANAGEMENT STATE & HANDLERS
  // ============================================================================
  const [paymentSubTab, setPaymentSubTab] = useState<
    | 'transactions'
    | 'automated_billing'
    | 'refunds'
    | 'payouts'
    | 'commissions_plans'
    | 'payment_settings'
  >('transactions');
  const [newTxDesc, setNewTxDesc] = useState(
    'BOS Verified Partner Subscription'
  );
  const [newTxAmount, setNewTxAmount] = useState('499');
  const [newTxMethod, setNewTxMethod] = useState('UPI (GPay / PhonePe)');
  const [newTxType, setNewTxType] =
    useState<'plan_subscription' | 'pay_per_post' | 'featured_boost'>('plan_subscription');
  const [editingPlan, setEditingPlan] = useState<PostingPlan | null>(null);

  const handleRecordNewTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!FINANCIAL_ADMIN_MUTATIONS_READY) {
      showAdminNotification('Manual transaction recording is disabled until a verified server-side payment workflow is available.');
      return;
    }
    const amt = Number(newTxAmount) || 499;
    const createdTx = recordPayment(newTxType, amt, newTxDesc.trim(), newTxMethod);
    logAction(
      'Payment Management',
      'Recorded Manual Transaction & GST Invoice',
      `Generated Invoice ${createdTx.invoiceNumber} for ₹${amt} (${newTxDesc})`,
      'published'
    );
    showAdminNotification(
      `💳 Recorded ₹${amt} transaction (${createdTx.invoiceNumber}) to database!`
    );
  };

  const handleRefundAction = (
    refund: AdminRefundRecord,
    nextStatus: 'approved' | 'processed' | 'rejected'
  ) => {
    if (!FINANCIAL_ADMIN_MUTATIONS_READY) {
      showAdminNotification('Refund status changes are disabled until an audited refund workflow is available.');
      return;
    }
    requestSensitiveConfirmation(
      `${nextStatus.toUpperCase()} Refund ${refund.id}?`,
      `Confirm marking refund of ₹${refund.amount} for ${refund.customerOrProviderName} (Invoice ${refund.invoiceNumber}) as ${nextStatus.toUpperCase()}.`,
      `Confirm ${nextStatus.toUpperCase()}`,
      () => {
        const updated = refunds.map((r) =>
          r.id === refund.id ? { ...r, status: nextStatus } : r
        );
        setRefunds(updated);
        saveAdminRefunds(updated);
        logAction(
          'Payment Management',
          `Refund ${nextStatus.toUpperCase()}`,
          `Refund ${refund.id} (₹${refund.amount} for ${refund.customerOrProviderName}) marked ${nextStatus}`,
          'sensitive_confirmed'
        );
        showAdminNotification(
          `✅ Refund ${refund.id} updated to ${nextStatus.toUpperCase()}.`
        );
      },
      nextStatus === 'rejected'
    );
  };

  const handlePayoutAction = (
    payout: AdminPayoutRecord,
    nextStatus: 'paid' | 'on_hold' | 'scheduled'
  ) => {
    if (!FINANCIAL_ADMIN_MUTATIONS_READY) {
      showAdminNotification('Payout status changes are disabled until a verified settlement workflow is available.');
      return;
    }
    requestSensitiveConfirmation(
      `Update Provider Payout ${payout.id}?`,
      `Set net payout of ₹${payout.netPayout.toLocaleString('en-IN')} for ${payout.providerName} to ${nextStatus.toUpperCase()}?`,
      `Set as ${nextStatus.toUpperCase()}`,
      () => {
        const updated = payouts.map((p) =>
          p.id === payout.id ? { ...p, status: nextStatus } : p
        );
        setPayouts(updated);
        saveAdminPayouts(updated);
        logAction(
          'Payment Management',
          `Payout ${nextStatus.toUpperCase()}`,
          `Provider payout ${payout.id} (₹${payout.netPayout}) for ${payout.providerName} set to ${nextStatus}`,
          'sensitive_confirmed'
        );
        showAdminNotification(
          `✅ Payout ${payout.id} marked as ${nextStatus.toUpperCase()}.`
        );
      }
    );
  };

  const handleSavePaymentSettings = (publishState: 'draft' | 'published') => {
    if (!FINANCIAL_ADMIN_MUTATIONS_READY) {
      showAdminNotification('Payment and fee settings are read-only until a reviewed backend workflow exists.');
      return;
    }
    const next: AdminPaymentSettings = {
      ...paymentSettings,
      publishState,
    };
    setPaymentSettings(next);
    saveAdminPaymentSettings(next);
    logAction(
      'Payment Management',
      publishState === 'published'
        ? 'Published Payment & Commission Settings'
        : 'Saved Payment Settings Draft',
      `Commission: ${next.platformCommissionPercent}%, GST: ${next.gstPercent}%, Min Payout: ₹${next.minimumPayoutAmount}`,
      publishState === 'published' ? 'published' : 'draft_saved'
    );
    showAdminNotification(
      publishState === 'published'
        ? '✅ Payment & Commission configuration published live!'
        : '📝 Payment settings saved as Draft.'
    );
  };

  const buildGstPayloadFromTx = (
    invoiceNo: string,
    customerName: string,
    description: string,
    amount: number,
    date: string
  ): GSTInvoicePayload => ({
    invoiceNumber: invoiceNo,
    transactionId: `TXN-${invoiceNo}`,
    date,
    customerName,
    customerPhone: '+91 98480 22338',
    customerGstin: paymentSettings.companyGstin,
    planOrItemName: description,
    description,
    baseAmount: Math.round(amount / (1 + paymentSettings.gstPercent / 100)),
    cgstRate: paymentSettings.gstPercent / 2,
    sgstRate: paymentSettings.gstPercent / 2,
    totalAmount: amount,
    paymentMethod: 'Verified Online Payment',
  });

  // ============================================================================
  // 3. AD MANAGEMENT STATE & HANDLERS
  // ============================================================================
  const [adSubTab, setAdSubTab] = useState<
    'campaigns' | 'placements_targeting' | 'budgets_schedules' | 'ad_reports'
  >('campaigns');
  const [isCreatingAd, setIsCreatingAd] = useState(false);
  const [previewAd, setPreviewAd] = useState<AdminAdCampaign | null>(null);
  const [adForm, setAdForm] = useState<{
    campaignName: string;
    advertiserName: string;
    placement: AdminAdCampaign['placement'];
    targetSection: AdminAdCampaign['targetSection'];
    targetCity: string;
    targetAudience: AdminAdCampaign['targetAudience'];
    headline: string;
    subheadline: string;
    ctaText: string;
    ctaUrlOrQuery: string;
    imageUrl: string;
    badgeText: string;
    dailyBudget: string;
    totalBudget: string;
    startDate: string;
    endDate: string;
  }>({
    campaignName: '',
    advertiserName: '',
    placement: 'top_spotlight',
    targetSection: 'all',
    targetCity: 'Hyderabad',
    targetAudience: 'all_users',
    headline: '',
    subheadline: '',
    ctaText: 'Explore Offer',
    ctaUrlOrQuery: '',
    imageUrl:
      'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=900&q=80',
    badgeText: 'SPONSORED SPOTLIGHT',
    dailyBudget: '1500',
    totalBudget: '30000',
    startDate: '2026-10-28',
    endDate: '2026-12-31',
  });

  const handleAdImageUpload = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setAdForm((prev) => ({ ...prev, imageUrl: reader.result as string }));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveAdCampaign = (status: 'draft' | 'published') => {
    if (!adForm.campaignName.trim() || !adForm.headline.trim()) return;
    const created: AdminAdCampaign = {
      id: `AD-${Date.now().toString().slice(-4)}`,
      campaignName: adForm.campaignName.trim(),
      advertiserName: adForm.advertiserName.trim() || 'BookOurSpace Partner',
      placement: adForm.placement,
      targetSection: adForm.targetSection,
      targetCity: adForm.targetCity.trim() || 'Hyderabad',
      targetAudience: adForm.targetAudience,
      headline: adForm.headline.trim(),
      subheadline:
        adForm.subheadline.trim() ||
        'Verified partner promotion on BookOurSpace.',
      ctaText: adForm.ctaText.trim() || 'View Offer',
      ctaUrlOrQuery: adForm.ctaUrlOrQuery.trim(),
      imageUrl: adForm.imageUrl.trim(),
      badgeText: adForm.badgeText.trim() || 'SPONSORED',
      dailyBudget: Number(adForm.dailyBudget) || 1000,
      totalBudget: Number(adForm.totalBudget) || 25000,
      amountSpent: 0,
      startDate: adForm.startDate,
      endDate: adForm.endDate,
      impressions: status === 'published' ? 120 : 0,
      clicks: 0,
      status,
    };
    const next = [created, ...ads];
    setAds(next);
    saveAdminAds(next);
    logAction(
      'Ad Management',
      status === 'published'
        ? 'Published Live Ad Campaign'
        : 'Saved Ad Campaign Draft',
      `${created.campaignName} (${created.placement}, section: ${created.targetSection})`,
      status === 'published' ? 'published' : 'draft_saved'
    );
    setIsCreatingAd(false);
    setAdForm((prev) => ({
      ...prev,
      campaignName: '',
      advertiserName: '',
      headline: '',
      subheadline: '',
    }));
    showAdminNotification(
      status === 'published'
        ? `📢 Ad "${created.campaignName}" is now PUBLISHED & LIVE in the Marketplace!`
        : `📝 Ad "${created.campaignName}" saved as Draft.`
    );
  };

  const handleUpdateAdStatus = (
    ad: AdminAdCampaign,
    nextStatus: 'draft' | 'published' | 'paused'
  ) => {
    const updated = ads.map((item) =>
      item.id === ad.id ? { ...item, status: nextStatus } : item
    );
    setAds(updated);
    saveAdminAds(updated);
    logAction(
      'Ad Management',
      `Ad Status Changed to ${nextStatus.toUpperCase()}`,
      `Campaign "${ad.campaignName}" (${ad.id}) set to ${nextStatus}`,
      nextStatus === 'published' ? 'published' : 'draft_saved'
    );
    showAdminNotification(
      `📢 Campaign "${ad.campaignName}" is now ${nextStatus.toUpperCase()}!`
    );
  };

  const handleDeleteAd = (ad: AdminAdCampaign) => {
    requestSensitiveConfirmation(
      `Delete Ad Campaign "${ad.campaignName}"?`,
      `This will permanently remove the campaign "${ad.campaignName}" and stop all associated impressions in the marketplace.`,
      'Delete Campaign',
      () => {
        const updated = ads.filter((item) => item.id !== ad.id);
        setAds(updated);
        saveAdminAds(updated);
        logAction(
          'Ad Management',
          'Deleted Ad Campaign',
          `Deleted campaign "${ad.campaignName}" (${ad.id})`,
          'sensitive_confirmed'
        );
        showAdminNotification(`🗑️ Deleted campaign "${ad.campaignName}".`);
      },
      true
    );
  };

  // ============================================================================
  // 4. CONTENT MANAGEMENT, LISTINGS, BOOKINGS, SETTINGS STATE & HANDLERS
  // ============================================================================
  const [catSearch, setCatSearch] = useState('');
  const [selectedCatId, setSelectedCatId] = useState<string>(
    categories[0]?.id || ''
  );
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatType, setNewCatType] = useState<any>('service');
  const [newCatSubs, setNewCatSubs] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');
  const [newCatIcon, setNewCatIcon] = useState('✨');
  const [newSubcategoryInput, setNewSubcategoryInput] = useState('');
  const [homeVisibilityVersion, setHomeVisibilityVersion] = useState(0);
  const [visibilitySaving, setVisibilitySaving] = useState(false);
  void homeVisibilityVersion;
  const [sectionStyles, setSectionStylesState] = useState<SectionStyles>(() => loadSectionStyles());

  const commitSectionStyles = async (next: SectionStyles) => {
    const result = await saveSectionStyles(next);
    if (result === 'failed') {
      showAdminNotification('Could not publish the style. Sign in as Super Admin and retry.');
      return result;
    }
    setSectionStylesState(next);
    showAdminNotification(result === 'published'
      ? 'Section style published for all visitors.'
      : 'Development preview saved on this device only; it is not published.');
    return result;
  };

  // Custom Field Form
  const [isAddingField, setIsAddingField] = useState(false);
  const [fieldLabel, setFieldLabel] = useState('');
  const [fieldKey, setFieldKey] = useState('');
  const [fieldType, setFieldType] = useState<any>('text');
  const [fieldOptions, setFieldOptions] = useState('');
  const [fieldRequired, setFieldRequired] = useState(false);

  // Content Sub-Tab
  const [contentSubTab, setContentSubTab] = useState<
    'categories' | 'banners' | 'homepage_labels' | 'media_theme'
  >('categories');
  const [newBannerTitle, setNewBannerTitle] = useState('');
  const [newBannerSubtitle, setNewBannerSubtitle] = useState('');
  const [newBannerSection, setNewBannerSection] = useState<any>('pg_hostels');

  // Listings & Venues Moderation
  const [moderationFilter, setModerationFilter] = useState<
    'all' | 'pending_approval' | 'active' | 'reported'
  >('all');
  const [editingListingId, setEditingListingId] = useState<string | null>(null);
  const [editListingTitle, setEditListingTitle] = useState('');
  const [editListingPrice, setEditListingPrice] = useState('');

  // Audit Filter
  const [auditFilterSection, setAuditFilterSection] = useState<string>('ALL');

  const activeCategory =
    categories.find((c) => c.id === selectedCatId) || categories[0];
  const pendingListings = listings.filter(
    (l) => l.status === 'pending_approval'
  );
  const pendingApprovalsCount = pendingListings.length;
  const reportedListings = listings.filter((l) => l.reported);
  const totalRevenue = transactions.reduce((acc, t) => acc + t.amount, 0);
  const totalAdSpend = ads.reduce((acc, a) => acc + a.amountSpent, 0);

  const filteredCategories = categories.filter(
    (c) =>
      c.name.toLowerCase().includes(catSearch.toLowerCase()) ||
      c.subcategories.some((s) =>
        s.toLowerCase().includes(catSearch.toLowerCase())
      )
  );

  const filteredModerationListings = listings
    .filter((l) => {
      if (moderationFilter === 'pending_approval')
        return l.status === 'pending_approval';
      if (moderationFilter === 'active') return l.status === 'active';
      if (moderationFilter === 'reported') return l.reported;
      return true;
    })
    .sort((a, b) => {
      if (a.status === 'pending_approval' && b.status !== 'pending_approval')
        return -1;
      if (a.status !== 'pending_approval' && b.status === 'pending_approval')
        return 1;
      return 0;
    });

  const handleApproveProviderRequest = async (
    listing: MarketplaceListing,
    openInApp = false
  ) => {
    const saved = await updateListingStatus(listing.id, 'active');
    if (!saved) {
      showAdminNotification('Could not save the approval. Check the Supabase session and listing permissions, then retry.');
      return;
    }
    logAction(
      'Listings & Venues',
      'Approved Provider Listing',
      `Approved "${listing.title}" by ${listing.providerName}`,
      'published'
    );
    showAdminNotification(
      `✅ Approved "${listing.title}" by ${listing.providerName}! It is now LIVE in the Application.`
    );
    if (openInApp && onApprovedNavigateToApp) {
      onApprovedNavigateToApp(listing);
    }
  };

  const handleRejectProviderRequest = (listing: MarketplaceListing) => {
    requestSensitiveConfirmation(
      `Reject Listing "${listing.title}"?`,
      `Rejecting this listing by ${listing.providerName} will prevent it from appearing in the public marketplace.`,
      'Reject Listing',
      async () => {
        const saved = await updateListingStatus(listing.id, 'rejected');
        if (!saved) {
          showAdminNotification('Could not save the rejection. Check the Supabase session and listing permissions, then retry.');
          return;
        }
        logAction(
          'Listings & Venues',
          'Rejected Provider Listing',
          `Rejected "${listing.title}" by ${listing.providerName}`,
          'sensitive_confirmed'
        );
        showAdminNotification(
          `❌ Rejected request "${listing.title}". It will not be displayed in the application.`
        );
      },
      true
    );
  };

  const persistAdminListingPatch = async (
    listing: MarketplaceListing,
    updates: Partial<MarketplaceListing>,
    successMessage: string
  ) => {
    const updated = { ...listing, ...updates };
    const saved = await updateRlsListing(listing.id, updates, updated);
    if (!saved) {
      showAdminNotification('The listing change was not saved. Sign in with an active Supabase admin and retry.');
      return false;
    }
    applyListingUpdateLocal(listing.id, updates);
    showAdminNotification(successMessage);
    return true;
  };

  const handleCreateCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;

    const subList = newCatSubs
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const created = addCategory({
      name: newCatName.trim(),
      entityType: newCatType,
      icon: newCatIcon.trim() || '✨',
      description:
        newCatDesc.trim() ||
        `All specialized ${newCatName.trim()} services and listings`,
      subcategories:
        subList.length > 0
          ? subList
          : ['General Services', 'Inspection & Consultation', 'Standard Work'],
      customFields: [],
    });

    if (created && created.id) {
      setSelectedCatId(created.id);
    }
    logAction(
      'Content Management',
      'Created Category',
      `Added category "${created.name}" with ${created.subcategories.length} subcategories`,
      'published'
    );
    setNewCatName('');
    setNewCatSubs('');
    setNewCatDesc('');
    setIsAddingCategory(false);
    showAdminNotification(
      `✅ New category "${created.name}" created with ${created.subcategories.length} sections!`
    );
  };

  const handleAddSubcategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubcategoryInput.trim() || !activeCategory) return;
    addSubcategoryToCategory(activeCategory.id, newSubcategoryInput.trim());
    logAction(
      'Content Management',
      'Added Subcategory',
      `Added "${newSubcategoryInput.trim()}" to ${activeCategory.name}`,
      'published'
    );
    showAdminNotification(
      `✅ Added section "${newSubcategoryInput.trim()}" to ${activeCategory.name}!`
    );
    setNewSubcategoryInput('');
  };

  const handleDeleteSubcategory = (sub: string) => {
    if (!activeCategory) return;
    deleteSubcategoryFromCategory(activeCategory.id, sub);
    logAction(
      'Content Management',
      'Deleted Subcategory',
      `Removed "${sub}" from ${activeCategory.name}`,
      'sensitive_confirmed'
    );
    showAdminNotification(`🗑️ Section "${sub}" removed.`);
  };

  const handleCreateCustomField = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fieldLabel.trim() || !fieldKey.trim() || !activeCategory) return;

    addCustomFieldToCategory(activeCategory.id, {
      label: fieldLabel.trim(),
      key: fieldKey.trim().replace(/\s+/g, '_').toLowerCase(),
      type: fieldType,
      options:
        fieldType === 'select'
          ? fieldOptions
              .split(',')
              .map((o) => o.trim())
              .filter(Boolean)
          : undefined,
      required: fieldRequired,
    });

    logAction(
      'Content Management',
      'Added Custom Field',
      `Added field "${fieldLabel.trim()}" (${fieldType}) to ${activeCategory.name}`,
      'published'
    );
    setFieldLabel('');
    setFieldKey('');
    setFieldOptions('');
    setFieldRequired(false);
    setIsAddingField(false);
    showAdminNotification(`✅ Custom field "${fieldLabel}" added!`);
  };

  const handleSavePlan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!FINANCIAL_ADMIN_MUTATIONS_READY) {
      showAdminNotification('Pricing and posting-plan changes are disabled until a reviewed backend workflow exists.');
      return;
    }
    if (!editingPlan) return;
    updatePostingPlan(editingPlan.id, editingPlan);
    logAction(
      'Payment Management',
      'Updated Posting Plan',
      `Updated "${editingPlan.name}" to ₹${editingPlan.price}`,
      'published'
    );
    setEditingPlan(null);
    showAdminNotification(`✅ Plan "${editingPlan.name}" updated!`);
  };

  // Left Navigation Menu Items (Prioritizing User Management, Payment Management, Ad Management, Reports & Analytics, and Theme Management)
  const navItems: {
    id: SuperAdminSectionId;
    label: string;
    badge?: string | number;
    priority?: boolean;
    icon: React.FC<{ className?: string }>;
  }[] = [
    {
      id: 'user_management',
      label: 'User Management',
      badge: users.length,
      priority: true,
      icon: Users,
    },
    {
      id: 'payment_management',
      label: 'Payment Management',
      badge: `₹${(totalRevenue / 1000).toFixed(1)}k`,
      priority: true,
      icon: CreditCard,
    },
    {
      id: 'ad_management',
      label: 'Ad Management',
      badge: `${ads.filter((a) => a.status === 'published').length} Live`,
      priority: true,
      icon: Megaphone,
    },
    {
      id: 'analytics_performance',
      label: 'Analytics & Performance',
      badge: 'D3 + Charts',
      priority: true,
      icon: TrendingUp,
    },
    {
      id: 'reports_analytics',
      label: 'Reports & Analytics',
      badge: 'Export',
      priority: true,
      icon: BarChart3,
    },
    {
      id: 'theme_management',
      label: 'Theme Management',
      badge: themeSettings.themeMode.toUpperCase(),
      priority: true,
      icon: Palette,
    },
    {
      id: 'integrations',
      label: 'Integrations',
      badge: '4 Synced',
      priority: true,
      icon: Plug,
    },
    {
      id: 'data_management',
      label: 'Data Management',
      badge: 'Hygiene',
      priority: true,
      icon: Database,
    },
    {
      id: 'announcements_status',
      label: 'Announcements & Status',
      badge: 'Live Notices',
      priority: true,
      icon: Megaphone,
    },
    {
      id: 'dashboard',
      label: 'Dashboard Overview',
      badge: pendingApprovalsCount > 0 ? `${pendingApprovalsCount} Pending` : undefined,
      icon: TrendingUp,
    },
    {
      id: 'content_management',
      label: 'Content Management',
      badge: categories.length,
      icon: Layers,
    },
    {
      id: 'listings_venues',
      label: 'Listings & Venues',
      badge: listings.length,
      icon: Building2,
    },
    {
      id: 'pg_hostels',
      label: 'PGs & Hostels',
      badge: pgAdminBookingCount || undefined,
      icon: Home,
    },
    {
      id: 'bookings_events',
      label: 'Bookings & Events',
      badge: bookings.length + events.length,
      icon: Calendar,
    },
    {
      id: 'feature_management',
      label: 'Feature Management',
      badge: `${modularTemplates.filter((m) => m.enabled).length}/${modularTemplates.length}`,
      icon: Sliders,
    },
    {
      id: 'audit_logs',
      label: 'Audit Logs & Trail',
      badge: auditLogs.length,
      priority: true,
      icon: History,
    },
    {
      id: 'notifications_mgmt',
      label: 'Notifications Mgmt',
      badge: `${sentNotificationsHistory.length} Sent`,
      priority: true,
      icon: Bell,
    },
    {
      id: 'app_settings',
      label: 'App Settings & Audit',
      badge: auditLogs.length,
      icon: Settings,
    },
  ];

  return (
    <Suspense fallback={<p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600" role="status">Loading administrator tools…</p>}>
    <div className="space-y-5 pb-24 text-slate-900 dark:text-slate-100">
      {/* Top Executive Header with Draft / Preview / Publish & Audit Quick-Access */}
      <div className="bg-gradient-to-r from-slate-950 via-indigo-950 to-purple-950 text-white p-4 sm:p-5 rounded-3xl shadow-lg border border-indigo-800/60 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-amber-400 text-slate-950 text-[10px] font-black uppercase tracking-wider mb-1">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>BookOurSpace • Enterprise Super Admin Console</span>
          </div>
          <h2 className="text-lg sm:text-2xl font-black tracking-tight">
            Modular Platform Command Center
          </h2>
          <p className="text-xs text-indigo-200">
            Dedicated independent sections for Users, Payments, Ads, Reports & Analytics, Theme Management, Content, Listings, Bookings & Feature Builder
          </p>
          <LastUpdated at={auditLogs[0]?.timestamp} label="Latest audit" className="mt-1 block text-[11px] font-semibold text-indigo-200" />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {pendingApprovalsCount > 0 && (
            <button
              type="button"
              onClick={() => {
                setActiveSection('listings_venues');
                setModerationFilter('pending_approval');
              }}
              className="px-3 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>{pendingApprovalsCount} Pending Approval(s)</span>
            </button>
          )}

          {onOpenLivePageEditor && (
            <button
              type="button"
              onClick={onOpenLivePageEditor}
              className="px-3 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Live Page Editor (OTA)</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsPreviewDrawerOpen(!isPreviewDrawerOpen)}
            className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/20 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <Eye className="w-3.5 h-3.5 text-amber-300" />
            <span>{isPreviewDrawerOpen ? 'Hide Live Preview' : 'Preview Published State'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection('app_settings')}
            className="px-3 py-1.5 rounded-xl bg-indigo-600/80 hover:bg-indigo-600 text-white border border-indigo-400/30 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <History className="w-3.5 h-3.5 text-amber-300" />
            <span>Audit Log ({auditLogs.length})</span>
          </button>
        </div>
      </div>

      {/* ADMIN HOME & LANDING PAGE LAYOUT STYLE SELECTOR */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border-2 border-indigo-200 dark:border-indigo-900/70 p-4 sm:p-5 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-200 text-[10px] font-black uppercase">
            <Sparkles className="w-3 h-3" />
            <span>Home &amp; Landing Page Experience</span>
          </div>
          <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
            Choose Active Customer Home &amp; Landing Screen Style
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Select whether users first land on the <strong>Super-App Bento Hub</strong> (and advance to the next page when they click any category) or the <strong>Classic All-in-One Marketplace</strong>.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              const next = saveHomeScreenLayoutStyle('bento_landing_hub');
              setHomeScreenStyle(next);
              logAction(
                'Feature Management',
                'Enabled Super-App Bento Landing Hub',
                'Set Home Screen Layout Style to Super-App Bento Hub (Category click -> Next page)',
                'published'
              );
              showAdminNotification(
                '📱 Super-App Bento Home & Landing Page enabled!'
              );
            }}
            className={`px-4 py-2.5 rounded-2xl border-2 text-left text-xs font-black transition cursor-pointer flex items-center justify-between gap-3 ${
              homeScreenStyle === 'bento_landing_hub'
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-md'
                : 'bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-indigo-400'
            }`}
          >
            <div>
              <div>📱 Super-App Bento Hub</div>
              <div
                className={`text-[10px] font-semibold ${
                  homeScreenStyle === 'bento_landing_hub'
                    ? 'text-indigo-100'
                    : 'text-slate-500'
                }`}
              >
                Landing Hub → Click Category → Next Screen
              </div>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/20 font-black">
              {homeScreenStyle === 'bento_landing_hub' ? 'ACTIVE' : 'SELECT'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              const next = saveHomeScreenLayoutStyle('classic_marketplace');
              setHomeScreenStyle(next);
              logAction(
                'Feature Management',
                'Enabled Classic Marketplace Home',
                'Set Home Screen Layout Style to Classic All-in-One Marketplace',
                'published'
              );
              showAdminNotification(
                '🏪 Classic All-in-One Marketplace Home enabled!'
              );
            }}
            className={`px-4 py-2.5 rounded-2xl border-2 text-left text-xs font-black transition cursor-pointer flex items-center justify-between gap-3 ${
              homeScreenStyle === 'classic_marketplace'
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-md'
                : 'bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-indigo-400'
            }`}
          >
            <div>
              <div>🏪 Classic Marketplace Home</div>
              <div
                className={`text-[10px] font-semibold ${
                  homeScreenStyle === 'classic_marketplace'
                    ? 'text-indigo-100'
                    : 'text-slate-500'
                }`}
              >
                All-in-One Header + Categories + Feed
              </div>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/20 font-black">
              {homeScreenStyle === 'classic_marketplace' ? 'ACTIVE' : 'SELECT'}
            </span>
          </button>
        </div>
      </div>

      {/* ADMIN OPTIONAL TOGGLE: THE CATEGORY RAIL & STREAM EXPLORER LAYOUT (DISABLED BY DEFAULT) */}
      {(() => {
        const railExplorerTpl = modularTemplates.find(
          (m) => m.id === 'category_rail_stream_explorer'
        );
        const isRailExplorerEnabled = Boolean(railExplorerTpl?.enabled);
        return (
          <div className="bg-white dark:bg-slate-900 rounded-3xl border-2 border-purple-200 dark:border-purple-900/70 p-4 sm:p-5 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-200 text-[10px] font-black uppercase">
                  <span>🛤️</span>
                  <span>Optional Navigation Layout</span>
                </span>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                    isRailExplorerEnabled
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                      : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                  }`}
                >
                  {isRailExplorerEnabled
                    ? 'ENABLED BY ADMIN (LIVE)'
                    : 'DISABLED BY DEFAULT (ENABLE WHEN REQUIRED)'}
                </span>
              </div>
              <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                The Category Rail &amp; Stream Explorer Layout (Blinkit / Flipkart / Zepto Style)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Disabled by default so the marketplace stays clean. Enable this from Admin only when you want the split Left Category Rail + Right Stream Explorer view to appear on category selection.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                const nextEnabled = !isRailExplorerEnabled;
                const exists = modularTemplates.some(
                  (m) => m.id === 'category_rail_stream_explorer'
                );
                const updated = exists
                  ? modularTemplates.map((m) =>
                      m.id === 'category_rail_stream_explorer'
                        ? { ...m, enabled: nextEnabled }
                        : m
                    )
                  : [
                      ...modularTemplates,
                      {
                        id: 'category_rail_stream_explorer',
                        name: 'The Category Rail & Stream Explorer Layout (Blinkit / Flipkart / Zepto Style)',
                        icon: '🛤️',
                        enabled: nextEnabled,
                        order: 14,
                      },
                    ];
                setModularTemplates(updated);
                saveModularTemplates(updated);
                logAction(
                  'Feature Management',
                  nextEnabled
                    ? 'Enabled Category Rail & Stream Explorer Layout'
                    : 'Disabled Category Rail & Stream Explorer Layout',
                  `Set "The Category Rail & Stream Explorer Layout" to ${
                    nextEnabled ? 'ENABLED (ON)' : 'DISABLED (OFF)'
                  }`,
                  'published'
                );
                showAdminNotification(
                  `🛤️ The Category Rail & Stream Explorer Layout is now ${
                    nextEnabled ? 'ENABLED (LIVE ON APP)' : 'DISABLED (HIDDEN)'
                  }!`
                );
              }}
              className={`px-4 py-2.5 rounded-2xl text-xs font-black shrink-0 cursor-pointer transition shadow-xs ${
                isRailExplorerEnabled
                  ? 'bg-rose-600 hover:bg-rose-700 text-white'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
              }`}
            >
              {isRailExplorerEnabled
                ? 'Disable Category Rail & Stream Layout'
                : '+ Enable Category Rail & Stream Layout'}
            </button>
          </div>
        );
      })()}

      {/* Live Preview Drawer when Admin clicks "Preview Published State" */}
      {isPreviewDrawerOpen && (
        <div className="bg-indigo-50/90 dark:bg-indigo-950/40 border-2 border-indigo-400 dark:border-indigo-700 rounded-3xl p-4 space-y-3 animate-in fade-in duration-150">
          <div className="flex items-center justify-between border-b border-indigo-200 dark:border-indigo-800 pb-2">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-indigo-600" />
              <span className="text-xs font-black uppercase tracking-wider text-indigo-900 dark:text-indigo-200">
                Live App State Inspector (Draft vs Published)
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsPreviewDrawerOpen(false)}
              className="text-xs font-bold text-slate-500 hover:text-slate-900 cursor-pointer"
            >
              Close ✕
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
            <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800">
              <div className="font-black text-slate-900 dark:text-white">
                Users & KYC Sync
              </div>
              <div className="text-slate-500 mt-1">
                {users.filter((u) => u.verified).length} Verified Users •{' '}
                {users.filter((u) => u.accountStatus === 'suspended').length} Suspended
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800">
              <div className="font-black text-slate-900 dark:text-white">
                Payment & Commission Rules ({paymentSettings.publishState.toUpperCase()})
              </div>
              <div className="text-slate-500 mt-1">
                Commission: {paymentSettings.platformCommissionPercent}% • GST:{' '}
                {paymentSettings.gstPercent}% • Prefix: {paymentSettings.invoicePrefix}
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800">
              <div className="font-black text-slate-900 dark:text-white">
                Active Marketplace Ads
              </div>
              <div className="text-slate-500 mt-1">
                {ads.filter((a) => a.status === 'published').length} Published Live •{' '}
                {ads.filter((a) => a.status === 'draft').length} Drafts
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800">
              <div className="font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                <span
                  className="w-3 h-3 rounded-full inline-block border border-slate-300"
                  style={{ backgroundColor: themeSettings.primaryBrandColor }}
                />
                <span>Theme ({themeSettings.publishState.toUpperCase()})</span>
              </div>
              <div className="text-slate-500 mt-1">
                Mode: {themeSettings.themeMode.toUpperCase()} • Primary:{' '}
                {themeSettings.primaryBrandColor}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MAIN TWO-COLUMN ADMIN LAYOUT: LEFT NAVIGATION SIDEBAR + RIGHT INDEPENDENT WORKSPACE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* LEFT NAVIGATION MENU */}
        <aside className="lg:col-span-3 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-3 shadow-xs lg:sticky lg:top-24 space-y-2">
          <div className="px-2.5 py-1.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              Super Admin Menu
            </span>
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              14 Sections
            </span>
          </div>

          <nav className="space-y-1">
            {navItems.map((item, idx) => {
              const IconComp = item.icon;
              const isSelected = activeSection === item.id;
              return (
                <React.Fragment key={item.id}>
                  {idx === 8 && (
                    <div className="pt-2 pb-1 px-2.5 text-[10px] font-black uppercase tracking-wider text-slate-400">
                      Platform & Operations
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setActiveSection(item.id)}
                    className={`w-full px-3 py-2.5 rounded-2xl text-left text-xs font-extrabold flex items-center justify-between gap-2 transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#4338CA] text-white shadow-sm'
                        : item.priority
                        ? 'bg-indigo-50/70 dark:bg-indigo-950/30 text-slate-900 dark:text-white hover:bg-indigo-100 dark:hover:bg-indigo-950/60 border border-indigo-200/60 dark:border-indigo-800/50'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <IconComp
                        className={`w-4 h-4 shrink-0 ${
                          isSelected
                            ? 'text-[#FFE500]'
                            : item.priority
                            ? 'text-[#4338CA] dark:text-indigo-400'
                            : 'text-slate-500'
                        }`}
                      />
                      <span className="truncate">{item.label}</span>
                    </div>
                    {item.badge !== undefined && (
                      <span
                        className={`text-[10px] font-black px-2 py-0.5 rounded-full shrink-0 ${
                          isSelected
                            ? 'bg-white/20 text-white'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                </React.Fragment>
              );
            })}
          </nav>

          {/* Recent Audit Mini-Feed inside Sidebar */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 px-2 space-y-1.5">
            <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-slate-400">
              <span>Latest Audit Trail</span>
              <History className="w-3 h-3" />
            </div>
            {auditLogs.slice(0, 2).map((log) => (
              <div
                key={log.id}
                className="text-[10px] bg-slate-50 dark:bg-slate-800/60 p-2 rounded-xl border border-slate-200/70 dark:border-slate-800"
              >
                <div className="font-black text-slate-800 dark:text-slate-200 truncate">
                  {log.action}
                </div>
                <div className="text-slate-500 truncate">{log.details}</div>
                <div className="text-[9px] text-indigo-600 dark:text-indigo-400 font-bold mt-0.5">
                  {log.actorName} • {log.timestamp.slice(11, 16)}
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* RIGHT WORKSPACE: INDEPENDENT SECTION SCREENS */}
        <div className="lg:col-span-9 space-y-6">
          {/* =====================================================================
              SECTION 1: USER MANAGEMENT (Customers, Providers, KYC, Suspensions, Roles)
             ===================================================================== */}
          {activeSection === 'user_management' && (
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-4 sm:p-6 shadow-xs space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                    Section 01 • Independent User & Access Control
                  </span>
                  <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <Users className="w-5 h-5 text-indigo-600" />
                    <span>User Management (Customers, Providers & Admins)</span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    Manage customer accounts, provider KYC verification, suspensions, and role permissions matrix. Changes sync live to provider listings.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsAddingUser(!isAddingUser)}
                    className="px-3.5 py-2 rounded-xl bg-[#4338CA] hover:bg-indigo-800 text-white text-xs font-black flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>+ Add User / Provider</span>
                  </button>
                </div>
              </div>

              {/* KPI Summary Row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">
                    Total Users
                  </span>
                  <div className="text-xl font-black text-slate-900 dark:text-white mt-0.5">
                    {users.length}
                  </div>
                </div>
                <div className="p-3.5 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900">
                  <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 uppercase">
                    Verified Owners / Providers
                  </span>
                  <div className="text-xl font-black text-emerald-700 dark:text-emerald-300 mt-0.5">
                    {users.filter((u) => u.role === 'provider' && u.verified).length}
                  </div>
                </div>
                <div className="p-3.5 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900">
                  <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300 uppercase">
                    Pending KYC Verification
                  </span>
                  <div className="text-xl font-black text-amber-600 mt-0.5">
                    {users.filter((u) => !u.verified).length}
                  </div>
                </div>
                <div className="p-3.5 rounded-2xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900">
                  <span className="text-[10px] font-bold text-rose-700 dark:text-rose-300 uppercase">
                    Suspended Accounts
                  </span>
                  <div className="text-xl font-black text-rose-600 mt-0.5">
                    {users.filter((u) => u.accountStatus === 'suspended').length}
                  </div>
                </div>
              </div>

              {/* Add User / Provider Form (with Draft & Publish buttons) */}
              {isAddingUser && (
                <form
                  onSubmit={(e) => handleCreateUser(e, 'published')}
                  className="bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 rounded-2xl p-4 space-y-3 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-black text-indigo-950 dark:text-indigo-200 uppercase text-[11px]">
                      Create New User / Provider Account
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsAddingUser(false)}
                      className="text-slate-400 hover:text-slate-700"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="font-bold block mb-1">Full Name / Business *</label>
                      <input
                        type="text"
                        required
                        value={newUserName}
                        onChange={(e) => setNewUserName(e.target.value)}
                        placeholder="e.g. Suresh Reddy (Reddy Hostels)"
                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                      />
                    </div>
                    <div>
                      <label className="font-bold block mb-1">Phone Number *</label>
                      <input
                        type="text"
                        required
                        value={newUserPhone}
                        onChange={(e) => setNewUserPhone(e.target.value)}
                        placeholder="+91 98480 11223"
                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                      />
                    </div>
                    <div>
                      <label className="font-bold block mb-1">Email</label>
                      <input
                        type="email"
                        value={newUserEmail}
                        onChange={(e) => setNewUserEmail(e.target.value)}
                        placeholder="owner@bookourspace.in"
                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                      />
                    </div>
                    <div>
                      <label className="font-bold block mb-1">Role</label>
                      <select
                        value={newUserRole}
                        onChange={(e) => setNewUserRole(e.target.value as any)}
                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold"
                      >
                        <option value="customer">Customer</option>
                        <option value="provider">Owner / Provider</option>
                        <option value="admin">Super Admin</option>
                      </select>
                    </div>
                    <div>
                      <label className="font-bold block mb-1">City / Area</label>
                      <input
                        type="text"
                        value={newUserCity}
                        onChange={(e) => setNewUserCity(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                      />
                    </div>
                    <div>
                      <label className="font-bold block mb-1">KYC / GSTIN Proof</label>
                      <input
                        type="text"
                        value={newUserKyc}
                        onChange={(e) => setNewUserKyc(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={(e) => handleCreateUser(e, 'draft')}
                      className="px-3.5 py-2 rounded-xl border border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 font-bold cursor-pointer"
                    >
                      Save as Draft
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-xl bg-[#4338CA] text-white font-black cursor-pointer"
                    >
                      Publish User Account
                    </button>
                  </div>
                </form>
              )}

              {/* Sub-navigation inside User Management */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  {[
                    { id: 'all_users', label: `All Users (${users.length})` },
                    {
                      id: 'verification',
                      label: `Pending Verification (${users.filter((u) => !u.verified).length})`,
                    },
                    {
                      id: 'suspensions',
                      label: `Suspended (${users.filter((u) => u.accountStatus === 'suspended').length})`,
                    },
                    { id: 'roles_permissions', label: 'Roles & Permissions Matrix' },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setUserSubTab(tab.id as any)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-extrabold cursor-pointer transition ${
                        userSubTab === tab.id
                          ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {userSubTab !== 'roles_permissions' && (
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                        placeholder="Search name, phone, city..."
                        className="pl-8 pr-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs outline-hidden"
                      />
                    </div>
                    <select
                      value={userRoleFilter}
                      onChange={(e) => setUserRoleFilter(e.target.value as any)}
                      className="px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold"
                    >
                      <option value="all">All Roles</option>
                      <option value="customer">Customers</option>
                      <option value="provider">Providers</option>
                      <option value="admin">Admins</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Users Table OR Roles & Permissions Matrix */}
              {userSubTab === 'roles_permissions' ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-[10px] uppercase text-slate-400">
                        <th className="py-3 px-3">Role</th>
                        <th className="py-3 px-3 text-center">Create Listings</th>
                        <th className="py-3 px-3 text-center">Book Services</th>
                        <th className="py-3 px-3 text-center">Approve Listings</th>
                        <th className="py-3 px-3 text-center">Manage Users</th>
                        <th className="py-3 px-3 text-center">Manage Payments</th>
                        <th className="py-3 px-3 text-center">Manage Ads</th>
                        <th className="py-3 px-3 text-center">View Reports</th>
                        <th className="py-3 px-3 text-center">Manage Theme</th>
                        <th className="py-3 px-3 text-center">Integrations</th>
                        <th className="py-3 px-3 text-center">Manage Data</th>
                        <th className="py-3 px-3 text-center">Announcements</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-bold">
                      {rolePerms.map((rp) => (
                        <tr key={rp.role}>
                          <td className="py-3 px-3">
                            <span className="font-black text-slate-900 dark:text-white">
                              {rp.label}
                            </span>
                            <span className="block text-[10px] text-slate-400 uppercase">
                              {rp.role}
                            </span>
                          </td>
                          {(
                            [
                              'canCreateListings',
                              'canBookServices',
                              'canApproveListings',
                              'canManageUsers',
                              'canManagePayments',
                              'canManageAds',
                              'canViewReports',
                              'canManageTheme',
                              'canManageIntegrations',
                              'canManageData',
                              'canManageAnnouncements',
                            ] as const
                          ).map((permKey) => (
                            <td key={permKey} className="py-3 px-3 text-center">
                              <input
                                type="checkbox"
                                checked={Boolean(rp[permKey])}
                                onChange={() =>
                                  handleToggleRolePermission(rp.role, permKey)
                                }
                                className="w-4 h-4 rounded text-indigo-600 cursor-pointer"
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-[10px] uppercase text-slate-400">
                        <th className="py-2.5 px-3">User / Provider</th>
                        <th className="py-2.5 px-3">Role</th>
                        <th className="py-2.5 px-3">KYC & Verification</th>
                        <th className="py-2.5 px-3">Account Status</th>
                        <th className="py-2.5 px-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {filteredUsers.map((u) => (
                        <tr
                          key={u.id}
                          className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                        >
                          <td className="py-3 px-3">
                            <div className="font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                              <span>{u.name}</span>
                              {u.publishState === 'draft' && (
                                <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[9px] font-black">
                                  DRAFT
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              📞 {u.phone} • ✉️ {u.email} • 📍 {u.city}
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <select
                              value={u.role}
                              onChange={(e) =>
                                handleChangeUserRole(u, e.target.value as any)
                              }
                              className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 font-bold text-[11px] cursor-pointer"
                            >
                              <option value="customer">Customer</option>
                              <option value="provider">Provider</option>
                              <option value="admin">Admin</option>
                            </select>
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-1.5">
                              {u.verified ? (
                                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-[10px] font-black flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3" />
                                  <span>Verified</span>
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-black">
                                  Pending KYC
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {u.kycDocument}
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                                u.accountStatus === 'active'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : u.accountStatus === 'suspended'
                                  ? 'bg-rose-100 text-rose-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {u.accountStatus}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleToggleUserVerification(u)}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer ${
                                  u.verified
                                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                                    : 'bg-emerald-600 text-white'
                                }`}
                              >
                                {u.verified ? 'Revoke KYC' : 'Verify KYC'}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleToggleSuspendUser(u)}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer ${
                                  u.accountStatus === 'suspended'
                                    ? 'bg-indigo-600 text-white'
                                    : 'bg-rose-100 text-rose-700 hover:bg-rose-200'
                                }`}
                              >
                                {u.accountStatus === 'suspended'
                                  ? 'Reactivate'
                                  : 'Suspend'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* =====================================================================
              SECTION 2: PAYMENT MANAGEMENT (Transactions, Refunds, Payouts, Commissions, Invoices, Settings)
             ===================================================================== */}
          {activeSection === 'payment_management' && (
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-4 sm:p-6 shadow-xs space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600">
                    Section 02 • Financial & Billing Ledger
                  </span>
                  <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-emerald-600" />
                    <span>Payment Management (Transactions, Refunds, Payouts & GST Invoices)</span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    Review-only ledger and settings. No payment, refund, payout, settlement or fee status is verified or mutable here.
                  </p>
                </div>

                {/* Sub-tabs for Payment Management */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {[
                    { id: 'transactions', label: `Transactions (${transactions.length})` },
                    { id: 'automated_billing', label: '⚡ Automated Billing & Cycle Emails' },
                    { id: 'refunds', label: `Refunds (${refunds.length})` },
                    { id: 'payouts', label: `Payouts (${payouts.length})` },
                    { id: 'commissions_plans', label: 'Commissions & Plans' },
                    { id: 'payment_settings', label: 'Payment Settings' },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setPaymentSubTab(tab.id as any)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-extrabold cursor-pointer transition ${
                        paymentSubTab === tab.id
                          ? 'bg-emerald-700 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950" role="status">Financial controls are locked because this admin console has no verified transaction, refund or settlement workflow with server authorization and audit logging. Values shown may come from local legacy storage and are not proof of payment.</p>

              {/* Payment KPIs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900">
                  <span className="text-[10px] font-bold text-emerald-700 uppercase">
                    Gross Revenue
                  </span>
                  <div className="text-xl font-black text-emerald-700 dark:text-emerald-300 mt-0.5">
                    ₹{totalRevenue.toLocaleString('en-IN')}
                  </div>
                </div>
                <div className="p-3.5 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900">
                  <span className="text-[10px] font-bold text-indigo-700 uppercase">
                    Platform Commission ({paymentSettings.platformCommissionPercent}%)
                  </span>
                  <div className="text-xl font-black text-indigo-700 dark:text-indigo-300 mt-0.5">
                    ₹
                    {Math.round(
                      (totalRevenue * paymentSettings.platformCommissionPercent) /
                        100
                    ).toLocaleString('en-IN')}
                  </div>
                </div>
                <div className="p-3.5 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900">
                  <span className="text-[10px] font-bold text-amber-700 uppercase">
                    Scheduled Payouts
                  </span>
                  <div className="text-xl font-black text-amber-600 mt-0.5">
                    ₹
                    {payouts
                      .reduce((s, p) => s + p.netPayout, 0)
                      .toLocaleString('en-IN')}
                  </div>
                </div>
                <div className="p-3.5 rounded-2xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900">
                  <span className="text-[10px] font-bold text-rose-700 uppercase">
                    Pending Refunds
                  </span>
                  <div className="text-xl font-black text-rose-600 mt-0.5">
                    {refunds.filter((r) => r.status === 'pending').length}
                  </div>
                </div>
              </div>

              {/* SUB-TAB 2A: TRANSACTIONS & GST INVOICES */}
              {paymentSubTab === 'transactions' && (
                <div className="space-y-4">
                  <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950" role="status">Financial actions are read-only here. Manual transactions, payment status changes, refunds and settlements require verified backend workflows and audit logging.</p>
                  {/* Quick Record Payment Form */}
                  <form
                    onSubmit={handleRecordNewTransaction}
                    className="bg-slate-50 dark:bg-slate-800/50 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-5 gap-2.5 items-end text-xs"
                  >
                    <div className="sm:col-span-2">
                      <label className="font-bold block mb-1">
                        Plan / Service Description
                      </label>
                      <input
                        type="text"
                        required
                        disabled={!FINANCIAL_ADMIN_MUTATIONS_READY}
                        value={newTxDesc}
                        onChange={(e) => setNewTxDesc(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                      />
                    </div>
                    <div>
                      <label className="font-bold block mb-1">Amount (₹)</label>
                      <input
                        type="number"
                        required
                        disabled={!FINANCIAL_ADMIN_MUTATIONS_READY}
                        value={newTxAmount}
                        onChange={(e) => setNewTxAmount(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold"
                      />
                    </div>
                    <div>
                      <label className="font-bold block mb-1">Method</label>
                      <select
                        disabled={!FINANCIAL_ADMIN_MUTATIONS_READY}
                        value={newTxMethod}
                        onChange={(e) => setNewTxMethod(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                      >
                        <option value="UPI (GPay / PhonePe)">UPI (GPay / PhonePe)</option>
                        <option value="Credit / Debit Card">Credit / Debit Card</option>
                        <option value="NetBanking NEFT">NetBanking NEFT</option>
                      </select>
                    </div>
                    <button
                      type="submit"
                      disabled={!FINANCIAL_ADMIN_MUTATIONS_READY}
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black cursor-not-allowed disabled:opacity-40"
                    >
                      + Record & Bill
                    </button>
                  </form>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-800 text-[10px] uppercase text-slate-400">
                          <th className="py-2.5 px-3">Invoice</th>
                          <th className="py-2.5 px-3">Type</th>
                          <th className="py-2.5 px-3">Description</th>
                          <th className="py-2.5 px-3">Method & Date</th>
                          <th className="py-2.5 px-3 text-right">Amount</th>
                          <th className="py-2.5 px-3 text-right">GST Receipt / PDF</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {transactions.map((tx) => (
                          <tr key={tx.id}>
                            <td className="py-3 px-3 font-black">{tx.invoiceNumber}</td>
                            <td className="py-3 px-3">
                              <span className="px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 text-[10px] font-bold">
                                {tx.type}
                              </span>
                            </td>
                            <td className="py-3 px-3 font-semibold">{tx.description}</td>
                            <td className="py-3 px-3 text-slate-500">
                              {tx.paymentMethod} • {tx.date}
                            </td>
                            <td className="py-3 px-3 text-right font-black text-emerald-600">
                              ₹{tx.amount.toLocaleString('en-IN')}
                            </td>
                            <td className="py-3 px-3 text-right">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    printGSTInvoiceReceipt(
                                      buildGstPayloadFromTx(
                                        tx.invoiceNumber,
                                        'BookOurSpace Partner',
                                        tx.description,
                                        tx.amount,
                                        tx.date
                                      )
                                    )
                                  }
                                  className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 text-slate-700 dark:text-slate-200 font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                                >
                                  <Printer className="w-3 h-3" />
                                  <span>Print</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    downloadGSTInvoicePDF(
                                      buildGstPayloadFromTx(
                                        tx.invoiceNumber,
                                        'BookOurSpace Partner',
                                        tx.description,
                                        tx.amount,
                                        tx.date
                                      )
                                    )
                                  }
                                  className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                                >
                                  <Download className="w-3 h-3" />
                                  <span>GST PDF</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* SUB-TAB 2A-AUTO: AUTOMATED END-OF-CYCLE BILLING ENGINE & EMAIL TRACKER */}
              {paymentSubTab === 'automated_billing' && (
                <AutomatedBillingEnginePanel
                  listings={listings}
                  bookings={bookings}
                  paymentSettings={paymentSettings}
                  onLogAction={logAction}
                  onNotify={showAdminNotification}
                />
              )}

              {/* SUB-TAB 2B: REFUNDS */}
              {paymentSubTab === 'refunds' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-[10px] uppercase text-slate-400">
                        <th className="py-2.5 px-3">Refund ID</th>
                        <th className="py-2.5 px-3">Customer / Invoice</th>
                        <th className="py-2.5 px-3">Reason</th>
                        <th className="py-2.5 px-3">Amount</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {refunds.map((ref) => (
                        <tr key={ref.id}>
                          <td className="py-3 px-3 font-black">{ref.id}</td>
                          <td className="py-3 px-3">
                            <div className="font-bold">{ref.customerOrProviderName}</div>
                            <div className="text-[10px] text-slate-400">
                              {ref.invoiceNumber} • {ref.requestedAt}
                            </div>
                          </td>
                          <td className="py-3 px-3 text-slate-600 dark:text-slate-300">
                            {ref.reason}
                          </td>
                          <td className="py-3 px-3 font-black text-rose-600">
                            ₹{ref.amount.toLocaleString('en-IN')}
                          </td>
                          <td className="py-3 px-3">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                                ref.status === 'processed' || ref.status === 'approved'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : ref.status === 'rejected'
                                  ? 'bg-rose-100 text-rose-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {ref.status}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleRefundAction(ref, 'processed')}
                                disabled={!FINANCIAL_ADMIN_MUTATIONS_READY}
                                title="Disabled until an audited refund workflow is connected"
                                className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-bold cursor-not-allowed disabled:opacity-40"
                              >
                                Approve & Refund
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRefundAction(ref, 'rejected')}
                                disabled={!FINANCIAL_ADMIN_MUTATIONS_READY}
                                title="Disabled until an audited refund workflow is connected"
                                className="px-2.5 py-1 rounded-lg bg-rose-100 text-rose-700 text-[11px] font-bold cursor-not-allowed disabled:opacity-40"
                              >
                                Reject
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* SUB-TAB 2C: PROVIDER PAYOUTS */}
              {paymentSubTab === 'payouts' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-[10px] uppercase text-slate-400">
                        <th className="py-2.5 px-3">Payout ID</th>
                        <th className="py-2.5 px-3">Provider & Bank/UPI</th>
                        <th className="py-2.5 px-3">Gross</th>
                        <th className="py-2.5 px-3">Commission</th>
                        <th className="py-2.5 px-3">Net Payout</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {payouts.map((pay) => (
                        <tr key={pay.id}>
                          <td className="py-3 px-3 font-black">{pay.id}</td>
                          <td className="py-3 px-3">
                            <div className="font-bold">{pay.providerName}</div>
                            <div className="text-[10px] text-slate-400">
                              {pay.upiOrBank} • {pay.payoutDate}
                            </div>
                          </td>
                          <td className="py-3 px-3 font-semibold">
                            ₹{pay.grossAmount.toLocaleString('en-IN')}
                          </td>
                          <td className="py-3 px-3 text-rose-600 font-semibold">
                            -₹{pay.commissionDeducted.toLocaleString('en-IN')}
                          </td>
                          <td className="py-3 px-3 font-black text-emerald-600">
                            ₹{pay.netPayout.toLocaleString('en-IN')}
                          </td>
                          <td className="py-3 px-3">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                                pay.status === 'paid'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : pay.status === 'on_hold'
                                  ? 'bg-rose-100 text-rose-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {pay.status}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handlePayoutAction(pay, 'paid')}
                                disabled={!FINANCIAL_ADMIN_MUTATIONS_READY}
                                title="Disabled until a verified settlement workflow is connected"
                                className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-bold cursor-not-allowed disabled:opacity-40"
                              >
                                Release Payout
                              </button>
                              <button
                                type="button"
                                onClick={() => handlePayoutAction(pay, 'on_hold')}
                                disabled={!FINANCIAL_ADMIN_MUTATIONS_READY}
                                title="Disabled until a verified settlement workflow is connected"
                                className="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-800 text-[11px] font-bold cursor-not-allowed disabled:opacity-40"
                              >
                                Hold
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* SUB-TAB 2D: COMMISSIONS & POSTING PLANS */}
              {paymentSubTab === 'commissions_plans' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {postingPlans.map((plan) => (
                    <div
                      key={plan.id}
                      className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between space-y-3"
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="font-black text-sm">{plan.name}</span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                            Active
                          </span>
                        </div>
                        <div className="text-2xl font-black text-purple-600 my-1.5">
                          ₹{plan.price}
                          <span className="text-xs font-normal text-slate-400">
                            /{plan.billingPeriod}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 space-y-1">
                          <div>Limit: {plan.listingLimit} Listings</div>
                          <div>Validity: {plan.validityDays} Days</div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setEditingPlan(plan)}
                        disabled={!FINANCIAL_ADMIN_MUTATIONS_READY}
                        className="w-full py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold hover:border-purple-500 cursor-not-allowed disabled:opacity-40"
                      >
                        Edit Plan & Fee
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* SUB-TAB 2E: PAYMENT GATEWAY & TAX SETTINGS (with Draft & Publish) */}
              {paymentSubTab === 'payment_settings' && (
                <div className="space-y-4 bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="font-bold block mb-1">
                        Platform Commission (%)
                      </label>
                      <input
                        type="number"
                        disabled={!FINANCIAL_ADMIN_MUTATIONS_READY}
                        value={paymentSettings.platformCommissionPercent}
                        onChange={(e) =>
                          setPaymentSettings({
                            ...paymentSettings,
                            platformCommissionPercent: Number(e.target.value),
                          })
                        }
                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold"
                      />
                    </div>
                    <div>
                      <label className="font-bold block mb-1">GST Tax Rate (%)</label>
                      <input
                        type="number"
                        disabled={!FINANCIAL_ADMIN_MUTATIONS_READY}
                        value={paymentSettings.gstPercent}
                        onChange={(e) =>
                          setPaymentSettings({
                            ...paymentSettings,
                            gstPercent: Number(e.target.value),
                          })
                        }
                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold"
                      />
                    </div>
                    <div>
                      <label className="font-bold block mb-1">
                        Minimum Payout Threshold (₹)
                      </label>
                      <input
                        type="number"
                        disabled={!FINANCIAL_ADMIN_MUTATIONS_READY}
                        value={paymentSettings.minimumPayoutAmount}
                        onChange={(e) =>
                          setPaymentSettings({
                            ...paymentSettings,
                            minimumPayoutAmount: Number(e.target.value),
                          })
                        }
                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 pt-2">
                    {(
                      ['upi', 'cards', 'netbanking', 'wallet', 'payAtVenue'] as const
                    ).map((m) => (
                      <label
                        key={m}
                        className="flex items-center gap-1.5 font-bold cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          disabled={!FINANCIAL_ADMIN_MUTATIONS_READY}
                          checked={paymentSettings.supportedMethods[m]}
                          onChange={(e) =>
                            setPaymentSettings({
                              ...paymentSettings,
                              supportedMethods: {
                                ...paymentSettings.supportedMethods,
                                [m]: e.target.checked,
                              },
                            })
                          }
                          className="rounded text-emerald-600"
                        />
                        <span className="uppercase">{m}</span>
                      </label>
                    ))}
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-700">
                    <button
                      type="button"
                      onClick={() => handleSavePaymentSettings('draft')}
                      disabled={!FINANCIAL_ADMIN_MUTATIONS_READY}
                      className="px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 font-bold cursor-not-allowed disabled:opacity-40"
                    >
                      Save as Draft
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSavePaymentSettings('published')}
                      disabled={!FINANCIAL_ADMIN_MUTATIONS_READY}
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black cursor-not-allowed disabled:opacity-40"
                    >
                      Publish Payment Settings
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* =====================================================================
              SECTION 3: AD MANAGEMENT (Campaigns, Placements, Creatives, Targeting, Budgets, Reports)
             ===================================================================== */}
          {activeSection === 'ad_management' && (
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-4 sm:p-6 shadow-xs space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-purple-600">
                    Section 03 • Sponsored Campaigns & Ad Server
                  </span>
                  <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <Megaphone className="w-5 h-5 text-purple-600" />
                    <span>Ad Management (Campaigns, Placements, Targeting & Budgets)</span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    Create ad creatives, target specific cities/sections, manage budgets, preview drafts, and publish directly to the live Marketplace feed.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsCreatingAd(!isCreatingAd)}
                    className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-black flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>+ New Ad Campaign</span>
                  </button>
                </div>
              </div>

              {/* Ad Sub-tabs */}
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { id: 'campaigns', label: `Campaigns & Creatives (${ads.length})` },
                  { id: 'placements_targeting', label: 'Placements & Audience Targeting' },
                  { id: 'budgets_schedules', label: 'Budgets & Schedules' },
                  { id: 'ad_reports', label: 'Ad Performance Reports' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setAdSubTab(tab.id as any)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-extrabold cursor-pointer transition ${
                      adSubTab === tab.id
                        ? 'bg-purple-700 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Create / Draft / Preview / Publish Ad Form */}
              {isCreatingAd && (
                <div className="bg-purple-50/70 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded-2xl p-4 space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-black uppercase text-purple-900 dark:text-purple-200">
                      Create Sponsored Ad Campaign (Supports Draft → Preview → Publish)
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsCreatingAd(false)}
                      className="text-slate-400 hover:text-slate-700"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="font-bold block mb-1">Campaign Name *</label>
                      <input
                        type="text"
                        value={adForm.campaignName}
                        onChange={(e) =>
                          setAdForm({ ...adForm, campaignName: e.target.value })
                        }
                        placeholder="e.g. Madhapur Co-Living Spotlight"
                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                      />
                    </div>
                    <div>
                      <label className="font-bold block mb-1">Advertiser Name *</label>
                      <input
                        type="text"
                        value={adForm.advertiserName}
                        onChange={(e) =>
                          setAdForm({ ...adForm, advertiserName: e.target.value })
                        }
                        placeholder="e.g. Sri Sai Executive PG"
                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                      />
                    </div>
                    <div>
                      <label className="font-bold block mb-1">Ad Placement Slot</label>
                      <select
                        value={adForm.placement}
                        onChange={(e) =>
                          setAdForm({ ...adForm, placement: e.target.value as any })
                        }
                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold"
                      >
                        <option value="top_spotlight">Top Marketplace Spotlight</option>
                        <option value="mid_feed_banner">Mid-Feed Native Banner</option>
                        <option value="category_sponsor">Category Header Sponsor</option>
                        <option value="footer_promo">Footer Promo Card</option>
                      </select>
                    </div>

                    <div>
                      <label className="font-bold block mb-1">Target App Section</label>
                      <select
                        value={adForm.targetSection}
                        onChange={(e) =>
                          setAdForm({
                            ...adForm,
                            targetSection: e.target.value as any,
                          })
                        }
                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold"
                      >
                        <option value="all">All 6 Marketplace Sections</option>
                        <option value="pg_hostels">PG's & Hostels</option>
                        <option value="classes">Classes & Coaching</option>
                        <option value="venues">Function Halls & Venues</option>
                        <option value="services">Home & Pro Services</option>
                        <option value="hotel_stay">Hotel & Stay</option>
                        <option value="movies">Movies & Shows</option>
                      </select>
                    </div>
                    <div>
                      <label className="font-bold block mb-1">Location Targeting</label>
                      <input
                        type="text"
                        value={adForm.targetCity}
                        onChange={(e) =>
                          setAdForm({ ...adForm, targetCity: e.target.value })
                        }
                        placeholder="Hyderabad (Madhapur / Gachibowli)"
                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                      />
                    </div>
                    <div>
                      <label className="font-bold block mb-1">Audience Segment</label>
                      <select
                        value={adForm.targetAudience}
                        onChange={(e) =>
                          setAdForm({
                            ...adForm,
                            targetAudience: e.target.value as any,
                          })
                        }
                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                      >
                        <option value="all_users">All App Visitors</option>
                        <option value="students_pg">Students & IT Professionals</option>
                        <option value="event_planners">Wedding & Event Planners</option>
                        <option value="homeowners">Homeowners & Families</option>
                        <option value="travelers">Business & Leisure Travelers</option>
                      </select>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="font-bold block mb-1">Ad Headline *</label>
                      <input
                        type="text"
                        value={adForm.headline}
                        onChange={(e) =>
                          setAdForm({ ...adForm, headline: e.target.value })
                        }
                        placeholder="e.g. Zero-Brokerage Luxury AC PGs Starting ₹7,500/mo"
                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                      />
                    </div>
                    <div>
                      <label className="font-bold block mb-1">CTA Button Text</label>
                      <input
                        type="text"
                        value={adForm.ctaText}
                        onChange={(e) =>
                          setAdForm({ ...adForm, ctaText: e.target.value })
                        }
                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="font-bold block mb-1">
                        Creative Image URL or Upload Any Image Format
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={adForm.imageUrl}
                          onChange={(e) =>
                            setAdForm({ ...adForm, imageUrl: e.target.value })
                          }
                          className="flex-1 px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                        />
                        <label className="px-3 py-2 rounded-xl bg-indigo-600 text-white font-bold cursor-pointer flex items-center gap-1 shrink-0">
                          <Upload className="w-3.5 h-3.5" />
                          <span>Upload</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => handleAdImageUpload(e.target.files?.[0])}
                            className="hidden"
                          />
                        </label>
                      </div>
                    </div>

                    <div>
                      <label className="font-bold block mb-1">Total Budget (₹)</label>
                      <input
                        type="number"
                        value={adForm.totalBudget}
                        onChange={(e) =>
                          setAdForm({ ...adForm, totalBudget: e.target.value })
                        }
                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() =>
                        setPreviewAd({
                          id: 'PREVIEW',
                          campaignName: adForm.campaignName || 'Preview Campaign',
                          advertiserName: adForm.advertiserName || 'Verified Partner',
                          placement: adForm.placement,
                          targetSection: adForm.targetSection,
                          targetCity: adForm.targetCity,
                          targetAudience: adForm.targetAudience,
                          headline:
                            adForm.headline || 'Sample Headline for Preview',
                          subheadline:
                            adForm.subheadline ||
                            'Live preview of how your ad creative appears in BookOurSpace.',
                          ctaText: adForm.ctaText || 'Explore',
                          ctaUrlOrQuery: adForm.ctaUrlOrQuery,
                          imageUrl: adForm.imageUrl,
                          badgeText: adForm.badgeText,
                          dailyBudget: Number(adForm.dailyBudget) || 1000,
                          totalBudget: Number(adForm.totalBudget) || 25000,
                          amountSpent: 0,
                          startDate: adForm.startDate,
                          endDate: adForm.endDate,
                          impressions: 0,
                          clicks: 0,
                          status: 'draft',
                        })
                      }
                      className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-purple-300 text-purple-700 font-bold cursor-pointer"
                    >
                      👁️ Preview Creative
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSaveAdCampaign('draft')}
                      className="px-3.5 py-2 rounded-xl border border-purple-400 text-purple-800 dark:text-purple-200 font-bold cursor-pointer"
                    >
                      Save as Draft
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSaveAdCampaign('published')}
                      className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-black cursor-pointer flex items-center gap-1"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Publish Live to App</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Ad Creative Live Preview Modal */}
              {previewAd && (
                <div className="p-4 rounded-2xl bg-slate-950 text-white space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-black text-amber-300 uppercase">
                      Ad Creative Preview ({previewAd.placement} • {previewAd.targetSection})
                    </span>
                    <button
                      type="button"
                      onClick={() => setPreviewAd(null)}
                      className="text-slate-400 hover:text-white"
                    >
                      Close Preview ✕
                    </button>
                  </div>
                  <div className="bg-white text-slate-900 rounded-xl p-3 flex items-center gap-3">
                    <SafeImage category="general"
                      src={previewAd.imageUrl}
                      alt={previewAd.headline}
                      className="w-20 h-20 rounded-lg object-cover shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-[9px] font-black px-2 py-0.5 rounded bg-indigo-100 text-indigo-800">
                        {previewAd.badgeText}
                      </span>
                      <h4 className="font-black text-sm mt-1">
                        {previewAd.headline}
                      </h4>
                      <p className="text-xs text-slate-500">
                        {previewAd.subheadline}
                      </p>
                      <div className="text-[11px] font-bold text-indigo-600 mt-1">
                        {previewAd.advertiserName} • 📍 {previewAd.targetCity} → [
                        {previewAd.ctaText}]
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Analytics library is loaded only when the admin opens the ads workspace. */}
              <AdminAdPerformanceChart ads={ads} />

              {/* Campaigns List & Controls */}
              <div className="space-y-3">
                {ads.map((ad) => {
                  const ctr =
                    ad.impressions > 0
                      ? ((ad.clicks / ad.impressions) * 100).toFixed(2)
                      : '0.00';
                  return (
                    <div
                      key={ad.id}
                      className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                    >
                      <div className="flex items-start gap-3.5 min-w-0">
                        <SafeImage category="general"
                          src={ad.imageUrl}
                          alt={ad.campaignName}
                          className="w-20 h-20 rounded-xl object-cover shrink-0 border border-slate-200"
                        />
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                                ad.status === 'published'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : ad.status === 'draft'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-slate-200 text-slate-700'
                              }`}
                            >
                              {ad.status}
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800">
                              Slot: {ad.placement}
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800">
                              Section: {ad.targetSection}
                            </span>
                            <span className="text-[10px] text-slate-500 font-bold">
                              📍 {ad.targetCity} ({ad.targetAudience})
                            </span>
                          </div>
                          <h4 className="font-black text-sm text-slate-900 dark:text-white">
                            {ad.campaignName} — <span className="font-semibold text-slate-500">{ad.headline}</span>
                          </h4>
                          <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-3">
                            <span>
                              Budget: <strong>₹{ad.amountSpent.toLocaleString('en-IN')}</strong> / ₹
                              {ad.totalBudget.toLocaleString('en-IN')}
                            </span>
                            <span>
                              Impressions: <strong>{ad.impressions.toLocaleString()}</strong>
                            </span>
                            <span>
                              Clicks: <strong>{ad.clicks.toLocaleString()}</strong> (CTR: {ctr}%)
                            </span>
                            <span>
                              Schedule: {ad.startDate} → {ad.endDate}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => setPreviewAd(ad)}
                          className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold cursor-pointer"
                        >
                          Preview
                        </button>
                        {ad.status !== 'published' ? (
                          <button
                            type="button"
                            onClick={() => handleUpdateAdStatus(ad, 'published')}
                            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black cursor-pointer"
                          >
                            Publish to App
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleUpdateAdStatus(ad, 'paused')}
                            className="px-3 py-1.5 rounded-xl bg-amber-100 text-amber-900 text-xs font-bold cursor-pointer"
                          >
                            Pause
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDeleteAd(ad)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                          title="Delete campaign"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* =====================================================================
              SECTION 4: DASHBOARD OVERVIEW
             ===================================================================== */}
          {activeSection === 'dashboard' && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Users</span>
                  <div className="text-xl font-black mt-1">{users.length}</div>
                </div>
                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Listings</span>
                  <div className="text-xl font-black mt-1">{listings.length}</div>
                </div>
                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Bookings</span>
                  <div className="text-xl font-black mt-1">{bookings.length}</div>
                </div>
                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Revenue</span>
                  <div className="text-xl font-black text-emerald-600 mt-1">
                    ₹{totalRevenue.toLocaleString('en-IN')}
                  </div>
                </div>
                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Pending</span>
                  <div className="text-xl font-black text-amber-500 mt-1">
                    {pendingApprovalsCount}
                  </div>
                </div>
                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Live Ads</span>
                  <div className="text-xl font-black text-purple-600 mt-1">
                    {ads.filter((a) => a.status === 'published').length}
                  </div>
                </div>
              </div>

              {/* QUICK FILTER: PENDING APPROVAL LISTINGS (super admin can jump straight to providers awaiting review) */}
              <button
                type="button"
                onClick={() => {
                  setModerationFilter('pending_approval');
                  setActiveSection('listings_venues');
                }}
                className="flex w-full items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-left transition hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/40 dark:hover:bg-amber-950/60"
              >
                <span className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-400 text-slate-950">
                    <Clock className="h-4 w-4" />
                  </span>
                  <span>
                    <span className="block text-[13px] font-black text-slate-900 dark:text-white">Pending Approval — Filter listings</span>
                    <span className="block text-[11px] text-slate-600 dark:text-slate-300">Show only new service-provider listings awaiting super-admin review</span>
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="rounded-full bg-amber-500 px-2.5 py-0.5 text-[11px] font-black text-white">{pendingApprovalsCount}</span>
                  <span className="text-[16px] font-black text-amber-700 dark:text-amber-300">→</span>
                </span>
              </button>

              {/* HOME PAGE VISIBILITY — POPULAR CATEGORIES PER CITY */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-[13px] font-black text-slate-900 dark:text-white">Popular Categories visibility</h4>
                    <p className="text-[11px] text-slate-500">Toggle the home-page “Popular Categories” strip per city. Hyderabad is hidden by default.</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-600 dark:bg-slate-800 dark:text-slate-300">Home page</span>
                </div>
                <div className="mt-3 space-y-1.5">
                  {['Hyderabad', 'Bengaluru', 'Visakhapatnam', 'Vijayawada', 'Mumbai', 'Chennai'].map((city) => {
                    const visible = isPopularCategoriesVisible(city);
                    return (
                      <div key={city} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-700">
                        <span className="flex items-center gap-2 text-[12px] font-bold text-slate-800 dark:text-slate-100">
                          <MapPin className="h-3.5 w-3.5 text-[#7C3AED]" />
                          {city}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-black ${visible ? 'text-emerald-600' : 'text-rose-500'}`}>{visible ? 'VISIBLE' : 'HIDDEN'}</span>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={visible}
                            aria-label={`Toggle Popular Categories for ${city}`}
                            disabled={visibilitySaving}
                            onClick={() => {
                              setVisibilitySaving(true);
                              void setPopularCategoriesVisible(city, !visible).then((result) => {
                                if (result === 'failed') {
                                  showAdminNotification('Could not publish home visibility. Sign in as Super Admin and retry.');
                                  return;
                                }
                                setHomeVisibilityVersion((v) => v + 1);
                                showAdminNotification(result === 'published'
                                  ? 'Home visibility published for all customers.'
                                  : 'Development preview saved on this device only.');
                              }).finally(() => setVisibilitySaving(false));
                            }}
                            className={`relative rounded-full transition ${visible ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`}
                            style={{ height: 18, width: 32 }}
                          >
                            <span className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-all ${visible ? 'left-[15px]' : 'left-0.5'}`} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* SECTION STYLE SELECTOR — admin chooses which design each section opens with */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-[13px] font-black text-slate-900 dark:text-white">BookOurSpace section display styles</h4>
                    <p className="text-[11px] text-slate-500">Choose which design each section opens with. Applies to every visitor.</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-600 dark:bg-slate-800 dark:text-slate-300">Layout</span>
                </div>
                <div className="mt-3 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-700">
                    <span className="text-[12px] font-bold text-slate-800 dark:text-slate-100">BookOurSpace PG</span>
                    <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
                          {[['style1', 'Style 1'], ['style2', 'Style 2'], ['style3', 'Style 3']].map(([val, label]) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => {
                            const next = { ...sectionStyles, pg: val as SectionStyles['pg'] };
                            void commitSectionStyles(next);
                          }}
                          className={`rounded-md px-2.5 py-1 text-[11px] font-bold ${sectionStyles.pg === val ? 'bg-[#7c3aed] text-white' : 'text-slate-600 dark:text-slate-300'}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-700">
                    <span className="text-[12px] font-bold text-slate-800 dark:text-slate-100">BookOurSpace Stay</span>
                    <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
                          {[['old', 'Style 1'], ['airbnb', 'Style 2'], ['style3', 'Style 3']].map(([val, label]) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => {
                            const next = { ...sectionStyles, stay: val as SectionStyles['stay'] };
                            void commitSectionStyles(next);
                          }}
                          className={`rounded-md px-2.5 py-1 text-[11px] font-bold ${sectionStyles.stay === val ? 'bg-[#7c3aed] text-white' : 'text-slate-600 dark:text-slate-300'}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-700">
                    <span className="text-[12px] font-bold text-slate-800 dark:text-slate-100">BookOurSpace Services</span>
                    <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
                          {[['old', 'Style 1'], ['triangle', 'Style 2'], ['noddyy', 'Style 3']].map(([val, label]) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => {
                            const next = { ...sectionStyles, services: val as SectionStyles['services'] };
                            void commitSectionStyles(next);
                          }}
                          className={`rounded-md px-2.5 py-1 text-[11px] font-bold ${sectionStyles.services === val ? 'bg-[#7c3aed] text-white' : 'text-slate-600 dark:text-slate-300'}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-700">
                    <span className="text-[12px] font-bold text-slate-800 dark:text-slate-100">BookOurSpace Classes</span>
                    <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
                          {[['cards', 'Style 1'], ['timetable', 'Style 2'], ['style3', 'Style 3']].map(([val, label]) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => {
                            const next = { ...sectionStyles, classes: val as SectionStyles['classes'] };
                            void commitSectionStyles(next).then((result) => {
                              if (result === 'published') logAction('Content Management', `BookOurSpace Classes style: ${label}`, 'Updated the BookOurSpace Classes discovery style', 'published');
                            });
                          }}
                          className={`rounded-md px-2.5 py-1 text-[11px] font-bold ${sectionStyles.classes === val ? 'bg-[#7c3aed] text-white' : 'text-slate-600 dark:text-slate-300'}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-700">
                    <span className="text-[12px] font-bold text-slate-800 dark:text-slate-100">BookOurSpace Venues</span>
                    <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
                          {[['showcase', 'Style 1'], ['agenda', 'Style 2'], ['style3', 'Style 3']].map(([val, label]) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => {
                            const next = { ...sectionStyles, venues: val as SectionStyles['venues'] };
                            void commitSectionStyles(next).then((result) => {
                              if (result === 'published') logAction('Content Management', `BookOurSpace Venues style: ${label}`, 'Updated the BookOurSpace Venues discovery style', 'published');
                            });
                          }}
                          className={`rounded-md px-2.5 py-1 text-[11px] font-bold ${sectionStyles.venues === val ? 'bg-[#7c3aed] text-white' : 'text-slate-600 dark:text-slate-300'}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-700">
                    <span className="text-[12px] font-bold text-slate-800 dark:text-slate-100">BookOurSpace Movies</span>
                    <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
                      {[['experience', 'Style 1'], ['classic', 'Style 2'], ['style3', 'Style 3']].map(([val, label]) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => {
                            const next = { ...sectionStyles, movies: val as SectionStyles['movies'] };
                            void commitSectionStyles(next);
                          }}
                          className={`rounded-md px-2.5 py-1 text-[11px] font-bold ${sectionStyles.movies === val ? 'bg-[#7c3aed] text-white' : 'text-slate-600 dark:text-slate-300'}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>


                  </div>
                </div>
              </div>

              {/* Quick Toggle Card: Search Results & Date-Range Availability Filter (Present: Disabled) */}
              {(() => {
                const dateFilterTpl = modularTemplates.find(
                  (m) => m.id === 'search_date_range_filter'
                );
                const isDateFilterEnabled = dateFilterTpl ? dateFilterTpl.enabled : false;
                return (
                  <div className="bg-white dark:bg-slate-900 rounded-3xl border-2 border-purple-200 dark:border-purple-900/60 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-purple-100 dark:bg-purple-950/70 text-[#4A148C] dark:text-purple-300 flex items-center justify-center shrink-0">
                        <Calendar className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-black text-sm text-slate-900 dark:text-white">
                            Search Results & Date-Range Availability Filter
                          </h4>
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                              isDateFilterEnabled
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                            }`}
                          >
                            {isDateFilterEnabled ? 'ENABLED ON HOME' : 'PRESENT: DISABLED'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Controls whether the "Search Results & Date-Range Availability Filter" bar is displayed on the public Marketplace view.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const updated = modularTemplates.map((m) =>
                          m.id === 'search_date_range_filter'
                            ? { ...m, enabled: !isDateFilterEnabled }
                            : m
                        );
                        setModularTemplates(updated);
                        saveModularTemplates(updated);
                        logAction(
                          'Feature Management',
                          !isDateFilterEnabled
                            ? 'Enabled Search Results & Date-Range Filter'
                            : 'Disabled Search Results & Date-Range Filter',
                          `Set "Search Results & Date-Range Availability Filter" to ${
                            !isDateFilterEnabled ? 'ENABLED' : 'DISABLED'
                          }`,
                          'published'
                        );
                        showAdminNotification(
                          `📅 Search Results & Date-Range Availability Filter is now ${
                            !isDateFilterEnabled ? 'ENABLED' : 'DISABLED'
                          }!`
                        );
                      }}
                      className={`px-4 py-2 rounded-xl text-xs font-black shrink-0 cursor-pointer transition ${
                        isDateFilterEnabled
                          ? 'bg-rose-600 hover:bg-rose-700 text-white'
                          : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      }`}
                    >
                      {isDateFilterEnabled ? 'Disable on Home Page' : 'Enable on Home Page'}
                    </button>
                  </div>
                );
              })()}

              {/* Pending Provider Registration Approvals */}
              {pendingListings.length > 0 && (
                <div className="bg-amber-50 dark:bg-amber-950/30 border-2 border-amber-400 dark:border-amber-600 rounded-3xl p-4 sm:p-5 space-y-3">
                  <h3 className="text-base font-black text-slate-900 dark:text-white">
                    ⏳ Pending Provider Registration Requests ({pendingListings.length})
                  </h3>
                  {pendingListings.map((req) => (
                    <div
                      key={req.id}
                      className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-amber-300 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div>
                        <h4 className="font-black text-sm">{req.title}</h4>
                        <p className="text-xs text-slate-500">
                          Provider: {req.providerName} ({req.providerPhone}) • ₹{req.price}{' '}
                          {req.priceUnit}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleApproveProviderRequest(req, true)}
                          className="px-3.5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black cursor-pointer"
                        >
                          ✅ Approve & Display in Application
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRejectProviderRequest(req)}
                          className="px-3 py-2 rounded-xl bg-rose-100 text-rose-700 text-xs font-black cursor-pointer"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Recent Audit Activity Table */}
              <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 space-y-3">
                <h3 className="font-black text-sm flex items-center gap-2">
                  <History className="w-4 h-4 text-indigo-600" />
                  <span>Recent Admin Activity & Audit Trail</span>
                </h3>
                <div className="space-y-2">
                  {auditLogs.slice(0, 6).map((log) => (
                    <div
                      key={log.id}
                      className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800 flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-black text-indigo-600 dark:text-indigo-400">
                          [{log.section}]
                        </span>{' '}
                        <strong className="text-slate-900 dark:text-white">
                          {log.action}
                        </strong>{' '}
                        — <span className="text-slate-600 dark:text-slate-300">{log.details}</span>
                      </div>
                      <div className="text-[10px] text-slate-400 shrink-0 ml-2">
                        {log.actorName} • {log.timestamp}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* =====================================================================
              SECTION 5: CONTENT MANAGEMENT (44 Categories, Subcategories, Banners, Homepage Sections, Theme)
             ===================================================================== */}
          {activeSection === 'content_management' && (
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-4 sm:p-6 shadow-xs space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-purple-600">
                    Section 05 • Catalog, Banners & UI Theme
                  </span>
                  <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
                    Content Management (Categories, Subcategories, Banners & Theme)
                  </h3>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {[
                    { id: 'categories', label: `Categories (${categories.length})` },
                    { id: 'banners', label: 'Homepage Banners' },
                    { id: 'homepage_labels', label: 'Sections & Labels' },
                    { id: 'media_theme', label: 'Media & Theme' },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setContentSubTab(tab.id as any)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-extrabold cursor-pointer ${
                        contentSubTab === tab.id
                          ? 'bg-[#4338CA] text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {contentSubTab === 'categories' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                  <div className="lg:col-span-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black">
                        All Categories ({categories.length})
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsAddingCategory(true)}
                        className="px-2.5 py-1.5 rounded-xl bg-purple-600 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Category</span>
                      </button>
                    </div>
                    <input
                      type="text"
                      value={catSearch}
                      onChange={(e) => setCatSearch(e.target.value)}
                      placeholder="Search category or subcategory..."
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                    />
                    <div className="space-y-1.5 max-h-[420px] overflow-y-auto no-scrollbar">
                      {filteredCategories.map((cat) => (
                        <div
                          key={cat.id}
                          onClick={() => setSelectedCatId(cat.id)}
                          className={`p-3 rounded-2xl border cursor-pointer flex items-center justify-between ${
                            selectedCatId === cat.id
                              ? 'border-purple-600 bg-purple-50 dark:bg-purple-950/50'
                              : 'border-slate-200 dark:border-slate-800'
                          }`}
                        >
                          <div className="min-w-0 pr-2">
                            <div className="font-bold text-xs truncate">
                              {cat.name}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {cat.subcategories.length} subcategories ·{' '}
                              {cat.customFields.length} fields
                            </div>
                          </div>
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800">
                            {cat.entityType}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="lg:col-span-7 space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                      <div>
                        <h4 className="font-black text-base">
                          {activeCategory.name}
                        </h4>
                        <p className="text-xs text-slate-400">
                          {activeCategory.description}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          requestSensitiveConfirmation(
                            `Delete Category "${activeCategory.name}"?`,
                            `Deleting "${activeCategory.name}" will remove it from the catalog.`,
                            'Delete Category',
                            () => {
                              deleteCategory(activeCategory.id);
                              logAction(
                                'Content Management',
                                'Deleted Category',
                                `Deleted category "${activeCategory.name}"`,
                                'sensitive_confirmed'
                              );
                            },
                            true
                          )
                        }
                        className="p-2 text-rose-500 hover:bg-rose-50 rounded-xl cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Subcategories — admin can enable/disable each from here */}
                    <div className="space-y-2 bg-slate-50 dark:bg-slate-800/40 p-3.5 rounded-2xl">
                      <div className="flex items-center justify-between gap-2">
                        <label className="text-xs font-bold block">
                          Subcategories ({activeCategory.subcategories.length})
                        </label>
                        <span className="text-[10px] font-black text-emerald-700 dark:text-emerald-400">
                          {activeCategory.subcategories.filter((s) => !(activeCategory.disabledSubcategories ?? []).includes(s)).length}/{activeCategory.subcategories.length} enabled
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">
                        Toggle a subcategory off to hide it from the public marketplace.
                      </p>
                      <div className="space-y-1.5">
                        {activeCategory.subcategories.map((sub, i) => {
                          const enabled = isSubcategoryEnabled(sub);
                          return (
                            <div
                              key={`${sub}-${i}`}
                              className={`flex items-center justify-between gap-2 rounded-xl border px-2.5 py-1.5 transition ${
                                enabled
                                  ? 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-800 dark:bg-emerald-950/30'
                                  : 'border-slate-200 bg-white opacity-70 dark:border-slate-700 dark:bg-slate-900'
                              }`}
                            >
                              <span className={`min-w-0 truncate text-[11.5px] font-semibold ${enabled ? 'text-slate-800 dark:text-slate-100' : 'text-slate-400 line-through'}`}>
                                {sub}
                              </span>
                              <div className="flex shrink-0 items-center gap-1.5">
                                <button
                                  type="button"
                                  role="switch"
                                  aria-checked={enabled}
                                  aria-label={`${enabled ? 'Disable' : 'Enable'} ${sub}`}
                                  disabled={visibilitySaving}
                                  onClick={() => {
                                    setVisibilitySaving(true);
                                    void setSubcategoryEnabled(sub, !enabled).then((result) => {
                                      if (result === 'failed') {
                                        showAdminNotification('Could not publish category visibility. Sign in as Super Admin and retry.');
                                        return;
                                      }
                                      setHomeVisibilityVersion((v) => v + 1);
                                      showAdminNotification(result === 'published'
                                        ? 'Category visibility published for all customers.'
                                        : 'Development preview saved on this device only.');
                                    }).finally(() => setVisibilitySaving(false));
                                  }}
                                  className={`relative rounded-full transition ${enabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`}
                                  style={{ height: 18, width: 32 }}
                                >
                                  <span className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-all ${enabled ? 'left-[15px]' : 'left-0.5'}`} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteSubcategory(sub)}
                                  className="text-slate-400 hover:text-rose-500 cursor-pointer"
                                  aria-label={`Delete ${sub}`}
                                >
                                  ×
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <form
                        onSubmit={handleAddSubcategory}
                        className="flex items-center gap-2 pt-2"
                      >
                        <input
                          type="text"
                          value={newSubcategoryInput}
                          onChange={(e) =>
                            setNewSubcategoryInput(e.target.value)
                          }
                          placeholder="Add new subcategory..."
                          className="flex-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs"
                        />
                        <button
                          type="submit"
                          className="px-3 py-1.5 rounded-xl bg-purple-600 text-white text-xs font-bold cursor-pointer"
                        >
                          + Add
                        </button>
                      </form>
                    </div>

                    {/* Custom Fields */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black">
                          Dynamic Custom Fields ({activeCategory.customFields.length})
                        </span>
                        <button
                          type="button"
                          onClick={() => setIsAddingField(!isAddingField)}
                          className="px-2.5 py-1 rounded-xl bg-purple-600 text-white text-xs font-bold cursor-pointer"
                        >
                          + Add Field
                        </button>
                      </div>
                      {isAddingField && (
                        <form
                          onSubmit={handleCreateCustomField}
                          className="p-3 rounded-2xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 space-y-2 text-xs"
                        >
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              type="text"
                              required
                              value={fieldLabel}
                              onChange={(e) => {
                                setFieldLabel(e.target.value);
                                setFieldKey(
                                  e.target.value.toLowerCase().replace(/\s+/g, '_')
                                );
                              }}
                              placeholder="Field Label *"
                              className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border"
                            />
                            <select
                              value={fieldType}
                              onChange={(e) => setFieldType(e.target.value)}
                              className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border"
                            >
                              <option value="text">Text</option>
                              <option value="number">Number</option>
                              <option value="select">Select</option>
                              <option value="boolean">Checkbox</option>
                            </select>
                          </div>
                          <button
                            type="submit"
                            className="px-3 py-1.5 rounded-lg bg-purple-600 text-white font-bold cursor-pointer"
                          >
                            Save Field
                          </button>
                        </form>
                      )}
                      {activeCategory.customFields.map((f) => (
                        <div
                          key={f.id}
                          className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs"
                        >
                          <span>
                            <strong>{f.label}</strong> ({f.type})
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              deleteCustomFieldFromCategory(
                                activeCategory.id,
                                f.id
                              )
                            }
                            className="text-rose-500 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {contentSubTab === 'banners' && (
                <div className="space-y-4 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 bg-slate-50 dark:bg-slate-800/50 p-3.5 rounded-2xl">
                    <input
                      type="text"
                      value={newBannerTitle}
                      onChange={(e) => setNewBannerTitle(e.target.value)}
                      placeholder="Banner Title..."
                      className="px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                    />
                    <input
                      type="text"
                      value={newBannerSubtitle}
                      onChange={(e) => setNewBannerSubtitle(e.target.value)}
                      placeholder="Banner Subtitle..."
                      className="px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (!newBannerTitle.trim()) return;
                        const next: AdminContentSettings = {
                          ...contentSettings,
                          banners: [
                            {
                              id: `BNR-${Date.now()}`,
                              title: newBannerTitle.trim(),
                              subtitle:
                                newBannerSubtitle.trim() ||
                                'Verified marketplace spotlight offer.',
                              ctaLabel: 'Explore Now',
                              targetSection: newBannerSection,
                              imageUrl:
                                'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1000&q=80',
                              active: true,
                              publishState: 'published',
                            },
                            ...contentSettings.banners,
                          ],
                        };
                        setContentSettings(next);
                        saveAdminContentSettings(next);
                        logAction(
                          'Content Management',
                          'Published Homepage Banner',
                          `Published banner "${newBannerTitle.trim()}"`,
                          'published'
                        );
                        setNewBannerTitle('');
                        setNewBannerSubtitle('');
                        showAdminNotification(
                          '✅ Banner published to live Marketplace!'
                        );
                      }}
                      className="px-4 py-2 rounded-xl bg-[#4338CA] text-white font-black cursor-pointer"
                    >
                      + Add & Publish Banner
                    </button>
                  </div>

                  {contentSettings.banners.map((b) => (
                    <div
                      key={b.id}
                      className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3"
                    >
                      <div>
                        <div className="font-black text-sm">{b.title}</div>
                        <div className="text-slate-500">{b.subtitle}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const next: AdminContentSettings = {
                            ...contentSettings,
                            banners: contentSettings.banners.map((item) =>
                              item.id === b.id
                                ? { ...item, active: !item.active }
                                : item
                            ),
                          };
                          setContentSettings(next);
                          saveAdminContentSettings(next);
                          logAction(
                            'Content Management',
                            b.active ? 'Disabled Banner' : 'Enabled Banner',
                            `Toggled banner "${b.title}"`,
                            'published'
                          );
                        }}
                        className={`px-3 py-1.5 rounded-xl font-bold cursor-pointer ${
                          b.active
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {b.active ? 'Live ON' : 'Hidden OFF'}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {contentSubTab === 'homepage_labels' && (
                <div className="space-y-4 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {(
                      [
                        ['showSponsoredAds', 'Show Sponsored Ad Campaigns in Feed'],
                        ['showFeaturedSpotlight', 'Show Featured Spotlight Listings'],
                        ['showRecentlyViewed', 'Show Recently Viewed Carousel'],
                        ['showCustomAdminFields', 'Show Zero-Code Admin Custom Widgets'],
                      ] as const
                    ).map(([key, label]) => (
                      <label
                        key={key}
                        className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center justify-between font-bold cursor-pointer"
                      >
                        <span>{label}</span>
                        <input
                          type="checkbox"
                          checked={contentSettings.homepageSections[key]}
                          onChange={(e) => {
                            const next: AdminContentSettings = {
                              ...contentSettings,
                              homepageSections: {
                                ...contentSettings.homepageSections,
                                [key]: e.target.checked,
                              },
                            };
                            setContentSettings(next);
                            saveAdminContentSettings(next);
                            logAction(
                              'Content Management',
                              'Updated Homepage Section Visibility',
                              `Set ${key} = ${e.target.checked}`,
                              'published'
                            );
                          }}
                          className="w-4 h-4 rounded text-indigo-600"
                        />
                      </label>
                    ))}
                  </div>
                  {/* Independent 6-Section Visibility Control: Spotlight Subcategories (స్పాట్లైట్ సబ్-కేటగిరీలు) */}
                  <div className="p-4 rounded-2xl border-2 border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/40 dark:bg-indigo-950/20 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-black text-slate-900 dark:text-white text-xs sm:text-sm">
                            🌟 స్పాట్లైట్ సబ్-కేటగిరీలు (Spotlight Subcategories) — Per-Section Visibility
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-100 text-indigo-900 border border-indigo-300 dark:bg-indigo-900/60 dark:text-indigo-200 dark:border-indigo-700">
                            {Object.values(spotlightModuleMap).filter(Boolean).length} / 6 Sections Enabled
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Toggle Spotlight Subcategories visibility independently for each of the 6 marketplace sections (PGs, Classes, Venues, Services, Hotels, Movies):
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            const next = saveSpotlightSubcategoriesModuleMap(true);
                            setSpotlightModuleMap(next);
                            setModularTemplates(loadModularTemplates());
                            logAction(
                              'Content Management',
                              'Enabled Spotlight Subcategories (All 6 Sections)',
                              'Enabled Spotlight Subcategories across PGs, Classes, Venues, Services, Hotels & Movies',
                              'published'
                            );
                            showAdminNotification('🌟 Spotlight Subcategories ENABLED for all 6 sections!');
                          }}
                          className="px-2.5 py-1.5 rounded-xl text-[11px] font-black bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                        >
                          Enable All 6
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const next = saveSpotlightSubcategoriesModuleMap(false);
                            setSpotlightModuleMap(next);
                            setModularTemplates(loadModularTemplates());
                            logAction(
                              'Content Management',
                              'Disabled Spotlight Subcategories (All 6 Sections)',
                              'Disabled Spotlight Subcategories across PGs, Classes, Venues, Services, Hotels & Movies',
                              'published'
                            );
                            showAdminNotification('🌟 Spotlight Subcategories DISABLED for all 6 sections!');
                          }}
                          className="px-2.5 py-1.5 rounded-xl text-[11px] font-black bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-700 dark:text-slate-200 cursor-pointer"
                        >
                          Disable All 6
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                      {ALL_SIX_MARKET_MODULES.map((mod) => {
                        const isEnabled = Boolean(spotlightModuleMap[mod.id]);
                        return (
                          <button
                            key={mod.id}
                            type="button"
                            onClick={() => {
                              const next = toggleSpotlightSubcategoriesForSection(mod.id);
                              setSpotlightModuleMap(next);
                              setModularTemplates(loadModularTemplates());
                              logAction(
                                'Content Management',
                                `${next[mod.id] ? 'Enabled' : 'Disabled'} Spotlight Subcategories (${mod.shortLabel})`,
                                `Toggled Spotlight Subcategories for ${mod.label} to ${next[mod.id] ? 'ON' : 'OFF'}`,
                                'published'
                              );
                              showAdminNotification(
                                `🌟 ${mod.emoji} ${mod.label}: Spotlight Subcategories ${next[mod.id] ? 'ENABLED (ON)' : 'DISABLED (OFF)'}`
                              );
                            }}
                            className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between gap-2 cursor-pointer ${
                              isEnabled
                                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-400 dark:border-emerald-700 shadow-2xs'
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-indigo-300'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-base">{mod.emoji}</span>
                              <span
                                className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                                  isEnabled
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                                }`}
                              >
                                {isEnabled ? 'ON' : 'OFF'}
                              </span>
                            </div>
                            <div>
                              <div className="font-black text-slate-900 dark:text-white text-[11px] leading-tight">
                                {mod.shortLabel}
                              </div>
                              <div className="text-[10px] text-slate-500 truncate">
                                {mod.label}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Independent 6-Section Visibility Control: Search Date-Range Filter */}
                  <div className="p-4 rounded-2xl border-2 border-purple-200 dark:border-purple-900/60 bg-purple-50/40 dark:bg-purple-950/20 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-black text-slate-900 dark:text-white text-xs sm:text-sm">
                            📅 Search Results & Date-Range Availability Filter — Per-Section Visibility
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-100 text-purple-900 border border-purple-300 dark:bg-purple-900/60 dark:text-purple-200 dark:border-purple-700">
                            {Object.values(dateRangeModuleMap).filter(Boolean).length} / 6 Sections Enabled
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Toggle Search Date-Range Filter visibility independently for each of the 6 marketplace sections (PGs, Classes, Venues, Services, Hotels, Movies):
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            const next = saveSearchDateRangeModuleMap(true);
                            setDateRangeModuleMap(next);
                            setModularTemplates(loadModularTemplates());
                            logAction(
                              'Content Management',
                              'Enabled Search Date-Range Filter (All 6 Sections)',
                              'Enabled Search Date-Range Filter across PGs, Classes, Venues, Services, Hotels & Movies',
                              'published'
                            );
                            showAdminNotification('📅 Search Date-Range Filter ENABLED for all 6 sections!');
                          }}
                          className="px-2.5 py-1.5 rounded-xl text-[11px] font-black bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                        >
                          Enable All 6
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const next = saveSearchDateRangeModuleMap(false);
                            setDateRangeModuleMap(next);
                            setModularTemplates(loadModularTemplates());
                            logAction(
                              'Content Management',
                              'Disabled Search Date-Range Filter (All 6 Sections)',
                              'Disabled Search Date-Range Filter across PGs, Classes, Venues, Services, Hotels & Movies',
                              'published'
                            );
                            showAdminNotification('📅 Search Date-Range Filter DISABLED for all 6 sections!');
                          }}
                          className="px-2.5 py-1.5 rounded-xl text-[11px] font-black bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-700 dark:text-slate-200 cursor-pointer"
                        >
                          Disable All 6
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                      {ALL_SIX_MARKET_MODULES.map((mod) => {
                        const isEnabled = Boolean(dateRangeModuleMap[mod.id]);
                        return (
                          <button
                            key={mod.id}
                            type="button"
                            onClick={() => {
                              const next = toggleSearchDateRangeForSection(mod.id);
                              setDateRangeModuleMap(next);
                              setModularTemplates(loadModularTemplates());
                              logAction(
                                'Content Management',
                                `${next[mod.id] ? 'Enabled' : 'Disabled'} Search Date-Range Filter (${mod.shortLabel})`,
                                `Toggled Search Date-Range Filter for ${mod.label} to ${next[mod.id] ? 'ON' : 'OFF'}`,
                                'published'
                              );
                              showAdminNotification(
                                `📅 ${mod.emoji} ${mod.label}: Search Date-Range Filter ${next[mod.id] ? 'ENABLED (ON)' : 'DISABLED (OFF)'}`
                              );
                            }}
                            className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between gap-2 cursor-pointer ${
                              isEnabled
                                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-400 dark:border-emerald-700 shadow-2xs'
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-purple-300'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-base">{mod.emoji}</span>
                              <span
                                className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                                  isEnabled
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                                }`}
                              >
                                {isEnabled ? 'ON' : 'OFF'}
                              </span>
                            </div>
                            <div>
                              <div className="font-black text-slate-900 dark:text-white text-[11px] leading-tight">
                                {mod.shortLabel}
                              </div>
                              <div className="text-[10px] text-slate-500 truncate">
                                {mod.label}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Home Screen Utility Strips Visibility (Hidden by Default — Display Only When Admin Enables) */}
                  <div className="p-4 rounded-2xl border-2 border-amber-200 dark:border-amber-900/60 bg-amber-50/40 dark:bg-amber-950/20 space-y-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-black text-slate-900 dark:text-white text-xs sm:text-sm">
                          🛠️ Home Screen Utility Strips & Developer Bars (Optional — Hidden by Default)
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        These bars are hidden on the customer Home Screen by default. Enable any strip below to display it on the Home Screen:
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      {[
                        {
                          id: 'quick_action_pills_bar',
                          icon: '⚡',
                          title: 'Quick Action Pills Row',
                          subtitle:
                            'Sign In / Account, My Favorites, Wallet & Ledger, Support, Refer & Earn ₹500, Help Centre, Universal Object Editor, Pass Verifier, Alerts',
                        },
                        {
                          id: 'independent_modules_bar',
                          icon: '⚙️',
                          title: 'Zero-Dependency Independent Modules Bar',
                          subtitle:
                            'Isolated State • No Cross-Module Dependency • Independent Modules & Templates • No-Code Builder',
                        },
                        {
                          id: 'active_filter_status_strip',
                          icon: '🏷️',
                          title: 'Active Filter Status Strip',
                          subtitle:
                            'Displays "Active Filter: Madhapur" chips and "Clear All" button above the feed',
                        },
                        {
                          id: 'category_rail_stream_explorer',
                          icon: '🛤️',
                          title: 'The Category Rail & Stream Explorer Layout',
                          subtitle:
                            'Blinkit / Flipkart / Zepto style split Left Category Rail + Right Stream Explorer (Disabled by default; enable when required)',
                        },
                      ].map((item) => {
                        const tplObj = modularTemplates.find((m) => m.id === item.id);
                        const isEnabled = Boolean(tplObj?.enabled);
                        return (
                          <div
                            key={item.id}
                            className={`p-3 rounded-xl border flex flex-col justify-between gap-2.5 ${
                              isEnabled
                                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-400 dark:border-emerald-700'
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                            }`}
                          >
                            <div className="space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-black text-slate-900 dark:text-white text-xs flex items-center gap-1.5">
                                  <span>{item.icon}</span>
                                  <span>{item.title}</span>
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                                    isEnabled
                                      ? 'bg-emerald-600 text-white'
                                      : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                                  }`}
                                >
                                  {isEnabled ? 'ON' : 'OFF'}
                                </span>
                              </div>
                              <p className="text-[10px] text-slate-500 leading-relaxed">
                                {item.subtitle}
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                const nextEnabled = !isEnabled;
                                const updated = modularTemplates.map((m) =>
                                  m.id === item.id ? { ...m, enabled: nextEnabled } : m
                                );
                                setModularTemplates(updated);
                                saveModularTemplates(updated);
                                logAction(
                                  'Content Management',
                                  `${nextEnabled ? 'Enabled' : 'Disabled'} ${item.title}`,
                                  `Set "${item.title}" visibility to ${nextEnabled ? 'ON' : 'OFF'}`,
                                  'published'
                                );
                                showAdminNotification(
                                  `${item.icon} "${item.title}" is now ${
                                    nextEnabled ? 'DISPLAYED (ON)' : 'HIDDEN (OFF)'
                                  } on the Home Screen!`
                                );
                              }}
                              className={`w-full py-1.5 px-3 rounded-xl text-[11px] font-black transition cursor-pointer ${
                                isEnabled
                                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                  : 'bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 text-slate-700 dark:text-slate-200'
                              }`}
                            >
                              {isEnabled ? '✓ Enabled (Click to Hide)' : 'Enable on Home Screen'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {contentSubTab === 'media_theme' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  {contentSettings.mediaLibrary.map((m) => (
                    <div
                      key={m.id}
                      className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2"
                    >
                      <SafeImage category="general"
                        src={m.url}
                        alt={m.title}
                        className="w-full h-28 object-cover rounded-xl bg-slate-100"
                      />
                      <div className="font-black">{m.title}</div>
                      <div className="text-[10px] text-slate-400">
                        {m.category} • {m.uploadedAt}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* =====================================================================
              SECTION 6: LISTINGS & VENUES (Approvals, Edits, Reports, Featured, Venue Status)
             ===================================================================== */}
          {/* =====================================================================
              SECTION 6b: PGs & HOSTELS (reservations, money, disputes, invoices)
             ===================================================================== */}
          {activeSection === 'pg_hostels' && (
            <div className="space-y-5">
              <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-4 sm:p-6 shadow-xs">
                <span className="text-[10px] font-black uppercase tracking-wider text-violet-600">
                  Section 06b • PG &amp; Hostel Operations
                </span>
                <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
                  PGs &amp; Hostels (reservations, payments, disputes &amp; invoices)
                </h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Reservations, money and disputes are read from PostgreSQL. Every money action is decided by the
                  server and needs a super administrator session.
                </p>
              </div>
              <PgAdminWorkspace />
            </div>
          )}

          {activeSection === 'listings_venues' && (
            <div className="space-y-5">
              <AdminStayInventory />
              <AdminMarketplaceListings />
              <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-4 sm:p-6 shadow-xs space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-amber-600">
                    Section 06 • Listings & Venue Operations
                  </span>
                  <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
                    Listings & Venues (Approvals, Edits, Reports, Featured & Venue Status)
                  </h3>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  {[
                    { id: 'all', label: `All (${listings.length})` },
                    { id: 'pending_approval', label: `Pending (${pendingApprovalsCount})` },
                    { id: 'active', label: 'Active Live' },
                    { id: 'reported', label: `Reported (${reportedListings.length})` },
                  ].map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setModerationFilter(f.id as any)}
                      className={`px-3 py-1.5 rounded-xl font-bold cursor-pointer ${
                        moderationFilter === f.id
                          ? 'bg-[#4338CA] text-white'
                          : 'bg-slate-100 dark:bg-slate-800'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                {filteredModerationListings.slice(0, 25).map((listing) => {
                  const isEditingThis = editingListingId === listing.id;
                  return (
                    <div
                      key={listing.id}
                      className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <SafeImage category="general"
                          src={listing.images[0]}
                          alt={listing.title}
                          className="w-16 h-16 rounded-xl object-cover shrink-0 bg-slate-100"
                        />
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${
                                listing.status === 'active'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : listing.status === 'pending_approval'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {listing.status}
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                              Inventory status is not configured
                            </span>
                            {listing.reported && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800">
                                Reported: {listing.reportReason || 'Flagged'}
                              </span>
                            )}
                          </div>

                          {isEditingThis ? (
                            <div className="flex flex-wrap items-center gap-2 pt-1">
                              <input
                                type="text"
                                value={editListingTitle}
                                onChange={(e) =>
                                  setEditListingTitle(e.target.value)
                                }
                                className="px-2.5 py-1 rounded-lg border text-xs font-bold"
                              />
                              <input
                                type="number"
                                value={editListingPrice}
                                onChange={(e) =>
                                  setEditListingPrice(e.target.value)
                                }
                                className="w-24 px-2.5 py-1 rounded-lg border text-xs font-bold"
                              />
                              <button
                                type="button"
                                onClick={async () => {
                                  const updates = {
                                    title: editListingTitle.trim() || listing.title,
                                    price:
                                      Number(editListingPrice) || listing.price,
                                  };
                                  const saved = await persistAdminListingPatch(
                                    listing,
                                    updates,
                                    'Listing details saved to Supabase.'
                                  );
                                  if (!saved) return;
                                  logAction(
                                    'Listings & Venues',
                                    'Edited Listing Details',
                                    `Updated "${editListingTitle}" (₹${editListingPrice})`,
                                    'published'
                                  );
                                  setEditingListingId(null);
                                }}
                                className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-xs font-bold cursor-pointer"
                              >
                                Save
                              </button>
                            </div>
                          ) : (
                            <h4 className="font-black text-sm truncate">
                              {listing.title}
                            </h4>
                          )}

                          <div className="text-[11px] text-slate-500">
                            By {listing.providerName} (📞 {listing.providerPhone}) • ₹
                            {listing.price.toLocaleString('en-IN')} {listing.priceUnit}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingListingId(listing.id);
                            setEditListingTitle(listing.title);
                            setEditListingPrice(String(listing.price));
                          }}
                          className="px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold cursor-pointer"
                        >
                          Edit
                        </button>

                        {listing.status === 'pending_approval' ? (
                          <button
                            type="button"
                            onClick={() =>
                              handleApproveProviderRequest(listing, true)
                            }
                            className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-black cursor-pointer"
                          >
                            Approve & Display
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={async () => {
                              const saved = await persistAdminListingPatch(
                                listing,
                                { isFeatured: !listing.isFeatured },
                                'Featured status saved to Supabase.'
                              );
                              if (!saved) return;
                              logAction(
                                'Listings & Venues',
                                'Toggled Featured Listing',
                                `Toggled Featured status for "${listing.title}"`,
                                'published'
                              );
                            }}
                            className={`px-2.5 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
                              listing.isFeatured
                                ? 'bg-amber-400 text-slate-950'
                                : 'bg-slate-100 dark:bg-slate-800'
                            }`}
                          >
                            {listing.isFeatured ? '★ Featured' : 'Feature'}
                          </button>
                        )}

                        {listing.reported && (
                          <button
                            type="button"
                            onClick={async () => {
                              await persistAdminListingPatch(
                                listing,
                                { reported: false, reportReason: undefined },
                                'Listing report cleared in Supabase.'
                              );
                            }}
                            className="px-2.5 py-1.5 rounded-xl bg-emerald-100 text-emerald-800 text-xs font-bold cursor-pointer"
                          >
                            Dismiss Report
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              </div>
            </div>
          )}

          {/* =====================================================================
              SECTION 7: BOOKINGS & EVENTS (Bookings, Cancellations, Disputes & Event Management)
             ===================================================================== */}
          {activeSection === 'bookings_events' && (
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-4 sm:p-6 shadow-xs space-y-5">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600">
                  Section 07 • Reservations, Disputes & Live Events
                </span>
                <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
                  Bookings, Cancellations, Disputes & Event Management
                </h3>
              </div>

              {/* Customer Bookings */}
              <div className="space-y-2">
                <h4 className="text-xs font-black uppercase text-slate-400">
                  Active & Recent Bookings ({bookings.length})
                </h4>
                {bookings.map((bk) => (
                  <div
                    key={bk.id}
                    className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-black text-sm">{bk.listingTitle}</div>
                      <div className="text-slate-500">
                        Customer: {bk.customerName} ({bk.customerPhone}) • Date:{' '}
                        {bk.scheduledDate} at {bk.timeSlot}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-black text-emerald-600">
                        ₹{bk.totalAmount.toLocaleString('en-IN')}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase">
                        {bk.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Disputes Queue */}
              <div className="space-y-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <h4 className="text-xs font-black uppercase text-slate-400">
                  Cancellations & Disputes Resolution ({disputes.length})
                </h4>
                {disputes.map((d) => (
                  <div
                    key={d.id}
                    className="p-3.5 rounded-2xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-amber-200 text-amber-950">
                        {d.issueType} • {d.status}
                      </span>
                      <div className="font-black text-sm mt-1">
                        {d.listingTitle} — ₹{d.amountInDispute}
                      </div>
                      <div className="text-slate-500">{d.description}</div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        disabled={!FINANCIAL_ADMIN_MUTATIONS_READY}
                        onClick={() => {
                          if (!FINANCIAL_ADMIN_MUTATIONS_READY) {
                            showAdminNotification('Refunding a dispute is disabled until an audited refund workflow is available.');
                            return;
                          }
                          const updated = disputes.map((item) =>
                            item.id === d.id
                              ? { ...item, status: 'resolved_refund' as const }
                              : item
                          );
                          setDisputes(updated);
                          saveAdminDisputes(updated);
                          logAction(
                            'Bookings & Events',
                            'Resolved Dispute with Refund',
                            `Resolved dispute ${d.id} for ${d.customerName}`,
                            'sensitive_confirmed'
                          );
                          showAdminNotification(
                            `✅ Dispute ${d.id} resolved with customer refund.`
                          );
                        }}
                        className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white font-bold cursor-not-allowed disabled:opacity-40"
                      >
                        Resolve & Refund
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Scheduled Venue & Movie Events */}
              <div className="space-y-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <h4 className="text-xs font-black uppercase text-slate-400">
                  Scheduled Venue, Movie & Class Events ({events.length})
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {events.map((ev) => (
                    <div
                      key={ev.id}
                      className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-1.5 text-xs"
                    >
                      <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 text-[10px] font-black uppercase">
                        {ev.status} • {ev.section}
                      </span>
                      <div className="font-black text-sm">{ev.title}</div>
                      <div className="text-slate-500 text-[11px]">
                        {ev.venueName}
                      </div>
                      <div className="text-[11px] font-bold text-emerald-600">
                        Tickets: {ev.ticketsBooked}/{ev.capacity} • ₹{ev.ticketPrice}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* =====================================================================
              SECTION 7B: ANALYTICS & PERFORMANCE MODULE (Recharts + D3.js Velocity)
             ===================================================================== */}
          {activeSection === 'analytics_performance' && (
            <AdminAnalyticsPerformanceModule
              users={users}
              listings={listings}
              bookings={bookings}
              transactions={transactions}
              paymentSettings={paymentSettings}
              onOpenBillingEngine={() => {
                setActiveSection('payment_management');
                setPaymentSubTab('automated_billing');
              }}
            />
          )}

          {/* =====================================================================
              SECTION 8: REPORTS & ANALYTICS (Date-Filtered, Role-Protected Views & Exports)
             ===================================================================== */}
          {activeSection === 'reports_analytics' && (
            <div className="space-y-6">
              <AdminAnalyticsPerformanceModule
                users={users}
                listings={listings}
                bookings={bookings}
                transactions={transactions}
                paymentSettings={paymentSettings}
                onOpenBillingEngine={() => {
                  setActiveSection('payment_management');
                  setPaymentSubTab('automated_billing');
                }}
              />
              <AdminReportsAnalyticsSection
                users={users}
                listings={listings}
                bookings={bookings}
                transactions={transactions}
                refunds={refunds}
                payouts={payouts}
                paymentSettings={paymentSettings}
                ads={ads}
                categories={categories}
                rolePerms={rolePerms}
                onToggleRoleViewReportsPermission={(role) =>
                  handleToggleRolePermission(role, 'canViewReports')
                }
                onLogAction={logAction}
                onNotify={showAdminNotification}
              />
            </div>
          )}

          {/* =====================================================================
              SECTION 8B: THEME MANAGEMENT (Colors, Logo, Light/Dark Mode, Preview & Publish)
             ===================================================================== */}
          {activeSection === 'theme_management' && (
            <AdminThemeManagementSection
              savedTheme={themeSettings}
              onUpdateSavedTheme={(nextTheme: AdminThemeSettings) =>
                setThemeSettings(nextTheme)
              }
              rolePerms={rolePerms}
              onToggleRoleManageThemePermission={(role) =>
                handleToggleRolePermission(role, 'canManageTheme')
              }
              onRequestConfirmation={requestSensitiveConfirmation}
              onLogAction={logAction}
              onNotify={showAdminNotification}
            />
          )}

          {/* =====================================================================
              SECTION 8C: INTEGRATIONS (Configure Built-in Bridges, Sync Status & Error Logs)
             ===================================================================== */}
          {activeSection === 'integrations' && (
            <AdminIntegrationsSection
              canManageIntegrations={
                rolePerms.find((r) => r.role === 'admin')?.canManageIntegrations ?? true
              }
              activePermissionRoleName="Super Admin"
              auditLogs={auditLogs}
              onRecordAudit={logAction}
              onConfirmAction={requestSensitiveConfirmation}
              onNotify={showAdminNotification}
            />
          )}

          {/* =====================================================================
              SECTION 8D: DATA MANAGEMENT (Incomplete Record Inspector, Safe Repair & Quarantine)
             ===================================================================== */}
          {activeSection === 'data_management' && (
            <AdminDataManagementSection
              listings={listings}
              users={users}
              bookings={bookings}
              canManageData={
                rolePerms.find((r) => r.role === 'admin')?.canManageData ?? true
              }
              activePermissionRoleName="Super Admin"
              auditLogs={auditLogs}
              onUpdateListing={(id, updates) => updateListing(id, updates)}
              onUpdateUsers={(updatedUsers) => {
                setUsers(updatedUsers);
                saveAdminUsers(updatedUsers);
              }}
              onRecordAudit={logAction}
              onConfirmAction={requestSensitiveConfirmation}
              onNotify={showAdminNotification}
            />
          )}

          {/* =====================================================================
              SECTION 8E: ANNOUNCEMENTS & STATUS BOARD (Scheduled Notices & Placements)
             ===================================================================== */}
          {activeSection === 'announcements_status' && (
            <AdminAnnouncementsSection
              canManageAnnouncements={
                rolePerms.find((r) => r.role === 'admin')?.canManageAnnouncements ?? true
              }
              activePermissionRoleName="Super Admin"
              auditLogs={auditLogs}
              onRecordAudit={logAction}
              onConfirmAction={requestSensitiveConfirmation}
              onNotify={showAdminNotification}
            />
          )}

          {/* =====================================================================
              SECTION 9: FEATURE MANAGEMENT (Enable/Disable Modules + Supreme Builder)
             ===================================================================== */}
          {activeSection === 'feature_management' && (
            <div className="space-y-5">
              <AdminPlatformModuleSettings />
              <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-4 sm:p-6 shadow-xs space-y-4">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-purple-600">
                    Section 09 • Modular Architecture & Feature Flags
                  </span>
                  <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
                    Feature Management (Enable / Disable Modules & Zero-Code Builder)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Toggle platform modules ON or OFF in real time and build custom UI + DB fields without developer support.
                  </p>
                </div>

                {/* Per-Section Visibility Matrix for Spotlight Subcategories & Search Date-Range Filter */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
                  {/* Card 1: Spotlight Subcategories per-section toggles */}
                  <div className="p-4 rounded-2xl border-2 border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/40 dark:bg-indigo-950/20 space-y-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div>
                        <div className="font-black text-slate-900 dark:text-white text-xs sm:text-sm">
                          🌟 Spotlight Subcategories (6 Sections)
                        </div>
                        <div className="text-[10px] text-slate-500">
                          Toggle visibility independently per market section
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            const next = saveSpotlightSubcategoriesModuleMap(true);
                            setSpotlightModuleMap(next);
                            setModularTemplates(loadModularTemplates());
                            showAdminNotification('🌟 Spotlight Subcategories enabled for all 6 sections!');
                          }}
                          className="px-2 py-1 rounded-lg text-[10px] font-black bg-emerald-600 text-white cursor-pointer"
                        >
                          All ON
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const next = saveSpotlightSubcategoriesModuleMap(false);
                            setSpotlightModuleMap(next);
                            setModularTemplates(loadModularTemplates());
                            showAdminNotification('🌟 Spotlight Subcategories disabled for all 6 sections!');
                          }}
                          className="px-2 py-1 rounded-lg text-[10px] font-black bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer"
                        >
                          All OFF
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {ALL_SIX_MARKET_MODULES.map((mod) => {
                        const isOn = Boolean(spotlightModuleMap[mod.id]);
                        return (
                          <button
                            key={mod.id}
                            type="button"
                            onClick={() => {
                              const next = toggleSpotlightSubcategoriesForSection(mod.id);
                              setSpotlightModuleMap(next);
                              setModularTemplates(loadModularTemplates());
                              logAction(
                                'Feature Management',
                                `${next[mod.id] ? 'Enabled' : 'Disabled'} Spotlight Subcategories (${mod.shortLabel})`,
                                `Set Spotlight Subcategories for ${mod.label} = ${next[mod.id] ? 'ON' : 'OFF'}`,
                                'published'
                              );
                              showAdminNotification(
                                `🌟 ${mod.emoji} ${mod.shortLabel}: Spotlight Subcategories ${next[mod.id] ? 'ON' : 'OFF'}`
                              );
                            }}
                            className={`px-2.5 py-2 rounded-xl border font-black flex items-center justify-between gap-1.5 cursor-pointer transition ${
                              isOn
                                ? 'bg-emerald-600 text-white border-emerald-600'
                                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800'
                            }`}
                          >
                            <span className="truncate">
                              {mod.emoji} {mod.shortLabel}
                            </span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-black/15">
                              {isOn ? 'ON' : 'OFF'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Card 2: Search Date-Range Filter per-section toggles */}
                  <div className="p-4 rounded-2xl border-2 border-purple-200 dark:border-purple-900/60 bg-purple-50/40 dark:bg-purple-950/20 space-y-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div>
                        <div className="font-black text-slate-900 dark:text-white text-xs sm:text-sm">
                          📅 Search Date-Range Filter (6 Sections)
                        </div>
                        <div className="text-[10px] text-slate-500">
                          Toggle visibility independently per market section
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            const next = saveSearchDateRangeModuleMap(true);
                            setDateRangeModuleMap(next);
                            setModularTemplates(loadModularTemplates());
                            showAdminNotification('📅 Search Date-Range Filter enabled for all 6 sections!');
                          }}
                          className="px-2 py-1 rounded-lg text-[10px] font-black bg-emerald-600 text-white cursor-pointer"
                        >
                          All ON
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const next = saveSearchDateRangeModuleMap(false);
                            setDateRangeModuleMap(next);
                            setModularTemplates(loadModularTemplates());
                            showAdminNotification('📅 Search Date-Range Filter disabled for all 6 sections!');
                          }}
                          className="px-2 py-1 rounded-lg text-[10px] font-black bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer"
                        >
                          All OFF
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {ALL_SIX_MARKET_MODULES.map((mod) => {
                        const isOn = Boolean(dateRangeModuleMap[mod.id]);
                        return (
                          <button
                            key={mod.id}
                            type="button"
                            onClick={() => {
                              const next = toggleSearchDateRangeForSection(mod.id);
                              setDateRangeModuleMap(next);
                              setModularTemplates(loadModularTemplates());
                              logAction(
                                'Feature Management',
                                `${next[mod.id] ? 'Enabled' : 'Disabled'} Search Date-Range Filter (${mod.shortLabel})`,
                                `Set Search Date-Range Filter for ${mod.label} = ${next[mod.id] ? 'ON' : 'OFF'}`,
                                'published'
                              );
                              showAdminNotification(
                                `📅 ${mod.emoji} ${mod.shortLabel}: Search Date-Range Filter ${next[mod.id] ? 'ON' : 'OFF'}`
                              );
                            }}
                            className={`px-2.5 py-2 rounded-xl border font-black flex items-center justify-between gap-1.5 cursor-pointer transition ${
                              isOn
                                ? 'bg-emerald-600 text-white border-emerald-600'
                                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800'
                            }`}
                          >
                            <span className="truncate">
                              {mod.emoji} {mod.shortLabel}
                            </span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-black/15">
                              {isOn ? 'ON' : 'OFF'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                  {modularTemplates.map((tpl) => (
                    <div
                      key={tpl.id}
                      className={`p-3.5 rounded-2xl border flex items-center justify-between gap-2 ${
                        tpl.enabled
                          ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800'
                          : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 opacity-75'
                      }`}
                    >
                      <div>
                        <div className="font-black">{tpl.name}</div>
                        <div className="text-[10px] text-slate-500">
                          Status: {tpl.enabled ? 'Enabled Live' : 'Disabled (Optional)'}
                          {tpl.id === 'spotlight_subcategories' &&
                            ` • ${Object.values(spotlightModuleMap).filter(Boolean).length}/6 Sections ON`}
                          {tpl.id === 'search_date_range_filter' &&
                            ` • ${Object.values(dateRangeModuleMap).filter(Boolean).length}/6 Sections ON`}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const nextEnabled = !tpl.enabled;
                          if (tpl.id === 'spotlight_subcategories') {
                            const nextMap = saveSpotlightSubcategoriesModuleMap(nextEnabled);
                            setSpotlightModuleMap(nextMap);
                            setModularTemplates(loadModularTemplates());
                          } else if (tpl.id === 'search_date_range_filter') {
                            const nextMap = saveSearchDateRangeModuleMap(nextEnabled);
                            setDateRangeModuleMap(nextMap);
                            setModularTemplates(loadModularTemplates());
                          } else {
                            const updated = modularTemplates.map((m) =>
                              m.id === tpl.id ? { ...m, enabled: nextEnabled } : m
                            );
                            setModularTemplates(updated);
                            saveModularTemplates(updated);
                          }
                          logAction(
                            'Feature Management',
                            tpl.enabled ? 'Disabled Module' : 'Enabled Module',
                            `Toggled module "${tpl.name}" to ${nextEnabled ? 'ON' : 'OFF'}`,
                            'published'
                          );
                          showAdminNotification(
                            `⚡ Module "${tpl.name}" is now ${nextEnabled ? 'ENABLED' : 'DISABLED'}!`
                          );
                        }}
                        className={`px-3 py-1.5 rounded-xl font-black cursor-pointer ${
                          tpl.enabled
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                        }`}
                      >
                        {tpl.enabled ? 'ON' : 'OFF'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Existing Supreme Admin Zero-Code Drag & Drop Builder & MCP/REST Hub */}
              <SupremeAdminControlPanel />
            </div>
          )}

          {/* =====================================================================
              SECTION 10: APP SETTINGS & AUDIT HISTORY (Languages, Notifications, Support, Audit Trail)
             ===================================================================== */}
          {activeSection === 'app_settings' && (
            <div className="space-y-5">
              <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-4 sm:p-6 shadow-xs space-y-4 text-xs">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600">
                    Section 10 • General Configuration & Support
                  </span>
                  <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
                    App Settings (Languages, Notifications & Support Details)
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="font-bold block mb-1">
                      Support Helpdesk Phone
                    </label>
                    <input
                      type="text"
                      value={appSettings.supportPhone}
                      onChange={(e) =>
                        setAppSettings({
                          ...appSettings,
                          supportPhone: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-bold"
                    />
                  </div>
                  <div>
                    <label className="font-bold block mb-1">Support Email</label>
                    <input
                      type="email"
                      value={appSettings.supportEmail}
                      onChange={(e) =>
                        setAppSettings({
                          ...appSettings,
                          supportEmail: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-bold"
                    />
                  </div>
                  <div>
                    <label className="font-bold block mb-1">
                      WhatsApp Concierge Number
                    </label>
                    <input
                      type="text"
                      value={appSettings.supportWhatsapp}
                      onChange={(e) =>
                        setAppSettings({
                          ...appSettings,
                          supportWhatsapp: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-bold"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 pt-2">
                  {(
                    [
                      ['smsAlerts', 'SMS OTP & Booking Alerts'],
                      ['whatsappBookingConfirm', 'WhatsApp Instant Tickets'],
                      ['emailGstInvoices', 'Auto-Email PDF GST Invoices'],
                      ['adminApprovalPush', 'Admin Approval Push Alerts'],
                    ] as const
                  ).map(([k, label]) => (
                    <label
                      key={k}
                      className="flex items-center gap-1.5 font-bold cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={appSettings.notifications[k]}
                        onChange={(e) =>
                          setAppSettings({
                            ...appSettings,
                            notifications: {
                              ...appSettings.notifications,
                              [k]: e.target.checked,
                            },
                          })
                        }
                        className="rounded text-indigo-600"
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      const next = {
                        ...appSettings,
                        publishState: 'published' as const,
                      };
                      setAppSettings(next);
                      saveAdminAppSettings(next);
                      logAction(
                        'App Settings',
                        'Published App & Support Settings',
                        `Updated support phone (${next.supportPhone}) & notification rules`,
                        'published'
                      );
                      showAdminNotification(
                        '✅ App settings published to live application!'
                      );
                    }}
                    className="px-4 py-2 rounded-xl bg-[#4338CA] text-white font-black cursor-pointer"
                  >
                    Publish App Settings
                  </button>
                </div>
              </div>

              {/* FULL AUDIT HISTORY LOG */}
              <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-4 sm:p-6 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h4 className="font-black text-base flex items-center gap-2">
                      <History className="w-5 h-5 text-indigo-600" />
                      <span>Immutable Admin Audit History ({auditLogs.length})</span>
                    </h4>
                    <p className="text-xs text-slate-500">
                      Tracks who changed what and when across Users, Payments, Ads, Content, Listings, and Settings.
                    </p>
                  </div>
                  <select
                    value={auditFilterSection}
                    onChange={(e) => setAuditFilterSection(e.target.value)}
                    className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold"
                  >
                    <option value="ALL">All Sections</option>
                    <option value="User Management">User Management</option>
                    <option value="Payment Management">Payment Management</option>
                    <option value="Ad Management">Ad Management</option>
                    <option value="Reports & Analytics">Reports & Analytics</option>
                    <option value="Theme Management">Theme Management</option>
                    <option value="Integrations">Integrations</option>
                    <option value="Data Management">Data Management</option>
                    <option value="Announcements & Status Board">Announcements & Status Board</option>
                    <option value="Content Management">Content Management</option>
                    <option value="Listings & Venues">Listings & Venues</option>
                    <option value="Bookings & Events">Bookings & Events</option>
                    <option value="Feature Management">Feature Management</option>
                    <option value="App Settings">App Settings</option>
                  </select>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-[10px] uppercase text-slate-400">
                        <th className="py-2.5 px-3">Timestamp</th>
                        <th className="py-2.5 px-3">Admin Actor</th>
                        <th className="py-2.5 px-3">Section</th>
                        <th className="py-2.5 px-3">Action & Change Summary</th>
                        <th className="py-2.5 px-3">State</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {auditLogs
                        .filter(
                          (l) =>
                            auditFilterSection === 'ALL' ||
                            l.section === auditFilterSection
                        )
                        .map((log) => (
                          <tr key={log.id}>
                            <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500">
                              {log.timestamp}
                            </td>
                            <td className="py-2.5 px-3 font-bold">
                              {log.actorName}
                            </td>
                            <td className="py-2.5 px-3">
                              <span className="px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold">
                                {log.section}
                              </span>
                            </td>
                            <td className="py-2.5 px-3">
                              <strong className="text-slate-900 dark:text-white">
                                {log.action}:
                              </strong>{' '}
                              <span className="text-slate-600 dark:text-slate-300">
                                {log.details}
                              </span>
                            </td>
                            <td className="py-2.5 px-3">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                                  log.status === 'sensitive_confirmed'
                                    ? 'bg-rose-100 text-rose-800'
                                    : log.status === 'draft_saved'
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-emerald-100 text-emerald-800'
                                }`}
                              >
                                {log.status.replace('_', ' ')}
                              </span>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* =========================================================
              SECTION 13: DEDICATED AUDIT LOGS & AUDIT TRAIL TAB
          ========================================================= */}
          {activeSection === 'audit_logs' && (
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-4 sm:p-6 shadow-xs space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800">
                    Immutable Security Ledger • Super Admin Console
                  </span>
                  <h3 className="text-base sm:text-lg font-black mt-1 flex items-center gap-2">
                    <History className="w-5 h-5 text-indigo-600" />
                    <span>Audit Logs & Sensitive Action Trail</span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    Tracks all administrative actions including listing approvals/rejections, user suspensions, and platform fee updates with timestamps and Admin ID.
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <select
                    value={auditFilterSection}
                    onChange={(e) => setAuditFilterSection(e.target.value)}
                    className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold"
                  >
                    <option value="ALL">All Sections ({auditLogs.length})</option>
                    {Array.from(new Set(auditLogs.map((l) => l.section))).map((sec) => (
                      <option key={sec} value={sec}>
                        {sec}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      logAction(
                        'App Settings',
                        'Manual Security Checkpoint',
                        'Super Admin verified audit log integrity checkpoint',
                        'sensitive_confirmed'
                      );
                      showAdminNotification('🛡️ Security Audit Checkpoint logged!');
                    }}
                    className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black cursor-pointer"
                  >
                    + Log Checkpoint
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-[10px] font-black uppercase text-slate-400">
                      <th className="py-2.5 px-3">Timestamp</th>
                      <th className="py-2.5 px-3">Admin ID & Actor</th>
                      <th className="py-2.5 px-3">Module / Section</th>
                      <th className="py-2.5 px-3">Action & Change Details</th>
                      <th className="py-2.5 px-3">Security Level</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {auditLogs
                      .filter(
                        (log) =>
                          auditFilterSection === 'ALL' ||
                          auditFilterSection === 'all' ||
                          log.section === auditFilterSection
                      )
                      .map((log, idx) => (
                        <tr
                          key={log.id}
                          className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                        >
                          <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                            {log.timestamp}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-black text-slate-900 dark:text-white">
                              {log.actorName}
                            </div>
                            <div className="text-[10px] font-mono text-indigo-600 dark:text-indigo-400">
                              ID: ADM-NARENDRA-0{(idx % 3) + 1}
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold">
                              {log.section}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <strong className="text-slate-900 dark:text-white">
                              {log.action}:
                            </strong>{' '}
                            <span className="text-slate-600 dark:text-slate-300">
                              {log.details}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                                log.status === 'sensitive_confirmed'
                                  ? 'bg-rose-100 text-rose-800'
                                  : log.status === 'draft_saved'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {log.status.replace('_', ' ')}
                            </span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* =========================================================
              SECTION 14: DEDICATED NOTIFICATIONS MANAGEMENT
          ========================================================= */}
          {activeSection === 'notifications_mgmt' && (
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-4 sm:p-6 shadow-xs space-y-5">
              <div className="border-b border-slate-100 dark:border-slate-800 pb-4">
                <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-800">
                  Segmented Push & In-App Broadcast Engine
                </span>
                <h3 className="text-base sm:text-lg font-black mt-1 flex items-center gap-2">
                  <Bell className="w-5 h-5 text-purple-600" />
                  <span>Notifications Management & User Segment Scheduler</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Create, schedule, and dispatch targeted push or in-app notifications to specific user segments based on role or activity history.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                <div className="lg:col-span-5 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 space-y-3 text-xs">
                  <h4 className="font-black text-sm text-slate-900 dark:text-white">
                    Compose Segmented Notification
                  </h4>

                  <div>
                    <label className="font-bold block mb-1">Notification Title *</label>
                    <input
                      type="text"
                      value={notifTitle}
                      onChange={(e) => setNotifTitle(e.target.value)}
                      placeholder="e.g. Hourly Hotel Booking Flash Sale — 20% Off!"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-bold"
                    />
                  </div>

                  <div>
                    <label className="font-bold block mb-1">Message Body *</label>
                    <textarea
                      rows={3}
                      value={notifMessage}
                      onChange={(e) => setNotifMessage(e.target.value)}
                      placeholder="Enter push / in-app message details..."
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="font-bold block mb-1">Target Role Segment</label>
                      <select
                        value={notifSegmentRole}
                        onChange={(e) => setNotifSegmentRole(e.target.value)}
                        className="w-full px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-bold"
                      >
                        <option value="all_users">All Users (1,738)</option>
                        <option value="customers">Customers Only (1,420)</option>
                        <option value="providers">Verified Providers (298)</option>
                        <option value="vip_subscribers">VIP Pro Subscribers (184)</option>
                      </select>
                    </div>
                    <div>
                      <label className="font-bold block mb-1">Activity History Filter</label>
                      <select
                        value={notifActivitySegment}
                        onChange={(e) => setNotifActivitySegment(e.target.value)}
                        className="w-full px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-bold"
                      >
                        <option value="active_7d">Active in last 7 days</option>
                        <option value="booked_hotel_venue">Booked Hotel / Venue recently</option>
                        <option value="saved_favorites">Has Saved Favorites</option>
                        <option value="inactive_30d">Dormant &gt; 30 days (Re-engage)</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="font-bold block mb-1">Delivery Channel</label>
                      <select
                        value={notifChannel}
                        onChange={(e) => setNotifChannel(e.target.value as any)}
                        className="w-full px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-bold"
                      >
                        <option value="push_and_inapp">Push + In-App Bell</option>
                        <option value="in_app_only">In-App Bell Only</option>
                        <option value="push_only">Browser Push Only</option>
                      </select>
                    </div>
                    <div>
                      <label className="font-bold block mb-1">Schedule Time (Optional)</label>
                      <input
                        type="datetime-local"
                        value={notifScheduleTime}
                        onChange={(e) => setNotifScheduleTime(e.target.value)}
                        className="w-full px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-bold"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (!notifTitle.trim() || !notifMessage.trim()) {
                        showAdminNotification('⚠️ Please enter both a notification title and message.');
                        return;
                      }
                      const isScheduled = Boolean(notifScheduleTime);
                      const newEntry = {
                        id: `NOTIF-${Math.floor(1000 + Math.random() * 9000)}`,
                        title: notifTitle.trim(),
                        message: notifMessage.trim(),
                        segmentRole: notifSegmentRole,
                        activitySegment: notifActivitySegment,
                        channel:
                          notifChannel === 'push_and_inapp'
                            ? 'Push + In-App'
                            : notifChannel === 'in_app_only'
                            ? 'In-App Only'
                            : 'Browser Push',
                        scheduledFor: isScheduled
                          ? notifScheduleTime.replace('T', ' ')
                          : 'Immediate',
                        sentAt: new Date().toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        }),
                        status: (isScheduled ? 'Scheduled' : 'Dispatched') as
                          | 'Dispatched'
                          | 'Scheduled',
                        reachCount:
                          notifSegmentRole === 'all_users'
                            ? 1738
                            : notifSegmentRole === 'customers'
                            ? 1420
                            : 298,
                      };
                      setSentNotificationsHistory((prev) => [newEntry, ...prev]);
                      void sendServerNotification({
                        title: notifTitle.trim(),
                        message: notifMessage.trim(),
                        targetRole:
                          notifSegmentRole === 'customers'
                            ? 'customer'
                            : notifSegmentRole === 'providers'
                            ? 'provider'
                            : 'all',
                        type: 'campaign',
                        channel:
                          notifChannel === 'push_and_inapp'
                            ? 'all_channels'
                            : 'push',
                      });
                      pushSystemNotification({
                        title: notifTitle.trim(),
                        message: `${notifMessage.trim()} [Segment: ${notifSegmentRole}]`,
                        type: 'approval',
                      });
                      logAction(
                        'Announcements & Status Board',
                        isScheduled ? 'Scheduled Segmented Push' : 'Dispatched Segmented Push',
                        `Sent "${notifTitle.trim()}" to segment ${notifSegmentRole} (${notifActivitySegment})`,
                        'published'
                      );
                      setNotifTitle('');
                      setNotifMessage('');
                      setNotifScheduleTime('');
                      showAdminNotification(
                        isScheduled
                          ? '📅 Segmented notification scheduled!'
                          : '🚀 Segmented notification dispatched to users!'
                      );
                    }}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-black shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>
                      {notifScheduleTime
                        ? 'Schedule Segmented Notification'
                        : 'Send Push & In-App Notification Now'}
                    </span>
                  </button>
                </div>

                <div className="lg:col-span-7 space-y-3">
                  <h4 className="font-black text-sm text-slate-900 dark:text-white">
                    Dispatched & Scheduled Notification Campaigns ({sentNotificationsHistory.length})
                  </h4>
                  <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
                    {sentNotificationsHistory.map((item) => (
                      <div
                        key={item.id}
                        className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 space-y-1.5 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                                item.status === 'Dispatched'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {item.status}
                            </span>
                            <span className="font-black text-slate-900 dark:text-white">
                              {item.title}
                            </span>
                          </div>
                          <span className="text-[10px] font-mono text-slate-400">
                            {item.id} • {item.sentAt}
                          </span>
                        </div>
                        <p className="text-slate-600 dark:text-slate-300 text-[11px]">
                          {item.message}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 pt-1 text-[10px] font-bold text-slate-500">
                          <span className="px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300">
                            Role: {item.segmentRole}
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300">
                            Activity: {item.activitySegment}
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-slate-200/70 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                            Channel: {item.channel}
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                            Est. Reach: {item.reachCount.toLocaleString('en-IN')} users
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* EDIT POSTING PLAN MODAL */}
      {editingPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <form
            onSubmit={handleSavePlan}
            className="bg-white dark:bg-slate-900 p-6 rounded-3xl max-w-md w-full shadow-2xl space-y-4 border border-slate-200 dark:border-slate-800 text-xs"
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
              <h4 className="font-extrabold text-sm">
                Edit Plan: {editingPlan.name}
              </h4>
              <button type="button" onClick={() => setEditingPlan(null)}>
                ✕
              </button>
            </div>
            <div>
              <label className="font-bold block mb-1">Plan Price (₹)</label>
              <input
                type="number"
                required
                disabled={!FINANCIAL_ADMIN_MUTATIONS_READY}
                value={editingPlan.price}
                onChange={(e) =>
                  setEditingPlan({
                    ...editingPlan,
                    price: Number(e.target.value),
                  })
                }
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 rounded-xl p-2.5 font-bold"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingPlan(null)}
                className="px-4 py-2 border rounded-xl font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!FINANCIAL_ADMIN_MUTATIONS_READY}
                className="px-5 py-2 bg-purple-600 text-white rounded-xl font-bold cursor-not-allowed disabled:opacity-40"
              >
                Save Plan
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ADD NEW CATEGORY MODAL */}
      {isAddingCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="bg-gradient-to-r from-[#4A148C] to-purple-800 text-white p-4 flex items-center justify-between">
              <h3 className="font-extrabold text-base">
                Add New Category & Subcategories
              </h3>
              <button
                type="button"
                onClick={() => setIsAddingCategory(false)}
                className="w-8 h-8 rounded-full bg-white/10 text-white"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateCategory} className="p-5 space-y-4 text-xs">
              <div>
                <label className="font-bold block mb-1">Category Name *</label>
                <input
                  type="text"
                  required
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="e.g. Solar Energy Services"
                  className="w-full bg-slate-50 dark:bg-slate-800 border rounded-xl p-2.5 font-semibold"
                />
              </div>
              <div>
                <label className="font-bold block mb-1">
                  Subcategories (comma-separated) *
                </label>
                <input
                  type="text"
                  value={newCatSubs}
                  onChange={(e) => setNewCatSubs(e.target.value)}
                  placeholder="Rooftop Solar, Inverter Battery, Panel Cleaning"
                  className="w-full bg-slate-50 dark:bg-slate-800 border rounded-xl p-2.5"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddingCategory(false)}
                  className="px-4 py-2 border rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-purple-600 text-white rounded-xl font-bold"
                >
                  Create Category
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SENSITIVE ACTION CONFIRMATION MODAL */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2.5">
              <div
                className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                  confirmModal.danger
                    ? 'bg-rose-100 text-rose-600'
                    : 'bg-amber-100 text-amber-700'
                }`}
              >
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-black text-base text-slate-900 dark:text-white">
                  {confirmModal.title}
                </h4>
                <span className="text-[10px] font-bold uppercase text-slate-400">
                  Sensitive Admin Action • Audit Logged
                </span>
              </div>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {confirmModal.description}
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() =>
                  setConfirmModal({ ...confirmModal, isOpen: false })
                }
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  confirmModal.onConfirm();
                  setConfirmModal({ ...confirmModal, isOpen: false });
                }}
                className={`px-4 py-2 rounded-xl text-white text-xs font-black cursor-pointer ${
                  confirmModal.danger
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-[#4338CA] hover:bg-indigo-800'
                }`}
              >
                {confirmModal.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Toast Notification */}
      {adminToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-950 text-white px-4 py-2.5 rounded-2xl shadow-2xl border border-purple-500 flex items-center gap-2 text-xs font-bold animate-in slide-in-from-bottom-2">
          <span>{adminToast}</span>
        </div>
      )}
    </div>
    </Suspense>
  );
};
