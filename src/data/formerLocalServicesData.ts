export interface RuralServiceProvider {
  id: string;
  name: string;
  nameTe: string;
  nameKn: string;
  nameHi: string;
  nameMr: string;
  category: 'electrician' | 'plumber' | 'mechanic' | 'carpenter' | 'agri_tractor';
  categoryLabel: {
    en: string;
    te: string;
    kn: string;
    hi: string;
    mr: string;
  };
  village: string;
  villageTe: string;
  villageKn: string;
  villageHi: string;
  villageMr: string;
  district: string;
  state: string;
  isAvailableToday: boolean;
  phone: string;
  rating: number;
  reviewsCount: number;
  experienceYears: number;
  image: string;
  speciality: {
    en: string;
    te: string;
    kn: string;
    hi: string;
    mr: string;
  };
  rateNote: {
    en: string;
    te: string;
    kn: string;
    hi: string;
    mr: string;
  };
}

export interface VillageProfileData {
  villageName: string;
  villageNameTe: string;
  villageNameKn: string;
  villageNameHi: string;
  villageNameMr: string;
  state: string;
  district: string;
  population: number;
  registeredElectors: number;
  heroImage: string;
  donors: Array<{
    id: string;
    name: string;
    nameTe: string;
    nameKn: string;
    avatar: string;
    donationCount: number;
    amount: number;
    purpose: string;
  }>;
  leaders: Array<{
    id: string;
    name: string;
    nameTe: string;
    nameKn: string;
    role: string;
    roleTe: string;
    roleKn: string;
    avatar: string;
    phone: string;
    term: string;
  }>;
  publicFacilities: Array<{
    name: string;
    nameTe: string;
    icon: string;
    status: string;
  }>;
}

export interface RuralMarketListing {
  id: string;
  title: string;
  titleTe: string;
  titleKn: string;
  titleHi: string;
  titleMr: string;
  type: 'sale' | 'rent';
  category: 'vehicle' | 'land' | 'cattle' | 'tools';
  categoryLabel: {
    en: string;
    te: string;
    kn: string;
    hi: string;
    mr: string;
  };
  price: number;
  priceUnit: string;
  village: string;
  villageTe: string;
  villageKn: string;
  sellerName: string;
  sellerPhone: string;
  image: string;
  postedDate: string;
  details: string;
}

// 1. RURAL LOCAL SERVICE PROVIDERS (Strictly matches Screenshot 3 provider counts: 10 total, 3 electricians, 4 plumbers, 3 mechanics)
export const initialRuralServices: RuralServiceProvider[] = [
  // Electrician 1 (Featured prominently in Screenshot 3)
  {
    id: 'rural-srv-1',
    name: 'Ramesh Electronics & Electricals',
    nameTe: 'రమేష్ ఎలక్ట్రానిక్స్',
    nameKn: 'ರಮೇಶ್ ಎಲೆಕ್ಟ್ರಾನಿಕ್ಸ್',
    nameHi: 'रमेश इलेक्ट्रॉनिक्स',
    nameMr: 'रमेश इलेक्ट्रॉनिक्स',
    category: 'electrician',
    categoryLabel: {
      en: 'Electrician',
      te: 'ఎలక్ట్రీషియన్',
      kn: 'ಎಲೆಕ್ಟ್ರೀಷಿಯನ್',
      hi: 'इलेक्ट्रिशियन',
      mr: 'इलेक्ट्रिशियन',
    },
    village: 'Agumbe',
    villageTe: 'అగుంబే',
    villageKn: 'ಅಗುಂಬೆ',
    villageHi: 'अगुम्बे',
    villageMr: 'अगुंबे',
    district: 'Shimoga / Nirmal Border',
    state: 'Karnataka / Telangana',
    isAvailableToday: true,
    phone: '9848034567',
    rating: 4.9,
    reviewsCount: 124,
    experienceYears: 10,
    image: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=600&q=80',
    speciality: {
      en: 'House wiring, motor rewinding, inverter setup, TV and fan coil repair',
      te: 'హౌస్ వైరింగ్, మోటార్ రీవైండింగ్, ఇన్వర్టర్ & ఫ్యాన్ కాయిల్ రిపేర్',
      kn: 'ಮನೆ ವೈರಿಂಗ್, ಮೋಟಾರ್ ರಿವೈಂಡಿಂಗ್, ಇನ್ವರ್ಟರ್ ಮತ್ತು ಫ್ಯಾನ್ ರಿಪೇರಿ',
      hi: 'हाउस वायरिंग, मोटर रिवाइंडिंग, इन्वर्टर और पंखा रिपेयरिंग',
      mr: 'वायरिंग, मोटर रिवाइंडिंग, इन्व्हर्टर व फॅन दुरुस्ती',
    },
    rateNote: {
      en: '₹150 Visiting Charge • Same-day Doorstep Service',
      te: '₹150 విజిటింగ్ ఛార్జ్ • ఈరోజే ఇంటి వద్దకు వస్తారు',
      kn: '₹150 ಭೇಟಿ ಶುಲ್ಕ • ಅದೇ ದಿನ ಮನೆ ಬಾಗಿಲ ಸೇವೆ',
      hi: '₹150 विज़िटिंग शुल्क • उसी दिन डोरस्टेप सेवा',
      mr: '₹150 व्हिजिट शुल्क • आजच थेट दारात सेवा',
    },
  },
  // Electrician 2
  {
    id: 'rural-srv-2',
    name: 'Venkateshwara Electric & Inverter Care',
    nameTe: 'వెంకటేశ్వర ఎలక్ట్రికల్ & ఇన్వర్టర్ వర్క్స్',
    nameKn: 'ವೆಂಕಟೇಶ್ವರ ಎಲೆಕ್ಟ್ರಿಕಲ್ಸ್',
    nameHi: 'वेंकटेश्वर इलेक्ट्रिकल्स',
    nameMr: 'व्यंकटेश इलेक्ट्रिकल्स',
    category: 'electrician',
    categoryLabel: {
      en: 'Electrician',
      te: 'ఎలక్ట్రీషియన్',
      kn: 'ಎಲೆಕ್ಟ್ರೀಷಿಯನ್',
      hi: 'इलेक्ट्रिशियन',
      mr: 'इलेक्ट्रिशियन',
    },
    village: 'Nirmal',
    villageTe: 'నిర్మల్',
    villageKn: 'ನಿರ್ಮಲ್',
    villageHi: 'निर्मल',
    villageMr: 'निर्मल',
    district: 'Nirmal',
    state: 'Telangana',
    isAvailableToday: true,
    phone: '9849112288',
    rating: 4.85,
    reviewsCount: 98,
    experienceYears: 12,
    image: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=600&q=80',
    speciality: {
      en: 'Borewell starter box, 3-phase agricultural power connection, MCB board repair',
      te: 'బోర్వెల్ స్టార్టర్ బాక్స్, 3-ఫేజ్ అగ్రికల్చర్ మోటార్ కనెక్షన్, MCB బోర్డు రిపేర్',
      kn: 'ಬೋರ್‌ವೆಲ್ ಸ್ಟಾರ್ಟರ್ ಬಾಕ್ಸ್, 3-ಫೇಸ್ ಕೃಷಿ ಮೋಟಾರ್ ಸಂಪರ್ಕ',
      hi: 'बोरवेल स्टार्टर बॉक्स, 3-फेज कृषि मोटर कनेक्शन',
      mr: 'बोअरवेल स्टार्टर बॉक्स, ३-फेज शेती मोटर कनेक्शन',
    },
    rateNote: {
      en: '₹200 Basic Check • Quick 30-min response',
      te: '₹200 బేసిక్ చెక్ • 30 నిమిషాల్లో రాక',
      kn: '₹200 ತಪಾಸಣೆ • 30 ನಿಮಿಷಗಳಲ್ಲಿ ಬರುವಿಕೆ',
      hi: '₹200 बेसिक चेक • 30 मिनट में पहुंच',
      mr: '₹200 तपासणी • ३० मिनिटांत भेट',
    },
  },
  // Electrician 3
  {
    id: 'rural-srv-3',
    name: 'Lakshmi Home Appliances & TV Service',
    nameTe: 'లక్ష్మి హోమ్ అప్లయెన్సెస్ & టీవీ సర్వీస్',
    nameKn: 'ಲಕ್ಷ್ಮಿ ಅಪ್ಲಯೆನ್ಸಸ್',
    nameHi: 'लक्ष्मी होम अप्लायंसेज',
    nameMr: 'लक्ष्मी होम अप्लायन्सेस',
    category: 'electrician',
    categoryLabel: {
      en: 'Electrician',
      te: 'ఎలక్ట్రీషియన్',
      kn: 'ಎಲೆಕ್ಟ್ರೀಷಿಯನ್',
      hi: 'इलेक्ट्रिशियन',
      mr: 'इलेक्ट्रिशियन',
    },
    village: 'Dilawarpur',
    villageTe: 'దిలావర్‌పూర్',
    villageKn: 'ದಿಲಾವರ್ ಪುರ',
    villageHi: 'दिलावरपुर',
    villageMr: 'दिलावरपूर',
    district: 'Nirmal',
    state: 'Telangana',
    isAvailableToday: true,
    phone: '9700122334',
    rating: 4.9,
    reviewsCount: 64,
    experienceYears: 8,
    image: 'https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=600&q=80',
    speciality: {
      en: 'Smart TV backlight, mixer grinder motor, cooler pump & washing machine',
      te: 'స్మార్ట్ టీవీ బ్యాక్‌లైట్, మిక్సీ గ్రైండర్ మోటార్, కూలర్ & వాషింగ్ మెషీన్ రిపేర్',
      kn: 'ಸ್ಮಾರ್ಟ್ ಟಿವಿ, ಮಿಕ್ಸಿ ಗ್ರೈಂಡರ್ ಮೋಟಾರ್, ಕೂಲರ್ ಮತ್ತು ವಾಷಿಂಗ್ ಮೆಷಿನ್',
      hi: 'स्मार्ट टीवी बैकलाइट, मिक्सी ग्राइंडर मोटर, कूलर और वॉशिंग मशीन',
      mr: 'स्मार्ट टीव्ही, मिक्सी ग्राइंडर मोटर, कुलर व वॉशिंग मशीन दुरुस्ती',
    },
    rateNote: {
      en: '₹150 Visit • Genuine spare parts guarantee',
      te: '₹150 విజిట్ • జెన్యూన్ స్పేర్ పార్ట్స్ వారంటీ',
      kn: '₹150 ಭೇಟಿ • ಅಸಲಿ ಬಿಡಿಭಾಗಗಳ ಗ್ಯಾರಂಟಿ',
      hi: '₹150 विज़िट • असली स्पेयर पार्ट्स गारंटी',
      mr: '₹150 व्हिजिट • ओरिजिनल स्पेअर पार्ट्स खात्री',
    },
  },

  // Plumber 1
  {
    id: 'rural-srv-4',
    name: 'Shiva Plumbing & Submersible Borewell Works',
    nameTe: 'శివ ప్లంబింగ్ వర్క్స్',
    nameKn: 'ಶಿವ ಪ್ಲಂಬಿಂಗ್',
    nameHi: 'शिवा प्लंबिंग वर्क्स',
    nameMr: 'शिवा प्लंबिंग',
    category: 'plumber',
    categoryLabel: {
      en: 'Plumber',
      te: 'ప్లంబర్',
      kn: 'ಪ್ಲಂಬರ್',
      hi: 'प्लंबर',
      mr: 'प्लंबर',
    },
    village: 'Dilawarpur',
    villageTe: 'దిలావర్‌పూర్',
    villageKn: 'ದಿಲಾವರ್ ಪುರ',
    villageHi: 'दिलावरपुर',
    villageMr: 'दिलावरपूर',
    district: 'Nirmal',
    state: 'Telangana',
    isAvailableToday: true,
    phone: '9848078912',
    rating: 4.8,
    reviewsCount: 98,
    experienceYears: 11,
    image: 'https://images.unsplash.com/photo-1585704032915-c3400ca199e7?auto=format&fit=crop&w=600&q=80',
    speciality: {
      en: 'Borewell motor lifting, PVC CPVC pipeline, drip irrigation leaks & water tank fitting',
      te: 'బోర్వెల్ మోటార్ లిఫ్టింగ్, PVC/CPVC పైప్‌లైన్, డ్రిప్ లీకేజీలు, సింటెక్స్ ట్యాంక్ ఫిట్టింగ్',
      kn: 'ಬೋರ್‌ವೆಲ್ ಮೋಟಾರ್ ಲಿಫ್ಟಿಂಗ್, ಪೈಪ್‌ಲೈನ್, ನೀರಿನ ತೊಟ್ಟಿ ಫಿಟ್ಟಿಂಗ್',
      hi: 'बोरवेल मोटर लिफ्टिंग, पीवीसी पाइपलाइन, ड्रिप लीकेज और पानी टंकी फिटिंग',
      mr: 'बोअरवेल मोटर काढणे, पाईपलाईन, ठिबक सिंचन व पाण्याची टाकी फिटिंग',
    },
    rateNote: {
      en: '₹200 Visiting • Direct phone call',
      te: '₹200 విజిటింగ్ • డైరెక్ట్ కాల్ చేయండి',
      kn: '₹200 ಭೇಟಿ • ನೇರ ಕರೆ ಮಾಡಿ',
      hi: '₹200 विज़िट • सीधा फोन करें',
      mr: '₹200 व्हिजिट • थेट कॉल करा',
    },
  },
  // Plumber 2
  {
    id: 'rural-srv-5',
    name: 'Bhavani Sanitary & Water Tank Cleaning',
    nameTe: 'భవాని శానిటరీ & వాటర్ ట్యాంక్ క్లీనింగ్',
    nameKn: 'ಭವಾನಿ ಪ್ಲಂಬಿಂಗ್',
    nameHi: 'भवानी सेनेटरी व प्लंबर',
    nameMr: 'भवानी सॅनिटरी व प्लंबिंग',
    category: 'plumber',
    categoryLabel: {
      en: 'Plumber',
      te: 'ప్లంబర్',
      kn: 'ಪ್ಲಂಬರ್',
      hi: 'प्लंबर',
      mr: 'प्लंबर',
    },
    village: 'Udayagiri',
    villageTe: 'ఉదయగిరి',
    villageKn: 'ಉದಯಗಿರಿ',
    villageHi: 'उदयगिरि',
    villageMr: 'उदयगिरी',
    district: 'Nellore / Nirmal',
    state: 'Andhra Pradesh',
    isAvailableToday: true,
    phone: '9848099887',
    rating: 4.8,
    reviewsCount: 76,
    experienceYears: 7,
    image: 'https://images.unsplash.com/photo-1607472586893-edb57bdc0e39?auto=format&fit=crop&w=600&q=80',
    speciality: {
      en: 'High-pressure water tank washing, bathroom tap leakage, sink blockage clearance',
      te: 'హై-ప్రెషర్ వాటర్ ట్యాంక్ వాషింగ్, బాత్రూమ్ ట్యాప్ లీకేజ్, సింక్ బ్లాకేజ్ క్లియరెన్స్',
      kn: 'ವಾಟರ್ ಟ್ಯಾಂಕ್ ಕ್ಲೀನಿಂಗ್, ನಲ್ಲಿ ಸೋರಿಕೆ, ಸಿಂಕ್ ಬ್ಲಾಕ್ ನಿವಾರಣೆ',
      hi: 'वाटर टैंक सफाई, नल लीकेज रिपेयर, नाली ब्लॉकेज निवारण',
      mr: 'टाकी क्लिनिंग, नळ गळती, ड्रेनेज ब्लॉकेज क्लिअरन्स',
    },
    rateNote: {
      en: '₹180 Visit • Clean & prompt work',
      te: '₹180 విజిట్ • వేగవంతమైన పని',
      kn: '₹180 ಭೇಟಿ • ತ್ವರಿತ ಸೇವೆ',
      hi: '₹180 विज़िट • त्वरित और साफ काम',
      mr: '₹180 व्हिजिट • तत्पर काम',
    },
  },
  // Plumber 3
  {
    id: 'rural-srv-6',
    name: 'Ganga Agriculture Pipe & Valve Tech',
    nameTe: 'గంగ అగ్రికల్చర్ పైపులు & స్ప్రింక్లర్ సర్వీస్',
    nameKn: 'ಗಂಗಾ ಕೃಷಿ ಪೈಪ್‌ಲೈನ್',
    nameHi: 'गंगा एग्री पाइप्स व वाल्व',
    nameMr: 'गंगा शेती पाईपलाईन',
    category: 'plumber',
    categoryLabel: {
      en: 'Plumber',
      te: 'ప్లంబర్',
      kn: 'ಪ್ಲಂಬರ್',
      hi: 'प्लंबर',
      mr: 'प्लंबर',
    },
    village: 'Purushwadi',
    villageTe: 'పురుషవాడి',
    villageKn: 'ಪುರುಷವಾಡಿ',
    villageHi: 'पुरुषवाडी',
    villageMr: 'पुरुषवाडी',
    district: 'Ahmednagar',
    state: 'Maharashtra',
    isAvailableToday: true,
    phone: '9440188990',
    rating: 4.75,
    reviewsCount: 52,
    experienceYears: 9,
    image: 'https://images.unsplash.com/photo-1542013936693-884638332954?auto=format&fit=crop&w=600&q=80',
    speciality: {
      en: 'Farm mainline joints, sprinkler valves, foot valves & booster pump connections',
      te: 'పొలం మెయిన్‌లైన్ జాయింట్లు, స్ప్రింక్లర్ వాల్వ్‌లు, ఫుట్ వాల్వ్ & బూస్టర్ పంప్ కనెక్షన్లు',
      kn: 'ಕೃಷಿ ಮುಖ್ಯ ಪೈಪ್‌ಲೈನ್, ಸ್ಪ್ರಿಂಕ್ಲರ್ ವಾಲ್ವ್, ಬೂಸ್ಟರ್ ಪಂಪ್',
      hi: 'खेत मेनलाइन जॉइंट, स्प्रिंकलर वाल्व, बूस्टर पंप कनेक्शन',
      mr: 'शेती मुख्य पाईपलाईन, स्प्रिंकलर व्हॉल्व्ह व बूस्टर पंप',
    },
    rateNote: {
      en: '₹200 Visit • Field equipment ready',
      te: '₹200 విజిట్ • ఫీల్డ్ టూల్స్ అందుబాటులో ఉన్నాయి',
      kn: '₹200 ಭೇಟಿ • ತಕ್ಷಣದ ಸೇವೆ',
      hi: '₹200 विज़िट • फील्ड टूल्स सहित तैयार',
      mr: '₹200 व्हिजिट • शेतावर थेट हजर',
    },
  },
  // Plumber 4
  {
    id: 'rural-srv-7',
    name: 'Balaji Quick Water Works',
    nameTe: 'బాలాజీ క్విక్ వాటర్ వర్క్స్',
    nameKn: 'ಬಾಲಾಜಿ ವಾಟರ್ ವರ್ಕ್ಸ್',
    nameHi: 'बालाजी क्विक वाटर वर्क्स',
    nameMr: 'बालाजी वॉटर वर्क्स',
    category: 'plumber',
    categoryLabel: {
      en: 'Plumber',
      te: 'ప్లంబర్',
      kn: 'ಪ್ಲಂಬರ್',
      hi: 'प्लंबर',
      mr: 'प्लंबर',
    },
    village: 'Agumbe',
    villageTe: 'అగుంబే',
    villageKn: 'ಅಗುಂಬೆ',
    villageHi: 'अगुम्बे',
    villageMr: 'अगुंबे',
    district: 'Shimoga',
    state: 'Karnataka',
    isAvailableToday: true,
    phone: '9848011234',
    rating: 4.7,
    reviewsCount: 44,
    experienceYears: 6,
    image: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=600&q=80',
    speciality: {
      en: 'Hot water geyser connection, kitchen pipeline unclogging, overhead tank float valve',
      te: 'గీజర్ కనెక్షన్, కిచెన్ సింక్ పైపులు, ఓవర్‌హెడ్ ట్యాంక్ ఫ్లోట్ వాల్వ్ రిపేర్',
      kn: 'ಗೀಸರ್ ಸಂಪರ್ಕ, ಅಡುಗೆಮನೆ ಪೈಪ್ ಕ್ಲಿಯರ್, ಓವರ್‌ಹೆಡ್ ಟ್ಯಾಂಕ್ ವಾಲ್ವ್',
      hi: 'गीजर कनेक्शन, किचन पाइप अनक्लॉगिंग, ओवरहेड टैंक फ्लोट वाल्व',
      mr: 'गिझर कनेक्शन, किचन पाईप दुरुस्ती, फ्लोट व्हॉल्व्ह बदलणे',
    },
    rateNote: {
      en: '₹150 Visit • Fast 20-min arrival',
      te: '₹150 విజిట్ • 20 నిమిషాల్లో రాక',
      kn: '₹150 ಭೇಟಿ • 20 ನಿಮಿಷಗಳಲ್ಲಿ ಬರುವಿಕೆ',
      hi: '₹150 विज़िट • 20 मिनट में पहुंच',
      mr: '₹150 व्हिजिट • २० मिनिटांत पोहोच',
    },
  },

  // Mechanic 1
  {
    id: 'rural-srv-8',
    name: 'Srinivasa Auto & Tractor Garage',
    nameTe: 'శ్రీనివాస ఆటో & ట్రాక్టర్ గ్యారేజ్',
    nameKn: 'ಶ್ರೀನಿವಾಸ ಮೆಕ್ಯಾನಿಕ್ ಗ್ಯಾರೇಜ್',
    nameHi: 'श्रीनिवास ऑटो व ट्रैक्टर गैरेज',
    nameMr: 'श्रीनिवास ऑटो व ट्रॅक्टर गॅरेज',
    category: 'mechanic',
    categoryLabel: {
      en: 'Mechanic',
      te: 'మెకానిక్',
      kn: 'ಮೆಕ್ಯಾನಿಕ್',
      hi: 'मेकॅनिक',
      mr: 'मेकॅनिक',
    },
    village: 'Udayagiri',
    villageTe: 'ఉదయగిరి',
    villageKn: 'ಉದಯಗಿರಿ',
    villageHi: 'उदयगिरि',
    villageMr: 'उदयगिरी',
    district: 'Nellore / Nirmal',
    state: 'Andhra Pradesh',
    isAvailableToday: true,
    phone: '9700345678',
    rating: 4.9,
    reviewsCount: 156,
    experienceYears: 14,
    image: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=600&q=80',
    speciality: {
      en: 'Mahindra, Swaraj, John Deere tractor engine tune-up, diesel pump, cultivator blades & clutch',
      te: 'మహీంద్రా, స్వరాజ్ ట్రాక్టర్ ఇంజిన్ సర్వీస్, డీజిల్ పంప్, కల్టివేటర్ బ్లేడ్లు & క్లచ్ రిపేర్',
      kn: 'ಟ್ರಾಕ್ಟರ್ ಇಂಜಿನ್ ಟ್ಯೂನ್-ಅಪ್, ಡೀಸೆಲ್ ಪಂಪ್, ಕ್ಲಚ್ ರಿಪೇರಿ',
      hi: 'महिंद्रा व स्वराज ट्रैक्टर इंजन ट्यूनअप, डीजल पंप और क्लच मरम्मत',
      mr: 'महिंद्रा व स्वराज ट्रॅक्टर इंजिन, डिझेल पंप व क्लच दुरुस्ती',
    },
    rateNote: {
      en: '₹250 On-site Check • Tractor breaks down on field rescue',
      te: '₹250 ఆన్‌సైట్ చెక్ • పొలంలోనే ట్రాక్టర్ రిపేర్ చేయబడును',
      kn: '₹250 ಸ್ಥಳದಲ್ಲೇ ತಪಾಸಣೆ • ಹೊಲದಲ್ಲೇ ರಿಪೇರಿ',
      hi: '₹250 ऑन-साइट चेक • खेत पर पहुंचकर मरम्मत',
      mr: '₹250 शेतावर व्हिजिट • शेतातच ट्रॅक्टर दुरुस्ती',
    },
  },
  // Mechanic 2
  {
    id: 'rural-srv-9',
    name: 'Ganesh Two-Wheeler & Puncture Hub',
    nameTe: 'గణేష్ టూ-వీలర్ వర్క్స్ & పంక్చర్',
    nameKn: 'ಗಣೇಶ್ ಬೈಕ್ ಸರ್ವೀಸ್',
    nameHi: 'गणेश टू-व्हीलर वर्क्स',
    nameMr: 'गणेश बाईक रिपेअरिंग',
    category: 'mechanic',
    categoryLabel: {
      en: 'Mechanic',
      te: 'మెకానిక్',
      kn: 'ಮೆಕ್ಯಾನಿಕ್',
      hi: 'मेकॅनिक',
      mr: 'मेकॅनिक',
    },
    village: 'Nirmal',
    villageTe: 'నిర్మల్',
    villageKn: 'ನಿರ್ಮಲ್',
    villageHi: 'निर्मल',
    villageMr: 'निर्मल',
    district: 'Nirmal',
    state: 'Telangana',
    isAvailableToday: true,
    phone: '9848066554',
    rating: 4.8,
    reviewsCount: 110,
    experienceYears: 9,
    image: 'https://images.unsplash.com/photo-1558981403-c5f9899a28bc?auto=format&fit=crop&w=600&q=80',
    speciality: {
      en: 'Hero Splendor, HF Deluxe, Bajaj Pulsar, Honda Shine general oil service & tube puncture',
      te: 'హీరో స్ప్లెండర్, హోండా షైన్, బజాజ్ పల్సర్ ఆయిల్ సర్వీస్, బ్రేక్ లైనింగ్ & పంక్చర్',
      kn: 'ಹೀರೋ ಸ್ಪ್ಲೆಂಡರ್, ಹೋಂಡಾ ಶೈನ್ ಆಯಿಲ್ ಸರ್ವೀಸ್ ಮತ್ತು ಪಂಕ್ಚರ್',
      hi: 'हीरो स्प्लेंडर, होंडा शाइन इंजन ऑयल सर्विस व ट्यूब पंचर',
      mr: 'हिरो स्प्लेंडर, होंडा शाईन ऑइल सर्व्हिस व ट्यूब पंक्चर',
    },
    rateNote: {
      en: '₹120 Basic Check • Tubeless puncture ready',
      te: '₹120 బేసిక్ చెక్ • ట్యూబ్‌లెస్ పంక్చర్ కిట్ సిద్ధం',
      kn: '₹120 ತಪಾಸಣೆ • ತ್ವರಿತ ಪಂಕ್ಚರ್ ಸೇವೆ',
      hi: '₹120 बेसिक चेक • ट्यूबलेस पंचर सुविधा',
      mr: '₹120 बेसिक तपासणी • ट्युबलेस पंक्चर किट हजर',
    },
  },
  // Mechanic 3
  {
    id: 'rural-srv-10',
    name: 'Maruti Rural Auto & Jeep Specialist',
    nameTe: 'మారుతి ఆటో & బొలేరో జీప్ మెకానిక్',
    nameKn: 'ಮಾರುತಿ ಜೀಪ್ ಮೆಕ್ಯಾನಿಕ್',
    nameHi: 'मारुति ऑटो व जीप रिपेयर',
    nameMr: 'मारुती ऑटो व बोलेरो मेकॅनिक',
    category: 'mechanic',
    categoryLabel: {
      en: 'Mechanic',
      te: 'మెకానిక్',
      kn: 'ಮೆಕ್ಯಾನಿಕ್',
      hi: 'मेकॅनिक',
      mr: 'मेकॅनिक',
    },
    village: 'Purushwadi',
    villageTe: 'పురుషవాడి',
    villageKn: 'ಪುರುಷವಾಡಿ',
    villageHi: 'पुरुषवाडी',
    villageMr: 'पुरुषवाडी',
    district: 'Ahmednagar',
    state: 'Maharashtra',
    isAvailableToday: true,
    phone: '9988112233',
    rating: 4.75,
    reviewsCount: 78,
    experienceYears: 13,
    image: 'https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?auto=format&fit=crop&w=600&q=80',
    speciality: {
      en: 'Bolero Pickup, Tata Ace, Mahindra Maxi Truck suspension, leaf springs & brake pad replacement',
      te: 'బొలేరో పికప్, టాటా ఏస్, కామానీ పట్టాలు (Leaf Springs), బ్రేక్ ప్యాడ్ మార్పిడి',
      kn: 'ಬೊಲೆರೊ ಪಿಕಪ್, ಟಾಟಾ ಏಸ್ ಸಸ್ಪೆನ್ಷನ್ ಮತ್ತು ಬ್ರೇಕ್ ರಿಪೇರಿ',
      hi: 'बोलेरो पिकअप, टाटा एस, कमानी पट्टे व ब्रेक पैड रिप्लेसमेंट',
      mr: 'बोलेरो पिकअप, टाटा एस कमानी पट्टे व ब्रेक पॅड बदलणे',
    },
    rateNote: {
      en: '₹200 Emergency road assistance in village',
      te: '₹200 రోడ్ అసిస్టెన్స్ • గ్రామంలో ఎక్కడైనా వస్తారు',
      kn: '₹200 ತುರ್ತು ರಸ್ತೆ ನೆರವು',
      hi: '₹200 आपातकालीन रोड असिस्टेंस',
      mr: '₹200 आणीबाणी मदत • गावात कुठेही हजर',
    },
  },
];

// 2. VILLAGE PROFILE & GOVERNANCE DATA (Strictly matches Screenshot 4: Population 5,200, Donors & Sarpanch leaders)
export const villageProfileNirmal: VillageProfileData = {
  villageName: 'Nirmal',
  villageNameTe: 'నిర్మల్',
  villageNameKn: 'ನಿರ್ಮಲ್',
  villageNameHi: 'निर्मल',
  villageNameMr: 'निर्मल',
  state: 'Telangana',
  district: 'Nirmal District',
  population: 5200,
  registeredElectors: 3840,
  heroImage: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1000&q=80',
  donors: [
    {
      id: 'donor-1',
      name: 'Anil Kumar',
      nameTe: 'అనిల్ కుమార్',
      nameKn: 'ಅನಿಲ ಕುಮಾರ',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80',
      donationCount: 2,
      amount: 50000,
      purpose: 'School drinking water RO plant & classroom ceiling fans',
    },
    {
      id: 'donor-2',
      name: 'Venu Madhav',
      nameTe: 'వేణు మాధవ్',
      nameKn: 'ವೇಣು ಮಾಧವ್',
      avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80',
      donationCount: 1,
      amount: 40000,
      purpose: 'Village solar street lights installation',
    },
    {
      id: 'donor-3',
      name: 'Raja Reddy',
      nameTe: 'రాజా రెడ్డి',
      nameKn: 'ರಾಜ ಕುಮಾರ',
      avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=200&q=80',
      donationCount: 3,
      amount: 20000,
      purpose: 'Gram Panchayat library books & sports kits for youth',
    },
  ],
  leaders: [
    {
      id: 'leader-1',
      name: 'Ravinder Reddy',
      nameTe: 'రవీందర్ రెడ్డి',
      nameKn: 'ಅನಿಲ್ ಕುಮಾರ್',
      role: 'Sarpanch',
      roleTe: 'సర్పంచ్',
      roleKn: 'ಸರಪಂಚ್',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80',
      phone: '9848012345',
      term: '2024 - 2029',
    },
    {
      id: 'leader-2',
      name: 'Venu Madhav',
      nameTe: 'వేణు మాధవ్',
      nameKn: 'ವೇಣು ಮಾಧವ್',
      role: 'Up-Sarpanch',
      roleTe: 'ఉప-సర్పంచ్',
      roleKn: 'ಉಪ-ಸರಪಂಚ್',
      avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80',
      phone: '9849123456',
      term: '2024 - 2029',
    },
    {
      id: 'leader-3',
      name: 'Rakesh Goud',
      nameTe: 'రాకేష్ గౌడ్',
      nameKn: 'ರಾಕೇಶ್ ಗೌಡ',
      role: 'Ward Member (Ward 4)',
      roleTe: 'వార్డు మెంబర్ (వార్డ్ 4)',
      roleKn: 'ವಾರ್ಡ್ ಸದಸ್ಯ',
      avatar: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=200&q=80',
      phone: '9440123456',
      term: '2024 - 2029',
    },
  ],
  publicFacilities: [
    { name: 'Gram Panchayat Office', nameTe: 'గ్రామ పంచాయతీ కార్యాలయం', icon: '🏛️', status: 'Open 10 AM - 5 PM' },
    { name: 'Primary Health Centre (PHC)', nameTe: 'ప్రాథమిక ఆరోగ్య కేంద్రం', icon: '🏥', status: '24/7 Emergency Doctor' },
    { name: 'Rythu Vedika (Farmers Hub)', nameTe: 'రైతు వేదిక', icon: '🌾', status: 'Soil testing & seed quota' },
    { name: 'Zilla Parishad High School', nameTe: 'జెడ్పీ ఉన్నత పాఠశాల', icon: '🏫', status: 'Grades 1 to 10 (Digital Class)' },
  ],
};

// 3. RURAL MARKETPLACE: BUY, SELL & RENT (Strictly matches Screenshots 5 & 6)
export const initialRuralMarketplace: RuralMarketListing[] = [
  {
    id: 'mkt-bike-1',
    title: 'Hero Splendor Plus 2023 (Single Owner)',
    titleTe: 'అమ్మకానికి బైక్ - హీరో స్ప్లెండర్ ప్లస్',
    titleKn: 'ಬೈಕ್ ಮಾರಾಟಕ್ಕೆ ಇದೆ - ಹೀರೋ ಸ್ಪ್ಲೆಂಡರ್',
    titleHi: 'बाइक बिकाऊ - हीरो स्प्लेंडर प्लस',
    titleMr: 'बाईक विक्रीसाठी - हिरो स्प्लेंडर',
    type: 'sale',
    category: 'vehicle',
    categoryLabel: {
      en: 'Vehicles',
      te: 'వాహనాలు',
      kn: 'ವಾಹನಗಳು',
      hi: 'वाहन',
      mr: 'वाहने',
    },
    price: 45000,
    priceUnit: 'Fixed',
    village: 'Udayagiri',
    villageTe: 'ఉదయగిరి',
    villageKn: 'ಉದಯಗಿರಿ',
    sellerName: 'Koteswara Rao',
    sellerPhone: '9848034567',
    image: 'https://images.unsplash.com/photo-1558981403-c5f9899a28bc?auto=format&fit=crop&w=600&q=80',
    postedDate: '2 hours ago',
    details: '65 km/litre mileage, tubeless tyres, insurance valid till 2027.',
  },
  {
    id: 'mkt-buffalo-1',
    title: 'High Yield Murrah Buffalo (14 Litres Milk/Day)',
    titleTe: 'అమ్మకానికి గేదె (ముర్రా జాతి • రోజుకు 14 లీటర్లు)',
    titleKn: 'ಮಾರಾಟಕ್ಕೆ ಎಮ್ಮೆ (14 ಲೀಟರ್ ಹಾಲು)',
    titleHi: 'भैंस बिकाऊ - मुर्रा नस्ल (14 लीटर दूध/दिन)',
    titleMr: 'म्हैस विक्रीसाठी - मुर्रा जात (१४ लिटर दूध)',
    type: 'sale',
    category: 'cattle',
    categoryLabel: {
      en: 'Animals / Cattle',
      te: 'జంతువులు / పశువులు',
      kn: 'ಪ್ರಾಣಿಗಳು / ಹಸುಗಳು',
      hi: 'पशु / गाय-भैंस',
      mr: 'जनावरे / गुरे',
    },
    price: 85000,
    priceUnit: 'Negotiable',
    village: 'Dilawarpur',
    villageTe: 'దిలావర్‌పూర్',
    villageKn: 'ದಿಲಾವರ್ ಪುರ',
    sellerName: 'Ramdas Patel',
    sellerPhone: '9848078912',
    image: 'https://images.unsplash.com/photo-1570042225831-d98fa7577f1e?auto=format&fit=crop&w=600&q=80',
    postedDate: '5 hours ago',
    details: '3rd calving with female calf. 100% healthy, vaccinated by Govt Vet.',
  },
  {
    id: 'mkt-tractor-1',
    title: 'Mahindra 575 DI Tractor with Rotavator & Trolley for Rent',
    titleTe: 'మహీంద్రా 575 DI ట్రాక్టర్ అద్దెకు (రోటవేటర్ & ట్రాలీ)',
    titleKn: 'ಮಹೀಂದ್ರಾ ಟ್ರ್ಯಾಕ್ಟರ್ ಬಾಡಿಗೆಗೆ',
    titleHi: 'महिंद्रा ट्रैक्टर किराए पर (रोटावेटर सहित)',
    titleMr: 'महिंद्रा ट्रॅक्टर भाड्याने (रोटाव्हेटरसह)',
    type: 'rent',
    category: 'vehicle',
    categoryLabel: {
      en: 'Vehicles / Tractors',
      te: 'వాహనాలు / ట్రాక్టర్లు',
      kn: 'ವಾಹನಗಳು',
      hi: 'वाहन / ट्रैक्टर',
      mr: 'वाहने / ट्रॅक्टर',
    },
    price: 800,
    priceUnit: '/hour',
    village: 'Agumbe',
    villageTe: 'అగుంబే',
    villageKn: 'ಅಗುಂಬೆ',
    sellerName: 'Shankar Gowda',
    sellerPhone: '9700345678',
    image: 'https://images.unsplash.com/photo-1592878904946-b3cd8ae243d0?auto=format&fit=crop&w=600&q=80',
    postedDate: '1 day ago',
    details: 'Available for ploughing, paddy field tilling & sand/gravel transport.',
  },
  {
    id: 'mkt-land-1',
    title: '3 Acres Fertile Red Soil Agricultural Land with Borewell',
    titleTe: '3 ఎకరాల ఎర్ర నేల వ్యవసాయ భూమి (బోరు & కరెంట్)',
    titleKn: '3 ಎಕರೆ ಕೃಷಿ ಭೂಮಿ ಮಾರಾಟಕ್ಕೆ',
    titleHi: '3 एकड़ उपजाऊ कृषि भूमि बिकाऊ (बोरवेल सहित)',
    titleMr: '३ एकर सुपीक शेतजमीन विक्रीसाठी',
    type: 'sale',
    category: 'land',
    categoryLabel: {
      en: 'Lands',
      te: 'భూములు',
      kn: 'ಭೂಮಿಗಳು',
      hi: 'जमीन',
      mr: 'जमीन',
    },
    price: 1800000,
    priceUnit: '/acre',
    village: 'Nirmal',
    villageTe: 'నిర్మల్',
    villageKn: 'ನಿರ್ಮಲ್',
    sellerName: 'Bhoomi Reddy',
    sellerPhone: '9440123456',
    image: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=600&q=80',
    postedDate: '2 days ago',
    details: 'Clear title, Dharani portal registered, 3-inch round the year bore water.',
  },
];
