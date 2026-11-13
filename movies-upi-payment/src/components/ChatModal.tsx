import React, { useState, useEffect, useRef } from 'react';
import { X, Send, ShieldCheck, Phone, CheckCircle2, MessageSquare, Sparkles } from 'lucide-react';
import { MarketplaceListing, ChatMessage } from '../types/marketplace';
import {
  AppLanguage,
  translations,
  getListingTitle,
  getProviderDisplayName,
  getPriceUnitDisplayName
} from '../utils/translations';
import { useMarketplace } from '../context/MarketplaceContext';

interface ChatModalProps {
  listing: MarketplaceListing | null;
  onClose: () => void;
  onBookNow?: (listing: MarketplaceListing) => void;
  currentLang?: AppLanguage;
}

export const ChatModal: React.FC<ChatModalProps> = ({
  listing,
  onClose,
  onBookNow,
  currentLang = 'te'
}) => {
  const { sendEnquiry, supabaseProfile, supabaseUser } = useMarketplace();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputVal, setInputVal] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const t = translations[currentLang] || translations.te;
  const distKm = listing?.distanceKm ?? listing?.location?.distanceKm ?? 2.5;
  const displayTitle = listing ? getListingTitle(listing, currentLang) : '';
  const displayProviderName = listing ? getProviderDisplayName(listing.providerNameTe || listing.providerName, currentLang, distKm) : '';
  const displayPriceUnit = listing ? getPriceUnitDisplayName(listing.priceUnitTe || listing.priceUnit, currentLang) : '';

  useEffect(() => {
    if (listing) {
      const initialGreeting = currentLang === 'te'
        ? `నమస్కారం! "${displayTitle}" సర్వీస్ గురించి సంప్రదించినందుకు ధన్యవాదాలు. మీకు ఏ సమయంలో సర్వీస్ కావాలి?`
        : currentLang === 'hi'
        ? `नमस्ते! "${displayTitle}" सेवा के लिए धन्यवाद। आपको किस समय सेवा चाहिए?`
        : `Hello! Thanks for reaching out regarding "${displayTitle}". How can I help you today?`;

      setMessages([
        {
          id: 'msg-1',
          threadId: listing.id,
          senderRole: 'provider',
          senderName: displayProviderName,
          text: initialGreeting,
          timestamp: currentLang === 'te' ? 'ఇప్పుడే' : 'Just now'
        }
      ]);
    }
  }, [listing, currentLang, displayTitle, displayProviderName]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  if (!listing) return null;

  const quickReplies = currentLang === 'te' ? [
    'ఈరోజు అందుబాటులో ఉన్నారా?',
    'మొత్తం ఛార్జీ ఎంత అవుతుంది?',
    'నా నంబర్‌కు కాల్ చేయండి',
    'నేను ఇప్పుడే బుక్ చేయాలనుకుంటున్నాను'
  ] : currentLang === 'hi' ? [
    'क्या आप आज उपलब्ध हैं?',
    'कुल खर्च कितना होगा?',
    'मुझे कॉल करें',
    'मैं बुक करना चाहता हूं'
  ] : [
    'Are you available today?',
    'What will be the total price?',
    'Please call me',
    'I want to book now'
  ];

  const handleSend = (textToSend?: string) => {
    const text = textToSend || inputVal;
    if (!text.trim()) return;

    const senderFullName =
      supabaseProfile?.full_name ||
      supabaseUser?.user_metadata?.full_name ||
      supabaseUser?.email ||
      (currentLang === 'te' ? 'రమేష్ కుమార్' : 'Ramesh Kumar');
    const senderPhone = supabaseProfile?.phone || '9849012345';

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      threadId: listing.id,
      senderRole: 'customer',
      senderName: currentLang === 'te' ? 'మీరు' : 'You',
      text: text.trim(),
      timestamp: currentLang === 'te' ? 'ఇప్పుడే' : 'Just now'
    };

    setMessages(prev => [...prev, userMsg]);
    setInputVal('');

    // Persist enquiry to MarketplaceContext & Supabase RLS (`public.enquiries`)
    sendEnquiry(listing.id, `[Live Chat] ${text.trim()}`, senderFullName, senderPhone);

    // Simulate provider instant response in Telugu / English
    setIsTyping(true);
    setTimeout(() => {
      setIsTyping(false);
      const responses = currentLang === 'te' ? [
        `అవును, మేము ఈరోజే అందుబాటులో ఉన్నాము! మీరు యాప్‌లో బుక్ చేయండి లేదా నేను 5 నిమిషాల్లో మీ నంబర్‌కు కాల్ చేస్తాను.`,
        `ఖచ్చితంగా, మా సర్వీస్ ఛార్జీ ₹${listing.price.toLocaleString('en-IN')}${displayPriceUnit}. మేము 100% నమ్మకమైన మరియు నాణ్యమైన సర్వీస్ అందిస్తాము.`,
        `ధన్యవాదాలు! మీ చిరునామా తెలపండి, మా నిపుణుడు వెంటనే బయలుదేరుతారు.`
      ] : [
        `Yes, we are available today! You can book or I can call you on your registered number in 5 minutes.`,
        `Sure, our rate is ₹${listing.price}${displayPriceUnit}. We provide 100% genuine service and verified warranty.`,
        `Thank you for confirming! What time works best for you?`
      ];

      const reply = responses[Math.floor(Math.random() * responses.length)];
      setMessages(prev => [
        ...prev,
        {
          id: `msg-${Date.now()}`,
          threadId: listing.id,
          senderRole: 'provider',
          senderName: displayProviderName,
          text: reply,
          timestamp: currentLang === 'te' ? 'ఇప్పుడే' : 'Just now'
        }
      ]);
    }, 1000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:justify-end bg-black/60 backdrop-blur-xs p-0 sm:p-4">
      <div className="w-full sm:max-w-md h-[560px] max-h-[90vh] bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between overflow-hidden animate-in slide-in-from-bottom sm:slide-in-from-right duration-200">

        {/* Header */}
        <div className="p-3.5 bg-[#4A148C] text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <img
                src={listing.providerAvatar}
                alt={displayProviderName}
                className="w-10 h-10 rounded-full object-cover ring-2 ring-white/50 bg-white"
              />
              <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-400 rounded-full border-2 border-[#4A148C]" />
            </div>
            <div>
              <div className="flex items-center gap-1 font-bold text-xs sm:text-sm">
                <span>{displayProviderName}</span>
                <ShieldCheck className="w-3.5 h-3.5 text-amber-300" />
              </div>
              <div className="text-[10px] text-purple-200 line-clamp-1 max-w-[180px]">
                {displayTitle}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {onBookNow && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onBookNow(listing);
                }}
                className="px-2.5 py-1 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-[10px] cursor-pointer transition"
              >
                {currentLang === 'te' ? 'బుక్ చేయండి' : 'Book Now'}
              </button>
            )}
            <a
              href={`tel:${listing.providerPhone}`}
              className="p-1.5 rounded-full hover:bg-white/10 text-white"
              title="Call provider"
            >
              <Phone className="w-4 h-4" />
            </a>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-white/10 text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Messages Stream */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50 dark:bg-slate-950/60 text-xs">
          {messages.map((msg) => {
            const isMe = msg.senderRole === 'customer';
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
              >
                <span className="text-[10px] text-slate-400 mb-0.5 px-1">
                  {msg.senderName} · {msg.timestamp}
                </span>
                <div
                  className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 shadow-xs leading-relaxed ${
                    isMe
                      ? 'bg-purple-600 text-white rounded-tr-xs'
                      : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-tl-xs'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            );
          })}

          {isTyping && (
            <div className="flex items-center gap-1 text-[11px] text-slate-400 italic">
              <span className="w-1.5 h-1.5 bg-purple-600 rounded-full animate-bounce" />
              <span className="w-1.5 h-1.5 bg-purple-600 rounded-full animate-bounce [animation-delay:0.2s]" />
              <span className="w-1.5 h-1.5 bg-purple-600 rounded-full animate-bounce [animation-delay:0.4s]" />
              <span className="ml-1">{currentLang === 'te' ? `${displayProviderName} సమాధానం ఇస్తున్నారు...` : `${displayProviderName} is typing...`}</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick Suggestion Pills */}
        <div className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {quickReplies.map((q, idx) => (
            <button
              key={idx}
              onClick={() => handleSend(q)}
              className="text-[10px] whitespace-nowrap bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 px-2.5 py-1 rounded-full hover:bg-purple-50 hover:text-purple-700 hover:border-purple-300 transition-colors"
            >
              {q}
            </button>
          ))}
        </div>

        {/* Input Form */}
        <div className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2">
          <input
            type="text"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder={currentLang === 'te' ? 'సందేశం రాయండి...' : 'Type your message...'}
            className="flex-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium outline-hidden focus:border-purple-600 text-slate-900 dark:text-white"
          />
          <button
            onClick={() => handleSend()}
            disabled={!inputVal.trim()}
            className="w-9 h-9 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white flex items-center justify-center transition-colors shadow-xs shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
