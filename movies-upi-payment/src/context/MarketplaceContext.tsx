import React, { createContext, useContext, useState, useEffect } from 'react';
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
  insertRlsBooking,
  fetchRlsEnquiries,
  insertRlsEnquiry,
  fetchRlsReviews,
  insertRlsReview,
  fetchRlsTransactions,
  insertRlsTransaction,
  fetchRlsFavorites,
  syncRlsFavorite,
  fetchRlsModuleConfigs,
  syncLocalAccountDataToSupabase,
  subscribeToRlsChanges,
  AuthoritativeGoogleUser,
  getStoredGoogleAuthUser,
  setStoredAuthoritativeSession,
  authenticateWithGoogleServer,
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
  }) => void;
  logoutGoogleSession: () => Promise<void>;
  refreshServerNotifications: () => Promise<void>;
  updateUserProfile: (updates: { fullName?: string; phone?: string; role?: UserRole }) => Promise<void>;
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
  deleteListing: (id: string) => void;
  updateListingStatus: (id: string, status: ListingStatus) => void;
  toggleFeaturedListing: (id: string) => void;
  reportListing: (id: string, reason: string) => void;
  dismissReport: (id: string) => void;

  // Category & Custom Field Admin Actions
  addCategory: (cat: Omit<CategoryDef, 'id' | 'listingCount'>) => CategoryDef;
  updateCategory: (id: string, updates: Partial<CategoryDef>) => void;
  deleteCategory: (id: string) => void;
  addSubcategoryToCategory: (categoryId: string, subcategoryName: string) => void;
  deleteSubcategoryFromCategory: (categoryId: string, subcategoryName: string) => void;
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
  const [authUser, setAuthUser] = useState<AuthoritativeGoogleUser | null>(() => getStoredGoogleAuthUser());
  const [isAccountBlocked, setIsAccountBlocked] = useState<boolean>(false);
  const [blockedReason, setBlockedReason] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<UserRole>(() => {
    const stored = getStoredGoogleAuthUser();
    if (stored && ['customer', 'provider', 'admin'].includes(stored.role)) {
      return stored.role;
    }
    return 'customer';
  });
  const [supabaseUser, setSupabaseUser] = useState<User | null>(null);
  const [supabaseSession, setSupabaseSession] = useState<Session | null>(null);
  const [supabaseProfile, setSupabaseProfile] = useState<SupabaseProfile | null>(null);

  // Load state with fallback to seed data
  const [listings, setListings] = useState<MarketplaceListing[]>(() => {
    try {
      const saved = localStorage.getItem('marketplace_listings_v17');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 20) {
          return parsed.map(ensureListingPriceBreakdown);
        }
      }
      localStorage.setItem('marketplace_listings_v17', JSON.stringify(initialListings));
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
    try {
      const saved = localStorage.getItem('marketplace_enquiries');
      return saved ? JSON.parse(saved) : initialEnquiries;
    } catch {
      return initialEnquiries;
    }
  });

  const [bookings, setBookings] = useState<Booking[]>(() => {
    try {
      const saved = localStorage.getItem('marketplace_bookings');
      return saved ? JSON.parse(saved) : initialBookings;
    } catch {
      return initialBookings;
    }
  });

  const [reviews, setReviews] = useState<Review[]>(() => {
    try {
      const saved = localStorage.getItem('marketplace_reviews');
      return saved ? JSON.parse(saved) : initialReviews;
    } catch {
      return initialReviews;
    }
  });

  const [transactions, setTransactions] = useState<PaymentTransaction[]>(() => {
    try {
      const saved = localStorage.getItem('marketplace_transactions');
      return saved ? JSON.parse(saved) : initialTransactions;
    } catch {
      return initialTransactions;
    }
  });

  const [notifications, setNotifications] = useState<NotificationItem[]>([
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
  ]);

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

  // Subscribe to Supabase Auth & hydrate RLS-protected user data when authenticated
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;

    let mounted = true;

    const loadRlsData = async (activeUser: User | null) => {
      const [remoteListings, remoteReviews] = await Promise.all([
        fetchRlsListings(),
        fetchRlsReviews(),
      ]);

      if (mounted && remoteListings && remoteListings.length > 0) {
        setListings((prev) => {
          const existingIds = new Set(remoteListings.map((r) => r.id));
          return [...remoteListings, ...prev.filter((p) => !existingIds.has(p.id))];
        });
      }

      if (mounted && remoteReviews && remoteReviews.length > 0) {
        setReviews((prev) => {
          const existingIds = new Set(remoteReviews.map((r) => r.id));
          return [...remoteReviews, ...prev.filter((p) => !existingIds.has(p.id))];
        });
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
            setUserRole(remoteProfile.role);
          }
        } else if (mounted) {
          const metaRole = activeUser.user_metadata?.role as UserRole | undefined;
          if (metaRole && ['customer', 'provider', 'admin'].includes(metaRole)) {
            setUserRole(metaRole);
          }
        }

        if (mounted && remoteBookings && remoteBookings.length > 0) {
          setBookings((prev) => {
            const ids = new Set(remoteBookings.map((b) => b.id));
            return [...remoteBookings, ...prev.filter((b) => !ids.has(b.id))];
          });
        }
        if (mounted && remoteEnquiries && remoteEnquiries.length > 0) {
          setEnquiries((prev) => {
            const ids = new Set(remoteEnquiries.map((e) => e.id));
            return [...remoteEnquiries, ...prev.filter((e) => !ids.has(e.id))];
          });
        }
        if (mounted && remoteFavorites && remoteFavorites.length > 0) {
          setFavoriteIds((prev) => Array.from(new Set([...remoteFavorites, ...prev])));
        }
        if (mounted && remoteTransactions && remoteTransactions.length > 0) {
          setTransactions((prev) => {
            const ids = new Set(remoteTransactions.map((t) => t.id));
            return [...remoteTransactions, ...prev.filter((t) => !ids.has(t.id))];
          });
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
        void authenticateWithGoogleServer({
          email: data.session.user.email,
          name:
            data.session.user.user_metadata?.full_name ||
            data.session.user.user_metadata?.name,
          googleSub:
            data.session.user.user_metadata?.sub || data.session.user.id,
          avatarUrl:
            data.session.user.user_metadata?.avatar_url ||
            data.session.user.user_metadata?.picture,
          allowRoleChange: false,
        }).then((syncRes) => {
          if (mounted && syncRes.ok && syncRes.user) {
            setAuthUser(syncRes.user);
            setUserRole(syncRes.user.role);
            syncLocalProfileWithGoogleUser(syncRes.user);
          }
        });
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      setSupabaseSession(session);
      setSupabaseUser(session?.user ?? null);
      void loadRlsData(session?.user ?? null);
      if (event === 'SIGNED_IN' && session?.user?.email) {
        void authenticateWithGoogleServer({
          email: session.user.email,
          name:
            session.user.user_metadata?.full_name ||
            session.user.user_metadata?.name,
          googleSub: session.user.user_metadata?.sub || session.user.id,
          avatarUrl:
            session.user.user_metadata?.avatar_url ||
            session.user.user_metadata?.picture,
          allowRoleChange: false,
        }).then((syncRes) => {
          if (mounted && syncRes.ok && syncRes.user) {
            setIsAccountBlocked(false);
            setBlockedReason(null);
            setAuthUser(syncRes.user);
            setUserRole(syncRes.user.role);
            syncLocalProfileWithGoogleUser(syncRes.user);
            window.dispatchEvent(
              new CustomEvent('bos-google-oauth-redirect', {
                detail: {
                  user: syncRes.user,
                  isNewUser: syncRes.isNewUser,
                  redirectTarget: syncRes.redirectTarget,
                },
              })
            );
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
        phone: user.phone || '9876543210',
        email: user.email,
        address: user.city ? `${user.city}, India` : 'Banjara Hills, Hyderabad',
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
        setUserRole('customer');
        return;
      }
      if (sessionRes.authenticated && sessionRes.user) {
        setIsAccountBlocked(false);
        setBlockedReason(null);
        setAuthUser(sessionRes.user);
        if (['customer', 'provider', 'admin'].includes(sessionRes.user.role)) {
          setUserRole(sessionRes.user.role);
        }
        syncLocalProfileWithGoogleUser(sessionRes.user);
      }
      await refreshServerNotifications();
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
        setStoredAuthoritativeSession(data.sessionToken, data.user);
        setIsAccountBlocked(false);
        setBlockedReason(null);
        setAuthUser(data.user);
        if (['customer', 'provider', 'admin'].includes(data.user.role)) {
          setUserRole(data.user.role);
        }
        syncLocalProfileWithGoogleUser(data.user);
        window.dispatchEvent(
          new CustomEvent('bos-google-oauth-redirect', {
            detail: {
              user: data.user,
              isNewUser: data.isNewUser,
              redirectTarget: data.redirectTarget,
            },
          })
        );
      } else if (data.type === 'OAUTH_AUTH_ERROR') {
        if (data.error === 'ACCOUNT_BLOCKED') {
          setIsAccountBlocked(true);
          setBlockedReason(
            data.message || 'Your account has been suspended or blocked by an administrator.'
          );
          setAuthUser(null);
        }
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
    const res = await authenticateWithGoogleServer(params);
    if (!res.ok) {
      if (res.error === 'ACCOUNT_BLOCKED') {
        setIsAccountBlocked(true);
        setBlockedReason(
          res.message || 'Your account has been suspended or blocked by an administrator.'
        );
        setAuthUser(null);
      }
      return {
        ok: false,
        error: res.error,
        message: res.message,
      };
    }
    if (res.user) {
      setIsAccountBlocked(false);
      setBlockedReason(null);
      setAuthUser(res.user);
      setUserRole(res.user.role);
      syncLocalProfileWithGoogleUser(res.user);
      await refreshServerNotifications();
    }
    return {
      ok: true,
      isNewUser: res.isNewUser,
      user: res.user,
      redirectTarget: res.redirectTarget,
      message: res.message,
    };
  };

  const applyPopupOAuthLogin = (payload: {
    user: AuthoritativeGoogleUser;
    sessionToken: string;
    isNewUser?: boolean;
    redirectTarget?: 'marketplace' | 'provider_portal' | 'admin_console';
  }) => {
    setStoredAuthoritativeSession(payload.sessionToken, payload.user);
    setIsAccountBlocked(false);
    setBlockedReason(null);
    setAuthUser(payload.user);
    setUserRole(payload.user.role);
    syncLocalProfileWithGoogleUser(payload.user);
    void refreshServerNotifications();
  };

  const logoutGoogleSession = async () => {
    await logoutAuthoritativeSession();
    setAuthUser(null);
    setSupabaseUser(null);
    setSupabaseSession(null);
    setSupabaseProfile(null);
    setIsAccountBlocked(false);
    setBlockedReason(null);
    setUserRole('customer');
    try {
      localStorage.removeItem('bos_user_profile_v1');
      localStorage.setItem('user_role', 'customer');
    } catch {
      // ignore
    }
    window.dispatchEvent(new CustomEvent('bos-google-oauth-logout'));
  };

  const updateUserProfile = async (updates: {
    fullName?: string;
    phone?: string;
    role?: UserRole;
  }) => {
    if (updates.role) {
      setUserRole(updates.role);
    }
    if (authUser) {
      const nextAuthUser: AuthoritativeGoogleUser = {
        ...authUser,
        name: updates.fullName ?? authUser.name,
        phone: updates.phone ?? authUser.phone,
        role: updates.role ?? authUser.role,
      };
      setAuthUser(nextAuthUser);
      syncLocalProfileWithGoogleUser(nextAuthUser);
    }
    if (!isSupabaseConfigured) return;
    const updated = await upsertRlsProfile(updates);
    if (updated) {
      setSupabaseProfile(updated);
      setUserRole(updated.role);
    }
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
    try {
      localStorage.setItem('marketplace_listings_v17', JSON.stringify(listings));
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
    try {
      localStorage.setItem('marketplace_enquiries', JSON.stringify(enquiries));
    } catch {}
  }, [enquiries]);

  useEffect(() => {
    try {
      localStorage.setItem('marketplace_bookings', JSON.stringify(bookings));
    } catch {}
  }, [bookings]);

  useEffect(() => {
    try {
      localStorage.setItem('marketplace_reviews', JSON.stringify(reviews));
    } catch {}
  }, [reviews]);

  useEffect(() => {
    try {
      localStorage.setItem('marketplace_transactions', JSON.stringify(transactions));
    } catch {}
  }, [transactions]);

  // Cross-tab real-time state synchronization for concurrent bookings, seat locks, enquiries & admin updates
  useEffect(() => {
    const handleStorageSync = (e: StorageEvent) => {
      if (!e.newValue) return;
      try {
        if (e.key === 'marketplace_listings_v17') {
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

    // Customer registers as a provider upon submitting their provider request form
    if (userRole === 'customer') {
      setUserRole('provider');
      try {
        localStorage.setItem('user_role', 'provider');
      } catch {}
    }

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

  const deleteListing = (id: string) => {
    setListings(prev => prev.filter(l => l.id !== id));
    void syncServerProviderListing('delete', id);
    if (isSupabaseConfigured) {
      void deleteRlsListing(id);
    }
  };

  const updateListingStatus = (id: string, status: ListingStatus) => {
    const target = listings.find(l => l.id === id);
    setListings(prev => {
      const next = prev.map(l => l.id === id ? {
        ...l,
        status,
        isVerified: status === 'active' ? true : l.isVerified,
        approvedAt: status === 'active' ? new Date().toLocaleTimeString() : l.approvedAt
      } : l);
      const updated = next.find(l => l.id === id);
      void syncServerProviderListing('update', id, { status, isVerified: updated?.isVerified });
      if (isSupabaseConfigured && updated) {
        void updateRlsListing(id, { status, isVerified: updated.isVerified }, updated);
      }
      return next;
    });
    setNotifications(prev => [
      {
        id: `notif-${Date.now()}`,
        title: status === 'active'
          ? '✅ Admin Approved! Now Live in Application'
          : status === 'rejected'
          ? '❌ Provider Request Rejected by Admin'
          : '⚠️ Post Status Updated',
        message: target
          ? `"${target.title}" by ${target.providerName} is now ${status === 'active' ? 'APPROVED & DISPLAYED IN APPLICATION' : status.toUpperCase()}`
          : `Listing status changed to ${status.toUpperCase()}`,
        time: 'Just now',
        type: 'approval',
        read: false
      },
      ...prev
    ]);
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

    if (isSupabaseConfigured) {
      void insertRlsBooking(newBooking);
    }

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

    if (isSupabaseConfigured) {
      void insertRlsTransaction(newTx);
    }

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
        toggleFeaturedListing,
        reportListing,
        dismissReport,
        addCategory,
        updateCategory,
        deleteCategory,
        addSubcategoryToCategory,
        deleteSubcategoryFromCategory,
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
