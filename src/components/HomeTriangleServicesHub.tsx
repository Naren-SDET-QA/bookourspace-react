import React, { useState, useMemo } from 'react';
import {
  Search,
  MapPin,
  Star,
  Check,
  Phone,
  Calendar,
  ShieldCheck,
  Clock,
  ArrowRight,
  SlidersHorizontal,
  X,
  MessageSquare,
  Plus,
  Wrench,
  FileText,
  Sparkles,
  ChevronRight,
  Tv,
  Hammer,
  Zap,
  Droplets,
  Paintbrush,
  Scissors,
  Truck,
  Camera,
  LayoutGrid,
  ArrowLeft,
  Home,
  ShoppingBag,
  User,
} from 'lucide-react';
import { MarketplaceListing } from '../types/marketplace';
import { servicesCategories } from '../data/servicesStayMoviesData';
import { initialRuralServices } from '../data/formerLocalServicesData';
import { AppLanguage } from '../utils/translations';
import { playAlertChime } from '../utils/audio';
import SafeImage from './SafeImage';

export const renderCategoryVectorIcon = (catId: string, isSelected: boolean = false) => {
  switch (catId) {
    case 'cat-4':
      return <Tv className={`w-5 h-5 ${isSelected ? 'text-blue-600' : 'text-blue-600'}`} />;
    case 'cat-5':
      return <Hammer className={`w-5 h-5 ${isSelected ? 'text-amber-600' : 'text-amber-600'}`} />;
    case 'cat-1':
      return <Sparkles className={`w-5 h-5 ${isSelected ? 'text-emerald-600' : 'text-emerald-600'}`} />;
    case 'cat-2':
      return <Zap className={`w-5 h-5 ${isSelected ? 'text-amber-500' : 'text-amber-500'}`} />;
    case 'cat-3':
      return <Droplets className={`w-5 h-5 ${isSelected ? 'text-sky-600' : 'text-sky-600'}`} />;
    case 'cat-6':
      return <Paintbrush className={`w-5 h-5 ${isSelected ? 'text-purple-600' : 'text-purple-600'}`} />;
    case 'srv-salon':
      return <Scissors className={`w-5 h-5 ${isSelected ? 'text-rose-600' : 'text-rose-600'}`} />;
    case 'srv-packers':
      return <Truck className={`w-5 h-5 ${isSelected ? 'text-orange-600' : 'text-orange-600'}`} />;
    case 'srv-pest':
      return <ShieldCheck className={`w-5 h-5 ${isSelected ? 'text-emerald-700' : 'text-emerald-700'}`} />;
    case 'srv-cctv':
      return <Camera className={`w-5 h-5 ${isSelected ? 'text-indigo-600' : 'text-indigo-600'}`} />;
    default:
      return <LayoutGrid className={`w-5 h-5 ${isSelected ? 'text-teal-600' : 'text-teal-600'}`} />;
  }
};

interface HomeTriangleServicesHubProps {
  currentLang: AppLanguage;
  listings: MarketplaceListing[];
  selectedCategory: string;
  selectedSubcategory: string;
  selectedArea: string;
  onSelectCategory: (catId: string) => void;
  onSelectSubcategory: (subcat: string) => void;
  onSelectArea: (area: string) => void;
  onSelectListing: (listing: MarketplaceListing) => void;
  onBookListing: (listing: MarketplaceListing) => void;
  onEnquireListing: (listing: MarketplaceListing) => void;
  onCallNumber?: (phone: string, name: string) => void;
  onPostService?: () => void;
}

interface SubServiceRateItem {
  catId: string;
  catName: string;
  catNameTe: string;
  catEmoji: string;
  subEn: string;
  subTe: string;
  subHi: string;
  startingPrice: number;
  unitLabel: string;
  duration: string;
  warranty: string;
  scopePoints: string[];
  matchedListing?: MarketplaceListing;
  iconUrl?: string;
  sectionGroup?: string;
}

const SUB_SERVICE_PRICE_MAP: Record<
  string,
  { price: number; unit: string; duration: string; warranty: string; scope: string[] }
> = {
  AC: {
    price: 499,
    unit: 'per AC unit',
    duration: '45–60 mins',
    warranty: '60-Day Service Warranty',
    scope: ['Foam-jet indoor coil wash', 'Gas pressure & cooling check', 'Drain pipe flush & filter clean'],
  },
  Refrigerator: {
    price: 399,
    unit: 'per inspection / service',
    duration: '45 mins',
    warranty: '60-Day Spare Warranty',
    scope: ['Compressor & relay testing', 'Thermostat & defrost check', 'Door gasket & cooling optimization'],
  },
  'Washing machine': {
    price: 449,
    unit: 'per service',
    duration: '60 mins',
    warranty: '60-Day Service Warranty',
    scope: ['Drum descaling & spin check', 'Inlet valve & drain pump cleaning', 'PCB & motor diagnostics'],
  },
  Television: {
    price: 349,
    unit: 'per visit',
    duration: '45 mins',
    warranty: '30-Day Repair Warranty',
    scope: ['LED/OLED backlight & panel check', 'Wall-mount bracket installation', 'Motherboard & port diagnostics'],
  },
  Geyser: {
    price: 399,
    unit: 'per service',
    duration: '45 mins',
    warranty: '60-Day Warranty',
    scope: ['Heating element descaling', 'Thermostat safety check', 'Anode rod & pressure valve inspection'],
  },
  'Water purifier repair': {
    price: 449,
    unit: 'per RO service',
    duration: '40 mins',
    warranty: '90-Day Filter Warranty',
    scope: ['TDS calibration & membrane flush', 'Sediment & carbon filter check', 'Leakage & booster pump check'],
  },
  Microwave: {
    price: 349,
    unit: 'per repair visit',
    duration: '40 mins',
    warranty: '45-Day Warranty',
    scope: ['Magnetron & heating test', 'Touchpad & turntable repair', 'High-voltage fuse replacement'],
  },
  Carpenter: {
    price: 399,
    unit: 'per visit',
    duration: '60 mins',
    warranty: '30-Day Workmanship Warranty',
    scope: ['General woodwork & hinge fixing', 'Window & door alignment', 'On-site measurement & estimate'],
  },
  'Cupboard installation': {
    price: 650,
    unit: 'per sq.ft / unit',
    duration: 'Custom timeline',
    warranty: '1-Year Hardware Warranty',
    scope: ['Modular wardrobe & loft work', 'Soft-close channels & hinges', 'BWP marine plywood / HDHMR options'],
  },
  'Door repair': {
    price: 299,
    unit: 'per door',
    duration: '30–45 mins',
    warranty: '30-Day Warranty',
    scope: ['Mortise lock & latch replacement', 'Hydraulic door closer fitting', 'Door planing & stopper installation'],
  },
  'Furniture repair': {
    price: 499,
    unit: 'per item',
    duration: '60–90 mins',
    warranty: '60-Day Warranty',
    scope: ['Sofa frame & spring strengthening', 'Hydraulic bed lift repair', 'Dining table & chair structural fix'],
  },
  'Custom furniture': {
    price: 1200,
    unit: 'starting estimate',
    duration: '3–7 days',
    warranty: '1-Year Structural Warranty',
    scope: ['3D design & wood consultation', 'Teak / plywood custom fabrication', 'Polishing & laminate finishing'],
  },
  'Furniture assembly': {
    price: 399,
    unit: 'per unit',
    duration: '45–60 mins',
    warranty: '30-Day Fitting Guarantee',
    scope: ['Bed, wardrobe & study table assembly', 'Dismantling for shifting', 'Wall anchoring & leveling'],
  },
  'Deep cleaning': {
    price: 2499,
    unit: 'full home package',
    duration: '4–6 hours',
    warranty: '100% Satisfaction Re-Clean',
    scope: ['Machine floor scrubbing & sanitization', 'Kitchen, bathrooms, balconies & fans', 'Eco-friendly Taski/Diversey chemicals'],
  },
  'Bathroom cleaning': {
    price: 449,
    unit: 'per bathroom',
    duration: '60 mins',
    warranty: 'Spotless Guarantee',
    scope: ['Hard-water stain & tile descaling', 'Commode, sink & tap sanitization', 'Exhaust fan & mirror polishing'],
  },
  'Kitchen cleaning': {
    price: 999,
    unit: 'per kitchen',
    duration: '2–3 hours',
    warranty: 'Degreasing Guarantee',
    scope: ['Chimney & exhaust oil degreasing', 'Cabinet interior/exterior wipe', 'Platform, sink & dado tile scrubbing'],
  },
  'Sofa cleaning': {
    price: 599,
    unit: 'for 5-seater sofa',
    duration: '60–90 mins',
    warranty: 'Fabric-Safe Guarantee',
    scope: ['Dry vacuuming & dust extraction', 'Foam shampooing & stain removal', 'Quick moisture extraction'],
  },
  'Water tank cleaning': {
    price: 699,
    unit: 'up to 1000L tank',
    duration: '60 mins',
    warranty: 'UV & Anti-Bacterial',
    scope: ['6-stage mechanized dewatering', 'Sludge removal & high-pressure jet', 'UV radiation disinfection'],
  },
  Electrician: {
    price: 249,
    unit: 'per visit',
    duration: '30–45 mins',
    warranty: '30-Day Service Warranty',
    scope: ['24/7 fault finding & trip resolution', 'Single/three-phase load check', 'Certified licensed technicians'],
  },
  'Fan installation': {
    price: 199,
    unit: 'per fan',
    duration: '30 mins',
    warranty: '30-Day Warranty',
    scope: ['Ceiling / BLDC / exhaust fan installation', 'Regulator & capacitor replacement', 'Noise-free balancing check'],
  },
  'Inverter repair': {
    price: 399,
    unit: 'per visit',
    duration: '45 mins',
    warranty: '60-Day Warranty',
    scope: ['Inverter & UPS wiring setup', 'Battery distilled water & voltage test', 'Charging circuit diagnostics'],
  },
  Wiring: {
    price: 499,
    unit: 'per point / circuit',
    duration: '60–120 mins',
    warranty: '90-Day Wiring Warranty',
    scope: ['Concealed / casing internal wiring', 'MCB, RCCB & distribution board work', 'Earthing & surge protection'],
  },
  'Switch repair': {
    price: 179,
    unit: 'per switchboard',
    duration: '25 mins',
    warranty: '30-Day Warranty',
    scope: ['Modular switch & 16A power socket fix', 'AC starter switch installation', 'Burned wire terminal replacement'],
  },
  'Tap repair': {
    price: 199,
    unit: 'per tap / mixer',
    duration: '30 mins',
    warranty: '30-Day Leak Warranty',
    scope: ['Wall mixer & spindle replacement', 'Kitchen sink tap leakage fix', 'Health faucet & angle valve installation'],
  },
  'Pipe leakage': {
    price: 349,
    unit: 'per repair',
    duration: '45–60 mins',
    warranty: '60-Day Leak-Free Guarantee',
    scope: ['Concealed & CPVC/UPVC pipe joint fix', 'Pressure testing & sealant bonding', 'Overhead tank pipeline repair'],
  },
  'Water motor repair': {
    price: 449,
    unit: 'per motor service',
    duration: '60 mins',
    warranty: '60-Day Winding/Seal Warranty',
    scope: ['Submersible & monoblock pump repair', 'Capacitor, impeller & seal replacement', 'Auto water-level controller setup'],
  },
  'Bathroom fittings': {
    price: 399,
    unit: 'per fitting',
    duration: '45 mins',
    warranty: '30-Day Warranty',
    scope: ['Western commode & flush tank repair', 'Washbasin & pedestal installation', 'Overhead rain shower fitting'],
  },
  'Drain cleaning': {
    price: 349,
    unit: 'per blockage',
    duration: '40 mins',
    warranty: '15-Day Flow Guarantee',
    scope: ['Kitchen & bathroom floor trap clearing', 'Mechanical spring auger declogging', 'Odor trap & chamber cleaning'],
  },
  'House painting': {
    price: 14,
    unit: 'per sq.ft (with material)',
    duration: 'On-site laser measurement',
    warranty: '1-Year Peel/Shade Warranty',
    scope: ['Asian Paints / Berger certified crew', '2 coats putty + primer + 2 coats emulsion', 'Furniture & floor masking + post-clean'],
  },
  Waterproofing: {
    price: 28,
    unit: 'per sq.ft',
    duration: '2–4 days',
    warranty: '3-Year Dampness Warranty',
    scope: ['Dr. Fixit / Fosroc terrace & wall treatment', 'Crack filling & elastomeric coating', 'Bathroom sunken slab waterproofing'],
  },
  'False ceiling': {
    price: 75,
    unit: 'per sq.ft',
    duration: '3–6 days',
    warranty: '2-Year Gypsum Warranty',
    scope: ['Saint-Gobain gypsum board & GI channel', 'Cove LED & profile lighting cutouts', 'Joint taping & smooth putty finish'],
  },
  'Modular kitchen': {
    price: 1350,
    unit: 'per sq.ft',
    duration: '7–14 days',
    warranty: '5-Year Hardware Warranty',
    scope: ['BWP marine ply + acrylic/laminate finish', 'Hettich/Ebco tandem drawers & tall units', 'Free 3D kitchen layout & quote'],
  },
  Wallpaper: {
    price: 45,
    unit: 'per sq.ft',
    duration: '2–4 hours',
    warranty: '1-Year Seam Guarantee',
    scope: ['3D custom & imported washable rolls', 'Wall primer & bubble-free installation', 'Texture & stencil accent wall options'],
  },
  'Bridal Makeup': {
    price: 4999,
    unit: 'per bridal session',
    duration: '2.5 hours',
    warranty: 'MAC / Huda Branded Kits',
    scope: ['HD / Airbrush bridal makeup', 'Hairstyling, saree draping & lashes', 'Free trial consultation option'],
  },
  'Women Salon at Home': {
    price: 799,
    unit: 'combo package',
    duration: '90 mins',
    warranty: 'Sealed Single-Use Kits',
    scope: ['O3+ / Lotus facial &rica waxing', 'Manicure, pedicure & threading', 'Certified female beauticians at home'],
  },
  'Men Grooming & Haircut': {
    price: 349,
    unit: 'per session',
    duration: '45 mins',
    warranty: 'Sanitized Tools & Cape',
    scope: ['Precision haircut & beard styling', 'De-tan face cleanup & head massage', 'Zero-mess disposable floor sheet'],
  },
  'Mehendi Artist': {
    price: 1499,
    unit: 'per event / bridal',
    duration: '2–3 hours',
    warranty: '100% Organic Rajasthani Henna',
    scope: ['Intricate bridal & Arabic designs', 'Chemical-free dark stain guarantee', 'Group guest mehendi packages'],
  },
  'Local House Shifting': {
    price: 3499,
    unit: 'starting (1 BHK)',
    duration: '4–6 hours',
    warranty: '₹10,000 Transit Protection',
    scope: ['3-layer bubble & corrugated packing', 'Closed container truck + skilled labor', 'Bed/wardrobe dismantling & re-assembly'],
  },
  'Mini Truck / Porter': {
    price: 799,
    unit: 'per trip (Tata Ace)',
    duration: '60–90 mins',
    warranty: 'Live GPS Tracking',
    scope: ['Instant mini-truck for furniture/appliances', 'Driver + optional helper loading', 'Transparent per-km rate card'],
  },
  'Office Relocation': {
    price: 5999,
    unit: 'custom office pack',
    duration: 'Same-day / Weekend',
    warranty: 'Zero Downtime SLA',
    scope: ['IT workstation, server & monitor crating', 'File cabinet & chair labelled shifting', 'GST invoice & dedicated move manager'],
  },
  'Intercity Relocation': {
    price: 8999,
    unit: 'pan-India transit',
    duration: '2–5 days',
    warranty: 'All-Risk Transit Insurance',
    scope: ['Door-to-door intercity home & car carrier', 'Waterproof laminated carton boxes', 'Dedicated tracking & delivery support'],
  },
  'Cockroach & Ant Control': {
    price: 799,
    unit: 'for 1–2 BHK',
    duration: '45 mins',
    warranty: '90-Day Pest-Free Warranty',
    scope: ['Odorless Bayer herbal gel + spray', 'No need to empty kitchen utensils', 'Child & pet-safe government approved'],
  },
  'Termite Treatment': {
    price: 2999,
    unit: 'complete home shield',
    duration: '2–3 hours',
    warranty: '2-Year Anti-Termite Warranty',
    scope: ['Drill-fill-seal chemical barrier', 'Door frames, wardrobes & skirting treatment', 'Preventive & curative wood protection'],
  },
  'Bed Bug Treatment': {
    price: 1199,
    unit: '2-visit package',
    duration: '60 mins',
    warranty: '45-Day Eradication Guarantee',
    scope: ['Mattress seams, cot crevices & curtains', 'Follow-up booster spray after 15 days', 'Complete egg & adult elimination'],
  },
  'Mosquito Fogging': {
    price: 899,
    unit: 'villa / apartment / lawn',
    duration: '45 mins',
    warranty: 'WHO-Approved Formulations',
    scope: ['Thermal fogging & cold ULV misting', 'Balcony, garden & drainage treatment', 'Dengue & malaria vector control'],
  },
  'CCTV Camera Installation': {
    price: 1499,
    unit: 'per camera / setup',
    duration: '2–3 hours',
    warranty: '1-Year On-Site Warranty',
    scope: ['CP Plus / Hikvision HD & IP cameras', 'DVR/NVR hard disk & mobile live view app', 'Clean PVC conduit cabling'],
  },
  'Laptop & MacBook Repair': {
    price: 399,
    unit: 'doorstep diagnosis',
    duration: '45–60 mins',
    warranty: '90-Day Spare Warranty',
    scope: ['SSD/RAM upgrade, OS & hinge repair', 'Screen, keyboard & battery replacement', 'Chip-level motherboard servicing'],
  },
  'Wi-Fi & Biometric Setup': {
    price: 499,
    unit: 'per installation',
    duration: '45 mins',
    warranty: '60-Day Support Warranty',
    scope: ['Mesh Wi-Fi router dead-zone fix', 'Smart digital door lock & biometric setup', 'LAN cabling & rack termination'],
  },
};

export const HomeTriangleServicesHub: React.FC<HomeTriangleServicesHubProps> = ({
  currentLang,
  listings,
  selectedCategory,
  selectedSubcategory,
  selectedArea,
  onSelectCategory,
  onSelectSubcategory,
  onSelectArea,
  onSelectListing,
  onBookListing,
  onEnquireListing,
  onCallNumber,
  onPostService,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [propertySize, setPropertySize] = useState<'1BHK' | '2BHK' | '3BHK' | 'Villa'>('2BHK');
  const [quoteModalItem, setQuoteModalItem] = useState<SubServiceRateItem | null>(null);
  const [bottomSheetCategory, setBottomSheetCategory] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'home' | 'categories' | 'orders' | 'account'>('home');
  const [explorerCategory, setExplorerCategory] = useState<string>('cat-5');

  const [quoteUrgency, setQuoteUrgency] = useState<'today' | 'tomorrow' | 'flexible'>('today');
  const [quoteCustomerName, setQuoteCustomerName] = useState('');
  const [quoteCustomerPhone, setQuoteCustomerPhone] = useState('');
  const [quoteNotes, setQuoteNotes] = useState('');
  const [quoteSubmittedSuccess, setQuoteSubmittedSuccess] = useState(false);

  const isTe = currentLang === 'te';

  // Filter all active service listings from MarketplaceContext
  const serviceListings = useMemo(() => {
    const validCatIds = new Set(servicesCategories.map((c) => c.id));
    return listings.filter(
      (l) =>
        l.status === 'active' &&
        (validCatIds.has(l.categoryId) || l.entityType === 'service')
    );
  }, [listings]);

  // Build flat catalog of all sub-service packages across the 10 categories
  const allSubServicePackages = useMemo<SubServiceRateItem[]>(() => {
    const items: SubServiceRateItem[] = [];
    servicesCategories.forEach((cat) => {
      cat.subcategories.forEach((sub) => {
        const subEn = typeof sub === 'string' ? sub : sub.en;
        const subTe = typeof sub === 'string' ? sub : sub.te;
        const subHi = typeof sub === 'string' ? sub : sub.hi;
        const meta = SUB_SERVICE_PRICE_MAP[subEn] || {
          price: 399,
          unit: 'per service',
          duration: '45–60 mins',
          warranty: '30-Day Service Warranty',
          scope: ['Verified background-checked professional', 'Upfront inspection & transparent quote', 'Post-service cleanup included'],
        };

        const exactMatch =
          serviceListings.find(
            (l) =>
              l.categoryId === cat.id &&
              l.subcategory.toLowerCase() === subEn.toLowerCase()
          ) ||
          serviceListings.find((l) => l.categoryId === cat.id) ||
          serviceListings[0];

        items.push({
          catId: cat.id,
          catName: cat.id === 'srv-cctv' ? 'Laptop & CCTV Sec.' : cat.name,
          catNameTe: cat.nameTe,
          catEmoji: cat.emoji,
          subEn,
          subTe,
          subHi,
          startingPrice: meta.price,
          unitLabel: meta.unit,
          duration: meta.duration,
          warranty: meta.warranty,
          scopePoints: meta.scope,
          matchedListing: exactMatch,
        });
      });
    });
    return items;
  }, [serviceListings]);

  // Filtered sub-service packages based on selectedCategory, selectedSubcategory, and searchQuery
  const visibleSubServicePackages = useMemo(() => {
    return allSubServicePackages.filter((pkg) => {
      if (selectedCategory !== 'all' && pkg.catId !== selectedCategory) {
        return false;
      }
      if (
        selectedSubcategory !== 'all' &&
        pkg.subEn.toLowerCase() !== selectedSubcategory.toLowerCase()
      ) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchSub =
          pkg.subEn.toLowerCase().includes(q) ||
          pkg.subTe.toLowerCase().includes(q) ||
          pkg.catName.toLowerCase().includes(q) ||
          pkg.catNameTe.toLowerCase().includes(q) ||
          pkg.scopePoints.some((s) => s.toLowerCase().includes(q));
        if (!matchSub) return false;
      }
      return true;
    });
  }, [allSubServicePackages, selectedCategory, selectedSubcategory, searchQuery]);

  // Filtered verified service listings for selected category & search
  const visibleServiceListings = useMemo(() => {
    return serviceListings.filter((l) => {
      if (selectedCategory !== 'all' && l.categoryId !== selectedCategory) {
        return false;
      }
      if (
        selectedSubcategory !== 'all' &&
        l.subcategory.toLowerCase() !== selectedSubcategory.toLowerCase()
      ) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const inTitle =
          l.title.toLowerCase().includes(q) ||
          (l.titleTe && l.titleTe.toLowerCase().includes(q)) ||
          l.subcategory.toLowerCase().includes(q) ||
          l.providerName.toLowerCase().includes(q);
        if (!inTitle) return false;
      }
      return true;
    });
  }, [serviceListings, selectedCategory, selectedSubcategory, searchQuery]);

  const sizeMultiplier = useMemo(() => {
    switch (propertySize) {
      case '1BHK':
        return 1;
      case '2BHK':
        return 1.25;
      case '3BHK':
        return 1.55;
      case 'Villa':
        return 2.1;
      default:
        return 1;
    }
  }, [propertySize]);

  const handleBookPackage = (pkg: SubServiceRateItem) => {
    playAlertChime('pop');
    if (pkg.matchedListing) {
      onBookListing({
        ...pkg.matchedListing,
        title: `${pkg.subEn} — ${pkg.matchedListing.providerName}`,
        price: pkg.startingPrice,
      });
    }
  };

  // 6 Quick Categories matching Screenshot 3 with simple dual-language labels & emojis
  const topQuickCategories = [
    {
      id: 'cat-6',
      title: 'Painting & Water proofing',
      titleTe: 'పెయింటింగ్ & వాటర్‌ప్రూఫ్',
      emoji: '🎨',
      iconBg: 'bg-blue-50 text-blue-600',
      svg: (
        <svg className="w-8 h-8 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M19 11D12 4 10 6 17 13z" />
          <path d="M14 6l2 2" />
          <path d="M4 20h3l10-10-3-3L4 17v3z" />
        </svg>
      ),
    },
    {
      id: 'srv-packers',
      title: 'Movers & Storage',
      titleTe: 'ప్యాకర్స్ & షిఫ్టింగ్',
      emoji: '🚚',
      iconBg: 'bg-orange-50 text-orange-600',
      svg: (
        <svg className="w-8 h-8 text-orange-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="1" y="3" width="15" height="13" rx="2" />
          <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
          <circle cx="5.5" cy="18.5" r="2.5" />
          <circle cx="18.5" cy="18.5" r="2.5" />
        </svg>
      ),
    },
    {
      id: 'cat-5',
      title: 'Carpenter & Renovation',
      titleTe: 'కార్పెంటర్ & రిపేర్లు',
      emoji: '🪚',
      iconBg: 'bg-amber-50 text-amber-600',
      svg: (
        <svg className="w-8 h-8 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
          <path d="M14.7 13.5L11.5 16.7l-2.2-2.2" />
        </svg>
      ),
    },
    {
      id: 'srv-salon',
      title: 'Makeup & Styling',
      titleTe: 'సెలూన్ & బ్యూటీ',
      emoji: '💇‍♀️',
      iconBg: 'bg-rose-50 text-rose-600',
      svg: (
        <svg className="w-8 h-8 text-rose-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="7" r="4" />
          <path d="M6 21v-2a4 4 0 014-4h4a4 4 0 014 4v2" />
        </svg>
      ),
    },
    {
      id: 'srv-pest',
      title: 'Mosquito & Safety Net',
      titleTe: 'పెస్ట్ & సేఫ్టీ నెట్',
      emoji: '🛡️',
      iconBg: 'bg-emerald-50 text-emerald-600',
      svg: (
        <svg className="w-8 h-8 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      ),
    },
    {
      id: 'more',
      title: 'More Categories',
      titleTe: 'అన్ని కేటగిరీలు',
      emoji: '🧱',
      iconBg: 'bg-purple-50 text-purple-600',
      svg: (
        <svg className="w-8 h-8 text-purple-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
        </svg>
      ),
    },
  ];

  // Categories Sidebar for Explorer view (Screenshot 4)
  const sidebarCategories = [
    {
      id: 'cat-5',
      title: 'Plumber, Carpenter & Electrician',
      thumb: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=120&q=80',
    },
    {
      id: 'cat-4',
      title: 'AC & Appliance Repair',
      thumb: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=120&q=80',
    },
    {
      id: 'cat-1',
      title: 'Cleaning & Pest Control',
      thumb: 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=120&q=80',
    },
    {
      id: 'cat-6',
      title: 'Painting & Water proofing',
      thumb: 'https://images.unsplash.com/photo-1562259949-e8e7689d7828?auto=format&fit=crop&w=120&q=80',
    },
    {
      id: 'srv-packers',
      title: 'Movers & Storage',
      thumb: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=120&q=80',
    },
    {
      id: 'srv-salon',
      title: 'Makeup & Styling',
      thumb: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=120&q=80',
    },
  ];

  return (
    <div className="w-full min-h-screen bg-slate-50 dark:bg-slate-950 pb-20 text-slate-900 dark:text-slate-100 font-sans">
      {/* BookOurSpace Services Style 2 header search bar */}
      <div className="sticky top-0 z-30 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-3 shadow-2xs">
        <div className="max-w-4xl mx-auto flex items-center gap-2">
          {activeTab === 'categories' && (
            <button
              type="button"
              onClick={() => setActiveTab('home')}
              className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}

          <div className="relative flex-1 flex items-center bg-slate-50 dark:bg-slate-800 rounded-xl border border-blue-200 dark:border-slate-700 overflow-hidden shadow-2xs">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isTe ? 'ఏ సర్వీస్ కావాలో వెతకండి (ఉదా: ప్లంబర్, ఎలక్ట్రీషియన్)...' : 'What service do you need? (e.g. Plumber)...'}
              className="w-full px-4 py-3 text-sm font-medium text-slate-800 dark:text-white placeholder-slate-400 bg-transparent outline-none"
            />
            <button
              type="button"
              onClick={() => {
                playAlertChime('pop');
                const msg = isTe
                  ? 'దయచేసి ఏ సర్వీస్ కావాలో నోటితో చెప్పండి (ఉదా: ఎలక్ట్రీషియన్, ప్లంబర్)...'
                  : 'Please say what service you need (e.g., Electrician, Plumber)...';
                alert(`🎙️ ${msg}`);
              }}
              title="Voice Search / నోటితో చెప్పండి"
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 sm:px-4 py-3 font-extrabold text-xs flex items-center gap-1 cursor-pointer shrink-0 transition"
            >
              <span>🎙️</span>
              <span className="hidden sm:inline whitespace-nowrap">{isTe ? 'నోటితో చెప్పండి' : 'Voice'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (searchQuery.trim()) {
                  setActiveTab('home');
                }
              }}
              className="bg-[#2563EB] hover:bg-blue-700 text-white px-4 py-3 flex items-center justify-center transition cursor-pointer shrink-0"
            >
              <Search className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* RENDER EXPLORER VIEW IF CATEGORIES TAB IS ACTIVE */}
      {activeTab === 'categories' ? (
        <div className="max-w-4xl mx-auto flex flex-col min-h-[85vh] bg-white dark:bg-slate-900">
          {/* Header Title Bar */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setActiveTab('home')}
              className="p-1 rounded-full text-slate-700 dark:text-slate-300"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
              Categories
            </h1>
          </div>

          {/* Split Layout: Left Thumbnail Sidebar + Right Grouped Section Cards */}
          <div className="flex flex-1 items-stretch">
            {/* Left Vertical Rail */}
            <div className="w-28 sm:w-36 bg-slate-100/80 dark:bg-slate-900/90 border-r border-slate-200 dark:border-slate-800 shrink-0">
              {sidebarCategories.map((sidebar) => {
                const isActive = explorerCategory === sidebar.id;
                return (
                  <button
                    key={sidebar.id}
                    type="button"
                    onClick={() => {
                      setExplorerCategory(sidebar.id);
                      playAlertChime('pop');
                    }}
                    className={`relative w-full p-3 flex flex-col items-center text-center gap-2 border-b border-slate-200/60 dark:border-slate-800/60 transition cursor-pointer ${
                      isActive
                        ? 'bg-[#E8F0FE] dark:bg-blue-950/40 text-blue-900 dark:text-blue-200 font-bold'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/50'
                    }`}
                  >
                    {isActive && (
                      <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-[#2563EB] rounded-r" />
                    )}
                    <SafeImage category="services"
                      src={sidebar.thumb}
                      alt={sidebar.title}
                      className="w-12 h-12 rounded-2xl object-cover shadow-2xs border border-white/60"
                    />
                    <span className="text-[11px] leading-tight font-semibold line-clamp-3">
                      {sidebar.title}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Right Content Area (Exact match for Screenshot 4) */}
            <div className="flex-1 p-4 space-y-6 overflow-y-auto max-h-[80vh]">
              {/* SECTION: MAINTENANCE */}
              <div className="space-y-3">
                <h2 className="text-xs font-black text-[#0F172A] dark:text-slate-200 tracking-wider uppercase">
                  MAINTENANCE
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3.5">
                  {[
                    { title: 'Electrician', icon: '⚡' },
                    { title: 'Carpenter', icon: '🪚' },
                    { title: 'Plumber', icon: '🚰' },
                    { title: 'Sofa Repair', icon: '🛋️' },
                    { title: 'Tile Grouting', icon: '🧱' },
                  ].map((item) => (
                    <button
                      key={item.title}
                      type="button"
                      onClick={() => {
                        onSelectCategory('cat-5');
                        onSelectSubcategory(item.title);
                        setActiveTab('home');
                      }}
                      className="bg-slate-50 dark:bg-slate-800/80 hover:bg-blue-50/80 rounded-2xl p-3 flex flex-col items-center text-center gap-2 border border-slate-100 dark:border-slate-700/60 transition cursor-pointer shadow-2xs group"
                    >
                      <div className="w-12 h-12 rounded-2xl bg-white dark:bg-slate-900 flex items-center justify-center text-2xl shadow-2xs group-hover:scale-105 transition">
                        {item.icon}
                      </div>
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-tight">
                        {item.title}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* SECTION: INSTALLATION */}
              <div className="space-y-3">
                <h2 className="text-xs font-black text-[#0F172A] dark:text-slate-200 tracking-wider uppercase">
                  INSTALLATION
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3.5">
                  {[
                    { title: 'Furniture Assembly', icon: '🗄️' },
                    { title: 'TV Installation', icon: '📺' },
                    { title: 'Hanger Installation', icon: '👔' },
                    { title: 'Mosquito Mesh', icon: '🪟' },
                    { title: 'Safety Net', icon: '🛡️' },
                  ].map((item) => (
                    <button
                      key={item.title}
                      type="button"
                      onClick={() => {
                        onSelectCategory('cat-5');
                        onSelectSubcategory(item.title);
                        setActiveTab('home');
                      }}
                      className="bg-slate-50 dark:bg-slate-800/80 hover:bg-blue-50/80 rounded-2xl p-3 flex flex-col items-center text-center gap-2 border border-slate-100 dark:border-slate-700/60 transition cursor-pointer shadow-2xs group"
                    >
                      <div className="w-12 h-12 rounded-2xl bg-white dark:bg-slate-900 flex items-center justify-center text-2xl shadow-2xs group-hover:scale-105 transition">
                        {item.icon}
                      </div>
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-tight">
                        {item.title}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* SECTION: AC & APPLIANCE REPAIR */}
              <div className="space-y-3">
                <h2 className="text-xs font-black text-[#0F172A] dark:text-slate-200 tracking-wider uppercase">
                  AC & APPLIANCE REPAIR
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3.5">
                  {[
                    { title: 'AC Service', icon: '❄️' },
                    { title: 'Washing Machine', icon: '🧺' },
                    { title: 'Refrigerator', icon: '🧊' },
                    { title: 'Geyser Repair', icon: '🚿' },
                    { title: 'Water Purifier', icon: '💧' },
                  ].map((item) => (
                    <button
                      key={item.title}
                      type="button"
                      onClick={() => {
                        onSelectCategory('cat-4');
                        onSelectSubcategory(item.title);
                        setActiveTab('home');
                      }}
                      className="bg-slate-50 dark:bg-slate-800/80 hover:bg-blue-50/80 rounded-2xl p-3 flex flex-col items-center text-center gap-2 border border-slate-100 dark:border-slate-700/60 transition cursor-pointer shadow-2xs group"
                    >
                      <div className="w-12 h-12 rounded-2xl bg-white dark:bg-slate-900 flex items-center justify-center text-2xl shadow-2xs group-hover:scale-105 transition">
                        {item.icon}
                      </div>
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-tight">
                        {item.title}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* MAIN BOOKOURSPACE SERVICES STYLE 2 FEED */
        <div className="max-w-4xl mx-auto p-4 space-y-5">
          {/* 3-STEP EASY VISUAL HELP BANNER (SIMPLE & UNEDUCATED FRIENDLY) */}
          <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 dark:from-slate-900 dark:to-slate-800 border border-blue-200 dark:border-slate-700 rounded-2xl p-3 flex items-center justify-between gap-2 text-center shadow-2xs">
            <div className="flex-1 flex flex-col items-center">
              <span className="w-7 h-7 rounded-full bg-blue-600 text-white font-black text-xs flex items-center justify-center">1</span>
              <span className="text-xs font-black text-slate-900 dark:text-white mt-1">1. నొక్కండి</span>
              <span className="text-[10px] text-slate-500 font-bold">Tap Service</span>
            </div>
            <span className="text-slate-300 font-black">→</span>
            <div className="flex-1 flex flex-col items-center">
              <span className="w-7 h-7 rounded-full bg-emerald-600 text-white font-black text-xs flex items-center justify-center">2</span>
              <span className="text-xs font-black text-slate-900 dark:text-white mt-1">2. కాల్ చేయండి</span>
              <span className="text-[10px] text-slate-500 font-bold">Direct Call</span>
            </div>
            <span className="text-slate-300 font-black">→</span>
            <div className="flex-1 flex flex-col items-center">
              <span className="w-7 h-7 rounded-full bg-amber-600 text-white font-black text-xs flex items-center justify-center">3</span>
              <span className="text-xs font-black text-slate-900 dark:text-white mt-1">3. పని పూర్తవుతుంది</span>
              <span className="text-[10px] text-slate-500 font-bold">Work Done</span>
            </div>
          </div>

          {/* 1. TOP 6 QUICK CATEGORY TILES (SIMPLE DUAL LANGUAGE + EMOJIS) */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3.5">
            {topQuickCategories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  if (cat.id === 'more') {
                    setActiveTab('categories');
                  } else if (cat.id === 'srv-salon') {
                    setBottomSheetCategory('srv-salon');
                  } else {
                    onSelectCategory(cat.id);
                    onSelectSubcategory('all');
                  }
                  playAlertChime('pop');
                }}
                className="bg-white dark:bg-slate-900 hover:shadow-md border border-slate-200/90 dark:border-slate-800 rounded-2xl p-3.5 flex flex-col items-center text-center gap-2 transition cursor-pointer group hover:border-blue-500"
              >
                <div
                  className={`w-14 h-14 rounded-2xl ${cat.iconBg} flex items-center justify-center shadow-2xs group-hover:scale-105 transition`}
                >
                  <span className="text-2xl leading-none">{cat.emoji}</span>
                </div>
                <div className="space-y-0.5 min-w-0 w-full">
                  <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-white leading-tight block truncate">
                    {isTe ? cat.titleTe : cat.title}
                  </span>
                  <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block truncate">
                    {cat.title}
                  </span>
                </div>
              </button>
            ))}
          </div>

          {/* 2. HERO CAROUSEL BANNER (EXACT MATCH FOR SCREENSHOT 3) */}
          <div className="relative overflow-hidden rounded-3xl bg-amber-50/50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex flex-col sm:flex-row items-center justify-between p-6 gap-4">
              <div className="space-y-3 z-10">
                <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white max-w-xs leading-tight">
                  Professional appliance repairs
                </h2>
                <div className="inline-block bg-slate-200/80 dark:bg-slate-800 px-3 py-1 rounded-full text-xs font-bold text-slate-700 dark:text-slate-300">
                  30 Days warranty
                </div>
                <div>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectCategory('cat-4');
                      onSelectSubcategory('all');
                    }}
                    className="bg-[#1E293B] hover:bg-slate-800 text-white font-bold px-6 py-2.5 rounded-lg text-sm shadow-md transition cursor-pointer"
                  >
                    Book Now
                  </button>
                </div>
              </div>

              <div className="w-full sm:w-1/2 h-44 sm:h-48 rounded-2xl overflow-hidden shadow-xs border border-white/60">
                <SafeImage category="services"
                  src="https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=800&q=80"
                  alt="Appliance Repairs"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>

            {/* Pagination Dots */}
            <div className="flex justify-center items-center gap-1.5 pb-3">
              <div className="w-2 h-2 rounded-full bg-slate-300" />
              <div className="w-2 h-2 rounded-full bg-slate-300" />
              <div className="w-2.5 h-2.5 rounded-full bg-blue-600 border-2 border-white shadow-2xs" />
              <div className="w-2 h-2 rounded-full bg-slate-300" />
              <div className="w-2 h-2 rounded-full bg-slate-300" />
            </div>
          </div>

          {/* 3. SHOWCASE ROW 1: APPLIANCES & REPAIR (EXACT MATCH FOR SCREENSHOT 2) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Appliances & Repair
              </h2>
              <button
                type="button"
                onClick={() => {
                  onSelectCategory('cat-4');
                  onSelectSubcategory('all');
                }}
                className="px-4 py-1.5 rounded-lg border border-blue-600 text-blue-600 dark:text-blue-400 text-xs font-bold hover:bg-blue-50 dark:hover:bg-blue-950/40 transition cursor-pointer"
              >
                See All
              </button>
            </div>

            <div className="flex items-center gap-3 overflow-x-auto no-scrollbar pb-2">
              {[
                {
                  title: 'Microwave Repair',
                  image: 'https://images.unsplash.com/photo-1574269909862-7e1d70bb8078?auto=format&fit=crop&w=400&q=80',
                  subEn: 'Microwave',
                },
                {
                  title: 'Geyser Repair Service',
                  image: 'https://images.unsplash.com/photo-1585338107529-13afc5f02586?auto=format&fit=crop&w=400&q=80',
                  subEn: 'Geyser',
                },
                {
                  title: 'Water Purifier Service',
                  image: 'https://images.unsplash.com/photo-1617886322207-6f504e7472c5?auto=format&fit=crop&w=400&q=80',
                  subEn: 'Water purifier repair',
                },
              ].map((item) => (
                <div
                  key={item.title}
                  onClick={() => {
                    const matched = allSubServicePackages.find((p) => p.subEn === item.subEn);
                    if (matched) {
                      setQuoteModalItem(matched);
                    }
                  }}
                  className="w-44 sm:w-52 shrink-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-2.5 space-y-2 cursor-pointer hover:shadow-md transition"
                >
                  <div className="w-full h-32 rounded-xl bg-amber-50/60 overflow-hidden">
                    <SafeImage category="services" src={item.image} alt={item.title} className="w-full h-full object-cover" />
                  </div>
                  <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 leading-tight line-clamp-2">
                    {item.title}
                  </h3>
                </div>
              ))}
            </div>
          </div>

          {/* 4. SHOWCASE ROW 2: HANDYMAN REPAIR & SERVICE (EXACT MATCH FOR SCREENSHOT 2) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Handyman Repair & Service
              </h2>
              <button
                type="button"
                onClick={() => {
                  onSelectCategory('cat-5');
                  onSelectSubcategory('all');
                }}
                className="px-4 py-1.5 rounded-lg border border-blue-600 text-blue-600 dark:text-blue-400 text-xs font-bold hover:bg-blue-50 dark:hover:bg-blue-950/40 transition cursor-pointer"
              >
                See All
              </button>
            </div>

            <div className="flex items-center gap-3 overflow-x-auto no-scrollbar pb-2">
              {[
                {
                  title: 'TV Installation',
                  image: 'https://images.unsplash.com/photo-1593784991095-a205069470b6?auto=format&fit=crop&w=400&q=80',
                  subEn: 'Television',
                },
                {
                  title: 'Tile Grouting',
                  image: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=400&q=80',
                  subEn: 'Carpenter',
                },
                {
                  title: 'Furniture Assembly',
                  image: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=400&q=80',
                  subEn: 'Furniture assembly',
                },
              ].map((item) => (
                <div
                  key={item.title}
                  onClick={() => {
                    const matched = allSubServicePackages.find((p) => p.subEn === item.subEn);
                    if (matched) {
                      setQuoteModalItem(matched);
                    }
                  }}
                  className="w-44 sm:w-52 shrink-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-2.5 space-y-2 cursor-pointer hover:shadow-md transition"
                >
                  <div className="w-full h-32 rounded-xl bg-amber-50/60 overflow-hidden">
                    <SafeImage category="services" src={item.image} alt={item.title} className="w-full h-full object-cover" />
                  </div>
                  <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 leading-tight line-clamp-2">
                    {item.title}
                  </h3>
                </div>
              ))}
            </div>
          </div>

          {/* 5. SERVICE RATE CARD GRID & MATCHED PROS */}
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Most Booked Services
              </h2>
              <span className="text-xs text-slate-500 tabular-nums">
                {visibleSubServicePackages.length} Rate Card Items
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {visibleSubServicePackages.slice(0, 8).map((pkg) => (
                <div
                  key={`${pkg.catId}-${pkg.subEn}`}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-col justify-between gap-3 shadow-2xs hover:border-blue-500 transition"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span>{pkg.catEmoji} {pkg.catName}</span>
                      <span>{pkg.duration}</span>
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      {pkg.subEn}
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
                      {pkg.scopePoints[0]} · {pkg.scopePoints[1]}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-2.5 border-t border-slate-100 dark:border-slate-800 gap-2 flex-wrap">
                    <div>
                      <span className="text-lg font-black text-[#15803D] dark:text-emerald-400">
                        ₹{pkg.startingPrice.toLocaleString('en-IN')}
                      </span>
                      <span className="text-[10px] text-slate-500 font-semibold block">{pkg.unitLabel}</span>
                    </div>

                    <div className="flex items-center gap-1.5 ml-auto">
                      <a
                        href="tel:9848012345"
                        onClick={() => playAlertChime('pop')}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black px-3 py-1.5 rounded-xl transition cursor-pointer flex items-center gap-1"
                      >
                        <Phone className="w-3.5 h-3.5" />
                        <span>{isTe ? 'కాల్' : 'Call'}</span>
                      </a>
                      <button
                        type="button"
                        onClick={() => handleBookPackage(pkg)}
                        className="bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-black px-3.5 py-1.5 rounded-xl transition cursor-pointer"
                      >
                        {isTe ? 'బుక్ చేయండి' : 'Book Slot'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* BOTTOM SHEET DRAWER MODAL (EXACT MATCH FOR SCREENSHOT 1 "Makeup & Styling") */}
      {bottomSheetCategory && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end justify-center">
          <div className="bg-white dark:bg-slate-900 w-full max-w-xl rounded-t-3xl border-t border-slate-200 dark:border-slate-800 p-5 space-y-5 animate-in slide-in-from-bottom duration-200 max-h-[85vh] overflow-y-auto">
            {/* Grab Handle */}
            <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto" />

            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                Makeup & Styling
              </h2>
              <button
                type="button"
                onClick={() => setBottomSheetCategory(null)}
                className="p-1 rounded-full text-slate-500 hover:text-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* SUB-SECTION 1: MAKEUP */}
            <div className="space-y-3">
              <h3 className="text-xs font-black text-slate-400 tracking-wider uppercase">
                MAKEUP
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3.5">
                {[
                  { title: 'Makeup & Styling Studio', icon: '🪞' },
                  { title: 'Saree Draping', icon: '🥻' },
                  { title: 'Hair Styling for Women', icon: '💇‍♀️' },
                  { title: 'Salon for Women', icon: '💆‍♀️' },
                ].map((item) => (
                  <button
                    key={item.title}
                    type="button"
                    onClick={() => {
                      setBottomSheetCategory(null);
                      const matched = allSubServicePackages.find((p) => p.catId === 'srv-salon');
                      if (matched) setQuoteModalItem(matched);
                    }}
                    className="bg-slate-50 dark:bg-slate-800/80 rounded-2xl p-3 flex flex-col items-center text-center gap-2 border border-slate-100 dark:border-slate-700/60 transition cursor-pointer hover:bg-rose-50/50"
                  >
                    <div className="w-14 h-14 rounded-2xl bg-white dark:bg-slate-900 flex items-center justify-center text-3xl shadow-2xs">
                      {item.icon}
                    </div>
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-tight">
                      {item.title}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* SUB-SECTION 2: MEN SALON */}
            <div className="space-y-3 pt-2">
              <h3 className="text-xs font-black text-slate-400 tracking-wider uppercase">
                MEN SALON
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3.5">
                {[
                  { title: 'Salon for Men', icon: '💈' },
                ].map((item) => (
                  <button
                    key={item.title}
                    type="button"
                    onClick={() => {
                      setBottomSheetCategory(null);
                      const matched = allSubServicePackages.find((p) => p.subEn.includes('Men'));
                      if (matched) setQuoteModalItem(matched);
                    }}
                    className="bg-slate-50 dark:bg-slate-800/80 rounded-2xl p-3 flex flex-col items-center text-center gap-2 border border-slate-100 dark:border-slate-700/60 transition cursor-pointer hover:bg-rose-50/50"
                  >
                    <div className="w-14 h-14 rounded-2xl bg-white dark:bg-slate-900 flex items-center justify-center text-3xl shadow-2xs">
                      {item.icon}
                    </div>
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-tight">
                      {item.title}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CUSTOM QUOTE & BOOKING MODAL */}
      {quoteModalItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <div className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                  {quoteModalItem.catEmoji} {quoteModalItem.catName} · Estimate
                </div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white mt-0.5">
                  {quoteModalItem.subEn}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setQuoteModalItem(null)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {quoteSubmittedSuccess ? (
              <div className="py-6 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/70 text-emerald-600 flex items-center justify-center mx-auto">
                  <Check className="w-6 h-6" />
                </div>
                <h4 className="text-base font-black text-slate-900 dark:text-white">
                  Quote Request Submitted!
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-300 max-w-sm mx-auto">
                  Verified {quoteModalItem.catName} technicians will share pricing details on your mobile number.
                </p>
                <div className="pt-3 flex items-center justify-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      const item = quoteModalItem;
                      setQuoteModalItem(null);
                      handleBookPackage(item);
                    }}
                    className="px-5 py-2.5 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-bold cursor-pointer"
                  >
                    Proceed to Instant Slot Booking
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                    Property Configuration
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {(['1BHK', '2BHK', '3BHK', 'Villa'] as const).map((sz) => (
                      <button
                        key={sz}
                        type="button"
                        onClick={() => setPropertySize(sz)}
                        className={`py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                          propertySize === sz
                            ? 'bg-[#2563EB] text-white border-[#2563EB]'
                            : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        {sz}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Your Name
                    </label>
                    <input
                      type="text"
                      value={quoteCustomerName}
                      onChange={(e) => setQuoteCustomerName(e.target.value)}
                      placeholder="Enter name"
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-semibold outline-none focus:border-blue-600"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Mobile
                    </label>
                    <input
                      type="tel"
                      value={quoteCustomerPhone}
                      onChange={(e) => setQuoteCustomerPhone(e.target.value)}
                      placeholder="Phone number"
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-semibold outline-none focus:border-blue-600"
                    />
                  </div>
                </div>

                <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 p-3.5 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] text-slate-500">Estimated Rate ({propertySize})</div>
                    <div className="text-lg font-black text-slate-900 dark:text-white">
                      ₹{Math.round(quoteModalItem.startingPrice * sizeMultiplier).toLocaleString('en-IN')}{' '}
                      <span className="text-xs font-normal text-slate-500">({quoteModalItem.unitLabel})</span>
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                    {quoteModalItem.warranty}
                  </span>
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      playAlertChime('confirm');
                      setQuoteSubmittedSuccess(true);
                    }}
                    className="px-4 py-2.5 rounded-xl border border-blue-600 text-blue-600 dark:text-blue-400 text-xs font-bold hover:bg-blue-50 transition cursor-pointer"
                  >
                    Request Callback
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const item = quoteModalItem;
                      setQuoteModalItem(null);
                      handleBookPackage(item);
                    }}
                    className="px-5 py-2.5 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-bold transition cursor-pointer"
                  >
                    Book Slot
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* BOTTOM NAVIGATION BAR (EXACT MATCH FOR SCREENSHOTS 2 & 3) */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 py-2 px-6 flex items-center justify-around shadow-lg">
        <button
          type="button"
          onClick={() => setActiveTab('home')}
          className={`flex flex-col items-center gap-1 text-xs font-bold transition cursor-pointer ${
            activeTab === 'home' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <Home className="w-5 h-5" />
          <span>Home</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('categories')}
          className={`flex flex-col items-center gap-1 text-xs font-bold transition cursor-pointer ${
            activeTab === 'categories' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <LayoutGrid className="w-5 h-5" />
          <span>Categories</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('orders')}
          className={`flex flex-col items-center gap-1 text-xs font-bold transition cursor-pointer ${
            activeTab === 'orders' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <ShoppingBag className="w-5 h-5" />
          <span>My Orders</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('account')}
          className={`flex flex-col items-center gap-1 text-xs font-bold transition cursor-pointer ${
            activeTab === 'account' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <User className="w-5 h-5" />
          <span>Account</span>
        </button>
      </div>
    </div>
  );
};
