import { MarketSectionType } from '../data/servicesStayMoviesData';
import { appendAdminAuditLog } from './adminEnterpriseStore';

export type CustomerPageId = MarketSectionType; // 'pg_hostels' | 'classes' | 'venues' | 'services' | 'hotel_stay' | 'movies'

export interface EditablePageSectionItem {
  id:
    | 'top_announcements'
    | 'custom_page_hero'
    | 'spotlight_subcategories'
    | 'filter_and_quick_actions'
    | 'spotlight_showcase'
    | 'trending_near_me'
    | 'search_date_range_filter'
    | 'listings_grid'
    | 'recently_viewed';
  label: string;
  visible: boolean;
  order: number;
}

export interface EditableHeroBannerConfig {
  visible: boolean;
  badgeText: string;
  headline: string;
  subheadline: string;
  imageUrl: string;
  ctaButtonText: string;
  ctaButtonLinkOrAction: string;
  secondaryButtonText: string;
  bgColorFrom: string;
  bgColorTo: string;
  textColor: string;
}

export interface EditablePageLabelsAndButtons {
  pageHeadingTitle: string;
  pageSubheading: string;
  primaryBookButtonLabel: string;
  secondaryEnquireButtonLabel: string;
  filterButtonLabel: string;
  postFreeListingButtonLabel: string;
  emptyStateTitle: string;
  emptyStateSubtitle: string;
  promoRibbonText: string;
  promoRibbonLink: string;
}

export interface EditableCategoryItemOverride {
  id: string;
  label: string;
  icon: string;
  visible: boolean;
  featuredBadge?: string;
}

export interface EditableFormOptionGroup {
  id: string;
  fieldLabel: string;
  fieldType: 'select' | 'radio' | 'checkbox' | 'chips';
  required: boolean;
  options: string[];
}

export interface InspectedDomElementOverride {
  selectorKey: string;
  tagName: string;
  pageId: CustomerPageId;
  originalText: string;
  customText?: string;
  customImageUrl?: string;
  customHref?: string;
  customBgColor?: string;
  customTextColor?: string;
  hidden?: boolean;
  updatedAt: string;
}

export interface SingleCustomerPageConfig {
  pageId: CustomerPageId;
  pageName: string;
  icon: string;
  heroBanner: EditableHeroBannerConfig;
  labelsAndButtons: EditablePageLabelsAndButtons;
  sections: EditablePageSectionItem[];
  colors: {
    primaryColor: string;
    accentColor: string;
    cardBorderColor: string;
    badgeBgColor: string;
    buttonRadius: 'rounded-lg' | 'rounded-xl' | 'rounded-2xl' | 'rounded-full';
  };
  categories: EditableCategoryItemOverride[];
  formOptions: EditableFormOptionGroup[];
}

export interface LivePageEditorConfig {
  versionId: string;
  lastPublishedAt: string;
  publishedBy: string;
  globalBrandName: string;
  globalTagline: string;
  globalAnnouncementBarText: string;
  globalSupportLink: string;
  pages: Record<CustomerPageId, SingleCustomerPageConfig>;
  domOverrides: Record<string, InspectedDomElementOverride>;
}

export interface LivePageVersionSnapshot {
  versionId: string;
  versionNumber: number;
  publishedAt: string;
  publishedBy: string;
  summary: string;
  platforms: string[];
  configSnapshot: LivePageEditorConfig;
}

export interface LivePageAuditEntry {
  id: string;
  timestamp: string;
  actor: string;
  role: string;
  action: string;
  pageId: string;
  details: string;
  versionId?: string;
}

const STORAGE_KEYS = {
  PUBLISHED: 'bos_live_page_editor_published_v1',
  DRAFT: 'bos_live_page_editor_draft_v1',
  VERSIONS: 'bos_live_page_editor_versions_v1',
  AUDIT: 'bos_live_page_editor_audit_v1',
};

const createDefaultSections = (pageId: CustomerPageId): EditablePageSectionItem[] => [
  {
    id: 'top_announcements',
    label: 'Scheduled Top Announcements Banner',
    visible: true,
    order: 1,
  },
  {
    id: 'custom_page_hero',
    label: 'Live Admin Custom Page Hero Banner',
    visible: false,
    order: 2,
  },
  {
    id: 'spotlight_subcategories',
    label: 'Spotlight Subcategories Ribbon (స్పాట్లైట్ సబ్-కేటగిరీలు — Optional All 6 Modules)',
    visible: false, // Optional by default across all 6 modules; Admin can enable/disable
    order: 3,
  },
  {
    id: 'filter_and_quick_actions',
    label: 'Filter Bar, Locality Selector & Quick Action Buttons',
    visible: true,
    order: 4,
  },
  {
    id: 'spotlight_showcase',
    label: '3-Card Animated Spotlight Showcase',
    visible: true,
    order: 5,
  },
  {
    id: 'trending_near_me',
    label: 'Trending Near Me Carousel (Venues & Featured)',
    visible: pageId === 'venues',
    order: 6,
  },
  {
    id: 'search_date_range_filter',
    label: 'Search Results & Date-Range Availability Filter',
    visible: false, // Disabled by default per Admin preference
    order: 7,
  },
  {
    id: 'listings_grid',
    label: 'Customer Marketplace Listings Feed Grid',
    visible: true,
    order: 8,
  },
  {
    id: 'recently_viewed',
    label: 'Recently Viewed Horizontal Carousel',
    visible: true,
    order: 9,
  },
];

export const DEFAULT_LIVE_PAGE_CONFIG: LivePageEditorConfig = {
  versionId: 'v1.0.0',
  lastPublishedAt: '2026-10-30 09:00:00',
  publishedBy: 'Narendra (Super Admin)',
  globalBrandName: 'BookOurSpace',
  globalTagline: "India's Unified Marketplace for PGs, Classes, Venues, Services, Hotels & Movies",
  globalAnnouncementBarText: 'Verified Zero-Brokerage Bookings • Instant GST Tax Receipts across Web, Android & iOS',
  globalSupportLink: 'https://wa.me/919848022338',
  domOverrides: {},
  pages: {
    pg_hostels: {
      pageId: 'pg_hostels',
      pageName: "PG's & Hostels",
      icon: '🏠',
      heroBanner: {
        visible: false,
        badgeText: 'ZERO BROKERAGE CO-LIVING',
        headline: 'Verified Luxury PGs, Executive Hostels & Student Stays',
        subheadline: 'AC / Non-AC Single, Double & Triple Sharing with Homely Food & High-Speed Wi-Fi.',
        imageUrl: 'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=1000&q=80',
        ctaButtonText: 'Explore Verified PGs',
        ctaButtonLinkOrAction: '#listings-feed',
        secondaryButtonText: 'Post Your PG Free',
        bgColorFrom: '#311042',
        bgColorTo: '#4338CA',
        textColor: '#FFFFFF',
      },
      labelsAndButtons: {
        pageHeadingTitle: 'Verified PGs, Co-Living & Hostels Near You',
        pageSubheading: 'Direct owner contact, transparent monthly rent breakdown, and instant bed reservation.',
        primaryBookButtonLabel: 'Reserve Bed / Book Visit',
        secondaryEnquireButtonLabel: 'WhatsApp / Enquire',
        filterButtonLabel: 'Filter PGs',
        postFreeListingButtonLabel: '+ List Your PG / Hostel',
        emptyStateTitle: 'No matching PG or Hostel found in this area',
        emptyStateSubtitle: 'Try clearing sharing or AC filters to see all verified hostels nearby.',
        promoRibbonText: '🏠 Move-in Ready PGs with Zero Brokerage & Instant GST Rent Receipt',
        promoRibbonLink: '#pg-featured',
      },
      sections: createDefaultSections('pg_hostels'),
      colors: {
        primaryColor: '#4338CA',
        accentColor: '#FFE500',
        cardBorderColor: '#E2E8F0',
        badgeBgColor: '#EEF2FF',
        buttonRadius: 'rounded-xl',
      },
      categories: [
        { id: 'pg-mens', label: "Men's Executive PG", icon: '👨', visible: true, featuredBadge: 'Top Rated' },
        { id: 'pg-womens', label: "Women's Safe Hostel", icon: '👩', visible: true, featuredBadge: '24x7 Security' },
        { id: 'pg-coliving', label: 'Co-Living Luxury Suites', icon: '🏢', visible: true, featuredBadge: 'Couples & IT' },
        { id: 'pg-student', label: 'Student Exam Hostels', icon: '📚', visible: true },
      ],
      formOptions: [
        {
          id: 'pg_sharing_options',
          fieldLabel: 'Room Sharing Preference',
          fieldType: 'select',
          required: true,
          options: ['Single Sharing (Private)', '2 Sharing', '3 Sharing', '4 Sharing', 'Co-Living Studio'],
        },
        {
          id: 'pg_food_plan',
          fieldLabel: 'Meal & Mess Plan',
          fieldType: 'radio',
          required: false,
          options: ['3 Meals Included (North & South Indian)', 'Breakfast & Dinner Only', 'Self-Cooking Kitchen Access'],
        },
      ],
    },
    classes: {
      pageId: 'classes',
      pageName: 'Classes & Courses',
      icon: '🎓',
      heroBanner: {
        visible: false,
        badgeText: 'PLACEMENT & CERTIFICATION BATCHES',
        headline: 'Top Coaching Institutes, IT Courses, Dance, Music & Sports Academies',
        subheadline: 'View live monthly batch calendars, student placement records, and book a free demo class.',
        imageUrl: 'https://images.unsplash.com/photo-1524178232363-1fb2b075b655?auto=format&fit=crop&w=1000&q=80',
        ctaButtonText: 'Book Free Demo Class',
        ctaButtonLinkOrAction: '#listings-feed',
        secondaryButtonText: 'Register Institute',
        bgColorFrom: '#1E1B4B',
        bgColorTo: '#0F766E',
        textColor: '#FFFFFF',
      },
      labelsAndButtons: {
        pageHeadingTitle: 'Verified Classes, Coaching & Skill Academies',
        pageSubheading: 'Compare batch schedules, check student certification stats, and enroll online or offline.',
        primaryBookButtonLabel: 'Book Demo / Enroll Now',
        secondaryEnquireButtonLabel: 'Ask Batch Timings',
        filterButtonLabel: 'Filter Courses',
        postFreeListingButtonLabel: '+ Add Coaching / Class',
        emptyStateTitle: 'No classes or batches match your current filter',
        emptyStateSubtitle: 'Reset delivery mode or timing slot to browse all running batches.',
        promoRibbonText: '🎓 100% Verified Institutes • Free Demo Trial & Live Batch Calendars',
        promoRibbonLink: '#classes-featured',
      },
      sections: createDefaultSections('classes'),
      colors: {
        primaryColor: '#4338CA',
        accentColor: '#10B981',
        cardBorderColor: '#E2E8F0',
        badgeBgColor: '#ECFDF5',
        buttonRadius: 'rounded-xl',
      },
      categories: [
        { id: 'class-it', label: 'AI, Python & Full-Stack IT', icon: '💻', visible: true, featuredBadge: 'Placement Guaranteed' },
        { id: 'class-academic', label: 'IIT-JEE, NEET & Tuitions', icon: '📐', visible: true },
        { id: 'class-arts', label: 'Music, Dance & Fine Arts', icon: '🎸', visible: true },
        { id: 'class-fitness', label: 'Yoga, Swimming & Martial Arts', icon: '🧘', visible: true },
      ],
      formOptions: [
        {
          id: 'class_batch_mode',
          fieldLabel: 'Preferred Learning Mode',
          fieldType: 'select',
          required: true,
          options: ['Offline Classroom Batch', 'Live Interactive Online', 'Hybrid (Weekend Offline + Online)', '1-on-1 Mentorship'],
        },
        {
          id: 'class_slot_preference',
          fieldLabel: 'Preferred Batch Slot',
          fieldType: 'chips',
          required: true,
          options: ['Morning (7 AM - 10 AM)', 'Daytime (11 AM - 4 PM)', 'Evening (6 PM - 9 PM)', 'Weekend Intensive'],
        },
      ],
    },
    venues: {
      pageId: 'venues',
      pageName: 'Function Halls & Venues',
      icon: '🏛️',
      heroBanner: {
        visible: false,
        badgeText: 'ROYAL WEDDING & EVENT VENUES',
        headline: 'Banquet Halls, Convention Centers, Resorts & Party Lawns',
        subheadline: 'Check live date availability, guest capacity, catering packages, and book with instant GST invoice.',
        imageUrl: 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=1000&q=80',
        ctaButtonText: 'Check Venue Dates',
        ctaButtonLinkOrAction: '#listings-feed',
        secondaryButtonText: 'List Your Venue',
        bgColorFrom: '#4A148C',
        bgColorTo: '#9D174D',
        textColor: '#FFFFFF',
      },
      labelsAndButtons: {
        pageHeadingTitle: 'Function Halls, Banquet Venues & Party Lawns',
        pageSubheading: 'Compare AC hall capacity, valet parking, decoration packages, and per-plate catering rates.',
        primaryBookButtonLabel: 'Reserve Venue Dates',
        secondaryEnquireButtonLabel: 'Request Quote',
        filterButtonLabel: 'Filter Venues',
        postFreeListingButtonLabel: '+ List Function Hall',
        emptyStateTitle: 'No venues available for the selected criteria',
        emptyStateSubtitle: 'Clear date or area filters to explore all verified banquet halls.',
        promoRibbonText: '🏛️ Verified Wedding & Corporate Venues • Direct Venue Manager Booking',
        promoRibbonLink: '#venues-featured',
      },
      sections: createDefaultSections('venues'),
      colors: {
        primaryColor: '#4A148C',
        accentColor: '#F59E0B',
        cardBorderColor: '#F3E8FF',
        badgeBgColor: '#FAF5FF',
        buttonRadius: 'rounded-xl',
      },
      categories: [
        { id: 'venue-banquet', label: 'AC Banquet & Marriage Halls', icon: '👑', visible: true, featuredBadge: 'Wedding Season' },
        { id: 'venue-convention', label: 'Grand Convention Centers', icon: '🏛️', visible: true },
        { id: 'venue-lawn', label: 'Open Air Lawns & Farmhouses', icon: '🌴', visible: true },
        { id: 'venue-mini', label: 'Mini Party & Birthday Halls', icon: '🎉', visible: true },
      ],
      formOptions: [
        {
          id: 'venue_event_type',
          fieldLabel: 'Event / Celebration Type',
          fieldType: 'select',
          required: true,
          options: ['Wedding / Reception', 'Engagement / Sangeet', 'Birthday / Anniversary', 'Corporate Conference', 'Exhibition / Expo'],
        },
        {
          id: 'venue_catering_pref',
          fieldLabel: 'Catering & Decor Requirement',
          fieldType: 'radio',
          required: true,
          options: ['Venue In-House Catering + Decor', 'Hall Rental Only (Own Caterer)', 'Custom Royal Wedding Package'],
        },
      ],
    },
    services: {
      pageId: 'services',
      pageName: 'Home & Local Services',
      icon: '🛠️',
      heroBanner: {
        visible: false,
        badgeText: 'BACKGROUND-VERIFIED PROFESSIONALS',
        headline: 'Instant Home Cleaning, AC Repair, Electricians, Plumbers & Packers',
        subheadline: '60-minute doorstep arrival across Hyderabad & major cities with transparent upfront rates.',
        imageUrl: 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=1000&q=80',
        ctaButtonText: 'Book Doorstep Service',
        ctaButtonLinkOrAction: '#listings-feed',
        secondaryButtonText: 'Join as Service Partner',
        bgColorFrom: '#0F172A',
        bgColorTo: '#1D4ED8',
        textColor: '#FFFFFF',
      },
      labelsAndButtons: {
        pageHeadingTitle: 'Trusted Home, Repair & Professional Services',
        pageSubheading: 'Verified technicians, upfront inspection charges, and 30-day post-service warranty.',
        primaryBookButtonLabel: 'Book Technician Now',
        secondaryEnquireButtonLabel: 'Call / Chat Pro',
        filterButtonLabel: 'Filter Services',
        postFreeListingButtonLabel: '+ Register as Service Pro',
        emptyStateTitle: 'No service professionals match your search',
        emptyStateSubtitle: 'Reset subcategory or radius filter to view all available specialists.',
        promoRibbonText: '🛠️ Verified Doorstep Technicians • 30-Day Service Guarantee',
        promoRibbonLink: '#services-featured',
      },
      sections: createDefaultSections('services'),
      colors: {
        primaryColor: '#1D4ED8',
        accentColor: '#FFE500',
        cardBorderColor: '#E2E8F0',
        badgeBgColor: '#EFF6FF',
        buttonRadius: 'rounded-xl',
      },
      categories: [
        { id: 'cat-cleaning', label: 'Deep Home & Bathroom Cleaning', icon: '🧹', visible: true, featuredBadge: 'Most Booked' },
        { id: 'cat-ac-elec', label: 'AC Repair, Electrician & Plumber', icon: '⚡', visible: true },
        { id: 'cat-painting', label: 'Home Painting & Carpentry', icon: '🎨', visible: true },
        { id: 'cat-movers', label: 'Packers & Movers / Drivers', icon: '🚚', visible: true },
      ],
      formOptions: [
        {
          id: 'service_urgency_slot',
          fieldLabel: 'Service Visit Urgency',
          fieldType: 'select',
          required: true,
          options: ['Express 60-Min Arrival', 'Today Morning / Afternoon', 'Tomorrow Scheduled Slot', 'Weekend Inspection'],
        },
        {
          id: 'service_premises_type',
          fieldLabel: 'Property / Premises Type',
          fieldType: 'radio',
          required: false,
          options: ['1 BHK / 2 BHK Apartment', '3 BHK+ / Independent Villa', 'Commercial Office / Retail Shop'],
        },
      ],
    },
    hotel_stay: {
      pageId: 'hotel_stay',
      pageName: 'Hotel & Stay',
      icon: '🏨',
      heroBanner: {
        visible: false,
        badgeText: 'FLEXIBLE HOURLY & NIGHT STAYS',
        headline: 'Verified Business Hotels, Serviced Apartments, Luxury Suites & Resorts',
        subheadline: 'Book 3h / 6h / 12h hourly transit stays or full-night bookings with couple-friendly check-in.',
        imageUrl: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1000&q=80',
        ctaButtonText: 'Search Hotels & Stays',
        ctaButtonLinkOrAction: '#listings-feed',
        secondaryButtonText: 'List Your Hotel',
        bgColorFrom: '#111827',
        bgColorTo: '#047857',
        textColor: '#FFFFFF',
      },
      labelsAndButtons: {
        pageHeadingTitle: 'Hotels, Serviced Apartments & Hourly Stays',
        pageSubheading: 'Flexible check-in/check-out times, corporate GST billing, and zero hidden charges.',
        primaryBookButtonLabel: 'Book Room / Stay',
        secondaryEnquireButtonLabel: 'Ask Front Desk',
        filterButtonLabel: 'Filter Hotels',
        postFreeListingButtonLabel: '+ List Property / Hotel',
        emptyStateTitle: 'No hotels or stays match your selected filter',
        emptyStateSubtitle: 'Disable Hourly Only or widen price range to view all stays.',
        promoRibbonText: '🏨 Flexible 3H/6H/12H Hourly Check-In & Corporate GST Invoices Available',
        promoRibbonLink: '#hotels-featured',
      },
      sections: createDefaultSections('hotel_stay'),
      colors: {
        primaryColor: '#047857',
        accentColor: '#FBBF24',
        cardBorderColor: '#D1FAE5',
        badgeBgColor: '#ECFDF5',
        buttonRadius: 'rounded-xl',
      },
      categories: [
        { id: 'hotel-business', label: '3★ to 5★ Business Hotels', icon: '🏨', visible: true, featuredBadge: 'Corporate GST' },
        { id: 'hotel-hourly', label: 'Flexible Hourly Stay Rooms', icon: '⏱️', visible: true, featuredBadge: '3H / 6H / 12H' },
        { id: 'hotel-apartments', label: 'Serviced Studio Apartments', icon: '🛋️', visible: true },
        { id: 'hotel-resorts', label: 'Weekend Luxury Resorts', icon: '🏖️', visible: true },
      ],
      formOptions: [
        {
          id: 'hotel_stay_duration',
          fieldLabel: 'Booking Duration Mode',
          fieldType: 'select',
          required: true,
          options: ['Standard Night Stay (12 PM Check-In)', '3 Hours Micro-Stay', '6 Hours Transit Stay', '12 Hours Half-Day Stay', 'Extended Weekly Stay'],
        },
        {
          id: 'hotel_room_category',
          fieldLabel: 'Room Category & Extras',
          fieldType: 'radio',
          required: true,
          options: ['Deluxe AC Room (Room Only)', 'Executive Suite + Complimentary Breakfast', 'Family Interconnected Suite'],
        },
      ],
    },
    movies: {
      pageId: 'movies',
      pageName: 'Movies & Multiplex',
      icon: '🎬',
      heroBanner: {
        visible: false,
        badgeText: 'INSTANT M-TICKET & QR PASS',
        headline: 'Blockbuster Movies, IMAX 3D Multiplexes, Drive-In & Live Comedy Shows',
        subheadline: 'Pick your exact recliner/balcony seats, pre-book popcorn combos, and scan QR at entry.',
        imageUrl: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=1000&q=80',
        ctaButtonText: 'Book Movie Tickets',
        ctaButtonLinkOrAction: '#listings-feed',
        secondaryButtonText: 'Partner Theatre',
        bgColorFrom: '#3B0764',
        bgColorTo: '#BE123C',
        textColor: '#FFFFFF',
      },
      labelsAndButtons: {
        pageHeadingTitle: 'Now Showing: Movies, IMAX Multiplexes & Live Shows',
        pageSubheading: 'Instant QR M-Ticket generation, Dolby Atmos screens, and zero-queue F&B combos.',
        primaryBookButtonLabel: 'Select Seats & Book',
        secondaryEnquireButtonLabel: 'Group / Bulk Booking',
        filterButtonLabel: 'Filter Shows',
        postFreeListingButtonLabel: '+ Add Show / Theatre',
        emptyStateTitle: 'No movie shows or screens match your filter',
        emptyStateSubtitle: 'Clear language or format filters to see all running shows.',
        promoRibbonText: '🎬 Instant QR M-Ticket • Dolby Atmos & Recliner Seats Available',
        promoRibbonLink: '#movies-featured',
      },
      sections: createDefaultSections('movies'),
      colors: {
        primaryColor: '#BE123C',
        accentColor: '#FFE500',
        cardBorderColor: '#FFE4E6',
        badgeBgColor: '#FFF1F2',
        buttonRadius: 'rounded-xl',
      },
      categories: [
        { id: 'movie-imax', label: 'IMAX 3D & 4DX Multiplexes', icon: '🍿', visible: true, featuredBadge: 'Dolby Atmos' },
        { id: 'movie-regional', label: 'Telugu, Hindi & English Releases', icon: '🎞️', visible: true },
        { id: 'movie-recliner', label: 'VIP Gold Class Recliners', icon: '🛋️', visible: true },
        { id: 'movie-events', label: 'Standup Comedy & Live Concerts', icon: '🎤', visible: true },
      ],
      formOptions: [
        {
          id: 'movie_seat_class',
          fieldLabel: 'Preferred Seating Tier',
          fieldType: 'select',
          required: true,
          options: ['VIP Gold Recliner (₹350)', 'Royal Balcony Executive (₹250)', 'Prime Middle Row (₹180)', 'Classic Silver (₹120)'],
        },
        {
          id: 'movie_fnb_combo',
          fieldLabel: 'Add Popcorn & Beverage Combo',
          fieldType: 'checkbox',
          required: false,
          options: ['Large Caramel Popcorn + 2 Coke (₹290)', 'Nachos with Cheese Dip (₹180)', 'No Food Combo Required'],
        },
      ],
    },
  },
};

function safeReadLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeWriteLocal<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn('LocalStorage write warning:', e);
  }
}

function ensurePageSectionsMerged(
  pages: Record<CustomerPageId, SingleCustomerPageConfig>
): Record<CustomerPageId, SingleCustomerPageConfig> {
  const result = { ...DEFAULT_LIVE_PAGE_CONFIG.pages, ...pages };
  const pageIds: CustomerPageId[] = [
    'pg_hostels',
    'classes',
    'venues',
    'services',
    'hotel_stay',
    'movies',
  ];
  for (const pid of pageIds) {
    const defPage = DEFAULT_LIVE_PAGE_CONFIG.pages[pid];
    const curPage = result[pid] || defPage;
    const existingSecs = Array.isArray(curPage.sections) ? [...curPage.sections] : [];
    for (const defSec of defPage.sections) {
      if (!existingSecs.some((s) => s && s.id === defSec.id)) {
        existingSecs.push(defSec);
      }
    }
    result[pid] = {
      ...defPage,
      ...curPage,
      sections: existingSecs,
    };
  }
  return result;
}

export function loadPublishedLivePageConfig(): LivePageEditorConfig {
  const stored = safeReadLocal<LivePageEditorConfig | null>(STORAGE_KEYS.PUBLISHED, null);
  if (!stored || !stored.pages) return DEFAULT_LIVE_PAGE_CONFIG;
  return {
    ...DEFAULT_LIVE_PAGE_CONFIG,
    ...stored,
    pages: ensurePageSectionsMerged(stored.pages),
    domOverrides: stored.domOverrides || {},
  };
}

export function loadDraftLivePageConfig(): LivePageEditorConfig {
  const stored = safeReadLocal<LivePageEditorConfig | null>(STORAGE_KEYS.DRAFT, null);
  if (!stored || !stored.pages) return loadPublishedLivePageConfig();
  return {
    ...DEFAULT_LIVE_PAGE_CONFIG,
    ...stored,
    pages: ensurePageSectionsMerged(stored.pages),
    domOverrides: stored.domOverrides || {},
  };
}

export function loadLivePageVersions(): LivePageVersionSnapshot[] {
  const stored = safeReadLocal<LivePageVersionSnapshot[]>(STORAGE_KEYS.VERSIONS, []);
  if (stored.length > 0) return stored;
  return [
    {
      versionId: 'v1.0.0',
      versionNumber: 1,
      publishedAt: '2026-10-30 09:00:00',
      publishedBy: 'Narendra (Super Admin)',
      summary: 'Initial baseline configuration across all 6 customer-facing marketplace pages',
      platforms: ['Web SPA', 'Android App (OTA)', 'iOS App (OTA)'],
      configSnapshot: DEFAULT_LIVE_PAGE_CONFIG,
    },
  ];
}

export function loadLivePageAuditLogs(): LivePageAuditEntry[] {
  const stored = safeReadLocal<LivePageAuditEntry[]>(STORAGE_KEYS.AUDIT, []);
  if (stored.length > 0) return stored;
  return [
    {
      id: 'AUD-INIT-01',
      timestamp: '2026-10-30 09:00:00',
      actor: 'Narendra (Super Admin)',
      role: 'admin',
      action: 'Initialized OTA Live Page Config v1.0.0',
      pageId: 'all_pages',
      details: 'Synced baseline customer pages across Web, Android & iOS.',
      versionId: 'v1.0.0',
    },
  ];
}

export async function fetchLivePageConfigFromBackend(): Promise<{
  published: LivePageEditorConfig;
  draft: LivePageEditorConfig;
  versions: LivePageVersionSnapshot[];
  auditLogs: LivePageAuditEntry[];
}> {
  try {
    const res = await fetch('/api/live-page-config');
    if (res.ok) {
      const data = await res.json();
      if (data.published) {
        safeWriteLocal(STORAGE_KEYS.PUBLISHED, data.published);
      }
      if (data.draft) {
        safeWriteLocal(STORAGE_KEYS.DRAFT, data.draft);
      }
      if (Array.isArray(data.versions) && data.versions.length > 0) {
        safeWriteLocal(STORAGE_KEYS.VERSIONS, data.versions);
      }
      if (Array.isArray(data.auditLogs) && data.auditLogs.length > 0) {
        safeWriteLocal(STORAGE_KEYS.AUDIT, data.auditLogs);
      }
    }
  } catch {
    // Graceful fallback to local storage if dev server route is warming up
  }
  return {
    published: loadPublishedLivePageConfig(),
    draft: loadDraftLivePageConfig(),
    versions: loadLivePageVersions(),
    auditLogs: loadLivePageAuditLogs(),
  };
}

export async function saveLivePageDraftToBackend(
  draftConfig: LivePageEditorConfig,
  pageId: string,
  summary: string,
  actor = 'Narendra (Super Admin)'
): Promise<{
  draft: LivePageEditorConfig;
  auditLogs: LivePageAuditEntry[];
}> {
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  safeWriteLocal(STORAGE_KEYS.DRAFT, draftConfig);

  const localAudit: LivePageAuditEntry = {
    id: `AUD-DRF-${Date.now().toString().slice(-5)}`,
    timestamp: now,
    actor,
    role: 'admin',
    action: 'Saved Page Draft',
    pageId,
    details: summary,
  };
  const nextAudits = [localAudit, ...loadLivePageAuditLogs()].slice(0, 200);
  safeWriteLocal(STORAGE_KEYS.AUDIT, nextAudits);

  appendAdminAuditLog('Content Management', `Live Page Editor Draft (${pageId})`, summary, 'draft_saved', actor, 'admin');

  try {
    const res = await fetch('/api/live-page-config/draft', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-role': 'admin',
      },
      body: JSON.stringify({
        role: 'admin',
        config: draftConfig,
        pageId,
        summary,
        actor,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.auditLogs)) {
        safeWriteLocal(STORAGE_KEYS.AUDIT, data.auditLogs);
      }
    }
  } catch {
    // Local storage already updated
  }

  window.dispatchEvent(
    new CustomEvent('bos-live-page-config-updated', {
      detail: { mode: 'draft', config: draftConfig },
    })
  );

  return {
    draft: draftConfig,
    auditLogs: loadLivePageAuditLogs(),
  };
}

export async function publishLivePageConfigToBackend(
  configToPublish: LivePageEditorConfig,
  pageId: string,
  summary: string,
  actor = 'Narendra (Super Admin)'
): Promise<{
  published: LivePageEditorConfig;
  versions: LivePageVersionSnapshot[];
  auditLogs: LivePageAuditEntry[];
}> {
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const existingVersions = loadLivePageVersions();
  const nextNum = (existingVersions[0]?.versionNumber || 1) + 1;
  const versionId = `v1.${nextNum}.0`;

  const stampedConfig: LivePageEditorConfig = {
    ...configToPublish,
    versionId,
    lastPublishedAt: now,
    publishedBy: actor,
  };

  const newSnapshot: LivePageVersionSnapshot = {
    versionId,
    versionNumber: nextNum,
    publishedAt: now,
    publishedBy: actor,
    summary,
    platforms: ['Web SPA', 'Android App (OTA)', 'iOS App (OTA)'],
    configSnapshot: stampedConfig,
  };

  const nextVersions = [newSnapshot, ...existingVersions].slice(0, 50);
  const newAudit: LivePageAuditEntry = {
    id: `AUD-PUB-${Date.now().toString().slice(-5)}`,
    timestamp: now,
    actor,
    role: 'admin',
    action: `Published ${versionId} (OTA)`,
    pageId,
    details: `${summary} — Live across Android, iOS & Web without app update`,
    versionId,
  };
  const nextAudits = [newAudit, ...loadLivePageAuditLogs()].slice(0, 200);

  safeWriteLocal(STORAGE_KEYS.PUBLISHED, stampedConfig);
  safeWriteLocal(STORAGE_KEYS.DRAFT, stampedConfig);
  safeWriteLocal(STORAGE_KEYS.VERSIONS, nextVersions);
  safeWriteLocal(STORAGE_KEYS.AUDIT, nextAudits);

  appendAdminAuditLog(
    'Content Management',
    `Published Live Page ${versionId} (OTA)`,
    `${summary} [Android • iOS • Web]`,
    'published',
    actor,
    'admin'
  );

  try {
    const res = await fetch('/api/live-page-config/publish', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-role': 'admin',
      },
      body: JSON.stringify({
        role: 'admin',
        config: stampedConfig,
        pageId,
        summary,
        actor,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.published) safeWriteLocal(STORAGE_KEYS.PUBLISHED, data.published);
      if (Array.isArray(data.versions)) safeWriteLocal(STORAGE_KEYS.VERSIONS, data.versions);
      if (Array.isArray(data.auditLogs)) safeWriteLocal(STORAGE_KEYS.AUDIT, data.auditLogs);
    }
  } catch {
    // Local storage already updated
  }

  window.dispatchEvent(
    new CustomEvent('bos-live-page-config-updated', {
      detail: { mode: 'published', config: stampedConfig },
    })
  );

  return {
    published: loadPublishedLivePageConfig(),
    versions: loadLivePageVersions(),
    auditLogs: loadLivePageAuditLogs(),
  };
}

export async function rollbackLivePageConfigVersion(
  targetVersionId: string,
  actor = 'Narendra (Super Admin)'
): Promise<{
  published: LivePageEditorConfig;
  draft: LivePageEditorConfig;
  versions: LivePageVersionSnapshot[];
  auditLogs: LivePageAuditEntry[];
}> {
  const existingVersions = loadLivePageVersions();
  const target = existingVersions.find((v) => v.versionId === targetVersionId);
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

  if (target) {
    const restored: LivePageEditorConfig = {
      ...target.configSnapshot,
      versionId: `${target.versionId}-restored`,
      lastPublishedAt: now,
      publishedBy: actor,
    };

    const newAudit: LivePageAuditEntry = {
      id: `AUD-RBK-${Date.now().toString().slice(-5)}`,
      timestamp: now,
      actor,
      role: 'admin',
      action: `Rolled Back to ${targetVersionId}`,
      pageId: 'all_pages',
      details: `Restored "${target.summary}" (${targetVersionId}) across Web, Android & iOS`,
      versionId: targetVersionId,
    };
    const nextAudits = [newAudit, ...loadLivePageAuditLogs()].slice(0, 200);

    safeWriteLocal(STORAGE_KEYS.PUBLISHED, restored);
    safeWriteLocal(STORAGE_KEYS.DRAFT, restored);
    safeWriteLocal(STORAGE_KEYS.AUDIT, nextAudits);

    appendAdminAuditLog(
      'Content Management',
      `Rolled Back Live Page to ${targetVersionId}`,
      `Restored ${targetVersionId} across Web, Android & iOS`,
      'sensitive_confirmed',
      actor,
      'admin'
    );

    try {
      await fetch('/api/live-page-config/rollback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-role': 'admin',
        },
        body: JSON.stringify({
          role: 'admin',
          versionId: targetVersionId,
          actor,
        }),
      });
    } catch {
      // Local storage already updated
    }

    window.dispatchEvent(
      new CustomEvent('bos-live-page-config-updated', {
        detail: { mode: 'rollback', config: restored },
      })
    );
  }

  return {
    published: loadPublishedLivePageConfig(),
    draft: loadDraftLivePageConfig(),
    versions: loadLivePageVersions(),
    auditLogs: loadLivePageAuditLogs(),
  };
}
