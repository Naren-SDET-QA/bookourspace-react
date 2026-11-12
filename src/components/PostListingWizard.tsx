import React, { useState, useRef, useEffect, useMemo } from 'react';
import SafeImage, { imageCategoryFor } from './SafeImage';
import UniversalMediaManager from './UniversalMediaManager';
import { inspectMediaFile, type InspectedMedia } from '../lib/media/inspection';
import { createResponsiveImageVariants, type ProcessedImage } from '../lib/media/imageVariants';
import { createMediaUploadHandler } from '../lib/media/uploadMediaAsset';
import { parseStorageObjectReference } from '../lib/media/signedStorageUrl';
import { sanitizeSvgFile } from '../lib/media/sanitizeSvg';
import {
  X,
  Check,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  ShieldCheck,
  Upload,
  Tag,
  CreditCard,
  Plus,
  Image as ImageIcon,
  FileImage,
  Clock,
  UserCheck,
  Phone,
  Mail,
  Building2,
} from 'lucide-react';
import { useMarketplace } from '../context/MarketplaceContext';
import {
  AppLanguage,
  getSubcategoryDisplayName,
  getPriceUnitDisplayName,
} from '../utils/translations';
import { getUILabels, transliterateLatinToScript } from '../utils/i18nEngine';
import { pg29Categories } from '../data/pgHostelData';
import { classCategories } from '../data/classesData';
import { venue12Categories } from '../data/venueData';
import {
  MarketSectionType,
  servicesCategories,
  hotelStayCategories,
  moviesCategories,
} from '../data/servicesStayMoviesData';
import { UniversalBarcode, generateBosBarcodeId } from './UniversalBarcode';
import { saveServerProviderListing } from '../lib/supabaseClient';
import { ProviderOnboardingForm } from './ProviderOnboardingForm';
import {
  UniversalObjectEditorModal,
  getSectionScopedElements,
  CustomWebElementSpec,
} from './UniversalObjectEditorModal';

interface PostListingWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onPostSuccess?: (newListing: any) => void;
  onOpenAdminReview?: (newListing: any) => void;
  currentLang?: AppLanguage;
  defaultSection?: MarketSectionType;
  defaultCategory?: string;
  defaultSubcategory?: string;
}

type ProviderListingImageItem = {
  url: string;
  format: string;
  name: string;
  file?: File;
  inspected?: InspectedMedia;
  processedImage?: ProcessedImage | null;
  isCover?: boolean;
};

const normalizeListingCovers = (items: ProviderListingImageItem[]): ProviderListingImageItem[] => {
  const realImages = items.map((item, index) => ({ item, index })).filter(({ item }) => item.name !== 'category-cover.jpg');
  const candidates = realImages.length ? realImages : items.map((item, index) => ({ item, index }));
  if (!candidates.length) return items;
  const selected = candidates.find(({ item }) => item.isCover)?.index ?? candidates[0].index;
  return items.map((item, index) => ({ ...item, isCover: index === selected }));
};

const ACCEPTED_ALL_IMAGE_FORMATS =
  'image/*,.png,.jpg,.jpeg,.webp,.gif,.svg,.bmp,.avif,.heic,.heif,.tiff,.tif,.ico,.jfif';

const detectImageFormatLabel = (src: string, fileName?: string): string => {
  if (fileName) {
    const ext = fileName.split('.').pop()?.toUpperCase();
    if (ext) return ext;
  }
  if (src.startsWith('data:image/')) {
    const mimeSub = src.slice(11, src.indexOf(';')).toUpperCase();
    return mimeSub.replace('SVG+XML', 'SVG').replace('JPEG', 'JPG');
  }
  const cleanUrl = src.split('?')[0];
  const extMatch = cleanUrl.match(/\.(png|jpe?g|webp|gif|svg|bmp|avif|heic|tiff?|ico)$/i);
  if (extMatch) return extMatch[1].toUpperCase();
  return 'IMG';
};

// Native multi-language dictionary for the Provider Registration & Listing Request Wizard
const WIZARD_DICT: Record<
  string,
  Partial<Record<AppLanguage, string>> & { en: string; te: string; hi: string }
> = {
  modalTitle: {
    en: 'Register as Provider & Submit Listing Request',
    te: 'ప్రొవైడర్‌గా నమోదు & లిస్టింగ్ దరఖాస్తు సమర్పణ',
    hi: 'प्रोवाइडर के रूप में पंजीकरण करें और लिस्टिंग अनुरोध भेजें',
    ta: 'வழங்குநராகப் பதிவு செய்து பட்டியல் கோரிக்கையைச் சமர்ப்பிக்கவும்',
    kn: 'ಪೂರೈಕೆದಾರರಾಗಿ ನೋಂದಾಯಿಸಿ ಮತ್ತು ಲಿಸ್ಟಿಂಗ್ ವಿನಂತಿಯನ್ನು ಸಲ್ಲಿಸಿ',
    ml: 'പ്രൊവൈഡറായി രജിസ്റ്റർ ചെയ്ത് ലിസ്റ്റിംഗ് അപേക്ഷ സമർപ്പിക്കുക',
    mr: 'प्रोव्हायडर म्हणून नोंदणी करा आणि लिस्टिंग विनंती सबमिट करा',
    bn: 'প্রোভাইডার হিসেবে নিবন্ধন করুন এবং লিস্টিং অনুরোধ জমা দিন',
    gu: 'પ્રોવાઇડર તરીકે નોંધણી કરો અને લિસ્ટિંગ વિનંતી સબમિટ કરો',
    pa: 'ਪ੍ਰੋਵਾਈਡਰ ਵਜੋਂ ਰਜਿਸਟਰ ਕਰੋ ਅਤੇ ਲਿਸਟਿੰਗ ਬੇਨਤੀ ਜਮ੍ਹਾਂ ਕਰੋ',
    or: 'ପ୍ରୋଭାଇଡର୍ ଭାବରେ ପଞ୍ଜୀକରଣ କରନ୍ତୁ ଏବଂ ଲିଷ୍ଟିଂ ଅନୁରୋଧ ଦାଖଲ କରନ୍ତୁ',
    ur: 'بطور فراہم کنندہ رجسٹر کریں اور لسٹنگ کی درخواست جمع کروائیں',
  },
  step1Sub: {
    en: 'Step 1 of 4: Provider Category & Category-Specific Details',
    te: 'దశ 1 / 4: ప్రొవైడర్ కేటగిరీ & కేటగిరీ వివరాలు',
    hi: 'चरण 1 / 4: प्रोवाइडर श्रेणी और श्रेणी-विशिष्ट विवरण',
  },
  step2SubGeneral: {
    en: 'Step 2 of 4: Category Details, Pricing & All-Format Images',
    te: 'దశ 2 / 4: కేటగిరీ వివరాలు, ధర & ఫోటోలు',
    hi: 'चरण 2 / 4: श्रेणी विवरण, मूल्य और सभी प्रारूप चित्र',
  },
  step2SubClasses: {
    en: 'Step 2 of 4: Course Details, Batch Link & All-Format Images',
    te: 'దశ 2 / 4: కోర్సు వివరాలు, బ్యాచ్ లింక్ & ఫోటోలు',
    hi: 'चरण 2 / 4: कोर्स विवरण, बैच लिंक और सभी प्रारूप चित्र',
  },
  step3Sub: {
    en: 'Step 3 of 4: Location & Photo Gallery',
    te: 'దశ 3 / 4: లొకేషన్ & ఫోటో గ్యాలరీ',
    hi: 'चरण 3 / 4: स्थान और फोटो गैलरी',
  },
  step4Sub: {
    en: 'Step 4 of 4: Submit Request to Admin for Approval',
    te: 'దశ 4 / 4: అడ్మిన్ ఆమోదం కోసం దరఖాస్తు సమర్పణ',
    hi: 'चरण 4 / 4: एडमिन अनुमोदन के लिए अनुरोध जमा करें',
  },
  workflowBanner: {
    en: 'Workflow: 1. Select Provider Category → 2. Fill Category-Only Details → 3. Admin Approves → 4. Live in Same Category',
    te: 'విధానం: 1. ప్రొవైడర్ కేటగిరీ ఎంపిక → 2. కేటగిరీ వివరాలు మాత్రమే → 3. అడ్మిన్ ఆమోదం → 4. అదే కేటగిరీలో ప్రదర్శన',
    hi: 'प्रक्रिया: 1. प्रोवाइडर श्रेणी चुनें → 2. केवल श्रेणी विवरण भरें → 3. एडमिन मंजूरी → 4. उसी श्रेणी में लाइव',
  },
  tab1: {
    en: '1. Provider & Category',
    te: '1. ప్రొవైడర్ & కేటగిరీ',
    hi: '1. प्रोवाइडर और श्रेणी',
  },
  tab2: {
    en: '2. Category Details & Photos',
    te: '2. కేటగిరీ వివరాలు & ఫోటోలు',
    hi: '2. श्रेणी विवरण और फोटो',
  },
  tab3: {
    en: '3. Location',
    te: '3. లొకేషన్',
    hi: '3. स्थान',
  },
  tab4: {
    en: '4. Admin Request',
    te: '4. అడ్మిన్ ఆమోదం',
    hi: '4. एडमिन अनुरोध',
  },
};

export interface SectionFieldSpec {
  key: string;
  labelEn: string;
  labelTe: string;
  labelHi: string;
  type: 'select' | 'text';
  options?: string[];
  placeholder?: string;
}

interface CategoryProviderConfig {
  providerNameEn: string;
  providerNameTe: string;
  providerNameHi: string;
  titlePlaceholderEn: string;
  titlePlaceholderTe: string;
  titlePlaceholderHi: string;
  descPlaceholderEn: string;
  descPlaceholderTe: string;
  descPlaceholderHi: string;
  coverImageUrl: string;
  defaultPrice: string;
  defaultPriceUnit: string;
  fields: SectionFieldSpec[];
}

const SECTION_PRICE_UNITS: Record<
  MarketSectionType,
  { value: string; labelEn: string; labelTe: string; labelHi: string }[]
> = {
  pg_hostels: [
    { value: '/month', labelEn: 'Per Month (Monthly PG/Hostel Rent)', labelTe: 'నెలకు (నెలవారీ పీజీ అద్దె)', labelHi: 'प्रति माह (मासिक पीजी किराया)' },
    { value: '/day', labelEn: 'Per Day (Daily / Short Stay)', labelTe: 'రోజుకు (రోజువారీ స్టే)', labelHi: 'प्रति दिन (दैनिक स्टे)' },
    { value: '/bed', labelEn: 'Per Bed / Month', labelTe: 'ఒక్కో బెడ్‌కు / నెల', labelHi: 'प्रति बेड / माह' },
    { value: '/property', labelEn: 'For the complete property (sale)', labelTe: 'పూర్తి ప్రాపర్టీకి (అమ్మకం)', labelHi: 'पूरी प्रॉपर्टी के लिए (बिक्री)' },
  ],
  classes: [
    { value: '/course', labelEn: 'Full Course Package Fee', labelTe: 'పూర్తి కోర్సు ఫీజు', labelHi: 'पूरा कोर्स शुल्क' },
    { value: '/month', labelEn: 'Per Month Tuition / Coaching Fee', labelTe: 'నెలవారీ ట్యూషన్ ఫీజు', labelHi: 'मासिक ट्यूशन शुल्क' },
    { value: '/hr', labelEn: 'Per Hour Session', labelTe: 'గంటకు ఫీజు', labelHi: 'प्रति घंटा शुल्क' },
  ],
  venues: [
    { value: '/day', labelEn: 'Per Day / Full Event Rental', labelTe: 'రోజుకు / ఈవెంట్ అద్దె', labelHi: 'प्रति दिन / इवेंट किराया' },
    { value: '/event', labelEn: 'Per Session / Event Slot', labelTe: 'ఒక్కో ఈవెంట్ స్లాట్‌కు', labelHi: 'प्रति इवेंट स्लॉट' },
    { value: '/plate', labelEn: 'Per Plate Catering Package', labelTe: 'ఒక్కో ప్లేట్ ప్యాకేజీ', labelHi: 'प्रति प्लेट पैकेज' },
    { value: '/hr', labelEn: 'Per Hour Turf / Hall Slot', labelTe: 'గంటకు స్లాట్ ధర', labelHi: 'प्रति घंटा स्लॉट' },
  ],
  services: [
    { value: '/visit', labelEn: 'Per Visit / Standard Service', labelTe: 'ఒక్కో సర్వీస్ విజిట్‌కు', labelTeShort: '/విజిట్', labelHi: 'प्रति विजिट / सर्विस' } as any,
    { value: '/job', labelEn: 'Per Job / Repair Task', labelTe: 'ఒక్కో పనికి / రిపేర్‌కు', labelHi: 'प्रति कार्य / रिपेयर' },
    { value: '/sq.ft', labelEn: 'Per Sq.Ft (Painting / Woodwork)', labelTe: 'చదరపు అడుగుకు (Sq.Ft)', labelHi: 'प्रति वर्ग फुट' },
    { value: '/shifting', labelEn: 'Per Shifting / Move', labelTe: 'ఒక్కో షిఫ్టింగ్‌కు', labelHi: 'प्रति शिफ्टिंग' },
  ],
  hotel_stay: [
    { value: '/3 hrs', labelEn: 'Hourly (గంటల వారీ - 3h/6h Flexi)', labelTe: 'గంటల వారీ (3/6 గంటల ఫ్లెక్సీ స్టే)', labelHi: 'घंटे के हिसाब से (3/6 घंटे)' },
    { value: '/day', labelEn: 'Daily (రోజు వారీ - Per Day Tariff)', labelTe: 'రోజు వారీ (రోజుకు రూమ్ ధర)', labelHi: 'दैनिक (प्रति दिन किराया)' },
    { value: '/week', labelEn: 'Weekly (వారం వారీ - 7 Nights Package)', labelTe: 'వారం (వారం వారీ ప్యాకేజీ)', labelHi: 'साप्ताहिक (प्रति सप्ताह)' },
    { value: '/month', labelEn: 'Monthly (నెల వారీ - 30 Days Long Stay)', labelTe: 'నెల (నెల వారీ లాంగ్ స్టే)', labelHi: 'मासिक (प्रति माह स्टे)' },
  ],
  movies: [
    { value: '/ticket', labelEn: 'Per Movie Ticket / Seat', labelTe: 'ఒక్కో సినిమా టికెట్‌కు', labelHi: 'प्रति मूवी टिकट / सीट' },
    { value: '/pass', labelEn: 'Per Live Show / Event Pass', labelTe: 'ఒక్కో షో పాస్‌కు', labelHi: 'प्रति शो पास' },
  ],
};

/**
 * Generates strictly category-scoped provider defaults, placeholders, cover photo,
 * and 6 category-specific fields so ONLY details relevant to the selected category appear.
 */
function buildCategorySpecificProviderConfig(
  section: MarketSectionType,
  categoryId: string,
  catNameEn: string,
  catNameTe: string,
  catNameHi: string,
  subcategoryEn: string
): CategoryProviderConfig {
  // 1. PG & HOSTELS SECTION — tailored to the exact PG category (Boys, Girls, Co-Living, AC, Non-AC, Room-Only, Daily, etc.)
  if (section === 'pg_hostels') {
    if (categoryId === 'pg-property-sale') {
      return {
        providerNameEn: 'PG property owner',
        providerNameTe: 'పీజీ ప్రాపర్టీ యజమాని',
        providerNameHi: 'पीजी प्रॉपर्टी मालिक',
        titlePlaceholderEn: 'e.g. Fully operational 24-bed PG building for sale',
        titlePlaceholderTe: 'ఉదా: అమ్మకానికి పూర్తిగా నడుస్తున్న 24 బెడ్ల పీజీ భవనం',
        titlePlaceholderHi: 'उदा: बिक्री के लिए पूरी तरह संचालित 24-बेड पीजी भवन',
        descPlaceholderEn: 'Describe the property, operating status, rooms, beds, facilities, documents and handover terms…',
        descPlaceholderTe: 'ప్రాపర్టీ, గదులు, బెడ్లు, సదుపాయాలు, పత్రాలు మరియు హ్యాండోవర్ వివరాలను రాయండి…',
        descPlaceholderHi: 'प्रॉपर्टी, कमरे, बेड, सुविधाएं, दस्तावेज़ और हैंडओवर विवरण लिखें…',
        coverImageUrl: 'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=800&q=80',
        defaultPrice: '',
        defaultPriceUnit: '/property',
        fields: [
          { key: 'transactionType', labelEn: 'Transaction type *', labelTe: 'లావాదేవీ రకం *', labelHi: 'लेन-देन का प्रकार *', type: 'select', options: ['For Sale'] },
          { key: 'propertyType', labelEn: 'PG property type *', labelTe: 'పీజీ ప్రాపర్టీ రకం *', labelHi: 'पीजी प्रॉपर्टी प्रकार *', type: 'select', options: ['PG building', 'Hostel building', 'Co-living property'] },
          { key: 'ownershipStatus', labelEn: 'Ownership / handover status *', labelTe: 'యాజమాన్యం / హ్యాండోవర్ స్థితి *', labelHi: 'स्वामित्व / हैंडओवर स्थिति *', type: 'select', options: ['Owner-operated', 'Leased with transfer terms', 'Vacant property ready to operate'] },
          { key: 'roomsAndBeds', labelEn: 'Rooms and beds', labelTe: 'గదులు మరియు బెడ్లు', labelHi: 'कमरे और बेड', type: 'text', placeholder: 'e.g. 12 rooms / 24 beds' },
          { key: 'builtUpArea', labelEn: 'Built-up area', labelTe: 'నిర్మిత విస్తీర్ణం', labelHi: 'निर्मित क्षेत्र', type: 'text', placeholder: 'e.g. 4,500 sq.ft' },
          { key: 'documentsAndFacilities', labelEn: 'Documents and facilities', labelTe: 'పత్రాలు మరియు సదుపాయాలు', labelHi: 'दस्तावेज़ और सुविधाएं', type: 'text', placeholder: 'e.g. title deed, lift, parking, kitchen, approvals' },
        ],
      };
    }
    const isGirls = /girl|women|female/i.test(categoryId + catNameEn + subcategoryEn);
    const isColiving = /coliving|co-living|couple|family/i.test(categoryId + catNameEn + subcategoryEn);
    const isDaily = /daily|short|guest/i.test(categoryId + catNameEn + subcategoryEn);
    const isRoomOnly = /room-only/i.test(categoryId);
    const isNonAc = /non-ac/i.test(categoryId);
    const isLuxury = /luxury|single|studio/i.test(categoryId + catNameEn);

    const residentOptions = isGirls
      ? ['Girls / Working Women & Female Students Only', 'Women Professionals Only', 'Female College Students Only']
      : isColiving
      ? ['Co-Living (Men, Women & Couples)', 'Working Professionals & Families', 'Married Couples & IT Employees']
      : ['Boys / Men & Working Professionals', 'Male Students & Job Seekers', 'Boys / Men Only'];

    const foodOptions = isRoomOnly
      ? ['Room Only • Self-Cooking Kitchen Included', 'No Mess • Induction & Fridge Access', 'Optional Tiffin Add-on']
      : [
          '3 Times Homely South/North Indian Food',
          'Breakfast, Lunch Box & Dinner Included',
          'Pure Veg Homely Mess Included',
          'Food Optional / Self-Cooking Kitchen',
        ];

    const acOptions = isNonAc
      ? ['Non-AC Air Cooled Ventilated Rooms', 'Non-AC Deluxe with Ceiling Fan & Balcony']
      : ['AC & Non-AC Rooms Available', 'AC Rooms Only (Split AC)', 'Centralized AC Co-Living Suite'];

    return {
      providerNameEn: isGirls
        ? `Sri Lakshmi ${catNameEn}`
        : isColiving
        ? `NestAway ${catNameEn}`
        : `Sri Sai Executive ${catNameEn}`,
      providerNameTe: isGirls
        ? `శ్రీ లక్ష్మి ${catNameTe}`
        : isColiving
        ? `నెస్ట్‌అవే ${catNameTe}`
        : `శ్రీ సాయి ఎగ్జిక్యూటివ్ ${catNameTe}`,
      providerNameHi: isGirls
        ? `श्री लक्ष्मी ${catNameHi}`
        : isColiving
        ? `नेस्टअवे ${catNameHi}`
        : `श्री साईं एग्जीक्यूटिव ${catNameHi}`,
      titlePlaceholderEn: `e.g. Verified ${subcategoryEn} (${catNameEn}) with Homely Food & 5G Wi-Fi`,
      titlePlaceholderTe: `ఉదా: ధృవీకరించబడిన ${catNameTe} (${subcategoryEn}) — ఇంటి భోజనం & 5G వై-ఫై`,
      titlePlaceholderHi: `उदा: सत्यापित ${catNameHi} (${subcategoryEn}) — घर जैसा खाना और 5G वाई-फाई`,
      descPlaceholderEn: `Describe ${catNameEn} room sharing, ${subcategoryEn} bed capacity, mess menu, biometric security, and power backup...`,
      descPlaceholderTe: `${catNameTe} రూమ్ షేరింగ్, భోజనం మెనూ, వై-ఫై, వాషింగ్ మెషీన్ మరియు సెక్యూరిటీ వివరాలను రాయండి...`,
      descPlaceholderHi: `${catNameHi} रूम शेयरिंग, भोजन मेनू, वाई-फाई, वॉशिंग मशीन और सुरक्षा विवरण लिखें...`,
      coverImageUrl:
        'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=800&q=80',
      defaultPrice: isDaily ? '650' : isLuxury ? '11500' : '6800',
      defaultPriceUnit: isDaily ? '/day' : '/month',
      fields: [
        {
          key: 'sharingType',
          labelEn: `${catNameEn} — Room / Bed Configuration *`,
          labelTe: `${catNameTe} — రూమ్ / బెడ్ షేరింగ్ రకం *`,
          labelHi: `${catNameHi} — रूम / बेड शेयरिंग प्रकार *`,
          type: 'select',
          options: [
            `${subcategoryEn} (1/2/3 Sharing Available)`,
            'Single Sharing Private Room',
            '2-Sharing Deluxe Room',
            '3-Sharing Standard Room',
            '4-Sharing Budget / Dormitory Bed',
          ],
        },
        {
          key: 'residentType',
          labelEn: `${catNameEn} — Eligible Resident Policy *`,
          labelTe: `${catNameTe} — నివాసితుల విభాగం *`,
          labelHi: `${catNameHi} — निवासी नीति *`,
          type: 'select',
          options: residentOptions,
        },
        {
          key: 'foodIncluded',
          labelEn: `${catNameEn} — Food & Mess Facility *`,
          labelTe: `${catNameTe} — భోజనం & మెస్ సదుపాయం *`,
          labelHi: `${catNameHi} — भोजन और मेस सुविधा *`,
          type: 'select',
          options: foodOptions,
        },
        {
          key: 'acType',
          labelEn: `${catNameEn} — AC / Ventilation Type *`,
          labelTe: `${catNameTe} — ఏసీ / నాన్-ఏసీ సదుపాయం *`,
          labelHi: `${catNameHi} — एसी / नॉन-एसी विकल्प *`,
          type: 'select',
          options: acOptions,
        },
        {
          key: 'wifiAndBackup',
          labelEn: `${catNameEn} — Wi-Fi, Laundry & Power Backup *`,
          labelTe: `${catNameTe} — వై-ఫై, లాండ్రీ & పవర్ బ్యాకప్ *`,
          labelHi: `${catNameHi} — वाई-फाई, लॉन्ड्री और पावर बैकअप *`,
          type: 'select',
          options: [
            '5G Wi-Fi + Washing Machine + 24/7 Generator Backup',
            'High-Speed Fiber Wi-Fi + Daily Room Cleaning + RO Water',
            'Wi-Fi + Inverter Backup + Lift + Two-Wheeler Parking',
          ],
        },
        {
          key: 'securityDeposit',
          labelEn: `${catNameEn} — Deposit, Notice & Security *`,
          labelTe: `${catNameTe} — డిపాజిట్, నోటీస్ పీరియడ్ & భద్రత *`,
          labelHi: `${catNameHi} — डिपॉजिट, नोटिस पीरियड और सुरक्षा *`,
          type: 'text',
          placeholder: isGirls
            ? '1 Month Deposit • 24/7 Lady Warden • Biometric & CCTV'
            : isDaily
            ? 'Zero Deposit • Instant Daily Check-In • Govt ID Required'
            : '1 Month Deposit • 15 Days Notice • Biometric Entry & CCTV',
        },
      ],
    };
  }

  // 2. CLASSES & COACHING SECTION — tailored to the exact Class category (Software/IT, Academic, Competitive, Arts/Music, Fitness/Sports, etc.)
  if (section === 'classes') {
    const isSoftware = /software|computer|online|business|professional/i.test(categoryId);
    const isAcademic = /academic|entrance|competitive|language/i.test(categoryId);
    const isArtsFitness = /arts|fitness|cooking|beauty|religious/i.test(categoryId);

    return {
      providerNameEn: isSoftware
        ? `DurgaSoft ${catNameEn} Institute`
        : isAcademic
        ? `Sri Chaitanya & Pragathi ${catNameEn}`
        : `Kalakshetra ${catNameEn} Academy`,
      providerNameTe: isSoftware
        ? `దుర్గాసాఫ్ట్ ${catNameTe} ఇన్‌స్టిట్యూట్`
        : isAcademic
        ? `ప్రగతి ${catNameTe} అకాడమీ`
        : `కళాక్షేత్ర ${catNameTe} అకాడమీ`,
      providerNameHi: isSoftware
        ? `दुर्गासॉफ्ट ${catNameHi} संस्थान`
        : isAcademic
        ? `प्रगति ${catNameHi} अकादमी`
        : `कलाक्षेत्र ${catNameHi} अकादमी`,
      titlePlaceholderEn: `e.g. ${subcategoryEn} (${catNameEn}) — Live Classroom & Online Batch`,
      titlePlaceholderTe: `ఉదా: ${subcategoryEn} (${catNameTe}) — ఆన్‌లైన్ & ఆఫ్‌లైన్ బ్యాచ్`,
      titlePlaceholderHi: `उदा: ${subcategoryEn} (${catNameHi}) — ऑनलाइन और ऑफलाइन बैच`,
      descPlaceholderEn: `Describe ${subcategoryEn} syllabus, batch timings, hands-on training, faculty experience, and certification...`,
      descPlaceholderTe: `${subcategoryEn} సిలబస్, బ్యాచ్ సమయాలు, ప్రాక్టికల్ శిక్షణ మరియు ఫ్యాకల్టీ అనుభవం వివరాలను రాయండి...`,
      descPlaceholderHi: `${subcategoryEn} पाठ्यक्रम, बैच समय, व्यावहारिक प्रशिक्षण और फैकल्टी अनुभव का विवरण लिखें...`,
      coverImageUrl:
        'https://images.unsplash.com/photo-1524178232363-1fb2b075b655?auto=format&fit=crop&w=800&q=80',
      defaultPrice: isSoftware ? '6000' : isArtsFitness ? '2500' : '3500',
      defaultPriceUnit: isSoftware ? '/course' : '/month',
      fields: [
        {
          key: 'mode',
          labelEn: `${catNameEn} — Training Delivery Mode *`,
          labelTe: `${catNameTe} — శిక్షణ విధానం *`,
          labelHi: `${catNameHi} — प्रशिक्षण मोड *`,
          type: 'select',
          options: [
            'Online & Offline Classroom Batch',
            'Offline Classroom / Studio Training',
            'Live Interactive Online (Zoom / LMS)',
            '1-on-1 Personal / Home Tuition',
          ],
        },
        {
          key: 'batchTiming',
          labelEn: `${catNameEn} — Batch Timings (${subcategoryEn}) *`,
          labelTe: `${catNameTe} — బ్యాచ్ సమయాలు *`,
          labelHi: `${catNameHi} — बैच समय *`,
          type: 'text',
          placeholder: 'Morning 7:30 AM, Evening 6:30 PM & Weekend Batches',
        },
        {
          key: 'duration',
          labelEn: `${catNameEn} — Course Duration & Curriculum *`,
          labelTe: `${catNameTe} — కోర్సు వ్యవధి & సిలబస్ *`,
          labelHi: `${catNameHi} — कोर्स अवधि और पाठ्यक्रम *`,
          type: 'text',
          placeholder: isSoftware
            ? `3 Months (${subcategoryEn} + 2 Real-Time Live Projects)`
            : isAcademic
            ? `Monthly / Full Academic Year (${subcategoryEn} + Weekly Tests)`
            : `3 Months Regular Practice (${subcategoryEn} Stage / Studio Prep)`,
        },
        {
          key: 'demoAvailable',
          labelEn: `${catNameEn} — Free Trial / Demo Class *`,
          labelTe: `${catNameTe} — ఉచిత డెమో క్లాసులు *`,
          labelHi: `${catNameHi} — मुफ्त डेमो क्लासेस *`,
          type: 'select',
          options: [
            '2 Free Live Demo Classes Available',
            '1 Free Trial Session + Assessment',
            'Direct Batch Enrollment',
          ],
        },
        {
          key: 'certification',
          labelEn: `${catNameEn} — Certificate & Outcome Support *`,
          labelTe: `${catNameTe} — సర్టిఫికేట్ & సహాయం *`,
          labelHi: `${catNameHi} — सर्टिफिकेट और सहायता *`,
          type: 'select',
          options: isSoftware
            ? [
                'ISO Certificate + 100% Placement & Resume Support',
                'Course Completion Certificate + Mock Interviews',
              ]
            : isAcademic
            ? [
                'Weekly Grand Tests + Printed Study Material + Rank Tracking',
                'Board / Competitive Exam Mentorship + Doubt Sessions',
              ]
            : [
                'Government / Academy Grade Certificate + Stage Performance',
                'Certified Professional Skill Completion Certificate',
              ],
        },
        {
          key: 'trainerExperience',
          labelEn: `${catNameEn} — Trainer / Faculty Qualification *`,
          labelTe: `${catNameTe} — ఫ్యాకల్టీ / ట్రైనర్ అనుభవం *`,
          labelHi: `${catNameHi} — प्रशिक्षक / फैकल्टी अनुभव *`,
          type: 'text',
          placeholder: isSoftware
            ? '12+ Yrs Real-Time IT Architect & Lead Trainer'
            : '10+ Yrs Certified Senior Faculty & Subject Expert',
        },
      ],
    };
  }

  // 3. FUNCTIONAL HALLS & VENUES SECTION — tailored to Marriage Halls, Banquet, Sports Turf, Corporate Conference, Studios, Resorts, etc.
  if (section === 'venues') {
    const isSports = /sport|turf|stadium|ground/i.test(categoryId + catNameEn + subcategoryEn);
    const isCorporate = /corporate|conference|meeting|training|exhibition/i.test(categoryId + catNameEn);
    return {
      providerNameEn: 'Enter your registered venue or business name',
      providerNameTe: 'మీ నమోదు చేసిన వేదిక లేదా వ్యాపార పేరును నమోదు చేయండి',
      providerNameHi: 'अपना पंजीकृत स्थल या व्यवसाय का नाम दर्ज करें',
      titlePlaceholderEn: `e.g. Grand ${subcategoryEn} (${catNameEn}) with Valet Parking & AC`,
      titlePlaceholderTe: `ఉదా: గ్రాండ్ ${subcategoryEn} (${catNameTe}) — ఏసీ & వాలెట్ పార్కింగ్`,
      titlePlaceholderHi: `उदा: ग्रैंड ${subcategoryEn} (${catNameHi}) — एसी और वैले पार्किंग`,
      descPlaceholderEn: `Describe ${subcategoryEn} seating capacity, dining hall, AC, valet parking, generator backup, and booking packages...`,
      descPlaceholderTe: `${subcategoryEn} సీటింగ్ కెపాసిటీ, డైనింగ్ హాల్, ఏసీ, పార్కింగ్ మరియు ప్యాకేజీ వివరాలను రాయండి...`,
      descPlaceholderHi: `${subcategoryEn} सीटिंग क्षमता, डाइनिंग हॉल, एसी, पार्किंग और पैकेज विवरण लिखें...`,
      coverImageUrl: '',
      defaultPrice: '',
      defaultPriceUnit: isSports ? '/hr' : '/day',
      fields: [
        {
          key: 'seatingCapacity',
          labelEn: `${catNameEn} — Guest Seating & Floating Capacity *`,
          labelTe: `${catNameTe} — సీటింగ్ & గెస్ట్ కెపాసిటీ *`,
          labelHi: `${catNameHi} — सीटिंग और गेस्ट क्षमता *`,
          type: 'text',
          placeholder: isSports
            ? '22 Players Turf + 100 Spectator Dugout Seating'
            : isCorporate
            ? '150 Theater / Boardroom Seating + VIP Lounge'
            : '600 Seating / 1500 Floating Guests + Dining Hall',
        },
        {
          key: 'acHallType',
          labelEn: `${catNameEn} — Venue Configuration (${subcategoryEn}) *`,
          labelTe: `${catNameTe} — వెన్యూ & హాల్ రకం *`,
          labelHi: `${catNameHi} — वेन्यू और हॉल प्रकार *`,
          type: 'select',
          options: isSports
            ? [
                'FIFA Grade Floodlit Synthetic Turf + Dugout',
                'Indoor Wooden Badminton / Multi-Sport Arena',
                'Open Cricket Ground with Practice Nets',
              ]
            : [
                `${subcategoryEn} — Centralized AC Hall + Lawn`,
                'Luxury Pillarless AC Convention & Dining Hall',
                'Open-Air Lawn, Poolside & Resort Venue',
                'AC Boardroom / Auditorium with 4K Projector',
              ],
        },
        {
          key: 'parkingCapacity',
          labelEn: `${catNameEn} — Valet & Vehicle Parking Capacity *`,
          labelTe: `${catNameTe} — పార్కింగ్ కెపాసిటీ *`,
          labelHi: `${catNameHi} — पार्किंग क्षमता *`,
          type: 'text',
          placeholder: '150 Cars + 300 Two-Wheelers Dedicated Valet Parking',
        },
        {
          key: 'cateringPolicy',
          labelEn: `${catNameEn} — Catering, Dining & Refreshments *`,
          labelTe: `${catNameTe} — క్యాటరింగ్ & డైనింగ్ పాలసీ *`,
          labelHi: `${catNameHi} — कैटरिंग और डाइनिंग नीति *`,
          type: 'select',
          options: [
            'In-House & Outside Catering Allowed',
            'Multi-Cuisine In-House Buffet Catering Included',
            'Pure Vegetarian Traditional Catering Only',
            'Refreshment Cafe & Beverage Counter On-Site',
          ],
        },
        {
          key: 'guestRooms',
          labelEn: `${catNameEn} — AC Guest / Green Rooms & Power Backup *`,
          labelTe: `${catNameTe} — గెస్ట్ రూమ్స్ & పవర్ బ్యాకప్ *`,
          labelHi: `${catNameHi} — गेस्ट रूम और पावर बैकअप *`,
          type: 'text',
          placeholder: isSports
            ? 'AC Changing Rooms + Lockers + Washrooms + Floodlight Backup'
            : '6 AC Bridal & Family Suites + 100% DG Generator Backup',
        },
        {
          key: 'decorationSound',
          labelEn: `${catNameEn} — Stage Decor, Lighting & Audio/AV *`,
          labelTe: `${catNameTe} — డెకరేషన్, లైటింగ్ & సౌండ్ *`,
          labelHi: `${catNameHi} — डेकोरेशन, लाइटिंग और साउंड *`,
          type: 'select',
          options: [
            'Floral Stage Decor + Line-Array DJ Sound + LED Wall',
            '4K Projector + Wireless Mics + Podium AV System',
            'Custom Theme Decor & Outside Decorator Permitted',
          ],
        },
      ],
    };
  }

  // 4. HOME & URBAN SERVICES SECTION — tailored to each specific Service Category (`cat-4` Appliance, `cat-5` Carpenter, `cat-1` Cleaning, `cat-2` Electrician, `cat-3` Plumber, `cat-6` Painting, `srv-salon`, `srv-packers`, `srv-pest`, `srv-cctv`)
  if (section === 'services') {
    const isAppliance = categoryId === 'cat-4';
    const isCarpenter = categoryId === 'cat-5';
    const isCleaning = categoryId === 'cat-1';
    const isElectrician = categoryId === 'cat-2';
    const isPlumber = categoryId === 'cat-3';
    const isPainting = categoryId === 'cat-6';
    const isSalon = categoryId === 'srv-salon';
    const isPackers = categoryId === 'srv-packers';
    const isPest = categoryId === 'srv-pest';

    const toolsOptions = isAppliance
      ? [
          'Genuine OEM Spares (LG/Samsung/Daikin) + Foam Jet Kit',
          'R32/R410 Gas Charging + Digital Clamp Meter',
        ]
      : isCarpenter
      ? [
          'Bosch Power Carpentry Tools + Hettich/Ebco Hardware',
          'BWP Marine Plywood + Termite-Proof Adhesive',
        ]
      : isCleaning
      ? [
          'Industrial Single-Disc Scrubber + Taski Eco Chemicals',
          'High-Suction Wet/Dry Vacuum + Steam Sanitizer',
        ]
      : isElectrician
      ? [
          'Finolex/Havells ISI Wires + Legrand/Anchor Modular Spares',
          'Digital Earth & Continuity Tester + Insulated Tool Kit',
        ]
      : isPlumber
      ? [
          'Jaquar/Kohler Genuine Spares + Astral CPVC Fittings',
          'Motorized Drain Snake + Acoustic Leak Detector',
        ]
      : isPainting
      ? [
          'Asian Paints Royale / Apex Ultima + Dustless Vacuum Sander',
          'Berger Silk + Laser Wall Moisture Meter + Masking',
        ]
      : isSalon
      ? [
          '100% Sealed Mono-Dose Kits (O3+ / L’Oreal / MAC)',
          'Disposable Sheets + Sterilized Beauty Equipment',
        ]
      : isPackers
      ? [
          '3-Layer Bubble Wrap + Corrugated Boxes + Closed Container Truck',
          'Hydraulic Trolley + Wardrobe Carton + Stretch Film',
        ]
      : isPest
      ? [
          'Govt CIB Approved Odorless Bayer Herbal Gel & Spray',
          'Anti-Termite Drill-Fill-Seal Chemical Barrier',
        ]
      : [
          'Hikvision / CP Plus IP Cameras + Mobile App Cloud Setup',
          'Biometric Time-Attendance + Smart Video Door Phone',
        ];

    return {
      providerNameEn: `UrbanPro ${catNameEn} Specialists`,
      providerNameTe: `అర్బన్‌ప్రో ${catNameTe} నిపుణులు`,
      providerNameHi: `अर्बनप्रो ${catNameHi} विशेषज्ञ`,
      titlePlaceholderEn: `e.g. Certified ${subcategoryEn} (${catNameEn}) — Doorstep Service`,
      titlePlaceholderTe: `ఉదా: సర్టిఫైడ్ ${subcategoryEn} (${catNameTe}) — డోర్‌స్టెప్ సర్వీస్`,
      titlePlaceholderHi: `उदा: प्रमाणित ${subcategoryEn} (${catNameHi}) — डोरस्टेप सर्विस`,
      descPlaceholderEn: `Describe ${subcategoryEn} scope, genuine spares/materials used, technician experience, and post-service warranty...`,
      descPlaceholderTe: `${subcategoryEn} పని వివరాలు, ఒరిజినల్ స్పేర్ పార్ట్స్, టెక్నీషియన్ అనుభవం మరియు వారంటీ వివరాలను రాయండి...`,
      descPlaceholderHi: `${subcategoryEn} कार्य विवरण, ओरिजिनल स्पेयर पार्ट्स, तकनीशियन अनुभव और वारंटी लिखें...`,
      coverImageUrl:
        'https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=800&q=80',
      defaultPrice: isPackers ? '3499' : isPainting ? '14' : isSalon ? '799' : '449',
      defaultPriceUnit: isPackers ? '/shifting' : isPainting ? '/sq.ft' : '/visit',
      fields: [
        {
          key: 'serviceMode',
          labelEn: `${catNameEn} — Doorstep Visit & Response Time *`,
          labelTe: `${catNameTe} — సర్వీస్ విజిట్ & సమయం *`,
          labelHi: `${catNameHi} — सर्विस विजिट और समय *`,
          type: 'select',
          options: [
            `Express Doorstep ${subcategoryEn} within 30–45 Mins`,
            'Same-Day Scheduled Home Visit Slot',
            'On-Site Inspection & Turnkey Execution',
          ],
        },
        {
          key: 'toolsAndSpares',
          labelEn: `${catNameEn} — Equipment, Spares & Brands Used *`,
          labelTe: `${catNameTe} — పరికరాలు & బ్రాండెడ్ మెటీరియల్స్ *`,
          labelHi: `${catNameHi} — उपकरण और ब्रांडेड सामग्री *`,
          type: 'select',
          options: toolsOptions,
        },
        {
          key: 'warrantyPeriod',
          labelEn: `${catNameEn} — Service Warranty & Guarantee *`,
          labelTe: `${catNameTe} — సర్వీస్ వారంటీ & భరోసా *`,
          labelHi: `${catNameHi} — सर्विस वारंटी और गारंटी *`,
          type: 'select',
          options: [
            '90 Days Post-Service & Spare Replacement Warranty',
            '30 Days Free Re-Service Assurance',
            '1 Year Comprehensive AMC / Product Warranty',
          ],
        },
        {
          key: 'visitingCharge',
          labelEn: `${catNameEn} — Inspection / Visiting Fee Policy *`,
          labelTe: `${catNameTe} — విజిటింగ్ / ఇన్‌స్పెక్షన్ ఛార్జ్ *`,
          labelHi: `${catNameHi} — विजिटिंग / निरीक्षण शुल्क *`,
          type: 'text',
          placeholder: '₹99 Inspection (100% Waived on Service Confirmation)',
        },
        {
          key: 'experienceYears',
          labelEn: `${catNameEn} — Specialist / Crew Qualification *`,
          labelTe: `${catNameTe} — నిపుణుల అనుభవం *`,
          labelHi: `${catNameHi} — विशेषज्ञ अनुभव *`,
          type: 'text',
          placeholder: `10+ Years Certified ${catNameEn} Professionals (Police Verified)`,
        },
        {
          key: 'emergencySupport',
          labelEn: `${catNameEn} — Working Hours & Emergency Slot *`,
          labelTe: `${catNameTe} — అందుబాటు సమయాలు *`,
          labelHi: `${catNameHi} — उपलब्धता समय *`,
          type: 'select',
          options: [
            '7 Days a Week (7:00 AM – 9:30 PM) + Express Slot',
            '24/7 Emergency Breakdown Support Available',
          ],
        },
      ],
    };
  }

  // 5. HOTEL & STAY SECTION — tailored to Luxury Hotels, Budget Stays, Hourly Rooms, Couple Friendly, Resorts, Service Apartments, etc.
  if (section === 'hotel_stay') {
    const isHourly = categoryId === 'hotel-hourly';
    const isCouple = categoryId === 'hotel-couple';
    const isResort = categoryId === 'hotel-resorts';

    return {
      providerNameEn: isResort
        ? `Palm Exotica ${catNameEn}`
        : `Royal Orchid ${catNameEn}`,
      providerNameTe: isResort
        ? `పామ్ ఎక్సోటికా ${catNameTe}`
        : `రాయల్ ఆర్కిడ్ ${catNameTe}`,
      providerNameHi: isResort
        ? `पाम एक्सोटिका ${catNameHi}`
        : `रॉयल ऑर्किड ${catNameHi}`,
      titlePlaceholderEn: `e.g. ${subcategoryEn} (${catNameEn}) — Free Breakfast & 5G Wi-Fi`,
      titlePlaceholderTe: `ఉదా: ${subcategoryEn} (${catNameTe}) — ఉచిత బ్రేక్‌ఫాస్ట్ & 5G వై-ఫై`,
      titlePlaceholderHi: `उदा: ${subcategoryEn} (${catNameHi}) — मुफ्त ब्रेकफास्ट और 5G वाई-फाई`,
      descPlaceholderEn: `Describe ${subcategoryEn} room amenities, check-in policy, king bed, swimming pool/dining, and guest ID acceptance...`,
      descPlaceholderTe: `${subcategoryEn} రూమ్ సదుపాయాలు, చెక్-ఇన్ సమయం, బ్రేక్‌ఫాస్ట్ మరియు గెస్ట్ ఐడి పాలసీ వివరాలను రాయండి...`,
      descPlaceholderHi: `${subcategoryEn} रूम सुविधाएं, चेक-इन समय, ब्रेकफास्ट और गेस्ट आईडी नीति का विवरण लिखें...`,
      coverImageUrl:
        'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80',
      defaultPrice: isHourly ? '899' : isResort ? '5499' : '2299',
      defaultPriceUnit: isHourly ? '/day' : '/night',
      fields: [
        {
          key: 'roomCategory',
          labelEn: `${catNameEn} — Room / Suite Category *`,
          labelTe: `${catNameTe} — రూమ్ / సూట్ రకం *`,
          labelHi: `${catNameHi} — रूम / सुइट श्रेणी *`,
          type: 'select',
          options: [
            `${subcategoryEn} (King AC Room)`,
            'Executive Club AC Suite with Work Desk',
            'Family Interconnected 4-Bed Suite',
            'Private Pool Villa / Lawn Cottage',
          ],
        },
        {
          key: 'checkInCheckOut',
          labelEn: `${catNameEn} — Check-In & Check-Out Timing *`,
          labelTe: `${catNameTe} — చెక్-ఇన్ & చెక్-అవుట్ సమయం *`,
          labelHi: `${catNameHi} — चेक-इन और चेक-आउट समय *`,
          type: 'text',
          placeholder: isHourly
            ? 'Flexible 3h / 6h / 12h Hourly Slots (24/7 Check-In)'
            : '12:00 PM Check-In / 11:00 AM Check-Out (24/7 Front Desk)',
        },
        {
          key: 'breakfastWifi',
          labelEn: `${catNameEn} — Meal Plan & Wi-Fi Inclusions *`,
          labelTe: `${catNameTe} — బ్రేక్‌ఫాస్ట్ & వై-ఫై సదుపాయాలు *`,
          labelHi: `${catNameHi} — ब्रेकफास्ट और वाई-फाई सुविधाएं *`,
          type: 'select',
          options: [
            'Complimentary Buffet Breakfast + Free 5G Wi-Fi',
            'Room Only + Free High-Speed Wi-Fi + 24/7 Room Service',
            'MAP / AP All-Meals Resort Package Included',
          ],
        },
        {
          key: 'coupleFriendly',
          labelEn: `${catNameEn} — Guest & Local ID Policy *`,
          labelTe: `${catNameTe} — గెస్ట్ & ఐడి పాలసీ *`,
          labelHi: `${catNameHi} — गेस्ट और आईडी नीति *`,
          type: 'select',
          options: isCouple
            ? [
                '100% Couple Friendly • Local & Outstation Govt ID Accepted',
                'Unmarried Couples Welcome (21+ Age with Aadhaar/DL)',
              ]
            : [
                'Families, Corporate & Couple Friendly (Govt ID Accepted)',
                'All Verified Guests (Aadhaar / Passport / Driving License)',
              ],
        },
        {
          key: 'cancellationPolicy',
          labelEn: `${catNameEn} — Cancellation & Payment Mode *`,
          labelTe: `${catNameTe} — క్యాన్సిలేషన్ & పేమెంట్ విధానం *`,
          labelHi: `${catNameHi} — रद्दीकरण और भुगतान नीति *`,
          type: 'select',
          options: [
            'Free Cancellation till Check-In • Pay at Hotel Available',
            'Instant Confirmed Booking • UPI / Credit Card / Corporate GST',
          ],
        },
        {
          key: 'parkingPoolGym',
          labelEn: `${catNameEn} — Hotel Amenities & Parking *`,
          labelTe: `${catNameTe} — హోటల్ సదుపాయాలు & పార్కింగ్ *`,
          labelHi: `${catNameHi} — होटल सुविधाएं और पार्किंग *`,
          type: 'text',
          placeholder: isResort
            ? 'Swimming Pool + Lawn + Bonfire + Multi-Cuisine Restaurant'
            : 'Covered Valet Parking + Multi-Cuisine Restaurant + Lift',
        },
      ],
    };
  }

  // 6. MOVIES, MULTIPLEXES & LIVE SHOWS SECTION — tailored to Telugu, Pan-India, Hollywood/IMAX, Multiplexes, Standup, Concerts, Drive-In
  const isLiveShow = /standup|concert/i.test(categoryId);
  return {
    providerNameEn: isLiveShow
      ? `Shilpakala & Live Arena (${catNameEn})`
      : `AMB Cinemas & Prasads (${catNameEn})`,
    providerNameTe: isLiveShow
      ? `శిల్పకళా & లైవ్ ఎరీనా (${catNameTe})`
      : `ఏఎంబీ & ప్రసాద్స్ మల్టీప్లెక్స్ (${catNameTe})`,
    providerNameHi: isLiveShow
      ? `शिल्पकला और लाइव एरिना (${catNameHi})`
      : `एएमबी और प्रसाद मल्टीप्लेक्स (${catNameHi})`,
    titlePlaceholderEn: `e.g. ${subcategoryEn} (${catNameEn}) — Dolby Atmos & VIP Recliners`,
    titlePlaceholderTe: `ఉదా: ${subcategoryEn} (${catNameTe}) — డాల్బీ అట్మాస్ & విఐపి రిక్లైనర్స్`,
    titlePlaceholderHi: `उदा: ${subcategoryEn} (${catNameHi}) — डॉल्बी एटमॉस और वीआईपी रिक्लाइनर`,
    descPlaceholderEn: `Describe ${subcategoryEn} screen format, show timings, recliner seating tiers, F&B counter, and QR M-Ticket entry...`,
    descPlaceholderTe: `${subcategoryEn} స్క్రీన్ ఫార్మాట్, షో సమయాలు, రిక్లైనర్ సీట్లు మరియు క్యూఆర్ టికెట్ వివరాలను రాయండి...`,
    descPlaceholderHi: `${subcategoryEn} स्क्रीन प्रारूप, शो समय, रिक्लाइनर सीटें और क्यूआर टिकट विवरण लिखें...`,
    coverImageUrl:
      'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=800&q=80',
    defaultPrice: isLiveShow ? '499' : '295',
    defaultPriceUnit: isLiveShow ? '/pass' : '/ticket',
    fields: [
      {
        key: 'screenSoundFormat',
        labelEn: `${catNameEn} — Screen / Stage & Sound Format *`,
        labelTe: `${catNameTe} — స్క్రీన్ & సౌండ్ టెక్నాలజీ *`,
        labelHi: `${catNameHi} — स्क्रीन और साउंड तकनीक *`,
        type: 'select',
        options: isLiveShow
          ? [
              'Live Acoustic Auditorium + Line-Array Concert Sound',
              'Intimate Comedy Club Stage + Cabaret Seating',
              'Open-Air Festival Arena + Giant LED Backdrop',
            ]
          : [
              '4K Barco Laser Projection + Dolby Atmos 64-Channel',
              'IMAX 3D / 2D Giant Screen Experience',
              'Luxury Gold Class VIP Recliner Cinema',
              'Open-Air Rooftop / Drive-In 4K Screen',
            ],
      },
      {
        key: 'showTimings',
        labelEn: `${catNameEn} — Daily Show / Event Timings *`,
        labelTe: `${catNameTe} — షో / ఈవెంట్ సమయాలు *`,
        labelHi: `${catNameHi} — शो / इवेंट का समय *`,
        type: 'text',
        placeholder: isLiveShow
          ? 'Evening 6:30 PM & 9:00 PM Live Shows (Doors Open 30m Early)'
          : '11:00 AM • 2:30 PM • 6:15 PM • 9:45 PM (4 Daily Shows)',
      },
      {
        key: 'seatCategories',
        labelEn: `${catNameEn} — Seating Tiers & Ticket Classes *`,
        labelTe: `${catNameTe} — సీటింగ్ తరగతులు *`,
        labelHi: `${catNameHi} — सीटिंग श्रेणियां *`,
        type: 'text',
        placeholder: isLiveShow
          ? 'VIP Front Row • Fan Pit • Platinum Gallery'
          : 'VIP Motorized Recliner • Executive Lounger • Royal Sofa',
      },
      {
        key: 'languageFormat',
        labelEn: `${catNameEn} — Audio Language & Subtitles *`,
        labelTe: `${catNameTe} — భాషలు & సబ్‌టైటిల్స్ *`,
        labelHi: `${catNameHi} — भाषाएं और सबटाइटल *`,
        type: 'select',
        options: [
          'Telugu • Hindi • English (With English Subtitles)',
          'Telugu Original & Pan-India Multi-Audio',
          'English IMAX 3D / 4DX & Dubbed Versions',
        ],
      },
      {
        key: 'foodBeverage',
        labelEn: `${catNameEn} — Popcorn, Cafe & In-Seat Ordering *`,
        labelTe: `${catNameTe} — ఫుడ్ కోర్ట్ & సీట్ డెలివరీ *`,
        labelHi: `${catNameHi} — फूड कोर्ट और सीट डिलीवरी *`,
        type: 'select',
        options: [
          'QR In-Seat Gourmet Popcorn, Nachos & Beverage Delivery',
          'Multiplex Food Court, Live Kitchen & Coffee Lounge',
        ],
      },
      {
        key: 'mTicketParking',
        labelEn: `${catNameEn} — M-Ticket Entry & Mall Parking *`,
        labelTe: `${catNameTe} — ఎం-టికెట్ ఎంట్రీ & పార్కింగ్ *`,
        labelHi: `${catNameHi} — एम-टिकट एंट्री और पार्किंग *`,
        type: 'select',
        options: [
          'Paperless QR M-Ticket Direct Scan + 4-Level Mall Parking',
          'Fast-Track Box Office Pickup + Valet Parking',
        ],
      },
    ],
  };
}

export const PostListingWizard: React.FC<PostListingWizardProps> = ({
  isOpen,
  onClose,
  onPostSuccess,
  onOpenAdminReview,
  currentLang = 'en',
  defaultSection = 'pg_hostels',
  defaultCategory = 'all',
  defaultSubcategory = 'all',
}) => {
  const { categories, postingPlans, authUser } = useMarketplace();
  const ui = getUILabels(currentLang);

  const loc = (enText: string, teText?: string, hiText?: string) => {
    if (currentLang === 'en') return enText;
    if (currentLang === 'te' && teText) return teText;
    if (currentLang === 'hi' && hiText) return hiText;
    return transliterateLatinToScript(enText, currentLang);
  };

  const tDict = (key: keyof typeof WIZARD_DICT): string => {
    const entry = WIZARD_DICT[key];
    if (!entry) return '';
    const direct = entry[currentLang];
    if (direct) return direct;
    return transliterateLatinToScript(entry.en, currentLang);
  };

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Section & Category States
  const [selectedSection, setSelectedSection] = useState<MarketSectionType>(defaultSection);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('pg-boys');
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>("Men's hostel");
  const [adminVenueCategories,setAdminVenueCategories]=useState<any[]>([]);
  useEffect(()=>{if(!isOpen||selectedSection!=='venues')return;let live=true;fetch('/api/venues/categories').then(r=>r.ok?r.json():Promise.reject()).then(d=>{if(live&&Array.isArray(d.categories))setAdminVenueCategories(d.categories.map((c:any)=>({id:c.id,name:c.label,nameTe:c.label,nameHi:c.label,emoji:c.emoji,subcategories:(c.subcategories||[]).map((label:string)=>({en:label,te:label,hi:label}))})));}).catch(()=>{if(live)setAdminVenueCategories([]);});return()=>{live=false;};},[isOpen,selectedSection]);

  const getSectionCategoryList = (sec: MarketSectionType) =>
    sec === 'pg_hostels'
      ? pg29Categories
      : sec === 'classes'
      ? classCategories
      : sec === 'venues'
      ? adminVenueCategories.length?adminVenueCategories:venue12Categories
      : sec === 'services'
      ? servicesCategories
      : sec === 'hotel_stay'
      ? hotelStayCategories
      : moviesCategories;

  const sectionCategoryList = getSectionCategoryList(selectedSection);
  const activeSectionCat =
    sectionCategoryList.find((c) => c.id === selectedCategoryId) || sectionCategoryList[0];

  const categoryConfig = useMemo(() => {
    const cat = activeSectionCat || sectionCategoryList[0];
    return buildCategorySpecificProviderConfig(
      selectedSection,
      cat?.id || selectedCategoryId,
      cat?.name || 'Category',
      (cat as any)?.nameTe || cat?.name || 'కేటగిరీ',
      (cat as any)?.nameHi || cat?.name || 'श्रेणी',
      selectedSubcategory
    );
  }, [selectedSection, selectedCategoryId, activeSectionCat, sectionCategoryList, selectedSubcategory]);

  const getLocalizedProviderNameFromConfig = (cfg: CategoryProviderConfig, lang: AppLanguage) => {
    if (lang === 'te') return cfg.providerNameTe;
    if (lang === 'hi') return cfg.providerNameHi;
    if (lang === 'en') return cfg.providerNameEn;
    return transliterateLatinToScript(cfg.providerNameEn, lang);
  };

  const getDefaultAdminNote = (lang: AppLanguage) =>
    lang === 'te'
      ? 'ప్రొవైడర్ మరియు లిస్టింగ్ వివరాలను పరిశీలించి ప్రచురణకు ముందు ఆమోదించండి.'
      : lang === 'hi'
      ? 'प्रकाशित करने से पहले प्रोवाइडर और लिस्टिंग विवरण की समीक्षा करके स्वीकृत करें।'
      : lang === 'en'
      ? 'Please review the provider and listing details before publication.'
      : transliterateLatinToScript(
          'Please review the provider and listing details before publication.',
          lang
        );

  // Provider Registration States
  const [providerName, setProviderName] = useState(authUser?.name || '');
  const [providerPhone, setProviderPhone] = useState('');
  const [providerEmail, setProviderEmail] = useState('');
  const [providerRegistrationNote, setProviderRegistrationNote] = useState(() =>
    getDefaultAdminNote(currentLang)
  );

  // Listing Form States
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [priceUnit, setPriceUnit] = useState('');
  const [city, setCity] = useState('');
  const [area, setArea] = useState('');
  const [pincode, setPincode] = useState('');
  const [runningBatchUrl, setRunningBatchUrl] = useState('');

  // Dynamic custom field values initialized strictly for the selected category
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, any>>({});
  const [isObjectEditorOpen, setIsObjectEditorOpen] = useState<boolean>(false);
  const [dynamicWebElements, setDynamicWebElements] = useState<CustomWebElementSpec[]>(() =>
    getSectionScopedElements(defaultSection)
  );

  useEffect(() => {
    const syncElements = () => {
      setDynamicWebElements(getSectionScopedElements(selectedSection));
    };
    syncElements();
    window.addEventListener('bos-universal-elements-updated', syncElements);
    return () => window.removeEventListener('bos-universal-elements-updated', syncElements);
  }, [selectedSection]);

  // All-Format Listing Images State
  const [imageItems, setImageItems] = useState<ProviderListingImageItem[]>(
    categoryConfig.coverImageUrl
      ? [{ url: categoryConfig.coverImageUrl, format: 'JPG', name: 'category-cover.jpg', isCover: true }]
      : [],
  );
  const [newImageUrl, setNewImageUrl] = useState('');
  const [isDraggingImages, setIsDraggingImages] = useState(false);

  // Optional Batch Schedule Images (Classes Only)
  const [batchScheduleImageItems, setBatchScheduleImageItems] = useState<ProviderListingImageItem[]>([]);
  const [uploadFeedback, setUploadFeedback] = useState<string | null>(null);
  const localMediaUrlsRef = useRef(new Set<string>());
  useEffect(() => () => {
    localMediaUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    localMediaUrlsRef.current.clear();
  }, []);

  const fileInputStep2Ref = useRef<HTMLInputElement | null>(null);
  const batchFileInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputStep3Ref = useRef<HTMLInputElement | null>(null);

  // Selected Posting Plan / Platform fee
  const [selectedPlanId, setSelectedPlanId] = useState(postingPlans[0]?.id || 'plan-basic');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [providerSubmissionMessage, setProviderSubmissionMessage] = useState<string | null>(null);
  const [submittedPendingListing, setSubmittedPendingListing] = useState<any | null>(null);

  // Apply category-specific defaults whenever categoryConfig changes
  const applyCategoryConfigDefaults = (cfg: CategoryProviderConfig) => {
    setProviderName(authUser?.name || '');
    setPrice('');
    setPriceUnit('');
    const nextFields: Record<string, string> = {};
    cfg.fields.forEach((f) => {
      nextFields[f.key] = '';
    });
    setCustomFieldValues(nextFields);
    setImageItems((prev) => {
      if (prev.length === 1 && prev[0].name === 'category-cover.jpg') {
        return [{ url: cfg.coverImageUrl, format: 'JPG', name: 'category-cover.jpg', isCover: true }];
      }
      return prev;
    });
  };

  const handleSectionSelect = (
    sec: MarketSectionType,
    preferredCatId?: string,
    preferredSubcat?: string
  ) => {
    setSelectedSection(sec);
    const list = getSectionCategoryList(sec);
    if (list.length > 0) {
      const targetCat =
        (preferredCatId && preferredCatId !== 'all'
          ? list.find((c) => c.id === preferredCatId)
          : undefined) || list[0];
      setSelectedCategoryId(targetCat.id);

      const firstSubObj = targetCat.subcategories[0] as any;
      const fallbackSub = typeof firstSubObj === 'string' ? firstSubObj : firstSubObj.en;
      const validPreferredSub =
        preferredSubcat &&
        preferredSubcat !== 'all' &&
        targetCat.subcategories.some(
          (s: any) => (typeof s === 'string' ? s : s.en) === preferredSubcat
        )
          ? preferredSubcat
          : fallbackSub;

      setSelectedSubcategory(validPreferredSub);

      const cfg = buildCategorySpecificProviderConfig(
        sec,
        targetCat.id,
        targetCat.name,
        (targetCat as any).nameTe || targetCat.name,
        (targetCat as any).nameHi || targetCat.name,
        validPreferredSub
      );
      applyCategoryConfigDefaults(cfg);
    }

    if (sec !== 'classes') {
      setRunningBatchUrl('');
      setBatchScheduleImageItems([]);
    }
  };

  const handleCategorySelect = (catId: string) => {
    setSelectedCategoryId(catId);
    const secCat = sectionCategoryList.find((c) => c.id === catId);
    if (secCat && secCat.subcategories.length > 0) {
      const firstSub = secCat.subcategories[0] as any;
      const subEn = typeof firstSub === 'string' ? firstSub : firstSub.en;
      setSelectedSubcategory(subEn);
      const cfg = buildCategorySpecificProviderConfig(
        selectedSection,
        secCat.id,
        secCat.name,
        (secCat as any).nameTe || secCat.name,
        (secCat as any).nameHi || secCat.name,
        subEn
      );
      applyCategoryConfigDefaults(cfg);
      return;
    }
    const cat = categories.find((c) => c.id === catId);
    if (cat && cat.subcategories.length > 0) {
      setSelectedSubcategory(cat.subcategories[0]);
    }
  };

  const handleSubcategorySelect = (subEn: string) => {
    setSelectedSubcategory(subEn);
    if (activeSectionCat) {
      const cfg = buildCategorySpecificProviderConfig(
        selectedSection,
        activeSectionCat.id,
        activeSectionCat.name,
        (activeSectionCat as any).nameTe || activeSectionCat.name,
        (activeSectionCat as any).nameHi || activeSectionCat.name,
        subEn
      );
      applyCategoryConfigDefaults(cfg);
    }
  };

  // Sync with parent section, category, subcategory, and language when modal opens or changes
  useEffect(() => {
    if (isOpen) {
      handleSectionSelect(defaultSection, defaultCategory, defaultSubcategory);
    }
  }, [isOpen, defaultSection, defaultCategory, defaultSubcategory]);

  useEffect(() => {
    setProviderName(authUser?.name || '');
    setCity('');
    setArea('');
    setProviderRegistrationNote(getDefaultAdminNote(currentLang));
  }, [currentLang, authUser?.name]);

  if (!isOpen) return null;
  if (!authUser || !['provider', 'admin'].includes(authUser.role)) {
    return <ProviderOnboardingForm authUser={authUser} defaultSection={defaultSection} onClose={onClose} />;
  }

  const matchedLegacyCat =
    categories.find((c) => c.id === selectedCategoryId) || categories[0];

  const selectedPlan = postingPlans.find((p) => p.id === selectedPlanId) || postingPlans[0];

  const handleCustomFieldChange = (key: string, value: any) => {
    setCustomFieldValues((prev) => ({ ...prev, [key]: value }));
  };

  // Universal Multi-Format Image File Reader
  const processUploadedFiles = async (
    files: FileList | File[],
    target: 'listing' | 'batch' = 'listing'
  ) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    const accepted: ProviderListingImageItem[] = [];
    const rejected: string[] = [];
    for (const file of fileArray) {
      try {
        const inspected = await inspectMediaFile(file);
        if (inspected.kind !== 'image') throw new Error('Only images can be used as listing photos.');
        const safeFile = inspected.format === 'svg' ? await sanitizeSvgFile(file) : file;
        const processedImage = await createResponsiveImageVariants(safeFile).catch(() => null);
        const url = URL.createObjectURL(safeFile);
        localMediaUrlsRef.current.add(url);
        accepted.push({ url, format: inspected.format.toUpperCase(), name: file.name || `image.${inspected.format}`, file: safeFile, inspected, processedImage });
      } catch (error) {
        rejected.push(`${file.name}: ${error instanceof Error ? error.message : 'Unsupported image.'}`);
      }
    }
    if (accepted.length) {
      if (target === 'batch') setBatchScheduleImageItems((prev) => [...prev, ...accepted]);
      else setImageItems((prev) => {
        return normalizeListingCovers([...prev, ...accepted]);
      });
    }
    const resultText = `Added ${accepted.length} inspected image(s)${rejected.length ? `. Rejected: ${rejected.join('; ')}` : ''}`;
    setUploadFeedback(loc(resultText, resultText, resultText));
    setTimeout(() => setUploadFeedback(null), 3500);
  };

  const handleClipboardPaste = (
    e: React.ClipboardEvent,
    target: 'listing' | 'batch' = 'listing'
  ) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const blob = items[i].getAsFile();
        if (blob) files.push(blob);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      processUploadedFiles(files, target);
    }
  };

  const handleAddImageUrl = (target: 'listing' | 'batch' = 'listing') => {
    if (!newImageUrl.trim()) return;
    const trimmed = newImageUrl.trim();
    const format = detectImageFormatLabel(trimmed);
    const newItem = {
      url: trimmed,
      format,
      name: `url-image.${format.toLowerCase()}`,
    };
    if (target === 'batch') {
      setBatchScheduleImageItems((prev) => [...prev, newItem]);
    } else {
      setImageItems((prev) => normalizeListingCovers([...prev, newItem]));
    }
    setNewImageUrl('');
  };

  const moveListingImage = (index: number, offset: -1 | 1) => {
    setImageItems((current) => {
      const nextIndex = index + offset;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  };

  const chooseListingCover = (index: number) => {
    setImageItems((current) => current.map((item, itemIndex) => ({ ...item, isCover: itemIndex === index })));
  };

  const getLocalizedSubcategoryName = (subEn: string, subObj?: any) => {
    if (currentLang === 'te' && subObj?.te) return subObj.te;
    if (currentLang === 'hi' && subObj?.hi) return subObj.hi;
    if (currentLang === 'en') return subEn;
    return getSubcategoryDisplayName(subEn, currentLang);
  };

  const activeCategoryDisplayName =
    currentLang === 'te'
      ? (activeSectionCat as any)?.nameTe || activeSectionCat?.name
      : currentLang === 'hi'
      ? (activeSectionCat as any)?.nameHi || activeSectionCat?.name
      : activeSectionCat?.name;

  // Reusable Category-Specific Details Form block rendered on Step 1 AND Step 2
  const renderCategorySpecificDetailsBlock = () => (
    <div className="space-y-3 bg-purple-50/60 dark:bg-purple-950/25 p-3.5 sm:p-4 rounded-2xl border border-purple-200 dark:border-purple-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-black text-purple-950 dark:text-purple-200 flex items-center gap-1.5 text-xs sm:text-sm">
          <Tag className="w-4 h-4 text-purple-600 shrink-0" />
          <span>
            {loc(
              `${activeSectionCat?.emoji || '✨'} ${activeSectionCat?.name} — Category-Specific Details (${selectedSubcategory})`,
              `${activeSectionCat?.emoji || '✨'} ${activeCategoryDisplayName} — కేటగిరీ వివరాలు మాత్రమే (${getSubcategoryDisplayName(selectedSubcategory, 'te')})`,
              `${activeSectionCat?.emoji || '✨'} ${activeCategoryDisplayName} — श्रेणी-विशिष्ट विवरण (${getSubcategoryDisplayName(selectedSubcategory, 'hi')})`
            )}
          </span>
        </div>
        <span className="px-2.5 py-0.5 rounded-full bg-purple-700 text-white text-[10px] font-black">
          {activeCategoryDisplayName} Only
        </span>
      </div>
      <p className="text-[11px] text-slate-600 dark:text-slate-400">
        {loc(
          `Showing ONLY details required for "${activeSectionCat?.name}". Your approved card will display exclusively inside the "${activeSectionCat?.name}" category.`,
          `కేవలం "${activeCategoryDisplayName}" కేటగిరీకి సంబంధించిన వివరాలు మాత్రమే క్రింద చూపబడ్డాయి. ఆమోదం తర్వాత మీ కార్డ్ ఇదే కేటగిరీలో మాత్రమే కనిపిస్తుంది.`,
          `नीचे केवल "${activeCategoryDisplayName}" श्रेणी से संबंधित विवरण दिखाए गए हैं। स्वीकृति के बाद आपका कार्ड केवल इसी श्रेणी में दिखाई देगा।`
        )}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {categoryConfig.fields.map((field) => (
          <div key={field.key} className="space-y-1">
            <label className="font-bold text-slate-700 dark:text-slate-300 block text-[11px]">
              {loc(field.labelEn, field.labelTe, field.labelHi)}
            </label>
            {field.type === 'select' ? (
              <select
                value={customFieldValues[field.key] || ''}
                onChange={(e) => handleCustomFieldChange(field.key, e.target.value)}
                className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-2 text-xs font-semibold text-slate-900 dark:text-white"
              >
                {field.options?.map((opt, i) => (
                  <option key={i} value={opt}>
                    {loc(opt)}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={customFieldValues[field.key] || ''}
                onChange={(e) => handleCustomFieldChange(field.key, e.target.value)}
                placeholder={loc(field.placeholder || field.labelEn)}
                className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-2 text-xs font-semibold text-slate-900 dark:text-white"
              />
            )}
          </div>
        ))}

        {/* Dynamic Plug-and-Play Web Elements scoped strictly to selectedSection (e.g. Movies only shows Movie elements) */}
        {dynamicWebElements.map((el) => (
          <div key={el.id} className="space-y-1">
            <label className="font-bold text-indigo-800 dark:text-indigo-300 flex items-center justify-between text-[11px]">
              <span>
                🧩 {currentLang === 'te' && el.labelTe ? el.labelTe : el.label}
                {el.required ? ' *' : ''}
              </span>
              <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-black">
                {el.elementType}
              </span>
            </label>
            {el.elementType === 'dropdown' ? (
              <select
                value={customFieldValues[el.key] ?? el.defaultValue ?? ''}
                onChange={(e) => handleCustomFieldChange(el.key, e.target.value)}
                className="w-full bg-white dark:bg-slate-900 border border-indigo-300 dark:border-indigo-700 rounded-xl p-2 text-xs font-semibold text-slate-900 dark:text-white"
              >
                {(el.options || []).map((opt, idx) => (
                  <option key={idx} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : el.elementType === 'checkbox' || el.elementType === 'toggle' ? (
              <label className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-indigo-300 dark:border-indigo-700 rounded-xl p-2 text-xs font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(customFieldValues[el.key] ?? el.defaultValue)}
                  onChange={(e) => handleCustomFieldChange(el.key, e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600"
                />
                <span>{el.placeholder || el.label}</span>
              </label>
            ) : el.elementType === 'radio' ? (
              <div className="flex flex-wrap gap-2 bg-white dark:bg-slate-900 border border-indigo-300 dark:border-indigo-700 rounded-xl p-2">
                {(el.options || []).map((opt, idx) => (
                  <label key={idx} className="inline-flex items-center gap-1 text-xs font-semibold cursor-pointer">
                    <input
                      type="radio"
                      name={el.key}
                      value={opt}
                      checked={(customFieldValues[el.key] ?? el.defaultValue) === opt}
                      onChange={() => handleCustomFieldChange(el.key, opt)}
                    />
                    <span>{opt}</span>
                  </label>
                ))}
              </div>
            ) : el.elementType === 'textarea' ? (
              <textarea
                rows={2}
                value={customFieldValues[el.key] ?? el.defaultValue ?? ''}
                onChange={(e) => handleCustomFieldChange(el.key, e.target.value)}
                placeholder={el.placeholder || el.label}
                className="w-full bg-white dark:bg-slate-900 border border-indigo-300 dark:border-indigo-700 rounded-xl p-2 text-xs font-semibold text-slate-900 dark:text-white"
              />
            ) : (
              <input
                type={
                  el.elementType === 'number'
                    ? 'number'
                    : el.elementType === 'date'
                    ? 'date'
                    : el.elementType === 'url'
                    ? 'url'
                    : 'text'
                }
                value={customFieldValues[el.key] ?? el.defaultValue ?? ''}
                onChange={(e) => handleCustomFieldChange(el.key, e.target.value)}
                placeholder={el.placeholder || el.label}
                className="w-full bg-white dark:bg-slate-900 border border-indigo-300 dark:border-indigo-700 rounded-xl p-2 text-xs font-semibold text-slate-900 dark:text-white"
              />
            )}
          </div>
        ))}
      </div>

      {/* Plug-and-Play Universal Object Editor Trigger */}
      <div className="pt-2 border-t border-purple-200/70 dark:border-purple-800/60 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-bold text-purple-900 dark:text-purple-300">
          {loc(
            `Need custom ${activeSectionCat?.name || selectedSection} web elements (Textbox, Dropdown, Checkbox, Toggle)?`,
            `ఈ "${activeCategoryDisplayName}" కోసం అదనపు వెబ్ ఎలిమెంట్స్ (Textbox, Dropdown, Checkbox) కావాలా?`,
            `इस श्रेणी के लिए कस्टम वेब एलिमेंट्स (Textbox, Dropdown, Checkbox) जोड़ें:`
          )}
        </span>
        <button
          type="button"
          onClick={() => setIsObjectEditorOpen(true)}
          className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-black shadow-xs cursor-pointer"
        >
          🧩 + Plug & Play Web Elements ({dynamicWebElements.length})
        </button>
      </div>
    </div>
  );

  const handleSubmitProviderRequestToAdmin = async () => {
    setProviderSubmissionMessage(null);
    if (selectedSection === 'movies') {
      setProviderSubmissionMessage('Movies are display-only. Movie or showtime listings cannot be submitted through provider listing management.');
      return;
    }
    if (!authUser || !['provider', 'admin'].includes(authUser.role)) {
      setProviderSubmissionMessage('A server-approved provider account is required before submitting a listing. Ask an administrator to activate your provider profile; No listing or payment was created.');
      return;
    }
    const cleanTitle = title.trim();
    const listingPrice = Number(price);
    const listingImages = imageItems.filter((item) => item.name !== 'category-cover.jpg' && item.url.trim());
    const coverIndex = listingImages.findIndex((item) => item.isCover);
    const orderedListingImages = coverIndex > 0
      ? [listingImages[coverIndex], ...listingImages.filter((_, index) => index !== coverIndex)]
      : listingImages;
    const uploadedImages = [...orderedListingImages, ...batchScheduleImageItems.filter((item) => item.url.trim())];
    if (!activeSectionCat || !cleanTitle || !selectedSubcategory || !price.trim() || !Number.isFinite(listingPrice) || listingPrice < 0) {
      setProviderSubmissionMessage('Complete the selected category, subcategory, title and a valid non-negative price before submitting.');
      return;
    }
    if (uploadedImages.some((item) => !item.file && !/^https:\/\//i.test(item.url) && !(parseStorageObjectReference(item.url)?.bucket === 'bos-public-media'))) {
      setProviderSubmissionMessage('Images must be HTTPS URLs or approved public-media references. No image data or listing was submitted.');
      return;
    }
    setIsProcessingPayment(true);
    try {
      const entityType = selectedSection === 'pg_hostels' || selectedSection === 'hotel_stay'
        ? 'property'
        : selectedSection === 'classes'
          ? 'course'
          : selectedSection === 'venues'
            ? 'venue'
            : 'service';
      const listingId = `lst-${crypto.randomUUID()}`;
      const requestId = crypto.randomUUID();
      const listingPayload = {
        description: description.trim(),
        location: { city: city.trim(), area: area.trim(), pincode: pincode.trim() },
        images: [],
        customFieldValues,
        ...(runningBatchUrl.trim() ? { runningBatchUrl: runningBatchUrl.trim() } : {}),
      };
      // Create the durable listing before uploading media. This gives every
      // object a real parent row, so a reload can recover the ready media even
      // if the follow-up payload update is interrupted.
      const createdResponse = await saveServerProviderListing(null, {
        id: listingId,
        requestId,
        title: cleanTitle,
        categoryId: activeSectionCat.id,
        subcategory: selectedSubcategory,
        entityType,
        price: listingPrice,
        priceUnit: priceUnit.trim() || 'quote',
        payload: listingPayload,
      });
      if (!createdResponse.ok || createdResponse.data.source !== 'postgres' || !createdResponse.listing || createdResponse.listing.status !== 'pending_approval') {
        throw new Error(createdResponse.data.error || 'The server did not confirm a pending PostgreSQL listing.');
      }
      const uploadForListing = createMediaUploadHandler(selectedSection, 'provider_listing', listingId);
      const imageReferences: string[] = [];
      for (let index = 0; index < uploadedImages.length; index += 1) {
        const item = uploadedImages[index];
        if (!item.file || !item.inspected) {
          imageReferences.push(item.url);
          continue;
        }
        const result = await uploadForListing(item.file, {
          inspected: item.inspected,
          processedImage: item.processedImage ?? null,
          altText: item.name.slice(0, 500),
          caption: '',
          displayOrder: index,
          onProgress: () => undefined,
        });
        imageReferences.push(result.objectPath);
      }
      let pending = createdResponse.listing;
      if (imageReferences.length > 0) {
        const mediaResponse = await saveServerProviderListing(listingId, {
          payload: { images: imageReferences },
        });
        if (!mediaResponse.ok || mediaResponse.data.source !== 'postgres' || !mediaResponse.listing || mediaResponse.listing.status !== 'pending_approval') {
          throw new Error(mediaResponse.data.error || 'The server saved the listing but could not attach its media references.');
        }
        pending = mediaResponse.listing;
      }
      setSubmittedPendingListing(pending);
      setStep(4);
      setProviderSubmissionMessage('Listing saved in PostgreSQL as pending admin review. Uploaded media was validated against its stored object before publication. No listing fee or payment was taken.');
      window.dispatchEvent(new Event('bos-marketplace-listings-updated'));
    } catch (reason) {
      setProviderSubmissionMessage(reason instanceof Error ? reason.message : 'Listing submission failed. No payment was taken.');
    } finally {
      setIsProcessingPayment(false);
    }
  };

  return (
    <div
      onPaste={(e) => handleClipboardPaste(e, 'listing')}
      className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-black/75 backdrop-blur-xs overflow-y-auto"
    >
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden my-3 max-h-[94vh] flex flex-col">
        {/* Top Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-[#4A148C] via-purple-800 to-indigo-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-400 text-purple-950 flex items-center justify-center font-black shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-sm sm:text-base leading-tight">
                {tDict('modalTitle')}
              </h3>
              <p className="text-[11px] text-purple-200 mt-0.5">
                {step === 1
                  ? tDict('step1Sub')
                  : step === 2
                  ? selectedSection === 'classes'
                    ? tDict('step2SubClasses')
                    : tDict('step2SubGeneral')
                  : step === 3
                  ? tDict('step3Sub')
                  : tDict('step4Sub')}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/20 text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Workflow Banner */}
        <div className="bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800/60 px-4 py-2 flex items-center justify-between gap-2 text-[11px] font-bold text-amber-900 dark:text-amber-200">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
            <span>{tDict('workflowBanner')}</span>
          </div>
        </div>

        {/* Step Indicator Bar */}
        <div className="bg-slate-100 dark:bg-slate-800 p-2.5 flex items-center justify-between text-[11px] sm:text-xs px-4 sm:px-6 border-b border-slate-200 dark:border-slate-700">
          <button
            type="button"
            onClick={() => !submittedPendingListing && setStep(1)}
            className={`font-black cursor-pointer ${
              step >= 1 ? 'text-purple-700 dark:text-purple-300' : 'text-slate-400'
            }`}
          >
            {tDict('tab1')}
          </button>
          <span className="text-slate-400">→</span>
          <button
            type="button"
            onClick={() => !submittedPendingListing && setStep(2)}
            className={`font-black cursor-pointer ${
              step >= 2 ? 'text-purple-700 dark:text-purple-300' : 'text-slate-400'
            }`}
          >
            {tDict('tab2')}
          </button>
          <span className="text-slate-400">→</span>
          <button
            type="button"
            onClick={() => !submittedPendingListing && setStep(3)}
            className={`font-black cursor-pointer ${
              step >= 3 ? 'text-purple-700 dark:text-purple-300' : 'text-slate-400'
            }`}
          >
            {tDict('tab3')}
          </button>
          <span className="text-slate-400">→</span>
          <button
            type="button"
            onClick={() => !submittedPendingListing && setStep(4)}
            className={`font-black cursor-pointer ${
              step >= 4 ? 'text-purple-700 dark:text-purple-300' : 'text-slate-400'
            }`}
          >
            {tDict('tab4')}
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 text-xs">
          {/* STEP 1: Provider Registration Details, Category Picker & Immediate Category-Only Details */}
          {step === 1 && (
            <div className="space-y-4">
              {/* Customer Register as Provider Box */}
              <div className="bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 rounded-2xl p-3.5 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 font-black text-indigo-950 dark:text-indigo-200 text-xs sm:text-sm">
                    <UserCheck className="w-4 h-4 text-indigo-600" />
                    <span>
                      {loc(
                        `Provider Profile — ${activeSectionCat?.name}`,
                        `ప్రొవైడర్ వివరాలు — ${activeCategoryDisplayName}`,
                        `प्रोवाइडर विवरण — ${activeCategoryDisplayName}`
                      )}
                    </span>
                  </div>
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-200">
                    {activeSectionCat?.emoji} {activeCategoryDisplayName}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1 text-[11px]">
                      {loc(
                        `${activeSectionCat?.name} Provider Name *`,
                        `${activeCategoryDisplayName} సంస్థ / ప్రొవైడర్ పేరు *`,
                        `${activeCategoryDisplayName} प्रोवाइडर का नाम *`
                      )}
                    </label>
                    <div className="flex items-center bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-2.5 py-2">
                      <Building2 className="w-3.5 h-3.5 text-indigo-600 mr-1.5 shrink-0" />
                      <input
                        type="text"
                        value={providerName}
                        onChange={(e) => setProviderName(e.target.value)}
                        placeholder={loc(
                          categoryConfig.providerNameEn,
                          categoryConfig.providerNameTe,
                          categoryConfig.providerNameHi
                        )}
                        className="w-full bg-transparent font-bold text-slate-900 dark:text-white outline-hidden text-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1 text-[11px]">
                      {loc('Provider Mobile Number *', 'మొబైల్ నంబర్ *', 'मोबाइल नंबर *')}
                    </label>
                    <div className="flex items-center bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-2.5 py-2">
                      <Phone className="w-3.5 h-3.5 text-emerald-600 mr-1.5 shrink-0" />
                      <input
                        type="tel"
                        value={providerPhone}
                        onChange={(e) => setProviderPhone(e.target.value)}
                        placeholder="98480 12345"
                        className="w-full bg-transparent font-bold text-slate-900 dark:text-white outline-hidden text-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1 text-[11px]">
                      {loc('Provider Email', 'ఇమెయిల్', 'ईमेल')}
                    </label>
                    <div className="flex items-center bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-2.5 py-2">
                      <Mail className="w-3.5 h-3.5 text-purple-600 mr-1.5 shrink-0" />
                      <input
                        type="email"
                        value={providerEmail}
                        onChange={(e) => setProviderEmail(e.target.value)}
                        placeholder="provider@bookourspace.in"
                        className="w-full bg-transparent font-medium text-slate-900 dark:text-white outline-hidden text-xs"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Choose Main Application Section */}
              <div>
                <label className="font-extrabold text-xs sm:text-sm text-slate-900 dark:text-white block mb-1.5">
                  {loc(
                    '1. Select Application Section',
                    '1. అప్లికేషన్ విభాగాన్ని ఎంచుకోండి',
                    '1. एप्लिकेशन अनुभाग चुनें'
                  )}
                </label>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                  {[
                    { id: 'pg_hostels' as MarketSectionType, emoji: '🏠', label: ui.secPG },
                    { id: 'classes' as MarketSectionType, emoji: '🎓', label: ui.secClasses },
                    { id: 'venues' as MarketSectionType, emoji: '🏢', label: ui.secVenues },
                    { id: 'services' as MarketSectionType, emoji: '🛠️', label: ui.secServices },
                    { id: 'hotel_stay' as MarketSectionType, emoji: '🏨', label: ui.secStay },
                    { id: 'movies' as MarketSectionType, emoji: '🎬', label: ui.secMovies },
                  ].map((sec) => (
                    <button
                      key={sec.id}
                      type="button"
                      onClick={() => handleSectionSelect(sec.id)}
                      className={`p-2 rounded-xl border text-center font-black transition-all cursor-pointer flex flex-col items-center gap-1 ${
                        selectedSection === sec.id
                          ? 'bg-[#4338CA] text-white border-[#4338CA] shadow-sm'
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-purple-400'
                      }`}
                    >
                      <span className="text-base">{sec.emoji}</span>
                      <span className="text-[10px] truncate w-full">{sec.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Category Picker inside selected section */}
              <div>
                <label className="font-extrabold text-xs sm:text-sm text-slate-900 dark:text-white block mb-1">
                  {loc(
                    '2. Choose Provider Category (Form adapts to selected category only)',
                    '2. ప్రొవైడర్ కేటగిరీని ఎంచుకోండి (ఎంచుకున్న కేటగిరీ వివరాలు మాత్రమే వస్తాయి)',
                    '2. प्रोवाइडर श्रेणी चुनें (केवल चुनी गई श्रेणी के विवरण दिखेंगे)'
                  )}
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-1 border border-slate-200 dark:border-slate-800 rounded-2xl">
                  {sectionCategoryList.map((cat) => {
                    const catDisplay =
                      currentLang === 'te'
                        ? cat.nameTe
                        : currentLang === 'hi'
                        ? cat.nameHi
                        : currentLang === 'en'
                        ? cat.name
                        : transliterateLatinToScript(cat.name, currentLang);
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => handleCategorySelect(cat.id)}
                        className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                          selectedCategoryId === cat.id
                            ? 'border-purple-600 bg-purple-50 dark:bg-purple-950/60 font-bold text-purple-950 dark:text-purple-200 ring-1 ring-purple-500'
                            : 'border-slate-200 dark:border-slate-700 hover:border-purple-300 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <div className="font-bold truncate flex items-center gap-1.5">
                          <span>{cat.emoji}</span>
                          <span className="truncate">{catDisplay}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 uppercase tracking-wider mt-0.5">
                          {cat.subcategories.length} {ui.subcategoriesLabel}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Subcategories */}
              {activeSectionCat && (
                <div className="space-y-1.5 pt-1">
                  <label className="font-bold text-slate-800 dark:text-slate-200 block">
                    {loc(
                      `3. Select Subcategory under ${activeSectionCat.name}`,
                      `3. ${activeCategoryDisplayName} లో సబ్-కేటగిరీని ఎంచుకోండి`,
                      `3. ${activeCategoryDisplayName} में उप-श्रेणी चुनें`
                    )}
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {activeSectionCat.subcategories.map((sub: any, i: number) => {
                      const subEn = typeof sub === 'string' ? sub : sub.en;
                      const subLabel = getLocalizedSubcategoryName(subEn, sub);
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => handleSubcategorySelect(subEn)}
                          className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                            selectedSubcategory === subEn
                              ? 'bg-[#4A148C] text-white border-[#4A148C]'
                              : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {subLabel}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* STEP 1 LIVE CATEGORY-SPECIFIC FORM FIELDS (Displays ONLY fields for selected category) */}
              {renderCategorySpecificDetailsBlock()}
            </div>
          )}

          {/* STEP 2: Category Title, Description, Pricing, All-Format Image Uploader & Category-Specific Fields */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  {loc(
                    `${activeSectionCat?.name} Listing Title *`,
                    `${activeCategoryDisplayName} లిస్టింగ్ శీర్షిక *`,
                    `${activeCategoryDisplayName} लिस्टिंग शीर्षक *`
                  )}
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={loc(
                    categoryConfig.titlePlaceholderEn,
                    categoryConfig.titlePlaceholderTe,
                    categoryConfig.titlePlaceholderHi
                  )}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 font-semibold text-slate-900 dark:text-white outline-hidden focus:border-purple-600"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  {loc(
                    `${activeSectionCat?.name} Description & Scope *`,
                    `${activeCategoryDisplayName} పూర్తి వివరాలు *`,
                    `${activeCategoryDisplayName} का पूरा विवरण *`
                  )}
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={loc(
                    categoryConfig.descPlaceholderEn,
                    categoryConfig.descPlaceholderTe,
                    categoryConfig.descPlaceholderHi
                  )}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 font-medium text-slate-900 dark:text-white outline-hidden focus:border-purple-600"
                />
              </div>

              {/* Pricing */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    {loc(
                      `${activeSectionCat?.name} Price (₹) *`,
                      `${activeCategoryDisplayName} ధర (₹) *`,
                      `${activeCategoryDisplayName} मूल्य (₹) *`
                    )}
                  </label>
                  <input
                    type="number"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder={categoryConfig.defaultPrice}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 font-semibold text-slate-900 dark:text-white outline-hidden"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    {loc('Price Billing Unit', 'ధర యూనిట్', 'मूल्य इकाई')}
                  </label>
                  <select
                    value={priceUnit}
                    onChange={(e) => setPriceUnit(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 font-semibold text-slate-900 dark:text-white outline-hidden"
                  >
                    {(SECTION_PRICE_UNITS[selectedSection] || SECTION_PRICE_UNITS.pg_hostels).map(
                      (u) => (
                        <option key={u.value} value={u.value}>
                          {getPriceUnitDisplayName(u.value, currentLang)} —{' '}
                          {loc(u.labelEn, u.labelTe, u.labelHi)}
                        </option>
                      )
                    )}
                  </select>
                </div>
              </div>

              {/* Category-Specific Details Form */}
              {renderCategorySpecificDetailsBlock()}

              {/* Optional Current Running Batch Schedule Link + Batch Schedule Image Upload — STRICTLY FOR CLASSES ONLY */}
              {selectedSection === 'classes' && (
                <div className="bg-orange-50/60 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-900/60 rounded-2xl p-3.5 space-y-2.5">
                  <label className="font-black text-slate-800 dark:text-orange-200 block">
                    {loc(
                      `Current Running Batch Schedule Link & Timetable Image (${activeSectionCat?.name} Only)`,
                      `ప్రస్తుత రన్నింగ్ బ్యాచ్ లింక్ & షెడ్యూల్ ఫోటో (${activeCategoryDisplayName} మాత్రమే)`,
                      `वर्तमान रनिंग बैच लिंक और शेड्यूल फोटो (केवल ${activeCategoryDisplayName})`
                    )}
                  </label>
                  <input
                    type="text"
                    value={runningBatchUrl}
                    onChange={(e) => setRunningBatchUrl(e.target.value)}
                    placeholder="https://www.durgasoftonline.com/s/pages/new-batches"
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 font-medium text-slate-900 dark:text-white outline-hidden"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[10px] text-slate-500">
                      {loc(
                        'Paste a batch schedule URL or upload batch timetable images in any format.',
                        'బ్యాచ్ షెడ్యూల్ లింక్ పేస్ట్ చేయండి లేదా ఏ ఫార్మాట్ చిత్రాన్నైనా అప్‌లోడ్ చేయండి.',
                        'बैच शेड्यूल लिंक पेस्ट करें या किसी भी प्रारूप में शेड्यूल चित्र अपलोड करें।'
                      )}
                    </p>
                    <input
                      ref={batchFileInputRef}
                      type="file"
                      multiple
                      accept={ACCEPTED_ALL_IMAGE_FORMATS}
                      onChange={(e) => {
                        if (e.target.files) processUploadedFiles(e.target.files, 'batch');
                        e.target.value = '';
                      }}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => batchFileInputRef.current?.click()}
                      className="px-3 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-black text-[11px] flex items-center gap-1.5 shadow-2xs cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>
                        {loc(
                          '+ Upload Batch Image',
                          '+ బ్యాచ్ ఫోటో అప్‌లోడ్',
                          '+ बैच फोटो अपलोड'
                        )}
                      </span>
                    </button>
                  </div>

                  {batchScheduleImageItems.length > 0 && (
                    <div className="flex items-center gap-2 overflow-x-auto pt-1">
                      {batchScheduleImageItems.map((item, idx) => (
                        <div
                          key={idx}
                          className="relative w-16 h-16 rounded-xl overflow-hidden border-2 border-orange-400 shrink-0 bg-white"
                        >
                          <SafeImage src={item.url} alt={item.name} className="w-full h-full object-cover" category={imageCategoryFor(selectedSection)} sizes="64px" />
                          <span className="absolute bottom-0 left-0 right-0 bg-orange-600/90 text-white text-[8px] font-black text-center">
                            {item.format}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              const [removed] = batchScheduleImageItems.filter((_, i) => i === idx);
                              if (removed) { URL.revokeObjectURL(removed.url); localMediaUrlsRef.current.delete(removed.url); }
                              setBatchScheduleImageItems((prev) => prev.filter((_, i) => i !== idx));
                            }}
                            className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/75 text-white text-[9px] flex items-center justify-center cursor-pointer"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ALL-FORMAT LISTING IMAGES UPLOADER */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingImages(true);
                }}
                onDragLeave={() => setIsDraggingImages(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDraggingImages(false);
                  if (e.dataTransfer.files) processUploadedFiles(e.dataTransfer.files, 'listing');
                }}
                className={`p-4 rounded-2xl border-2 border-dashed transition-all space-y-3 ${
                  isDraggingImages
                    ? 'border-purple-600 bg-purple-50 dark:bg-purple-950/40'
                    : 'border-indigo-300 dark:border-slate-700 bg-indigo-50/40 dark:bg-slate-800/50'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-[#4338CA] text-white flex items-center justify-center shrink-0">
                      <FileImage className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-black text-slate-900 dark:text-white text-xs sm:text-sm">
                        {loc(
                          `Upload ${activeSectionCat?.name} Photos (${imageItems.length})`,
                          `${activeCategoryDisplayName} ఫోటోలను జోడించండి (${imageItems.length})`,
                          `${activeCategoryDisplayName} फोटो अपलोड करें (${imageItems.length})`
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500 font-semibold">
                        {loc(
                          'PNG • JPG • JPEG • WEBP • GIF • SVG • AVIF • Drag & Drop / Paste / URL',
                          'PNG • JPG • JPEG • WEBP • GIF • SVG • AVIF • డ్రాగ్ & డ్రాప్ / పేస్ట్ / లింక్',
                          'PNG • JPG • JPEG • WEBP • GIF • SVG • AVIF • ड्रैग एंड ड्रॉप / पेस्ट / लिंक'
                        )}
                      </div>
                    </div>
                  </div>

                  <input
                    ref={fileInputStep2Ref}
                    type="file"
                    multiple
                    accept={ACCEPTED_ALL_IMAGE_FORMATS}
                    onChange={(e) => {
                      if (e.target.files) processUploadedFiles(e.target.files, 'listing');
                      e.target.value = '';
                    }}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputStep2Ref.current?.click()}
                    className="px-3.5 py-2 rounded-xl bg-[#4338CA] hover:bg-indigo-800 text-white font-black text-xs flex items-center gap-1.5 shadow-sm cursor-pointer active:scale-95 transition-all"
                  >
                    <Upload className="w-3.5 h-3.5 text-amber-300" />
                    <span>
                      {loc(
                        '+ Choose Images',
                        '+ ఫోటోలు అప్‌లోడ్ చేయండి',
                        '+ फोटो चुनें'
                      )}
                    </span>
                  </button>
                </div>

                {uploadFeedback && (
                  <div className="text-[11px] font-black text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 px-3 py-1.5 rounded-xl border border-emerald-200 dark:border-emerald-800 flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5" />
                    <span>{uploadFeedback}</span>
                  </div>
                )}

                {imageItems.length > 0 && (
                  <div className="flex items-center gap-2.5 overflow-x-auto pb-1 pt-1">
                    {imageItems.map((item, idx) => (
                      <div
                        key={idx}
                        className="relative w-20 h-20 rounded-xl overflow-hidden shrink-0 border-2 border-indigo-200 dark:border-slate-700 bg-white group shadow-2xs"
                      >
                        <SafeImage src={item.url} alt={item.name} className="w-full h-full object-cover" category={imageCategoryFor(selectedSection)} sizes="80px" />
                        <span className="absolute bottom-0 left-0 right-0 bg-slate-900/80 text-amber-300 text-[9px] font-black text-center py-0.5 uppercase">
                          {item.format}
                        </span>
                        {item.isCover && <span className="absolute bottom-5 left-1 right-1 rounded bg-amber-300 px-1 py-0.5 text-[8px] font-black uppercase text-slate-950">Cover</span>}
                        <div className="absolute top-1 left-1 flex gap-1">
                          {!item.isCover && <button type="button" aria-label={`Set ${item.name} as cover`} onClick={() => chooseListingCover(idx)} className="rounded bg-white/95 px-1 py-0.5 text-[8px] font-bold text-slate-900">Set cover</button>}
                          <button type="button" aria-label={`Move ${item.name} earlier`} disabled={idx === 0} onClick={() => moveListingImage(idx, -1)} className="rounded bg-white/95 px-1 py-0.5 text-[9px] font-bold text-slate-900 disabled:opacity-40">↑</button>
                          <button type="button" aria-label={`Move ${item.name} later`} disabled={idx === imageItems.length - 1} onClick={() => moveListingImage(idx, 1)} className="rounded bg-white/95 px-1 py-0.5 text-[9px] font-bold text-slate-900 disabled:opacity-40">↓</button>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setImageItems((prev) => {
                              return normalizeListingCovers(prev.filter((_, i) => i !== idx));
                            })
                          }
                          className="absolute top-1 right-1 w-4 h-4 bg-red-600 text-white rounded-full flex items-center justify-center text-[10px] font-bold shadow-xs cursor-pointer"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newImageUrl}
                    onChange={(e) => setNewImageUrl(e.target.value)}
                    placeholder={loc(
                      'Or paste any image URL (.png, .jpg, .webp, .gif, .svg)...',
                      'లేదా ఏదైనా ఇమేజ్ లింక్‌ను ఇక్కడ పేస్ట్ చేయండి...',
                      'या कोई भी इमेज लिंक यहाँ पेस्ट करें...'
                    )}
                    className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2 text-xs text-slate-900 dark:text-white outline-hidden"
                  />
                  <button
                    type="button"
                    onClick={() => handleAddImageUrl('listing')}
                    className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{loc('Add URL', 'జోడించు', 'जोड़ें')}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Location & Multi-Format Media Gallery */}
          {step === 3 && (
            <div className="space-y-4">
              <UniversalMediaManager moduleKey={selectedSection} parentType="provider_listing_draft" title="Listing media preview" />
              <UniversalMediaManager moduleKey={selectedSection} parentType="provider_private_documents" privacy="private" title="Private certificates and documents" />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    {loc('City *', 'నగరం *', 'शहर *')}
                  </label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder={loc('e.g. Hyderabad', 'ఉదా: హైదరాబాద్', 'उदा: हैदराबाद')}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 font-semibold"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    {loc('Area / Locality *', 'ఏరియా / ప్రాంతం *', 'क्षेत्र / इलाका *')}
                  </label>
                  <input
                    type="text"
                    value={area}
                    onChange={(e) => setArea(e.target.value)}
                    placeholder={loc(
                      'e.g. Madhapur / Hitech City',
                      'ఉదా: మాదాపూర్ / హైటెక్ సిటీ',
                      'उदा: माधापुर / हाईटेक सिटी'
                    )}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 font-semibold"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    {loc('Pincode', 'పిన్‌కోడ్', 'पिनकोड')}
                  </label>
                  <input
                    type="text"
                    value={pincode}
                    onChange={(e) => setPincode(e.target.value)}
                    placeholder="500081"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 font-semibold"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  {loc(
                    `Note to Admin Reviewer (${activeSectionCat?.name})`,
                    `అడ్మిన్ ఆమోదం కోసం గమనిక (${activeCategoryDisplayName})`,
                    `एडमिन समीक्षा के लिए नोट (${activeCategoryDisplayName})`
                  )}
                </label>
                <input
                  type="text"
                  value={providerRegistrationNote}
                  onChange={(e) => setProviderRegistrationNote(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 font-medium"
                />
              </div>

              <div className="space-y-2.5 pt-2 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <label className="font-black text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <ImageIcon className="w-4 h-4 text-purple-600" />
                    <span>
                      {loc(
                        `Uploaded ${activeSectionCat?.name} Photos (${imageItems.length})`,
                        `${activeCategoryDisplayName} ఫోటోలు (${imageItems.length})`,
                        `${activeCategoryDisplayName} तस्वीरें (${imageItems.length})`
                      )}
                    </span>
                  </label>

                  <input
                    ref={fileInputStep3Ref}
                    type="file"
                    multiple
                    accept={ACCEPTED_ALL_IMAGE_FORMATS}
                    onChange={(e) => {
                      if (e.target.files) processUploadedFiles(e.target.files, 'listing');
                      e.target.value = '';
                    }}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputStep3Ref.current?.click()}
                    className="px-3 py-1.5 rounded-xl bg-[#4338CA] text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>
                      {loc(
                        '+ Upload More Images',
                        '+ మరిన్ని ఫోటోలు అప్‌లోడ్ చేయండి',
                        '+ और तस्वीरें अपलोड करें'
                      )}
                    </span>
                  </button>
                </div>

                <div className="flex items-center gap-2.5 overflow-x-auto pb-2">
                  {imageItems.map((item, i) => (
                    <div
                      key={i}
                      className="relative w-24 h-24 rounded-xl overflow-hidden shrink-0 border-2 border-slate-200 dark:border-slate-700 bg-white"
                    >
                      <SafeImage src={item.url} alt={item.name} className="w-full h-full object-cover" category={imageCategoryFor(selectedSection)} sizes="96px" />
                      <span className="absolute bottom-0 left-0 right-0 bg-black/75 text-amber-300 text-[9px] font-black text-center py-0.5">
                        {item.format}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          URL.revokeObjectURL(item.url);
                          localMediaUrlsRef.current.delete(item.url);
                          setImageItems(imageItems.filter((_, idx) => idx !== i));
                        }}
                        className="absolute top-1 right-1 w-4 h-4 bg-red-600 text-white rounded-full flex items-center justify-center text-[10px] cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: Submit Provider Request Form to Admin for Approval */}
          {step === 4 && (
            <div className="space-y-4">
              {submittedPendingListing ? (
                <div className="p-6 text-center bg-gradient-to-br from-amber-50 via-white to-indigo-50 dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950/40 rounded-3xl border-2 border-amber-400 shadow-lg space-y-4 animate-in zoom-in-95 duration-200">
                  <div className="w-14 h-14 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center mx-auto shadow-md">
                    <Clock className="w-8 h-8 stroke-[2.5]" />
                  </div>

                  <div className="space-y-1">
                    <span className="inline-flex items-center gap-1 px-3 py-0.5 rounded-full bg-amber-100 text-amber-900 font-black text-[10px] uppercase tracking-wider border border-amber-300">
                      {loc(
                        '⏳ Status: Pending Admin Approval',
                        '⏳ స్థితి: అడ్మిన్ ఆమోదం కోసం వేచి ఉంది',
                        '⏳ स्थिति: एडमिन अनुमोदन लंबित'
                      )}
                    </span>
                    <h4 className="font-black text-base sm:text-lg text-slate-900 dark:text-white">
                      {loc(
                        'Provider Registration & Request Form Sent to Admin!',
                        'ప్రొవైడర్ నమోదు & దరఖాస్తు ఫారమ్ అడ్మిన్‌కు పంపబడింది!',
                        'प्रोवाइडर पंजीकरण और अनुरोध फॉर्म एडमिन को भेजा गया!'
                      )}
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-slate-300 max-w-md mx-auto leading-relaxed">
                      {loc(
                        `"${submittedPendingListing.title}" is now in the Admin Review Queue under "${activeSectionCat?.name}". Once approved, it will display exclusively in the "${activeSectionCat?.name}" category!`,
                        `"${submittedPendingListing.title}" అడ్మిన్ పరిశీలనలో ఉంది. ఆమోదించిన వెంటనే "${activeCategoryDisplayName}" కేటగిరీలో కనిపిస్తుంది!`,
                        `"${submittedPendingListing.title}" अब एडमिन समीक्षा कतार में है। स्वीकृत होने पर यह "${activeCategoryDisplayName}" श्रेणी में दिखाई देगा!`
                      )}
                    </p>
                  </div>

                  {/* Provider Registration Request Tracking Barcode */}
                  <div className="text-left max-w-lg mx-auto">
                    <UniversalBarcode
                      value={submittedPendingListing.id}
                      displayCode={generateBosBarcodeId('REQ', submittedPendingListing.id, 'prov')}
                      label="🛡️ Provider Registration & Admin Verification Barcode"
                      sublabel={`${submittedPendingListing.title} • Category: ${activeSectionCat?.name} • Status: Pending Admin Approval`}
                      moduleTag="prov"
                      variant="compact"
                      showQr={true}
                    />
                  </div>

                  <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 pt-2">
                    {onOpenAdminReview && (
                      <button
                        type="button"
                        onClick={() => {
                          const created = submittedPendingListing;
                          setSubmittedPendingListing(null);
                          onClose();
                          onOpenAdminReview(created);
                        }}
                        className="w-full sm:w-auto px-5 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-slate-950 font-black text-xs sm:text-sm shadow-md flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition-all"
                      >
                        <ShieldCheck className="w-4 h-4" />
                        <span>
                          {loc(
                            '🛡️ Go to Admin Console to Review & Approve Now',
                            '🛡️ అడ్మిన్ ప్యానెల్‌కు వెళ్లి ఇప్పుడే ఆమోదించండి',
                            '🛡️ एडमिन पैनल में जाकर अभी स्वीकृत करें'
                          )}
                        </span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        const created = submittedPendingListing;
                        setSubmittedPendingListing(null);
                        onClose();
                        if (onPostSuccess) onPostSuccess(created);
                      }}
                      className="w-full sm:w-auto px-4 py-3 rounded-xl bg-[#4338CA] hover:bg-indigo-800 text-white font-black text-xs sm:text-sm shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Check className="w-4 h-4" />
                      <span>
                        {loc(
                          'View My Pending Status in Provider Hub',
                          'ప్రొవైడర్ హబ్‌లో స్థితిని చూడండి',
                          'प्रोवाइडर हब में स्थिति देखें'
                        )}
                      </span>
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="text-center space-y-1">
                    <h4 className="font-black text-base text-slate-900 dark:text-white">
                      {loc(
                        `Submit "${activeSectionCat?.name}" Listing Request to Admin`,
                        `"${activeCategoryDisplayName}" లిస్టింగ్ దరఖాస్తును అడ్మిన్‌కు పంపండి`,
                        `"${activeCategoryDisplayName}" लिस्टिंग अनुरोध एडमिन को भेजें`
                      )}
                    </h4>
                    <p className="text-slate-500 text-xs">
                      {loc(
                        `Once approved by Admin, your card will be published live inside "${activeSectionCat?.name}".`,
                        `అడ్మిన్ ఆమోదించిన వెంటనే మీ కార్డ్ "${activeCategoryDisplayName}" కేటగిరీలో ప్రచురించబడుతుంది.`,
                        `एडमिन द्वारा स्वीकृत होने पर आपका कार्ड "${activeCategoryDisplayName}" श्रेणी में लाइव प्रदर्शित होगा।`
                      )}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {postingPlans
                      .filter((p) => p.isActive)
                      .map((plan) => {
                        const isSelected = selectedPlanId === plan.id;
                        return (
                          <button
                            key={plan.id}
                            type="button"
                            onClick={() => setSelectedPlanId(plan.id)}
                            className={`p-4 rounded-2xl border text-left transition-all relative cursor-pointer ${
                              isSelected
                                ? 'border-purple-600 bg-purple-50 dark:bg-purple-950/50 shadow-md ring-2 ring-purple-500'
                                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 hover:border-purple-300'
                            }`}
                          >
                            {plan.isPopular && (
                              <span className="absolute -top-2 right-3 text-[9px] font-black uppercase tracking-wider bg-amber-400 text-slate-950 px-2 py-0.5 rounded-full shadow-xs">
                                {loc('Most Popular', 'అత్యంత ప్రజాదరణ', 'सबसे लोकप्रिय')}
                              </span>
                            )}

                            <div className="font-bold text-sm text-slate-900 dark:text-white">
                              {loc(plan.name)}
                            </div>

                            <div className="text-xl font-black text-purple-700 dark:text-purple-300 my-1 tabular-nums">
                              ₹{plan.price}
                              <span className="text-xs font-normal text-slate-500">
                                {plan.billingPeriod === 'one_time'
                                  ? ` / ${loc('post', 'పోస్ట్', 'पोस्ट')}`
                                  : ` / ${loc(plan.billingPeriod)}`}
                              </span>
                            </div>

                            <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-2 font-medium">
                              {plan.listingLimit} {loc('Listings', 'లిస్టింగ్‌లు', 'लिस्टिंग')} ·{' '}
                              {plan.validityDays}{' '}
                              {loc('Days Validity', 'రోజుల చెల్లుబాటు', 'दिन वैधता')}
                            </div>

                            <div className="space-y-1 border-t border-slate-100 dark:border-slate-700 pt-2">
                              {plan.perks.slice(0, 3).map((perk, i) => (
                                <div
                                  key={i}
                                  className="text-[10px] text-slate-600 dark:text-slate-300 flex items-center gap-1 truncate"
                                >
                                  <Check className="w-3 h-3 text-emerald-500 shrink-0" />
                                  <span className="truncate">{loc(perk)}</span>
                                </div>
                              ))}
                            </div>
                          </button>
                        );
                      })}
                  </div>

                  {providerSubmissionMessage && (
                    <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-semibold text-amber-900">
                      {providerSubmissionMessage}
                    </p>
                  )}
                  <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">
                        {loc(
                        `${activeSectionCat?.name} Listing Submission`,
                          `${activeCategoryDisplayName} లిస్టింగ్ సమర్పణ`,
                          `${activeCategoryDisplayName} लिस्टिंग सबमिशन`
                        )}
                      </span>
                      <div className="text-lg font-black text-slate-900 dark:text-white tabular-nums">
                        {loc('No fee collected', 'రుసుము వసూలు చేయబడదు', 'कोई शुल्क नहीं लिया जाएगा')}{' '}
                        <span className="text-xs font-bold text-emerald-600">
                          • {imageItems.length + batchScheduleImageItems.length}{' '}
                          {loc('Images Attached', 'ఫోటోలు జతచేయబడ్డాయి', 'तस्वीरें संलग्न')}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={isProcessingPayment}
                      onClick={handleSubmitProviderRequestToAdmin}
                      className="px-6 py-3 rounded-xl bg-[#4A148C] hover:bg-purple-900 text-white font-black text-xs sm:text-sm shadow-md flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer"
                    >
                      <CreditCard className="w-4 h-4 text-amber-300" />
                      <span>
                        {isProcessingPayment
                          ? loc(
                              'Submitting to Admin...',
                              'అడ్మిన్‌కు పంపుతోంది...',
                              'एडमिन को भेजा जा रहा है...'
                            )
                          : loc(
                          'Submit for Admin review',
                            'అడ్మిన్ సమీక్షకు సమర్పించండి',
                            'एडमिन समीक्षा के लिए भेजें'
                            )}
                      </span>
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Modal Navigation Buttons */}
        {!submittedPendingListing && (
          <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900">
            {step > 1 ? (
              <button
                type="button"
                onClick={() => setStep((step - 1) as any)}
                className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 flex items-center gap-1 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>{loc('Back', 'వెనుకకు', 'पीछे')}</span>
              </button>
            ) : (
              <div />
            )}

            {step < 4 ? (
              <button
                type="button"
                onClick={() => {
                  setStep((step + 1) as any);
                }}
                className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-xs cursor-pointer"
              >
                <span>
                  {loc(
                    `Continue to Step ${step + 1}`,
                    `దశ ${step + 1} కు కొనసాగండి`,
                    `चरण ${step + 1} पर आगे बढ़ें`
                  )}
                </span>
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : null}
          </div>
        )}
      </div>

      <UniversalObjectEditorModal
        isOpen={isObjectEditorOpen}
        onClose={() => setIsObjectEditorOpen(false)}
        activeSection={selectedSection}
        currentLang={currentLang}
        onElementsChange={(els: CustomWebElementSpec[]) =>
          setDynamicWebElements(els.filter((e) => e.sectionScope === selectedSection))
        }
      />
    </div>
  );
};
