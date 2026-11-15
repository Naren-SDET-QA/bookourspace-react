import React, { useState, useEffect, useRef } from 'react';
import SafeImage from './SafeImage';
import { 
  X, 
  Star, 
  Check, 
  Sparkles, 
  ThumbsUp, 
  Mic, 
  MicOff, 
  ShieldCheck, 
  TrendingUp, 
  MessageSquare,
  Award,
  CheckCircle2
} from 'lucide-react';
import { MarketplaceListing } from '../types/marketplace';
import { useMarketplace } from '../context/MarketplaceContext';
import { AppLanguage, translations, getListingTitle, getProviderDisplayName } from '../utils/translations';
import { playAlertChime } from '../utils/audio';

interface ReviewSubmissionModalProps {
  listing: MarketplaceListing | null;
  isOpen: boolean;
  onClose: () => void;
  currentLang?: AppLanguage;
  onReviewSubmitted?: (newRating: number, newCount: number) => void;
}

const complimentTags = [
  { id: 'ontime', labelTe: '⚡ సమయానికి వచ్చారు', labelEn: '⚡ On-Time Arrival', labelHi: '⚡ समय पर पहुंचे' },
  { id: 'quality', labelTe: '🛠️ నైపుణ్యమైన పని', labelEn: '🛠️ Expert Quality Work', labelHi: '🛠️ बेहतरीन काम' },
  { id: 'fair_price', labelTe: '💰 సరసమైన ధర', labelEn: '💰 Reasonable Pricing', labelHi: '💰 सही कीमत' },
  { id: 'polite', labelTe: '🤝 మర్యాదపూర్వక ప్రవర్తన', labelEn: '🤝 Polite & Respectful', labelHi: '🤝 विनम्र व्यवहार' },
  { id: 'clean', labelTe: '🧹 పరిశుభ్రంగా చేశారు', labelEn: '🧹 Clean & Neat Work', labelHi: '🧹 साफ-सुथरा काम' },
  { id: 'recommend', labelTe: '💯 ఇతరులకు సిఫార్సు చేస్తాను', labelEn: '💯 Highly Recommended', labelHi: '💯 जरूर सलाह दूंगा' }
];

const sampleFeedbackSuggestions = [
  {
    te: 'చాలా అద్భుతమైన సర్వీస్! సమస్యను వెంటనే గుర్తించి శ్రద్ధగా పరిష్కరించారు. ఖచ్చితంగా మళ్లీ బుక్ చేసుకుంటాను.',
    en: 'Excellent and punctual service! Diagnosed the problem immediately and fixed it thoroughly. Highly recommended.',
    hi: 'बहुत ही बढ़िया काम! समस्या को तुरंत समझकर ठीक कर दिया। बहुत विनम्र स्वभाव।'
  },
  {
    te: 'సమయానికి వచ్చారు, సరసమైన ఛార్జీలు తీసుకున్నారు. పని చాలా సంతృప్తికరంగా ఉంది.',
    en: 'Arrived right on time and charged reasonable rates. Very neat and reliable job.',
    hi: 'समय पर पहुंचे और सही पैसे लिए। काम बहुत अच्छा लगा।'
  }
];

export const ReviewSubmissionModal: React.FC<ReviewSubmissionModalProps> = ({
  listing,
  isOpen,
  onClose,
  currentLang = 'te',
  onReviewSubmitted
}) => {
  const { addReview } = useMarketplace();

  const [rating, setRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [comment, setComment] = useState<string>('');
  const [customerName, setCustomerName] = useState<string>(() => {
    return currentLang === 'te' ? 'రమేష్ కుమార్ (హైదరాబాద్)' : 'Ramesh Kumar';
  });
  const [selectedTags, setSelectedTags] = useState<string[]>(['ontime', 'quality']);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitSuccess, setSubmitSuccess] = useState<boolean>(false);
  const [updatedStats, setUpdatedStats] = useState<{ newRating: number; newCount: number } | null>(null);

  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (isOpen) {
      setRating(5);
      setHoverRating(0);
      setComment('');
      setSelectedTags(['ontime', 'quality']);
      setSubmitSuccess(false);
      setUpdatedStats(null);
    }
  }, [isOpen]);

  if (!isOpen || !listing) return null;

  const currentRating = listing.providerRating ?? 5.0;
  const currentCount = listing.reviewCount ?? 0;
  
  // Calculate dynamic projected average rating
  const effectiveRating = hoverRating || rating;
  const projectedCount = currentCount + 1;
  const projectedRating = Number(((currentRating * currentCount + effectiveRating) / projectedCount).toFixed(1));
  const ratingDiff = Number((projectedRating - currentRating).toFixed(1));

  const t = translations[currentLang] || translations.te;
  const displayTitle = getListingTitle(listing, currentLang);
  const displayProviderName = getProviderDisplayName(listing.providerNameTe || listing.providerName, currentLang);

  const getStarLabel = (stars: number) => {
    switch (stars) {
      case 5:
        return currentLang === 'te' 
          ? '⭐⭐⭐⭐⭐ అద్భుతం! (5/5 Outstanding)' 
          : currentLang === 'hi' 
          ? '⭐⭐⭐⭐⭐ बहुत ही शानदार! (5/5)' 
          : '⭐⭐⭐⭐⭐ Outstanding! (5/5)';
      case 4:
        return currentLang === 'te' 
          ? '⭐⭐⭐⭐ చాలా బాగుంది (4/5 Very Good)' 
          : currentLang === 'hi' 
          ? '⭐⭐⭐⭐ बहुत अच्छा (4/5)' 
          : '⭐⭐⭐⭐ Very Good (4/5)';
      case 3:
        return currentLang === 'te' 
          ? '⭐⭐⭐ బాగుంది / పర్వాలేదు (3/5 Good)' 
          : currentLang === 'hi' 
          ? '⭐⭐⭐ ठीक-ठाक (3/5)' 
          : '⭐⭐⭐ Good / Satisfactory (3/5)';
      case 2:
        return currentLang === 'te' 
          ? '⭐⭐ ఆశించినంతగా లేదు (2/5 Below Average)' 
          : currentLang === 'hi' 
          ? '⭐⭐ उम्मीद से कम (2/5)' 
          : '⭐⭐ Below Average (2/5)';
      case 1:
        return currentLang === 'te' 
          ? '⭐ బాగోలేదు (1/5 Poor)' 
          : currentLang === 'hi' 
          ? '⭐ खराब अनुभव (1/5)' 
          : '⭐ Poor (1/5)';
      default:
        return '';
    }
  };

  const toggleTag = (tagId: string) => {
    setSelectedTags(prev => 
      prev.includes(tagId) ? prev.filter(t => t !== tagId) : [...prev, tagId]
    );
  };

  // Voice speech-to-text input for Telugu/English feedback
  const toggleVoiceInput = () => {
    if (isListening) {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch {}
      }
      setIsListening(false);
      return;
    }

    const SpeechRecognitionClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionClass) {
      // Fast fallback suggestion
      const fallback = sampleFeedbackSuggestions[0][currentLang === 'te' ? 'te' : currentLang === 'hi' ? 'hi' : 'en'];
      setComment(prev => prev ? `${prev} ${fallback}` : fallback);
      return;
    }

    try {
      const recognition = new SpeechRecognitionClass();
      recognitionRef.current = recognition;
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = currentLang === 'te' ? 'te-IN' : currentLang === 'hi' ? 'hi-IN' : 'en-IN';

      recognition.onstart = () => {
        setIsListening(true);
        playAlertChime('pop');
      };

      recognition.onresult = (event: any) => {
        const text = event.results[0][0].transcript;
        if (text) {
          setComment(prev => prev ? `${prev} ${text}` : text);
        }
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
    } catch {
      setIsListening(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim() && selectedTags.length === 0) {
      setComment(sampleFeedbackSuggestions[0][currentLang === 'te' ? 'te' : currentLang === 'hi' ? 'hi' : 'en']);
    }

    const finalComment = comment.trim() || sampleFeedbackSuggestions[0][currentLang === 'te' ? 'te' : currentLang === 'hi' ? 'hi' : 'en'];
    const finalCustomerName = customerName.trim() || (currentLang === 'te' ? 'సంతృప్తి చెందిన కస్టమర్' : 'Satisfied Customer');

    setIsSubmitting(true);

    const result = addReview({
      listingId: listing.id,
      customerName: finalCustomerName,
      customerAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80',
      rating,
      comment: finalComment,
      verifiedCustomer: true,
      tags: selectedTags,
      providerId: listing.providerId
    });

    playAlertChime('confirm');

    setUpdatedStats(result);
    setSubmitSuccess(true);
    setIsSubmitting(false);

    if (onReviewSubmitted) {
      onReviewSubmitted(result.newRating, result.newCount);
    }

    setTimeout(() => {
      onClose();
    }, 2400);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden my-4 max-h-[92vh] flex flex-col">
        
        {/* Modal Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-amber-500 via-orange-500 to-purple-800 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-xs flex items-center justify-center text-amber-200 shadow-inner">
              <Star className="w-5 h-5 fill-current" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-amber-200">
                <Sparkles className="w-3.5 h-3.5" />
                <span>{currentLang === 'te' ? 'సేవా సమీక్ష & రేటింగ్' : 'Service Review & Rating'}</span>
              </div>
              <h3 className="font-black text-base sm:text-lg line-clamp-1 text-white">
                {displayTitle}
              </h3>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/20 text-white transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 text-slate-800 dark:text-slate-100">
          
          {submitSuccess && updatedStats ? (
            /* Celebration Success State */
            <div className="py-8 text-center space-y-4 animate-in zoom-in-95 duration-200">
              <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto shadow-lg ring-8 ring-emerald-50 dark:ring-emerald-950/40">
                <CheckCircle2 className="w-10 h-10 stroke-[2.5]" />
              </div>

              <div className="space-y-1.5">
                <span className="inline-block px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 font-extrabold text-xs">
                  ⭐ {rating} / 5 Stars Submitted
                </span>
                <h4 className="font-black text-xl text-slate-900 dark:text-white">
                  {currentLang === 'te' ? 'ధన్యవాదాలు! మీ సమీక్ష ప్రచురించబడింది' : 'Thank You! Review Published'}
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-300 max-w-sm mx-auto leading-relaxed">
                  {currentLang === 'te'
                    ? `${displayProviderName} గారి సగటు రేటింగ్ విజయవంతంగా ${updatedStats.newRating}★ కి నవీకరించబడింది.`
                    : `${displayProviderName}'s average rating has been updated to ${updatedStats.newRating}★ based on ${updatedStats.newCount} reviews.`}
                </p>
              </div>

              {/* Dynamic Update Pill */}
              <div className="inline-flex items-center gap-3 p-3.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xs">
                <div className="text-left">
                  <span className="text-[10px] text-slate-400 block">{currentLang === 'te' ? 'మునుపటి రేటింగ్:' : 'Previous Rating:'}</span>
                  <span className="font-bold text-xs text-slate-600 dark:text-slate-400">{currentRating}★ ({currentCount})</span>
                </div>
                <div className="text-emerald-600 font-black text-sm">➔</div>
                <div className="text-left">
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold block">{currentLang === 'te' ? 'కొత్త సగటు రేటింగ్:' : 'New Average:'}</span>
                  <span className="font-black text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
                    <Star className="w-3.5 h-3.5 fill-current" />
                    <span>{updatedStats.newRating}★</span>
                    <span className="text-xs text-slate-400 font-normal">({updatedStats.newCount})</span>
                  </span>
                </div>
              </div>
            </div>
          ) : (
            /* Review Input Form */
            <form onSubmit={handleSubmit} className="space-y-5">
              
              {/* Provider Info Pill */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80">
                <div className="flex items-center gap-3 min-w-0">
                  <SafeImage category="general"
                    src={listing.providerAvatar}
                    alt={displayProviderName}
                    className="w-10 h-10 rounded-full object-cover ring-2 ring-amber-400 shrink-0"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80';
                    }}
                  />
                  <div className="min-w-0">
                    <div className="font-extrabold text-xs sm:text-sm text-slate-900 dark:text-white truncate flex items-center gap-1.5">
                      <span>{displayProviderName}</span>
                      <ShieldCheck className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-0.5">
                      <span>{currentLang === 'te' ? 'ప్రస్తుత సగటు:' : 'Current Avg:'}</span>
                      <span className="font-bold text-amber-600 dark:text-amber-400 flex items-center gap-0.5">
                        <Star className="w-3 h-3 fill-current" />
                        <span>{currentRating}</span>
                      </span>
                      <span>({currentCount} {t.reviews})</span>
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-950/60 px-2 py-0.5 rounded-md">
                    <Award className="w-3 h-3" />
                    <span>{listing.subcategory}</span>
                  </span>
                </div>
              </div>

              {/* 1. 5-STAR INTERACTIVE RATING SELECTOR */}
              <div className="space-y-2 text-center p-4 bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50 rounded-2xl">
                <label className="block text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  {currentLang === 'te' ? '1 నుండి 5 స్టార్ల రేటింగ్ ఇవ్వండి' : 'Select Star Rating (1 to 5 Stars)'}
                </label>

                {/* Star Buttons */}
                <div className="flex items-center justify-center gap-2 sm:gap-3 py-1">
                  {[1, 2, 3, 4, 5].map((starVal) => {
                    const isFilled = starVal <= (hoverRating || rating);
                    return (
                      <button
                        key={starVal}
                        type="button"
                        onClick={() => {
                          setRating(starVal);
                          setHoverRating(0);
                          playAlertChime('pop');
                        }}
                        onMouseEnter={() => setHoverRating(starVal)}
                        onMouseLeave={() => setHoverRating(0)}
                        className={`p-1.5 sm:p-2 rounded-2xl transition-all duration-150 transform cursor-pointer active:scale-90 touch-manipulation ${
                          isFilled 
                            ? 'text-amber-400 hover:scale-125 hover:rotate-6' 
                            : 'text-slate-300 dark:text-slate-700 hover:text-amber-200 hover:scale-110'
                        }`}
                        aria-label={`${starVal} star`}
                      >
                        <Star 
                          className={`w-8 h-8 sm:w-10 sm:h-10 transition-colors ${
                            isFilled ? 'fill-amber-400 drop-shadow-md' : 'stroke-current'
                          }`} 
                        />
                      </button>
                    );
                  })}
                </div>

                {/* Dynamic Star Level Feedback Label */}
                <div className="h-6 flex items-center justify-center">
                  <span className="text-xs sm:text-sm font-extrabold text-amber-700 dark:text-amber-300 animate-in fade-in duration-150">
                    {getStarLabel(effectiveRating)}
                  </span>
                </div>

                {/* Dynamic Rating Forecast Pill */}
                <div className="pt-1 flex items-center justify-center gap-2 text-[11px] text-slate-600 dark:text-slate-400">
                  <TrendingUp className="w-3.5 h-3.5 text-purple-600" />
                  <span>
                    {currentLang === 'te' ? 'సగటు అంచనా:' : 'Projected Average:'}{' '}
                    <strong className="text-slate-900 dark:text-white font-black">{projectedRating}★</strong>{' '}
                    ({projectedCount} {t.reviews})
                  </span>
                  {ratingDiff !== 0 && (
                    <span className={`font-black px-1.5 py-0.2 rounded-sm text-[10px] ${
                      ratingDiff > 0 
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' 
                        : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                    }`}>
                      {ratingDiff > 0 ? `+${ratingDiff}` : ratingDiff}
                    </span>
                  )}
                </div>
              </div>

              {/* 2. QUICK COMPLIMENT TAGS */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <ThumbsUp className="w-3.5 h-3.5 text-purple-600" />
                  <span>{currentLang === 'te' ? 'ముఖ్య అంశాలను ఎంచుకోండి (Quick Highlights):' : 'Key Highlights (Select all that apply):'}</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {complimentTags.map((tag) => {
                    const isSelected = selectedTags.includes(tag.id);
                    const tagLabel = currentLang === 'te' ? tag.labelTe : currentLang === 'hi' ? tag.labelHi : tag.labelEn;
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => toggleTag(tag.id)}
                        className={`text-xs px-3 py-1.5 rounded-xl font-bold transition-all border cursor-pointer ${
                          isSelected
                            ? 'bg-purple-700 text-white border-purple-700 shadow-xs scale-102 ring-2 ring-purple-300 dark:ring-purple-900'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'
                        }`}
                      >
                        {tagLabel}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 3. SHORT TEXT FEEDBACK WITH VOICE & TEMPLATES */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-purple-600" />
                    <span>{currentLang === 'te' ? 'మీ అనుభవం లేదా ఫీడ్‌బ్యాక్ రాయండి:' : 'Short Feedback:'}</span>
                  </label>

                  {/* Mic button for voice speech-to-text */}
                  <button
                    type="button"
                    onClick={toggleVoiceInput}
                    className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-xl transition-all cursor-pointer ${
                      isListening
                        ? 'bg-red-500 text-white animate-pulse shadow-md'
                        : 'bg-purple-100 dark:bg-purple-950/70 text-purple-700 dark:text-purple-300 hover:bg-purple-200'
                    }`}
                    title="Voice speech-to-text"
                  >
                    {isListening ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
                    <span>{isListening ? (currentLang === 'te' ? 'వింటున్నాము...' : 'Listening...') : (currentLang === 'te' ? 'వాయిస్ ద్వారా చెప్పండి' : 'Voice Input')}</span>
                  </button>
                </div>

                <div className="relative">
                  <textarea
                    rows={3}
                    maxLength={300}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder={
                      currentLang === 'te'
                        ? 'ఉదా: పని చాలా బాగుంది, సమయానికి వచ్చారు, సరసమైన ఛార్జీలు తీసుకున్నారు...'
                        : currentLang === 'hi'
                        ? 'उदा: बहुत अच्छा काम, समय पर पहुंचे और सही पैसे लिए...'
                        : 'Share a few words about punctuality, pricing, and service quality...'
                    }
                    className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 text-base sm:text-xs text-slate-900 dark:text-white placeholder:text-slate-400 outline-hidden focus:border-purple-600 focus:ring-2 focus:ring-purple-600/20 transition-all resize-none"
                  />
                  <span className="absolute bottom-2.5 right-3 text-[10px] text-slate-400 font-mono">
                    {comment.length}/300
                  </span>
                </div>

                {/* Quick 1-tap template suggestion */}
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                  <span className="text-[10px] text-slate-400 shrink-0 font-medium">{currentLang === 'te' ? 'వేగవంతమైన సూచనలు:' : 'Quick fills:'}</span>
                  {sampleFeedbackSuggestions.map((s, idx) => {
                    const text = currentLang === 'te' ? s.te : currentLang === 'hi' ? s.hi : s.en;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setComment(text)}
                        className="text-[10px] font-medium px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-purple-50 dark:bg-slate-800 dark:hover:bg-purple-950/40 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shrink-0 truncate max-w-[200px]"
                      >
                        "{text.slice(0, 30)}..."
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 4. CUSTOMER NAME */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  {currentLang === 'te' ? 'మీ పేరు (Reviewer Name):' : 'Your Name:'}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Enter your name"
                    className="flex-1 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-base sm:text-xs text-slate-900 dark:text-white outline-hidden focus:border-purple-600"
                  />
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 px-2 py-2 rounded-xl shrink-0">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>{currentLang === 'te' ? 'ధృవీకరించబడింది' : 'Verified'}</span>
                  </span>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="pt-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  {currentLang === 'te' ? 'రద్దు' : 'Cancel'}
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-3 px-4 rounded-2xl bg-gradient-to-r from-amber-500 via-purple-700 to-indigo-800 hover:from-amber-600 hover:to-indigo-900 active:scale-98 text-white text-xs sm:text-sm font-black shadow-lg shadow-purple-950/20 flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <Star className="w-4 h-4 fill-amber-300 text-amber-300" />
                  <span>
                    {isSubmitting
                      ? (currentLang === 'te' ? 'సమర్పిస్తున్నాము...' : 'Submitting...')
                      : (currentLang === 'te' ? `⭐ ${rating} స్టార్ల సమీక్షను సమర్పించండి` : `Submit ${rating}-Star Review`)}
                  </span>
                </button>
              </div>

            </form>
          )}

        </div>
      </div>
    </div>
  );
};
