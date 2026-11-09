import React from 'react';
import SafeImage from './SafeImage';
import { 
  Search, 
  PlusCircle, 
  Bell, 
  Moon, 
  Sun, 
  Globe, 
  Smartphone, 
  Laptop, 
  SlidersHorizontal,
  Volume2
} from 'lucide-react';
import { LanguageCode, PlatformView, ActiveTab, RealtimeNotification } from '../types';
import { translations } from '../utils/translations';
import { speakGuidance } from '../utils/audio';

interface HeaderProps {
  currentLang: LanguageCode;
  onSelectLang: (lang: LanguageCode) => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  platform: PlatformView;
  onSelectPlatform: (platform: PlatformView) => void;
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  notifications: RealtimeNotification[];
  onOpenNotifications: () => void;
  onOpenVoiceRegister: () => void;
  userAvatar: string;
  userName: string;
}

export const Header: React.FC<HeaderProps> = ({
  currentLang,
  onSelectLang,
  darkMode,
  onToggleDarkMode,
  platform,
  onSelectPlatform,
  activeTab,
  onSelectTab,
  searchQuery,
  onSearchChange,
  notifications,
  onOpenNotifications,
  onOpenVoiceRegister,
  userAvatar,
  userName,
}) => {
  const t = translations[currentLang];
  const unreadCount = notifications.filter(n => !n.read).length;

  const handleAudioHelp = () => {
    const helpText = currentLang === 'te' 
      ? 'క్రాఫ్టో సర్వీసెస్ కు స్వాగతం. ఇక్కడ మీరు ఎలక్ట్రీషియన్, పెయింటర్, టైలర్ మరియు డాకర్ సేవలను సులభంగా పొందవచ్చు లేదా మీ వాయిస్ ద్వారా రిజిస్టర్ చేసుకోవచ్చు.'
      : currentLang === 'hi'
      ? 'क्राफ्टो सर्विसेज में आपका स्वागत है। यहां आप इलेक्ट्रीशियन, पेंटर, टाइलर और अन्य कारीगरों को बुक कर सकते हैं या अपनी आवाज से प्रोफाइल बना सकते हैं।'
      : 'Welcome to Crafto Services. Book trusted electricians, painters, tilers and dockers, or register your profile effortlessly using simple voice recording.';
    speakGuidance(helpText, currentLang);
  };

  return (
    <header className="sticky top-0 z-40 bg-[#4A148C] dark:bg-purple-950 text-white shadow-md transition-colors">
      {/* Top utility bar: Platform preview toggle & Dark mode */}
      <div className="bg-[#38006b] dark:bg-black/50 px-3 py-1.5 flex items-center justify-between text-xs border-b border-purple-800/40">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          <span className="text-purple-300 font-medium hidden sm:inline text-[11px]">Platform:</span>
          <button
            onClick={() => onSelectPlatform('android')}
            className={`px-2.5 py-1 rounded text-[11px] font-semibold flex items-center gap-1 transition-all ${
              platform === 'android'
                ? 'bg-purple-500 text-white shadow-xs'
                : 'text-purple-200 hover:bg-purple-900/60'
            }`}
            title="Preview as Android Mobile Frame"
          >
            <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
            <span>Android</span>
          </button>
          <button
            onClick={() => onSelectPlatform('ios')}
            className={`px-2.5 py-1 rounded text-[11px] font-semibold flex items-center gap-1 transition-all ${
              platform === 'ios'
                ? 'bg-purple-500 text-white shadow-xs'
                : 'text-purple-200 hover:bg-purple-900/60'
            }`}
            title="Preview as iOS iPhone Frame"
          >
            <Smartphone className="w-3.5 h-3.5 text-sky-400" />
            <span>iOS</span>
          </button>
          <button
            onClick={() => onSelectPlatform('dashboard')}
            className={`px-2.5 py-1 rounded text-[11px] font-semibold flex items-center gap-1 transition-all ${
              platform === 'dashboard'
                ? 'bg-purple-500 text-white shadow-xs'
                : 'text-purple-200 hover:bg-purple-900/60'
            }`}
            title="Full Responsive Dashboard View"
          >
            <Laptop className="w-3.5 h-3.5 text-amber-400" />
            <span>Dashboard</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* Audio helper for accessibility */}
          <button
            onClick={handleAudioHelp}
            className="p-1 rounded-full text-purple-200 hover:text-white hover:bg-purple-800/60 transition-colors flex items-center gap-1"
            title="Listen Spoken Help Guide"
          >
            <Volume2 className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
            <span className="hidden md:inline text-[10px] text-amber-200">Audio Guide</span>
          </button>

          {/* Language pill */}
          <div className="flex items-center gap-1 bg-purple-900/70 rounded-md px-1.5 py-0.5">
            <Globe className="w-3 h-3 text-purple-300" />
            <select
              value={currentLang}
              aria-label="Language selection"
              onChange={(e) => onSelectLang(e.target.value as LanguageCode)}
              className="bg-transparent text-white text-[11px] font-medium outline-hidden cursor-pointer"
            >
              <option value="te" className="text-slate-900">తెలుగు (Telugu)</option>
              <option value="en" className="text-slate-900">English</option>
              <option value="hi" className="text-slate-900">हिन्दी (Hindi)</option>
              <option value="ta" className="text-slate-900">தமிழ் (Tamil)</option>
              <option value="kn" className="text-slate-900">ಕನ್ನಡ (Kannada)</option>
            </select>
          </div>

          {/* Dark Mode */}
          <button
            type="button"
            onClick={onToggleDarkMode}
            aria-pressed={darkMode}
            aria-label={darkMode ? t.lightMode : t.darkMode}
            className="p-1 rounded-md text-purple-200 hover:text-white hover:bg-purple-800 transition-colors"
            title={darkMode ? t.lightMode : t.darkMode}
          >
            {darkMode ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-purple-300" />}
          </button>
        </div>
      </div>

      {/* Main Crafto Header: Search + Create Button + Profile */}
      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between gap-2 sm:gap-4">
        {/* Brand / Logo */}
        <div 
          onClick={() => onSelectTab('home')}
          className="flex items-center gap-2 cursor-pointer shrink-0"
        >
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-400 to-amber-200 flex items-center justify-center shadow-md">
            <span className="font-extrabold text-[#4A148C] text-lg">C</span>
          </div>
          <div className="hidden xs:block leading-tight">
            <div className="font-extrabold tracking-tight text-white text-base sm:text-lg">Crafto</div>
            <div className="text-[10px] text-purple-200 font-medium">Services & Voice</div>
          </div>
        </div>

        {/* Search Bar - Crafto Styled */}
        <div className="flex-1 max-w-xl mx-1 sm:mx-2 relative">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-purple-300 absolute left-3 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={t.searchPlaceholder}
              className="w-full bg-white/15 hover:bg-white/20 focus:bg-white text-white focus:text-slate-900 placeholder:text-purple-200 focus:placeholder:text-slate-400 rounded-full pl-9 pr-4 py-2 text-xs sm:text-sm transition-all outline-hidden border border-purple-400/30 focus:border-white shadow-inner"
            />
          </div>
        </div>

        {/* Right Action Cluster */}
        <div className="flex items-center gap-2 shrink-0">
          {/* + Create Profile Button (Crafto signature) */}
          <button
            onClick={onOpenVoiceRegister}
            className="bg-white text-[#4A148C] hover:bg-purple-50 active:scale-95 font-bold text-xs sm:text-sm px-3 sm:px-4 py-1.5 sm:py-2 rounded-full shadow-md flex items-center gap-1.5 transition-all shrink-0 border border-purple-200"
            title="Post worker profile using voice or simple photo"
          >
            <PlusCircle className="w-4 h-4 text-purple-700" />
            <span className="whitespace-nowrap">{t.createButton}</span>
          </button>

          {/* Notifications Alert Bell */}
          <button
            onClick={onOpenNotifications}
            className="relative p-2 rounded-full hover:bg-purple-800/80 transition-colors text-white"
            title={t.realtimeAlerts}
          >
            <Bell className="w-5 h-5 text-white" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse border-2 border-[#4A148C]">
                {unreadCount}
              </span>
            )}
          </button>

          {/* User Profile Mini Thumbnail */}
          <button
            onClick={() => onSelectTab('profile')}
            className={`relative rounded-full ring-2 transition-all p-0.5 ${
              activeTab === 'profile' ? 'ring-amber-400' : 'ring-purple-400/60 hover:ring-white'
            }`}
            title={userName}
          >
            <SafeImage category="general"
              src="/assets/optimized/profile-avatar-256.webp"
              alt={userName}
              referrerPolicy="no-referrer"
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-full object-cover bg-purple-900"
              sizes="32px"
              priority
              onError={(e) => {
                // Fallback avatar if local image needs initial load
                (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80';
              }}
            />
          </button>
        </div>
      </div>
    </header>
  );
};
