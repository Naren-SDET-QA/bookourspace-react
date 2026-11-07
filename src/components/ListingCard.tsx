import React, { useState } from 'react';
import SafeImage, { imageCategoryFor } from './SafeImage';
import { 
  Star, 
  MapPin, 
  ShieldCheck, 
  Eye, 
  Calendar, 
  Check, 
  Phone, 
  Share2, 
  Heart,
  Sparkles,
  Zap,
  ExternalLink,
  Link2,
  Edit3,
  Image as ImageIcon,
  Crown,
  Video,
  ChevronLeft,
  ChevronRight,
  Users,
  Wifi,
  Car,
  Utensils,
  MessageCircle,
  ArrowRight,
  Info,
  Award,
  TrendingUp
} from 'lucide-react';
import { MarketplaceListing, PriceBreakdown } from '../types/marketplace';
import { LastUpdated } from './ui/LastUpdated';
import { buildDefaultPriceBreakdown } from '../data/listingPrice';
import { useMarketplace } from '../context/MarketplaceContext';
import { 
  AppLanguage, 
  translations, 
  getSubcategoryDisplayName,
  getProviderDisplayName,
  getListingTitle,
  getPriceUnitDisplayName
} from '../utils/translations';
import {
  getUILabels,
  localizeAreaName,
  ensureChosenLanguageText
} from '../utils/i18nEngine';
import { UniversalBarcode, generateBosBarcodeId, getBarcodePassTitle } from './UniversalBarcode';
import { CourseCalendarModal } from './CourseCalendarAndSuccessModal';

export type HotelStayDurationMode = 'hourly' | 'daily' | 'weekly' | 'monthly';

interface ListingCardProps {
  listing: MarketplaceListing;
  onSelect: (listing: MarketplaceListing) => void;
  onBookNow: (listing: MarketplaceListing) => void;
  onEnquire: (listing: MarketplaceListing) => void;
  onRateReview?: (listing: MarketplaceListing) => void;
  onOpenRunningBatches?: (listing: MarketplaceListing) => void;
  isCompared?: boolean;
  onToggleCompare?: (listing: MarketplaceListing) => void;
  currentLang?: AppLanguage;
  selectedDateRange?: { startDate: string; endDate: string };
}

export const ListingCard: React.FC<ListingCardProps> = ({
  listing,
  onSelect,
  onBookNow,
  onEnquire,
  onOpenRunningBatches,
  isCompared = false,
  onToggleCompare,
  currentLang = 'en',
  selectedDateRange,
}) => {
  const { updateListing, favoriteIds, toggleFavorite } = useMarketplace();
  const t = translations[currentLang] || translations.en;
  const ui = getUILabels(currentLang);
  const isWishlisted = favoriteIds.includes(listing.id);
  const [justShared, setJustShared] = useState(false);
  const [showPriceBreakdown, setShowPriceBreakdown] = useState(false);
  const [isCourseCalendarOpen, setIsCourseCalendarOpen] = useState(false);
  const [showBatchLinkInput, setShowBatchLinkInput] = useState(false);
  const [imgIndex, setImgIndex] = useState(0);
  const [tourPlaying, setTourPlaying] = useState(false);
  const [showRoomDetails, setShowRoomDetails] = useState(false);

  const defaultHotelMode: HotelStayDurationMode =
    (listing.customFieldValues?.defaultStayMode as HotelStayDurationMode) ||
    (listing.categoryId === 'hotel-hourly' ? 'hourly' : 'daily');
  const [hotelStayMode, setHotelStayMode] = useState<HotelStayDurationMode>(defaultHotelMode);

  const runningBatchUrl =
    listing.runningBatchUrl ||
    String(listing.customFieldValues?.runningBatchUrl || '');

  const batchImages: string[] =
    listing.batchScheduleImages ||
    (Array.isArray(listing.customFieldValues?.batchScheduleImages)
      ? (listing.customFieldValues?.batchScheduleImages as string[])
      : []);

  const hasRunningBatches = Boolean(runningBatchUrl || batchImages.length > 0);

  const [draftBatchUrl, setDraftBatchUrl] = useState(runningBatchUrl);

  const distKm = listing.distanceKm ?? listing.location?.distanceKm ?? 2.5;
  const subcategoryDisplay = getSubcategoryDisplayName(listing.subcategory, currentLang);
  const displayTitle = getListingTitle(listing, currentLang);
  const rawProviderName =
    currentLang === 'te'
      ? listing.providerNameTe || listing.providerName
      : listing.providerName;
  const displayProviderName = getProviderDisplayName(rawProviderName, currentLang, distKm);

  const rawPriceUnit =
    currentLang === 'te'
      ? listing.priceUnitTe || listing.priceUnit
      : listing.priceUnit;
  const displayPriceUnit = getPriceUnitDisplayName(rawPriceUnit, currentLang);

  const localizedArea = localizeAreaName(listing.location.area, currentLang);

  const originalPrice = listing.price > 0 ? Math.round(listing.price * 1.25) : 0;
  const discountPercent = 20;

  const resolvedPriceBreakdown: PriceBreakdown =
    listing.priceBreakdown || buildDefaultPriceBreakdown(listing);

  const renderPriceBreakdownPopover = (targetTotal: number, unitLabel: string) => {
    const baseTotal = listing.price > 0 ? listing.price : targetTotal;
    const scaleRatio = baseTotal > 0 ? targetTotal / baseTotal : 1;

    const baseAmount = Math.round((resolvedPriceBreakdown.baseRent || 0) * scaleRatio);
    const maintenanceAmount = Math.round((resolvedPriceBreakdown.maintenance || 0) * scaleRatio);
    const taxAmount = resolvedPriceBreakdown.taxes
      ? Math.round(resolvedPriceBreakdown.taxes * scaleRatio)
      : 0;
    const serviceFeeAmount = Math.max(
      0,
      targetTotal - baseAmount - maintenanceAmount - taxAmount
    );

    const baseLabel =
      currentLang === 'te'
        ? resolvedPriceBreakdown.baseLabelTe || resolvedPriceBreakdown.baseLabel || 'బేస్ అద్దె / ధర'
        : currentLang === 'hi'
        ? resolvedPriceBreakdown.baseLabelHi || resolvedPriceBreakdown.baseLabel || 'मूल किराया / शुल्क'
        : resolvedPriceBreakdown.baseLabel || 'Base Rent / Tariff';

    const maintenanceLabel =
      currentLang === 'te'
        ? resolvedPriceBreakdown.maintenanceLabelTe ||
          resolvedPriceBreakdown.maintenanceLabel ||
          'నిర్వహణ & సౌకర్యాలు'
        : currentLang === 'hi'
        ? resolvedPriceBreakdown.maintenanceLabelHi ||
          resolvedPriceBreakdown.maintenanceLabel ||
          'रखरखाव और सुविधाएं'
        : resolvedPriceBreakdown.maintenanceLabel || 'Maintenance & Amenities';

    const serviceFeeLabel =
      currentLang === 'te'
        ? resolvedPriceBreakdown.serviceFeeLabelTe ||
          resolvedPriceBreakdown.serviceFeeLabel ||
          'సర్వీస్ ఫీజు'
        : currentLang === 'hi'
        ? resolvedPriceBreakdown.serviceFeeLabelHi ||
          resolvedPriceBreakdown.serviceFeeLabel ||
          'सेवा शुल्क'
        : resolvedPriceBreakdown.serviceFeeLabel || 'Service & Support Fee';

    const taxLabel =
      currentLang === 'te'
        ? resolvedPriceBreakdown.taxLabelTe || resolvedPriceBreakdown.taxLabel || 'GST & పన్నులు'
        : currentLang === 'hi'
        ? resolvedPriceBreakdown.taxLabelHi || resolvedPriceBreakdown.taxLabel || 'जीएसटी और कर'
        : resolvedPriceBreakdown.taxLabel || 'GST & Taxes';

    return (
      <div
        role="tooltip"
        onClick={(e) => e.stopPropagation()}
        onMouseEnter={() => setShowPriceBreakdown(true)}
        onMouseLeave={() => setShowPriceBreakdown(false)}
        className="absolute left-0 bottom-full mb-2 w-68 sm:w-72 p-3 rounded-xl bg-slate-900/98 backdrop-blur-md text-white text-[11px] shadow-2xl border border-indigo-500/40 space-y-1.5 z-40 animate-in fade-in zoom-in-95 duration-150"
      >
        <div className="font-black text-amber-300 border-b border-slate-700/80 pb-1.5 flex items-center justify-between gap-2">
          <span className="flex items-center gap-1">
            <Info className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>
              {currentLang === 'te'
                ? 'పారదర్శక ధర వివరాలు'
                : currentLang === 'hi'
                ? 'पारदर्शी मूल्य विवरण'
                : 'Transparent Price Breakdown'}
            </span>
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowPriceBreakdown(false);
            }}
            className="text-[10px] text-slate-400 hover:text-white px-1 rounded cursor-pointer"
            aria-label="Close price breakdown"
          >
            ✕
          </button>
        </div>

        {resolvedPriceBreakdown.items && resolvedPriceBreakdown.items.length > 0 ? (
          resolvedPriceBreakdown.items.map((item, idx) => (
            <div key={idx} className="flex items-center justify-between gap-2">
              <span className="text-slate-300 truncate">
                {currentLang === 'te'
                  ? item.labelTe || item.label
                  : currentLang === 'hi'
                  ? item.labelHi || item.label
                  : item.label}
                :
              </span>
              <span className="font-bold tabular-nums shrink-0">
                ₹{Math.round(item.amount * scaleRatio).toLocaleString('en-IN')}
              </span>
            </div>
          ))
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-300 truncate">{baseLabel}:</span>
              <span className="font-bold tabular-nums shrink-0">
                ₹{baseAmount.toLocaleString('en-IN')}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-300 truncate">{maintenanceLabel}:</span>
              <span className="font-bold tabular-nums shrink-0">
                ₹{maintenanceAmount.toLocaleString('en-IN')}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-300 truncate">{serviceFeeLabel}:</span>
              <span className="font-bold tabular-nums shrink-0">
                {serviceFeeAmount === 0
                  ? 'FREE (₹0)'
                  : `₹${serviceFeeAmount.toLocaleString('en-IN')}`}
              </span>
            </div>
            {taxAmount > 0 && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-300 truncate">{taxLabel}:</span>
                <span className="font-bold tabular-nums shrink-0">
                  ₹{taxAmount.toLocaleString('en-IN')}
                </span>
              </div>
            )}
          </>
        )}

        <div className="flex items-center justify-between pt-1.5 border-t border-slate-700/80 font-black text-emerald-400 text-xs">
          <span>
            {currentLang === 'te'
              ? 'మొత్తం ధర:'
              : currentLang === 'hi'
              ? 'कुल मूल्य:'
              : 'Total Price:'}
          </span>
          <span className="tabular-nums">
            ₹{targetTotal.toLocaleString('en-IN')}
            {unitLabel}
          </span>
        </div>

        {typeof resolvedPriceBreakdown.securityDeposit === 'number' &&
          resolvedPriceBreakdown.securityDeposit > 0 && (
            <div className="flex items-center justify-between text-[10px] text-indigo-300 pt-0.5">
              <span>Refundable Deposit:</span>
              <span className="font-bold tabular-nums">
                ₹{resolvedPriceBreakdown.securityDeposit.toLocaleString('en-IN')}
              </span>
            </div>
          )}

        {resolvedPriceBreakdown.notes && (
          <div className="text-[10px] text-emerald-300/90 bg-emerald-950/60 border border-emerald-700/40 rounded-lg px-2 py-1 font-semibold">
            ✓ {resolvedPriceBreakdown.notes}
          </div>
        )}
      </div>
    );
  };

  const isClass =
    listing.categoryId.startsWith('class-') ||
    ['cat-15', 'cat-16', 'cat-17'].includes(listing.categoryId) ||
    listing.customFieldValues?.sectionType === 'classes';
  const isPG =
    listing.categoryId.startsWith('pg-') ||
    listing.categoryId === 'cat-26' ||
    listing.customFieldValues?.sectionType === 'pg_hostels';
  const isVenue =
    listing.categoryId.startsWith('venue-') ||
    ['cat-29', 'cat-30', 'cat-43'].includes(listing.categoryId) ||
    listing.customFieldValues?.sectionType === 'venues';
  const isHotel =
    listing.categoryId.startsWith('hotel-') ||
    listing.customFieldValues?.sectionType === 'hotel_stay';
  const isMovie =
    listing.categoryId.startsWith('movie-') ||
    listing.customFieldValues?.sectionType === 'movies';
  const contactActionLabel = isMovie
    ? t.bookNow
    : isHotel || isVenue
      ? currentLang === 'te' ? 'అందుబాటును అడగండి' : 'Request availability'
      : currentLang === 'te' ? 'ప్రొవైడర్‌ను సంప్రదించండి' : 'Contact provider';
  const isService = !isPG && !isClass && !isVenue && !isHotel && !isMovie;

  const handleSaveBatchUrl = (e: React.FormEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const trimmed = draftBatchUrl.trim();
    updateListing(listing.id, {
      runningBatchUrl: trimmed,
      customFieldValues: {
        ...listing.customFieldValues,
        runningBatchUrl: trimmed,
      },
    });
    setShowBatchLinkInput(false);
  };

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const shareUrl = window.location.href;
    const shareText = `${displayTitle} - ₹${listing.price.toLocaleString('en-IN')}${displayPriceUnit} (${localizedArea})`;
    if (navigator.share) {
      try {
        await navigator.share({ title: displayTitle, text: shareText, url: shareUrl });
        setJustShared(true);
        setTimeout(() => setJustShared(false), 2000);
        return;
      } catch (err: any) {
        if (err.name === 'AbortError') return;
      }
    }
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
        setJustShared(true);
        setTimeout(() => setJustShared(false), 2500);
      }
    } catch {}
  };

  const isSpotlightCard = Boolean(listing.isFeatured || hasRunningBatches || listing.providerRating >= 4.8);

  // Dedicated Hotel & Stay Card (Matches Royal Choice Hourly / Daily / Weekly / Monthly Layout)
  if (isHotel) {
    const galleryImages =
      listing.images && listing.images.length > 0
        ? listing.images
        : ['https://images.unsplash.com/photo-1540541338287-41700207dee6?auto=format&fit=crop&w=1000&q=85'];
    const safeImgIndex = imgIndex % galleryImages.length;

    const baseDailyPrice = Number(
      listing.customFieldValues?.dailyPrice ||
        (listing.categoryId === 'hotel-hourly' ? Math.round(listing.price * 2.2) : listing.price)
    );
    const hourlyPrice = Number(
      listing.customFieldValues?.hourlyPrice ||
        (listing.categoryId === 'hotel-hourly' ? listing.price : Math.round(baseDailyPrice * 0.36))
    );
    const weeklyPrice = Number(
      listing.customFieldValues?.weeklyPrice || Math.round(baseDailyPrice * 6)
    );
    const monthlyPrice = Number(
      listing.customFieldValues?.monthlyPrice || Math.round(baseDailyPrice * 20)
    );
    const hotelDiscount = Number(listing.customFieldValues?.discountPercent || 15);

    const activeHotelPrice =
      hotelStayMode === 'hourly'
        ? hourlyPrice
        : hotelStayMode === 'daily'
        ? baseDailyPrice
        : hotelStayMode === 'weekly'
        ? weeklyPrice
        : monthlyPrice;

    const activeHotelUnit =
      hotelStayMode === 'hourly'
        ? currentLang === 'te'
          ? '/3 గంటలకు'
          : currentLang === 'hi'
          ? '/3 घंटे'
          : '/3 hrs'
        : hotelStayMode === 'daily'
        ? currentLang === 'te'
          ? '/రోజుకు'
          : currentLang === 'hi'
          ? '/दिन'
          : '/day'
        : hotelStayMode === 'weekly'
        ? currentLang === 'te'
          ? '/వారానికి'
          : currentLang === 'hi'
          ? '/सप्ताह'
          : '/week'
        : currentLang === 'te'
        ? '/నెలకు'
        : currentLang === 'hi'
        ? '/महीना'
        : '/month';

    const activeCheckIn =
      hotelStayMode === 'hourly'
        ? 'Flexi 24/7 (3h/6h)'
        : String(listing.customFieldValues?.checkInTime || '02:00 PM (24/7 Flex)');

    const activeCheckOut =
      hotelStayMode === 'hourly'
        ? '3h / 6h / 12h Slot'
        : String(listing.customFieldValues?.checkOutTime || '12:00 PM');

    const hotelCategoryBadge =
      currentLang === 'te'
        ? String(
            listing.customFieldValues?.hotelCategoryBadgeTe ||
              listing.subcategoryTe ||
              '5-స్టార్ లగ్జరీ హోటల్'
          )
        : String(
            listing.customFieldValues?.hotelCategoryBadgeEn ||
              listing.subcategory ||
              '5-Star Luxury Hotel'
          );

    const guestCapacityLabel =
      currentLang === 'te'
        ? String(listing.customFieldValues?.guestCapacityTe || '3 అతిథులు')
        : String(listing.customFieldValues?.guestCapacityEn || '3 Guests');

    const roomSpecLine =
      currentLang === 'te'
        ? String(
            listing.customFieldValues?.roomSpecLineTe ||
              'గ్రాండ్ డీలక్స్ ప్యాలెస్ రూమ్ • 1 బెడ్‌రూమ్ • 1 బాత్‌రూమ్'
          )
        : String(
            listing.customFieldValues?.roomSpecLineEn ||
              listing.customFieldValues?.roomCategory ||
              'Grand Deluxe Palace Room • 1 Bedroom • 1 Bathroom'
          );

    const stayModeTabs: { id: HotelStayDurationMode; label: string }[] = [
      {
        id: 'hourly',
        label: currentLang === 'te' ? 'గంటల వారీ' : currentLang === 'hi' ? 'घंटे वार' : 'Hourly',
      },
      {
        id: 'daily',
        label: currentLang === 'te' ? 'రోజు వారీ' : currentLang === 'hi' ? 'दैनिक' : 'Daily',
      },
      {
        id: 'weekly',
        label: currentLang === 'te' ? 'వారం' : currentLang === 'hi' ? 'साप्ताहिक' : 'Weekly',
      },
      {
        id: 'monthly',
        label: currentLang === 'te' ? 'నెల' : currentLang === 'hi' ? 'मासिक' : 'Monthly',
      },
    ];

    const buildHotelPayload = (): MarketplaceListing => ({
      ...listing,
      price: activeHotelPrice,
      priceUnit: activeHotelUnit,
      priceUnitTe: activeHotelUnit,
      customFieldValues: {
        ...listing.customFieldValues,
        selectedStayMode: hotelStayMode,
        checkInTime: activeCheckIn,
        checkOutTime: activeCheckOut,
        ...(selectedDateRange?.startDate
          ? {
              selectedCheckInDate: selectedDateRange.startDate,
              selectedCheckOutDate: selectedDateRange.endDate || selectedDateRange.startDate,
            }
          : {}),
      },
    });

    return (
      <div
        data-listing-city={listing.location?.city || ''}
        onClick={() => onSelect(buildHotelPayload())}
        className={`group relative bg-white dark:bg-slate-900 rounded-3xl border transition-all duration-300 flex flex-col justify-between overflow-hidden hover:-translate-y-1 hover:shadow-2xl cursor-pointer ${
          isCompared
            ? 'border-[#5B21B6] ring-2 ring-[#5B21B6]/30 shadow-lg'
            : 'border-purple-200/90 dark:border-purple-800/60 shadow-md hover:border-[#6D28D9]'
        }`}
      >
        {/* Top Luxury Hotel Image Carousel (Compact) */}
        <div className="relative h-36 w-full bg-slate-900 overflow-hidden select-none">
          <SafeImage
            src={galleryImages[safeImgIndex]}
            alt={displayTitle}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            category="stays"
            sizes="(max-width: 640px) 92vw, (max-width: 1024px) 48vw, 360px"
          />

          {/* Subtle dark gradient scrim at top and bottom */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-black/30 pointer-events-none" />

          {/* Top-Left Royal Choice & Verified Badges */}
          <div className="absolute top-3 left-3 flex items-center gap-2 flex-wrap z-10">
            <div className="bg-[#F59E0B] text-slate-950 font-black text-xs px-3 py-1.5 rounded-full shadow-md flex items-center gap-1.5">
              <Crown className="w-3.5 h-3.5 fill-slate-950 text-slate-950 shrink-0" />
              <span>
                {currentLang === 'te'
                  ? 'రాయల్ ఛాయిస్'
                  : currentLang === 'hi'
                  ? 'रॉयल चॉइस'
                  : 'Royal Choice'}
              </span>
            </div>

            {listing.isVerified && (
              <div className="bg-[#059669] text-white font-black text-xs px-3 py-1.5 rounded-full shadow-md flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-white shrink-0" />
                <span>
                  {currentLang === 'te'
                    ? 'ధృవీకరించబడింది'
                    : currentLang === 'hi'
                    ? 'सत्यापित'
                    : 'Verified'}
                </span>
              </div>
            )}
          </div>

          {/* Top-Right 45s Tour & Wishlist Heart */}
          <div className="absolute top-3 right-3 flex items-center gap-2 z-10">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setTourPlaying((prev) => !prev);
                setImgIndex((prev) => (prev + 1) % galleryImages.length);
              }}
              className={`px-3 py-1.5 rounded-full font-black text-xs flex items-center gap-1.5 shadow-md backdrop-blur-md transition-all cursor-pointer ${
                tourPlaying
                  ? 'bg-amber-400 text-slate-950 ring-2 ring-white'
                  : 'bg-slate-900/80 hover:bg-slate-900 text-amber-400 border border-amber-400/30'
              }`}
            >
              <Video className="w-3.5 h-3.5 shrink-0" />
              <span>
                {tourPlaying
                  ? currentLang === 'te'
                    ? 'టూర్ ప్లే అవుతోంది...'
                    : 'Playing Tour...'
                  : String(listing.customFieldValues?.tourDuration || '45s Tour')}
              </span>
            </button>

            <button
              type="button"
              onClick={handleShare}
              title="Share Listing via Web Share / WhatsApp"
              className="w-9 h-9 rounded-full bg-black/45 hover:bg-black/65 text-white border border-white/20 backdrop-blur-md shadow-md flex items-center justify-center transition-transform active:scale-90 cursor-pointer"
            >
              {justShared ? <Check className="w-4 h-4 text-emerald-400" /> : <Share2 className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleFavorite(listing.id);
              }}
              title="Save to Favorites"
              className={`w-9 h-9 rounded-full backdrop-blur-md shadow-md flex items-center justify-center transition-transform active:scale-90 cursor-pointer ${
                isWishlisted
                  ? 'bg-rose-500 text-white'
                  : 'bg-black/45 hover:bg-black/65 text-white border border-white/20'
              }`}
            >
              <Heart className={`w-4 h-4 ${isWishlisted ? 'fill-current' : ''}`} />
            </button>
          </div>

          {/* Left & Right Carousel Navigation Arrows */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setImgIndex((prev) => (prev - 1 + galleryImages.length) % galleryImages.length);
            }}
            className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/45 hover:bg-black/75 text-white flex items-center justify-center backdrop-blur-xs transition-all active:scale-90 cursor-pointer z-10"
            aria-label="Previous image"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setImgIndex((prev) => (prev + 1) % galleryImages.length);
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/45 hover:bg-black/75 text-white flex items-center justify-center backdrop-blur-xs transition-all active:scale-90 cursor-pointer z-10"
            aria-label="Next image"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          {/* Bottom Location, Distance & Rating Bar */}
          <div className="absolute bottom-3 inset-x-3 flex items-center justify-between gap-2 z-10">
            <div className="flex items-center gap-1.5 min-w-0">
              <MapPin className="w-4 h-4 text-[#FACC15] shrink-0" />
              <span className="text-white font-bold text-xs truncate drop-shadow-xs">
                {listing.location.area}
              </span>
              <span className="bg-[#581C87]/95 text-purple-100 font-black text-[11px] px-2 py-0.5 rounded-md shrink-0 border border-purple-400/30">
                {distKm} km
              </span>
            </div>

            <div className="bg-black/75 backdrop-blur-md border border-amber-400/40 px-2.5 py-1 rounded-full flex items-center gap-1 shrink-0 shadow-sm">
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
              <span className="text-amber-400 font-black text-xs tabular-nums">
                {listing.providerRating}
              </span>
              <span className="text-slate-200 text-[11px] font-medium tabular-nums">
                ({listing.reviewCount})
              </span>
            </div>
          </div>
        </div>

        {/* Hotel Card Content Body (Compact) */}
        <div className="p-2.5 flex-1 flex flex-col justify-between space-y-2">
          <div className="space-y-1.5">
            {/* Row 1: Category Pill + Guest Count */}
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center px-3 py-1 rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50/70 dark:bg-purple-950/50 text-[#5B21B6] dark:text-purple-300 font-black text-xs">
                {hotelCategoryBadge}
              </span>

              <div className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-bold text-xs">
                <Users className="w-4 h-4 text-[#7C3AED]" />
                <span>{guestCapacityLabel}</span>
              </div>
            </div>

            {/* Row 2: Hotel Title in Royal Purple */}
            <h3 className="text-base sm:text-[18px] font-black text-[#6D28D9] dark:text-purple-300 leading-snug line-clamp-2 group-hover:text-[#4C1D95] transition-colors">
              {displayTitle}
            </h3>

            {/* Row 3: Room Type • Bedroom • Bathroom */}
            <div className="flex items-center gap-1.5 text-xs sm:text-[13px] font-medium text-slate-600 dark:text-slate-300">
              <span className="shrink-0">🛏️</span>
              <span className="truncate">{roomSpecLine}</span>
            </div>

            {/* Row 4: 4-Way Stay Duration Switcher (గంటల వారీ | రోజు వారీ | వారం | నెల) */}
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-slate-100/95 dark:bg-slate-800 p-1 rounded-2xl grid grid-cols-4 gap-1 border border-slate-200/70 dark:border-slate-700"
            >
              {stayModeTabs.map((tab) => {
                const isActive = hotelStayMode === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setHotelStayMode(tab.id)}
                    className={`py-2 px-1.5 rounded-xl text-xs font-black transition-all cursor-pointer truncate ${
                      isActive
                        ? 'bg-[#4A148C] text-white shadow-sm scale-[1.01]'
                        : 'text-slate-600 dark:text-slate-300 hover:text-[#4A148C] hover:bg-white/60'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Row 5: Dynamic Price & Check-in / Check-out Split Row */}
            <div className="pt-1 flex items-start justify-between gap-2 relative">
              <div className="relative">
                <div className="flex items-baseline gap-1.5 flex-wrap">
                  <span className="text-2xl font-black text-[#3B0764] dark:text-white tracking-tight tabular-nums">
                    ₹{activeHotelPrice.toLocaleString('en-IN')}
                  </span>
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                    {activeHotelUnit}
                  </span>
                  <button
                    type="button"
                    aria-label="View transparent price breakdown"
                    aria-expanded={showPriceBreakdown}
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowPriceBreakdown((v) => !v);
                    }}
                    onMouseEnter={() => setShowPriceBreakdown(true)}
                    onMouseLeave={() => setShowPriceBreakdown(false)}
                    className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-purple-100/80 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-900 transition cursor-pointer"
                    title="Hover or tap for transparent price breakdown"
                  >
                    <Info className="w-3.5 h-3.5" />
                  </button>
                  <span className="bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 font-black text-[11px] px-2.5 py-0.5 rounded-full">
                    {hotelDiscount}% OFF
                  </span>
                </div>
                <div className="text-xs text-slate-400 dark:text-slate-500 font-medium mt-0.5">
                  {currentLang === 'te'
                    ? 'పన్నులతో కలిపి (ⓘ ధర వివరాలు)'
                    : currentLang === 'hi'
                    ? 'सभी करों सहित'
                    : 'Inclusive of taxes (Hover/tap ⓘ for breakdown)'}
                </div>

                {showPriceBreakdown && renderPriceBreakdownPopover(activeHotelPrice, activeHotelUnit)}
              </div>

              <div className="text-right text-[11px] sm:text-xs leading-relaxed shrink-0">
                <div className="text-slate-500 dark:text-slate-400">
                  Check-in:{' '}
                  <span className="font-black text-slate-800 dark:text-slate-100">
                    {activeCheckIn}
                  </span>
                </div>
                <div className="text-slate-500 dark:text-slate-400">
                  Check-out:{' '}
                  <span className="font-black text-slate-800 dark:text-slate-100">
                    {activeCheckOut}
                  </span>
                </div>
              </div>
            </div>

            {/* Row 6: Amenities Chips (Wi-Fi, Parking, Complimentary Breakfast) */}
            <div className="flex items-center gap-2 flex-wrap pt-0.5">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200 text-xs font-semibold">
                <Wifi className="w-3.5 h-3.5 text-[#7C3AED]" />
                <span>Wi-Fi</span>
              </span>

              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200 text-xs font-semibold">
                <Car className="w-3.5 h-3.5 text-emerald-600" />
                <span>Parking</span>
              </span>

              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl border border-amber-300/90 dark:border-amber-700 bg-amber-50/60 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 text-xs font-bold max-w-[175px] truncate">
                <Utensils className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span className="truncate">
                  {String(listing.customFieldValues?.breakfastIncluded || 'Complimentary Breakfast')}
                </span>
              </span>
            </div>

            {/* Row 7: Couple Friendly & Safe for Families Pills */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-pink-200 dark:border-pink-800/60 bg-pink-50/80 dark:bg-pink-950/40 text-rose-700 dark:text-rose-300 text-xs font-black">
                <span>👩‍❤️‍👨</span>
                <span>
                  {currentLang === 'te'
                    ? 'కపుల్ ఫ్రెండ్లీ'
                    : currentLang === 'hi'
                    ? 'कपल फ्रेंडली'
                    : 'Couple Friendly'}
                </span>
              </span>

              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-blue-200 dark:border-blue-800/60 bg-blue-50/80 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 text-xs font-black">
                <span>👨‍👩‍👧‍👦</span>
                <span>
                  {currentLang === 'te'
                    ? 'కుటుంబాలకు సురక్షితం'
                    : currentLang === 'hi'
                    ? 'परिवार के लिए सुरक्षित'
                    : 'Safe for Families'}
                </span>
              </span>

              {selectedDateRange?.startDate && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 text-[11px] font-black">
                  <Calendar className="w-3 h-3 text-emerald-600" />
                  <span>
                    ✓ {selectedDateRange.startDate}
                    {selectedDateRange.endDate && selectedDateRange.endDate !== selectedDateRange.startDate
                      ? ` → ${selectedDateRange.endDate}`
                      : ''}
                  </span>
                </span>
              )}
            </div>
          </div>

          <LastUpdated at={listing.createdAt} label="Listed" className="block text-[10px] font-semibold text-slate-400" />

          {/* Row 9: Bottom 4-Action Bar (Call, WhatsApp/Chat, Visit, Online Booking ->) */}
          <div
            className="pt-1 flex items-center gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <a
              href={`tel:${listing.providerPhone}`}
              className="w-11 h-11 rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/40 hover:bg-emerald-100 text-emerald-600 flex items-center justify-center transition-all active:scale-95 shrink-0"
              title="Call Hotel Reception"
            >
              <Phone className="w-5 h-5" />
            </a>

            <button
              type="button"
              onClick={() => onEnquire(buildHotelPayload())}
              className="w-11 h-11 rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/40 hover:bg-emerald-100 text-emerald-600 flex items-center justify-center transition-all active:scale-95 shrink-0 cursor-pointer"
              title="Chat / Enquire"
            >
              <MessageCircle className="w-5 h-5" />
            </button>

            <button
              type="button"
              onClick={() => onSelect(buildHotelPayload())}
              className="h-11 px-3.5 rounded-2xl border border-purple-200 dark:border-purple-800 bg-purple-50/70 dark:bg-purple-950/50 hover:bg-purple-100 text-[#4A148C] dark:text-purple-200 font-black text-xs transition-all active:scale-95 shrink-0 cursor-pointer"
            >
              {currentLang === 'te' ? 'రూమ్ చూడండి' : currentLang === 'hi' ? 'रूम देखें' : 'See the Room'}
            </button>

            <button
              type="button"
              onClick={() => onBookNow(buildHotelPayload())}
              className="flex-1 h-11 px-4 rounded-2xl bg-gradient-to-r from-[#5B21B6] via-[#4A148C] to-[#3B0764] hover:from-[#4C1D95] hover:to-[#2E1065] text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md transition-all active:scale-95 cursor-pointer"
            >
              <span className="truncate">
                {currentLang === 'te'
                  ? 'ఆన్‌లైన్ బుకింగ్'
                  : currentLang === 'hi'
                  ? 'ऑनलाइन बुकिंग'
                  : 'Online Booking'}
              </span>
              <ArrowRight className="w-4 h-4 text-amber-400 shrink-0" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div 
      data-listing-city={listing.location?.city || ''}
      className={`group relative bg-white dark:bg-slate-900 border rounded-2xl transition-all duration-300 flex flex-col justify-between p-2.5 hover:-translate-y-0.5 hover:shadow-xl cursor-pointer ${
        isCompared 
          ? 'border-[#4338CA] ring-2 ring-[#4338CA]/30 shadow-md' 
          : isSpotlightCard
          ? 'border-[#4338CA]/40 dark:border-indigo-500/40 hover:border-[#4338CA] shadow-xs'
          : 'border-slate-200 dark:border-slate-800 hover:border-[#4338CA]/60'
      }`}
      onClick={() => onSelect(listing)}
    >
      {/* Compact Top Media Thumbnail Container */}
      <div className="relative h-36 w-full bg-slate-50 dark:bg-slate-800 rounded-xl overflow-hidden mb-2">
        <SafeImage
          src={listing.images[0] || 'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=600&q=80'}
          alt={displayTitle}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          category={imageCategoryFor(`${listing.categoryId} ${listing.entityType} ${listing.subcategory}`)}
          sizes="(max-width: 640px) 92vw, (max-width: 1024px) 48vw, 360px"
        />

        {/* Multi-image counter badge if listing has multiple images */}
        {listing.images && listing.images.length > 1 && (
          <div className="absolute top-2.5 right-22 bg-black/75 backdrop-blur-xs text-white text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1">
            <ImageIcon className="w-3 h-3 text-[#FFE500]" />
            <span>1/{listing.images.length}</span>
          </div>
        )}

        {/* Wishlist Heart Button (Top Right) — Persisted in localStorage */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleFavorite(listing.id);
          }}
          title="Save to Favorites"
          className={`absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-white/95 dark:bg-slate-900/90 shadow-md flex items-center justify-center transition-transform active:scale-90 cursor-pointer ${
            isWishlisted ? 'text-rose-500' : 'text-slate-400 hover:text-rose-500'
          }`}
        >
          <Heart className={`w-4 h-4 ${isWishlisted ? 'fill-current' : ''}`} />
        </button>

        {/* Share Button (Top Right beside Heart) — Uses Web Share API */}
        <button
          onClick={handleShare}
          title="Share via Web Share / WhatsApp"
          className="absolute top-2.5 right-12 w-8 h-8 rounded-full bg-white/95 dark:bg-slate-900/90 shadow-md flex items-center justify-center text-slate-500 hover:text-[#4338CA] transition-transform active:scale-90 cursor-pointer"
        >
          {justShared ? <Check className="w-4 h-4 text-emerald-600" /> : <Share2 className="w-3.5 h-3.5" />}
        </button>

        {/* Locality & Distance Pill (Bottom Left on Image) */}
        <div className="absolute bottom-2 left-2 flex items-center gap-1 bg-black/75 backdrop-blur-xs text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full">
          <MapPin className="w-3 h-3 text-[#FFE500]" />
          <span>{localizedArea} · {distKm} {ui.km}</span>
        </div>

        {/* Subcategory Quick-Eye Pill (Bottom Right on Image) */}
        <div className="absolute bottom-2 right-2 bg-[#FCE7F3]/95 text-[#0F172A] border border-[#4338CA]/40 text-[9px] font-black px-2 py-0.5 rounded-full shadow-xs max-w-[130px] truncate">
          {subcategoryDisplay}
        </div>

        {/* Eye-Catcher Spotlight / Featured Tag */}
        {isSpotlightCard && (
          <div className="absolute top-2.5 left-2 bg-gradient-to-r from-[#4338CA] via-[#6D28D9] to-[#DB2777] text-white font-black text-[9px] uppercase px-2.5 py-1 rounded-full shadow-md flex items-center gap-1 border border-white/30">
            <Sparkles className="w-3 h-3 fill-current text-[#FFE500]" />
            <span>
              {hasRunningBatches
                ? `🔥 ${ui.spotlightLiveBatches}`
                : listing.isFeatured
                ? `✨ ${ui.spotlightPick}`
                : `💎 ${ui.topRatedChoice}`}
            </span>
          </div>
        )}
      </div>

      {/* Compact Card Body */}
      <div className="flex-1 flex flex-col justify-between space-y-1.5">
        
        <div>
          {/* Subcategory Label + Psychological Social Proof */}
          <div className="flex items-center justify-between gap-1 text-[10px] font-extrabold uppercase tracking-wider text-[#4338CA] dark:text-indigo-300">
            <span className="truncate">{subcategoryDisplay}</span>
            <span className="text-[9px] font-black text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.2 rounded-full shrink-0">
              {isClass ? `⚡ ${ui.highEnrollment}` : isPG ? `⚡ ${ui.fastFilling}` : `⚡ ${ui.popularVenue}`}
            </span>
          </div>

          {/* Product Title Link (Compact 1-2 lines — opens same room details modal as 'See the Room') */}
          <h3
            onClick={(e) => {
              e.stopPropagation();
              onSelect(listing);
            }}
            className="text-xs sm:text-[13px] font-black text-slate-900 dark:text-white line-clamp-1 leading-snug group-hover:text-[#4338CA] dark:group-hover:text-indigo-300 hover:underline transition-colors mt-0.5 cursor-pointer"
          >
            {displayTitle}
          </h3>

          {/* Compact Rating + Provider Row */}
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <div className="inline-flex items-center gap-0.5 bg-[#15803D] text-white font-black text-[10px] px-1.5 py-0.5 rounded-md shadow-2xs tabular-nums">
              <span>{listing.providerRating}</span>
              <Star className="w-2.5 h-2.5 fill-current text-white" />
            </div>

            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium tabular-nums">
              ({listing.reviewCount})
            </span>

            <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 truncate ml-auto max-w-[120px] flex items-center gap-1">
              <span className="truncate">{displayProviderName}</span>
              {listing.isVerified && <ShieldCheck className="w-3 h-3 text-[#2874F0] shrink-0" />}
            </span>
          </div>
        </div>

        {/* Compact Pricing Block */}
        <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800 relative">
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span className="text-base sm:text-lg font-black text-slate-900 dark:text-white tracking-tight">
              {listing.price === 0 ? (
                <span className="text-[#388E3C]">{ui.free100}</span>
              ) : (
                `₹${listing.price.toLocaleString('en-IN')}`
              )}
            </span>

            {listing.price > 0 && (
              <button
                type="button"
                aria-label="View transparent price breakdown"
                aria-expanded={showPriceBreakdown}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowPriceBreakdown((v) => !v);
                }}
                onMouseEnter={() => setShowPriceBreakdown(true)}
                onMouseLeave={() => setShowPriceBreakdown(false)}
                className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900 transition cursor-pointer"
                title="Hover or tap for transparent price breakdown"
              >
                <Info className="w-3 h-3" />
              </button>
            )}

            {originalPrice > 0 && (
              <>
                <del className="text-[11px] text-slate-400 font-normal line-through">
                  ₹{originalPrice.toLocaleString('en-IN')}
                </del>
                <span className="text-[11px] font-black text-[#388E3C]">
                  {discountPercent}% {ui.off}
                </span>
              </>
            )}

            <span className="text-[11px] text-slate-500 font-normal ml-auto">
              {displayPriceUnit}
            </span>
          </div>
          <LastUpdated at={listing.createdAt} label="Listed" className="mt-1 block text-[10px] font-semibold text-slate-400" />

          {showPriceBreakdown &&
            listing.price > 0 &&
            renderPriceBreakdownPopover(listing.price, displayPriceUnit)}
        </div>

        {/* EXPANDABLE "పీజీ & హాస్టల్ రూమ్ వివరాలు & నియమాలు" SECTION — SHOWN ONLY WHEN USER CLICKS "SEE THE ROOM" */}
        {showRoomDetails && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="p-2.5 rounded-2xl bg-gradient-to-br from-purple-50/95 via-pink-50/50 to-slate-50 dark:from-purple-950/50 dark:via-slate-900 dark:to-slate-800/80 border border-purple-200 dark:border-purple-800/70 space-y-2 animate-in fade-in slide-in-from-top-1 duration-150"
          >
            <div className="flex items-center justify-between gap-1.5 border-b border-purple-200/70 dark:border-purple-800/60 pb-1.5">
              <h4 className="text-[11px] font-black text-purple-950 dark:text-purple-200 flex items-center gap-1">
                <span>🏠</span>
                <span>పీజీ & హాస్టల్ రూమ్ వివరాలు & నియమాలు</span>
              </h4>
              <button
                type="button"
                onClick={() => setShowRoomDetails(false)}
                className="text-[10px] font-black text-slate-500 hover:text-rose-600 px-1.5 py-0.5 rounded bg-white/80 dark:bg-slate-800 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1.5 text-[10px]">
              <div className="bg-white dark:bg-slate-900 p-1.5 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-[9px] text-slate-400 font-bold block">
                  🛏️ {currentLang === 'te' ? 'షేరింగ్ ఎంపికలు' : 'Room Sharing'}
                </span>
                <span className="font-black text-slate-900 dark:text-white">
                  {String(
                    listing.customFieldValues?.roomTypesAvailable ||
                      listing.customFieldValues?.sharingType ||
                      '1, 2, 3 & 4 Sharing (AC / Non-AC)'
                  )}
                </span>
              </div>

              <div className="bg-white dark:bg-slate-900 p-1.5 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-[9px] text-slate-400 font-bold block">
                  🍲 {currentLang === 'te' ? 'భోజన సదుపాయం' : 'Food & Meals'}
                </span>
                <span className="font-black text-slate-900 dark:text-white">
                  {String(
                    listing.customFieldValues?.foodIncluded ||
                      listing.customFieldValues?.foodType ||
                      '3 Times Homely Meals'
                  )}
                </span>
              </div>

              <div className="bg-white dark:bg-slate-900 p-1.5 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-[9px] text-slate-400 font-bold block">
                  💵 {currentLang === 'te' ? 'డిపాజిట్ & నోటీస్' : 'Deposit & Notice'}
                </span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {String(listing.customFieldValues?.securityDeposit || '₹2,000 Deposit · 15 Days Notice')}
                </span>
              </div>

              <div className="bg-white dark:bg-slate-900 p-1.5 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-[9px] text-slate-400 font-bold block">
                  🚪 {currentLang === 'te' ? 'గేట్ & నియమాలు' : 'Gate & Rules'}
                </span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {String(
                    listing.customFieldValues?.gateClosingTime ||
                      listing.customFieldValues?.genderPolicy ||
                      '24/7 Biometric Entry · Zero Brokerage'
                  )}
                </span>
              </div>

              <div className="bg-white dark:bg-slate-900 p-1.5 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-[9px] text-slate-400 font-bold block">
                  📶 {currentLang === 'te' ? 'వైఫై & పవర్ బ్యాకప్' : 'Wi-Fi & Backup'}
                </span>
                <span className="font-bold text-emerald-700 dark:text-emerald-400">
                  {String(
                    listing.customFieldValues?.wifiSpeed ||
                      listing.customFieldValues?.powerBackup ||
                      'High-Speed 100 Mbps Wi-Fi + 24/7 Power'
                  )}
                </span>
              </div>

              <div className="bg-white dark:bg-slate-900 p-1.5 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-[9px] text-slate-400 font-bold block">
                  🧹 {currentLang === 'te' ? 'క్లీనింగ్ & బాత్‌రూమ్' : 'Cleaning & Washroom'}
                </span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {String(
                    listing.customFieldValues?.housekeeping ||
                      listing.customFieldValues?.attachedWashroom ||
                      'Daily Cleaning · Attached Geyser'
                  )}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => onSelect(listing)}
                className="flex-1 py-1 px-2 rounded-lg bg-purple-700 hover:bg-purple-800 text-white text-[10px] font-black cursor-pointer"
              >
                {currentLang === 'te' ? 'పూర్తి గ్యాలరీ & రూమ్ చూడండి' : 'Open Full Room Gallery'}
              </button>
              <button
                type="button"
                onClick={() => onEnquire(listing)}
                className="py-1 px-2.5 rounded-lg bg-white dark:bg-slate-800 border border-purple-300 dark:border-slate-700 text-purple-800 dark:text-purple-200 text-[10px] font-black cursor-pointer"
              >
                {currentLang === 'te' ? 'చాట్' : 'Chat'}
              </button>
            </div>
          </div>
        )}

        {/* STUDENT SUCCESS & VIEW CALENDAR SECTION — STRICTLY FOR CLASS LISTINGS */}
        {isClass && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="p-2.5 rounded-xl bg-gradient-to-r from-indigo-50/90 via-purple-50/80 to-emerald-50/80 dark:from-slate-800/90 dark:to-slate-800 border border-indigo-200/80 dark:border-slate-700 space-y-2"
          >
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-[#3730A3] dark:text-indigo-300 flex items-center gap-1">
                <Award className="w-3.5 h-3.5 text-emerald-600" />
                <span>
                  {currentLang === 'te' ? 'స్టూడెంట్ సక్సెస్ & ప్లేస్‌మెంట్స్' : 'Student Success & Placements'}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setIsCourseCalendarOpen(true)}
                className="text-[10px] font-black text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
              >
                {currentLang === 'te' ? '+ అప్‌డేట్ / వివరాలు' : '+ Stats & Link'}
              </button>
            </div>

            <div className="grid grid-cols-3 gap-1.5 text-center">
              <div className="bg-white/90 dark:bg-slate-900 rounded-lg py-1 px-1.5 border border-emerald-200 dark:border-slate-700">
                <div className="text-[11px] font-black text-emerald-700 dark:text-emerald-400 flex items-center justify-center gap-0.5">
                  <TrendingUp className="w-3 h-3" />
                  <span>{String(listing.customFieldValues?.placementRate || '94%')}</span>
                </div>
                <div className="text-[9px] text-slate-500 font-bold">Placed</div>
              </div>
              <div className="bg-white/90 dark:bg-slate-900 rounded-lg py-1 px-1.5 border border-amber-200 dark:border-slate-700">
                <div className="text-[11px] font-black text-amber-600 dark:text-amber-400">
                  ★ {String(listing.customFieldValues?.avgFeedbackScore || listing.providerRating || '4.9')}
                </div>
                <div className="text-[9px] text-slate-500 font-bold">Feedback</div>
              </div>
              <div className="bg-white/90 dark:bg-slate-900 rounded-lg py-1 px-1.5 border border-indigo-200 dark:border-slate-700">
                <div className="text-[11px] font-black text-indigo-700 dark:text-indigo-300">
                  {String(listing.customFieldValues?.certifiedCount || '1,420+')}
                </div>
                <div className="text-[9px] text-slate-500 font-bold">Certified</div>
              </div>
            </div>

            {/* View Course Calendar Button (Start Dates, Exam Dates & Off-Days) */}
            <button
              type="button"
              onClick={() => setIsCourseCalendarOpen(true)}
              className="w-full py-1.5 px-2.5 rounded-lg bg-[#3730A3] hover:bg-indigo-800 text-white font-black text-[11px] flex items-center justify-center gap-1.5 shadow-2xs transition cursor-pointer"
            >
              <Calendar className="w-3.5 h-3.5 text-amber-300" />
              <span>
                {currentLang === 'te'
                  ? '📅 కోర్సు క్యాలెండర్ చూడండి (ప్రారంభ, పరీక్ష & సెలవు తేదీలు)'
                  : '📅 View Calendar (Start Dates, Exams & Off-Days)'}
              </span>
            </button>
          </div>
        )}

        {/* Barcode Strip — Displayed ONLY on Movie Tickets */}
        {isMovie && (
          <UniversalBarcode
            value={generateBosBarcodeId('TKT', listing.id, listing.categoryId)}
            label="🎬 Movie Ticket & Seat Entry Barcode"
            sublabel={`${displayTitle} • ₹${listing.price}`}
            moduleTag={listing.categoryId}
            variant="badge"
          />
        )}

        {/* Bottom Actions Row */}
        <div className="pt-2 space-y-2">
          
          {/* OPTIONAL CONFIGURABLE CURRENT RUNNING BATCHES OPTION — STRICTLY FOR CLASSES ONLY */}
          {isClass && (
            <div onClick={(e) => e.stopPropagation()} className="space-y-1.5">
              {hasRunningBatches ? (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      if (onOpenRunningBatches) {
                        onOpenRunningBatches(listing);
                      } else {
                        onSelect(listing);
                      }
                    }}
                    className="flex-1 bg-gradient-to-r from-[#FF3300] to-[#E60000] hover:from-[#E60000] hover:to-[#CC0000] text-white font-black text-xs py-2 px-3 rounded-xs shadow-xs transition-all flex items-center justify-between gap-2 cursor-pointer active:scale-95"
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="w-2 h-2 rounded-full bg-white animate-pulse shrink-0" />
                      <Calendar className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">
                        {ui.currentRunningBatches}
                        {batchImages.length > 0 ? ` (${batchImages.length} 📷)` : ''}
                      </span>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setDraftBatchUrl(runningBatchUrl);
                      setShowBatchLinkInput((prev) => !prev);
                    }}
                    className="p-2 rounded-xs bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 text-slate-600 hover:text-[#4338CA] border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer shrink-0"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setDraftBatchUrl('');
                    setShowBatchLinkInput((prev) => !prev);
                  }}
                  className="w-full py-1.5 px-2.5 rounded-xs border border-dashed border-[#4338CA]/40 bg-[#EEF2FF]/60 hover:bg-[#EEF2FF] text-[#4338CA] font-bold text-[11px] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Link2 className="w-3.5 h-3.5" />
                  <span>+ {ui.currentRunningBatches}</span>
                </button>
              )}

              {/* Inline Configurable Batch Link Editor */}
              {showBatchLinkInput && (
                <form
                  onSubmit={handleSaveBatchUrl}
                  className="p-2 rounded-lg bg-[#F8FAFC] dark:bg-slate-800 border border-[#E2E8F0] dark:border-slate-700 space-y-1.5"
                >
                  <label className="text-[10px] font-black text-[#0F172A] dark:text-white flex items-center justify-between">
                    <span>{ui.currentRunningBatches}:</span>
                    <button
                      type="button"
                      onClick={() => setShowBatchLinkInput(false)}
                      className="text-slate-400 hover:text-slate-600 text-[10px]"
                    >
                      ✕
                    </button>
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="url"
                      value={draftBatchUrl}
                      onChange={(e) => setDraftBatchUrl(e.target.value)}
                      placeholder="https://www.durgasoftonline.com/s/pages/new-batches"
                      className="flex-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-[11px] font-medium text-slate-900 dark:text-white outline-hidden"
                    />
                    <button
                      type="submit"
                      className="px-2.5 py-1 rounded bg-[#4338CA] text-white font-black text-[11px] cursor-pointer shrink-0"
                    />
                  </div>
                </form>
              )}
            </div>
          )}

          {/* Compare Checkbox + Call Owner */}
          {onToggleCompare && (
            <div 
              className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300 select-none pt-1"
              onClick={(e) => e.stopPropagation()}
            >
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isCompared}
                  onChange={() => onToggleCompare(listing)}
                  className="w-3.5 h-3.5 rounded-xs text-[#2874F0] focus:ring-[#2874F0] border-slate-300 dark:border-slate-700 cursor-pointer"
                />
                <span className={isCompared ? 'text-[#2874F0] font-black' : ''}>
                  {ui.addToCompare}
                </span>
              </label>

              <a
                href={`tel:${listing.providerPhone}`}
                onClick={(e) => e.stopPropagation()}
                className="text-[11px] font-black text-[#2874F0] hover:underline flex items-center gap-1"
              >
                <Phone className="w-3 h-3 text-[#2874F0]" />
                <span>{ui.callOwner}</span>
              </a>
            </div>
          )}

          {selectedDateRange?.startDate && (
            <div className="flex items-center justify-between px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-[10px] font-black text-emerald-800 dark:text-emerald-300">
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3 text-emerald-600" />
                <span>
                  {currentLang === 'te' ? 'ఎంచుకున్న తేదీలలో అందుబాటులో ఉంది:' : 'Available for Dates:'}
                </span>
              </span>
              <span>
                {selectedDateRange.startDate}
                {selectedDateRange.endDate && selectedDateRange.endDate !== selectedDateRange.startDate
                  ? ` → ${selectedDateRange.endDate}`
                  : ''}
              </span>
            </div>
          )}

          {/* Dual CTA Action Buttons — Clicking "See the Room" opens the exact same link/modal (onSelect(listing)) as clicking the PG name */}
          <div className="grid grid-cols-2 gap-1.5" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => onSelect(listing)}
              className="bg-[#FF9F00] hover:bg-amber-500 text-slate-950 active:scale-95 font-black text-[11px] py-1.5 px-2 rounded-lg shadow-xs transition-all flex items-center justify-center gap-1 cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">
                {isClass
                  ? ui.freeDemo
                  : currentLang === 'te'
                  ? 'రూమ్ చూడండి'
                  : 'See the Room'}
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                onBookNow(
                  selectedDateRange?.startDate
                    ? {
                        ...listing,
                        customFieldValues: {
                          ...listing.customFieldValues,
                          selectedCheckInDate: selectedDateRange.startDate,
                          selectedCheckOutDate:
                            selectedDateRange.endDate || selectedDateRange.startDate,
                        },
                      }
                    : listing
                )
              }
              className="bg-[#FB641B] hover:bg-orange-600 active:scale-95 text-white font-black text-[11px] py-1.5 px-2 rounded-lg shadow-xs transition-all flex items-center justify-center gap-1 cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5 fill-current shrink-0" />
                <span className="truncate">{contactActionLabel}</span>
            </button>
          </div>

        </div>

      </div>

      {isCourseCalendarOpen && (
        <div onClick={(e) => e.stopPropagation()}>
          <CourseCalendarModal
            listing={listing}
            currentLang={currentLang}
            onClose={() => setIsCourseCalendarOpen(false)}
            onEnrollDate={(item, startDate) => {
              onBookNow({
                ...item,
                customFieldValues: {
                  ...item.customFieldValues,
                  selectedCheckInDate: startDate,
                },
              });
            }}
          />
        </div>
      )}
    </div>
  );
};
