/**
 * Mandap-style venue type tiles for the Halls module.
 * Each type maps to one or more seeded venue categories so every tile has
 * at least one demo sample.
 */

export interface HallVenueType {
  id: string;
  label: string;
  emoji: string;
  image: string;
  categoryIds: string[];
}

const img = (id: string): string =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=500&q=80`;

export const HALL_VENUE_TYPES: HallVenueType[] = [
  { id: 'lawn', label: 'Lawn Venues', emoji: '🌳', image: img('photo-1505236858219-8359eb29e329'), categoryIds: ['venue-marriage'] },
  { id: 'resort', label: 'Resort Venues', emoji: '🏝️', image: img('photo-1520250497591-112f2f40a3f4'), categoryIds: ['venue-special'] },
  { id: 'hotel5', label: '5 Star Hotels', emoji: '🏨', image: img('photo-1566073771259-6a8506099945'), categoryIds: ['venue-corporate'] },
  { id: 'banquet', label: 'Banquet Halls', emoji: '🎊', image: img('photo-1519167758481-83f550bb49b3'), categoryIds: ['venue-birthday'] },
  { id: 'destination', label: 'Destination Wedding', emoji: '💒', image: img('photo-1464366400600-7168b8af9bc3'), categoryIds: ['venue-marriage'] },
  { id: 'mini', label: 'Mini Halls', emoji: '🏠', image: img('photo-1511795409834-ef04bbd61622'), categoryIds: ['venue-community'] },
  { id: 'hotel4', label: '4 Star Hotels', emoji: '🏩', image: img('photo-1551882547-ff40c63fe5fa'), categoryIds: ['venue-corporate'] },
  { id: 'convention', label: 'Convention Halls', emoji: '🏛️', image: img('photo-1519167758481-83f550bb49b3'), categoryIds: ['venue-marriage', 'venue-corporate'] },
  { id: 'farm', label: 'Farm House', emoji: '🌾', image: img('photo-1500382017468-9049fed747ef'), categoryIds: ['venue-community'] },
  { id: 'fort', label: 'Fort & Palaces', emoji: '🏰', image: img('photo-1524492412937-b28074a5d7da'), categoryIds: ['venue-religious', 'venue-special'] },
];

export const HALL_FILTERS = ['Sort by', 'Venue Type', 'Price range', 'Capacity', 'Food type', 'Venue Amenities', 'Catering policy'];
