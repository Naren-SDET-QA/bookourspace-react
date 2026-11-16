import React, { useEffect, useState, useMemo } from 'react';
import SafeImage from './SafeImage';
import * as d3 from 'd3';
import { 
  Eye, 
  MessageSquare, 
  Sparkles, 
  ShieldCheck, 
  CheckCircle2, 
  Trash2,
  Phone,
  Clock,
  XCircle,
  Image as ImageIcon,
  TrendingUp,
  CalendarCheck2,
} from 'lucide-react';
import { useMarketplace } from '../context/MarketplaceContext';
import { AppLanguage, getSubcategoryDisplayName, getPriceUnitDisplayName } from '../utils/translations';
import { transliterateLatinToScript } from '../utils/i18nEngine';
import { UniversalBarcode, StandaloneBarcodeVerifierHub, generateBosBarcodeId, getBarcodePassTitle } from './UniversalBarcode';
import { CraftoPosterGenerator } from './CraftoPosterGenerator';
import { LiveEditEntryButton } from './liveEdit/LiveEditEntryButton';
import PgProviderWorkspace, { BusinessContextBar } from './PgProviderWorkspace';
import InstituteOwnerDashboard from './InstituteOwnerDashboard';
import StaysOwnerAdminDashboard, { stayOwnerSections, type StayOwnerSection } from './StaysOwnerAdminDashboard';
import ServicesProviderDashboard, { serviceSections, type ServiceView } from './ServicesProviderDashboard';
import ProviderPortalShell, { ProviderStatCard, PROVIDER_MODULE_LABELS, type ProviderPortalModule } from './ProviderPortalShell';
import { accessScopeFrom, grantedSections, moduleGranted } from '../lib/businessAccess';
import { BUSINESS_MODULE_LABELS, fetchBusinesses, type BusinessMembership, type BusinessModule } from '../lib/businessClient';
import { BusinessCreatePanel } from './pg/BusinessCreatePanel';
import { BusinessStaffPanel } from './pg/BusinessStaffPanel';

interface ProviderDashboardProps {
  onOpenPostWizard: () => void;
  onOpenPaymentModal: (planName: string, amount: number) => void;
  onOpenChatWithCustomer: (customerId: string, customerName: string, listingTitle: string) => void;
  onSwitchToAdminReview?: () => void;
  onSwitchToMarketplace?: (section?: 'pg_hostels' | 'hotel_stay' | 'services' | 'classes') => void;
  /** Ends the signed-in session from the owner console. */
  onSignOut?: () => void;
  currentLang?: AppLanguage;
  onChangeLang?: (lang: AppLanguage) => void;
  initialWorkspace?: 'pg' | 'institute';
}

/**
 * Shown instead of a module workspace when the account holds no business on that
 * module. The workspace would otherwise answer BUSINESS_CONTEXT_REQUIRED or
 * BUSINESS_MODULE_MISMATCH, which hides the screen behind an error.
 */
function MissingModuleBusiness({
  heading,
  description,
  module,
  onCreated,
}: {
  heading: string;
  description: string;
  module: BusinessModule;
  onCreated: (business: BusinessMembership) => void;
}) {
  const moduleLabel = BUSINESS_MODULE_LABELS[module];
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-3xl font-black tracking-tight text-slate-950 dark:text-white">{heading}</h2>
        <p className="mt-1 text-base text-slate-500 dark:text-slate-400">{description}</p>
      </div>
      <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
        This account has no {moduleLabel} business yet. Pick “{moduleLabel}” as the module when you create one — each business keeps its own listings, staff and bookings.
      </p>
      <BusinessCreatePanel onCreated={onCreated} defaultModule={module} />
    </div>
  );
}

export const ProviderDashboard: React.FC<ProviderDashboardProps> = ({
  onOpenPostWizard,
  onOpenPaymentModal,
  onOpenChatWithCustomer,
  onSwitchToAdminReview,
  onSwitchToMarketplace,
  onSignOut,
  currentLang = 'en',
  onChangeLang,
  initialWorkspace = 'pg',
}) => {
  const { listings, enquiries, bookings, postingPlans, deleteListing, toggleFeaturedListing, supabaseProfile } = useMarketplace();

  const loc = (enText: string, teText?: string, hiText?: string) => {
    if (currentLang === 'en') return enText;
    if (currentLang === 'te' && teText) return teText;
    if (currentLang === 'hi' && hiText) return hiText;
    return transliterateLatinToScript(enText, currentLang);
  };

  // Sort pending_approval listings to the very top so providers see their newly submitted requests immediately
  const [businesses, setBusinesses] = useState<BusinessMembership[]>([]);
  const [selectedBusinessId, setSelectedBusinessId] = useState('');
  const [businessError, setBusinessError] = useState('');

  useEffect(() => {
    let active = true;
    fetchBusinesses()
      .then((rows) => {
        if (!active) return;
        setBusinesses(rows);
        const preferred = rows.find((row) => row.module_type === 'pg_hostels' && row.approval_status === 'approved') || rows[0];
        // A stored id can belong to another account (or to a business this
        // provider no longer holds), so only keep it when it is still theirs.
        setSelectedBusinessId((current) => (current && rows.some((row) => row.id === current) ? current : preferred?.id || ''));
      })
      .catch((cause) => { if (active) setBusinessError(cause instanceof Error ? cause.message : 'BUSINESS_LIST_UNAVAILABLE'); });
    return () => { active = false; };
  }, []);

  const selectedBusiness = businesses.find((row) => row.id === selectedBusinessId) || null;

  // The PG workspace only serves pg_hostels businesses; handing it a Stays or
  // Services business makes every protected call fail closed with
  // BUSINESS_MODULE_MISMATCH, which used to replace the screen with an error.
  const pgBusinesses = businesses.filter((row) => row.module_type === 'pg_hostels');
  const activePgBusiness = pgBusinesses.find((row) => row.id === selectedBusinessId) || pgBusinesses[0] || null;

  // The stays, services and institute workspaces read the selected business too.
  // Each tab therefore only ever runs against a business of its own module.
  const staysBusinesses = businesses.filter((row) => row.module_type === 'hotel_stay');
  const activeStaysBusiness = staysBusinesses.find((row) => row.id === selectedBusinessId) || staysBusinesses[0] || null;
  const servicesBusinesses = businesses.filter((row) => row.module_type === 'services');
  const activeServicesBusiness = servicesBusinesses.find((row) => row.id === selectedBusinessId) || servicesBusinesses[0] || null;
  const instituteBusinesses = businesses.filter((row) => row.module_type === 'classes');
  const activeInstituteBusiness = instituteBusinesses.find((row) => row.id === selectedBusinessId) || instituteBusinesses[0] || null;

  useEffect(() => {
    try {
      if (selectedBusinessId) window.localStorage.setItem('bos_business_id_v1', selectedBusinessId);
      else window.localStorage.removeItem('bos_business_id_v1');
    } catch { /* storage is optional */ }
  }, [selectedBusinessId]);

  const moduleForListing = (listing: { categoryId?: string; entityType?: string }) => {
    const text = `${listing.categoryId || ''} ${listing.entityType || ''}`.toLowerCase();
    if (text.includes('pg')) return 'pg_hostels';
    if (text.includes('class') || text.includes('course')) return 'classes';
    if (text.includes('venue')) return 'venues';
    if (text.includes('hotel') || text.includes('stay')) return 'hotel_stay';
    if (text.includes('movie')) return 'movies';
    return 'services';
  };

  const businessListings = [...listings]
    .filter((listing) => !selectedBusiness || moduleForListing(listing) === selectedBusiness.module_type)
    .sort((a, b) => {
      if (a.status === 'pending_approval' && b.status !== 'pending_approval') return -1;
      if (a.status !== 'pending_approval' && b.status === 'pending_approval') return 1;
      return 0;
    });

  const pendingListings = businessListings.filter(l => l.status === 'pending_approval');
  const activeListings = businessListings.filter(l => l.status === 'active');
  const totalViews = businessListings.reduce((sum, l) => sum + l.viewsCount, 0);

  // Bell badge: real work waiting on the provider, not a static dot.
  const notifications = useMemo(() => [
    ...pendingListings.map((listing) => ({
      id: `listing-${listing.id}`,
      title: 'Listing awaiting review',
      detail: listing.title,
      module: 'listings' as const,
    })),
    ...enquiries
      .filter((enquiry) => enquiry.status === 'new')
      // Only this account's enquiries count; the context is marketplace-wide.
      .filter((enquiry) => !supabaseProfile?.id || enquiry.providerId === supabaseProfile.id)
      .map((enquiry) => ({
        id: `enquiry-${enquiry.id}`,
        title: 'New customer enquiry',
        detail: `${enquiry.customerName} · ${enquiry.listingTitle}`,
        module: 'enquiries' as const,
      })),
  ].slice(0, 12), [pendingListings, enquiries, supabaseProfile?.id]);

  type ProviderWorkspaceTab = 'listings' | 'enquiries' | 'bookings' | 'analytics' | 'plans' | 'visiting_card' | 'stays' | 'services' | 'pg_inventory' | 'institute' | 'team';
  const [activeSubTab, setActiveSubTab] = useState<ProviderWorkspaceTab>('pg_inventory');

  // Stays and home services share this navigation. Their sections live here so
  // the modules never render a second nested sidebar of their own.
  const [staySection, setStaySection] = useState<StayOwnerSection>('overview');
  const [serviceSection, setServiceSection] = useState<ServiceView>('overview');

  // Access scope of the signed-in member inside the selected business. `null`
  // means unrestricted (owners, and members without a grant row).
  const accessScope = accessScopeFrom(selectedBusiness);
  const BUSINESS_MODULE_FOR_TAB: Partial<Record<ProviderWorkspaceTab, string>> = {
    pg_inventory: 'pg_hostels', institute: 'classes', stays: 'hotel_stay', services: 'services',
  };
  const PORTAL_MODULE_FOR_TAB: Record<ProviderWorkspaceTab, ProviderPortalModule> = {
    pg_inventory: 'pg', institute: 'institute', stays: 'stays', services: 'services', team: 'team',
    listings: 'listings', analytics: 'analytics', enquiries: 'enquiries', bookings: 'bookings', plans: 'plans', visiting_card: 'visiting_card',
  };
  const tabAllowed = (tab: ProviderWorkspaceTab) => {
    const moduleKey = BUSINESS_MODULE_FOR_TAB[tab];
    return !moduleKey || moduleGranted(accessScope, moduleKey);
  };
  const allowedPortalModules: ProviderPortalModule[] = (Object.keys(PORTAL_MODULE_FOR_TAB) as ProviderWorkspaceTab[])
    .filter((tab) => {
      if (!tabAllowed(tab) || (tab !== 'team' || !accessScope)) return false;
      const moduleType = BUSINESS_MODULE_FOR_TAB[tab];
      // A provider only sees workspace modules for businesses they actually
      // belong to. This prevents a PG-only account from being presented with
      // Stays, Services, Institute, or unrelated provider consoles.
      if (!moduleType) return true;
      return businesses.some((business) => business.module_type === moduleType);
    })
    .map((tab) => PORTAL_MODULE_FOR_TAB[tab]);
  const staySectionKeys = grantedSections(accessScope, 'hotel_stay');
  const serviceSectionKeys = grantedSections(accessScope, 'services');
  const activeStaySection: StayOwnerSection = staySectionKeys && !staySectionKeys.includes(staySection)
    ? ((staySectionKeys[0] as StayOwnerSection) || 'overview')
    : staySection;
  const activeServiceSection: ServiceView = serviceSectionKeys && !serviceSectionKeys.includes(serviceSection)
    ? ((serviceSectionKeys[0] as ServiceView) || 'overview')
    : serviceSection;
  const sectionRail: Array<{ key: string; label: string; icon: React.ComponentType<{ className?: string }>; active: boolean; onSelect: () => void }> =
    activeSubTab === 'stays'
      ? stayOwnerSections
          .filter(({ key }) => !staySectionKeys || staySectionKeys.includes(key))
          .map(({ key, label, icon }) => ({ key, label, icon, active: activeStaySection === key, onSelect: () => setStaySection(key) }))
      : activeSubTab === 'services'
      ? serviceSections
          .filter(({ key }) => !serviceSectionKeys || serviceSectionKeys.includes(key))
          .map(({ key, label, icon }) => ({ key, label, icon, active: activeServiceSection === key, onSelect: () => setServiceSection(key) }))
      : [];

  // A restricted member never lands on a workspace they may not open.
  useEffect(() => {
    const moduleType = BUSINESS_MODULE_FOR_TAB[activeSubTab];
    const moduleVisible = !moduleType || businesses.some((business) => business.module_type === moduleType);
    if (tabAllowed(activeSubTab) && moduleVisible) return;
    const next = (Object.keys(BUSINESS_MODULE_FOR_TAB) as ProviderWorkspaceTab[]).find((tab) => {
      const target = BUSINESS_MODULE_FOR_TAB[tab];
      return tabAllowed(tab) && (!target || businesses.some((business) => business.module_type === target));
    });
    setActiveSubTab(next || 'listings');
  }, [activeSubTab, businesses, selectedBusiness?.allowed_modules?.join(',')]);

  // Opening a module tab selects that module's business, so the workspace never
  // asks the server for data under another module's business.
  useEffect(() => {
    const moduleType = BUSINESS_MODULE_FOR_TAB[activeSubTab];
    if (!moduleType || !businesses.length) return;
    if (selectedBusiness?.module_type === moduleType) return;
    const target = businesses.find((row) => row.module_type === moduleType);
    if (target && target.id !== selectedBusinessId) setSelectedBusinessId(target.id);
  }, [activeSubTab, businesses, selectedBusiness?.module_type, selectedBusinessId]);

  const navigatePortalModule = (module: ProviderPortalModule) => {
    const mapping: Record<ProviderPortalModule, ProviderWorkspaceTab> = {
      pg: 'pg_inventory', stays: 'stays', services: 'services', institute: 'institute', team: 'team', listings: 'listings', analytics: 'analytics', enquiries: 'enquiries', bookings: 'bookings', plans: 'plans', visiting_card: 'visiting_card',
    };
    setActiveSubTab(mapping[module]);
  };

  const activePortalModule: ProviderPortalModule = activeSubTab === 'pg_inventory' ? 'pg' : activeSubTab;

  useEffect(() => {
    setActiveSubTab(initialWorkspace === 'institute' ? 'institute' : 'pg_inventory');
  }, [initialWorkspace]);

  // D3 Chart Computations for Analytics & Performance Tab
  const d3Analytics = useMemo(() => {
    // 1. Weekly Profile Views Trend (D3 Line & Area path)
    const weeklyViews = [
      { day: 'Mon', views: Math.round(totalViews * 0.11) + 45, conversions: 4.2 },
      { day: 'Tue', views: Math.round(totalViews * 0.14) + 62, conversions: 5.1 },
      { day: 'Wed', views: Math.round(totalViews * 0.13) + 58, conversions: 4.8 },
      { day: 'Thu', views: Math.round(totalViews * 0.16) + 74, conversions: 6.4 },
      { day: 'Fri', views: Math.round(totalViews * 0.18) + 89, conversions: 7.2 },
      { day: 'Sat', views: Math.round(totalViews * 0.22) + 112, conversions: 8.6 },
      { day: 'Sun', views: Math.round(totalViews * 0.20) + 98, conversions: 7.9 },
    ];

    const width = 460;
    const height = 170;
    const pad = { top: 18, right: 20, bottom: 28, left: 38 };

    const xScale = d3
      .scalePoint<string>()
      .domain(weeklyViews.map((d) => d.day))
      .range([pad.left, width - pad.right]);

    const maxViews = d3.max(weeklyViews, (d) => d.views) || 200;
    const yScale = d3
      .scaleLinear()
      .domain([0, maxViews * 1.15])
      .range([height - pad.bottom, pad.top]);

    const lineGenerator = d3
      .line<{ day: string; views: number }>()
      .x((d) => xScale(d.day) ?? pad.left)
      .y((d) => yScale(d.views))
      .curve(d3.curveMonotoneX);

    const areaGenerator = d3
      .area<{ day: string; views: number }>()
      .x((d) => xScale(d.day) ?? pad.left)
      .y0(height - pad.bottom)
      .y1((d) => yScale(d.views))
      .curve(d3.curveMonotoneX);

    const linePath = lineGenerator(weeklyViews) || '';
    const areaPath = areaGenerator(weeklyViews) || '';
    const points = weeklyViews.map((d) => ({
      ...d,
      cx: xScale(d.day) ?? pad.left,
      cy: yScale(d.views),
    }));

    // 2. Booking Conversion Funnel (D3 Bar Scales)
    const conversionStages = [
      { stage: 'Profile Impressions', count: totalViews || 1420, rate: 100, color: '#6366F1' },
      { stage: 'Card Detail Clicks', count: Math.round((totalViews || 1420) * 0.42), rate: 42, color: '#8B5CF6' },
      { stage: 'Enquiries & Calls', count: Math.max(enquiries.length * 18, 165), rate: 18.4, color: '#EC4899' },
      { stage: 'Confirmed Bookings', count: Math.max(bookings.length * 12, 68), rate: 8.6, color: '#10B981' },
    ];
    const funnelScale = d3.scaleLinear().domain([0, 100]).range([0, 100]);

    // 3. Enquiry Response Time Distribution (D3 Horizontal Scale)
    const responseBuckets = [
      { bucket: '< 5 Mins (Instant)', pct: 58, avgConversion: '14.2%', color: '#10B981' },
      { bucket: '5 – 15 Mins', pct: 27, avgConversion: '8.5%', color: '#3B82F6' },
      { bucket: '15 – 60 Mins', pct: 11, avgConversion: '4.1%', color: '#F59E0B' },
      { bucket: '> 1 Hour', pct: 4, avgConversion: '1.2%', color: '#F43F5E' },
    ];
    const respScale = d3.scaleLinear().domain([0, 70]).range([0, 100]);

    return {
      width,
      height,
      pad,
      linePath,
      areaPath,
      points,
      conversionStages,
      funnelScale,
      responseBuckets,
      respScale,
    };
  }, [totalViews, enquiries.length, bookings.length]);

  return (
    <ProviderPortalShell
      activeModule={activePortalModule}
      onNavigate={navigatePortalModule}
      allowedModules={allowedPortalModules}
      role={supabaseProfile?.role}
      userName={supabaseProfile?.full_name}
      notifications={notifications}
      currentLang={currentLang}
      onChangeLanguage={onChangeLang}
      title={PROVIDER_MODULE_LABELS[activePortalModule] || 'Provider workspace'}
      subtitle={selectedBusiness ? `${selectedBusiness.name} · ${BUSINESS_MODULE_LABELS[selectedBusiness.module_type]}` : 'Business operations'}
      onOpenMarketplace={() => {
        const section = activePortalModule === 'stays'
          ? 'hotel_stay'
          : activePortalModule === 'services'
            ? 'services'
            : activePortalModule === 'institute'
              ? 'classes'
              : activePortalModule === 'pg'
                ? 'pg_hostels'
                : undefined;
        onSwitchToMarketplace?.(section);
      }}
    >
    <div className="min-w-0 space-y-6 pb-24">
      {/* Pending Admin Approval Alert Banner (Display only for Admin) */}
      {pendingListings.length > 0 && onSwitchToAdminReview && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-400 dark:border-amber-700 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-400 text-slate-950 text-[10px] font-black uppercase">
              <Clock className="w-3.5 h-3.5" />
              <span>
                {loc(
                  `${pendingListings.length} Request(s) Pending Admin Review`,
                  `${pendingListings.length} ప్రొవైడర్ దరఖాస్తులు అడ్మిన్ సమీక్ష కోసం వేచి ఉన్నాయి`,
                  `${pendingListings.length} प्रोवाइडर अनुरोध एडमिन समीक्षा के लिए लंबित`
                )}
              </span>
            </div>
            <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
              {loc(
                'Your Provider Registration & Listing Request has been sent to the Admin!',
                'మీ ప్రొవైడర్ నమోదు & లిస్టింగ్ దరఖాస్తు అడ్మిన్‌కు పంపబడింది!',
                'आपका प्रोवाइडर पंजीकरण और लिस्टिंग अनुरोध एडमिन को भेज दिया गया है!'
              )}
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              {loc(
                'Pending listings remain hidden from the public Marketplace feed until the Admin reviews and approves them.',
                'అడ్మిన్ పరిశీలించి ఆమోదించే వరకు ఈ లిస్టింగ్‌లు పబ్లిక్ మార్కెట్‌ప్లేస్‌లో కనిపించవు.',
                'जब तक एडमिन समीक्षा करके स्वीकृत नहीं करता, तब तक ये लिस्टिंग सार्वजनिक फीड से छिपी रहती हैं।'
              )}
            </p>
          </div>
          {onSwitchToAdminReview && (
            <button
              onClick={onSwitchToAdminReview}
              className="px-4 py-2.5 rounded-xl bg-[#4338CA] hover:bg-brand-teal-hover text-white text-xs font-black flex items-center gap-1.5 shrink-0 shadow-md cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4 text-[#FFE500]" />
              <span>
                {loc(
                  'Open Admin Console to Review & Approve',
                  'అడ్మిన్ ప్యానెల్ తెరిచి ఆమోదించండి',
                  'समीक्षा और अनुमोदन के लिए एडमिन कंसोल खोलें'
                )}
              </span>
            </button>
          )}
        </div>
      )}

      {!businesses.length && !businessError && <BusinessCreatePanel onCreated={(business) => { setBusinesses([business]); setSelectedBusinessId(business.id); }} />}
      {businesses.length > 0 && (
        <section aria-label="Business context" className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-brand-teal-tint bg-brand-teal-soft p-3 dark:border-brand-teal-deep dark:bg-brand-navy/20">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-wide text-brand-teal-deep dark:text-brand-teal-light">Business</span>
            {/* The business selector lives above the KPI cards so the active
                business is visible before any dashboard metric. */}
            <BusinessContextBar memberships={businesses} activeBusinessId={selectedBusinessId} onSelect={setSelectedBusinessId} />
          </div>
          <span className="text-[10px] font-semibold text-brand-teal-deep/80 dark:text-brand-teal-light/80">{selectedBusiness?.role || 'Provider account'}</span>
        </section>
      )}
      {businessError && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-2 text-[11px] font-semibold text-amber-800">Business context unavailable: {businessError}. Showing the legacy provider view.</p>}
      {selectedBusiness && selectedBusiness.approval_status !== 'approved' && (
        <section role="alert" className="rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
          <h3 className="text-sm font-black text-amber-900 dark:text-amber-100">Business access is {selectedBusiness.approval_status}</h3>
          <p className="mt-1 text-xs font-semibold text-amber-800 dark:text-amber-200">Protected listings, bookings, payments and reports stay closed until a Super Admin approves or re-enables this business.</p>
        </section>
      )}

      {/* KPI Numbers */}
      {/* Stat strip: the four headline numbers, directly under the breadcrumb. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Provider statistics">
        <ProviderStatCard icon={CheckCircle2} tone="teal" label={loc('Approved Live Posts', 'ఆమోదించబడిన పోస్ట్‌లు', 'स्वीकृत लाइव पोस्ट')} value={activeListings.length} />
        <ProviderStatCard icon={Clock} tone="amber" label={loc('Pending review', 'అడ్మిన్ పరిశీలనలో ఉన్నవి', 'एडमिन समीक्षा लंबित')} value={pendingListings.length} />
        <ProviderStatCard icon={Eye} tone="violet" label={loc('Total Views', 'మొత్తం వీక్షణలు', 'कुल व्यूज')} value={totalViews.toLocaleString()} />
        <ProviderStatCard icon={CalendarCheck2} tone="sky" label={loc('Confirmed Bookings', 'నిర్ధారించబడిన బుకింగ్‌లు', 'पुष्ट बुकिंग')} value={bookings.length} />
      </div>

      <div className="flex justify-end">
        <LiveEditEntryButton
          label={loc('Live Edit listings', 'లిస్టింగ్‌లను లైవ్ ఎడిట్ చేయండి', 'लिस्टिंग लाइव एडिट करें')}
        />
      </div>

      {sectionRail.length > 0 && (
        <nav
          aria-label={activeSubTab === 'stays' ? 'Stay hosting sections' : 'Home services sections'}
          className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]"
        >
          {sectionRail.map(({ key, label, icon: Icon, active, onSelect }) => (
            <button
              key={key}
              type="button"
              aria-current={active ? 'true' : undefined}
              onClick={() => {
                onSelect();
                requestAnimationFrame(() => document.getElementById('provider-workspace-content')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
              }}
              className={`flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[11px] font-bold transition ${active ? 'border-brand-teal-deep bg-brand-teal-deep text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'}`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="whitespace-nowrap">{label}</span>
            </button>
          ))}
        </nav>
      )}

      <div id="provider-workspace-content" className="scroll-mt-64" />
      {/* --- SUBTAB: ANALYTICS & PERFORMANCE (D3 CHARTS) --- */}
      {activeSubTab === 'analytics' && (
        <div className="space-y-5 animate-in fade-in duration-200">
          <div className="bg-gradient-to-r from-brand-navy via-brand-navy-soft to-brand-navy text-white rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-brand-teal/25">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-amber-400 text-slate-950">
                D3.js Powered Business Growth Intelligence
              </span>
              <h3 className="text-base sm:text-lg font-black mt-1.5 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-emerald-400" />
                <span>
                  {loc(
                    'Provider Analytics & Performance Dashboard',
                    'ప్రొవైడర్ అనలిటిక్స్ & పనితీరు డాష్‌బోర్డ్',
                    'प्रोवाइडर एनालिटिक्स और प्रदर्शन डैशबोर्ड'
                  )}
                </span>
              </h3>
              <p className="text-xs text-white/70 mt-0.5">
                {loc(
                  'Track your weekly profile view counts, booking conversion funnel, and enquiry response speed.',
                  'వారాంతపు ప్రొఫైల్ వీక్షణలు, బుకింగ్ కన్వర్షన్ రేట్లు మరియు ఎంక్వైరీ రెస్పాన్స్ సమయాన్ని ట్రాక్ చేయండి.',
                  'साप्ताहिक प्रोफ़ाइल व्यूज, बुकिंग रूपांतरण दर और पूछताछ प्रतिक्रिया समय को ट्रैक करें।'
                )}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center shrink-0">
              <div className="bg-white/10 rounded-2xl px-3 py-2 border border-white/10">
                <div className="text-[10px] text-white/70 font-bold">Conversion</div>
                <div className="text-base font-black text-emerald-400">8.6%</div>
              </div>
              <div className="bg-white/10 rounded-2xl px-3 py-2 border border-white/10">
                <div className="text-[10px] text-white/70 font-bold">Avg Response</div>
                <div className="text-base font-black text-amber-300">4.2m</div>
              </div>
              <div className="bg-white/10 rounded-2xl px-3 py-2 border border-white/10">
                <div className="text-[10px] text-white/70 font-bold">Growth YoY</div>
                <div className="text-base font-black text-sky-300">+34%</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* D3 Chart 1: Profile View Counts (D3 Area & Line Trend Chart) */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-black text-sm text-slate-900 dark:text-white">
                    {loc(
                      '1. Weekly Profile View Counts (D3 Area & Line Chart)',
                      '1. వారపు ప్రొఫైల్ వీక్షణల సంఖ్య (D3 చార్ట్)',
                      '1. साप्ताहिक प्रोफ़ाइल व्यूज (D3 चार्ट)'
                    )}
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Daily unique impressions across all active provider cards
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-brand-teal-soft dark:bg-brand-navy/60 text-brand-teal-deep dark:text-brand-teal-light text-xs font-black">
                  {totalViews.toLocaleString()} Total Views
                </span>
              </div>

              <div className="w-full overflow-x-auto">
                <svg
                  viewBox={`0 0 ${d3Analytics.width} ${d3Analytics.height}`}
                  className="w-full h-44 overflow-visible"
                >
                  <defs>
                    <linearGradient id="d3ViewsGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#7C3AED" stopOpacity="0.38" />
                      <stop offset="100%" stopColor="#7C3AED" stopOpacity="0.02" />
                    </linearGradient>
                  </defs>
                  {/* Area under curve */}
                  <path d={d3Analytics.areaPath} fill="url(#d3ViewsGrad)" />
                  {/* Smooth D3 Line */}
                  <path
                    d={d3Analytics.linePath}
                    fill="none"
                    stroke="#7C3AED"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                  {/* Data Points & Labels */}
                  {d3Analytics.points.map((pt) => (
                    <g key={pt.day}>
                      <circle
                        cx={pt.cx}
                        cy={pt.cy}
                        r="4.5"
                        fill="#FFFFFF"
                        stroke="#4338CA"
                        strokeWidth="2.5"
                      />
                      <text
                        x={pt.cx}
                        y={pt.cy - 9}
                        textAnchor="middle"
                        className="text-[9px] font-black fill-slate-700 dark:fill-slate-200"
                      >
                        {pt.views}
                      </text>
                      <text
                        x={pt.cx}
                        y={d3Analytics.height - 8}
                        textAnchor="middle"
                        className="text-[10px] font-bold fill-slate-400"
                      >
                        {pt.day}
                      </text>
                    </g>
                  ))}
                </svg>
              </div>
            </div>

            {/* D3 Chart 2: Booking Conversion Rates Funnel */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-black text-sm text-slate-900 dark:text-white">
                    {loc(
                      '2. Booking Conversion Rate Funnel (D3 Scale)',
                      '2. బుకింగ్ కన్వర్షన్ రేట్ ఫన్నెల్ (D3 స్కేల్)',
                      '2. बुकिंग रूपांतरण दर फ़नल (D3 स्केल)'
                    )}
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    End-to-end conversion from discovery to confirmed booking
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-xs font-black">
                  8.6% Net Conversion
                </span>
              </div>

              <div className="space-y-3 pt-1">
                {d3Analytics.conversionStages.map((st) => (
                  <div key={st.stage} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-700 dark:text-slate-200">
                        {st.stage}
                      </span>
                      <span className="font-black text-slate-900 dark:text-white tabular-nums">
                        {st.count.toLocaleString()} ({st.rate}%)
                      </span>
                    </div>
                    <div className="w-full h-3 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${ Math.max(d3Analytics.funnelScale(st.rate), 8)}%`,
                          backgroundColor: st.color,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* D3 Chart 3: Enquiry Response Times & Impact on Conversion */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h4 className="font-black text-sm text-slate-900 dark:text-white">
                  {loc(
                    '3. Enquiry Response Time Distribution (D3 Horizontal Bar Chart)',
                    '3. ఎంక్వైరీ రెస్పాన్స్ సమయం & బుకింగ్ ప్రభావం',
                    '3. पूछताछ प्रतिक्रिया समय वितरण'
                  )}
                </h4>
                <p className="text-[11px] text-slate-500">
                  Responding within 5 minutes increases booking confirmation by 3.4×
                </p>
              </div>
              <span className="px-3 py-1 rounded-full bg-brand-teal-soft dark:bg-brand-navy/70 text-brand-teal-deep dark:text-brand-teal-light text-xs font-black">
                ⚡ 85% Answered Under 15 Mins
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
              {d3Analytics.responseBuckets.map((b) => (
                <div
                  key={b.bucket}
                  className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 space-y-2"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-black text-slate-800 dark:text-slate-200">
                      {b.bucket}
                    </span>
                    <span
                      className="font-black text-xs px-2 py-0.5 rounded-full text-white"
                      style={{ backgroundColor: b.color }}
                    >
                      {b.pct}%
                    </span>
                  </div>
                  <div className="w-full h-2.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(d3Analytics.respScale(b.pct), 100)}%`,
                        backgroundColor: b.color,
                      }}
                    />
                  </div>
                  <div className="text-[11px] text-slate-500 flex items-center justify-between">
                    <span>Booking Conv. Rate:</span>
                    <strong className="text-slate-900 dark:text-white">{b.avgConversion}</strong>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeSubTab === 'stays' && (activeStaysBusiness
        ? <StaysOwnerAdminDashboard role={supabaseProfile?.role} section={activeStaySection} onSectionChange={setStaySection} sections={(staySectionKeys as StayOwnerSection[] | null) || undefined} />
        : <MissingModuleBusiness
            heading="Stays"
            description="A stays business holds your properties, rooms, rates and reservations."
            module="hotel_stay"
            onCreated={(business) => { setBusinesses((current) => [...current, business]); setSelectedBusinessId(business.id); }}
          />)}

      {activeSubTab === 'services' && (activeServicesBusiness
        ? <ServicesProviderDashboard role={supabaseProfile?.role} section={activeServiceSection} onSectionChange={setServiceSection} />
        : <MissingModuleBusiness
            heading="Home services"
            description="A services business holds your service listings, workers and job bookings."
            module="services"
            onCreated={(business) => { setBusinesses((current) => [...current, business]); setSelectedBusinessId(business.id); }}
          />)}

      {activeSubTab === 'pg_inventory' && (
        <PgProviderWorkspace
          // Keep the complete PG owner dashboard visible while a provider is
          // still completing PG onboarding. The API receives the business id
          // when one exists and continues to enforce ownership server-side.
          businessId={activePgBusiness?.id}
          businessRole={activePgBusiness?.role}
          businesses={pgBusinesses}
          onSelectBusiness={setSelectedBusinessId}
          onAddProperty={onOpenPostWizard}
          onSwitchToMarketplace={onSwitchToMarketplace}
          onSignOut={onSignOut}
        />
      )}

      {activeSubTab === 'team' && <BusinessStaffPanel businessId={selectedBusinessId || undefined} canInvite={['owner', 'manager'].includes(String(selectedBusiness?.role || ''))} />}

      {activeSubTab === 'institute' && (activeInstituteBusiness
        ? <InstituteOwnerDashboard onSwitchToMarketplace={onSwitchToMarketplace} />
        : <MissingModuleBusiness
            heading="Institute"
            description="An institute business holds your courses, batches, faculty and enrollments."
            module="classes"
            onCreated={(business) => { setBusinesses((current) => [...current, business]); setSelectedBusinessId(business.id); }}
          />)}

      {/* --- SUBTAB 1: MY LISTINGS --- */}
      {activeSubTab === 'listings' && (
        <div className="space-y-3">
          {businessListings.map(listing => (
            <div
              key={listing.id}
              className={`bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                listing.status === 'pending_approval'
                  ? 'border-2 border-amber-400 dark:border-amber-600 bg-amber-50/30 dark:bg-amber-950/20'
                  : listing.status === 'rejected'
                  ? 'border-rose-300 dark:border-rose-800 opacity-75'
                  : 'border-slate-200 dark:border-slate-800'
              }`}
            >
              <div className="flex items-start gap-3.5 min-w-0">
                <SafeImage category="general"
                  src={listing.images[0]}
                  alt="thumb"
                  className="w-16 h-16 rounded-2xl object-cover shrink-0 bg-slate-100"
                />
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {listing.status === 'pending_approval' ? (
                      <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-amber-400 text-slate-950 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>
                          {loc(
                            '⏳ PENDING ADMIN APPROVAL (Hidden from App until Approved)',
                            '⏳ అడ్మిన్ ఆమోదం పెండింగ్ (ఆమోదించే వరకు యాప్‌లో కనిపించదు)',
                            '⏳ एडमिन अनुमोदन लंबित (स्वीकृत होने तक ऐप से छिपा हुआ)'
                          )}
                        </span>
                      </span>
                    ) : listing.status === 'active' ? (
                      <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>
                          {loc(
                            '✅ APPROVED BY ADMIN • LIVE IN APPLICATION',
                            '✅ అడ్మిన్ ఆమోదించారు • యాప్‌లో ప్రత్యక్ష ప్రసారం',
                            '✅ एडमिन द्वारा स्वीकृत • एप्लिकेशन में लाइव'
                          )}
                        </span>
                      </span>
                    ) : (
                      <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 flex items-center gap-1">
                        <XCircle className="w-3 h-3" />
                        <span>
                          {loc(
                            '❌ REJECTED BY ADMIN',
                            '❌ అడ్మిన్ తిరస్కరించారు',
                            '❌ एडमिन द्वारा अस्वीकृत'
                          )}
                        </span>
                      </span>
                    )}

                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-teal-tint text-brand-teal-deep dark:bg-brand-navy dark:text-brand-teal-light">
                      {getSubcategoryDisplayName(listing.subcategory, currentLang)}
                    </span>

                    {listing.images.length > 1 && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center gap-1">
                        <ImageIcon className="w-3 h-3" />
                        <span>
                          {listing.images.length} {loc('Photos', 'ఫోటోలు', 'तस्वीरें')}
                        </span>
                      </span>
                    )}
                  </div>

                  <h4 className="font-extrabold text-sm text-slate-900 dark:text-white truncate">
                    {currentLang === 'en'
                      ? listing.title
                      : currentLang === 'te' && listing.titleTe
                      ? listing.titleTe
                      : transliterateLatinToScript(listing.title, currentLang)}
                  </h4>

                  <div className="text-xs text-slate-500 flex items-center gap-4 flex-wrap">
                    <span className="font-bold text-slate-900 dark:text-white">
                      ₹{listing.price} {getPriceUnitDisplayName(listing.priceUnit, currentLang)}
                    </span>
                    <span>
                      {loc('Provider:', 'ప్రొవైడర్:', 'प्रोवाइडर:')}{' '}
                      {currentLang === 'en'
                        ? listing.providerName
                        : transliterateLatinToScript(listing.providerName, currentLang)}{' '}
                      (📞 {listing.providerPhone})
                    </span>
                    <span className="flex items-center gap-1">
                      <Eye className="w-3.5 h-3.5" />
                      <span>
                        {listing.viewsCount} {loc('views', 'వీక్షణలు', 'व्यूज')}
                      </span>
                    </span>
                  </div>

                  {/* Provider Listing Verification Barcode Badge */}
                  <div className="pt-1.5 max-w-md">
                    <UniversalBarcode
                      value={generateBosBarcodeId('BOS', listing.id, listing.categoryId)}
                      label={getBarcodePassTitle(listing.categoryId)}
                      sublabel={`${listing.title} • ₹${listing.price}`}
                      moduleTag={listing.categoryId}
                      variant="badge"
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 shrink-0">
                {listing.status === 'pending_approval' && onSwitchToAdminReview ? (
                  <button
                    onClick={onSwitchToAdminReview}
                    className="px-3.5 py-2 rounded-xl bg-[#4338CA] hover:bg-brand-teal-hover text-white text-xs font-black flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-[#FFE500]" />
                    <span>
                      {loc(
                        'Review in Admin Console',
                        'అడ్మిన్ ప్యానెల్‌లో సమీక్షించండి',
                        'एडमिन कंसोल में समीक्षा करें'
                      )}
                    </span>
                  </button>
                ) : (
                  <button
                    onClick={() => toggleFeaturedListing(listing.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                      listing.isFeatured
                        ? 'bg-amber-400 text-slate-950'
                        : 'border border-amber-300 text-amber-800 dark:text-amber-300 hover:bg-amber-50'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>
                      {listing.isFeatured
                        ? loc('Featured Boost ✓', 'ఫీచర్డ్ బూస్ట్ ✓', 'फीचर्ड बूस्ट ✓')
                        : loc('Boost Post (₹99)', 'పోస్ట్ బూస్ట్ (₹99)', 'पोस्ट बूस्ट (₹99)')}
                    </span>
                  </button>
                )}

                <button
                  onClick={() => deleteListing(listing.id)}
                  className="p-2 text-slate-400 hover:text-red-600 transition-colors cursor-pointer"
                  title={loc('Delete post', 'పోస్ట్ తొలగించు', 'पोस्ट हटाएं')}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* --- SUBTAB 2: CUSTOMER ENQUIRIES & CHATS --- */}
      {activeSubTab === 'enquiries' && (
        <div className="space-y-3">
          {enquiries.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl text-center border border-slate-200 dark:border-slate-800 text-xs text-slate-400">
              {loc('No enquiries received yet.', 'ఇంకా ఎంక్వైరీలు రాలేదు.', 'अभी तक कोई पूछताछ नहीं मिली है।')}
            </div>
          ) : (
            enquiries.map(enq => (
              <div
                key={enq.id}
                className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-1 max-w-xl">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold bg-brand-teal-tint text-brand-teal-deep dark:bg-brand-navy dark:text-brand-teal-light px-2 py-0.5 rounded-full">
                      {loc('Lead from:', 'కస్టమర్:', 'ग्राहक:')} {enq.customerName}
                    </span>
                    <span className="text-[11px] text-slate-400">{enq.timestamp}</span>
                  </div>
                  <h5 className="font-bold text-xs text-slate-700 dark:text-slate-300">
                    {loc('Regarding:', 'లిస్టింగ్:', 'संबंधित:')} "{enq.listingTitle}"
                  </h5>
                  <p className="text-xs text-slate-900 dark:text-white font-medium bg-slate-50 dark:bg-slate-800 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700">
                    "{enq.message}"
                  </p>
                  <div className="text-xs text-slate-500 font-semibold tabular-nums">
                    📞 {loc('Customer Phone:', 'కస్టమర్ ఫోన్:', 'ग्राहक फोन:')} {enq.customerPhone}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onOpenChatWithCustomer(enq.customerId, enq.customerName, enq.listingTitle)}
                    className="py-2 px-3.5 rounded-xl bg-brand-teal-hover hover:bg-brand-teal-hover text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>{loc('Open Live Chat', 'లైవ్ చాట్ తెరవండి', 'लाइव चैट खोलें')}</span>
                  </button>

                  <a
                    href={`tel:${enq.customerPhone}`}
                    className="py-2 px-3.5 rounded-xl border border-slate-300 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1"
                  >
                    <Phone className="w-3.5 h-3.5 text-emerald-600" />
                    <span>{loc('Call Customer', 'కాల్ చేయండి', 'कॉल करें')}</span>
                  </a>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* --- SUBTAB 3: BOOKINGS & APPLICATIONS --- */}
      {activeSubTab === 'bookings' && (
        <div className="space-y-3">
          {bookings.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl text-center border border-slate-200 dark:border-slate-800 text-xs text-slate-400">
              {loc('No confirmed bookings yet.', 'ఇంకా బుకింగ్‌లు లేవు.', 'अभी तक कोई बुकिंग नहीं है।')}
            </div>
          ) : (
            bookings.map(b => (
              <div
                key={b.id}
                className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 px-2 py-0.5 rounded-full">
                      {loc('CONFIRMED APPOINTMENT', 'నిర్ధారించబడిన బుకింగ్', 'पुष्ट अपॉइंटमेंट')}
                    </span>
                    <span className="text-xs text-slate-400">{b.createdAt}</span>
                  </div>
                  <h4 className="font-extrabold text-sm text-slate-900 dark:text-white">
                    {b.listingTitle}
                  </h4>
                  <div className="text-xs text-slate-600 dark:text-slate-400 space-y-0.5">
                    <div>
                      {loc('Customer:', 'కస్టమర్:', 'ग्राहक:')} <strong>{b.customerName}</strong> ({b.customerPhone})
                    </div>
                    <div>
                      {loc('Scheduled Slot:', 'సమయం:', 'समय:')} <strong>{b.scheduledDate} · {b.timeSlot}</strong>
                    </div>
                    {b.customerAddress && (
                      <div>
                        {loc('Address:', 'చిరునామా:', 'पता:')} {b.customerAddress}
                      </div>
                    )}
                    {b.notes && <div className="italic text-slate-500">"{b.notes}"</div>}
                  </div>
                </div>

                <div className="flex flex-col sm:items-end gap-2 shrink-0">
                  <div className="text-right">
                    <div className="text-xs text-slate-400">
                      {loc('Total Booking Value', 'మొత్తం బుకింగ్ విలువ', 'कुल बुकिंग मूल्य')}
                    </div>
                    <div className="text-lg font-black text-slate-900 dark:text-white tabular-nums">
                      ₹{b.totalAmount}
                    </div>
                  </div>
                  <div className="w-full sm:w-64">
                    <UniversalBarcode
                      value={generateBosBarcodeId('TKT', `${b.listingId}-${b.id}`, b.listingId)}
                      label="Customer Booking Pass Barcode"
                      sublabel={`${b.customerName} • ${b.scheduledDate}`}
                      variant="compact"
                      showQr={false}
                    />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* --- SUBTAB 4: POSTING PLANS & UPGRADES --- */}
      {activeSubTab === 'plans' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {postingPlans.filter(p => p.isActive).map(plan => (
            <div
              key={plan.id}
              className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between space-y-4"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-black text-base text-slate-900 dark:text-white">
                    {loc(plan.name)}
                  </h4>
                  {plan.isPopular && (
                    <span className="text-[10px] font-bold bg-amber-400 text-slate-950 px-2 py-0.5 rounded-full">
                      {loc('POPULAR', 'ప్రజాదరణ', 'लोकप्रिय')}
                    </span>
                  )}
                </div>

                <div className="text-3xl font-black text-brand-teal-deep dark:text-brand-teal-light tabular-nums">
                  ₹{plan.price}
                  <span className="text-xs font-normal text-slate-400">/{loc(plan.billingPeriod)}</span>
                </div>

                <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                  {plan.perks.map((perk, i) => (
                    <div key={i} className="flex items-center gap-2 text-slate-600 dark:text-slate-300 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>{loc(perk)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={() => onOpenPaymentModal(plan.name, plan.price)}
                className="w-full py-3 bg-[#4A148C] hover:bg-brand-teal-hover text-white font-black text-xs sm:text-sm rounded-xl shadow-md transition-colors cursor-pointer"
              >
                {loc(`Upgrade to ${plan.name}`, `${plan.name} కు అప్‌గ్రేడ్ చేయండి`, `${plan.name} में अपग्रेड करें`)}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* --- SUBTAB 5: DIGITAL VISITING CARD & GATE PASS VERIFIER STUDIO --- */}
      {activeSubTab === 'visiting_card' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <CraftoPosterGenerator
            currentLang={currentLang === 'te' ? 'te' : 'en'}
            userName={supabaseProfile?.full_name || businessListings[0]?.providerName || 'NARENDRA'}
            userPhone={supabaseProfile?.phone || businessListings[0]?.providerPhone || '98480 12345'}
            userAvatar={
              businessListings[0]?.providerAvatar ||
              supabaseProfile?.avatar_url ||
              '/assets/optimized/profile-avatar-256.webp'
            }
            onEditProfileClick={onOpenPostWizard}
          />

          <StandaloneBarcodeVerifierHub
            sampleCodes={bookings.slice(0, 6).map((b) => ({
              code: generateBosBarcodeId('TKT', `${b.listingId}-${b.id}`, b.listingId),
              title: `${b.listingTitle} (${b.customerName})`,
              section: b.listingId,
            }))}
          />
        </div>
      )}
    </div>
    </ProviderPortalShell>
  );
};
