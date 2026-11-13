import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, X, Volume2, Sparkles, Check, ArrowRight } from 'lucide-react';
import { AppLanguage, translations } from '../utils/translations';

interface VoiceSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSearch: (transcript: string) => void;
  currentLang: AppLanguage;
}

export const VoiceSearchModal: React.FC<VoiceSearchModalProps> = ({
  isOpen,
  onClose,
  onSearch,
  currentLang,
}) => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [speechSupported, setSpeechSupported] = useState(true);
  const [statusMessage, setStatusMessage] = useState('');
  const recognitionRef = useRef<any>(null);

  const t = translations[currentLang] || translations.te;

  useEffect(() => {
    if (!isOpen) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
      setIsListening(false);
      setTranscript('');
      return;
    }

    // Check SpeechRecognition support
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setSpeechSupported(false);
      setStatusMessage(currentLang === 'te'
        ? 'మీ బ్రౌజర్‌లో ఆడియో మైక్ సెర్చ్ అందుబాటులో లేదు. కింద ఉన్న బటన్‌ను ఎంచుకోండి.'
        : currentLang === 'hi'
        ? 'माइक्रोफ़ोन इस ब्राउज़र में उपलब्ध नहीं है। नीचे दिए गए विकल्पों में से चुनें।'
        : 'Microphone not supported in this browser. Please tap an option below.');
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = currentLang === 'te' ? 'te-IN' : currentLang === 'hi' ? 'hi-IN' : 'en-IN';

      recognition.onstart = () => {
        setIsListening(true);
        setStatusMessage(t.listening);
      };

      recognition.onresult = (event: any) => {
        let currentText = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          currentText += event.results[i][0].transcript;
        }
        setTranscript(currentText);
      };

      recognition.onerror = (event: any) => {
        console.warn('Speech recognition error:', event.error);
        setIsListening(false);
        setStatusMessage(currentLang === 'te'
          ? 'వాయిస్ గుర్తించలేకపోయాము. దయచేసి మళ్ళీ మాట్లాడండి లేదా కింద ఉన్న బటన్ నొక్కండి.'
          : 'Could not catch that. Please speak again or tap a suggestion.');
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.warn('Voice search start error:', err);
      setIsListening(false);
      setSpeechSupported(false);
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
    };
  }, [isOpen, currentLang]);

  const toggleListening = () => {
    if (!recognitionRef.current) return;
    if (isListening) {
      try {
        recognitionRef.current.stop();
      } catch {}
      setIsListening(false);
    } else {
      try {
        setTranscript('');
        recognitionRef.current.lang = currentLang === 'te' ? 'te-IN' : currentLang === 'hi' ? 'hi-IN' : 'en-IN';
        recognitionRef.current.start();
        setIsListening(true);
      } catch {}
    }
  };

  const handleApplySearch = (query: string) => {
    if (!query.trim()) return;
    onSearch(query.trim());
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full p-6 text-center space-y-6 shadow-2xl relative overflow-hidden">

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Title */}
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-100 dark:bg-purple-950/60 text-[#4A148C] dark:text-purple-300 text-xs font-bold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>{currentLang === 'te' ? 'తెలుగు వాయిస్ శోధన' : currentLang === 'hi' ? 'आवाज से खोजें' : 'Voice Search'}</span>
          </div>
          <h3 className="text-lg font-black text-slate-900 dark:text-white">
            {t.speakNow}
          </h3>
          <p className="text-xs text-slate-500">
            {statusMessage || t.tapToSpeak}
          </p>
        </div>

        {/* Animated Mic Button */}
        <div className="py-4 flex justify-center">
          <div className="relative">
            {isListening && (
              <>
                <div className="absolute inset-0 rounded-full bg-[#4A148C]/20 animate-ping" />
                <div className="absolute -inset-3 rounded-full bg-amber-400/20 animate-pulse" />
              </>
            )}
            <button
              onClick={toggleListening}
              className={`relative z-10 w-20 h-20 rounded-full flex items-center justify-center shadow-xl transition-all duration-300 ${
                isListening
                  ? 'bg-red-500 hover:bg-red-600 text-white scale-110'
                  : 'bg-[#4A148C] hover:bg-purple-900 text-white'
              }`}
            >
              {isListening ? (
                <Mic className="w-8 h-8 animate-pulse text-white" />
              ) : (
                <MicOff className="w-8 h-8 text-white/80" />
              )}
            </button>
          </div>
        </div>

        {/* Realtime Spoken Transcript */}
        <div className="min-h-12 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-center">
          {transcript ? (
            <div className="space-y-2 w-full">
              <span className="text-sm font-extrabold text-[#4A148C] dark:text-purple-300">
                "{transcript}"
              </span>
              <div className="flex justify-center">
                <button
                  onClick={() => handleApplySearch(transcript)}
                  className="px-4 py-1.5 rounded-full bg-[#4A148C] hover:bg-purple-900 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm"
                >
                  <span>{currentLang === 'te' ? 'ఇప్పుడే శోధించండి' : 'Search Now'}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <span className="text-xs text-slate-400 italic">
              {isListening
                ? (currentLang === 'te' ? '🎙️ మాట్లాడుతున్నారు... వింటున్నాము...' : '🎙️ Listening... speak clearly...')
                : t.tapToSpeak}
            </span>
          )}
        </div>

        {/* Quick Suggestion Chips (Tap to Search) */}
        <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="text-[11px] font-bold text-slate-500 text-left">
            {currentLang === 'te' ? 'లేదా ఈ సర్వీస్‌పై నొక్కండి:' : 'Or tap a popular service:'}
          </div>
          <div className="flex flex-wrap gap-1.5 justify-start">
            {t.voiceSuggestions.map((item) => (
              <button
                key={item}
                onClick={() => handleApplySearch(item)}
                className="px-3 py-1 rounded-full text-xs font-semibold bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/40 dark:hover:bg-purple-900/60 text-[#4A148C] dark:text-purple-300 border border-purple-200 dark:border-purple-800 transition"
              >
                {item}
              </button>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
};
