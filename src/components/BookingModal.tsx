import React, { useState } from 'react';
import { 
  X, 
  Calendar, 
  Clock, 
  MapPin, 
  Mic, 
  Square, 
  Play, 
  Pause, 
  ShieldCheck, 
  Check, 
  Phone, 
  User,
  Sparkles
} from 'lucide-react';
import { ServiceProvider, LanguageCode, BookingRequest } from '../types';
import { translations } from '../utils/translations';
import { playAlertChime, speakGuidance } from '../utils/audio';

interface BookingModalProps {
  provider: ServiceProvider;
  currentLang: LanguageCode;
  onClose: () => void;
  onConfirmBooking: (booking: BookingRequest) => void;
}

export const BookingModal: React.FC<BookingModalProps> = ({
  provider,
  currentLang,
  onClose,
  onConfirmBooking,
}) => {
  const t = translations[currentLang];

  const [date, setDate] = useState('Today, Immediate');
  const [timeSlot, setTimeSlot] = useState('Morning (9 AM - 12 PM)');
  const [customerName, setCustomerName] = useState('Lakshmi Rao');
  const [customerPhone, setCustomerPhone] = useState('9849012345');
  const [customerAddress, setCustomerAddress] = useState('Flat 402, Green Meadows, Jubilee Hills');
  const [hoursEstimated, setHoursEstimated] = useState(2);

  // Voice instructions for the worker
  const [isRecordingNote, setIsRecordingNote] = useState(false);
  const [hasRecordedNote, setHasRecordedNote] = useState(false);
  const [voiceNoteText, setVoiceNoteText] = useState('');
  const [isPlayingNote, setIsPlayingNote] = useState(false);

  const estimatedTotal = provider.hourlyRate * hoursEstimated;

  const handleRecordVoiceNote = () => {
    if (isRecordingNote) {
      setIsRecordingNote(false);
      setHasRecordedNote(true);
      playAlertChime('confirm');
      setVoiceNoteText(
        currentLang === 'te'
          ? 'మా హాల్‌లో 2 గోడలకు రాయల్ ప్లే రంగులు వేయాలి. అలాగే సీలింగ్ వాటర్‌ప్రూఫింగ్ కావాలి.'
          : 'Need 2 walls painted with texture and waterproofing on the ceiling. Please bring putty.'
      );
    } else {
      setIsRecordingNote(true);
      playAlertChime('pop');
      setTimeout(() => {
        // Auto stop after 5s if not stopped
        setIsRecordingNote(false);
        setHasRecordedNote(true);
      }, 5000);
    }
  };

  const handlePlayVoiceNote = () => {
    if (isPlayingNote) {
      setIsPlayingNote(false);
    } else {
      setIsPlayingNote(true);
      speakGuidance(voiceNoteText || 'Service request voice instructions recorded.', currentLang);
      setTimeout(() => setIsPlayingNote(false), 3500);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    playAlertChime('confirm');

    const newBooking: BookingRequest = {
      id: `book-${Date.now()}`,
      providerId: provider.id,
      providerName: provider.name,
      serviceType: provider.trade,
      customerName,
      customerPhone,
      customerAddress,
      scheduledTime: `${date} · ${timeSlot}`,
      voiceInstructionText: voiceNoteText,
      status: 'pending',
      createdAt: 'Just now',
      estimatedCost: estimatedTotal
    };

    onConfirmBooking(newBooking);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden my-4">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#4A148C] to-purple-800 text-white p-4 sm:p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src={provider.avatar}
              alt={provider.name}
              className="w-11 h-11 rounded-2xl object-cover ring-2 ring-amber-400 bg-purple-900"
            />
            <div>
              <div className="text-[11px] text-amber-300 font-bold uppercase tracking-wider">
                Booking Specialist
              </div>
              <h3 className="font-extrabold text-base sm:text-lg">
                {provider.name}
              </h3>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/20 text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Rate & Distance bar */}
          <div className="bg-purple-50 dark:bg-purple-950/50 p-3 rounded-2xl flex items-center justify-between text-xs border border-purple-200 dark:border-purple-800">
            <div>
              <span className="text-slate-500 dark:text-slate-400">Rate: </span>
              <span className="font-extrabold text-purple-900 dark:text-purple-200 tabular-nums">
                ₹{provider.hourlyRate}/hr
              </span>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400">Distance: </span>
              <span className="font-extrabold text-purple-900 dark:text-purple-200 tabular-nums">
                {provider.distanceKm} km away
              </span>
            </div>
            <div className="text-emerald-600 font-bold">
              ✓ Direct Booking
            </div>
          </div>

          {/* Time & Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-purple-600" />
                <span>తేదీ / Date</span>
              </label>
              <select
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full mt-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white outline-hidden"
              >
                <option value="Today, Immediate">Today (తక్షణమే / Immediate)</option>
                <option value="Tomorrow Morning">Tomorrow (రేపు ఉదయం)</option>
                <option value="This Weekend">This Weekend (శని/ఆది)</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-purple-600" />
                <span>సమయం / Time Slot</span>
              </label>
              <select
                value={timeSlot}
                onChange={(e) => setTimeSlot(e.target.value)}
                className="w-full mt-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white outline-hidden"
              >
                <option value="Morning (9 AM - 12 PM)">Morning (9 AM - 12 PM)</option>
                <option value="Afternoon (1 PM - 4 PM)">Afternoon (1 PM - 4 PM)</option>
                <option value="Evening (5 PM - 8 PM)">Evening (5 PM - 8 PM)</option>
              </select>
            </div>
          </div>

          {/* Customer Details */}
          <div className="space-y-3 pt-1">
            <div>
              <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                <User className="w-3 h-3 text-purple-600" />
                <span>మీ పేరు / Customer Name</span>
              </label>
              <input
                type="text"
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full mt-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 dark:text-white outline-hidden focus:border-purple-500"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                <Phone className="w-3 h-3 text-purple-600" />
                <span>ఫోన్ నంబర్ / Mobile Number</span>
              </label>
              <input
                type="tel"
                required
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className="w-full mt-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 dark:text-white outline-hidden focus:border-purple-500"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                <MapPin className="w-3 h-3 text-purple-600" />
                <span>చిరునామా / Service Address & Landmark</span>
              </label>
              <textarea
                rows={2}
                required
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
                className="w-full mt-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 dark:text-white outline-hidden focus:border-purple-500"
              />
            </div>
          </div>

          {/* Voice Instruction Feature for Worker (Special Crafto accessibility feature) */}
          <div className="border border-purple-200 dark:border-purple-800 rounded-2xl p-3.5 bg-purple-50/50 dark:bg-purple-950/30 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-purple-900 dark:text-purple-300 flex items-center gap-1">
                <Mic className="w-3.5 h-3.5 text-purple-600" />
                <span>{t.voiceInstructionPrompt}</span>
              </span>
              <span className="text-[10px] text-purple-600 font-semibold">Optional</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRecordVoiceNote}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                  isRecordingNote
                    ? 'bg-red-600 text-white animate-pulse'
                    : 'bg-[#4A148C] text-white hover:bg-purple-800'
                }`}
              >
                {isRecordingNote ? <Square className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5 text-amber-300" />}
                <span>{isRecordingNote ? 'Recording...' : 'Record Voice Instruction'}</span>
              </button>

              {hasRecordedNote && (
                <button
                  type="button"
                  onClick={handlePlayVoiceNote}
                  className="px-3 py-1.5 rounded-xl border border-purple-300 text-purple-900 dark:text-purple-200 text-xs font-bold flex items-center gap-1"
                >
                  {isPlayingNote ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  <span>{isPlayingNote ? 'Playing...' : 'Review'}</span>
                </button>
              )}
            </div>

            {hasRecordedNote && voiceNoteText && (
              <p className="text-[11px] text-purple-800 dark:text-purple-300 italic bg-white/70 dark:bg-slate-900 p-2 rounded-lg border border-purple-100 dark:border-purple-900">
                "{voiceNoteText}"
              </p>
            )}
          </div>

          {/* Pricing summary */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div>
              <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                Estimated Total
              </div>
              <div className="text-xl font-extrabold text-slate-900 dark:text-white tabular-nums">
                ₹{estimatedTotal}
                <span className="text-xs font-normal text-slate-500"> (est. {hoursEstimated} hrs)</span>
              </div>
            </div>

            <button
              type="submit"
              className="py-3 px-6 rounded-2xl bg-[#4A148C] hover:bg-purple-900 text-white font-extrabold text-xs sm:text-sm shadow-lg shadow-purple-900/30 active:scale-95 transition-all flex items-center gap-2"
            >
              <ShieldCheck className="w-4 h-4 text-amber-400" />
              <span>Confirm & Send Alert</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
