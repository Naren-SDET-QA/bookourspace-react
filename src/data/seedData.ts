import { MarketplaceListing, PriceBreakdown, PostingPlan, Enquiry, Booking, Review, PaymentTransaction } from '../types/marketplace';
import { buildComprehensiveListings } from './comprehensiveListings';
import { initialVenueListings } from './venueData';
import { initialClassListings } from './classesData';
import { initialPGListings } from './pgHostelData';
import { initialExtraSectionListings } from './servicesStayMoviesData';

export const initialPostingPlans: PostingPlan[] = [
  {
    id: 'plan-basic',
    name: 'Starter Pay-Per-Post',
    price: 99,
    billingPeriod: 'one_time',
    listingLimit: 1,
    validityDays: 30,
    isFeaturedIncluded: false,
    priorityRank: 1,
    perks: [
      '1 Active Listing for 30 Days',
      'Direct Phone & WhatsApp enquiries',
      'Upload up to 5 photos',
      'Standard search ranking'
    ],
    isActive: true
  },
  {
    id: 'plan-pro',
    name: 'Pro Specialist Plan',
    price: 499,
    billingPeriod: 'monthly',
    listingLimit: 10,
    validityDays: 30,
    isFeaturedIncluded: true,
    priorityRank: 2,
    isPopular: true,
    perks: [
      '10 Active Listings across any category',
      '1 "Featured Pro" badge boost included',
      'Priority placement in search results',
      'Live customer chat & appointment scheduling',
      'Instant SMS & in-app alerts on inquiries'
    ],
    isActive: true
  },
  {
    id: 'plan-business',
    name: 'Business & Agency Hub',
    price: 1499,
    billingPeriod: 'monthly',
    listingLimit: 50,
    validityDays: 30,
    isFeaturedIncluded: true,
    priorityRank: 3,
    perks: [
      'Up to 50 active listings (Properties, Jobs, Vehicles)',
      '5 "Top-of-Category" sponsored boosts',
      'Official "Gold Verified Seller" badge',
      'Lead management CRM & CSV export',
      'Zero platform booking commission'
    ],
    isActive: true
  },
  {
    id: 'plan-enterprise',
    name: 'Enterprise Unlimited Annual',
    price: 9999,
    billingPeriod: 'yearly',
    listingLimit: 9999,
    validityDays: 365,
    isFeaturedIncluded: true,
    priorityRank: 4,
    perks: [
      'Unlimited listings all year round',
      'Permanent VIP featured banner rotation',
      'Dedicated Account Manager & phone onboarding',
      'Custom API & automated lead webhooks',
      'Priority Super Admin approval'
    ],
    isActive: true
  }
];

const baseSeedListings: MarketplaceListing[] = [
  // 1. Home Cleaning Service
  {
    id: 'list-1',
    title: 'SparkleClean: 3BHK Deep Home & Kitchen Sanitization',
    description: 'Complete high-pressure steam cleaning of bathrooms, kitchen grease removal, sofa shampooing, and motorized single-disc floor scrubbing. 100% German eco-friendly chemicals.',
    categoryId: 'cat-1',
    subcategory: 'Deep cleaning',
    entityType: 'service',
    price: 2499,
    priceUnit: '/job',
    currency: '₹',
    location: {
      city: 'Hyderabad',
      area: 'Madhapur / Hitech City',
      pincode: '500081'
    },
    images: [
      'https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1527515637462-cff94eecc1ac?auto=format&fit=crop&w=800&q=80'
    ],
    providerId: 'prov-101',
    providerName: 'SparkleClean Solutions',
    providerPhone: '9848011223',
    providerEmail: 'contact@sparkleclean.in',
    providerAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
    providerRating: 4.9,
    reviewCount: 142,
    isVerified: true,
    isFeatured: true,
    status: 'active',
    customFieldValues: {
      serviceScope: 'Full Home',
      bhkSize: '3 BHK',
      chemicalsUsed: true
    },
    postingPlanId: 'plan-pro',
    viewsCount: 680,
    enquiriesCount: 44,
    createdAt: '2026-10-20',
    expiresAt: '2026-11-20',
    reported: false
  },

  // 2. Electrical Service
  {
    id: 'list-2',
    title: 'Ghouse Certified Wireman: 24/7 Short Circuit & MCB Emergency',
    description: 'Government licensed electrician with 15 years experience. Instant 20-minute arrival in Banjara Hills & Jubilee Hills. Inverter installation, fault troubleshooting & wiring.',
    categoryId: 'cat-2',
    subcategory: 'Electrician',
    entityType: 'service',
    price: 350,
    priceUnit: '/hr',
    currency: '₹',
    location: {
      city: 'Hyderabad',
      area: 'Banjara Hills, Road 12',
      pincode: '500034'
    },
    images: [
      'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=800&q=80'
    ],
    providerId: 'prov-102',
    providerName: 'Mohammed Ghouse',
    providerPhone: '9700345678',
    providerEmail: 'ghouse.electrical@gmail.com',
    providerAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80',
    providerRating: 4.95,
    reviewCount: 210,
    isVerified: true,
    isFeatured: true,
    status: 'active',
    customFieldValues: {
      licenseNo: 'EL-HYD-5912',
      responseTime: '15-30 Mins',
      emergency24x7: true
    },
    postingPlanId: 'plan-pro',
    viewsCount: 1120,
    enquiriesCount: 89,
    createdAt: '2026-10-18',
    expiresAt: '2026-11-18',
    reported: false
  },

  // 3. Property Rental
  {
    id: 'list-3',
    title: 'Luxury 3 BHK Furnished Flat with Balcony in Gachibowli',
    description: 'Spacious 2,150 sq.ft east-facing apartment in a gated community with swimming pool, gym, clubhouse, and 2 covered car parking slots. 5 minutes from IT corridor.',
    categoryId: 'cat-26',
    subcategory: 'Flats',
    entityType: 'property',
    price: 48000,
    priceUnit: '/month',
    currency: '₹',
    location: {
      city: 'Hyderabad',
      area: 'Gachibowli Financial District',
      pincode: '500032'
    },
    images: [
      'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=800&q=80'
    ],
    providerId: 'prov-103',
    providerName: 'Apex Prime Realty',
    providerPhone: '9988776655',
    providerEmail: 'properties@apexrealty.com',
    providerAvatar: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=200&q=80',
    providerRating: 4.8,
    reviewCount: 65,
    isVerified: true,
    isFeatured: true,
    status: 'active',
    customFieldValues: {
      transactionType: 'For Rent',
      bhkConfig: '3 BHK',
      superBuiltUpArea: 2150,
      furnishingStatus: 'Fully Furnished'
    },
    postingPlanId: 'plan-business',
    viewsCount: 1450,
    enquiriesCount: 62,
    createdAt: '2026-10-15',
    expiresAt: '2026-11-15',
    reported: false
  },

  // 4. Job Posting
  {
    id: 'list-4',
    title: 'Hiring: Senior AC & HVAC Technician (Commercial & Home)',
    description: 'Looking for experienced AC technician with knowledge of VRF systems, split AC jet servicing, and inverter PCB troubleshooting. Fixed salary + daily fuel & incentives.',
    categoryId: 'cat-18',
    subcategory: 'Technician hiring',
    entityType: 'job',
    price: 32000,
    priceUnit: '/month',
    currency: '₹',
    location: {
      city: 'Hyderabad',
      area: 'Kukatpally / KPHB',
      pincode: '500072'
    },
    images: [
      'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=800&q=80'
    ],
    providerId: 'prov-104',
    providerName: 'CoolBreeze Air Systems Pvt Ltd',
    providerPhone: '9849221144',
    providerEmail: 'hr@coolbreezeair.com',
    providerAvatar: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=200&q=80',
    providerRating: 4.7,
    reviewCount: 38,
    isVerified: true,
    isFeatured: false,
    status: 'active',
    customFieldValues: {
      jobRole: 'Senior AC Technician',
      employmentType: 'Full-Time',
      monthlySalary: '₹30,000 - ₹35,000 + incentives',
      minExperience: '3-5 Years'
    },
    postingPlanId: 'plan-basic',
    viewsCount: 420,
    enquiriesCount: 19,
    createdAt: '2026-10-22',
    expiresAt: '2026-11-22',
    reported: false
  },

  // 5. Vehicle Rental
  {
    id: 'list-5',
    title: 'Mahindra Thar 4x4 / Scorpio-N Self Drive Rental',
    description: 'Well-maintained top model SUVs with clean interior, GPS tracker, and comprehensive insurance. Available for weekend getaways, outstation tours, and corporate hire.',
    categoryId: 'cat-22',
    subcategory: 'Self-drive vehicles',
    entityType: 'rental',
    price: 3800,
    priceUnit: '/day',
    currency: '₹',
    location: {
      city: 'Hyderabad',
      area: 'Begumpet / Airport Road',
      pincode: '500016'
    },
    images: [
      'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=800&q=80'
    ],
    providerId: 'prov-105',
    providerName: 'Royal Wheels Car Rentals',
    providerPhone: '9849900112',
    providerEmail: 'booking@royalwheelscar.com',
    providerAvatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80',
    providerRating: 4.85,
    reviewCount: 94,
    isVerified: true,
    isFeatured: true,
    status: 'active',
    customFieldValues: {
      fuelIncluded: 'Without Fuel (Client fills)',
      seatingCapacity: '7-8 Seater SUV',
      securityDeposit: 5000
    },
    postingPlanId: 'plan-pro',
    viewsCount: 920,
    enquiriesCount: 51,
    createdAt: '2026-10-19',
    expiresAt: '2026-11-19',
    reported: false
  },

  // 6. School Admission
  {
    id: 'list-6',
    title: 'Admissions Open 2027: Oakridge Global STEM Academy',
    description: 'CBSE & Cambridge accredited curriculum from Nursery to Grade 12. Robotics lab, Olympic-size swimming pool, digital classrooms, and safe GPS-monitored student transit.',
    categoryId: 'cat-15',
    subcategory: 'School admissions',
    entityType: 'school',
    price: 125000,
    priceUnit: '/annum',
    currency: '₹',
    location: {
      city: 'Hyderabad',
      area: 'Kondapur / Miyapur',
      pincode: '500084'
    },
    images: [
      'https://images.unsplash.com/photo-1580582932707-520aed937b7b?auto=format&fit=crop&w=800&q=80'
    ],
    providerId: 'prov-106',
    providerName: 'Oakridge Admissions Desk',
    providerPhone: '1800-425-9988',
    providerEmail: 'admissions@oakridgeglobal.edu.in',
    providerAvatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=200&q=80',
    providerRating: 4.9,
    reviewCount: 78,
    isVerified: true,
    isFeatured: true,
    status: 'active',
    customFieldValues: {
      curriculumBoard: 'CBSE',
      gradesOffered: 'Nursery to Grade 12',
      annualFeeRange: '₹1 Lakh - ₹2.5 Lakhs'
    },
    postingPlanId: 'plan-business',
    viewsCount: 1800,
    enquiriesCount: 85,
    createdAt: '2026-10-12',
    expiresAt: '2026-11-12',
    reported: false
  },

  // 7. Goods Transport / Movers
  {
    id: 'list-7',
    title: 'SafeExpress: Packers & Movers with 4-Man Loading Crew',
    description: 'Damage-free household shifting, bubble wrapping of TVs & electronics, wardrobe disassembling, and reliable Tata Ace / 14ft container transport.',
    categoryId: 'cat-24',
    subcategory: 'Packers and movers',
    entityType: 'service',
    price: 4500,
    priceUnit: '/trip',
    currency: '₹',
    location: {
      city: 'Hyderabad',
      area: 'Kukatpally / Miyapur',
      pincode: '500072'
    },
    images: [
      'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80'
    ],
    providerId: 'prov-107',
    providerName: 'SafeExpress Logistics Team',
    providerPhone: '9849112288',
    providerEmail: 'info@safeexpresspackers.in',
    providerAvatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=200&q=80',
    providerRating: 4.75,
    reviewCount: 110,
    isVerified: true,
    isFeatured: false,
    status: 'active',
    customFieldValues: {
      transitInsurance: true,
      crewCount: '4-Man Experienced Crew'
    },
    postingPlanId: 'plan-basic',
    viewsCount: 510,
    enquiriesCount: 28,
    createdAt: '2026-10-21',
    expiresAt: '2026-11-21',
    reported: false
  },

  // 8. Pending Approval Listing (for Admin moderation demo)
  {
    id: 'list-8',
    title: 'Dr. Srinivas Home Physiotherapy & Stroke Rehabilitation',
    description: 'Certified B.PT physiotherapist with 8 years clinical experience. Neuro-rehabilitation, frozen shoulder, sciatica pain relief, and post-surgery gait training.',
    categoryId: 'cat-13',
    subcategory: 'Physiotherapy',
    entityType: 'service',
    price: 700,
    priceUnit: '/session',
    currency: '₹',
    location: {
      city: 'Hyderabad',
      area: 'Somajiguda / Panjagutta',
      pincode: '500082'
    },
    images: [
      'https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=800&q=80'
    ],
    providerId: 'prov-108',
    providerName: 'Dr. Srinivas Rao, B.PT',
    providerPhone: '9949887766',
    providerEmail: 'srinivas.physio@gmail.com',
    providerAvatar: 'https://images.unsplash.com/photo-1537368910025-700350fe46c7?auto=format&fit=crop&w=200&q=80',
    providerRating: 5.0,
    reviewCount: 12,
    isVerified: false,
    isFeatured: false,
    status: 'pending_approval',
    customFieldValues: {
      medicalLicense: 'APMC-PT-4819',
      homeVisit: true
    },
    postingPlanId: 'plan-basic',
    viewsCount: 32,
    enquiriesCount: 0,
    createdAt: '2026-10-24',
    expiresAt: '2026-11-24',
    reported: false
  }
];

export function buildDefaultPriceBreakdown(listing: MarketplaceListing): PriceBreakdown {
  if (listing.priceBreakdown) {
    return listing.priceBreakdown;
  }

  const total = Math.max(0, Number(listing.price) || 0);
  if (total === 0) {
    return {
      baseRent: 0,
      baseLabel: 'Base Fee',
      baseLabelTe: 'ప్రాథమిక రుసుము',
      baseLabelHi: 'मूल शुल्क',
      maintenance: 0,
      maintenanceLabel: 'Maintenance & Materials',
      maintenanceLabelTe: 'నిర్వహణ & మెటీరియల్స్',
      maintenanceLabelHi: 'रखरखाव और सामग्री',
      serviceFee: 0,
      serviceFeeLabel: 'Platform Service Fee',
      serviceFeeLabelTe: 'ప్లాట్‌ఫారమ్ సర్వీస్ ఫీజు',
      serviceFeeLabelHi: 'प्लेटफ़ॉर्म सेवा शुल्क',
      taxes: 0,
      taxLabel: 'GST & Applicable Taxes',
      notes: '100% Free Demo / Zero Booking Fee',
    };
  }

  const catId = listing.categoryId || '';
  const sectionType = String(listing.customFieldValues?.sectionType || '');
  const isPG = catId.startsWith('pg-') || catId === 'cat-26' || sectionType === 'pg_hostels' || listing.entityType === 'property';
  const isHotel = catId.startsWith('hotel-') || sectionType === 'hotel_stay';
  const isVenue = catId.startsWith('venue-') || ['cat-29', 'cat-30', 'cat-43'].includes(catId) || sectionType === 'venues';
  const isClass = catId.startsWith('class-') || ['cat-15', 'cat-16', 'cat-17'].includes(catId) || sectionType === 'classes';
  const isMovie = catId.startsWith('movie-') || sectionType === 'movies';

  if (isPG) {
    const baseRent = Math.round(total * 0.8);
    const maintenance = Math.round(total * 0.14);
    const serviceFee = total - baseRent - maintenance;
    return {
      baseRent,
      baseLabel: 'Base Room Rent',
      baseLabelTe: 'బేస్ రూమ్ అద్దె',
      baseLabelHi: 'मूल कमरा किराया',
      maintenance,
      maintenanceLabel: 'Maintenance, Wi-Fi & Power Backup',
      maintenanceLabelTe: 'నిర్వహణ, వై-ఫై & పవర్ బ్యాకప్',
      maintenanceLabelHi: 'रखरखाव, वाई-फाई और पावर बैकअप',
      serviceFee,
      serviceFeeLabel: 'Housekeeping & Water Charges',
      serviceFeeLabelTe: 'హౌస్ కీపింగ్ & వాటర్ ఛార్జీలు',
      serviceFeeLabelHi: 'हाउसकीपिंग और पानी शुल्क',
      taxes: 0,
      taxLabel: 'Residential Rent GST (Exempt)',
      securityDeposit: Math.round(total * 1.0),
      notes: 'Zero Brokerage • Direct Owner Verified Tariff',
    };
  }

  if (isHotel) {
    const baseRent = Math.round(total * 0.78);
    const maintenance = Math.round(total * 0.1);
    const taxes = Math.round(total * 0.08);
    const serviceFee = total - baseRent - maintenance - taxes;
    return {
      baseRent,
      baseLabel: 'Base Room / Suite Tariff',
      baseLabelTe: 'బేస్ రూమ్ / సూట్ టారిఫ్',
      baseLabelHi: 'मूल रूम / सुइट टैरिफ',
      maintenance,
      maintenanceLabel: 'Amenities & Housekeeping',
      maintenanceLabelTe: 'సౌకర్యాలు & హౌస్ కీపింగ్',
      maintenanceLabelHi: 'सुविधाएं और हाउसकीपिंग',
      serviceFee,
      serviceFeeLabel: 'Concierge & Service Fee',
      serviceFeeLabelTe: 'సర్వీస్ & సపోర్ట్ ఫీజు',
      serviceFeeLabelHi: 'सेवा और सहायता शुल्क',
      taxes,
      taxLabel: 'Hospitality GST (12%)',
      taxLabelTe: 'హాస్పిటాలిటీ GST (12%)',
      taxLabelHi: 'हॉस्पिटैलिटी जीएसटी (12%)',
      notes: 'Complimentary Wi-Fi & Instant Check-In Assurance',
    };
  }

  if (isVenue) {
    const baseRent = Math.round(total * 0.76);
    const maintenance = Math.round(total * 0.12);
    const taxes = Math.round(total * 0.07);
    const serviceFee = total - baseRent - maintenance - taxes;
    return {
      baseRent,
      baseLabel: 'Base Hall / Lawn Rental',
      baseLabelTe: 'బేస్ హాల్ / లాన్ అద్దె',
      baseLabelHi: 'मूल हॉल / लॉन किराया',
      maintenance,
      maintenanceLabel: 'AC, Generator & Cleaning Maintenance',
      maintenanceLabelTe: 'ఏసీ, జనరేటర్ & క్లీనింగ్ నిర్వహణ',
      maintenanceLabelHi: 'एसी, जनरेटर और सफाई रखरखाव',
      serviceFee,
      serviceFeeLabel: 'Event Coordination & Valet Fee',
      serviceFeeLabelTe: 'ఈవెంట్ కోఆర్డినేషన్ & వాలెట్ ఫీజు',
      serviceFeeLabelHi: 'इवेंट समन्वय और वैलेट शुल्क',
      taxes,
      taxLabel: 'GST & Municipal Event Tax',
      securityDeposit: Math.round(total * 0.2),
      notes: 'Transparent Venue Tariff • Best Rate Guarantee',
    };
  }

  if (isClass) {
    const baseRent = Math.round(total * 0.82);
    const maintenance = Math.round(total * 0.12);
    const serviceFee = total - baseRent - maintenance;
    return {
      baseRent,
      baseLabel: 'Base Course Tuition Fee',
      baseLabelTe: 'బేస్ కోర్సు ట్యూషన్ ఫీజు',
      baseLabelHi: 'मूल कोर्स ट्यूशन शुल्क',
      maintenance,
      maintenanceLabel: 'Cloud Lab, LMS & Study Materials',
      maintenanceLabelTe: 'క్లౌడ్ ల్యాబ్, LMS & స్టడీ మెటీరియల్',
      maintenanceLabelHi: 'क्लाउड लैब और अध्ययन सामग्री',
      serviceFee,
      serviceFeeLabel: 'Certification & Placement Support Fee',
      serviceFeeLabelTe: 'సర్టిఫికేషన్ & ప్లేస్‌మెంట్ సపోర్ట్ ఫీజు',
      serviceFeeLabelHi: 'प्रमाणन और प्लेसमेंट सहायता शुल्क',
      taxes: 0,
      notes: 'Includes Free Demo Session & Placement Portal Access',
    };
  }

  if (isMovie) {
    const baseRent = Math.round(total * 0.78);
    const maintenance = Math.round(total * 0.08);
    const taxes = Math.round(total * 0.09);
    const serviceFee = total - baseRent - maintenance - taxes;
    return {
      baseRent,
      baseLabel: 'Base Cinema Ticket Price',
      baseLabelTe: 'బేస్ సినిమా టికెట్ ధర',
      baseLabelHi: 'मूल सिनेमा टिकट मूल्य',
      maintenance,
      maintenanceLabel: '3D / Dolby Atmos Theatre Maintenance',
      maintenanceLabelTe: 'డాల్బీ అట్మాస్ థియేటర్ నిర్వహణ',
      maintenanceLabelHi: 'डॉल्बी एटमॉस थिएटर रखरखाव',
      serviceFee,
      serviceFeeLabel: 'M-Ticket Convenience & Service Fee',
      serviceFeeLabelTe: 'M-టికెట్ సర్వీస్ ఫీజు',
      serviceFeeLabelHi: 'एम-टिकट सुविधा शुल्क',
      taxes,
      taxLabel: 'Entertainment GST',
      notes: 'Instant QR M-Ticket • Direct Seat Confirmation',
    };
  }

  // Default for Home & Professional Services
  const baseRent = Math.round(total * 0.8);
  const maintenance = Math.round(total * 0.12);
  const serviceFee = total - baseRent - maintenance;
  return {
    baseRent,
    baseLabel: 'Base Service Visit & Labor Charge',
    baseLabelTe: 'బేస్ సర్వీస్ & లేబర్ ఛార్జ్',
    baseLabelHi: 'मूल सेवा और श्रम शुल्क',
    maintenance,
    maintenanceLabel: 'Equipment, Consumables & Hygiene Kit',
    maintenanceLabelTe: 'పరికరాలు & శానిటైజేషన్ కిట్',
    maintenanceLabelHi: 'उपकरण और स्वच्छता किट',
    serviceFee,
    serviceFeeLabel: 'Platform Assurance & Service Fee',
    serviceFeeLabelTe: 'ప్లాట్‌ఫారమ్ సర్వీస్ & వారంటీ ఫీజు',
    serviceFeeLabelHi: 'प्लेटफ़ॉर्म सेवा और वारंटी शुल्क',
    taxes: 0,
    notes: '30-Day Post-Service Warranty • Zero Hidden Charges',
  };
}

export function ensureListingPriceBreakdown(listing: MarketplaceListing): MarketplaceListing {
  if (listing.priceBreakdown && typeof listing.priceBreakdown.baseRent === 'number') {
    return listing;
  }
  return {
    ...listing,
    priceBreakdown: buildDefaultPriceBreakdown(listing),
  };
}

export const initialListings: MarketplaceListing[] = [
  ...initialPGListings,
  ...initialClassListings,
  ...initialVenueListings,
  ...initialExtraSectionListings,
  ...baseSeedListings,
  ...buildComprehensiveListings()
].map(ensureListingPriceBreakdown);

export const initialEnquiries: Enquiry[] = [
  {
    id: 'enq-1',
    listingId: 'list-1',
    listingTitle: 'SparkleClean: 3BHK Deep Home & Kitchen Sanitization',
    providerId: 'prov-101',
    customerId: 'cust-1',
    customerName: 'Ananya Sharma',
    customerPhone: '9849012345',
    customerEmail: 'ananya.s@gmail.com',
    message: 'Hello, are you available this Saturday 10 AM for 3BHK deep cleaning in Madhapur?',
    status: 'new',
    timestamp: '15 mins ago'
  },
  {
    id: 'enq-2',
    listingId: 'list-3',
    listingTitle: 'Luxury 3 BHK Furnished Flat with Balcony in Gachibowli',
    providerId: 'prov-103',
    customerId: 'cust-2',
    customerName: 'Vikram Joshi',
    customerPhone: '9885544332',
    customerEmail: 'vikram.j@techcorp.com',
    message: 'Hi, is the maintenance included in the 48k rent? Can we schedule a physical visit tomorrow evening?',
    status: 'contacted',
    timestamp: '2 hours ago'
  }
];

export const initialBookings: Booking[] = [
  {
    id: 'book-101',
    listingId: 'list-2',
    listingTitle: 'Ghouse Certified Wireman: 24/7 Short Circuit & MCB Emergency',
    providerId: 'prov-102',
    customerName: 'Ravi Kumar',
    customerPhone: '9876543210',
    customerAddress: 'Villa 14, Whispering Palms, Jubilee Hills',
    scheduledDate: '2026-10-24',
    timeSlot: 'Today, Immediate (Within 30 mins)',
    totalAmount: 350,
    status: 'confirmed',
    notes: 'Main power switchboard sparked and tripped.',
    createdAt: 'Just now'
  }
];

export const initialReviews: Review[] = [
  {
    id: 'rev-1',
    listingId: 'list-1',
    customerName: 'Pooja Reddy',
    customerAvatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=150&q=80',
    rating: 5,
    comment: 'Spectacular deep cleaning work! The team brought all machines, scrubbed all tile grout, and made our kitchen look brand new. Very polite crew.',
    date: '3 days ago',
    verifiedCustomer: true
  },
  {
    id: 'rev-2',
    listingId: 'list-2',
    customerName: 'Karthik Rao',
    customerAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80',
    rating: 5,
    comment: 'Ghouse arrived in exactly 18 minutes when our apartment MCB burned. Replaced the fuse safely with genuine parts. Highly recommend!',
    date: '1 week ago',
    verifiedCustomer: true
  }
];

export const initialTransactions: PaymentTransaction[] = [
  {
    id: 'tx-1001',
    type: 'plan_subscription',
    amount: 499,
    description: 'Pro Specialist Plan (1 Month Subscription)',
    planName: 'Pro Specialist Plan',
    status: 'success',
    date: '2026-10-18',
    invoiceNumber: 'INV-2026-8901',
    paymentMethod: 'UPI (GPay / PhonePe)'
  },
  {
    id: 'tx-1002',
    type: 'plan_subscription',
    amount: 1499,
    description: 'Business & Agency Hub (1 Month Subscription)',
    planName: 'Business & Agency Hub',
    status: 'success',
    date: '2026-10-15',
    invoiceNumber: 'INV-2026-8794',
    paymentMethod: 'Corporate Credit Card'
  },
  {
    id: 'tx-1003',
    type: 'pay_per_post',
    amount: 99,
    description: 'Pay-Per-Post Single Listing Fee (SafeExpress Movers)',
    planName: 'Starter Pay-Per-Post',
    status: 'success',
    date: '2026-10-21',
    invoiceNumber: 'INV-2026-9042',
    paymentMethod: 'Net Banking'
  }
];
