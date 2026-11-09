import { transliterateLatinToScript, getUILabels, localizeAreaName } from './i18nEngine';

export type AppLanguage = 'te' | 'en' | 'hi' | 'ta' | 'kn' | 'ml' | 'mr' | 'bn' | 'gu' | 'pa' | 'or' | 'ur';

export interface IndianLanguageOption {
  code: AppLanguage;
  label: string;
  englishName: string;
}

export const allIndianLanguages: IndianLanguageOption[] = [
  { code: 'te', label: 'తెలుగు', englishName: 'Telugu' },
  { code: 'en', label: 'English', englishName: 'English' },
  { code: 'hi', label: 'हिंदी', englishName: 'Hindi' },
  { code: 'ta', label: 'தமிழ்', englishName: 'Tamil' },
  { code: 'kn', label: 'ಕನ್ನಡ', englishName: 'Kannada' },
  { code: 'ml', label: 'മലയാളം', englishName: 'Malayalam' },
  { code: 'mr', label: 'मराठी', englishName: 'Marathi' },
  { code: 'bn', label: 'বাংলা', englishName: 'Bengali' },
  { code: 'gu', label: 'ગુજરાતી', englishName: 'Gujarati' },
  { code: 'pa', label: 'ਪੰਜਾਬੀ', englishName: 'Punjabi' },
  { code: 'or', label: 'ଓଡ଼ିଆ', englishName: 'Odia' },
  { code: 'ur', label: 'اردو', englishName: 'Urdu' },
];

export interface TranslationDictionary {
  [key: string]: any;
  appName: string;
  searchPlaceholder: string;
  searchVoicePrompt: string;
  listening: string;
  speakNow: string;
  voiceSearchingFor: string;
  tapToSpeak: string;
  stopListening: string;
  createPost: string;
  allServices: string;
  showAll44: string;
  collapse: string;
  more: string;
  less: string;
  all: string;
  chooseLocality: string;
  allAreas: string;
  expressArrival: string;
  filterBy: string;
  distance: string;
  distanceAll: string;
  within5km: string;
  within10km: string;
  within15km: string;
  price: string;
  priceAll: string;
  under500: string;
  price500to1000: string;
  above1000: string;
  rating: string;
  ratingAll: string;
  rating45Plus: string;
  rating40Plus: string;
  sortBy: string;
  sortNearest: string;
  sortRating: string;
  sortPriceAsc: string;
  sortPriceDesc: string;
  sortNewest: string;
  verifiedOnly: string;
  featuredOnly: string;
  clearFilters: string;
  activeFilter: string;
  prosAvailable: string;
  callNow: string;
  chat: string;
  bookNow: string;
  verifiedPro: string;
  arrivalIn: string;
  away: string;
  reviews: string;
  enquiries: string;
  pricing: string;
  noResultsTitle: string;
  noResultsDesc: string;
  resetAll: string;
  voiceSuggestions: string[];
}

export const translations: Record<AppLanguage, TranslationDictionary> = {
  te: {
    appName: 'బుక్ అవర్ స్పేస్',
    searchPlaceholder: 'శోధించండి... (ఉదా: హౌస్ క్లీనింగ్, ఎలక్ట్రీషియన్, ప్లంబర్)',
    searchVoicePrompt: 'మైక్ ద్వారా శోధించండి',
    listening: 'వింటున్నాము... మాట్లాడండి',
    speakNow: 'మీరు ఏ సర్వీస్ కోరుకుంటున్నారో చెప్పండి...',
    voiceSearchingFor: 'శోధన:',
    tapToSpeak: 'మాట్లాడటానికి మైక్ నొక్కండి',
    stopListening: 'ఆపండి',
    createPost: '+ పోస్ట్ చేయండి',
    allServices: 'అన్ని సర్వీసెస్ & కేటగిరీలు',
    showAll44: 'మొత్తం 44 సర్వీసెస్ చూడండి',
    collapse: 'కుదించు',
    more: 'మరిన్ని',
    less: 'తక్కువ',
    all: 'అన్నీ',
    chooseLocality: 'మీ ఏరియా ఎంచుకోండి:',
    allAreas: 'నగరంలో అన్ని ఏరియాలు',
    expressArrival: '⚡ 15-30 నిమిషాల్లో రాక',
    filterBy: 'ఫిల్టర్లు:',
    distance: 'దూరం',
    distanceAll: 'అన్ని దూరాలు',
    within5km: '5 కి.మీ లోపు',
    within10km: '10 కి.మీ లోపు',
    within15km: '15 కి.మీ లోపు',
    price: 'ధర',
    priceAll: 'అన్ని ధరలు',
    under500: '₹500 లోపు',
    price500to1000: '₹500 - ₹1000',
    above1000: '₹1000 పైన',
    rating: 'రేటింగ్',
    ratingAll: 'అన్ని రేటింగ్‌లు',
    rating45Plus: '⭐ 4.5+ ఉత్తమ రేటింగ్',
    rating40Plus: '⭐ 4.0+ మంచి రేటింగ్',
    sortBy: 'సార్టింగ్:',
    sortNearest: 'దగ్గరివి మొదట (దూరం)',
    sortRating: 'ఉత్తమ రేటింగ్',
    sortPriceAsc: 'ధర: తక్కువ నుండి ఎక్కువ',
    sortPriceDesc: 'ధర: ఎక్కువ నుండి తక్కువ',
    sortNewest: 'కొత్తవి',
    verifiedOnly: 'ధృవీకరించబడినవి మాత్రమే',
    featuredOnly: 'ఫీచర్డ్ మాత్రమే',
    clearFilters: 'అన్నీ క్లియర్ చేయండి',
    activeFilter: 'సక్రియ ఫిల్టర్:',
    prosAvailable: 'నిపుణులు అందుబాటులో ఉన్నారు',
    callNow: 'కాల్ చేయండి',
    chat: 'చాట్',
    bookNow: 'బుక్ చేయండి',
    verifiedPro: 'ధృవీకరించబడిన నిపుణుడు',
    arrivalIn: 'రాక సమయం:',
    away: 'దూరంలో',
    reviews: 'రివ్యూలు',
    enquiries: 'విచారణలు',
    pricing: 'సర్వీస్ ఛార్జీ',
    noResultsTitle: 'ఎలాంటి నిపుణులు కనిపించలేదు',
    noResultsDesc: 'దయచేసి దూరం లేదా ధర ఫిల్టర్లను మార్చండి లేదా రీసెట్ చేయండి.',
    resetAll: 'ఫిల్టర్లు రీసెట్ చేయండి',
    voiceSuggestions: ['హౌస్ క్లీనింగ్', 'ఎలక్ట్రీషియన్', 'ప్లంబర్', 'ఏసీ సర్వీస్', 'కార్పెంటర్', 'పెయింటింగ్', 'ఇంటి పని మనిషి', 'కార్ వాష్']
  },
  en: {
    appName: 'Crafto',
    searchPlaceholder: 'Search any service... (e.g. House cleaning, Electrician)',
    searchVoicePrompt: 'Search by voice',
    listening: 'Listening... speak now',
    speakNow: 'Say what service you need...',
    voiceSearchingFor: 'Searching for:',
    tapToSpeak: 'Tap microphone to speak',
    stopListening: 'Stop',
    createPost: '+ Post Free Ad',
    allServices: 'All Services & Categories',
    showAll44: 'Show All 44 Services',
    collapse: 'Collapse',
    more: 'More',
    less: 'Less',
    all: 'All',
    chooseLocality: 'Select Locality:',
    allAreas: 'All Areas in City',
    expressArrival: '⚡ 15-30 Mins Express Arrival',
    filterBy: 'Filters:',
    distance: 'Distance',
    distanceAll: 'All Distances',
    within5km: 'Within 5 km',
    within10km: 'Within 10 km',
    within15km: 'Within 15 km',
    price: 'Price',
    priceAll: 'All Prices',
    under500: 'Under ₹500',
    price500to1000: '₹500 - ₹1000',
    above1000: 'Above ₹1000',
    rating: 'Rating',
    ratingAll: 'All Ratings',
    rating45Plus: '⭐ 4.5+ Top Rated',
    rating40Plus: '⭐ 4.0+ High Rated',
    sortBy: 'Sort:',
    sortNearest: 'Nearest First (Distance)',
    sortRating: 'Highest Rated',
    sortPriceAsc: 'Price: Low to High',
    sortPriceDesc: 'Price: High to Low',
    sortNewest: 'Newest Added',
    verifiedOnly: 'Verified Only',
    featuredOnly: 'Featured Only',
    clearFilters: 'Clear All',
    activeFilter: 'Active Filter:',
    prosAvailable: 'Pros Available',
    callNow: 'Call Now',
    chat: 'Chat',
    bookNow: 'Book Pro',
    verifiedPro: 'Verified Professional',
    arrivalIn: 'Arrival:',
    away: 'away',
    reviews: 'reviews',
    enquiries: 'enquiries',
    pricing: 'Pricing',
    noResultsTitle: 'No Matching Professionals Found',
    noResultsDesc: 'Try adjusting your distance or price filters to see more results.',
    resetAll: 'Reset Filters',
    voiceSuggestions: ['House cleaning', 'Electrician', 'Plumber', 'AC repair', 'Carpenter', 'Painter', 'Maid', 'Car wash']
  },
  hi: {
    appName: 'बुक अवर स्पेस',
    searchPlaceholder: 'खोजें... (उदा: हाउस क्लीनिंग, इलेक्ट्रीशियन, प्लंबर)',
    searchVoicePrompt: 'आवाज से खोजें',
    listening: 'सुन रहे हैं... बोलिए',
    speakNow: 'आपको कौन सी सेवा चाहिए बताइए...',
    voiceSearchingFor: 'खोज रहे हैं:',
    tapToSpeak: 'बोलने के लिए माइक दबाएं',
    stopListening: 'रोकें',
    createPost: '+ विज्ञापन पोस्ट करें',
    allServices: 'सभी सेवाएं और श्रेणियां',
    showAll44: 'सभी 44 सेवाएं देखें',
    collapse: 'समेटें',
    more: 'और देखें',
    less: 'कम देखें',
    all: 'सभी',
    chooseLocality: 'अपना इलाका चुनें:',
    allAreas: 'शहर के सभी इलाके',
    expressArrival: '⚡ 15-30 मिनट में पहुंच',
    filterBy: 'फ़िल्टर:',
    distance: 'दूरी',
    distanceAll: 'सभी दूरियां',
    within5km: '5 किमी के भीतर',
    within10km: '10 किमी के भीतर',
    within15km: '15 किमी के भीतर',
    price: 'मूल्य',
    priceAll: 'सभी मूल्य',
    under500: '₹500 से कम',
    price500to1000: '₹500 - ₹1000',
    above1000: '₹1000 से अधिक',
    rating: 'रेटिंग',
    ratingAll: 'सभी रेटिंग',
    rating45Plus: '⭐ 4.5+ शीर्ष रेटेड',
    rating40Plus: '⭐ 4.0+ अच्छी रेटिंग',
    sortBy: 'क्रमबद्ध करें:',
    sortNearest: 'निकटतम पहले (दूरी)',
    sortRating: 'सर्वोच्च रेटेड',
    sortPriceAsc: 'कीमत: कम से ज्यादा',
    sortPriceDesc: 'कीमत: ज्यादा से कम',
    sortNewest: 'नवीनतम',
    verifiedOnly: 'केवल सत्यापित',
    featuredOnly: 'केवल विशेष',
    clearFilters: 'सभी हटाएं',
    activeFilter: 'सक्रिय फ़िल्टर:',
    prosAvailable: 'विशेषज्ञ उपलब्ध हैं',
    callNow: 'कॉल करें',
    chat: 'चैट करें',
    bookNow: 'बुक करें',
    verifiedPro: 'सत्यापित विशेषज्ञ',
    arrivalIn: 'पहुंचने का समय:',
    away: 'दूरी पर',
    reviews: 'समीक्षाएं',
    enquiries: 'पूछताछ',
    pricing: 'मूल्य',
    noResultsTitle: 'कोई विशेषज्ञ नहीं मिला',
    noResultsDesc: 'कृपया दूरी या मूल्य फ़िल्टर समायोजित करें।',
    resetAll: 'फ़िल्टर रीसेट करें',
    voiceSuggestions: ['हाउस क्लीनिंग', 'इलेक्ट्रीशियन', 'प्लंबर', 'एसी रिपेयर', 'कारपेंटर', 'पेंटर', 'कामवाली बाई', 'कार वॉश']
  },
  ta: {
    appName: 'புக் அவர் ஸ்பேஸ்',
    searchPlaceholder: 'தேடுக... (எ.கா: ஹவுஸ் கிளீனிங், எலக்ட்ரீஷியன்)',
    searchVoicePrompt: 'குரல் மூலம் தேடுக',
    listening: 'கேட்கிறது... பேசுங்கள்',
    speakNow: 'உங்களுக்கு தேவையான சேவையை சொல்லுங்கள்...',
    voiceSearchingFor: 'தேடல்:',
    tapToSpeak: 'பேச மைக் தட்டவும்',
    stopListening: 'நிறுத்து',
    createPost: '+ விளம்பரம் இடுக',
    allServices: 'அனைத்து சேவைகள் & பிரிவுகள்',
    showAll44: '44 சேவைகளையும் காண்க',
    collapse: 'மறைக்க',
    more: 'மேலும்',
    less: 'குறைவாக',
    all: 'அனைத்தும்',
    chooseLocality: 'உங்கள் பகுதியைத் தேர்ந்தெடுக்கவும்:',
    allAreas: 'நகரத்தின் அனைத்து பகுதிகள்',
    expressArrival: '⚡ 15-30 நிமிடங்களில் வருகை',
    filterBy: 'வடிகட்டி:',
    distance: 'தொலைவு',
    distanceAll: 'அனைத்து தூரங்களும்',
    within5km: '5 கி.மீக்குள்',
    within10km: '10 கி.மீக்குள்',
    within15km: '15 கி.மீக்குள்',
    price: 'விலை',
    priceAll: 'அனைத்து விலைகளும்',
    under500: '₹500க்குள்',
    price500to1000: '₹500 - ₹1000',
    above1000: '₹1000 மேல்',
    rating: 'மதிப்பீடு',
    ratingAll: 'அனைத்து மதிப்பீடுகள்',
    rating45Plus: '⭐ 4.5+ சிறந்த மதிப்பீடு',
    rating40Plus: '⭐ 4.0+ நல்ல மதிப்பீடு',
    sortBy: 'வரிசைப்படுத்துக:',
    sortNearest: 'அருகிலுள்ளவை முதலில் (தூரம்)',
    sortRating: 'உயர் மதிப்பீடு',
    sortPriceAsc: 'விலை: குறைவு முதல் அதிகம்',
    sortPriceDesc: 'விலை: அதிகம் முதல் குறைவு',
    sortNewest: 'புதியவை',
    verifiedOnly: 'சரிபார்க்கப்பட்டது மட்டும்',
    featuredOnly: 'சிறப்பானது மட்டும்',
    clearFilters: 'அனைத்தும் அழி',
    activeFilter: 'செயலில் உள்ள வடிகட்டி:',
    prosAvailable: 'நிபுணர்கள் உள்ளனர்',
    callNow: 'அழைக்க',
    chat: 'அரட்டை',
    bookNow: 'பதிவு செய்க',
    verifiedPro: 'சரிபார்க்கப்பட்ட நிபுணர்',
    arrivalIn: 'வருகை நேரம்:',
    away: 'தொலைவில்',
    reviews: 'மதிப்புரைகள்',
    enquiries: 'விசாரணைகள்',
    pricing: 'விலை',
    noResultsTitle: 'நிபுணர்கள் கிடைக்கவில்லை',
    noResultsDesc: 'தயவுசெய்து தூரம் அல்லது விலை வடிகட்டிகளை மாற்றவும்.',
    resetAll: 'வடிகட்டிகளை மீட்டமை',
    voiceSuggestions: ['ஹவுஸ் கிளீனிங்', 'எலக்ட்ரீஷியன்', 'பிளம்பர்', 'ஏசி சர்வீஸ்', 'கார்பெண்டர்', 'பெயிண்டர்', 'வேலைக்காரி', 'கார் வாஷ்']
  },
  kn: {
    appName: 'ಬುಕ್ ಅವರ್ ಸ್ಪೇಸ್',
    searchPlaceholder: 'ಹುಡುಕಿ... (ಉದಾ: ಹೌಸ್ ಕ್ಲೀನಿಂಗ್, ಎಲೆಕ್ಟ್ರಿಷಿಯನ್)',
    searchVoicePrompt: 'ಧ್ವನಿಯ ಮೂಲಕ ಹುಡುಕಿ',
    listening: 'ಕೇಳುತ್ತಿದ್ದೇವೆ... ಮಾತನಾಡಿ',
    speakNow: 'ನಿಮಗೆ ಬೇಕಾದ ಸೇವೆಯನ್ನು ಹೇಳಿ...',
    voiceSearchingFor: 'ಹುಡುಕಲಾಗುತ್ತಿದೆ:',
    tapToSpeak: 'ಮಾತನಾಡಲು ಮೈಕ್ ಒತ್ತಿರಿ',
    stopListening: 'ನಿಲ್ಲಿಸಿ',
    createPost: '+ ಜಾಹೀರಾತು ಪ್ರಕಟಿಸಿ',
    allServices: 'ಎಲ್ಲಾ ಸೇವೆಗಳು & ವಿಭಾಗಗಳು',
    showAll44: 'ಎಲ್ಲಾ 44 ಸೇವೆಗಳನ್ನು ನೋಡಿ',
    collapse: 'ಕುಗ್ಗಿಸಿ',
    more: 'ಇನ್ನಷ್ಟು',
    less: 'ಕಡಿಮೆ',
    all: 'ಎಲ್ಲಾ',
    chooseLocality: 'ನಿಮ್ಮ ಪ್ರದೇಶವನ್ನು ಆಯ್ಕೆಮಾಡಿ:',
    allAreas: 'ನಗರದ ಎಲ್ಲಾ ಪ್ರದೇಶಗಳು',
    expressArrival: '⚡ 15-30 ನಿಮಿಷಗಳಲ್ಲಿ ಆಗಮನ',
    filterBy: 'ಫಿಲ್ಟರ್‌ಗಳು:',
    distance: 'ದೂರ',
    distanceAll: 'ಎಲ್ಲಾ ದೂರಗಳು',
    within5km: '5 ಕಿ.ಮೀ ಒಳಗೆ',
    within10km: '10 ಕಿ.ಮೀ ಒಳಗೆ',
    within15km: '15 ಕಿ.ಮೀ ಒಳಗೆ',
    price: 'ಬೆಲೆ',
    priceAll: 'ಎಲ್ಲಾ ಬೆಲೆಗಳು',
    under500: '₹500 ಒಳಗೆ',
    price500to1000: '₹500 - ₹1000',
    above1000: '₹1000 ಕ್ಕಿಂತ ಹೆಚ್ಚು',
    rating: 'ರೇಟಿಂಗ್',
    ratingAll: 'ಎಲ್ಲಾ ರೇಟಿಂಗ್‌ಗಳು',
    rating45Plus: '⭐ 4.5+ ಉನ್ನತ ರೇಟಿಂಗ್',
    rating40Plus: '⭐ 4.0+ ಉತ್ತಮ ರೇಟಿಂಗ್',
    sortBy: 'ವಿಂಗಡಿಸಿ:',
    sortNearest: 'ಹತ್ತಿರದವರು ಮೊದಲು (ದೂರ)',
    sortRating: 'ಉನ್ನತ ರೇಟಿಂಗ್',
    sortPriceAsc: 'ಬೆಲೆ: ಕಡಿಮೆಯಿಂದ ಹೆಚ್ಚು',
    sortPriceDesc: 'ಬೆಲೆ: ಹೆಚ್ಚಿನಿಂದ ಕಡಿಮೆ',
    sortNewest: 'ಹೊಸದು',
    verifiedOnly: 'ಪರಿಶೀಲಿಸಿದವರು ಮಾತ್ರ',
    featuredOnly: 'ವಿಶೇಷ ಮಾತ್ರ',
    clearFilters: 'ಎಲ್ಲವನ್ನೂ ತೆರವುಗೊಳಿಸಿ',
    activeFilter: 'ಸಕ್ರಿಯ ಫಿಲ್ಟರ್:',
    prosAvailable: 'ತಜ್ಞರು ಲಭ್ಯವಿದ್ದಾರೆ',
    callNow: 'ಕರೆ ಮಾಡಿ',
    chat: 'ಚಾಟ್',
    bookNow: 'ಬುಕ್ ಮಾಡಿ',
    verifiedPro: 'ಪರಿಶೀಲಿತ ತಜ್ಞ',
    arrivalIn: 'ಆಗಮನ ಸಮಯ:',
    away: 'ದೂರದಲ್ಲಿ',
    reviews: 'ವಿಮರ್ಶೆಗಳು',
    enquiries: 'ವಿಚಾರಣೆಗಳು',
    pricing: 'ದರ',
    noResultsTitle: 'ಯಾವುದೇ ತಜ್ಞರು ಕಂಡುಬಂದಿಲ್ಲ',
    noResultsDesc: 'ದಯವಿಟ್ಟು ದೂರ ಅಥವಾ ಬೆಲೆ ಫಿಲ್ಟರ್‌ಗಳನ್ನು ಸರಿಹೊಂದಿಸಿ.',
    resetAll: 'ಫಿಲ್ಟರ್ ಮರುಹೊಂದಿಸಿ',
    voiceSuggestions: ['ಹೌಸ್ ಕ್ಲೀನಿಂಗ್', 'ಎಲೆಕ್ಟ್ರಿಷಿಯನ್', 'ಪ್ಲಂಬರ್', 'ಎಸಿ ಸರ್ವಿಸ್', 'ಕಾರ್ಪೆಂಟರ್', 'ಪೇಂಟರ್', 'ಮನೆಗೆಲಸದವರು', 'ಕಾರ್ ವಾಶ್']
  },
  ml: {
    appName: 'ബുക്ക് അവർ സ്പേസ്',
    searchPlaceholder: 'തിരയുക... (ഉദാ: ഹൗസ് ക്ലീനിംഗ്, ഇലക്ട്രീഷ്യൻ)',
    searchVoicePrompt: 'വോയ്‌സ് വഴി തിരയുക',
    listening: 'കേൾക്കുന്നു... സംസാരിക്കുക',
    speakNow: 'നിങ്ങൾക്ക് ആവശ്യമുള്ള സേവനം പറയുക...',
    voiceSearchingFor: 'തിരയുന്നത്:',
    tapToSpeak: 'സംസാരിക്കാൻ മൈക്ക് അമർത്തുക',
    stopListening: 'നിർത്തുക',
    createPost: '+ പരസ്യം നൽകുക',
    allServices: 'എല്ലാ സേവനങ്ങളും വിഭാഗങ്ങളും',
    showAll44: 'എല്ലാ 44 സേവനങ്ങളും കാണുക',
    collapse: 'ചുരുക്കുക',
    more: 'കൂടുതൽ',
    less: 'കുറവ്',
    all: 'എല്ലാം',
    chooseLocality: 'നിങ്ങളുടെ പ്രദേശം തിരഞ്ഞെടുക്കുക:',
    allAreas: 'നഗരത്തിലെ എല്ലാ പ്രദേശങ്ങളും',
    expressArrival: '⚡ 15-30 മിനിറ്റിൽ എത്തും',
    filterBy: 'ഫിൽട്ടറുകൾ:',
    distance: 'ദൂരം',
    distanceAll: 'എല്ലാ ദൂരങ്ങളും',
    within5km: '5 കി.മീറ്ററിനുള്ളിൽ',
    within10km: '10 കി.മീറ്ററിനുള്ളിൽ',
    within15km: '15 കി.മീറ്ററിനുള്ളിൽ',
    price: 'വില',
    priceAll: 'എല്ലാ വിലകളും',
    under500: '₹500 താഴെ',
    price500to1000: '₹500 - ₹1000',
    above1000: '₹1000 മുകളിൽ',
    rating: 'റേറ്റിംഗ്',
    ratingAll: 'എല്ലാ റേറ്റിംഗുകളും',
    rating45Plus: '⭐ 4.5+ മികച്ചത്',
    rating40Plus: '⭐ 4.0+ നല്ലത്',
    sortBy: 'ക്രമീകരിക്കുക:',
    sortNearest: 'ഏറ്റവും അടുത്തത് ആദ്യം',
    sortRating: 'ഉയർന്ന റേറ്റിംഗ്',
    sortPriceAsc: 'വില: കുറഞ്ഞത് മുതൽ',
    sortPriceDesc: 'വില: കൂടിയത് മുതൽ',
    sortNewest: 'പുതിയത്',
    verifiedOnly: 'പരിശോധിച്ചുറപ്പിച്ചവർ മാത്രം',
    featuredOnly: 'പ്രത്യേകം മാത്രം',
    clearFilters: 'എല്ലാം മായ്ക്കുക',
    activeFilter: 'സജീവ ഫിൽട്ടർ:',
    prosAvailable: 'വിദഗ്ദ്ധർ ലഭ്യമാണ്',
    callNow: 'വിളിക്കുക',
    chat: 'ചാറ്റ്',
    bookNow: 'ബുക്ക് ചെയ്യുക',
    verifiedPro: 'വെരിഫൈഡ് പ്രൊഫഷണൽ',
    arrivalIn: 'എത്തുന്ന സമയം:',
    away: 'അകലെ',
    reviews: 'റിവ്യൂകൾ',
    enquiries: 'അന്വേഷണങ്ങൾ',
    pricing: 'വില',
    noResultsTitle: 'വിദഗ്ദ്ധരെ കണ്ടെത്തിയില്ല',
    noResultsDesc: 'ദയവായി ദൂരമോ വിലയോ ക്രമീകരിക്കുക.',
    resetAll: 'റീസെറ്റ് ചെയ്യുക',
    voiceSuggestions: ['ഹൗസ് ക്ലീനിംഗ്', 'ഇലക്ട്രീഷ്യൻ', 'പ്ലമ്പർ', 'എസി സർവീസ്', 'കണ്ണാടി പണി', 'പെയിന്റിംഗ്']
  },
  mr: {
    appName: 'बुक अवर स्पेस',
    searchPlaceholder: 'शोधा... (उदा. हाऊस क्लीनिंग, इलेक्ट्रिशियन)',
    searchVoicePrompt: 'आवाजाने शोधा',
    listening: 'ऐकत आहे... बोला',
    speakNow: 'तुम्हाला कोणती सेवा हवी आहे ते सांगा...',
    voiceSearchingFor: 'शोधत आहे:',
    tapToSpeak: 'बोलण्यासाठी माइक दाबा',
    stopListening: 'थांबा',
    createPost: '+ जाहिरात पोस्ट करा',
    allServices: 'सर्व सेवा आणि श्रेणी',
    showAll44: 'सर्व 44 सेवा पहा',
    collapse: 'कमी करा',
    more: 'अधिक',
    less: 'कमी',
    all: 'सर्व',
    chooseLocality: 'तुमचा परिसर निवडा:',
    allAreas: 'शहरातील सर्व परिसर',
    expressArrival: '⚡ 15-30 मिनिटांत आगमन',
    filterBy: 'फिल्टर:',
    distance: 'अंतर',
    distanceAll: 'सर्व अंतर',
    within5km: '5 किमीच्या आत',
    within10km: '10 किमीच्या आत',
    within15km: '15 किमीच्या आत',
    price: 'किंमत',
    priceAll: 'सर्व किमती',
    under500: '₹500 पेक्षा कमी',
    price500to1000: '₹500 - ₹1000',
    above1000: '₹1000 पेक्षा जास्त',
    rating: 'रेटिंग',
    ratingAll: 'सर्व रेटिंग',
    rating45Plus: '⭐ 4.5+ टॉप रेटेड',
    rating40Plus: '⭐ 4.0+ उत्तम रेटिंग',
    sortBy: 'क्रमवारी लावा:',
    sortNearest: 'जवळचे आधी (अंतर)',
    sortRating: 'सर्वोच्च रेटिंग',
    sortPriceAsc: 'किंमत: कमी ते जास्त',
    sortPriceDesc: 'किंमत: जास्त ते कमी',
    sortNewest: 'नवीनतम',
    verifiedOnly: 'केवळ सत्यापित',
    featuredOnly: 'केवळ वैशिष्ट्यीकृत',
    clearFilters: 'सर्व काढा',
    activeFilter: 'सक्रिय फिल्टर:',
    prosAvailable: 'तज्ज्ञ उपलब्ध आहेत',
    callNow: 'कॉल करा',
    chat: 'चॅट करा',
    bookNow: 'बुक करा',
    verifiedPro: 'सत्यापित तज्ज्ञ',
    arrivalIn: 'पोहोचण्याची वेळ:',
    away: 'अंतरावर',
    reviews: 'पुनरावलोकने',
    enquiries: 'चौकशी',
    pricing: 'किंमत',
    noResultsTitle: 'कोणतेही तज्ज्ञ सापडले नाहीत',
    noResultsDesc: 'कृपया अंतर किंवा किंमत फिल्टर बदला.',
    resetAll: 'फिल्टर रीसेट करा',
    voiceSuggestions: ['हाऊस क्लीनिंग', 'इलेक्ट्रिशियन', 'प्लंबर', 'एसी रिपेअर', 'पेंटर']
  },
  bn: {
    appName: 'বুক আওয়ার স্পেস',
    searchPlaceholder: 'খুঁজুন... (যেমন: হাউস ক্লিনিং, ইলেকট্রিশিয়ান)',
    searchVoicePrompt: 'ভয়েসে খুঁজুন',
    listening: 'শুনছি... বলুন',
    speakNow: 'আপনার কী পরিষেবা প্রয়োজন বলুন...',
    voiceSearchingFor: 'অনুসন্ধান:',
    tapToSpeak: 'বলতে মাইকে চাপুন',
    stopListening: 'থামুন',
    createPost: '+ পোস্ট করুন',
    allServices: 'সমস্ত পরিষেবা ও বিভাগ',
    showAll44: 'সমস্ত 44টি পরিষেবা দেখুন',
    collapse: 'সংক্ষেপ করুন',
    more: 'আরও',
    less: 'কম',
    all: 'সব',
    chooseLocality: 'আপনার এলাকা নির্বাচন করুন:',
    allAreas: 'শহরের সমস্ত এলাকা',
    expressArrival: '⚡ 15-30 মিনিটে আগমন',
    filterBy: 'ফিল্টার:',
    distance: 'দূরত্ব',
    distanceAll: 'সমস্ত দূরত্ব',
    within5km: '5 কিমি এর মধ্যে',
    within10km: '10 কিমি এর মধ্যে',
    within15km: '15 কিমি এর মধ্যে',
    price: 'মূল্য',
    priceAll: 'সমস্ত মূল্য',
    under500: '₹500 এর নিচে',
    price500to1000: '₹500 - ₹1000',
    above1000: '₹1000 এর উপরে',
    rating: 'রেটিং',
    ratingAll: 'সমস্ত রেটিং',
    rating45Plus: '⭐ 4.5+ শীর্ষ রেটেড',
    rating40Plus: '⭐ 4.0+ ভালো রেটিং',
    sortBy: 'সাজান:',
    sortNearest: 'নিকটতম প্রথমে (দূরত্ব)',
    sortRating: 'সর্বোচ্চ রেটিং',
    sortPriceAsc: 'মূল্য: কম থেকে বেশি',
    sortPriceDesc: 'মূল্য: বেশি থেকে কম',
    sortNewest: 'নতুনতম',
    verifiedOnly: 'কেবল যাচাইকৃত',
    featuredOnly: 'কেবল বিশিষ্ট',
    clearFilters: 'সমস্ত মুছুন',
    activeFilter: 'সক্রিয় ফিল্টার:',
    prosAvailable: 'বিশেষজ্ঞ উপলব্ধ',
    callNow: 'কল করুন',
    chat: 'চ্যাট',
    bookNow: 'বুক করুন',
    verifiedPro: 'যাচাইকৃত বিশেষজ্ঞ',
    arrivalIn: 'পৌঁছানোর সময়:',
    away: 'দূরে',
    reviews: 'পর্যালোচনা',
    enquiries: 'অনুসন্ধান',
    pricing: 'মূল্য',
    noResultsTitle: 'কোনো বিশেষজ্ঞ পাওয়া যায়নি',
    noResultsDesc: 'অনুগ্রহ করে দূরত্ব বা মূল্যের ফিল্টার পরিবর্তন করুন।',
    resetAll: 'রিসেট করুন',
    voiceSuggestions: ['হাউস ক্লিনিং', 'ইলেকট্রিশিয়ান', 'প্লাম্বার', 'এসি সার্ভিস', 'পেইন্টার']
  },
  gu: {
    appName: 'બુક અવર સ્પેસ',
    searchPlaceholder: 'શોધો... (દા.ત. હાઉસ ક્લિનિંગ, ઇલેક્ટ્રિશિયન)',
    searchVoicePrompt: 'અવાજથી શોધો',
    listening: 'સાંભળી રહ્યા છીએ... બોલો',
    speakNow: 'તમારે કઈ સેવાની જરૂર છે તે કહો...',
    voiceSearchingFor: 'શોધી રહ્યા છીએ:',
    tapToSpeak: 'બોલવા માટે માઇક દબાવો',
    stopListening: 'બંધ કરો',
    createPost: '+ પોસ્ટ કરો',
    allServices: 'તમામ સેવાઓ અને શ્રેણીઓ',
    showAll44: 'તમામ 44 સેવાઓ જુઓ',
    collapse: 'સંકોચો',
    more: 'વધુ',
    less: 'ઓછું',
    all: 'બધું',
    chooseLocality: 'તમારો વિસ્તાર પસંદ કરો:',
    allAreas: 'શહેરના તમામ વિસ્તારો',
    expressArrival: '⚡ 15-30 મિનિટમાં આગમન',
    filterBy: 'ફિલ્ટર્સ:',
    distance: 'અંતર',
    distanceAll: 'તમામ અંતર',
    within5km: '5 કિમી અંદર',
    within10km: '10 કિમી અંદર',
    within15km: '15 કિમી અંદર',
    price: 'કિંમત',
    priceAll: 'તમામ કિંમતો',
    under500: '₹500 થી ઓછી',
    price500to1000: '₹500 - ₹1000',
    above1000: '₹1000 થી વધુ',
    rating: 'રેટિંગ',
    ratingAll: 'તમામ રેટિંગ',
    rating45Plus: '⭐ 4.5+ ટોપ રેટિંગ',
    rating40Plus: '⭐ 4.0+ સારું રેટિંગ',
    sortBy: 'ક્રમબદ્ધ કરો:',
    sortNearest: 'નજીકના પહેલાં',
    sortRating: 'ઉચ્ચ રેટિંગ',
    sortPriceAsc: 'કિંમત: ઓછી થી વધુ',
    sortPriceDesc: 'કિંમત: વધુ થી ઓછી',
    sortNewest: 'નવું',
    verifiedOnly: 'માત્ર ચકાસાયેલ',
    featuredOnly: 'માત્ર વિશેષ',
    clearFilters: 'બધું સાફ કરો',
    activeFilter: 'સક્રિય ફિલ્ટર:',
    prosAvailable: 'નિષ્ણાતો ઉપલબ્ધ છે',
    callNow: 'કોલ કરો',
    chat: 'ચેટ કરો',
    bookNow: 'બુક કરો',
    verifiedPro: 'ચકાસાયેલ નિષ્ણાત',
    arrivalIn: 'પહોંચવાનો સમય:',
    away: 'દૂર',
    reviews: 'સમીક્ષાઓ',
    enquiries: 'પૂછપરછ',
    pricing: 'કિંમત',
    noResultsTitle: 'કોઈ નિષ્ણાત મળ્યા નથી',
    noResultsDesc: 'કૃપા કરીને ફિલ્ટર્સ સમાયોજિત કરો.',
    resetAll: 'રીસેટ કરો',
    voiceSuggestions: ['હાઉસ ક્લિનિંગ', 'ઇલેક્ટ્રિશિયન', 'પ્લમ્બર', 'એસી રિપેર']
  },
  pa: {
    appName: 'ਬੁੱਕ ਅਵਰ ਸਪੇਸ',
    searchPlaceholder: 'ਖੋਜੋ... (ਜਿਵੇਂ: ਹਾਊਸ ਕਲੀਨਿੰਗ, ਇਲੈਕਟ੍ਰੀਸ਼ੀਅਨ)',
    searchVoicePrompt: 'ਆਵਾਜ਼ ਨਾਲ ਖੋਜੋ',
    listening: 'ਸੁਣ ਰਹੇ ਹਾਂ... ਬੋਲੋ',
    speakNow: 'ਤੁਹਾਨੂੰ ਕਿਹੜੀ ਸੇਵਾ ਚਾਹੀਦੀ ਹੈ ਦੱਸੋ...',
    voiceSearchingFor: 'ਖੋਜਿਆ ਜਾ ਰਿਹਾ ਹੈ:',
    tapToSpeak: 'ਬੋਲਣ ਲਈ ਮਾਈਕ ਦਬਾਓ',
    stopListening: 'ਰੋਕੋ',
    createPost: '+ ਪੋਸਟ ਕਰੋ',
    allServices: 'ਸਾਰੀਆਂ ਸੇਵਾਵਾਂ ਤੇ ਸ਼੍ਰੇਣੀਆਂ',
    showAll44: 'ਸਾਰੀਆਂ 44 ਸੇਵਾਵਾਂ ਦੇਖੋ',
    collapse: 'ਘਟਾਓ',
    more: 'ਹੋਰ',
    less: 'ਘੱਟ',
    all: 'ਸਭ',
    chooseLocality: 'ਆਪਣਾ ਇਲਾਕਾ ਚੁਣੋ:',
    allAreas: 'ਸ਼ਹਿਰ ਦੇ ਸਾਰੇ ਇਲਾਕੇ',
    expressArrival: '⚡ 15-30 ਮਿੰਟਾਂ ਵਿੱਚ ਪਹੁੰਚ',
    filterBy: 'ਫਿਲਟਰ:',
    distance: 'ਦੂਰੀ',
    distanceAll: 'ਸਾਰੀ ਦੂਰੀ',
    within5km: '5 ਕਿਮੀ ਦੇ ਅੰਦਰ',
    within10km: '10 ਕਿਮੀ ਦੇ ਅੰਦਰ',
    within15km: '15 ਕਿਮੀ ਦੇ ਅੰਦਰ',
    price: 'ਕੀਮਤ',
    priceAll: 'ਸਾਰੀਆਂ ਕੀਮਤਾਂ',
    under500: '₹500 ਤੋਂ ਘੱਟ',
    price500to1000: '₹500 - ₹1000',
    above1000: '₹1000 ਤੋਂ ਵੱਧ',
    rating: 'ਰੇਟਿੰਗ',
    ratingAll: 'ਸਾਰੀਆਂ ਰੇਟਿੰਗਾਂ',
    rating45Plus: '⭐ 4.5+ ਸਿਖਰ ਰੇਟਿੰਗ',
    rating40Plus: '⭐ 4.0+ ਚੰਗੀ ਰੇਟਿੰਗ',
    sortBy: 'ਕ੍ਰਮਬੱਧ ਕਰੋ:',
    sortNearest: 'ਨੇੜੇ ਵਾਲੇ ਪਹਿਲਾਂ',
    sortRating: 'ਉੱਚ ਰੇਟਿੰਗ',
    sortPriceAsc: 'ਕੀਮਤ: ਘੱਟ ਤੋਂ ਵੱਧ',
    sortPriceDesc: 'ਕੀਮਤ: ਵੱਧ ਤੋਂ ਘੱਟ',
    sortNewest: 'ਨਵਾਂ',
    verifiedOnly: 'ਸਿਰਫ਼ ਤਸਦੀਕਸ਼ੁਦਾ',
    featuredOnly: 'ਸਿਰਫ਼ ਵਿਸ਼ੇਸ਼',
    clearFilters: 'ਸਭ ਹਟਾਓ',
    activeFilter: 'ਸਰਗਰਮ ਫਿਲਟਰ:',
    prosAvailable: 'ਮਾਹਰ ਉਪਲਬਧ ਹਨ',
    callNow: 'ਕਾਲ ਕਰੋ',
    chat: 'ਗੱਲਬਾਤ',
    bookNow: 'ਬੁੱਕ ਕਰੋ',
    verifiedPro: 'ਤਸਦੀਕਸ਼ੁਦਾ ਮਾਹਰ',
    arrivalIn: 'ਪਹੁੰਚਣ ਦਾ ਸਮਾਂ:',
    away: 'ਦੂਰ',
    reviews: 'ਸਮੀਖਿਆਵਾਂ',
    enquiries: 'ਪੁੱਛਗਿੱਛ',
    pricing: 'ਕੀਮਤ',
    noResultsTitle: 'ਕੋਈ ਮਾਹਰ ਨਹੀਂ ਮਿਲਿਆ',
    noResultsDesc: 'ਕਿਰਪਾ ਕਰਕੇ ਫਿਲਟਰ ਬਦਲੋ।',
    resetAll: 'ਰੀਸੈੱਟ ਕਰੋ',
    voiceSuggestions: ['ਹਾਊਸ ਕਲੀਨਿੰਗ', 'ਇਲੈਕਟ੍ਰੀਸ਼ੀਅਨ', 'ਪਲੰਬਰ', 'ਏਸੀ ਰਿਪੇਅਰ']
  },
  or: {
    appName: 'ବୁକ୍ ଆୱାର ସ୍ପେସ୍',
    searchPlaceholder: 'ଖୋଜନ୍ତୁ... (ଯଥା: ହାଉସ୍ କ୍ଲିନିଂ, ଇଲେକ୍ଟ୍ରିସିଆନ୍)',
    searchVoicePrompt: 'ଭଏସ୍ ଦ୍ୱାରା ଖୋଜନ୍ତୁ',
    listening: 'ଶୁଣୁଛୁ... କୁହନ୍ତୁ',
    speakNow: 'ଆପଣଙ୍କର କେଉଁ ସେବା ଆବଶ୍ୟକ କୁହନ୍ତୁ...',
    voiceSearchingFor: 'ଖୋଜା ଚାଲିଛି:',
    tapToSpeak: 'କହିବା ପାଇଁ ମାଇକ୍ ଦବାନ୍ତୁ',
    stopListening: 'ବନ୍ଦ କରନ୍ତୁ',
    createPost: '+ ପୋଷ୍ଟ କରନ୍ତୁ',
    allServices: 'ସମସ୍ତ ସେବା ଏବଂ ବର୍ଗ',
    showAll44: 'ସମସ୍ତ 44 ସେବା ଦେଖନ୍ତୁ',
    collapse: 'ସଙ୍କୁଚିତ କରନ୍ତୁ',
    more: 'ଅଧିକ',
    less: 'କମ୍',
    all: 'ସବୁ',
    chooseLocality: 'ଆପଣଙ୍କ ଅଞ୍ଚଳ ବାଛନ୍ତୁ:',
    allAreas: 'ସହରର ସମସ୍ତ ଅଞ୍ଚଳ',
    expressArrival: '⚡ 15-30 ମିନିଟ୍ ମଧ୍ୟରେ ପହଞ୍ଚିବେ',
    filterBy: 'ଫିଲ୍ଟର୍:',
    distance: 'ଦୂରତା',
    distanceAll: 'ସମସ୍ତ ଦୂରତା',
    within5km: '5 କି.ମି ଭିତରେ',
    within10km: '10 କି.ମି ଭିତରେ',
    within15km: '15 କି.ମି ଭିତରେ',
    price: 'ମୂଲ୍ୟ',
    priceAll: 'ସମସ୍ତ ମୂଲ୍ୟ',
    under500: '₹500 ରୁ କମ୍',
    price500to1000: '₹500 - ₹1000',
    above1000: '₹1000 ରୁ ଅଧିକ',
    rating: 'ରେଟିଂ',
    ratingAll: 'ସମସ୍ତ ରେଟିଂ',
    rating45Plus: '⭐ 4.5+ ଶୀର୍ଷ ରେଟିଂ',
    rating40Plus: '⭐ 4.0+ ଭଲ ରେଟିଂ',
    sortBy: 'ସଜାନ୍ତୁ:',
    sortNearest: 'ନିକଟତମ ପ୍ରଥମେ',
    sortRating: 'ସର୍ବୋଚ୍ଚ ରେଟିଂ',
    sortPriceAsc: 'ମୂଲ୍ୟ: କମ୍ ରୁ ଅଧିକ',
    sortPriceDesc: 'ମୂଲ୍ୟ: ଅଧିକ ରୁ କମ୍',
    sortNewest: 'ନୂଆ',
    verifiedOnly: 'କେବଳ ଯାଞ୍ଚ ହୋଇଥିବା',
    featuredOnly: 'କେବଳ ସ୍ୱତନ୍ତ୍ର',
    clearFilters: 'ସବୁ ହଟାନ୍ତୁ',
    activeFilter: 'ସକ୍ରିୟ ଫିଲ୍ଟର୍:',
    prosAvailable: 'ବିଶେଷଜ୍ଞ ଉପଲବ୍ଧ ଅଛନ୍ତି',
    callNow: 'କଲ୍ କରନ୍ତୁ',
    chat: 'ଚାଟ୍',
    bookNow: 'ବୁକ୍ କରନ୍ତୁ',
    verifiedPro: 'ଯାଞ୍ଚ ହୋଇଥିବା ବିଶେଷଜ୍ଞ',
    arrivalIn: 'ପହଞ୍ଚିବା ସମୟ:',
    away: 'ଦୂରରେ',
    reviews: 'ସମୀକ୍ଷା',
    enquiries: 'ଅନୁସନ୍ଧାନ',
    pricing: 'ମୂଲ୍ୟ',
    noResultsTitle: 'କୌଣସି ବିଶେଷଜ୍ଞ ମିଳିଲେ ନାହିଁ',
    noResultsDesc: 'ଦୟାକରି ଫିଲ୍ଟର୍ ବଦଳାନ୍ତୁ।',
    resetAll: 'ରିସେଟ୍ କରନ୍ତୁ',
    voiceSuggestions: ['ହାଉସ୍ କ୍ଲିନିଂ', 'ଇଲେକ୍ଟ୍ରିସିଆନ୍', 'ପ୍ଲମ୍ବର', 'ଏସି ରିପେୟାର୍']
  },
  ur: {
    appName: 'بک آور اسپیس',
    searchPlaceholder: 'تلاش کریں... (مثلاً: ہاؤس کلیننگ، الیکٹریشن)',
    searchVoicePrompt: 'آواز سے تلاش کریں',
    listening: 'سن رہے ہیں... بولیں',
    speakNow: 'آپ کو کون سی سروس چاہیے بتائیں...',
    voiceSearchingFor: 'تلاش:',
    tapToSpeak: 'بولنے کے لیے مائیک دبائیں',
    stopListening: 'روکیں',
    createPost: '+ پوسٹ کریں',
    allServices: 'تمام خدمات اور کیٹیگریز',
    showAll44: 'تمام 44 خدمات دیکھیں',
    collapse: 'مختصر کریں',
    more: 'مزید',
    less: 'کم',
    all: 'سب',
    chooseLocality: 'اپنا علاقہ منتخب کریں:',
    allAreas: 'شہر کے تمام علاقے',
    expressArrival: '⚡ 15-30 منٹ میں آمد',
    filterBy: 'فلٹرز:',
    distance: 'فاصلہ',
    distanceAll: 'تمام فاصلے',
    within5km: '5 کلومیٹر کے اندر',
    within10km: '10 کلومیٹر کے اندر',
    within15km: '15 کلومیٹر کے اندر',
    price: 'قیمت',
    priceAll: 'تمام قیمتیں',
    under500: '₹500 سے کم',
    price500to1000: '₹500 - ₹1000',
    above1000: '₹1000 سے زیادہ',
    rating: 'درجہ بندی',
    ratingAll: 'تمام درجہ بندیاں',
    rating45Plus: '⭐ 4.5+ اعلیٰ ترین',
    rating40Plus: '⭐ 4.0+ اچھی درجہ بندی',
    sortBy: 'ترتیب دیں:',
    sortNearest: 'قریب ترین پہلے',
    sortRating: 'سب سے زیادہ ریٹنگ',
    sortPriceAsc: 'قیمت: کم سے زیادہ',
    sortPriceDesc: 'قیمت: زیادہ سے کم',
    sortNewest: 'تازہ ترین',
    verifiedOnly: 'صرف تصدیق شدہ',
    featuredOnly: 'صرف نمایاں',
    clearFilters: 'سب صاف کریں',
    activeFilter: 'فعال فلٹر:',
    prosAvailable: 'ماہرین دستیاب ہیں',
    callNow: 'کال کریں',
    chat: 'چیٹ',
    bookNow: 'بک کریں',
    verifiedPro: 'تصدیق شدہ ماہر',
    arrivalIn: 'پہنچنے کا وقت:',
    away: 'فاصلے پر',
    reviews: 'جائزے',
    enquiries: 'استفسارات',
    pricing: 'قیمت',
    noResultsTitle: 'کوئی ماہر نہیں ملا',
    noResultsDesc: 'براہ کرم فلٹرز تبدیل کریں۔',
    resetAll: 'دوبارہ ترتیب دیں',
    voiceSuggestions: ['ہاؤس کلیننگ', 'الیکٹریشن', 'پلمبر', 'اے سی ریپیئر']
  }
};

// Subcategory vernacular translation dictionary
export const subcategoryTranslations: Record<string, { te: string; hi: string }> = {
  // Cleaning
  'House cleaning': { te: 'హౌస్ క్లీనింగ్', hi: 'हाउस क्लीनिंग' },
  'Deep cleaning': { te: 'డీప్ క్లీనింగ్', hi: 'डीप क्लीनिंग' },
  'Bathroom cleaning': { te: 'బాత్‌రూమ్ క్లీనింగ్', hi: 'बाथरूम क्लीनिंग' },
  'Kitchen cleaning': { te: 'కిచెన్ క్లీనింగ్', hi: 'किचन क्लीनिंग' },
  'Sofa cleaning': { te: 'సోఫా క్లీనింగ్', hi: 'सोफा क्लीनिंग' },
  'Carpet cleaning': { te: 'కార్పెట్ క్లీనింగ్', hi: 'कालीन क्लीनिंग' },
  'Mattress cleaning': { te: 'మ్యాట్రెస్ క్లీనింగ్', hi: 'गद्दे की सफाई' },
  'Water tank cleaning': { te: 'వాటర్ ట్యాంక్ క్లీనింగ్', hi: 'पानी की टंकी की सफाई' },

  // Electrical
  'Electrician': { te: 'ఎలక్ట్రీషియన్', hi: 'इलेक्ट्रीशियन' },
  'Wiring': { te: 'వైరింగ్ సర్వీసెస్', hi: 'वायरिंग सेवा' },
  'Switch repair': { te: 'స్విచ్ రిపేర్', hi: 'स्विच मरम्मत' },
  'Fan installation': { te: 'ఫ్యాన్ ఫిట్టింగ్', hi: 'पंखा इंस्टालेशन' },
  'Lighting installation': { te: 'లైటింగ్ ఫిట్టింగ్', hi: 'लाइटिंग इंस्टालेशन' },
  'Inverter repair': { te: 'ఇన్వర్టర్ రిపేర్', hi: 'इन्वर्टर मरम्मत' },
  'Generator service': { te: 'జనరేటర్ సర్వీస్', hi: 'जनरेटर सर्विस' },

  // Plumbing
  'Tap repair': { te: 'ట్యాప్ రిపేర్', hi: 'नल मरम्मत' },
  'Pipe leakage': { te: 'పైప్ లీకేజ్', hi: 'पाइप लीकेज' },
  'Bathroom fittings': { te: 'బాత్‌రూమ్ ఫిట్టింగ్స్', hi: 'बाथरूम फिटिंग्स' },
  'Drain cleaning': { te: 'డ్రైన్ క్లీనింగ్', hi: 'ड्रेन क्लीनिंग' },
  'Water motor repair': { te: 'మోటార్ రిపేర్', hi: 'पानी का मोटर रिपेयर' },
  'Pump installation': { te: 'పంప్ ఫిట్టింగ్', hi: 'पंप इंस्टालेशन' },

  // Appliance
  'AC': { te: 'ఏసీ సర్వీస్ & గ్యాస్', hi: 'एसी रिपेयर' },
  'Refrigerator': { te: 'ఫ్రిజ్ రిపేర్', hi: 'फ्रिज रिपेयर' },
  'Washing machine': { te: 'వాషింగ్ మెషీన్', hi: 'वाशिंग मशीन' },
  'Microwave': { te: 'మైక్రోవేవ్', hi: 'माइक्रोवेव' },
  'Geyser': { te: 'గీజర్ రిపేర్', hi: 'गीजर रिपेयर' },
  'Water purifier': { te: 'RO వాటర్ ప్యూరిఫైయర్', hi: 'वाटर प्यूरीफायर' },

  // Carpentry
  'Carpenter': { te: 'కార్పెంటర్ (చెక్క పని)', hi: 'बढ़ई / कारपेंटर' },
  'Furniture repair': { te: 'ఫర్నిచర్ రిపేర్', hi: 'फर्नीचर मरम्मत' },
  'Door lock repair': { te: 'డోర్ లాక్ రిపేర్', hi: 'दरवाजे का ताला' },

  // Painting
  'House painting': { te: 'హౌస్ పెయింటింగ్', hi: 'घर की पुताई' },
  'Wall putty': { te: 'వాల్ పుట్టీ', hi: 'वॉल पुट्टी' },
  'Waterproofing': { te: 'వాటర్‌ప్రూఫింగ్', hi: 'वाटरप्रूफिंग' },

  // Domestic help
  'Maid': { te: 'ఇంటి పని మనిషి (మెయిడ్)', hi: 'कामवाली बाई' },
  'Cook': { te: 'వంట మనిషి (కుక్)', hi: 'रसोइया' },
  'Babysitter': { te: 'బేబీ సిట్టర్ (ఆయా)', hi: 'बेबीसिटर' },
  'Elder care': { te: 'వృద్ధుల సంరక్షణ', hi: 'बुजुर्गों की देखभाल' },

  // Vehicle
  'Car repair': { te: 'కార్ రిపేర్ & సర్వీస్', hi: 'कार रिपेयर' },
  'Washing': { te: 'డోర్‌స్టెప్ వాష్', hi: 'कार धुलाई' },
  'Bike repair': { te: 'బైక్ రిపేర్', hi: 'बाइक रिपेयर' },
  'Puncture': { te: 'పంచర్ సర్వీస్', hi: 'पंचर सर्विस' },
  'Packers and movers': { te: 'ప్యాకర్స్ & మూవర్స్', hi: 'पैकर्स एंड मूवर्स' }
};

export function getSubcategoryDisplayName(subcat: string, lang: AppLanguage): string {
  if (!subcat) return '';
  if (lang === 'en') return subcat;
  const match = subcategoryTranslations[subcat];
  if (match) {
    if (lang === 'te' && match.te) return match.te;
    if (lang === 'hi' && match.hi) return match.hi;
  }
  return transliterateLatinToScript(subcat, lang);
}

// Provider Name Authentic Vernacular Translations
export const providerNameTranslations: Record<string, { te: string; hi: string }> = {
  'Mohammed Ghouse': { te: 'మహమ్మద్ గౌస్', hi: 'मोहम्मद गौस' },
  'Sravan Kumar': { te: 'శ్రవణ్ కుమార్', hi: 'श्रवण कुमार' },
  'Lakshmi Home Care': { te: 'లక్ష్మి హోమ్ కేర్', hi: 'लक्ष्मी होम केयर' },
  'Venkatesh Babu': { te: 'వెంకటేష్ బాబు', hi: 'वेंकटेश बाबू' },
  'UrbanShine Team': { te: 'అర్బన్‌షైన్ టీమ్', hi: 'अर्बनशाइन टीम' },
  'Balaji Express Crew': { te: 'బాలాజీ ఎక్స్‌ప్రెస్ సిబ్బంది', hi: 'बालाजी एक्सप्रेस क्रू' },
  'Kiran Reddy & Sons': { te: 'కిరణ్ రెడ్డి & సన్స్', hi: 'किरण रेड्डी एंड संस' },
  'Anil Sharma Pro': { te: 'అనిల్ శర్మ ప్రో', hi: 'अनिल शर्मा प्रो' },
  'Ramesh Babu': { te: 'రమేష్ బాబు', hi: 'रमेश बाबू' },
  'Sunita Rao Home Helpers': { te: 'సునీతారావు హోమ్ హెల్పర్స్', hi: 'सुनीता राव होम हेल्पर्स' },
  'Suresh Babu': { te: 'సురేష్ బాబు', hi: 'सुरेश बाबू' },
  'Raju Goud': { te: 'రాజు గౌడ్', hi: 'राजू गौड़' },
  'Sister Mary Teresa': { te: 'సిస్టర్ మేరీ థెరిసా', hi: 'सिस्टर मैरी टेरेसा' },
  'NARENDRA': { te: 'నరేంద్ర', hi: 'नरेंद्र' },
  'Shiva Shankar': { te: 'శివ శంకర్', hi: 'शिव शंकर' },
  'Mohd Ghouse': { te: 'మహమ్మద్ గౌస్', hi: 'मोहम्मद गौस' },
  'Ghouse': { te: 'గౌస్', hi: 'गौस' }
};

// Price Unit Localized Translations
export const priceUnitTranslations: Record<string, { te: string; hi: string }> = {
  '/visit': { te: '/విజిట్', hi: '/विज़िट' },
  '/hr': { te: '/గంటకు', hi: '/घंटा' },
  '/month': { te: '/నెలకు', hi: '/महीना' },
  '/day': { te: '/రోజుకు', hi: '/दिन' },
  '/point': { te: '/పాయింట్', hi: '/प्वाइंट' },
  '/job': { te: '/పనికి', hi: '/काम' },
  '/apt': { te: '/ఫ్లాట్', hi: '/फ्लैट' },
  '/bath': { te: '/బాత్‌రూమ్', hi: '/बाथरूम' },
  '/kitchen': { te: '/కిచెన్', hi: '/किचन' },
  '/set': { te: '/సెట్', hi: '/सेट' },
  '/carpet': { te: '/కార్పెట్', hi: '/कालीन' },
  '/mattress': { te: '/మ్యాట్రెస్', hi: '/गद्दा' },
  '/tank': { te: '/ట్యాంక్', hi: '/टंकी' },
  '/fan': { te: '/ఫ్యాన్', hi: '/पंखा' },
  '/tap': { te: '/ట్యాప్', hi: '/नल' },
  '/leak': { te: '/లీకేజ్', hi: '/लीकेज' },
  '/block': { te: '/బ్లాక్', hi: '/ब्लॉक' },
  '/shifting': { te: '/షిఫ్టింగ్', hi: '/शिफ्टिंग' },
  '/trip': { te: '/ట్రిప్', hi: '/ट्रिप' },
  '/order': { te: '/ఆర్డర్', hi: '/ऑर्डर' },
  '/unit': { te: '/యూనిట్', hi: '/यूनिट' },
  '/shift': { te: '/షిఫ్ట్', hi: '/शिफ्ट' },
  '/course': { te: '/కోర్సుకు', hi: '/कोर्स' },
  '/annum': { te: '/సంవత్సరానికి', hi: '/वर्ष' },
  '/ticket': { te: '/టిక్కెట్', hi: '/टिकट' },
  '/night': { te: '/రాత్రికి', hi: '/रात' }
};

export function getPriceUnitDisplayName(unit: string, lang: AppLanguage): string {
  if (!unit) return '';
  if (lang === 'en') return unit;
  const match = priceUnitTranslations[unit];
  if (match) {
    if (lang === 'te' && match.te) return match.te;
    if (lang === 'hi' && match.hi) return match.hi;
  }
  return transliterateLatinToScript(unit.replace(/\([^)]*\)/g, '').trim(), lang);
}

// Extract base name and translate into chosen language script
export function getProviderDisplayName(rawName: string, lang: AppLanguage, distKm?: number): string {
  if (!rawName) return '';
  const cleanBase = rawName.replace(/\s*\([^)]*\)/g, '').replace(/\s*-\s*.*$/, '').trim();
  const ui = getUILabels(lang);

  if (lang === 'en') {
    return distKm !== undefined ? `${cleanBase} (${distKm} ${ui.kmUnit})` : cleanBase;
  }

  let translatedBase = cleanBase;
  const exactMatch = providerNameTranslations[cleanBase];
  if (exactMatch) {
    if (lang === 'te') translatedBase = exactMatch.te;
    else if (lang === 'hi') translatedBase = exactMatch.hi;
    else translatedBase = transliterateLatinToScript(cleanBase, lang);
  } else {
    let found = false;
    for (const [key, val] of Object.entries(providerNameTranslations)) {
      if (cleanBase.toLowerCase().includes(key.toLowerCase())) {
        if (lang === 'te') translatedBase = val.te;
        else if (lang === 'hi') translatedBase = val.hi;
        else translatedBase = transliterateLatinToScript(cleanBase, lang);
        found = true;
        break;
      }
    }
    if (!found) {
      translatedBase = transliterateLatinToScript(cleanBase, lang);
    }
  }

  if (distKm !== undefined) {
    return `${translatedBase} (${distKm} ${ui.kmUnit})`;
  }

  return translatedBase;
}

// Get fully localized listing title in chosen language only
export function getListingTitle(listing: {
  title: string;
  titleTe?: string;
  titleHi?: string;
  providerName: string;
  providerNameTe?: string;
  subcategory: string;
  distanceKm?: number;
}, lang: AppLanguage): string {
  if (lang === 'en') return listing.title;

  if (lang === 'te') {
    if (listing.titleTe && !/[A-Za-z]/.test(listing.titleTe)) return listing.titleTe;
    if (listing.titleTe) return transliterateLatinToScript(listing.titleTe.replace(/\([^)]*\)/g, ''), 'te');
    const provName = listing.providerNameTe
      ? transliterateLatinToScript(listing.providerNameTe.replace(/\s*\([^)]*\)/g, '').trim(), 'te')
      : getProviderDisplayName(listing.providerName, 'te');
    const subcatTe = getSubcategoryDisplayName(listing.subcategory, 'te');
    return `${provName} — ${subcatTe}`;
  }

  if (lang === 'hi') {
    if (listing.titleHi && !/[A-Za-z]/.test(listing.titleHi)) return listing.titleHi;
    if (listing.titleHi) return transliterateLatinToScript(listing.titleHi.replace(/\([^)]*\)/g, ''), 'hi');
    const provName = getProviderDisplayName(listing.providerName, 'hi');
    const subcatHi = getSubcategoryDisplayName(listing.subcategory, 'hi');
    return `${provName} — ${subcatHi}`;
  }

  return transliterateLatinToScript(listing.title, lang);
}

// Get localized description in chosen language only
export function getListingDescription(listing: {
  description: string;
  descriptionTe?: string;
  descriptionHi?: string;
  subcategory: string;
  location?: { area: string; distanceKm?: number };
  distanceKm?: number;
}, lang: AppLanguage): string {
  if (lang === 'en') return listing.description;

  const ui = getUILabels(lang);
  const subcatLoc = getSubcategoryDisplayName(listing.subcategory, lang);
  const areaLoc = localizeAreaName(listing.location?.area || 'Hyderabad', lang);
  const dist = listing.distanceKm ?? listing.location?.distanceKm ?? 1.5;

  if (lang === 'te') {
    if (listing.descriptionTe && !/[A-Za-z]/.test(listing.descriptionTe)) return listing.descriptionTe;
    return `అత్యుత్తమ నాణ్యతతో కూడిన ${subcatLoc}. ${areaLoc} లో ${dist} ${ui.kmUnit} దూరంలో అందుబాటులో ఉంది.`;
  }

  if (lang === 'hi') {
    if (listing.descriptionHi && !/[A-Za-z]/.test(listing.descriptionHi)) return listing.descriptionHi;
    return `उच्च गुणवत्ता वाली ${subcatLoc} सेवा। ${areaLoc} में ${dist} ${ui.kmUnit} दूरी पर उपलब्ध।`;
  }

  return `${subcatLoc} • ${areaLoc} (${dist} ${ui.kmUnit}) • ${transliterateLatinToScript(listing.description, lang)}`;
}
