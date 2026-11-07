import React, { useState, useEffect, useRef, useMemo } from 'react';
import SafeImage from './SafeImage';
import {
  Sparkles,
  X,
  Send,
  Zap,
  MapPin,
  Star,
  Calendar,
  ShieldCheck,
  Filter,
  CheckCircle2,
  ArrowRight,
  Mic,
  MicOff,
  Bot,
  User,
  Clock,
  SlidersHorizontal,
  RefreshCw,
  Building2,
  Eye,
} from 'lucide-react';
import { MarketplaceListing } from '../types/marketplace';
import { AppLanguage, getListingTitle } from '../utils/translations';
import { triggerGlobalGlobeLoader } from './BOSBrandLogo';

export interface QuickBookActiveFilters {
  activeMarketSection: string;
  selectedCity: string;
  selectedArea: string;
  selectedCategory: string;
  selectedSubcategory: string;
  selectedPriceRange: string;
  selectedRating: number | 'all';
  verifiedOnly: boolean;
  featuredOnly: boolean;
  hourlyBookingOnly: boolean;
  filterStartDate: string;
  filterEndDate: string;
  searchQuery: string;
  selectedPGGender?: string;
  selectedPGSharing?: string;
  selectedPGAC?: string;
  selectedPGFood?: string;
  selectedDeliveryMode?: string;
  selectedTimingSlot?: string;
}

export interface AIExtractedPreferences {
  occasionOrNeed: string;
  preferredArea: string;
  budgetSummary: string;
  guestCountOrCapacity: string;
  preferredDate: string;
  checkOutDate: string;
  suggestedStayMode: string;
  autoBookBestMatch: boolean;
}

export interface AIQuickBookRecommendation {
  listingId: string;
  matchScore: number;
  matchHeadline: string;
  whyItMatches: string;
  suggestedSlotOrPackage: string;
  estimatedPriceLabel: string;
  keyHighlights: string[];
}

interface ChatTurn {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
  extractedPreferences?: AIExtractedPreferences;
  recommendations?: AIQuickBookRecommendation[];
  modelUsed?: string;
}

interface QuickBookChatAssistantProps {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  activeFilters: QuickBookActiveFilters;
  filteredListings: MarketplaceListing[];
  allActiveListings: MarketplaceListing[];
  currentLang: AppLanguage;
  onInitiateBooking: (
    listing: MarketplaceListing,
    preferences?: AIExtractedPreferences,
    recommendation?: AIQuickBookRecommendation
  ) => void;
  onViewListingDetails?: (listing: MarketplaceListing) => void;
}

const SECTION_SMART_PROMPTS: Record<string, { en: string[]; te: string[] }> = {
  venues: {
    en: [
      'Suggest the best AC Wedding Convention Hall for 500 guests with dining & parking',
      'Find a verified Birthday / Reception Banquet Hall under ₹35,000 in my selected area',
      'Top-rated Function Hall with decoration & catering support — Quick Book now',
    ],
    te: [
      '500 మంది అతిథుల కోసం ఉత్తమ ఏసీ మ్యారేజ్ ఫంక్షన్ హాల్ సూచించండి',
      'తక్కువ బడ్జెట్‌లో వెరిఫైడ్ బర్త్‌డే / రిసెప్షన్ బాంక్వెట్ హాల్ చూపించండి',
      'టాప్ రేటింగ్ ఉన్న ఫంక్షన్ హాల్ వెంటనే బుక్ చేయండి',
    ],
  },
  services: {
    en: [
      'Recommend the highest-rated AC repair & deep service technician available today',
      'Find a verified full-home deep cleaning or plumbing expert under ₹1,000',
      'Best urgent electrician / home appliance service near my area — Quick Book now',
    ],
    te: [
      'ఈరోజు అందుబాటులో ఉన్న టాప్ రేటింగ్ ఏసీ రిపేర్ & సర్వీస్ టెక్నీషియన్‌ను సూచించండి',
      '₹1,000 లోపు వెరిఫైడ్ హోమ్ డీప్ క్లీనింగ్ లేదా ప్లంబింగ్ సర్వీస్ చూపించండి',
      'అత్యవసర ఎలక్ట్రీషియన్ / హోమ్ సర్వీస్ వెంటనే బుక్ చేయండి',
    ],
  },
  hotel_stay: {
    en: [
      'Find the best 3-Hour flexible hourly luxury hotel stay near Hitech City / Gachibowli',
      'Suggest a verified couple-friendly or executive business hotel suite with breakfast',
      'Best value hotel room matching my dates — select & Quick Book immediately',
    ],
    te: [
      'హైటెక్ సిటీ / గచ్చిబౌలి దగ్గర 3-గంటల హౌర్లీ లగ్జరీ హోటల్ స్టే సూచించండి',
      'బ్రేక్‌ఫాస్ట్ ఉన్న వెరిఫైడ్ ఎగ్జిక్యూటివ్ బిజినెస్ హోటల్ రూమ్ చూపించండి',
      'నా తేదీలకు సరిపోయే ఉత్తమ హోటల్ రూమ్ వెంటనే బుక్ చేయండి',
    ],
  },
  pg_hostels: {
    en: [
      'Suggest the best AC Single/Double Sharing PG with homely 3-time food & Wi-Fi',
      'Find a verified Ladies / Men Co-Living Hostel near IT corridor under ₹12,000',
      'Top-rated PG hostel with gym, laundry & zero brokerage — Quick Book bed now',
    ],
    te: [
      'హోమ్లీ భోజనం & వై-ఫై ఉన్న ఉత్తమ ఏసీ సింగిల్/డబుల్ షేరింగ్ పీజీ సూచించండి',
      'ఐటీ కారిడార్ దగ్గర ₹12,000 లోపు వెరిఫైడ్ హాస్టల్ చూపించండి',
      'టాప్ రేటింగ్ ఉన్న పీజీ బెడ్ వెంటనే బుక్ చేయండి',
    ],
  },
  classes: {
    en: [
      'Suggest the best Full-Stack / AI Coaching institute with placement guarantee & free demo',
      'Find weekend or evening batch training with top student feedback score',
      'Best skill / academic coaching class near me — Quick Book trial seat now',
    ],
    te: [
      'ప్లేస్‌మెంట్ గ్యారెంటీ & ఫ్రీ డెమో ఉన్న ఉత్తమ కోచింగ్ ఇన్‌స్టిట్యూట్ సూచించండి',
      'వీకెండ్ లేదా ఈవినింగ్ బ్యాచ్ ఉన్న టాప్ రేటింగ్ క్లాస్ చూపించండి',
      'ఉత్తమ కోచింగ్ క్లాస్ ట్రయల్ సీట్ వెంటనే బుక్ చేయండి',
    ],
  },
  movies: {
    en: [
      'Suggest the best Dolby Atmos / 4K Multiplex show with recliner seats tonight',
      'Find family-friendly blockbuster movie tickets with instant QR pass',
      'Best multiplex screen in my city — Quick Book tickets now',
    ],
    te: [
      'డాల్బీ అట్మాస్ / 4K మల్టీప్లెక్స్ రిక్లైనర్ సీట్ల షో సూచించండి',
      'ఫ్యామిలీ బ్లాక్‌బస్టర్ మూవీ టికెట్లు వెంటనే బుక్ చేయండి',
      'ఉత్తమ మల్టీప్లెక్స్ స్క్రీన్ టికెట్లు చూపించండి',
    ],
  },
};

export const QuickBookChatAssistant: React.FC<QuickBookChatAssistantProps> = ({
  isOpen,
  onOpen,
  onClose,
  activeFilters,
  filteredListings,
  allActiveListings,
  currentLang,
  onInitiateBooking,
  onViewListingDetails,
}) => {
  const [inputMessage, setInputMessage] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [autoTriggerBookingOnTopMatch, setAutoTriggerBookingOnTopMatch] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  // Pool of candidate listings: prioritize current filteredListings; if empty, fall back to section or allActiveListings
  const candidatePool = useMemo(() => {
    if (filteredListings.length > 0) return filteredListings;
    const sectionMatches = allActiveListings.filter((l) => {
      const sec = l.customFieldValues?.sectionType;
      if (sec === activeFilters.activeMarketSection) return true;
      if (activeFilters.activeMarketSection === 'venues' && l.categoryId.startsWith('venue-')) return true;
      if (activeFilters.activeMarketSection === 'hotel_stay' && l.categoryId.startsWith('hotel-')) return true;
      if (activeFilters.activeMarketSection === 'pg_hostels' && l.categoryId.startsWith('pg-')) return true;
      if (activeFilters.activeMarketSection === 'classes' && l.categoryId.startsWith('class-')) return true;
      if (activeFilters.activeMarketSection === 'movies' && l.categoryId.startsWith('movie-')) return true;
      return activeFilters.activeMarketSection === 'services';
    });
    return sectionMatches.length > 0 ? sectionMatches : allActiveListings;
  }, [filteredListings, allActiveListings, activeFilters.activeMarketSection]);

  const listingMap = useMemo(() => {
    const map = new Map<string, MarketplaceListing>();
    for (const l of allActiveListings) {
      map.set(l.id, l);
    }
    for (const l of filteredListings) {
      map.set(l.id, l);
    }
    return map;
  }, [allActiveListings, filteredListings]);

  const sectionDisplayName = useMemo(() => {
    const sec = activeFilters.activeMarketSection;
    if (currentLang === 'te') {
      if (sec === 'venues') return 'ఫంక్షన్ హాల్స్ & వెన్యూస్';
      if (sec === 'services') return 'హోమ్ & లోకల్ సర్వీసెస్';
      if (sec === 'hotel_stay') return 'హోటల్స్ & స్టే';
      if (sec === 'pg_hostels') return 'పీజీలు & హాస్టల్స్';
      if (sec === 'classes') return 'క్లాసెస్ & కోచింగ్';
      if (sec === 'movies') return 'మూవీస్ & మల్టీప్లెక్స్';
    }
    if (sec === 'venues') return 'Function Halls & Venues';
    if (sec === 'services') return 'Home & Local Services';
    if (sec === 'hotel_stay') return 'Hotels & Stay';
    if (sec === 'pg_hostels') return 'PGs & Hostels';
    if (sec === 'classes') return 'Classes & Coaching';
    if (sec === 'movies') return 'Movies & Multiplex';
    return 'Marketplace';
  }, [activeFilters.activeMarketSection, currentLang]);

  // Initial assistant greeting with live filter awareness and top 2 instant picks
  const initialGreetingTurn = useMemo<ChatTurn>(() => {
    const topInitial = candidatePool.slice(0, 2);
    const recs: AIQuickBookRecommendation[] = topInitial.map((item, idx) => ({
      listingId: item.id,
      matchScore: idx === 0 ? 97 : 93,
      matchHeadline:
        idx === 0
          ? currentLang === 'te'
            ? '🏆 మీ ప్రస్తుత ఫిల్టర్‌లకు #1 బెస్ట్ మ్యాచ్'
            : '🏆 #1 Best Match for Your Current Filters'
          : currentLang === 'te'
          ? '⚡ టాప్ రేటెడ్ & వెరిఫైడ్ ఎంపిక'
          : '⚡ Top-Rated & Verified Alternative',
      whyItMatches:
        currentLang === 'te'
          ? `${item.location.area}, ${item.location.city} లో ${item.providerRating}★ రేటింగ్ (${item.reviewCount} రివ్యూలు) కలిగిన వెరిఫైడ్ లిస్టింగ్.`
          : `Located in ${item.location.area}, ${item.location.city} with ${item.providerRating}★ rating (${item.reviewCount} reviews) matching your ${sectionDisplayName} filters.`,
      suggestedSlotOrPackage: activeFilters.filterStartDate
        ? `${activeFilters.filterStartDate}${activeFilters.filterEndDate ? ` → ${activeFilters.filterEndDate}` : ''}`
        : activeFilters.hourlyBookingOnly
        ? 'Flexible 3h / 6h Express Stay Slot'
        : 'Priority Instant Booking Slot',
      estimatedPriceLabel: `₹${item.price.toLocaleString('en-IN')}`,
      keyHighlights: [
        `${item.providerRating}★ (${item.reviewCount})`,
        item.location.area,
        item.isVerified ? 'BOS Verified' : 'Instant Confirm',
      ],
    }));

    return {
      id: 'welcome-turn',
      role: 'assistant',
      timestamp: 'Just now',
      text:
        currentLang === 'te'
          ? `నమస్కారం! నేను మీ AI 'Quick Book' అసిస్టెంట్‌ని. మీ ప్రస్తుత ఫిల్టర్‌లు (${sectionDisplayName}, ${activeFilters.selectedCity}${activeFilters.selectedArea !== 'all' ? ` • ${activeFilters.selectedArea}` : ''}) ఆధారంగా ${candidatePool.length} లిస్టింగ్‌లను విశ్లేషిస్తున్నాను. మీ బడ్జెట్, తేదీ లేదా అవసరాన్ని టైప్ చేయండి — లేదా దిగువన ఉన్న సిఫార్సును ఎంచుకుని వెంటనే బుకింగ్ ప్రారంభించండి!`
          : `Hi! I'm your AI Quick Book Concierge. I'm actively syncing with your current search filters (${sectionDisplayName} in ${activeFilters.selectedCity}${activeFilters.selectedArea !== 'all' ? ` • ${activeFilters.selectedArea}` : ''} — ${candidatePool.length} matching listings). Tell me your preferences, occasion, guest count, or budget, or select any suggestion below to automatically launch your booking flow!`,
      recommendations: recs,
    };
  }, [
    candidatePool,
    currentLang,
    sectionDisplayName,
    activeFilters.selectedCity,
    activeFilters.selectedArea,
    activeFilters.filterStartDate,
    activeFilters.filterEndDate,
    activeFilters.hourlyBookingOnly,
  ]);

  const [messages, setMessages] = useState<ChatTurn[]>([]);

  const displayedMessages = useMemo(() => {
    return [initialGreetingTurn, ...messages];
  }, [initialGreetingTurn, messages]);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [displayedMessages, isAnalyzing, isOpen]);

  const handleSelectListingForQuickBook = (
    rec: AIQuickBookRecommendation,
    prefs?: AIExtractedPreferences
  ) => {
    const targetListing = listingMap.get(rec.listingId) || candidatePool[0];
    if (!targetListing) return;

    const noteParts: string[] = [
      `[AI Quick Book Match ${rec.matchScore}%] ${rec.whyItMatches}`,
    ];
    if (prefs?.occasionOrNeed) noteParts.push(`Need: ${prefs.occasionOrNeed}`);
    if (prefs?.guestCountOrCapacity && prefs.guestCountOrCapacity !== 'Standard') {
      noteParts.push(`Capacity: ${prefs.guestCountOrCapacity}`);
    }
    if (rec.suggestedSlotOrPackage) {
      noteParts.push(`Slot/Package: ${rec.suggestedSlotOrPackage}`);
    }

    const nextCustomFields: Record<string, string | number | boolean> = {
      ...(targetListing.customFieldValues || {}),
      selectedStayMode:
        prefs?.suggestedStayMode === 'hourly' || activeFilters.hourlyBookingOnly
          ? 'hourly'
          : String(targetListing.customFieldValues?.selectedStayMode || 'daily'),
      aiQuickBookNotes: noteParts.join(' | '),
    };
    const resolvedCheckIn = prefs?.preferredDate || activeFilters.filterStartDate;
    if (resolvedCheckIn) {
      nextCustomFields.selectedCheckInDate = resolvedCheckIn;
    }
    const resolvedCheckOut = prefs?.checkOutDate || activeFilters.filterEndDate;
    if (resolvedCheckOut) {
      nextCustomFields.selectedCheckOutDate = resolvedCheckOut;
    }

    const enrichedListing: MarketplaceListing = {
      ...targetListing,
      customFieldValues: nextCustomFields,
    };

    onInitiateBooking(enrichedListing, prefs, rec);
  };

  const sendPreferenceQuery = async (customText?: string) => {
    const queryText = (customText ?? inputMessage).trim();
    if (!queryText || isAnalyzing) return;

    if (!customText) {
      setInputMessage('');
    }

    const userTurn: ChatTurn = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: queryText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userTurn]);
    setIsAnalyzing(true);
    triggerGlobalGlobeLoader('AI Quick Book Analyzing Preferences...', 650);

    try {
      const compactCandidates = candidatePool.slice(0, 18).map((l) => ({
        id: l.id,
        title: l.title,
        categoryId: l.categoryId,
        subcategory: l.subcategory || '',
        sectionType: String(l.customFieldValues?.sectionType || activeFilters.activeMarketSection),
        city: l.location.city,
        area: l.location.area,
        price: l.price,
        priceUnit: l.priceUnit,
        rating: l.providerRating,
        reviewCount: l.reviewCount,
        verified: l.isVerified,
        featured: l.isFeatured,
        supportsHourly: Boolean(
          l.customFieldValues?.supportsHourly || l.categoryId === 'hotel-hourly'
        ),
        tags: [l.subcategory, l.entityType, l.providerName].filter(Boolean),
        highlights: [
          l.subcategory || '',
          l.location.area,
          l.providerName,
        ].filter(Boolean),
      }));

      const response = await fetch('/api/ai/quick-book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userMessage: queryText,
          chatHistory: displayedMessages.slice(-5).map((m) => ({
            role: m.role,
            text: m.text,
          })),
          activeFilters,
          candidateListings: compactCandidates,
          language: currentLang,
        }),
      });

      const data = await response.json();

      const recs: AIQuickBookRecommendation[] = Array.isArray(data.recommendations)
        ? data.recommendations
        : [];
      const prefs: AIExtractedPreferences | undefined = data.extractedPreferences;

      const assistantTurn: ChatTurn = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        text:
          data.assistantReply ||
          (currentLang === 'te'
            ? 'మీ ఫిల్టర్‌ల ఆధారంగా ఉత్తమ సిఫార్సులు క్రింద ఉన్నాయి. ఏదైనా లిస్టింగ్‌పై క్లిక్ చేసి వెంటనే బుక్ చేసుకోండి!'
            : 'Here are the top-ranked listings tailored to your preferences and current search filters. Click any recommendation below to start booking immediately!'),
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        extractedPreferences: prefs,
        recommendations: recs,
        modelUsed: data.modelUsed,
      };

      setMessages((prev) => [...prev, assistantTurn]);

      // If auto-trigger toggle is on OR the AI detected an explicit immediate booking command, auto-initiate booking flow on #1 match
      if ((autoTriggerBookingOnTopMatch || prefs?.autoBookBestMatch) && recs.length > 0) {
        setTimeout(() => {
          handleSelectListingForQuickBook(recs[0], prefs);
        }, 550);
      }
    } catch (err) {
      console.error('Quick Book Assistant request error:', err);
      const fallbackTop = candidatePool.slice(0, 2).map((item, idx) => ({
        listingId: item.id,
        matchScore: idx === 0 ? 96 : 92,
        matchHeadline: idx === 0 ? '🏆 Top Recommended Match' : '⚡ Verified Popular Pick',
        whyItMatches: `Matches your ${sectionDisplayName} criteria in ${item.location.area} (${item.providerRating}★).`,
        suggestedSlotOrPackage: 'Instant Confirmation Slot',
        estimatedPriceLabel: `₹${item.price.toLocaleString('en-IN')}`,
        keyHighlights: [`${item.providerRating}★`, item.location.area, 'Verified Partner'],
      }));

      setMessages((prev) => [
        ...prev,
        {
          id: `ai-err-${Date.now()}`,
          role: 'assistant',
          text:
            currentLang === 'te'
              ? 'మీ ప్రస్తుత ఫిల్టర్‌ల ఆధారంగా అత్యుత్తమ ఎంపికలు సిద్ధంగా ఉన్నాయి. బుకింగ్ ప్రారంభించడానికి క్రింది లిస్టింగ్‌ను ఎంచుకోండి:'
              : 'Based on your active filters, here are the highest-rated available matches ready for instant booking:',
          timestamp: 'Just now',
          recommendations: fallbackTop,
        },
      ]);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const toggleVoiceInput = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      return;
    }

    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = currentLang === 'te' ? 'te-IN' : 'en-IN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognition.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript || '';
      if (transcript) {
        setInputMessage(transcript);
        sendPreferenceQuery(transcript);
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const smartPrompts = useMemo(() => {
    const group =
      SECTION_SMART_PROMPTS[activeFilters.activeMarketSection] || SECTION_SMART_PROMPTS.venues;
    return currentLang === 'te' ? group.te : group.en;
  }, [activeFilters.activeMarketSection, currentLang]);

  return (
    <>
      {/* FLOATING AI QUICK BOOK LAUNCHER BUTTON */}
      {!isOpen && (
        <button
          type="button"
          onClick={onOpen}
          className="fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-40 group flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-gradient-to-r from-[#4A148C] via-indigo-700 to-amber-500 text-white shadow-xl hover:shadow-2xl hover:scale-[1.02] transition-all border border-white/25 cursor-pointer"
          title="AI Quick Book Assistant"
        >
          <div className="w-8 h-8 rounded-xl bg-white/15 backdrop-blur-xs flex items-center justify-center relative">
            <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-[#4A148C]" />
          </div>
          <div className="text-left">
            <div className="text-xs font-black tracking-tight flex items-center gap-1">
              <span>{currentLang === 'te' ? '✨ AI క్విక్ బుక్' : '✨ AI Quick Book'}</span>
              <span className="px-1.5 py-0.2 rounded-md bg-amber-400 text-slate-950 text-[9px] font-black uppercase">
                Smart
              </span>
            </div>
            <div className="text-[10px] text-purple-100 font-semibold hidden sm:block">
              {currentLang === 'te'
                ? `${candidatePool.length} లిస్టింగ్స్ నుండి బెస్ట్ మ్యాచ్`
                : `Suggest & Book from ${candidatePool.length} filtered listings`}
            </div>
          </div>
        </button>
      )}

      {/* AI QUICK BOOK DRAWER / MODAL */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-end sm:p-4 bg-slate-950/60 backdrop-blur-xs animate-fadeIn">
          <div className="w-full sm:max-w-lg h-[90vh] sm:h-[85vh] bg-white dark:bg-slate-900 sm:rounded-3xl rounded-t-3xl shadow-2xl border border-purple-200 dark:border-slate-800 flex flex-col overflow-hidden">
            {/* HEADER */}
            <div className="p-4 bg-gradient-to-r from-[#4A148C] via-indigo-800 to-purple-900 text-white flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-400/20 border border-amber-300/40 flex items-center justify-center shrink-0">
                  <Bot className="w-5 h-5 text-amber-300" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm sm:text-base font-black tracking-tight">
                      {currentLang === 'te'
                        ? 'AI క్విక్ బుక్ అసిస్టెంట్'
                        : 'AI Quick Book Concierge'}
                    </h3>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-400/20 border border-emerald-300/40 text-emerald-200 text-[10px] font-black flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                      Gemini AI
                    </span>
                  </div>
                  <p className="text-[11px] text-purple-200 font-medium">
                    {currentLang === 'te'
                      ? 'మీ ఫిల్టర్‌లు & అభిరుచులను విశ్లేషించి వెంటనే బుకింగ్ ప్రారంభిస్తుంది'
                      : 'Analyzes your active filters & preferences to initiate instant booking'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                {messages.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setMessages([])}
                    className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-purple-100 transition cursor-pointer"
                    title="Reset conversation"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
                  title="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* LIVE ACTIVE SEARCH FILTERS CONTEXT BAR */}
            <div className="px-3.5 py-2.5 bg-purple-50/90 dark:bg-slate-800/90 border-b border-purple-100 dark:border-slate-800 shrink-0 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-[11px] font-black text-purple-900 dark:text-purple-200">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                  <span>
                    {currentLang === 'te'
                      ? 'ప్రస్తుత సెర్చ్ ఫిల్టర్‌లు (AI సింక్ చేయబడింది):'
                      : 'Active Search Context Synced with AI:'}
                  </span>
                </div>

                {/* AUTO-BOOK TOP MATCH TOGGLE */}
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={autoTriggerBookingOnTopMatch}
                    onChange={(e) => setAutoTriggerBookingOnTopMatch(e.target.checked)}
                    className="rounded border-purple-300 text-purple-700 focus:ring-purple-500 w-3.5 h-3.5"
                  />
                  <span className="text-[10px] font-black text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/60 px-2 py-0.5 rounded-md border border-amber-300 dark:border-amber-800">
                    {currentLang === 'te' ? '⚡ ఆటో-ఓపెన్ బుకింగ్' : '⚡ Auto-Book #1 Match'}
                  </span>
                </label>
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                <span className="px-2 py-0.5 rounded-lg bg-purple-700 text-white text-[10px] font-black shrink-0">
                  {sectionDisplayName}
                </span>
                <span className="px-2 py-0.5 rounded-lg bg-white dark:bg-slate-900 border border-purple-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-[10px] font-bold shrink-0 flex items-center gap-1">
                  <MapPin className="w-2.5 h-2.5 text-purple-600" />
                  {activeFilters.selectedArea !== 'all'
                    ? `${activeFilters.selectedArea}, ${activeFilters.selectedCity}`
                    : activeFilters.selectedCity}
                </span>
                {activeFilters.selectedSubcategory !== 'all' && (
                  <span className="px-2 py-0.5 rounded-lg bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-[10px] font-bold shrink-0">
                    {activeFilters.selectedSubcategory}
                  </span>
                )}
                {activeFilters.filterStartDate && (
                  <span className="px-2 py-0.5 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 text-[10px] font-bold shrink-0 flex items-center gap-1">
                    <Calendar className="w-2.5 h-2.5 text-emerald-600" />
                    {activeFilters.filterStartDate}
                    {activeFilters.filterEndDate ? ` → ${activeFilters.filterEndDate}` : ''}
                  </span>
                )}
                {activeFilters.hourlyBookingOnly && (
                  <span className="px-2 py-0.5 rounded-lg bg-indigo-100 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-200 text-[10px] font-bold shrink-0">
                    ⏱️ Hourly Stay
                  </span>
                )}
                <span className="px-2 py-0.5 rounded-lg bg-slate-200/80 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-[10px] font-black shrink-0">
                  {candidatePool.length}{' '}
                  {currentLang === 'te' ? 'లిస్టింగ్స్ అందుబాటులో' : 'Candidates'}
                </span>
              </div>
            </div>

            {/* CONVERSATION & RECOMMENDATIONS STREAM */}
            <div
              ref={chatScrollRef}
              className="flex-1 overflow-y-auto p-3.5 space-y-4 bg-slate-50/70 dark:bg-slate-950/50"
            >
              {displayedMessages.map((turn) => (
                <div
                  key={turn.id}
                  className={`flex flex-col ${
                    turn.role === 'user' ? 'items-end' : 'items-start'
                  }`}
                >
                  <div
                    className={`max-w-[92%] rounded-2xl p-3 shadow-xs ${
                      turn.role === 'user'
                        ? 'bg-[#4A148C] text-white rounded-br-xs'
                        : 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-800 rounded-bl-xs'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[10px] font-black uppercase tracking-wider opacity-75 flex items-center gap-1">
                        {turn.role === 'user' ? (
                          <>
                            <User className="w-3 h-3" />
                            <span>{currentLang === 'te' ? 'మీరు' : 'You'}</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3 h-3 text-amber-500" />
                            <span>
                              {currentLang === 'te'
                                ? 'BOS AI క్విక్ బుక్'
                                : 'BOS AI Concierge'}
                            </span>
                          </>
                        )}
                      </span>
                      <span className="text-[9px] opacity-60">{turn.timestamp}</span>
                    </div>

                    <p className="text-xs leading-relaxed font-medium whitespace-pre-wrap">
                      {turn.text}
                    </p>

                    {/* AI EXTRACTED PREFERENCES SUMMARY PILLS */}
                    {turn.extractedPreferences && (
                      <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-1.5">
                        {turn.extractedPreferences.occasionOrNeed && (
                          <span className="px-2 py-0.5 rounded-md bg-purple-50 dark:bg-purple-950/50 text-purple-800 dark:text-purple-200 text-[10px] font-bold">
                            🎯 {turn.extractedPreferences.occasionOrNeed}
                          </span>
                        )}
                        {turn.extractedPreferences.preferredArea && (
                          <span className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/50 text-blue-800 dark:text-blue-200 text-[10px] font-bold">
                            📍 {turn.extractedPreferences.preferredArea}
                          </span>
                        )}
                        {turn.extractedPreferences.budgetSummary && (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200 text-[10px] font-bold">
                            💰 {turn.extractedPreferences.budgetSummary}
                          </span>
                        )}
                        {turn.extractedPreferences.guestCountOrCapacity &&
                          turn.extractedPreferences.guestCountOrCapacity !== 'Standard' && (
                            <span className="px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-200 text-[10px] font-bold">
                              👥 {turn.extractedPreferences.guestCountOrCapacity}
                            </span>
                          )}
                      </div>
                    )}
                  </div>

                  {/* RECOMMENDED LISTING CARDS WITH AUTOMATIC BOOKING FLOW INITIATION */}
                  {turn.recommendations && turn.recommendations.length > 0 && (
                    <div className="w-full mt-2.5 space-y-2.5 pl-1">
                      {turn.recommendations.map((rec, idx) => {
                        const listing = listingMap.get(rec.listingId);
                        if (!listing) return null;
                        const displayTitle = getListingTitle(listing, currentLang);

                        return (
                          <div
                            key={`${turn.id}-${rec.listingId}-${idx}`}
                            className={`rounded-2xl bg-white dark:bg-slate-900 border-2 transition-all overflow-hidden shadow-sm hover:shadow-md ${
                              idx === 0
                                ? 'border-amber-400 dark:border-amber-500/80 ring-2 ring-amber-400/20'
                                : 'border-purple-200 dark:border-slate-800'
                            }`}
                          >
                            {/* Top Match Ribbon */}
                            <div
                              className={`px-3 py-1 flex items-center justify-between text-[10px] font-black ${
                                idx === 0
                                  ? 'bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-300 text-slate-950'
                                  : 'bg-purple-100 dark:bg-slate-800 text-purple-900 dark:text-purple-200'
                              }`}
                            >
                              <span>{rec.matchHeadline}</span>
                              <span className="px-1.5 py-0.5 rounded-full bg-slate-950/15 font-black">
                                {rec.matchScore}% AI Match
                              </span>
                            </div>

                            <div className="p-3 space-y-2.5">
                              <div className="flex items-start gap-3">
                                <SafeImage category="general"
                                  src={listing.images?.[0]}
                                  alt={displayTitle}
                                  className="w-16 h-16 rounded-xl object-cover shrink-0 border border-slate-200 dark:border-slate-700"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <h4 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white truncate">
                                      {displayTitle}
                                    </h4>
                                    {listing.isVerified && (
                                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                    )}
                                  </div>

                                  <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 font-semibold mt-0.5">
                                    <span className="inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-400 font-black">
                                      <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                                      {listing.providerRating} ({listing.reviewCount})
                                    </span>
                                    <span>•</span>
                                    <span className="truncate">
                                      {listing.location.area}, {listing.location.city}
                                    </span>
                                  </div>

                                  <div className="mt-1 flex items-center justify-between gap-2">
                                    <span className="text-xs sm:text-sm font-black text-[#4A148C] dark:text-amber-300">
                                      ₹{listing.price.toLocaleString('en-IN')}{' '}
                                      <span className="text-[10px] font-semibold text-slate-500">
                                        / {listing.priceUnit.replace(/_/g, ' ')}
                                      </span>
                                    </span>
                                    <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-md">
                                      {rec.suggestedSlotOrPackage}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* Why AI Picked This */}
                              <div className="p-2 rounded-xl bg-purple-50/70 dark:bg-slate-800/70 border border-purple-100 dark:border-slate-700/80 text-[11px] text-slate-700 dark:text-slate-300 font-medium leading-snug">
                                <span className="font-black text-purple-800 dark:text-purple-300">
                                  {currentLang === 'te' ? 'AI విశ్లేషణ: ' : 'Why it fits: '}
                                </span>
                                {rec.whyItMatches}
                              </div>

                              {/* Highlights */}
                              {rec.keyHighlights && rec.keyHighlights.length > 0 && (
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {rec.keyHighlights.map((hl, hIdx) => (
                                    <span
                                      key={hIdx}
                                      className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-bold"
                                    >
                                      ✓ {hl}
                                    </span>
                                  ))}
                                </div>
                              )}

                              {/* Action Buttons: Select & Initiate Booking Flow Immediately */}
                              <div className="flex items-center gap-2 pt-1">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleSelectListingForQuickBook(
                                      rec,
                                      turn.extractedPreferences
                                    )
                                  }
                                  className="flex-1 py-2 px-3 rounded-xl bg-gradient-to-r from-[#4A148C] via-indigo-700 to-purple-700 hover:from-purple-800 hover:to-indigo-800 text-white text-xs font-black flex items-center justify-center gap-1.5 shadow-sm hover:shadow-md transition cursor-pointer"
                                >
                                  <Zap className="w-3.5 h-3.5 text-amber-300 fill-amber-300" />
                                  <span>
                                    {currentLang === 'te'
                                      ? 'ఎంచుకోండి & వెంటనే బుక్ చేయండి'
                                      : 'Select & Quick Book Now'}
                                  </span>
                                  <ArrowRight className="w-3.5 h-3.5" />
                                </button>

                                {onViewListingDetails && (
                                  <button
                                    type="button"
                                    onClick={() => onViewListingDetails(listing)}
                                    className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1 transition cursor-pointer"
                                    title="View Full Details"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                    <span className="hidden sm:inline">
                                      {currentLang === 'te' ? 'వివరాలు' : 'Details'}
                                    </span>
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
              ))}

              {isAnalyzing && (
                <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-white dark:bg-slate-900 border border-purple-200 dark:border-slate-800 max-w-[85%] shadow-2xs">
                  <div className="w-7 h-7 rounded-xl bg-purple-100 dark:bg-purple-950 flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-purple-600 animate-spin" />
                  </div>
                  <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    {currentLang === 'te'
                      ? 'మీ ఫిల్టర్‌లు & అభిరుచులను AI విశ్లేషిస్తోంది...'
                      : 'Analyzing your filters & ranking best matches...'}
                  </div>
                </div>
              )}
            </div>

            {/* SMART ONE-CLICK PREFERENCE CHIPS */}
            <div className="px-3.5 py-2 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 shrink-0">
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">
                {currentLang === 'te'
                  ? '⚡ ఒక క్లిక్‌తో AI ని అడగండి:'
                  : '⚡ Quick Preference Prompts:'}
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
                {smartPrompts.map((promptText, idx) => (
                  <button
                    key={idx}
                    type="button"
                    disabled={isAnalyzing}
                    onClick={() => sendPreferenceQuery(promptText)}
                    className="px-2.5 py-1.5 rounded-xl bg-purple-50 dark:bg-slate-800 hover:bg-purple-100 dark:hover:bg-slate-700 border border-purple-200 dark:border-slate-700 text-purple-900 dark:text-purple-200 text-[11px] font-bold shrink-0 max-w-xs truncate transition cursor-pointer"
                  >
                    ✨ {promptText}
                  </button>
                ))}
              </div>
            </div>

            {/* CHAT INPUT BAR */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendPreferenceQuery();
              }}
              className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2 shrink-0"
            >
              <button
                type="button"
                onClick={toggleVoiceInput}
                className={`p-2.5 rounded-xl border transition cursor-pointer shrink-0 ${
                  isListening
                    ? 'bg-rose-600 text-white border-rose-600 animate-pulse'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-purple-50'
                }`}
                title="Voice Input"
              >
                {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>

              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder={
                  currentLang === 'te'
                    ? 'మీ బడ్జెట్, అతిథుల సంఖ్య లేదా అవసరాన్ని చెప్పండి...'
                    : 'Describe your ideal venue, service, budget, or dates...'
                }
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-600"
              />

              <button
                type="submit"
                disabled={!inputMessage.trim() || isAnalyzing}
                className="px-4 py-2.5 rounded-xl bg-[#4A148C] hover:bg-purple-800 disabled:opacity-50 text-white text-xs font-black flex items-center gap-1.5 shadow-sm transition cursor-pointer shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">
                  {currentLang === 'te' ? 'అడగండి' : 'Ask AI'}
                </span>
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
