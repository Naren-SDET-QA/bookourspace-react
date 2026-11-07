// BookMySpace (Flutter app) home look — replicated for the React Services section.
// Fully hardcoded, image-only. No database writes — every image is a CDN URL.

const img = (id: string, w = 1000): string =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=80`;

export interface BmsFeaturedCategory {
  id: string;
  title: string;
  subtitle: string;
  image: string;
}

export interface BmsQuickCategory {
  id: string;
  label: string;
  emoji: string;
}

export interface BmsPromo {
  id: string;
  title: string;
  subtitle: string;
  image: string;
}

export interface BmsSpace {
  id: string;
  name: string;
  category: string;
  area: string;
  price: string;
  unit: string;
  rating: number;
  image: string;
}

export const bmsFeaturedCategories: BmsFeaturedCategory[] = [
  { id: 'function-halls', title: 'Function Halls', subtitle: 'Weddings · Events · Parties', image: img('photo-1519167758481-83f550bb49b3') },
  { id: 'classroom-timings', title: 'Classroom Timings', subtitle: 'Coaching · Tuition · Training', image: img('photo-1577896851231-70ef18881754') },
  { id: 'pg-hall-booking', title: 'PG Hall Booking', subtitle: 'Paying Guest · Rooms · Hostels', image: img('photo-1522771739844-6a9f6d5f14af') },
];

export const bmsQuickCategories: BmsQuickCategory[] = [
  { id: 'hotel_stay', label: 'Hotels', emoji: '🏨' },
  { id: 'auditorium', label: 'Events', emoji: '📅' },
  { id: 'meeting_room', label: 'Meetings', emoji: '👥' },
  { id: 'convention_center', label: 'Conferences', emoji: '🎤' },
  { id: 'party_hall', label: 'Parties', emoji: '🎉' },
  { id: 'sports_ground', label: 'Sports', emoji: '⚽' },
  { id: 'institute', label: 'Institutes', emoji: '🏛️' },
  { id: 'coaching', label: 'Classes', emoji: '🎓' },
];

export const bmsPromos: BmsPromo[] = [
  { id: 'special-offers', title: 'Special Offers', subtitle: 'Hotels · Halls · PGs · Classes', image: img('photo-1492684223066-81342ee5ff30') },
  { id: 'grand-celebrations', title: 'Grand Celebrations', subtitle: 'Banquets · Resorts · Convention', image: img('photo-1511795409834-ef04bbd61622') },
  { id: 'play-and-train', title: 'Play & Train', subtitle: 'Turfs · Courts · Academies', image: img('photo-1461896836934-ffe607ba8211') },
];

export const bmsPopularSpaces: BmsSpace[] = [
  { id: 'bms-1', name: 'Grand Celebration Hall', category: 'Function Hall', area: 'Banjara Hills, Hyderabad', price: '45,000', unit: 'per day', rating: 4.8, image: img('photo-1519167758481-83f550bb49b3') },
  { id: 'bms-2', name: 'Campus Coaching Centre', category: 'Classroom', area: 'Madhapur, Hyderabad', price: '2,500', unit: 'per seat/mo', rating: 4.6, image: img('photo-1509062522246-3755977927d7') },
  { id: 'bms-3', name: 'Cozy PG Rooms', category: 'PG', area: 'Gachibowli, Hyderabad', price: '9,500', unit: 'per month', rating: 4.7, image: img('photo-1522771739844-6a9f6d5f14af') },
  { id: 'bms-4', name: 'Lakeside Resort', category: 'Events', area: 'Necklace Road, Hyderabad', price: '18,000', unit: 'per day', rating: 4.9, image: img('photo-1566073771259-6a8506099945') },
  { id: 'bms-5', name: 'TechPark Conference', category: 'Meeting Room', area: 'HITEC City, Hyderabad', price: '3,500', unit: 'per hour', rating: 4.5, image: img('photo-1587825140708-dfaf72ae4b04') },
  { id: 'bms-6', name: 'Synthetic Turf Arena', category: 'Sports', area: 'Gachibowli, Hyderabad', price: '1,200', unit: 'per hour', rating: 4.4, image: img('photo-1461896836934-ffe607ba8211') },
];

export const bmsCities: string[] = [
  'Hyderabad (Madhapur / Hitec City)',
  'Hyderabad (Gachibowli)',
  'Hyderabad (Kukatpally)',
  'Hyderabad (Secunderabad)',
  'Bengaluru (Koramangala)',
  'Bengaluru (Whitefield)',
  'Mumbai (Andheri)',
  'Delhi NCR (Cyber Hub)',
];

export function formatINR(value: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
}
