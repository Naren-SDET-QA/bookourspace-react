import type { MarketplaceListing, PriceBreakdown } from '../types/marketplace';

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

