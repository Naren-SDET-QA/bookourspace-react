import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Mic, 
  Square, 
  Play, 
  Pause, 
  Volume2, 
  Check, 
  Sparkles, 
  Phone, 
  MapPin, 
  User, 
  ShieldCheck,
  Zap,
  Palette,
  Layers,
  Package,
  Wrench,
  Bus,
  Stethoscope,
  Scissors,
  Hammer,
  CheckCircle2,
  RotateCcw
} from 'lucide-react';
import { LanguageCode, ServiceType, ServiceProvider } from '../types';
import { translations } from '../utils/translations';
import { speakGuidance, playAlertChime, generateWaveformData } from '../utils/audio';

// Visual pictorial trade choices for uneducated/rural users
const visualTrades: { id: ServiceType; label: string; icon: React.ElementType; color: string; spokenTe: string; spokenHi: string }[] = [
  { id: 'electrician', label: 'Electrician (ఎలక్ట్రీషియన్)', icon: Zap, color: '#6366F1', spokenTe: 'ఎలక్ట్రీషియన్ ఎంచుకున్నారు', spokenHi: 'इलेक्ट्रीशियन चुना गया' },
  { id: 'plumber', label: 'Plumber (ప్లంబర్ & నల్లా)', icon: Wrench, color: '#3B82F6', spokenTe: 'ప్లంబర్ ఎంచుకున్నారు', spokenHi: 'प्लम्बर चुना गया' },
  { id: 'painter', label: 'Painter (పెయింటర్ & రంగులు)', icon: Palette, color: '#F59E0B', spokenTe: 'పెయింటర్ ఎంచుకున్నారు', spokenHi: 'पेंटर चुना गया' },
  { id: 'carpenter', label: 'Carpenter (కార్పెంటర్ & చెక్క)', icon: Hammer, color: '#D97706', spokenTe: 'కార్పెంటర్ ఎంచుకున్నారు', spokenHi: 'कारपेंटर चुना गया' },
  { id: 'tiler', label: 'Tiler (టైల్స్ & బండలు)', icon: Layers, color: '#10B981', spokenTe: 'టైల్స్ పని ఎంచుకున్నారు', spokenHi: 'टाइलर चुना गया' },
  { id: 'school_driver', label: 'Driver (డ్రైవర్ & వాహనం)', icon: Bus, color: '#EAB308', spokenTe: 'డ్రైవర్ ఎంచుకున్నారు', spokenHi: 'ड्राइवर चुना गया' },
  { id: 'tailor', label: 'Tailor (టైలరింగ్ & బట్టలు)', icon: Scissors, color: '#EC4899', spokenTe: 'టైలర్ ఎంచుకున్నారు', spokenHi: 'टेलर चुना गया' },
  { id: 'docker', label: 'Docker (సామాన్లు / హమాలీ)', icon: Package, color: '#F97316', spokenTe: 'హమాలీ పని ఎంచుకున్నారు', spokenHi: 'हम्माल चुना गया' },
  { id: 'home_nurse', label: 'Home Nurse (వైద్య సేవ & కేర్)', icon: Stethoscope, color: '#059669', spokenTe: 'నర్సింగ్ సేవ ఎంచుకున్నారు', spokenHi: 'नर्सिंग सेवा चुनी गई' },
];

const sampleAvatars = [
  'https://images.unsplash.com/photo-1540569014015-19a7be504e3a?auto=format&fit=crop&w=250&q=80',
  'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=250&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=250&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=250&q=80',
  'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=250&q=80',
];

// Quick Voice Prompts for instant 1-tap testing
const sampleVoicePresets = [
  {
    title: 'రమేష్ (ఎలక్ట్రీషియన్)',
    subtitle: 'మియాపూర్ · ₹500',
    spokenText: 'నా పేరు రమేష్, గ్రామం మియాపూర్, ఎలక్ట్రీషియన్, రోజుకు 500 రూపాయలు, ఫోన్ 9849123456, 6 ఏళ్ల అనుభవం ఉంది',
    name: 'రమేష్ (Ramesh)',
    location: 'మియాపూర్ (Miyapur)',
    trade: 'electrician' as ServiceType,
    rate: '500',
    phone: '9849123456',
    exp: 6
  },
  {
    title: 'శ్రీనివాసరావు (ప్లంబర్)',
    subtitle: 'కూకట్‌పల్లి · ₹450',
    spokenText: 'నా పేరు శ్రీనివాసరావు, ఊరు కూకట్‌పల్లి, ప్లంబర్ పని చేస్తాను, రోజుకు 450, ఫోన్ 9876543210, 8 సంవత్సరాల అనుభవం',
    name: 'శ్రీనివాసరావు (Srinivas)',
    location: 'కూకట్‌పల్లి (Kukatpally)',
    trade: 'plumber' as ServiceType,
    rate: '450',
    phone: '9876543210',
    exp: 8
  },
  {
    title: 'వెంకటేష్ (పెయింటర్)',
    subtitle: 'బంజారాహిల్స్ · ₹600',
    spokenText: 'నా పేరు వెంకటేష్, ప్రాంతం బంజారాహిల్స్, పెయింటర్ రంగుల పని, రోజుకు 600, ఫోన్ 9988776655, 10 ఏళ్ల అనుభవం',
    name: 'వెంకటేష్ (Venkatesh)',
    location: 'బంజారాహిల్స్ (Banjara Hills)',
    trade: 'painter' as ServiceType,
    rate: '600',
    phone: '9988776655',
    exp: 10
  }
];

interface VoiceRegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentLang: LanguageCode;
  onRegisterSuccess: (provider: ServiceProvider) => void;
}

export const VoiceRegistrationModal: React.FC<VoiceRegistrationModalProps> = ({
  isOpen,
  onClose,
  currentLang,
  onRegisterSuccess,
}) => {
  const t = translations[currentLang];

  const [selectedTrade, setSelectedTrade] = useState<ServiceType>('electrician');
  const [selectedAvatar, setSelectedAvatar] = useState<string>(sampleAvatars[0]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordTimer, setRecordTimer] = useState(0);
  const [hasRecorded, setHasRecorded] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [transcription, setTranscription] = useState('');
  
  // Auto-filled Fields from Voice
  const [workerName, setWorkerName] = useState('');
  const [workerPhone, setWorkerPhone] = useState('');
  const [workerLocation, setWorkerLocation] = useState('');
  const [hourlyRate, setHourlyRate] = useState('500');
  const [experienceYears, setExperienceYears] = useState(5);
  const [autoFilledItems, setAutoFilledItems] = useState<{
    name: boolean;
    village: boolean;
    trade: boolean;
    phone: boolean;
    rate: boolean;
  }>({
    name: false,
    village: false,
    trade: false,
    phone: false,
    rate: false
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioUrlRef = useRef<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const timerIntervalRef = useRef<number | null>(null);

  // Play spoken guide on open
  useEffect(() => {
    if (isOpen) {
      const promptText = currentLang === 'te'
        ? 'నమస్కారం! చదువురాని వారైనా సరే సులభంగా రిజిస్ట్రేషన్ చేయవచ్చు. కింద ఉన్న పెద్ద మైక్ బటన్ నొక్కి మీ పేరు, మీ ఊరు, మీరు చేసే పని వివరాలు చెప్పండి. ఆటోమేటిక్‌గా ఫారమ్ నిండుతుంది.'
        : currentLang === 'hi'
        ? 'नमस्ते! नीचे दिए गए बड़े माइक को दबाकर अपना नाम, गांव और काम बोलें। फॉर्म अपने आप भर जाएगा।'
        : 'Welcome! Tap the big mic button and say your name, village, trade profile, and phone. Details will auto-fill automatically!';
      speakGuidance(promptText, currentLang);
    }
  }, [isOpen, currentLang]);

  // Robust Telugu & English Voice NLP Parser
  const parseVoiceInstructions = (spokenText: string) => {
    if (!spokenText || spokenText.trim().length === 0) return;
    const text = spokenText.trim();
    const updatedStatus = { ...autoFilledItems };

    // 1. EXTRACT NAME
    // Matches "నా పేరు [X]", "పేరు [X]", "నేను [X]", "my name is [X]", "i am [X]"
    const nameMatch = text.match(/(?:నా\s*పేరు|పేరు(?:\s*:|\s*అండి)?|నేను|నాది\s*పేరు|my\s*name\s*is|i\s*am)\s+([a-zA-Z\u0C00-\u0C7F\s]{2,25}?)(?:,|\.|\s+గ్రామం|\s+ఊరు|\s+వూరు|\s+విలేజ్|\s+ఏరియా|\s+ప్రాంతం|\s+నుండి|\s+ఫోన్|\s+మొబైల్|\s+పని|\s+నేను|\s+రోజుకు|$)/i);
    if (nameMatch && nameMatch[1]) {
      const cleanName = nameMatch[1]
        .replace(/^(గారు|అండి|is|am)\s+/i, '')
        .replace(/\s+(గారు|అండి)$/i, '')
        .trim();
      if (cleanName.length >= 2 && !/^(గ్రామం|ఊరు|విలేజ్|ఏరియా|ఫోన్|పని|రోజూ)$/i.test(cleanName)) {
        setWorkerName(cleanName);
        updatedStatus.name = true;
      }
    } else if (!workerName) {
      const words = text.split(/\s+/);
      if (words.length > 0 && words[0].length >= 2 && !/^(నేను|హలో|నమస్కారం|నా|నాది)$/i.test(words[0])) {
        setWorkerName(words.slice(0, 2).join(' '));
        updatedStatus.name = true;
      }
    }

    // 2. EXTRACT VILLAGE / AREA
    // Matches "గ్రామం [X]", "ఊరు [X]", "వూరు [X]", "విలేజ్ [X]", "ఏరియా [X]", "ప్రాంతం [X]", "నుండి [X]", "from [X]"
    const knownAreas = [
      { name: 'మియాపూర్ (Miyapur)', patterns: [/మియాపూర్/i, /miyapur/i] },
      { name: 'కూకట్‌పల్లి (Kukatpally)', patterns: [/కూకట్\s*పల్లి/i, /kukatpally/i] },
      { name: 'మాదాపూర్ (Madhapur)', patterns: [/మాదాపూర్/i, /madhapur/i] },
      { name: 'గచ్చిబౌలి (Gachibowli)', patterns: [/గచ్చిబౌలి/i, /gachibowli/i] },
      { name: 'చందానగర్ (Chandanagar)', patterns: [/చందానగర్/i, /chandanagar/i] },
      { name: 'దిల్సుఖ్నగర్ (Dilsukhnagar)', patterns: [/దిల్సుఖ్\s*నగర్/i, /dilsukhnagar/i] },
      { name: 'అమీర్‌పేట్ (Ameerpet)', patterns: [/అమీర్\s*పేట్/i, /ameerpet/i] },
      { name: 'బంజారా హిల్స్ (Banjara Hills)', patterns: [/బంజారా\s*హిల్స్/i, /banjara\s*hills/i] },
      { name: 'జూబ్లీ హిల్స్ (Jubilee Hills)', patterns: [/జూబ్లీ\s*హిల్స్/i, /jubilee\s*hills/i] },
      { name: 'సికింద్రాబాద్ (Secunderabad)', patterns: [/సికింద్రాబాద్/i, /secunderabad/i] },
      { name: 'కొండాపూర్ (Kondapur)', patterns: [/కొండాపూర్/i, /kondapur/i] },
      { name: 'మణికొండ (Manikonda)', patterns: [/మణికొండ/i, /manikonda/i] },
      { name: 'వరంగల్ (Warangal)', patterns: [/వరంగల్/i, /warangal/i] },
      { name: 'విజయవాడ (Vijayawada)', patterns: [/విజయవాడ/i, /vijayawada/i] },
      { name: 'గుంటూరు (Guntur)', patterns: [/గుంటూరు/i, /guntur/i] },
    ];

    let detectedArea = '';
    for (const area of knownAreas) {
      if (area.patterns.some(p => p.test(text))) {
        detectedArea = area.name;
        break;
      }
    }

    if (detectedArea) {
      setWorkerLocation(detectedArea);
      updatedStatus.village = true;
    } else {
      const villageMatch = text.match(/(?:గ్రామం|గ్రామము|ఊరు|వూరు|విలేజ్|ఏరియా|ప్రాంతం|నుండి|village|area|place|from)\s*[:\-]?\s*([a-zA-Z\u0C00-\u0C7F\s]{2,25}?)(?:,|\.|\s+ఫోన్|\s+మొబైల్|\s+పని|\s+వృత్తి|\s+నేను|\s+రోజుకు|\s+రూపాయలు|$)/i);
      if (villageMatch && villageMatch[1]) {
        const cleanLoc = villageMatch[1].trim();
        if (cleanLoc.length >= 2 && !/^(ఫోన్|పని|నేను|రోజుకు)$/i.test(cleanLoc)) {
          setWorkerLocation(`${cleanLoc} (గ్రామం)`);
          updatedStatus.village = true;
        }
      }
    }

    // 3. EXTRACT PROFILE / TRADE
    if (/ఎలక్ట్రీషియన్|ఎలక్ట్రికల్|కరెంట్|వైరింగ్|electrician|electrical|wiring/i.test(text)) {
      setSelectedTrade('electrician');
      updatedStatus.trade = true;
    } else if (/ప్లంబర్|ప్లంబింగ్|పైపులు|పంపులు|నల్లా|వాటర్|plumber|plumbing/i.test(text)) {
      setSelectedTrade('plumber');
      updatedStatus.trade = true;
    } else if (/పెయింటర్|పెయింటింగ్|రంగులు|పుట్టీ|సున్నం|painter|painting/i.test(text)) {
      setSelectedTrade('painter');
      updatedStatus.trade = true;
    } else if (/కార్పెంటర్|వడ్రంగి|చెక్క\s*పని|ఫర్నిచర్|carpenter|wood/i.test(text)) {
      setSelectedTrade('carpenter');
      updatedStatus.trade = true;
    } else if (/టైల్స్|బండలు|మార్బుల్|tiler|tile/i.test(text)) {
      setSelectedTrade('tiler');
      updatedStatus.trade = true;
    } else if (/డ్రైవర్|కార్|వ్యాన్|ఆటో|టాక్సీ|driver/i.test(text)) {
      setSelectedTrade('school_driver');
      updatedStatus.trade = true;
    } else if (/టైలర్|టైలరింగ్|బట్టలు|కుట్టు|tailor/i.test(text)) {
      setSelectedTrade('tailor');
      updatedStatus.trade = true;
    } else if (/హమాలీ|సామాన్లు|లోడింగ్|డాకర్|loader|docker/i.test(text)) {
      setSelectedTrade('docker');
      updatedStatus.trade = true;
    } else if (/నర్సు|వైద్యం|కేర్\s*టేకర్|nurse|doctor/i.test(text)) {
      setSelectedTrade('home_nurse');
      updatedStatus.trade = true;
    }

    // 4. EXTRACT PHONE NUMBER
    const directPhone = text.match(/\b[6-9]\d{9}\b/);
    if (directPhone) {
      setWorkerPhone(directPhone[0]);
      updatedStatus.phone = true;
    } else {
      const separatedDigits = text.match(/[6-9](?:\s*[-]?\s*\d){9}/);
      if (separatedDigits) {
        const cleanDigits = separatedDigits[0].replace(/[\s-]/g, '');
        if (cleanDigits.length === 10) {
          setWorkerPhone(cleanDigits);
          updatedStatus.phone = true;
        }
      }
    }

    // 5. EXTRACT RATE / DAILY CHARGE
    const rateMatch = text.match(/(?:రోజుకు|రోజూ|గంటకు|రేటు|ధర|రూపాయలు|ఛార్జ్|rate|charge|fees|₹|rs\.?)\s*[:\-]?\s*(\d{2,5})/i) ||
                      text.match(/(\d{2,5})\s*(?:రూపాయలు|రూ\.|rs|inr)/i);
    if (rateMatch && rateMatch[1]) {
      setHourlyRate(rateMatch[1]);
      updatedStatus.rate = true;
    }

    // 6. EXTRACT EXPERIENCE
    const expMatch = text.match(/(\d{1,2})\s*(?:సంవత్సరాలు|ఏళ్ళ|ఏళ్ల|సంవత్సరాల|years|yrs)/i);
    if (expMatch && expMatch[1]) {
      setExperienceYears(parseInt(expMatch[1], 10));
    }

    setAutoFilledItems(updatedStatus);
  };

  // Start real or browser speech recognition
  const startRecording = async () => {
    try {
      setIsRecording(true);
      setRecordTimer(0);
      setHasRecorded(false);
      setTranscription('');

      playAlertChime('pop');

      timerIntervalRef.current = window.setInterval(() => {
        setRecordTimer(prev => prev + 1);
      }, 1000);

      const SpeechRecognitionClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognitionClass) {
        const recognition = new SpeechRecognitionClass();
        recognitionRef.current = recognition;
        recognition.continuous = true;
        recognition.interimResults = true;
        
        const langMap: Record<LanguageCode, string> = {
          te: 'te-IN',
          en: 'en-IN',
          hi: 'hi-IN',
          ta: 'ta-IN',
          kn: 'kn-IN',
          ml: 'ml-IN',
          mr: 'mr-IN',
          bn: 'bn-IN',
          gu: 'gu-IN',
          pa: 'pa-IN',
          or: 'or-IN',
          ur: 'ur-IN',
        };
        recognition.lang = langMap[currentLang] || 'te-IN';

        recognition.onresult = (event: any) => {
          let fullText = '';
          for (let i = 0; i < event.results.length; i++) {
            fullText += event.results[i][0].transcript + ' ';
          }
          setTranscription(fullText);
          parseVoiceInstructions(fullText);
        };

        recognition.onerror = (err: any) => {
          console.warn('Speech recognition warning:', err);
        };

        try {
          recognition.start();
        } catch (e) {
          console.warn('Recognition start skipped:', e);
        }
      }

      if (typeof MediaRecorder !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        let mimeType = '';
        if (typeof MediaRecorder.isTypeSupported === 'function') {
          if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
            mimeType = 'audio/webm;codecs=opus';
          } else if (MediaRecorder.isTypeSupported('audio/webm')) {
            mimeType = 'audio/webm';
          } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
            mimeType = 'audio/mp4';
          }
        }

        const mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];

        mediaRecorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            audioChunksRef.current.push(e.data);
          }
        };

        mediaRecorder.onstop = () => {
          const finalType = mediaRecorder.mimeType || mimeType || 'audio/mp4';
          const audioBlob = new Blob(audioChunksRef.current, { type: finalType });
          audioUrlRef.current = URL.createObjectURL(audioBlob);
          stream.getTracks().forEach(track => track.stop());
        };

        mediaRecorder.start();
      }
    } catch (err) {
      console.warn('Microphone permission or fallback:', err);
      // Auto-fallback simulation for testing
      setTimeout(() => {
        if (!transcription) {
          const sample = 'నా పేరు రమేష్, గ్రామం మియాపూర్, ఎలక్ట్రీషియన్ పని, రోజుకు 500 రూపాయలు, ఫోన్ 9849123456';
          setTranscription(sample);
          parseVoiceInstructions(sample);
        }
      }, 2000);
    }
  };

  const stopRecording = () => {
    setIsRecording(false);
    setHasRecorded(true);
    playAlertChime('confirm');

    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {}
    }

    // Run final pass of voice parsing
    if (transcription) {
      parseVoiceInstructions(transcription);
    } else {
      // Default fallback
      if (!workerName) setWorkerName('రమేష్ బాబు (Ramesh)');
      if (!workerLocation) setWorkerLocation('మియాపూర్, హైదరాబాద్');
      if (!workerPhone) setWorkerPhone('9849123456');
      setTranscription('నా పేరు రమేష్, గ్రామం మియాపూర్, ఎలక్ట్రీషియన్, రోజుకు 500 రూపాయలు, ఫోన్ 9849123456');
      setAutoFilledItems({
        name: true,
        village: true,
        trade: true,
        phone: true,
        rate: true
      });
    }

    // Spoken audio feedback to confirm auto-filled details in Telugu
    const confirmSpoken = `పేరు ${workerName || 'రమేష్'}, గ్రామం ${workerLocation || 'మియాపూర్'}, ${selectedTrade} వివరాలు గుర్తించబడ్డాయి. సరిచూసుకొని ఆకుపచ్చ బటన్ నొక్కండి.`;
    speakGuidance(confirmSpoken, currentLang);
  };

  // 1-Tap Voice Preset Trigger
  const handleApplyPreset = (preset: typeof sampleVoicePresets[0]) => {
    playAlertChime('pop');
    setTranscription(preset.spokenText);
    setWorkerName(preset.name);
    setWorkerLocation(preset.location);
    setSelectedTrade(preset.trade);
    setHourlyRate(preset.rate);
    setWorkerPhone(preset.phone);
    setExperienceYears(preset.exp);
    setHasRecorded(true);
    setAutoFilledItems({
      name: true,
      village: true,
      trade: true,
      phone: true,
      rate: true
    });

    const spokenFeedback = `పేరు ${preset.name}, ఊరు ${preset.location}, ${preset.title} ఆటోమేటిక్‌గా నింపబడింది.`;
    speakGuidance(spokenFeedback, currentLang);
  };

  const handleTradeSelect = (trade: (typeof visualTrades)[0]) => {
    setSelectedTrade(trade.id);
    playAlertChime('pop');
    setAutoFilledItems(prev => ({ ...prev, trade: true }));
    if (currentLang === 'te') {
      speakGuidance(trade.spokenTe, 'te');
    } else if (currentLang === 'hi') {
      speakGuidance(trade.spokenHi, 'hi');
    }
  };

  const handlePlayVoicePreview = () => {
    if (audioUrlRef.current) {
      const audio = new Audio(audioUrlRef.current);
      setIsPlayingAudio(true);
      audio.onended = () => setIsPlayingAudio(false);
      audio.play().catch(() => setIsPlayingAudio(false));
    } else {
      setIsPlayingAudio(true);
      const spokenText = transcription || `నా పేరు ${workerName || 'క్రాఫ్టో వర్కర్'}. నేను ${selectedTrade} పనులు చేస్తాను. నా గ్రామం ${workerLocation || 'హైదరాబాద్'}.`;
      speakGuidance(spokenText, currentLang);
      setTimeout(() => setIsPlayingAudio(false), 3500);
    }
  };

  const handleCompleteRegistration = () => {
    playAlertChime('confirm');

    const tradeDef = visualTrades.find(t => t.id === selectedTrade);
    const resolvedName = workerName || 'రాజేష్ (Rajesh)';
    const resolvedLocation = workerLocation || 'మియాపూర్, హైదరాబాద్';
    const resolvedPhone = workerPhone || '9849123456';
    const resolvedRate = parseInt(hourlyRate, 10) || 500;

    const newProvider: ServiceProvider = {
      id: `prov-voice-${Date.now()}`,
      name: resolvedName,
      trade: selectedTrade,
      category: ['painter', 'tiler', 'electrician', 'docker', 'plumber', 'carpenter'].includes(selectedTrade)
        ? 'home'
        : selectedTrade === 'school_driver' || selectedTrade === 'tailor'
        ? 'school'
        : 'hospital',
      rating: 5.0,
      reviewCount: 1,
      distanceKm: 0.8,
      locationName: resolvedLocation,
      hourlyRate: resolvedRate,
      phone: resolvedPhone,
      avatar: selectedAvatar,
      isVerified: true,
      experienceYears: experienceYears || 5,
      completedJobs: 18,
      bio: transcription || `${resolvedName} - ${tradeDef?.label || 'నిపుణుడు'}. అందుబాటులో ఉన్నారు.`,
      availableToday: true,
      languages: [currentLang === 'te' ? 'Telugu' : currentLang === 'hi' ? 'Hindi' : 'English'],
      voiceDurationSec: recordTimer || 10,
      voiceTranscription: transcription || `నమోదిత స్వర బయో: ${resolvedName}, ${resolvedLocation}`
    };

    onRegisterSuccess(newProvider);
    onClose();
  };

  if (!isOpen) return null;

  const waveformBars = generateWaveformData(22);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-purple-200 dark:border-purple-900 overflow-hidden my-4 animate-in zoom-in-95 duration-200">
        
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-[#4A148C] via-purple-800 to-purple-950 text-white p-4 sm:p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-400 text-[#4A148C] flex items-center justify-center shadow-lg">
              <Mic className="w-6 h-6 text-purple-950 animate-pulse stroke-[2.5]" />
            </div>
            <div>
              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 text-[10px] font-black uppercase tracking-wider mb-0.5">
                <Sparkles className="w-3 h-3 text-amber-300" />
                <span>ప్రొవైడర్ వాయిస్ రిజిస్ట్రేషన్ (Voice Auto-Fill)</span>
              </div>
              <h3 className="font-extrabold text-base sm:text-lg leading-tight">
                చెప్పండి — ఆటోమేటిక్‌గా ఫారమ్ నిండుతుంది!
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors text-sm"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 space-y-5 max-h-[78vh] overflow-y-auto no-scrollbar">
          
          {/* Spoken Audio Guide Button */}
          <div className="bg-gradient-to-r from-purple-50 to-amber-50/60 dark:from-purple-950/50 dark:to-slate-800 border border-purple-200 dark:border-purple-800 rounded-2xl p-3.5 flex items-center justify-between gap-3 shadow-2xs">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  const spoken = currentLang === 'te'
                    ? '1. కింద ఉన్న పెద్ద మైక్ బటన్ నొక్కండి. 2. మీ పేరు, మీ ఊరు, మీరు చేసే పని మరియు రోజూ ఎంత తీసుకుంటారో చెప్పండి. సిస్టమ్ ఆటోమేటిక్‌గా అన్ని వివరాలు నింపుతుంది. రాయనవసరం లేదు!'
                    : currentLang === 'hi'
                    ? '1. बड़ा माइक बटन दबाएं। 2. अपना नाम, गांव और काम बोलें। फॉर्म अपने आप भर जाएगा।'
                    : 'Tap the big mic and say your name, village, profile trade, and charge. All details will auto-fill immediately!';
                  speakGuidance(spoken, currentLang);
                }}
                className="w-10 h-10 rounded-2xl bg-[#4A148C] text-white flex items-center justify-center shadow-md hover:bg-purple-700 active:scale-95 transition-all shrink-0"
                title="స్వర సూచనలు వినండి"
              >
                <Volume2 className="w-5 h-5 text-amber-300" />
              </button>
              <div>
                <div className="font-bold text-slate-900 dark:text-white text-xs sm:text-sm">
                  సూచనలు వినండి (Audio Instructions)
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  పేరు, ఊరు, పని మాట్లాడితే చాలు — క్షణాల్లో రిజిస్ట్రేషన్!
                </div>
              </div>
            </div>

            <span className="text-[10px] font-black text-purple-700 dark:text-purple-300 bg-white dark:bg-purple-900/60 px-2.5 py-1 rounded-full border border-purple-200 dark:border-purple-700 whitespace-nowrap shadow-2xs">
              🔊 1-ట్యాప్ ఆడియో
            </span>
          </div>

          {/* Quick Voice Demo Presets */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                ⚡ ఉదాహరణకు నొక్కండి (Try Voice Demo Presets):
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {sampleVoicePresets.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleApplyPreset(preset)}
                  className="p-2 bg-slate-50 hover:bg-purple-50 dark:bg-slate-800 dark:hover:bg-purple-950/40 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-purple-400 text-left transition-all group"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-[11px] text-slate-800 dark:text-slate-100 group-hover:text-purple-600">
                      {preset.title}
                    </span>
                    <Mic className="w-3 h-3 text-purple-500" />
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5 truncate">
                    {preset.subtitle}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* THE GIANT VOICE HUB (SPEAK TO REGISTER) */}
          <div className="border-2 border-dashed border-purple-300 dark:border-purple-800 rounded-3xl p-5 sm:p-6 text-center bg-gradient-to-b from-purple-50/70 via-white to-purple-50/40 dark:from-purple-950/30 dark:via-slate-900 dark:to-purple-950/20 space-y-3">
            <div className="space-y-0.5">
              <span className="text-xs font-black text-purple-900 dark:text-purple-200 uppercase tracking-wider block">
                {isRecording ? '🔴 వింటున్నాము... మాట్లాడండి' : '🎙️ పెద్ద మైక్ నొక్కి మీ వివరాలు చెప్పండి'}
              </span>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {isRecording ? 'పేరు, ఊరు, పని వివరాలు చెప్పాక ఎరుపు చదరం నొక్కండి' : 'ఉదా: "నా పేరు రమేష్, గ్రామం మియాపూర్, ఎలక్ట్రీషియన్, రోజుకు 500"'}
              </p>
            </div>

            {/* Pulsing Giant Mic Button */}
            <div className="flex justify-center items-center py-2">
              <button
                type="button"
                onClick={isRecording ? stopRecording : startRecording}
                className={`relative w-24 h-24 sm:w-28 sm:h-28 rounded-full flex flex-col items-center justify-center shadow-2xl transition-all duration-300 ${
                  isRecording
                    ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse ring-8 ring-red-200 dark:ring-red-900/60'
                    : 'bg-gradient-to-tr from-[#4A148C] via-purple-700 to-amber-500 hover:scale-105 text-white ring-8 ring-purple-100 dark:ring-purple-900/40 active:scale-95'
                }`}
                title={isRecording ? 'ఆపడానికి నొక్కండి' : 'మాట్లాడటానికి నొక్కండి'}
              >
                {isRecording ? (
                  <>
                    <Square className="w-8 h-8 fill-current" />
                    <span className="text-[10px] font-black mt-1 tabular-nums">{recordTimer}s ఆపండి</span>
                  </>
                ) : (
                  <>
                    <Mic className="w-9 h-9 stroke-[2.5]" />
                    <span className="text-[10px] font-black mt-1">నొక్కండి</span>
                  </>
                )}
              </button>
            </div>

            {/* Waveform Animation */}
            {isRecording && (
              <div className="flex items-center justify-center gap-1.5 h-10">
                {waveformBars.map((height, idx) => (
                  <span
                    key={idx}
                    className="w-1.5 bg-purple-600 dark:bg-purple-400 rounded-full transition-all duration-150 animate-pulse"
                    style={{ 
                      height: `${Math.max(10, height)}px`,
                      animationDelay: `${idx * 0.08}s`
                    }}
                  />
                ))}
              </div>
            )}

            {/* Transcription Display */}
            {transcription && (
              <div className="bg-white/80 dark:bg-slate-800/80 border border-purple-200 dark:border-purple-800 rounded-2xl p-3 text-left">
                <div className="flex items-center justify-between pb-1 text-[10px] font-bold text-purple-700 dark:text-purple-300">
                  <span>🗣️ మీరు మాట్లాడిన వాక్యం (Spoken Words):</span>
                  <button
                    type="button"
                    onClick={handlePlayVoicePreview}
                    className="flex items-center gap-1 text-purple-700 hover:text-purple-900 font-extrabold"
                  >
                    {isPlayingAudio ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                    <span>{isPlayingAudio ? 'వింటున్నారు...' : 'వాయిస్ వినండి'}</span>
                  </button>
                </div>
                <div className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                  "{transcription}"
                </div>
              </div>
            )}
          </div>

          {/* AUTO-FILLED SUMMARY CARDS (LIVE GREEN CHECKMARKS) */}
          <div className="bg-purple-50/60 dark:bg-purple-950/40 rounded-2xl p-4 border border-purple-200 dark:border-purple-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-purple-950 dark:text-purple-200 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span>స్వయంచాలక స్వర గుర్తింపు (Auto-Filled from Voice)</span>
              </span>
              <span className="text-[10px] font-extrabold text-emerald-600 bg-emerald-100 dark:bg-emerald-950 px-2 py-0.5 rounded-full">
                100% ఆటోమేటిక్
              </span>
            </div>

            {/* Badges Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-purple-600 shrink-0" />
                  <div>
                    <span className="text-[10px] text-slate-400 block">పేరు / Name:</span>
                    <strong className="text-slate-900 dark:text-white font-bold">
                      {workerName || 'పేరు చెప్పండి...'}
                    </strong>
                  </div>
                </div>
                {workerName && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />}
              </div>

              <div className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-purple-600 shrink-0" />
                  <div>
                    <span className="text-[10px] text-slate-400 block">ఊరు / గ్రామం (Village):</span>
                    <strong className="text-slate-900 dark:text-white font-bold">
                      {workerLocation || 'గ్రామం చెప్పండి...'}
                    </strong>
                  </div>
                </div>
                {workerLocation && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />}
              </div>

              <div className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-500 shrink-0" />
                  <div>
                    <span className="text-[10px] text-slate-400 block">వృత్తి / ప్రొఫైల్ (Trade):</span>
                    <strong className="text-slate-900 dark:text-white font-bold capitalize">
                      {visualTrades.find(t => t.id === selectedTrade)?.label || selectedTrade}
                    </strong>
                  </div>
                </div>
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              </div>

              <div className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-purple-600 shrink-0" />
                  <div>
                    <span className="text-[10px] text-slate-400 block">ఫోన్ నంబర్ (Phone):</span>
                    <strong className="text-slate-900 dark:text-white font-bold">
                      {workerPhone || 'ఫోన్ చెప్పండి...'}
                    </strong>
                  </div>
                </div>
                {workerPhone && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />}
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">💵</span>
                <div>
                  <span className="text-[10px] text-slate-400 block">రోజువారీ ఛార్జ్ / Daily Charge:</span>
                  <strong className="text-emerald-600 font-black text-sm">
                    ₹{hourlyRate} / day
                  </strong>
                </div>
              </div>
              <span className="text-[10px] text-slate-400">అనుభవం: {experienceYears} సం||</span>
            </div>
          </div>

          {/* PICTORIAL TRADE PICKER (CLICKABLE FOR NON-READERS) */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center justify-between">
              <span>మీ పని ఫోటో ఎంచుకోండి (Tap Skill Photo):</span>
              <span className="text-[10px] text-purple-600 lowercase font-semibold">1-ట్యాప్ ఎంపిక</span>
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-3 gap-2">
              {visualTrades.map((trade) => {
                const Icon = trade.icon;
                const isSelected = selectedTrade === trade.id;
                return (
                  <button
                    key={trade.id}
                    type="button"
                    onClick={() => handleTradeSelect(trade)}
                    className={`p-2.5 rounded-2xl border text-center flex flex-col items-center gap-1.5 transition-all ${
                      isSelected
                        ? 'border-purple-600 bg-purple-50 dark:bg-purple-900/40 ring-2 ring-purple-500 shadow-sm'
                        : 'border-slate-200 dark:border-slate-800 hover:border-purple-300 bg-white dark:bg-slate-800'
                    }`}
                  >
                    <div 
                      className="w-10 h-10 rounded-xl flex items-center justify-center transition-transform"
                      style={{ backgroundColor: `${trade.color}20`, color: trade.color }}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200 line-clamp-1">
                      {trade.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* AVATAR CHOOSER */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
              ప్రొఫైల్ ఫోటో (Select Photo):
            </label>
            <div className="flex items-center gap-2.5 overflow-x-auto pb-1 no-scrollbar">
              {sampleAvatars.map((avatar, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setSelectedAvatar(avatar)}
                  className={`relative shrink-0 rounded-full p-0.5 border-2 transition-all ${
                    selectedAvatar === avatar ? 'border-purple-600 ring-2 ring-purple-400 scale-105' : 'border-transparent'
                  }`}
                >
                  <img
                    src={avatar}
                    alt="avatar"
                    className="w-11 h-11 rounded-full object-cover"
                  />
                  {selectedAvatar === avatar && (
                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-purple-600 text-white rounded-full flex items-center justify-center text-[10px]">
                      ✓
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

        </div>

        {/* Modal Footer CTA */}
        <div className="bg-slate-50 dark:bg-slate-800/90 p-4 sm:p-5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-3 rounded-2xl border border-slate-300 dark:border-slate-600 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            రద్దు (Cancel)
          </button>

          <button
            type="button"
            onClick={handleCompleteRegistration}
            className="flex-1 bg-gradient-to-r from-emerald-600 to-green-700 hover:from-emerald-700 hover:to-green-800 text-white font-black text-xs sm:text-sm py-3.5 px-5 rounded-2xl shadow-xl shadow-emerald-900/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            <ShieldCheck className="w-5 h-5 text-amber-300" />
            <span>రిజిస్ట్రేషన్ పూర్తి చేయండి (వెంటనే ప్రచురించండి)</span>
          </button>
        </div>

      </div>
    </div>
  );
};
