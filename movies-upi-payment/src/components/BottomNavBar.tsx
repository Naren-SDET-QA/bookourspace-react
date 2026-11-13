import React from 'react';
import { Home, Palette, Mic, User, Settings, Bell } from 'lucide-react';
import { ActiveTab, LanguageCode } from '../types';
import { translations } from '../utils/translations';

interface BottomNavBarProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  onOpenVoiceRegister: () => void;
  currentLang: LanguageCode;
  unreadAlertsCount: number;
}

export const BottomNavBar: React.FC<BottomNavBarProps> = ({
  activeTab,
  onSelectTab,
  onOpenVoiceRegister,
  currentLang,
  unreadAlertsCount,
}) => {
  const t = translations[currentLang];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 shadow-lg">
      <div className="max-w-md mx-auto grid grid-cols-5 items-center h-16 px-1">
        {/* Tab 1: Home */}
        <button
          onClick={() => onSelectTab('home')}
          className={`flex flex-col items-center justify-center h-full transition-colors relative ${
            activeTab === 'home'
              ? 'text-[#4A148C] dark:text-purple-400 font-extrabold'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <Home className={`w-5 h-5 ${activeTab === 'home' ? 'stroke-[2.5]' : 'stroke-[1.8]'}`} />
          <span className="text-[10px] mt-1 leading-none tracking-tight">Home</span>
          {activeTab === 'home' && (
            <span className="absolute bottom-1 w-1 h-1 rounded-full bg-[#4A148C] dark:bg-purple-400" />
          )}
        </button>

        {/* Tab 2: Edit Design */}
        <button
          onClick={() => onSelectTab('edit_design')}
          className={`flex flex-col items-center justify-center h-full transition-colors relative ${
            activeTab === 'edit_design'
              ? 'text-[#4A148C] dark:text-purple-400 font-extrabold'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <Palette className={`w-5 h-5 ${activeTab === 'edit_design' ? 'stroke-[2.5]' : 'stroke-[1.8]'}`} />
          <span className="text-[10px] mt-1 leading-none tracking-tight truncate max-w-[64px]">
            {currentLang === 'te' ? 'సవరణ' : 'Design'}
          </span>
          {activeTab === 'edit_design' && (
            <span className="absolute bottom-1 w-1 h-1 rounded-full bg-[#4A148C] dark:bg-purple-400" />
          )}
        </button>

        {/* Tab 3: Center Mic / Voice Post */}
        <div className="flex flex-col items-center justify-center -mt-5">
          <button
            onClick={onOpenVoiceRegister}
            className="w-13 h-13 rounded-full bg-gradient-to-tr from-[#4A148C] to-purple-600 text-white flex items-center justify-center shadow-lg shadow-purple-900/40 ring-4 ring-white dark:ring-slate-900 active:scale-95 transition-transform"
            title="Voice Register Profile"
          >
            <Mic className="w-6 h-6 text-amber-300" />
          </button>
          <span className="text-[10px] font-bold text-purple-900 dark:text-purple-300 mt-1">
            {t.tapToSpeak.split(' ')[0]}
          </span>
        </div>

        {/* Tab 4: Profile */}
        <button
          onClick={() => onSelectTab('profile')}
          className={`flex flex-col items-center justify-center h-full transition-colors relative ${
            activeTab === 'profile'
              ? 'text-[#4A148C] dark:text-purple-400 font-extrabold'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <User className={`w-5 h-5 ${activeTab === 'profile' ? 'stroke-[2.5]' : 'stroke-[1.8]'}`} />
          <span className="text-[10px] mt-1 leading-none tracking-tight">
            {currentLang === 'te' ? 'ప్రొఫైల్' : 'Profile'}
          </span>
          {activeTab === 'profile' && (
            <span className="absolute bottom-1 w-1 h-1 rounded-full bg-[#4A148C] dark:bg-purple-400" />
          )}
        </button>

        {/* Tab 5: Settings */}
        <button
          onClick={() => onSelectTab('settings')}
          className={`flex flex-col items-center justify-center h-full transition-colors relative ${
            activeTab === 'settings'
              ? 'text-[#4A148C] dark:text-purple-400 font-extrabold'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <Settings className={`w-5 h-5 ${activeTab === 'settings' ? 'stroke-[2.5]' : 'stroke-[1.8]'}`} />
          <span className="text-[10px] mt-1 leading-none tracking-tight">
            {t.settings}
          </span>
          {activeTab === 'settings' && (
            <span className="absolute bottom-1 w-1 h-1 rounded-full bg-[#4A148C] dark:bg-purple-400" />
          )}
        </button>
      </div>
    </nav>
  );
};
