import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ClipboardList,
  Home,
  LayoutGrid,
  MapPin,
  MessageCircle,
  Phone,
  Search,
  ShieldCheck,
  Star,
  User,
} from 'lucide-react';

import { HelperJourney } from './HelperJourney';
import SafeImage from './SafeImage';

interface HomeTriangleExperienceProps {
  onClose: () => void;
  onSwitchToOld: () => void;
  /** Render in the page flow under the common header instead of as a full-screen dialog. */
  inline?: boolean;
}

/* ---------------------------------- Data ---------------------------------- */

const img = (id: string, w = 900): string =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=80`;

interface CategoryTile {
  id: string;
  label: string;
  emoji: string;
}

const CATEGORY_TILES: CategoryTile[] = [
  { id: 'painting', label: 'Painting & Water proofing', emoji: '🎨' },
  { id: 'movers', label: 'Movers & Storage', emoji: '🚚' },
  { id: 'renovation', label: 'Renovation', emoji: '🏠' },
  { id: 'makeup', label: 'Makeup & Styling', emoji: '💄' },
  { id: 'mosquito', label: 'Mosquito & Safety Net', emoji: '🦟' },
  { id: 'village', label: 'Village Services', emoji: '🌾' },
  { id: 'milk', label: 'Milk & Dairy', emoji: '🥛' },
  { id: 'more', label: 'More Categories', emoji: '⊞' },
  { id: 'need-helper', label: 'Need Helper', emoji: '🧑‍🔧' },
];

interface Banner {
  id: string;
  title: string;
  pill: string;
  image: string;
}

const BANNERS: Banner[] = [
  { id: 'b1', title: 'Professional appliance repairs', pill: '30 Days warranty', image: img('photo-1556911220-bff31c812dba') },
  { id: 'b2', title: 'Deep cleaning for a fresh home', pill: 'Verified pros', image: img('photo-1581578731548-c64695cc6952') },
  { id: 'b3', title: 'Wall painting made easy', pill: 'Up to 30% off', image: img('photo-1562259949-e8e7689d7828') },
  { id: 'b4', title: 'Cooling & AC service', pill: 'Same-day visit', image: img('photo-1621905251189-08b45d6a269e') },
  { id: 'b5', title: 'Handyman & quick fixes', pill: 'Trusted experts', image: img('photo-1581092160562-40aa08e78837') },
];

interface ServiceItem {
  id: string;
  name: string;
  image: string;
  price?: string;
  off?: string;
}

interface ServiceSection {
  id: string;
  title: string;
  items: ServiceItem[];
}

const SERVICE_SECTIONS: ServiceSection[] = [
  {
    id: 'appliances',
    title: 'Appliances & Repair',
    items: [
      { id: 'a1', name: 'Microwave Repair', image: img('photo-1585659722983-3a675dabf23d') },
      { id: 'a2', name: 'Geyser Repair Service', image: img('photo-1581092160562-40aa08e78837') },
      { id: 'a3', name: 'Water Purifier Service', image: img('photo-1571175443880-49e1d25b2bc5') },
      { id: 'a4', name: 'Washing Machine Repair', image: img('photo-1556911220-bff31c812dba') },
    ],
  },
  {
    id: 'handyman',
    title: 'Handyman Repair & Service',
    items: [
      { id: 'h1', name: 'Furniture Assembly', image: img('photo-1555041469-a586c61ea9bc') },
      { id: 'h2', name: 'TV Installation', image: img('photo-1593359677879-a4bb92f829d1') },
      { id: 'h3', name: 'Tile Grouting', image: img('photo-1600607687939-ce8a6c25118c') },
    ],
  },
  {
    id: 'cleaning',
    title: 'Cleaning & Pest Control',
    items: [
      { id: 'c1', name: 'Full House Cleaning', image: img('photo-1581578731548-c64695cc6952') },
      { id: 'c2', name: 'Bathroom Cleaning', image: img('photo-1556911220-bff31c812dba') },
      { id: 'c3', name: 'Kitchen Cleaning', image: img('photo-1556911220-bff31c812dba') },
    ],
  },
  {
    id: 'painting',
    title: 'Painting & Water proofing',
    items: [
      { id: 'p1', name: 'Wall Painting', image: img('photo-1562259949-e8e7689d7828') },
      { id: 'p2', name: 'Waterproofing', image: img('photo-1600607687939-ce8a6c25118c') },
      { id: 'p3', name: 'Texture & Wallpaper', image: img('photo-1502005229762-cf1b2da7c5d6') },
    ],
  },
];

const MOST_BOOKED: ServiceItem[] = [
  { id: 'm1', name: 'AC Deep Cleaning', image: img('photo-1621905251189-08b45d6a269e'), price: '₹599', off: '29% Off' },
  { id: 'm2', name: 'Bathroom Cleaning', image: img('photo-1581578731548-c64695cc6952'), price: '₹399', off: '15% Off' },
  { id: 'm3', name: 'Sofa Cleaning', image: img('photo-1493663284031-b7e3aefcae8e'), price: '₹899', off: '20% Off' },
  { id: 'm4', name: 'Wall Painting', image: img('photo-1562259949-e8e7689d7828'), price: '₹1,299', off: '10% Off' },
];

/* ------------------------------ MyVilej (village) ------------------------------ */

const VILLAGE_SERVICES: CategoryTile[] = [
  { id: 'v-carpenter', label: 'Carpenter', emoji: '🪚' },
  { id: 'v-tractor', label: 'Tractor on rent', emoji: '🚜' },
  { id: 'v-tailor', label: 'Tailor', emoji: '🧵' },
  { id: 'v-electrician', label: 'Electrician', emoji: '💡' },
  { id: 'v-milk', label: 'Milk collection', emoji: '🥛' },
  { id: 'v-tuition', label: 'Tuition & coaching', emoji: '📚' },
  { id: 'v-grocery', label: 'Grocery & kirana', emoji: '🛒' },
  { id: 'v-barber', label: 'Barber', emoji: '💈' },
  { id: 'v-vet', label: 'Veterinary doctor', emoji: '🐄' },
  { id: 'v-plumbing', label: 'Plumbing', emoji: '🔧' },
];

const VILLAGE_MARKETPLACE: ServiceItem[] = [
  { id: 'vm1', name: 'Fresh vegetables', image: img('photo-1542838132-92c53300491e'), price: '₹40 /kg' },
  { id: 'vm2', name: 'Organic grains', image: img('photo-1557844352-761f2565b576'), price: '₹80 /kg' },
  { id: 'vm3', name: 'Farm-fresh fruits', image: img('photo-1540420773420-3366772f4999'), price: '₹60 /kg' },
  { id: 'vm4', name: 'Honey & spices', image: img('photo-1488459716781-31db52582fe9'), price: '₹350 /jar' },
];

const VILLAGE_NEWS: Array<{ id: string; tag: string; headline: string; date: string }> = [
  { id: 'vn1', tag: 'Market', headline: 'Mandi opens new organic vegetable stall this week', date: 'Today' },
  { id: 'vn2', tag: 'Health', headline: 'Free veterinary camp at the panchayat ground on Sunday', date: '2 days ago' },
  { id: 'vn3', tag: 'Dairy', headline: 'New milk collection centre timing: 6 AM – 9 AM', date: '3 days ago' },
  { id: 'vn4', tag: 'Farming', headline: 'Monsoon crop advisory for paddy & pulses farmers', date: '5 days ago' },
];

/* ------------------------------ LocalMilk (dairy) ------------------------------ */

const MILK_PRODUCTS: ServiceItem[] = [
  { id: 'mk1', name: 'Cow Milk', image: img('photo-1550583724-b2692b85b150'), price: '₹32 / 500ml', off: 'Fresh' },
  { id: 'mk2', name: 'Buffalo Milk', image: img('photo-1563636619-e9143da7973b'), price: '₹38 / 500ml' },
  { id: 'mk3', name: 'Fresh Curd', image: img('photo-1628088062854-d1870b4553da'), price: '₹25 / 200g' },
  { id: 'mk4', name: 'Paneer', image: img('photo-1628088062854-d1870b4553da'), price: '₹95 / 200g' },
  { id: 'mk5', name: 'Desi Ghee', image: img('photo-1474979266404-7eaacbcd87c5'), price: '₹320 / 250ml' },
  { id: 'mk6', name: 'Buttermilk', image: img('photo-1563636619-e9143da7973b'), price: '₹20 / 500ml' },
];

const MILK_PLANS: Array<{ id: string; name: string; detail: string; price: string; save: string; popular?: boolean }> = [
  { id: 'pl1', name: 'Daily Delivery', detail: '1 litre cow milk every morning', price: '₹64', save: 'Pay as you go' },
  { id: 'pl2', name: 'Weekly Pack', detail: '7 days · 1 litre/day', price: '₹420', save: 'Save ₹28', popular: true },
  { id: 'pl3', name: 'Monthly Family Pack', detail: '30 days · 2 litres/day', price: '₹3,480', save: 'Save ₹360' },
];

/* ------------------------------ Demo providers ------------------------------ */

interface ProviderDetailRow {
  label: string;
  value: string;
}

interface Provider {
  id: string;
  name: string;
  category: string;
  service: string;
  categoryLabel: string;
  title: string;
  locality: string;
  price: string;
  priceUnit: string;
  scope: string;
  details: ProviderDetailRow[];
  rating: number;
  reviews: number;
  jobs: number;
  years: number;
  verified: boolean;
  image: string;
}

const PROVIDERS: Provider[] = [
  {
    id: 'p-ap1', name: 'CoolTech Appliance Care', category: 'appliances', service: 'Microwave Repair',
    categoryLabel: 'Appliance Repair',
    title: 'CoolTech Pro: AC Gas Refill, Deep Jet Service & Fridge Repair',
    locality: 'Madhapur / Hitech City, Hyderabad',
    price: '₹499', priceUnit: '/service',
    scope: 'Authorized multi-brand technicians for Daikin, LG, Voltas, Samsung & BlueStar. Foam jet AC cleaning, PCB repair, refrigerator compressor & washing machine drum service at your doorstep in 45 mins.',
    details: [
      { label: 'Brand Expertise', value: 'Daikin, LG, Samsung, Voltas, Bosch' },
      { label: 'Service Warranty', value: '60 Days' },
      { label: 'Provider', value: 'CoolTech Appliance Care' },
    ],
    rating: 4.9, reviews: 312, jobs: 312, years: 8, verified: true, image: img('photo-1472099645785-5658abf4ff4e'),
  },
  {
    id: 'p-c1', name: 'Suresh Reddy Home Care', category: 'cleaning', service: 'Full house cleaning',
    categoryLabel: 'Full House Cleaning',
    title: 'Deep Clean Pro: Full House, Kitchen & Bathroom Deep Cleaning',
    locality: 'Madhapur / Hitech City, Hyderabad',
    price: '₹1,499', priceUnit: '/service',
    scope: 'Trained housekeeping team for a complete home deep clean. Includes kitchen degreasing, bathroom sanitisation, floor scrubbing and dusting of every room using eco-friendly chemicals.',
    details: [
      { label: 'Team Size', value: '2 – 3 professionals' },
      { label: 'Duration', value: '3 – 4 hours' },
      { label: 'Provider', value: 'Suresh Reddy Home Care' },
    ],
    rating: 4.8, reviews: 320, jobs: 320, years: 6, verified: true, image: img('photo-1507003211169-0a1dd7228f2d'),
  },
  {
    id: 'p-c2', name: 'Lakshmi Devi Cleaning', category: 'cleaning', service: 'Bathroom cleaning',
    categoryLabel: 'Bathroom Cleaning',
    title: 'Sparkle Bath: Deep Bathroom & Toilet Sanitisation',
    locality: 'Gachibowli, Hyderabad',
    price: '₹399', priceUnit: '/service',
    scope: 'Hard-water stain removal, tile scrubbing, drain cleaning and complete sanitisation of bathrooms and toilets with hospital-grade disinfectants.',
    details: [
      { label: 'Duration', value: '60 – 90 mins' },
      { label: 'Chemicals', value: 'Food-safe, eco-friendly' },
      { label: 'Provider', value: 'Lakshmi Devi Cleaning' },
    ],
    rating: 4.7, reviews: 210, jobs: 210, years: 4, verified: true, image: img('photo-1573496359142-b8d87734a5a2'),
  },
  {
    id: 'p-p1', name: 'Ravi Kumar Painting', category: 'painting', service: 'Full home painting',
    categoryLabel: 'Painting & Water proofing',
    title: 'FreshCoat Pro: Full Home Interior Painting with Putty & Primer',
    locality: 'Kondapur, Hyderabad',
    price: '₹12,999', priceUnit: '/service',
    scope: 'Complete interior painting with 2 coats of premium emulsion, wall putty, primer and post-work cleanup. Furniture covered and protected throughout.',
    details: [
      { label: 'Paint Brand', value: 'Asian Paints / Berger' },
      { label: 'Warranty', value: '1 Year' },
      { label: 'Provider', value: 'Ravi Kumar Painting' },
    ],
    rating: 4.9, reviews: 180, jobs: 180, years: 9, verified: true, image: img('photo-1560250097-0b93528c311a'),
  },
  {
    id: 'p-m1', name: 'Kiran Movers', category: 'movers', service: 'Local house shifting',
    categoryLabel: 'Movers & Storage',
    title: 'SafeShift: Local House Shifting with Packing & Unpacking',
    locality: 'Kukatpally, Hyderabad',
    price: '₹2,499', priceUnit: '/service',
    scope: 'Trained packers, bubble-wrap and carton packing, loading/unloading and safe transport for local house shifting within the city.',
    details: [
      { label: 'Team Size', value: '4 professionals' },
      { label: 'Vehicle', value: '14 ft closed truck' },
      { label: 'Provider', value: 'Kiran Movers' },
    ],
    rating: 4.6, reviews: 410, jobs: 410, years: 7, verified: true, image: img('photo-1472099645785-5658abf4ff4e'),
  },
  {
    id: 'p-r1', name: 'Anil Interiors', category: 'renovation', service: 'Kitchen renovation',
    categoryLabel: 'Renovation',
    title: 'Modular Kitchen Renovation with Cabinets & Countertop',
    locality: 'Banjara Hills, Hyderabad',
    price: '₹45,000', priceUnit: '/service',
    scope: 'Design and execution of modular kitchen renovation — cabinets, countertop, chimney, sink and electrical points, with a project manager assigned.',
    details: [
      { label: 'Timeline', value: '2 – 3 weeks' },
      { label: 'Material', value: 'BWP ply + quartz top' },
      { label: 'Provider', value: 'Anil Interiors' },
    ],
    rating: 4.8, reviews: 95, jobs: 95, years: 11, verified: true, image: img('photo-1506794778202-cad84cf45f1d'),
  },
  {
    id: 'p-mk1', name: 'Priya Beauty Studio', category: 'makeup', service: 'Bridal makeup',
    categoryLabel: 'Makeup & Styling',
    title: 'Bridal Glow: HD Makeup, Hair Styling & Draping',
    locality: 'Jubilee Hills, Hyderabad',
    price: '₹4,999', priceUnit: '/service',
    scope: 'HD airbrush bridal makeup with premium products, hair styling, saree draping and touch-up kit. Studio or at-home service available.',
    details: [
      { label: 'Products', value: 'MAC, Huda, Bobbi Brown' },
      { label: 'Trial', value: 'Included' },
      { label: 'Provider', value: 'Priya Beauty Studio' },
    ],
    rating: 4.9, reviews: 260, jobs: 260, years: 5, verified: true, image: img('photo-1580489944761-15a19d654956'),
  },
  {
    id: 'p-ms1', name: 'SafeNet Services', category: 'mosquito', service: 'Window mosquito net',
    categoryLabel: 'Mosquito & Safety Net',
    title: 'MosquitoShield: Custom Window & Balcony Mosquito Nets',
    locality: 'Secunderabad, Hyderabad',
    price: '₹1,200', priceUnit: '/service',
    scope: 'Custom-measured, rust-free stainless steel mosquito nets for windows and balconies with professional fitting and a warranty.',
    details: [
      { label: 'Material', value: 'SS 304 mesh' },
      { label: 'Warranty', value: '3 Years' },
      { label: 'Provider', value: 'SafeNet Services' },
    ],
    rating: 4.5, reviews: 150, jobs: 150, years: 4, verified: true, image: img('photo-1544005313-94ddf0286df2'),
  },
  {
    id: 'p-hm1', name: 'Rahul Handyman', category: 'handyman', service: 'TV Installation',
    categoryLabel: 'Handyman Repair & Service',
    title: 'TV Wall Mount Installation & Cable Management',
    locality: 'Madhapur / Hitech City, Hyderabad',
    price: '₹599', priceUnit: '/service',
    scope: 'Wall-mount installation for LED/OLED TVs up to 65", with cable concealment, levelling and post-install testing.',
    details: [
      { label: 'TV Size', value: 'Up to 65 inches' },
      { label: 'Warranty', value: '30 Days' },
      { label: 'Provider', value: 'Rahul Handyman' },
    ],
    rating: 4.6, reviews: 140, jobs: 140, years: 5, verified: true, image: img('photo-1506794778202-cad84cf45f1d'),
  },
  {
    id: 'p-v1', name: 'Ramu Carpenter', category: 'village', service: 'Carpenter',
    categoryLabel: 'Village Services',
    title: 'Ramu Carpentry: Furniture Repair & Custom Woodwork',
    locality: 'Shamirpet, Hyderabad',
    price: '₹499', priceUnit: '/service',
    scope: 'Door, window and furniture repair, custom wooden shelves and local carpentry work with 20+ years of family experience.',
    details: [
      { label: 'Experience', value: '20+ years' },
      { label: 'Service Area', value: 'Shamirpet & nearby villages' },
      { label: 'Provider', value: 'Ramu Carpenter' },
    ],
    rating: 4.6, reviews: 88, jobs: 88, years: 8, verified: true, image: img('photo-1507003211169-0a1dd7228f2d'),
  },
  {
    id: 'p-v2', name: 'Ganesh Tractor', category: 'village', service: 'Tractor on rent',
    categoryLabel: 'Village Services',
    title: 'Ganesh Tractor: Farm Tractor & Rotavator on Rent',
    locality: 'Medchal, Hyderabad',
    price: '₹800', priceUnit: '/hour',
    scope: 'Tractor with rotavator for ploughing, levelling and field preparation. Operator included, diesel billed separately.',
    details: [
      { label: 'Equipment', value: '45 HP tractor + rotavator' },
      { label: 'Operator', value: 'Included' },
      { label: 'Provider', value: 'Ganesh Tractor' },
    ],
    rating: 4.4, reviews: 42, jobs: 42, years: 5, verified: false, image: img('photo-1472099645785-5658abf4ff4e'),
  },
  {
    id: 'p-ml1', name: 'LocalMilk Dairy', category: 'milk', service: 'Cow Milk',
    categoryLabel: 'Milk & Dairy',
    title: 'LocalMilk: Farm-Fresh Cow Milk Delivered Daily',
    locality: 'Madhapur / Hitech City, Hyderabad',
    price: '₹32', priceUnit: '/500ml',
    scope: 'A2 cow milk collected from local farms every morning, chilled and delivered to your doorstep before 7 AM. Subscription and one-time orders available.',
    details: [
      { label: 'Fat Content', value: '3.5% – 4%' },
      { label: 'Delivery', value: 'Daily before 7 AM' },
      { label: 'Provider', value: 'LocalMilk Dairy' },
    ],
    rating: 4.8, reviews: 520, jobs: 520, years: 6, verified: true, image: img('photo-1573496359142-b8d87734a5a2'),
  },
  {
    id: 'p-ml2', name: 'Sri Dairy Farm', category: 'milk', service: 'Buffalo Milk',
    categoryLabel: 'Milk & Dairy',
    title: 'Sri Dairy: Creamy Buffalo Milk & Fresh Curd',
    locality: 'Gachibowli, Hyderabad',
    price: '₹38', priceUnit: '/500ml',
    scope: 'Fresh buffalo milk and homemade curd from a local family dairy. No preservatives, delivered daily in glass bottles.',
    details: [
      { label: 'Fat Content', value: '6% – 7%' },
      { label: 'Packaging', value: 'Glass bottles' },
      { label: 'Provider', value: 'Sri Dairy Farm' },
    ],
    rating: 4.7, reviews: 310, jobs: 310, years: 9, verified: true, image: img('photo-1560250097-0b93528c311a'),
  },
];

function providersFor(category: string, item: string): Provider[] {
  const exact = PROVIDERS.filter((p) => p.category === category && p.service.toLowerCase() === item.toLowerCase());
  if (exact.length > 0) return exact;
  const byCategory = PROVIDERS.filter((p) => p.category === category);
  return byCategory.length > 0 ? byCategory : PROVIDERS.slice(0, 1);
}

const CATEGORY_SIDEBAR: Array<{ id: string; label: string; image: string }> = [
  { id: 'cleaning', label: 'Cleaning & Pest Control', image: img('photo-1581578731548-c64695cc6952') },
  { id: 'painting', label: 'Painting & Water proofing', image: img('photo-1562259949-e8e7689d7828') },
  { id: 'movers', label: 'Movers & Storage', image: img('photo-1600585154340-be6161a56a0c') },
  { id: 'renovation', label: 'Renovation', image: img('photo-1600607687939-ce8a6c25118c') },
  { id: 'makeup', label: 'Makeup & Styling', image: img('photo-1487412947147-5cebf100ffc2') },
  { id: 'mosquito', label: 'Mosquito & Safety Net', image: img('photo-1581092160562-40aa08e78837') },
  { id: 'village', label: 'Village Services', image: img('photo-1542838132-92c53300491e') },
  { id: 'milk', label: 'Milk & Dairy', image: img('photo-1550583724-b2692b85b150') },
  { id: 'appliances', label: 'Appliances & Repair', image: img('photo-1585659722983-3a675dabf23d') },
  { id: 'handyman', label: 'Handyman Repair', image: img('photo-1555041469-a586c61ea9bc') },
];

const CATEGORY_GROUPS: Record<string, Array<{ heading: string; items: string[] }>> = {
  cleaning: [
    { heading: 'CLEANING', items: ['Full house cleaning', 'Bathroom cleaning', 'Kitchen Cleaning', 'Sofa, Carpet & Mattress Cleaning', 'Water Tank & Sump Cleaning', 'Marble Polishing'] },
    { heading: 'PEST CONTROL', items: ['Pest control', 'Cockroach Control', 'Bed Bug Control'] },
    { heading: 'APPLIANCE REPAIR', items: ['Chimney Repair & Service', 'Gas Pipeline Installation', 'Microwave Repair & Service', 'Hob Services'] },
  ],
  painting: [
    { heading: 'PAINTING', items: ['Full home painting', 'Single wall painting', 'Texture painting', 'Waterproofing'] },
    { heading: 'WATER PROOFING', items: ['Terrace waterproofing', 'Bathroom waterproofing', 'Wall seepage treatment'] },
  ],
  movers: [
    { heading: 'MOVERS & STORAGE', items: ['Local house shifting', 'Mini truck booking', 'Packing & unpacking', 'Storage units'] },
  ],
  renovation: [
    { heading: 'RENOVATION', items: ['Kitchen renovation', 'Bathroom renovation', 'False ceiling', 'Carpentry work'] },
  ],
  makeup: [
    { heading: 'MAKEUP & STYLING', items: ['Bridal makeup', 'Party makeup', 'Hair styling', 'Manicure & pedicure'] },
  ],
  mosquito: [
    { heading: 'MOSQUITO & SAFETY NET', items: ['Window mosquito net', 'Balcony safety net', 'Children safety net'] },
  ],
  village: [
    { heading: 'LOCAL SERVICES', items: ['Carpenter', 'Tractor on rent', 'Tailor', 'Electrician', 'Milk collection', 'Tuition & coaching', 'Grocery & kirana', 'Barber', 'Veterinary doctor', 'Plumbing'] },
    { heading: 'VILLAGE MARKETPLACE', items: ['Fresh vegetables', 'Organic grains', 'Farm-fresh fruits', 'Honey & spices'] },
    { heading: 'VILLAGE UPDATES', items: ['Mandi opens new organic vegetable stall', 'Free veterinary camp on Sunday', 'New milk collection centre timing', 'Monsoon crop advisory'] },
  ],
  milk: [
    { heading: 'MILK & DAIRY', items: ['Cow Milk', 'Buffalo Milk', 'Fresh Curd', 'Paneer', 'Desi Ghee', 'Buttermilk'] },
    { heading: 'SUBSCRIPTION PLANS', items: ['Daily Delivery', 'Weekly Pack', 'Monthly Family Pack'] },
  ],
  appliances: [
    { heading: 'APPLIANCE REPAIR', items: ['Microwave Repair', 'Geyser Repair Service', 'Water Purifier Service', 'Washing Machine Repair'] },
  ],
  handyman: [
    { heading: 'HANDYMAN REPAIR', items: ['Furniture Assembly', 'TV Installation', 'Tile Grouting'] },
  ],
};

function itemEmoji(name: string): string {
  const n = name.toLowerCase();
  if (/bathroom|toilet/.test(n)) return '🚽';
  if (/kitchen/.test(n)) return '🚰';
  if (/sofa|carpet|mattress/.test(n)) return '🛋️';
  if (/water tank|sump/.test(n)) return '🛢️';
  if (/marble|polish/.test(n)) return '✨';
  if (/cockroach|bed bug|pest/.test(n)) return '🛡️';
  if (/chimney/.test(n)) return '🏭';
  if (/gas/.test(n)) return '🔧';
  if (/microwave/.test(n)) return '🍲';
  if (/hob/.test(n)) return '🔥';
  if (/clean/.test(n)) return '🧹';
  if (/paint/.test(n)) return '🎨';
  if (/waterproof|seepage|seal/.test(n)) return '💧';
  if (/packing|unpacking/.test(n)) return '📦';
  if (/truck|shifting/.test(n)) return '🚚';
  if (/storage/.test(n)) return '🏬';
  if (/ceiling/.test(n)) return '🪟';
  if (/carpentry/.test(n)) return '🪚';
  if (/renovation/.test(n)) return '🏠';
  if (/bridal|party|makeup/.test(n)) return '💄';
  if (/hair|styling/.test(n)) return '💇';
  if (/manicure|pedicure/.test(n)) return '💅';
  if (/mosquito/.test(n)) return '🦟';
  if (/safety|children/.test(n)) return '🛡️';
  return '🔧';
}

/* ------------------------------- Sub-views ------------------------------- */

function SearchBar({
  value,
  onChange,
  onSubmit,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
}) {
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
      className="flex items-stretch overflow-hidden rounded-xl border border-[#3b82f6] bg-white"
    >
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="What service do you need?"
        className="min-w-0 flex-1 bg-transparent px-4 py-3.5 text-[15px] outline-none placeholder:text-[#94a3b8]"
      />
      <button type="submit" aria-label="Search" className="flex w-16 shrink-0 items-center justify-center bg-[#3b82f6] text-white">
        <Search className="h-6 w-6" aria-hidden="true" />
      </button>
    </form>
  );
}

function CategoryGrid({ onOpen }: { onOpen: (id: string) => void }) {
  return (
    <div className="grid grid-cols-3 gap-x-3 gap-y-5">
      {CATEGORY_TILES.map((tile) => (
        <button key={tile.id} type="button" onClick={() => onOpen(tile.id)} className="flex flex-col items-center gap-2 text-center">
          {tile.id === 'need-helper' ? (
            <span className="relative flex h-[74px] w-[74px] items-center justify-center rounded-2xl bg-gradient-to-br from-[#f97316] to-[#7c3aed] text-[34px] shadow-md shadow-[#7c3aed]/25">
              🧑‍🔧
              <span className="absolute -right-1 -top-1 rounded-full bg-[#22c55e] px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide text-white">
                New
              </span>
            </span>
          ) : (
            <span className="flex h-[74px] w-[74px] items-center justify-center rounded-2xl bg-[#f4f5f7] text-[34px] shadow-sm">
              {tile.id === 'more' ? <LayoutGrid className="h-8 w-8 text-[#64748b]" aria-hidden="true" /> : tile.emoji}
            </span>
          )}
          <span className={`text-[13px] font-medium leading-[1.25] ${tile.id === 'need-helper' ? 'font-bold text-[#7c3aed]' : 'text-[#1f2937]'}`}>{tile.label}</span>
        </button>
      ))}
    </div>
  );
}

function BannerCarousel({ index, setIndex }: { index: number; setIndex: (i: number) => void }) {
  const banner = BANNERS[index];
  return (
    <div>
      <div className="relative overflow-hidden rounded-2xl">
        <SafeImage category="services" src={banner.image} alt={banner.title} className="aspect-[16/9] w-full object-cover" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0'; }} />
        <div className="absolute inset-0 bg-gradient-to-r from-black/45 via-black/10 to-transparent" />
        <div className="absolute inset-0 flex flex-col items-start justify-center gap-2 p-5">
          <h3 className="max-w-[60%] text-[22px] font-extrabold leading-[1.1] text-white drop-shadow">{banner.title}</h3>
          <span className="rounded bg-white/25 px-2 py-1 text-[11px] font-semibold text-white backdrop-blur">{banner.pill}</span>
          <button type="button" className="mt-1 rounded-md bg-white px-4 py-2 text-[13px] font-bold text-[#111827] shadow">
            Book Now
          </button>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-center gap-2">
        {BANNERS.map((b, i) => (
          <button
            key={b.id}
            type="button"
            aria-label={`Go to banner ${i + 1}`}
            onClick={() => setIndex(i)}
            className={`h-2.5 w-2.5 rounded-full transition ${i === index ? 'bg-[#3b82f6]' : 'bg-[#cbd5e1]'}`}
          />
        ))}
      </div>
    </div>
  );
}

function ServiceCard({ item }: { item: ServiceItem }) {
  return (
    <button type="button" className="w-[132px] shrink-0 text-left">
      <div className="relative overflow-hidden rounded-xl bg-[#f4f5f7]">
        <SafeImage category="services" src={item.image} alt={item.name} className="aspect-square w-full object-cover" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0'; }} />
        {item.off && (
          <span className="absolute right-1 top-1 rounded bg-[#16a34a] px-1.5 py-0.5 text-[10px] font-bold text-white">{item.off}</span>
        )}
      </div>
      <p className="mt-2 text-[13px] font-medium leading-4 text-[#1f2937]">{item.name}</p>
      {item.price && <p className="mt-1 text-[13px] font-bold text-[#111827]">{item.price}</p>}
    </button>
  );
}

function SectionRow({ section, onSeeAll }: { section: ServiceSection; onSeeAll: () => void }) {
  return (
    <section>
      <div className="flex items-center justify-between">
        <h2 className="text-[18px] font-bold text-[#111827]">{section.title}</h2>
        <button type="button" onClick={onSeeAll} className="rounded-md border border-[#3b82f6] px-3 py-1.5 text-[13px] font-semibold text-[#3b82f6]">
          See All
        </button>
      </div>
      <div className="-mx-4 mt-3 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {section.items.map((item) => (
          <ServiceCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}

/* ------------------------------ Categories view ------------------------------ */

function CategoriesView({
  activeId,
  onActiveId,
  onBack,
  onSelectItem,
}: {
  activeId: string;
  onActiveId: (id: string) => void;
  onBack: () => void;
  onSelectItem: (item: string) => void;
}) {
  const groups = CATEGORY_GROUPS[activeId] ?? CATEGORY_GROUPS.cleaning;
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-[#e5e7eb] bg-white px-4 py-3">
        <button type="button" onClick={onBack} aria-label="Back" className="inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-[#f3f4f6]">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-[18px] font-bold">Categories</h1>
      </header>

      <div className="flex flex-1">
        <aside className="w-[116px] shrink-0 overflow-y-auto border-r border-[#e5e7eb] bg-[#fafafa]">
          {CATEGORY_SIDEBAR.map((cat) => {
            const active = cat.id === activeId;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => onActiveId(cat.id)}
                className={`flex w-full flex-col items-center gap-1 border-b border-[#ececec] px-2 py-3 text-center ${active ? 'bg-white' : ''}`}
              >
                <SafeImage category="services" src={cat.image} alt={cat.label} className="h-12 w-12 rounded-lg object-cover" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0'; }} />
                <span className={`text-[11.5px] leading-4 ${active ? 'font-bold text-[#111827]' : 'text-[#475569]'}`}>{cat.label}</span>
              </button>
            );
          })}
        </aside>

        <div className="min-w-0 flex-1 overflow-y-auto bg-white px-3 py-4">
          {groups.map((group) => (
            <section key={group.heading} className="mb-6">
              <h2 className="mb-3 text-[14px] font-extrabold uppercase tracking-wide text-[#111827]">{group.heading}</h2>
              <div className="grid grid-cols-3 gap-x-2 gap-y-4">
                {group.items.map((item) => (
                  <button key={item} type="button" onClick={() => onSelectItem(item)} className="flex flex-col items-center gap-1.5 text-center">
                    <span className="flex h-[62px] w-full items-center justify-center rounded-xl bg-[#f4f5f7] text-[26px]">
                      {itemEmoji(item)}
                    </span>
                    <span className="text-[11.5px] leading-4 text-[#1f2937]">{item}</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Provider list view ------------------------------ */

function ProviderListView({
  category,
  item,
  onBack,
  onSelectProvider,
}: {
  category: string;
  item: string;
  onBack: () => void;
  onSelectProvider: (p: Provider) => void;
}) {
  const list = providersFor(category, item);
  const categoryLabel = CATEGORY_SIDEBAR.find((c) => c.id === category)?.label ?? category;
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-[#e5e7eb] bg-white px-4 py-3">
        <button type="button" onClick={onBack} aria-label="Back" className="inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-[#f3f4f6]">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-[17px] font-bold">{item}</h1>
          <p className="truncate text-[11px] text-[#64748b]">{categoryLabel}</p>
        </div>
      </header>

      <div className="px-4 py-4">
        <p className="text-[12px] text-[#64748b]">{list.length} verified provider{list.length === 1 ? '' : 's'} available</p>
        <div className="mt-3 space-y-3">
          {list.map((p) => (
            <article key={p.id} className="rounded-2xl border border-[#e5e7eb] p-3">
              <div className="flex gap-3">
                <SafeImage category="services" src={p.image} alt={p.name} className="h-16 w-16 shrink-0 rounded-xl object-cover" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0'; }} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="truncate text-[14px] font-bold">{p.name}</h2>
                      <p className="truncate text-[11.5px] text-[#64748b]">{p.service}</p>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-[#16a34a] px-1.5 py-0.5 text-[11px] font-bold text-white">
                      <Star className="h-3 w-3 fill-white" /> {p.rating.toFixed(1)}
                    </span>
                  </div>
                  <p className="mt-1 text-[11.5px] text-[#64748b]">{p.jobs} jobs · {p.years} yrs experience</p>
                  <div className="mt-1.5 flex items-center justify-between">
                    <span className="text-[13px] font-extrabold text-[#111827]">{p.price}</span>
                    {p.verified && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                        <ShieldCheck className="h-3 w-3" /> Verified
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-2.5 flex gap-2">
                <button type="button" onClick={() => onSelectProvider(p)} className="flex-1 rounded-lg bg-[#3b82f6] py-2 text-[12.5px] font-semibold text-white">View details</button>
                <button type="button" className="rounded-lg border border-[#3b82f6] px-3 py-2 text-[12.5px] font-semibold text-[#3b82f6]">Call</button>
              </div>
            </article>
          ))}
        </div>
        <p className="mt-4 rounded-xl bg-amber-50 p-3 text-[11px] leading-4 text-amber-800">
          Sample preview — providers, prices and ratings are simulated for demonstration only.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------ Provider detail view ------------------------------ */

function ProviderDetailView({ provider, onBack }: { provider: Provider; onBack: () => void }) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-[#e5e7eb] bg-white px-4 py-3">
        <button type="button" onClick={onBack} aria-label="Back" className="inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-[#f3f4f6]">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-[17px] font-bold">Provider details</h1>
      </header>

      <div className="px-4 pb-10 pt-4">
        <SafeImage category="services" src={provider.image} alt={provider.name} className="aspect-[16/10] w-full rounded-2xl object-cover" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0'; }} />

        <p className="mt-4 text-[11px] font-bold tracking-[0.02em] text-[#3b82f6]">{provider.categoryLabel}</p>
        <h2 className="mt-1.5 text-[19px] font-extrabold leading-[1.2]">{provider.title}</h2>
        <p className="mt-1.5 flex items-center gap-1 text-[12.5px] text-[#64748b]">
          <MapPin className="h-3.5 w-3.5" aria-hidden="true" /> {provider.locality}
        </p>
        <div className="mt-3 flex items-baseline justify-between gap-3">
          <p className="text-[19px] font-extrabold text-[#111827]">
            {provider.price}<span className="text-[12px] font-semibold text-[#64748b]"> {provider.priceUnit}</span>
          </p>
          <p className="text-[11px] font-semibold text-[#64748b]">Listed by the provider</p>
        </div>

        <section className="mt-5 border-t border-[#e5e7eb] pt-4">
          <h3 className="text-[15px] font-extrabold">Scope of work</h3>
          <p className="mt-1.5 text-[13px] leading-6 text-[#4b5563]">{provider.scope}</p>
        </section>

        <section className="mt-5 border-t border-[#e5e7eb] pt-4">
          <h3 className="mb-2 text-[15px] font-extrabold">Listed details</h3>
          <dl className="grid gap-2.5 sm:grid-cols-2">
            {provider.details.map((row) => (
              <div key={row.label} className="rounded-xl border border-[#e5e7eb] p-2.5">
                <dt className="text-[11px] font-semibold text-[#64748b]">{row.label}</dt>
                <dd className="mt-0.5 text-[13px] leading-5">{row.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mt-5 border-t border-[#e5e7eb] pt-4">
          <h3 className="mb-1.5 text-[15px] font-extrabold">Provider</h3>
          <p className="text-[13px] font-semibold">{provider.name}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-[#64748b]">
            {provider.verified && (
              <span className="inline-flex items-center gap-1 font-bold text-[#2563eb]">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> Verified provider
              </span>
            )}
            <span className="inline-flex items-center gap-1 font-semibold text-[#334155]">
              <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" aria-hidden="true" /> {provider.rating.toFixed(1)} from {provider.reviews} reviews
            </span>
          </div>
          <div className="mt-3.5 flex flex-wrap gap-2">
            <button type="button" className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[#3b82f6] px-4 text-[13px] font-bold text-white">
              <Phone className="h-4 w-4" aria-hidden="true" /> Call provider
            </button>
            <button type="button" className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[#3b82f6] px-4 text-[13px] font-bold text-[#2563eb]">
              <MessageCircle className="h-4 w-4" aria-hidden="true" /> Message on WhatsApp
            </button>
          </div>
          <p className="mt-3 text-[11px] leading-5 text-[#64748b]">Provider contact is unavailable until this service is enabled.</p>
          <p className="mt-3 rounded-xl border border-[#e5e7eb] p-3 text-[11px] leading-5 text-[#64748b]">
            Booking and payment are disabled for home services. Agree timing, scope and price with the provider; BookOurSpace does not take payment here.
          </p>
        </section>
      </div>
    </div>
  );
}

/* --------------------------------- Main --------------------------------- */

export function HomeTriangleExperience({ onClose, onSwitchToOld, inline = false }: HomeTriangleExperienceProps) {
  const [bottomTab, setBottomTab] = useState<'home' | 'orders' | 'account'>('home');
  const [view, setView] = useState<'home' | 'categories'>('home');
  const [query, setQuery] = useState('');
  const [bannerIndex, setBannerIndex] = useState(0);
  const [activeCategory, setActiveCategory] = useState('cleaning');
  const [selectedSub, setSelectedSub] = useState<{ category: string; item: string } | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [helperJourneyOpen, setHelperJourneyOpen] = useState(false);

  // Auto-advance the banner carousel.
  useEffect(() => {
    const timer = window.setInterval(() => setBannerIndex((i) => (i + 1) % BANNERS.length), 4000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (selectedProvider) setSelectedProvider(null);
      else if (selectedSub) setSelectedSub(null);
      else if (view === 'categories') setView('home');
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, view, selectedSub, selectedProvider]);

  const filteredSections = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SERVICE_SECTIONS;
    return SERVICE_SECTIONS
      .map((section) => ({ ...section, items: section.items.filter((item) => item.name.toLowerCase().includes(q)) }))
      .filter((section) => section.items.length > 0);
  }, [query]);

  const openCategory = (id: string) => {
    if (id === 'need-helper') {
      setHelperJourneyOpen(true);
      return;
    }
    if (id === 'more') {
      setView('categories');
      return;
    }
    setView('categories');
    if (CATEGORY_GROUPS[id]) setActiveCategory(id);
  };

  if (helperJourneyOpen) {
    return <HelperJourney inline={inline} onClose={() => setHelperJourneyOpen(false)} />;
  }

  return (
    <div
      className={
        inline
          ? 'w-full bg-white text-[#1f2937]'
          : 'fixed inset-0 z-[71] flex flex-col bg-white text-[#1f2937]'
      }
      role={inline ? undefined : 'dialog'}
      aria-modal={inline ? undefined : true}
      aria-label="Services app"
    >
      {inline ? (
        <div className="border-b border-[#e5e7eb] bg-white">
          <div className="mx-auto flex h-12 max-w-[640px] items-center gap-2 px-4">
            <button
              type="button"
              onClick={onClose}
              aria-label="Back to all sections"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#e5e7eb] text-[#374151] transition hover:bg-[#eff6ff]"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <span className="text-[15px] font-black text-[#1d4ed8]">Services</span>
            <span className="ml-auto rounded-full bg-[#eff6ff] px-3 py-1 text-[10.5px] font-bold uppercase tracking-[0.12em] text-[#1d4ed8]">
              BookOurSpace Services 2
            </span>
          </div>
        </div>
      ) : (
        <div className="flex shrink-0 items-center justify-center border-b border-[#ebebeb] bg-[#f7f7f7] px-4 py-2">
          <div className="inline-flex items-center rounded-full border border-[#dddddd] bg-white p-1 shadow-sm">
            <button type="button" onClick={onSwitchToOld} className="inline-flex h-9 items-center rounded-full px-4 text-sm font-semibold text-[#717171] transition hover:bg-[#f7f7f7]">
              BookOurSpace Services 1
            </button>
            <button type="button" className="inline-flex h-9 items-center rounded-full bg-[#3b82f6] px-4 text-sm font-semibold text-white transition">
              BookOurSpace Services 2
            </button>
          </div>
        </div>
      )}
      <div className="mx-auto flex min-h-0 w-full max-w-[640px] flex-1 flex-col">
        {/* Search header */}
        <div className="shrink-0 border-b border-[#f1f5f9] bg-white px-4 pb-3 pt-3">
          <SearchBar value={query} onChange={setQuery} onSubmit={() => { setView('home'); setBottomTab('home'); }} />
        </div>

        {/* Content */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {bottomTab === 'home' && view === 'home' && (
            <div className="px-4 pb-8 pt-4">
              <CategoryGrid onOpen={openCategory} />

              <div className="mt-6">
                <BannerCarousel index={bannerIndex} setIndex={setBannerIndex} />
              </div>

              <div className="mt-7">
                <h2 className="text-[18px] font-bold text-[#111827]">Most Booked Services</h2>
                <div className="-mx-4 mt-3 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {MOST_BOOKED.map((item) => (
                    <ServiceCard key={item.id} item={item} />
                  ))}
                </div>
              </div>

              <div className="mt-7 space-y-7">
                {filteredSections.map((section) => (
                  <SectionRow
                    key={section.id}
                    section={section}
                    onSeeAll={() => { setView('categories'); setActiveCategory(section.id); setSelectedSub(null); }}
                  />
                ))}
                {filteredSections.length === 0 && (
                  <p className="py-10 text-center text-sm text-[#64748b]">No services match “{query}”.</p>
                )}
              </div>

              {/* Village Services (MyVilej) */}
              <div className="mt-7">
                <div className="flex items-center justify-between">
                  <h2 className="text-[18px] font-bold text-[#111827]">Village Services</h2>
                  <button type="button" onClick={() => { setView('categories'); setActiveCategory('village'); }} className="rounded-md border border-[#3b82f6] px-3 py-1.5 text-[13px] font-semibold text-[#3b82f6]">See All</button>
                </div>
                <div className="-mx-4 mt-3 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {VILLAGE_SERVICES.map((item) => (
                    <button key={item.id} type="button" className="flex w-[92px] shrink-0 flex-col items-center gap-1.5 rounded-xl border border-[#e5e7eb] bg-white p-2.5 text-center">
                      <span className="text-[28px]" aria-hidden="true">{item.emoji}</span>
                      <span className="text-[11px] font-medium leading-[14px] text-[#1f2937]">{item.label}</span>
                    </button>
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {VILLAGE_MARKETPLACE.map((item) => (
                    <div key={item.id} className="flex items-center gap-2 rounded-xl border border-[#e5e7eb] p-2">
                      <SafeImage category="services" src={item.image} alt={item.name} className="h-10 w-10 rounded-lg object-cover" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0'; }} />
                      <div className="min-w-0">
                        <p className="truncate text-[12px] font-semibold">{item.name}</p>
                        <p className="text-[11px] text-[#64748b]">{item.price}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 space-y-2">
                  {VILLAGE_NEWS.map((n) => (
                    <div key={n.id} className="flex items-center gap-2 rounded-xl border border-[#e5e7eb] p-2.5">
                      <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">{n.tag}</span>
                      <p className="min-w-0 flex-1 truncate text-[12px] font-medium text-[#1f2937]">{n.headline}</p>
                      <span className="shrink-0 text-[10px] text-[#94a3b8]">{n.date}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Milk & Dairy (LocalMilk) */}
              <div className="mt-7">
                <div className="flex items-center justify-between">
                  <h2 className="text-[18px] font-bold text-[#111827]">Milk & Dairy Delivery</h2>
                  <button type="button" onClick={() => { setView('categories'); setActiveCategory('milk'); }} className="rounded-md border border-[#3b82f6] px-3 py-1.5 text-[13px] font-semibold text-[#3b82f6]">See All</button>
                </div>
                <div className="-mx-4 mt-3 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {MILK_PRODUCTS.map((item) => (
                    <ServiceCard key={item.id} item={item} />
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {MILK_PLANS.map((plan) => (
                    <div key={plan.id} className={`rounded-xl border p-2.5 ${plan.popular ? 'border-[#3b82f6] ring-1 ring-[#3b82f6]/30' : 'border-[#e5e7eb]'}`}>
                      <p className="text-[11.5px] font-bold leading-4">{plan.name}</p>
                      <p className="mt-0.5 text-[10px] leading-3.5 text-[#64748b]">{plan.detail}</p>
                      <p className="mt-1 text-[13px] font-extrabold text-[#3b82f6]">{plan.price}</p>
                      <p className="text-[9.5px] font-semibold text-emerald-600">{plan.save}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {bottomTab === 'home' && view === 'categories' && (
            selectedProvider ? (
              <ProviderDetailView provider={selectedProvider} onBack={() => setSelectedProvider(null)} />
            ) : selectedSub ? (
              <ProviderListView
                category={selectedSub.category}
                item={selectedSub.item}
                onBack={() => setSelectedSub(null)}
                onSelectProvider={(p) => setSelectedProvider(p)}
              />
            ) : (
              <CategoriesView
                activeId={activeCategory}
                onActiveId={(id) => { setActiveCategory(id); setSelectedSub(null); setSelectedProvider(null); }}
                onBack={() => { setView('home'); setSelectedProvider(null); }}
                onSelectItem={(item) => { setSelectedSub({ category: activeCategory, item }); setSelectedProvider(null); }}
              />
            )
          )}

          {bottomTab === 'orders' && (
            <div className="flex flex-col items-center justify-center gap-3 px-6 py-24 text-center">
              <ClipboardList className="h-12 w-12 text-[#94a3b8]" aria-hidden="true" />
              <h2 className="text-lg font-bold">My Orders</h2>
              <p className="max-w-xs text-sm text-[#64748b]">You have no orders yet. Book a service to see it here — this sample preview does not create real orders.</p>
            </div>
          )}

          {bottomTab === 'account' && (
            <div className="flex flex-col items-center justify-center gap-3 px-6 py-24 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#f1f5f9]">
                <User className="h-8 w-8 text-[#64748b]" aria-hidden="true" />
              </span>
              <h2 className="text-lg font-bold">Account</h2>
              <p className="max-w-xs text-sm text-[#64748b]">Sign in to manage your profile, addresses and bookings. This is a demo preview.</p>
            </div>
          )}
        </div>

        {/* Bottom nav */}
        {!inline && (
        <nav className="shrink-0 border-t border-[#e5e7eb] bg-white" aria-label="Bottom navigation">
          <div className="grid grid-cols-3">
            {[
              { id: 'home', label: 'Home', icon: Home },
              { id: 'orders', label: 'My Orders', icon: ClipboardList },
              { id: 'account', label: 'Account', icon: User },
            ].map((tab) => {
              const Icon = tab.icon;
              const active = bottomTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => { setBottomTab(tab.id as 'home' | 'orders' | 'account'); if (tab.id === 'home') setView('home'); }}
                  className="flex flex-col items-center gap-1 py-2.5"
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon className={`h-6 w-6 ${active ? 'text-[#3b82f6]' : 'text-[#94a3b8]'}`} aria-hidden="true" />
                  <span className={`text-[12px] font-medium ${active ? 'text-[#3b82f6]' : 'text-[#94a3b8]'}`}>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
        )}
      </div>
    </div>
  );
}
