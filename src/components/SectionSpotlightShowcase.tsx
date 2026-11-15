import React, { useState, useEffect, useRef } from 'react';
import SafeImage, { imageCategoryFor } from './SafeImage';
import { MarketplaceListing } from '../types/marketplace';
import { MarketSectionType } from '../data/servicesStayMoviesData';
import { AppLanguage } from '../utils/translations';
import { getUILabels, ensureChosenLanguageText } from '../utils/i18nEngine';
import {
  Sparkles,
  Star,
  ArrowUpRight,
  Pause,
  Play,
  CalendarClock,
  CheckCircle2,
  MapPin,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

interface SectionSpotlightShowcaseProps {
  activeMarketSection: MarketSectionType;
  listings: MarketplaceListing[];
  allListings?: MarketplaceListing[];
  currentLang: AppLanguage;
  selectedSubcategory: string;
  onSelectSubcategory: (subcat: string) => void;
  onSwitchSection?: (sec: MarketSectionType) => void;
  onSelectListing: (listing: MarketplaceListing) => void;
  onBookListing: (listing: MarketplaceListing) => void;
  onEnquireListing: (listing: MarketplaceListing) => void;
  onOpenRunningBatches?: (listing: MarketplaceListing) => void;
}

interface SpotlightSlideItem {
  id: string;
  section: MarketSectionType;
  emoji: string;
  badgeEn: string;
  badgeTe: string;
  titleEn: string;
  titleTe: string;
  subtitleEn: string;
  subtitleTe: string;
  priceHighlightEn: string;
  priceHighlightTe: string;
  rating: string;
  image: string;
  accentBg: string;
  pillTheme: string;
  ctaTheme: string;
  listingRef?: MarketplaceListing;
}

interface SpotlightCategoryMeta {
  section: MarketSectionType;
  emoji: string;
  chipLabelEn: string;
  chipLabelTe: string;
  headlineEn: string;
  headlineTe: string;
  headerBadgeClass: string;
  activeChipClass: string;
  containerGlowClass: string;
  cardBorderClass: string;
  accentBg: string;
  pillTheme: string;
  ctaTheme: string;
}

const SPOTLIGHT_CATEGORY_ROTATION: SpotlightCategoryMeta[] = [
  {
    section: 'pg_hostels',
    emoji: '🏠',
    chipLabelEn: "PG's & Hostels",
    chipLabelTe: 'పీజీలు & హాస్టల్స్',
    headlineEn: "Spotlight PG's & Co-Living in Hyderabad",
    headlineTe: 'హైదరాబాద్‌లో స్పాట్‌లైట్ పీజీలు & కో-లివింగ్',
    headerBadgeClass: 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white',
    activeChipClass: 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white border-indigo-500 shadow-xs',
    containerGlowClass: 'from-indigo-50/80 via-white to-violet-50/70 dark:from-indigo-950/40 dark:via-slate-900 dark:to-violet-950/30 border-indigo-200/80 dark:border-indigo-800/70',
    cardBorderClass: 'border-indigo-500/80 ring-indigo-500/20',
    accentBg: 'from-indigo-950/95 via-violet-900/55 to-transparent',
    pillTheme: 'bg-indigo-100 text-indigo-950 border-indigo-400',
    ctaTheme: 'bg-indigo-600 group-hover:bg-amber-400 text-white group-hover:text-slate-950',
  },
  {
    section: 'venues',
    emoji: '🏛️',
    chipLabelEn: 'Function Halls',
    chipLabelTe: 'ఫంక్షన్ హాల్స్',
    headlineEn: 'Spotlight Function & Marriage Halls',
    headlineTe: 'స్పాట్‌లైట్ ఫంక్షన్ & మ్యారేజ్ హాల్స్',
    headerBadgeClass: 'bg-gradient-to-r from-rose-600 to-pink-600 text-white',
    activeChipClass: 'bg-gradient-to-r from-rose-600 to-pink-600 text-white border-rose-500 shadow-xs',
    containerGlowClass: 'from-rose-50/80 via-white to-amber-50/70 dark:from-rose-950/40 dark:via-slate-900 dark:to-amber-950/30 border-rose-200/80 dark:border-rose-800/70',
    cardBorderClass: 'border-rose-500/80 ring-rose-500/20',
    accentBg: 'from-rose-950/95 via-pink-900/55 to-transparent',
    pillTheme: 'bg-rose-100 text-rose-950 border-rose-400',
    ctaTheme: 'bg-rose-600 group-hover:bg-amber-400 text-white group-hover:text-slate-950',
  },
  {
    section: 'classes',
    emoji: '🎓',
    chipLabelEn: 'Classes & Coaching',
    chipLabelTe: 'క్లాసులు & కోచింగ్',
    headlineEn: 'Spotlight Classes, IT & Live Batches',
    headlineTe: 'స్పాట్‌లైట్ క్లాసులు, ఐటీ & లైవ్ బ్యాచ్‌లు',
    headerBadgeClass: 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white',
    activeChipClass: 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white border-emerald-500 shadow-xs',
    containerGlowClass: 'from-emerald-50/80 via-white to-teal-50/70 dark:from-emerald-950/40 dark:via-slate-900 dark:to-teal-950/30 border-emerald-200/80 dark:border-emerald-800/70',
    cardBorderClass: 'border-emerald-500/80 ring-emerald-500/20',
    accentBg: 'from-emerald-950/95 via-teal-900/55 to-transparent',
    pillTheme: 'bg-emerald-100 text-emerald-950 border-emerald-400',
    ctaTheme: 'bg-emerald-600 group-hover:bg-amber-400 text-white group-hover:text-slate-950',
  },
  {
    section: 'hotel_stay',
    emoji: '🏨',
    chipLabelEn: 'Lodge & Resort (Stay)',
    chipLabelTe: 'లాడ్జ్, రిసార్ట్ & హోమ్‌స్టే',
    headlineEn: 'Spotlight Lodges, Resorts & Homestays',
    headlineTe: 'స్పాట్‌లైట్ లాడ్జీలు, రిసార్ట్స్ & హోమ్‌స్టే',
    headerBadgeClass: 'bg-gradient-to-r from-amber-500 to-orange-600 text-white',
    activeChipClass: 'bg-gradient-to-r from-amber-500 to-orange-600 text-white border-amber-500 shadow-xs',
    containerGlowClass: 'from-amber-50/80 via-white to-orange-50/70 dark:from-amber-950/40 dark:via-slate-900 dark:to-orange-950/30 border-amber-200/80 dark:border-amber-800/70',
    cardBorderClass: 'border-amber-500/80 ring-amber-500/20',
    accentBg: 'from-amber-950/95 via-orange-900/55 to-transparent',
    pillTheme: 'bg-amber-100 text-amber-950 border-amber-400',
    ctaTheme: 'bg-orange-600 group-hover:bg-amber-400 text-white group-hover:text-slate-950',
  },
  {
    section: 'movies',
    emoji: '🎬',
    chipLabelEn: 'Movies & Events',
    chipLabelTe: 'మూవీస్ & ఈవెంట్స్',
    headlineEn: 'Spotlight Movies, IMAX & Multiplexes',
    headlineTe: 'స్పాట్‌లైట్ మూవీస్, ఐమ్యాక్స్ & మల్టీప్లెక్స్',
    headerBadgeClass: 'bg-gradient-to-r from-fuchsia-600 to-purple-600 text-white',
    activeChipClass: 'bg-gradient-to-r from-fuchsia-600 to-purple-600 text-white border-fuchsia-500 shadow-xs',
    containerGlowClass: 'from-fuchsia-50/80 via-white to-purple-50/70 dark:from-fuchsia-950/40 dark:via-slate-900 dark:to-purple-950/30 border-fuchsia-200/80 dark:border-fuchsia-800/70',
    cardBorderClass: 'border-fuchsia-500/80 ring-fuchsia-500/20',
    accentBg: 'from-fuchsia-950/95 via-purple-900/55 to-transparent',
    pillTheme: 'bg-fuchsia-100 text-fuchsia-950 border-fuchsia-400',
    ctaTheme: 'bg-fuchsia-600 group-hover:bg-amber-400 text-white group-hover:text-slate-950',
  },
  {
    section: 'services',
    emoji: '🛠️',
    chipLabelEn: 'Home Services',
    chipLabelTe: 'హోమ్ సర్వీసులు',
    headlineEn: 'Spotlight Verified Home & Local Services',
    headlineTe: 'స్పాట్‌లైట్ వెరిఫైడ్ హోమ్ & లోకల్ సర్వీసులు',
    headerBadgeClass: 'bg-gradient-to-r from-sky-600 to-blue-600 text-white',
    activeChipClass: 'bg-gradient-to-r from-sky-600 to-blue-600 text-white border-sky-500 shadow-xs',
    containerGlowClass: 'from-sky-50/80 via-white to-cyan-50/70 dark:from-sky-950/40 dark:via-slate-900 dark:to-cyan-950/30 border-sky-200/80 dark:border-sky-800/70',
    cardBorderClass: 'border-sky-500/80 ring-sky-500/20',
    accentBg: 'from-sky-950/95 via-blue-900/55 to-transparent',
    pillTheme: 'bg-sky-100 text-sky-950 border-sky-400',
    ctaTheme: 'bg-sky-600 group-hover:bg-amber-400 text-white group-hover:text-slate-950',
  },
];

const SECTION_DEFAULT_SPOTLIGHT_CARDS: Record<MarketSectionType, SpotlightSlideItem[]> = {
  pg_hostels: [
    {
      id: 'spot-pg-hostels-1',
      section: 'pg_hostels',
      emoji: '🏠',
      badgeEn: 'Luxury Co-Living PG',
      badgeTe: 'లగ్జరీ కో-లివింగ్ పీజీ',
      titleEn: 'Luxury Co-Living, Boys & Girls AC PGs',
      titleTe: 'లగ్జరీ కో-లివింగ్, బాయ్స్ & గర్ల్స్ ఏసీ పీజీలు',
      subtitleEn: '1/2/3 Sharing • Homely Food • 5G Wi-Fi',
      subtitleTe: '1/2/3 షేరింగ్ • 3 పూటలా ఇంటి భోజనం • వై-ఫై',
      priceHighlightEn: 'From ₹6,500/mo',
      priceHighlightTe: 'నెలకు ₹6,500 నుండి',
      rating: '4.9',
      image:
        'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1000&q=85',
      accentBg: 'from-indigo-950/95 via-violet-900/55 to-transparent',
      pillTheme: 'bg-indigo-100 text-indigo-950 border-indigo-400',
      ctaTheme: 'bg-indigo-600 group-hover:bg-amber-400 text-white group-hover:text-slate-950',
    },
    {
      id: 'spot-pg-hostels-2',
      section: 'pg_hostels',
      emoji: '🛏️',
      badgeEn: 'Executive Tech-Park Stay',
      badgeTe: 'ఎగ్జిక్యూటివ్ హాస్టల్స్',
      titleEn: 'AC & Non-AC Working Professionals Stay',
      titleTe: 'ఏసీ & నాన్-ఏసీ వర్కింగ్ ప్రొఫెషనల్స్ స్టే',
      subtitleEn: 'Laundry • Power Backup • Biometric Entry',
      subtitleTe: 'వాషింగ్ మెషిన్ • పవర్ బ్యాకప్ • బయోమెట్రిక్ సెక్యూరిటీ',
      priceHighlightEn: 'From ₹7,200/mo',
      priceHighlightTe: 'నెలకు ₹7,200 నుండి',
      rating: '4.8',
      image:
        'https://images.unsplash.com/photo-1595526114035-0d45ed16cfbf?auto=format&fit=crop&w=1000&q=85',
      accentBg: 'from-violet-950/95 via-fuchsia-900/50 to-transparent',
      pillTheme: 'bg-violet-100 text-violet-950 border-violet-400',
      ctaTheme: 'bg-violet-600 group-hover:bg-amber-400 text-white group-hover:text-slate-950',
    },
    {
      id: 'spot-pg-hostels-3',
      section: 'pg_hostels',
      emoji: '✨',
      badgeEn: 'Premium Studio Rooms',
      badgeTe: 'ప్రీమియం స్టూడియో పీజీ',
      titleEn: 'Hitech City & Gachibowli Studio PGs',
      titleTe: 'హైటెక్ సిటీ & గచ్చిబౌలి స్టూడియో పీజీలు',
      subtitleEn: '24/7 CCTV • Gym & Lounge • Rooftop Dining',
      subtitleTe: '24/7 సీసీటీవీ • జిమ్ & లాంజ్ • రూఫ్‌టాప్ డైనింగ్',
      priceHighlightEn: 'From ₹8,500/mo',
      priceHighlightTe: 'నెలకు ₹8,500 నుండి',
      rating: '4.9',
      image:
        'https://images.unsplash.com/photo-1560185008-b033106af5c3?auto=format&fit=crop&w=1000&q=85',
      accentBg: 'from-blue-950/95 via-indigo-900/55 to-transparent',
      pillTheme: 'bg-sky-100 text-sky-950 border-sky-400',
      ctaTheme: 'bg-blue-600 group-hover:bg-amber-400 text-white group-hover:text-slate-950',
    },
  ],
  venues: [
    {
      id: 'spot-venues-1',
      section: 'venues',
      emoji: '🏛️',
      badgeEn: 'Grand Kalyana Mandapam',
      badgeTe: 'రాయల్ కళ్యాణ మండపం',
      titleEn: 'Royal AC Kalyana Mandapams & Banquet Halls',
      titleTe: 'రాయల్ ఏసీ కళ్యాణ మండపాలు & బాంక్వెట్ హాల్స్',
      subtitleEn: '100 to 2500+ Guests • Valet Parking • Bridal Suites',
      subtitleTe: '100 నుండి 2500+ అతిథులు • విశాలమైన పార్కింగ్ & ఏసీ',
      priceHighlightEn: 'From ₹45,000',
      priceHighlightTe: '₹45,000 నుండి',
      rating: '4.9',
      image:
        'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=1000&q=85',
      accentBg: 'from-rose-950/95 via-pink-900/55 to-transparent',
      pillTheme: 'bg-rose-100 text-rose-950 border-rose-400',
      ctaTheme: 'bg-rose-600 group-hover:bg-amber-400 text-white group-hover:text-slate-950',
    },
    {
      id: 'spot-venues-2',
      section: 'venues',
      emoji: '🎉',
      badgeEn: 'Luxury Reception Lawns',
      badgeTe: 'రిసెప్షన్ & పార్టీ లాన్స్',
      titleEn: 'Grand Reception Lawns & Rooftop Party Venues',
      titleTe: 'గ్రాండ్ రిసెప్షన్ లాన్స్ & రూఫ్‌టాప్ పార్టీ వేదికలు',
      subtitleEn: 'Floral Stage Decor • DJ & Lighting • Custom Catering',
      subtitleTe: 'కస్టమ్ డెకర్ • సౌండ్ & లైటింగ్ • క్యాటరింగ్',
      priceHighlightEn: 'From ₹25,000',
      priceHighlightTe: '₹25,000 నుండి',
      rating: '4.8',
      image:
        'https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?auto=format&fit=crop&w=1000&q=85',
      accentBg: 'from-amber-950/95 via-rose-900/55 to-transparent',
      pillTheme: 'bg-amber-100 text-amber-950 border-amber-400',
      ctaTheme: 'bg-pink-600 group-hover:bg-amber-400 text-white group-hover:text-slate-950',
    },
    {
      id: 'spot-venues-3',
      section: 'venues',
      emoji: '🤝',
      badgeEn: 'Corporate & Expo Halls',
      badgeTe: 'కన్వెన్షన్ & కార్పొరేట్ హాల్స్',
      titleEn: 'Hi-Tech Seminar & Expo Convention Centers',
      titleTe: 'హై-టెక్ సెమినార్ & ఎక్స్‌పో కన్వెన్షన్ సెంటర్లు',
      subtitleEn: 'LED Wall • 500+ Car Parking • Acoustic Audio',
      subtitleTe: 'ఎల్ఈడీ వాల్ • 500+ కార్ పార్కింగ్ • ఏసీ హాల్',
      priceHighlightEn: 'Instant Booking',
      priceHighlightTe: 'తక్షణ బుకింగ్',
      rating: '4.9',
      image:
        'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=1000&q=85',
      accentBg: 'from-purple-950/95 via-rose-950/55 to-transparent',
      pillTheme: 'bg-pink-100 text-pink-950 border-pink-400',
      ctaTheme: 'bg-rose-700 group-hover:bg-amber-400 text-white group-hover:text-slate-950',
    },
  ],
  classes: [
    {
      id: 'spot-classes-1',
      section: 'classes',
      emoji: '🎓',
      badgeEn: 'Full-Stack & AI Labs',
      badgeTe: 'ఐటీ & ఏఐ లైవ్ బ్యాచ్‌లు',
      titleEn: 'IT Software, Full-Stack AI & Cloud Training',
      titleTe: 'ఐటీ సాఫ్ట్‌వేర్, ఫుల్-స్టాక్ ఏఐ & క్లౌడ్ ట్రైనింగ్',
      subtitleEn: 'Online & Offline • Free Demo • Placement Track',
      subtitleTe: 'ఆన్‌లైన్ & ఆఫ్‌లైన్ • ఉచిత డెమో • సర్టిఫికేట్',
      priceHighlightEn: 'Free Live Demo',
      priceHighlightTe: 'ఉచిత లైవ్ డెమో',
      rating: '4.9',
      image:
        'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=1000&q=85',
      accentBg: 'from-emerald-950/95 via-teal-900/55 to-transparent',
      pillTheme: 'bg-emerald-100 text-emerald-950 border-emerald-400',
      ctaTheme: 'bg-emerald-600 group-hover:bg-amber-400 text-white group-hover:text-slate-950',
    },
    {
      id: 'spot-classes-2',
      section: 'classes',
      emoji: '📚',
      badgeEn: 'Academic & IIT/NEET',
      badgeTe: 'అకాడెమిక్ & ఐఐటీ/నీట్',
      titleEn: 'Top Tuitions, Spoken English & Competitive Exams',
      titleTe: 'టాప్ ట్యూషన్స్, స్పోకెన్ ఇంగ్లీష్ & కాంపిటీటివ్ ఎగ్జామ్స్',
      subtitleEn: 'Small Batches • Weekly Mock Tests • Top Faculty',
      subtitleTe: 'చిన్న బ్యాచ్‌లు • వీక్లీ మాక్ టెస్టులు • టాప్ ఫ్యాకల్టీ',
      priceHighlightEn: 'From ₹1,500/mo',
      priceHighlightTe: 'నెలకు ₹1,500 నుండి',
      rating: '4.8',
      image:
        'https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=1000&q=85',
      accentBg: 'from-teal-950/95 via-cyan-900/55 to-transparent',
      pillTheme: 'bg-teal-100 text-teal-950 border-teal-400',
      ctaTheme: 'bg-teal-600 group-hover:bg-amber-400 text-white group-hover:text-slate-950',
    },
    {
      id: 'spot-classes-3',
      section: 'classes',
      emoji: '🎸',
      badgeEn: 'Music, Dance & Arts',
      badgeTe: 'మ్యూజిక్, డాన్స్ & ఆర్ట్స్',
      titleEn: 'Guitar, Kuchipudi, Yoga & Fitness Academies',
      titleTe: 'గిటార్, కూచిపూడి, యోగా & జుంబా అకాడమీలు',
      subtitleEn: 'Weekend & Evening Slots • Kids & Adults Batches',
      subtitleTe: 'వీకెండ్ & ఈవెనింగ్ స్లాట్లు • పిల్లలు & పెద్దలకు',
      priceHighlightEn: 'From ₹1,200/mo',
      priceHighlightTe: 'నెలకు ₹1,200 నుండి',
      rating: '4.9',
      image:
        'https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=1000&q=85',
      accentBg: 'from-cyan-950/95 via-emerald-900/55 to-transparent',
      pillTheme: 'bg-cyan-100 text-cyan-950 border-cyan-400',
      ctaTheme: 'bg-emerald-700 group-hover:bg-amber-400 text-white group-hover:text-slate-950',
    },
  ],
  hotel_stay: [
    {
      id: 'spot-hotel-1',
      section: 'hotel_stay',
      emoji: '🏨',
      badgeEn: 'Luxury Resorts & Villas',
      badgeTe: 'లగ్జరీ రిసార్ట్స్ & విల్లాస్',
      titleEn: 'Deluxe AC Lodges, Pool Resorts & Homestay Villas',
      titleTe: 'డీలక్స్ ఏసీ లాడ్జీలు, రిసార్ట్స్ & హోమ్‌స్టే విల్లాస్',
      subtitleEn: 'Free Breakfast & Wi-Fi • Couple Friendly • Instant Check-in',
      subtitleTe: 'ఉచిత బ్రేక్‌ఫాస్ట్ & వై-ఫై • కపుల్ ఫ్రెండ్లీ',
      priceHighlightEn: 'From ₹999/night',
      priceHighlightTe: 'రాత్రికి ₹999 నుండి',
      rating: '4.9',
      image:
        'https://images.unsplash.com/photo-1582719508461-905c673771fd?auto=format&fit=crop&w=1000&q=85',
      accentBg: 'from-amber-950/95 via-orange-900/55 to-transparent',
      pillTheme: 'bg-amber-100 text-amber-950 border-amber-400',
      ctaTheme: 'bg-orange-600 group-hover:bg-amber-400 text-white group-hover:text-slate-950',
    },
    {
      id: 'spot-hotel-2',
      section: 'hotel_stay',
      emoji: '🌴',
      badgeEn: 'Weekend Farm & Nature Stay',
      badgeTe: 'వీకెండ్ రిసార్ట్స్ & ఫామ్ స్టే',
      titleEn: 'Poolside Resorts, Cottages & Family Homestays',
      titleTe: 'పూల్‌సైడ్ రిసార్ట్స్, కాటేజీలు & ఫ్యామిలీ హోమ్‌స్టే',
      subtitleEn: 'Private Lawn • Bonfire & Dining • Scenic Views',
      subtitleTe: 'ప్రైవేట్ లాన్ • క్యాంప్‌ఫైర్ & డైనింగ్',
      priceHighlightEn: 'From ₹1,899/night',
      priceHighlightTe: 'రాత్రికి ₹1,899 నుండి',
      rating: '4.8',
      image:
        'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=1000&q=85',
      accentBg: 'from-orange-950/95 via-amber-900/55 to-transparent',
      pillTheme: 'bg-orange-100 text-orange-950 border-orange-400',
      ctaTheme: 'bg-amber-600 group-hover:bg-amber-400 text-white group-hover:text-slate-950',
    },
    {
      id: 'spot-hotel-3',
      section: 'hotel_stay',
      emoji: '🏡',
      badgeEn: 'Cozy Homestays & Suites',
      badgeTe: 'హోమ్‌స్టే & సర్వీస్ అపార్ట్‌మెంట్లు',
      titleEn: '3Hr / 6Hr / 12Hr Transit Lodges & Executive Suites',
      titleTe: '3గం / 6గం / 12గం ట్రాన్సిట్ లాడ్జీలు & సూట్స్',
      subtitleEn: 'Flexible Check-in • Kitchenette • Prime Locations',
      subtitleTe: 'ఫ్లెక్సిబుల్ చెక్-ఇన్ • ప్రైమ్ లొకేషన్లు',
      priceHighlightEn: 'From ₹599/stay',
      priceHighlightTe: '₹599 నుండి ప్రారంభం',
      rating: '4.9',
      image:
        'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1000&q=85',
      accentBg: 'from-yellow-950/95 via-orange-900/55 to-transparent',
      pillTheme: 'bg-yellow-100 text-yellow-950 border-yellow-400',
      ctaTheme: 'bg-orange-700 group-hover:bg-amber-400 text-white group-hover:text-slate-950',
    },
  ],
  movies: [
    {
      id: 'spot-movies-1',
      section: 'movies',
      emoji: '🎬',
      badgeEn: 'IMAX & 4K Dolby Atmos',
      badgeTe: 'ఐమ్యాక్స్ & 4K డాల్బీ అట్మాస్',
      titleEn: '4K Dolby Atmos Cinemas, IMAX & Recliner Screens',
      titleTe: '4K డాల్బీ అట్మాస్ సినిమాస్, ఐమ్యాక్స్ & రిక్లైనర్ స్క్రీన్స్',
      subtitleEn: 'VIP Recliners • In-Seat Food Delivery • Instant M-Ticket',
      subtitleTe: 'విఐపి రిక్లైనర్స్ • సీట్ వద్దకే ఫుడ్ • తక్షణ ఎం-టికెట్',
      priceHighlightEn: 'From ₹150/seat',
      priceHighlightTe: 'సీటు ₹150 నుండి',
      rating: '4.9',
      image:
        'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=1000&q=85',
      accentBg: 'from-fuchsia-950/95 via-purple-900/55 to-transparent',
      pillTheme: 'bg-fuchsia-100 text-fuchsia-950 border-fuchsia-400',
      ctaTheme: 'bg-fuchsia-600 group-hover:bg-amber-400 text-white group-hover:text-slate-950',
    },
    {
      id: 'spot-movies-2',
      section: 'movies',
      emoji: '🍿',
      badgeEn: 'Blockbuster Premieres',
      badgeTe: 'బ్లాక్‌బస్టర్ ప్రీమియర్స్',
      titleEn: 'Pan-India Releases, Telugu & Hollywood IMAX Shows',
      titleTe: 'పాన్-ఇండియా రిలీజ్‌లు, తెలుగు & హాలీవుడ్ ఐమ్యాక్స్ షోలు',
      subtitleEn: 'Live Seat Map • Laser Projection • Fast QR Entry',
      subtitleTe: 'లైవ్ సీట్ సెలెక్షన్ • లేజర్ ప్రొజెక్షన్ • క్యూఆర్ ఎంట్రీ',
      priceHighlightEn: 'Book Seats Now',
      priceHighlightTe: 'సీట్లు బుక్ చేయండి',
      rating: '4.8',
      image:
        'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?auto=format&fit=crop&w=1000&q=85',
      accentBg: 'from-purple-950/95 via-fuchsia-900/55 to-transparent',
      pillTheme: 'bg-purple-100 text-purple-950 border-purple-400',
      ctaTheme: 'bg-purple-600 group-hover:bg-amber-400 text-white group-hover:text-slate-950',
    },
    {
      id: 'spot-movies-3',
      section: 'movies',
      emoji: '🎂',
      badgeEn: 'Private Screening Pods',
      badgeTe: 'ప్రైవేట్ మినీ-థియేటర్స్',
      titleEn: 'Private Couple & Birthday Celebration Screening Pods',
      titleTe: 'ప్రైవేట్ కపుల్ & బర్త్‌డే సెలబ్రేషన్ స్క్రీనింగ్ పాడ్స్',
      subtitleEn: 'Cake & Decor Included • 4K Dolby • Custom Streaming',
      subtitleTe: 'కేక్ & డెకర్ • 4K డాల్బీ • ప్రైవేట్ స్క్రీనింగ్',
      priceHighlightEn: 'From ₹999/show',
      priceHighlightTe: 'షో ₹999 నుండి',
      rating: '4.9',
      image:
        'https://images.unsplash.com/photo-1536440136628-849c177e76a1?auto=format&fit=crop&w=1000&q=85',
      accentBg: 'from-pink-950/95 via-purple-900/55 to-transparent',
      pillTheme: 'bg-pink-100 text-pink-950 border-pink-400',
      ctaTheme: 'bg-pink-600 group-hover:bg-amber-400 text-white group-hover:text-slate-950',
    },
  ],
  services: [
    {
      id: 'spot-services-1',
      section: 'services',
      emoji: '🛠️',
      badgeEn: 'Express Home Repairs',
      badgeTe: 'హోమ్ & రిపేర్ సర్వీసులు',
      titleEn: 'AC Repair, Plumbing, Cleaning & Salon at Home',
      titleTe: 'ఏసీ రిపేర్, ప్లంబింగ్, క్లీనింగ్ & సెలూన్ ఎట్ హోమ్',
      subtitleEn: '45-Min Doorstep Visit • 30-Day Warranty • OEM Spares',
      subtitleTe: '45 నిమిషాల్లో ఇంటి వద్ద సేవ • 30 రోజుల వారంటీ',
      priceHighlightEn: 'From ₹199/visit',
      priceHighlightTe: '₹199 నుండి ప్రారంభం',
      rating: '4.9',
      image:
        'https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=1000&q=85',
      accentBg: 'from-sky-950/95 via-blue-900/55 to-transparent',
      pillTheme: 'bg-sky-100 text-sky-950 border-sky-400',
      ctaTheme: 'bg-sky-600 group-hover:bg-amber-400 text-white group-hover:text-slate-950',
    },
    {
      id: 'spot-services-2',
      section: 'services',
      emoji: '⚡',
      badgeEn: 'Deep Cleaning & Electrical',
      badgeTe: 'డీప్ క్లీనింగ్ & ఎలక్ట్రికల్',
      titleEn: 'Deep Home Cleaning, Pest Control & Packers',
      titleTe: 'డీప్ హోమ్ క్లీనింగ్, పెస్ట్ కంట్రోల్ & ప్యాకర్స్',
      subtitleEn: 'Background Verified Pros • Eco-Safe Chemicals',
      subtitleTe: 'వెరిఫైడ్ నిపుణులు • సురక్షితమైన సర్వీస్',
      priceHighlightEn: 'From ₹299/service',
      priceHighlightTe: '₹299 నుండి ప్రారంభం',
      rating: '4.8',
      image:
        'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=1000&q=85',
      accentBg: 'from-blue-950/95 via-cyan-900/55 to-transparent',
      pillTheme: 'bg-blue-100 text-blue-950 border-blue-400',
      ctaTheme: 'bg-blue-600 group-hover:bg-amber-400 text-white group-hover:text-slate-950',
    },
    {
      id: 'spot-services-3',
      section: 'services',
      emoji: '💇‍♀️',
      badgeEn: 'Bridal & Home Salon',
      badgeTe: 'బ్రైడల్ మేకప్ & హోమ్ సెలూన్',
      titleEn: 'Luxury Spa, Grooming & Event Photography',
      titleTe: 'లగ్జరీ స్పా, గ్రూమింగ్ & ఈవెంట్ ఫోటోగ్రఫీ',
      subtitleEn: 'Branded Kits • Instant Slot Confirmation',
      subtitleTe: 'బ్రాండెడ్ కిట్స్ • తక్షణ స్లాట్ బుకింగ్',
      priceHighlightEn: 'From ₹499/session',
      priceHighlightTe: '₹499 నుండి ప్రారంభం',
      rating: '4.9',
      image:
        'https://images.unsplash.com/photo-1562259949-e8e7689d7828?auto=format&fit=crop&w=1000&q=85',
      accentBg: 'from-cyan-950/95 via-sky-900/55 to-transparent',
      pillTheme: 'bg-cyan-100 text-cyan-950 border-cyan-400',
      ctaTheme: 'bg-cyan-600 group-hover:bg-amber-400 text-white group-hover:text-slate-950',
    },
  ],
};

const inferListingSection = (item: MarketplaceListing): MarketSectionType => {
  const explicitSec = item.customFieldValues?.sectionType as MarketSectionType | undefined;
  if (explicitSec) return explicitSec;
  const cat = (item.categoryId || '').toLowerCase();
  if (cat.startsWith('pg-') || cat.includes('pg') || cat.includes('hostel')) return 'pg_hostels';
  if (cat.startsWith('class-') || cat.includes('class')) return 'classes';
  if (cat.startsWith('venue-') || cat.includes('venue')) return 'venues';
  if (cat.startsWith('hotel-') || cat.includes('hotel') || cat.includes('stay')) return 'hotel_stay';
  if (cat.startsWith('movie-') || cat.includes('movie')) return 'movies';
  return 'services';
};

const extractListingSpotlightSummary = (
  item: MarketplaceListing,
  sec: MarketSectionType
): string => {
  const cf = item.customFieldValues || {};
  const specs: string[] = [];

  if (sec === 'pg_hostels') {
    if (cf.sharingType) specs.push(String(cf.sharingType));
    if (cf.acType) specs.push(String(cf.acType));
    if (cf.foodIncluded) specs.push(String(cf.foodIncluded));
  } else if (sec === 'classes') {
    if (cf.mode) specs.push(String(cf.mode));
    if (cf.batchTiming) specs.push(String(cf.batchTiming));
    if (cf.demoAvailable) specs.push(String(cf.demoAvailable));
  } else if (sec === 'venues') {
    if (cf.seatingCapacity) specs.push(String(cf.seatingCapacity));
    if (cf.acHallType) specs.push(String(cf.acHallType));
    if (cf.cateringPolicy) specs.push(String(cf.cateringPolicy));
  } else if (sec === 'services') {
    if (cf.serviceMode) specs.push(String(cf.serviceMode));
    if (cf.warrantyPeriod) specs.push(String(cf.warrantyPeriod));
    if (cf.experienceYears) specs.push(String(cf.experienceYears));
  } else if (sec === 'hotel_stay') {
    if (cf.roomCategory) specs.push(String(cf.roomCategory));
    if (cf.breakfastWifi) specs.push(String(cf.breakfastWifi));
    if (cf.coupleFriendly) specs.push(String(cf.coupleFriendly));
  } else if (sec === 'movies') {
    if (cf.screenSoundFormat) specs.push(String(cf.screenSoundFormat));
    if (cf.showTimings) specs.push(String(cf.showTimings));
    if (cf.seatCategories) specs.push(String(cf.seatCategories));
  }

  if (specs.length === 0) {
    Object.entries(cf).forEach(([k, v]) => {
      if (
        k !== 'runningBatchUrl' &&
        k !== 'batchScheduleImage' &&
        k !== 'sectionType' &&
        k !== 'categoryName' &&
        v
      ) {
        specs.push(String(v));
      }
    });
  }

  if (specs.length > 0) {
    return specs.slice(0, 3).join(' • ');
  }
  return `${item.subcategory} • ${item.location.area}, ${item.location.city}`;
};

export const SectionSpotlightShowcase: React.FC<SectionSpotlightShowcaseProps> = ({
  activeMarketSection,
  listings,
  allListings,
  currentLang,
  onSwitchSection,
  onSelectListing,
  onOpenRunningBatches,
}) => {
  const [isPaused, setIsPaused] = useState(false);
  const [autoRotateCategories, setAutoRotateCategories] = useState(true);
  const [activeSpotlightSection, setActiveSpotlightSection] =
    useState<MarketSectionType>(activeMarketSection);
  const [shiftDirection, setShiftDirection] = useState<'next' | 'prev'>('next');
  const [shiftRevision, setShiftRevision] = useState(0);
  const prevSectionRef = useRef<MarketSectionType>(activeMarketSection);

  const ui = getUILabels(currentLang);

  // Sync smoothly whenever the parent activeMarketSection changes
  useEffect(() => {
    if (activeMarketSection !== prevSectionRef.current) {
      const oldIdx = SPOTLIGHT_CATEGORY_ROTATION.findIndex(
        (c) => c.section === prevSectionRef.current
      );
      const newIdx = SPOTLIGHT_CATEGORY_ROTATION.findIndex(
        (c) => c.section === activeMarketSection
      );
      setShiftDirection(newIdx >= oldIdx ? 'next' : 'prev');
      setActiveSpotlightSection(activeMarketSection);
      setShiftRevision((r) => r + 1);
      prevSectionRef.current = activeMarketSection;
    }
  }, [activeMarketSection]);

  // Auto one-by-one category rotation
  useEffect(() => {
    if (isPaused || !autoRotateCategories) return;
    const timer = window.setInterval(() => {
      setShiftDirection('next');
      setActiveSpotlightSection((prev) => {
        const currentIndex = SPOTLIGHT_CATEGORY_ROTATION.findIndex((c) => c.section === prev);
        const nextIndex = (currentIndex + 1) % SPOTLIGHT_CATEGORY_ROTATION.length;
        return SPOTLIGHT_CATEGORY_ROTATION[nextIndex].section;
      });
      setShiftRevision((r) => r + 1);
    }, 3800);
    return () => window.clearInterval(timer);
  }, [isPaused, autoRotateCategories]);

  const handleManualCategoryShift = (
    targetSection: MarketSectionType,
    directionOverride?: 'next' | 'prev'
  ) => {
    if (targetSection === activeSpotlightSection) return;
    const currentIndex = SPOTLIGHT_CATEGORY_ROTATION.findIndex(
      (c) => c.section === activeSpotlightSection
    );
    const nextIndex = SPOTLIGHT_CATEGORY_ROTATION.findIndex((c) => c.section === targetSection);
    setShiftDirection(directionOverride || (nextIndex >= currentIndex ? 'next' : 'prev'));
    setActiveSpotlightSection(targetSection);
    setShiftRevision((r) => r + 1);
  };

  const handleStepCategory = (delta: 1 | -1) => {
    const currentIndex = SPOTLIGHT_CATEGORY_ROTATION.findIndex(
      (c) => c.section === activeSpotlightSection
    );
    const nextIndex =
      (currentIndex + delta + SPOTLIGHT_CATEGORY_ROTATION.length) %
      SPOTLIGHT_CATEGORY_ROTATION.length;
    handleManualCategoryShift(
      SPOTLIGHT_CATEGORY_ROTATION[nextIndex].section,
      delta === 1 ? 'next' : 'prev'
    );
  };

  const activeCategoryMeta =
    SPOTLIGHT_CATEGORY_ROTATION.find((c) => c.section === activeSpotlightSection) ||
    SPOTLIGHT_CATEGORY_ROTATION[0];

  const activeCategoryIndex = SPOTLIGHT_CATEGORY_ROTATION.findIndex(
    (c) => c.section === activeSpotlightSection
  );

  // Gather matching listings for the active spotlight category from allListings or listings
  const sourcePool = allListings && allListings.length > 0 ? allListings : listings;
  const matchingSectionListings = sourcePool.filter((item) => {
    if (item.status && item.status !== 'active') return false;
    if (activeSpotlightSection === activeMarketSection && !allListings) {
      return true;
    }
    return inferListingSection(item) === activeSpotlightSection;
  });

  const fallbackCards = SECTION_DEFAULT_SPOTLIGHT_CARDS[activeSpotlightSection] || [];

  const liveSlides: SpotlightSlideItem[] = matchingSectionListings.slice(0, 6).map((item, idx) => {
    const specLine = extractListingSpotlightSummary(item, activeSpotlightSection);
    const templateCard = fallbackCards[idx % Math.max(1, fallbackCards.length)];
    return {
      id: `spot-live-${activeSpotlightSection}-${item.id}`,
      section: activeSpotlightSection,
      emoji: activeCategoryMeta.emoji,
      badgeEn: item.subcategory || 'Verified Spotlight',
      badgeTe: item.subcategoryTe || item.subcategory || 'వెరిఫైడ్ స్పాట్‌లైట్',
      titleEn: item.title,
      titleTe: item.titleTe || item.title,
      subtitleEn: specLine,
      subtitleTe: specLine,
      priceHighlightEn: `${item.currency}${item.price.toLocaleString('en-IN')}${item.priceUnit}`,
      priceHighlightTe: `${item.currency}${item.price.toLocaleString('en-IN')}${
        item.priceUnitTe || item.priceUnit
      }`,
      rating: String(item.providerRating || 4.9),
      image:
        item.images?.[0] ||
        templateCard?.image ||
        'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1000&q=85',
      accentBg: templateCard?.accentBg || activeCategoryMeta.accentBg,
      pillTheme: templateCard?.pillTheme || activeCategoryMeta.pillTheme,
      ctaTheme: templateCard?.ctaTheme || activeCategoryMeta.ctaTheme,
      listingRef: item,
    };
  });

  const baseSlides: SpotlightSlideItem[] =
    liveSlides.length >= 3
      ? liveSlides
      : [...liveSlides, ...fallbackCards].slice(
          0,
          Math.max(3, liveSlides.length + fallbackCards.length)
        );

  const marqueeItems =
    baseSlides.length >= 3
      ? [...baseSlides, ...baseSlides]
      : [...baseSlides, ...baseSlides, ...baseSlides];

  const localizeSlideField = (enText: string, teText: string) => {
    if (currentLang === 'te') return teText;
    if (currentLang === 'en') return enText;
    return ensureChosenLanguageText(enText, currentLang);
  };

  const handleCardAction = (card: SpotlightSlideItem) => {
    if (card.listingRef) {
      if (
        card.section === 'classes' &&
        card.listingRef.runningBatchUrl &&
        onOpenRunningBatches
      ) {
        onOpenRunningBatches(card.listingRef);
      } else {
        onSelectListing(card.listingRef);
      }
      return;
    }

    if (onSwitchSection && card.section !== activeMarketSection) {
      onSwitchSection(card.section);
    }

    if (matchingSectionListings.length > 0) {
      const topItem =
        matchingSectionListings.find((i) => i.isFeatured) ||
        matchingSectionListings[0];
      if (
        card.section === 'classes' &&
        topItem.runningBatchUrl &&
        onOpenRunningBatches
      ) {
        onOpenRunningBatches(topItem);
      } else {
        onSelectListing(topItem);
      }
    }
  };

  const transitionAnimClass =
    shiftDirection === 'prev' ? 'animate-bos-spotlight-prev' : 'animate-bos-spotlight-next';

  return (
    <section
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      className={`relative overflow-hidden rounded-2xl bg-gradient-to-r ${activeCategoryMeta.containerGlowClass} border shadow-xs p-2.5 sm:p-3 space-y-2 transition-colors duration-500`}
    >
      {/* Inline Keyframes for Continuous Right-to-Left Card Track */}
      <style>{`
        @keyframes spotlightSlideRightToLeft {
          0% {
            transform: translate3d(0%, 0, 0);
          }
          100% {
            transform: translate3d(-50%, 0, 0);
          }
        }
        .animate-spotlight-rtl {
          display: flex;
          width: max-content;
          animation: spotlightSlideRightToLeft 26s linear infinite;
        }
        .animate-spotlight-rtl:hover,
        .animate-spotlight-rtl.paused {
          animation-play-state: paused;
        }
      `}</style>

      {/* Top Row: Animated Spotlight Category Headline + Category Switcher & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-1.5 border-b border-slate-200/70 dark:border-slate-800">
        <div
          key={`spot-header-${activeSpotlightSection}-${shiftRevision}`}
          className={`flex flex-wrap items-center gap-1.5 min-w-0 ${transitionAnimClass}`}
        >
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full ${activeCategoryMeta.headerBadgeClass} text-[9px] sm:text-[10px] font-black uppercase tracking-wider shrink-0 shadow-2xs`}
          >
            <Sparkles className="w-2.5 h-2.5 text-amber-300 fill-current" />
            <span>{ui.spotlight}</span>
            <span>
              {activeCategoryIndex + 1}/{SPOTLIGHT_CATEGORY_ROTATION.length}
            </span>
          </span>

          <span className="text-[11px] sm:text-xs font-black text-[#0F172A] dark:text-white truncate flex items-center gap-1">
            <span>{activeCategoryMeta.emoji}</span>
            <span>
              {localizeSlideField(activeCategoryMeta.headlineEn, activeCategoryMeta.headlineTe)}
            </span>
          </span>
        </div>

        {/* Right Controls: Auto One-by-One Toggle + Prev/Next Category + Pause/Play */}
        <div className="flex items-center gap-1 shrink-0 ml-auto">
          <button
            type="button"
            onClick={() => setAutoRotateCategories((prev) => !prev)}
            className={`px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-black transition cursor-pointer border ${
              autoRotateCategories
                ? activeCategoryMeta.activeChipClass
                : 'bg-white/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
            }`}
            title="Toggle automatic one-by-one spotlight category rotation"
          >
            🔄 {currentLang === 'te' ? 'ఆటో' : 'Auto 1-by-1'}
          </button>

          <button
            type="button"
            onClick={() => handleStepCategory(-1)}
            aria-label="Previous Spotlight Category"
            className="w-6 h-6 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 transition cursor-pointer"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => handleStepCategory(1)}
            aria-label="Next Spotlight Category"
            className="w-6 h-6 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 transition cursor-pointer"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setIsPaused((prev) => !prev)}
            className="px-2 py-0.5 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[9px] sm:text-[10px] font-black text-slate-700 dark:text-slate-200 flex items-center gap-1 hover:bg-slate-100 transition cursor-pointer"
          >
            {isPaused ? (
              <>
                <Play className="w-2.5 h-2.5 fill-current" />
                <span className="hidden sm:inline">{ui.play}</span>
              </>
            ) : (
              <>
                <Pause className="w-2.5 h-2.5 fill-current" />
                <span className="hidden sm:inline">{ui.pause}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 6-Category Color-Coded Switcher Pills */}
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
        {SPOTLIGHT_CATEGORY_ROTATION.map((cat) => {
          const isSelected = cat.section === activeSpotlightSection;
          return (
            <button
              key={cat.section}
              type="button"
              onClick={() => handleManualCategoryShift(cat.section)}
              className={`shrink-0 px-2.5 py-0.5 rounded-full text-[9.5px] sm:text-[10px] font-black transition-all duration-200 cursor-pointer border flex items-center gap-1 ${
                isSelected
                  ? `${cat.activeChipClass} scale-[1.02]`
                  : 'bg-white/90 dark:bg-slate-800/90 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400'
              }`}
            >
              <span>{cat.emoji}</span>
              <span>{localizeSlideField(cat.chipLabelEn, cat.chipLabelTe)}</span>
            </button>
          );
        })}
      </div>

      {/* Animated Content Transition Wrapper Keyed by Active Spotlight Category */}
      <div
        key={`spot-cards-stage-${activeSpotlightSection}-${shiftRevision}`}
        className={`relative overflow-hidden rounded-xl ${transitionAnimClass}`}
      >
        <div className={`animate-spotlight-rtl gap-2.5 sm:gap-3 ${isPaused ? 'paused' : ''}`}>
          {marqueeItems.map((card, idx) => {
            const badgeText = localizeSlideField(card.badgeEn, card.badgeTe);
            const titleText = localizeSlideField(card.titleEn, card.titleTe);
            const subText = localizeSlideField(card.subtitleEn, card.subtitleTe);
            const priceText = localizeSlideField(card.priceHighlightEn, card.priceHighlightTe);

            return (
              <div
                key={`${card.id}-${idx}`}
                style={{ animationDelay: `${(idx % 4) * 55}ms` }}
                onClick={() => handleCardAction(card)}
                className={`animate-bos-card-cascade group relative w-[260px] sm:w-[330px] md:w-[365px] h-28 sm:h-32 rounded-xl overflow-hidden shrink-0 cursor-pointer border ring-2 ${activeCategoryMeta.cardBorderClass} transition-all duration-300 hover:scale-[1.02] hover:shadow-md`}
              >
                {/* Background Image */}
                <SafeImage
                  src={card.image}
                  alt={titleText}
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                  category={imageCategoryFor(activeCategoryMeta.section)}
                  sizes="365px"
                />

                {/* Distinct Category Color Gradient Overlay */}
                <div
                  className={`absolute inset-0 bg-gradient-to-t ${card.accentBg} via-slate-950/55 to-slate-950/20`}
                />

                {/* Top Row: Distinct Color Category Pill + Rating */}
                <div className="absolute top-2 left-2 right-2 flex items-center justify-between gap-1">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-black flex items-center gap-1 shadow-xs backdrop-blur-md border ${card.pillTheme} max-w-[76%] truncate`}
                  >
                    <span>{card.emoji}</span>
                    <span className="truncate">{badgeText}</span>
                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-700 shrink-0" />
                  </span>

                  <span className="px-1.5 py-0.5 rounded-md bg-emerald-600 text-white text-[9px] font-black flex items-center gap-0.5 shadow-xs shrink-0">
                    <Star className="w-2.5 h-2.5 fill-current text-amber-300" />
                    <span>{card.rating}</span>
                  </span>
                </div>

                {/* Bottom Content: Title, Category Spec Subtitle & Distinct Color Price Pill */}
                <div className="absolute bottom-2 left-2.5 right-2.5 flex items-end justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h4 className="text-xs sm:text-sm font-black text-white leading-tight truncate drop-shadow-xs group-hover:text-amber-200 transition-colors">
                      {titleText}
                    </h4>
                    <p className="text-[9px] sm:text-[10px] text-amber-200 font-bold truncate mt-0.5">
                      {subText}
                    </p>
                    {card.listingRef && (
                      <p className="text-[9px] text-slate-200 font-medium truncate flex items-center gap-0.5">
                        <MapPin className="w-2.5 h-2.5 text-amber-400 shrink-0" />
                        <span>
                          {card.listingRef.location.area}, {card.listingRef.location.city}
                        </span>
                      </p>
                    )}
                  </div>

                  <span
                    className={`shrink-0 px-2 py-1 rounded-lg ${card.ctaTheme} text-[9px] sm:text-[10px] font-black flex items-center gap-0.5 shadow-xs transition-colors`}
                  >
                    {card.section === 'classes' && (
                      <CalendarClock className="w-2.5 h-2.5" />
                    )}
                    <span>{priceText}</span>
                    <ArrowUpRight className="w-2.5 h-2.5" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
