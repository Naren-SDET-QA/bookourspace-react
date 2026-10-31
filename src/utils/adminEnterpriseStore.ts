export type PublishState = 'draft' | 'published';

export interface AdminManagedUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: 'customer' | 'provider' | 'admin';
  verified: boolean;
  kycDocument: string;
  accountStatus: 'active' | 'suspended' | 'pending_verification';
  city: string;
  joinedAt: string;
  listingsCount: number;
  bookingsCount: number;
  totalSpentOrEarned: number;
  gstin?: string;
  permissions: string[];
  publishState: PublishState;
}

export interface AdminRolePermissions {
  role: 'customer' | 'provider' | 'admin';
  label: string;
  canCreateListings: boolean;
  canBookServices: boolean;
  canApproveListings: boolean;
  canManageUsers: boolean;
  canManagePayments: boolean;
  canManageAds: boolean;
  canEditContent: boolean;
  canConfigureFeatures: boolean;
  canViewReports: boolean;
  canManageTheme: boolean;
  canManageIntegrations: boolean;
  canManageData: boolean;
  canManageAnnouncements: boolean;
}

export interface AdminIntegrationSyncError {
  id: string;
  timestamp: string;
  code: string;
  message: string;
  resolved: boolean;
}

export interface AdminIntegrationConfig {
  id: string;
  name: string;
  category: 'messaging' | 'voice_ai' | 'storage_sync' | 'billing_print' | 'external_gateway';
  providerType: 'built_in_active' | 'unconfigured_external';
  status: 'synced' | 'degraded' | 'disabled' | 'not_configured';
  enabled: boolean;
  description: string;
  endpointOrMode: string;
  maskedSecretStatus: string;
  lastSyncAt: string;
  syncLatencyMs: number;
  successRatePercent: number;
  settings: Record<string, string | boolean | number>;
  errorLogs: AdminIntegrationSyncError[];
  updatedBy: string;
  updatedAt: string;
  publishState: PublishState;
}

export interface AdminDataQuarantineItem {
  id: string;
  recordId: string;
  entityType: 'listing' | 'user' | 'booking';
  titleOrName: string;
  sectionOrRole: string;
  missingFields: string[];
  severity: 'critical' | 'warning' | 'low';
  resolutionStatus: 'needs_attention' | 'repaired' | 'quarantined';
  notes: string;
  updatedAt: string;
  updatedBy: string;
}

export interface AdminDataHygieneConfig {
  requirePhoneOnListings: boolean;
  requireVerifiedImageOnListings: boolean;
  requirePincodeOnListings: boolean;
  requireSectionSpecificFields: boolean;
  autoQuarantineIncompleteDrafts: boolean;
  defaultFallbackCity: string;
  defaultFallbackPincode: string;
  lastScanAt: string;
  updatedBy: string;
  publishState: PublishState;
}

export type AnnouncementPlacement =
  | 'top_banner'
  | 'below_header'
  | 'spotlight_strip'
  | 'section_card'
  | 'footer_notice';

export interface AdminAnnouncementNotice {
  id: string;
  title: string;
  message: string;
  messageTe?: string;
  messageHi?: string;
  severity: 'development' | 'maintenance' | 'info' | 'warning' | 'success';
  placement: AnnouncementPlacement;
  targetAudience: 'all' | 'customer' | 'provider' | 'admin';
  targetSection: 'all' | 'pg_hostels' | 'classes' | 'venues' | 'services' | 'hotel_stay' | 'movies';
  language: 'all' | 'en' | 'te' | 'hi';
  startTime: string;
  endTime: string;
  dismissible: boolean;
  ctaLabel?: string;
  ctaActionSection?: 'none' | 'pg_hostels' | 'classes' | 'venues' | 'services' | 'hotel_stay' | 'movies';
  publishState: PublishState;
  createdBy: string;
  updatedAt: string;
}

export interface AdminThemeSettings {
  primaryBrandColor: string;
  accentColor: string;
  surfaceBackgroundLight: string;
  surfaceBackgroundDark: string;
  themeMode: 'light' | 'dark' | 'system';
  brandLogoEmblemUrl: string;
  brandTagline: string;
  showGlobeAnimation: boolean;
  borderRadiusStyle: 'rounded' | 'sharp' | 'pill';
  compactDensity: boolean;
  presetName: string;
  updatedBy: string;
  updatedAt: string;
  publishState: PublishState;
}

export interface AdminRefundRecord {
  id: string;
  transactionId: string;
  invoiceNumber: string;
  customerOrProviderName: string;
  amount: number;
  reason: string;
  status: 'pending' | 'approved' | 'processed' | 'rejected';
  requestedAt: string;
}

export interface AdminPayoutRecord {
  id: string;
  providerName: string;
  providerPhone: string;
  upiOrBank: string;
  grossAmount: number;
  commissionDeducted: number;
  netPayout: number;
  status: 'scheduled' | 'paid' | 'on_hold';
  payoutDate: string;
}

export interface AdminPaymentSettings {
  platformCommissionPercent: number;
  gstPercent: number;
  autoPayoutEnabled: boolean;
  minimumPayoutAmount: number;
  supportedMethods: {
    upi: boolean;
    cards: boolean;
    netbanking: boolean;
    wallet: boolean;
    payAtVenue: boolean;
  };
  invoicePrefix: string;
  companyGstin: string;
  publishState: PublishState;
}

export interface AdminAdCampaign {
  id: string;
  campaignName: string;
  advertiserName: string;
  placement: 'top_spotlight' | 'mid_feed_banner' | 'category_sponsor' | 'footer_promo';
  targetSection: 'all' | 'pg_hostels' | 'classes' | 'venues' | 'services' | 'hotel_stay' | 'movies';
  targetCity: string;
  targetAudience: 'all_users' | 'students_pg' | 'event_planners' | 'homeowners' | 'travelers';
  headline: string;
  subheadline: string;
  ctaText: string;
  ctaUrlOrQuery: string;
  imageUrl: string;
  badgeText: string;
  dailyBudget: number;
  totalBudget: number;
  amountSpent: number;
  startDate: string;
  endDate: string;
  impressions: number;
  clicks: number;
  status: 'draft' | 'published' | 'paused';
}

export interface AdminHomepageBanner {
  id: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  targetSection: 'pg_hostels' | 'classes' | 'venues' | 'services' | 'hotel_stay' | 'movies';
  imageUrl: string;
  active: boolean;
  publishState: PublishState;
}

export interface AdminContentSettings {
  banners: AdminHomepageBanner[];
  homepageSections: {
    showTopServicesBar: boolean;
    showFeaturedSpotlight: boolean;
    showSponsoredAds: boolean;
    showRecentlyViewed: boolean;
    showCustomAdminFields: boolean;
  };
  customLabels: {
    heroAnnouncement: string;
    postButtonLabel: string;
    verifiedBadgeText: string;
  };
  themeConfig: {
    primaryBrandColor: string;
    accentColor: string;
    compactDensity: boolean;
  };
  mediaLibrary: {
    id: string;
    title: string;
    url: string;
    category: string;
    uploadedAt: string;
  }[];
  publishState: PublishState;
}

export interface AdminBookingDispute {
  id: string;
  bookingId: string;
  listingTitle: string;
  customerName: string;
  providerName: string;
  issueType: 'cancellation_refund' | 'service_quality' | 'venue_unavailable' | 'pricing_mismatch';
  description: string;
  amountInDispute: number;
  status: 'open' | 'investigating' | 'resolved_refund' | 'resolved_payout';
  createdAt: string;
  resolutionNote?: string;
}

export interface AdminManagedEvent {
  id: string;
  title: string;
  venueName: string;
  section: 'venues' | 'movies' | 'classes';
  eventDate: string;
  capacity: number;
  ticketsBooked: number;
  ticketPrice: number;
  status: 'upcoming' | 'live' | 'completed' | 'cancelled';
}

export interface AdminAppSettings {
  supportPhone: string;
  supportEmail: string;
  supportWhatsapp: string;
  helpdeskHours: string;
  enabledLanguages: string[];
  defaultLanguage: string;
  notifications: {
    smsAlerts: boolean;
    whatsappBookingConfirm: boolean;
    emailGstInvoices: boolean;
    adminApprovalPush: boolean;
  };
  maintenanceBannerText: string;
  maintenanceMode: boolean;
  publishState: PublishState;
}

export interface AdminAuditLogEntry {
  id: string;
  timestamp: string;
  actorName: string;
  actorRole: string;
  section:
    | 'Dashboard'
    | 'User Management'
    | 'Payment Management'
    | 'Ad Management'
    | 'Content Management'
    | 'Listings & Venues'
    | 'Bookings & Events'
    | 'Reports & Analytics'
    | 'Theme Management'
    | 'Feature Management'
    | 'Integrations'
    | 'Data Management'
    | 'Announcements & Status Board'
    | 'App Settings';
  action: string;
  details: string;
  status: 'published' | 'draft_saved' | 'sensitive_confirmed';
}

const KEYS = {
  USERS: 'bos_admin_users_v2',
  ROLE_PERMS: 'bos_admin_role_perms_v2',
  REFUNDS: 'bos_admin_refunds_v2',
  PAYOUTS: 'bos_admin_payouts_v2',
  PAYMENT_SETTINGS: 'bos_admin_payment_settings_v2',
  ADS: 'bos_admin_ads_v3',
  CONTENT: 'bos_admin_content_v3',
  THEME_SETTINGS: 'bos_admin_theme_settings_v2',
  DISPUTES: 'bos_admin_disputes_v2',
  EVENTS: 'bos_admin_events_v2',
  APP_SETTINGS: 'bos_admin_app_settings_v2',
  INTEGRATIONS: 'bos_admin_integrations_v2',
  DATA_QUARANTINE: 'bos_admin_data_quarantine_v2',
  DATA_HYGIENE: 'bos_admin_data_hygiene_v2',
  ANNOUNCEMENTS: 'bos_admin_announcements_v2',
  AUDIT_LOGS: 'bos_admin_audit_logs_v2',
};

const emitEnterpriseUpdate = () => {
  window.dispatchEvent(new Event('bos-admin-enterprise-updated'));
};

export const DEFAULT_THEME_SETTINGS: AdminThemeSettings = {
  primaryBrandColor: '#4338CA',
  accentColor: '#EA580C',
  surfaceBackgroundLight: '#FDF6FA',
  surfaceBackgroundDark: '#020617',
  themeMode: 'light',
  brandLogoEmblemUrl: '/assets/aistudio/Blue-letter_logo_with_orange_map-pin_emblem_14d3b883.png',
  brandTagline: 'FIND • BOOK • ENJOY',
  showGlobeAnimation: true,
  borderRadiusStyle: 'rounded',
  compactDensity: false,
  presetName: 'BookOurSpace Signature Indigo & Saffron',
  updatedBy: 'Narendra (Super Admin)',
  updatedAt: '2026-10-28 09:00',
  publishState: 'published',
};

export const DEFAULT_ADMIN_USERS: AdminManagedUser[] = [
  {
    id: 'USR-1001',
    name: 'Ramesh Kumar (Sri Sai Executive PG)',
    email: 'ramesh.srisaipg@bookourspace.in',
    phone: '+91 98480 22338',
    role: 'provider',
    verified: true,
    kycDocument: 'GSTIN + Aadhaar Verified',
    accountStatus: 'active',
    city: 'Hyderabad (Madhapur)',
    joinedAt: '2026-08-14',
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
    verified: true,
    kycDocument: 'Trade License + PAN Verified',
    accountStatus: 'active',
    city: 'Hyderabad (Gachibowli)',
    joinedAt: '2026-09-02',
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
    verified: false,
    kycDocument: 'Institute Certificate Pending',
    accountStatus: 'pending_verification',
    city: 'Hyderabad (Ameerpet)',
    joinedAt: '2026-10-19',
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
    verified: true,
    kycDocument: 'Mobile OTP + Email Verified',
    accountStatus: 'active',
    city: 'Hyderabad (Kondapur)',
    joinedAt: '2026-09-10',
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
    verified: true,
    kycDocument: 'Mobile OTP Verified',
    accountStatus: 'active',
    city: 'Hyderabad (Kukatpally)',
    joinedAt: '2026-10-01',
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
    verified: true,
    kycDocument: 'Root Security Key',
    accountStatus: 'active',
    city: 'Hyderabad HQ',
    joinedAt: '2026-01-01',
    listingsCount: 0,
    bookingsCount: 0,
    totalSpentOrEarned: 0,
    permissions: ['full_admin_access', 'approve_providers', 'manage_payments', 'manage_ads', 'view_reports', 'manage_theme'],
    publishState: 'published',
  },
];

export const DEFAULT_ROLE_PERMISSIONS: AdminRolePermissions[] = [
  {
    role: 'customer',
    label: 'Customer / Member',
    canCreateListings: false,
    canBookServices: true,
    canApproveListings: false,
    canManageUsers: false,
    canManagePayments: false,
    canManageAds: false,
    canEditContent: false,
    canConfigureFeatures: false,
    canViewReports: false,
    canManageTheme: false,
    canManageIntegrations: false,
    canManageData: false,
    canManageAnnouncements: false,
  },
  {
    role: 'provider',
    label: 'Owner / Service Provider',
    canCreateListings: true,
    canBookServices: true,
    canApproveListings: false,
    canManageUsers: false,
    canManagePayments: false,
    canManageAds: false,
    canEditContent: false,
    canConfigureFeatures: false,
    canViewReports: false,
    canManageTheme: false,
    canManageIntegrations: false,
    canManageData: false,
    canManageAnnouncements: false,
  },
  {
    role: 'admin',
    label: 'Super Admin',
    canCreateListings: true,
    canBookServices: true,
    canApproveListings: true,
    canManageUsers: true,
    canManagePayments: true,
    canManageAds: true,
    canEditContent: true,
    canConfigureFeatures: true,
    canViewReports: true,
    canManageTheme: true,
    canManageIntegrations: true,
    canManageData: true,
    canManageAnnouncements: true,
  },
];

export const DEFAULT_REFUNDS: AdminRefundRecord[] = [
  {
    id: 'REF-401',
    transactionId: 'tx-102',
    invoiceNumber: 'INV-2025-8834',
    customerOrProviderName: 'Vikram Aditya',
    amount: 1499,
    reason: 'Rescheduled function hall booking date due to weather',
    status: 'pending',
    requestedAt: '2026-10-27 14:20',
  },
  {
    id: 'REF-402',
    transactionId: 'tx-101',
    invoiceNumber: 'INV-2025-8821',
    customerOrProviderName: 'Ananya Sharma',
    amount: 499,
    reason: 'Duplicate slot reservation charge',
    status: 'processed',
    requestedAt: '2026-10-25 11:05',
  },
];

export const DEFAULT_PAYOUTS: AdminPayoutRecord[] = [
  {
    id: 'PAY-901',
    providerName: 'Ramesh Kumar (Sri Sai Executive PG)',
    providerPhone: '+91 98480 22338',
    upiOrBank: 'srisaipg@hdfcbank (HDFC ••4821)',
    grossAmount: 25000,
    commissionDeducted: 2500,
    netPayout: 22500,
    status: 'scheduled',
    payoutDate: '2026-10-29',
  },
  {
    id: 'PAY-902',
    providerName: 'Anitha Reddy (Lakshmi Grand Convention)',
    providerPhone: '+91 99891 44552',
    upiOrBank: 'lakshmivenues@icici (ICICI ••9912)',
    grossAmount: 65000,
    commissionDeducted: 6500,
    netPayout: 58500,
    status: 'paid',
    payoutDate: '2026-10-26',
  },
];

export const DEFAULT_PAYMENT_SETTINGS: AdminPaymentSettings = {
  platformCommissionPercent: 10,
  gstPercent: 18,
  autoPayoutEnabled: true,
  minimumPayoutAmount: 1000,
  supportedMethods: {
    upi: true,
    cards: true,
    netbanking: true,
    wallet: true,
    payAtVenue: true,
  },
  invoicePrefix: 'BOS-GST-2026-',
  companyGstin: '36AABCB1234F1Z5',
  publishState: 'published',
};

export const DEFAULT_ADS: AdminAdCampaign[] = [
  {
    id: 'AD-301',
    campaignName: 'Hyderabad Premium AC PG & Co-Living Fest',
    advertiserName: 'Sri Sai Executive PG & Hostels',
    placement: 'top_spotlight',
    targetSection: 'pg_hostels',
    targetCity: 'Hyderabad',
    targetAudience: 'students_pg',
    headline: 'Zero Brokerage Luxury AC PGs in Madhapur & Gachibowli',
    subheadline: 'High-speed Wi-Fi, 3-Time Homely Food, Gym & Biometric Security starting ₹7,500/mo.',
    ctaText: 'Explore Verified PGs',
    ctaUrlOrQuery: 'PG',
    imageUrl: 'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=900&q=80',
    badgeText: 'SPONSORED SPOTLIGHT',
    dailyBudget: 1500,
    totalBudget: 45000,
    amountSpent: 18400,
    startDate: '2026-10-01',
    endDate: '2026-11-30',
    impressions: 24890,
    clicks: 1420,
    status: 'published',
  },
  {
    id: 'AD-302',
    campaignName: 'Ameerpet & HITEC City Gen-AI Bootcamp',
    advertiserName: 'Apex Software & GenAI Training Hub',
    placement: 'mid_feed_banner',
    targetSection: 'classes',
    targetCity: 'Hyderabad',
    targetAudience: 'students_pg',
    headline: 'Master Full-Stack Python, Gen-AI & DevOps — New Batches Starting Monday!',
    subheadline: '100% Placement Support, Live Lab Projects & Free Demo Class.',
    ctaText: 'View Batch Schedule',
    ctaUrlOrQuery: 'Python',
    imageUrl: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=900&q=80',
    badgeText: 'FEATURED PARTNER AD',
    dailyBudget: 1200,
    totalBudget: 30000,
    amountSpent: 11200,
    startDate: '2026-10-10',
    endDate: '2026-11-25',
    impressions: 16400,
    clicks: 985,
    status: 'published',
  },
  {
    id: 'AD-303',
    campaignName: 'Wedding & Banquet Season Early Bird Offer',
    advertiserName: 'Lakshmi Grand Convention Halls',
    placement: 'top_spotlight',
    targetSection: 'venues',
    targetCity: 'Hyderabad',
    targetAudience: 'event_planners',
    headline: 'Book AC Function Halls & Lawn Venues with Flat 15% Off!',
    subheadline: '500–2000 Guest Capacity, Valet Parking & Custom Décor Packages.',
    ctaText: 'Check Hall Availability',
    ctaUrlOrQuery: 'Convention',
    imageUrl: 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=900&q=80',
    badgeText: 'WEDDING SEASON SPECIAL',
    dailyBudget: 2000,
    totalBudget: 60000,
    amountSpent: 9500,
    startDate: '2026-10-20',
    endDate: '2026-12-31',
    impressions: 11300,
    clicks: 640,
    status: 'draft',
  },
];

export const DEFAULT_CONTENT_SETTINGS: AdminContentSettings = {
  banners: [
    {
      id: 'BNR-1',
      title: 'Verified PGs, Coaching Classes, Function Halls, Stay & Movies in One Super-App',
      subtitle: 'Instant booking, direct provider chat, zero hidden charges, and GST-verified invoices.',
      ctaLabel: 'Explore All Listings',
      targetSection: 'pg_hostels',
      imageUrl: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1000&q=80',
      active: false,
      publishState: 'published',
    },
  ],
  homepageSections: {
    showTopServicesBar: true,
    showFeaturedSpotlight: true,
    showSponsoredAds: false,
    showRecentlyViewed: true,
    showCustomAdminFields: true,
  },
  customLabels: {
    heroAnnouncement: 'BookOurSpace Verified Marketplace — 100% Direct Owner & Provider Connect',
    postButtonLabel: '+ Post Free',
    verifiedBadgeText: 'VERIFIED',
  },
  themeConfig: {
    primaryBrandColor: '#4338CA',
    accentColor: '#7C3AED',
    compactDensity: false,
  },
  mediaLibrary: [
    {
      id: 'MED-1',
      title: 'BOS Brand Emblem',
      url: '/assets/aistudio/Blue-letter_logo_with_orange_map-pin_emblem_14d3b883.png',
      category: 'Branding',
      uploadedAt: '2026-10-28',
    },
    {
      id: 'MED-2',
      title: 'Executive PG Room Showcase',
      url: 'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=800&q=80',
      category: 'PG & Hostels',
      uploadedAt: '2026-10-20',
    },
    {
      id: 'MED-3',
      title: 'Grand Convention Hall Stage',
      url: 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=800&q=80',
      category: 'Function Halls',
      uploadedAt: '2026-10-22',
    },
  ],
  publishState: 'published',
};

export const DEFAULT_DISPUTES: AdminBookingDispute[] = [
  {
    id: 'DSP-201',
    bookingId: 'bk-1',
    listingTitle: '3BHK Deep Home & Kitchen Sanitization',
    customerName: 'Ananya Sharma',
    providerName: 'SparkleClean Hyderabad Pro',
    issueType: 'service_quality',
    description: 'Customer requested extra balcony steam cleaning included in package.',
    amountInDispute: 500,
    status: 'open',
    createdAt: '2026-10-27 16:40',
  },
];

export const DEFAULT_EVENTS: AdminManagedEvent[] = [
  {
    id: 'EVT-501',
    title: 'Grand Diwali Cultural Night & Food Expo 2026',
    venueName: 'Shilpakala Royal Convention Center, Madhapur',
    section: 'venues',
    eventDate: '2026-11-12 18:00',
    capacity: 1200,
    ticketsBooked: 840,
    ticketPrice: 499,
    status: 'upcoming',
  },
  {
    id: 'EVT-502',
    title: 'Weekend IMAX Blockbuster Marathon',
    venueName: 'AMB Cinemas Dolby Atmos, Gachibowli',
    section: 'movies',
    eventDate: '2026-10-30 19:30',
    capacity: 450,
    ticketsBooked: 412,
    ticketPrice: 350,
    status: 'live',
  },
  {
    id: 'EVT-503',
    title: 'Free AI & Cloud Career Workshop',
    venueName: 'Naresh IT & Apex Auditorium, Ameerpet',
    section: 'classes',
    eventDate: '2026-11-02 10:00',
    capacity: 300,
    ticketsBooked: 275,
    ticketPrice: 0,
    status: 'upcoming',
  },
];

export const DEFAULT_APP_SETTINGS: AdminAppSettings = {
  supportPhone: '+91 98480 22338',
  supportEmail: 'support@bookourspace.in',
  supportWhatsapp: '+91 98480 22338',
  helpdeskHours: '24/7 Live Customer & Provider Support',
  enabledLanguages: ['en', 'te', 'hi', 'ta', 'kn', 'ml', 'mr', 'bn', 'gu', 'pa', 'or', 'ur'],
  defaultLanguage: 'en',
  notifications: {
    smsAlerts: true,
    whatsappBookingConfirm: true,
    emailGstInvoices: true,
    adminApprovalPush: true,
  },
  maintenanceBannerText: '',
  maintenanceMode: false,
  publishState: 'published',
};

export const DEFAULT_AUDIT_LOGS: AdminAuditLogEntry[] = [
  {
    id: 'AUD-1001',
    timestamp: '2026-10-28 09:10:12',
    actorName: 'Narendra (Super Admin)',
    actorRole: 'admin',
    section: 'Ad Management',
    action: 'Published Ad Campaign',
    details: 'Published "Hyderabad Premium AC PG & Co-Living Fest" (AD-301) to Top Spotlight.',
    status: 'published',
  },
  {
    id: 'AUD-1002',
    timestamp: '2026-10-28 08:45:30',
    actorName: 'Narendra (Super Admin)',
    actorRole: 'admin',
    section: 'Payment Management',
    action: 'Updated Commission & GST Config',
    details: 'Verified 10% Platform Commission and 18% GST auto-invoice rules.',
    status: 'published',
  },
  {
    id: 'AUD-1003',
    timestamp: '2026-10-28 08:20:05',
    actorName: 'Narendra (Super Admin)',
    actorRole: 'admin',
    section: 'User Management',
    action: 'Verified Provider KYC',
    details: 'Approved GSTIN & KYC for Ramesh Kumar (Sri Sai Executive PG).',
    status: 'sensitive_confirmed',
  },
];

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      return JSON.parse(raw) as T;
    }
  } catch {
    // ignore storage read errors
  }
  return fallback;
}

function saveToStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage quota errors
  }
  if (typeof window !== 'undefined') {
    try {
      const token = localStorage.getItem('bos_session_token_v1');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      void fetch(`/api/admin/modules/${encodeURIComponent(key)}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ payload: value, role: 'admin' }),
      }).catch(() => {});
    } catch {
      // ignore network sync errors
    }
  }
  emitEnterpriseUpdate();
}

export const loadAdminUsers = () => loadFromStorage<AdminManagedUser[]>(KEYS.USERS, DEFAULT_ADMIN_USERS);
export const saveAdminUsers = (users: AdminManagedUser[]) => saveToStorage(KEYS.USERS, users);

export const loadRolePermissions = (): AdminRolePermissions[] => {
  const loaded = loadFromStorage<AdminRolePermissions[]>(KEYS.ROLE_PERMS, DEFAULT_ROLE_PERMISSIONS);
  return loaded.map((item) => ({
    ...item,
    canViewReports: item.canViewReports ?? item.role === 'admin',
    canManageTheme: item.canManageTheme ?? item.role === 'admin',
    canManageIntegrations: item.canManageIntegrations ?? item.role === 'admin',
    canManageData: item.canManageData ?? item.role === 'admin',
    canManageAnnouncements: item.canManageAnnouncements ?? item.role === 'admin',
  }));
};
export const saveRolePermissions = (perms: AdminRolePermissions[]) => saveToStorage(KEYS.ROLE_PERMS, perms);

export const loadAdminThemeSettings = (): AdminThemeSettings => {
  const loaded = loadFromStorage<AdminThemeSettings>(KEYS.THEME_SETTINGS, DEFAULT_THEME_SETTINGS);
  return {
    ...DEFAULT_THEME_SETTINGS,
    ...loaded,
  };
};

export const saveAdminThemeSettings = (theme: AdminThemeSettings) => {
  saveToStorage(KEYS.THEME_SETTINGS, theme);
  window.dispatchEvent(new CustomEvent('bos-theme-settings-updated', { detail: theme }));
};

/**
 * Applies either the published theme settings or a temporary live preview theme
 * across the entire DOM (CSS variables, dynamic utility overrides, and light/dark mode).
 */
export const applyThemeSettingsToDocument = (theme: AdminThemeSettings) => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.setProperty('--bos-primary', theme.primaryBrandColor);
  root.style.setProperty('--bos-accent', theme.accentColor);
  root.style.setProperty('--bos-surface-light', theme.surfaceBackgroundLight);
  root.style.setProperty('--bos-surface-dark', theme.surfaceBackgroundDark);

  // Sync light/dark mode class
  const prefersDark =
    window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const shouldBeDark =
    theme.themeMode === 'dark' || (theme.themeMode === 'system' && prefersDark);

  if (shouldBeDark) {
    root.classList.add('dark');
    try {
      localStorage.setItem('theme_mode', 'dark');
    } catch {}
  } else {
    root.classList.remove('dark');
    try {
      localStorage.setItem('theme_mode', 'light');
    } catch {}
  }

  // Inject or update dynamic theme stylesheet so primary brand colors, accents, and density apply across the app
  let styleEl = document.getElementById('bos-enterprise-theme-vars') as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'bos-enterprise-theme-vars';
    document.head.appendChild(styleEl);
  }

  const radiusRule =
    theme.borderRadiusStyle === 'sharp'
      ? `
        .rounded-3xl, .rounded-2xl, .rounded-xl { border-radius: 6px !important; }
      `
      : theme.borderRadiusStyle === 'pill'
      ? `
        button.rounded-xl, button.rounded-2xl { border-radius: 9999px !important; }
      `
      : '';

  styleEl.textContent = `
    :root {
      --bos-primary: ${theme.primaryBrandColor};
      --bos-accent: ${theme.accentColor};
      --bos-surface-light: ${theme.surfaceBackgroundLight};
      --bos-surface-dark: ${theme.surfaceBackgroundDark};
    }
    html:not(.dark) body,
    html:not(.dark) .bg-\\[\\#FDF6FA\\] {
      background-color: ${theme.surfaceBackgroundLight} !important;
    }
    html.dark body,
    html.dark .dark\\:bg-slate-950 {
      background-color: ${theme.surfaceBackgroundDark} !important;
    }
    .bg-\\[\\#4338CA\\], .bg-\\[\\#4A148C\\], .bg-\\[\\#3730A3\\] {
      background-color: ${theme.primaryBrandColor} !important;
    }
    .text-\\[\\#4338CA\\], .text-\\[\\#3730A3\\] {
      color: ${theme.primaryBrandColor} !important;
    }
    .border-\\[\\#4338CA\\] {
      border-color: ${theme.primaryBrandColor} !important;
    }
    ${radiusRule}
  `;
};

export const loadAdminRefunds = () => loadFromStorage<AdminRefundRecord[]>(KEYS.REFUNDS, DEFAULT_REFUNDS);
export const saveAdminRefunds = (refunds: AdminRefundRecord[]) => saveToStorage(KEYS.REFUNDS, refunds);

export const loadAdminPayouts = () => loadFromStorage<AdminPayoutRecord[]>(KEYS.PAYOUTS, DEFAULT_PAYOUTS);
export const saveAdminPayouts = (payouts: AdminPayoutRecord[]) => saveToStorage(KEYS.PAYOUTS, payouts);

export const loadAdminPaymentSettings = () =>
  loadFromStorage<AdminPaymentSettings>(KEYS.PAYMENT_SETTINGS, DEFAULT_PAYMENT_SETTINGS);
export const saveAdminPaymentSettings = (settings: AdminPaymentSettings) =>
  saveToStorage(KEYS.PAYMENT_SETTINGS, settings);

export const loadAdminAds = () => loadFromStorage<AdminAdCampaign[]>(KEYS.ADS, DEFAULT_ADS);
export const saveAdminAds = (ads: AdminAdCampaign[]) => saveToStorage(KEYS.ADS, ads);

export const recordAdClick = (adId: string) => {
  const ads = loadAdminAds();
  const updated = ads.map((ad) =>
    ad.id === adId
      ? {
          ...ad,
          clicks: ad.clicks + 1,
          impressions: ad.impressions + 1,
        }
      : ad
  );
  saveAdminAds(updated);
};

export const loadAdminContentSettings = () =>
  loadFromStorage<AdminContentSettings>(KEYS.CONTENT, DEFAULT_CONTENT_SETTINGS);
export const saveAdminContentSettings = (content: AdminContentSettings) =>
  saveToStorage(KEYS.CONTENT, content);

export const loadAdminDisputes = () => loadFromStorage<AdminBookingDispute[]>(KEYS.DISPUTES, DEFAULT_DISPUTES);
export const saveAdminDisputes = (disputes: AdminBookingDispute[]) => saveToStorage(KEYS.DISPUTES, disputes);

export const loadAdminEvents = () => loadFromStorage<AdminManagedEvent[]>(KEYS.EVENTS, DEFAULT_EVENTS);
export const saveAdminEvents = (events: AdminManagedEvent[]) => saveToStorage(KEYS.EVENTS, events);

export const loadAdminAppSettings = () =>
  loadFromStorage<AdminAppSettings>(KEYS.APP_SETTINGS, DEFAULT_APP_SETTINGS);
export const saveAdminAppSettings = (settings: AdminAppSettings) =>
  saveToStorage(KEYS.APP_SETTINGS, settings);

export const loadAdminAuditLogs = () =>
  loadFromStorage<AdminAuditLogEntry[]>(KEYS.AUDIT_LOGS, DEFAULT_AUDIT_LOGS);

export const appendAdminAuditLog = (
  section: AdminAuditLogEntry['section'],
  action: string,
  details: string,
  status: AdminAuditLogEntry['status'] = 'published',
  actorName = 'Narendra (Super Admin)',
  actorRole = 'admin'
): AdminAuditLogEntry[] => {
  const existing = loadAdminAuditLogs();
  const now = new Date();
  const timestamp = `${now.toISOString().slice(0, 10)} ${now.toTimeString().slice(0, 8)}`;
  const entry: AdminAuditLogEntry = {
    id: `AUD-${Date.now().toString().slice(-5)}`,
    timestamp,
    actorName,
    actorRole,
    section,
    action,
    details,
    status,
  };
  const next = [entry, ...existing].slice(0, 200);
  saveToStorage(KEYS.AUDIT_LOGS, next);
  return next;
};

export const DEFAULT_INTEGRATIONS: AdminIntegrationConfig[] = [
  {
    id: 'int-whatsapp-bridge',
    name: 'WhatsApp Click-to-Chat Direct Bridge',
    category: 'messaging',
    providerType: 'built_in_active',
    status: 'synced',
    enabled: true,
    description:
      'Formats verified provider mobile numbers with country code and pre-filled listing context for direct customer-to-provider WhatsApp enquiries.',
    endpointOrMode: 'Client URI Protocol (wa.me)',
    maskedSecretStatus: 'No Secret Required (Public Deep-Link Protocol)',
    lastSyncAt: '2026-10-29 09:15:00',
    syncLatencyMs: 14,
    successRatePercent: 99.8,
    settings: {
      defaultCountryPrefix: '+91',
      includeListingIdInMessage: true,
      fallbackSupportNumber: '+91 98480 22338',
    },
    errorLogs: [
      {
        id: 'err-wa-1',
        timestamp: '2026-10-28 18:12:04',
        code: 'PHONE_FORMAT_WARN',
        message: '1 draft listing had a 9-digit phone number; normalized fallback applied.',
        resolved: true,
      },
    ],
    updatedBy: 'Narendra (Super Admin)',
    updatedAt: '2026-10-29 09:15',
    publishState: 'published',
  },
  {
    id: 'int-web-speech-voice',
    name: 'Web Speech Voice Search & Assisted Registration',
    category: 'voice_ai',
    providerType: 'built_in_active',
    status: 'synced',
    enabled: true,
    description:
      'Browser-native SpeechRecognition & SpeechSynthesis engine powering multi-language voice search and step-by-step spoken provider registration.',
    endpointOrMode: 'Browser Web Speech API (webkitSpeechRecognition / speechSynthesis)',
    maskedSecretStatus: 'No API Key Required (On-Device Browser Engine)',
    lastSyncAt: '2026-10-29 09:20:00',
    syncLatencyMs: 28,
    successRatePercent: 97.4,
    settings: {
      defaultLocale: 'en-IN',
      supportTeluguVoice: true,
      supportHindiVoice: true,
      autoReadPrompts: true,
    },
    errorLogs: [
      {
        id: 'err-speech-1',
        timestamp: '2026-10-27 21:05:19',
        code: 'MIC_PERMISSION_DENIED',
        message: 'User browser blocked microphone permission on 1 session; fell back to text input.',
        resolved: false,
      },
    ],
    updatedBy: 'Narendra (Super Admin)',
    updatedAt: '2026-10-29 09:20',
    publishState: 'published',
  },
  {
    id: 'int-local-persistence-sync',
    name: 'Enterprise LocalStorage & Cross-Tab State Sync',
    category: 'storage_sync',
    providerType: 'built_in_active',
    status: 'synced',
    enabled: true,
    description:
      'Persists listings, bookings, provider registrations, theme settings, announcements, and audit logs across sessions with CustomEvent real-time synchronization.',
    endpointOrMode: 'Indexed LocalStorage + CustomEvent Bus (bos_admin_*_v2)',
    maskedSecretStatus: 'Protected Local Sandbox (No External Token)',
    lastSyncAt: '2026-10-29 09:30:00',
    syncLatencyMs: 6,
    successRatePercent: 100,
    settings: {
      maxAuditEntries: 200,
      crossTabLiveBroadcast: true,
      autoValidateSchemaOnLoad: true,
    },
    errorLogs: [],
    updatedBy: 'Narendra (Super Admin)',
    updatedAt: '2026-10-29 09:30',
    publishState: 'published',
  },
  {
    id: 'int-gst-invoice-print',
    name: 'GST Invoice & Receipt Print Generator',
    category: 'billing_print',
    providerType: 'built_in_active',
    status: 'synced',
    enabled: true,
    description:
      'Generates itemized GST-compliant booking receipts, commission breakdowns, and CSV/JSON analytical exports directly in the client.',
    endpointOrMode: 'Client Document Formatter & Blob Export Engine',
    maskedSecretStatus: 'No Secret Required (Internal Module)',
    lastSyncAt: '2026-10-29 08:45:00',
    syncLatencyMs: 19,
    successRatePercent: 99.5,
    settings: {
      invoicePrefix: 'INV-BOS-2026-',
      includeHsnSacCode: true,
      defaultSacCode: '9963 / 9985',
    },
    errorLogs: [],
    updatedBy: 'Narendra (Super Admin)',
    updatedAt: '2026-10-29 08:45',
    publishState: 'published',
  },
  {
    id: 'int-external-payment-webhook',
    name: 'External Live Payment Gateway Webhook (Razorpay / Stripe)',
    category: 'external_gateway',
    providerType: 'unconfigured_external',
    status: 'not_configured',
    enabled: false,
    description:
      'External server-to-server payment webhook settlement. Currently NOT connected; the app safely runs in Local Checkout Simulation mode without exposing client secrets.',
    endpointOrMode: 'Not Configured (Server Proxy /api/payments/webhook Required)',
    maskedSecretStatus: 'Not Configured — Secrets Never Stored in Browser',
    lastSyncAt: 'Never',
    syncLatencyMs: 0,
    successRatePercent: 0,
    settings: {
      simulationFallbackActive: true,
      requireServerProxyForLiveCapture: true,
    },
    errorLogs: [
      {
        id: 'err-pg-1',
        timestamp: '2026-10-29 00:00:00',
        code: 'GATEWAY_NOT_CONFIGURED',
        message: 'Live external payment webhook is not configured. Using local simulated checkout receipts.',
        resolved: false,
      },
    ],
    updatedBy: 'System Guard',
    updatedAt: '2026-10-29 00:00',
    publishState: 'published',
  },
  {
    id: 'int-external-sms-gateway',
    name: 'External Transactional SMS / OTP Gateway',
    category: 'external_gateway',
    providerType: 'unconfigured_external',
    status: 'not_configured',
    enabled: false,
    description:
      'External telecom DLT SMS provider. Not connected in browser environment; uses in-app notification banners and simulated OTP verification.',
    endpointOrMode: 'Not Configured (Server Proxy /api/sms/send Required)',
    maskedSecretStatus: 'Not Configured — Secrets Never Stored in Browser',
    lastSyncAt: 'Never',
    syncLatencyMs: 0,
    successRatePercent: 0,
    settings: {
      inAppOtpFallback: true,
      dltTemplateRegistered: false,
    },
    errorLogs: [
      {
        id: 'err-sms-1',
        timestamp: '2026-10-29 00:00:00',
        code: 'SMS_PROVIDER_UNCONFIGURED',
        message: 'External SMS gateway is not connected. In-app OTP & WhatsApp deep-links are used instead.',
        resolved: false,
      },
    ],
    updatedBy: 'System Guard',
    updatedAt: '2026-10-29 00:00',
    publishState: 'published',
  },
];

export const DEFAULT_DATA_HYGIENE_CONFIG: AdminDataHygieneConfig = {
  requirePhoneOnListings: true,
  requireVerifiedImageOnListings: true,
  requirePincodeOnListings: true,
  requireSectionSpecificFields: true,
  autoQuarantineIncompleteDrafts: false,
  defaultFallbackCity: 'Hyderabad',
  defaultFallbackPincode: '500081',
  lastScanAt: '2026-10-29 09:00',
  updatedBy: 'Narendra (Super Admin)',
  publishState: 'published',
};

export const DEFAULT_DATA_QUARANTINE: AdminDataQuarantineItem[] = [
  {
    id: 'DQ-101',
    recordId: 'USR-1003',
    entityType: 'user',
    titleOrName: 'Srinivas Rao (Apex AI & Python Coaching)',
    sectionOrRole: 'provider',
    missingFields: ['GSTIN Number', 'Verified Institute Certificate'],
    severity: 'warning',
    resolutionStatus: 'needs_attention',
    notes: 'Provider registered 2 coaching listings; KYC certificate verification pending.',
    updatedAt: '2026-10-28 16:40',
    updatedBy: 'System Hygiene Scanner',
  },
];

export const DEFAULT_ANNOUNCEMENTS: AdminAnnouncementNotice[] = [
  {
    id: 'ANN-101',
    title: 'Module Status Notice',
    message: 'Under development—we’ll update you soon. New live seat availability & instant virtual tour schedules are being rolled out across selected categories.',
    messageTe: 'అభివృద్ధిలో ఉంది—మేము త్వరలోనే అప్‌డేట్ చేస్తాము. ఎంపిక చేసిన కేటగిరీలలో కొత్త లైవ్ సీట్ లభ్యత మరియు వర్చువల్ టూర్ సదుపాయాలు త్వరలో అందుబాటులోకి వస్తాయి.',
    messageHi: 'विकास के अधीन है—हम आपको जल्द ही अपडेट करेंगे। चुनिंदा श्रेणियों में नई लाइव सीट उपलब्धता और वर्चुअल टूर सुविधाएं जल्द ही शुरू की जा रही हैं।',
    severity: 'development',
    placement: 'below_header',
    targetAudience: 'all',
    targetSection: 'all',
    language: 'all',
    startTime: '2025-01-01T00:00',
    endTime: '2027-12-31T23:59',
    dismissible: true,
    ctaLabel: 'Explore Active Listings',
    ctaActionSection: 'none',
    publishState: 'published',
    createdBy: 'Narendra (Super Admin)',
    updatedAt: '2026-10-29 09:00',
  },
  {
    id: 'ANN-102',
    title: 'Provider KYC & Category Details Update',
    message: 'Providers: Please ensure all section-specific fields (Sharing Type for PGs, Batch Mode for Classes, Hall Capacity for Venues) are completed for priority Spotlight placement.',
    messageTe: 'ప్రొవైడర్లకు గమనిక: స్పాట్‌లైట్‌లో ప్రాధాన్యత కోసం మీ కేటగిరీకి సంబంధించిన అన్ని వివరాలను పూర్తి చేయండి.',
    messageHi: 'प्रदाताओं के लिए सूचना: स्पॉटलाइट में प्राथमिकता पाने के लिए कृपया अपनी श्रेणी से संबंधित सभी विवरण पूरे करें।',
    severity: 'info',
    placement: 'spotlight_strip',
    targetAudience: 'provider',
    targetSection: 'all',
    language: 'all',
    startTime: '2025-01-01T00:00',
    endTime: '2027-12-31T23:59',
    dismissible: true,
    ctaLabel: '',
    ctaActionSection: 'none',
    publishState: 'published',
    createdBy: 'Narendra (Super Admin)',
    updatedAt: '2026-10-29 09:10',
  },
  {
    id: 'ANN-103',
    title: 'Scheduled Nightly Index Maintenance (Draft)',
    message: 'Under development—we’ll update you soon. Scheduled search index optimization window between 02:00 AM and 02:30 AM IST.',
    messageTe: 'అభివృద్ధిలో ఉంది—మేము త్వరలోనే అప్‌డేట్ చేస్తాము. రాత్రి 02:00 నుండి 02:30 వరకు సెర్చ్ ఆప్టిమైజేషన్ జరుగుతుంది.',
    messageHi: 'विकास के अधीन है—हम आपको जल्द ही अपडेट करेंगे। रात 02:00 से 02:30 बजे के बीच सर्च इंडेक्स ऑप्टिमाइजेशन होगा।',
    severity: 'maintenance',
    placement: 'top_banner',
    targetAudience: 'all',
    targetSection: 'all',
    language: 'all',
    startTime: '2026-01-01T00:00',
    endTime: '2027-12-31T23:59',
    dismissible: true,
    ctaLabel: '',
    ctaActionSection: 'none',
    publishState: 'draft',
    createdBy: 'Narendra (Super Admin)',
    updatedAt: '2026-10-29 09:15',
  },
];

export const loadAdminIntegrations = (): AdminIntegrationConfig[] =>
  loadFromStorage<AdminIntegrationConfig[]>(KEYS.INTEGRATIONS, DEFAULT_INTEGRATIONS);

export const saveAdminIntegrations = (integrations: AdminIntegrationConfig[]) => {
  saveToStorage(KEYS.INTEGRATIONS, integrations);
  window.dispatchEvent(new CustomEvent('bos-integrations-updated', { detail: integrations }));
};

export const loadAdminDataQuarantine = (): AdminDataQuarantineItem[] =>
  loadFromStorage<AdminDataQuarantineItem[]>(KEYS.DATA_QUARANTINE, DEFAULT_DATA_QUARANTINE);

export const saveAdminDataQuarantine = (items: AdminDataQuarantineItem[]) =>
  saveToStorage(KEYS.DATA_QUARANTINE, items);

export const loadAdminDataHygieneConfig = (): AdminDataHygieneConfig =>
  loadFromStorage<AdminDataHygieneConfig>(KEYS.DATA_HYGIENE, DEFAULT_DATA_HYGIENE_CONFIG);

export const saveAdminDataHygieneConfig = (config: AdminDataHygieneConfig) =>
  saveToStorage(KEYS.DATA_HYGIENE, config);

export const loadAdminAnnouncements = (): AdminAnnouncementNotice[] =>
  loadFromStorage<AdminAnnouncementNotice[]>(KEYS.ANNOUNCEMENTS, DEFAULT_ANNOUNCEMENTS);

export const saveAdminAnnouncements = (notices: AdminAnnouncementNotice[]) => {
  saveToStorage(KEYS.ANNOUNCEMENTS, notices);
  window.dispatchEvent(new CustomEvent('bos-announcements-updated', { detail: notices }));
};

