import React, { useState } from 'react';
import { 
  Star, 
  MapPin, 
  Phone, 
  Calendar, 
  Play, 
  Pause, 
  ShieldCheck, 
  Clock, 
  Briefcase,
  CheckCircle,
  MessageCircle
} from 'lucide-react';
import { ServiceProvider, LanguageCode } from '../types';
import { translations } from '../utils/translations';
import { speakGuidance, playAlertChime } from '../utils/audio';

interface ProviderCardProps {
  provider: ServiceProvider;
  currentLang: LanguageCode;
  onBookNow: (provider: ServiceProvider) => void;
}

export const ProviderCard: React.FC<ProviderCardProps> = ({
  provider,
  currentLang,
  onBookNow,
}) => {
  const t = translations[currentLang];
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  const handleToggleVoice = () => {
    if (isPlayingAudio) {
      setIsPlayingAudio(false);
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    } else {
      setIsPlayingAudio(true);
      playAlertChime('pop');
      if (provider.voiceTranscription) {
        speakGuidance(provider.voiceTranscription, currentLang === 'te' ? 'te' : 'en');
        setTimeout(() => setIsPlayingAudio(false), (provider.voiceDurationSec || 8) * 1000);
      } else {
        speakGuidance(`Hello, I am ${provider.name}, verified specialist.`, currentLang);
        setTimeout(() => setIsPlayingAudio(false), 3000);
      }
    }
  };

  const handleCall = () => {
    playAlertChime('pop');
    window.location.href = `tel:${provider.phone}`;
  };

  const handleWhatsApp = () => {
    playAlertChime('pop');
    const msg = encodeURIComponent(`Hi ${provider.name}, I found your profile on Crafto Services. Are you available for service today?`);
    window.open(`https://wa.me/91${provider.phone}?text=${msg}`, '_blank');
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 sm:p-5 shadow-xs hover:shadow-md transition-all duration-200 flex flex-col justify-between gap-4">
      {/* Top Section: Avatar, Name, Rating, Distance */}
      <div className="flex items-start gap-3.5">
        <div className="relative shrink-0">
          <img
            src={provider.avatar}
            alt={provider.name}
            referrerPolicy="no-referrer"
            className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl object-cover ring-2 ring-purple-100 dark:ring-purple-900 bg-slate-100"
            onError={(e) => {
              (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80';
            }}
          />
          {provider.isVerified && (
            <div 
              className="absolute -bottom-1 -right-1 bg-amber-400 text-purple-950 p-0.5 rounded-full ring-2 ring-white dark:ring-slate-900"
              title="Crafto Verified Professional"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1">
            <h4 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white truncate">
              {provider.name}
            </h4>
            <div className="flex items-center gap-1 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 px-1.5 py-0.5 rounded-md text-[11px] font-bold text-amber-800 dark:text-amber-300 shrink-0">
              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
              <span className="tabular-nums">{provider.rating}</span>
              <span className="text-slate-400 font-normal">({provider.reviewCount})</span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-1">
            <span className="flex items-center gap-1 font-semibold text-purple-700 dark:text-purple-300">
              <MapPin className="w-3 h-3 text-purple-500" />
              <span className="tabular-nums">{provider.distanceKm} km</span>
            </span>
            <span>·</span>
            <span className="truncate">{provider.locationName}</span>
          </div>

          {/* Experience & Jobs Completed */}
          <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-600 dark:text-slate-400 font-medium">
            <span className="flex items-center gap-1">
              <Briefcase className="w-3 h-3 text-slate-400" />
              <span className="tabular-nums">{provider.experienceYears} yrs exp</span>
            </span>
            <span>·</span>
            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <CheckCircle className="w-3 h-3" />
              <span className="tabular-nums">{provider.completedJobs} jobs done</span>
            </span>
          </div>
        </div>
      </div>

      {/* Voice Bio Player Strip (Crucial for uneducated workers & clients) */}
      <div className="bg-purple-50 dark:bg-purple-950/40 rounded-2xl p-2.5 flex items-center justify-between gap-2 border border-purple-100 dark:border-purple-900/50">
        <button
          onClick={handleToggleVoice}
          className="flex items-center gap-2 group text-left"
          title="Listen to worker voice message"
        >
          <div className="w-8 h-8 rounded-full bg-[#4A148C] text-white flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform shrink-0">
            {isPlayingAudio ? (
              <Pause className="w-4 h-4 fill-current text-white animate-pulse" />
            ) : (
              <Play className="w-4 h-4 fill-current text-amber-300 ml-0.5" />
            )}
          </div>
          <div>
            <div className="text-[11px] font-bold text-purple-950 dark:text-purple-200">
              {isPlayingAudio ? 'వాయిస్ ప్లే అవుతోంది...' : t.listenVoiceBio}
            </div>
            <div className="text-[10px] text-purple-700 dark:text-purple-400 font-medium">
              {provider.voiceDurationSec ? `${provider.voiceDurationSec}s voice note` : 'Spoken intro available'}
            </div>
          </div>
        </button>

        {provider.availableToday && (
          <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300 px-2 py-0.5 rounded-full whitespace-nowrap">
            ● {t.availableNow}
          </span>
        )}
      </div>

      {/* Bio text excerpt */}
      <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed">
        {provider.bio}
      </p>

      {/* Pricing & Booking Footer */}
      <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
        <div>
          <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
            {t.hourlyRateLabel}
          </div>
          <div className="text-base font-extrabold text-slate-900 dark:text-white tabular-nums">
            ₹{provider.hourlyRate}
            <span className="text-xs font-normal text-slate-500">/hr</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={handleCall}
            className="p-2 sm:px-3 sm:py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1 transition-colors"
            title={`Call ${provider.phone}`}
          >
            <Phone className="w-3.5 h-3.5 text-emerald-600" />
            <span className="hidden sm:inline">{t.callNow}</span>
          </button>

          <button
            onClick={handleWhatsApp}
            className="p-2 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center justify-center transition-colors"
            title="Chat on WhatsApp"
          >
            <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
          </button>

          <button
            onClick={() => onBookNow(provider)}
            className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#4A148C] to-purple-700 hover:from-purple-900 hover:to-purple-800 text-white text-xs font-extrabold shadow-sm active:scale-95 transition-all flex items-center gap-1"
          >
            <Calendar className="w-3.5 h-3.5 text-amber-300" />
            <span>{t.bookService}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
