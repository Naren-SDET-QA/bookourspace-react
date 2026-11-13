import type { VenueCategoryInfo } from './venueData';

// Catalog definitions only. Providers must post a listing and receive approval.
export const additionalServiceCategories: VenueCategoryInfo[] = [
  { id: 'srv-milk', name: 'Milk & Dairy', nameTe: 'పాలు & పాల ఉత్పత్తులు', nameHi: 'दूध और डेयरी', emoji: '🥛', subcategories: [
    { en: 'Fresh milk delivery', te: 'తాజా పాల డెలివరీ', hi: 'ताज़ा दूध डिलीवरी' },
    { en: 'Curd, paneer & ghee', te: 'పెరుగు, పనీర్ & నెయ్యి', hi: 'दही, पनीर और घी' },
    { en: 'Butter & dairy products', te: 'వెన్న & పాల ఉత్పత్తులు', hi: 'मक्खन और डेयरी उत्पाद' },
  ] },
  { id: 'srv-groceries', name: 'Groceries & Vegetables', nameTe: 'కిరాణా & కూరగాయలు', nameHi: 'किराना और सब्जियां', emoji: '🥬', subcategories: [
    { en: 'Fresh fruit & vegetables', te: 'తాజా పండ్లు & కూరగాయలు', hi: 'ताज़े फल और सब्जियां' },
    { en: 'Neighbourhood groceries', te: 'స్థానిక కిరాణా', hi: 'स्थानीय किराना' },
  ] },
  { id: 'srv-water-delivery', name: 'Drinking Water Delivery', nameTe: 'తాగునీటి డెలివరీ', nameHi: 'पीने का पानी डिलीवरी', emoji: '💧', subcategories: [
    { en: 'Water can delivery', te: 'వాటర్ క్యాన్ డెలివరీ', hi: 'वाटर कैन डिलीवरी' },
    { en: 'Packaged drinking water', te: 'ప్యాకేజ్డ్ తాగునీరు', hi: 'पैकेज्ड पेयजल' },
  ] },
  { id: 'srv-flowers', name: 'Flowers & Daily Essentials', nameTe: 'పూలు & రోజువారీ వస్తువులు', nameHi: 'फूल और दैनिक जरूरतें', emoji: '🌼', subcategories: [
    { en: 'Fresh flowers & garlands', te: 'తాజా పూలు & దండలు', hi: 'ताज़े फूल और मालाएं' },
    { en: 'Daily essentials delivery', te: 'రోజువారీ వస్తువుల డెలివరీ', hi: 'दैनिक सामान डिलीवरी' },
  ] },
  { id: 'srv-mechanic', name: 'Bike & Car Mechanics', nameTe: 'బైక్ & కార్ మెకానిక్స్', nameHi: 'बाइक और कार मैकेनिक', emoji: '🛵', subcategories: [
    { en: 'Bike servicing & puncture repair', te: 'బైక్ సర్వీసింగ్ & పంక్చర్', hi: 'बाइक सर्विस और पंचर' },
    { en: 'Car repair & roadside assistance', te: 'కార్ రిపేర్ & రోడ్ సహాయం', hi: 'कार मरम्मत और सड़क सहायता' },
  ] },
  { id: 'srv-agriculture', name: 'Farm & Garden Services', nameTe: 'వ్యవసాయ & తోట సేవలు', nameHi: 'खेती और बागवानी सेवाएं', emoji: '🌱', subcategories: [
    { en: 'Farm equipment hire', te: 'వ్యవసాయ పరికరాల అద్దె', hi: 'कृषि उपकरण किराया' },
    { en: 'Gardening & farm assistance', te: 'తోట & వ్యవసాయ సహాయం', hi: 'बागवानी और खेती सहायता' },
  ] },
  { id: 'srv-laundry', name: 'Laundry & Ironing', nameTe: 'లాండ్రీ & ఇస్త్రీ', nameHi: 'लॉन्ड्री और इस्त्री', emoji: '👕', subcategories: [
    { en: 'Laundry pickup & delivery', te: 'లాండ్రీ పికప్ & డెలివరీ', hi: 'लॉन्ड्री पिकअप और डिलीवरी' },
    { en: 'Ironing & dry cleaning', te: 'ఇస్త్రీ & డ్రై క్లీనింగ్', hi: 'इस्त्री और ड्राई क्लीनिंग' },
  ] },
  { id: 'srv-local-delivery', name: 'Local Pickup & Delivery', nameTe: 'స్థానిక పికప్ & డెలివరీ', nameHi: 'स्थानीय पिकअप और डिलीवरी', emoji: '📦', subcategories: [
    { en: 'Neighbourhood parcel delivery', te: 'స్థానిక పార్సెల్ డెలివరీ', hi: 'स्थानीय पार्सल डिलीवरी' },
    { en: 'Shop pickup & errands', te: 'షాప్ పికప్ & పనులు', hi: 'दुकान पिकअप और छोटे काम' },
  ] },
  { id: 'srv-renovation', name: 'Renovation & Fabrication', nameTe: 'రెనోవేషన్ & ఫ్యాబ్రికేషన్', nameHi: 'नवीनीकरण और फैब्रिकेशन', emoji: '🏗️', subcategories: [
    { en: 'Home renovation', te: 'ఇంటి రెనోవేషన్', hi: 'घर का नवीनीकरण' },
    { en: 'Welding, gates & grills', te: 'వెల్డింగ్, గేట్లు & గ్రిల్స్', hi: 'वेल्डिंग, गेट और ग्रिल' },
  ] },
  { id: 'srv-safety-nets', name: 'Mosquito & Safety Nets', nameTe: 'దోమ & సేఫ్టీ నెట్లు', nameHi: 'मच्छर और सुरक्षा जाली', emoji: '🪟', subcategories: [
    { en: 'Mosquito mesh installation', te: 'దోమల మెష్ ఫిట్టింగ్', hi: 'मच्छर जाली लगाना' },
    { en: 'Balcony safety nets', te: 'బాల్కనీ సేఫ్టీ నెట్లు', hi: 'बालकनी सुरक्षा जाली' },
  ] },
];

export const dailyEssentialsCategoryIds = new Set(['srv-milk', 'srv-groceries', 'srv-water-delivery', 'srv-flowers']);

export const serviceSections = [
  { id: 'home', label: 'Home care', labelTe: 'ఇంటి సేవలు', emoji: '🏠', categoryIds: ['cat-4', 'cat-5', 'cat-1', 'cat-2', 'cat-3', 'cat-6', 'srv-salon', 'srv-packers', 'srv-pest', 'srv-cctv', 'srv-renovation', 'srv-safety-nets'] },
  { id: 'daily', label: 'Daily essentials', labelTe: 'రోజువారీ అవసరాలు', emoji: '🥛', categoryIds: [...dailyEssentialsCategoryIds] },
  { id: 'local', label: 'Local & village', labelTe: 'స్థానిక & గ్రామ సేవలు', emoji: '🌿', categoryIds: ['srv-mechanic', 'srv-agriculture', 'srv-laundry', 'srv-local-delivery'] },
] as const;
