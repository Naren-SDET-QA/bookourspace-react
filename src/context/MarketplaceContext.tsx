import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { 
  UserRole, 
  MarketplaceListing, 
  CategoryDef, 
  PostingPlan, 
  Enquiry, 
  Booking, 
  Review, 
  NotificationItem, 
  PaymentTransaction,
  ListingStatus,
  CustomFieldDef,
  CustomerAction
} from '../types/marketplace';
import { all44Categories } from '../data/categoriesData';
import { DEMO_DATA_ENABLED } from '../lib/demoDataPolicy';
import { launchGoogleOAuthWindow } from '../lib/googleOAuthLauncher';
import { 
  initialListings, 
  initialPostingPlans, 
  initialEnquiries, 
  initialBookings, 
  initialReviews, 
  initialTransactions,
  ensureListingPriceBreakdown
} from '../data/seedData';
import { saveMarketplaceToCache, useOnlineStatus } from '../utils/marketplaceCache';
import { listingImageSources } from '../lib/media/signedStorageUrl';

/**
 * Maps the public PostgreSQL feed (approved listings only) onto the UI model.
 * Contact fields are not part of the public projection, so none are mapped.
 */
const EMPTY_PRIVATE_CONTACT = { providerPhone: '', providerEmail: '', providerAvatar: '' };

function mapPostgresPublicListing(entry: any): MarketplaceListing {
  const attributes =
    entry?.attributes && typeof entry.attributes === 'object' ? entry.attributes : {};
  const location = attributes.location && typeof attributes.location === 'object'
    ? attributes.location
    : {};
  const images = listingImageSources(attributes.images, attributes, entry);
  return {
    id: String(entry?.id || ''),
    title: String(entry?.title || ''),
    description: String(attributes.description || ''),
    categoryId: String(entry?.categoryId || ''),
    subcategory: String(entry?.subcategory || ''),
    entityType: String(entry?.entityType || 'listing') as MarketplaceListing['entityType'],
    price: Number(entry?.price),
    priceUnit: String(entry?.priceUnit || ''),
    currency: '₹',
    location: {
      city: String(location.city || attributes.city || ''),
      area: String(location.area || attributes.area || ''),
      state: typeof location.state === 'string' ? location.state : undefined,
      pincode: typeof location.pincode === 'string' ? location.pincode : undefined,
    },
    images,
    providerId: '',
    providerName: String(entry?.providerName || ''),
    ...EMPTY_PRIVATE_CONTACT,
    providerRating: undefined as unknown as number,
    reviewCount: undefined as unknown as number,
    status: 'active',
    isVerified: entry?.isVerified === true,
    isFeatured: entry?.isFeatured === true,
    createdAt: String(entry?.createdAt || '').slice(0, 10),
    viewsCount: 0,
    enquiriesCount: 0,
    customFieldValues: attributes.customFieldValues && typeof attributes.customFieldValues === 'object'
      ? attributes.customFieldValues
      : {},
    postingPlanId: '',
    expiresAt: '',
    reported: false,
  };
}
import { User, Session } from '@supabase/supabase-js';
import {
  supabase,
  isSupabaseConfigured,
  SupabaseProfile,
  fetchRlsProfile,
  upsertRlsProfile,
  fetchRlsListings,
  insertRlsListing,
  updateRlsListing,
  deleteRlsListing,
  fetchRlsBookings,
  fetchRlsEnquiries,
  insertRlsEnquiry,
  fetchRlsReviews,
  insertRlsReview,
  fetchRlsTransactions,
  fetchRlsFavorites,
  syncRlsFavorite,
  fetchRlsModuleConfigs,
  syncLocalAccountDataToSupabase,
  subscribeToRlsChanges,
  AuthoritativeGoogleUser,
  setStoredAuthoritativeSession,
  authenticateWithGoogleServer,
  signInWithSupabaseGoogleOAuth,
  fetchGoogleOAuthConfig,
  fetchCurrentAuthSession,
  logoutAuthoritativeSession,
  fetchServerNotifications,
  sendServerNotification,
  markServerNotificationRead,
  clearServerNotifications,
  syncServerProviderListing,
} from '../lib/supabaseClient';

interface MarketplaceContextType {
  supabaseUser: User | null;
  supabaseSession: Session | null;
  supabaseProfile: SupabaseProfile | null;
  authUser: AuthoritativeGoogleUser | null;
  isAccountBlocked: boolean;
  blockedReason: string | null;
  loginWithGoogle: (params: {
    email: string;
    name?: string;
    googleSub?: string;
    avatarUrl?: string;
    phone?: string;
    city?: string;
    requestedRole?: UserRole;
    allowRoleChange?: boolean;
  }) => Promise<{
    ok: boolean;
    /** True while the user is still completing sign-in in the Google window. */
    pending?: boolean;
    isNewUser?: boolean;
    user?: AuthoritativeGoogleUser;
    redirectTarget?: 'marketplace' | 'provider_portal' | 'admin_console';
    error?: string;
    message?: string;
  }>;
  applyPopupOAuthLogin: (payload: {
    user: AuthoritativeGoogleUser;
    sessionToken: string;
    isNewUser?: boolean;
    redirectTarget?: 'marketplace' | 'provider_portal' | 'admin_console';
  }) => Promise<void>;
  logoutGoogleSession: () => Promise<void>;
  refreshServerNotifications: () => Promise<void>;
  updateUserProfile: (updates: { fullName?: string; phone?: string; bio?: string }) => Promise<{
    ok: boolean;
    persisted: 'profile' | 'account_only' | 'none';
  }>;
  syncAccountData: () => Promise<number>;
  userRole: UserRole;
  setUserRole: (role: UserRole) => void;
  listings: MarketplaceListing[];
  categories: CategoryDef[];
  postingPlans: PostingPlan[];
  enquiries: Enquiry[];
  bookings: Booking[];
  reviews: Review[];
  transactions: PaymentTransaction[];
  notifications: NotificationItem[];
  
  // Listing Actions
  addListing: (listing: Omit<MarketplaceListing, 'id' | 'createdAt' | 'viewsCount' | 'enquiriesCount' | 'reported'>) => MarketplaceListing;
  updateListing: (id: string, updates: Partial<MarketplaceListing>) => void;
  deleteListing: (id: string) => Promise<boolean>;
  updateListingStatus: (id: string, status: ListingStatus) => Promise<boolean>;
  applyListingUpdateLocal: (id: string, updates: Partial<MarketplaceListing>) => void;
  toggleFeaturedListing: (id: string) => void;
  reportListing: (id: string, reason: string) => void;
  dismissReport: (id: string) => void;
  
  // Category & Custom Field Admin Actions
  addCategory: (cat: Omit<CategoryDef, 'id' | 'listingCount'>) => CategoryDef;
  updateCategory: (id: string, updates: Partial<CategoryDef>) => void;
  deleteCategory: (id: string) => void;
  addSubcategoryToCategory: (categoryId: string, subcategoryName: string) => void;
  deleteSubcategoryFromCategory: (categoryId: string, subcategoryName: string) => void;
  toggleSubcategoryEnabled: (categoryId: string, subcategoryName: string) => void;
  addCustomFieldToCategory: (categoryId: string, field: Omit<CustomFieldDef, 'id'>) => void;
  deleteCustomFieldFromCategory: (categoryId: string, fieldId: string) => void;

  // Plan Admin Actions
  updatePostingPlan: (id: string, updates: Partial<PostingPlan>) => void;
  addPostingPlan: (plan: Omit<PostingPlan, 'id'>) => void;

  // Customer & Provider Actions
  sendEnquiry: (listingId: string, message: string, customerName: string, customerPhone: string) => void;
  createBooking: (booking: Omit<Booking, 'id' | 'createdAt' | 'status'>) => void;
  deleteBooking: (bookingId: string) => void;
  cancelBooking: (bookingId: string) => void;
  restoreBooking: (booking: Booking) => void;
  addReview: (review: Omit<Review, 'id' | 'date'>) => { newRating: number; newCount: number };
  recordPayment: (type: PaymentTransaction['type'], amount: number, planName: string, method: string) => PaymentTransaction;
  markNotificationRead: (id: string) => void;
  clearAllNotifications: () => void;
  
  // Active Filter state
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  selectedCategory: string; // 'all' or categoryId
  setSelectedCategory: (catId: string) => void;
  selectedCategoryFilter: string;
  setSelectedCategoryFilter: (catId: string) => void;
  selectedEntityType: string; // 'all' or entityType
  setSelectedEntityType: (type: string) => void;
  selectedEntityTypeFilter: string;
  setSelectedEntityTypeFilter: (type: string) => void;
  selectedCity: string;
  setSelectedCity: (city: string) => void;
  selectedCityFilter: string;
  setSelectedCityFilter: (city: string) => void;
  selectedCustomerAction: CustomerAction;
  setSelectedCustomerAction: (action: CustomerAction) => void;
  verifiedOnly: boolean;
  setVerifiedOnly: (v: boolean) => void;
  featuredOnly: boolean;
  setFeaturedOnly: (f: boolean) => void;
  priceSort: 'none' | 'low_to_high' | 'high_to_low';
  setPriceSort: (s: 'none' | 'low_to_high' | 'high_to_low') => void;
  sortBy: 'distance_asc' | 'featured' | 'rating' | 'price_asc' | 'price_desc' | 'newest';
  setSortBy: (sort: 'distance_asc' | 'featured' | 'rating' | 'price_asc' | 'price_desc' | 'newest') => void;
  resetFilters: () => void;

  // Favorites persisted in localStorage
  favoriteIds: string[];
  toggleFavorite: (listingId: string) => boolean;
  pushSystemNotification: (notif: {
    title: string;
    message: string;
    type?: NotificationItem['type'];
    linkId?: string;
  }) => void;

  // Offline Caching & Connectivity
  isOnline: boolean;
  isCachedData: boolean;
  lastCacheTime: string | null;
  syncOfflineCache: () => Promise<void>;
}

const MarketplaceContext = createContext<MarketplaceContextType | undefined>(undefined);

export const MarketplaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Google OAuth User & Role
  // Persisted browser identity is only a cache. The signed server session below
  // must be revalidated before any role is shown or used.
  const [authUser, setAuthUser] = useState<AuthoritativeGoogleUser | null>(null);
  const [isAccountBlocked, setIsAccountBlocked] = useState<boolean>(false);
  const [blockedReason, setBlockedReason] = useState<string | null>(null);
  const [userRole, setUserRoleState] = useState<UserRole>('customer');
  // Child components may request a role for navigation, but cannot grant one.
  // Elevated roles are assigned only from a server-verified session/profile.
  const setUserRole = (role: UserRole) => {
    if (role === 'customer') {
      setUserRoleState('customer');
      return;
    }
    if (!isAccountBlocked && authUser?.role === role) setUserRoleState(role);
  };
  const [supabaseUser, setSupabaseUser] = useState<User | null>(null);
  const [supabaseSession, setSupabaseSession] = useState<Session | null>(null);
  const [supabaseProfile, setSupabaseProfile] = useState<SupabaseProfile | null>(null);
  // Guards the authoritative-session revocation so a sign-out event that is
  // caused by our own revocation cannot start another one.
  const logoutRevocationInFlight = useRef(false);

  // Browser storage and fixture data are not authoritative inventory. Preserve
  // existing local values, but show them only in explicit local demo mode.
  const [listings, setListings] = useState<MarketplaceListing[]>(() => {
    if (!DEMO_DATA_ENABLED) return [];
    try {
      const saved = localStorage.getItem('marketplace_listings_v18');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 20) {
          return parsed.map(ensureListingPriceBreakdown);
        }
      }
      localStorage.setItem('marketplace_listings_v18', JSON.stringify(initialListings));
      return initialListings;
    } catch {
      return initialListings;
    }
  });

  const [categories, setCategories] = useState<CategoryDef[]>(() => {
    try {
      const saved = localStorage.getItem('marketplace_categories');
      return saved ? JSON.parse(saved) : all44Categories;
    } catch {
      return all44Categories;
    }
  });

  const [postingPlans, setPostingPlans] = useState<PostingPlan[]>(() => {
    try {
      const saved = localStorage.getItem('marketplace_plans');
      return saved ? JSON.parse(saved) : initialPostingPlans;
    } catch {
      return initialPostingPlans;
    }
  });

  const [enquiries, setEnquiries] = useState<Enquiry[]>(() => {
    if (!DEMO_DATA_ENABLED) return [];
    try {
      const saved = localStorage.getItem('marketplace_enquiries');
      return saved ? JSON.parse(saved) : initialEnquiries;
    } catch {
      return initialEnquiries;
    }
  });

  const [bookings, setBookings] = useState<Booking[]>(() => {
    if (!DEMO_DATA_ENABLED) return [];
    try {
      const saved = localStorage.getItem('marketplace_bookings');
      return saved ? JSON.parse(saved) : initialBookings;
    } catch {
      return initialBookings;
    }
  });

  const [reviews, setReviews] = useState<Review[]>(() => {
    if (!DEMO_DATA_ENABLED) return [];
    try {
      const saved = localStorage.getItem('marketplace_reviews');
      return saved ? JSON.parse(saved) : initialReviews;
    } catch {
      return initialReviews;
    }
  });

  const [transactions, setTransactions] = useState<PaymentTransaction[]>(() => {
    if (!DEMO_DATA_ENABLED) return [];
    try {
      const saved = localStorage.getItem('marketplace_transactions');
      return saved ? JSON.parse(saved) : initialTransactions;
    } catch {
      return initialTransactions;
    }
  });

  const [notifications, setNotifications] = useState<NotificationItem[]>(DEMO_DATA_ENABLED ? [
    {
      id: 'notif-1',
      title: '⚡ New Enquiry Received',
      message: 'Ananya Sharma enquired for 3BHK Deep Home & Kitchen Sanitization',
      time: '10 mins ago',
      type: 'enquiry',
      read: false
    },
    {
      id: 'notif-2',
      title: '💳 Platform Fee Paid',
      message: '₹499 credited for Pro Specialist Plan renewal',
      time: '1 hour ago',
      type: 'payment',
      read: false
    },
    {
      id: 'notif-3',
      title: '🛡️ Listing Pending Approval',
      message: 'Dr. Srinivas Home Physiotherapy requires Admin moderation',
      time: '2 hours ago',
      type: 'approval',
      read: true
    }
  ] : []);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedEntityType, setSelectedEntityType] = useState('all');
  const [selectedCity, setSelectedCity] = useState('All Cities');
  const [selectedCustomerAction, setSelectedCustomerAction] = useState<CustomerAction>('all');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [priceSort, setPriceSort] = useState<'none' | 'low_to_high' | 'high_to_low'>('none');
  const [sortBy, setSortBy] = useState<'distance_asc' | 'featured' | 'rating' | 'price_asc' | 'price_desc' | 'newest'>('distance_asc');

  // Offline Caching & Connectivity
  const isOnline = useOnlineStatus();
  const [lastCacheTime, setLastCacheTime] = useState<string | null>(null);
  const [isCachedData, setIsCachedData] = useState<boolean>(false);

  // Sync to Browser Cache Storage & LocalStorage
  useEffect(() => {
    saveMarketplaceToCache(listings, categories).then(() => {
      setLastCacheTime(new Date().toLocaleTimeString());
      setIsCachedData(true);
    });
  }, [listings, categories]);

  const syncOfflineCache = async () => {
    await saveMarketplaceToCache(listings, categories);
    setLastCacheTime(new Date().toLocaleTimeString());
  };

  /**
   * Ask the server to mint an authoritative application session for the
   * current Supabase session. The server verifies the Supabase access token
   * itself, so this is the only place a browser session can become a server
   * session. Caller-supplied identity fields are never trusted.
   */
  function mintAuthoritativeSessionFromSupabase(session: Session | null): Promise<{
    ok: boolean;
    httpStatus: number;
    isNewUser?: boolean;
    user?: AuthoritativeGoogleUser;
    sessionToken?: string;
    redirectTarget?: 'marketplace' | 'provider_portal' | 'admin_console';
    error?: string;
    message?: string;
  }> {
    if (!session?.access_token || !session.user?.email) {
      return Promise.resolve({
        ok: false,
        httpStatus: 401,
        error: 'VERIFIED_GOOGLE_SESSION_REQUIRED',
        message: 'Complete Google sign-in before requesting an application session.',
      });
    }
    return authenticateWithGoogleServer({
      accessToken: session.access_token,
      email: session.user.email,
      name:
        session.user.user_metadata?.full_name ||
        session.user.user_metadata?.name,
      googleSub: session.user.user_metadata?.sub || session.user.id,
      avatarUrl:
        session.user.user_metadata?.avatar_url ||
        session.user.user_metadata?.picture,
      allowRoleChange: false,
    });
  }

  // Subscribe to Supabase Auth & hydrate RLS-protected user data when authenticated
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;

    let mounted = true;

    const loadRlsData = async (activeUser: User | null) => {
      // Public inventory is hydrated by /api/marketplace/listings. Avoid
      // duplicate anonymous Supabase listings/reviews requests; RLS hydration
      // here is for the signed-in account's protected data.
      if (!activeUser) return;

      const [remoteListings, remoteReviews] = await Promise.all([
        fetchRlsListings(),
        fetchRlsReviews(),
      ]);

      if (mounted && remoteListings !== null) {
        const fixtureIds = new Set(initialListings.map((listing) => listing.id));
        const customerListings = DEMO_DATA_ENABLED
          ? remoteListings
          : remoteListings.filter((listing) => !fixtureIds.has(listing.id));
        setListings(DEMO_DATA_ENABLED
          ? (prev) => {
              const existingIds = new Set(customerListings.map((r) => r.id));
              return [...customerListings, ...prev.filter((p) => !existingIds.has(p.id))];
            }
          : customerListings);
      }

      if (mounted && remoteReviews !== null) {
        setReviews(DEMO_DATA_ENABLED
          ? (prev) => {
              const existingIds = new Set(remoteReviews.map((r) => r.id));
              return [...remoteReviews, ...prev.filter((p) => !existingIds.has(p.id))];
            }
          : remoteReviews);
      }

      if (activeUser) {
        const [
          remoteProfile,
          remoteBookings,
          remoteEnquiries,
          remoteFavorites,
          remoteTransactions,
          remoteModuleConfigs,
        ] = await Promise.all([
          fetchRlsProfile(),
          fetchRlsBookings(),
          fetchRlsEnquiries(),
          fetchRlsFavorites(),
          fetchRlsTransactions(),
          fetchRlsModuleConfigs(),
        ]);

        if (mounted && remoteModuleConfigs) {
          let updatedModules = false;
          for (const [modKey, modVal] of Object.entries(remoteModuleConfigs)) {
            if (modVal !== undefined && modVal !== null) {
              try {
                localStorage.setItem(modKey, JSON.stringify(modVal));
                updatedModules = true;
              } catch {
                // ignore storage quota errors
              }
            }
          }
          if (updatedModules) {
            window.dispatchEvent(new CustomEvent('bos-dynamic-schema-updated'));
            window.dispatchEvent(new CustomEvent('bos-modular-templates-updated'));
            window.dispatchEvent(new CustomEvent('bos-universal-elements-updated'));
            window.dispatchEvent(new CustomEvent('bos-live-page-config-updated'));
            window.dispatchEvent(new CustomEvent('bos-theme-settings-updated'));
          }
        }

        if (mounted && remoteProfile) {
          setSupabaseProfile(remoteProfile);
          if (['customer', 'provider', 'admin'].includes(remoteProfile.role)) {
            setUserRoleState(remoteProfile.role);
          }
        } else if (mounted) {
          // The RLS profile is optional. When it is unavailable the role that
          // the server verified for this session is kept; it must never be
          // downgraded or upgraded from a missing row.
          setSupabaseProfile(null);
        }

        if (mounted && remoteBookings !== null) {
          setBookings(DEMO_DATA_ENABLED
            ? (prev) => {
                const ids = new Set(remoteBookings.map((b) => b.id));
                return [...remoteBookings, ...prev.filter((b) => !ids.has(b.id))];
              }
            : remoteBookings);
        }
        if (mounted && remoteEnquiries !== null) {
          setEnquiries(DEMO_DATA_ENABLED
            ? (prev) => {
                const ids = new Set(remoteEnquiries.map((e) => e.id));
                return [...remoteEnquiries, ...prev.filter((e) => !ids.has(e.id))];
              }
            : remoteEnquiries);
        }
        if (mounted && remoteFavorites && remoteFavorites.length > 0) {
          setFavoriteIds((prev) => Array.from(new Set([...remoteFavorites, ...prev])));
        }
        if (mounted && remoteTransactions !== null) {
          setTransactions(DEMO_DATA_ENABLED
            ? (prev) => {
                const ids = new Set(remoteTransactions.map((t) => t.id));
                return [...remoteTransactions, ...prev.filter((t) => !ids.has(t.id))];
              }
            : remoteTransactions);
        }
      } else if (mounted) {
        setSupabaseProfile(null);
      }
    };

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSupabaseSession(data.session);
      setSupabaseUser(data.session?.user ?? null);
      void loadRlsData(data.session?.user ?? null);
      if (data.session?.user?.email) {
        void mintAuthoritativeSessionFromSupabase(data.session).then((syncRes) => {
          if (mounted && syncRes.ok && syncRes.user) {
            setAuthUser(syncRes.user);
            setUserRoleState(syncRes.user.role);
            syncLocalProfileWithGoogleUser(syncRes.user);
          }
        });
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      setSupabaseSession(session);
      setSupabaseUser(session?.user ?? null);
      if (event === 'SIGNED_OUT') {
        // A Supabase sign-out can also happen outside this tab. Revoke the
        // authoritative session on the server so a token that is still cached
        // elsewhere cannot keep using the platform.
        if (!logoutRevocationInFlight.current) {
          logoutRevocationInFlight.current = true;
          void logoutAuthoritativeSession().finally(() => {
            logoutRevocationInFlight.current = false;
          });
        }
        setStoredAuthoritativeSession(null, null);
        try {
          localStorage.removeItem('bos_authoritative_session_token');
          localStorage.removeItem('bos_session_token');
        } catch {
          // ignore storage errors
        }
        setAuthUser(null);
        setSupabaseProfile(null);
        setIsAccountBlocked(false);
        setBlockedReason(null);
        setUserRoleState('customer');
        clearProtectedSessionCaches();
        try {
          localStorage.removeItem('bos_user_profile_v1');
          localStorage.setItem('user_role', 'customer');
        } catch {
          // ignore storage errors
        }
        window.dispatchEvent(new CustomEvent('bos-google-oauth-logout'));
        void loadRlsData(null);
        return;
      }
      void loadRlsData(session?.user ?? null);
      if (event === 'SIGNED_IN' && session?.user?.email) {
        void mintAuthoritativeSessionFromSupabase(session).then((syncRes) => {
          if (mounted && syncRes.ok && syncRes.user) {
            setIsAccountBlocked(false);
            setBlockedReason(null);
            setAuthUser(syncRes.user);
            setUserRoleState(syncRes.user.role);
            syncLocalProfileWithGoogleUser(syncRes.user);
            if (window.opener && syncRes.sessionToken) {
              window.opener.postMessage(
                {
                  type: 'OAUTH_AUTH_SUCCESS',
                  isNewUser: syncRes.isNewUser,
                  user: syncRes.user,
                  sessionToken: syncRes.sessionToken,
                  redirectTarget: syncRes.redirectTarget,
                },
                window.location.origin
              );
              window.close();
            }
            window.dispatchEvent(
              new CustomEvent('bos-google-oauth-redirect', {
                detail: {
                  user: syncRes.user,
                  isNewUser: syncRes.isNewUser,
                  redirectTarget: syncRes.redirectTarget,
                },
              })
            );
          } else if (mounted) {
            const message = syncRes.message || 'Google sign-in could not be verified. Please try again.';
            if (syncRes.error === 'ACCOUNT_BLOCKED') {
              setIsAccountBlocked(true);
              setBlockedReason(message);
            }
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_ERROR', error: syncRes.error, message }, window.location.origin);
              window.close();
            } else {
              window.dispatchEvent(new CustomEvent('bos-google-oauth-error', { detail: { error: syncRes.error, message } }));
            }
          }
        });
      }
    });

    const unsubscribeRealtime = subscribeToRlsChanges(() => {
      if (!mounted || !supabase) return;
      void supabase.auth.getUser().then(({ data }) => {
        if (mounted) {
          void loadRlsData(data.user ?? null);
        }
      });
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
      unsubscribeRealtime();
    };
  }, []);

  const syncLocalProfileWithGoogleUser = (user: AuthoritativeGoogleUser | null) => {
    if (!user) return;
    try {
      const profilePayload = {
        name: user.name,
        phone: user.phone || '',
        email: user.email,
        address: user.city ? `${user.city}, India` : '',
        avatarUrl: user.avatarUrl || '',
        googleSub: user.googleSub,
        authProvider: 'google',
      };
      localStorage.setItem('bos_user_profile_v1', JSON.stringify(profilePayload));
      localStorage.setItem('user_role', user.role);
    } catch {
      // ignore storage errors
    }
  };

  const refreshServerNotifications = async () => {
    const res = await fetchServerNotifications({
      userId: authUser?.id,
      role: userRole,
    });
    if (res.ok && res.notifications.length > 0) {
      setNotifications((prev) => {
        const serverMapped: NotificationItem[] = res.notifications.map((n) => ({
          id: n.id,
          title: n.title,
          message: n.message,
          time: n.createdAt ? new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now',
          type:
            n.type === 'enquiry'
              ? 'enquiry'
              : n.type === 'payment'
              ? 'payment'
              : n.type === 'security'
              ? 'report'
              : n.type === 'system'
              ? 'approval'
              : 'booking',
          read: Boolean(n.read || (authUser?.id && Array.isArray(n.readBy) && n.readBy.includes(authUser.id))),
        }));
        const serverIds = new Set(serverMapped.map((s) => s.id));
        const localOnly = prev.filter((p) => !serverIds.has(p.id));
        return [...serverMapped, ...localOnly];
      });
    }
  };

  // Authoritative session verification & real-time account blocking check
  useEffect(() => {
    let mounted = true;
    const verifySessionAndSync = async () => {
      const sessionRes = await fetchCurrentAuthSession();
      if (!mounted) return;
      if (sessionRes.blocked) {
        setIsAccountBlocked(true);
        setBlockedReason(
          sessionRes.message ||
            'Your account has been suspended or blocked by an administrator. Access is denied.'
        );
        setAuthUser(null);
        setUserRoleState('customer');
        return;
      }
      if (sessionRes.authenticated && sessionRes.user) {
        setIsAccountBlocked(false);
        setBlockedReason(null);
        setAuthUser(sessionRes.user);
        if (['customer', 'provider', 'admin'].includes(sessionRes.user.role)) {
          setUserRoleState(sessionRes.user.role);
        }
        syncLocalProfileWithGoogleUser(sessionRes.user);
      } else {
        // The authoritative session can be missing or expired while the
        // Supabase session is still valid (a cleared cache, an expired server
        // session, or a reload that raced the first sign-in). Re-mint it from
        // the verified Supabase session instead of dropping the user.
        const supabaseSessionNow = supabase ? (await supabase.auth.getSession()).data.session : null;
        if (!mounted) return;
        const reminted = await mintAuthoritativeSessionFromSupabase(supabaseSessionNow);
        if (!mounted) return;
        if (reminted.ok && reminted.user) {
          setIsAccountBlocked(false);
          setBlockedReason(null);
          setAuthUser(reminted.user);
          setUserRoleState(reminted.user.role);
          syncLocalProfileWithGoogleUser(reminted.user);
        } else if (reminted.error === 'ACCOUNT_BLOCKED') {
          setIsAccountBlocked(true);
          setBlockedReason(reminted.message || 'Your account is blocked.');
          setAuthUser(null);
          setUserRoleState('customer');
          return;
        } else {
          setAuthUser(null);
          setUserRoleState('customer');
          return;
        }
      }
      window.setTimeout(() => {
        if (mounted) void refreshServerNotifications();
      }, 1200);
    };

    void verifySessionAndSync();
    const intervalId = setInterval(() => {
      void verifySessionAndSync();
    }, 12000);

    const handlePopupOAuthMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'OAUTH_AUTH_SUCCESS' && data.user && data.sessionToken) {
        void applyPopupOAuthLogin({
          user: data.user,
          sessionToken: data.sessionToken,
          isNewUser: data.isNewUser,
          redirectTarget: data.redirectTarget,
        });
      } else if (data.type === 'OAUTH_AUTH_ERROR') {
        if (data.error === 'ACCOUNT_BLOCKED') {
          setIsAccountBlocked(true);
          setBlockedReason(
            data.message || 'Your account has been suspended or blocked by an administrator.'
          );
          setAuthUser(null);
        }
        window.dispatchEvent(new CustomEvent('bos-google-oauth-error', {
          detail: { error: data.error, message: data.message },
        }));
      }
    };

    window.addEventListener('message', handlePopupOAuthMessage);
    return () => {
      mounted = false;
      clearInterval(intervalId);
      window.removeEventListener('message', handlePopupOAuthMessage);
    };
  }, [authUser?.id, userRole]);

  const loginWithGoogle = async (params: {
    email: string;
    name?: string;
    googleSub?: string;
    avatarUrl?: string;
    phone?: string;
    city?: string;
    requestedRole?: UserRole;
    allowRoleChange?: boolean;
  }) => {
    // Caller-supplied identity fields are not authentication. Start the real
    // Supabase Google OAuth flow; identity is synced only after the SDK returns
    // a session that the server independently verifies.
    //
    // The popup is opened synchronously inside the click gesture so the browser
    // cannot discard the user activation while the authorize URL is requested.
    // When the popup is blocked the same authorize URL is used for a full-page
    // redirect, so a blocked popup never silently drops the sign-in.
    const isNative = Capacitor.isNativePlatform();
    const popup = isNative ? null : window.open(
      'about:blank',
      'bos_google_oauth_popup',
      'width=540,height=680,menubar=no,toolbar=no,location=yes,status=no'
    );
    let oauth = await signInWithSupabaseGoogleOAuth(params.requestedRole || 'customer');
    if (!oauth.ok || !oauth.url) {
      // The browser bundle can be without a Supabase client while the server
      // still has the project configured. Ask the server for its authorize URL.
      if (!isNative) {
        const serverOAuth = await fetchGoogleOAuthConfig(params.requestedRole || 'customer');
        if (serverOAuth.ok && serverOAuth.url) {
          oauth = { ok: true, url: serverOAuth.url };
        }
      }
    }
    if (!oauth.ok || !oauth.url) {
      popup?.close();
      return { ok: false, error: oauth.error || 'GOOGLE_OAUTH_NOT_CONFIGURED', message: 'Secure Google sign-in is unavailable. Configure Supabase Auth and try again.' };
    }
    if (isNative) {
      await Browser.open({ url: oauth.url });
    } else {
      launchGoogleOAuthWindow({
        window: popup,
        url: oauth.url,
        redirect: (url) => window.location.assign(url),
      });
    }
    return {
      ok: false,
      pending: true,
      error: 'GOOGLE_OAUTH_PENDING',
      message: 'Complete Google sign-in to continue. Your account updates after the server verifies it.',
    };
  };

  const applyPopupOAuthLogin = (payload: {
    user: AuthoritativeGoogleUser;
    sessionToken: string;
    isNewUser?: boolean;
    redirectTarget?: 'marketplace' | 'provider_portal' | 'admin_console';
  }): Promise<void> => {
    setStoredAuthoritativeSession(payload.sessionToken, payload.user);
    setAuthUser(null);
    setUserRoleState('customer');
    return fetchCurrentAuthSession().then(async (sessionRes) => {
      if (sessionRes.blocked) {
        setIsAccountBlocked(true);
        setBlockedReason(sessionRes.message || 'Your account is blocked.');
        setAuthUser(null);
        setUserRoleState('customer');
        return;
      }
      if (!sessionRes.authenticated || !sessionRes.user) {
        await logoutAuthoritativeSession();
        return;
      }
      setIsAccountBlocked(false);
      setBlockedReason(null);
      setAuthUser(sessionRes.user);
      setUserRoleState(sessionRes.user.role);
      syncLocalProfileWithGoogleUser(sessionRes.user);
      void refreshServerNotifications();
      window.dispatchEvent(new CustomEvent('bos-google-oauth-redirect', {
        detail: {
          user: sessionRes.user,
          isNewUser: payload.isNewUser,
          redirectTarget: payload.redirectTarget,
        },
      }));
    });
  };

  const clearProtectedSessionCaches = () => {
    setBookings([]);
    setEnquiries([]);
    setFavoriteIds([]);
    setTransactions([]);
    setNotifications([]);
    try {
      localStorage.removeItem('marketplace_bookings');
      localStorage.removeItem('marketplace_enquiries');
      localStorage.removeItem('marketplace_transactions');
      localStorage.removeItem('bos_saved_favorites_v1');
    } catch { /* Storage can be unavailable in private browsing. */ }
  };

  const logoutGoogleSession = async () => {
    logoutRevocationInFlight.current = true;
    try {
      await logoutAuthoritativeSession();
    } finally {
      logoutRevocationInFlight.current = false;
    }
    setAuthUser(null);
    setSupabaseUser(null);
    setSupabaseSession(null);
    setSupabaseProfile(null);
    setIsAccountBlocked(false);
    setBlockedReason(null);
    setUserRoleState('customer');
    clearProtectedSessionCaches();
    try {
      localStorage.removeItem('bos_user_profile_v1');
      localStorage.removeItem('bos_authoritative_session_token');
      localStorage.removeItem('bos_session_token');
      localStorage.setItem('user_role', 'customer');
    } catch {
      // ignore
    }
    window.dispatchEvent(new CustomEvent('bos-google-oauth-logout'));
  };

  /**
   * Save the profile. The result reports where the change was persisted so
   * the UI never claims a durable profile update that did not happen.
   */
  const updateUserProfile = async (updates: { fullName?: string; phone?: string; bio?: string }): Promise<{
    ok: boolean;
    persisted: 'profile' | 'account_only' | 'none';
  }> => {
    if (authUser) {
      const nextAuthUser: AuthoritativeGoogleUser = {
        ...authUser,
        name: updates.fullName ?? authUser.name,
        phone: updates.phone ?? authUser.phone,
        role: authUser.role,
      };
      setAuthUser(nextAuthUser);
      syncLocalProfileWithGoogleUser(nextAuthUser);
    }
    if (!isSupabaseConfigured) {
      return { ok: false, persisted: 'none' };
    }
    const updated = await upsertRlsProfile({ fullName: updates.fullName, phone: updates.phone, bio: updates.bio });
    if (updated.profile) {
      setSupabaseProfile(updated.profile);
      if (['customer', 'provider', 'admin'].includes(updated.profile.role)) {
        setUserRoleState(updated.profile.role);
      }
      return { ok: updated.accountUpdated, persisted: 'profile' };
    }
    // The account metadata may have been updated, but the durable profile row
    // could not be written. The caller must report this honestly.
    return { ok: false, persisted: updated.accountUpdated ? 'account_only' : 'none' };
  };

  const syncAccountData = async (): Promise<number> => {
    if (!isSupabaseConfigured) return 0;
    const seedIds = new Set(initialListings.map((l) => l.id));
    const customListings = listings.filter((l) => !seedIds.has(l.id));
    const { syncedCount } = await syncLocalAccountDataToSupabase({
      customListings,
      bookings,
      enquiries,
      favorites: favoriteIds,
      transactions,
    });
    return syncedCount;
  };

  // Sync to local storage
  useEffect(() => {
    if (!DEMO_DATA_ENABLED) return;
    try {
      localStorage.setItem('marketplace_listings_v18', JSON.stringify(listings));
    } catch {}
  }, [listings]);

  useEffect(() => {
    try {
      localStorage.setItem('marketplace_categories', JSON.stringify(categories));
    } catch {}
  }, [categories]);

  useEffect(() => {
    try {
      localStorage.setItem('marketplace_plans', JSON.stringify(postingPlans));
    } catch {}
  }, [postingPlans]);

  useEffect(() => {
    if (!DEMO_DATA_ENABLED) return;
    try {
      localStorage.setItem('marketplace_enquiries', JSON.stringify(enquiries));
    } catch {}
  }, [enquiries]);

  useEffect(() => {
    if (!DEMO_DATA_ENABLED) return;
    try {
      localStorage.setItem('marketplace_bookings', JSON.stringify(bookings));
    } catch {}
  }, [bookings]);

  useEffect(() => {
    if (!DEMO_DATA_ENABLED) return;
    try {
      localStorage.setItem('marketplace_reviews', JSON.stringify(reviews));
    } catch {}
  }, [reviews]);

  useEffect(() => {
    if (!DEMO_DATA_ENABLED) return;
    try {
      localStorage.setItem('marketplace_transactions', JSON.stringify(transactions));
    } catch {}
  }, [transactions]);

  // One PostgreSQL source: hydrate approved listings from the public feed.
  // Only a `postgresql` response is trusted, so local JSON/demo data can never
  // be mistaken for database-backed inventory.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch('/api/marketplace/listings', {
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) return;
        const data = await response.json();
        if (!data || data.source !== 'postgresql' || !Array.isArray(data.listings)) return;
        const mapped = data.listings.map(mapPostgresPublicListing);
        if (cancelled) return;
        setListings(DEMO_DATA_ENABLED
          ? (previous) => {
              const remoteIds = new Set(mapped.map((listing: MarketplaceListing) => listing.id));
              return [...mapped, ...previous.filter((listing: MarketplaceListing) => !remoteIds.has(listing.id))];
            }
          : mapped);
      } catch {
        // Offline or JSON mode: keep the existing local state.
      }
    })();
    const refresh = () => {
      void (async () => {
        try {
          const response = await fetch('/api/marketplace/listings', { headers: { Accept: 'application/json' } });
          if (!response.ok) return;
          const data = await response.json();
          if (cancelled || data?.source !== 'postgresql' || !Array.isArray(data.listings)) return;
          const mapped = data.listings.map(mapPostgresPublicListing);
          setListings(DEMO_DATA_ENABLED
            ? (previous) => {
                const remoteIds = new Set(mapped.map((listing: MarketplaceListing) => listing.id));
                return [...mapped, ...previous.filter((listing: MarketplaceListing) => !remoteIds.has(listing.id))];
              }
            : mapped);
        } catch { /* Keep the current view on transient network failures. */ }
      })();
    };
    const interval = window.setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    window.addEventListener('bos-marketplace-listings-updated', refresh);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('bos-marketplace-listings-updated', refresh);
    };
  }, []);

  // Cross-tab real-time state synchronization for concurrent bookings, seat locks, enquiries & admin updates
  useEffect(() => {
    const handleStorageSync = (e: StorageEvent) => {
      if (!e.newValue) return;
      try {
        if (e.key === 'marketplace_listings_v18') {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) setListings(parsed.map((item) => ensureListingPriceBreakdown(item)));
        } else if (e.key === 'marketplace_bookings') {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) setBookings(parsed);
        } else if (e.key === 'marketplace_enquiries') {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) setEnquiries(parsed);
        } else if (e.key === 'marketplace_reviews') {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) setReviews(parsed);
        } else if (e.key === 'marketplace_transactions') {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) setTransactions(parsed);
        } else if (e.key === 'bos_favorited_ids') {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) setFavoriteIds(parsed);
        }
      } catch {
        // ignore malformed storage payloads
      }
    };
    window.addEventListener('storage', handleStorageSync);
    return () => window.removeEventListener('storage', handleStorageSync);
  }, []);

  // Listing CRUD
  const addListing = (listingData: Omit<MarketplaceListing, 'id' | 'createdAt' | 'viewsCount' | 'enquiriesCount' | 'reported'>) => {
    const newListing: MarketplaceListing = ensureListingPriceBreakdown({
      ...listingData,
      providerId: listingData.providerId || authUser?.id || 'prov-1',
      status: listingData.status || 'pending_approval',
      submittedAt: listingData.submittedAt || new Date().toLocaleTimeString(),
      id: `list-${Date.now()}`,
      createdAt: new Date().toISOString().split('T')[0],
      viewsCount: 1,
      enquiriesCount: 0,
      reported: false
    });

    setListings(prev => [newListing, ...prev]);

    // Update category listing count
    setCategories(prev => prev.map(c => c.id === listingData.categoryId ? { ...c, listingCount: c.listingCount + 1 } : c));

    // Admin alert
    setNotifications(prev => [
      {
        id: `notif-${Date.now()}`,
        title: newListing.status === 'pending_approval'
          ? '🛡️ Provider Request Pending Admin Approval'
          : '📋 New Post Submitted',
        message: `"${newListing.title}" submitted by ${newListing.providerName} (${newListing.status === 'pending_approval' ? 'Waiting for Admin Review to display in app' : 'Live'})`,
        time: 'Just now',
        type: 'approval',
        read: false
      },
      ...prev
    ]);

    // Persist to authoritative server & Supabase
    void syncServerProviderListing('create', newListing);
    if (isSupabaseConfigured) {
      void insertRlsListing(newListing);
    }

    return newListing;
  };

  const updateListing = (id: string, updates: Partial<MarketplaceListing>) => {
    setListings(prev => {
      const next = prev.map(l => l.id === id ? { ...l, ...updates } : l);
      const updatedItem = next.find(l => l.id === id);
      void syncServerProviderListing('update', id, updates);
      if (isSupabaseConfigured && updatedItem) {
        void updateRlsListing(id, updates, updatedItem);
      }
      return next;
    });
  };

  // Admin screens call this only after their own RLS-protected Supabase write
  // has returned a matching row. It updates the in-memory view without issuing
  // a second, fire-and-forget database request.
  const applyListingUpdateLocal = (id: string, updates: Partial<MarketplaceListing>) => {
    setListings((prev) => prev.map((listing) => listing.id === id ? { ...listing, ...updates } : listing));
  };

  const deleteListing = async (id: string): Promise<boolean> => {
    const target = listings.find((listing) => listing.id === id);
    if (!target) return false;
    if (isSupabaseConfigured) {
      const saved = await deleteRlsListing(id);
      if (!saved) return false;
      void syncServerProviderListing('update', id, { status: 'expired' });
    } else {
      const saved = await syncServerProviderListing('update', id, { status: 'expired' });
      if (!saved.ok) return false;
    }
    setListings((prev) => prev.filter((listing) => listing.id !== id));
    return true;
  };

  const updateListingStatus = async (id: string, status: ListingStatus): Promise<boolean> => {
    const target = listings.find(l => l.id === id);
    if (!target) return false;
    const updated: MarketplaceListing = {
      ...target,
      status,
      isVerified: status === 'active' ? true : target.isVerified,
      approvedAt: status === 'active' ? new Date().toLocaleTimeString() : target.approvedAt,
    };

    // Do not show a listing change as saved until the configured authoritative
    // backend confirms it. Database RLS, not the browser role, authorizes writes.
    if (isSupabaseConfigured) {
      const saved = await updateRlsListing(id, updated, updated);
      if (!saved) return false;
      void syncServerProviderListing('update', id, {
        status,
        isVerified: updated.isVerified,
      });
    } else {
      const saved = await syncServerProviderListing('update', id, {
        status,
        isVerified: updated.isVerified,
      });
      if (!saved.ok) return false;
    }

    setListings(prev => prev.map(l => l.id === id ? updated : l));
    setNotifications(prev => [
      {
        id: `notif-${Date.now()}`,
        title: status === 'active'
          ? '✅ Admin Approved! Now Live in Application'
          : status === 'rejected'
          ? '❌ Provider Request Rejected by Admin'
          : '⚠️ Post Status Updated',
        message: `"${target.title}" by ${target.providerName} is now ${status === 'active' ? 'APPROVED & DISPLAYED IN APPLICATION' : status.toUpperCase()}`,
        time: 'Just now',
        type: 'approval',
        read: false
      },
      ...prev
    ]);
    return true;
  };

  const toggleFeaturedListing = (id: string) => {
    setListings(prev => {
      const next = prev.map(l => l.id === id ? { ...l, isFeatured: !l.isFeatured } : l);
      const updated = next.find(l => l.id === id);
      if (isSupabaseConfigured && updated) {
        void updateRlsListing(id, { isFeatured: updated.isFeatured }, updated);
      }
      return next;
    });
  };

  const reportListing = (id: string, reason: string) => {
    setListings(prev => {
      const next = prev.map(l => l.id === id ? { ...l, reported: true, reportReason: reason } : l);
      const updated = next.find(l => l.id === id);
      if (isSupabaseConfigured && updated) {
        void updateRlsListing(id, { reported: true, reportReason: reason }, updated);
      }
      return next;
    });
    setNotifications(prev => [
      {
        id: `notif-${Date.now()}`,
        title: '🚩 Listing Reported for Moderation',
        message: `Reason: "${reason}"`,
        time: 'Just now',
        type: 'report',
        read: false
      },
      ...prev
    ]);
  };

  const dismissReport = (id: string) => {
    setListings(prev => {
      const next = prev.map(l => l.id === id ? { ...l, reported: false, reportReason: undefined } : l);
      const updated = next.find(l => l.id === id);
      if (isSupabaseConfigured && updated) {
        void updateRlsListing(id, { reported: false, reportReason: undefined }, updated);
      }
      return next;
    });
  };

  // Category & Custom Field Admin Actions
  const addCategory = (catData: Omit<CategoryDef, 'id' | 'listingCount'>): CategoryDef => {
    const newCat: CategoryDef = {
      ...catData,
      id: `cat-${Date.now()}`,
      listingCount: 0
    };
    setCategories(prev => [...prev, newCat]);
    return newCat;
  };

  const updateCategory = (id: string, updates: Partial<CategoryDef>) => {
    setCategories(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  const deleteCategory = (id: string) => {
    setCategories(prev => prev.filter(c => c.id !== id));
  };

  const addSubcategoryToCategory = (categoryId: string, subcategoryName: string) => {
    const trimmed = subcategoryName.trim();
    if (!trimmed) return;
    setCategories(prev => prev.map(c => {
      if (c.id === categoryId) {
        if (c.subcategories.includes(trimmed)) return c;
        return {
          ...c,
          subcategories: [...c.subcategories, trimmed]
        };
      }
      return c;
    }));
  };

  const deleteSubcategoryFromCategory = (categoryId: string, subcategoryName: string) => {
    setCategories(prev => prev.map(c => {
      if (c.id === categoryId) {
        return {
          ...c,
          subcategories: c.subcategories.filter(s => s !== subcategoryName)
        };
      }
      return c;
    }));
  };

  const toggleSubcategoryEnabled = (categoryId: string, subcategoryName: string) => {
    setCategories(prev => prev.map(c => {
      if (c.id !== categoryId) return c;
      const disabled = c.disabledSubcategories ?? [];
      const next = disabled.includes(subcategoryName)
        ? disabled.filter(s => s !== subcategoryName)
        : [...disabled, subcategoryName];
      return { ...c, disabledSubcategories: next };
    }));
  };

  const addCustomFieldToCategory = (categoryId: string, fieldData: Omit<CustomFieldDef, 'id'>) => {
    const newField: CustomFieldDef = {
      ...fieldData,
      id: `f-${Date.now()}`
    };
    setCategories(prev => prev.map(c => {
      if (c.id === categoryId) {
        return {
          ...c,
          customFields: [...c.customFields, newField]
        };
      }
      return c;
    }));
  };

  const deleteCustomFieldFromCategory = (categoryId: string, fieldId: string) => {
    setCategories(prev => prev.map(c => {
      if (c.id === categoryId) {
        return {
          ...c,
          customFields: c.customFields.filter(f => f.id !== fieldId)
        };
      }
      return c;
    }));
  };

  // Plan Actions
  const updatePostingPlan = (id: string, updates: Partial<PostingPlan>) => {
    setPostingPlans(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
  };

  const addPostingPlan = (planData: Omit<PostingPlan, 'id'>) => {
    const newPlan: PostingPlan = {
      ...planData,
      id: `plan-${Date.now()}`
    };
    setPostingPlans(prev => [...prev, newPlan]);
  };

  // Enquiries & Bookings
  const sendEnquiry = (listingId: string, message: string, customerName: string, customerPhone: string) => {
    const targetListing = listings.find(l => l.id === listingId);
    const newEnquiry: Enquiry = {
      id: `enq-${Date.now()}`,
      listingId,
      listingTitle: targetListing ? targetListing.title : 'Marketplace Listing',
      providerId: targetListing ? targetListing.providerId : 'prov-general',
      customerId: authUser?.id || 'cust-current',
      customerName,
      customerPhone,
      message,
      status: 'new',
      timestamp: 'Just now'
    };

    setEnquiries(prev => [newEnquiry, ...prev]);

    // Increment enquiries count
    setListings(prev => prev.map(l => l.id === listingId ? { ...l, enquiriesCount: l.enquiriesCount + 1 } : l));

    // Notification
    setNotifications(prev => [
      {
        id: `notif-${Date.now()}`,
        title: '💬 New Customer Enquiry',
        message: `${customerName} enquired about: "${targetListing?.title || 'Listing'}"`,
        time: 'Just now',
        type: 'enquiry',
        read: false
      },
      ...prev
    ]);

    if (isSupabaseConfigured) {
      void insertRlsEnquiry(newEnquiry);
    }
  };

  const createBooking = (bookingData: Omit<Booking, 'id' | 'createdAt' | 'status'>) => {
    const newBooking: Booking = {
      ...bookingData,
      id: `book-${Date.now()}`,
      status: 'confirmed',
      createdAt: 'Just now'
    };

    setBookings(prev => [newBooking, ...prev]);

    setNotifications(prev => [
      {
        id: `notif-${Date.now()}`,
        title: '📅 Booking Confirmed',
        message: `${bookingData.customerName} booked "${bookingData.listingTitle}" for ${bookingData.scheduledDate}`,
        time: 'Just now',
        type: 'booking',
        read: false
      },
      ...prev
    ]);
  };

  const deleteBooking = (bookingId: string) => {
    const target = bookings.find(b => b.id === bookingId);
    setBookings(prev => prev.filter(b => b.id !== bookingId));
    if (target) {
      setNotifications(prev => [
        {
          id: `notif-${Date.now()}`,
          title: '🗑️ Booking Removed',
          message: `Appointment for "${target.listingTitle}" (${target.scheduledDate}) was removed.`,
          time: 'Just now',
          type: 'booking',
          read: false
        },
        ...prev
      ]);
    }
  };

  const cancelBooking = (bookingId: string) => {
    const target = bookings.find(b => b.id === bookingId);
    setBookings(prev =>
      prev.map(b => (b.id === bookingId ? { ...b, status: 'cancelled' } : b))
    );
    if (target && target.status !== 'cancelled') {
      setNotifications(prev => [
        {
          id: `notif-${Date.now()}`,
          title: '⚠️ Appointment Cancelled',
          message: `Booking for "${target.listingTitle}" on ${target.scheduledDate} has been cancelled.`,
          time: 'Just now',
          type: 'booking',
          read: false
        },
        ...prev
      ]);
    }
  };

  const restoreBooking = (booking: Booking) => {
    setBookings(prev => {
      if (prev.some(b => b.id === booking.id)) return prev;
      return [booking, ...prev];
    });
  };

  const addReview = (reviewData: Omit<Review, 'id' | 'date'>) => {
    const targetListing = listings.find(l => l.id === reviewData.listingId);
    const newReview: Review = {
      ...reviewData,
      id: `rev-${Date.now()}`,
      date: 'Just now'
    };
    setReviews(prev => [newReview, ...prev]);
    if (isSupabaseConfigured) {
      void insertRlsReview(newReview);
    }

    // Calculate dynamic new rating average
    const currentRating = targetListing?.providerRating ?? 5.0;
    const currentCount = targetListing?.reviewCount ?? 0;
    const newCount = currentCount + 1;
    const newRating = Number(((currentRating * currentCount + reviewData.rating) / newCount).toFixed(1));

    // Update target listing and all listings under the same provider so provider's average rating is dynamically synced
    const targetProviderId = targetListing?.providerId;
    setListings(prev => prev.map(l => {
      if (l.id === reviewData.listingId) {
        return {
          ...l,
          reviewCount: newCount,
          providerRating: newRating
        };
      }
      if (targetProviderId && l.providerId === targetProviderId) {
        return {
          ...l,
          reviewCount: l.reviewCount + 1,
          providerRating: newRating
        };
      }
      return l;
    }));

    // In-app alert notification
    setNotifications(prev => [
      {
        id: `notif-${Date.now()}`,
        title: `⭐ New ${reviewData.rating}-Star Review!`,
        message: `${reviewData.customerName} left a ${reviewData.rating}★ rating on "${targetListing?.title || 'Service'}" (New Rating: ${newRating}★)`,
        time: 'Just now',
        type: 'enquiry',
        read: false
      },
      ...prev
    ]);

    return { newRating, newCount };
  };

  const recordPayment = (type: PaymentTransaction['type'], amount: number, planName: string, method: string) => {
    const newTx: PaymentTransaction = {
      id: `tx-${Date.now()}`,
      type,
      amount,
      description: `Payment for ${planName} via ${method}`,
      planName,
      status: 'success',
      date: new Date().toISOString().split('T')[0],
      invoiceNumber: `INV-${Date.now().toString().slice(-6)}`,
      paymentMethod: method
    };

    setTransactions(prev => [newTx, ...prev]);

    setNotifications(prev => [
      {
        id: `notif-${Date.now()}`,
        title: '💰 Payment Processed Successfully',
        message: `₹${amount} paid for ${planName} (${newTx.invoiceNumber})`,
        time: 'Just now',
        type: 'payment',
        read: false
      },
      ...prev
    ]);

    return newTx;
  };

  // Favorites persisted in localStorage
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('bos_saved_favorites_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return ['list-1', 'cls-durgasoft-hyd'];
  });

  useEffect(() => {
    try {
      localStorage.setItem('bos_saved_favorites_v1', JSON.stringify(favoriteIds));
    } catch {}
  }, [favoriteIds]);

  const toggleFavorite = (listingId: string): boolean => {
    let added = false;
    setFavoriteIds((prev) => {
      if (prev.includes(listingId)) {
        added = false;
        return prev.filter((id) => id !== listingId);
      } else {
        added = true;
        return [listingId, ...prev];
      }
    });
    if (isSupabaseConfigured) {
      void syncRlsFavorite(listingId, added);
    }
    return added;
  };

  const pushSystemNotification = (notif: {
    title: string;
    message: string;
    type?: NotificationItem['type'];
    linkId?: string;
  }) => {
    const newItem: NotificationItem = {
      id: `notif-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      title: notif.title,
      message: notif.message,
      time: 'Just now',
      type: notif.type || 'booking',
      read: false,
      linkId: notif.linkId,
    };
    setNotifications((prev) => [newItem, ...prev]);
    void sendServerNotification({
      title: notif.title,
      message: notif.message,
      targetRole: 'all',
      type: notif.type === 'enquiry' ? 'enquiry' : notif.type === 'payment' ? 'payment' : 'booking',
    });
    try {
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        new Notification(notif.title, { body: notif.message });
      }
    } catch {}
  };

  // Booking Schedule 1-Hour Reminder Notification System
  useEffect(() => {
    const alertedKey = 'bos_booking_1hr_alerts_sent_v1';
    const checkUpcomingBookings = () => {
      try {
        const sentRaw = sessionStorage.getItem(alertedKey);
        const sentIds: string[] = sentRaw ? JSON.parse(sentRaw) : [];
        const now = new Date();
        const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

        for (const bk of bookings) {
          if (bk.status === 'cancelled' || sentIds.includes(bk.id)) continue;

          // Parse scheduled date/time or check if booking is within 1 hour or scheduled for today
          let isUpcomingWithinHour = false;
          if (bk.checkInDateTime) {
            const dt = new Date(bk.checkInDateTime).getTime();
            const diffMinutes = (dt - now.getTime()) / (1000 * 60);
            if (diffMinutes > 0 && diffMinutes <= 65) {
              isUpcomingWithinHour = true;
            }
          } else if (bk.scheduledDate === todayIso || bk.checkInDate === todayIso || bk.createdAt === 'Just now') {
            isUpcomingWithinHour = true;
          }

          if (isUpcomingWithinHour) {
            sentIds.push(bk.id);
            sessionStorage.setItem(alertedKey, JSON.stringify(sentIds));

            const alertTitle = '⏰ Reminder: Upcoming Booking in 1 Hour!';
            const alertMsg = `Your scheduled visit/service for "${bk.listingTitle}" (${bk.timeSlot || bk.scheduledDate}) is starting in ~1 hour.`;

            setNotifications((prev) => {
              if (prev.some((n) => n.linkId === `1hr-${bk.id}`)) return prev;
              return [
                {
                  id: `notif-1hr-${bk.id}`,
                  title: alertTitle,
                  message: alertMsg,
                  time: '1 hr before schedule',
                  type: 'booking',
                  read: false,
                  linkId: `1hr-${bk.id}`,
                },
                ...prev,
              ];
            });

            if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
              new Notification(alertTitle, { body: alertMsg });
            }
          }
        }
      } catch {}
    };

    checkUpcomingBookings();
    const intervalId = setInterval(checkUpcomingBookings, 60000);
    return () => clearInterval(intervalId);
  }, [bookings]);

  const markNotificationRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    void markServerNotificationRead(id, authUser?.id);
  };

  const clearAllNotifications = () => {
    setNotifications([]);
    void clearServerNotifications(authUser?.id);
  };

  const resetFilters = () => {
    setSearchQuery('');
    setSelectedCategory('all');
    setSelectedEntityType('all');
    setSelectedCity('All Cities');
    setSelectedCustomerAction('all');
    setVerifiedOnly(false);
    setFeaturedOnly(false);
    setPriceSort('none');
    setSortBy('featured');
  };

  return (
    <MarketplaceContext.Provider
      value={{
        supabaseUser,
        supabaseSession,
        supabaseProfile,
        authUser,
        isAccountBlocked,
        blockedReason,
        loginWithGoogle,
        applyPopupOAuthLogin,
        logoutGoogleSession,
        refreshServerNotifications,
        updateUserProfile,
        syncAccountData,
        userRole,
        setUserRole,
        listings,
        categories,
        postingPlans,
        enquiries,
        bookings,
        reviews,
        transactions,
        notifications,
        addListing,
        updateListing,
        deleteListing,
        updateListingStatus,
        applyListingUpdateLocal,
        toggleFeaturedListing,
        reportListing,
        dismissReport,
        addCategory,
        updateCategory,
        deleteCategory,
        addSubcategoryToCategory,
        deleteSubcategoryFromCategory,
        toggleSubcategoryEnabled,
        addCustomFieldToCategory,
        deleteCustomFieldFromCategory,
        updatePostingPlan,
        addPostingPlan,
        sendEnquiry,
        createBooking,
        deleteBooking,
        cancelBooking,
        restoreBooking,
        addReview,
        recordPayment,
        markNotificationRead,
        clearAllNotifications,
        searchQuery,
        setSearchQuery,
        selectedCategory,
        setSelectedCategory,
        selectedCategoryFilter: selectedCategory,
        setSelectedCategoryFilter: setSelectedCategory,
        selectedEntityType,
        setSelectedEntityType,
        selectedEntityTypeFilter: selectedEntityType,
        setSelectedEntityTypeFilter: setSelectedEntityType,
        selectedCity,
        setSelectedCity,
        selectedCityFilter: selectedCity,
        setSelectedCityFilter: setSelectedCity,
        selectedCustomerAction,
        setSelectedCustomerAction,
        verifiedOnly,
        setVerifiedOnly,
        featuredOnly,
        setFeaturedOnly,
        priceSort,
        setPriceSort,
        sortBy,
        setSortBy,
        resetFilters,
        favoriteIds,
        toggleFavorite,
        pushSystemNotification,
        isOnline,
        isCachedData,
        lastCacheTime,
        syncOfflineCache
      }}
    >
      {children}
    </MarketplaceContext.Provider>
  );
};

export const useMarketplace = () => {
  const context = useContext(MarketplaceContext);
  if (!context) {
    throw new Error('useMarketplace must be used within a MarketplaceProvider');
  }
  return context;
};
