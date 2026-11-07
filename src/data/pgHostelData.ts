import { MarketplaceListing } from '../types/marketplace';

export interface PGSubcategory {
  en: string;
  te: string;
  hi: string;
}

export interface PGCategoryInfo {
  id: string;
  name: string;
  nameTe: string;
  nameHi: string;
  emoji: string;
  subcategories: PGSubcategory[];
}

// All 29 Main PG & Hostel Categories requested by user
export const pg29Categories: PGCategoryInfo[] = [
  {
    id: 'pg-students',
    name: 'Students PGs',
    nameTe: 'విద్యార్థుల పీజీలు (Students PGs)',
    nameHi: 'स्टूडेंट्स पीजी',
    emoji: '🎒',
    subcategories: [
      { en: 'College students PG', te: 'కాలేజీ విద్యార్థుల పీజీ', hi: 'कॉलेज स्टूडेंट्स पीजी' },
      { en: 'University students PG', te: 'యూనివర్సిటీ విద్యార్థుల హాస్టల్', hi: 'यूनिवर्सिटी पीजी' },
      { en: 'Coaching students PG', te: 'కోచింగ్ విద్యార్థుల పీజీ', hi: 'कोचिंग स्टूडेंट्स पीजी' },
      { en: 'School students PG', te: 'పాఠశాల విద్యార్థుల బోర్డింగ్', hi: 'स्कूल स्टूडेंट्स पीजी' },
      { en: 'Entrance-exam students', te: 'ఎంట్రన్స్ ఎగ్జామ్ హాస్టల్స్', hi: 'प्रतियोगी परीक्षा हॉस्टल' }
    ]
  },
  {
    id: 'pg-professionals',
    name: 'Working Professionals',
    nameTe: 'ఉద్యోగుల పీజీలు (Working Professionals)',
    nameHi: 'वर्किंग प्रोफेशनल्स पीजी',
    emoji: '💼',
    subcategories: [
      { en: 'IT employee PG', te: 'ఐటీ ఉద్యోగుల పీజీ (IT PG)', hi: 'आईटी प्रोफेशनल्स पीजी' },
      { en: "Men's executive PG", te: 'పురుషుల ఎగ్జిక్యూటివ్ పీజీ', hi: 'मेंस एग्जीक्यूटिव पीजी' },
      { en: "Women's corporate PG", te: 'మహిళా కార్పొరేట్ పీజీ', hi: 'महिला कॉर्पोरेट पीजी' },
      { en: 'Corporate accommodation', te: 'కార్పొరేట్ అకామడేషన్', hi: 'कॉर्पोरेट आवास' },
      { en: 'Business travelers stay', te: 'వ్యాపార ప్రయాణికుల బస', hi: 'बिजनेस ट्रैवलर्स स्टे' }
    ]
  },
  {
    id: 'pg-boys',
    name: 'Boys Accommodation',
    nameTe: 'బాయ్స్ హాస్టల్స్ & రూమ్స్ (Boys Accommodation)',
    nameHi: 'बॉयज हॉस्टल व पीजी',
    emoji: '👦',
    subcategories: [
      { en: 'Boys PG with food', te: 'భోజనంతో బాయ్స్ పీజీ', hi: 'बॉयज पीजी भोजन सहित' },
      { en: "Men's hostel", te: 'మెన్స్ హాస్టల్', hi: 'मेंस हॉस्टल' },
      { en: 'Bachelor rooms for rent', te: 'బ్యాచిలర్ రూమ్స్', hi: 'बैचलर रूम्स' },
      { en: 'Male dormitories', te: 'మేల్ డార్మిటరీ బెడ్స్', hi: 'पुरुष छात्रावास' },
      { en: 'Student boys hostel', te: 'స్టూడెంట్ బాయ్స్ హాస్టల్', hi: 'छात्र बॉयज हॉस्टल' }
    ]
  },
  {
    id: 'pg-girls',
    name: 'Girls Accommodation',
    nameTe: 'గర్ల్స్ హాస్టల్స్ & పీజీలు (Girls Accommodation)',
    nameHi: 'गर्ल्स हॉस्टल व पीजी',
    emoji: '👧',
    subcategories: [
      { en: 'Girls PG with biometric security', te: 'బయోమెట్రిక్ రక్షణతో గర్ల్స్ పీజీ', hi: 'गर्ल्स पीजी सुरक्षित' },
      { en: "Women's hostel with food", te: 'ఉమెన్స్ హాస్టల్ (భోజనంతో)', hi: 'महिला हॉस्टल' },
      { en: "Working women's hostel", te: 'వర్కింగ్ ఉమెన్స్ హాస్టల్', hi: 'वर्किंग विमेन हॉस्टल' },
      { en: 'Female dormitories', te: 'మహిళల డార్మిటరీ బెడ్స్', hi: 'महिला छात्रावास' },
      { en: 'College girls hostel', te: 'కాలేజ్ గర్ల్స్ హాస్టల్', hi: 'कॉलेज गर्ल्स हॉस्टल' }
    ]
  },
  {
    id: 'pg-coliving',
    name: 'Co-Living Spaces',
    nameTe: 'కో-లివింగ్ స్పేసెస్ (Co-Living Spaces)',
    nameHi: 'को-लिविंग स्पेस',
    emoji: '🏙️',
    subcategories: [
      { en: 'Mixed co-living space', te: 'మిక్స్‌డ్ కో-లివింగ్ స్పేస్', hi: 'मिश्रित को-लिविंग' },
      { en: 'Community living & events', te: 'కమ్యూనిటీ లివింగ్ స్పేస్', hi: 'कम्युनिटी लिविंग' },
      { en: 'Premium co-living with gym', te: 'జిమ్‌తో ప్రీమియం కో-లివింగ్', hi: 'प्रीमियम को-लिविंग' },
      { en: 'Shared apartments with lounge', te: 'షేర్డ్ అపార్ట్‌మెంట్స్', hi: 'साझा अपार्टमेंट' },
      { en: 'Managed co-living suites', te: 'మేనేజ్డ్ కో-లివింగ్ సూట్స్', hi: 'मैनेज्ड को-लिविंग' }
    ]
  },
  {
    id: 'pg-college-hostels',
    name: 'College & University Hostels',
    nameTe: 'కాలేజీ & వర్సిటీ హాస్టల్స్',
    nameHi: 'कॉलेज व यूनिवर्सिटी हॉस्टल',
    emoji: '🏛️',
    subcategories: [
      { en: 'Private college hostels', te: 'ప్రైవేట్ కాలేజీ హాస్టల్స్', hi: 'प्राइवेट कॉलेज हॉस्टल' },
      { en: 'Campus hostels', te: 'క్యాంపస్ హాస్టల్స్', hi: 'कैंपस हॉस्टल' },
      { en: 'Nearby student residences', te: 'కాలేజ్ సమీప నివాసాలు', hi: 'छात्र निवास' },
      { en: 'University accommodation', te: 'యూనివర్సిటీ అకామడేషన్', hi: 'विश्वविद्यालय आवास' }
    ]
  },
  {
    id: 'pg-competitive-exams',
    name: 'Competitive Exam Hostels',
    nameTe: 'పోటీ పరీక్షల హాస్టల్స్ (UPSC/Groups/NEET)',
    nameHi: 'प्रतियोगी परीक्षा हॉस्टल',
    emoji: '📚',
    subcategories: [
      { en: 'UPSC hostel with library', te: 'యూపీఎస్సీ సివిల్స్ హాస్టల్ & లైబ్రరీ', hi: 'यूपीएससी हॉस्टल' },
      { en: 'TSPSC & APPSC Groups hostel', te: 'టీఎస్పీఎస్సీ & ఏపీపీఎస్సీ గ్రూప్స్ హాస్టల్', hi: 'टीएसपीएससी/एपीपीएससी हॉस्टल' },
      { en: 'SSC & Banking exam hostel', te: 'ఎస్ఎస్సీ & బ్యాంకింగ్ ఎగ్జామ్ హాస్టల్', hi: 'बैंकिंग परीक्षा हॉस्टल' },
      { en: 'NEET & JEE long-term hostel', te: 'నీట్ & జేఈఈ లాంగ్-టర్మ్ హాస్టల్', hi: 'नीट/जेईई हॉस्टल' },
      { en: '24x7 AC Study Hall Hostel', te: '24 గంటల ఏసీ స్టడీ హాల్ హాస్టల్', hi: '24 घंटे स्टडी हॉल हॉस्टल' }
    ]
  },
  {
    id: 'pg-short-term',
    name: 'Short-Term Stay',
    nameTe: 'స్వల్పకాలిక బస (Short-Term Stay)',
    nameHi: 'कम अवधि का प्रवास',
    emoji: '⏳',
    subcategories: [
      { en: 'Daily stay PG rooms', te: 'రోజువారీ బస పీజీ రూమ్స్ (Daily PG)', hi: 'दैनिक स्टे पीजी' },
      { en: 'Weekly stay accommodation', te: 'వారం రోజుల బస', hi: 'साप्ताहिक स्टे' },
      { en: 'Monthly stay with no lock-in', te: 'నెలకు బస (లాక్-ఇన్ లేదు)', hi: 'मासिक स्टे' },
      { en: 'Temporary guest PG', te: 'టెంపరరీ గెస్ట్ పీజీ', hi: 'अस्थायी गेस्ट पीजी' }
    ]
  },
  {
    id: 'pg-long-term',
    name: 'Long-Term Stay',
    nameTe: 'దీర్ఘకాలిక బస (Long-Term Stay)',
    nameHi: 'दीर्घकालिक स्टे',
    emoji: '🗓️',
    subcategories: [
      { en: 'Six-month stay PG', te: 'ఆరు నెలల బస పీజీ', hi: '6 महीने का स्टे' },
      { en: 'Yearly rental agreement', te: 'వార్షిక అద్దె ఒప్పందం', hi: 'वार्षिक अनुबंध' },
      { en: 'Lease rooms for students', te: 'లీజు గదులు', hi: 'लीज रूम्स' },
      { en: 'Permanent occupancy rooms', te: 'శాశ్వత బస గదులు', hi: 'स्थायी आवास' }
    ]
  },
  {
    id: 'pg-single-rooms',
    name: 'Single Rooms',
    nameTe: 'సింగిల్ ప్రైవేట్ రూమ్స్ (Single Rooms)',
    nameHi: 'सिंगल प्राइवेट रूम्स',
    emoji: '🚪',
    subcategories: [
      { en: 'Private single room with attached bath', te: 'అటాచ్డ్ బాత్రూంతో ప్రైవేట్ సింగిల్ రూమ్', hi: 'प्राइवेट सिंगल रूम' },
      { en: 'Single AC room', te: 'సింగిల్ ఏసీ రూమ్', hi: 'सिंगल एसी रूम' },
      { en: 'Single non-AC room', te: 'సింగిల్ నాన్-ఏసీ రూమ్', hi: 'सिंगल नॉन-एसी रूम' },
      { en: 'Premium private executive room', te: 'ప్రీమియం ప్రైవేట్ ఎగ్జిక్యూటివ్ రూమ్', hi: 'प्रीमियम सिंगल रूम' }
    ]
  },
  {
    id: 'pg-sharing-rooms',
    name: 'Sharing Rooms',
    nameTe: 'షేరింగ్ రూమ్స్ (Sharing Rooms)',
    nameHi: 'शेयरिंग रूम्स',
    emoji: '🛏️',
    subcategories: [
      { en: 'Double sharing (2 Sharing)', te: 'డబుల్ షేరింగ్ (2 Sharing)', hi: '2-शेयरिंग रूम' },
      { en: 'Triple sharing (3 Sharing)', te: 'ట్రిపుల్ షేరింగ్ (3 Sharing)', hi: '3-शेयरिंग रूम' },
      { en: 'Four-sharing budget room', te: 'ఫోర్-షేరింగ్ బడ్జెట్ రూమ్', hi: '4-शेयरिंग रूम' },
      { en: 'Multi-sharing dormitory beds', te: 'మల్టీ-షేరింగ్ డార్మిటరీ బెడ్స్', hi: 'मल्टी-शेयरिंग' }
    ]
  },
  {
    id: 'pg-ac',
    name: 'AC Accommodation',
    nameTe: 'ఏసీ వసతి (AC Accommodation)',
    nameHi: 'एसी आवास',
    emoji: '❄️',
    subcategories: [
      { en: 'AC single room with backup', te: 'పవర్ బ్యాకప్‌తో ఏసీ సింగిల్ రూమ్', hi: 'एसी सिंगल रूम' },
      { en: 'AC double sharing room', te: 'ఏసీ డబుల్ షేరింగ్ రూమ్', hi: 'एसी 2-शेयरिंग' },
      { en: 'Centrally air-cooled hostel', te: 'సెంట్రల్లీ కూల్డ్ హాస్టల్', hi: 'सेंट्रल एसी हॉस्टल' },
      { en: 'Luxury AC executive PG', te: 'లగ్జరీ ఏసీ ఎగ్జిక్యూటివ్ పీజీ', hi: 'लक्जरी एसी पीजी' }
    ]
  },
  {
    id: 'pg-non-ac',
    name: 'Non-AC Accommodation',
    nameTe: 'నాన్-ఏసీ బడ్జెట్ వసతి',
    nameHi: 'नॉन-एसी आवास',
    emoji: '💨',
    subcategories: [
      { en: 'Non-AC single room', te: 'నాన్-ఏసీ సింగిల్ రూమ్', hi: 'नॉन-एसी सिंगल' },
      { en: 'Non-AC 2/3 sharing room', te: 'నాన్-ఏసీ షేరింగ్ గది', hi: 'नॉन-एसी शेयरिंग' },
      { en: 'Budget student hostel', te: 'బడ్జెట్ స్టూడెంట్ హాస్టల్', hi: 'बजट स्टूडेंट हॉस्टल' },
      { en: 'Affordable economic PG', te: 'అందుబాటు ధరల పీజీ', hi: 'सस्ता पीजी' }
    ]
  },
  {
    id: 'pg-luxury',
    name: 'Luxury PGs',
    nameTe: 'లగ్జరీ & ప్రీమియం పీజీలు',
    nameHi: 'लक्जरी व प्रीमियम पीजी',
    emoji: '👑',
    subcategories: [
      { en: 'Premium 5-star style PG', te: '5-స్టార్ తరహా ప్రీమియం పీజీ', hi: 'प्रीमियम पीजी' },
      { en: 'Executive serviced rooms', te: 'ఎగ్జిక్యూటివ్ సర్వీస్డ్ రూమ్స్', hi: 'सर्विस रूम्स' },
      { en: 'Fully furnished designer PG', te: 'ఫుల్లీ ఫర్నిష్డ్ డిజైనర్ పీజీ', hi: 'फर्निश्ड पीजी' },
      { en: 'Hotel-style accommodation with buffet', te: 'హోటల్ తరహా బఫే వసతి', hi: 'होटल-स्टाइल पीजी' }
    ]
  },
  {
    id: 'pg-budget',
    name: 'Budget PGs',
    nameTe: 'తక్కువ ధర బడ్జెట్ పీజీలు (Budget PGs)',
    nameHi: 'कम बजट वाले पीजी',
    emoji: '🏷️',
    subcategories: [
      { en: 'Low-cost PG with food', te: 'తక్కువ ధరలో భోజనంతో పీజీ', hi: 'सस्ता पीजी भोजन सहित' },
      { en: 'Affordable student hostel', te: 'అందుబాటు ధరల స్టూడెంట్ హాస్టల్', hi: 'किफायती हॉस्टल' },
      { en: 'Basic neat rooms', te: 'పరిశుభ్రమైన బేసిక్ రూమ్స్', hi: 'साधारण कमरे' },
      { en: 'Zero deposit economic PG', te: 'జీరో డిపాజిట్ ఎకనామిక్ పీజీ', hi: 'जीरो डिपॉजिट पीजी' }
    ]
  },
  {
    id: 'pg-food-included',
    name: 'Food-Included PGs',
    nameTe: '3 పూటలా భోజనంతో కూడిన పీజీలు',
    nameHi: 'भोजन सहित पीजी',
    emoji: '🍽️',
    subcategories: [
      { en: 'Breakfast, lunch and dinner included', te: 'ఉదయం టిఫిన్, మధ్యాహ్నం, రాత్రి భోజనం', hi: '3 समय भोजन' },
      { en: 'Pure vegetarian food PG', te: 'స్వచ్ఛమైన శాకాహార భోజనం (Pure Veg)', hi: 'शुद्ध शाकाहारी पीजी' },
      { en: 'North & South Indian meal plans', te: 'సౌత్ & నార్త్ ఇండియన్ భోజనం', hi: 'उत्तर व दक्षिण भारतीय भोजन' },
      { en: 'Sunday special non-veg buffet', te: 'ఆదివారం స్పెషల్ నాన్-వెజ్ భోజనం', hi: 'संडे नॉनवेज स्पेशल' }
    ]
  },
  {
    id: 'pg-room-only',
    name: 'Room-Only PGs',
    nameTe: 'రూమ్ మాత్రమే (వంట సౌలభ్యంతో)',
    nameHi: 'केवल कमरा (रसोई सहित)',
    emoji: '🍳',
    subcategories: [
      { en: 'Room only (No food provided)', te: 'రూమ్ మాత్రమే (భోజనం లేదు)', hi: 'केवल कमरा' },
      { en: 'Self-cooking rooms with gas', te: 'గ్యాస్‌తో స్వంత వంట గదులు', hi: 'खुद खाना बनाने की सुविधा' },
      { en: 'Full shared kitchen access', te: 'పూర్తి కిచెన్ సౌకర్యం', hi: 'शेयर्ड किचन' },
      { en: 'Refrigerator & microwave access', te: 'ఫ్రిజ్ & మైక్రోవేవ్ సదుపాయం', hi: 'फ्रिज व माइक्रोवेव' }
    ]
  },
  {
    id: 'pg-family',
    name: 'Family Accommodation',
    nameTe: 'కుటుంబ & జంటల వసతి (Family Accommodation)',
    nameHi: 'फैमिली व कपल आवास',
    emoji: '👨‍👩‍👧',
    subcategories: [
      { en: 'Family PG apartments', te: 'ఫ్యామిలీ పీజీ అపార్ట్‌మెంట్స్', hi: 'फैमिली पीजी' },
      { en: 'Couple rooms with privacy', te: 'కపుల్ రూమ్స్', hi: 'कपल रूम्स' },
      { en: 'Married accommodation suites', te: 'దంపతుల నివాస సూట్లు', hi: 'दंपति आवास' },
      { en: 'Family hostels with kitchen', te: 'వంటగదితో ఫ్యామిలీ హాస్టల్స్', hi: 'फैमिली हॉस्टल' }
    ]
  },
  {
    id: 'pg-women-safe',
    name: 'Women-Safe Accommodation',
    nameTe: 'మహిళా సురక్షిత పీజీలు (Women Safe)',
    nameHi: 'महिला सुरक्षित हॉस्टल',
    emoji: '🛡️',
    subcategories: [
      { en: 'Women-only PG with lady warden', te: 'లేడీ వార్డెన్‌తో మహిళల పీజీ', hi: 'महिला वार्डन हॉस्टल' },
      { en: 'Female security & biometric check', te: 'లేడీ సెక్యూరిటీ & బయోమెట్రిక్', hi: 'सुरक्षा व बायोमेट्रिक' },
      { en: '24x7 CCTV monitored hostel', te: '24 గంటల సీసీటీవీ నిఘా హాస్టల్', hi: '24x7 सीसीटीवी हॉस्टल' },
      { en: "Working women's safe residence", te: 'వర్కింగ్ ఉమెన్స్ సురక్షిత నివాసం', hi: 'सुरक्षित महिला निवास' }
    ]
  },
  {
    id: 'pg-men',
    name: "Men's Accommodation",
    nameTe: 'పురుషుల వసతి (Men Only)',
    nameHi: 'मेंस हॉस्टल व आवास',
    emoji: '👨',
    subcategories: [
      { en: 'Men-only PG with gym', te: 'జిమ్‌తో పురుషుల పీజీ', hi: 'मेंस पीजी' },
      { en: 'Bachelor accommodation', te: 'బ్యాచిలర్ వసతి గదులు', hi: 'बैचलर आवास' },
      { en: "Working men's hostel with Wi-Fi", te: 'వై-ఫైతో వర్కింగ్ మెన్స్ హాస్టల్', hi: 'वर्किंग मेंस हॉस्टल' }
    ]
  },
  {
    id: 'pg-religious-community',
    name: 'Religious & Community Hostels',
    nameTe: 'కమ్యూనిటీ & ట్రస్ట్ హాస్టల్స్',
    nameHi: 'कम्युनिटी व ट्रस्ट हॉस्टल',
    emoji: '🙏',
    subcategories: [
      { en: 'Community welfare hostels', te: 'కమ్యూనిటీ సంక్షేమ హాస్టల్స్', hi: 'कम्युनिटी हॉस्टल' },
      { en: 'Trust & charitable accommodation', te: 'ట్రస్ట్ & స్వచ్ఛంద వసతి గృహాలు', hi: 'ट्रस्ट हॉस्टल' },
      { en: 'Minority students hostels', te: 'మైనారిటీ విద్యార్థుల హాస్టల్స్', hi: 'अल्पसंख्यक हॉस्टल' },
      { en: 'Subsidized hostel beds', te: 'సబ్సిడీ హాస్టల్ బెడ్స్', hi: 'सब्सिडी वाले हॉस्टल' }
    ]
  },
  {
    id: 'pg-special-purpose',
    name: 'Special-Purpose Accommodation',
    nameTe: 'ప్రత్యేక అవసరాల వసతి (హాస్పిటల్/ఇంటర్న్స్)',
    nameHi: 'विशेष उद्देश्य आवास',
    emoji: '🏥',
    subcategories: [
      { en: 'Medical students & doctors PG', te: 'మెడికల్ విద్యార్థులు & డాక్టర్ల పీజీ', hi: 'मेडिकल स्टूडेंट्स पीजी' },
      { en: 'Hospital attendants & patient stay', te: 'హాస్పిటల్ అటెండెంట్ల బస గదులు', hi: 'मरीज परिचारक स्टे' },
      { en: 'Interns & corporate trainees stay', te: 'ఇంటర్న్స్ & ట్రైనీల వసతి', hi: 'इंटर्न्स आवास' },
      { en: 'Tourists & exam candidates stay', te: 'పరీక్ష అభ్యర్థులు & పర్యాటకుల బస', hi: 'पर्यटक आवास' }
    ]
  },
  {
    id: 'pg-apartment-sharing',
    name: 'Apartment Sharing',
    nameTe: 'అపార్ట్‌మెంట్ షేరింగ్ (Flatmates)',
    nameHi: 'अपार्टमेंट शेयरिंग',
    emoji: '🏢',
    subcategories: [
      { en: 'Shared flats with flatmates', te: 'ఫ్లాట్‌మేట్స్‌తో షేర్డ్ ఫ్లాట్స్', hi: 'साझा फ्लैट्स' },
      { en: 'Roommate accommodation', te: 'రూమ్‌మేట్ వసతి', hi: 'रूममेट आवास' },
      { en: '1BHK sharing for 2 persons', te: 'ఇద్దరికి 1BHK షేరింగ్', hi: '1BHK शेयरिंग' },
      { en: '2BHK / 3BHK independent flat sharing', te: '2BHK/3BHK ఇండిపెండెంట్ ఫ్లాట్ షేరింగ్', hi: '2BHK साझा फ्लैट' }
    ]
  },
  {
    id: 'pg-home-based',
    name: 'Home-Based PGs',
    nameTe: 'ఇంటి తరహా పీజీలు (Homestay PGs)',
    nameHi: 'होमस्टे व फैमिली पीजी',
    emoji: '🏡',
    subcategories: [
      { en: 'Owner-occupied home PG', te: 'ఓనర్‌తో కూడిన హోమ్ పీజీ', hi: 'ओनर ऑक्यूपाइड पीजी' },
      { en: 'Family homestay PG with home food', te: 'ఇంటి భోజనంతో ఫ్యామిలీ హోమ్‌స్టే', hi: 'होमस्टे पीजी' },
      { en: 'Independent house rooms', te: 'ఇండిపెండెంట్ హౌస్ గదులు', hi: 'स्वतंत्र घर के कमरे' }
    ]
  },
  {
    id: 'pg-dormitories',
    name: 'Hostel Dormitories',
    nameTe: 'డార్మిటరీలు & బంక్ బెడ్స్',
    nameHi: 'डॉर्मिटरी व बंक बेड्स',
    emoji: '🛏️',
    subcategories: [
      { en: 'Bunk beds dormitory with locker', te: 'లాకర్‌తో బంక్ బెడ్స్ డార్మిటరీ', hi: 'बंक बेड डॉर्मिटरी' },
      { en: 'Backpacker traveler hostels', te: 'బ్యాక్‌ప్యాకర్ ట్రావెలర్ హాస్టల్స్', hi: 'बैकपैकर हॉस्टल' },
      { en: 'Group accommodation hall', te: 'గ్రూప్ అకామడేషన్ హాల్', hi: 'समूह आवास' }
    ]
  },
  {
    id: 'pg-corporate-housing',
    name: 'Corporate Housing',
    nameTe: 'కార్పొరేట్ హౌసింగ్ & కంపెనీ గెస్ట్ హౌస్',
    nameHi: 'कॉर्पोरेट हाउसिंग',
    emoji: '👔',
    subcategories: [
      { en: 'Company guest rooms', te: 'కంపెనీ గెస్ట్ రూమ్స్', hi: 'कंपनी गेस्ट रूम्स' },
      { en: 'Employee long-term accommodation', te: 'ఉద్యోగుల దీర్ఘకాలిక వసతి', hi: 'कर्मचारी आवास' },
      { en: 'Project-stay housing', te: 'ప్రాజెక్ట్ బస హౌసింగ్', hi: 'प्रोजेक्ट स्टे' },
      { en: 'Relocation temporary housing', te: 'రీలొకేషన్ తాత్కాలిక గృహాలు', hi: 'रीलोकेशन हाउसिंग' }
    ]
  },
  {
    id: 'pg-service-apartments',
    name: 'Service Apartments',
    nameTe: 'సర్వీస్ అపార్ట్‌మెంట్స్ (Service Apartments)',
    nameHi: 'सर्विस अपार्टमेंट्स',
    emoji: '🛎️',
    subcategories: [
      { en: 'Furnished apartments with housekeeping', te: 'హౌస్‌కీపింగ్‌తో ఫర్నిష్డ్ అపార్ట్‌మెంట్స్', hi: 'फर्निश्ड सर्विस अपार्टमेंट' },
      { en: 'Kitchen equipped serviced suites', te: 'కిచెన్‌తో కూడిన సర్వీస్డ్ సూట్లు', hi: 'रसोई युक्त अपार्टमेंट' },
      { en: 'Extended-stay executive rooms', te: 'దీర్ఘకాలిక ఎగ్జిక్యూటివ్ రూమ్స్', hi: 'एक्सटेंडेड स्टे रूम्स' }
    ]
  },
  {
    id: 'pg-vacation-travel',
    name: 'Vacation & Travel Stay',
    nameTe: 'ట్రావెల్ & హాలిడే స్టే (Vacation & Travel)',
    nameHi: 'ट्रैवल व हॉलिडे स्टे',
    emoji: '🌴',
    subcategories: [
      { en: 'Budget backpacker hostels', te: 'బడ్జెట్ బ్యాక్‌ప్యాకర్ హాస్టల్స్', hi: 'बैकपैकर हॉस्टल' },
      { en: 'Tourist guest rooms', te: 'టూరిస్ట్ గెస్ట్ రూమ్స్', hi: 'पर्यटक कमरे' },
      { en: 'Resort hostels & weekend stay', te: 'రిసార్ట్ హాస్టల్స్ & వీకెండ్ బస', hi: 'रिसॉर्ट हॉस्टल' }
    ]
  },
  {
    id: 'pg-special-needs',
    name: 'Special Needs Accommodation',
    nameTe: 'ప్రత్యేక అవసరాలు & సీనియర్ వసతి',
    nameHi: 'दिव्यांग व सीनियर आवास',
    emoji: '♿',
    subcategories: [
      { en: 'Senior-friendly ground floor rooms', te: 'సీనియర్ సిటిజన్ గ్రౌండ్ ఫ్లోర్ గదులు', hi: 'वरिष्ठ नागरिक कमरे' },
      { en: 'Wheelchair accessible rooms with ramp', te: 'వీల్‌చైర్ యాక్సెస్ గల గదులు', hi: 'व्हीलचेयर सुलभ कमरे' },
      { en: 'Caregiver attached accommodation', te: 'కేర్‌గివర్‌తో కూడిన వసతి', hi: 'देखभालकर्ता सहित आवास' },
      { en: 'Medical recovery stay rooms', te: 'వైద్య కోలుకొనే గదులు', hi: 'मेडिकल रिकवरी रूम्स' }
    ]
  }
];

// Rich Seed PG & Hostel Listings with Coordinates in Key Hubs of Hyderabad
export const initialPGListings: MarketplaceListing[] = [
  // 1. IT Working Professionals Executive PG - Madhapur
  {
    id: 'pg-301',
    title: 'Sri Sai Balaji Executive Luxury Men’s PG - High-Speed Wi-Fi & 3 Times Food',
    titleTe: 'శ్రీ సాయి బాలాజీ ఎగ్జిక్యూటివ్ లగ్జరీ మెన్స్ పీజీ - వై-ఫై & 3 పూటలా రుచికరమైన భోజనం',
    titleHi: 'श्री साईं बालाजी एग्जीक्यूटिव मेंस पीजी - माधापुर',
    description: 'Premier air-conditioned PG for IT working professionals in Hitech City. Walking distance from Cyber Towers & metro station. High-speed 200 Mbps Wi-Fi, 3 times unlimited South & North Indian food, daily housekeeping, automatic washing machines, power backup, and 24x7 security.',
    descriptionTe: 'హైటెక్ సిటీ సైబర్ టవర్స్ సమీపంలో ఐటీ ఉద్యోగుల కోసం ప్రీమియం ఏసీ పీజీ. 3 పూటలా ఇంటి భోజనం, 200 Mbps వై-ఫై, వాషింగ్ మెషీన్స్, డెయిలీ హౌస్‌కీపింగ్ మరియు పవర్ బ్యాకప్.',
    categoryId: 'pg-professionals',
    subcategory: 'IT employee PG',
    subcategoryTe: 'ఐటీ ఉద్యోగుల పీజీ (IT PG)',
    entityType: 'property',
    price: 8500,
    priceUnit: '/month',
    priceUnitTe: '/నెలకు',
    currency: '₹',
    location: {
      city: 'Hyderabad',
      area: 'Madhapur / Hitech City',
      distanceKm: 1.2,
      pincode: '500081',
      lat: 17.4485,
      lng: 78.3748
    },
    images: [
      'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=1000&q=80'
    ],
    providerId: 'prov-pg301',
    providerName: 'K. Venkat Rao (Owner & Resident Warden)',
    providerNameTe: 'కె. వెంకట్ రావు (ఓనర్ & వార్డెన్)',
    providerPhone: '9848123789',
    providerEmail: 'venkat.balajipg@gmail.com',
    providerAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80',
    providerRating: 4.8,
    reviewCount: 168,
    isVerified: true,
    isFeatured: true,
    status: 'active',
    customFieldValues: {
      genderPolicy: "Men Only (Working IT Professionals & Graduates)",
      roomTypesAvailable: "Single Room, 2-Sharing & 3-Sharing AC",
      foodIncluded: "Yes - 3 Times Unlimited Food (Veg & Non-Veg on Wed/Sun)",
      sharingHighlight: "2-Sharing AC: ₹8,500 | Single AC: ₹14,000",
      securityDeposit: "₹2,000 Refundable Security Deposit",
      noticePeriod: "15 Days Advance Notice",
      gateClosingTime: "11:30 PM (Biometric Access for Night Shifts)",
      wifiSpeed: "200 Mbps High Speed Fiber Wi-Fi",
      housekeeping: "Daily Room & Bathroom Deep Cleaning",
      laundryFacility: "3 Automatic Washing Machines + Ironing Area",
      powerBackup: "100% Generator Backup for Lights, Fans & Wi-Fi",
      bedsAvailable: 4,
      totalCapacity: 45,
      attachedWashroom: "Yes - Every Room Has Geyser & Attached Bath"
    },
    postingPlanId: 'plan-pro',
    viewsCount: 3800,
    enquiriesCount: 245,
    createdAt: '2026-10-18',
    expiresAt: '2027-06-30',
    reported: false
  },

  // 2. Women-Safe Biometric Security Girls Hostel - Kukatpally KPHB
  {
    id: 'pg-302',
    title: 'Sri Lakshmi Mahila Deluxe Luxury Women’s PG - 24x7 Security & Homely Food',
    titleTe: 'శ్రీ లక్ష్మి మహిళా డీలక్స్ లగ్జరీ ఉమెన్స్ పీజీ - 24x7 సెక్యూరిటీ & ఇంటి భోజనం',
    titleHi: 'श्री लक्ष्मी महिला डीलक्स पीजी - केपीएचबी कॉलोनी',
    description: '100% safe, clean, and homely hostel for college students and working women. Features female security guards, biometric entrance, CCTV coverage on every floor, pure RO drinking water, hot water geysers, refrigerator, TV lounge, and South Indian homely menu.',
    descriptionTe: 'మహిళా ఉద్యోగులు మరియు విద్యార్థినుల కోసం అత్యంత సురక్షితమైన లగ్జరీ హాస్టల్. లేడీ సెక్యూరిటీ, బయోమెట్రిక్ ప్రవేశం, సీసీటీవీ, గీజర్లు మరియు పరిశుభ్రమైన వాతావరణం.',
    categoryId: 'pg-women-safe',
    subcategory: 'Women-only PG with lady warden',
    subcategoryTe: 'లేడీ వార్డెన్‌తో మహిళల పీజీ',
    entityType: 'property',
    price: 7500,
    priceUnit: '/month',
    priceUnitTe: '/నెలకు',
    currency: '₹',
    location: {
      city: 'Hyderabad',
      area: 'Kukatpally / KPHB Colony',
      distanceKm: 2.4,
      pincode: '500072',
      lat: 17.4947,
      lng: 78.3996
    },
    images: [
      'https://images.unsplash.com/photo-1595526114035-0d45ed16cfbf?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=1000&q=80'
    ],
    providerId: 'prov-pg302',
    providerName: 'Smt. Padmavathi (Resident Lady Warden)',
    providerNameTe: 'శ్రీమతి పద్మావతి (లేడీ వార్డెన్)',
    providerPhone: '9490123987',
    providerEmail: 'lakshmi.womenspg@gmail.com',
    providerAvatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=200&q=80',
    providerRating: 4.9,
    reviewCount: 210,
    isVerified: true,
    isFeatured: true,
    status: 'active',
    customFieldValues: {
      genderPolicy: "Women Only (Strict Verification)",
      roomTypesAvailable: "2, 3 & 4-Sharing AC & Non-AC",
      foodIncluded: "Yes - 3 Times Pure Homely South Indian Food",
      sharingHighlight: "3-Sharing: ₹7,500 | 2-Sharing AC: ₹9,000",
      securityDeposit: "₹1,500 Refundable Deposit",
      noticePeriod: "15 Days Prior Notice",
      gateClosingTime: "10:00 PM (Late Pass available for IT Employees)",
      wifiSpeed: "150 Mbps High Speed Wi-Fi",
      housekeeping: "Daily Mopping & Cleaning Included",
      laundryFacility: "4 Large Washing Machines Available",
      powerBackup: "Yes - Complete Inverter Power Backup",
      bedsAvailable: 3,
      totalCapacity: 35,
      attachedWashroom: "Yes - Attached Bath with 24x7 Hot Water"
    },
    postingPlanId: 'plan-pro',
    viewsCount: 4200,
    enquiriesCount: 310,
    createdAt: '2026-10-15',
    expiresAt: '2027-06-30',
    reported: false
  },

  // 3. Competitive Exams UPSC / TSPSC / APPSC Hostel - Ashok Nagar
  {
    id: 'pg-303',
    title: 'Saraswathi Study Haven - 24x7 AC Study Hall & Library Hostel for Civil Services & Groups Aspirants',
    titleTe: 'సరస్వతి స్టడీ హెవెన్ - 24 గంటల ఏసీ స్టడీ హాల్ & లైబ్రరీతో సివిల్స్ & గ్రూప్స్ అభ్యర్థుల హాస్టల్',
    titleHi: 'सरस्वती स्टडी हेवेन - यूपीएससी व ग्रुप्स हॉस्टल (अशोक नगर)',
    description: 'Purpose-built silent study environment in the heart of Ashok Nagar coaching hub. Includes 24-hour soundproof air-conditioned reading room, personal study desks with individual charging points, nutritious hygienic food, peaceful rooms, and newspaper subscriptions (The Hindu & Eenadu).',
    descriptionTe: 'అశోక్ నగర్ కోచింగ్ సెంటర్లకు నడిచే దూరంలో సివిల్స్, టీఎస్పీఎస్సీ, ఏపీపీఎస్సీ అభ్యర్థుల కోసం ప్రత్యేక స్టడీ హాస్టల్. 24 గంటల ఏసీ రీడింగ్ రూమ్, నాణ్యమైన భోజనం మరియు ప్రశాంతమైన వాతావరణం.',
    categoryId: 'pg-competitive-exams',
    subcategory: 'UPSC hostel with library',
    subcategoryTe: 'యూపీఎస్సీ సివిల్స్ హాస్టల్ & లైబ్రరీ',
    entityType: 'property',
    price: 6500,
    priceUnit: '/month',
    priceUnitTe: '/నెలకు',
    currency: '₹',
    location: {
      city: 'Hyderabad',
      area: 'Ashok Nagar / RTC X Roads',
      distanceKm: 3.2,
      pincode: '500020',
      lat: 17.4082,
      lng: 78.4982
    },
    images: [
      'https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=1000&q=80'
    ],
    providerId: 'prov-pg303',
    providerName: 'M. Sreenivasa Chary (Academic Coordinator)',
    providerNameTe: 'ఎం. శ్రీనివాస చారి (కోఆర్డినేటర్)',
    providerPhone: '9440567890',
    providerEmail: 'saraswathi.studyhostel@gmail.com',
    providerAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80',
    providerRating: 4.8,
    reviewCount: 280,
    isVerified: true,
    isFeatured: true,
    status: 'active',
    customFieldValues: {
      genderPolicy: "Separate Men's & Women's Wings Available",
      roomTypesAvailable: "Single Room, 2-Sharing, 3-Sharing",
      foodIncluded: "Yes - 3 Times Wholesome Energy Food & Evening Tea",
      sharingHighlight: "3-Sharing: ₹6,500 | 2-Sharing: ₹7,800 (Study Hall Free)",
      securityDeposit: "₹1,000 Only",
      noticePeriod: "15 Days Notice",
      gateClosingTime: "24x7 Open (Silent Study Access at all times)",
      wifiSpeed: "100 Mbps Unlimited Fiber Broadband",
      housekeeping: "Daily Room Maintenance & Waste Collection",
      laundryFacility: "Washing Machines & Drying Terrace",
      powerBackup: "100% Inverter Backup for Lights & Fans",
      bedsAvailable: 6,
      totalCapacity: 60,
      attachedWashroom: "Yes - Hot Water Solar Geyser System"
    },
    postingPlanId: 'plan-pro',
    viewsCount: 5100,
    enquiriesCount: 340,
    createdAt: '2026-10-12',
    expiresAt: '2027-06-30',
    reported: false
  },

  // 4. Premium Managed Co-Living Community - Gachibowli Financial District
  {
    id: 'pg-304',
    title: 'UrbanNest Premium Managed Co-Living Suites - Gym, Gaming Lounge & Coworking Cafe',
    titleTe: 'అర్బన్‌నెస్ట్ ప్రీమియం కో-లివింగ్ సూట్స్ - జిమ్, గేమింగ్ & కోవర్కింగ్ స్పేస్',
    titleHi: 'अर्बननेस्ट प्रीमियम को-लिविंग - गाचीबोवली',
    description: 'Next-gen designer co-living community for multinational employees and creative entrepreneurs. Fully furnished private studio & shared rooms with smart TV, gym membership, PlayStation gaming room, cafeteria, community networking events, and contactless app-based keyless entry.',
    descriptionTe: 'గాచ్చిబౌలి ఫైనాన్షియల్ డిస్ట్రిక్ట్ సమీపంలో అంతర్జాతీయ స్థాయి కో-లివింగ్ నివాసం. జిమ్, కోవర్కింగ్ కేఫ్, గేమింగ్ జోన్, స్మార్ట్ టీవీ మరియు లగ్జరీ రూమ్స్.',
    categoryId: 'pg-coliving',
    subcategory: 'Premium co-living with gym',
    subcategoryTe: 'జిమ్‌తో ప్రీమియం కో-లివింగ్',
    entityType: 'property',
    price: 12000,
    priceUnit: '/month',
    priceUnitTe: '/నెలకు',
    currency: '₹',
    location: {
      city: 'Hyderabad',
      area: 'Gachibowli / Financial District',
      distanceKm: 1.5,
      pincode: '500032',
      lat: 17.4401,
      lng: 78.3489
    },
    images: [
      'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1000&q=80'
    ],
    providerId: 'prov-pg304',
    providerName: 'Rahul Verma (Community Operations Lead)',
    providerNameTe: 'రాహుల్ వర్మ (కమ్యూనిటీ మేనేజర్)',
    providerPhone: '9885112233',
    providerEmail: 'contact@urbannestcoliving.com',
    providerAvatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80',
    providerRating: 4.9,
    reviewCount: 195,
    isVerified: true,
    isFeatured: true,
    status: 'active',
    customFieldValues: {
      genderPolicy: "Unisex Co-Living with Dedicated Single Gender Floors",
      roomTypesAvailable: "Private Studio, 2-Sharing Luxury Suite",
      foodIncluded: "Continental & Indian Breakfast Included (Cafeteria Option)",
      sharingHighlight: "2-Sharing Luxury: ₹12,000 | Private Studio: ₹22,000",
      securityDeposit: "1 Month Rent",
      noticePeriod: "30 Days Notice",
      gateClosingTime: "24x7 Keycard / Mobile App Access",
      wifiSpeed: "300 Mbps Dedicated Enterprise Wi-Fi",
      housekeeping: "Bi-weekly Linen Change & Daily Deep Cleaning",
      laundryFacility: "Laundromat with Dryers & Ironing Service",
      powerBackup: "24x7 Heavy Duty Diesel Generator Backup",
      bedsAvailable: 5,
      totalCapacity: 80,
      attachedWashroom: "Luxury Glass Enclosed Bath with Jaguar Fittings"
    },
    postingPlanId: 'plan-pro',
    viewsCount: 4600,
    enquiriesCount: 290,
    createdAt: '2026-10-19',
    expiresAt: '2027-06-30',
    reported: false
  },

  // 5. Software Coaching Students Budget PG - Ameerpet / SR Nagar
  {
    id: 'pg-305',
    title: 'Sri Balaji Students Comfort PG - Budget Rooms with Wi-Fi & Food near Ameerpet Institutes',
    titleTe: 'శ్రీ బాలాజీ స్టూడెంట్స్ కంఫర్ట్ పీజీ - అమీర్‌పేట్ సాఫ్ట్‌వేర్ ఇన్‌స్టిట్యూట్స్ సమీపంలో తక్కువ ధర పీజీ',
    titleHi: 'श्री बालाजी स्टूडेंट्स पीजी - अमीरपेट',
    description: 'Most affordable and comfortable student PG situated 2 minutes from Ameerpet metro station and software training centers. Fast Wi-Fi for online practice, 3 times quality food, mineral water, clean shared rooms, and zero hidden charges.',
    descriptionTe: 'అమీర్‌పేట్ కోచింగ్ సెంటర్లు మరియు మెట్రో స్టేషన్ సమీపంలో విద్యార్థులకు అనువైన తక్కువ బడ్జెట్ హాస్టల్. 3 పూటలా భోజనం, వై-ఫై మరియు ప్రశాంత వాతావరణం.',
    categoryId: 'pg-budget',
    subcategory: 'Low-cost PG with food',
    subcategoryTe: 'తక్కువ ధరలో భోజనంతో పీజీ',
    entityType: 'property',
    price: 5500,
    priceUnit: '/month',
    priceUnitTe: '/నెలకు',
    currency: '₹',
    location: {
      city: 'Hyderabad',
      area: 'Begumpet / Ameerpet',
      distanceKm: 2.8,
      pincode: '500016',
      lat: 17.4375,
      lng: 78.4482
    },
    images: [
      'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=1000&q=80'
    ],
    providerId: 'prov-pg305',
    providerName: 'B. Prabhakar Reddy (Manager)',
    providerNameTe: 'బి. ప్రభాకర్ రెడ్డి (మేనేజర్)',
    providerPhone: '9849001122',
    providerEmail: 'prabhakar.balajipg@gmail.com',
    providerAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80',
    providerRating: 4.7,
    reviewCount: 310,
    isVerified: true,
    isFeatured: true,
    status: 'active',
    customFieldValues: {
      genderPolicy: "Boys & Men Accommodation",
      roomTypesAvailable: "2, 3 & 4-Sharing Non-AC & AC",
      foodIncluded: "Yes - 3 Times Unlimited Food Included",
      sharingHighlight: "3-Sharing: ₹5,500 | 2-Sharing: ₹6,500",
      securityDeposit: "₹1,000 Refundable",
      noticePeriod: "10 Days Notice",
      gateClosingTime: "11:00 PM Gate Closing",
      wifiSpeed: "100 Mbps Unlimited Fiber",
      housekeeping: "Daily Mopping & Room Service",
      laundryFacility: "Washing Machines on Rooftop",
      powerBackup: "Inverter Power Backup",
      bedsAvailable: 8,
      totalCapacity: 50,
      attachedWashroom: "Attached & Common Bathrooms Available"
    },
    postingPlanId: 'plan-pro',
    viewsCount: 3900,
    enquiriesCount: 275,
    createdAt: '2026-10-14',
    expiresAt: '2027-06-30',
    reported: false
  },

  // 6. Single Private AC Room with Kitchenette - Banjara Hills
  {
    id: 'pg-306',
    title: 'Hillside Executive Private Studio - Single AC Room with Kitchenette & Balcony',
    titleTe: 'హిల్ సైడ్ ఎగ్జిక్యూటివ్ ప్రైవేట్ స్టూడియో - కిచెన్ & బాల్కనీతో సింగిల్ ఏసీ రూమ్',
    titleHi: 'हिलसाइड एग्जीक्यूटिव प्राइवेट स्टूडियो - बंजारा हिल्स',
    description: 'Luxurious private single occupancy studio suite in a peaceful posh neighborhood of Banjara Hills Road No 10. Private attached kitchen with refrigerator & induction stove, premium split AC, workstation desk, ergonomic chair, smart TV, and attached bathroom with bathtub.',
    descriptionTe: 'బంజారా హిల్స్‌లో ప్రశాంతమైన వాతావరణంలో సింగిల్ ప్రైవేట్ ఏసీ రూమ్. స్వంత కిచెన్, రిఫ్రిజిరేటర్, స్మార్ట్ టీవీ, వర్క్‌స్టేషన్ మరియు లగ్జరీ బాల్కనీ.',
    categoryId: 'pg-single-rooms',
    subcategory: 'Private single room with attached bath',
    subcategoryTe: 'అటాచ్డ్ బాత్రూంతో ప్రైవేట్ సింగిల్ రూమ్',
    entityType: 'property',
    price: 15500,
    priceUnit: '/month',
    priceUnitTe: '/నెలకు',
    currency: '₹',
    location: {
      city: 'Hyderabad',
      area: 'Banjara Hills / Jubilee Hills',
      distanceKm: 2.9,
      pincode: '500034',
      lat: 17.4156,
      lng: 78.4350
    },
    images: [
      'https://images.unsplash.com/photo-1598928506311-c55ded91a20c?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1000&q=80'
    ],
    providerId: 'prov-pg306',
    providerName: 'Anita Singhal (Owner & Host)',
    providerNameTe: 'అనితా సింఘాల్ (హోస్ట్)',
    providerPhone: '9849334455',
    providerEmail: 'anita.hillside@gmail.com',
    providerAvatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=200&q=80',
    providerRating: 5.0,
    reviewCount: 88,
    isVerified: true,
    isFeatured: true,
    status: 'active',
    customFieldValues: {
      genderPolicy: "Open to Working Men, Women & Couples",
      roomTypesAvailable: "Private Studio 1RK with Kitchenette",
      foodIncluded: "Self-Cooking Kitchen (Cook can be arranged)",
      sharingHighlight: "100% Private Room - Zero Sharing",
      securityDeposit: "1 Month Rent Deposit",
      noticePeriod: "30 Days Notice",
      gateClosingTime: "24x7 Independent Key Access",
      wifiSpeed: "200 Mbps High Speed Fiber",
      housekeeping: "Twice a Week Deep Cleaning Included",
      laundryFacility: "Dedicated In-Room Washing Machine",
      powerBackup: "100% Full Inverter Generator Backup",
      bedsAvailable: 1,
      totalCapacity: 6,
      attachedWashroom: "Private Attached Luxury Jaguar Bathroom"
    },
    postingPlanId: 'plan-pro',
    viewsCount: 2900,
    enquiriesCount: 160,
    createdAt: '2026-10-17',
    expiresAt: '2027-06-30',
    reported: false
  },

  // 7. Daily & Weekly Short-Term Guest PG - Secunderabad
  {
    id: 'pg-307',
    title: 'MetroTransit Guest PG & Short-Term Stay - Daily & Weekly AC Rooms near Secunderabad Station',
    titleTe: 'మెట్రోట్రాన్సిట్ గెస్ట్ పీజీ - సికింద్రాబాద్ స్టేషన్ సమీపంలో రోజువారీ & వారం బస ఏసీ రూమ్స్',
    titleHi: 'मेट्रोट्रांजिट गेस्ट पीजी - सिकंदराबाद स्टेशन',
    description: 'Perfect short-term and daily accommodation for hospital visitors (near KIMS & Yashoda), exam candidates, travelers, and interviewees. Centrally located 5 minutes from Secunderabad Railway Station. Flexible daily billing, clean linen, Wi-Fi, and 24-hour reception.',
    descriptionTe: 'సికింద్రాబాద్ స్టేషన్ సమీపంలో పరీక్షలు, ఇంటర్వ్యూలు మరియు ఆసుపత్రి అవసరాల కోసం రోజువారీ మరియు వారపు బస. ఏసీ రూమ్స్, వై-ఫై మరియు 24 గంటల చెక్-ఇన్.',
    categoryId: 'pg-short-term',
    subcategory: 'Daily stay PG rooms',
    subcategoryTe: 'రోజువారీ బస పీజీ రూమ్స్ (Daily PG)',
    entityType: 'property',
    price: 499,
    priceUnit: '/day',
    priceUnitTe: '/రోజుకు',
    currency: '₹',
    location: {
      city: 'Hyderabad',
      area: 'Begumpet / Secunderabad',
      distanceKm: 3.1,
      pincode: '500003',
      lat: 17.4399,
      lng: 78.4983
    },
    images: [
      'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1595526114035-0d45ed16cfbf?auto=format&fit=crop&w=1000&q=80'
    ],
    providerId: 'prov-pg307',
    providerName: 'T. Satyanarayana (Guest Relations)',
    providerNameTe: 'టి. సత్యనారాయణ (మేనేజర్)',
    providerPhone: '9440332211',
    providerEmail: 'metrotransit.stay@gmail.com',
    providerAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80',
    providerRating: 4.8,
    reviewCount: 220,
    isVerified: true,
    isFeatured: true,
    status: 'active',
    customFieldValues: {
      genderPolicy: "Men, Women, Families & Medical Attendants",
      roomTypesAvailable: "Single AC, Double AC, Dormitory Bunk",
      foodIncluded: "Breakfast Available on Order / Tea & Coffee Free",
      sharingHighlight: "Dorm Bed: ₹499/day | Private AC Room: ₹999/day",
      securityDeposit: "Zero Deposit for Daily Stay",
      noticePeriod: "No Notice Period Needed",
      gateClosingTime: "24x7 Check-In & Check-Out",
      wifiSpeed: "100 Mbps Free Wi-Fi",
      housekeeping: "Daily Fresh Linen & Cleaning",
      laundryFacility: "Express Laundry on Request",
      powerBackup: "Yes - 24x7 Generator",
      bedsAvailable: 12,
      totalCapacity: 40,
      attachedWashroom: "Attached Washrooms with Geyser"
    },
    postingPlanId: 'plan-pro',
    viewsCount: 4100,
    enquiriesCount: 280,
    createdAt: '2026-10-16',
    expiresAt: '2027-06-30',
    reported: false
  },

  // 8. Shared Flat & Roommate Accommodation - Miyapur
  {
    id: 'pg-308',
    title: 'CyberView Gated Community Shared Flat - 2BHK Roommate Space with Modular Kitchen & Pool',
    titleTe: 'సైబర్‌వ్యూ గేటెడ్ కమ్యూనిటీ షేర్డ్ ఫ్లాట్ - స్విమ్మింగ్ పూల్ & కిచెన్‌తో రూమ్‌మేట్ వసతి',
    titleHi: 'साइबरव्यू गेटेड कम्युनिटी साझा फ्लैट - मियापुर',
    description: 'Shared flatmate room in a premium gated high-rise apartment society. Access to clubhouse, swimming pool, gym, tennis court, fully setup modular kitchen with piped gas, microwave, and washing machine. Zero brokerage.',
    descriptionTe: 'గేటెడ్ కమ్యూనిటీలో స్విమ్మింగ్ పూల్, జిమ్ మరియు పూర్తి ఫర్నిచర్ గల ఫ్లాట్‌లో రూమ్‌మేట్ భాగస్వామ్యం. బ్రోకరేజ్ లేదు.',
    categoryId: 'pg-apartment-sharing',
    subcategory: 'Shared flats with flatmates',
    subcategoryTe: 'ఫ్లాట్‌మేట్స్‌తో షేర్డ్ ఫ్లాట్స్',
    entityType: 'property',
    price: 7000,
    priceUnit: '/month',
    priceUnitTe: '/నెలకు',
    currency: '₹',
    location: {
      city: 'Hyderabad',
      area: 'Miyapur / Chandanagar',
      distanceKm: 3.6,
      pincode: '500049',
      lat: 17.4968,
      lng: 78.3614
    },
    images: [
      'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1000&q=80'
    ],
    providerId: 'prov-pg308',
    providerName: 'Karthik Subramanian (Flat Leaseholder)',
    providerNameTe: 'కార్తీక్ సుబ్రమణియన్ (ఫ్లాట్‌మేట్)',
    providerPhone: '9701554433',
    providerEmail: 'karthik.flatmate@gmail.com',
    providerAvatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80',
    providerRating: 4.9,
    reviewCount: 75,
    isVerified: true,
    isFeatured: true,
    status: 'active',
    customFieldValues: {
      genderPolicy: "Working Bachelors (IT / Finance)",
      roomTypesAvailable: "Dedicated Master Bedroom or Shared 2BHK",
      foodIncluded: "Self-Cooking or Shared Cook (₹2,000/month)",
      sharingHighlight: "2-Sharing Master Bed: ₹7,000 | Single Room: ₹13,000",
      securityDeposit: "2 Months Rent Security",
      noticePeriod: "30 Days Notice",
      gateClosingTime: "24x7 Gated Security Entry",
      wifiSpeed: "300 Mbps ACT Fibernet Wi-Fi",
      housekeeping: "Daily Maid for Utensils & Mopping",
      laundryFacility: "Fully Automatic Washing Machine",
      powerBackup: "100% Society Generator Backup",
      bedsAvailable: 2,
      totalCapacity: 4,
      attachedWashroom: "Attached Master Bathroom with Bathtub & Geyser"
    },
    postingPlanId: 'plan-pro',
    viewsCount: 2700,
    enquiriesCount: 155,
    createdAt: '2026-10-17',
    expiresAt: '2027-06-30',
    reported: false
  }
];
