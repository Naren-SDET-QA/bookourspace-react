import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  MapPin,
  Search,
  Star,
  Calendar,
  Clock,
  ChevronLeft,
  ChevronRight,
  Film,
  Check,
  X,
  Ticket,
  Volume2,
  VolumeX,
  ShieldCheck,
  ArrowRight,
  Eye,
  SlidersHorizontal,
  Heart,
  Bell,
  Popcorn,
  QrCode,
  Sparkles,
  Sun,
  Moon,
  LayoutGrid,
  Play,
  Pause,
  Share2,
  Info,
  CheckCircle2,
  Printer,
  Lock,
  Unlock,
  AlertTriangle,
  RefreshCw,
  Tag,
  UserCheck,
  ScanLine,
  Settings,
  LifeBuoy,
  RotateCcw,
  FileText,
  Download,
  Accessibility,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { MarketplaceListing } from '../types/marketplace';
import { localizeAreaName } from '../utils/i18nEngine';
import { AppLanguage, getListingTitle } from '../utils/translations';
import { useMarketplace } from '../context/MarketplaceContext';
import { BOSBrandLogo } from './BOSBrandLogo';
import {
  fetchAuthoritativeSeatLocks,
  holdAuthoritativeSeats,
  releaseAuthoritativeSeats,
  createAuthoritativeBookingAtomic,
  createServerPaymentIntent,
  verifyServerUpiPayment,
  verifyAuthoritativeQrPass,
  fetchMoviesInventory,
  updateCinemaScreenConfig,
  cancelMovieBookingAtomic,
  createMovieSupportTicket,
  resolveMovieSupportTicket,
  AuthoritativeCinemaScreenConfig,
  getOrCreateClientSessionId,
} from '../lib/supabaseClient';

interface DistrictMoviesSectionProps {
  listings: MarketplaceListing[];
  currentLang: AppLanguage;
  activeAreaName: string;
  onSelectListing: (listing: MarketplaceListing) => void;
  onBookListing: (listing: MarketplaceListing) => void;
  onOpenDirectUpi?: (planName: string, amount: number) => void;
  showClassicGridBelow?: boolean;
  onToggleClassicGrid?: () => void;
}

type DistrictNavPillar =
  | 'movies'
  | 'cinemas'
  | 'events'
  | 'private'
  | 'upcoming'
  | 'my_tickets'
  | 'qr_scanner'
  | 'cinema_admin';
type LanguageFilter = 'all' | 'Telugu' | 'Hindi' | 'English' | 'Tamil' | 'Pan-India';
type FormatFilter = 'all' | '2D' | '4K Laser' | 'Dolby Atmos' | 'PCX / IMAX' | 'VIP Recliner';
type GenreFilter = 'all' | 'Action' | 'Thriller' | 'Sci-Fi' | 'Comedy' | 'Drama' | 'Private Screen';
type ShowtimeSlotFilter = 'all' | 'morning' | 'afternoon' | 'evening' | 'night';
type SortOption = 'popularity' | 'price_low' | 'price_high' | 'rating';

interface SeatTier {
  id: string;
  name: string;
  priceMultiplier: number;
  rows: string[];
  seatsPerRow: number;
}

interface FoodAddonItem {
  id: string;
  name: string;
  desc: string;
  price: number;
  veg: boolean;
}

export interface BookedMTicket {
  id?: string;
  ticketId: string;
  listingId?: string;
  dateIso?: string;
  movieTitle: string;
  cinemaName: string;
  screenName?: string;
  areaName: string;
  posterUrl: string;
  dateLabel: string;
  showtime: string;
  screenFormat: string;
  seats: string[];
  foodItems: string[];
  baseAmount?: number;
  taxAmount?: number;
  discountAmount?: number;
  promoCode?: string;
  totalAmount: number;
  bookedAt: string;
  qrSignature?: string;
  qrPassToken?: string;
  paymentUtr?: string;
  paymentStatus?: 'pay_later' | 'pending_verification' | 'verified' | 'refunded' | 'failed';
  status?: 'confirmed' | 'checked_in' | 'cancelled';
  checkedInAt?: string;
  cancelledAt?: string;
  cancellationReason?: string;
  refundAmount?: number;
}

const SEAT_TIERS: SeatTier[] = [
  { id: 'recliner', name: 'VIP M-Lounge Recliner', priceMultiplier: 1.5, rows: ['A', 'B'], seatsPerRow: 8 },
  { id: 'prime', name: 'Prime Executive 4K', priceMultiplier: 1.0, rows: ['C', 'D', 'E', 'F'], seatsPerRow: 10 },
  { id: 'classic', name: 'Classic Balcony', priceMultiplier: 0.75, rows: ['G', 'H'], seatsPerRow: 10 },
];

const WHEELCHAIR_SEATS = new Set(['A1', 'A8']);

const FOOD_ADDONS: FoodAddonItem[] = [
  { id: 'fnb-1', name: 'Large Caramel & Cheese Popcorn Tub', desc: 'Freshly popped gourmet duo tub', price: 240, veg: true },
  { id: 'fnb-2', name: 'Couple Popcorn + 2 Coke (650ml) Combo', desc: 'Save ₹90 on multiplex combo', price: 390, veg: true },
  { id: 'fnb-3', name: 'Loaded Jalapeno Nachos with Salsa & Cheese', desc: 'Crispy tortilla chips with warm dip', price: 220, veg: true },
  { id: 'fnb-4', name: 'Cold Coffee & Peri-Peri Fries Combo', desc: 'Delivered directly to your seat', price: 260, veg: true },
];

const HYDERABAD_CINEMA_AREAS = [
  'All Hyderabad',
  'Gachibowli',
  'Ameerpet',
  'RTC X Roads',
  'Banjara Hills',
  'Kukatpally',
  'Hitech City',
  'Secunderabad',
];

const PROMO_OFFERS = [
  {
    code: 'BOSMOVIE100',
    label: 'Flat ₹100 OFF on 2+ Movie Tickets (Min ₹400)',
    discountType: 'flat' as const,
    value: 100,
    minAmount: 400,
    maxDiscount: 100,
  },
  {
    code: 'BOSFIRST',
    label: '15% OFF up to ₹150 on Direct UPI Settlement',
    discountType: 'percent' as const,
    value: 15,
    minAmount: 250,
    maxDiscount: 150,
  },
  {
    code: 'RECLINER20',
    label: '20% OFF up to ₹200 on VIP Recliner & IMAX/PCX',
    discountType: 'percent' as const,
    value: 20,
    minAmount: 600,
    maxDiscount: 200,
  },
];

const HOLD_STORAGE_KEY = 'bos_active_movie_hold_v1';

export const DistrictMoviesSection: React.FC<DistrictMoviesSectionProps> = ({
  listings,
  currentLang,
  activeAreaName,
  onSelectListing,
  onBookListing,
  onOpenDirectUpi,
  showClassicGridBelow = false,
  onToggleClassicGrid,
}) => {
  const {
    favoriteIds,
    toggleFavorite,
    bookings,
    createBooking,
    recordPayment,
    supabaseUser,
    supabaseProfile,
    authUser,
    loginWithGoogle,
    userRole,
    setUserRole,
    updateListing,
  } = useMarketplace();

  // Strictly use existing movie listings & their existing images
  const movieListings = useMemo(() => {
    const filtered = listings.filter(
      (item) =>
        item.categoryId.startsWith('movie-') ||
        item.entityType === 'event' ||
        item.customFieldValues?.sectionType === 'movies'
    );
    return filtered.length > 0 ? filtered : listings;
  }, [listings]);

  // Theme mode: 'light' crisp white aesthetic; 'dark' cinema mode
  const [cinemaTheme, setCinemaTheme] = useState<'light' | 'dark'>('light');
  const isLight = cinemaTheme === 'light';

  // Navigation & Filters for BookOurSpace Movies
  const [activePillar, setActivePillar] = useState<DistrictNavPillar>('movies');
  const [selectedCityArea, setSelectedCityArea] = useState<string>('All Hyderabad');
  const [localSearch, setLocalSearch] = useState('');
  const [selectedLang, setSelectedLang] = useState<LanguageFilter>('all');
  const [selectedFormat, setSelectedFormat] = useState<FormatFilter>('all');
  const [selectedGenre, setSelectedGenre] = useState<GenreFilter>('all');
  const [selectedSlotFilter, setSelectedSlotFilter] = useState<ShowtimeSlotFilter>('all');
  const [wheelchairOnlyFilter, setWheelchairOnlyFilter] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('popularity');
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);

  // Movie Details & Trailer Modal
  const [trailerModalMovie, setTrailerModalMovie] = useState<MarketplaceListing | null>(null);
  const [isTrailerPlaying, setIsTrailerPlaying] = useState(true);
  const [isTrailerMuted, setIsTrailerMuted] = useState(false);
  const [trailerProgress, setTrailerProgress] = useState(18);
  const trailerCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Hero Spotlight Carousel
  const [spotlightIndex, setSpotlightIndex] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);

  // 7-Day Date Strip
  const [selectedDateOffset, setSelectedDateOffset] = useState(0);

  // "Interested / Notify Me" state for Upcoming & Now Showing movies
  const [interestedMap, setInterestedMap] = useState<Record<string, boolean>>({});
  const [favoritedMap, setFavoritedMap] = useState<Record<string, boolean>>({});

  // Authoritative Cinema Inventory from Backend
  const [cinemaScreens, setCinemaScreens] = useState<AuthoritativeCinemaScreenConfig[]>([]);
  const [serverRefunds, setServerRefunds] = useState<any[]>([]);
  const [serverSupportTickets, setServerSupportTickets] = useState<any[]>([]);
  const [serverAuditLogs, setServerAuditLogs] = useState<any[]>([]);
  const [isLoadingInventory, setIsLoadingInventory] = useState(false);

  // Interactive Booking Modal (5-Step Flow: showtimes -> seats -> fnb -> payment -> mticket)
  const [bookingModalListing, setBookingModalListing] = useState<MarketplaceListing | null>(null);
  const [bookingStep, setBookingStep] = useState<'showtimes' | 'seats' | 'fnb' | 'payment' | 'mticket'>('seats');
  const [selectedShowtime, setSelectedShowtime] = useState<string>('07:55 PM');
  const [selectedScreenFormat, setSelectedScreenFormat] = useState<string>('4K Laser · Dolby Atmos');
  const [selectedSeats, setSelectedSeats] = useState<string[]>(['D5', 'D6']);
  const [selectedFoodQtys, setSelectedFoodQtys] = useState<Record<string, number>>({});
  const [selectedPromoCode, setSelectedPromoCode] = useState<string>('');
  const [promoInput, setPromoInput] = useState<string>('');

  // Atomic 5-Min Seat Hold State
  const [activeHoldLockToken, setActiveHoldLockToken] = useState<string | null>(null);
  const [activeHoldExpiresAt, setActiveHoldExpiresAt] = useState<number | null>(null);
  const [holdRemainingSeconds, setHoldRemainingSeconds] = useState<number>(0);
  const [isHoldingSeats, setIsHoldingSeats] = useState<boolean>(false);

  // Google Auth + Server-Verified UPI Payment State inside Checkout
  const [guestEmailInput, setGuestEmailInput] = useState('rahul.sharma@gmail.com');
  const [guestNameInput, setGuestNameInput] = useState('Rahul Sharma');
  const [guestPhoneInput, setGuestPhoneInput] = useState('9848012345');
  const [isSigningInGoogle, setIsSigningInGoogle] = useState(false);

  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [upiUtrInput, setUpiUtrInput] = useState<string>('412987654321');
  const [paymentVerificationToken, setPaymentVerificationToken] = useState<string | null>(null);
  const [paymentVerifyStatus, setPaymentVerifyStatus] = useState<
    'idle' | 'verifying' | 'pending_reconciliation' | 'verified' | 'failed'
  >('idle');
  const [paymentStatusMessage, setPaymentStatusMessage] = useState<string | null>(null);

  // Booked Tickets State
  const [bookedTickets, setBookedTickets] = useState<BookedMTicket[]>(() => {
    try {
      const saved = localStorage.getItem('bos_booked_mtickets_v2') || localStorage.getItem('bos_district_booked_mtickets_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });
  const [activeMTicket, setActiveMTicket] = useState<BookedMTicket | null>(null);
  const [toastBanner, setToastBanner] = useState<string | null>(null);
  const [serverLockedSeats, setServerLockedSeats] = useState<string[]>([]);
  const [isAtomicallyBooking, setIsAtomicallyBooking] = useState(false);

  // Cancellation & Support Modal States
  const [cancellingTicket, setCancellingTicket] = useState<BookedMTicket | null>(null);
  const [cancelReason, setCancelReason] = useState<string>('Change of plans / Schedule conflict');
  const [isCancellingBusy, setIsCancellingBusy] = useState(false);

  const [supportModalTicket, setSupportModalTicket] = useState<BookedMTicket | null>(null);
  const [supportCategory, setSupportCategory] = useState<
    'refund_status' | 'payment_deducted' | 'seat_issue' | 'qr_scan_help' | 'other'
  >('refund_status');
  const [supportDesc, setSupportDesc] = useState('');
  const [isSubmittingSupport, setIsSubmittingSupport] = useState(false);

  // Theatre Gate QR Scanner State
  const [qrScanInput, setQrScanInput] = useState('');
  const [isScanningQr, setIsScanningQr] = useState(false);
  const [qrScanResult, setQrScanResult] = useState<{
    ok: boolean;
    httpStatus: number;
    verified: boolean;
    alreadyCheckedIn?: boolean;
    error?: string;
    message?: string;
    booking?: any;
  } | null>(null);

  // Provider / Admin Screen Editor State
  const [editingScreen, setEditingScreen] = useState<AuthoritativeCinemaScreenConfig | null>(null);
  const [isSavingScreen, setIsSavingScreen] = useState(false);

  const triggerDistrictToast = (msg: string) => {
    setToastBanner(msg);
    window.setTimeout(() => {
      setToastBanner((prev) => (prev === msg ? null : prev));
    }, 3800);
  };

  // Load authoritative movies inventory (screens, bookings, refunds, support tickets, audit logs)
  const refreshMoviesInventory = async () => {
    setIsLoadingInventory(true);
    try {
      const res = await fetchMoviesInventory();
      if (res.ok) {
        setCinemaScreens(res.screens);
        setServerRefunds(res.refunds);
        setServerSupportTickets(res.supportTickets);
        setServerAuditLogs(res.auditLogs);

        // Merge server-persisted movie bookings into bookedTickets so refresh never loses confirmed tickets
        if (Array.isArray(res.bookings) && res.bookings.length > 0) {
          setBookedTickets((prev) => {
            const byId = new Map<string, BookedMTicket>();
            prev.forEach((t) => byId.set(t.ticketId, t));
            res.bookings.forEach((sb: any) => {
              const pass = sb.passCode || sb.id;
              const existing = byId.get(pass);
              const matchedListing = movieListings.find((m) => m.id === sb.listingId) || movieListings[0];
              byId.set(pass, {
                id: sb.id,
                ticketId: pass,
                listingId: sb.listingId,
                dateIso: sb.scheduledDate,
                movieTitle: sb.listingTitle?.split(' (')[0] || existing?.movieTitle || matchedListing?.title || 'Movie Ticket',
                cinemaName: existing?.cinemaName || matchedListing?.providerName || 'Multiplex Cinema',
                screenName: sb.screenName || existing?.screenName || 'Screen 1 · 4K Atmos',
                areaName: sb.customerAddress || existing?.areaName || matchedListing?.location.area || 'Hyderabad',
                posterUrl: existing?.posterUrl || matchedListing?.images?.[0] || '',
                dateLabel: sb.scheduledDate || existing?.dateLabel || 'Today',
                showtime: sb.showtime || existing?.showtime || '07:55 PM',
                screenFormat: existing?.screenFormat || '4K Laser · Dolby Atmos',
                seats: Array.isArray(sb.seats) && sb.seats.length > 0 ? sb.seats : existing?.seats || ['D5', 'D6'],
                foodItems: Array.isArray(sb.foodAddons)
                  ? sb.foodAddons.map((f: any) => `${f.name} x${f.qty}`)
                  : existing?.foodItems || [],
                baseAmount: sb.baseAmount ?? existing?.baseAmount,
                taxAmount: sb.taxAmount ?? existing?.taxAmount,
                discountAmount: sb.discountAmount ?? existing?.discountAmount,
                promoCode: sb.promoCode ?? existing?.promoCode,
                totalAmount: sb.totalAmount ?? existing?.totalAmount ?? 250,
                bookedAt: existing?.bookedAt || new Date(sb.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                qrSignature: sb.qrSignature || existing?.qrSignature,
                qrPassToken: sb.qrPassToken || existing?.qrPassToken,
                paymentUtr: sb.paymentUtr || existing?.paymentUtr,
                paymentStatus: sb.paymentStatus || existing?.paymentStatus || 'verified',
                status: sb.status || existing?.status || 'confirmed',
                checkedInAt: sb.checkedInAt || existing?.checkedInAt,
                cancelledAt: sb.cancelledAt || existing?.cancelledAt,
                cancellationReason: sb.cancellationReason || existing?.cancellationReason,
                refundAmount: sb.refundAmount ?? existing?.refundAmount,
              });
            });
            return Array.from(byId.values());
          });
        }
      }
    } finally {
      setIsLoadingInventory(false);
    }
  };

  useEffect(() => {
    void refreshMoviesInventory();
  }, [userRole, authUser?.id]);

  useEffect(() => {
    try {
      localStorage.setItem('bos_booked_mtickets_v2', JSON.stringify(bookedTickets));
    } catch {}
  }, [bookedTickets]);

  // Restore active 5-min seat hold across page refresh / back navigation
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(HOLD_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved && saved.expiresAt && saved.expiresAt > Date.now()) {
        const targetListing = movieListings.find((m) => m.id === saved.listingId);
        if (targetListing) {
          setBookingModalListing(targetListing);
          setSelectedDateOffset(saved.dateOffset || 0);
          setSelectedShowtime(saved.showtime || '07:55 PM');
          setSelectedSeats(saved.seats || ['D5', 'D6']);
          setActiveHoldLockToken(saved.lockToken || 'HOLD-RESTORED');
          setActiveHoldExpiresAt(saved.expiresAt);
          setBookingStep(saved.step || 'fnb');
        }
      } else {
        sessionStorage.removeItem(HOLD_STORAGE_KEY);
      }
    } catch {}
  }, [movieListings]);

  // Live 1-second countdown timer for the 5-minute atomic seat hold
  useEffect(() => {
    if (!activeHoldExpiresAt) {
      setHoldRemainingSeconds(0);
      return;
    }
    const updateTimer = () => {
      const diffSec = Math.max(0, Math.ceil((activeHoldExpiresAt - Date.now()) / 1000));
      setHoldRemainingSeconds(diffSec);
      if (diffSec <= 0) {
        setActiveHoldLockToken(null);
        setActiveHoldExpiresAt(null);
        sessionStorage.removeItem(HOLD_STORAGE_KEY);
        if (bookingModalListing && bookingStep !== 'mticket') {
          void releaseAuthoritativeSeats({
            listingId: bookingModalListing.id,
            dateIso: dateStrip[selectedDateOffset]?.iso || new Date().toISOString().slice(0, 10),
            showtime: selectedShowtime,
            seats: selectedSeats,
          });
          setBookingStep('seats');
          triggerDistrictToast('⏰ 5-minute seat hold expired! Seats have been released back to live inventory.');
        }
      }
    };
    updateTimer();
    const timer = window.setInterval(updateTimer, 1000);
    return () => window.clearInterval(timer);
  }, [activeHoldExpiresAt, bookingModalListing, bookingStep, selectedDateOffset, selectedShowtime, selectedSeats]);

  // Animated Trailer Canvas Effect
  useEffect(() => {
    if (!trailerModalMovie || !isTrailerPlaying) return;
    const interval = window.setInterval(() => {
      setTrailerProgress((p) => (p >= 100 ? 0 : p + 1));
    }, 450);
    return () => window.clearInterval(interval);
  }, [trailerModalMovie, isTrailerPlaying]);

  useEffect(() => {
    if (!trailerModalMovie || !trailerCanvasRef.current) return;
    const canvas = trailerCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let animId = 0;
    let frame = 0;
    const render = () => {
      frame += 1;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, 'rgba(226, 55, 68, 0.22)');
      grad.addColorStop(0.5, 'rgba(15, 23, 42, 0.45)');
      grad.addColorStop(1, 'rgba(56, 189, 248, 0.20)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Equalizer bars at bottom of trailer
      const barCount = 32;
      const barW = w / barCount;
      for (let i = 0; i < barCount; i++) {
        const amp = isTrailerPlaying
          ? Math.abs(Math.sin((frame * 0.08) + i * 0.45)) * 28 + 4
          : 4;
        ctx.fillStyle = i % 2 === 0 ? 'rgba(226, 55, 68, 0.75)' : 'rgba(251, 191, 36, 0.75)';
        ctx.fillRect(i * barW + 2, h - amp - 8, barW - 4, amp);
      }
      animId = requestAnimationFrame(render);
    };
    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [trailerModalMovie, isTrailerPlaying]);

  // Spotlight movies derived strictly from existing movie listings & their existing images
  const spotlightMovies = useMemo(() => {
    const featured = movieListings.filter((m) => m.isFeatured);
    return (featured.length > 0 ? featured : movieListings).slice(0, 6);
  }, [movieListings]);

  useEffect(() => {
    if (!isAutoPlaying || spotlightMovies.length <= 1) return;
    const timer = window.setInterval(() => {
      setSpotlightIndex((prev) => (prev + 1) % spotlightMovies.length);
    }, 5500);
    return () => window.clearInterval(timer);
  }, [isAutoPlaying, spotlightMovies.length]);

  const currentSpotlight =
    spotlightMovies[spotlightIndex % Math.max(1, spotlightMovies.length)] || movieListings[0];

  // Generate 7-day horizontal date strip (District.in style)
  const dateStrip = useMemo(() => {
    const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    return Array.from({ length: 7 }, (_, idx) => {
      const d = new Date();
      d.setDate(d.getDate() + idx);
      return {
        offset: idx,
        dayLabel: idx === 0 ? 'TODAY' : idx === 1 ? 'TOM' : days[d.getDay()],
        dateNum: d.getDate(),
        monthLabel: months[d.getMonth()],
        fullLabel: `${idx === 0 ? 'Today' : idx === 1 ? 'Tomorrow' : days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]}`,
        iso: d.toISOString().slice(0, 10),
      };
    });
  }, []);

  const getScreenConfigForListing = (listing: MarketplaceListing): AuthoritativeCinemaScreenConfig | undefined => {
    return cinemaScreens.find((s) => s.cinemaListingId === listing.id) || cinemaScreens[0];
  };

  const parseShowTimings = (listing: MarketplaceListing): string[] => {
    const screenCfg = cinemaScreens.find((s) => s.cinemaListingId === listing.id);
    if (screenCfg && Array.isArray(screenCfg.showtimes) && screenCfg.showtimes.length > 0) {
      return screenCfg.showtimes;
    }
    const raw = String(
      listing.customFieldValues?.showTimings || '10:30 AM • 01:45 PM • 04:50 PM • 07:55 PM • 10:55 PM'
    );
    return raw
      .split('•')
      .map((s) => s.trim())
      .filter(Boolean);
  };

  // Helper to extract rich metadata from existing listing fields
  const getMovieMeta = (item: MarketplaceListing) => {
    const screenCfg = getScreenConfigForListing(item);
    const cert = item.categoryId === 'movie-standup' ? 'UA 16+' : item.categoryId === 'movie-private' ? 'ALL AGES' : 'UA 16+';
    const langRaw = String(
      item.customFieldValues?.languageFormat ||
        (item.categoryId === 'movie-telugu'
          ? 'Telugu · Hindi · English'
          : item.categoryId === 'movie-multiplex'
          ? 'Telugu · English · Hindi (IMAX / PCX)'
          : 'Telugu · Hindi · English')
    );
    const soundRaw = String(
      screenCfg?.format ||
        item.customFieldValues?.soundSystem ||
        item.customFieldValues?.screenSoundFormat ||
        '4K Laser · Dolby Atmos'
    );
    const genreLabel =
      item.categoryId === 'movie-standup'
        ? 'Standup Comedy · Live'
        : item.categoryId === 'movie-private'
        ? 'Private Theatre · Celebration'
        : item.categoryId === 'movie-telugu'
        ? 'Action · Drama · Blockbuster'
        : 'Action · Sci-Fi · Thriller';
    const duration =
      item.categoryId === 'movie-standup'
        ? '1 hr 45 mins'
        : item.categoryId === 'movie-private'
        ? '3 hrs Private Slot'
        : '2 hrs 48 mins';
    const cancellationPolicy = screenCfg
      ? screenCfg.cancellationAllowed
        ? `${screenCfg.refundPercent}% refund up to ${Math.round(screenCfg.cancellationCutoffMinutes / 60)} hrs before show`
        : 'Non-refundable show'
      : '80% refund up to 2 hrs before show';

    return { cert, langRaw, soundRaw, genreLabel, duration, cancellationPolicy, screenCfg };
  };

  // Filter & sort existing movie listings
  const filteredMovies = useMemo(() => {
    const list = movieListings.filter((item) => {
      if (activePillar === 'events' && item.categoryId !== 'movie-standup') return false;
      if (activePillar === 'private' && item.categoryId !== 'movie-private') return false;

      if (selectedCityArea !== 'All Hyderabad') {
        const areaMatch =
          item.location.area.toLowerCase().includes(selectedCityArea.toLowerCase()) ||
          item.location.address.toLowerCase().includes(selectedCityArea.toLowerCase());
        if (!areaMatch) return false;
      }

      const combinedText = `${item.title} ${item.titleTe || ''} ${item.description} ${item.subcategory} ${
        item.customFieldValues?.languageFormat || ''
      } ${item.customFieldValues?.soundSystem || ''} ${item.customFieldValues?.screenSoundFormat || ''}`.toLowerCase();

      if (selectedLang !== 'all') {
        const langKey = selectedLang.toLowerCase();
        if (!combinedText.includes(langKey) && item.categoryId !== 'movie-telugu') {
          return false;
        }
      }

      if (selectedFormat !== 'all') {
        const fmtKey =
          selectedFormat === 'PCX / IMAX'
            ? 'pcx'
            : selectedFormat === 'VIP Recliner'
            ? 'recliner'
            : selectedFormat === '2D'
            ? '2d'
            : selectedFormat.toLowerCase();
        if (!combinedText.includes(fmtKey) && item.categoryId !== 'movie-multiplex') {
          return false;
        }
      }

      if (selectedGenre !== 'all') {
        if (selectedGenre === 'Comedy' && item.categoryId !== 'movie-standup' && !combinedText.includes('comedy')) {
          return false;
        }
        if (selectedGenre === 'Private Screen' && item.categoryId !== 'movie-private') {
          return false;
        }
        if (
          selectedGenre !== 'Comedy' &&
          selectedGenre !== 'Private Screen' &&
          !combinedText.includes(selectedGenre.toLowerCase()) &&
          item.categoryId === 'movie-standup'
        ) {
          return false;
        }
      }

      if (localSearch.trim()) {
        const q = localSearch.toLowerCase().trim();
        if (
          !combinedText.includes(q) &&
          !item.providerName.toLowerCase().includes(q) &&
          !item.location.area.toLowerCase().includes(q)
        ) {
          return false;
        }
      }

      return true;
    });

    return [...list].sort((a, b) => {
      if (sortBy === 'price_low') return a.price - b.price;
      if (sortBy === 'price_high') return b.price - a.price;
      if (sortBy === 'rating') return b.providerRating - a.providerRating;
      return b.reviewCount - a.reviewCount;
    });
  }, [movieListings, activePillar, selectedCityArea, selectedLang, selectedFormat, selectedGenre, localSearch, sortBy]);

  const upcomingReleases = useMemo(() => {
    const releaseTags = [
      'Releasing This Friday',
      'Advance Booking Open',
      'Early Premiere Shows',
      'Special Fan Show · Fri',
      'IMAX / PCX Special Screening',
      'Weekend Premiere',
    ];
    return movieListings.map((item, idx) => ({
      listing: item,
      posterImage: item.images[1] || item.images[0],
      releaseBadge: releaseTags[idx % releaseTags.length],
      baseInterested: 1420 + idx * 635 + item.reviewCount * 3,
    }));
  }, [movieListings]);

  const activeFilterCount = [
    selectedCityArea !== 'All Hyderabad',
    selectedLang !== 'all',
    selectedFormat !== 'all',
    selectedGenre !== 'all',
    wheelchairOnlyFilter,
    sortBy !== 'popularity',
  ].filter(Boolean).length;

  const resetAllDistrictFilters = () => {
    setSelectedCityArea('All Hyderabad');
    setSelectedLang('all');
    setSelectedFormat('all');
    setSelectedGenre('all');
    setSelectedSlotFilter('all');
    setWheelchairOnlyFilter(false);
    setSortBy('popularity');
    setLocalSearch('');
  };

  // Poll authoritative server seat locks when seat modal is active
  useEffect(() => {
    if (!bookingModalListing) return;
    const activeDateIso = dateStrip[selectedDateOffset]?.iso;
    if (!activeDateIso || !selectedShowtime) return;

    let cancelled = false;
    const mySessionId = getOrCreateClientSessionId();

    const syncLocks = async () => {
      const res = await fetchAuthoritativeSeatLocks({
        listingId: bookingModalListing.id,
        dateIso: activeDateIso,
        showtime: selectedShowtime,
      });
      if (!cancelled && res.ok) {
        const otherSessionHolds = res.heldSeats
          .filter((h) => h.sessionId !== mySessionId)
          .map((h) => h.seatId);
        const combined = Array.from(new Set([...res.bookedSeats, ...otherSessionHolds]));
        setServerLockedSeats(combined);
      }
    };

    void syncLocks();
    const interval = window.setInterval(syncLocks, 3500);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [bookingModalListing, dateStrip, selectedDateOffset, selectedShowtime]);

  // Compute dynamically locked/occupied seats for the active movie, date, and showtime
  const lockedSeatsForActiveShow = useMemo(() => {
    const locked = new Set<string>(['C4', 'C5', 'E7', ...serverLockedSeats]);
    if (!bookingModalListing) return locked;
    const activeDateIso = dateStrip[selectedDateOffset]?.iso;
    const activeDateLabel = dateStrip[selectedDateOffset]?.fullLabel;
    const activeTitle = getListingTitle(bookingModalListing, currentLang);

    for (const t of bookedTickets) {
      if (t.status === 'cancelled') continue;
      const sameListing = t.listingId ? t.listingId === bookingModalListing.id : t.movieTitle === activeTitle;
      const sameDate = t.dateIso ? t.dateIso === activeDateIso : t.dateLabel === activeDateLabel;
      if (sameListing && sameDate && t.showtime === selectedShowtime && Array.isArray(t.seats)) {
        t.seats.forEach((s) => locked.add(s));
      }
    }

    for (const bk of bookings) {
      if (bk.status === 'cancelled') continue;
      if (
        bk.listingId === bookingModalListing.id &&
        bk.scheduledDate === activeDateIso &&
        bk.timeSlot &&
        bk.timeSlot.includes(selectedShowtime)
      ) {
        const match = bk.timeSlot.match(/Seats:\s*([A-Z0-9,\s]+)/i);
        if (match && match[1]) {
          match[1]
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
            .forEach((s) => locked.add(s));
        }
      }
    }
    return locked;
  }, [bookingModalListing, dateStrip, selectedDateOffset, selectedShowtime, bookedTickets, bookings, currentLang, serverLockedSeats]);

  // Automatically deselect any seats that become locked when switching showtimes/dates
  useEffect(() => {
    if (!bookingModalListing) return;
    setSelectedSeats((prev) => {
      const filtered = prev.filter((s) => !lockedSeatsForActiveShow.has(s));
      if (filtered.length > 0) return filtered;
      const candidates = ['D5', 'D6', 'D7', 'D8', 'E5', 'E6', 'F5', 'F6'];
      return candidates.filter((s) => !lockedSeatsForActiveShow.has(s)).slice(0, 2);
    });
  }, [lockedSeatsForActiveShow, bookingModalListing]);

  // Open interactive booking drawer/modal at desired step
  const openDistrictBooking = (
    listing: MarketplaceListing,
    showtime?: string,
    initialStep: 'showtimes' | 'seats' = 'seats'
  ) => {
    const timings = parseShowTimings(listing);
    const meta = getMovieMeta(listing);
    setBookingModalListing(listing);
    setSelectedShowtime(showtime || timings[0] || '07:55 PM');
    setSelectedScreenFormat(meta.soundRaw);
    setSelectedSeats(['D5', 'D6']);
    setSelectedFoodQtys({});
    setSelectedPromoCode('');
    setPaymentIntentId(null);
    setPaymentVerificationToken(null);
    setPaymentVerifyStatus('idle');
    setPaymentStatusMessage(null);
    setActiveMTicket(null);
    setBookingStep(initialStep);
  };

  const toggleSeat = (seatId: string) => {
    if (lockedSeatsForActiveShow.has(seatId)) return;
    setSelectedSeats((prev) =>
      prev.includes(seatId) ? prev.filter((s) => s !== seatId) : prev.length < 10 ? [...prev, seatId] : prev
    );
  };

  const updateFoodQty = (id: string, delta: number) => {
    setSelectedFoodQtys((prev) => {
      const next = Math.max(0, (prev[id] || 0) + delta);
      return { ...prev, [id]: next };
    });
  };

  // Price, Taxes, Convenience Fee & Promo Offer Calculations
  const activeScreenConfig = useMemo(
    () => (bookingModalListing ? getScreenConfigForListing(bookingModalListing) : undefined),
    [bookingModalListing, cinemaScreens]
  );

  const seatSubtotal = useMemo(() => {
    if (!bookingModalListing) return 0;
    const basePrice = bookingModalListing.price || 250;
    return selectedSeats.reduce((sum, seatCode) => {
      const rowLetter = seatCode.charAt(0);
      if (activeScreenConfig && activeScreenConfig.tiers.length > 0) {
        const matchedTier = activeScreenConfig.tiers.find((t) => t.rows.includes(rowLetter));
        if (matchedTier) return sum + matchedTier.price;
      }
      const tier = SEAT_TIERS.find((t) => t.rows.includes(rowLetter)) || SEAT_TIERS[1];
      return sum + Math.round(basePrice * tier.priceMultiplier);
    }, 0);
  }, [bookingModalListing, selectedSeats, activeScreenConfig]);

  const foodSubtotal = useMemo(() => {
    return FOOD_ADDONS.reduce((sum, item) => sum + (selectedFoodQtys[item.id] || 0) * item.price, 0);
  }, [selectedFoodQtys]);

  const convenienceFeeTotal = useMemo(() => {
    const perSeat = activeScreenConfig?.convenienceFeePerSeat ?? 28;
    return selectedSeats.length * perSeat;
  }, [selectedSeats.length, activeScreenConfig]);

  const gstTaxAmount = useMemo(() => {
    const gstRate = (activeScreenConfig?.gstPercent ?? 18) / 100;
    return Math.round(convenienceFeeTotal * gstRate + foodSubtotal * 0.05);
  }, [convenienceFeeTotal, foodSubtotal, activeScreenConfig]);

  const grossBeforeDiscount = seatSubtotal + foodSubtotal + convenienceFeeTotal + gstTaxAmount;

  const promoDiscountAmount = useMemo(() => {
    if (!selectedPromoCode) return 0;
    const offer = PROMO_OFFERS.find((o) => o.code === selectedPromoCode.toUpperCase());
    if (!offer || grossBeforeDiscount < offer.minAmount) return 0;
    if (offer.discountType === 'flat') return Math.min(offer.value, offer.maxDiscount);
    return Math.min(Math.round((grossBeforeDiscount * offer.value) / 100), offer.maxDiscount);
  }, [selectedPromoCode, grossBeforeDiscount]);

  const grandTotal = Math.max(1, grossBeforeDiscount - promoDiscountAmount);

  // Step 2 -> Step 3: Acquire 5-Minute Atomic Seat Hold on Backend
  const handleAcquireAtomicSeatHold = async () => {
    if (!bookingModalListing || selectedSeats.length === 0 || isHoldingSeats) return;
    const availableSelected = selectedSeats.filter((s) => !lockedSeatsForActiveShow.has(s));
    if (availableSelected.length === 0) {
      triggerDistrictToast('⚠️ Selected seats were just locked by another user. Please pick different seats.');
      return;
    }

    setIsHoldingSeats(true);
    const activeDateIso = dateStrip[selectedDateOffset].iso;
    const sessionId = getOrCreateClientSessionId();

    try {
      const holdRes = await holdAuthoritativeSeats({
        listingId: bookingModalListing.id,
        dateIso: activeDateIso,
        showtime: selectedShowtime,
        seats: availableSelected,
        sessionId,
      });

      if (!holdRes.ok) {
        const conflicts = holdRes.conflictingSeats || [];
        if (conflicts.length > 0) {
          setServerLockedSeats((prev) => Array.from(new Set([...prev, ...conflicts])));
          setSelectedSeats((prev) => prev.filter((s) => !conflicts.includes(s)));
        }
        triggerDistrictToast(
          holdRes.message || `⚠️ Seat conflict (${conflicts.join(', ')}). Someone else just locked those seats!`
        );
        return;
      }

      const expiresAtMs = holdRes.expiresAt || Date.now() + 5 * 60 * 1000;
      const lockTok = holdRes.lockToken || `LOCK-${Date.now()}`;
      setActiveHoldLockToken(lockTok);
      setActiveHoldExpiresAt(expiresAtMs);

      try {
        sessionStorage.setItem(
          HOLD_STORAGE_KEY,
          JSON.stringify({
            listingId: bookingModalListing.id,
            dateOffset: selectedDateOffset,
            dateIso: activeDateIso,
            showtime: selectedShowtime,
            seats: availableSelected,
            lockToken: lockTok,
            expiresAt: expiresAtMs,
            step: 'fnb',
          })
        );
      } catch {}

      triggerDistrictToast(`🔒 Seats ${availableSelected.join(', ')} atomically locked for 05:00 minutes!`);
      setBookingStep('fnb');
    } finally {
      setIsHoldingSeats(false);
    }
  };

  // Proceed to Step 4 (Google Login + UPI Payment Intent Creation)
  const handleProceedToPaymentStep = async () => {
    if (!bookingModalListing) return;
    setBookingStep('payment');
    setPaymentVerifyStatus('idle');
    setPaymentStatusMessage(null);

    const intentRes = await createServerPaymentIntent({
      amount: grandTotal,
      merchantVpa: bookingModalListing.upiId || 'bookourspace.movies@okaxis',
      planOrListing: `Movie Ticket: ${bookingModalListing.title} (${selectedShowtime} · ${selectedSeats.join(', ')})`,
      userId: authUser?.id || supabaseUser?.id || getOrCreateClientSessionId(),
    });
    if (intentRes.ok && intentRes.intentId) {
      setPaymentIntentId(intentRes.intentId);
    }
  };

  // Inline 1-Click Google Login inside Checkout
  const handleInlineGoogleLogin = async () => {
    if (isSigningInGoogle) return;
    setIsSigningInGoogle(true);
    try {
      const res = await loginWithGoogle({
        email: guestEmailInput.trim() || 'rahul.sharma@gmail.com',
        name: guestNameInput.trim() || 'Rahul Sharma',
        phone: guestPhoneInput.trim() || '9848012345',
        city: 'Hyderabad',
        requestedRole: 'customer',
      });
      if (res.ok) {
        triggerDistrictToast(`✓ Signed in with Google as ${res.user?.email || guestEmailInput}`);
      } else {
        triggerDistrictToast(res.message || 'Google login failed.');
      }
    } finally {
      setIsSigningInGoogle(false);
    }
  };

  // Verify UPI Payment (supports testing UTR-only unsettled vs Bank Webhook Verified Settlement)
  const handleVerifyPaymentAndConfirmTicket = async (simulateBankWebhookSettlement: boolean) => {
    if (!bookingModalListing || selectedSeats.length === 0 || isAtomicallyBooking) return;
    const cleanUtr = upiUtrInput.replace(/\D/g, '');
    if (cleanUtr.length !== 12) {
      setPaymentVerifyStatus('failed');
      setPaymentStatusMessage('Please enter a valid 12-digit NPCI UPI Reference (UTR) number.');
      return;
    }

    setIsAtomicallyBooking(true);
    setPaymentVerifyStatus('verifying');
    setPaymentStatusMessage(null);

    try {
      let currentIntentId = paymentIntentId;
      if (!currentIntentId) {
        const created = await createServerPaymentIntent({
          amount: grandTotal,
          merchantVpa: bookingModalListing.upiId || 'bookourspace.movies@okaxis',
          planOrListing: `Movie Ticket: ${bookingModalListing.title}`,
          userId: authUser?.id || supabaseUser?.id || getOrCreateClientSessionId(),
        });
        currentIntentId = created.intentId || null;
        setPaymentIntentId(currentIntentId);
      }

      if (!currentIntentId) {
        setPaymentVerifyStatus('failed');
        setPaymentStatusMessage('Unable to initialize server payment intent.');
        return;
      }

      // Call server UPI verification
      const verifyRes = await verifyServerUpiPayment({
        intentId: currentIntentId,
        utrNumber: cleanUtr,
        amount: grandTotal,
        merchantVpa: bookingModalListing.upiId || 'bookourspace.movies@okaxis',
        simulateBankWebhookSettlement,
      });

      if (!verifyRes.ok && verifyRes.httpStatus === 409) {
        setPaymentVerifyStatus('failed');
        setPaymentStatusMessage(
          verifyRes.message || '409 DUPLICATE_UTR_REPLAY: This UTR has already been used for another transaction.'
        );
        triggerDistrictToast('⚠️ Duplicate UTR rejected by server idempotency guard!');
        return;
      }

      // Now call atomic booking endpoint with requireVerifiedPayment: true
      // If simulateBankWebhookSettlement was false, verifyRes.paymentVerificationToken is undefined,
      // and the server MUST reject with 402 PAYMENT_NOT_VERIFIED!
      const activeDateIso = dateStrip[selectedDateOffset].iso;
      const sessionId = getOrCreateClientSessionId();
      const sortedSeatsKey = [...selectedSeats].sort().join('-');
      const idempotencyKey = `mticket:${bookingModalListing.id}:${activeDateIso}:${selectedShowtime}:${sortedSeatsKey}:${currentIntentId}`;
      const baseTicketId = `BOS-TKT-${Math.floor(100000 + Math.random() * 900000)}`;

      const customerNameVal =
        authUser?.name ||
        supabaseProfile?.full_name ||
        supabaseUser?.user_metadata?.full_name ||
        guestNameInput ||
        'Rahul Sharma';
      const customerPhoneVal = authUser?.phone || supabaseProfile?.phone || guestPhoneInput || '9848012345';

      const foodAddonsPayload = FOOD_ADDONS.filter((f) => (selectedFoodQtys[f.id] || 0) > 0).map((f) => ({
        id: f.id,
        name: f.name,
        price: f.price,
        qty: selectedFoodQtys[f.id],
      }));
      const foodSummary = foodAddonsPayload.map((f) => `${f.name} x${f.qty}`);

      const atomicRes = await createAuthoritativeBookingAtomic({
        idempotencyKey,
        listingId: bookingModalListing.id,
        listingTitle: `${getListingTitle(bookingModalListing, currentLang)} (${selectedShowtime} · Seats: ${selectedSeats.join(', ')})`,
        providerId: bookingModalListing.providerId,
        customerUserId: authUser?.id || supabaseUser?.id || sessionId,
        customerName: customerNameVal,
        customerPhone: customerPhoneVal,
        customerAddress: localizeAreaName(bookingModalListing.location.area, currentLang),
        scheduledDate: activeDateIso,
        timeSlot: `${selectedShowtime} · Seats: ${selectedSeats.join(', ')}`,
        showtime: selectedShowtime,
        screenId: activeScreenConfig?.id || 'SCR-AMB-1',
        screenName: activeScreenConfig?.screenName || selectedScreenFormat,
        seats: selectedSeats,
        foodAddons: foodAddonsPayload,
        baseAmount: seatSubtotal,
        taxAmount: convenienceFeeTotal + gstTaxAmount,
        discountAmount: promoDiscountAmount,
        promoCode: selectedPromoCode || undefined,
        totalAmount: grandTotal,
        paymentMode: 'pay_qr',
        requireVerifiedPayment: true,
        paymentIntentId: currentIntentId,
        paymentUtr: cleanUtr,
        paymentVerificationToken: verifyRes.paymentVerificationToken,
        passCode: baseTicketId,
        notes: foodSummary.length > 0 ? `F&B: ${foodSummary.join(', ')}` : 'Server-Verified M-Ticket QR',
        sessionId,
      });

      if (!atomicRes.ok || !atomicRes.booking) {
        if (atomicRes.status === 402 || atomicRes.error === 'PAYMENT_NOT_VERIFIED') {
          setPaymentVerifyStatus('pending_reconciliation');
          setPaymentStatusMessage(
            atomicRes.message ||
              'UTR submitted, but payment is NOT yet settled by bank webhook. Server strictly blocks ticket confirmation from UTR alone.'
          );
          triggerDistrictToast('🛡️ Security Guard: UTR alone cannot confirm ticket without bank settlement!');
          return;
        }

        const conflicts = atomicRes.conflictingSeats || [];
        if (conflicts.length > 0) {
          setServerLockedSeats((prev) => Array.from(new Set([...prev, ...conflicts])));
          setSelectedSeats((prev) => prev.filter((s) => !conflicts.includes(s)));
        }
        setPaymentVerifyStatus('failed');
        setPaymentStatusMessage(atomicRes.message || 'Booking failed due to seat conflict.');
        return;
      }

      setPaymentVerifyStatus('verified');
      setPaymentVerificationToken(verifyRes.paymentVerificationToken || null);
      setActiveHoldLockToken(null);
      setActiveHoldExpiresAt(null);
      sessionStorage.removeItem(HOLD_STORAGE_KEY);

      const ticketId = atomicRes.booking.passCode || baseTicketId;
      const newTicket: BookedMTicket = {
        id: atomicRes.booking.id,
        ticketId,
        listingId: bookingModalListing.id,
        dateIso: activeDateIso,
        movieTitle: getListingTitle(bookingModalListing, currentLang),
        cinemaName: bookingModalListing.providerName,
        screenName: activeScreenConfig?.screenName || 'Screen 1 · 4K Atmos',
        areaName: localizeAreaName(bookingModalListing.location.area, currentLang),
        posterUrl: bookingModalListing.images[0],
        dateLabel: dateStrip[selectedDateOffset].fullLabel,
        showtime: selectedShowtime,
        screenFormat: selectedScreenFormat,
        seats: [...selectedSeats],
        foodItems: foodSummary,
        baseAmount: seatSubtotal,
        taxAmount: convenienceFeeTotal + gstTaxAmount,
        discountAmount: promoDiscountAmount,
        promoCode: selectedPromoCode || undefined,
        totalAmount: grandTotal,
        bookedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        qrSignature: atomicRes.booking.qrSignature,
        qrPassToken: atomicRes.booking.qrPassToken,
        paymentUtr: cleanUtr,
        paymentStatus: 'verified',
        status: 'confirmed',
      };

      setBookedTickets((prev) => {
        const filtered = prev.filter((t) => t.ticketId !== newTicket.ticketId);
        return [newTicket, ...filtered];
      });
      setActiveMTicket(newTicket);
      setBookingStep('mticket');

      createBooking({
        listingId: bookingModalListing.id,
        listingTitle: `${newTicket.movieTitle} (${newTicket.showtime} · Seats: ${newTicket.seats.join(', ')})`,
        providerId: bookingModalListing.providerId,
        customerName: customerNameVal,
        customerPhone: customerPhoneVal,
        scheduledDate: activeDateIso,
        timeSlot: `${selectedShowtime} · Seats: ${selectedSeats.join(', ')}`,
        totalAmount: grandTotal,
        invoiceNumber: atomicRes.booking.qrPassToken || ticketId,
        notes: `[Signed Pass: ${atomicRes.booking.qrPassToken}] UTR: ${cleanUtr}`,
      });

      recordPayment(
        'plan_subscription',
        grandTotal,
        `BookOurSpace M-Ticket: ${newTicket.movieTitle} (${selectedSeats.join(', ')})`,
        `Verified UPI UTR ${cleanUtr}`
      );

      void refreshMoviesInventory();
      triggerDistrictToast(`🎟️ Payment Settled & Signed QR Ticket Issued! ID: ${newTicket.ticketId}`);
    } finally {
      setIsAtomicallyBooking(false);
    }
  };

  // Atomic Ticket Cancellation & Refund Handler
  const handleConfirmCancelTicket = async () => {
    if (!cancellingTicket || isCancellingBusy) return;
    setIsCancellingBusy(true);
    try {
      const res = await cancelMovieBookingAtomic({
        bookingIdOrPassCode: cancellingTicket.id || cancellingTicket.ticketId,
        reason: cancelReason,
        customerPhone: authUser?.phone || guestPhoneInput,
      });

      if (!res.ok) {
        triggerDistrictToast(`⚠️ Cancellation blocked: ${res.message || 'Policy restriction'}`);
        return;
      }

      const refundAmt = res.refund?.refundAmount ?? Math.round(cancellingTicket.totalAmount * 0.8);
      setBookedTickets((prev) =>
        prev.map((t) =>
          t.ticketId === cancellingTicket.ticketId
            ? {
                ...t,
                status: 'cancelled',
                paymentStatus: 'refunded',
                cancelledAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                cancellationReason: cancelReason,
                refundAmount: refundAmt,
              }
            : t
        )
      );
      setCancellingTicket(null);
      void refreshMoviesInventory();
      triggerDistrictToast(`💸 Ticket Cancelled & ₹${refundAmt} Refund Initiated! Seats released to live inventory.`);
    } finally {
      setIsCancellingBusy(false);
    }
  };

  // Submit Customer Support / Dispute Ticket
  const handleCreateSupportTicket = async () => {
    if (!supportModalTicket || !supportDesc.trim() || isSubmittingSupport) return;
    setIsSubmittingSupport(true);
    try {
      const res = await createMovieSupportTicket({
        bookingId: supportModalTicket.id || supportModalTicket.ticketId,
        passCode: supportModalTicket.ticketId,
        customerName: authUser?.name || guestNameInput || 'Rahul Sharma',
        customerPhone: authUser?.phone || guestPhoneInput || '9848012345',
        issueCategory: supportCategory,
        description: supportDesc.trim(),
      });
      if (res.ok) {
        setSupportModalTicket(null);
        setSupportDesc('');
        void refreshMoviesInventory();
        triggerDistrictToast(`🛟 Support Ticket ${res.ticket?.id || ''} logged with Cinema Helpdesk!`);
      } else {
        triggerDistrictToast(res.message || 'Failed to submit support request.');
      }
    } finally {
      setIsSubmittingSupport(false);
    }
  };

  // Theatre Gate QR Scanner Handler
  const handleVerifyGateQr = async (tokenToScan?: string) => {
    const raw = (tokenToScan ?? qrScanInput).trim();
    if (!raw || isScanningQr) return;
    setIsScanningQr(true);
    try {
      const res = await verifyAuthoritativeQrPass({
        passToken: raw,
        markCheckedIn: true,
      });
      setQrScanResult(res);
      if (res.ok && res.verified) {
        triggerDistrictToast(`✅ ENTRY APPROVED: ${res.booking?.passCode || raw}`);
        void refreshMoviesInventory();
      } else {
        triggerDistrictToast(`⛔ ENTRY REJECTED (${res.httpStatus}): ${res.error || res.message}`);
      }
    } finally {
      setIsScanningQr(false);
    }
  };

  // Save Cinema Screen Configuration (Provider / Admin)
  const handleSaveScreenConfig = async () => {
    if (!editingScreen || isSavingScreen) return;
    setIsSavingScreen(true);
    try {
      const res = await updateCinemaScreenConfig(editingScreen);
      if (res.ok && res.screen) {
        setEditingScreen(null);
        void refreshMoviesInventory();
        triggerDistrictToast(`🎬 Updated ${res.screen.cinemaTitle} (${res.screen.screenName}) configuration!`);
      } else {
        triggerDistrictToast(`⛔ RBAC Error (${res.status}): ${res.message || 'Unauthorized'}`);
      }
    } finally {
      setIsSavingScreen(false);
    }
  };

  // Share or Download Ticket
  const handleShareTicket = async (tkt: BookedMTicket) => {
    const shareText = `🎟️ BookOurSpace Official M-Ticket\nMovie: ${tkt.movieTitle}\nCinema: ${tkt.cinemaName} (${tkt.areaName})\nShow: ${tkt.dateLabel} at ${tkt.showtime}\nSeats: ${tkt.seats.join(', ')}\nSigned QR Pass: ${tkt.qrPassToken || tkt.ticketId}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: `BookOurSpace M-Ticket: ${tkt.movieTitle}`, text: shareText });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareText);
        triggerDistrictToast('📋 Signed BookOurSpace M-Ticket details copied to clipboard!');
      }
    } catch {
      triggerDistrictToast('📋 Signed BookOurSpace M-Ticket ready to share!');
    }
  };

  const handleDownloadTicketSummary = (tkt: BookedMTicket) => {
    const content = [
      '====================================================',
      '        BOOKOURSPACE · OFFICIAL CINEMA M-TICKET     ',
      '====================================================',
      `Booking Pass ID   : ${tkt.ticketId}`,
      `Movie             : ${tkt.movieTitle}`,
      `Cinema & Screen   : ${tkt.cinemaName} (${tkt.screenName || tkt.screenFormat})`,
      `Locality          : ${tkt.areaName}, Hyderabad`,
      `Date & Showtime   : ${tkt.dateLabel} · ${tkt.showtime}`,
      `Confirmed Seats   : ${tkt.seats.join(', ')}`,
      `F&B Add-ons       : ${tkt.foodItems.length > 0 ? tkt.foodItems.join(', ') : 'None'}`,
      `Total Paid        : INR ${tkt.totalAmount} (Payment Status: ${tkt.paymentStatus || 'verified'})`,
      `NPCI UPI UTR      : ${tkt.paymentUtr || 'Verified Server Settlement'}`,
      `Signed QR Token   : ${tkt.qrPassToken || tkt.ticketId}`,
      `Ticket Status     : ${(tkt.status || 'confirmed').toUpperCase()}`,
      '====================================================',
      'Present this cryptographic QR token at the cinema gate.',
      'Single-use entry pass protected by HMAC-SHA256.',
    ].join('\n');

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${tkt.ticketId}-Movie-Ticket.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    triggerDistrictToast(`📥 Downloaded M-Ticket pass (${tkt.ticketId})!`);
  };

  if (!currentSpotlight) return null;

  const spotlightMeta = getMovieMeta(currentSpotlight);
  const formatHoldCountdown = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <section
      className={`rounded-3xl overflow-hidden border transition-colors duration-300 shadow-xl ${
        isLight
          ? 'bg-[#F8F8FA] text-zinc-900 border-zinc-200/90'
          : 'bg-[#0B0B11] text-white border-white/10'
      }`}
    >
      {/* FLOATING TOAST FEEDBACK */}
      {toastBanner && (
        <div
          data-testid="district-toast-banner"
          className="fixed bottom-5 right-5 z-50 bg-zinc-900 text-white px-4 py-3 rounded-2xl shadow-2xl border border-white/15 flex items-center gap-2.5 text-xs font-bold animate-in fade-in slide-in-from-bottom-2"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastBanner}</span>
        </div>
      )}

      {/* =====================================================================
          1. BOOKOURSPACE MOVIES TOP HEADER, OFFICIAL LOGO, CITY SELECTOR & NAVIGATION BAR
         ===================================================================== */}
      <header
        className={`sticky top-0 z-30 border-b px-4 sm:px-7 py-3.5 transition-colors ${
          isLight
            ? 'bg-white/95 backdrop-blur-md border-zinc-200/80'
            : 'bg-[#12121A]/95 backdrop-blur-md border-white/10'
        }`}
      >
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3.5">
          {/* Left: BookOurSpace Official Brand Logo + Interactive City / Locality Selector */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div data-testid="bos-movies-brand-logo" className="shrink-0">
                <BOSBrandLogo
                  compact
                  verifiedLabel="MOVIES"
                  subtitleItems={['MOVIES', 'CINEMAS', 'EVENTS']}
                  onClick={() => {
                    setActivePillar('movies');
                    resetAllDistrictFilters();
                  }}
                />
              </div>

              <div className={`h-7 w-px ${isLight ? 'bg-zinc-200' : 'bg-white/15'}`} />

              {/* Interactive City / Locality Selector */}
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-[#E23744]/10 flex items-center justify-center text-[#E23744]">
                  <MapPin className="w-4 h-4 shrink-0" />
                </div>
                <div className="leading-tight">
                  <select
                    aria-label="Select Cinema City or Locality"
                    value={selectedCityArea}
                    onChange={(e) => setSelectedCityArea(e.target.value)}
                    className={`text-xs sm:text-sm font-black bg-transparent outline-hidden cursor-pointer ${
                      isLight ? 'text-zinc-950' : 'text-white'
                    }`}
                  >
                    {HYDERABAD_CINEMA_AREAS.map((area) => (
                      <option key={area} value={area} className="text-zinc-900 bg-white">
                        {area === 'All Hyderabad' ? activeAreaName || 'Hyderabad (All Areas)' : `${area}, Hyd`}
                      </option>
                    ))}
                  </select>
                  <div className={`text-[10px] ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                    {cinemaScreens.length || 5} Verified Multiplexes
                  </div>
                </div>
              </div>
            </div>

            {/* Center: BookOurSpace Movies Top Navigation Pillars */}
            <nav className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
              {[
                { id: 'movies', label: 'Movies' },
                { id: 'cinemas', label: 'Cinemas' },
                { id: 'upcoming', label: 'Upcoming' },
                { id: 'events', label: 'Comedy & Events' },
                { id: 'private', label: 'Private Screens' },
                {
                  id: 'my_tickets',
                  label: `My M-Tickets (${bookedTickets.filter((t) => t.status !== 'cancelled').length})`,
                },
                { id: 'qr_scanner', label: 'Gate QR Scan' },
                { id: 'cinema_admin', label: 'Cinema Studio' },
              ].map((nav) => {
                const isActive = activePillar === nav.id;
                return (
                  <button
                    key={nav.id}
                    type="button"
                    data-testid={`district-pillar-${nav.id}`}
                    onClick={() => setActivePillar(nav.id as DistrictNavPillar)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                      isActive
                        ? isLight
                          ? 'bg-zinc-950 text-white shadow-xs'
                          : 'bg-[#E23744] text-white shadow-xs'
                        : isLight
                        ? 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100'
                        : 'text-zinc-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {nav.label}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Right: Live Search Input + Theme Switch + Classic View Toggle */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:w-64">
              <Search
                className={`w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 ${
                  isLight ? 'text-zinc-400' : 'text-zinc-500'
                }`}
              />
              <input
                type="text"
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
                placeholder="Search movies, cinemas, formats..."
                className={`w-full rounded-full pl-9 pr-8 py-2 text-xs font-medium outline-hidden border transition ${
                  isLight
                    ? 'bg-zinc-100/90 border-zinc-200 focus:border-zinc-400 focus:bg-white text-zinc-900 placeholder:text-zinc-400'
                    : 'bg-white/5 border-white/10 focus:border-white/30 text-white placeholder:text-zinc-500'
                }`}
              />
              {localSearch && (
                <button
                  type="button"
                  onClick={() => setLocalSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setCinemaTheme((prev) => (prev === 'light' ? 'dark' : 'light'))}
              className={`p-2 rounded-full border transition cursor-pointer ${
                isLight
                  ? 'bg-zinc-100 border-zinc-200 text-zinc-700 hover:bg-zinc-200'
                  : 'bg-white/10 border-white/15 text-amber-300 hover:bg-white/15'
              }`}
              title={isLight ? 'Switch to Dark Cinema Theme' : 'Switch to BookOurSpace Light Theme'}
            >
              {isLight ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            </button>

            {onToggleClassicGrid && (
              <button
                type="button"
                onClick={onToggleClassicGrid}
                className={`px-3 py-2 rounded-full border text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
                  showClassicGridBelow
                    ? 'bg-[#E23744] text-white border-[#E23744]'
                    : isLight
                    ? 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-100'
                    : 'bg-white/5 border-white/10 text-zinc-300 hover:bg-white/10'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">
                  {showClassicGridBelow ? 'Hide Classic' : 'Classic Grid'}
                </span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* =====================================================================
          2. FULL-WIDTH BLURRED-BACKDROP HERO CAROUSEL (1:1 DISTRICT.IN/MOVIES)
         ===================================================================== */}
      {activePillar === 'movies' && (
        <div
          className="relative overflow-hidden border-b border-black/5"
          onMouseEnter={() => setIsAutoPlaying(false)}
          onMouseLeave={() => setIsAutoPlaying(true)}
        >
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <img
              src={currentSpotlight.images[0]}
              alt=""
              aria-hidden="true"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover scale-125 blur-3xl opacity-35"
            />
            <div
              className={`absolute inset-0 ${
                isLight
                  ? 'bg-gradient-to-r from-white/95 via-white/80 to-white/60'
                  : 'bg-gradient-to-r from-[#0B0B11] via-[#0B0B11]/85 to-[#0B0B11]/60'
              }`}
            />
          </div>

          <div className="relative max-w-6xl mx-auto px-4 sm:px-8 py-6 sm:py-10">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-center">
              <div className="lg:col-span-7 space-y-4">
                <div
                  className={`flex flex-wrap items-center gap-2 text-xs sm:text-sm font-bold ${
                    isLight ? 'text-zinc-700' : 'text-zinc-300'
                  }`}
                >
                  <span className="font-black text-[#E23744]">{spotlightMeta.cert}</span>
                  <span aria-hidden="true">·</span>
                  <span>{spotlightMeta.genreLabel}</span>
                  <span aria-hidden="true">·</span>
                  <span>{spotlightMeta.langRaw}</span>
                  <span aria-hidden="true">·</span>
                  <span>{spotlightMeta.duration}</span>
                </div>

                <h1
                  onClick={() => setTrailerModalMovie(currentSpotlight)}
                  className={`text-2xl sm:text-4xl font-black tracking-tight leading-tight cursor-pointer hover:underline ${
                    isLight ? 'text-zinc-950' : 'text-white'
                  }`}
                >
                  {getListingTitle(currentSpotlight, currentLang)}
                </h1>

                <p
                  className={`text-xs sm:text-sm line-clamp-2 max-w-xl leading-relaxed ${
                    isLight ? 'text-zinc-600' : 'text-zinc-300'
                  }`}
                >
                  {currentLang === 'te'
                    ? currentSpotlight.descriptionTe || currentSpotlight.description
                    : currentSpotlight.description}
                </p>

                <div
                  className={`flex flex-wrap items-center gap-3 text-xs font-semibold ${
                    isLight ? 'text-zinc-600' : 'text-zinc-300'
                  }`}
                >
                  <span className="inline-flex items-center gap-1 font-black text-amber-500">
                    <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                    <span>{currentSpotlight.providerRating}/5</span>
                    <span className="font-normal opacity-80">
                      ({currentSpotlight.reviewCount} votes)
                    </span>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{localizeAreaName(currentSpotlight.location.area, currentLang)}</span>
                  <span aria-hidden="true">·</span>
                  <span>{spotlightMeta.soundRaw}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-black text-[#E23744]">₹{currentSpotlight.price} onwards</span>
                </div>

                <div className="pt-2 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    data-testid="hero-book-tickets-btn"
                    onClick={() =>
                      openDistrictBooking(
                        currentSpotlight,
                        parseShowTimings(currentSpotlight)[0] || '07:55 PM',
                        'seats'
                      )
                    }
                    className={`px-6 py-3 rounded-2xl text-xs sm:text-sm font-black flex items-center gap-2 shadow-lg transition transform active:scale-95 cursor-pointer ${
                      isLight
                        ? 'bg-zinc-950 hover:bg-zinc-800 text-white'
                        : 'bg-[#E23744] hover:bg-[#c92d39] text-white'
                    }`}
                  >
                    <Ticket className="w-4 h-4" />
                    <span>Book tickets</span>
                  </button>

                  <button
                    type="button"
                    data-testid="hero-watch-trailer-btn"
                    onClick={() => {
                      setTrailerModalMovie(currentSpotlight);
                      setIsTrailerPlaying(true);
                    }}
                    className={`px-4 py-3 rounded-2xl text-xs sm:text-sm font-bold flex items-center gap-1.5 border transition cursor-pointer ${
                      isLight
                        ? 'bg-white/90 hover:bg-white text-zinc-900 border-zinc-300'
                        : 'bg-white/10 hover:bg-white/15 text-white border-white/15'
                    }`}
                  >
                    <Play className="w-4 h-4 text-[#E23744] fill-[#E23744]" />
                    <span>Watch Trailer & Details</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onSelectListing(currentSpotlight)}
                    className={`px-4 py-3 rounded-2xl text-xs sm:text-sm font-bold flex items-center gap-1.5 border transition cursor-pointer ${
                      isLight
                        ? 'bg-white/80 hover:bg-white text-zinc-800 border-zinc-200'
                        : 'bg-white/5 hover:bg-white/10 text-zinc-200 border-white/10'
                    }`}
                  >
                    <Eye className="w-4 h-4" />
                    <span>{currentLang === 'te' ? 'రూమ్ చూడండి' : 'Auditorium View'}</span>
                  </button>
                </div>
              </div>

              <div className="lg:col-span-5 flex items-center justify-center lg:justify-end">
                <div
                  onClick={() => {
                    setTrailerModalMovie(currentSpotlight);
                    setIsTrailerPlaying(true);
                  }}
                  className="relative w-full max-w-[340px] aspect-[4/3] sm:aspect-[16/10] lg:aspect-[4/3] rounded-3xl overflow-hidden shadow-2xl border-2 border-white/30 cursor-pointer group"
                >
                  <img
                    src={currentSpotlight.images[0]}
                    alt={getListingTitle(currentSpotlight, currentLang)}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-12 h-12 rounded-full bg-[#E23744]/90 text-white flex items-center justify-center shadow-xl group-hover:scale-110 transition-transform">
                      <Play className="w-5 h-5 fill-white ml-0.5" />
                    </div>
                  </div>
                  <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-white text-xs font-bold">
                    <span className="inline-flex items-center gap-1.5 bg-black/65 backdrop-blur-xs px-2.5 py-1 rounded-lg">
                      <Play className="w-3.5 h-3.5 fill-white" />
                      <span>Official 4K Trailer</span>
                    </span>
                    <span className="bg-[#E23744] px-2.5 py-1 rounded-lg font-black text-[11px]">
                      {spotlightMeta.cert}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {spotlightMovies.map((item, idx) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSpotlightIndex(idx)}
                    className={`h-2 rounded-full transition-all cursor-pointer ${
                      idx === spotlightIndex
                        ? isLight
                          ? 'w-7 bg-zinc-950'
                          : 'w-7 bg-[#E23744]'
                        : isLight
                        ? 'w-2 bg-zinc-300 hover:bg-zinc-400'
                        : 'w-2 bg-white/25 hover:bg-white/50'
                    }`}
                    aria-label={`Slide ${idx + 1}`}
                  />
                ))}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setSpotlightIndex(
                      (prev) => (prev - 1 + spotlightMovies.length) % Math.max(1, spotlightMovies.length)
                    )
                  }
                  className={`w-9 h-9 rounded-full border flex items-center justify-center transition cursor-pointer ${
                    isLight
                      ? 'bg-white border-zinc-200 text-zinc-800 hover:bg-zinc-100 shadow-xs'
                      : 'bg-white/10 border-white/15 text-white hover:bg-white/20'
                  }`}
                  aria-label="Previous slide"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setSpotlightIndex((prev) => (prev + 1) % Math.max(1, spotlightMovies.length))
                  }
                  className={`w-9 h-9 rounded-full border flex items-center justify-center transition cursor-pointer ${
                    isLight
                      ? 'bg-white border-zinc-200 text-zinc-800 hover:bg-zinc-100 shadow-xs'
                      : 'bg-white/10 border-white/15 text-white hover:bg-white/20'
                  }`}
                  aria-label="Next slide"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MAIN BODY CONTENT BY ACTIVE PILLAR
         ===================================================================== */}
      <div className="max-w-6xl mx-auto px-4 sm:px-8 py-7 space-y-10">
        {/* PILLAR A: MY BOOKED M-TICKETS, CANCELLATION/REFUND & SUPPORT */}
        {activePillar === 'my_tickets' ? (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-black">My BookOurSpace M-Tickets & Refunds</h2>
                <p className={`text-xs ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                  Cryptographically signed single-use QR passes · Instant cancellation & refund tracking
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActivePillar('qr_scanner')}
                  className="px-3.5 py-2 rounded-xl border border-zinc-300 dark:border-white/15 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <ScanLine className="w-3.5 h-3.5 text-[#E23744]" />
                  <span>Gate QR Validator</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActivePillar('movies')}
                  className="px-4 py-2 rounded-xl bg-[#E23744] text-white text-xs font-black cursor-pointer"
                >
                  Browse Movies
                </button>
              </div>
            </div>

            {bookedTickets.length === 0 ? (
              <div
                className={`rounded-3xl p-10 text-center border space-y-3 ${
                  isLight ? 'bg-white border-zinc-200' : 'bg-[#151520] border-white/10'
                }`}
              >
                <Ticket className="w-10 h-10 text-[#E23744] mx-auto" />
                <h3 className="text-base font-black">No Movie M-Tickets Booked Yet</h3>
                <p className={`text-xs max-w-md mx-auto ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                  Select any movie and showtime to lock seats with a 5-minute atomic hold, complete verified UPI settlement, and receive a signed QR ticket.
                </p>
                <button
                  type="button"
                  onClick={() => setActivePillar('movies')}
                  className="px-5 py-2.5 rounded-xl bg-zinc-950 text-white text-xs font-black cursor-pointer"
                >
                  Explore Now Showing
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {bookedTickets.map((tkt) => {
                  const isCancelled = tkt.status === 'cancelled';
                  const isCheckedIn = tkt.status === 'checked_in';
                  return (
                    <div
                      key={tkt.ticketId}
                      data-testid={`booked-mticket-${tkt.ticketId}`}
                      className={`rounded-3xl border p-5 flex flex-col justify-between gap-4 ${
                        isLight ? 'bg-white border-zinc-200 shadow-sm' : 'bg-[#151520] border-white/10'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3.5 min-w-0">
                          {tkt.posterUrl && (
                            <img
                              src={tkt.posterUrl}
                              alt={tkt.movieTitle}
                              referrerPolicy="no-referrer"
                              className="w-20 h-28 rounded-2xl object-cover shrink-0"
                            />
                          )}
                          <div className="space-y-1 min-w-0">
                            <span
                              className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md inline-block ${
                                isCancelled
                                  ? 'bg-rose-500/15 text-rose-600'
                                  : isCheckedIn
                                  ? 'bg-sky-500/15 text-sky-600'
                                  : 'bg-emerald-500/15 text-emerald-700'
                              }`}
                            >
                              {isCancelled
                                ? `CANCELLED & REFUNDED · ${tkt.ticketId}`
                                : isCheckedIn
                                ? `CHECKED IN AT GATE · ${tkt.ticketId}`
                                : `VERIFIED QR PASS · ${tkt.ticketId}`}
                            </span>
                            <h4 className="text-sm font-black truncate">{tkt.movieTitle}</h4>
                            <p className={`text-xs truncate ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                              {tkt.cinemaName} · {tkt.areaName}
                            </p>
                            <p className="text-xs font-bold text-[#E23744]">
                              {tkt.dateLabel} · {tkt.showtime}
                            </p>
                            <p className="text-xs font-black">
                              Seats: {tkt.seats.join(', ')} · ₹{tkt.totalAmount}
                            </p>
                            {tkt.paymentUtr && (
                              <p className="text-[10px] font-mono opacity-75">
                                UPI UTR: {tkt.paymentUtr}
                              </p>
                            )}
                            {isCancelled && tkt.refundAmount !== undefined && (
                              <p className="text-[11px] font-bold text-emerald-600">
                                Refund Credited: ₹{tkt.refundAmount} ({tkt.cancellationReason})
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="text-center shrink-0 space-y-1">
                          <div className="p-2 rounded-2xl bg-white border border-zinc-200 inline-flex">
                            <QRCodeSVG
                              value={tkt.qrPassToken || tkt.ticketId}
                              size={72}
                              level="M"
                            />
                          </div>
                          <div className="text-[9px] font-mono opacity-75">HMAC-SHA256</div>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-zinc-200/70 dark:border-white/10 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleShareTicket(tkt)}
                            className="px-2.5 py-1.5 rounded-xl bg-zinc-100 dark:bg-white/10 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Share2 className="w-3 h-3" />
                            <span>Share</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDownloadTicketSummary(tkt)}
                            className="px-2.5 py-1.5 rounded-xl bg-zinc-100 dark:bg-white/10 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Download className="w-3 h-3" />
                            <span>Download</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setQrScanInput(tkt.qrPassToken || tkt.ticketId);
                              setActivePillar('qr_scanner');
                            }}
                            className="px-2.5 py-1.5 rounded-xl bg-zinc-100 dark:bg-white/10 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <ScanLine className="w-3 h-3 text-[#E23744]" />
                            <span>Scan Gate</span>
                          </button>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSupportModalTicket(tkt)}
                            className="px-2.5 py-1.5 rounded-xl border border-zinc-300 dark:border-white/15 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <LifeBuoy className="w-3 h-3" />
                            <span>Support</span>
                          </button>

                          {!isCancelled && !isCheckedIn && (
                            <button
                              type="button"
                              data-testid={`cancel-ticket-btn-${tkt.ticketId}`}
                              onClick={() => setCancellingTicket(tkt)}
                              className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-black flex items-center gap-1 cursor-pointer"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>Cancel & Refund</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : activePillar === 'qr_scanner' ? (
          /* PILLAR B: THEATRE GATE SINGLE-USE QR SCANNER & REPLAY GUARD */
          <div className="max-w-2xl mx-auto space-y-6">
            <div
              className={`rounded-3xl border p-6 space-y-5 ${
                isLight ? 'bg-white border-zinc-200 shadow-sm' : 'bg-[#151520] border-white/10'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-[#E23744]/10 text-[#E23744] flex items-center justify-center">
                    <ScanLine className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-lg font-black">Theatre Gate Cryptographic QR Scanner</h2>
                    <p className={`text-xs ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                      Verifies HMAC-SHA256 signature, payment settlement, expiry, and blocks duplicate QR replay (409)
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-xs font-bold block">
                  Paste or Scan Signed BookOurSpace QR Pass Token (`BOS-TKT-XXXXXX.&lt;HMAC_SIGNATURE&gt;`)
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    data-testid="gate-qr-input"
                    value={qrScanInput}
                    onChange={(e) => setQrScanInput(e.target.value)}
                    placeholder="e.g. BOS-TKT-482910.A9F3C2..."
                    className={`flex-1 rounded-xl px-3.5 py-2.5 text-xs font-mono border outline-hidden ${
                      isLight
                        ? 'bg-zinc-50 border-zinc-300 text-zinc-900'
                        : 'bg-black/40 border-white/15 text-white'
                    }`}
                  />
                  <button
                    type="button"
                    data-testid="gate-qr-verify-btn"
                    disabled={!qrScanInput.trim() || isScanningQr}
                    onClick={() => handleVerifyGateQr()}
                    className="px-5 py-2.5 rounded-xl bg-[#E23744] hover:bg-[#c92d39] disabled:opacity-40 text-white text-xs font-black cursor-pointer shrink-0"
                  >
                    {isScanningQr ? 'Scanning...' : 'Scan & Admit Entry'}
                  </button>
                </div>

                {bookedTickets.length > 0 && (
                  <div className="pt-2 space-y-1.5">
                    <span className="text-[11px] font-bold opacity-70 block">
                      Quick Select Recent M-Ticket to Test Gate Entry & Replay Protection:
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {bookedTickets.slice(0, 4).map((t) => (
                        <button
                          key={t.ticketId}
                          type="button"
                          onClick={() => {
                            const tok = t.qrPassToken || t.ticketId;
                            setQrScanInput(tok);
                            void handleVerifyGateQr(tok);
                          }}
                          className="px-3 py-1.5 rounded-xl border border-zinc-300 dark:border-white/15 text-xs font-mono font-bold hover:border-[#E23744] cursor-pointer"
                        >
                          {t.ticketId} ({t.status || 'confirmed'})
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {qrScanResult && (
                <div
                  data-testid="gate-qr-scan-result"
                  className={`p-4 rounded-2xl border space-y-2 ${
                    qrScanResult.ok && qrScanResult.verified
                      ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-700 dark:text-emerald-300'
                      : 'bg-rose-500/10 border-rose-500/40 text-rose-700 dark:text-rose-300'
                  }`}
                >
                  <div className="flex items-center justify-between font-black text-sm">
                    <span>
                      {qrScanResult.ok && qrScanResult.verified
                        ? '✅ GATE ENTRY APPROVED (SINGLE-USE CONSUMED)'
                        : `⛔ ENTRY BLOCKED · HTTP ${qrScanResult.httpStatus} (${qrScanResult.error || 'REJECTED'})`}
                    </span>
                  </div>
                  <p className="text-xs font-semibold">{qrScanResult.message}</p>
                  {qrScanResult.booking && (
                    <div className="text-xs pt-2 border-t border-current/15 grid grid-cols-2 gap-2">
                      <div>
                        <span className="opacity-70 block">Pass ID</span>
                        <span className="font-mono font-black">{qrScanResult.booking.passCode}</span>
                      </div>
                      <div>
                        <span className="opacity-70 block">Customer</span>
                        <span className="font-black">{qrScanResult.booking.customerName}</span>
                      </div>
                      <div>
                        <span className="opacity-70 block">Show & Seats</span>
                        <span className="font-black">{qrScanResult.booking.timeSlot}</span>
                      </div>
                      <div>
                        <span className="opacity-70 block">Checked-In Timestamp</span>
                        <span className="font-mono font-bold">{qrScanResult.booking.checkedInAt || 'Just now'}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : activePillar === 'cinema_admin' ? (
          /* PILLAR C: PROVIDER & ADMIN CINEMA MANAGEMENT STUDIO */
          <div className="space-y-6">
            <div
              className={`rounded-3xl border p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                isLight ? 'bg-white border-zinc-200' : 'bg-[#151520] border-white/10'
              }`}
            >
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-[#E23744]">
                  RBAC PROTECTED · CINEMA OPERATIONS & ADMIN STUDIO
                </span>
                <h2 className="text-xl font-black">
                  Manage Screens, Seat Layouts, Showtimes, Refunds & Audit Logs
                </h2>
                <p className={`text-xs ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                  Current Active Role: <strong className="uppercase text-[#E23744]">{userRole}</strong> · Server enforces 403 Forbidden if a Customer attempts screen mutations.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {(['customer', 'provider', 'admin'] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    data-testid={`switch-role-${r}`}
                    onClick={() => setUserRole(r)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase border cursor-pointer ${
                      userRole === r
                        ? 'bg-[#E23744] text-white border-[#E23744]'
                        : 'border-zinc-300 dark:border-white/15 opacity-75'
                    }`}
                  >
                    Role: {r}
                  </button>
                ))}
              </div>
            </div>

            {/* Cinema Screens & Seat Tier Pricing Manager */}
            <div className="space-y-3">
              <h3 className="text-base font-black flex items-center gap-2">
                <Settings className="w-4 h-4 text-[#E23744]" />
                <span>Multiplex Screens, Seat Layouts & Cancellation Policies ({cinemaScreens.length})</span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {cinemaScreens.map((scr) => (
                  <div
                    key={scr.id}
                    className={`rounded-2xl border p-4 space-y-3 ${
                      isLight ? 'bg-white border-zinc-200' : 'bg-[#151520] border-white/10'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-mono font-bold text-[#E23744]">{scr.id}</span>
                        <h4 className="text-sm font-black">{scr.cinemaTitle}</h4>
                        <p className="text-xs opacity-75">
                          {scr.screenName} · {scr.area} · {scr.format}
                        </p>
                      </div>
                      <button
                        type="button"
                        data-testid={`edit-screen-${scr.id}`}
                        onClick={() => setEditingScreen({ ...scr })}
                        className="px-3 py-1.5 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 text-xs font-bold cursor-pointer"
                      >
                        Configure
                      </button>
                    </div>

                    <div className="text-xs grid grid-cols-3 gap-2 pt-2 border-t border-zinc-200/60 dark:border-white/10">
                      {scr.tiers.map((t) => (
                        <div key={t.name} className="bg-zinc-50 dark:bg-white/5 p-2 rounded-xl">
                          <span className="text-[10px] opacity-70 block truncate">{t.name}</span>
                          <span className="font-black">₹{t.price}</span>
                          <span className="text-[10px] block opacity-60">Rows: {t.rows.join(',')}</span>
                        </div>
                      ))}
                    </div>

                    <div className="text-[11px] flex flex-wrap items-center justify-between gap-2 opacity-80">
                      <span>
                        Policy: {scr.cancellationAllowed ? `${scr.refundPercent}% refund` : 'Non-refundable'}
                      </span>
                      <span>Conv. Fee: ₹{scr.convenienceFeePerSeat}/seat + {scr.gstPercent}% GST</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Edit Screen Modal */}
            {editingScreen && (
              <div className="p-5 rounded-3xl border-2 border-[#E23744] bg-white dark:bg-[#151520] space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-black">
                    Edit Screen Config: {editingScreen.cinemaTitle} ({editingScreen.id})
                  </h4>
                  <button
                    type="button"
                    onClick={() => setEditingScreen(null)}
                    className="text-xs font-bold text-zinc-400 cursor-pointer"
                  >
                    Close
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <label className="font-bold block mb-1">Screen Name</label>
                    <input
                      type="text"
                      value={editingScreen.screenName}
                      onChange={(e) => setEditingScreen({ ...editingScreen, screenName: e.target.value })}
                      className="w-full rounded-xl border border-zinc-300 dark:border-white/15 px-3 py-2 bg-transparent"
                    />
                  </div>
                  <div>
                    <label className="font-bold block mb-1">Refund % on Cancel</label>
                    <input
                      type="number"
                      value={editingScreen.refundPercent}
                      onChange={(e) =>
                        setEditingScreen({ ...editingScreen, refundPercent: Number(e.target.value) || 80 })
                      }
                      className="w-full rounded-xl border border-zinc-300 dark:border-white/15 px-3 py-2 bg-transparent"
                    />
                  </div>
                  <div>
                    <label className="font-bold block mb-1">Showtimes (comma-separated)</label>
                    <input
                      type="text"
                      value={editingScreen.showtimes.join(', ')}
                      onChange={(e) =>
                        setEditingScreen({
                          ...editingScreen,
                          showtimes: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                        })
                      }
                      className="w-full rounded-xl border border-zinc-300 dark:border-white/15 px-3 py-2 bg-transparent"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    data-testid="save-screen-config-btn"
                    onClick={handleSaveScreenConfig}
                    disabled={isSavingScreen}
                    className="px-5 py-2 rounded-xl bg-[#E23744] text-white text-xs font-black cursor-pointer"
                  >
                    {isSavingScreen ? 'Saving...' : 'Save Screen Config (RBAC Checked)'}
                  </button>
                </div>
              </div>
            )}

            {/* Refunds & Support Tickets & Audit Logs */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div
                className={`rounded-2xl border p-4 space-y-3 ${
                  isLight ? 'bg-white border-zinc-200' : 'bg-[#151520] border-white/10'
                }`}
              >
                <h4 className="text-sm font-black">Customer Support & Refund Disputes ({serverSupportTickets.length})</h4>
                {serverSupportTickets.length === 0 ? (
                  <p className="text-xs opacity-60">No open support tickets.</p>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {serverSupportTickets.map((st: any) => (
                      <div key={st.id} className="p-3 rounded-xl bg-zinc-50 dark:bg-white/5 text-xs space-y-1">
                        <div className="flex items-center justify-between font-bold">
                          <span>{st.id} · Booking {st.passCode || st.bookingId}</span>
                          <span className="uppercase text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-600">
                            {st.status}
                          </span>
                        </div>
                        <p className="opacity-80">{st.description}</p>
                        {st.status !== 'resolved' && (userRole === 'admin' || userRole === 'provider') && (
                          <button
                            type="button"
                            onClick={async () => {
                              await resolveMovieSupportTicket({
                                ticketId: st.id,
                                status: 'resolved',
                                resolutionNote: 'Verified refund & seat unlock completed by Cinema Desk.',
                              });
                              void refreshMoviesInventory();
                              triggerDistrictToast(`Resolved support ticket ${st.id}`);
                            }}
                            className="mt-1 px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[10px] font-black cursor-pointer"
                          >
                            Mark Resolved
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div
                className={`rounded-2xl border p-4 space-y-3 ${
                  isLight ? 'bg-white border-zinc-200' : 'bg-[#151520] border-white/10'
                }`}
              >
                <h4 className="text-sm font-black">Authoritative Security & Settlement Audit Logs ({serverAuditLogs.length})</h4>
                <div className="space-y-1.5 max-h-60 overflow-y-auto font-mono text-[11px]">
                  {serverAuditLogs.slice(0, 15).map((log: any) => (
                    <div key={log.id} className="p-2 rounded-lg bg-zinc-50 dark:bg-white/5 flex justify-between gap-2">
                      <span className="font-bold text-[#E23744]">{log.action}</span>
                      <span className="truncate opacity-80">{log.targetId}</span>
                      <span className="opacity-50 shrink-0">
                        {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* =====================================================================
                3. "NOW SHOWING" SECTION + DISTRICT STICKY FILTER PILLS BAR
               ===================================================================== */}
            <div id="district-now-showing-anchor" className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
                <div>
                  <h2 className="text-xl sm:text-2xl font-black tracking-tight">
                    Now Showing in {selectedCityArea === 'All Hyderabad' ? activeAreaName || 'Hyderabad' : selectedCityArea}
                  </h2>
                  <p className={`text-xs ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                    Official multiplex showtimes, 5-min atomic seat locks, verified UPI settlement, and single-use QR entry
                  </p>
                </div>
                <span className={`text-xs font-bold ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                  Showing {filteredMovies.length} of {movieListings.length} Releases
                </span>
              </div>

              {/* District.in Signature Filter Bar */}
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
                <button
                  type="button"
                  onClick={() => setIsFilterModalOpen(true)}
                  className={`px-3.5 py-2 rounded-xl border text-xs font-bold flex items-center gap-2 shrink-0 transition cursor-pointer ${
                    activeFilterCount > 0
                      ? 'bg-zinc-950 text-white border-zinc-950 dark:bg-white dark:text-zinc-950'
                      : isLight
                      ? 'bg-white border-zinc-300 text-zinc-800 hover:border-zinc-400'
                      : 'bg-[#151520] border-white/15 text-zinc-200 hover:border-white/30'
                  }`}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>Filters</span>
                  {activeFilterCount > 0 && (
                    <span className="w-4 h-4 rounded-full bg-[#E23744] text-white text-[10px] font-black flex items-center justify-center">
                      {activeFilterCount}
                    </span>
                  )}
                </button>

                <div className={`h-5 w-px shrink-0 ${isLight ? 'bg-zinc-200' : 'bg-white/10'}`} />

                {(['all', 'Telugu', 'Hindi', 'English', 'Pan-India'] as LanguageFilter[]).map((lang) => {
                  const active = selectedLang === lang;
                  return (
                    <button
                      key={lang}
                      type="button"
                      onClick={() => setSelectedLang(active && lang !== 'all' ? 'all' : lang)}
                      className={`px-3.5 py-2 rounded-xl border text-xs font-bold shrink-0 transition cursor-pointer ${
                        active
                          ? isLight
                            ? 'bg-zinc-950 text-white border-zinc-950'
                            : 'bg-[#E23744] text-white border-[#E23744]'
                          : isLight
                          ? 'bg-white border-zinc-200 text-zinc-700 hover:border-zinc-400'
                          : 'bg-[#151520] border-white/10 text-zinc-300 hover:border-white/25'
                      }`}
                    >
                      {lang === 'all' ? 'All Languages' : lang}
                    </button>
                  );
                })}

                <div className={`h-5 w-px shrink-0 ${isLight ? 'bg-zinc-200' : 'bg-white/10'}`} />

                {(['4K Laser', 'Dolby Atmos', 'PCX / IMAX', 'VIP Recliner'] as FormatFilter[]).map((fmt) => {
                  const active = selectedFormat === fmt;
                  return (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => setSelectedFormat(active ? 'all' : fmt)}
                      className={`px-3.5 py-2 rounded-xl border text-xs font-bold shrink-0 transition cursor-pointer ${
                        active
                          ? 'bg-[#E23744] text-white border-[#E23744]'
                          : isLight
                          ? 'bg-white border-zinc-200 text-zinc-700 hover:border-zinc-400'
                          : 'bg-[#151520] border-white/10 text-zinc-300 hover:border-white/25'
                      }`}
                    >
                      {fmt}
                    </button>
                  );
                })}

                {activeFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={resetAllDistrictFilters}
                    className="px-3 py-2 text-xs font-bold text-[#E23744] hover:underline shrink-0 cursor-pointer"
                  >
                    Reset
                  </button>
                )}
              </div>

              {/* 4-to-5 Column District.in Vertical Movie Poster Grid */}
              {filteredMovies.length === 0 ? (
                <div
                  className={`rounded-3xl p-10 text-center border space-y-3 ${
                    isLight ? 'bg-white border-zinc-200' : 'bg-[#151520] border-white/10'
                  }`}
                >
                  <Film className="w-10 h-10 text-[#E23744] mx-auto" />
                  <h3 className="text-base font-black">No movies match your selected filters</h3>
                  <button
                    type="button"
                    onClick={resetAllDistrictFilters}
                    className="px-4 py-2 rounded-xl bg-[#E23744] text-white text-xs font-black cursor-pointer"
                  >
                    Clear All Filters
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-5">
                  {filteredMovies.map((movie) => {
                    const title = getListingTitle(movie, currentLang);
                    const meta = getMovieMeta(movie);
                    const timings = parseShowTimings(movie);
                    const isFav = favoriteIds.includes(movie.id) || Boolean(favoritedMap[movie.id]);

                    return (
                      <div
                        key={movie.id}
                        data-testid={`movie-card-${movie.id}`}
                        onClick={() => openDistrictBooking(movie, timings[0] || '07:55 PM', 'seats')}
                        className={`group rounded-2xl overflow-hidden border flex flex-col justify-between transition-all duration-200 hover:-translate-y-1 cursor-pointer ${
                          isLight
                            ? 'bg-white border-zinc-200/90 hover:border-zinc-300 hover:shadow-lg'
                            : 'bg-[#151520] border-white/10 hover:border-white/25'
                        }`}
                      >
                        <div className="relative aspect-[3/4] w-full bg-zinc-900 overflow-hidden">
                          <img
                            src={movie.images[0]}
                            alt={title}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent" />

                          {/* Trailer Play Trigger */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setTrailerModalMovie(movie);
                              setIsTrailerPlaying(true);
                            }}
                            className="absolute top-2.5 left-2.5 px-2 py-1 rounded-full bg-black/60 backdrop-blur-xs text-white text-[10px] font-bold flex items-center gap-1 hover:bg-[#E23744] transition cursor-pointer"
                          >
                            <Play className="w-2.5 h-2.5 fill-white" />
                            <span>Trailer</span>
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const nextAdded = toggleFavorite(movie.id);
                              setFavoritedMap((prev) => ({ ...prev, [movie.id]: nextAdded }));
                              triggerDistrictToast(
                                nextAdded ? `❤️ Saved "${title}" to Watchlist` : `Removed "${title}" from Watchlist`
                              );
                            }}
                            className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-black/50 backdrop-blur-xs text-white flex items-center justify-center hover:bg-black/75 transition cursor-pointer"
                            aria-label="Save to watchlist"
                          >
                            <Heart
                              className={`w-4 h-4 ${isFav ? 'fill-[#E23744] text-[#E23744]' : 'text-white'}`}
                            />
                          </button>

                          <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between text-[11px] font-bold text-white">
                            <span className="inline-flex items-center gap-1">
                              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                              <span>{movie.providerRating}</span>
                            </span>
                            <span className="text-zinc-300 text-[10px]">{movie.reviewCount} votes</span>
                          </div>
                        </div>

                        <div className="p-3.5 flex-1 flex flex-col justify-between space-y-3">
                          <div className="space-y-1">
                            <h3
                              onClick={(e) => {
                                e.stopPropagation();
                                setTrailerModalMovie(movie);
                              }}
                              className={`text-sm font-black line-clamp-1 group-hover:text-[#E23744] hover:underline ${
                                isLight ? 'text-zinc-950' : 'text-white'
                              }`}
                            >
                              {title}
                            </h3>
                            <p
                              className={`text-[11px] font-medium truncate ${
                                isLight ? 'text-zinc-500' : 'text-zinc-400'
                              }`}
                            >
                              {meta.cert} · {meta.langRaw}
                            </p>
                            <p
                              className={`text-[11px] font-semibold truncate ${
                                isLight ? 'text-zinc-600' : 'text-zinc-300'
                              }`}
                            >
                              {localizeAreaName(movie.location.area, currentLang)} · ₹{movie.price}
                            </p>
                          </div>

                          <div
                            className="grid grid-cols-2 gap-1.5 pt-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => setTrailerModalMovie(movie)}
                              className={`py-1.5 px-2 rounded-xl font-bold text-[11px] flex items-center justify-center gap-1 transition cursor-pointer ${
                                isLight
                                  ? 'bg-zinc-100 hover:bg-zinc-200 text-zinc-800'
                                  : 'bg-white/10 hover:bg-white/20 text-white'
                              }`}
                            >
                              <Play className="w-3 h-3 shrink-0" />
                              <span className="truncate">Details</span>
                            </button>

                            <button
                              type="button"
                              data-testid={`book-movie-btn-${movie.id}`}
                              onClick={() => openDistrictBooking(movie, timings[0] || '07:55 PM', 'seats')}
                              className="py-1.5 px-2 rounded-xl bg-[#E23744] hover:bg-[#c92d39] text-white font-black text-[11px] flex items-center justify-center gap-1 transition cursor-pointer"
                            >
                              <Ticket className="w-3 h-3 shrink-0" />
                              <span className="truncate">Book</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* =====================================================================
                4. "UPCOMING MOVIES & ADVANCE BOOKING" HORIZONTAL RAIL
               ===================================================================== */}
            <div className="space-y-4 pt-4 border-t border-zinc-200/60 dark:border-white/10">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl sm:text-2xl font-black tracking-tight">
                    Upcoming Movies & Early Premieres
                  </h2>
                  <p className={`text-xs ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                    Mark "Interested" to get notified when advance fan-show bookings open
                  </p>
                </div>
              </div>

              <div className="flex items-stretch gap-4 overflow-x-auto no-scrollbar pb-2">
                {upcomingReleases.map(({ listing, posterImage, releaseBadge, baseInterested }) => {
                  const title = getListingTitle(listing, currentLang);
                  const isInterested = Boolean(interestedMap[listing.id]);
                  const interestedCount = isInterested ? baseInterested + 1 : baseInterested;

                  return (
                    <div
                      key={`upcoming-${listing.id}`}
                      className={`w-60 sm:w-64 shrink-0 rounded-2xl overflow-hidden border flex flex-col justify-between transition ${
                        isLight
                          ? 'bg-white border-zinc-200/90 shadow-xs'
                          : 'bg-[#151520] border-white/10'
                      }`}
                    >
                      <div
                        onClick={() => setTrailerModalMovie(listing)}
                        className="relative aspect-[16/10] w-full bg-zinc-900 overflow-hidden cursor-pointer group"
                      >
                        <img
                          src={posterImage}
                          alt={title}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent" />
                        <span className="absolute bottom-2.5 left-2.5 text-[10px] font-black uppercase tracking-wider bg-black/75 text-amber-300 px-2.5 py-1 rounded-lg">
                          {releaseBadge}
                        </span>
                      </div>

                      <div className="p-3.5 flex-1 flex flex-col justify-between space-y-3">
                        <div>
                          <h4
                            onClick={() => setTrailerModalMovie(listing)}
                            className="text-xs sm:text-sm font-black line-clamp-1 hover:text-[#E23744] cursor-pointer"
                          >
                            {title}
                          </h4>
                          <p className={`text-[11px] mt-0.5 ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                            {interestedCount.toLocaleString('en-IN')} people interested
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setInterestedMap((prev) => ({
                                ...prev,
                                [listing.id]: !prev[listing.id],
                              }));
                              triggerDistrictToast(
                                !isInterested
                                  ? `🔔 You'll be notified for "${title}"!`
                                  : `Removed notification for "${title}"`
                              );
                            }}
                            className={`flex-1 py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                              isInterested
                                ? 'bg-emerald-600 text-white border-emerald-600'
                                : isLight
                                ? 'bg-zinc-50 hover:bg-zinc-100 text-zinc-800 border-zinc-200'
                                : 'bg-white/5 hover:bg-white/10 text-zinc-200 border-white/10'
                            }`}
                          >
                            <Bell className="w-3.5 h-3.5" />
                            <span>{isInterested ? 'Interested ✓' : 'Interested'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => openDistrictBooking(listing, '07:55 PM', 'seats')}
                            className="py-2 px-3 rounded-xl bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 text-xs font-black cursor-pointer"
                          >
                            Pre-Book
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* =====================================================================
                5. INTERACTIVE 7-DAY DATE STRIP & CINEMAS SHOWTIME DIRECTORY
               ===================================================================== */}
            <div className="space-y-5 pt-4 border-t border-zinc-200/60 dark:border-white/10">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl sm:text-2xl font-black flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-[#E23744]" />
                    <span>
                      Cinemas & Live Showtimes in {selectedCityArea === 'All Hyderabad' ? activeAreaName || 'Hyderabad' : selectedCityArea} (
                      {dateStrip[selectedDateOffset].dayLabel})
                    </span>
                  </h2>
                  <p className={`text-xs ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                    Tap any date and showtime slot below to open the live auditorium seat map
                  </p>
                </div>

                <div className="flex items-center gap-4 text-xs font-semibold">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    <span>Available</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                    <span>Fast Filling</span>
                  </span>
                </div>
              </div>

              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
                  {dateStrip.map((d) => {
                    const isSelected = d.offset === selectedDateOffset;
                    return (
                      <button
                        key={d.iso}
                        type="button"
                        onClick={() => setSelectedDateOffset(d.offset)}
                        className={`px-4 py-2 rounded-2xl border text-center transition shrink-0 cursor-pointer ${
                          isSelected
                            ? 'bg-[#E23744] text-white border-[#E23744] shadow-md'
                            : isLight
                            ? 'bg-white text-zinc-800 border-zinc-200 hover:border-zinc-400'
                            : 'bg-[#151520] text-zinc-300 border-white/10 hover:border-white/30'
                        }`}
                      >
                        <div className="text-[10px] font-bold uppercase opacity-80">{d.dayLabel}</div>
                        <div className="text-base font-black leading-tight tabular-nums">{d.dateNum}</div>
                        <div className="text-[10px] font-semibold opacity-75">{d.monthLabel}</div>
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                  {(
                    [
                      { id: 'all', label: 'All Times' },
                      { id: 'morning', label: 'Morning' },
                      { id: 'afternoon', label: 'Afternoon' },
                      { id: 'evening', label: 'Evening' },
                      { id: 'night', label: 'Night' },
                    ] as { id: ShowtimeSlotFilter; label: string }[]
                  ).map((slot) => (
                    <button
                      key={slot.id}
                      type="button"
                      onClick={() => setSelectedSlotFilter(slot.id)}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-bold shrink-0 transition cursor-pointer ${
                        selectedSlotFilter === slot.id
                          ? isLight
                            ? 'bg-zinc-950 text-white border-zinc-950'
                            : 'bg-white text-zinc-950 border-white'
                          : isLight
                          ? 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400'
                          : 'bg-[#151520] text-zinc-400 border-white/10 hover:text-white'
                      }`}
                    >
                      {slot.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                {filteredMovies.map((cinema, cIdx) => {
                  const allTimings = parseShowTimings(cinema);
                  const filteredTimings = allTimings.filter((t) => {
                    if (selectedSlotFilter === 'all') return true;
                    const isAM = t.toUpperCase().includes('AM');
                    const hour = parseInt(t.split(':')[0], 10) || 12;
                    if (selectedSlotFilter === 'morning') return isAM;
                    if (selectedSlotFilter === 'afternoon') return !isAM && (hour === 12 || hour < 4);
                    if (selectedSlotFilter === 'evening') return !isAM && hour >= 4 && hour < 8;
                    if (selectedSlotFilter === 'night') return !isAM && hour >= 8 && hour !== 12;
                    return true;
                  });
                  const timingsToShow = filteredTimings.length > 0 ? filteredTimings : allTimings;
                  const title = getListingTitle(cinema, currentLang);
                  const meta = getMovieMeta(cinema);

                  return (
                    <div
                      key={`showtime-${cinema.id}`}
                      className={`p-4 sm:p-5 rounded-2xl border flex flex-col lg:flex-row lg:items-center justify-between gap-4 transition ${
                        isLight
                          ? 'bg-white border-zinc-200/90 hover:border-zinc-300 shadow-2xs'
                          : 'bg-[#151520] border-white/10 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-start gap-3.5 max-w-xl">
                        <img
                          src={cinema.images[0]}
                          alt={title}
                          referrerPolicy="no-referrer"
                          onClick={() => setTrailerModalMovie(cinema)}
                          className="w-16 h-20 rounded-xl object-cover shrink-0 cursor-pointer border border-black/10"
                        />
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4
                              onClick={() => setTrailerModalMovie(cinema)}
                              className="text-sm sm:text-base font-black hover:text-[#E23744] hover:underline cursor-pointer"
                            >
                              {title}
                            </h4>
                            {cinema.isVerified && (
                              <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                            )}
                          </div>
                          <div
                            className={`text-xs flex flex-wrap items-center gap-2 ${
                              isLight ? 'text-zinc-500' : 'text-zinc-400'
                            }`}
                          >
                            <span>{cinema.providerName}</span>
                            <span aria-hidden="true">·</span>
                            <span>{localizeAreaName(cinema.location.area, currentLang)}</span>
                            <span aria-hidden="true">·</span>
                            <span>{meta.soundRaw}</span>
                          </div>
                          <div className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 flex flex-wrap items-center gap-2 pt-0.5">
                            <span>✓ {meta.cancellationPolicy}</span>
                            <span aria-hidden="true">·</span>
                            <span>♿ Wheelchair Seats</span>
                            <span aria-hidden="true">·</span>
                            <button
                              type="button"
                              onClick={() => onSelectListing(cinema)}
                              className="text-[#E23744] hover:underline font-bold cursor-pointer"
                            >
                              Auditorium Photos
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2.5">
                        {timingsToShow.map((slot, sIdx) => {
                          const isFastFilling = (cIdx + sIdx) % 3 === 1;
                          return (
                            <button
                              key={slot}
                              type="button"
                              onClick={() => openDistrictBooking(cinema, slot, 'seats')}
                              className={`px-4 py-2 rounded-xl border text-left transition cursor-pointer ${
                                isFastFilling
                                  ? isLight
                                    ? 'bg-amber-50 border-amber-300 hover:bg-amber-100 text-amber-900'
                                    : 'bg-amber-500/10 border-amber-500/40 hover:bg-amber-500/20 text-amber-300'
                                  : isLight
                                  ? 'bg-emerald-50/70 border-emerald-300 hover:bg-emerald-100 text-emerald-900'
                                  : 'bg-emerald-500/10 border-emerald-500/40 hover:bg-emerald-500/20 text-emerald-300'
                              }`}
                            >
                              <div className="text-xs font-black tabular-nums">{slot}</div>
                              <div className="text-[9px] font-bold uppercase tracking-wider opacity-75">
                                {sIdx % 2 === 0 ? '4K ATMOS' : 'VIP RECLINER'}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>

      {/* =====================================================================
          6. MOVIE DETAILS & INTERACTIVE 4K TRAILER PLAYER MODAL
         ===================================================================== */}
      {trailerModalMovie && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setTrailerModalMovie(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl rounded-3xl bg-[#12121A] text-white border border-white/15 overflow-hidden shadow-2xl space-y-5 p-5 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-[#E23744]">
                  OFFICIAL 4K TRAILER & SYNOPSIS
                </span>
                <h3 className="text-lg font-black">{getListingTitle(trailerModalMovie, currentLang)}</h3>
              </div>
              <button
                type="button"
                onClick={() => setTrailerModalMovie(null)}
                className="p-2 rounded-full bg-white/10 hover:bg-white/20 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Interactive Trailer Player Viewport */}
            <div className="relative aspect-video rounded-2xl overflow-hidden bg-black border border-white/15">
              <img
                src={trailerModalMovie.images[0]}
                alt={trailerModalMovie.title}
                referrerPolicy="no-referrer"
                className={`w-full h-full object-cover transition-transform duration-700 ${
                  isTrailerPlaying ? 'scale-105 opacity-75' : 'scale-100 opacity-50'
                }`}
              />
              <canvas
                ref={trailerCanvasRef}
                width={640}
                height={360}
                className="absolute inset-0 w-full h-full pointer-events-none"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />

              <div className="absolute bottom-3 left-4 right-4 space-y-2">
                <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#E23744] transition-all duration-300"
                    style={{ width: `${trailerProgress}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setIsTrailerPlaying((p) => !p)}
                      className="px-3 py-1 rounded-lg bg-white/15 hover:bg-white/25 font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      {isTrailerPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                      <span>{isTrailerPlaying ? 'Pause' : 'Play'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsTrailerMuted((m) => !m)}
                      className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 cursor-pointer"
                    >
                      {isTrailerMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    </button>
                    <span className="font-mono text-[11px] text-zinc-300">
                      0:{String(Math.floor((trailerProgress * 145) / 100) % 60).padStart(2, '0')} / 2:25 · 4K Dolby Atmos
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-[#E23744] text-[10px] font-black">
                    {getMovieMeta(trailerModalMovie).cert}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-zinc-300 leading-relaxed">{trailerModalMovie.description}</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-2">
                <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                  <span className="text-zinc-400 block">Multiplex / Venue</span>
                  <span className="font-black text-white">{trailerModalMovie.providerName}</span>
                </div>
                <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                  <span className="text-zinc-400 block">Audio & Projection</span>
                  <span className="font-black text-white">{getMovieMeta(trailerModalMovie).soundRaw}</span>
                </div>
                <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                  <span className="text-zinc-400 block">Cancellation Policy</span>
                  <span className="font-black text-emerald-400">
                    {getMovieMeta(trailerModalMovie).cancellationPolicy}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => {
                  const target = trailerModalMovie;
                  setTrailerModalMovie(null);
                  openDistrictBooking(target, parseShowTimings(target)[0] || '07:55 PM', 'seats');
                }}
                className="px-6 py-3 rounded-2xl bg-[#E23744] hover:bg-[#c92d39] text-white text-xs font-black flex items-center gap-2 cursor-pointer"
              >
                <Ticket className="w-4 h-4" />
                <span>Select Date, Showtime & Seats</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          7. FULL FILTER MODAL
         ===================================================================== */}
      {isFilterModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setIsFilterModalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-lg rounded-3xl border overflow-hidden shadow-2xl p-6 space-y-5 ${
              isLight ? 'bg-white text-zinc-900 border-zinc-200' : 'bg-[#12121A] text-white border-white/15'
            }`}
          >
            <div className="flex items-center justify-between border-b pb-3 border-zinc-200 dark:border-white/10">
              <h3 className="text-lg font-black">Filter Movies & Cinemas</h3>
              <button
                type="button"
                onClick={() => setIsFilterModalOpen(false)}
                className="p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-white/10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-wider opacity-70">Language</label>
                <div className="flex flex-wrap gap-2">
                  {(['all', 'Telugu', 'Hindi', 'English', 'Pan-India'] as LanguageFilter[]).map((l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => setSelectedLang(l)}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border cursor-pointer ${
                        selectedLang === l
                          ? 'bg-[#E23744] text-white border-[#E23744]'
                          : 'border-zinc-200 dark:border-white/15'
                      }`}
                    >
                      {l === 'all' ? 'All Languages' : l}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-wider opacity-70">Format</label>
                <div className="flex flex-wrap gap-2">
                  {(['all', '2D', '4K Laser', 'Dolby Atmos', 'PCX / IMAX', 'VIP Recliner'] as FormatFilter[]).map(
                    (f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setSelectedFormat(f)}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border cursor-pointer ${
                          selectedFormat === f
                            ? 'bg-[#E23744] text-white border-[#E23744]'
                            : 'border-zinc-200 dark:border-white/15'
                        }`}
                      >
                        {f === 'all' ? 'All Formats' : f}
                      </button>
                    )
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-wider opacity-70">Sort By</label>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      { id: 'popularity', label: 'Popularity' },
                      { id: 'rating', label: 'Top Rated' },
                      { id: 'price_low', label: 'Price: Low to High' },
                      { id: 'price_high', label: 'Price: High to Low' },
                    ] as { id: SortOption; label: string }[]
                  ).map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSortBy(s.id)}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border cursor-pointer ${
                        sortBy === s.id
                          ? 'bg-zinc-950 text-white border-zinc-950 dark:bg-white dark:text-zinc-950'
                          : 'border-zinc-200 dark:border-white/15'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-zinc-200 dark:border-white/10">
              <button
                type="button"
                onClick={resetAllDistrictFilters}
                className="text-xs font-bold text-[#E23744] hover:underline cursor-pointer"
              >
                Clear All
              </button>
              <button
                type="button"
                onClick={() => setIsFilterModalOpen(false)}
                className="px-6 py-2.5 rounded-xl bg-[#E23744] text-white text-xs font-black cursor-pointer"
              >
                Apply Filters ({filteredMovies.length} Results)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          8. END-TO-END 5-STEP DISTRICT TICKETING MODAL:
             Step 1: Showtimes -> Step 2: Live Seat Map & 5-Min Atomic Hold ->
             Step 3: F&B, Taxes & Promo Offers -> Step 4: Google Login + Verified UPI ->
             Step 5: Signed Single-Use QR Ticket
         ===================================================================== */}
      {bookingModalListing && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4"
          onClick={() => setBookingModalListing(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            data-testid="district-booking-modal"
            className="w-full max-w-2xl bg-[#12121A] text-white border border-white/15 rounded-3xl overflow-hidden shadow-2xl space-y-4 p-4 sm:p-6 max-h-[94vh] overflow-y-auto"
          >
            {/* Modal Top Header */}
            <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-3">
              <div className="flex items-center gap-3">
                <img
                  src={bookingModalListing.images[0]}
                  alt={getListingTitle(bookingModalListing, currentLang)}
                  referrerPolicy="no-referrer"
                  className="w-12 h-16 rounded-xl object-cover border border-white/15 shrink-0"
                />
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <BOSBrandLogo compact verifiedLabel="TICKETING" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#E23744]">
                      BOOKOURSPACE OFFICIAL TICKETING
                    </span>
                    {holdRemainingSeconds > 0 && (
                      <span
                        data-testid="seat-hold-countdown"
                        className="px-2 py-0.5 rounded-md bg-amber-500/20 border border-amber-400/40 text-amber-300 text-[10px] font-mono font-black flex items-center gap-1"
                      >
                        <Lock className="w-3 h-3" />
                        <span>Hold Active: {formatHoldCountdown(holdRemainingSeconds)}</span>
                      </span>
                    )}
                  </div>
                  <h3 className="text-base sm:text-lg font-black text-white">
                    {getListingTitle(bookingModalListing, currentLang)}
                  </h3>
                  <p className="text-xs text-zinc-400">
                    {bookingModalListing.providerName} ({localizeAreaName(bookingModalListing.location.area, currentLang)}) ·{' '}
                    {dateStrip[selectedDateOffset].fullLabel} · {selectedShowtime}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setBookingModalListing(null)}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/15 text-zinc-300 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Step Navigation Tabs */}
            <div className="flex items-center gap-1 bg-white/5 p-1 rounded-2xl border border-white/10 overflow-x-auto no-scrollbar">
              {[
                { id: 'showtimes', label: '1. Showtime' },
                { id: 'seats', label: `2. Seats (${selectedSeats.length})` },
                { id: 'fnb', label: '3. F&B & Offers' },
                { id: 'payment', label: '4. UPI & Auth' },
                ...(activeMTicket ? [{ id: 'mticket', label: '5. Signed QR' }] : []),
              ].map((st) => (
                <button
                  key={st.id}
                  type="button"
                  data-testid={`booking-step-tab-${st.id}`}
                  onClick={() => setBookingStep(st.id as any)}
                  className={`flex-1 py-2 px-2.5 rounded-xl text-[11px] font-bold transition whitespace-nowrap cursor-pointer ${
                    bookingStep === st.id
                      ? 'bg-[#E23744] text-white'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>

            {/* STEP 1: DATE, SCREEN & SHOWTIME PICKER */}
            {bookingStep === 'showtimes' && (
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-400">Select Date</label>
                  <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                    {dateStrip.map((d) => (
                      <button
                        key={d.iso}
                        type="button"
                        onClick={() => setSelectedDateOffset(d.offset)}
                        className={`px-3.5 py-2 rounded-xl border text-center shrink-0 cursor-pointer ${
                          selectedDateOffset === d.offset
                            ? 'bg-[#E23744] text-white border-[#E23744]'
                            : 'bg-white/5 text-zinc-300 border-white/10'
                        }`}
                      >
                        <div className="text-[10px] font-bold">{d.dayLabel}</div>
                        <div className="text-sm font-black">{d.dateNum}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-400">
                    Select Showtime ({activeScreenConfig?.screenName || 'Screen 1 · Dolby Atmos'})
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {parseShowTimings(bookingModalListing).map((slot) => (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => {
                          setSelectedShowtime(slot);
                          setBookingStep('seats');
                        }}
                        className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                          selectedShowtime === slot
                            ? 'bg-[#E23744] text-white border-[#E23744]'
                            : 'bg-white/5 hover:bg-white/10 text-emerald-300 border-white/15'
                        }`}
                      >
                        <div className="text-xs font-black">{slot}</div>
                        <div className="text-[10px] opacity-80">{selectedScreenFormat}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 flex items-center justify-between">
                  <span>✓ Cinema Cancellation Policy: {getMovieMeta(bookingModalListing).cancellationPolicy}</span>
                </div>
              </div>
            )}

            {/* STEP 2: LIVE AUDITORIUM SEAT MAP & 5-MINUTE ATOMIC HOLD */}
            {bookingStep === 'seats' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                    {parseShowTimings(bookingModalListing).map((slot) => (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => setSelectedShowtime(slot)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer shrink-0 ${
                          selectedShowtime === slot
                            ? 'bg-[#E23744] text-white'
                            : 'bg-white/5 text-zinc-300 hover:bg-white/10'
                        }`}
                      >
                        {slot}
                      </button>
                    ))}
                  </div>
                  <span className="text-[11px] text-emerald-400 font-bold">
                    {getMovieMeta(bookingModalListing).cancellationPolicy}
                  </span>
                </div>

                {/* Curved Cinema Screen */}
                <div className="pt-2 text-center space-y-1">
                  <div className="mx-auto w-3/4 h-2 rounded-t-full bg-gradient-to-r from-transparent via-cyan-400/80 to-transparent shadow-[0_-6px_16px_rgba(34,211,238,0.45)]" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                    All Eyes This Way — {activeScreenConfig?.screenName || selectedScreenFormat}
                  </span>
                </div>

                {/* Seat Tiers */}
                <div className="space-y-4 py-1 overflow-x-auto">
                  {SEAT_TIERS.map((tier) => {
                    const customTier = activeScreenConfig?.tiers.find((t) =>
                      t.rows.some((r) => tier.rows.includes(r))
                    );
                    const tierPrice =
                      customTier?.price ||
                      Math.round((bookingModalListing.price || 250) * tier.priceMultiplier);
                    return (
                      <div key={tier.id} className="space-y-2 min-w-[300px]">
                        <div className="flex items-center justify-between text-xs text-zinc-400 border-b border-white/5 pb-1">
                          <span className="font-bold text-zinc-200">{customTier?.name || tier.name}</span>
                          <span className="font-black text-white">₹{tierPrice}</span>
                        </div>

                        <div className="space-y-1.5">
                          {tier.rows.map((row) => (
                            <div key={row} className="flex items-center justify-center gap-1 sm:gap-1.5">
                              <span className="w-4 text-[10px] font-bold text-zinc-500 text-right mr-1">
                                {row}
                              </span>
                              {Array.from({ length: tier.seatsPerRow }, (_, idx) => {
                                const seatNum = idx + 1;
                                const seatId = `${row}${seatNum}`;
                                const isBooked = lockedSeatsForActiveShow.has(seatId);
                                const isSelected = selectedSeats.includes(seatId);
                                const isWheelchair = WHEELCHAIR_SEATS.has(seatId);
                                const isGap = idx === Math.floor(tier.seatsPerRow / 2) - 1;

                                return (
                                  <React.Fragment key={seatId}>
                                    <button
                                      type="button"
                                      data-testid={`seat-btn-${seatId}`}
                                      disabled={isBooked}
                                      onClick={() => toggleSeat(seatId)}
                                      title={isWheelchair ? `Wheelchair Accessible Seat ${seatId}` : `Seat ${seatId}`}
                                      className={`w-6 h-6 sm:w-7 sm:h-7 rounded-t-lg text-[10px] font-black transition flex items-center justify-center ${
                                        isBooked
                                          ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed border border-white/5'
                                          : isSelected
                                          ? 'bg-[#E23744] text-white shadow-md scale-105 cursor-pointer'
                                          : isWheelchair
                                          ? 'bg-sky-500/20 hover:bg-sky-500/35 text-sky-300 border border-sky-400/50 cursor-pointer'
                                          : 'bg-white/10 hover:bg-white/20 text-zinc-200 border border-white/15 cursor-pointer'
                                      }`}
                                    >
                                      {isWheelchair ? '♿' : seatNum}
                                    </button>
                                    {isGap && <span className="w-2 sm:w-3" />}
                                  </React.Fragment>
                                );
                              })}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Seat Legend */}
                <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-zinc-400 pt-2">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3.5 h-3.5 rounded-xs bg-white/10 border border-white/20" />
                    <span>Available</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3.5 h-3.5 rounded-xs bg-[#E23744]" />
                    <span>Selected</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3.5 h-3.5 rounded-xs bg-zinc-800" />
                    <span>Sold / Locked</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3.5 h-3.5 rounded-xs bg-sky-500/20 border border-sky-400/50 text-[9px] flex items-center justify-center text-sky-300">
                      ♿
                    </span>
                    <span>Wheelchair (A1, A8)</span>
                  </span>
                </div>
              </div>
            )}

            {/* STEP 3: POPCORN & F&B COMBOS + PRICE / GST / CONVENIENCE FEE / OFFERS */}
            {bookingStep === 'fnb' && (
              <div className="space-y-4 py-1">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-black flex items-center gap-1.5">
                      <Popcorn className="w-4 h-4 text-amber-400" />
                      <span>Pre-Book Popcorn & Seat-Delivered Snacks</span>
                    </h4>
                    <p className="text-xs text-zinc-400">
                      Skip interval queues — delivered straight to seats {selectedSeats.join(', ')}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {FOOD_ADDONS.map((fnb) => {
                    const qty = selectedFoodQtys[fnb.id] || 0;
                    return (
                      <div
                        key={fnb.id}
                        className="p-3.5 rounded-2xl bg-white/5 border border-white/10 flex flex-col justify-between gap-3"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-xs border border-emerald-400 flex items-center justify-center">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            </span>
                            <span className="text-xs font-black text-white">{fnb.name}</span>
                          </div>
                          <p className="text-[11px] text-zinc-400">{fnb.desc}</p>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-white/5">
                          <span className="text-xs font-black text-amber-400">₹{fnb.price}</span>
                          {qty === 0 ? (
                            <button
                              type="button"
                              onClick={() => updateFoodQty(fnb.id, 1)}
                              className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-bold cursor-pointer"
                            >
                              + Add
                            </button>
                          ) : (
                            <div className="flex items-center gap-2 bg-[#E23744] rounded-lg px-2 py-0.5 text-xs font-black">
                              <button
                                type="button"
                                onClick={() => updateFoodQty(fnb.id, -1)}
                                className="px-1 cursor-pointer"
                              >
                                -
                              </button>
                              <span>{qty}</span>
                              <button
                                type="button"
                                onClick={() => updateFoodQty(fnb.id, 1)}
                                className="px-1 cursor-pointer"
                              >
                                +
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Promo Offers & Transparent Price Breakdown */}
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black flex items-center gap-1.5 text-amber-300">
                      <Tag className="w-3.5 h-3.5" />
                      <span>Apply BookOurSpace Cinema Promo Offer</span>
                    </span>
                    {selectedPromoCode && (
                      <button
                        type="button"
                        onClick={() => setSelectedPromoCode('')}
                        className="text-[11px] font-bold text-rose-400 cursor-pointer"
                      >
                        Remove ({selectedPromoCode})
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {PROMO_OFFERS.map((off) => {
                      const isApplied = selectedPromoCode === off.code;
                      return (
                        <button
                          key={off.code}
                          type="button"
                          data-testid={`apply-promo-${off.code}`}
                          onClick={() => setSelectedPromoCode(isApplied ? '' : off.code)}
                          className={`px-3 py-1.5 rounded-xl border text-left transition cursor-pointer ${
                            isApplied
                              ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                              : 'bg-black/30 border-white/15 text-zinc-300 hover:border-white/30'
                          }`}
                        >
                          <div className="text-[11px] font-black font-mono">{off.code}</div>
                          <div className="text-[10px] opacity-80">{off.label}</div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Itemized Invoice Breakdown */}
                  <div className="pt-2 border-t border-white/10 space-y-1 text-xs">
                    <div className="flex justify-between text-zinc-300">
                      <span>Base Ticket Price ({selectedSeats.length} Seats: {selectedSeats.join(', ')})</span>
                      <span className="font-bold">₹{seatSubtotal}</span>
                    </div>
                    {foodSubtotal > 0 && (
                      <div className="flex justify-between text-zinc-300">
                        <span>Food & Beverage Combos</span>
                        <span className="font-bold">₹{foodSubtotal}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-zinc-400">
                      <span>Cinema Convenience Fee (₹{activeScreenConfig?.convenienceFeePerSeat ?? 28}/seat)</span>
                      <span>₹{convenienceFeeTotal}</span>
                    </div>
                    <div className="flex justify-between text-zinc-400">
                      <span>Integrated GST ({activeScreenConfig?.gstPercent ?? 18}% on convenience & F&B)</span>
                      <span>₹{gstTaxAmount}</span>
                    </div>
                    {promoDiscountAmount > 0 && (
                      <div className="flex justify-between text-emerald-400 font-bold">
                        <span>Promo Discount ({selectedPromoCode})</span>
                        <span>-₹{promoDiscountAmount}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm font-black text-white pt-1.5 border-t border-white/10">
                      <span>Net Payable Total</span>
                      <span>₹{grandTotal}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 4: GOOGLE LOGIN + NPCI UPI PAYMENT + SERVER-VERIFIED SETTLEMENT */}
            {bookingStep === 'payment' && (
              <div className="space-y-4 py-1">
                {/* 1. Google Login Verification Block */}
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black flex items-center gap-1.5">
                      <UserCheck className="w-4 h-4 text-emerald-400" />
                      <span>Step 4A · Verified Google Account for Ticket Ownership</span>
                    </span>
                    {authUser && (
                      <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-black">
                        ✓ Signed In: {authUser.email}
                      </span>
                    )}
                  </div>

                  {!authUser ? (
                    <div className="space-y-2.5">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                        <input
                          type="text"
                          value={guestNameInput}
                          onChange={(e) => setGuestNameInput(e.target.value)}
                          placeholder="Full Name"
                          className="rounded-xl bg-black/40 border border-white/15 px-3 py-2 text-white"
                        />
                        <input
                          type="email"
                          value={guestEmailInput}
                          onChange={(e) => setGuestEmailInput(e.target.value)}
                          placeholder="Google Email"
                          className="rounded-xl bg-black/40 border border-white/15 px-3 py-2 text-white"
                        />
                        <input
                          type="tel"
                          value={guestPhoneInput}
                          onChange={(e) => setGuestPhoneInput(e.target.value)}
                          placeholder="10-Digit Mobile"
                          className="rounded-xl bg-black/40 border border-white/15 px-3 py-2 text-white"
                        />
                      </div>
                      <button
                        type="button"
                        data-testid="checkout-google-login-btn"
                        onClick={handleInlineGoogleLogin}
                        disabled={isSigningInGoogle}
                        className="w-full py-2.5 rounded-xl bg-white text-zinc-950 font-black text-xs flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <span>{isSigningInGoogle ? 'Signing in with Google...' : 'Continue with Google OAuth (Preserve Seat Hold)'}</span>
                      </button>
                    </div>
                  ) : (
                    <div className="text-xs text-zinc-300 flex items-center justify-between">
                      <span>
                        M-Ticket & GST Invoice will be bound to <strong>{authUser.name}</strong> ({authUser.email})
                      </span>
                    </div>
                  )}
                </div>

                {/* 2. Server-Verified UPI Payment & Settlement Block */}
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-4">
                  <div className="flex flex-col sm:flex-row gap-4 items-center">
                    <div className="p-3 bg-white rounded-2xl shrink-0">
                      <QRCodeSVG
                        value={`upi://pay?pa=${encodeURIComponent(
                          bookingModalListing.upiId || 'bookourspace.movies@okaxis'
                        )}&pn=${encodeURIComponent(bookingModalListing.providerName)}&am=${grandTotal}&cu=INR`}
                        size={112}
                        level="M"
                      />
                    </div>
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-wider text-amber-400">
                          NPCI DIRECT UPI · SERVER-VERIFIED SETTLEMENT
                        </span>
                        <span className="text-sm font-black text-emerald-400">Pay ₹{grandTotal}</span>
                      </div>
                      <p className="text-xs text-zinc-300">
                        Scan with GPay, PhonePe, or Paytm. Enter the 12-digit UTR below.{' '}
                        <strong className="text-amber-300">
                          Security Policy: A booking is NEVER confirmed from UTR or screenshot alone until verified by bank webhook settlement.
                        </strong>
                      </p>
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-zinc-400 block">
                          12-Digit NPCI UPI UTR Reference Number
                        </label>
                        <input
                          type="text"
                          data-testid="upi-utr-input"
                          maxLength={12}
                          value={upiUtrInput}
                          onChange={(e) => setUpiUtrInput(e.target.value.replace(/\D/g, '').slice(0, 12))}
                          placeholder="Enter 12-digit UTR (e.g. 412987654321)"
                          className="w-full rounded-xl bg-black/50 border border-white/20 px-3.5 py-2 text-xs font-mono text-white"
                        />
                      </div>
                    </div>
                  </div>

                  {paymentStatusMessage && (
                    <div
                      data-testid="payment-verification-alert"
                      className={`p-3 rounded-xl border text-xs font-bold ${
                        paymentVerifyStatus === 'verified'
                          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                          : paymentVerifyStatus === 'pending_reconciliation'
                          ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                          : 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                      }`}
                    >
                      {paymentStatusMessage}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                    <button
                      type="button"
                      data-testid="submit-utr-unsettled-btn"
                      disabled={isAtomicallyBooking}
                      onClick={() => handleVerifyPaymentAndConfirmTicket(false)}
                      className="py-2.5 px-3 rounded-xl border border-amber-400/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-xs font-bold cursor-pointer"
                    >
                      Submit UTR Only (Test Unsettled Guard)
                    </button>

                    <button
                      type="button"
                      data-testid="verify-settlement-confirm-btn"
                      disabled={isAtomicallyBooking}
                      onClick={() => handleVerifyPaymentAndConfirmTicket(true)}
                      className="py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer shadow-lg"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      <span>
                        {isAtomicallyBooking
                          ? 'Verifying Settlement...'
                          : `Verify Bank Webhook & Issue Ticket (₹${grandTotal})`}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 5: CONFIRMED BOOKOURSPACE M-TICKET WITH SIGNED QR PASS */}
            {bookingStep === 'mticket' && activeMTicket && (
              <div
                data-testid="confirmed-mticket-view"
                className="p-5 rounded-2xl bg-white text-zinc-900 space-y-4"
              >
                <div className="flex items-center justify-between border-b border-zinc-200 pb-3">
                  <BOSBrandLogo compact verifiedLabel="M-TICKET" subtitleItems={['VERIFIED', 'SINGLE-USE', 'QR PASS']} />
                  <span className="text-[10px] font-mono font-black px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    HMAC-SHA256 SIGNED
                  </span>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-dashed border-zinc-300 pb-4">
                  <div className="flex items-center gap-3.5">
                    <img
                      src={activeMTicket.posterUrl}
                      alt={activeMTicket.movieTitle}
                      referrerPolicy="no-referrer"
                      className="w-16 h-24 rounded-xl object-cover shrink-0"
                    />
                    <div className="space-y-1">
                      <span
                        data-testid="confirmed-ticket-id"
                        className="text-[10px] font-black uppercase tracking-wider text-emerald-700"
                      >
                        ✓ BOOKOURSPACE VERIFIED M-TICKET · {activeMTicket.ticketId}
                      </span>
                      <h4 className="text-base font-black text-zinc-950">{activeMTicket.movieTitle}</h4>
                      <p className="text-xs text-zinc-600">
                        {activeMTicket.cinemaName} · {activeMTicket.areaName}
                      </p>
                      <p className="text-xs font-black text-[#E23744]">
                        {activeMTicket.dateLabel} · {activeMTicket.showtime}
                      </p>
                      <p className="text-[10px] font-mono text-zinc-500">
                        Signed Token: {activeMTicket.qrPassToken}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col items-center justify-center bg-white border-2 border-zinc-900 p-2.5 rounded-2xl shrink-0">
                    <QRCodeSVG
                      value={activeMTicket.qrPassToken || activeMTicket.ticketId}
                      size={88}
                      level="M"
                    />
                    <span className="text-[9px] font-mono font-bold mt-1 text-zinc-800">
                      {activeMTicket.ticketId}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-zinc-400 block">Seats ({activeMTicket.seats.length})</span>
                    <span className="font-black text-zinc-950">{activeMTicket.seats.join(', ')}</span>
                  </div>
                  <div>
                    <span className="text-zinc-400 block">Screen & Audio</span>
                    <span className="font-bold text-zinc-800">{activeMTicket.screenName || activeMTicket.screenFormat}</span>
                  </div>
                  <div>
                    <span className="text-zinc-400 block">UPI UTR</span>
                    <span className="font-mono font-bold text-zinc-800">{activeMTicket.paymentUtr || 'Settled'}</span>
                  </div>
                  <div>
                    <span className="text-zinc-400 block">Total Settled</span>
                    <span className="font-black text-emerald-700">₹{activeMTicket.totalAmount}</span>
                  </div>
                </div>

                {activeMTicket.foodItems.length > 0 && (
                  <div className="text-xs bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-amber-900">
                    <strong>F&B Add-ons:</strong> {activeMTicket.foodItems.join(' · ')}
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleShareTicket(activeMTicket)}
                      className="px-3.5 py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-900 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      <span>Share</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownloadTicketSummary(activeMTicket)}
                      className="px-3.5 py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-900 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download Pass</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="px-3.5 py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-900 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Print PDF</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    data-testid="view-in-my-mtickets-btn"
                    onClick={() => {
                      setBookingModalListing(null);
                      setActivePillar('my_tickets');
                    }}
                    className="px-5 py-2 rounded-xl bg-zinc-950 text-white text-xs font-black cursor-pointer"
                  >
                    Manage in My M-Tickets ({bookedTickets.length})
                  </button>
                </div>
              </div>
            )}

            {/* Modal Checkout Footer for Steps 1-3 */}
            {bookingStep !== 'mticket' && bookingStep !== 'payment' && (
              <div className="pt-4 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-xs text-zinc-400">
                    Seats:{' '}
                    <span className="font-black text-white">
                      {selectedSeats.length > 0 ? selectedSeats.join(', ') : 'None'}
                    </span>
                    {foodSubtotal > 0 && (
                      <span className="text-amber-400 ml-2">+ ₹{foodSubtotal} Snacks</span>
                    )}
                  </div>
                  <div className="text-lg font-black text-white tabular-nums">
                    Total: ₹{grandTotal.toLocaleString('en-IN')}{' '}
                    <span className="text-[11px] font-semibold text-zinc-400">
                      (incl. ₹{convenienceFeeTotal + gstTaxAmount} fee & GST)
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {bookingStep === 'seats' && (
                    <button
                      type="button"
                      data-testid="lock-seats-atomic-btn"
                      disabled={selectedSeats.length === 0 || isHoldingSeats}
                      onClick={handleAcquireAtomicSeatHold}
                      className="px-5 py-2.5 rounded-xl bg-[#E23744] hover:bg-[#c92d39] disabled:opacity-40 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-lg"
                    >
                      <Lock className="w-4 h-4" />
                      <span>
                        {isHoldingSeats ? 'Locking Seats...' : 'Lock Seats (5-Min Atomic Hold) →'}
                      </span>
                    </button>
                  )}

                  {bookingStep === 'fnb' && (
                    <button
                      type="button"
                      data-testid="proceed-to-upi-payment-btn"
                      disabled={selectedSeats.length === 0}
                      onClick={handleProceedToPaymentStep}
                      className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-lg"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      <span>Proceed to Google Auth & UPI (₹{grandTotal}) →</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          9. CANCELLATION & INSTANT REFUND MODAL
         ===================================================================== */}
      {cancellingTicket && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setCancellingTicket(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            data-testid="cancel-ticket-modal"
            className="w-full max-w-md rounded-3xl bg-[#12121A] text-white border border-white/15 p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-rose-400">
                Cancel M-Ticket & Release Seats ({cancellingTicket.ticketId})
              </h3>
              <button
                type="button"
                onClick={() => setCancellingTicket(null)}
                className="p-1.5 rounded-full bg-white/10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 text-xs space-y-1.5">
              <div className="font-black text-sm">{cancellingTicket.movieTitle}</div>
              <div className="text-zinc-400">
                {cancellingTicket.cinemaName} · {cancellingTicket.showtime} · Seats: {cancellingTicket.seats.join(', ')}
              </div>
              <div className="pt-2 border-t border-white/10 flex justify-between">
                <span>Amount Paid:</span>
                <span className="font-bold">₹{cancellingTicket.totalAmount}</span>
              </div>
              <div className="flex justify-between text-emerald-400 font-black">
                <span>Estimated Policy Refund (80%):</span>
                <span>₹{Math.round(cancellingTicket.totalAmount * 0.8)}</span>
              </div>
            </div>

            <div className="space-y-1.5 text-xs">
              <label className="font-bold text-zinc-300 block">Reason for Cancellation</label>
              <select
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full rounded-xl bg-black/50 border border-white/20 px-3 py-2 text-white"
              >
                <option value="Change of plans / Schedule conflict">Change of plans / Schedule conflict</option>
                <option value="Booked wrong showtime or date">Booked wrong showtime or date</option>
                <option value="Weather or traffic delay">Weather or traffic delay</option>
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCancellingTicket(null)}
                className="px-4 py-2 rounded-xl bg-white/10 text-xs font-bold cursor-pointer"
              >
                Keep Ticket
              </button>
              <button
                type="button"
                data-testid="confirm-cancel-refund-btn"
                disabled={isCancellingBusy}
                onClick={handleConfirmCancelTicket}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black cursor-pointer"
              >
                {isCancellingBusy ? 'Cancelling...' : 'Confirm Cancel & Refund'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          10. CUSTOMER SUPPORT & REFUND ENQUIRY MODAL
         ===================================================================== */}
      {supportModalTicket && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setSupportModalTicket(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl bg-[#12121A] text-white border border-white/15 p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black">
                Cinema Support & Dispute Desk ({supportModalTicket.ticketId})
              </h3>
              <button
                type="button"
                onClick={() => setSupportModalTicket(null)}
                className="p-1.5 rounded-full bg-white/10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-zinc-300 block mb-1">Issue Category</label>
                <select
                  value={supportCategory}
                  onChange={(e) => setSupportCategory(e.target.value as any)}
                  className="w-full rounded-xl bg-black/50 border border-white/20 px-3 py-2 text-white"
                >
                  <option value="refund_status">Refund / Cancellation Status</option>
                  <option value="payment_deducted">UPI Deducted / Settlement Enquiry</option>
                  <option value="seat_issue">Auditorium Seat / Recliner Issue</option>
                  <option value="qr_scan_help">Theatre Gate QR Scan Assistance</option>
                  <option value="other">Other Cinema Help</option>
                </select>
              </div>
              <div>
                <label className="font-bold text-zinc-300 block mb-1">Describe Your Issue</label>
                <textarea
                  rows={3}
                  value={supportDesc}
                  onChange={(e) => setSupportDesc(e.target.value)}
                  placeholder="Provide details so the Cinema Duty Manager can assist immediately..."
                  className="w-full rounded-xl bg-black/50 border border-white/20 p-3 text-white"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSupportModalTicket(null)}
                className="px-4 py-2 rounded-xl bg-white/10 text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!supportDesc.trim() || isSubmittingSupport}
                onClick={handleCreateSupportTicket}
                className="px-5 py-2 rounded-xl bg-[#E23744] text-white text-xs font-black cursor-pointer"
              >
                {isSubmittingSupport ? 'Submitting...' : 'Submit Support Ticket'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
