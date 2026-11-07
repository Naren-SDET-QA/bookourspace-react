// Compact controls used by the customer search shell. Keep these separate
// from comprehensiveListings.ts, which contains optional preview inventory.
export const popularAreasList = [
  'All Areas in City',
  'Madhapur / Hitech City',
  'Gachibowli Financial District',
  'Kukatpally / KPHB',
  'Banjara Hills, Road 12',
  'Jubilee Hills',
  'Kondapur / Miyapur',
  'Begumpet / Ameerpet',
  'Secunderabad',
];

export const distanceRadiuses = [
  { id: 'all', label: 'All Distances', maxKm: 999 },
  { id: '5', label: 'Within 5 km', maxKm: 5 },
  { id: '10', label: 'Within 10 km', maxKm: 10 },
  { id: '15', label: 'Within 15 km', maxKm: 15 },
];
