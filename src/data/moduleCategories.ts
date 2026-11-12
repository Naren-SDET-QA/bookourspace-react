export interface ClassCategoryInfo {
  id: string;
  name: string;
  nameTe: string;
  nameHi: string;
  emoji: string;
  subcategories: {
    en: string;
    te: string;
    hi: string;
  }[];
}
export interface VenueCategoryInfo {
  id: string;
  name: string;
  nameTe: string;
  nameHi: string;
  emoji: string;
  subcategories: {
    en: string;
    te: string;
    hi: string;
  }[];
  /** Excludes this category from synthetic demo provider generation. */
  generateDemoListings?: boolean;
}
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
export type MarketSectionType =
  | 'pg_hostels'
  | 'classes'
  | 'venues'
  | 'services'
  | 'hotel_stay'
  | 'movies';

// 1. SERVICES CATEGORIES (Matches screenshot: 📺 అప్లయెన్స్ రిపేర్, 🪚 కార్పెంటర్ & వుడ్, etc.)
export const classCategories: ClassCategoryInfo[] = [
  {
    id: 'class-academic',
    name: 'Academic',
    nameTe: 'విద్యా తరగతులు & ట్యూషన్లు',
    nameHi: 'एकेडेमिक और ट्यूशन',
    emoji: '📚',
    subcategories: [
      { en: 'School subjects (Class 1-10)', te: 'స్కూల్ సబ్జెక్ట్స్ (1-10 తరగతులు)', hi: 'स्कूल विषय' },
      { en: 'CBSE syllabus coaching', te: 'సీబీఎస్ఈ (CBSE) సిలబస్ కోచింగ్', hi: 'CBSE कोचिंग' },
      { en: 'ICSE syllabus classes', te: 'ఐసీఎస్ఈ (ICSE) సిలబస్ తరగతులు', hi: 'ICSE क्लासेज' },
      { en: 'State syllabus tuitions', te: 'స్టేట్ సిలబస్ ట్యూషన్లు', hi: 'स्टेट बोर्ड ट्यूशन' },
      { en: 'Intermediate (MPC, BiPC, CEC, MEC)', te: 'ఇంటర్మీడియట్ (MPC, BiPC, CEC)', hi: 'इंटरमीडिएट' },
      { en: 'Degree subjects (B.Tech, B.Sc, B.Com)', te: 'డిగ్రీ & బీటెక్ సబ్జెక్టులు', hi: 'डिग्री और बीटेक' },
      { en: 'Maths & Science special focus', te: 'గణితం & సైన్స్ స్పెషల్ ఫోకస్', hi: 'मैथ्स और साइंस' },
      { en: 'Home tuition', te: 'ఇంటి వద్ద వ్యక్తిగత ట్యూషన్ (Home tuition)', hi: 'होम ट्यूशन' },
      { en: 'Homework & Exam support', te: 'హోంవర్క్ & వార్షిక పరీక్షల సపోర్ట్', hi: 'होमवर्क सहायता' }
    ]
  },
  {
    id: 'class-govtexams',
    name: 'Government Exams',
    nameTe: 'ప్రభుత్వ & పోటీ పరీక్షలు',
    nameHi: 'सरकारी प्रतियोगी परीक्षाएं',
    emoji: '🏛️',
    subcategories: [
      { en: 'UPSC Civil Services (IAS, IPS)', te: 'యూపీఎస్సీ సివిల్స్ (IAS, IPS)', hi: 'UPSC सिविल सेवा' },
      { en: 'APPSC Group 1, 2, 4 coaching', te: 'ఏపీపీఎస్సీ గ్రూప్స్ (APPSC)', hi: 'APPSC ग्रुप्स' },
      { en: 'TSPSC Group 1, 2, 3, 4 classes', te: 'టీఎస్పీఎస్సీ గ్రూప్స్ (TSPSC)', hi: 'TSPSC ग्रुप्स' },
      { en: 'SSC CGL, CHSL, MTS', te: 'ఎస్‌ఎస్‌సీ (SSC CGL, CHSL)', hi: 'SSC परीक्षाएं' },
      { en: 'Banking exams (IBPS, SBI PO, Clerk)', te: 'బ్యాంకింగ్ పరీక్షలు (IBPS, SBI PO)', hi: 'बैंकिंग परीक्षाएं' },
      { en: 'Railway RRB NTPC & Group D', te: 'రైల్వే రిక్రూట్‌మెంట్ (RRB NTPC)', hi: 'रेलवे आरआरबी' },
      { en: 'Police SI & Constable training', te: 'పోలీస్ ఎస్సై & కానిస్టేబుల్', hi: 'पुलिस भर्ती कोचिंग' },
      { en: 'Defense exams (NDA, CDS, AFCAT)', te: 'డిఫెన్స్ ఎగ్జామ్స్ (NDA, CDS)', hi: 'डिफेंस परीक्षाएं' },
      { en: 'Teaching exams (TET, DSC, CTET)', te: 'టీచర్ ఎగ్జామ్స్ (TET, DSC, CTET)', hi: 'टीईटी और डीएससी' },
      { en: 'NEET Medical entrance', te: 'నీట్ (NEET) మెడికల్ కోచింగ్', hi: 'नीट मेडिकल' },
      { en: 'JEE Mains & Advanced', te: 'జేఈఈ మెయిన్స్ & అడ్వాన్స్‌డ్ (JEE)', hi: 'जेईई कोचिंग' }
    ]
  },
  {
    id: 'class-software',
    name: 'Software & IT',
    nameTe: 'సాఫ్ట్‌వేర్ & ఐటీ కోర్సులు',
    nameHi: 'सॉफ्टवेयर और आईटी कोर्स',
    emoji: '💻',
    subcategories: [
      { en: 'Python & Django programming', te: 'పైథాన్ (Python & Django)', hi: 'पायथन प्रोग्रामिंग' },
      { en: 'Java & Spring Boot full stack', te: 'జావా ఫుల్ స్టాక్ (Java & Spring Boot)', hi: 'जावा फुल स्टैक' },
      { en: 'JavaScript, React & Node.js', te: 'జావాస్క్రిప్ట్, రియాక్ట్ & నోడ్.జేఎస్', hi: 'रिएक्ट और नोड' },
      { en: 'Flutter & Mobile App Dev', te: 'ఫ్లట్టర్ & మొబైల్ యాప్ డెవలప్‌మెంట్', hi: 'फ्लटर और ऐप' },
      { en: 'Web Development & MERN stack', te: 'వెబ్ డెవలప్‌మెంట్ (MERN Stack)', hi: 'वेब डेवलपमेंट' },
      { en: 'Data Science & Analytics', te: 'డేటా సైన్స్ & అనలిటిక్స్', hi: 'डेटा साइंस' },
      { en: 'AI & Machine Learning masterclass', te: 'ఆర్టిఫిషియల్ ఇంటెలిజెన్స్ (AI & ML)', hi: 'एआई और मशीन लर्निंग' },
      { en: 'Cybersecurity & Ethical Hacking', te: 'సైబర్ సెక్యూరిటీ & హ్యాకింగ్', hi: 'साइबर सुरक्षा' },
      { en: 'Cloud Computing (AWS, Azure, GCP)', te: 'క్లౌడ్ కంప్యూటింగ్ (AWS, Azure)', hi: 'क्लाउड कंप्यूटिंग' },
      { en: 'Software Testing (Selenium, Automation)', te: 'సాఫ్ట్‌వేర్ టెస్టింగ్ (Selenium, QA)', hi: 'सॉफ्टवेयर टेस्टिंग' },
      { en: 'UI/UX Design (Figma, Prototyping)', te: 'యూఐ/యూఎక్స్ డిజైనింగ్ (UI/UX Figma)', hi: 'यूआई/यूएक्स डिजाइन' },
      { en: 'Advanced Excel & Data Dashboards', te: 'అడ్వాన్స్‌డ్ ఎక్సెల్ & డాష్‌బోర్డులు', hi: 'एडवांस्ड एक्सेल' },
      { en: 'Tally Prime & GST Accounting', te: 'ట్యాలీ ప్రైమ్ & జీఎస్టీ అకౌంటింగ్', hi: 'टैली और जीएसटी' }
    ]
  },
  {
    id: 'class-ai',
    name: 'AI & Emerging Tech',
    nameTe: 'ఏఐ & నూతన టెక్నాలజీ',
    nameHi: 'एआई और नई तकनीक',
    emoji: '🤖',
    subcategories: [
      { en: 'Generative AI & Prompt Engineering', te: 'జెనరేటివ్ AI & ప్రాంప్ట్ ఇంజనీరింగ్', hi: 'जनरेटिव एआई' },
      { en: 'Machine Learning with Python', te: 'మెషీన్ లెర్నింగ్ (Python)', hi: 'मशीन लर्निंग' },
      { en: 'Deep Learning & Neural Networks', te: 'డీప్ లెర్నింగ్ & న్యూరల్ నెట్‌వర్క్స్', hi: 'डीप लर्निंग' },
      { en: 'Computer Vision & NLP', te: 'కంప్యూటర్ విజన్ & NLP', hi: 'कंप्यूटर विज़न और एनएलपी' },
      { en: 'AI for Business & Analytics', te: 'వ్యాపారానికి AI & అనలిటిక్స్', hi: 'बिज़नेस के लिए एआई' },
      { en: 'AI tools for students & teachers', te: 'విద్యార్థులకు AI సాధనాలు', hi: 'छात्रों के लिए एआई टूल्स' }
    ]
  },
  {
    id: 'class-government-skills',
    name: 'Government Skills',
    nameTe: 'ప్రభుత్వ నైపుణ్య శిక్షణ',
    nameHi: 'सरकारी कौशल प्रशिक्षण',
    emoji: '🏗️',
    subcategories: [
      { en: 'PMKVY & Skill India programs', te: 'పీఎంకేవీవై & స్కిల్ ఇండియా', hi: 'पीएमकेवीवाई और स्किल इंडिया' },
      { en: 'Free government training (SC/ST/BC/EWS)', te: 'ప్రభుత్వ ఉచిత శిక్షణ (SC/ST/BC/EWS)', hi: 'सरकारी निःशुल्क प्रशिक्षण' },
      { en: 'Digital literacy & CSC programs', te: 'డిజిటల్ లిటరసీ & సీఎస్సీ కోర్సులు', hi: 'डिजिटल साक्षरता और सीएससी' },
      { en: 'ITI trades (Electrician, Fitter, Welder)', te: 'ఐటీఐ ట్రేడ్స్ (ఎలక్ట్రిషియన్, ఫిట్టర్)', hi: 'आईटीआई ट्रेड' },
      { en: 'Solar technician & green jobs', te: 'సోలార్ టెక్నీషియన్ & గ్రీన్ జాబ్స్', hi: 'सोलर तकनीशियन' },
      { en: 'Rural livelihood & self-employment', te: 'గ్రామీణ జీవనోపాధి & స్వయం ఉపాధి', hi: 'ग्रामीण आजीविका' },
      { en: 'Govt interview & personality development', te: 'ప్రభుత్వ ఇంటర్వ్యూ & వ్యక్తిత్వ వికాసం', hi: 'सरकारी इंटरव्यू तैयारी' }
    ]
  },
  {
    id: 'class-languages',
    name: 'Languages',
    nameTe: 'భాషలు & స్పోకెన్ ఇంగ్లీష్',
    nameHi: 'भाषाएं और स्पोकन इंग्लिश',
    emoji: '🗣️',
    subcategories: [
      { en: 'Spoken English & Fluency', te: 'స్పోకెన్ ఇంగ్లీష్ & ఫ్లూయెన్సీ ట్రైనింగ్', hi: 'स्पोकन इंग्लिश' },
      { en: 'Telugu learning & grammar', te: 'తెలుగు భాష & వ్యాకరణం', hi: 'तेलुगु भाषा क्लास' },
      { en: 'Hindi spoken & writing', te: 'హిందీ సంభాషణ & రాత శిక్షణ', hi: 'हिंदी बोलना और लिखना' },
      { en: 'Tamil, Kannada, Malayalam', te: 'దక్షిణాది భాషలు (తమిళం, కన్నడ, మలయాళం)', hi: 'दक्षिण भारतीय भाषाएं' },
      { en: 'Sanskrit chanting & language', te: 'సంస్కృతం భాష & శ్లోకాలు', hi: 'संस्कृत व्याकरण व श्लोक' },
      { en: 'Foreign languages (German, French, Japanese)', te: 'విదేశీ భాషలు (జర్మన్, ఫ్రెంచ్, జపనీస్)', hi: 'विदेशी भाषाएं' },
      { en: 'Sign language & accessibility', te: 'సంజ్ఞా భాష (Sign language)', hi: 'सांकेतिक भाषा' }
    ]
  },
  {
    id: 'class-music',
    name: 'Music',
    nameTe: 'సంగీతం & వాయిద్యాలు',
    nameHi: 'संगीत और वाद्ययंत्र',
    emoji: '🎵',
    subcategories: [
      { en: 'Classical Carnatic vocal', te: 'కర్ణాటక శాస్త్రీయ సంగీతం (Carnatic Vocal)', hi: 'कर्नाटक शास्त्रीय गायन' },
      { en: 'Hindustani classical singing', te: 'హిందుస్తానీ శాస్త్రీయ గానం', hi: 'हिंदुस्तानी शास्त्रीय' },
      { en: 'Playback singing & light music', te: 'సినీ గానం & లైట్ మ్యూజిక్ (Playback)', hi: 'प्लेबैक गायन' },
      { en: 'Keyboard & Piano classes', te: 'కీబోర్డ్ & పియానో తరగతులు', hi: 'कीबोर्ड और पियानो' },
      { en: 'Guitar (Acoustic, Electric)', te: 'గిటార్ క్లాసెస్ (Guitar)', hi: 'गिटार क्लास' },
      { en: 'Violin training', te: 'వయోలిన్ శిక్షణ (Violin)', hi: 'वायलिन' },
      { en: 'Drums & Rhythm pad', te: 'డ్రమ్స్ & రిథమ్ ప్యాడ్', hi: 'ड्रम्स' },
      { en: 'Devotional bhajans & Keerthanas', te: 'భక్తి సంకీర్తనలు & అన్నమయ్య కీర్తనలు', hi: 'भक्ति भजन' }
    ]
  },
  {
    id: 'class-dance',
    name: 'Dance',
    nameTe: 'నాట్యం & డ్యాన్స్ క్లాసెస్',
    nameHi: 'नृत्य और डांस क्लास',
    emoji: '💃',
    subcategories: [
      { en: 'Kuchipudi classical dance', te: 'కూచిపూడి సంప్రదాయ నృత్యం (Kuchipudi)', hi: 'कुचिपुड़ी नृत्य' },
      { en: 'Bharatanatyam classes', te: 'భరతనాట్యం శిక్షణ (Bharatanatyam)', hi: 'भरतनाट्यम' },
      { en: 'Folk & Janapada dance', te: 'జానపద నృత్యాలు (Folk dance)', hi: 'लोक नृत्य' },
      { en: 'Bollywood choreography', te: 'బాలీవుడ్ & టాలీవుడ్ కొరియోగ్రఫీ', hi: 'बॉलीवुड डांस' },
      { en: 'Hip-Hop & Urban style', te: 'హిప్-హాప్ & అర్బన్ డ్యాన్స్', hi: 'हिप-हॉप डांस' },
      { en: 'Western & Freestyle dance', te: 'వెస్ట్రన్ & ఫ్రీస్టైల్ డ్యాన్స్', hi: 'वेस्टर्न डांस' },
      { en: 'Zumba dance workout', te: 'జుంబా ఫిట్‌నెస్ డ్యాన్స్ (Zumba)', hi: 'ज़ुम्बा डांस' },
      { en: 'Kids dance foundation', te: 'చిన్నారుల డ్యాన్స్ ఫౌండేషన్ (Kids dance)', hi: 'बच्चों का डांस' }
    ]
  },
  {
    id: 'class-fitness',
    name: 'Yoga & Fitness',
    nameTe: 'యోగా & వెల్‌నెస్',
    nameHi: 'योग और फिटनेस',
    emoji: '🧘',
    subcategories: [
      { en: 'Traditional Hatha Yoga', te: 'సాంప్రదాయ హఠ యోగా (Hatha Yoga)', hi: 'पारंपरिक हठ योग' },
      { en: 'Meditation & Mindfulness', te: 'ధ్యానం & మానసిక ప్రశాంతత (Meditation)', hi: 'ध्यान और माइंडफुलनेस' },
      { en: 'Pranayama & Breathwork', te: 'ప్రాణాయామం & శ్వాస వ్యాయామాలు', hi: 'प्राणायाम' },
      { en: 'Aerobics & Cardio fitness', te: 'ఏరోబిక్స్ & కార్డియో ఫిట్‌నెస్', hi: 'एरोबिक्स' },
      { en: 'Gym training & Personal trainer', te: 'వ్యక్తిగత జిమ్ శిక్షణ (Personal trainer)', hi: 'जिम ट्रेनिंग' },
      { en: 'Weight loss & Nutrition guidance', te: 'బరువు తగ్గే డైట్ & న్యూట్రిషన్ ప్లాన్', hi: 'वजन घटाने का कार्यक्रम' },
      { en: 'Physiotherapy & Rehab exercises', te: 'ఫిజియోథెరపీ & పునరావాస వ్యాయామాలు', hi: 'फिजियोथेरेपी' }
    ]
  },
  {
    id: 'class-kids',
    name: 'Kids',
    nameTe: 'పిల్లల ప్రత్యేక క్లాసులు',
    nameHi: 'बच्चों की विशेष कक्षाएं',
    emoji: '👶',
    subcategories: [
      { en: 'Handwriting improvement & Calligraphy', te: 'చేతిరాత మెరుగుదల & కాలిగ్రఫీ (Handwriting)', hi: 'सुलेख और हैंडराइटिंग' },
      { en: 'Abacus & Vedic Maths', te: 'అబాకస్ & వేద గణితం (Abacus & Vedic Maths)', hi: 'अबाकस और वैदिक गणित' },
      { en: 'Phonics & Early reading', te: 'ఫోనిక్స్ & చిన్న పిల్లల పఠనం (Phonics)', hi: 'फ़ोनिक्स क्लास' },
      { en: 'Storytelling & Public speaking for kids', te: 'కథలు చెప్పడం & చిన్నారుల ప్రసంగం', hi: 'स्टोरीटेलिंग' },
      { en: 'Kids coding & Scratch', te: 'పిల్లల కోడింగ్ (Scratch & Python for Kids)', hi: 'किड्स कोडिंग' },
      { en: 'Robotics & STEM experiments', te: 'రోబోటిక్స్ & సైన్స్ ప్రాజెక్ట్‌లు', hi: 'रोबोटिक्स' },
      { en: 'Kids drawing & coloring', te: 'పిల్లల డ్రాయింగ్ & కలరింగ్', hi: 'ड्राइंग और पेंटिंग' },
      { en: 'Chess for beginners', te: 'చెస్ శిక్షణ (Chess for kids)', hi: 'बच्चों का शतरंज' }
    ]
  },
  {
    id: 'class-sports',
    name: 'Sports',
    nameTe: 'క్రీడా శిక్షణ & కోచింగ్',
    nameHi: 'खेल और खेल कोचिंग',
    emoji: '🏸',
    subcategories: [
      { en: 'Cricket coaching academy', te: 'క్రికెట్ కోచింగ్ అకాడమీ (Cricket)', hi: 'क्रिकेट कोचिंग' },
      { en: 'Football training camp', te: 'ఫుట్‌బాల్ ట్రైనింగ్ (Football)', hi: 'फुटबॉल कैंप' },
      { en: 'Badminton professional coaching', te: 'బ్యాడ్మింటన్ వుడెన్ కోర్ట్ కోచింగ్', hi: 'बैडमिंटन कोचिंग' },
      { en: 'Basketball & Volleyball academy', te: 'బాస్కెట్‌బాల్ & వాలీబాల్', hi: 'बास्केटबॉल और वॉलीबॉल' },
      { en: 'Tennis coaching', te: 'లాన్ టెన్నిస్ శిక్షణ (Tennis)', hi: 'टेनिस क्लास' },
      { en: 'Swimming coaching (All ages)', te: 'ఈత శిక్షణ (Swimming coaching)', hi: 'तैराकी क्लास' },
      { en: 'Roller skating classes', te: 'స్కేటింగ్ క్లాసెస్ (Roller skating)', hi: 'स्केटिंग' },
      { en: 'Martial arts, Karate & Taekwondo', te: 'కరాటే, కుంగ్ఫూ & సెల్ఫ్ డిఫెన్స్', hi: 'कराटे और ताइक्वांडो' }
    ]
  },
  {
    id: 'class-professional',
    name: 'Professional Skills',
    nameTe: 'వృత్తి నైపుణ్యాలు & కెరీర్',
    nameHi: 'व्यावसायिक कौशल और करियर',
    emoji: '💼',
    subcategories: [
      { en: 'Corporate communication', te: 'కార్పొరేట్ కమ్యూనికేషన్ స్కిల్స్', hi: 'कॉर्पोरेट संवाद कौशल' },
      { en: 'Interview preparation & Mock tests', te: 'ఇంటర్వ్యూ ప్రిపరేషన్ & మాక్ టెస్ట్‌లు', hi: 'साक्षात्कार की तैयारी' },
      { en: 'Public speaking & Stage confidence', te: 'పబ్లిక్ స్పీకింగ్ & వేదిక ప్రసంగం', hi: 'पब्लिक स्पीकिंग' },
      { en: 'Leadership & Team management', te: 'లీడర్‌షిప్ & మేనేజ్‌మెంట్', hi: 'नेतृत्व क्षमता' },
      { en: 'Sales & Digital marketing strategy', te: 'సేల్స్ & డిజిటల్ మార్కెటింగ్', hi: 'बिक्री और डिजिटल मार्केटिंग' },
      { en: 'Human resources (HR) practical', te: 'హెచ్ఆర్ (HR) ప్రాక్టికల్ ట్రైనింగ్', hi: 'एचआर ट्रेनिंग' },
      { en: 'Entrepreneurship & Startup bootcamp', te: 'స్టార్టప్ & వ్యాపార ఆరంభం (Entrepreneurship)', hi: 'उद्यमिता बूटकैंप' }
    ]
  },
  {
    id: 'class-arts',
    name: 'Arts',
    nameTe: 'లలిత కళలు & సృజనాత్మకత',
    nameHi: 'कला और रचनात्मकता',
    emoji: '🎨',
    subcategories: [
      { en: 'Pencil sketching & Shading', te: 'పెన్సిల్ స్కెచింగ్ & షేడింగ్ (Sketching)', hi: 'पेंसिल स्केचिंग' },
      { en: 'Oil painting & Acrylics', te: 'ఆయిల్ పెయింటింగ్ & ఆక్రిలిక్స్ (Painting)', hi: 'ऑयल और ऐक्रेलिक पेंटिंग' },
      { en: 'Handicrafts & Resin art', te: 'హస్తకళలు & రెసిన్ ఆర్ట్ (Resin Art)', hi: 'हस्तशिल्प और रेजिन आर्ट' },
      { en: 'DSLR Photography & Lighting', te: 'ఫొటోగ్రఫీ & లైటింగ్ (Photography)', hi: 'फोटोग्राफी' },
      { en: 'Video Editing (Premiere, DaVinci)', te: 'వీడియో ఎడిటింగ్ (Premiere Pro, DaVinci)', hi: 'वीडियो एडिटिंग' },
      { en: 'Music production & Sound design', te: 'మ్యూజిక్ ప్రొడక్షన్ & రికార్డింగ్', hi: 'संगीत निर्माण' },
      { en: 'Creative writing & Scriptwriting', te: 'కథారచన & స్క్రిప్ట్ రైటింగ్', hi: 'रचनात्मक लेखन' }
    ]
  },
  {
    id: 'class-vocational',
    name: 'Vocational',
    nameTe: 'వృత్తి విద్యా & ప్రభుత్వ స్కిల్స్',
    nameHi: 'व्यावसायिक प्रशिक्षण',
    emoji: '🛠️',
    subcategories: [
      { en: 'State government skill programs', te: 'రాష్ట్ర ప్రభుత్వ ఉచిత ఉపాధి కోర్సులు', hi: 'सरकारी रोजगार प्रशिक्षण' },
      { en: 'Digital literacy & Basic computing', te: 'డిజిటల్ అక్షరాస్యత & కంప్యూటర్ బేసిక్స్', hi: 'डिजिटल साक्षरता' },
      { en: 'Women skill development programs', te: 'మహిళా సాధికారత & ఉపాధి శిక్షణ', hi: 'महिला कौशल विकास' },
      { en: 'Youth employment training', te: 'యువతకు ఉద్యోగ కల్పన శిక్షణ', hi: 'युवा रोजगार प्रशिक्षण' },
      { en: 'Tailoring, stitching & Boutique work', te: 'టైలరింగ్, కుట్టుపని & బోటిక్ వర్క్', hi: 'सिलाई और बुटीक' },
      { en: 'Fashion designing fundamentals', te: 'ఫ్యాషన్ డిజైనింగ్ ఫండమెంటల్స్', hi: 'फैशन डिजाइनिंग' },
      { en: 'Baking, cakes & Culinary arts', te: 'బేకింగ్, కేకులు & వంటల శిక్షణ', hi: 'बेकिंग और कुकिंग' }
    ]
  },
  {
    id: 'class-online',
    name: 'Online Courses',
    nameTe: 'ఆన్‌లైన్ కోర్సులు & సర్టిఫికేట్లు',
    nameHi: 'ऑनलाइन कोर्सेज',
    emoji: '🌐',
    subcategories: [
      { en: 'Live online masterclasses (Zoom/Meet)', te: 'లైవ్ ఆన్‌లైన్ మాస్టర్‌క్లాసెస్ (Zoom/Meet)', hi: 'लाइव ऑनलाइन मास्टरक्लास' },
      { en: 'Self-paced recorded video modules', te: 'స్వీయ అభ్యాస రికార్డెడ్ వీడియోలు', hi: 'सेल्फ-पेस्ड वीडियो कोर्स' },
      { en: 'Weekend live interactive bootcamps', te: 'వీకెండ్ ఇంటరాక్టివ్ బూట్‌క్యాంప్స్', hi: 'इंटरएक्टिव बूटकैंप' },
      { en: 'Global certification preparation', te: 'గ్లోబల్ సర్టిఫికేషన్ ప్రిపరేషన్', hi: 'ग्लोबल सर्टिफिकेट' }
    ]
  },
  {
    id: 'class-beauty',
    name: 'Beauty & Lifestyle',
    nameTe: 'బ్యూటీ & లైఫ్‌స్టైల్',
    nameHi: 'ब्यूटी और लाइफस्टाइल',
    emoji: '💄',
    subcategories: [
      { en: 'Bridal makeup & HD styling', te: 'బ్రైడల్ మేకప్ & హెచ్‌డీ స్టైలింగ్ (Makeup)', hi: 'ब्राइडल मेकअप' },
      { en: 'Hairstyling & Salon artistry', te: 'హెయిర్ స్టైలింగ్ & సెలూన్ ఆర్టిస్ట్రీ', hi: 'हेयरस्टाइलिंग' },
      { en: 'Mehendi & Henna design', te: 'మెహందీ & గోరింటాకు డిజైన్స్ (Mehendi)', hi: 'मेहंदी डिजाइन' },
      { en: 'Interior design & Home styling', te: 'ఇంటీరియర్ డిజైనింగ్ & హోమ్ స్టైలింగ్', hi: 'इंटीरियर डिजाइन' }
    ]
  },
  {
    id: 'class-religious',
    name: 'Religious & Cultural',
    nameTe: 'ధార్మిక & సంస్కృతి తరగతులు',
    nameHi: 'धार्मिक और सांस्कृतिक शिक्षा',
    emoji: '🛕',
    subcategories: [
      { en: 'Vedic chanting & Upanishad classes', te: 'వేద పఠనం & ఉపనిషత్ తరగతులు', hi: 'वेद पठन और उपनिषद' },
      { en: 'Slokas & Stotras for all ages', te: 'సంస్కృత శ్లోకాలు & స్తోత్రాలు', hi: 'श्लोक और स्तोत्र' },
      { en: 'Quran reading & Tajweed classes', te: 'ఖురాన్ పఠనం & తజ్వీద్ తరగతులు', hi: 'कुरान और तजवीद' },
      { en: 'Bible study & spiritual mentoring', te: 'బైబిల్ స్టడీ & ఆధ్యాత్మిక శిక్షణ', hi: 'बाइबल अध्ययन' }
    ]
  },
  {
    id: 'class-special',
    name: 'Special Needs',
    nameTe: 'ప్రత్యేక అవసరాలు & వ్యక్తిత్వ వికాసం',
    nameHi: 'विशेष आवश्यकताएं और व्यक्तित्व विकास',
    emoji: '🌱',
    subcategories: [
      { en: 'Speech therapy & Language development', te: 'స్పీచ్ థెరపీ & మాటల అభివృద్ధి (Speech therapy)', hi: 'स्पीच थेरेपी' },
      { en: 'Occupational activities & Sensory play', te: 'ఆక్యుపేషనల్ థెరపీ & సెన్సరీ యాక్టివిటీస్', hi: 'ऑक्यूपेशनल एक्टिविटी' },
      { en: 'Life skills & Daily living activities', te: 'లైఫ్ స్కిల్స్ & దైనందిన నైపుణ్యాలు', hi: 'जीवन कौशल' },
      { en: 'Personality development & Confidence', te: 'వ్యక్తిత్వ వికాసం & ఆత్మవిశ్వాసం', hi: 'व्यक्तित्व विकास' },
      { en: 'Mental health & Student counseling', te: 'విద్యార్థుల కౌన్సిలింగ్ & గైడెన్స్', hi: 'छात्र परामर्श' }
    ]
  },
  {
    id: 'class-life-skills',
    name: 'Life Skills',
    nameTe: 'జీవన నైపుణ్యాలు',
    nameHi: 'जीवन कौशल',
    emoji: '🌱',
    subcategories: [
      { en: 'Communication & confidence', te: 'కమ్యూనికేషన్ & ఆత్మవిశ్వాసం', hi: 'संचार और आत्मविश्वास' },
      { en: 'Financial and digital literacy', te: 'ఆర్థిక & డిజిటల్ అక్షరాస్యత', hi: 'वित्तीय और डिजिटल साक्षरता' },
      { en: 'Everyday independence skills', te: 'రోజువారీ స్వతంత్ర జీవన నైపుణ్యాలు', hi: 'दैनिक स्वतंत्रता के कौशल' }
    ]
  },
  {
    id: 'class-business',
    name: 'Business',
    nameTe: 'వ్యాపారం & వ్యాపారవేత్త నైపుణ్యాలు',
    nameHi: 'व्यवसाय और उद्यमिता',
    emoji: '📈',
    subcategories: [
      { en: 'Entrepreneurship & startup basics', te: 'వ్యాపారవేత్త నైపుణ్యాలు & స్టార్టప్ ప్రాథమికాలు', hi: 'उद्यमिता और स्टार्टअप की मूल बातें' },
      { en: 'Accounting and small-business tools', te: 'అకౌంటింగ్ & చిన్న వ్యాపార సాధనాలు', hi: 'लेखांकन और छोटे व्यवसाय के उपकरण' },
      { en: 'Sales and digital marketing', te: 'అమ్మకాలు & డిజిటల్ మార్కెటింగ్', hi: 'बिक्री और डिजिटल मार्केटिंग' }
    ]
  },
  {
    id: 'class-corporate',
    name: 'Corporate',
    nameTe: 'కార్పొరేట్ శిక్షణ',
    nameHi: 'कॉर्पोरेट प्रशिक्षण',
    emoji: '🏢',
    subcategories: [
      { en: 'Workplace communication', te: 'కార్యాలయ కమ్యూనికేషన్', hi: 'कार्यस्थल संचार' },
      { en: 'Team and leadership development', te: 'టీమ్ & నాయకత్వ అభివృద్ధి', hi: 'टीम और नेतृत्व विकास' },
      { en: 'Role-specific professional training', te: 'ఉద్యోగ పాత్రకు సంబంధించిన వృత్తిపరమైన శిక్షణ', hi: 'भूमिका-विशिष्ट पेशेवर प्रशिक्षण' }
    ]
  },
  {
    id: 'class-technical',
    name: 'Technical',
    nameTe: 'సాంకేతిక శిక్షణ',
    nameHi: 'तकनीकी प्रशिक्षण',
    emoji: '⚙️',
    subcategories: [
      { en: 'Electronics and repair fundamentals', te: 'ఎలక్ట్రానిక్స్ & మరమ్మత్తు ప్రాథమికాలు', hi: 'इलेक्ट्रॉनिक्स और मरम्मत की मूल बातें' },
      { en: 'Tools, safety and workshop practice', te: 'పరికరాలు, భద్రత & వర్క్‌షాప్ అభ్యాసం', hi: 'उपकरण, सुरक्षा और कार्यशाला अभ्यास' },
      { en: 'Technical certification preparation', te: 'సాంకేతిక సర్టిఫికేషన్ సిద్ధత', hi: 'तकनीकी प्रमाणन की तैयारी' }
    ]
  },
  {
    id: 'class-healthcare',
    name: 'Healthcare',
    nameTe: 'ఆరోగ్య సంరక్షణ శిక్షణ',
    nameHi: 'स्वास्थ्य सेवा प्रशिक्षण',
    emoji: '🩺',
    subcategories: [
      { en: 'First aid and safety awareness', te: 'ప్రథమ చికిత్స & భద్రత అవగాహన', hi: 'प्राथमिक उपचार और सुरक्षा जागरूकता' },
      { en: 'Caregiving skills', te: 'సంరక్షణ నైపుణ్యాలు', hi: 'देखभाल के कौशल' },
      { en: 'Health and wellness education', te: 'ఆరోగ్యం & వెల్‌నెస్ విద్య', hi: 'स्वास्थ्य और कल्याण शिक्षा' }
    ]
  },
  {
    id: 'class-driving',
    name: 'Driving',
    nameTe: 'డ్రైవింగ్ శిక్షణ',
    nameHi: 'ड्राइविंग प्रशिक्षण',
    emoji: '🚗',
    subcategories: [
      { en: 'Car driving lessons', te: 'కారు డ్రైవింగ్ పాఠాలు', hi: 'कार चलाना सीखें' },
      { en: 'Two-wheeler riding lessons', te: 'ద్విచక్ర వాహన శిక్షణ', hi: 'दो-पहिया वाहन चलाना सीखें' },
      { en: 'Road-safety and traffic rules', te: 'రోడ్డు భద్రత & ట్రాఫిక్ నియమాలు', hi: 'सड़क सुरक्षा और यातायात नियम' }
    ]
  },
  {
    id: 'class-agriculture',
    name: 'Agriculture',
    nameTe: 'వ్యవసాయ శిక్షణ',
    nameHi: 'कृषि प्रशिक्षण',
    emoji: '🌾',
    subcategories: [
      { en: 'Crop and soil-care fundamentals', te: 'పంటలు & నేల సంరక్షణ ప్రాథమికాలు', hi: 'फसल और मिट्टी की देखभाल की मूल बातें' },
      { en: 'Farm equipment and safe operation', te: 'వ్యవసాయ పరికరాలు & సురక్షిత నిర్వహణ', hi: 'कृषि उपकरण और सुरक्षित संचालन' },
      { en: 'Water-efficient and sustainable practices', te: 'నీటి-సమర్థ & స్థిరమైన వ్యవసాయ పద్ధతులు', hi: 'जल-कुशल और टिकाऊ तरीके' }
    ]
  },
  {
    id: 'class-community-skills',
    name: 'Community Skills',
    nameTe: 'సమాజ నైపుణ్యాలు',
    nameHi: 'सामुदायिक कौशल',
    emoji: '🤝',
    subcategories: [
      { en: 'Community leadership and participation', te: 'సమాజ నాయకత్వం & భాగస్వామ్యం', hi: 'सामुदायिक नेतृत्व और भागीदारी' },
      { en: 'Local volunteering and practical skills', te: 'స్థానిక స్వచ్ఛంద సేవ & ప్రాయోగిక నైపుణ్యాలు', hi: 'स्थानीय स्वयंसेवा और व्यावहारिक कौशल' },
      { en: 'Public-service and civic awareness', te: 'ప్రజా సేవ & పౌర అవగాహన', hi: 'जनसेवा और नागरिक जागरूकता' }
    ]
  }
];

// Rich Classes & Courses Seed Listings
export const venue12Categories: VenueCategoryInfo[] = [
  {
    id: 'venue-marriage',
    name: 'Marriage & Functions',
    nameTe: 'వివాహ & ఫంక్షన్ హాళ్ళు',
    nameHi: 'विवाह और पारिवारिक समारोह',
    emoji: '💍',
    subcategories: [
      { en: 'Marriage halls', te: 'కళ్యాణ మండపాలు (Marriage halls)', hi: 'विवाह मंडप' },
      { en: 'Wedding venues', te: 'వెడ్డింగ్ వేదికలు (Wedding venues)', hi: 'शादी के स्थल' },
      { en: 'Reception halls', te: 'రిసెప్షన్ హాళ్ళు (Reception halls)', hi: 'रिसेप्शन हॉल' },
      { en: 'Engagement halls', te: 'నిశ్చితార్థ వేదికలు (Engagement halls)', hi: 'सगाई हॉल' },
      { en: 'Mehendi and sangeet halls', te: 'మెహందీ & సంగీత్ హాళ్ళు', hi: 'मेहंदी और संगीत हॉल' },
      { en: 'Kalyana mandapams', te: 'కళ్యాణ మండపాలు (Kalyana mandapams)', hi: 'कल्याण मंडपम' },
      { en: 'Convention halls', te: 'కన్వెన్షన్ సెంటర్లు (Convention halls)', hi: 'कन्वेंशन हॉल' },
      { en: 'Banquet halls', te: 'బాంక్వెట్ హాళ్ళు (Banquet halls)', hi: 'बैंक्वेट हॉल' },
      { en: 'Community halls', te: 'కమ్యూనిటీ హాళ్ళు (Community halls)', hi: 'सामुदायिक हॉल' },
      { en: 'Small family function halls', te: 'చిన్న కుటుంబ ఫంక్షన్ హాళ్ళు', hi: 'छोटे पारिवारिक हॉल' },
      { en: 'Anniversaries', te: 'వార్షికోత్సవ హాళ్ళు (Anniversaries)', hi: 'सालगिरह हॉल' },
      { en: 'Naming ceremony halls', te: 'బారసాల / నామకరణ వేదికలు (Naming ceremony)', hi: 'नामकरण संस्कार हॉल' },
      { en: 'Baby shower halls', te: 'సీమంతం హాళ్ళు (Baby shower halls)', hi: 'गोद भराई हॉल' },
      { en: 'Birthday party halls', te: 'పుట్టినరోజు వేడుకల హాళ్ళు (Birthday party)', hi: 'जन्मदिन पार्टी हॉल' },
      { en: 'Retirement function halls', te: 'రిటైర్‌మెంట్ సన్మాన హాళ్ళు', hi: 'सेवानिवृत्ति हॉल' },
      { en: 'Funeral and condolence halls', te: 'సంతాప & శ్రద్ధాంజలి సభలు', hi: 'शोक सभा हॉल' }
    ]
  },
  {
    id: 'venue-govt',
    name: 'Government Halls',
    nameTe: 'ప్రభుత్వ & పబ్లిక్ హాల్స్',
    nameHi: 'सरकारी और सार्वजनिक हॉल',
    emoji: '🏛️',
    subcategories: [
      { en: 'Government meeting halls', te: 'ప్రభుత్వ సమావేశ మందిరాలు', hi: 'सरकारी बैठक हॉल' },
      { en: 'Municipal halls', te: 'మున్సిపల్ హాళ్ళు (Municipal halls)', hi: 'नगर पालिका हॉल' },
      { en: 'Panchayat halls', te: 'గ్రామ పంచాయతీ భవనాలు', hi: 'पंचायत भवन' },
      { en: 'Mandal office halls', te: 'మండల ప్రజా పరిషత్ హాళ్ళు', hi: 'मंडल कार्यालय हॉल' },
      { en: 'District meeting halls', te: 'జిల్లా కలెక్టరేట్ & మీటింగ్ హాల్స్', hi: 'जिला बैठक हॉल' },
      { en: 'Collectorate halls', te: 'కలెక్టరేట్ ఆడిటోరియంలు', hi: 'कलेक्टरेट हॉल' },
      { en: 'Government guest halls', te: 'ప్రభుత్వ అతిథి గృహాలు (VIP Guest halls)', hi: 'सरकारी गेस्ट हॉल' },
      { en: 'Public community halls', te: 'ప్రజా కమ్యూనిటీ భవనాలు', hi: 'सार्वजनिक सामुदायिक हॉल' },
      { en: 'Public service centers', te: 'పబ్లిక్ సర్వీస్ సెంటర్లు', hi: 'जन सेवा केंद्र' },
      { en: 'Election meeting halls', te: 'ఎన్నికల కౌంటింగ్ & మీటింగ్ హాళ్ళు', hi: 'चुनाव बैठक हॉल' },
      { en: 'Government training halls', te: 'ప్రభుత్వ శిక్షణా మందిరాలు', hi: 'सरकारी प्रशिक्षण हॉल' },
      { en: 'Public consultation halls', te: 'ప్రజాభిప్రాయ సేకరణ వేదికలు', hi: 'सार्वजनिक परामर्श हॉल' }
    ]
  },
  {
    id: 'venue-political',
    name: 'Political Meetings',
    nameTe: 'రాజకీయ & సామాజిక వేదికలు',
    nameHi: 'राजनीतिक और सामाजिक बैठकें',
    emoji: '📢',
    subcategories: [
      { en: 'Political meeting halls', te: 'రాజకీయ సమావేశ మందిరాలు', hi: 'राजनीतिक बैठक हॉल' },
      { en: 'Party conference halls', te: 'పార్టీ ప్లీనరీ & కాన్ఫరెన్స్ హాల్స్', hi: 'पार्टी सम्मेलन हॉल' },
      { en: 'Election campaign halls', te: 'ఎన్నికల ప్రచార సభా వేదికలు', hi: 'चुनाव अभियान हॉल' },
      { en: 'Press meeting halls', te: 'మీడియా & ప్రెస్ క్లబ్ హాళ్ళు', hi: 'प्रेस कॉन्फ्रेंस हॉल' },
      { en: 'Public gathering grounds', te: 'బహిరంగ సభా ప్రాంగణాలు (Public grounds)', hi: 'जनसभा मैदान' },
      { en: 'Worker meeting halls', te: 'కార్మిక & ఉద్యోగ సంఘ భవనాలు', hi: 'कार्यकर्ता बैठक हॉल' },
      { en: 'Protest and awareness meeting spaces', te: 'ధర్నా & అవగాహన సదస్సు స్థలాలు', hi: 'जागरूकता सभा स्थल' },
      { en: 'Political training halls', te: 'రాజకీయ శిక్షణ తరగతులు', hi: 'राजनीतिक प्रशिक्षण हॉल' },
      { en: 'Constituency meeting halls', te: 'నియోజకవర్గ స్థాయి ఆఫీస్ వేదికలు', hi: 'विधानसभा क्षेत्र हॉल' },
      { en: 'NGO meeting halls', te: 'ఎన్జీవో (NGO) సదస్సు హాళ్ళు', hi: 'एनजीओ बैठक हॉल' },
      { en: 'Social organization halls', te: 'సామాజిక సేవా సమితి భవనాలు', hi: 'सामाजिक संगठन हॉल' },
      { en: 'Union meeting halls', te: 'యూనియన్ సమావేశ మందిరాలు', hi: 'यूनियन बैठक हॉल' }
    ]
  },
  {
    id: 'venue-corporate',
    name: 'Corporate & Business',
    nameTe: 'కార్పొరేట్ & బిజినెస్ హాల్స్',
    nameHi: 'कॉर्पोरेट और व्यापार स्थल',
    emoji: '💼',
    subcategories: [
      { en: 'Corporate meeting rooms', te: 'కార్పొరేట్ మీటింగ్ రూములు', hi: 'कॉर्पोरेट मीटिंग रूम' },
      { en: 'Boardrooms', te: 'ఎగ్జిక్యూటివ్ బోర్డ్‌రూమ్‌లు (Boardrooms)', hi: 'बोर्ड रूम' },
      { en: 'Conference halls', te: 'కాన్ఫరెన్స్ హాళ్ళు (Conference halls)', hi: 'सम्मेलन हॉल' },
      { en: 'Seminar halls', te: 'సెమినార్ హాళ్ళు (Seminar halls)', hi: 'सेमिनार हॉल' },
      { en: 'Training rooms', te: 'కార్పొరేట్ ట్రైనింగ్ రూమ్స్', hi: 'प्रशिक्षण कक्ष' },
      { en: 'Interview halls', te: 'ఇంటర్వ్యూ డ్రైవ్ హాల్స్', hi: 'साक्षात्कार कक्ष' },
      { en: 'Co-working meeting rooms', te: 'కో-వర్కింగ్ స్పేస్ మీటింగ్ రూమ్స్', hi: 'को-वर्किंग मीटिंग रूम' },
      { en: 'Product launch venues', te: 'ప్రొడక్ట్ లాంచ్ గ్రాండ్ వేదికలు', hi: 'उत्पाद लॉन्च स्थल' },
      { en: 'Business exhibition halls', te: 'బిజినెస్ ఎక్స్‌పో హాళ్ళు', hi: 'व्यापार प्रदर्शनी हॉल' },
      { en: 'Startup event halls', te: 'స్టార్టప్ పిచ్ & ఈవెంట్ స్పేస్', hi: 'स्टार्टअप इवेंट हॉल' },
      { en: 'Workshop halls', te: 'కార్పొరేట్ వర్క్‌షాప్ హాల్స్', hi: 'कार्यशाला हॉल' },
      { en: 'Annual meeting venues', te: 'వార్షిక సర్వసభ్య సమావేశ వేదికలు (AGM)', hi: 'वार्षिक आम बैठक स्थल' }
    ]
  },
  {
    id: 'venue-education',
    name: 'Education & Training',
    nameTe: 'విద్యా & శిక్షణా వేదికలు',
    nameHi: 'शिक्षा और प्रशिक्षण हॉल',
    emoji: '🎓',
    subcategories: [
      { en: 'School auditoriums', te: 'స్కూల్ ఆడిటోరియంలు (School auditoriums)', hi: 'स्कूल ऑडिटोरियम' },
      { en: 'College auditoriums', te: 'కాలేజ్ ఆడిటోరియంలు (College auditoriums)', hi: 'कॉलेज ऑडिटोरियम' },
      { en: 'Classroom rental spaces', te: 'తరగతి గదుల అద్దె (Classroom rentals)', hi: 'कक्षा किराया स्थल' },
      { en: 'Examination halls', te: 'పరీక్షా కేంద్రాలు (Examination halls)', hi: 'परीक्षा हॉल' },
      { en: 'Coaching centers', te: 'కోచింగ్ సెంటర్ రూములు', hi: 'कोचिंग सेंटर स्पेस' },
      { en: 'Seminar rooms', te: 'అకడమిక్ సెమినార్ రూమ్స్', hi: 'अकादमिक सेमिनार हॉल' },
      { en: 'Workshop spaces', te: 'స్టూడెంట్ వర్క్‌షాప్ స్పేస్', hi: 'वर्कशॉप स्पेस' },
      { en: 'Lecture halls', te: 'లెక్చర్ థియేటర్లు (Lecture halls)', hi: 'व्याख्यान कक्ष' },
      { en: 'Computer labs', te: 'కంప్యూటర్ ల్యాబ్ అద్దె (IT Labs)', hi: 'कंप्यूटर लैब' },
      { en: 'Science labs', te: 'సైన్స్ ప్రాక్టికల్ ల్యాబ్స్', hi: 'विज्ञान प्रयोगशाला' },
      { en: 'Library halls', te: 'లైబ్రరీ రీడింగ్ హాల్స్', hi: 'पुस्तकालय हॉल' },
      { en: 'Graduation ceremony halls', te: 'కాన్వొకేషన్ & గ్రాడ్యుయేషన్ హాళ్ళు', hi: 'दीक्षांत समारोह हॉल' }
    ]
  },
  {
    id: 'venue-religious',
    name: 'Religious & Cultural',
    nameTe: 'ధార్మిక & సాంస్కృతిక భవనాలు',
    nameHi: 'धार्मिक और सांस्कृतिक हॉल',
    emoji: '🛕',
    subcategories: [
      { en: 'Temple function halls', te: 'దేవాలయ కళ్యాణ మండపాలు & ఫంక్షన్ హాల్స్', hi: 'मंदिर उत्सव हॉल' },
      { en: 'Church halls', te: 'చర్చి కమ్యూనిటీ హాళ్ళు (Church halls)', hi: 'चर्च सामुदायिक हॉल' },
      { en: 'Mosque community halls', te: 'మసీదు షాదీఖానా & కమ్యూనిటీ హాళ్ళు', hi: 'मस्जिद शादीखाना' },
      { en: 'Ashram halls', te: 'ఆశ్రమ భవనాలు & ధ్యాన కేంద్రాలు', hi: 'आश्रम हॉल' },
      { en: 'Religious meeting halls', te: 'మతపరమైన సత్సంగం హాళ్ళు', hi: 'धार्मिक बैठक हॉल' },
      { en: 'Bhajan halls', te: 'భజన & సంకీర్తన మందిరాలు', hi: 'भजन मंडली हॉल' },
      { en: 'Prayer halls', te: 'ప్రార్థనా మందిరాలు (Prayer halls)', hi: 'प्रार्थना हॉल' },
      { en: 'Spiritual training halls', te: 'ఆధ్యాత్మిక శిక్షణా కేంద్రాలు', hi: 'आध्यात्मिक केंद्र' },
      { en: 'Cultural association halls', te: 'సాంస్కృతిక సమాఖ్య వేదికలు', hi: 'सांस्कृतिक संघ हॉल' },
      { en: 'Music and dance halls', te: 'శాస్త్రీయ సంగీత & నాట్య వేదికలు', hi: 'संगीत और नृत्य हॉल' },
      { en: 'Traditional event halls', te: 'సంప్రదాయ పండుగల ప్రాంగణాలు', hi: 'पारंपरिक उत्सव हॉल' }
    ]
  },
  {
    id: 'venue-birthday',
    name: 'Birthday & Entertainment',
    nameTe: 'పుట్టినరోజు & వినోద వేదికలు',
    nameHi: 'जन्मदिन और मनोरंजन स्थल',
    emoji: '🎈',
    subcategories: [
      { en: 'Kids birthday halls', te: 'చిన్నారుల పుట్టినరోజు హాళ్ళు (Kids theme)', hi: 'बच्चों का जन्मदिन हॉल' },
      { en: 'Adult birthday halls', te: 'యువత & పెద్దల బర్త్‌డే లాంజ్‌లు', hi: 'जन्मदिन पार्टी हॉल' },
      { en: 'Play zones', te: 'కిడ్స్ ప్లే జోన్స్ & గేమింగ్ ఎరీనా', hi: 'प्ले ज़ोन' },
      { en: 'Gaming halls', te: 'వర్చువల్ రియాలిటీ & గేమింగ్ రూమ్స్', hi: 'गेमिंग हॉल' },
      { en: 'Party lounges', te: 'పార్టీ లాంజ్ & రూఫ్‌టాప్స్', hi: 'पार्टी लाउंज' },
      { en: 'Karaoke rooms', te: 'కరోకే & మ్యూజిక్ పార్టీ రూమ్స్', hi: 'कराओके रूम' },
      { en: 'Movie screening halls', te: 'మూవీ స్క్రీనింగ్ & ప్రివ్యూ థియేటర్లు', hi: 'मूवी स्क्रीनिंग हॉल' },
      { en: 'Private theatres', te: 'ప్రైవేట్ బర్త్‌డే థియేటర్లు (Private theatres)', hi: 'प्राइवेट थिएटर' },
      { en: 'Dance halls', te: 'డ్యాన్స్ ఫ్లోర్ & లైటింగ్ వేదికలు', hi: 'डांस हॉल' },
      { en: 'DJ party halls', te: 'డిజె పార్టీ హాళ్ళు (DJ party setups)', hi: 'डीजे पार्टी हॉल' },
      { en: 'Pool party venues', te: 'స్విమ్మింగ్ పూల్ పార్టీ రిసార్ట్స్', hi: 'पूल पार्टी वेन्यू' },
      { en: 'Theme party halls', te: 'కస్టమ్ థీమ్ పార్టీ వేదికలు', hi: 'थीम पार्टी हॉल' }
    ]
  },
  {
    id: 'venue-sports',
    name: 'Sports & Playgrounds',
    nameTe: 'క్రీడా మైదానాలు & టర్ఫ్‌లు',
    nameHi: 'खेल और खेल के मैदान',
    emoji: '⚽',
    subcategories: [
      { en: 'Indoor playgrounds', te: 'ఇండోర్ ప్లేగ్రౌండ్లు (Indoor arenas)', hi: 'इंडोर प्लेग्राउंड' },
      { en: 'Outdoor playgrounds', te: 'ఓపెన్ ఔట్‌డోర్ గ్రౌండ్లు', hi: 'आउटडोर खेल का मैदान' },
      { en: 'Cricket grounds', te: 'బాక్స్ క్రికెట్ & టర్ఫ్ గ్రౌండ్లు (Cricket)', hi: 'क्रिकेट मैदान & टर्फ' },
      { en: 'Football grounds', te: 'ఫుట్‌బాల్ టర్ఫ్ మైదానాలు (Football)', hi: 'फुटबॉल टर्फ' },
      { en: 'Volleyball courts', te: 'వాలీబాల్ కోర్టులు (Volleyball courts)', hi: 'वॉलीबॉल कोर्ट' },
      { en: 'Basketball courts', te: 'బాస్కెట్‌బాల్ కోర్టులు (Basketball courts)', hi: 'बास्केटबॉल कोर्ट' },
      { en: 'Badminton halls', te: 'ఇండోర్ బ్యాడ్మింటన్ వుడెన్ కోర్టులు', hi: 'बैडमिंटन हॉल' },
      { en: 'Table tennis halls', te: 'టేబుల్ టెన్నిస్ క్లబ్బులు', hi: 'टेबल टेनिस हॉल' },
      { en: 'Indoor sports arenas', te: 'మల్టీ-స్పోర్ట్స్ కాంప్లెక్స్ భవనాలు', hi: 'इंडोर स्पोर्ट्स एरिना' },
      { en: 'Swimming pools', te: 'స్విమ్మింగ్ పూల్స్ & వాటర్ స్పోర్ట్స్', hi: 'स्विमिंग पूल' },
      { en: 'Gymnastics halls', te: 'జిమ్నాస్టిక్స్ & అథ్లెటిక్స్ రూమ్స్', hi: 'जिम्नास्टिक हॉल' },
      { en: 'Yoga halls', te: 'యోగా & మెడిటేషన్ హాల్స్ (Yoga halls)', hi: 'योग हॉल' },
      { en: 'Fitness studios', te: 'ఫిట్‌నెస్ & ఏరోబిక్స్ స్టూడియోలు', hi: 'फिटनेस स्टूडियो' },
      { en: 'School grounds', te: 'స్కూల్ స్పోర్ట్స్ మైదానాలు', hi: 'स्कूल खेल का मैदान' },
      { en: 'Sports tournament grounds', te: 'రాష్ట్ర & జిల్లా టోర్నమెంట్ మైదానాలు', hi: 'टूर्नामेंट ग्राउंड' }
    ]
  },
  {
    id: 'venue-exhibition',
    name: 'Exhibition & Events',
    nameTe: 'ఎగ్జిబిషన్ & పబ్లిక్ ఈవెంట్స్',
    nameHi: 'प्रदर्शनी और सार्वजनिक कार्यक्रम',
    emoji: '🎪',
    subcategories: [
      { en: 'Exhibition halls', te: 'ఎగ్జిబిషన్ హాళ్ళు (Exhibition halls)', hi: 'प्रदर्शनी हॉल' },
      { en: 'Trade fair grounds', te: 'ట్రేడ్ ఫేర్ & వాణిజ్య సభా ప్రాంగణాలు', hi: 'व्यापार मेला मैदान' },
      { en: 'Book exhibition halls', te: 'పుస్తక ప్రదర్శన శాలలు (Book fairs)', hi: 'पुस्तक मेला हॉल' },
      { en: 'Handicraft exhibition halls', te: 'చేనేత & హస్తకళల ప్రదర్శన స్థలాలు', hi: 'हस्तशिल्प प्रदर्शनी' },
      { en: 'Flower show venues', te: 'ఫ్లవర్ షో & గార్డెనింగ్ వేదికలు', hi: 'पुष्प प्रदर्शनी स्थल' },
      { en: 'Food festival grounds', te: 'ఫుడ్ ఫెస్టివల్ ఓపెన్ గ్రౌండ్లు', hi: 'फूड फेस्टिवल ग्राउंड' },
      { en: 'Flea market spaces', te: 'ఫ్లీ మార్కెట్ & సండే బజార్ స్థలాలు', hi: 'फ्ली मार्केट स्पेस' },
      { en: 'Vehicle exhibition halls', te: 'ఆటో ఎక్స్‌పో & కార్ షోరూమ్ గ్రౌండ్స్', hi: 'वाहन प्रदर्शनी' },
      { en: 'Art gallery halls', te: 'ఆర్ట్ గ్యాలరీ & పెయింటింగ్ ప్రదర్శన శాలలు', hi: 'आर्ट गैलरी हॉल' },
      { en: 'Science exhibition halls', te: 'సైన్స్ ప్రాజెక్ట్ ఎగ్జిబిషన్ హాల్స్', hi: 'विज्ञान प्रदर्शनी हॉल' },
      { en: 'Job fair halls', te: 'మెగా జాబ్ మేళా ప్రాంగణాలు', hi: 'जॉब फेयर हॉल' },
      { en: 'Property exhibition venues', te: 'రియల్ ఎస్టేట్ & ప్రాపర్టీ ఎక్స్‌పో వేదికలు', hi: 'प्रॉपर्टी एक्सपो स्थल' }
    ]
  },
  {
    id: 'venue-medical',
    name: 'Medical & Welfare',
    nameTe: 'వైద్య శిబిరాలు & సంక్షేమం',
    nameHi: 'चिकित्सा और कल्याणकारी शिविर',
    emoji: '🏥',
    subcategories: [
      { en: 'Medical camp halls', te: 'ఉచిత వైద్య శిబిరాల హాళ్ళు', hi: 'मेडिकल कैंप हॉल' },
      { en: 'Blood donation camp venues', te: 'రక్తదాన శిబిర వేదికలు', hi: 'रक्तदान शिविर स्थल' },
      { en: 'Health checkup halls', te: 'హెల్త్ స్క్రీనింగ్ & చెకప్ హాల్స్', hi: 'स्वास्थ्य जांच हॉल' },
      { en: 'Vaccination camp spaces', te: 'టీకా & వ్యాక్సినేషన్ కేంద్రాలు', hi: 'टीकाकरण केंद्र' },
      { en: 'Senior citizen halls', te: 'వృద్ధుల సంక్షేమ భవనాలు (Senior citizens)', hi: 'वरिष्ठ नागरिक हॉल' },
      { en: 'Women’s association halls', te: 'మహిళా మండలి & స్వయంసహాయక సంఘ భవనాలు', hi: 'महिला मंडल भवन' },
      { en: 'Child welfare halls', te: 'బాలల సంక్షేమ భవనాలు', hi: 'बाल कल्याण हॉल' },
      { en: 'Rehabilitation meeting halls', te: 'పునరావాస & కౌన్సిలింగ్ కేంద్రాలు', hi: 'पुनर्वास बैठक हॉल' },
      { en: 'Charity event halls', te: 'ఛారిటీ & విరాళాల సభలు', hi: 'दान कार्यक्रम हॉल' },
      { en: 'Counseling rooms', te: 'వ్యక్తిగత & మానసిక కౌన్సిలింగ్ గదులు', hi: 'काउंसलिंग रूम' }
    ]
  },
  {
    id: 'venue-community',
    name: 'Community & Daily Spaces',
    nameTe: 'రెసిడెన్షియల్ & కాలనీ హాళ్ళు',
    nameHi: 'आवासीय और सामुदायिक स्थल',
    emoji: '🏡',
    subcategories: [
      { en: 'Apartment community halls', te: 'అపార్ట్‌మెంట్ కమ్యూనిటీ క్లబ్‌హౌస్‌లు', hi: 'अपार्टमेंट कम्युनिटी हॉल' },
      { en: 'Villa community halls', te: 'గేటెడ్ కమ్యూనిటీ విల్లా క్లబ్‌హౌస్', hi: 'विला कम्युनिटी हॉल' },
      { en: 'Resident association halls', te: 'రెసిడెంట్స్ వెల్ఫేర్ అసోసియేషన్ భవనాలు (RWA)', hi: 'निवासी संघ हॉल' },
      { en: 'Rooftop party spaces', te: 'రూఫ్‌టాప్ పార్టీ ప్రదేశాలు', hi: 'रूफटॉप पार्टी स्थल' },
      { en: 'Terrace gardens', te: 'టెర్రస్ గార్డెన్ ఫంక్షన్ ప్లేస్', hi: 'टेरेस गार्डन वेन्यू' },
      { en: 'Open lawns', te: 'ఓపెన్ గ్రీన్ లాన్స్ (Open lawns)', hi: 'ओपन लॉन' },
      { en: 'Parking-ground event spaces', te: 'విశాలమైన పార్కింగ్ ఈవెంట్ గ్రౌండ్లు', hi: 'पार्किंग इवेंट स्पेस' },
      { en: 'Home function spaces', te: 'గృహ ప్రవేశ & చిన్న శుభకార్య స్థలాలు', hi: 'गृह समारोह स्थल' },
      { en: 'Farmhouse venues', te: 'విలాసవంతమైన ఫామ్‌హౌస్‌లు (Farmhouses)', hi: 'फार्महाउस वेन्यू' },
      { en: 'Garden venues', te: 'ప్రకృతి ఒడిలో గార్డెన్ వేదికలు', hi: 'गार्डन वेन्यू' },
      { en: 'Resort halls', te: 'లగ్జరీ రిసార్ట్ & ఈవెంట్ హాళ్ళు', hi: 'रिसॉर्ट हॉल' },
      { en: 'Guesthouse halls', te: 'అతిథి గృహ ఫంక్షన్ రూములు', hi: 'गेस्टहाउस हॉल' }
    ]
  },
  {
    id: 'venue-special',
    name: 'Special-Purpose Venues',
    nameTe: 'ప్రత్యేక అవసరాల వేదికలు',
    nameHi: 'विशेष प्रयोजन स्थल',
    emoji: '🎬',
    subcategories: [
      { en: 'Marriage registration halls', te: 'సబ్-రిజిస్ట్రార్ మ్యారేజ్ రిజిస్ట్రేషన్ హాళ్ళు', hi: 'विवाह पंजीकरण हॉल' },
      { en: 'Court marriage halls', te: 'కోర్టు వివాహ హాల్స్', hi: 'कोर्ट मैरिज हॉल' },
      { en: 'Political press rooms', te: 'రాజకీయ మీడియా బ్రీఫింగ్ రూములు', hi: 'राजनीतिक प्रेस रूम' },
      { en: 'Film shooting halls', te: 'సినిమా & వెబ్ సిరీస్ షూటింగ్ ఫ్లోర్లు', hi: 'फिल्म शूटिंग फ्लोर' },
      { en: 'Photography studios', te: 'ఫోటోగ్రఫీ & వీడియో షూట్ స్టూడియోలు', hi: 'फोटोग्राफी स्टूडियो' },
      { en: 'Podcast studios', te: 'పాడ్‌కాస్ట్ & ఆడియో రికార్డింగ్ రూమ్స్', hi: 'पॉडकास्ट स्टूडियो' },
      { en: 'Music recording halls', te: 'సౌండ్‌ప్రూఫ్ మ్యూజిక్ స్టూడియోలు', hi: 'संगीत रिकॉर्डिंग हॉल' },
      { en: 'Dance rehearsal halls', te: 'డ్యాన్స్ రిహార్సల్ హాల్స్ & మిర్రర్ రూమ్స్', hi: 'नृत्य रिहर्सल हॉल' },
      { en: 'Fashion show venues', te: 'ఫ్యాషన్ షో రాంప్ & లైటింగ్ వేదికలు', hi: 'फैशन शो वेन्यू' },
      { en: 'Award ceremony halls', te: 'అవార్డ్స్ & ఘన సన్మాన వేదికలు', hi: 'पुरस्कार समारोह हॉल' },
      { en: 'Religious procession halls', te: 'శోభాయాత్ర & ఊరేగింపు ప్రారంభ స్థలాలు', hi: 'धार्मिक शोभायात्रा स्थल' },
      { en: 'Disaster relief halls', te: 'విపత్తు సహాయక & ఆశ్రయ భవనాలు', hi: 'आपदा राहत केंद्र' },
      { en: 'Storage and temporary event halls', te: 'ఈవెంట్ సామగ్రి నిల్వ & తాత్కాలిక షెడ్లు', hi: 'अस्थायी भंडारण हॉल' }
    ]
  }
];

// Rich functional venues seed listings
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
  },
  {
    id: 'pg-property-sale',
    name: 'PG Properties for Sale',
    nameTe: 'అమ్మకానికి పీజీ ప్రాపర్టీలు',
    nameHi: 'बिक्री के लिए पीजी प्रॉपर्टीज़',
    emoji: '🏷️',
    subcategories: [
      { en: 'PG property for sale', te: 'అమ్మకానికి పీజీ ప్రాపర్టీ', hi: 'बिक्री के लिए पीजी प्रॉपर्टी' },
      { en: 'Hostel building for sale', te: 'అమ్మకానికి హాస్టల్ భవనం', hi: 'बिक्री के लिए हॉस्टल भवन' },
      { en: 'Co-living property for sale', te: 'అమ్మకానికి కో-లివింగ్ ప్రాపర్టీ', hi: 'बिक्री के लिए को-लिविंग प्रॉपर्टी' },
    ]
  }
];

// Rich Seed PG & Hostel Listings with Coordinates in Key Hubs of Hyderabad
export const servicesCategories: VenueCategoryInfo[] = [
  {
    id: 'cat-4',
    name: 'Appliance Repair',
    nameTe: 'అప్లయెన్స్ రిపేర్',
    nameHi: 'उपकरण मरम्मत',
    emoji: '📺',
    subcategories: [
      { en: 'AC', te: 'ఏసీ రిపేర్ & గ్యాస్ రీఫిల్ (AC Repair)', hi: 'एसी मरम्मत' },
      { en: 'Refrigerator', te: 'ఫ్రిజ్ రిపేర్ (Refrigerator)', hi: 'रेफ्रिजरेटर मरम्मत' },
      { en: 'Washing machine', te: 'వాషింగ్ మెషీన్ రిపేర్', hi: 'वॉशिंग मशीन मरम्मत' },
      { en: 'Television', te: 'టీవీ & ఎల్ఈడీ రిపేర్ (TV Repair)', hi: 'टीवी मरम्मत' },
      { en: 'Geyser', te: 'గీజర్ రిపేర్ (Geyser)', hi: 'गीजर मरम्मत' },
      { en: 'Water purifier repair', te: 'వాటర్ ప్యూరిఫైయర్ / RO సర్వీస్', hi: 'वाटर प्यूरीफायर' },
      { en: 'Microwave', te: 'మైక్రోవేవ్ ఓవెన్ రిపేర్', hi: 'माइक्रोवेव मरम्मत' },
    ],
  },
  {
    id: 'cat-5',
    name: 'Carpenter & Wood',
    nameTe: 'కార్పెంటర్ & వుడ్',
    nameHi: 'बढ़ई और फर्नीचर',
    emoji: '🪚',
    subcategories: [
      { en: 'Carpenter', te: 'కార్పెంటర్ వర్క్స్ (General Carpentry)', hi: 'बढ़ई का काम' },
      { en: 'Cupboard installation', te: 'కబోర్డ్ & వార్డ్‌రోబ్ వర్క్స్', hi: 'अलमारी फिटिंग' },
      { en: 'Door repair', te: 'తలుపులు & తాళాల రిపేర్ (Door & Lock)', hi: 'दरवाजा मरम्मत' },
      { en: 'Furniture repair', te: 'సోఫా & ఫర్నిచర్ రిపేర్', hi: 'फर्नीचर मरम्मत' },
      { en: 'Custom furniture', te: 'కొత్త ఫర్నిచర్ తయారీ', hi: 'कस्टम फर्नीचर' },
      { en: 'Furniture assembly', te: 'బెడ్ & టేబుల్ ఫిట్టింగ్', hi: 'फर्नीचर असेंबली' },
    ],
  },
  {
    id: 'cat-1',
    name: 'Home Cleaning',
    nameTe: 'హోమ్ క్లీనింగ్',
    nameHi: 'घर की सफाई',
    emoji: '🧹',
    subcategories: [
      { en: 'Deep cleaning', te: 'ఫుల్ హోమ్ డీప్ క్లీనింగ్', hi: 'डीप क्लीनिंग' },
      { en: 'Bathroom cleaning', te: 'బాత్రూమ్ యాసిడ్ & స్టీమ్ క్లీనింగ్', hi: 'बाथरूम की सफाई' },
      { en: 'Kitchen cleaning', te: 'కిచెన్ చిమ్నీ & ఆయిల్ క్లీనింగ్', hi: 'किचन की सफाई' },
      { en: 'Sofa cleaning', te: 'సోఫా & కార్పెట్ షాంపూ క్లీనింగ్', hi: 'सोफा सफाई' },
      { en: 'Water tank cleaning', te: 'వాటర్ ట్యాంక్ క్లీనింగ్', hi: 'पानी की टंकी साफ' },
    ],
  },
  {
    id: 'cat-2',
    name: 'Electrician',
    nameTe: 'ఎలక్ట్రీషియన్',
    nameHi: 'इलेक्ट्रीशियन',
    emoji: '⚡',
    subcategories: [
      { en: 'Electrician', te: '24/7 ఎమర్జెన్సీ ఎలక్ట్రీషియన్', hi: 'इलेक्ट्रीशियन' },
      { en: 'Fan installation', te: 'ఫ్యాన్ & లైట్ల ఫిట్టింగ్', hi: 'पंखा फिटिंग' },
      { en: 'Inverter repair', te: 'ఇన్వర్టర్ & యూపీఎస్ బ్యాటరీ', hi: 'इन्वर्टर मरम्मत' },
      { en: 'Wiring', te: 'హౌస్ వైరింగ్ & MCB బోర్డు', hi: 'वायरिंग' },
      { en: 'Switch repair', te: 'స్విచ్ బోర్డు & సాకెట్ రిపేర్', hi: 'स्विच मरम्मत' },
    ],
  },
  {
    id: 'cat-3',
    name: 'Plumbing & Water',
    nameTe: 'ప్లంబర్ & శానిటరీ',
    nameHi: 'प्लंबर सेवा',
    emoji: '🚰',
    subcategories: [
      { en: 'Tap repair', te: 'ట్యాప్ & మిక్సర్ లీకేజీ రిపేర్', hi: 'नल की मरम्मत' },
      { en: 'Pipe leakage', te: 'పైప్ లీకేజీ & బ్లాకేజీ క్లియరెన్స్', hi: 'पाइप लीकेज' },
      { en: 'Water motor repair', te: 'బోర్ & వాటర్ మోటార్ రిపేర్', hi: 'मोटर मरम्मत' },
      { en: 'Bathroom fittings', te: 'కమోడ్ & షవర్ ఫిట్టింగ్', hi: 'बाथरूम फिटिंग' },
      { en: 'Drain cleaning', te: 'డ్రైనేజీ బ్లాక్ క్లీనింగ్', hi: 'ड्रेन क्लीनिंग' },
    ],
  },
  {
    id: 'cat-6',
    name: 'Painting & Interiors',
    nameTe: 'పెయింటింగ్ & ఇంటీరియర్స్',
    nameHi: 'पेंटिंग और इंटीरियर',
    emoji: '🎨',
    subcategories: [
      { en: 'House painting', te: 'ఇంటి పెయింటింగ్ (Asian/Berger)', hi: 'घर की पेंटिंग' },
      { en: 'Waterproofing', te: 'టెర్రస్ & వాల్ వాటర్ ప్రూఫింగ్', hi: 'वाटरप्रूफिंग' },
      { en: 'False ceiling', te: 'జిప్సమ్ ఫాల్స్ సీలింగ్ & లైటింగ్', hi: 'फॉल्स सीलिंग' },
      { en: 'Modular kitchen', te: 'మాడ్యులర్ కిచెన్ డిజైన్', hi: 'मॉड्यूलर किचन' },
      { en: 'Wallpaper', te: 'వాల్‌పేపర్ & టెక్చర్ డిజైన్', hi: 'वॉलपेपर' },
    ],
  },
  {
    id: 'srv-salon',
    name: 'Salon & Beauty at Home',
    nameTe: 'సెలూన్ & బ్యూటీ (ఇంటి వద్ద)',
    nameHi: 'सैलून और ब्यूटी',
    emoji: '💇‍♀️',
    subcategories: [
      { en: 'Bridal Makeup', te: 'బ్రైడల్ మేకప్ & హెయిర్ స్టైలింగ్', hi: 'ब्राइडल मेकअप' },
      { en: 'Women Salon at Home', te: 'ఫేషియల్, వాక్సింగ్ & పెడిక్యూర్', hi: 'महिला सैलून' },
      { en: 'Men Grooming & Haircut', te: 'మెన్ హెయిర్ కట్ & మసాజ్', hi: 'पुरुष ग्रूमिंग' },
      { en: 'Mehendi Artist', te: 'బ్రైడల్ మెహందీ ఆర్టిస్ట్', hi: 'मेहंदी कलाकार' },
    ],
  },
  {
    id: 'srv-packers',
    name: 'Packers & Movers',
    nameTe: 'ప్యాకర్స్ & మూవర్స్',
    nameHi: 'पैकर्स एंड मूवर्स',
    emoji: '🚚',
    subcategories: [
      { en: 'Local House Shifting', te: 'హైదరాబాద్ లోకల్ హౌస్ షిఫ్టింగ్', hi: 'लोकल हाउस शिफ्टिंग' },
      { en: 'Mini Truck / Porter', te: 'మినీ ట్రక్ & ఆటో ట్రాన్స్‌పోర్ట్', hi: 'मिनी ट्रक बुकिंग' },
      { en: 'Office Relocation', te: 'ఆఫీస్ & ఐటీ షిఫ్టింగ్', hi: 'ऑफिस शिफ्टिंग' },
      { en: 'Intercity Relocation', te: 'ఇతర నగరాలకు రవాణా', hi: 'इंटरसिटी शिफ्टिंग' },
    ],
  },
  {
    id: 'srv-pest',
    name: 'Pest Control',
    nameTe: 'పెస్ట్ కంట్రోల్',
    nameHi: 'पेस्ट कंट्रोल',
    emoji: '🛡️',
    subcategories: [
      { en: 'Cockroach & Ant Control', te: 'బొద్దింకలు & చీమల నివారణ', hi: 'कॉकरोच नियंत्रण' },
      { en: 'Termite Treatment', te: 'చెదపురుగుల నివారణ (Termite)', hi: 'दीमक उपचार' },
      { en: 'Bed Bug Treatment', te: 'నల్లుల నివారణ (Bed Bugs)', hi: 'खटमल उपचार' },
      { en: 'Mosquito Fogging', te: 'దోమల ఫాగింగ్ & శానిటైజేషన్', hi: 'मच्छर फॉगिंग' },
    ],
  },
  {
    id: 'srv-cctv',
    name: 'Laptop & CCTV Security',
    nameTe: 'ల్యాప్‌టాప్ & సీసీటీవీ',
    nameHi: 'लैपटॉप और सीसीटीवी',
    emoji: '💻',
    subcategories: [
      { en: 'CCTV Camera Installation', te: 'సీసీటీవీ కెమెరా ఫిట్టింగ్ (CP Plus/Hikvision)', hi: 'सीसीटीवी इंस्टॉलेशन' },
      { en: 'Laptop & MacBook Repair', te: 'ల్యాప్‌టాప్ మదర్‌బోర్డు & స్క్రీన్ రిపేర్', hi: 'लैपटॉप रिपेयर' },
      { en: 'Wi-Fi & Biometric Setup', te: 'వై-ఫై రూటర్ & బయోమెట్రిక్ లాక్', hi: 'वाई-फाई और बायोमेट्रिक' },
    ],
  },
  {
    id: 'srv-vehicle',
    name: 'Vehicle Repair & Care',
    nameTe: 'వాహన మరమ్మతు & కేర్',
    nameHi: 'वाहन मरम्मत और देखभाल',
    emoji: '🚗',
    subcategories: [
      { en: 'Car & bike service', te: 'కార్ & బైక్ సర్వీసింగ్', hi: 'कार और बाइक सर्विसिंग' },
      { en: 'Battery jump start', te: 'బ్యాటరీ జంప్ స్టార్ట్', hi: 'बैटरी जंप स्टार्ट' },
      { en: 'Tyre & puncture repair', te: 'టైర్ & పంక్చర్ రిపేర్', hi: 'टायर और पंचर मरम्मत' },
      { en: 'Roadside breakdown help', te: 'రోడ్డుపై బ్రేక్డౌన్ సహాయం', hi: 'सड़क पर ब्रेकडाउन सहायता' },
      { en: 'Denting & painting', te: 'డెంటింగ్ & పెయింటింగ్', hi: 'डेंटिंग और पेंटिंग' },
    ],
  },
  {
    id: 'srv-handyman',
    name: 'Home Maintenance & Handyman',
    nameTe: 'ఇంటి మెయింటెనెన్స్ & హ్యాండీమ్యాన్',
    nameHi: 'घर की देखभाल और हाथी कारीगर',
    emoji: '🛠️',
    subcategories: [
      { en: 'Handyman for small jobs', te: 'చిన్న చిన్న పనులకు హ్యాండీమ్యాన్', hi: 'छोटे कामों के लिए हाथी कारीगर' },
      { en: 'Grill & window repair', te: 'గ్రిల్ & కిటికీ రిపేర్', hi: 'ग्रिल और खिड़की मरम्मत' },
      { en: 'Lock & door fitting', te: 'తాళం & తలుపు ఫిట్టింగ్', hi: 'ताला और दरवाजा फिटिंग' },
      { en: 'Sofa & upholstery repair', te: 'సోఫా & అప్హోల్స్టరీ రిపేర్', hi: 'सोफा और असबाब मरम्मत' },
      { en: 'Annual home maintenance', te: 'వార్షిక ఇంటి నిర్వహణ ప్యాకేజీ', hi: 'वार्षिक घर रखरखाव' },
    ],
  },
  {
    id: 'rural-dairy',
    name: 'Farm Fresh Milk & Dairy',
    nameTe: 'తాజా పాలు & పాల ఉత్పత్తులు',
    nameHi: 'ताज़ा दूध और डेयरी',
    emoji: '🥛',
    generateDemoListings: false,
    subcategories: [
      { en: 'Fresh cow milk', te: 'తాజా ఆవు పాలు', hi: 'ताज़ा गाय का दूध' },
      { en: 'Fresh buffalo milk', te: 'తాజా గేదె పాలు', hi: 'ताज़ा भैंस का दूध' },
      { en: 'Curd, paneer and ghee', te: 'పెరుగు, పనీర్ మరియు నెయ్యి', hi: 'दही, पनीर और घी' },
      { en: 'Daily delivery enquiry', te: 'రోజువారీ డెలివరీ వివరాలు', hi: 'दैनिक डिलीवरी की जानकारी' },
    ],
  },
  {
    id: 'rural-farm-support',
    name: 'Farm Equipment & Local Help',
    nameTe: 'వ్యవసాయ పరికరాలు & స్థానిక సహాయం',
    nameHi: 'खेती के उपकरण और स्थानीय मदद',
    emoji: '🚜',
    generateDemoListings: false,
    subcategories: [
      { en: 'Farm equipment repair', te: 'వ్యవసాయ పరికరాల మరమ్మతు', hi: 'खेती के उपकरणों की मरम्मत' },
      { en: 'Irrigation and pump help', te: 'నీటిపారుదల మరియు పంప్ సహాయం', hi: 'सिंचाई और पंप सहायता' },
      { en: 'Tractor and implement service', te: 'ట్రాక్టర్ మరియు పనిముట్ల సేవ', hi: 'ट्रैक्टर और उपकरण सेवा' },
    ],
  },
  {
    id: 'rural-livestock',
    name: 'Livestock & Farm Supplies',
    nameTe: 'పశువులు & వ్యవసాయ సరఫరాలు',
    nameHi: 'पशुधन और कृषि सामग्री',
    emoji: '🐄',
    generateDemoListings: false,
    subcategories: [
      { en: 'Livestock care', te: 'పశువుల సంరక్షణ', hi: 'पशुधन की देखभाल' },
      { en: 'Animal feed and dairy supplies', te: 'పశువుల మేత మరియు డెయిరీ సరఫరాలు', hi: 'पशु आहार और डेयरी सामग्री' },
      { en: 'Farm input enquiry', te: 'వ్యవసాయ ఉత్పాదకాల వివరాలు', hi: 'कृषि सामग्री की जानकारी' },
    ],
  },
];

// 2. HOTEL & STAY CATEGORIES
export const hotelStayCategories: VenueCategoryInfo[] = [
  {
    id: 'hotel-budget',
    name: 'Budget & Family Hotels',
    nameTe: 'బడ్జెట్ & ఫ్యామిలీ హోటల్స్',
    nameHi: 'बजट और फैमिली होटल',
    emoji: '🏨',
    subcategories: [
      { en: 'AC Deluxe Rooms', te: 'ఏసీ డీలక్స్ రూమ్స్ (AC Deluxe)', hi: 'एसी डीलक्स रूम' },
      { en: 'Family Suite Rooms', te: 'ఫ్యామిలీ సూట్ రూమ్స్', hi: 'फैमिली सुइट' },
      { en: 'Near Metro & Railway Station', te: 'మెట్రో & రైల్వే స్టేషన్ సమీపంలో', hi: 'रेलवे स्टेशन के पास' },
      { en: 'Free Breakfast Stay', te: 'ఉచిత బ్రేక్‌ఫాస్ట్ హోటల్స్', hi: 'फ्री ब्रेकफास्ट होटल' },
    ],
  },
  {
    id: 'hotel-luxury',
    name: '5-Star & Luxury Stay',
    nameTe: 'లగ్జరీ & 5-స్టార్ హోటల్స్',
    nameHi: '5-स्टार और लक्ज़री होटल',
    emoji: '✨',
    subcategories: [
      { en: '5-Star Business Hotels', te: '5-స్టార్ బిజినెస్ హోటల్స్', hi: '5-स्टार बिजनेस होटल' },
      { en: 'Pool & Spa Luxury Stay', te: 'స్విమ్మింగ్ పూల్ & స్పా హోటల్స్', hi: 'पूल और स्पा होटल' },
      { en: 'Boutique Heritage Hotels', te: 'హెరిటేజ్ & బొటిక్ హోటల్స్', hi: 'हेरिटेज होटल' },
    ],
  },
  {
    id: 'hotel-service-apt',
    name: 'Service Apartments',
    nameTe: 'సర్వీస్ అపార్ట్‌మెంట్స్',
    nameHi: 'सर्विस अपार्टमेंट',
    emoji: '🏡',
    subcategories: [
      { en: '1BHK / 2BHK Service Flats', te: '1BHK / 2BHK ఫుల్లీ ఫర్నిష్డ్ ఫ్లాట్స్', hi: '1BHK / 2BHK सर्विस फ्लैट' },
      { en: 'IT Corporate Stay with Kitchen', te: 'కిచెన్ & వై-ఫై ఉన్న సర్వీస్ రూమ్స్', hi: 'किचन सहित अपार्टमेंट' },
      { en: 'Weekly & Monthly Stay', te: 'వారం / నెలవారీ సర్వీస్ స్టే', hi: 'साप्ताहिक और मासिक स्टे' },
    ],
  },
  {
    id: 'hotel-resorts',
    name: 'Resorts & Farm Stays',
    nameTe: 'రిసార్ట్స్ & ఫామ్ స్టే',
    nameHi: 'रिसॉर्ट और फार्म स्टे',
    emoji: '🌴',
    subcategories: [
      { en: 'Weekend Pool Resorts', te: 'వీకెండ్ స్విమ్మింగ్ పూల్ రిసార్ట్స్', hi: 'वीकेंड पूल रिसॉर्ट' },
      { en: 'Private Farmhouse with Pool', te: 'ప్రైవేట్ ఫామ్‌హౌస్ (Box Cricket & Pool)', hi: 'प्राइवेट फार्महाउस' },
      { en: 'Day Outing & Adventure Stay', te: 'డే-ఔటింగ్ & అడ్వెంచర్ రిసార్ట్స్', hi: 'डे आउटिंग रिसॉर्ट' },
    ],
  },
  {
    id: 'hotel-hourly',
    name: 'Hourly & Transit Stay',
    nameTe: 'అవర్లీ & ట్రాన్సిట్ రూమ్స్',
    nameHi: 'आवरली और ट्रांजिट स्टे',
    emoji: '⏱️',
    subcategories: [
      { en: '3 Hours / 6 Hours Check-in', te: '3 గంటలు / 6 గంటల ఫ్లెక్సీ స్టే', hi: '3/6 घंटे चेक-इन' },
      { en: 'Airport Transit Hotels', te: 'శంషాబాద్ ఎయిర్‌పోర్ట్ ట్రాన్సిట్ హోటల్స్', hi: 'एयरपोर्ट ट्रांजिट होटल' },
      { en: '24-Hour Flexi Check-in', te: '24 గంటల చెక్-ఇన్ హోటల్స్', hi: '24 घंटे चेक-इन' },
    ],
  },
  {
    id: 'hotel-couple',
    name: 'Couple Friendly Stay',
    nameTe: 'కపుల్ ఫ్రెండ్లీ హోటల్స్',
    nameHi: 'कपल फ्रेंडली होटल',
    emoji: '💑',
    subcategories: [
      { en: 'Local ID Accepted Hotels', te: 'లోకల్ ఐడీ అనుమతించే హోటల్స్', hi: 'लोकल आईडी मान्य होटल' },
      { en: 'Verified Safe Couple Stay', te: '100% ప్రైవసీ & సేఫ్ కపుల్ స్టే', hi: 'सुरक्षित कपल स्टे' },
    ],
  },
  {
    id: 'hotel-homestay',
    name: 'Homestays & Villas',
    nameTe: 'హోమ్‌స్టే & విల్లాస్',
    nameHi: 'होमस्टे और विला',
    emoji: '🌿',
    subcategories: [
      { en: 'Luxury Private Villas', te: 'లగ్జరీ ప్రైవేట్ విల్లాస్', hi: 'लक्जरी प्राइवेट विला' },
      { en: 'Family Homestay', te: 'ఫ్యామిలీ హోమ్‌స్టే (ఇంటి వాతావరణం)', hi: 'फैमिली होमस्टे' },
    ],
  },
  {
    id: 'hotel-corporate',
    name: 'Corporate Guest Houses',
    nameTe: 'కార్పొరేట్ గెస్ట్ హౌస్',
    nameHi: 'कॉर्पोरेट गेस्ट हाउस',
    emoji: '💼',
    subcategories: [
      { en: 'Hitech City Executive Stay', te: 'హైటెక్ సిటీ ఎగ్జిక్యూటివ్ గెస్ట్ హౌస్', hi: 'एग्जीक्यूटिव गेस्ट हाउस' },
      { en: 'GST Billing Corporate Rooms', te: 'జీఎస్టీ బిల్లింగ్ కార్పొరేట్ రూమ్స్', hi: 'जीएसटी बिलिंग रूम' },
    ],
  },
];

// 3. MOVIES & MULTIPLEX CATEGORIES
export const moviesCategories: VenueCategoryInfo[] = [
  {
    id: 'movie-multiplex',
    name: 'Multiplex Cinemas',
    nameTe: 'మల్టీప్లెక్స్ సినిమాలు',
    nameHi: 'मल्टीप्लेक्स सिनेमा',
    emoji: '🍿',
    subcategories: [
      { en: 'VIP Recliner Screens', te: 'వీఐపీ రిక్లైనర్ మల్టీప్లెక్స్ స్క్రీన్స్', hi: 'वीआईपी रिक्लाइनर स्क्रीन' },
      { en: 'Laser 4K Projection', te: 'లేజర్ 4K ప్రొజెక్షన్ మల్టీప్లెక్స్', hi: 'लेजर 4K मल्टीप्लेक्स' },
      { en: 'Gold Class Lounge', te: 'గోల్డ్ క్లాస్ లగ్జరీ సినిమా', hi: 'गोल्ड क्लास सिनेमा' },
    ],
  },
  {
    id: 'movie-imax',
    name: 'IMAX & 4DX Screens',
    nameTe: 'లార్జ్ స్క్రీన్ & 4DX',
    nameHi: 'आईमैक्स और 4DX',
    emoji: '📽️',
    subcategories: [
      { en: 'Prasads PCX Large Screen', te: 'ప్రసాద్స్ PCX లార్జ్ స్క్రీన్', hi: 'प्रसाद्स लार्ज स्क्रीन' },
      { en: '4DX Motion Seats', te: '4DX మోషన్ & ఎఫెక్ట్స్ సినిమా', hi: '4DX मोशन सिनेमा' },
      { en: 'EPIQ & ScreenX', te: 'EPIQ & 3D లార్జ్ ఫార్మాట్', hi: '3D लार्ज स्क्रीन' },
    ],
  },
  {
    id: 'movie-single',
    name: 'Dolby Atmos Single Screens',
    nameTe: 'డాల్బీ అట్మాస్ థియేటర్లు',
    nameHi: 'डॉल्बी एटमॉस थिएटर',
    emoji: '🔊',
    subcategories: [
      { en: 'RTC X Roads Mass Theatres', te: 'ఆర్టీసీ క్రాస్ రోడ్స్ మాస్ థియేటర్లు', hi: 'आरटीसी क्रॉस रोड्स थिएटर' },
      { en: 'Dolby Atmos 4K Single Screen', te: 'డాల్బీ అట్మాస్ 4K సింగిల్ స్క్రీన్స్', hi: 'डॉल्बी एटमॉस 4K' },
      { en: 'Early Morning Fan Shows', te: 'బెనిఫిట్ షోలు & ఫ్యాన్ షోస్', hi: 'सुबह के फैन शो' },
    ],
  },
  {
    id: 'movie-telugu',
    name: 'Telugu Blockbusters',
    nameTe: 'తెలుగు బ్లాక్‌బస్టర్స్',
    nameHi: 'तेलुगु ब्लॉकबस्टर',
    emoji: '🎞️',
    subcategories: [
      { en: 'New Telugu Releases', te: 'కొత్త తెలుగు సినిమాలు (Now Showing)', hi: 'नई तेलुगु फिल्में' },
      { en: 'Family & Action Entertainers', te: 'ఫ్యామిలీ & యాక్షన్ ఎంటర్‌టైనర్స్', hi: 'पारिवारिक फिल्में' },
      { en: 'Re-Release Special Shows', te: 'రీ-రిలీజ్ స్పెషల్ 4K షోస్', hi: 'री-रिलीज स्पेशल शो' },
    ],
  },
  {
    id: 'movie-panindia',
    name: 'Pan-India & Hindi Movies',
    nameTe: 'పాన్-ఇండియా & హిందీ',
    nameHi: 'पैन-इंडिया और हिंदी',
    emoji: '🎬',
    subcategories: [
      { en: 'Pan-India Spectacles', te: 'పాన్-ఇండియా భారీ చిత్రాలు', hi: 'पैन-इंडिया फिल्में' },
      { en: 'Bollywood Releases', te: 'బాలీవుడ్ హిందీ సినిమాలు', hi: 'बॉलीवुड फिल्में' },
    ],
  },
  {
    id: 'movie-hollywood',
    name: 'Hollywood & 3D Releases',
    nameTe: 'హాలీవుడ్ & 3D షోస్',
    nameHi: 'हॉलीवुड और 3D',
    emoji: '🌍',
    subcategories: [
      { en: 'English 3D & IMAX', te: 'ఇంగ్లీష్ 3D & సైన్స్ ఫిక్షన్', hi: 'हॉलीवुड 3D' },
      { en: 'Telugu Dubbed Hollywood', te: 'తెలుగు డబ్బింగ్ హాలీవుడ్ చిత్రాలు', hi: 'तेलुगु डब हॉलीवुड' },
    ],
  },
  {
    id: 'movie-private',
    name: 'Private Mini Theatres',
    nameTe: 'ప్రైవేట్ మినీ థియేటర్',
    nameHi: 'प्राइवेट मिनी थिएटर',
    emoji: '🛋️',
    subcategories: [
      { en: 'Birthday & Surprise Screening', te: 'బర్త్‌డే & సర్‌ప్రైజ్ ప్రైవేట్ స్క్రీనింగ్', hi: 'बर्थडे प्राइवेट थिएटर' },
      { en: 'Couple & Friends Private Pod', te: 'కపుల్స్ & ఫ్రెండ్స్ మినీ హోమ్ థియేటర్', hi: 'कपल मिनी थिएटर' },
    ],
  },
  {
    id: 'movie-standup',
    name: 'Live Shows & Standup',
    nameTe: 'లైవ్ షోస్ & స్టాండప్',
    nameHi: 'लाइव शो और स्टैंडअप',
    emoji: '🎤',
    subcategories: [
      { en: 'Telugu & English Standup Comedy', te: 'తెలుగు & ఇంగ్లీష్ స్టాండప్ కామెడీ', hi: 'स्टैंडअप कॉमेडी' },
      { en: 'Live Music Concerts', te: 'లైవ్ మ్యూజిక్ కన్సర్ట్స్ & షోస్', hi: 'लाइव म्यूजिक कॉन्सर्ट' },
    ],
  },
];

// Curated Extra Services, Hotel & Stay, and Movies Listings for Hyderabad
