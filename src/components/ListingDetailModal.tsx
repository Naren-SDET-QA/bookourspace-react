import React, { useState } from 'react';
import { 
  X, 
  Star, 
  MapPin, 
  ShieldCheck, 
  Phone, 
  Mail, 
  MessageSquare, 
  Calendar, 
  Check, 
  Share2, 
  Eye, 
  ExternalLink,
  MessageCircle,
  Clock,
  Sparkles,
  ThumbsUp,
  TrendingUp,
  CheckCircle2
} from 'lucide-react';
import { MarketplaceListing, Review } from '../types/marketplace';
import { useMarketplace } from '../context/MarketplaceContext';
import { playAlertChime } from '../utils/audio';
import { 
  AppLanguage, 
  translations, 
  getSubcategoryDisplayName, 
  getProviderDisplayName, 
  getListingTitle, 
  getListingDescription, 
  getPriceUnitDisplayName 
} from '../utils/translations';
import { UniversalBarcode, generateBosBarcodeId, getBarcodePassTitle } from './UniversalBarcode';
import { StayAirbnbDetails } from './StayAirbnbDetails';

interface ListingDetailModalProps {
  listing: MarketplaceListing | null;
  onClose: () => void;
  onBookNow: (listing: MarketplaceListing) => void;
  onEnquire: (listing: MarketplaceListing) => void;
  currentLang?: AppLanguage;
}

export const ListingDetailModal: React.FC<ListingDetailModalProps> = ({
  listing,
  onClose,
  onBookNow,
  onEnquire,
  currentLang = 'en',
}) => {
  const { reviews, addReview } = useMarketplace();
  const [activeImageIdx, setActiveImageIdx] = useState(0);
  const [justShared, setJustShared] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [showAllPhotos, setShowAllPhotos] = useState(false);

  // Review submission state
  const [newRating, setNewRating] = useState(5);
  const [hoverRating, setHoverRating] = useState(0);
  const [newComment, setNewComment] = useState('');
  const [reviewerName, setReviewerName] = useState(currentLang === 'te' ? 'రమేష్ కుమార్' : 'Ramesh Kumar');
  const [selectedReviewTags, setSelectedReviewTags] = useState<string[]>([
    currentLang === 'te' ? '⚡ సమయానికి వచ్చారు' : '⚡ On-Time',
    currentLang === 'te' ? '🛠️ నైపుణ్యమైన పని' : '🛠️ Quality Work'
  ]);
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [submittedStats, setSubmittedStats] = useState<{ newRating: number; newCount: number } | null>(null);

  if (!listing) return null;

  const listingReviews = reviews.filter(r => r.listingId === listing.id);

  // Dynamic projection calculations
  const currentRating = listing.providerRating ?? 5.0;
  const currentCount = listing.reviewCount ?? 0;
  const effectiveRating = hoverRating || newRating;
  const projectedCount = currentCount + 1;
  const projectedRating = Number(((currentRating * currentCount + effectiveRating) / projectedCount).toFixed(1));

  const toggleReviewTag = (tag: string) => {
    setSelectedReviewTags(prev => 
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const handleReviewSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() && selectedReviewTags.length === 0) return;

    const finalComment = newComment.trim() || selectedReviewTags.join(', ');
    const finalName = reviewerName.trim() || (currentLang === 'te' ? 'సంతృప్తి చెందిన కస్టమర్' : 'Verified Customer');

    const result = addReview({
      listingId: listing.id,
      customerName: finalName,
      customerAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80',
      rating: newRating,
      comment: finalComment,
      verifiedCustomer: true,
      tags: selectedReviewTags,
      providerId: listing.providerId
    });

    playAlertChime('confirm');

    setSubmittedStats(result);
    setReviewSubmitted(true);
    setTimeout(() => {
      setNewComment('');
      setReviewSubmitted(false);
    }, 3500);
  };

  const distKm = listing.distanceKm ?? listing.location?.distanceKm ?? 2.5;
  const t = translations[currentLang] || translations.te;
  const displayTitle = getListingTitle(listing, currentLang);
  const displayDescription = getListingDescription(listing, currentLang);
  const displayProviderName = getProviderDisplayName(listing.providerNameTe || listing.providerName, currentLang, distKm);
  const displayPriceUnit = getPriceUnitDisplayName(listing.priceUnitTe || listing.priceUnit, currentLang);
  const displaySubcategory = getSubcategoryDisplayName(listing.subcategory, currentLang);
  const isStay = listing.categoryId.startsWith('hotel-') || listing.customFieldValues?.sectionType === 'hotel_stay';

  const scrollToStaySection = (sectionId: string) => {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleShare = async () => {
    const shareUrl = window.location.href;
    const shareTitle = `${displayTitle} - ${displayProviderName}`;
    const shareText = `${displayTitle}\n👤 ${t.verifiedPro}: ${displayProviderName}\n📍 ${listing.location.area} (${distKm} km)\n💰 ${t.pricing}: ₹${listing.price.toLocaleString('en-IN')}${displayPriceUnit}\n⭐ ${listing.providerRating} (${listing.reviewCount} ${t.reviews})\n📞 ${listing.providerPhone}\n\nక్రాఫ్టో (Crafto) లో చూడండి:`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: shareUrl,
        });
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

  const handleDirectCall = () => {
    window.location.href = `tel:${listing.providerPhone}`;
  };

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs sm:p-4 ${isStay ? 'p-0' : 'p-3'} overflow-y-auto`}>
      <div className={`relative flex w-full max-w-3xl flex-col overflow-hidden bg-white shadow-2xl dark:bg-slate-900 ${isStay ? 'my-0 max-h-[100dvh] rounded-none border-0 sm:my-4 sm:max-h-[94vh] sm:rounded-3xl sm:border sm:border-slate-200 dark:sm:border-slate-800' : 'my-4 max-h-[90vh] rounded-3xl border border-slate-200 dark:border-slate-800'}`}>
        {/* Modal Top Header */}
        <div className={`flex items-center justify-between border-b px-4 py-3 sm:p-5 ${isStay ? 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900' : 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50'}`}>
          <div className="flex items-center gap-2">
            <span className={isStay ? 'text-xs font-black text-slate-900 dark:text-white' : 'rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-purple-700 dark:bg-purple-950 dark:text-purple-300'}>
              {isStay ? 'BookOurSpace Stays' : displaySubcategory}
            </span>
            {listing.isFeatured && (
              <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-900 dark:bg-amber-950/60 dark:text-amber-200">
                <Sparkles className="w-3 h-3 fill-current" />
                <span>{isStay ? (currentLang === 'te' ? 'గెస్ట్ ఫేవరెట్' : 'Guest favourite') : (currentLang === 'te' ? 'ఫీచర్డ్' : 'Featured')}</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Native Web Share API Button with Feedback */}
            <button
              onClick={handleShare}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-all ${
                justShared
                  ? 'bg-emerald-600 text-white'
                  : isStay
                  ? 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
                  : 'border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-300 dark:hover:bg-purple-900'
              }`}
              title={currentLang === 'te' ? 'షేర్ చేయండి' : 'Share'}
            >
              {justShared ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
              <span>{justShared ? (currentLang === 'te' ? 'కాపీ అయింది!' : 'Copied!') : (currentLang === 'te' ? 'షేర్ చేయండి' : 'Share')}</span>
            </button>

            {isStay && (
              <button
                type="button"
                onClick={() => setIsSaved((saved) => !saved)}
                className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition ${isSaved ? 'border-rose-300 bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-200' : 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'}`}
              >
                {isSaved ? '♥ Saved' : '♡ Save'}
              </button>
            )}

            <button
              onClick={onClose}
              aria-label="Close property details"
              className="rounded-full p-1.5 text-slate-500 transition-colors hover:bg-slate-200 dark:hover:bg-slate-700"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className={`flex-1 space-y-6 overflow-y-auto sm:p-6 ${isStay ? 'p-4' : 'p-4'}`}>
          {/* Image Showcase */}
          <div className="space-y-2">
            <div className={`w-full overflow-hidden bg-slate-100 dark:bg-slate-800 ${isStay ? 'h-[42dvh] min-h-64 rounded-xl sm:h-80 sm:rounded-2xl' : 'h-64 rounded-2xl sm:h-80'}`}>
              <img
                src={listing.images[activeImageIdx] || listing.images[0]}
                alt={listing.title}
                className="w-full h-full object-cover"
              />
            </div>
            {isStay && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-slate-500">{activeImageIdx + 1} / {listing.images.length} photos</span>
                <button
                  type="button"
                  onClick={() => setShowAllPhotos((shown) => !shown)}
                  className="rounded-full border border-slate-300 px-3 py-1.5 text-[11px] font-black text-slate-700 dark:border-slate-700 dark:text-slate-200"
                >
                  {showAllPhotos ? 'Hide photos' : 'Show all photos'}
                </button>
              </div>
            )}
            {listing.images.length > 1 && (
              <div className={`${showAllPhotos && isStay ? 'grid grid-cols-2 sm:grid-cols-3' : 'flex items-center overflow-x-auto'} gap-2 pb-1`}>
                {listing.images.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => setActiveImageIdx(idx)}
                    className={`w-16 h-16 rounded-xl overflow-hidden border-2 transition-all shrink-0 ${
                      activeImageIdx === idx ? 'border-purple-600 scale-105' : 'border-transparent opacity-70'
                    }`}
                  >
                    <img src={img} alt="thumb" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Title, Location & Price */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="space-y-1">
              <h2 className="text-lg sm:text-2xl font-black text-slate-900 dark:text-white leading-snug">
                {displayTitle}
              </h2>
              <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1 font-semibold text-purple-700 dark:text-purple-300">
                  <MapPin className="w-4 h-4 text-purple-600" />
                  <span>{listing.location.area}, {listing.location.city} {listing.location.pincode ? `(${listing.location.pincode})` : ''}</span>
                </span>
                <span>·</span>
                <span className="flex items-center gap-1 text-amber-600 font-bold">
                  <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                  <span>{listing.providerRating} ({listing.reviewCount} {t.reviews})</span>
                </span>
                <span>·</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-bold text-xs">
                  📍 {distKm} km {t.away}
                </span>
              </div>
            </div>

            <div className="bg-purple-50 dark:bg-purple-950/60 p-3 sm:p-4 rounded-2xl border border-purple-200 dark:border-purple-800 text-right shrink-0">
              <span className="text-[10px] text-purple-700 dark:text-purple-300 uppercase tracking-wider font-extrabold block">
                {t.pricing}
              </span>
              <div className="text-xl sm:text-2xl font-black text-purple-950 dark:text-white tabular-nums">
                {listing.currency}{listing.price.toLocaleString('en-IN')}
                <span className="text-xs font-normal text-slate-500">{displayPriceUnit}</span>
              </div>
            </div>
          </div>

          {isStay && (
            <nav className="sticky top-0 z-[1] flex gap-1 overflow-x-auto border-y border-slate-100 bg-white/95 py-2 text-[11px] font-black backdrop-blur dark:border-slate-800 dark:bg-slate-900/95" aria-label="Stay details sections">
              {[
                ['Photos', 'stay-summary'],
                ['Amenities', 'stay-amenities'],
                ['Reviews', 'stay-reviews'],
                ['Location', 'stay-location'],
              ].map(([label, target]) => (
                <button key={target} type="button" onClick={() => scrollToStaySection(target)} className="shrink-0 rounded-full border border-slate-200 px-3 py-1.5 text-slate-700 dark:border-slate-700 dark:text-slate-200">{label}</button>
              ))}
            </nav>
          )}

          {/* Description */}
          <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              {isStay ? (currentLang === 'te' ? 'ది స్పేస్' : 'The space') : (currentLang === 'te' ? 'వివరాలు & సర్వీస్ సమాచారం' : 'Description & Details')}
            </h4>
            <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line">
              {displayDescription}
            </p>
          </div>

          {isStay && <StayAirbnbDetails listing={listing} currentLang={currentLang} />}

          {/* PG & Hostel Accommodation Comprehensive Specifications */}
          {(listing.categoryId.startsWith('pg-') || listing.customFieldValues?.roomTypesAvailable || listing.customFieldValues?.genderPolicy) && (
            <div className="space-y-3 bg-gradient-to-br from-purple-50/80 via-pink-50/40 to-slate-50 dark:from-purple-950/40 dark:via-pink-950/20 dark:to-slate-800/60 p-4 sm:p-5 rounded-3xl border border-purple-200 dark:border-purple-900/60 shadow-xs">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h4 className="text-xs sm:text-sm font-extrabold text-purple-950 dark:text-purple-200 flex items-center gap-2">
                  <span>🏠</span>
                  <span>పీజీ & హాస్టల్ రూమ్ వివరాలు & నియమాలు (PG & Hostel Room Details & Rules)</span>
                </h4>

                <div className="flex items-center gap-1.5 flex-wrap">
                  {listing.customFieldValues?.bedsAvailable && (
                    <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700">
                      🛏️ {String(listing.customFieldValues.bedsAvailable)} {currentLang === 'te' ? 'బెడ్స్ ఖాళీగా ఉన్నాయి' : 'Beds Available'}
                    </span>
                  )}
                  {listing.customFieldValues?.genderPolicy && (
                    <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-900 dark:bg-purple-950 dark:text-purple-200 border border-purple-300 dark:border-purple-700">
                      👥 {String(listing.customFieldValues.genderPolicy)}
                    </span>
                  )}
                </div>
              </div>

              {/* PG Attributes Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                {/* 1. Room Sharing & Pricing Options */}
                {listing.customFieldValues?.roomTypesAvailable && (
                  <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-bold">
                      🛏️ {currentLang === 'te' ? 'షేరింగ్ ఎంపికలు' : 'Room Types Available'}
                    </span>
                    <span className="font-black text-slate-900 dark:text-white mt-0.5 block">
                      {String(listing.customFieldValues.roomTypesAvailable)}
                    </span>
                    {listing.customFieldValues?.sharingHighlight && (
                      <span className="text-[10px] text-purple-600 dark:text-purple-400 block mt-0.5 font-semibold">
                        {String(listing.customFieldValues.sharingHighlight)}
                      </span>
                    )}
                  </div>
                )}

                {/* 2. Food & Meals Facility */}
                {listing.customFieldValues?.foodIncluded && (
                  <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-bold">
                      🍲 {currentLang === 'te' ? 'భోజన సదుపాయం' : 'Food & Meals Policy'}
                    </span>
                    <span className="font-black text-slate-900 dark:text-white mt-0.5 block">
                      {String(listing.customFieldValues.foodIncluded)}
                    </span>
                  </div>
                )}

                {/* 3. Security Deposit & Notice Period */}
                {listing.customFieldValues?.securityDeposit && (
                  <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-bold">
                      💵 {currentLang === 'te' ? 'డిపాజిట్ & నోటీస్' : 'Deposit & Notice'}
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white mt-0.5 block">
                      {String(listing.customFieldValues.securityDeposit)}
                      {listing.customFieldValues?.noticePeriod && (
                        <span className="text-[10px] text-slate-500 block mt-0.5">
                          {String(listing.customFieldValues.noticePeriod)}
                        </span>
                      )}
                    </span>
                  </div>
                )}

                {/* 4. Gate Timings */}
                {listing.customFieldValues?.gateClosingTime && (
                  <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-bold">
                      🚪 {currentLang === 'te' ? 'గేట్ క్లోజింగ్ సమయం' : 'Gate Closing Time'}
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white mt-0.5 block">
                      {String(listing.customFieldValues.gateClosingTime)}
                    </span>
                  </div>
                )}

                {/* 5. Wi-Fi Speed */}
                {listing.customFieldValues?.wifiSpeed && (
                  <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-bold">
                      📶 {currentLang === 'te' ? 'ఇంటర్నెట్ & వైఫై' : 'Wi-Fi Speed'}
                    </span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400 mt-0.5 block">
                      {String(listing.customFieldValues.wifiSpeed)}
                    </span>
                  </div>
                )}

                {/* 6. Housekeeping & Cleaning */}
                {listing.customFieldValues?.housekeeping && (
                  <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-bold">
                      🧹 {currentLang === 'te' ? 'రూమ్ క్లీనింగ్' : 'Housekeeping'}
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white mt-0.5 block">
                      {String(listing.customFieldValues.housekeeping)}
                    </span>
                  </div>
                )}

                {/* 7. Laundry & Washing Machines */}
                {listing.customFieldValues?.laundryFacility && (
                  <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-bold">
                      🧺 {currentLang === 'te' ? 'లాండ్రీ & వాషింగ్ మెషీన్స్' : 'Laundry Facilities'}
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white mt-0.5 block">
                      {String(listing.customFieldValues.laundryFacility)}
                    </span>
                  </div>
                )}

                {/* 8. Power Backup */}
                {listing.customFieldValues?.powerBackup && (
                  <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-bold">
                      ⚡ {currentLang === 'te' ? 'పవర్ బ్యాకప్' : 'Power Backup'}
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white mt-0.5 block">
                      {String(listing.customFieldValues.powerBackup)}
                    </span>
                  </div>
                )}

                {/* 9. Washroom & Hot Water */}
                {listing.customFieldValues?.attachedWashroom && (
                  <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-bold">
                      🚿 {currentLang === 'te' ? 'అటాచ్డ్ బాత్‌రూమ్ & గీజర్' : 'Washroom & Geyser'}
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white mt-0.5 block">
                      {String(listing.customFieldValues.attachedWashroom)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Classes & Courses Comprehensive Specifications */}
          {(listing.categoryId.startsWith('class-') || listing.customFieldValues?.classMode || listing.customFieldValues?.courseDuration) && (
            <div className="space-y-3 bg-gradient-to-br from-indigo-50/70 via-purple-50/50 to-slate-50 dark:from-indigo-950/40 dark:via-purple-950/30 dark:to-slate-800/60 p-4 sm:p-5 rounded-3xl border border-indigo-200 dark:border-indigo-900/60 shadow-xs">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h4 className="text-xs sm:text-sm font-extrabold text-purple-950 dark:text-purple-200 flex items-center gap-2">
                  <span>🎓</span>
                  <span>{currentLang === 'te' ? 'కోర్సు వివరాలు & అభ్యాస నిబంధనలు' : 'Classes & Courses Details'}</span>
                </h4>

                <div className="flex items-center gap-1.5 flex-wrap">
                  {listing.customFieldValues?.freeTrialAvailable && String(listing.customFieldValues.freeTrialAvailable).toLowerCase().includes('yes') && (
                    <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700">
                      🎁 {currentLang === 'te' ? 'ఉచిత డెమో క్లాస్' : 'Free Trial Available'}
                    </span>
                  )}
                  {listing.customFieldValues?.providerType && (
                    <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-900 dark:bg-purple-950 dark:text-purple-200 border border-purple-300 dark:border-purple-700">
                      {String(listing.customFieldValues.providerType)}
                    </span>
                  )}
                </div>
              </div>

              {/* Class Attributes Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                {/* 1. Mode */}
                {listing.customFieldValues?.classMode && (
                  <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-bold">
                      🔄 {currentLang === 'te' ? 'తరగతి విధానం (Mode)' : 'Delivery Mode'}
                    </span>
                    <span className="font-black text-slate-900 dark:text-white mt-0.5 block">
                      {String(listing.customFieldValues.classMode)}
                    </span>
                  </div>
                )}

                {/* 2. Platform or Address */}
                {listing.customFieldValues?.deliveryPlatform && (
                  <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-bold">
                      💻 {currentLang === 'te' ? 'వేదిక / ఆన్‌లైన్ ప్లాట్‌ఫారమ్' : 'Platform / Campus'}
                    </span>
                    <span className="font-black text-purple-700 dark:text-purple-300 mt-0.5 block">
                      {String(listing.customFieldValues.deliveryPlatform)}
                    </span>
                  </div>
                )}

                {/* 3. Batch Capacity & Seats */}
                {listing.customFieldValues?.batchCapacity && (
                  <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-bold">
                      👥 {currentLang === 'te' ? 'బ్యాచ్ సైజ్ & ఖాళీలు' : 'Batch Capacity & Seats'}
                    </span>
                    <span className="font-black text-slate-900 dark:text-white mt-0.5 block text-sm">
                      {String(listing.customFieldValues.batchCapacity)} {currentLang === 'te' ? 'సీట్లు' : 'Students'}
                      {listing.customFieldValues?.seatsRemaining && (
                        <span className="text-xs font-bold text-rose-600 dark:text-rose-400 ml-1">
                          ({String(listing.customFieldValues.seatsRemaining)} {currentLang === 'te' ? 'మిగిలి ఉన్నాయి' : 'seats left'})
                        </span>
                      )}
                    </span>
                  </div>
                )}

                {/* 4. Age Group & Skill Level */}
                {listing.customFieldValues?.ageGroup && (
                  <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-bold">
                      🎯 {currentLang === 'te' ? 'వయస్సు & అర్హత' : 'Age Group & Level'}
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white mt-0.5 block">
                      {String(listing.customFieldValues.ageGroup)}
                      {listing.customFieldValues?.skillLevel && (
                        <span className="text-[10px] text-purple-600 block mt-0.5 font-semibold">
                          Level: {String(listing.customFieldValues.skillLevel)}
                        </span>
                      )}
                    </span>
                  </div>
                )}

                {/* 5. Course Duration */}
                {listing.customFieldValues?.courseDuration && (
                  <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-bold">
                      ⏱️ {currentLang === 'te' ? 'కోర్సు కాలవ్యవధి' : 'Course Duration'}
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white mt-0.5 block">
                      {String(listing.customFieldValues.courseDuration)}
                    </span>
                  </div>
                )}

                {/* 6. Days & Timings */}
                {listing.customFieldValues?.classTimings && (
                  <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-bold">
                      ⏰ {currentLang === 'te' ? 'సమయాలు & రోజులు' : 'Timings & Days'}
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white mt-0.5 block">
                      {String(listing.customFieldValues.classTimings)}
                      {listing.customFieldValues?.daysOfWeek && (
                        <span className="text-[10px] text-slate-500 block mt-0.5">
                          {String(listing.customFieldValues.daysOfWeek)}
                        </span>
                      )}
                    </span>
                  </div>
                )}

                {/* 7. Fee Structure & Installment */}
                {listing.customFieldValues?.feeStructure && (
                  <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-bold">
                      💳 {currentLang === 'te' ? 'ఫీజు & వాయిదాల సదుపాయం' : 'Fee & Installments'}
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white mt-0.5 block text-xs">
                      {String(listing.customFieldValues.feeStructure)}
                    </span>
                  </div>
                )}

                {/* 8. Certificate */}
                {listing.customFieldValues?.certificateProvided && (
                  <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-bold">
                      📜 {currentLang === 'te' ? 'సర్టిఫికేషన్' : 'Certificate Availability'}
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white mt-0.5 block">
                      {String(listing.customFieldValues.certificateProvided)}
                    </span>
                  </div>
                )}

                {/* 9. Study Materials */}
                {listing.customFieldValues?.studyMaterials && (
                  <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-bold">
                      📚 {currentLang === 'te' ? 'స్టడీ మెటీరియల్స్ & ప్రాక్టీస్' : 'Study Materials'}
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white mt-0.5 block">
                      {String(listing.customFieldValues.studyMaterials)}
                    </span>
                  </div>
                )}

                {/* 10. Recordings */}
                {listing.customFieldValues?.classRecordingAvailable && (
                  <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-bold">
                      📹 {currentLang === 'te' ? 'క్లాస్ రికార్డింగ్స్' : 'Video Recordings'}
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white mt-0.5 block">
                      {String(listing.customFieldValues.classRecordingAvailable)}
                    </span>
                  </div>
                )}

                {/* 11. Attendance & Verification */}
                {listing.customFieldValues?.attendanceTracking && (
                  <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-bold">
                      📋 {currentLang === 'te' ? 'హాజరు పర్యవేక్షణ' : 'Attendance Tracking'}
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white mt-0.5 block">
                      {String(listing.customFieldValues.attendanceTracking)}
                    </span>
                  </div>
                )}

                {/* 12. Cancellation & Refund */}
                {listing.customFieldValues?.cancellationPolicy && (
                  <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-bold">
                      🔄 {currentLang === 'te' ? 'రీఫండ్ నిబంధన' : 'Cancellation & Refund'}
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white mt-0.5 block">
                      {String(listing.customFieldValues.cancellationPolicy)}
                    </span>
                  </div>
                )}

                {/* Teacher Verification */}
                {listing.customFieldValues?.teacherVerification && (
                  <div className="bg-purple-100/70 dark:bg-purple-950/60 p-3 rounded-2xl border border-purple-300 dark:border-purple-800 shadow-2xs col-span-2 sm:col-span-3">
                    <span className="text-[10px] text-purple-900 dark:text-purple-200 uppercase tracking-wider block font-extrabold">
                      🛡️ {currentLang === 'te' ? 'ధృవీకరించబడిన అధ్యాపకులు (Teacher Verification)' : 'Verified Teacher Credentials'}
                    </span>
                    <span className="font-black text-purple-950 dark:text-purple-100 mt-0.5 block text-xs">
                      {String(listing.customFieldValues.teacherVerification)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Venue & Hall Comprehensive Specifications */}
          {(listing.categoryId.startsWith('venue-') || listing.customFieldValues?.venueType || listing.customFieldValues?.stageSpecs) && (
            <div className="space-y-3 bg-gradient-to-br from-slate-50 to-purple-50/30 dark:from-slate-800/60 dark:to-purple-950/20 p-4 sm:p-5 rounded-3xl border border-purple-200/60 dark:border-purple-900/40 shadow-xs">
              <div className="flex items-center justify-between">
                <h4 className="text-xs sm:text-sm font-extrabold text-purple-950 dark:text-purple-200 flex items-center gap-2">
                  <span>🏛️</span>
                  <span>{currentLang === 'te' ? 'వేదిక సౌకర్యాలు & నిబంధనల వివరాలు' : 'Venue Specifications & Amenities'}</span>
                </h4>
                {listing.customFieldValues?.ownership && (
                  <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                    {String(listing.customFieldValues.ownership)}
                  </span>
                )}
              </div>

              {/* Venue Quick Attributes Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                {listing.customFieldValues?.capacity && (
                  <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-bold">
                      👥 {currentLang === 'te' ? 'సామర్థ్యం (Capacity)' : 'Guest Capacity'}
                    </span>
                    <span className="font-black text-slate-900 dark:text-white mt-0.5 block text-sm">
                      {Number(listing.customFieldValues.capacity).toLocaleString('en-IN')} {currentLang === 'te' ? 'మంది' : 'Guests'}
                    </span>
                  </div>
                )}

                {listing.customFieldValues?.acType && (
                  <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-bold">
                      ❄️ {currentLang === 'te' ? 'ఎయిర్ కండిషనింగ్' : 'Air Conditioning'}
                    </span>
                    <span className="font-black text-slate-900 dark:text-white mt-0.5 block">
                      {String(listing.customFieldValues.acType)}
                    </span>
                  </div>
                )}

                {listing.customFieldValues?.venueType && (
                  <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-bold">
                      🏢 {currentLang === 'te' ? 'వేదిక రకం' : 'Indoor / Outdoor'}
                    </span>
                    <span className="font-black text-slate-900 dark:text-white mt-0.5 block">
                      {String(listing.customFieldValues.venueType)}
                    </span>
                  </div>
                )}

                {listing.customFieldValues?.parkingCapacity && (
                  <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-bold">
                      🚗 {currentLang === 'te' ? 'పార్కింగ్ సౌకర్యం' : 'Parking Space'}
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white mt-0.5 block">
                      {String(listing.customFieldValues.parkingCapacity)}
                    </span>
                  </div>
                )}

                {listing.customFieldValues?.powerBackup && (
                  <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-bold">
                      ⚡ {currentLang === 'te' ? 'జనరేటర్ బ్యాకప్' : 'Power Backup (DG)'}
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white mt-0.5 block">
                      {String(listing.customFieldValues.powerBackup)}
                    </span>
                  </div>
                )}

                {listing.customFieldValues?.cateringPolicy && (
                  <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-bold">
                      🍲 {currentLang === 'te' ? 'క్యాటరింగ్ విధానం' : 'Catering Policy'}
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white mt-0.5 block">
                      {String(listing.customFieldValues.cateringPolicy)}
                    </span>
                  </div>
                )}

                {listing.customFieldValues?.stageSpecs && (
                  <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-bold">
                      🎭 {currentLang === 'te' ? 'వేదిక కొలతలు' : 'Stage & Platform'}
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white mt-0.5 block">
                      {String(listing.customFieldValues.stageSpecs)}
                    </span>
                  </div>
                )}

                {listing.customFieldValues?.soundLight && (
                  <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-bold">
                      🔊 {currentLang === 'te' ? 'సౌండ్ & లైటింగ్' : 'Sound & Lighting'}
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white mt-0.5 block">
                      {String(listing.customFieldValues.soundLight)}
                    </span>
                  </div>
                )}

                {listing.customFieldValues?.decorationPolicy && (
                  <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-bold">
                      🌸 {currentLang === 'te' ? 'డెకరేషన్ విధానం' : 'Decor Policy'}
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white mt-0.5 block">
                      {String(listing.customFieldValues.decorationPolicy)}
                    </span>
                  </div>
                )}

                {listing.customFieldValues?.operatingHours && (
                  <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-bold">
                      ⏰ {currentLang === 'te' ? 'ఆపరేటింగ్ సమయాలు' : 'Available Time Slots'}
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white mt-0.5 block">
                      {String(listing.customFieldValues.operatingHours)}
                    </span>
                  </div>
                )}

                {listing.customFieldValues?.cancellationPolicy && (
                  <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-bold">
                      🔄 {currentLang === 'te' ? 'రద్దు నిబంధన' : 'Cancellation Policy'}
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white mt-0.5 block">
                      {String(listing.customFieldValues.cancellationPolicy)}
                    </span>
                  </div>
                )}

                {listing.customFieldValues?.approvalRequired && (
                  <div className="bg-amber-50 dark:bg-amber-950/50 p-3 rounded-2xl border border-amber-300 dark:border-amber-800 shadow-2xs col-span-2 sm:col-span-3">
                    <span className="text-[10px] text-amber-900 dark:text-amber-200 uppercase tracking-wider block font-extrabold">
                      📜 {currentLang === 'te' ? 'ప్రభుత్వ / పోలీసు అనుమతుల నిబంధనలు (Political & Public Events)' : 'Approval & Police Clearance Required'}
                    </span>
                    <span className="font-black text-amber-950 dark:text-amber-100 mt-0.5 block text-xs">
                      {String(listing.customFieldValues.approvalRequired)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Official Scannable 1D Barcode & 2D QR Pass — Displayed ONLY for Movie Tickets */}
          {(listing.categoryId.startsWith('movie-') ||
            listing.customFieldValues?.sectionType === 'movies') && (
            <UniversalBarcode
              value={generateBosBarcodeId('TKT', listing.id, listing.categoryId)}
              label="🎬 Movie Ticket & Seat Entry Barcode"
              sublabel={`${displayTitle} • ${displayProviderName} • ${listing.location.area}, ${listing.location.city} • ₹${listing.price.toLocaleString('en-IN')}${displayPriceUnit}`}
              moduleTag={listing.categoryId}
              variant="full"
              showQr={true}
            />
          )}

          {/* Provider / Seller Contact Card */}
          <div className="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-950/40 dark:to-indigo-950/40 p-4 sm:p-5 rounded-2xl border border-purple-200 dark:border-purple-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img
                src={listing.providerAvatar}
                alt={displayProviderName}
                className="w-14 h-14 rounded-2xl object-cover ring-2 ring-purple-300 dark:ring-purple-700 bg-white"
              />
              <div>
                <div className="flex items-center gap-1.5">
                  <h4 className="font-black text-sm sm:text-base text-slate-900 dark:text-white">
                    {displayProviderName}
                  </h4>
                  {listing.isVerified && (
                    <ShieldCheck className="w-4 h-4 text-purple-600" />
                  )}
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-400 font-medium">
                  {t.verifiedPro} · {listing.enquiriesCount} {t.enquiries}
                </div>
                <div className="text-xs font-bold text-purple-900 dark:text-purple-300 tabular-nums mt-0.5">
                  📞 {listing.providerPhone} · {listing.providerEmail}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleDirectCall}
                className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 hover:bg-slate-50 transition-colors shadow-xs"
              >
                <Phone className="w-3.5 h-3.5 text-emerald-600" />
                <span>{t.callNow}</span>
              </button>

              <a
                href={`https://wa.me/91${listing.providerPhone}?text=${encodeURIComponent(`నమస్కారం ${displayProviderName}, BookOurSpace లో మీ సర్వీస్ "${displayTitle}" చూశాను.`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>WhatsApp</span>
              </a>
            </div>
          </div>

          {/* Customer Reviews & Feedback */}
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between">
              <h4 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white flex items-center gap-2">
                <span>{currentLang === 'te' ? 'ధృవీకరించబడిన సమీక్షలు' : 'Verified Reviews'} ({listingReviews.length})</span>
                <span className="text-amber-500 text-xs font-bold flex items-center gap-0.5">
                  <Star className="w-3.5 h-3.5 fill-current" />
                  <span>{listing.providerRating}</span>
                </span>
              </h4>
            </div>

            {/* Existing Reviews */}
            <div className="space-y-3">
              {listingReviews.length === 0 ? (
                <p className="text-xs text-slate-400 italic">
                  {currentLang === 'te' ? 'ఇంకా ఎలాంటి రివ్యూలు లేవు. మొదట మీరే సమీక్ష రాయండి!' : 'No reviews yet. Be the first to review this provider!'}
                </p>
              ) : (
                listingReviews.map(rev => (
                  <div key={rev.id} className="p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <img src={rev.customerAvatar} alt="cust" className="w-6 h-6 rounded-full object-cover" />
                        <span className="font-bold text-xs text-slate-900 dark:text-white">{rev.customerName}</span>
                        {rev.verifiedCustomer && (
                          <span className="text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 px-1.5 py-0.2 rounded-sm font-semibold flex items-center gap-1">
                            <ShieldCheck className="w-3 h-3 text-emerald-600" />
                            <span>{currentLang === 'te' ? 'ధృవీకరించబడిన బుకింగ్' : 'Verified'}</span>
                          </span>
                        )}
                      </div>
                      <div className="flex items-center text-amber-500 text-xs font-bold gap-0.5">
                        {Array.from({ length: rev.rating }).map((_, i) => (
                          <Star key={i} className="w-3 h-3 fill-current" />
                        ))}
                      </div>
                    </div>

                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      {rev.comment}
                    </p>

                    {/* Tags if present */}
                    {rev.tags && rev.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {rev.tags.map((t, idx) => (
                          <span key={idx} className="text-[10px] bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded-md font-semibold">
                            {t}
                          </span>
                        ))}
                      </div>
                    )}

                    <span className="text-[10px] text-slate-400 block">{rev.date}</span>
                  </div>
                ))
              )}
            </div>

            {/* Leave a Review Interactive Form */}
            <form onSubmit={handleReviewSubmit} className="bg-gradient-to-br from-amber-50/70 via-purple-50/40 to-slate-50 dark:from-slate-800/80 dark:to-slate-800/50 p-4 sm:p-5 rounded-2xl border border-amber-200 dark:border-slate-700 space-y-3.5 shadow-xs">
              <div className="flex items-center justify-between">
                <h5 className="font-extrabold text-xs sm:text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Star className="w-4 h-4 fill-amber-400 text-amber-500" />
                  <span>{currentLang === 'te' ? 'సేవకు రేటింగ్ & ఫీడ్‌బ్యాక్ ఇవ్వండి' : 'Rate & Write Short Feedback'}</span>
                </h5>

                <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5 text-purple-600" />
                  <span>{currentLang === 'te' ? 'అంచనా సగటు:' : 'Projected Avg:'}</span>
                  <strong className="text-amber-600 dark:text-amber-400 font-black">{projectedRating}★</strong>
                </div>
              </div>

              {reviewSubmitted && submittedStats ? (
                <div className="p-3 bg-emerald-100 dark:bg-emerald-950/80 text-emerald-900 dark:text-emerald-200 rounded-xl text-xs font-bold flex items-center gap-2 animate-in zoom-in-95">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <span>
                    {currentLang === 'te'
                      ? `ధన్యవాదాలు! మీ రేటింగ్ నమోదైంది. సగటు రేటింగ్ ${submittedStats.newRating}★ కి పెరిగింది.`
                      : `Thank you! Rating submitted. Provider's average updated to ${submittedStats.newRating}★.`}
                  </span>
                </div>
              ) : (
                <>
                  {/* Interactive Star Buttons */}
                  <div className="flex items-center gap-2 p-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 justify-center">
                    <span className="text-xs font-bold text-slate-500 mr-2">{currentLang === 'te' ? 'రేటింగ్:' : 'Rating:'}</span>
                    {[1, 2, 3, 4, 5].map((starVal) => {
                      const isFilled = starVal <= (hoverRating || newRating);
                      return (
                        <button
                          key={starVal}
                          type="button"
                          onClick={() => {
                            setNewRating(starVal);
                            setHoverRating(0);
                            playAlertChime('pop');
                          }}
                          onMouseEnter={() => setHoverRating(starVal)}
                          onMouseLeave={() => setHoverRating(0)}
                          className={`p-1 transition-transform cursor-pointer touch-manipulation active:scale-90 ${
                            isFilled ? 'text-amber-400 scale-115' : 'text-slate-300 dark:text-slate-700 hover:text-amber-300'
                          }`}
                        >
                          <Star className={`w-6 h-6 ${isFilled ? 'fill-amber-400' : 'stroke-current'}`} />
                        </button>
                      );
                    })}
                    <span className="text-xs font-black text-amber-600 dark:text-amber-400 ml-1">
                      {newRating} / 5
                    </span>
                  </div>

                  {/* Compliment Tags Chips */}
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      currentLang === 'te' ? '⚡ సమయానికి వచ్చారు' : '⚡ On-Time',
                      currentLang === 'te' ? '🛠️ నైపుణ్యమైన పని' : '🛠️ Quality Work',
                      currentLang === 'te' ? '💰 సరసమైన ధర' : '💰 Fair Price',
                      currentLang === 'te' ? '🤝 మర్యాదపూర్వక ప్రవర్తన' : '🤝 Polite',
                      currentLang === 'te' ? '🧹 పరిశుభ్రంగా చేశారు' : '🧹 Neat & Clean'
                    ].map((tag, idx) => {
                      const isSelected = selectedReviewTags.includes(tag);
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => toggleReviewTag(tag)}
                          className={`text-[11px] px-2.5 py-1 rounded-lg font-bold border transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-purple-700 text-white border-purple-700 shadow-2xs'
                              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <input
                      type="text"
                      required
                      value={reviewerName}
                      onChange={(e) => setReviewerName(e.target.value)}
                      placeholder={currentLang === 'te' ? 'మీ పేరు' : 'Your full name'}
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-base sm:text-xs text-slate-900 dark:text-white outline-hidden focus:border-purple-600"
                    />

                    <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                      <span>{currentLang === 'te' ? 'ధృవీకరించబడిన సమీక్షగా ప్రచురించబడుతుంది' : 'Verified customer review'}</span>
                    </div>
                  </div>

                  <textarea
                    rows={2}
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder={currentLang === 'te' ? 'సేవ గురించి చిన్న ఫీడ్‌బ్యాక్ రాయండి...' : 'Share a short feedback about this service...'}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-base sm:text-xs text-slate-900 dark:text-white outline-hidden focus:border-purple-600 resize-none"
                  />

                  <button
                    type="submit"
                    className="px-4 py-2.5 bg-gradient-to-r from-amber-500 to-purple-700 hover:from-amber-600 hover:to-purple-800 text-white rounded-xl text-xs font-black shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer w-full"
                  >
                    <Star className="w-3.5 h-3.5 fill-amber-300 text-amber-300" />
                    <span>{currentLang === 'te' ? `⭐ ${newRating} స్టార్ల సమీక్ష సమర్పించండి` : `Submit ${newRating}-Star Review`}</span>
                  </button>
                </>
              )}
            </form>
          </div>
        </div>

        {/* Modal Fixed Footer CTA */}
        {isStay ? (
          <div className="sticky bottom-0 flex items-center justify-between gap-4 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 sm:px-6">
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-slate-900 dark:text-white">{listing.currency}{listing.price.toLocaleString('en-IN')} <span className="text-xs font-bold text-slate-500">{displayPriceUnit}</span></p>
              <p className="text-[11px] font-bold text-slate-500">{currentLang === 'te' ? 'తేదీలను ఎంచుకున్న తర్వాత తుది ధర' : 'Final price after selecting dates'}</p>
            </div>
            <button
              onClick={() => {
                onClose();
                onBookNow(listing);
              }}
              className="shrink-0 rounded-xl bg-[#FF385C] px-7 py-3 text-sm font-black text-white shadow-sm transition hover:bg-rose-700 active:scale-95"
            >
              {currentLang === 'te' ? 'రిజర్వ్ / Reserve' : 'Reserve'}
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <button
              onClick={() => {
                onClose();
                onEnquire(listing);
              }}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-slate-300 py-3 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 sm:text-sm"
            >
              <MessageSquare className="h-4 w-4 text-purple-600" />
              <span>{t.chat}</span>
            </button>

            <button
              onClick={() => {
                onClose();
                onBookNow(listing);
              }}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#4A148C] py-3 text-xs font-black text-white shadow-lg shadow-purple-950/20 transition-all hover:bg-purple-900 active:scale-95 sm:text-sm"
            >
              <Calendar className="h-4 w-4 text-amber-300" />
              <span>{t.bookNow}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
