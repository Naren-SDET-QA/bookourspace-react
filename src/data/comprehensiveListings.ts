import { MarketplaceListing } from '../types/marketplace';
import { getSubcategoryDisplayName, getPriceUnitDisplayName } from '../utils/translations';
import { pg29Categories, initialPGListings } from './pgHostelData';
import { classCategories, initialClassListings } from './classesData';
import { venue12Categories, initialVenueListings } from './venueData';
import {
  servicesCategories,
  hotelStayCategories,
  moviesCategories,
  initialExtraSectionListings,
} from './servicesStayMoviesData';

// Popular localities in Hyderabad & major tech hubs
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

// Distance Radiuses for quick customer filtering
export const distanceRadiuses = [
  { id: 'all', label: 'All Distances', maxKm: 999 },
  { id: '5', label: 'Within 5 km', maxKm: 5 },
  { id: '10', label: 'Within 10 km', maxKm: 10 },
  { id: '15', label: 'Within 15 km', maxKm: 15 },
];

// Curated avatar pictures of real local technicians and specialists
const techAvatars = [
  'https://images.unsplash.com/photo-1540569014015-19a7be504e3a?auto=format&fit=crop&w=250&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=250&q=80',
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=250&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=250&q=80',
  'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=250&q=80',
  'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=250&q=80',
  'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=250&q=80',
  'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=250&q=80',
];

const distanceZones = [
  { area: 'Madhapur / Hitech City', distKm: 1.4, arrival: 'Within 20 mins', arrivalTe: '20 నిమిషాల్లో రాక' },
  { area: 'Gachibowli Financial District', distKm: 3.2, arrival: 'Within 25 mins', arrivalTe: '25 నిమిషాల్లో రాక' },
  { area: 'Kukatpally / KPHB', distKm: 4.6, arrival: 'Within 30 mins', arrivalTe: '30 నిమిషాల్లో రాక' },
  { area: 'Begumpet / Ameerpet', distKm: 6.1, arrival: 'Within 35 mins', arrivalTe: '35 నిమిషాల్లో రాక' },
];

// Category-specific photos for Services section (ONLY the 10 categories in servicesCategories)
const serviceCategoryPhotos: Record<string, string[]> = {
  'cat-4': [
    'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=800&q=80',
  ],
  'cat-5': [
    'https://images.unsplash.com/photo-1538688525198-9b88f6f53126?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=800&q=80',
  ],
  'cat-1': [
    'https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1527515637462-cff94eecc1ac?auto=format&fit=crop&w=800&q=80',
  ],
  'cat-2': [
    'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=800&q=80',
  ],
  'cat-3': [
    'https://images.unsplash.com/photo-1607472586893-edb57bdc0e39?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1585704032915-c3400ca199e7?auto=format&fit=crop&w=800&q=80',
  ],
  'cat-6': [
    'https://images.unsplash.com/photo-1562259949-e8e7689d7828?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?auto=format&fit=crop&w=800&q=80',
  ],
  'srv-salon': [
    'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=800&q=80',
  ],
  'srv-packers': [
    'https://images.unsplash.com/photo-1600585152220-90363fe7e115?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=800&q=80',
  ],
  'srv-pest': [
    'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=800&q=80',
  ],
  'srv-cctv': [
    'https://images.unsplash.com/photo-1557597774-9d273605dfa9?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1558002038-1055907df827?auto=format&fit=crop&w=800&q=80',
  ],
};

const serviceProvidersByCat: Record<
  string,
  { name: string; nameTe: string; nameHi: string; basePrice: number; unit: string; warranty: string; tools: string }
> = {
  'cat-4': {
    name: 'CoolTech Appliance Pro',
    nameTe: 'కూల్‌టెక్ అప్లయన్స్ ప్రో',
    nameHi: 'कूलटेक अप्लायंस प्रो',
    basePrice: 499,
    unit: '/visit',
    warranty: '90 Days Spare & Gas Warranty',
    tools: 'Genuine OEM Spares + Foam Jet Kit',
  },
  'cat-5': {
    name: 'Vishwakarma Woodworks & Carpentry',
    nameTe: 'విశ్వకర్మ వుడ్‌వర్క్స్ & కార్పెంటరీ',
    nameHi: 'विश्वकर्मा वुडवर्क्स एंड कारपेंट्री',
    basePrice: 449,
    unit: '/visit',
    warranty: '60 Days Fitting & Hardware Warranty',
    tools: 'Power Carpentry Tools + Hettich/Ebco Fittings',
  },
  'cat-1': {
    name: 'UrbanShine Deep Cleaning Crew',
    nameTe: 'అర్బన్‌షైన్ డీప్ క్లీనింగ్ టీమ్',
    nameHi: 'अर्बनशाइन डीप क्लीनिंग क्रू',
    basePrice: 599,
    unit: '/visit',
    warranty: '100% Stain-Free Re-Clean Assurance',
    tools: 'Eco-Friendly Taski Chemicals + Rotary Scrubber',
  },
  'cat-2': {
    name: 'Sri Sai Licensed Electricians',
    nameTe: 'శ్రీ సాయి లైసెన్స్‌డ్ ఎలక్ట్రీషియన్స్',
    nameHi: 'श्री साईं लाइसेंस प्राप्त इलेक्ट्रीशियन',
    basePrice: 299,
    unit: '/visit',
    warranty: '30 Days Wiring & Switchboard Warranty',
    tools: 'Digital Multimeter + Finolex/Havells ISI Spares',
  },
  'cat-3': {
    name: 'AquaFlow Master Plumbers',
    nameTe: 'ఆక్వాఫ్లో మాస్టర్ ప్లంబర్స్',
    nameHi: 'एक्वाफ्लो मास्टर प्लंबर',
    basePrice: 349,
    unit: '/visit',
    warranty: '30 Days Zero-Leakage Guarantee',
    tools: 'Pressure Leak Detector + Jaquar/Astral CPVC Parts',
  },
  'cat-6': {
    name: 'Royale Home Painting Studio',
    nameTe: 'రాయల్ హోమ్ పెయింటింగ్ స్టూడియో',
    nameHi: 'रॉयल होम पेंटिंग स्टूडियो',
    basePrice: 14,
    unit: '/sq.ft',
    warranty: '3 Years Asian Paints Peel/Dampness Warranty',
    tools: 'Laser Measurement + Dustless Vacuum Sander',
  },
  'srv-salon': {
    name: 'GlowAura Bridal & Home Salon',
    nameTe: 'గ్లోఆరా బ్రైడల్ & హోమ్ సెలూన్',
    nameHi: 'ग्लोऑरा ब्राइडल और होम सैलून',
    basePrice: 799,
    unit: '/session',
    warranty: '100% Sealed Mono-Dose Branded Kits',
    tools: 'L’Oreal / O3+ Disposables & Sanitized Vanity',
  },
  'srv-packers': {
    name: 'SafeMove Express Packers & Movers',
    nameTe: 'సేఫ్‌మూవ్ ఎక్స్‌ప్రెస్ ప్యాకర్స్ & మూవర్స్',
    nameHi: 'सेफमूव एक्सप्रेस पैकर्स एंड मूवर्स',
    basePrice: 3499,
    unit: '/shifting',
    warranty: 'Zero-Damage Transit Insurance Included',
    tools: '3-Layer Bubble Wrap + Corrugated Boxes + Closed Container',
  },
  'srv-pest': {
    name: 'BioShield Odorless Pest Control',
    nameTe: 'బయోషీల్డ్ పెస్ట్ కంట్రోల్ సర్వీసెస్',
    nameHi: 'बायोशील्ड पेस्ट कंट्रोल सर्विसेज',
    basePrice: 899,
    unit: '/service',
    warranty: '6 Months Herbal & Bayer Gel Protection Warranty',
    tools: 'Govt CIB Approved Odorless Bayer Herbal Gel & Spray',
  },
  'srv-cctv': {
    name: 'SecureEye Smart CCTV & Biometrics',
    nameTe: 'సెక్యూర్‌ఐ స్మార్ట్ సీసీటీవీ & బయోమెట్రిక్స్',
    nameHi: 'सिक्योरआई स्मार्ट सीसीटीवी और बायोमेट्रिक्स',
    basePrice: 1299,
    unit: '/unit',
    warranty: '1 Year On-Site Camera & DVR Warranty',
    tools: 'Hikvision / CP Plus IP Cameras + Mobile App Cloud View',
  },
};

export function buildComprehensiveListings(): MarketplaceListing[] {
  const generated: MarketplaceListing[] = [];
  let globalIdCounter = 1000;

  // 1. Generate Category-Specific Listings for all 10 Service Categories in `servicesCategories`
  servicesCategories.forEach((cat, cIdx) => {
    const provMeta = serviceProvidersByCat[cat.id] || serviceProvidersByCat['cat-4'];
    const photos = serviceCategoryPhotos[cat.id] || serviceCategoryPhotos['cat-4'];

    cat.subcategories.forEach((sub, sIdx) => {
      const subEn = typeof sub === 'string' ? sub : sub.en;
      const subTe = typeof sub === 'string' ? getSubcategoryDisplayName(sub, 'te') : sub.te;
      const subHi = typeof sub === 'string' ? getSubcategoryDisplayName(sub, 'hi') : sub.hi;
      const zone = distanceZones[(cIdx + sIdx) % distanceZones.length];
      globalIdCounter++;

      generated.push({
        id: `srv-cat-${cat.id}-${globalIdCounter}`,
        title: `${provMeta.name} — Verified ${subEn} Specialist`,
        titleTe: `${provMeta.nameTe} — ధృవీకరించబడిన ${subTe} నిపుణులు`,
        titleHi: `${provMeta.nameHi} — सत्यापित ${subHi} विशेषज्ञ`,
        description: `Certified ${subEn} under ${cat.name} in ${zone.area}. Includes ${provMeta.tools} and ${provMeta.warranty}.`,
        descriptionTe: `${zone.area} లో ${cat.nameTe} క్రింద ధృవీకరించబడిన ${subTe} సేవ. ${provMeta.warranty} మరియు ఒరిజినల్ పరికరాలతో.`,
        categoryId: cat.id,
        subcategory: subEn,
        subcategoryTe: subTe,
        entityType: 'service',
        price: provMeta.basePrice + sIdx * 50,
        priceUnit: provMeta.unit,
        priceUnitTe: getPriceUnitDisplayName(provMeta.unit, 'te'),
        currency: '₹',
        location: {
          city: 'Hyderabad',
          area: zone.area,
          pincode: '500081',
          distanceKm: zone.distKm,
        },
        distanceKm: zone.distKm,
        images: photos,
        providerId: `prov-srv-${globalIdCounter}`,
        providerName: provMeta.name,
        providerNameTe: provMeta.nameTe,
        providerNameHi: provMeta.nameHi,
        providerPhone: '9848011223',
        providerEmail: 'service.desk@bookourspace.in',
        providerAvatar: techAvatars[globalIdCounter % techAvatars.length],
        providerRating: Number((4.95 - (sIdx % 3) * 0.04).toFixed(2)),
        reviewCount: 140 + sIdx * 19,
        isVerified: true,
        isFeatured: sIdx === 0,
        status: 'active',
        customFieldValues: {
          sectionType: 'services',
          categoryName: cat.name,
          serviceMode: `Doorstep Visit (${zone.arrival})`,
          experienceYears: `${8 + (cIdx % 5)}+ Years Verified Professionals`,
          warrantyPeriod: provMeta.warranty,
          visitingCharge: '₹99 Inspection (Adjusted in Final Bill)',
          toolsAndSpares: provMeta.tools,
          emergencySupport: '7 Days a Week • Express Same-Day Slot',
          arrivalEstimate: zone.arrival,
          arrivalEstimateTe: zone.arrivalTe,
          distance: `${zone.distKm} km away`,
          distanceTe: `${zone.distKm} km దూరంలో`,
          distanceKm: zone.distKm,
        },
        postingPlanId: sIdx === 0 ? 'plan-pro' : 'plan-basic',
        viewsCount: 410 + sIdx * 23,
        enquiriesCount: 28 + sIdx * 4,
        createdAt: '2026-10-22',
        expiresAt: '2026-12-31',
        reported: false,
      });
    });
  });

  // 2. Ensure EVERY category in `pg29Categories` has dedicated, authentic PG/Hostel cards for that exact categoryId
  const pgExistingCatIds = new Set(initialPGListings.map((item) => item.categoryId));
  const pgPhotos = [
    'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1595526114035-0d45ed16cfbf?auto=format&fit=crop&w=900&q=80',
  ];

  pg29Categories.forEach((cat, cIdx) => {
    if (pgExistingCatIds.has(cat.id)) return;
    cat.subcategories.slice(0, 3).forEach((sub, sIdx) => {
      const zone = distanceZones[(cIdx + sIdx) % distanceZones.length];
      globalIdCounter++;
      const isGirls = /girl|women|female|mahila/i.test(cat.name + sub.en);
      const isColiving = /co-living|coliving|couple|family/i.test(cat.name + sub.en);
      const isAC = !/non-ac/i.test(cat.name + sub.en);
      const residentLabel = isGirls
        ? 'Girls / Women Only'
        : isColiving
        ? 'Co-Living (Men & Women)'
        : 'Boys / Men & Working Professionals';
      const basePrice = /luxury|single|studio|ac/i.test(cat.name + sub.en)
        ? 10500
        : /daily|short|guest/i.test(cat.name + sub.en)
        ? 650
        : 6800;
      const unit = /daily|short|guest/i.test(cat.name + sub.en) ? '/day' : '/month';

      generated.push({
        id: `pg-auto-${cat.id}-${globalIdCounter}`,
        title: `Sri Sai Nest ${cat.name} — ${sub.en} (${zone.area.split('/')[0].trim()})`,
        titleTe: `శ్రీ సాయి నెస్ట్ ${cat.nameTe} — ${sub.te}`,
        titleHi: `श्री साईं नेस्ट ${cat.nameHi} — ${sub.hi}`,
        description: `Verified ${sub.en} under ${cat.name} in ${zone.area}. Includes 3-times homely food, high-speed 5G Wi-Fi, biometric entry, washing machine, and daily housekeeping.`,
        descriptionTe: `${zone.area} లో ${cat.nameTe} క్రింద ధృవీకరించబడిన ${sub.te}. 3 పూటలా ఇంటి భోజనం, 5G వై-ఫై, వాషింగ్ మెషీన్ మరియు 24/7 భద్రత.`,
        categoryId: cat.id,
        subcategory: sub.en,
        subcategoryTe: sub.te,
        entityType: 'rental',
        price: basePrice + sIdx * 500,
        priceUnit: unit,
        priceUnitTe: unit === '/day' ? '/రోజుకు' : '/నెలకు',
        currency: '₹',
        location: {
          city: 'Hyderabad',
          area: zone.area,
          pincode: '500081',
          distanceKm: zone.distKm,
        },
        distanceKm: zone.distKm,
        images: [pgPhotos[(cIdx + sIdx) % pgPhotos.length], pgPhotos[(cIdx + sIdx + 1) % pgPhotos.length]],
        providerId: `prov-pg-${globalIdCounter}`,
        providerName: `Sri Sai Nest ${cat.name}`,
        providerNameTe: `శ్రీ సాయి నెస్ట్ ${cat.nameTe}`,
        providerNameHi: `श्री साईं नेस्ट ${cat.nameHi}`,
        providerPhone: '9848099112',
        providerEmail: 'stays@srisainest.in',
        providerAvatar: techAvatars[globalIdCounter % techAvatars.length],
        providerRating: 4.91,
        reviewCount: 118 + sIdx * 24,
        isVerified: true,
        isFeatured: sIdx === 0,
        status: 'active',
        customFieldValues: {
          sectionType: 'pg_hostels',
          categoryName: cat.name,
          sharingType: sub.en,
          roomTypesAvailable: sub.en,
          acType: isAC ? 'AC & Non-AC Rooms' : 'Non-AC Air Cooled Rooms',
          foodIncluded: /room-only|self/i.test(cat.id + sub.en)
            ? 'Self-Cooking Kitchen / Food Optional'
            : 'Yes • 3 Times Homely South & North Indian Food',
          wifiAndBackup: '5G Wi-Fi + Washing Machine + 24/7 Power Backup',
          residentType: residentLabel,
          genderPolicy: residentLabel,
          securityDeposit: '1 Month Deposit • 15 Days Notice • Biometric Entry',
          distanceKm: zone.distKm,
        },
        postingPlanId: 'plan-pro',
        viewsCount: 540 + sIdx * 35,
        enquiriesCount: 38 + sIdx * 6,
        createdAt: '2026-10-20',
        expiresAt: '2026-12-31',
        reported: false,
      });
    });
  });

  // 3. Ensure EVERY category in `classCategories` has dedicated, authentic Class/Training cards for that exact categoryId
  const classExistingCatIds = new Set(initialClassListings.map((item) => item.categoryId));
  const classPhotos = [
    'https://images.unsplash.com/photo-1524178232363-1fb2b075b655?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=900&q=80',
  ];

  classCategories.forEach((cat, cIdx) => {
    if (classExistingCatIds.has(cat.id)) return;
    cat.subcategories.slice(0, 3).forEach((sub, sIdx) => {
      const zone = distanceZones[(cIdx + sIdx) % distanceZones.length];
      globalIdCounter++;
      generated.push({
        id: `cls-auto-${cat.id}-${globalIdCounter}`,
        title: `Pragathi Academy — ${sub.en} (${cat.name})`,
        titleTe: `ప్రగతి అకాడమీ — ${sub.te} (${cat.nameTe})`,
        titleHi: `प्रगति अकादमी — ${sub.hi} (${cat.nameHi})`,
        description: `Expert-led ${sub.en} under ${cat.name} in ${zone.area}. Live interactive batches, practical hands-on assignments, and certification support.`,
        descriptionTe: `${zone.area} లో ${cat.nameTe} క్రింద నిపుణులచే ${sub.te} శిక్షణ. ఆన్‌లైన్ & ఆఫ్‌లైన్ బ్యాచ్‌లు, ప్రాక్టికల్ సెషన్లు మరియు సర్టిఫికేట్.`,
        categoryId: cat.id,
        subcategory: sub.en,
        subcategoryTe: sub.te,
        entityType: 'school',
        price: 3500 + sIdx * 500,
        priceUnit: '/month',
        priceUnitTe: '/నెలకు',
        currency: '₹',
        location: {
          city: 'Hyderabad',
          area: zone.area,
          pincode: '500081',
          distanceKm: zone.distKm,
        },
        distanceKm: zone.distKm,
        images: [classPhotos[(cIdx + sIdx) % classPhotos.length]],
        providerId: `prov-cls-${globalIdCounter}`,
        providerName: `Pragathi ${cat.name} Institute`,
        providerNameTe: `ప్రగతి ${cat.nameTe} ఇన్‌స్టిట్యూట్`,
        providerNameHi: `प्रगति ${cat.nameHi} संस्थान`,
        providerPhone: '9849022334',
        providerEmail: 'admissions@pragathiacademy.in',
        providerAvatar: techAvatars[globalIdCounter % techAvatars.length],
        providerRating: 4.93,
        reviewCount: 165 + sIdx * 20,
        isVerified: true,
        isFeatured: sIdx === 0,
        status: 'active',
        runningBatchUrl: 'https://www.durgasoftonline.com/s/pages/new-batches',
        customFieldValues: {
          sectionType: 'classes',
          categoryName: cat.name,
          mode: 'Online & Offline Classroom',
          classMode: 'Online & Offline Classroom',
          batchTiming: 'Morning 7:30 AM, Evening 6:30 PM & Weekend Batches',
          classTimings: 'Morning 7:30 AM & Evening 6:30 PM',
          duration: '3 Months Practical Program',
          demoAvailable: '2 Free Live Demo Classes Available',
          freeTrialAvailable: 'Yes (2 Free Demo Sessions)',
          certification: 'ISO Verified Certificate + Mentorship',
          trainerExperience: '12+ Years Senior Certified Faculty',
          distanceKm: zone.distKm,
        },
        postingPlanId: 'plan-pro',
        viewsCount: 610 + sIdx * 29,
        enquiriesCount: 44 + sIdx * 5,
        createdAt: '2026-10-21',
        expiresAt: '2026-12-31',
        reported: false,
      });
    });
  });

  // 4. Ensure EVERY category in `venue12Categories` has dedicated Venue cards for that exact categoryId
  const venueExistingCatIds = new Set(initialVenueListings.map((item) => item.categoryId));
  const venuePhotos = [
    'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?auto=format&fit=crop&w=900&q=80',
  ];

  venue12Categories.forEach((cat, cIdx) => {
    if (venueExistingCatIds.has(cat.id)) return;
    cat.subcategories.slice(0, 2).forEach((sub, sIdx) => {
      const zone = distanceZones[(cIdx + sIdx) % distanceZones.length];
      globalIdCounter++;
      generated.push({
        id: `ven-auto-${cat.id}-${globalIdCounter}`,
        title: `Grand Imperial ${sub.en} (${zone.area.split('/')[0].trim()})`,
        titleTe: `గ్రాండ్ ఇంపీరియల్ ${sub.te}`,
        titleHi: `ग्रैंड इम्पीरियल ${sub.hi}`,
        description: `Luxury ${sub.en} under ${cat.name} in ${zone.area} with centralized AC, valet parking, bridal rooms, and custom stage decoration.`,
        descriptionTe: `${zone.area} లో ${cat.nameTe} క్రింద ${sub.te}. సెంట్రలైజ్డ్ ఏసీ, వాలెట్ పార్కింగ్, గెస్ట్ రూమ్స్ మరియు డెకరేషన్ సదుపాయం.`,
        categoryId: cat.id,
        subcategory: sub.en,
        subcategoryTe: sub.te,
        entityType: 'rental',
        price: 45000 + sIdx * 10000,
        priceUnit: '/day',
        priceUnitTe: '/రోజుకు',
        currency: '₹',
        location: {
          city: 'Hyderabad',
          area: zone.area,
          pincode: '500081',
          distanceKm: zone.distKm,
        },
        distanceKm: zone.distKm,
        images: venuePhotos,
        providerId: `prov-ven-${globalIdCounter}`,
        providerName: `Grand Imperial Venues`,
        providerNameTe: `గ్రాండ్ ఇంపీరియల్ వెన్యూస్`,
        providerNameHi: `ग्रैंड इम्पीरियल वेन्यूज`,
        providerPhone: '9848055667',
        providerEmail: 'bookings@grandimperial.in',
        providerAvatar: techAvatars[globalIdCounter % techAvatars.length],
        providerRating: 4.92,
        reviewCount: 132 + sIdx * 18,
        isVerified: true,
        isFeatured: sIdx === 0,
        status: 'active',
        customFieldValues: {
          sectionType: 'venues',
          categoryName: cat.name,
          seatingCapacity: '500 Seating / 1000 Floating Guests',
          acHallType: 'Centralized AC Banquet Hall + Lawn',
          parkingCapacity: '150 Cars + 300 Two-Wheelers Valet Parking',
          cateringPolicy: 'In-House & Outside Catering Allowed',
          guestRooms: '6 AC Bridal & Family Suites + Generator Backup',
          decorationSound: 'Floral Stage Decor + DJ Sound + Power Backup',
          distanceKm: zone.distKm,
        },
        postingPlanId: 'plan-pro',
        viewsCount: 510 + sIdx * 40,
        enquiriesCount: 31 + sIdx * 5,
        createdAt: '2026-10-21',
        expiresAt: '2026-12-31',
        reported: false,
      });
    });
  });

  // 5. Ensure EVERY category in `hotelStayCategories` has dedicated Hotel/Stay cards for that exact categoryId
  const hotelExistingCatIds = new Set(
    initialExtraSectionListings
      .filter((item) => item.categoryId.startsWith('hotel-'))
      .map((item) => item.categoryId)
  );
  const hotelPhotos = [
    'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=900&q=80',
  ];

  hotelStayCategories.forEach((cat, cIdx) => {
    if (hotelExistingCatIds.has(cat.id)) return;
    cat.subcategories.slice(0, 3).forEach((sub, sIdx) => {
      const zone = distanceZones[(cIdx + sIdx) % distanceZones.length];
      globalIdCounter++;
      const isHourly = cat.id === 'hotel-hourly';
      generated.push({
        id: `htl-auto-${cat.id}-${globalIdCounter}`,
        title: `Royal Orchid ${sub.en} (${zone.area.split('/')[0].trim()})`,
        titleTe: `రాయల్ ఆర్కిడ్ ${sub.te} (${cat.nameTe})`,
        titleHi: `रॉयल ऑर्किड ${sub.hi} (${cat.nameHi})`,
        description: `Verified ${sub.en} under ${cat.name} in ${zone.area}. King AC suites, high-speed 5G Wi-Fi, complimentary breakfast, and flexible check-in.`,
        descriptionTe: `${zone.area} లో ${cat.nameTe} క్రింద ధృవీకరించబడిన ${sub.te}. ఏసీ రూమ్స్, ఉచిత బ్రేక్‌ఫాస్ట్, 5G వై-ఫై మరియు 24/7 రూమ్ సర్వీస్.`,
        categoryId: cat.id,
        subcategory: sub.en,
        subcategoryTe: sub.te,
        entityType: 'rental',
        price: isHourly ? 899 + sIdx * 200 : 2199 + sIdx * 400,
        priceUnit: isHourly ? '/day' : '/night',
        priceUnitTe: isHourly ? '/స్లాట్' : '/రాత్రికి',
        currency: '₹',
        location: {
          city: 'Hyderabad',
          area: zone.area,
          pincode: '500081',
          distanceKm: zone.distKm,
        },
        distanceKm: zone.distKm,
        images: hotelPhotos,
        providerId: `prov-htl-${globalIdCounter}`,
        providerName: `Royal Orchid ${cat.name}`,
        providerNameTe: `రాయల్ ఆర్కిడ్ ${cat.nameTe}`,
        providerNameHi: `रॉयल ऑर्किड ${cat.nameHi}`,
        providerPhone: '9848077889',
        providerEmail: 'reservations@royalorchidstay.in',
        providerAvatar: techAvatars[globalIdCounter % techAvatars.length],
        providerRating: 4.91,
        reviewCount: 210 + sIdx * 25,
        isVerified: true,
        isFeatured: sIdx === 0,
        status: 'active',
        customFieldValues: {
          sectionType: 'hotel_stay',
          categoryName: cat.name,
          roomCategory: sub.en,
          checkInCheckOut: isHourly
            ? 'Flexible 3h / 6h / 12h Check-In (24/7 Front Desk)'
            : '12:00 PM Check-In / 11:00 AM Check-Out',
          breakfastWifi: 'Complimentary Buffet Breakfast + Free 5G Wi-Fi',
          coupleFriendly:
            cat.id === 'hotel-couple'
              ? '100% Couple Friendly • Local Govt ID Accepted'
              : 'All Verified Guests, Families & Corporate Travelers',
          cancellationPolicy: 'Free Cancellation till Check-In • Pay at Hotel',
          parkingPoolGym: 'Covered Car Parking + Restaurant + 24/7 Room Service',
          distanceKm: zone.distKm,
        },
        postingPlanId: 'plan-pro',
        viewsCount: 640 + sIdx * 32,
        enquiriesCount: 41 + sIdx * 6,
        createdAt: '2026-10-21',
        expiresAt: '2026-12-31',
        reported: false,
      });
    });
  });

  // 6. Ensure EVERY category in `moviesCategories` has dedicated Movie/Show cards for that exact categoryId
  const movieExistingCatIds = new Set(
    initialExtraSectionListings
      .filter((item) => item.categoryId.startsWith('movie-'))
      .map((item) => item.categoryId)
  );
  const moviePhotos = [
    'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?auto=format&fit=crop&w=900&q=80',
  ];

  moviesCategories.forEach((cat, cIdx) => {
    if (movieExistingCatIds.has(cat.id)) return;
    cat.subcategories.slice(0, 3).forEach((sub, sIdx) => {
      const zone = distanceZones[(cIdx + sIdx) % distanceZones.length];
      globalIdCounter++;
      const isStandup = cat.id === 'movie-standup' || cat.id === 'movie-concerts';
      generated.push({
        id: `mov-auto-${cat.id}-${globalIdCounter}`,
        title: `AMB & Prasads Multiplex — ${sub.en} (${cat.name})`,
        titleTe: `ఏఎంబీ & ప్రసాద్స్ మల్టీప్లెక్స్ — ${sub.te}`,
        titleHi: `एएमबी और प्रसाद मल्टीप्लेक्स — ${sub.hi}`,
        description: `Book instant QR M-tickets for ${sub.en} (${cat.name}) in ${zone.area}. 4K Laser projection, Dolby Atmos surround sound, and luxury recliner seating.`,
        descriptionTe: `${zone.area} లో ${cat.nameTe} (${sub.te}) కోసం తక్షణ క్యూఆర్ టికెట్ బుకింగ్. డాల్బీ అట్మాస్ సౌండ్ మరియు రిక్లైనర్ సీట్లు.`,
        categoryId: cat.id,
        subcategory: sub.en,
        subcategoryTe: sub.te,
        entityType: 'event',
        price: isStandup ? 499 + sIdx * 100 : 250 + sIdx * 45,
        priceUnit: isStandup ? '/pass' : '/ticket',
        priceUnitTe: isStandup ? '/పాస్' : '/టికెట్',
        currency: '₹',
        location: {
          city: 'Hyderabad',
          area: zone.area,
          pincode: '500081',
          distanceKm: zone.distKm,
        },
        distanceKm: zone.distKm,
        images: moviePhotos,
        providerId: `prov-mov-${globalIdCounter}`,
        providerName: isStandup ? `Live Arena & Comedy Club` : `AMB Cinemas & Multiplex`,
        providerNameTe: isStandup ? `లైవ్ ఎరీనా & కామెడీ క్లబ్` : `ఏఎంబీ సినిమాస్ & మల్టీప్లెక్స్`,
        providerNameHi: isStandup ? `लाइव एरिना और कॉमेडी क्लब` : `एएमबी सिनेमाज एंड मल्टीप्लेक्स`,
        providerPhone: '9848033445',
        providerEmail: 'boxoffice@ambcinemas.in',
        providerAvatar: techAvatars[globalIdCounter % techAvatars.length],
        providerRating: 4.94,
        reviewCount: 380 + sIdx * 40,
        isVerified: true,
        isFeatured: sIdx === 0,
        status: 'active',
        customFieldValues: {
          sectionType: 'movies',
          categoryName: cat.name,
          screenSoundFormat: isStandup
            ? 'Live Acoustic Stage + Line-Array Concert Sound'
            : '4K Laser Projection + Dolby Atmos Surround',
          showTimings: '11:00 AM • 2:30 PM • 6:15 PM • 9:45 PM',
          seatCategories: 'VIP Recliner • Executive Lounger • Royal Sofa',
          languageFormat:
            cat.id === 'movie-hollywood'
              ? 'English • Telugu • Hindi (IMAX 3D / 4DX)'
              : 'Telugu • Hindi • Pan-India (2D / 3D Subtitled)',
          foodBeverage: 'QR In-Seat Popcorn & Beverage Delivery',
          mTicketParking: 'Instant QR M-Ticket Entry + 4-Level Mall Parking',
          distanceKm: zone.distKm,
        },
        postingPlanId: 'plan-pro',
        viewsCount: 920 + sIdx * 55,
        enquiriesCount: 64 + sIdx * 9,
        createdAt: '2026-10-22',
        expiresAt: '2026-12-31',
        reported: false,
      });
    });
  });

  return generated;
}
