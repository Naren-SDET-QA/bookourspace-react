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
  BarChart3,
  TrendingUp,
  Hotel,
  BedDouble,
  BriefcaseBusiness,
  GraduationCap,
} from 'lucide-react';
import { useMarketplace } from '../context/MarketplaceContext';
import { AppLanguage, getSubcategoryDisplayName, getPriceUnitDisplayName } from '../utils/translations';
import { transliterateLatinToScript } from '../utils/i18nEngine';
import { UniversalBarcode, StandaloneBarcodeVerifierHub, generateBosBarcodeId, getBarcodePassTitle } from './UniversalBarcode';
import { CraftoPosterGenerator } from './CraftoPosterGenerator';
import { LiveEditEntryButton } from './liveEdit/LiveEditEntryButton';
import HostStayWorkspace from './HostStayWorkspace';
import PgProviderWorkspace from './PgProviderWorkspace';
import InstituteOwnerDashboard from './InstituteOwnerDashboard';
import StaysOwnerAdminDashboard from './StaysOwnerAdminDashboard';
import ServicesProviderDashboard from './ServicesProviderDashboard';
import type { ProviderPortalModule } from './ProviderPortalShell';

interface ProviderDashboardProps {
  onOpenPostWizard: () => void;
  onOpenPaymentModal: (planName: string, amount: number) => void;
  onOpenChatWithCustomer: (customerId: string, customerName: string, listingTitle: string) => void;
  onSwitchToAdminReview?: () => void;
  onSwitchToMarketplace?: () => void;
  currentLang?: AppLanguage;
  initialWorkspace?: 'pg' | 'institute';
}

export const ProviderDashboard: React.FC<ProviderDashboardProps> = ({
  onOpenPostWizard,
  onOpenPaymentModal,
  onOpenChatWithCustomer,
  onSwitchToAdminReview,
  onSwitchToMarketplace,
  currentLang = 'en',
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
  const myListings = [...listings].sort((a, b) => {
    if (a.status === 'pending_approval' && b.status !== 'pending_approval') return -1;
    if (a.status !== 'pending_approval' && b.status === 'pending_approval') return 1;
    return 0;
  });

  const pendingListings = myListings.filter(l => l.status === 'pending_approval');
  const activeListings = myListings.filter(l => l.status === 'active');

  const totalViews = myListings.reduce((sum, l) => sum + l.viewsCount, 0);

  const [activeSubTab, setActiveSubTab] = useState<'listings' | 'enquiries' | 'bookings' | 'analytics' | 'plans' | 'visiting_card' | 'stays' | 'services' | 'pg_inventory' | 'institute'>('pg_inventory');

  const navigatePortalModule = (module: ProviderPortalModule) => {
    const mapping: Partial<Record<ProviderPortalModule, typeof activeSubTab>> = {
      pg: 'pg_inventory', stays: 'stays', services: 'services', institute: 'institute', listings: 'listings', reports: 'analytics',
    };
    const target = mapping[module];
    if (target) setActiveSubTab(target);
  };

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
    <div className="space-y-6 pb-24">
      {/* Pending Admin Approval Alert Banner (Display only for Admin) */}
      {pendingListings.length > 0 && onSwitchToAdminReview && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-400 dark:border-amber-700 rounded-3xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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
              className="px-4 py-2.5 rounded-xl bg-[#4338CA] hover:bg-indigo-800 text-white text-xs font-black flex items-center gap-1.5 shrink-0 shadow-md cursor-pointer"
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

      {/* KPI Numbers */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            {loc('Approved Live Posts', 'ఆమోదించబడిన పోస్ట్‌లు', 'स्वीकृत लाइव पोस्ट')}
          </span>
          <div className="text-2xl font-black text-emerald-600 mt-1 tabular-nums">
            {activeListings.length}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            {loc('Pending Admin Review', 'అడ్మిన్ పరిశీలనలో ఉన్నవి', 'एडमिन समीक्षा लंबित')}
          </span>
          <div className="text-2xl font-black text-amber-500 mt-1 tabular-nums">
            {pendingListings.length}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            {loc('Total Views', 'మొత్తం వీక్షణలు', 'कुल व्यूज')}
          </span>
          <div className="text-2xl font-black text-purple-700 dark:text-purple-300 mt-1 tabular-nums">
            {totalViews.toLocaleString()}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            {loc('Confirmed Bookings', 'నిర్ధారించబడిన బుకింగ్‌లు', 'पुष्ट बुकिंग')}
          </span>
          <div className="text-2xl font-black text-indigo-600 mt-1 tabular-nums">
            {bookings.length}
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <LiveEditEntryButton
          label={loc('Live Edit listings', 'లిస్టింగ్‌లను లైవ్ ఎడిట్ చేయండి', 'लिस्टिंग लाइव एडिट करें')}
        />
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-4 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setActiveSubTab('pg_inventory')}
          className={`pb-3 text-xs sm:text-sm font-bold border-b-2 transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
            activeSubTab === 'pg_inventory'
              ? 'border-purple-600 text-purple-700 dark:text-purple-400'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
          data-testid="provider-pg-inventory-tab"
        >
          <BedDouble className="w-4 h-4 text-violet-600" />
          <span>PG Owner Dashboard</span>
        </button>

        <button
          onClick={() => setActiveSubTab('institute')}
          className={`pb-3 text-xs sm:text-sm font-bold border-b-2 transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
            activeSubTab === 'institute'
              ? 'border-[#ff385c] text-[#e31c5f]'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
          data-testid="provider-institute-workspace-tab"
        >
          <GraduationCap className="w-4 h-4 text-[#ff385c]" />
          <span>Institute workspace</span>
        </button>

        <button
          onClick={() => setActiveSubTab('listings')}
          className={`pb-3 text-xs sm:text-sm font-bold border-b-2 transition-all whitespace-nowrap cursor-pointer ${
            activeSubTab === 'listings'
              ? 'border-purple-600 text-purple-700 dark:text-purple-400'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          {loc(
            `My Provider Listings (${myListings.length})`,
            `నా ప్రొవైడర్ లిస్టింగ్‌లు (${myListings.length})`,
            `मेरी प्रोवाइडर लिस्टिंग (${myListings.length})`
          )}
        </button>

        <button
          onClick={() => setActiveSubTab('analytics')}
          className={`pb-3 text-xs sm:text-sm font-bold border-b-2 transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
            activeSubTab === 'analytics'
              ? 'border-purple-600 text-purple-700 dark:text-purple-400'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <BarChart3 className="w-4 h-4 text-purple-600" />
          <span>
            {loc(
              'Analytics & Performance (D3)',
              'అనలిటిక్స్ & పనితీరు (D3)',
              'एनालिटिक्स और प्रदर्शन (D3)'
            )}
          </span>
        </button>

        <button
          onClick={() => setActiveSubTab('enquiries')}
          className={`pb-3 text-xs sm:text-sm font-bold border-b-2 transition-all whitespace-nowrap cursor-pointer ${
            activeSubTab === 'enquiries'
              ? 'border-purple-600 text-purple-700 dark:text-purple-400'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          {loc(
            `Customer Enquiries & Chats (${enquiries.length})`,
            `కస్టమర్ ఎంక్వైరీలు & చాట్‌లు (${enquiries.length})`,
            `ग्राहक पूछताछ और चैट (${enquiries.length})`
          )}
        </button>

        <button
          onClick={() => setActiveSubTab('bookings')}
          className={`pb-3 text-xs sm:text-sm font-bold border-b-2 transition-all whitespace-nowrap cursor-pointer ${
            activeSubTab === 'bookings'
              ? 'border-purple-600 text-purple-700 dark:text-purple-400'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          {loc(
            `Bookings & Applications (${bookings.length})`,
            `బుకింగ్‌లు & దరఖాస్తులు (${bookings.length})`,
            `बुकिंग और आवेदन (${bookings.length})`
          )}
        </button>

        <button
          onClick={() => setActiveSubTab('plans')}
          className={`pb-3 text-xs sm:text-sm font-bold border-b-2 transition-all whitespace-nowrap cursor-pointer ${
            activeSubTab === 'plans'
              ? 'border-purple-600 text-purple-700 dark:text-purple-400'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          {loc(
            'Posting Plans & Upgrades',
            'పోస్టింగ్ ప్లాన్‌లు & అప్‌గ్రేడ్‌లు',
            'पोस्टिंग प्लान और अपग्रेड'
          )}
        </button>

        <button
          onClick={() => setActiveSubTab('visiting_card')}
          className={`pb-3 text-xs sm:text-sm font-bold border-b-2 transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
            activeSubTab === 'visiting_card'
              ? 'border-purple-600 text-purple-700 dark:text-purple-400'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <Sparkles className="w-4 h-4 text-amber-500" />
          <span>
            {loc(
              'Digital Visiting Card Studio',
              'డిజిటల్ విజిటింగ్ కార్డ్ స్టూడియో',
              'डिजिटल विजिटिंग कार्ड स्टूडियो'
            )}
          </span>
        </button>

        <button
          onClick={() => setActiveSubTab('stays')}
          className={`pb-3 text-xs sm:text-sm font-bold border-b-2 transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
            activeSubTab === 'stays'
              ? 'border-purple-600 text-purple-700 dark:text-purple-400'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <Hotel className="w-4 h-4 text-purple-600" />
          <span>Stay hosting</span>
        </button>

        <button
          onClick={() => setActiveSubTab('services')}
          className={`pb-3 text-xs sm:text-sm font-bold border-b-2 transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
            activeSubTab === 'services'
              ? 'border-[#527a40] text-[#527a40]'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
          data-testid="provider-services-dashboard-tab"
        >
          <BriefcaseBusiness className="w-4 h-4 text-[#527a40]" />
          <span>Home services</span>
        </button>
      </div>

      {/* --- SUBTAB: ANALYTICS & PERFORMANCE (D3 CHARTS) --- */}
      {activeSubTab === 'analytics' && (
        <div className="space-y-5 animate-in fade-in duration-200">
          <div className="bg-gradient-to-r from-indigo-950 via-purple-950 to-slate-900 text-white rounded-3xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-purple-700/40">
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
              <p className="text-xs text-purple-200 mt-0.5">
                {loc(
                  'Track your weekly profile view counts, booking conversion funnel, and enquiry response speed.',
                  'వారాంతపు ప్రొఫైల్ వీక్షణలు, బుకింగ్ కన్వర్షన్ రేట్లు మరియు ఎంక్వైరీ రెస్పాన్స్ సమయాన్ని ట్రాక్ చేయండి.',
                  'साप्ताहिक प्रोफ़ाइल व्यूज, बुकिंग रूपांतरण दर और पूछताछ प्रतिक्रिया समय को ट्रैक करें।'
                )}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center shrink-0">
              <div className="bg-white/10 rounded-2xl px-3 py-2 border border-white/10">
                <div className="text-[10px] text-purple-200 font-bold">Conversion</div>
                <div className="text-base font-black text-emerald-400">8.6%</div>
              </div>
              <div className="bg-white/10 rounded-2xl px-3 py-2 border border-white/10">
                <div className="text-[10px] text-purple-200 font-bold">Avg Response</div>
                <div className="text-base font-black text-amber-300">4.2m</div>
              </div>
              <div className="bg-white/10 rounded-2xl px-3 py-2 border border-white/10">
                <div className="text-[10px] text-purple-200 font-bold">Growth YoY</div>
                <div className="text-base font-black text-sky-300">+34%</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* D3 Chart 1: Profile View Counts (D3 Area & Line Trend Chart) */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-3">
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
                <span className="px-2.5 py-1 rounded-full bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 text-xs font-black">
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
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-3">
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
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-3">
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
              <span className="px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 text-xs font-black">
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

      {activeSubTab === 'stays' && <StaysOwnerAdminDashboard role={supabaseProfile?.role} onNavigate={navigatePortalModule} />}

      {activeSubTab === 'services' && <ServicesProviderDashboard role={supabaseProfile?.role} onNavigate={navigatePortalModule} />}

      {activeSubTab === 'pg_inventory' && <PgProviderWorkspace onAddProperty={onOpenPostWizard} onSwitchToMarketplace={onSwitchToMarketplace} />}

      {activeSubTab === 'institute' && <InstituteOwnerDashboard onSwitchToMarketplace={onSwitchToMarketplace} />}

      {/* --- SUBTAB 1: MY LISTINGS --- */}
      {activeSubTab === 'listings' && (
        <div className="space-y-3">
          {myListings.map(listing => (
            <div
              key={listing.id}
              className={`bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-3xl border shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
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

                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300">
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
                    className="px-3.5 py-2 rounded-xl bg-[#4338CA] hover:bg-indigo-800 text-white text-xs font-black flex items-center gap-1.5 shadow-xs cursor-pointer"
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
            <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl text-center border border-slate-200 dark:border-slate-800 text-xs text-slate-400">
              {loc('No enquiries received yet.', 'ఇంకా ఎంక్వైరీలు రాలేదు.', 'अभी तक कोई पूछताछ नहीं मिली है।')}
            </div>
          ) : (
            enquiries.map(enq => (
              <div
                key={enq.id}
                className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-1 max-w-xl">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 px-2 py-0.5 rounded-full">
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
                    className="py-2 px-3.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
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
            <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl text-center border border-slate-200 dark:border-slate-800 text-xs text-slate-400">
              {loc('No confirmed bookings yet.', 'ఇంకా బుకింగ్‌లు లేవు.', 'अभी तक कोई बुकिंग नहीं है।')}
            </div>
          ) : (
            bookings.map(b => (
              <div
                key={b.id}
                className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4"
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
              className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between space-y-4"
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

                <div className="text-3xl font-black text-purple-900 dark:text-purple-300 tabular-nums">
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
                className="w-full py-3 bg-[#4A148C] hover:bg-purple-900 text-white font-black text-xs sm:text-sm rounded-xl shadow-md transition-colors cursor-pointer"
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
            userName={supabaseProfile?.full_name || myListings[0]?.providerName || 'NARENDRA'}
            userPhone={supabaseProfile?.phone || myListings[0]?.providerPhone || '98480 12345'}
            userAvatar={
              myListings[0]?.providerAvatar ||
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
  );
};
