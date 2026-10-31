import React, { useState } from 'react';
import { 
  Sparkles, 
  Share2, 
  Download, 
  Palette, 
  Check, 
  Volume2, 
  ShieldCheck,
  ChevronRight,
  Phone,
  Wrench,
  Clock,
  Star
} from 'lucide-react';
import { LanguageCode } from '../types';
import { translations } from '../utils/translations';
import { speakGuidance, playAlertChime } from '../utils/audio';

interface CraftoPosterGeneratorProps {
  currentLang: LanguageCode;
  userName: string;
  userPhone: string;
  userAvatar: string;
  onEditProfileClick: () => void;
}

interface ServiceCardDesign {
  id: string;
  tradeTitle: string;
  tagline: string;
  guaranteeText: string;
  bgGradient: string;
  accentBg: string;
  categoryTag: string;
  skills: string[];
}

const serviceCardTemplates: ServiceCardDesign[] = [
  {
    id: 'card-painter',
    tradeTitle: 'Wall Painting & Waterproofing Specialist',
    tagline: 'Royale Luxury Emulsion · Putty · Texture & Exterior Weatherproof',
    guaranteeText: 'సకాలంలో నాణ్యమైన పెయింటింగ్ పని · ఫ్లోర్ మరకలు లేకుండా శుభ్రమైన ముగింపు',
    bgGradient: 'from-amber-600 via-orange-600 to-amber-800',
    accentBg: 'bg-amber-950/40',
    categoryTag: 'హోమ్ పెయింటింగ్ (Painting)',
    skills: ['Wall Putty', 'Texture Design', 'Waterproofing', 'Stain-Free Clean']
  },
  {
    id: 'card-electrician',
    tradeTitle: 'Certified Electrician & Inverter Wireman',
    tagline: '24/7 Emergency Repairs · Short Circuit · MCB & Geyser Fixing',
    guaranteeText: '15 నిమిషాల్లో తక్షణ స్పందన · ప్రభుత్వ సర్టిఫైడ్ వైరింగ్ నిపుణుడు',
    bgGradient: 'from-[#4A148C] via-purple-800 to-indigo-900',
    accentBg: 'bg-purple-950/50',
    categoryTag: 'ఎలక్ట్రికల్ సేవలు (Electrical)',
    skills: ['MCB Tripping', 'Inverter Setup', 'Appliance Motor', '24/7 Rapid Reach']
  },
  {
    id: 'card-tiler',
    tradeTitle: 'Vitrified Tiling & Italian Marble Expert',
    tagline: 'Bathroom Water Slope Leveling · Granite Laying & Joint Grouting',
    guaranteeText: 'ఖచ్చితమైన లెవెలింగ్ · జీరో వాటర్ లీకేజ్ గ్యారెంటీ · నాణ్యమైన కటింగ్‌లు',
    bgGradient: 'from-emerald-700 via-teal-800 to-slate-900',
    accentBg: 'bg-emerald-950/40',
    categoryTag: 'టైల్స్ & ఫ్లోరింగ్ (Tiling)',
    skills: ['Vitrified Tiles', 'Granite Fixing', 'Slope Leveling', 'Epoxy Grout']
  },
  {
    id: 'card-docker',
    tradeTitle: 'Heavy Luggage Docker & Shifting Crew',
    tagline: 'Safe Loading of Godrej Almirahs, Sofas & Refrigerator',
    guaranteeText: 'బరువైన ఫర్నిచర్ స్క్రాచ్‌లు పడకుండా సురక్షితంగా పై అంతస్తుకి ఎక్కిస్తాము',
    bgGradient: 'from-orange-600 via-rose-700 to-slate-900',
    accentBg: 'bg-orange-950/40',
    categoryTag: 'డాకర్స్ & హమాలీ (Loading & Shifting)',
    skills: ['Safe Shifting', '4-Man Crew', 'Stairs Handling', 'Zero Damage']
  }
];

export const CraftoPosterGenerator: React.FC<CraftoPosterGeneratorProps> = ({
  currentLang,
  userName,
  userPhone,
  userAvatar,
  onEditProfileClick,
}) => {
  const t = translations[currentLang];
  const [selectedCard, setSelectedCard] = useState<ServiceCardDesign>(serviceCardTemplates[0]);
  const [isDesignModalOpen, setIsDesignModalOpen] = useState(false);
  const [isDownloaded, setIsDownloaded] = useState(false);

  const handleSpeakHighlights = () => {
    speakGuidance(selectedCard.guaranteeText, currentLang === 'te' ? 'te' : 'en');
  };

  const handleDownload = () => {
    playAlertChime('confirm');
    setIsDownloaded(true);
    setTimeout(() => setIsDownloaded(false), 2500);
  };

  const handleShareWhatsApp = () => {
    playAlertChime('pop');
    const msg = encodeURIComponent(`Hi! Here is my verified Crafto Service Visiting Card: ${userName || 'Narendra'} (${selectedCard.tradeTitle}). Call: ${userPhone || '9966191813'}. Available today!`);
    window.open(`https://wa.me/?text=${msg}`, '_blank');
  };

  return (
    <div className="relative rounded-3xl overflow-hidden shadow-lg border border-purple-200 dark:border-purple-900/60 bg-white dark:bg-slate-900">
      {/* Category header */}
      <div className="bg-purple-50/80 dark:bg-purple-950/40 px-3.5 py-2.5 border-b border-purple-100 dark:border-purple-900/40 flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[11px] font-extrabold text-purple-900 dark:text-purple-200">
            {selectedCard.categoryTag}
          </span>
          <span className="text-purple-400">·</span>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            Verified Visiting Card
          </span>
        </div>

        <button
          onClick={() => setIsDesignModalOpen(!isDesignModalOpen)}
          className="bg-white dark:bg-slate-800 text-purple-900 dark:text-purple-200 hover:bg-purple-100 px-3 py-1 rounded-full text-xs font-bold shadow-xs border border-purple-200 dark:border-purple-700 flex items-center gap-1 transition-all"
        >
          <Palette className="w-3.5 h-3.5 text-purple-600" />
          <span>{t.changeDesign}</span>
        </button>
      </div>

      {/* Main Visiting Card Canvas */}
      <div className={`relative p-5 sm:p-7 bg-gradient-to-br ${selectedCard.bgGradient} text-white min-h-[220px] flex flex-col justify-between overflow-hidden`}>
        {/* Decorative background grid pattern */}
        <div className="absolute inset-0 opacity-10 pointer-events-none bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-white via-transparent to-black" />

        {/* Top Service Details */}
        <div className="relative z-10 max-w-xl mx-auto text-center space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-white/20 backdrop-blur-md text-[10px] sm:text-xs font-bold tracking-wide">
            <ShieldCheck className="w-3.5 h-3.5 text-amber-300" />
            <span>100% Verified Local Home Specialist</span>
          </div>

          <h3 
            className="text-lg sm:text-xl md:text-2xl font-black tracking-tight leading-snug drop-shadow-md text-amber-200"
            style={{ textWrap: 'balance' }}
          >
            {selectedCard.tradeTitle}
          </h3>

          <p className="text-xs sm:text-sm text-white/90 font-medium max-w-lg mx-auto">
            {selectedCard.guaranteeText}
          </p>

          {/* Skill tags */}
          <div className="pt-1 flex flex-wrap items-center justify-center gap-1.5">
            {selectedCard.skills.map((skill, i) => (
              <span key={i} className="text-[10px] bg-black/30 border border-white/20 px-2 py-0.5 rounded-md font-semibold">
                ✓ {skill}
              </span>
            ))}
            <button
              onClick={handleSpeakHighlights}
              className="px-2 py-0.5 rounded-md bg-amber-400 text-purple-950 text-[10px] font-extrabold flex items-center gap-1 hover:bg-amber-300 transition-colors"
              title="Listen audio details"
            >
              <Volume2 className="w-3 h-3" />
              <span>వినండి</span>
            </button>
          </div>
        </div>

        {/* Bottom Watermark Overlay: Worker Identity, Direct Contact & Share */}
        <div className="relative z-10 mt-6 pt-3 border-t border-white/20 flex flex-wrap items-center justify-between gap-3 bg-black/40 backdrop-blur-md p-3 rounded-2xl">
          <div className="flex items-center gap-3">
            <div className="relative">
              <img
                src={userAvatar || '/public/assets/aistudio/image_13d09e7d.png'}
                alt={userName}
                className="w-11 h-11 sm:w-12 sm:h-12 rounded-full object-cover ring-2 ring-amber-400 bg-purple-900 shadow-md"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80';
                }}
              />
              <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-white" />
            </div>

            <div className="leading-tight">
              <div className="font-extrabold text-sm sm:text-base text-white flex items-center gap-1">
                <span>{userName || 'NARENDRA'}</span>
                <ShieldCheck className="w-4 h-4 text-amber-300 inline" />
              </div>
              <div className="text-[11px] text-amber-200 font-bold tabular-nums">
                📞 {userPhone || '9966191813'} · Direct Call & WhatsApp
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleShareWhatsApp}
              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1 shadow-xs transition-all active:scale-95"
              title="Share Visiting Card on WhatsApp"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Share</span>
            </button>

            <button
              onClick={handleDownload}
              className="px-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white text-xs font-bold flex items-center gap-1 transition-all active:scale-95"
              title="Save Card"
            >
              {isDownloaded ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Download className="w-3.5 h-3.5" />}
              <span>{isDownloaded ? 'Saved!' : 'Save Card'}</span>
            </button>

            <button
              onClick={onEditProfileClick}
              className="px-3 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-purple-950 text-xs font-extrabold flex items-center gap-1 shadow-md transition-all active:scale-95"
            >
              <span>Edit Details</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Design Selector Drawer */}
      {isDesignModalOpen && (
        <div className="p-4 bg-purple-50 dark:bg-purple-950/70 border-t border-purple-200 dark:border-purple-800 space-y-3">
          <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
            <span>సర్వీస్ విజిటింగ్ కార్డ్ డిజైన్ ఎంచుకోండి (Choose Card Trade)</span>
            <button
              onClick={() => setIsDesignModalOpen(false)}
              className="text-purple-600 dark:text-purple-400 hover:underline"
            >
              Close
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
            {serviceCardTemplates.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setSelectedCard(item);
                  playAlertChime('pop');
                  setIsDesignModalOpen(false);
                }}
                className={`p-3 rounded-2xl text-left border transition-all ${
                  selectedCard.id === item.id
                    ? 'border-purple-600 bg-white dark:bg-slate-900 shadow-md ring-2 ring-purple-500/20'
                    : 'border-slate-200 dark:border-slate-800 hover:border-purple-300 bg-white/70 dark:bg-slate-800'
                }`}
              >
                <div className={`h-6 rounded-lg bg-gradient-to-r ${item.bgGradient} mb-2 flex items-center px-2 text-[9px] text-white font-bold`}>
                  {item.categoryTag}
                </div>
                <div className="font-bold text-xs text-slate-900 dark:text-white line-clamp-1">
                  {item.tradeTitle}
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">
                  {item.tagline}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
