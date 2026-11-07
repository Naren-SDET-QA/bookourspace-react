import React, { useState } from 'react';
import SafeImage from './SafeImage';
import { 
  ArrowLeft, 
  HelpCircle, 
  Languages, 
  MapPin, 
  Clock, 
  Info, 
  Receipt, 
  LogOut, 
  Moon, 
  Sun,
  ChevronRight,
  ShieldCheck,
  Check
} from 'lucide-react';
import { UserProfile, LanguageCode } from '../types';
import { translations } from '../utils/translations';
import { playAlertChime } from '../utils/audio';

interface SettingsScreenProps {
  userProfile: UserProfile;
  currentLang: LanguageCode;
  onSelectLang: (lang: LanguageCode) => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onBack: () => void;
  onUpdateRadius?: (km: number) => void;
  onUpdateHours?: (hours: string) => void;
}

const supportedLanguages: { code: LanguageCode; name: string; nativeName: string }[] = [
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు' },
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்' },
  { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ' },
];

const radiusOptions = [5, 10, 15, 25, 40];

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  userProfile,
  currentLang,
  onSelectLang,
  darkMode,
  onToggleDarkMode,
  onBack,
  onUpdateRadius,
  onUpdateHours,
}) => {
  const t = translations[currentLang];
  const [isLangModalOpen, setIsLangModalOpen] = useState(false);
  const [isRadiusModalOpen, setIsRadiusModalOpen] = useState(false);
  const [showInvoicesModal, setShowInvoicesModal] = useState(false);

  return (
    <div className="bg-slate-50 dark:bg-slate-950 min-h-screen pb-24 text-slate-900 dark:text-slate-100">
      {/* Top Bar matching reference image 5 */}
      <div className="sticky top-0 z-30 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="font-bold text-base sm:text-lg text-slate-900 dark:text-white">
            {t.settings}
          </h2>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 py-5 space-y-5">
        {/* User Card matching image_f62ae511.png */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center gap-4">
          <div className="relative">
            <SafeImage category="general"
              src={userProfile.avatar || '/assets/optimized/profile-avatar-256.webp'}
              alt={userProfile.name}
              className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl object-cover ring-2 ring-purple-100 bg-purple-900"
              onError={(e) => {
                (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80';
              }}
            />
            <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-white dark:border-slate-900" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="font-extrabold text-base sm:text-lg text-slate-900 dark:text-white tracking-wide">
                {userProfile.name}
              </h3>
              <ShieldCheck className="w-4 h-4 text-purple-600" />
            </div>
            <div className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 font-medium tabular-nums mt-0.5">
              {userProfile.phone}
            </div>
          </div>
        </div>

        {/* Other Settings Box (Faithful to image_f62ae511.png layout) */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="p-4 sm:p-5 pb-2">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              {t.otherSettings}
            </h4>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {/* Help & Support */}
            <button
              onClick={() => {
                playAlertChime('pop');
                window.dispatchEvent(new Event('bos-open-help'));
              }}
              className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <HelpCircle className="w-5 h-5 text-slate-700 dark:text-slate-300" />
                <span className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200">
                  {currentLang === 'te' ? 'సహాయం & మద్దతు (Help & Support)' : 'Help & Support'}
                </span>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </button>

            {/* Change Language */}
            <button
              onClick={() => setIsLangModalOpen(true)}
              className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <Languages className="w-5 h-5 text-slate-700 dark:text-slate-300" />
                <div>
                  <span className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200">
                    {t.changeLanguage}
                  </span>
                  <span className="ml-2 text-xs font-normal text-purple-600 dark:text-purple-400">
                    ({supportedLanguages.find(l => l.code === currentLang)?.nativeName})
                  </span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </button>

            {/* Service Work Radius (Replaces religious preference) */}
            <button
              onClick={() => setIsRadiusModalOpen(true)}
              className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <MapPin className="w-5 h-5 text-slate-700 dark:text-slate-300" />
                <div className="min-w-0 pr-2">
                  <span className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200 block truncate">
                    {t.serviceRadius}
                  </span>
                  <span className="text-[11px] text-slate-400 block truncate">
                    Within {userProfile.serviceRadiusKm || 12} km of your location
                  </span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
            </button>

            {/* Operating Hours */}
            <div className="px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-slate-700 dark:text-slate-300" />
                <div>
                  <span className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200 block">
                    {t.operatingHours}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {userProfile.operatingHours || '8:00 AM - 9:00 PM (All 7 Days)'}
                  </span>
                </div>
              </div>
            </div>

            {/* About Us */}
            <button
              onClick={() => {
                playAlertChime('pop');
                alert('Crafto Local Services:\nDedicated local home services platform connecting nearby painters, tilers, dockers, electricians, plumbers, and technicians with direct booking and voice-assisted registration.');
              }}
              className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <Info className="w-5 h-5 text-slate-700 dark:text-slate-300" />
                <span className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200">
                  {t.aboutUs}
                </span>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </button>

            {/* Previous Invoices */}
            <button
              onClick={() => setShowInvoicesModal(true)}
              className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <Receipt className="w-5 h-5 text-slate-700 dark:text-slate-300" />
                <span className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200">
                  {t.previousInvoices}
                </span>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </button>

            {/* Dark Mode Toggle */}
            <div className="px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {darkMode ? <Moon className="w-5 h-5 text-purple-400" /> : <Sun className="w-5 h-5 text-amber-500" />}
                <span className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200">
                  {darkMode ? t.darkMode : t.lightMode}
                </span>
              </div>

              <button
                type="button"
                onClick={onToggleDarkMode}
                aria-pressed={darkMode}
                aria-label={darkMode ? t.lightMode : t.darkMode}
                className={`w-12 h-6 rounded-full transition-colors relative p-0.5 ${
                  darkMode ? 'bg-purple-600' : 'bg-slate-300'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-transform ${
                    darkMode ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Logout */}
            <button
              onClick={() => {
                playAlertChime('pop');
                alert('Session reset. You are in guest mode.');
              }}
              className="w-full px-5 py-4 flex items-center justify-between hover:bg-red-50 dark:hover:bg-red-950/20 text-red-600 dark:text-red-400 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <LogOut className="w-5 h-5" />
                <span className="text-xs sm:text-sm font-semibold">
                  {t.logout}
                </span>
              </div>
            </button>
          </div>
        </div>

        {/* Footer info (matches image_f62ae511.png bottom) */}
        <div className="text-center pt-4 space-y-2 text-[11px] text-slate-400">
          <div className="font-semibold tracking-wider">V 11.7.9 · Local Services Edition</div>
          <div className="flex items-center justify-center gap-3 text-slate-500">
            <span className="hover:underline cursor-pointer">Privacy Policy</span>
            <span>·</span>
            <span className="hover:underline cursor-pointer">Refund and Cancellation</span>
            <span>·</span>
            <span className="hover:underline cursor-pointer">Terms & Condition</span>
          </div>
        </div>
      </div>

      {/* Language Selection Modal */}
      {isLangModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 w-full max-w-sm shadow-xl space-y-4 border border-slate-200 dark:border-slate-800">
            <h3 className="font-extrabold text-base text-slate-900 dark:text-white">
              {t.changeLanguage}
            </h3>

            <div className="space-y-2">
              {supportedLanguages.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => {
                    onSelectLang(lang.code);
                    playAlertChime('pop');
                    setIsLangModalOpen(false);
                  }}
                  className={`w-full p-3 rounded-2xl flex items-center justify-between text-left border transition-all ${
                    currentLang === lang.code
                      ? 'border-purple-600 bg-purple-50 dark:bg-purple-950/50 font-bold text-purple-900 dark:text-purple-200 ring-2 ring-purple-500/30'
                      : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <div>
                    <div className="text-sm">{lang.nativeName}</div>
                    <div className="text-[11px] text-slate-400">{lang.name}</div>
                  </div>
                  {currentLang === lang.code && <Check className="w-5 h-5 text-purple-600" />}
                </button>
              ))}
            </div>

            <button
              onClick={() => setIsLangModalOpen(false)}
              className="w-full py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Radius Preference Modal */}
      {isRadiusModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 w-full max-w-sm shadow-xl space-y-4 border border-slate-200 dark:border-slate-800">
            <h3 className="font-extrabold text-base text-slate-900 dark:text-white">
              {t.serviceRadius}
            </h3>
            <p className="text-xs text-slate-500">
              Select how far you want to discover service specialists:
            </p>

            <div className="space-y-2">
              {radiusOptions.map((km) => (
                <button
                  key={km}
                  onClick={() => {
                    if (onUpdateRadius) onUpdateRadius(km);
                    playAlertChime('pop');
                    setIsRadiusModalOpen(false);
                  }}
                  className={`w-full p-3 rounded-2xl text-left border text-xs font-bold transition-all flex items-center justify-between ${
                    (userProfile.serviceRadiusKm || 12) === km
                      ? 'border-purple-600 bg-purple-50 dark:bg-purple-950/40 text-purple-900 dark:text-purple-200'
                      : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span>Up to {km} km radius</span>
                  {(userProfile.serviceRadiusKm || 12) === km && <Check className="w-4 h-4 text-purple-600" />}
                </button>
              ))}
            </div>

            <button
              onClick={() => setIsRadiusModalOpen(false)}
              className="w-full py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Invoices Modal */}
      {showInvoicesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 w-full max-w-sm shadow-xl space-y-4 border border-slate-200 dark:border-slate-800">
            <h3 className="font-extrabold text-base text-slate-900 dark:text-white">
              {t.previousInvoices}
            </h3>
            <div className="space-y-2 text-xs">
              <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl flex items-center justify-between">
                <div>
                  <div className="font-bold">INV-2026-0894</div>
                  <div className="text-slate-500">Wall Painting Services · Oct 18</div>
                </div>
                <span className="font-extrabold text-emerald-600">₹1,250 (Paid)</span>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl flex items-center justify-between">
                <div>
                  <div className="font-bold">INV-2026-0742</div>
                  <div className="text-slate-500">Electrician Fuse Repair · Sep 30</div>
                </div>
                <span className="font-extrabold text-emerald-600">₹450 (Paid)</span>
              </div>
            </div>
            <button
              onClick={() => setShowInvoicesModal(false)}
              className="w-full py-2.5 rounded-xl bg-purple-600 text-white text-xs font-bold"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
