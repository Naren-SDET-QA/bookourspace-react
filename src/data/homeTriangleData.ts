// HomeTriangle-style preview + MyVilej (village services) + LocalMilk (dairy) extras.
// Fully hardcoded, image-only. No database writes — every image is a CDN URL.

const img = (id: string, w = 1000): string =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=80`;

export interface TriangleCategory {
  id: string;
  label: string;
  tagline: string;
  image: string;
}

export interface TrianglePro {
  id: string;
  name: string;
  service: string;
  rating: number;
  jobs: number;
  years: number;
  verified: boolean;
  visitCharge: number;
  image: string;
}

export interface VillageService {
  id: string;
  label: string;
  emoji: string;
}

export interface MarketplaceItem {
  id: string;
  label: string;
  price: string;
  unit: string;
  image: string;
}

export interface VillageNews {
  id: string;
  headline: string;
  date: string;
  tag: string;
}

export interface MilkProduct {
  id: string;
  name: string;
  qty: string;
  price: number;
  image: string;
  popular?: boolean;
}

export interface MilkPlan {
  id: string;
  name: string;
  detail: string;
  price: number;
  save: string;
  popular?: boolean;
}

/* ------------------------------ HomeTriangle ------------------------------ */

export const homeTriangleCategories: TriangleCategory[] = [
  { id: 'plumber-carpenter-electrician', label: 'Plumber, Carpenter & Electrician', tagline: 'Fixing, fitting & wiring', image: img('photo-1585128792020-803d29415281') },
  { id: 'ac-appliance', label: 'AC & Appliance Repair', tagline: 'Cooling & servicing', image: img('photo-1621905251189-08b45d6a269e') },
  { id: 'cleaning-pest', label: 'Cleaning & Pest Control', tagline: 'Deep clean & protection', image: img('photo-1581578731548-c64695cc6952') },
  { id: 'painting-waterproofing', label: 'Painting & Water proofing', tagline: 'Walls that last', image: img('photo-1585704032915-c3400ca199e7') },
  { id: 'movers-storage', label: 'Movers & Storage', tagline: 'Packing & relocation', image: img('photo-1600585154340-be6161a56a0c') },
  { id: 'renovation-fabrication', label: 'Renovation & Fabrication', tagline: 'Remodel & fabricate', image: img('photo-1503387762-592deb58ef4e') },
  { id: 'waterscience', label: 'Waterscience', tagline: 'Water filters & softening', image: img('photo-1621905252507-b35492cc74b4') },
  { id: 'mosquito-net', label: 'Mosquito & Safety Net', tagline: 'Nets & child safety', image: img('photo-1585128792020-803d29415281') },
];

export const homeTrianglePros: TrianglePro[] = [
  { id: 'pro-1', name: 'Ramesh Kumar', service: 'Plumber', rating: 4.8, jobs: 1240, years: 9, verified: true, visitCharge: 149, image: img('photo-1507003211169-0a1dd7228f2d') },
  { id: 'pro-2', name: 'Suresh Yadav', service: 'Electrician', rating: 4.9, jobs: 980, years: 7, verified: true, visitCharge: 199, image: img('photo-1472099645785-5658abf4ff4e') },
  { id: 'pro-3', name: 'Priya Sharma', service: 'Deep Cleaning', rating: 4.9, jobs: 2100, years: 6, verified: true, visitCharge: 299, image: img('photo-1573496359142-b8d87734a5a2') },
  { id: 'pro-4', name: 'Amit Verma', service: 'AC & Appliance Repair', rating: 4.7, jobs: 1560, years: 8, verified: true, visitCharge: 249, image: img('photo-1560250097-0b93528c311a') },
  { id: 'pro-5', name: 'Neha Gupta', service: 'Painter', rating: 4.8, jobs: 870, years: 5, verified: true, visitCharge: 199, image: img('photo-1580489944761-15a19d654956') },
  { id: 'pro-6', name: 'Vikram Singh', service: 'Interior Designer', rating: 4.9, jobs: 640, years: 11, verified: true, visitCharge: 499, image: img('photo-1506794778202-cad84cf45f1d') },
];

/* ------------------------------ MyVilej (village) ------------------------------ */

export const villageServices: VillageService[] = [
  { id: 'vs-1', label: 'Carpenter', emoji: '🪚' },
  { id: 'vs-2', label: 'Tractor on rent', emoji: '🚜' },
  { id: 'vs-3', label: 'Tailor', emoji: '🧵' },
  { id: 'vs-4', label: 'Electrician', emoji: '💡' },
  { id: 'vs-5', label: 'Milk collection', emoji: '🥛' },
  { id: 'vs-6', label: 'Tuition & coaching', emoji: '📚' },
  { id: 'vs-7', label: 'Grocery & kirana', emoji: '🛒' },
  { id: 'vs-8', label: 'Barber', emoji: '💈' },
  { id: 'vs-9', label: 'Veterinary doctor', emoji: '🐄' },
  { id: 'vs-10', label: 'Plumbing', emoji: '🔧' },
];

export const villageMarketplace: MarketplaceItem[] = [
  { id: 'vm-1', label: 'Fresh vegetables', price: '₹40', unit: 'per kg', image: img('photo-1542838132-92c53300491e') },
  { id: 'vm-2', label: 'Organic grains', price: '₹80', unit: 'per kg', image: img('photo-1557844352-761f2565b576') },
  { id: 'vm-3', label: 'Farm-fresh fruits', price: '₹60', unit: 'per kg', image: img('photo-1540420773420-3366772f4999') },
  { id: 'vm-4', label: 'Honey & spices', price: '₹350', unit: 'per jar', image: img('photo-1488459716781-31db52582fe9') },
];

export const villageNews: VillageNews[] = [
  { id: 'vn-1', headline: 'Mandi opens new organic vegetable stall this week', date: 'Today', tag: 'Market' },
  { id: 'vn-2', headline: 'Free veterinary camp at the panchayat ground on Sunday', date: '2 days ago', tag: 'Health' },
  { id: 'vn-3', headline: 'New milk collection centre timing: 6 AM – 9 AM', date: '3 days ago', tag: 'Dairy' },
  { id: 'vn-4', headline: 'Monsoon crop advisory for paddy & pulses farmers', date: '5 days ago', tag: 'Farming' },
];

/* ------------------------------ LocalMilk (dairy) ------------------------------ */

export const milkProducts: MilkProduct[] = [
  { id: 'mp-1', name: 'Cow Milk', qty: '500 ml', price: 32, image: img('photo-1550583724-b2692b85b150'), popular: true },
  { id: 'mp-2', name: 'Buffalo Milk', qty: '500 ml', price: 38, image: img('photo-1563636619-e9143da7973b') },
  { id: 'mp-3', name: 'Fresh Curd', qty: '200 g', price: 25, image: img('photo-1628088062854-d1870b4553da') },
  { id: 'mp-4', name: 'Paneer', qty: '200 g', price: 95, image: img('photo-1628088062854-d1870b4553da') },
  { id: 'mp-5', name: 'Desi Ghee', qty: '250 ml', price: 320, image: img('photo-1474979266404-7eaacbcd87c5') },
  { id: 'mp-6', name: 'Buttermilk', qty: '500 ml', price: 20, image: img('photo-1563636619-e9143da7973b') },
];

export const milkPlans: MilkPlan[] = [
  { id: 'pl-1', name: 'Daily Delivery', detail: '1 litre cow milk every morning', price: 64, save: 'Pay as you go' },
  { id: 'pl-2', name: 'Weekly Pack', detail: '7 days · 1 litre/day', price: 420, save: 'Save ₹28', popular: true },
  { id: 'pl-3', name: 'Monthly Family Pack', detail: '30 days · 2 litres/day', price: 3480, save: 'Save ₹360' },
];

export function formatINR(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
}
