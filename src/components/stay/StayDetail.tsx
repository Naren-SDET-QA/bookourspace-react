import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import {
  Accessibility,
  ArrowLeft,
  Bath,
  BedDouble,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Heart,
  Languages,
  MapPin,
  ShieldCheck,
  Share2,
  Star,
  Users,
  Wifi,
  X,
  Zap,
} from 'lucide-react';
import type { StaySearchItem } from '../../lib/staySearchClient';
import {
  fetchStayCalendar,
  fetchStayReviews,
  formatInr,
  toStayProperty,
  type StayCalendarNight,
  type StayReview,
} from '../../lib/staySearchClient';
import {
  accessibilityLabel,
  languageLabel,
  propertyTypeLabel,
  type StayFilters,
} from '../../lib/stayFilters';

const FreeMap = lazy(() => import('../FreeMap').then((module) => ({ default: module.FreeMap })));
import SafeImage from '../SafeImage';

const StayHostProfileModal = lazy(() => import('./StayHostProfileModal').then((module) => ({ default: module.StayHostProfileModal })));

const CANCELLATION_LABEL: Record<string, string> = {
  flexible: 'Flexible',
  moderate: 'Moderate',
  strict: 'Strict',
  non_refundable: 'Non-refundable',
};

function isoLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatDate(iso: string): string {
  if (!iso) return '';
  const parsed = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return iso;
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(parsed);
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}`;
}

function nightsBetweenLocal(from: string, to: string): number {
  if (!from || !to) return 0;
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.round((end - start) / 86_400_000);
}

function amenityIcon(amenity: string): React.ElementType {
  const key = amenity.toLowerCase();
  if (/wifi|internet/.test(key)) return Wifi;
  if (/bath/.test(key)) return Bath;
  if (/bed/.test(key)) return BedDouble;
  if (/access|step|grab|hoist|shower chair|wheelchair/.test(key)) return Accessibility;
  return Check;
}

function Stars({ rating, className }: { rating: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-0.5 ${className ?? ''}`} aria-label={`${rating.toFixed(1)} out of 5`}>
      {[1, 2, 3, 4, 5].map((value) => (
        <Star
          key={value}
          aria-hidden="true"
          className={`h-3.5 w-3.5 ${value <= Math.round(rating) ? 'fill-[#f97316] text-[#f97316]' : 'text-[#b0b0b0]'}`}
        />
      ))}
    </span>
  );
}

export function StayDetail({
  item,
  filters,
  isAuthenticated,
  saved,
  onSave,
  onClose,
  onPickDates,
  onGuestChange,
  onOpenTrips,
  onShare,
  onToast,
  onSignIn,
  onReserve,
}: {
  item: StaySearchItem;
  filters: StayFilters;
  isAuthenticated: boolean;
  saved: boolean;
  onSave: () => void;
  onClose: () => void;
  onPickDates: (checkIn: string, checkOut: string) => void;
  onGuestChange: (guests: number) => void;
  onOpenTrips: () => void;
  onShare: () => void;
  onToast: (message: string) => void;
  onSignIn?: () => void;
  onReserve: () => void;
}) {
  const today = useMemo(() => isoLocal(new Date()), []);
  const [checkIn, setCheckIn] = useState(filters.checkIn);
  const [checkOut, setCheckOut] = useState(filters.checkOut);
  const [guests, setGuests] = useState(filters.guests);
  const [month, setMonth] = useState(() => {
    const base = filters.checkIn ? new Date(`${filters.checkIn}T00:00:00`) : new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  const [availability, setAvailability] = useState<Record<string, StayCalendarNight>>({});
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState('');
  const [reviews, setReviews] = useState<StayReview[]>([]);
  const [reviewSummary, setReviewSummary] = useState({ rating: item.rating, count: item.reviewCount });
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [reviewsError, setReviewsError] = useState('');
  const [showAllReviews, setShowAllReviews] = useState(false);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [imageIndex, setImageIndex] = useState(0);
  const [hostProfileOpen, setHostProfileOpen] = useState(false);

  useEffect(() => {
    setCheckIn(filters.checkIn);
    setCheckOut(filters.checkOut);
    setGuests(filters.guests);
  }, [filters.checkIn, filters.checkOut, filters.guests]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (lightbox !== null) setLightbox(null);
        else onClose();
      }
      if (lightbox !== null && item.images.length > 1) {
        if (event.key === 'ArrowRight') setLightbox((current) => (current === null ? null : (current + 1) % item.images.length));
        if (event.key === 'ArrowLeft') setLightbox((current) => (current === null ? null : (current - 1 + item.images.length) % item.images.length));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox, onClose, item.images.length]);

  const nights = nightsBetweenLocal(checkIn, checkOut);
  // Demo catalog rows are discoverable preview inventory. The server always
  // refuses to hold or book them (STAY_DEMO_NOT_BOOKABLE), so the detail page
  // must say so instead of walking the guest into an empty checkout.
  const previewOnly = item.demo === true && item.demoBookable !== true;

  useEffect(() => {
    const controller = new AbortController();
    const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
    const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 1);
    const todayDate = new Date(`${today}T00:00:00`);
    const from = monthStart < todayDate ? todayDate : monthStart;
    if (from >= monthEnd) {
      setAvailability({});
      setCalendarError('');
      return;
    }
    setCalendarLoading(true);
    setCalendarError('');
    void fetchStayCalendar(item.listingId, isoLocal(from), isoLocal(monthEnd), controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      setCalendarLoading(false);
      if (result.ok) {
        setAvailability(Object.fromEntries(result.nights.map((night) => [night.date, night])));
      } else {
        setAvailability({});
        setCalendarError(result.message || 'The availability calendar could not be loaded.');
      }
    });
    return () => controller.abort();
  }, [item.listingId, month, today]);

  useEffect(() => {
    const controller = new AbortController();
    setReviewsLoading(true);
    setReviewsError('');
    void fetchStayReviews(item.listingId, 24, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      setReviewsLoading(false);
      if (result.ok) {
        setReviews(result.reviews);
        setReviewSummary({ rating: result.rating, count: result.reviewCount });
      } else {
        setReviewsError(result.message || 'Reviews could not be loaded.');
      }
    });
    return () => controller.abort();
  }, [item.listingId]);

  const monthLabel = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(month);
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const firstWeekday = new Date(month.getFullYear(), month.getMonth(), 1).getDay();

  const pickDate = (date: string) => {
    const night = availability[date];
    if (night && night.availableUnits <= 0) return;
    if (!checkIn || (checkIn && checkOut) || date <= checkIn) {
      const next = isoLocal(addDays(new Date(`${date}T00:00:00`), 1));
      setCheckIn(date);
      setCheckOut(next);
      onPickDates(date, next);
      return;
    }
    setCheckOut(date);
    onPickDates(checkIn, date);
  };

  const property = useMemo(() => toStayProperty(item), [item]);
  const visibleReviews = showAllReviews ? reviews : reviews.slice(0, 6);
  const cancellationPolicy = CANCELLATION_LABEL[item.cancellationPolicy] || 'Moderate';
  const estimatedSubtotal = item.priceFromPaise * Math.max(1, nights);
  const estimatedCleaning = Math.max(0, item.cleaningFeePaise || 0);
  const estimatedService = Math.round((estimatedSubtotal * Math.max(0, item.serviceFeeBps || 0)) / 10000);
  const estimatedPreTax = estimatedSubtotal + estimatedCleaning + estimatedService;
  const estimatedTaxes = Math.round((estimatedPreTax * Math.max(0, item.taxPercent || 0)) / 100);
  // Displayed rows always sum to the shown total; the server confirms the real
  // payable amount before any hold, booking or payment is created.
  const estimatedTotal = estimatedPreTax + estimatedTaxes;

  return (
    <div className="fixed inset-0 z-[95] overflow-y-auto bg-white text-[#222222] dark:bg-slate-950 dark:text-slate-100" role="dialog" aria-modal="true" aria-labelledby="stay-detail-heading">
      <div className="sticky top-0 z-30 border-b border-[#ebebeb] bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
        <div className="mx-auto flex h-16 max-w-[1180px] items-center justify-between gap-3 px-4 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-full px-3 text-sm font-semibold transition hover:bg-[#f7f7f7] dark:hover:bg-slate-800"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to stays
          </button>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onShare}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-full px-3 text-sm font-semibold underline underline-offset-2"
            >
              <Share2 className="h-4 w-4" aria-hidden="true" /> Share
            </button>
            <button
              type="button"
              onClick={onSave}
              aria-pressed={saved}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-full px-3 text-sm font-semibold underline underline-offset-2"
            >
              <Heart className={`h-4 w-4 ${saved ? 'fill-[#f97316] text-[#f97316]' : ''}`} aria-hidden="true" /> {saved ? 'Saved' : 'Save'}
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1180px] px-4 pb-28 pt-5 sm:px-6 lg:pb-16">
        <h1 id="stay-detail-heading" className="text-[24px] font-semibold leading-tight sm:text-[30px]">{item.name}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          {reviewSummary.count > 0 ? (
            <>
              <span className="inline-flex items-center gap-1 font-semibold">
                <Star className="h-4 w-4 fill-[#222222] dark:fill-slate-100" aria-hidden="true" /> {reviewSummary.rating.toFixed(2)}
              </span>
              <span aria-hidden="true">·</span>
              <a href="#stay-reviews" className="underline underline-offset-2">{reviewSummary.count} review{reviewSummary.count === 1 ? '' : 's'}</a>
              <span aria-hidden="true">·</span>
            </>
          ) : (
            <>
              <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">New listing</span>
              <span aria-hidden="true">·</span>
            </>
          )}
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-4 w-4" aria-hidden="true" />
            {[item.area, item.city].filter(Boolean).join(', ') || 'Location shared after booking'}
          </span>
        </div>

        {item.localTestFixture ? (
          <p role="note" className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
            LOCAL E2E TEST FIXTURE — this synthetic property and its test price exist only in the disposable local database. No real property or payment is represented.
          </p>
        ) : (
          <p role="note" className="mt-3 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span><span className="font-semibold">Verified stay.</span> Live inventory — availability and the payable total are confirmed by the server before any hold, booking or payment.</span>
          </p>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          {item.guestFavourite && <span className="rounded-full bg-[#f7f7f7] px-3 py-1 text-xs font-semibold dark:bg-slate-800">Guest favourite</span>}
          {item.luxeVerified && <span className="rounded-full bg-[#222222] px-3 py-1 text-xs font-semibold text-white">Luxe verified</span>}
          {item.instantBook && <span className="inline-flex items-center gap-1 rounded-full bg-[#f7f7f7] px-3 py-1 text-xs font-semibold dark:bg-slate-800"><Zap className="h-3 w-3 text-[#f97316]" aria-hidden="true" /> Instant Book</span>}
          {item.selfCheckIn && <span className="rounded-full bg-[#f7f7f7] px-3 py-1 text-xs font-semibold dark:bg-slate-800">Self check-in</span>}
          {item.demo && <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">Sample data</span>}
        </div>

        {/* Gallery */}
        <div className="mt-5">
          {item.images.length === 0 ? (
            <div className="flex aspect-[16/9] w-full flex-col items-center justify-center gap-2 rounded-2xl bg-[#f2f0ee] text-slate-500 dark:bg-slate-800">
              <BedDouble className="h-10 w-10" aria-hidden="true" />
              <span className="text-sm font-medium">The host has not added photos yet</span>
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-[2fr_1fr]">
              <button
                type="button"
                onClick={() => setLightbox(imageIndex)}
                className="relative aspect-[4/3] overflow-hidden rounded-2xl sm:aspect-auto sm:min-h-[380px]"
                aria-label="Open photo gallery"
              >
                <SafeImage category="stays" src={item.images[imageIndex]} alt={`${item.name} photo ${imageIndex + 1}`} className="h-full w-full object-cover" />
                <span className="absolute bottom-3 right-3 rounded-lg bg-black/60 px-2.5 py-1.5 text-xs font-semibold text-white">
                  {item.images.length} photo{item.images.length === 1 ? '' : 's'}
                </span>
              </button>
              {item.images.length > 1 && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-1">
                  {item.images.slice(1, 4).map((source, index) => (
                    <button
                      key={`${source}-${index}`}
                      type="button"
                      onClick={() => { setImageIndex(index + 1); setLightbox(index + 1); }}
                      className="relative aspect-[4/3] overflow-hidden rounded-xl sm:aspect-auto sm:min-h-0"
                      aria-label={`Open photo ${index + 2}`}
                    >
                      <SafeImage category="stays" src={source} alt={`${item.name} photo ${index + 2}`} className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_390px] lg:items-start">
          <div className="min-w-0">
            {/* Host */}
            <div className="flex items-start justify-between gap-4 border-b border-[#ebebeb] pb-6 dark:border-slate-800">
              <div className="min-w-0">
                <h2 className="text-xl font-semibold">
                  {propertyTypeLabel(item.propertyType)} hosted by {item.hostName || 'a BookOurSpace host'}
                </h2>
                <p className="mt-1 text-sm text-[#717171] dark:text-slate-400">
                  {item.maxGuests || '—'} guests · {item.bedrooms || '—'} bedroom{item.bedrooms === 1 ? '' : 's'} · {item.beds || '—'} bed{(item.beds || 0) === 1 ? '' : 's'} · {item.bathrooms || '—'} bath{Number(item.bathrooms) === 1 ? '' : 's'}
                </p>
                {item.hostLanguages.length > 0 && (
                  <p className="mt-2 flex flex-wrap items-center gap-1.5 text-sm text-[#717171] dark:text-slate-400">
                    <Languages className="h-4 w-4" aria-hidden="true" /> Speaks {item.hostLanguages.map((language) => languageLabel(language)).join(', ')}
                  </p>
                )}
                {item.hostId && (
                  <button type="button" onClick={() => setHostProfileOpen(true)} className="mt-2 inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-[#dddddd] px-3 text-sm font-semibold dark:border-slate-700">
                    <ShieldCheck className="h-4 w-4" aria-hidden="true" /> View host profile
                  </button>
                )}
              </div>
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#f7f7f7] text-lg font-bold text-[#717171] dark:bg-slate-800">
                {item.hostAvatarUrl ? (
                  <SafeImage category="general" src={item.hostAvatarUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  (item.hostName || 'B').trim().slice(0, 1).toUpperCase()
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 border-b border-[#ebebeb] py-6 sm:grid-cols-3 dark:border-slate-800">
              {[
                { icon: Users, label: `${item.maxGuests || '—'} guests` },
                { icon: BedDouble, label: `${item.bedrooms || '—'} bedrooms` },
                { icon: Bath, label: `${item.bathrooms || '—'} bathrooms` },
                { icon: CalendarDays, label: item.instantBook ? 'Instant booking' : 'Request to book' },
                { icon: Clock3, label: item.checkInTime ? `Check-in ${item.checkInTime.slice(0, 5)}` : 'Check-in time set by host' },
                { icon: ShieldCheck, label: item.selfCheckIn ? 'Self check-in' : 'Host greets you' },
              ].map((entry) => {
                const Icon = entry.icon;
                return (
                  <div key={entry.label} className="flex items-start gap-2.5">
                    <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                    <span className="text-sm font-medium">{entry.label}</span>
                  </div>
                );
              })}
            </div>

            {item.description && (
              <div className="border-b border-[#ebebeb] py-6 dark:border-slate-800">
                <h3 className="text-lg font-semibold">About this stay</h3>
                <p className="mt-2 whitespace-pre-line text-[15px] leading-6 text-[#222222] dark:text-slate-200">{item.description}</p>
              </div>
            )}

            {/* Amenities */}
            <div className="border-b border-[#ebebeb] py-6 dark:border-slate-800">
              <h3 className="text-lg font-semibold">What this place offers</h3>
              {item.amenities.length ? (
                <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                  {item.amenities.map((amenity) => {
                    const Icon = amenityIcon(amenity);
                    return (
                      <li key={amenity} className="flex items-center gap-3 text-[15px]">
                        <Icon className="h-5 w-5 shrink-0 text-[#222222] dark:text-slate-200" aria-hidden="true" />
                        <span>{amenity}</span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-[#717171] dark:text-slate-400">The host has not listed amenities for this stay.</p>
              )}
              {item.accessibility.length > 0 && (
                <div className="mt-6">
                  <h4 className="flex items-center gap-2 text-sm font-semibold"><Accessibility className="h-4 w-4" aria-hidden="true" /> Accessibility features</h4>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {item.accessibility.map((key) => (
                      <li key={key} className="rounded-full border border-[#dddddd] px-3 py-1 text-xs font-medium dark:border-slate-700">{accessibilityLabel(key)}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Rooms */}
            <div className="border-b border-[#ebebeb] py-6 dark:border-slate-800">
              <h3 className="text-lg font-semibold">Rooms you can book</h3>
              {item.roomTypes.length ? (
                <ul className="mt-4 divide-y divide-[#ebebeb] dark:divide-slate-800">
                  {item.roomTypes.map((room) => (
                    <li key={room.id} className="flex flex-wrap items-start justify-between gap-3 py-4 first:pt-0">
                      <div className="min-w-0">
                        <p className="text-[15px] font-semibold">{room.name}</p>
                        <p className="mt-0.5 text-sm text-[#717171] dark:text-slate-400">
                          Up to {room.maxAdults + room.maxChildren} guests · {room.bedrooms} bedroom{room.bedrooms === 1 ? '' : 's'} · {room.beds} bed{room.beds === 1 ? '' : 's'} · {room.bathrooms} bath{Number(room.bathrooms) === 1 ? '' : 's'}
                        </p>
                        {room.amenities.length > 0 && (
                          <p className="mt-1 text-xs text-[#717171] dark:text-slate-400">{room.amenities.join(' · ')}</p>
                        )}
                      </div>
                      <p className="shrink-0 text-[15px] font-semibold">{formatInr(room.basePricePaise)} <span className="text-xs font-normal text-[#717171] dark:text-slate-400">night</span></p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-[#717171] dark:text-slate-400">Room inventory is not published, so online booking is unavailable for this stay.</p>
              )}
            </div>

            {/* Calendar */}
            <div id="stay-availability" className="border-b border-[#ebebeb] py-6 dark:border-slate-800">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-lg font-semibold">Availability</h3>
                  <p className="text-sm text-[#717171] dark:text-slate-400">{nights > 0 ? `${nights} night${nights === 1 ? '' : 's'} selected` : 'Select your check-in date'}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
                    aria-label="Previous month"
                    disabled={month <= new Date(new Date().getFullYear(), new Date().getMonth(), 1)}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-[#dddddd] transition hover:border-[#222222] disabled:opacity-30 dark:border-slate-700"
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <span className="min-w-[150px] text-center text-sm font-semibold" aria-live="polite">{monthLabel}</span>
                  <button
                    type="button"
                    onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
                    aria-label="Next month"
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-[#dddddd] transition hover:border-[#222222] dark:border-slate-700"
                  >
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
              {calendarError && <p role="alert" className="mt-2 text-sm text-amber-700 dark:text-amber-300">{calendarError} Dates remain selectable in the booking panel.</p>}
              <div className="mt-4 grid grid-cols-7 gap-1 text-center">
                {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => (
                  <span key={day} className="py-1 text-[11px] font-semibold uppercase text-[#717171]" aria-hidden="true">{day}</span>
                ))}
                {Array.from({ length: firstWeekday }, (_, index) => <span key={`pad-${index}`} />)}
                {Array.from({ length: daysInMonth }, (_, index) => {
                  const date = isoLocal(new Date(month.getFullYear(), month.getMonth(), index + 1));
                  const night = availability[date];
                  const past = date < today;
                  const soldOut = Boolean(night && night.availableUnits <= 0);
                  const selected = date === checkIn || date === checkOut;
                  const inRange = checkIn && checkOut && date > checkIn && date < checkOut;
                  const disabled = past || soldOut || calendarLoading;
                  return (
                    <button
                      key={date}
                      type="button"
                      onClick={() => pickDate(date)}
                      disabled={disabled}
                      aria-label={`${formatDate(date)}${soldOut ? ' unavailable' : ''}`}
                      aria-pressed={selected}
                      className={`flex h-10 items-center justify-center rounded-full text-sm transition ${
                        selected
                          ? 'bg-[#222222] font-semibold text-white dark:bg-white dark:text-slate-900'
                          : inRange
                            ? 'bg-[#f7f7f7] font-medium dark:bg-slate-800'
                            : soldOut || past
                              ? 'cursor-not-allowed text-[#b0b0b0] line-through'
                              : 'hover:border hover:border-[#222222]'
                      }`}
                    >
                      {index + 1}
                    </button>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-[#717171] dark:text-slate-400">
                Crossed-out dates have no free room for the night. The server re-checks availability when you reserve.
              </p>
            </div>

            {/* Reviews */}
            <div id="stay-reviews" className="border-b border-[#ebebeb] py-6 dark:border-slate-800">
              <h3 className="text-lg font-semibold">
                {reviewSummary.count > 0 ? `${reviewSummary.rating.toFixed(1)} · ${reviewSummary.count} review${reviewSummary.count === 1 ? '' : 's'}` : 'Reviews'}
              </h3>
              {reviewsLoading && <p className="mt-2 text-sm text-[#717171]" aria-busy="true">Loading reviews…</p>}
              {reviewsError && <p role="alert" className="mt-2 text-sm text-rose-600">{reviewsError}</p>}
              {!reviewsLoading && !reviewsError && reviews.length === 0 && (
                <p className="mt-2 text-sm text-[#717171] dark:text-slate-400">No reviews yet. This host is new to BookOurSpace, so there is nothing to average.</p>
              )}
              <ul className="mt-4 space-y-5">
                {visibleReviews.map((review) => (
                  <li key={review.id}>
                    <div className="flex flex-wrap items-center gap-x-2 text-sm">
                      <span className="font-semibold">{review.author}</span>
                      <span aria-hidden="true">·</span>
                      <Stars rating={review.rating} />
                      <span aria-hidden="true">·</span>
                      <span className="text-[#717171] dark:text-slate-400">{formatDate(review.createdAt.slice(0, 10))}</span>
                    </div>
                    <p className="mt-1 text-[15px] leading-6">{review.comment}</p>
                    {review.hostReply && (
                      <p className="mt-1 rounded-lg bg-[#f7f7f7] p-2.5 text-sm dark:bg-slate-800"><span className="font-semibold">Host reply: </span>{review.hostReply}</p>
                    )}
                  </li>
                ))}
              </ul>
              {reviews.length > 6 && (
                <button type="button" onClick={() => setShowAllReviews((value) => !value)} className="mt-4 min-h-[40px] text-sm font-semibold underline underline-offset-2">
                  {showAllReviews ? 'Show fewer reviews' : `Show all ${reviews.length} reviews`}
                </button>
              )}
            </div>

            {/* Things to know */}
            <div className="py-6">
              <h3 className="text-lg font-semibold">Things to know</h3>
              <div className="mt-4 grid gap-6 sm:grid-cols-3">
                <div>
                  <p className="font-semibold">House rules</p>
                  <p className="mt-1 text-sm text-[#717171] dark:text-slate-400">
                    Check-in {item.checkInTime ? `after ${item.checkInTime.slice(0, 5)}` : 'as arranged with the host'}
                  </p>
                  <p className="text-sm text-[#717171] dark:text-slate-400">
                    Checkout {item.checkOutTime ? `before ${item.checkOutTime.slice(0, 5)}` : 'as arranged with the host'}
                  </p>
                  <p className="mt-1 text-sm text-[#717171] dark:text-slate-400">{item.petsAllowed ? 'Pets welcome' : 'Pets not listed as allowed'}</p>
                </div>
                <div>
                  <p className="font-semibold">Safety &amp; property</p>
                  <p className="mt-1 text-sm text-[#717171] dark:text-slate-400">Contact details are only shared after a confirmed booking and owner consent.</p>
                </div>
                <div>
                  <p className="font-semibold">Cancellation policy</p>
                  <p className="mt-1 text-sm text-[#717171] dark:text-slate-400">{cancellationPolicy}</p>
                  <p className="text-sm text-[#717171] dark:text-slate-400">
                    {item.cancellationPolicy === 'non_refundable'
                      ? 'This stay is non-refundable.'
                      : `Free-cancellation window ends ${item.cancellationFreeHours} hours before check-in.`}
                  </p>
                </div>
              </div>
            </div>

            {item.latitude !== null && item.longitude !== null && (
              <div className="py-2">
                <h3 className="text-lg font-semibold">Where you’ll be</h3>
                <p className="mt-1 text-sm text-[#717171] dark:text-slate-400">Approximate area only. The exact address is shared after booking.</p>
                <div className="mt-3 overflow-hidden rounded-2xl border border-[#ebebeb] dark:border-slate-800">
                  <Suspense fallback={<div className="h-64 w-full animate-pulse bg-[#ebebeb] dark:bg-slate-800" aria-label="Loading location map" />}>
                    <FreeMap
                      points={[{ lat: item.latitude, lng: item.longitude, label: item.name }]}
                      center={[item.latitude, item.longitude]}
                      zoom={13}
                      className="h-64 w-full"
                      ariaLabel={`Approximate location of ${item.name}`}
                    />
                  </Suspense>
                </div>
              </div>
            )}
          </div>

          {/* Booking panel */}
          <aside className="lg:sticky lg:top-20">
            <div id="stay-booking-panel" className="rounded-2xl border border-[#dddddd] p-5 shadow-[0_6px_16px_rgba(0,0,0,0.12)] dark:border-slate-700">
              <div className="flex items-baseline justify-between gap-2">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[22px] font-semibold">{formatInr(item.priceFromPaise)}</span>
                  <span className="text-[15px] text-[#717171] dark:text-slate-400">night</span>
                </div>
                {reviewSummary.count > 0 ? (
                  <span className="inline-flex items-center gap-1 text-sm">
                    <Star className="h-3.5 w-3.5 fill-[#222222] dark:fill-slate-100" aria-hidden="true" />
                    {reviewSummary.rating.toFixed(2)} · {reviewSummary.count}
                  </span>
                ) : (
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">New</span>
                )}
              </div>

              <div className="mt-4 overflow-hidden rounded-xl border border-[#b0b0b0] dark:border-slate-600">
                <div className="grid grid-cols-2 divide-x divide-[#b0b0b0] dark:divide-slate-600">
                  <label className="px-3 py-2.5">
                    <span className="block text-[10px] font-bold uppercase tracking-wide">Check-in</span>
                    <input
                      type="date"
                      value={checkIn}
                      min={today}
                      onChange={(event) => {
                        const nextIn = event.target.value;
                        setCheckIn(nextIn);
                        const nextOut = nextIn && (!checkOut || checkOut <= nextIn) ? isoLocal(addDays(new Date(`${nextIn}T00:00:00`), 1)) : checkOut;
                        setCheckOut(nextOut);
                        onPickDates(nextIn, nextOut);
                      }}
                      className="w-full bg-transparent text-sm outline-none dark:text-slate-100"
                    />
                  </label>
                  <label className="px-3 py-2.5">
                    <span className="block text-[10px] font-bold uppercase tracking-wide">Checkout</span>
                    <input
                      type="date"
                      value={checkOut}
                      min={checkIn || today}
                      onChange={(event) => {
                        const nextOut = event.target.value;
                        setCheckOut(nextOut);
                        onPickDates(checkIn, nextOut);
                      }}
                      className="w-full bg-transparent text-sm outline-none dark:text-slate-100"
                    />
                  </label>
                </div>
                <div className="flex items-center justify-between border-t border-[#b0b0b0] px-3 py-2.5 dark:border-slate-600">
                  <div>
                    <span className="block text-[10px] font-bold uppercase tracking-wide">Guests</span>
                    <span className="text-sm">{guests} guest{guests === 1 ? '' : 's'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => { const next = Math.max(1, guests - 1); setGuests(next); onGuestChange(next); }} aria-label="Decrease guests" className="flex h-9 w-9 items-center justify-center rounded-full border border-[#b0b0b0] transition hover:border-[#222222] dark:border-slate-600">
                      <span aria-hidden="true">−</span>
                    </button>
                    <button type="button" onClick={() => { const next = Math.min(16, guests + 1); setGuests(next); onGuestChange(next); }} aria-label="Increase guests" className="flex h-9 w-9 items-center justify-center rounded-full border border-[#b0b0b0] transition hover:border-[#222222] dark:border-slate-600">
                      <span aria-hidden="true">+</span>
                    </button>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (previewOnly) return;
                  if (nights <= 0) {
                    // Never leave the primary action as a dead disabled button:
                    // guide the guest to the dates the server needs.
                    document.getElementById('stay-booking-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    document.querySelector<HTMLInputElement>('#stay-booking-panel input[type="date"]')?.focus();
                    return;
                  }
                  onReserve();
                }}
                disabled={previewOnly}
                className="mt-4 hidden min-h-[50px] w-full items-center justify-center rounded-xl bg-[#f97316] px-4 text-base font-bold text-white transition hover:bg-[#ea580c] disabled:cursor-not-allowed disabled:opacity-60 lg:flex"
              >
                {previewOnly ? 'Sample listing — not bookable' : nights <= 0 ? 'Check availability' : 'Reserve'}
              </button>
              {previewOnly && (
                <p role="note" className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium leading-5 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                  Sample listing. Dates and totals can be explored, but preview inventory
                  cannot be reserved or paid for. Open a live local test stay to complete a booking.
                </p>
              )}
              <p className="mt-2 text-center text-xs text-[#717171] dark:text-slate-400">You won’t be charged yet</p>

              {nights > 0 ? (
                <dl className="mt-4 space-y-2 border-t border-[#ebebeb] pt-4 text-sm dark:border-slate-800" aria-label="Price breakdown">
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-[#717171] dark:text-slate-400">
                      {formatInr(item.priceFromPaise)} × {nights} night{nights === 1 ? '' : 's'}
                    </dt>
                    <dd className="shrink-0 tabular-nums">{formatInr(estimatedSubtotal)}</dd>
                  </div>
                  {estimatedCleaning > 0 && (
                    <div className="flex items-start justify-between gap-3">
                      <dt className="text-[#717171] dark:text-slate-400">Cleaning fee</dt>
                      <dd className="shrink-0 tabular-nums">{formatInr(estimatedCleaning)}</dd>
                    </div>
                  )}
                  {estimatedService > 0 && (
                    <div className="flex items-start justify-between gap-3">
                      <dt className="text-[#717171] dark:text-slate-400">BookOurSpace service fee</dt>
                      <dd className="shrink-0 tabular-nums">{formatInr(estimatedService)}</dd>
                    </div>
                  )}
                  {estimatedTaxes > 0 && (
                    <div className="flex items-start justify-between gap-3">
                      <dt className="text-[#717171] dark:text-slate-400">Taxes ({item.taxPercent}%)</dt>
                      <dd className="shrink-0 tabular-nums">{formatInr(estimatedTaxes)}</dd>
                    </div>
                  )}
                  <div className="flex items-start justify-between gap-3 border-t border-[#ebebeb] pt-3 text-base font-semibold dark:border-slate-800">
                    <dt>Total</dt>
                    <dd className="shrink-0 tabular-nums">{formatInr(estimatedTotal)}</dd>
                  </div>
                </dl>
              ) : (
                <p className="mt-4 text-sm text-[#717171] dark:text-slate-400">Add your dates to see the total for the stay.</p>
              )}
              {!isAuthenticated && !previewOnly && (
                <p className="mt-2 text-center text-[11px] font-medium text-amber-700 dark:text-amber-300">Continue with Google at checkout. Dates and guest details are kept.</p>
              )}

              <p className="mt-4 rounded-xl bg-[#f7f7f7] p-3 text-[11px] leading-5 text-[#717171] dark:bg-slate-800 dark:text-slate-300">
                A reservation is only created after the server confirms a room for your dates. UPI payments count as paid only after the payment provider confirms settlement; pay-at-property bookings are recorded as unpaid.
              </p>
            </div>
          </aside>
        </div>
      </div>

      {hostProfileOpen && item.hostId && (
        <React.Suspense fallback={null}>
          <StayHostProfileModal hostId={item.hostId} onClose={() => setHostProfileOpen(false)} />
        </React.Suspense>
      )}

      {lightbox !== null && item.images.length > 0 && (
        <div className="fixed inset-0 z-[110] flex flex-col bg-black/95 text-white" role="dialog" aria-modal="true" aria-label="Photo gallery">
          <div className="flex h-16 items-center justify-between px-4">
            <span className="text-sm">{lightbox + 1} / {item.images.length}</span>
            <button type="button" onClick={() => setLightbox(null)} className="inline-flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10" aria-label="Close photo gallery">
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          <div className="relative flex flex-1 items-center justify-center px-4 pb-6">
            {item.images.length > 1 && (
              <button type="button" onClick={() => setLightbox((lightbox - 1 + item.images.length) % item.images.length)} className="absolute left-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 hover:bg-white/20" aria-label="Previous photo">
                <ChevronLeft className="h-6 w-6" aria-hidden="true" />
              </button>
            )}
            <SafeImage category="stays" src={item.images[lightbox]} alt={`${item.name} photo ${lightbox + 1}`} className="max-h-full max-w-full object-contain" referrerPolicy="no-referrer" />
            {item.images.length > 1 && (
              <button type="button" onClick={() => setLightbox((lightbox + 1) % item.images.length)} className="absolute right-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 hover:bg-white/20" aria-label="Next photo">
                <ChevronRight className="h-6 w-6" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Airbnb-style sticky mobile booking bar: price and one-tap reserve stay
          reachable without scrolling back to the booking panel. */}
      <div className="fixed inset-x-0 bottom-0 z-[100] border-t border-[#dddddd] bg-white/95 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur lg:hidden dark:border-slate-700 dark:bg-slate-950/95">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold">
              {formatInr(item.priceFromPaise)} <span className="text-sm font-normal text-[#717171] dark:text-slate-400">night</span>
            </p>
            <p className="truncate text-xs text-[#717171] dark:text-slate-400">
              {nights > 0 ? `${nights} night${nights === 1 ? '' : 's'} · ${formatInr(estimatedTotal)} total` : 'Add dates for the total'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (previewOnly) return;
              if (nights <= 0) {
                document.getElementById('stay-booking-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                return;
              }
              onReserve();
            }}
            disabled={previewOnly}
            className="shrink-0 rounded-xl bg-[#f97316] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#ea580c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f97316] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {previewOnly ? 'Sample listing' : nights <= 0 ? 'Check availability' : 'Reserve'}
          </button>
        </div>
      </div>
    </div>
  );
}
