import React, { useState } from 'react';
import { 
  Settings as SettingsIcon, 
  Camera, 
  UserCheck, 
  Briefcase, 
  HelpCircle, 
  X, 
  Download, 
  Share2, 
  CheckCircle,
  ExternalLink,
  ShieldCheck,
  Phone
} from 'lucide-react';
import { UserProfile, LanguageCode } from '../types';
import { translations } from '../utils/translations';
import { playAlertChime } from '../utils/audio';

interface ProfileScreenProps {
  userProfile: UserProfile;
  currentLang: LanguageCode;
  onOpenSettings: () => void;
  onEditProfile: () => void;
  onCreateBusiness: () => void;
}

export const ProfileScreen: React.FC<ProfileScreenProps> = ({
  userProfile,
  currentLang,
  onOpenSettings,
  onEditProfile,
  onCreateBusiness,
}) => {
  const t = translations[currentLang];
  const [activeSubTab, setActiveSubTab] = useState<'quotes' | 'downloads'>('quotes');
  const [serviceFlyerCards, setServiceFlyerCards] = useState([
    {
      id: 'flyer-1',
      title: 'Electrical & Inverter Emergency Specialist',
      tag: 'ఎలక్ట్రికల్ (Electrician)',
      date: 'Oct 24, 2026',
      bgGradient: 'from-[#4A148C] via-purple-900 to-indigo-950',
      text: '24/7 అత్యవసర వైరింగ్, MCB ట్రిప్పింగ్, ఫ్యాన్ & గీజర్ మరమ్మత్తులు. 15 నిమిషాల్లో ప్రత్యక్ష స్పందన.'
    },
    {
      id: 'flyer-2',
      title: 'Wall Texture Painting & Waterproofing Pro',
      tag: 'పెయింటింగ్ (Painter)',
      date: 'Oct 23, 2026',
      bgGradient: 'from-amber-600 via-orange-700 to-amber-900',
      text: 'రాయల్ ప్లే టెక్స్చర్, 2BHK/3BHK వాల్ పుట్టీ & రూఫ్ వాటర్‌ప్రూఫింగ్. 100% క్లీన్ ఫినిషింగ్.'
    },
    {
      id: 'flyer-3',
      title: 'Vitrified Tiling & Italian Marble Laying',
      tag: 'టైలర్ & మార్బుల్ (Tiler)',
      date: 'Oct 22, 2026',
      bgGradient: 'from-emerald-700 via-teal-800 to-slate-900',
      text: 'బాత్‌రూమ్ స్లోప్ లెవలింగ్, గ్రానైట్ ఫిక్సింగ్ & ఎపాక్సీ గ్రౌటింగ్. వాటర్ లీకేజ్ లేకుండా పక్కా పని.'
    },
    {
      id: 'flyer-4',
      title: 'Luggage Shifting & Docker Porter Team',
      tag: 'డాకర్స్ & హమాలీ (Docker)',
      date: 'Oct 20, 2026',
      bgGradient: 'from-orange-600 via-rose-700 to-slate-900',
      text: 'భారీ బీరువా, ఫ్రిజ్, వాషింగ్ మెషిన్ స్క్రాచ్ పడకుండా సురక్షితంగా పై అంతస్తులకు మోసే క్రూ.'
    }
  ]);

  const handleDeleteCard = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    playAlertChime('pop');
    setServiceFlyerCards(prev => prev.filter(c => c.id !== id));
  };

  return (
    <div className="bg-slate-50 dark:bg-slate-950 min-h-screen pb-24 text-slate-900 dark:text-slate-100">
      {/* Top Header matching Reference image 4 */}
      <div className="sticky top-0 z-30 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-3.5 flex items-center justify-between">
        <h2 className="font-extrabold text-base sm:text-lg text-slate-900 dark:text-white flex items-center gap-2">
          <span>{currentLang === 'te' ? 'మీ ప్రొఫైల్' : 'My Profile'}</span>
        </h2>

        <button
          onClick={onOpenSettings}
          className="flex items-center gap-1 text-slate-700 dark:text-slate-300 hover:text-purple-700 p-1.5 rounded-full transition-colors"
          title={t.settings}
        >
          <SettingsIcon className="w-5 h-5 text-slate-600 dark:text-slate-300" />
          <span className="text-xs font-semibold hidden xs:inline">{t.settings}</span>
        </button>
      </div>

      <div className="max-w-xl mx-auto px-4 py-6 space-y-6">
        {/* User Avatar with Camera Badge */}
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="relative">
            <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full ring-4 ring-purple-600/30 overflow-hidden shadow-lg bg-purple-900">
              <img
                src={userProfile.avatar || '/public/assets/aistudio/image_13d09e7d.png'}
                alt={userProfile.name}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=250&q=80';
                }}
              />
            </div>
            {/* Camera badge as seen in Crafto ref */}
            <button
              onClick={onEditProfile}
              className="absolute bottom-0 right-1 w-8 h-8 rounded-full bg-[#4A148C] text-white flex items-center justify-center ring-2 ring-white dark:ring-slate-900 shadow-md hover:bg-purple-700 transition-colors"
              title="Change Profile Photo"
            >
              <Camera className="w-4 h-4 text-amber-300" />
            </button>
          </div>

          <div className="space-y-1 max-w-md">
            <div className="flex items-center justify-center gap-1.5">
              <h3 className="font-black text-xl sm:text-2xl text-slate-900 dark:text-white tracking-wide">
                {userProfile.name}
              </h3>
              <ShieldCheck className="w-5 h-5 text-purple-600" />
            </div>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 font-medium leading-relaxed">
              {userProfile.title}
            </p>
            <div className="text-xs font-bold text-purple-700 dark:text-purple-300 tabular-nums">
              📞 {userProfile.phone} · Active Service Specialist
            </div>
          </div>
        </div>

        {/* Action Buttons Cluster (Faithful to image_13d09e7d.png) */}
        <div className="space-y-2.5">
          {/* Button 1: Edit Personal Profile (Filled Royal Purple) */}
          <button
            onClick={onEditProfile}
            className="w-full py-3 px-4 rounded-2xl bg-[#4A148C] hover:bg-purple-900 text-white font-bold text-xs sm:text-sm shadow-md flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
          >
            <UserCheck className="w-4 h-4" />
            <span>{t.editPersonalProfile}</span>
          </button>

          {/* Button 2: Create Business Profile (Soft Lavender/Purple) */}
          <button
            onClick={onCreateBusiness}
            className="w-full py-3 px-4 rounded-2xl bg-purple-100 hover:bg-purple-200 dark:bg-purple-900/40 dark:hover:bg-purple-900/60 text-[#4A148C] dark:text-purple-200 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
          >
            <Briefcase className="w-4 h-4" />
            <span>{t.createBusinessProfile}</span>
          </button>

          {/* Button 3: Help and Suggestions (Outline Purple) */}
          <button
            onClick={() => {
              playAlertChime('pop');
              alert('Crafto Local Services Helpline: 1800-425-9999\nWhatsApp: +91 9966191813\nOur support team helps you receive local bookings and manage worker verification.');
            }}
            className="w-full py-3 px-4 rounded-2xl border border-purple-300 dark:border-purple-800 text-[#4A148C] dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950/40 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
          >
            <HelpCircle className="w-4 h-4" />
            <span>{t.helpAndSuggestions}</span>
          </button>
        </div>

        {/* Sub-Tabs: Created Service Visiting Cards & Downloads */}
        <div className="border-t border-slate-200 dark:border-slate-800 pt-3">
          <div className="flex border-b border-slate-200 dark:border-slate-800">
            <button
              onClick={() => setActiveSubTab('quotes')}
              className={`flex-1 py-3 text-xs sm:text-sm font-bold text-center border-b-2 transition-all ${
                activeSubTab === 'quotes'
                  ? 'border-[#4A148C] text-[#4A148C] dark:border-purple-400 dark:text-purple-300'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {t.createdQuotes} ({serviceFlyerCards.length})
            </button>

            <button
              onClick={() => setActiveSubTab('downloads')}
              className={`flex-1 py-3 text-xs sm:text-sm font-bold text-center border-b-2 transition-all ${
                activeSubTab === 'downloads'
                  ? 'border-[#4A148C] text-[#4A148C] dark:border-purple-400 dark:text-purple-300'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {t.downloads} (18)
            </button>
          </div>

          {/* Grid of created service cards with X close button (Ref image 4) */}
          {activeSubTab === 'quotes' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4">
              {serviceFlyerCards.map((card) => (
                <div
                  key={card.id}
                  className={`relative rounded-2xl p-4 bg-gradient-to-br ${card.bgGradient} text-white shadow-sm flex flex-col justify-between min-h-[150px] overflow-hidden group`}
                >
                  {/* (X) Close button */}
                  <button
                    onClick={(e) => handleDeleteCard(card.id, e)}
                    className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/50 hover:bg-black/80 text-white flex items-center justify-center transition-colors z-10"
                    title="Remove visiting card"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>

                  <div>
                    <span className="text-[9px] font-bold uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded-full">
                      {card.tag}
                    </span>
                    <h5 className="font-bold text-xs sm:text-sm mt-2 line-clamp-2 leading-tight">
                      {card.title}
                    </h5>
                    <p className="text-[11px] text-white/90 line-clamp-2 mt-1 leading-relaxed">
                      {card.text}
                    </p>
                  </div>

                  <div className="text-[10px] text-white/70 pt-2 border-t border-white/20 flex items-center justify-between">
                    <span>{card.date}</span>
                    <span className="text-amber-300 font-bold">Verified Card</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="pt-6 text-center space-y-2">
              <Download className="w-8 h-8 text-purple-600 mx-auto" />
              <div className="font-bold text-xs text-slate-700 dark:text-slate-300">
                18 Downloads Ready
              </div>
              <p className="text-[11px] text-slate-500">
                All downloaded visiting cards and service invoices are stored offline.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
