import React, { useState, useEffect } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  ShieldCheck, 
  Sparkles, 
  ArrowRight, 
  MapPin, 
  CheckCircle2, 
  Clock, 
  Tag, 
  Zap,
  Home,
  GraduationCap,
  Building2
} from 'lucide-react';
import { AppLanguage } from '../utils/translations';

interface FlipkartBannerSliderProps {
  currentLang?: AppLanguage;
  activeSection: 'pg_hostels' | 'classes' | 'venues';
  onSelectSection: (section: 'pg_hostels' | 'classes' | 'venues') => void;
  onOpenMapHero: () => void;
  totalListingsCount: number;
}

export const FlipkartBannerSlider: React.FC<FlipkartBannerSliderProps> = ({
  currentLang = 'te',
  activeSection,
  onSelectSection,
  onOpenMapHero,
  totalListingsCount,
}) => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const slides = [
    {
      id: 'pg_deals',
      section: 'pg_hostels' as const,
      badge: 'FLIPKART ASSURED ACCOMMODATION',
      badgeTe: 'ఫ్లిప్‌కార్ట్ అష్యూర్డ్ పీజీలు & హాస్టల్స్',
      badgeHi: 'फ्लिपकार्ट एश्योर्ड पीजी और हॉस्टल',
      title: 'Zero Brokerage PGs & Hostels',
      titleTe: 'జీరో బ్రోకరేజ్ పీజీలు & విద్యార్థి హాస్టల్స్',
      titleHi: 'जीरो ब्रोकरेज पीजी और छात्र हॉस्टल',
      highlight: 'Save up to ₹5,000 on Deposit',
      highlightTe: 'డిపాజిట్ పై ₹5,000 వరకు ఆదా చేసుకోండి',
      highlightHi: 'डिपॉजिट पर ₹5,000 तक की बचत',
      description: 'Single AC Rooms, Double Sharing & Co-Living Spaces in Madhapur, Gachibowli & Ameerpet. Homely 3-time meals, 100 Mbps Wi-Fi, 24/7 security.',
      descriptionTe: 'మాదాపూర్, గచ్చిబౌలి, అమీర్‌పేట్ & అశోక్ నగర్‌లో సింగిల్/షేరింగ్ గదులు. 3 పూటలా రుచికరమైన భోజనం, వై-ఫై & సెక్యూరిటీ.',
      descriptionHi: 'माधापुर, गाचीबोवली और अमीरपेट में सिंगल व शेयरिंग कमरे। 3 समय भोजन, वाई-फाई और 24/7 सुरक्षा।',
      ctaText: 'Explore PGs & Hostels',
      ctaTe: 'పీజీలను చూడండి',
      ctaHi: 'पीजी और हॉस्टल देखें',
      bgGradient: 'from-[#172337] via-[#1A2F50] to-[#2874F0]',
      accentColor: 'text-[#FFE500]',
      image: 'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=800&q=80',
      tag: 'Big Hostel Savings ⚡'
    },
    {
      id: 'course_deals',
      section: 'classes' as const,
      badge: 'NEW BATCH ADMISSIONS OPEN 2026',
      badgeTe: 'కొత్త బ్యాచ్ అడ్మిషన్లు ప్రారంభం 2026',
      badgeHi: 'नए बैच एडमिशन शुरू 2026',
      title: 'Classes & Courses Booking',
      titleTe: 'తరగతులు & కోర్సుల బుకింగ్',
      titleHi: 'कक्षाएं और पाठ्यक्रम बुकिंग',
      highlight: 'Book 100% Free Trial Demo Class',
      highlightTe: '100% ఉచిత డెమో క్లాస్ బుక్ చేసుకోండి',
      highlightHi: '100% नि:शुल्क ट्रायल डेमो क्लास बुक करें',
      description: 'UPSC, APPSC, Software/IT, NEET/JEE, Carnatic Music, Kuchipudi Dance & Yoga. Offline centers, live online and hybrid coaching.',
      descriptionTe: 'యూపీఎస్సీ, కోడింగ్, సంగీతం, నృత్యం, యోగా & అకడమిక్ ట్యూషన్లు. ఆఫ్‌లైన్, లైవ్ ఆన్‌లైన్ & హైబ్రిడ్ మోడ్.',
      descriptionHi: 'यूपीएससी, कोडिंग, संगीत, नृत्य, योग एवं ट्यूशन। ऑफलाइन, लाइव ऑनलाइन और हाइब्रिड विकल्प।',
      ctaText: 'Browse Courses & Free Demo',
      ctaTe: 'కోర్సులు & ఉచిత డెమో',
      ctaHi: 'कोर्स और डेमो देखें',
      bgGradient: 'from-[#0D1F3C] via-[#1B3B6F] to-[#2874F0]',
      accentColor: 'text-[#FFE500]',
      image: 'https://images.unsplash.com/photo-1524178232363-1fb2b075b655?auto=format&fit=crop&w=800&q=80',
      tag: 'Free Trial Demo 🎁'
    },
    {
      id: 'venue_deals',
      section: 'venues' as const,
      badge: 'FLAT 20% OFF ADVANCE BOOKINGS',
      badgeTe: 'అడ్వాన్స్ బుకింగ్‌పై 20% తగ్గింపు',
      badgeHi: 'अग्रिम बुकिंग पर 20% छूट',
      title: 'Kalyana Mandapams & Venues',
      titleTe: 'కళ్యాణ మండపాలు & ఫంక్షన్ హాల్స్',
      titleHi: 'कल्याण मंडप और उत्सव स्थल',
      highlight: 'Lock 2026 Muhurtham Dates Early',
      highlightTe: '2026 ముహూర్తాల తేదీలను ముందే బుక్ చేసుకోండి',
      highlightHi: '2026 शुभ मुहूर्त तिथियां अभी सुरक्षित करें',
      description: 'Air-conditioned convention centers, banquet halls & open grounds. Verified capacity 300 to 3,500+ guests with valet parking & generator.',
      descriptionTe: 'ఏసీ కన్వెన్షన్ హాల్స్, బ్యాంక్వెట్‌లు & ఓపెన్ లాన్స్. 300 నుండి 3500+ మంది సామర్థ్యం, జనరేటర్ & పార్కింగ్.',
      descriptionHi: 'एसी कन्वेंशन सेंटर, बैंक्वेट हॉल व खुले मैदान। 300 से 3500+ क्षमता, जनरेटर व कार पार्किंग।',
      ctaText: 'Explore Wedding Halls',
      ctaTe: 'వేదికలను అన్వేషించండి',
      ctaHi: 'वेन्यू एक्सप्लोर करें',
      bgGradient: 'from-[#172337] via-[#21375B] to-[#2874F0]',
      accentColor: 'text-[#FFE500]',
      image: 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=800&q=80',
      tag: 'Grand Celebration Offer 💍'
    }
  ];

  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, 5500);
    return () => clearInterval(interval);
  }, [isPaused, slides.length]);

  const activeSlideData = slides[currentSlide];

  return (
    <div 
      className="relative w-full overflow-hidden bg-[#172337] rounded-sm sm:rounded-md shadow-md border border-slate-200 dark:border-slate-800"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Background Banner Container */}
      <div className={`relative min-h-[220px] sm:min-h-[260px] md:min-h-[280px] bg-gradient-to-r ${activeSlideData.bgGradient} text-white flex items-center transition-all duration-700`}>
        
        {/* Subtle decorative mesh overlay */}
        <div className="absolute inset-0 bg-black/20 pointer-events-none" />

        <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-8 py-6 flex flex-col md:flex-row items-center justify-between gap-6">
          
          {/* Left Text Block */}
          <div className="flex-1 space-y-2.5 max-w-2xl text-left">
            
            {/* Flipkart Assured Badge Tag */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-xs bg-[#2874F0] text-white text-[11px] font-black uppercase tracking-wider shadow-xs border border-blue-400">
                <ShieldCheck className="w-3.5 h-3.5 text-[#FFE500]" />
                <span>
                  {currentLang === 'te' 
                    ? activeSlideData.badgeTe 
                    : currentLang === 'hi' 
                    ? activeSlideData.badgeHi 
                    : activeSlideData.badge}
                </span>
              </span>

              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-xs bg-[#FFE500] text-slate-950 text-[10px] font-extrabold uppercase shadow-xs">
                <Zap className="w-3 h-3 fill-current text-slate-950" />
                <span>{activeSlideData.tag}</span>
              </span>
            </div>

            {/* Title & Highlight */}
            <div>
              <h1 className="text-xl sm:text-2xl md:text-3xl font-black tracking-tight text-white leading-tight">
                {currentLang === 'te' 
                  ? activeSlideData.titleTe 
                  : currentLang === 'hi' 
                  ? activeSlideData.titleHi 
                  : activeSlideData.title}
              </h1>
              <p className={`text-base sm:text-xl font-black ${activeSlideData.accentColor} mt-0.5`}>
                {currentLang === 'te' 
                  ? activeSlideData.highlightTe 
                  : currentLang === 'hi' 
                  ? activeSlideData.highlightHi 
                  : activeSlideData.highlight}
              </p>
            </div>

            {/* Description */}
            <p className="text-xs sm:text-sm text-slate-200 line-clamp-2 max-w-xl leading-relaxed">
              {currentLang === 'te' 
                ? activeSlideData.descriptionTe 
                : currentLang === 'hi' 
                ? activeSlideData.descriptionHi 
                : activeSlideData.description}
            </p>

            {/* Flipkart Action Buttons */}
            <div className="pt-2 flex items-center gap-3 flex-wrap">
              <button
                onClick={() => onSelectSection(activeSlideData.section)}
                className="bg-[#FF9F00] hover:bg-amber-400 active:scale-95 text-slate-950 font-black text-xs sm:text-sm px-5 py-2.5 rounded-xs shadow-md flex items-center gap-2 transition-all cursor-pointer"
              >
                <span>
                  {currentLang === 'te' 
                    ? activeSlideData.ctaTe 
                    : currentLang === 'hi' 
                    ? activeSlideData.ctaHi 
                    : activeSlideData.ctaText}
                </span>
                <ArrowRight className="w-4 h-4 stroke-[2.5]" />
              </button>

              <button
                onClick={onOpenMapHero}
                className="bg-white/15 hover:bg-white/25 text-white font-bold text-xs sm:text-sm px-4 py-2.5 rounded-xs border border-white/30 backdrop-blur-sm flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <MapPin className="w-3.5 h-3.5 text-[#FFE500]" />
                <span>{currentLang === 'te' ? 'లైవ్ మ్యాప్‌లో చూడండి' : 'View on Live Map'}</span>
              </button>
            </div>
          </div>

          {/* Right Product Image Showcase (Flipkart Big Visual) */}
          <div className="hidden sm:block shrink-0 relative w-64 md:w-80 h-44 md:h-52 rounded-sm overflow-hidden shadow-2xl border-2 border-white/20">
            <img 
              src={activeSlideData.image} 
              alt={activeSlideData.title}
              className="w-full h-full object-cover transform hover:scale-105 transition-transform duration-500" 
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent flex items-end p-3">
              <div className="text-white text-xs font-bold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-[#FFE500]" />
                <span>100% Verified Direct Owners</span>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Prev / Next Chevrons */}
      <button
        onClick={() => setCurrentSlide((prev) => (prev === 0 ? slides.length - 1 : prev - 1))}
        className="absolute left-2 top-1/2 -translate-y-1/2 w-8 sm:w-10 h-14 bg-white/90 hover:bg-white text-slate-800 rounded-r-xs shadow-lg flex items-center justify-center transition-all opacity-80 hover:opacity-100 z-20 cursor-pointer"
        aria-label="Previous Slide"
      >
        <ChevronLeft className="w-5 h-5 stroke-[2.5]" />
      </button>

      <button
        onClick={() => setCurrentSlide((prev) => (prev + 1) % slides.length)}
        className="absolute right-2 top-1/2 -translate-y-1/2 w-8 sm:w-10 h-14 bg-white/90 hover:bg-white text-slate-800 rounded-l-xs shadow-lg flex items-center justify-center transition-all opacity-80 hover:opacity-100 z-20 cursor-pointer"
        aria-label="Next Slide"
      >
        <ChevronRight className="w-5 h-5 stroke-[2.5]" />
      </button>

      {/* Slide Dots Indicator */}
      <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-20">
        {slides.map((_, idx) => (
          <button
            key={idx}
            onClick={() => setCurrentSlide(idx)}
            className={`h-1.5 rounded-full transition-all cursor-pointer ${
              currentSlide === idx ? 'w-6 bg-[#FFE500]' : 'w-2 bg-white/50 hover:bg-white/80'
            }`}
            aria-label={`Go to slide ${idx + 1}`}
          />
        ))}
      </div>
    </div>
  );
};
