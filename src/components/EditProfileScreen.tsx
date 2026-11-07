import React, { useState } from 'react';
import SafeImage from './SafeImage';
import { 
  ArrowLeft, 
  Crown, 
  Lock, 
  Plus, 
  Check, 
  Camera, 
  Phone, 
  MapPin, 
  Building, 
  Share2, 
  FileText,
  ShieldCheck,
  CheckCircle2
} from 'lucide-react';
import { UserProfile, LanguageCode } from '../types';
import { translations } from '../utils/translations';
import { playAlertChime } from '../utils/audio';

interface EditProfileScreenProps {
  userProfile: UserProfile;
  currentLang: LanguageCode;
  onBack: () => void;
  onSave: (updated: UserProfile) => void;
}

const presetAvatars = [
  '/assets/optimized/profile-avatar-256.webp',
  'https://images.unsplash.com/photo-1540569014015-19a7be504e3a?auto=format&fit=crop&w=250&q=80',
  'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=250&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=250&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=250&q=80',
];

export const EditProfileScreen: React.FC<EditProfileScreenProps> = ({
  userProfile,
  currentLang,
  onBack,
  onSave,
}) => {
  const t = translations[currentLang];
  const [activeTab, setActiveTab] = useState<'personal' | 'business'>('business');

  // Business state
  const [businessName, setBusinessName] = useState(userProfile.providerDetails?.businessName || 'Narendra Pro Services');
  const [businessDesc, setBusinessDesc] = useState(userProfile.title || 'Cybersecurity & Verified Smart Services Pro');
  const [phone, setPhone] = useState(userProfile.phone || '9966191813');
  const [address, setAddress] = useState(userProfile.providerDetails?.address || 'Madhapur, Hitech City, Hyderabad');
  const [socialMedia, setSocialMedia] = useState('wa.me/919966191813');
  const [orgDetails, setOrgDetails] = useState('Crafto Verified Hub');

  // Personal state
  const [selectedAvatar, setSelectedAvatar] = useState(userProfile.avatar || presetAvatars[0]);
  const [personalName, setPersonalName] = useState(userProfile.name || 'NARENDRA');
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSave = () => {
    playAlertChime('confirm');
    const updated: UserProfile = {
      ...userProfile,
      name: personalName,
      phone,
      avatar: selectedAvatar,
      title: businessDesc,
      providerDetails: {
        ...userProfile.providerDetails,
        businessName,
        trade: userProfile.providerDetails?.trade || 'electrician',
        category: userProfile.providerDetails?.category || 'home',
        experience: userProfile.providerDetails?.experience || 10,
        hourlyRate: userProfile.providerDetails?.hourlyRate || 500,
        address,
      }
    };
    onSave(updated);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onBack();
    }, 1200);
  };

  return (
    <div className="bg-slate-50 dark:bg-slate-950 min-h-screen pb-24 text-slate-900 dark:text-slate-100">
      {/* Top Bar matching Crafto 'Edit Design' header */}
      <div className="sticky top-0 z-30 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="font-bold text-base sm:text-lg text-slate-900 dark:text-white">
            {currentLang === 'te' ? 'డిజైన్ సవరణ (Edit Design)' : 'Edit Design'}
          </h2>
        </div>

        {savedSuccess && (
          <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
            <CheckCircle2 className="w-4 h-4" />
            <span>Saved!</span>
          </span>
        )}
      </div>

      <div className="max-w-xl mx-auto px-4 py-4 space-y-5">
        {/* Top Segmented Tabs: PERSONAL and BUSINESS Create (Ref image 2 & 3) */}
        <div className="p-1 bg-purple-100/70 dark:bg-slate-800 rounded-2xl flex items-center">
          <button
            onClick={() => setActiveTab('personal')}
            className={`flex-1 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all text-center ${
              activeTab === 'personal'
                ? 'bg-white dark:bg-purple-900 text-[#4A148C] dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            {t.personal}
          </button>

          <button
            onClick={() => setActiveTab('business')}
            className={`flex-1 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'business'
                ? 'bg-[#4A148C] text-white shadow-md'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <span>{t.business}</span>
            <span className="bg-red-500 text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded-full">
              Create
            </span>
          </button>
        </div>

        {/* --- BUSINESS TAB CONTENT (Matches image_ff275046.png) --- */}
        {activeTab === 'business' && (
          <div className="space-y-4">
            {/* Section 1: Business Details */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">
                {t.businessDetails}
              </h3>

              {/* Business Name Field with Golden Crown & Lock */}
              <div className="relative border border-slate-200 dark:border-slate-700 rounded-xl p-3 flex items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-800/40">
                <div className="w-7 h-7 rounded-full bg-amber-500/20 text-amber-600 flex items-center justify-center shrink-0">
                  <Crown className="w-4 h-4 fill-amber-500 text-amber-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block">
                    {t.registerBusinessName}
                  </label>
                  <input
                    type="text"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    className="w-full text-xs font-bold text-slate-900 dark:text-white bg-transparent outline-hidden"
                  />
                </div>
                <Lock className="w-4 h-4 text-slate-400 shrink-0" />
              </div>

              {/* Business Description Field with Golden Crown & Lock */}
              <div className="relative border border-slate-200 dark:border-slate-700 rounded-xl p-3 flex items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-800/40">
                <div className="w-7 h-7 rounded-full bg-amber-500/20 text-amber-600 flex items-center justify-center shrink-0">
                  <Crown className="w-4 h-4 fill-amber-500 text-amber-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block">
                    {t.registerDescription}
                  </label>
                  <input
                    type="text"
                    value={businessDesc}
                    onChange={(e) => setBusinessDesc(e.target.value)}
                    className="w-full text-xs font-bold text-slate-900 dark:text-white bg-transparent outline-hidden"
                  />
                </div>
                <Lock className="w-4 h-4 text-slate-400 shrink-0" />
              </div>
            </div>

            {/* Section 2: Choose Logo (లోగోను ఎంచుకోండి) */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">
                {t.chooseLogo}
              </h3>

              <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-3 flex items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-800/40">
                <div className="w-7 h-7 rounded-full bg-amber-500/20 text-amber-600 flex items-center justify-center shrink-0">
                  <Crown className="w-4 h-4 fill-amber-500 text-amber-500" />
                </div>
                <div className="flex-1">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    {t.addLogo}
                  </span>
                </div>
                <Lock className="w-4 h-4 text-slate-400 shrink-0" />
              </div>
            </div>

            {/* Section 3: Contact Details (సంప్రదింపు వివరాలు) */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">
                {t.contactDetails}
              </h3>

              {/* Phone */}
              <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-3 flex items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-800/40">
                <div className="w-7 h-7 rounded-full bg-amber-500/20 text-amber-600 flex items-center justify-center shrink-0">
                  <Crown className="w-4 h-4 fill-amber-500 text-amber-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block">
                    {t.registerPhone}
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full text-xs font-bold text-slate-900 dark:text-white bg-transparent outline-hidden"
                  />
                </div>
                <Lock className="w-4 h-4 text-slate-400 shrink-0" />
              </div>

              {/* Address */}
              <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-3 flex items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-800/40">
                <div className="w-7 h-7 rounded-full bg-amber-500/20 text-amber-600 flex items-center justify-center shrink-0">
                  <Crown className="w-4 h-4 fill-amber-500 text-amber-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block">
                    {t.registerAddress}
                  </label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full text-xs font-bold text-slate-900 dark:text-white bg-transparent outline-hidden"
                  />
                </div>
                <Lock className="w-4 h-4 text-slate-400 shrink-0" />
              </div>

              {/* Social Media */}
              <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-3 flex items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-800/40">
                <div className="w-7 h-7 rounded-full bg-amber-500/20 text-amber-600 flex items-center justify-center shrink-0">
                  <Crown className="w-4 h-4 fill-amber-500 text-amber-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block">
                    {t.socialMedia}
                  </label>
                  <input
                    type="text"
                    value={socialMedia}
                    onChange={(e) => setSocialMedia(e.target.value)}
                    className="w-full text-xs font-bold text-slate-900 dark:text-white bg-transparent outline-hidden"
                  />
                </div>
                <Lock className="w-4 h-4 text-slate-400 shrink-0" />
              </div>
            </div>
          </div>
        )}

        {/* --- PERSONAL TAB CONTENT (Matches image_ade4099a.png) --- */}
        {activeTab === 'personal' && (
          <div className="space-y-4">
            {/* Choose Photo (ఫోటోను ఎంచుకోండి) */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">
                {t.choosePhoto}
              </h3>

              <div className="flex items-center gap-3 overflow-x-auto pb-2 no-scrollbar">
                {/* Upload Button (+) */}
                <button
                  type="button"
                  onClick={() => alert('Photo upload trigger activated')}
                  className="w-14 h-14 rounded-full border-2 border-dashed border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center text-slate-500 hover:border-purple-500 hover:text-purple-600 transition-colors shrink-0"
                >
                  <Plus className="w-5 h-5" />
                  <span className="text-[9px] font-bold mt-0.5">{t.uploadPhoto}</span>
                </button>

                {/* Preset Avatars with Selected Tick */}
                {presetAvatars.map((avatar, idx) => {
                  const isSelected = selectedAvatar === avatar;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setSelectedAvatar(avatar)}
                      className={`relative w-14 h-14 rounded-full shrink-0 transition-transform ${
                        isSelected ? 'ring-3 ring-purple-600 scale-105' : 'ring-1 ring-slate-200 dark:ring-slate-700'
                      }`}
                    >
                      <SafeImage category="general"
                        src={avatar}
                        alt="face"
                        className="w-full h-full rounded-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80';
                        }}
                      />
                      {isSelected && (
                        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-4 h-4 bg-emerald-500 text-white rounded-full flex items-center justify-center shadow-xs">
                          <Check className="w-2.5 h-2.5 stroke-[3]" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Personal Details */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">
                వ్యక్తిగత వివరాలు (Personal Info)
              </h3>

              <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-3 flex items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-800/40">
                <div className="w-7 h-7 rounded-full bg-amber-500/20 text-amber-600 flex items-center justify-center shrink-0">
                  <Crown className="w-4 h-4 fill-amber-500 text-amber-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block">
                    పూర్తి పేరు / Full Name
                  </label>
                  <input
                    type="text"
                    value={personalName}
                    onChange={(e) => setPersonalName(e.target.value)}
                    className="w-full text-xs font-bold text-slate-900 dark:text-white bg-transparent outline-hidden"
                  />
                </div>
                <Lock className="w-4 h-4 text-slate-400 shrink-0" />
              </div>

              {/* Organization details */}
              <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-3 flex items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-800/40">
                <div className="w-7 h-7 rounded-full bg-amber-500/20 text-amber-600 flex items-center justify-center shrink-0">
                  <Crown className="w-4 h-4 fill-amber-500 text-amber-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block">
                    {t.organizationDetails}
                  </label>
                  <input
                    type="text"
                    value={orgDetails}
                    onChange={(e) => setOrgDetails(e.target.value)}
                    className="w-full text-xs font-bold text-slate-900 dark:text-white bg-transparent outline-hidden"
                  />
                </div>
                <Lock className="w-4 h-4 text-slate-400 shrink-0" />
              </div>
            </div>
          </div>
        )}

        {/* Bottom Sticky Save Button (matches reference image save button) */}
        <div className="pt-2">
          <button
            type="button"
            onClick={handleSave}
            className="w-full py-3.5 rounded-2xl bg-[#4A148C] hover:bg-purple-900 text-white font-extrabold text-sm shadow-lg shadow-purple-900/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            <ShieldCheck className="w-4 h-4 text-amber-400" />
            <span>{t.save}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
