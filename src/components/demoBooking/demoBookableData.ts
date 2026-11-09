import type { LucideIcon } from 'lucide-react';
import { CalendarDays, Clapperboard, GraduationCap, Home, Hotel, PartyPopper, Wrench } from 'lucide-react';

export type DemoSectionKey = 'pg' | 'classes' | 'venues' | 'services' | 'stay' | 'movies';

export interface DemoBookableCardData {
  section: DemoSectionKey;
  sectionLabel: string;
  title: string;
  subtitle: string;
  meta: string;
  price: number;
  priceUnit: string;
  image: string;
  icon: LucideIcon;
  accent: string;
  slotLabel: string;
  defaultSlot: string;
}

/**
 * One curated, explicitly-labelled demo card per module. These are not provider
 * inventory: booking one creates a local demo booking only (no payment).
 */
export const DEMO_BOOKABLE_CARDS: Record<DemoSectionKey, DemoBookableCardData> = {
  pg: {
    section: 'pg',
    sectionLabel: 'PG & Hostels',
    title: 'Demo PG — Hitech City Co-living',
    subtitle: 'Single sharing · AC · food included · attached bath',
    meta: 'Madhapur / Hitech City · Hyderabad · Demo Partner',
    price: 9000,
    priceUnit: 'per month',
    image: 'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=900&q=80',
    icon: Home,
    accent: 'from-violet-600 to-indigo-600',
    slotLabel: 'Move-in date',
    defaultSlot: '10:00 AM',
  },
  classes: {
    section: 'classes',
    sectionLabel: 'Classes & Training',
    title: 'Demo Batch — Python Foundations',
    subtitle: '8 weeks · beginner friendly · weekend batch · certificate',
    meta: 'Madhapur / Hitech City · Hyderabad · Demo Academy',
    price: 2999,
    priceUnit: 'per course',
    image: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=80',
    icon: GraduationCap,
    accent: 'from-blue-600 to-cyan-600',
    slotLabel: 'Batch start date',
    defaultSlot: '10:00 AM',
  },
  venues: {
    section: 'venues',
    sectionLabel: 'Function Halls',
    title: 'Demo Hall — Banjara Hills Banquet',
    subtitle: 'Up to 250 guests · AC · parking · in-house catering allowed',
    meta: 'Banjara Hills · Hyderabad · Demo Venue',
    price: 25000,
    priceUnit: 'per event',
    image: 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=900&q=80',
    icon: PartyPopper,
    accent: 'from-amber-500 to-orange-600',
    slotLabel: 'Event date',
    defaultSlot: '06:00 PM',
  },
  services: {
    section: 'services',
    sectionLabel: 'Home Services',
    title: 'Demo Service — AC Deep Clean',
    subtitle: 'Split AC · foam wash · gas check · 90-minute visit',
    meta: 'Madhapur / Hitech City · Hyderabad · Demo Technician',
    price: 1499,
    priceUnit: 'per visit',
    image: 'https://images.unsplash.com/photo-1581094794329-c8112a89af12?auto=format&fit=crop&w=900&q=80',
    icon: Wrench,
    accent: 'from-emerald-600 to-teal-600',
    slotLabel: 'Service date',
    defaultSlot: '11:00 AM',
  },
  stay: {
    section: 'stay',
    sectionLabel: 'Stay',
    title: 'Demo Stay — Hitech City Suite',
    subtitle: 'Deluxe suite · king bed · breakfast · free cancellation',
    meta: 'Gachibowli · Hyderabad · Demo Hotel',
    price: 3200,
    priceUnit: 'per night',
    image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=900&q=80',
    icon: Hotel,
    accent: 'from-rose-500 to-pink-600',
    slotLabel: 'Check-in date',
    defaultSlot: '02:00 PM',
  },
  movies: {
    section: 'movies',
    sectionLabel: 'Movies',
    title: 'Demo Movie — Evening Show',
    subtitle: '2 tickets · recliner · 4K laser · complimentary parking',
    meta: 'AMB Cinemas · Gachibowli · Hyderabad · Demo Screen',
    price: 500,
    priceUnit: 'for 2 tickets',
    image: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=900&q=80',
    icon: Clapperboard,
    accent: 'from-slate-800 to-slate-950',
    slotLabel: 'Show date',
    defaultSlot: '07:30 PM',
  },
};

export const DEMO_BOOKABLE_ICON = CalendarDays;
