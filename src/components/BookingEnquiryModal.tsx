import React, { useState, useRef, useEffect } from 'react';
import { 
  X, 
  Calendar, 
  Clock, 
  MapPin, 
  User, 
  Phone, 
  ShieldCheck, 
  Check, 
  Sparkles,
  PhoneCall,
  Mic,
  MicOff,
  Zap,
  QrCode,
  Smartphone,
  Copy,
  CheckCircle2,
  ExternalLink,
  Lock,
  ArrowRight,
  Star,
  ChevronLeft,
  ChevronRight,
  CreditCard,
} from 'lucide-react';
import { MarketplaceListing, CustomerAction } from '../types/marketplace';
import { getActionForListing, customerActionList } from '../data/customerActions';
import { useMarketplace } from '../context/MarketplaceContext';
import { 
  AppLanguage, 
  translations,
  getListingTitle,
  getProviderDisplayName,
  getPriceUnitDisplayName,
  getSubcategoryDisplayName
} from '../utils/translations';
import { UniversalBarcode, generateBosBarcodeId, getBarcodePassTitle } from './UniversalBarcode';
import { generateBookingGSTReceiptPDF } from '../utils/gstInvoiceGenerator';
import { triggerGlobalGlobeLoader } from './BOSBrandLogo';
import {
  createAuthoritativeBookingAtomic,
  createServerPaymentIntent,
  createRazorpayOrder,
  loadRazorpayCheckout,
  verifyRazorpayPayment,
  verifyServerUpiPayment,
  getOrCreateClientSessionId,
} from '../lib/supabaseClient';
import { isAuthoritativeBookingAccepted } from '../lib/bookingValidation';

interface BookingEnquiryModalProps {
  listing: MarketplaceListing | null;
  actionOverride?: CustomerAction;
  onClose: () => void;
  onOpenReview?: (listing: MarketplaceListing) => void;
  currentLang?: AppLanguage;
  initialDateRange?: { startDate: string; endDate: string };
}

export const BookingEnquiryModal: React.FC<BookingEnquiryModalProps> = ({
  listing,
  actionOverride,
  onClose,
  onOpenReview,
  currentLang = 'te',
  initialDateRange,
}) => {
  const { bookings, createBooking, sendEnquiry, recordPayment } = useMarketplace();

  // Basic Form State - user friendly defaults
  const [customerName, setCustomerName] = useState(currentLang === 'te' ? 'రమేష్ కుమార్' : 'Ramesh Kumar');
  const [customerPhone, setCustomerPhone] = useState('9849012345');
  const [customerAddress, setCustomerAddress] = useState(
    listing?.location?.area 
      ? (currentLang === 'te' ? `${listing.location.area}, హైదరాబాద్` : `${listing.location.area}, Hyderabad`) 
      : (currentLang === 'te' ? 'మాదాపూర్, హైదరాబాద్' : 'Madhapur, Hyderabad')
  );
  
  // Quick Slot Selection - super easy for everyone
  const [selectedSlotType, setSelectedSlotType] = useState<'urgent' | 'today_morning' | 'today_afternoon' | 'today_evening' | 'tomorrow'>('urgent');
  const [notes, setNotes] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submittedPaymentStatus, setSubmittedPaymentStatus] = useState<
    'pay_later' | 'pending_verification' | 'verified'
  >('pay_later');

  // Dynamic Pay via QR State
  const [paymentMode, setPaymentMode] = useState<'pay_later' | 'pay_qr' | 'razorpay'>('pay_later');
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [isVerifyingQr, setIsVerifyingQr] = useState(false);
  const [qrVerified, setQrVerified] = useState(false);
  const [qrTxId, setQrTxId] = useState('');
  const [paymentIntentId, setPaymentIntentId] = useState('');
  const [paymentVerificationToken, setPaymentVerificationToken] = useState('');
  const [isRazorpayProcessing, setIsRazorpayProcessing] = useState(false);
  const [signedQrPassToken, setSignedQrPassToken] = useState('');
  const [bookingConflictError, setBookingConflictError] = useState<string | null>(null);

  // Voice input support for easy speech filling
  const [activeVoiceField, setActiveVoiceField] = useState<'name' | 'address' | null>(null);
  const recognitionRef = useRef<any>(null);
  const bookingFormRef = useRef<HTMLFormElement>(null);

  const [hotelStayMode, setHotelStayMode] = useState<'hourly' | 'daily' | 'weekly' | 'monthly'>('daily');

  // Booking Calendar State (declared unconditionally before any early return)
  const toLocalIso = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const addDaysIso = (isoStr: string, daysToAdd: number) => {
    const parts = isoStr.split('-').map(Number);
    const dt = new Date(parts[0] || 2026, (parts[1] || 1) - 1, parts[2] || 1);
    dt.setDate(dt.getDate() + daysToAdd);
    return toLocalIso(dt);
  };

  const todayIso = toLocalIso(new Date());
  const tomorrowIso = addDaysIso(todayIso, 1);

  const [selectedBookingDate, setSelectedBookingDate] = useState<string>(todayIso);
  const [selectedCheckoutDate, setSelectedCheckoutDate] = useState<string>(tomorrowIso);
  // Keep the provider's standard times in the booking payload while the UI
  // presents one stay date range and one preferred check-in slot.
  const [hotelCheckInTime] = useState<string>('14:00');
  const [hotelCheckOutTime] = useState<string>('12:00');
  const [activeRangeEdge, setActiveRangeEdge] = useState<'checkIn' | 'checkOut'>('checkIn');
  const [calendarMonth, setCalendarMonth] = useState<{ year: number; month: number }>(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [showCalendarGrid, setShowCalendarGrid] = useState<boolean>(false);

  useEffect(() => {
    if (listing) {
      const nextMode =
        (listing.customFieldValues?.selectedStayMode as 'hourly' | 'daily' | 'weekly' | 'monthly') ||
        (listing.customFieldValues?.defaultStayMode as 'hourly' | 'daily' | 'weekly' | 'monthly') ||
        (listing.categoryId === 'hotel-hourly' ? 'hourly' : 'daily');
      setHotelStayMode(nextMode);
      setSubmitted(false);
      setSubmittedPaymentStatus('pay_later');
      setQrVerified(false);
      setActiveRangeEdge('checkIn');

      const freshToday = toLocalIso(new Date());
      const prefilledStart =
        String(listing.customFieldValues?.selectedCheckInDate || '') ||
        initialDateRange?.startDate ||
        freshToday;
      const safeStart = prefilledStart >= freshToday ? prefilledStart : freshToday;

      const prefilledEnd =
        String(listing.customFieldValues?.selectedCheckOutDate || '') ||
        initialDateRange?.endDate ||
        '';

      setSelectedBookingDate(safeStart);
      if (prefilledEnd && prefilledEnd >= safeStart) {
        setSelectedCheckoutDate(
          prefilledEnd === safeStart && nextMode !== 'hourly'
            ? addDaysIso(safeStart, 1)
            : prefilledEnd
        );
      } else {
        setSelectedCheckoutDate(
          nextMode === 'hourly'
            ? safeStart
            : nextMode === 'weekly'
            ? addDaysIso(safeStart, 7)
            : nextMode === 'monthly'
            ? addDaysIso(safeStart, 30)
            : addDaysIso(safeStart, 1)
        );
      }

      const [yr, mo] = safeStart.split('-').map(Number);
      if (yr && mo) {
        setCalendarMonth({ year: yr, month: mo - 1 });
      }

      if (listing.location?.area) {
        setCustomerAddress(
          currentLang === 'te' ? `${listing.location.area}, హైదరాబాద్` : `${listing.location.area}, Hyderabad`
        );
      }

      if (listing.customFieldValues?.aiQuickBookNotes) {
        setNotes(String(listing.customFieldValues.aiQuickBookNotes));
      } else {
        setNotes('');
      }
    }
  }, [listing, currentLang, initialDateRange?.startDate, initialDateRange?.endDate]);

  useEffect(() => {
    if (hotelStayMode === 'hourly') {
      setSelectedCheckoutDate(selectedBookingDate);
    } else if (hotelStayMode === 'daily') {
      if (selectedCheckoutDate <= selectedBookingDate) {
        setSelectedCheckoutDate(addDaysIso(selectedBookingDate, 1));
      }
    } else if (hotelStayMode === 'weekly') {
      setSelectedCheckoutDate(addDaysIso(selectedBookingDate, 7));
    } else if (hotelStayMode === 'monthly') {
      setSelectedCheckoutDate(addDaysIso(selectedBookingDate, 30));
    }
  }, [hotelStayMode, selectedBookingDate]);

  if (!listing) return null;

  const isHotel =
    listing.categoryId.startsWith('hotel-') ||
    listing.customFieldValues?.sectionType === 'hotel_stay';

  const isVenue =
    listing.categoryId.startsWith('venue-') ||
    listing.customFieldValues?.sectionType === 'venues' ||
    listing.entityType === 'event';

  const isRangeBooking = isHotel || isVenue;

  const isMovie =
    listing.categoryId.startsWith('movie-') ||
    listing.customFieldValues?.sectionType === 'movies';

  const baseDailyPrice = Number(
    listing.customFieldValues?.dailyPrice ||
      (listing.categoryId === 'hotel-hourly' ? Math.round(listing.price * 2.2) : listing.price)
  );
  const hourlyPrice = Number(
    listing.customFieldValues?.hourlyPrice ||
      (listing.categoryId === 'hotel-hourly' ? listing.price : Math.round(baseDailyPrice * 0.36))
  );
  const weeklyPrice = Number(
    listing.customFieldValues?.weeklyPrice || Math.round(baseDailyPrice * 6)
  );
  const monthlyPrice = Number(
    listing.customFieldValues?.monthlyPrice || Math.round(baseDailyPrice * 20)
  );

  const effectivePrice = isHotel
    ? hotelStayMode === 'hourly'
      ? hourlyPrice
      : hotelStayMode === 'daily'
      ? baseDailyPrice
      : hotelStayMode === 'weekly'
      ? weeklyPrice
      : monthlyPrice
    : listing.price;

  const effectivePriceUnit = isHotel
    ? hotelStayMode === 'hourly'
      ? currentLang === 'te'
        ? '/3 గంటలకు'
        : '/3 hrs'
      : hotelStayMode === 'daily'
      ? currentLang === 'te'
        ? '/రోజుకు'
        : '/day'
      : hotelStayMode === 'weekly'
      ? currentLang === 'te'
        ? '/వారానికి'
        : '/week'
      : currentLang === 'te'
      ? '/నెలకు'
      : '/month'
    : getPriceUnitDisplayName(listing.priceUnitTe || listing.priceUnit, currentLang);

  const calcDiffDays = (startIso: string, endIso: string) => {
    const [y1, m1, d1] = startIso.split('-').map(Number);
    const [y2, m2, d2] = endIso.split('-').map(Number);
    const dt1 = new Date(y1 || 2026, (m1 || 1) - 1, d1 || 1);
    const dt2 = new Date(y2 || 2026, (m2 || 1) - 1, d2 || 1);
    const diff = Math.round((dt2.getTime() - dt1.getTime()) / 86400000);
    return Math.max(1, diff);
  };

  const durationDays = isRangeBooking
    ? hotelStayMode === 'hourly' && isHotel
      ? 1
      : calcDiffDays(selectedBookingDate, selectedCheckoutDate)
    : 1;

  const totalBookingAmount =
    (isHotel && hotelStayMode === 'daily') || isVenue
      ? effectivePrice * durationDays
      : effectivePrice;

  const t = translations[currentLang] || translations.te;
  const distKm = listing.distanceKm ?? listing.location?.distanceKm ?? 2.5;
  const displayTitle = getListingTitle(listing, currentLang);
  const displayProviderName = getProviderDisplayName(listing.providerNameTe || listing.providerName, currentLang, distKm);
  const displayPriceUnit = effectivePriceUnit;
  const displaySubcategory = getSubcategoryDisplayName(listing.subcategory, currentLang);

  // Time slot labels in Telugu
  const slotOptions = [
    {
      id: 'urgent' as const,
      icon: <Zap className="w-4 h-4 text-amber-500 fill-amber-400" />,
      labelTe: isHotel ? '⚡ ఇప్పుడే ఫ్లెక్సీ చెక్-ఇన్ (24/7 Flex)' : '⚡ వెంటనే రండి (15-30 నిమిషాలు)',
      labelEn: isHotel ? '⚡ Instant Flexi Check-in (24/7)' : '⚡ Urgent (15-30 mins)',
      timeValue: isHotel ? 'Instant 24/7 Flexi Check-in' : 'Immediate Express (15-30 mins)',
    },
    {
      id: 'today_morning' as const,
      icon: <Clock className="w-4 h-4 text-purple-600" />,
      labelTe: '🌅 ఈరోజు ఉదయం (9 AM - 12 PM)',
      labelEn: '🌅 Today Morning (9 AM - 12 PM)',
      timeValue: 'Morning (9:00 AM - 12:00 PM)',
    },
    {
      id: 'today_afternoon' as const,
      icon: <Clock className="w-4 h-4 text-blue-600" />,
      labelTe: isHotel ? '☀️ స్టాండర్డ్ చెక్-ఇన్ (02:00 PM)' : '☀️ ఈరోజు మధ్యాహ్నం (1 PM - 4 PM)',
      labelEn: isHotel ? '☀️ Standard Check-in (02:00 PM)' : '☀️ Today Afternoon (1 PM - 4 PM)',
      timeValue: isHotel ? 'Check-in 02:00 PM' : 'Afternoon (1:00 PM - 4:00 PM)',
    },
    {
      id: 'today_evening' as const,
      icon: <Clock className="w-4 h-4 text-indigo-600" />,
      labelTe: '🌙 ఈరోజు సాయంత్రం (5 PM - 8 PM)',
      labelEn: '🌙 Today Evening (5 PM - 8 PM)',
      timeValue: 'Evening (5:00 PM - 8:00 PM)',
    },
    {
      id: 'tomorrow' as const,
      icon: <Calendar className="w-4 h-4 text-emerald-600" />,
      labelTe: '📅 రేపు చెక్-ఇన్ / ఉదయం',
      labelEn: '📅 Tomorrow Morning',
      timeValue: 'Tomorrow (10:00 AM)',
    },
  ];

  // Quick Area chips
  const quickAreas = currentLang === 'te'
    ? ['మాదాపూర్', 'గచ్చిబౌలి', 'కూకట్‌పల్లి', 'బంజారా హిల్స్', 'ఇంటి వద్దకే']
    : ['Madhapur', 'Gachibowli', 'Kukatpally', 'Banjara Hills', 'Home Visit'];

  // Start Voice Input for Name or Address
  const startVoiceInput = (field: 'name' | 'address') => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setActiveVoiceField(null);
      return;
    }

    if (activeVoiceField === field) {
      // stop listening
      try { recognitionRef.current?.stop(); } catch {}
      setActiveVoiceField(null);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = currentLang === 'te' ? 'te-IN' : currentLang === 'hi' ? 'hi-IN' : 'en-IN';

      recognition.onstart = () => {
        setActiveVoiceField(field);
      };

      recognition.onresult = (event: any) => {
        const spoken = event.results[0][0].transcript;
        if (field === 'name') {
          setCustomerName(spoken);
        } else if (field === 'address') {
          setCustomerAddress(spoken);
        }
        setActiveVoiceField(null);
      };

      recognition.onerror = () => {
        setActiveVoiceField(null);
      };

      recognition.onend = () => {
        setActiveVoiceField(null);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setActiveVoiceField(null);
    }
  };

  const selectedSlotObj = slotOptions.find(s => s.id === selectedSlotType) || slotOptions[0];

  // Dynamic UPI Details generated directly from provider & service price
  const cleanPhone = listing.providerPhone?.replace(/\D/g, '') || '9849012345';
  const cleanProviderName = listing.providerName || 'Service Specialist';
  const providerVpa = `${cleanPhone}@upi`;
  const upiTxnNote = `BookOurSpace: ${listing.title.slice(0, 24)}`;
  
  // Standard UPI URI specification: upi://pay?pa=...&pn=...&am=...&cu=INR&tn=...
  const upiUri = `upi://pay?pa=${encodeURIComponent(providerVpa)}&pn=${encodeURIComponent(cleanProviderName)}&am=${totalBookingAmount}&cu=INR&tn=${encodeURIComponent(upiTxnNote)}`;
  const bookingPassBarcodeId = generateBosBarcodeId('TKT', `${listing.id}-${customerPhone.slice(-4)}`, listing.categoryId);

  const continueToBookingAfterVerifiedPayment = () => {
    // Allow the verification state to commit before native form validation and
    // the existing authoritative booking submission run.
    window.setTimeout(() => bookingFormRef.current?.requestSubmit(), 0);
  };

  const handleRazorpayPayment = async () => {
    setIsRazorpayProcessing(true);
    setBookingConflictError(null);

    try {
      const order = await createRazorpayOrder({
        amount: totalBookingAmount,
        planOrListing: displayTitle,
        userId: getOrCreateClientSessionId(),
      });
      if (!order.ok || !order.keyId || !order.orderId || !order.intentId || !order.amountInPaise) {
        throw new Error(order.error || 'RAZORPAY_ORDER_FAILED');
      }

      const checkoutLoaded = await loadRazorpayCheckout();
      if (!checkoutLoaded || !window.Razorpay) {
        throw new Error('RAZORPAY_CHECKOUT_UNAVAILABLE');
      }

      const checkout = new window.Razorpay({
        key: order.keyId,
        amount: order.amountInPaise,
        currency: order.currency || 'INR',
        name: 'BookOurSpace',
        description: `${displayTitle} booking`,
        order_id: order.orderId,
        prefill: {
          name: customerName,
          contact: customerPhone,
        },
        notes: {
          bookourspace_intent_id: order.intentId,
          listing_id: listing.id,
        },
        theme: { color: '#4A148C' },
        handler: async (response) => {
          const verification = await verifyRazorpayPayment({
            intentId: order.intentId!,
            razorpayOrderId: response.razorpay_order_id,
            razorpayPaymentId: response.razorpay_payment_id,
            razorpaySignature: response.razorpay_signature,
          });
          if (!verification.ok || !verification.verified) {
            setBookingConflictError(
              verification.error || 'Razorpay payment could not be server-verified. No booking was confirmed.'
            );
            setIsRazorpayProcessing(false);
            return;
          }

          setPaymentIntentId(order.intentId!);
          setPaymentVerificationToken(verification.paymentVerificationToken || '');
          setQrTxId(`RZP-${response.razorpay_payment_id}`);
          setQrVerified(true);
          setIsRazorpayProcessing(false);
          continueToBookingAfterVerifiedPayment();
        },
        modal: {
          ondismiss: () => setIsRazorpayProcessing(false),
        },
      });
      checkout.open();
    } catch (error: any) {
      setBookingConflictError(
        error?.message === 'RAZORPAY_CHECKOUT_UNAVAILABLE'
          ? 'Razorpay Checkout could not load. Check network access and try again.'
          : 'Razorpay test order could not be created. No booking or payment was confirmed.'
      );
      setIsRazorpayProcessing(false);
    }
  };

  const handleVerifyQrPayment = async () => {
    setIsVerifyingQr(true);
    setBookingConflictError(null);
    try {
      let activeIntentId = paymentIntentId;
      if (!activeIntentId) {
        const intentRes = await createServerPaymentIntent({
          amount: totalBookingAmount,
          merchantVpa: providerVpa,
          planOrListing: listing.title,
        });
        if (intentRes.ok && intentRes.intentId) {
          activeIntentId = intentRes.intentId;
          setPaymentIntentId(activeIntentId);
        }
      }

      const generatedUtr = `${Date.now()}${Math.floor(10 + Math.random() * 89)}`.slice(-12);
      const verifyRes = await verifyServerUpiPayment({
        intentId: activeIntentId || `INT-${Date.now()}`,
        utrNumber: generatedUtr,
        amount: totalBookingAmount,
        merchantVpa: providerVpa,
        simulateBankWebhookSettlement: true,
      });

      if (verifyRes.ok && verifyRes.verified) {
        setQrTxId(`UTR-${generatedUtr}`);
        setPaymentVerificationToken(verifyRes.paymentVerificationToken || '');
        setQrVerified(true);
        continueToBookingAfterVerifiedPayment();
      } else {
        setQrTxId(`PENDING-UTR-${generatedUtr}`);
        setQrVerified(false);
        setBookingConflictError(
          verifyRes.message ||
            'UTR recorded as pending bank reconciliation. Server verification required before marking paid.'
        );
      }
    } finally {
      setIsVerifyingQr(false);
    }
  };

  const handleCopyUpi = () => {
    try {
      if (navigator?.clipboard?.writeText) {
        navigator.clipboard.writeText(providerVpa);
      }
    } catch {}
    setCopiedUpi(true);
    setTimeout(() => setCopiedUpi(false), 2000);
  };

  // Format date nicely in Telugu / Hindi / English
  const formatDisplayDate = (isoStr: string) => {
    const parts = isoStr.split('-').map(Number);
    const dt = new Date(parts[0] || 2026, (parts[1] || 1) - 1, parts[2] || 1);
    const locale = currentLang === 'te' ? 'te-IN' : currentLang === 'hi' ? 'hi-IN' : 'en-IN';
    try {
      return dt.toLocaleDateString(locale, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return isoStr;
    }
  };

  // Calendar grid generation for current calendarMonth
  const daysInMonth = new Date(calendarMonth.year, calendarMonth.month + 1, 0).getDate();
  const firstDayOfWeek = new Date(calendarMonth.year, calendarMonth.month, 1).getDay();
  const monthLabel = (() => {
    const dt = new Date(calendarMonth.year, calendarMonth.month, 1);
    const locale = currentLang === 'te' ? 'te-IN' : currentLang === 'hi' ? 'hi-IN' : 'en-IN';
    try {
      return dt.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
    } catch {
      return `${calendarMonth.month + 1}/${calendarMonth.year}`;
    }
  })();

  const weekdayHeaders =
    currentLang === 'te'
      ? ['ఆది', 'సోమ', 'మంగళ', 'బుధ', 'గురు', 'శుక్ర', 'శని']
      : currentLang === 'hi'
      ? ['रवि', 'सोम', 'मंगल', 'बुध', 'गुरु', 'शुक्र', 'शनि']
      : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const handlePrevMonth = () => {
    setCalendarMonth((prev) =>
      prev.month === 0 ? { year: prev.year - 1, month: 11 } : { year: prev.year, month: prev.month - 1 }
    );
  };

  const handleNextMonth = () => {
    setCalendarMonth((prev) =>
      prev.month === 11 ? { year: prev.year + 1, month: 0 } : { year: prev.year, month: prev.month + 1 }
    );
  };

  const handleSelectCalendarDate = (dateIso: string) => {
    if (dateIso < todayIso) return;
    if (isRangeBooking) {
      if (isHotel && hotelStayMode === 'hourly') {
        setSelectedBookingDate(dateIso);
        setSelectedCheckoutDate(dateIso);
        return;
      }
      if (activeRangeEdge === 'checkIn' || dateIso < selectedBookingDate) {
        setSelectedBookingDate(dateIso);
        if (selectedCheckoutDate <= dateIso) {
          setSelectedCheckoutDate(
            isHotel && hotelStayMode === 'weekly'
              ? addDaysIso(dateIso, 7)
              : isHotel && hotelStayMode === 'monthly'
              ? addDaysIso(dateIso, 30)
              : addDaysIso(dateIso, 1)
          );
        }
        setActiveRangeEdge('checkOut');
        return;
      }
      // Selecting check-out date
      const finalCheckout = dateIso <= selectedBookingDate ? addDaysIso(selectedBookingDate, 1) : dateIso;
      setSelectedCheckoutDate(finalCheckout);
      setActiveRangeEdge('checkIn');
      return;
    }

    setSelectedBookingDate(dateIso);
    setSelectedCheckoutDate(dateIso);
    if (dateIso === tomorrowIso) {
      setSelectedSlotType('tomorrow');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBookingConflictError(null);
    triggerGlobalGlobeLoader('Confirming Booking & Generating GST Invoice...', 650);

    if (paymentMode === 'razorpay' && (!qrVerified || !paymentVerificationToken || !paymentIntentId)) {
      setBookingConflictError('Complete and verify the Razorpay checkout before confirming this booking.');
      return;
    }

    const finalTxId = qrVerified
      ? qrTxId
      : paymentMode !== 'pay_later'
      ? `PENDING-RECON-${Date.now().toString().slice(-6)}`
      : undefined;
    const effectiveCheckOut = isRangeBooking ? selectedCheckoutDate : selectedBookingDate;
    const checkInDateTimeVal = isHotel ? `${selectedBookingDate}T${hotelCheckInTime}` : undefined;
    const checkOutDateTimeVal = isHotel ? `${effectiveCheckOut}T${hotelCheckOutTime}` : undefined;
    const dateRangeSummary = isRangeBooking
      ? `${selectedBookingDate}${isHotel ? ` (${hotelCheckInTime})` : ''} → ${effectiveCheckOut}${isHotel ? ` (${hotelCheckOutTime})` : ''} (${durationDays} ${isHotel ? 'night(s)' : 'day(s)'})`
      : selectedBookingDate;

    const computedTimeSlot = isHotel
      ? `${hotelStayMode.toUpperCase()} (${dateRangeSummary} • ${selectedSlotObj.timeValue})`
      : isVenue
      ? `VENUE EVENT (${dateRangeSummary} • ${selectedSlotObj.timeValue})`
      : `${selectedBookingDate} • ${selectedSlotObj.timeValue}`;

    const idempotencyKey = `booking:${listing.id}:${selectedBookingDate}:${computedTimeSlot}:${customerPhone.trim()}`;

    const atomicRes = await createAuthoritativeBookingAtomic({
      idempotencyKey,
      listingId: listing.id,
      listingTitle: displayTitle,
      providerId: listing.providerId,
      customerUserId: getOrCreateClientSessionId(),
      customerName,
      customerPhone,
      customerAddress,
      scheduledDate: selectedBookingDate,
      checkInDate: selectedBookingDate,
      checkOutDate: effectiveCheckOut,
      timeSlot: computedTimeSlot,
      totalAmount: totalBookingAmount,
      paymentMode,
      paymentIntentId: paymentIntentId || undefined,
      paymentUtr: finalTxId,
      paymentVerificationToken: paymentVerificationToken || undefined,
      passCode: bookingPassBarcodeId,
      notes: notes || '',
      exclusiveSlot: true,
    });

    if (!atomicRes.ok && atomicRes.status === 409) {
      setBookingConflictError(
        atomicRes.message || 'This date and time slot was just reserved by another user. Please pick another slot.'
      );
      return;
    }

    if (!isAuthoritativeBookingAccepted(atomicRes)) {
      setBookingConflictError(
        atomicRes.message ||
          'The server could not validate this booking. No confirmation or payment success was recorded.'
      );
      return;
    }

    const issuedPassToken = atomicRes.booking?.qrPassToken || bookingPassBarcodeId;
    const resolvedPayStatus = atomicRes.booking?.paymentStatus || (qrVerified ? 'verified' : 'pending_verification');
    setSubmittedPaymentStatus(
      paymentMode !== 'pay_later'
        ? resolvedPayStatus === 'verified'
          ? 'verified'
          : 'pending_verification'
        : 'pay_later'
    );
    setSignedQrPassToken(issuedPassToken);

    // Idempotency / concurrency guard on local UI cache
    const isDuplicateConcurrentBooking = bookings.some(
      (b) =>
        b.listingId === listing.id &&
        b.scheduledDate === selectedBookingDate &&
        b.timeSlot === computedTimeSlot &&
        b.customerPhone === customerPhone &&
        b.status === 'confirmed'
    );

    if (!isDuplicateConcurrentBooking && !atomicRes.idempotentReplay) {
      createBooking({
        authoritativeBookingId: atomicRes.booking?.id,
        listingId: listing.id,
        listingTitle: displayTitle,
        providerId: listing.providerId,
        customerName,
        customerPhone,
        customerAddress,
        scheduledDate: selectedBookingDate,
        checkInDate: selectedBookingDate,
        checkOutDate: effectiveCheckOut,
        checkInDateTime: checkInDateTimeVal,
        checkOutDateTime: checkOutDateTimeVal,
        durationDays,
        invoiceNumber: `BOS-GST-2026-${Date.now().toString().slice(-4)}`,
        timeSlot: computedTimeSlot,
        totalAmount: totalBookingAmount,
        paymentStatus: atomicRes.booking?.paymentStatus || resolvedPayStatus,
        notes: paymentMode !== 'pay_later'
          ? `[Pass Barcode: ${issuedPassToken}] [Check-in: ${checkInDateTimeVal || selectedBookingDate}] [Check-out: ${checkOutDateTimeVal || effectiveCheckOut}] ${isHotel ? `[Stay Mode: ${hotelStayMode}] ` : ''}[Payment: ${resolvedPayStatus === 'verified' ? 'SERVER VERIFIED' : 'PENDING RECONCILIATION'} via ${paymentMode === 'razorpay' ? 'Razorpay' : 'Dynamic QR'} (₹${totalBookingAmount}, Ref: ${finalTxId})] [Time: ${selectedSlotObj.labelTe}] ${notes}`
          : `[Pass Barcode: ${issuedPassToken}] [Check-in: ${checkInDateTimeVal || selectedBookingDate}] [Check-out: ${checkOutDateTimeVal || effectiveCheckOut}] ${isHotel ? `[Stay Mode: ${hotelStayMode}] ` : ''}[Payment: Pay at Venue/Hotel / After Service] [Time: ${selectedSlotObj.labelTe}] ${notes ? notes : 'బుకింగ్'}`
      });
    }

    if (paymentMode !== 'pay_later' && resolvedPayStatus === 'verified') {
      recordPayment(
        'plan_subscription',
        totalBookingAmount,
        `Booking: ${displayTitle} (${issuedPassToken})`,
        paymentMode === 'razorpay' ? 'Razorpay Verified' : `UPI QR Verified (${providerVpa})`
      );
    }

    sendEnquiry(
      listing.id,
      `Action: ${t.bookNow}. Dates: ${dateRangeSummary}. Barcode Pass: ${issuedPassToken}. ${isHotel ? `Stay Mode: ${hotelStayMode} (₹${totalBookingAmount}). ` : ''}Mode: ${paymentMode === 'razorpay' ? (resolvedPayStatus === 'verified' ? 'Server-Verified Razorpay' : 'Razorpay Pending Verification') : paymentMode === 'pay_qr' ? (resolvedPayStatus === 'verified' ? 'Server-Verified Dynamic QR' : 'QR Pending Bank Reconciliation') : 'Pay After Work'}. Slot: ${selectedSlotObj.labelTe}. చిరునామా: ${customerAddress}`,
      customerName,
      customerPhone
    );

    if (paymentMode !== 'pay_later' && !qrTxId) {
      setQrTxId(finalTxId || `PENDING-RECON-${Date.now().toString().slice(-6)}`);
    }

    setSubmitted(true);
  };

  const isSubmittedPaymentVerified = submittedPaymentStatus === 'verified';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-2.5 backdrop-blur-sm sm:p-4">
      <div className="relative my-2 flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        
        {/* Header - 100% Telugu with clear icons */}
        <div className="sticky top-0 z-20 flex items-center justify-between gap-3 bg-gradient-to-r from-[#4A148C] via-purple-900 to-indigo-900 p-3.5 text-white sm:p-4">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <img
              src={listing.images?.[0]}
              alt=""
              className="h-12 w-16 shrink-0 rounded-xl border border-white/30 object-cover sm:h-14 sm:w-20"
            />
            <div className="min-w-0">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] text-amber-200">
                <Sparkles className="h-3.5 w-3.5" />
                <span>{displaySubcategory} · {t.bookNow}</span>
              </div>
              <h3 className="mt-1 line-clamp-2 text-sm font-black leading-tight text-white sm:text-base">
                {displayTitle}
              </h3>
              <p className="mt-1 flex items-center gap-1 truncate text-[10px] text-purple-100 sm:text-xs">
                <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-300" />
                <span>{t.verifiedPro}:</span>
                <strong className="truncate font-bold text-white">{displayProviderName}</strong>
                <span className="shrink-0 text-purple-200">· {distKm} km</span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/20 text-white transition-colors shrink-0 cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 space-y-4 overflow-y-auto p-3 text-xs sm:p-5">
          {submitted ? (
            <div className="py-8 text-center space-y-4 animate-in zoom-in-95 duration-200">
              <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto shadow-md">
                <CheckCircle2 className="w-10 h-10 stroke-[2.5]" />
              </div>
              <div className="space-y-1.5">
                {paymentMode !== 'pay_later' && (
                  <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-extrabold text-[11px] border ${isSubmittedPaymentVerified ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800' : 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800'}`}>
                    {paymentMode === 'razorpay' ? <CreditCard className="w-3.5 h-3.5" /> : <QrCode className="w-3.5 h-3.5" />}
                    <span>{isSubmittedPaymentVerified ? (paymentMode === 'razorpay' ? 'Razorpay Payment Verified' : currentLang === 'te' ? 'క్యూఆర్ పేమెంట్ వెరిఫై అయింది' : 'UPI QR Payment Verified') : (paymentMode === 'razorpay' ? 'Razorpay Payment Pending Verification' : currentLang === 'te' ? 'క్యూఆర్ పేమెంట్ రీకన్సిలియేషన్‌లో ఉంది' : 'UPI Payment Pending Reconciliation')}</span>
                  </div>
                )}
                <h4 className="font-black text-xl text-slate-900 dark:text-white">
                  {paymentMode !== 'pay_later'
                    ? (isSubmittedPaymentVerified ? (currentLang === 'te' ? '🎉 బుకింగ్ & పేమెంట్ పూర్తయింది!' : '🎉 Booking & Payment Confirmed!') : (currentLang === 'te' ? '✅ బుకింగ్ అందింది — పేమెంట్ వెరిఫికేషన్ పెండింగ్' : '✅ Booking Received — Payment Verification Pending'))
                    : (currentLang === 'te' ? '🎉 బుకింగ్ విజయవంతమైంది!' : '🎉 Booking Confirmed Successfully!')}
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 max-w-sm mx-auto leading-relaxed">
                  {paymentMode !== 'pay_later'
                    ? (isSubmittedPaymentVerified ? (paymentMode === 'razorpay'
                        ? `₹${effectivePrice.toLocaleString('en-IN')} was verified by Razorpay. ${displayProviderName} has received your booking.`
                        : currentLang === 'te'
                        ? `₹${effectivePrice.toLocaleString('en-IN')} విజయవంతంగా చెల్లించబడింది. ${displayProviderName} గారికి మీ సమాచారం పంపబడింది.`
                        : `₹${effectivePrice.toLocaleString('en-IN')} received via UPI QR. ${displayProviderName} will arrive at ${customerAddress}.`) : (currentLang === 'te'
                        ? 'మీ బుకింగ్ అభ్యర్థన అందింది. బ్యాంక్ రీకన్సిలియేషన్ పూర్తయ్యే వరకు పేమెంట్‌ను విజయవంతమైనదిగా పరిగణించవద్దు.'
                        : 'Your booking request was received. Do not treat the payment as successful until provider reconciliation is complete.'))
                    : (currentLang === 'te' 
                        ? `${displayProviderName} గారికి మీ సమాచారం పంపబడింది. కొద్ది సేపట్లో మీ ఫోన్ నంబర్ (${customerPhone}) కి కాల్ చేస్తారు.`
                        : `${displayProviderName} has been notified and will call you shortly at ${customerPhone}.`)}
                </p>
              </div>

              {/* Receipt Reference for QR payment */}
              {paymentMode !== 'pay_later' && (
                <div className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700 max-w-xs mx-auto text-left text-xs space-y-1.5 shadow-2xs">
                  <div className="flex justify-between text-slate-500 text-[11px]">
                    <span>{currentLang === 'te' ? 'ట్రాన్సాక్షన్ ID:' : 'Txn ID:'}</span>
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{qrTxId || `UPI-${Date.now().toString().slice(-8)}`}</span>
                  </div>
                  <div className="flex justify-between text-slate-500 text-[11px]">
                    <span>{currentLang === 'te' ? 'మొత్తం:' : 'Amount Paid:'}</span>
                    <span className="font-black text-emerald-600">₹{effectivePrice.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between text-slate-500 text-[11px]">
                    <span>{currentLang === 'te' ? 'నిపుణుడు:' : 'Provider:'}</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200 truncate max-w-[140px]">{displayProviderName}</span>
                  </div>
                </div>
              )}

              {/* Official Invoice Bill & Movie Ticket Barcode (Displayed ONLY for Movie Tickets & Invoice Bills) */}
              {(isMovie || paymentMode !== 'pay_later') && (
                <div className="text-left">
                  <UniversalBarcode
                    value={signedQrPassToken || bookingPassBarcodeId}
                    displayCode={
                      isMovie
                        ? generateBosBarcodeId('TKT', `${listing.id}-${customerPhone.slice(-4)}`, 'movie')
                        : generateBosBarcodeId('GST', qrTxId || `${listing.id}-${customerPhone.slice(-4)}`, 'gst')
                    }
                    label={
                      isMovie
                        ? '🎬 Movie Ticket & Seat Entry Barcode'
                        : '🧾 Official Invoice Bill & Receipt Barcode'
                    }
                    sublabel={`${displayTitle} • ${customerName} (${customerPhone}) • ${selectedSlotObj.timeValue} • ₹${effectivePrice.toLocaleString('en-IN')}${displayPriceUnit}`}
                    moduleTag={isMovie ? 'movie' : 'gst'}
                    variant="full"
                    showQr={true}
                  />
                </div>
              )}

              {/* Direct call, GST PDF Invoice & Review actions */}
              <div className="pt-2 flex flex-wrap items-center justify-center gap-2.5">
                <button
                  type="button"
                  onClick={() =>
                    generateBookingGSTReceiptPDF(
                      {
                        id: qrTxId || `BK-${Date.now().toString().slice(-5)}`,
                        listingId: listing.id,
                        listingTitle: displayTitle,
                        providerId: listing.providerId,
                        customerName,
                        customerPhone,
                        customerAddress,
                        scheduledDate: selectedBookingDate,
                        checkInDate: selectedBookingDate,
                        checkOutDate: isRangeBooking ? selectedCheckoutDate : selectedBookingDate,
                        checkInDateTime: isHotel ? `${selectedBookingDate}T${hotelCheckInTime}` : undefined,
                        checkOutDateTime: isHotel ? `${selectedCheckoutDate}T${hotelCheckOutTime}` : undefined,
                        durationDays,
                        timeSlot: selectedSlotObj.timeValue,
                        totalAmount: totalBookingAmount,
                        status: 'confirmed',
                        createdAt: new Date().toLocaleDateString('en-IN'),
                      },
                      {
                        name: customerName,
                        phone: customerPhone,
                        billingAddress: customerAddress,
                      },
                      'download'
                    )
                  }
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-[#3730A3] hover:bg-indigo-800 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
                >
                  <span>📄 Download Formal GST PDF Receipt</span>
                </button>

                <a
                  href={`tel:${listing.providerPhone}`}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-md transition active:scale-95"
                >
                  <PhoneCall className="w-4 h-4" />
                  <span>{currentLang === 'te' ? `కాల్ చేయండి (${listing.providerPhone})` : `Call Provider`}</span>
                </a>

                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    if (onOpenReview) {
                      onOpenReview(listing);
                    }
                  }}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 shadow-md transition active:scale-95 cursor-pointer"
                >
                  <Star className="w-4 h-4 fill-current text-slate-950" />
                  <span>{currentLang === 'te' ? '⭐ రేటింగ్ & సమీక్ష ఇవ్వండి' : '⭐ Rate this Service'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSubmitted(false);
                    onClose();
                  }}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-slate-900 dark:bg-slate-700 text-white font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>{currentLang === 'te' ? 'పూర్తయింది' : 'Done & Close'}</span>
                </button>
              </div>
            </div>
          ) : (
            <form ref={bookingFormRef} onSubmit={handleSubmit} className="space-y-4">
              
              {/* DIRECT 1-TAP INSTANT CALL BANNER (NO TYPING NEEDED FOR UNEDUCATED USERS) */}
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-950/40">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
                    <PhoneCall className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <span className="block text-[9px] font-black uppercase tracking-[0.12em] text-emerald-800 dark:text-emerald-300">
                      {currentLang === 'te' ? 'రాయడం కష్టంగా ఉందా? నేరుగా కాల్ చేయండి' : 'Need help? Direct Phone Call'}
                    </span>
                    <span className="block max-w-[48vw] truncate text-xs font-black text-emerald-950 dark:text-white sm:max-w-none sm:text-sm">
                      {displayProviderName} ({listing.providerPhone})
                    </span>
                  </div>
                </div>

                <a
                  href={`tel:${listing.providerPhone}`}
                  className="flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-600 px-3.5 py-2 text-xs font-black text-white shadow-sm transition-transform hover:bg-emerald-700 active:scale-95"
                >
                  <Phone className="w-3.5 h-3.5" />
                  <span>{t.callNow}</span>
                </a>
              </div>

              {/* 4-WAY HOTEL STAY DURATION SWITCHER (గంటల వారీ | రోజు వారీ | వారం | నెల) */}
              {isHotel && (
                <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-800/50">
                  <label className="flex items-center justify-between gap-3 text-[11px] font-black text-slate-800 dark:text-slate-100">
                    <span>
                      {currentLang === 'te'
                        ? '🏨 స్టే ప్యాకేజీ ఎంచుకోండి (గంటల వారీ / రోజు వారీ / వారం / నెల):'
                        : '🏨 Choose Stay Duration (Hourly / Daily / Weekly / Monthly):'}
                    </span>
                    <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-extrabold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                      15% OFF
                    </span>
                  </label>
                  <div className="grid grid-cols-4 gap-1 rounded-full border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900">
                    {[
                      { id: 'hourly' as const, label: currentLang === 'te' ? 'గంటల వారీ' : 'Hourly' },
                      { id: 'daily' as const, label: currentLang === 'te' ? 'రోజు వారీ' : 'Daily' },
                      { id: 'weekly' as const, label: currentLang === 'te' ? 'వారం' : 'Weekly' },
                      { id: 'monthly' as const, label: currentLang === 'te' ? 'నెల' : 'Monthly' },
                    ].map((tab) => {
                      const active = hotelStayMode === tab.id;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setHotelStayMode(tab.id)}
                          className={`py-2 px-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
                            active
                            ? 'bg-[#FF385C] text-white shadow-sm'
                              : 'text-slate-600 dark:text-slate-300 hover:text-[#4A148C]'
                          }`}
                        >
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Price Banner with Quick Pay via QR shortcut */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50/70 p-3 dark:border-rose-900/60 dark:bg-rose-950/30">
                <div>
                  <span className="block text-[10px] font-extrabold uppercase tracking-wider text-rose-700 dark:text-rose-300">
                    {t.pricing} ({currentLang === 'te' ? 'పన్నులతో కలిపి' : 'Inclusive of taxes'})
                  </span>
                  <div className="flex items-baseline gap-1 font-black text-base tabular-nums text-slate-950 dark:text-white">
                    <span>{listing.currency}{effectivePrice.toLocaleString('en-IN')}</span>
                    <span className="text-xs font-normal text-slate-500"> {displayPriceUnit}</span>
                  </div>
                </div>

                {/* Quick Action: Pay via QR Pill */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentMode(paymentMode === 'pay_qr' ? 'pay_later' : 'pay_qr')}
                    className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                      paymentMode === 'pay_qr'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                        : 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 hover:bg-emerald-50'
                    }`}
                  >
                    <QrCode className="w-3.5 h-3.5" />
                    <span>{currentLang === 'te' ? 'క్యూఆర్ ద్వారా చెల్లించండి' : 'Pay via QR'}</span>
                  </button>

                  <div className="text-right hidden sm:block">
                    <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-extrabold block">
                      ⚡ {isHotel ? 'Check-in: 02:00 PM (24/7 Flex)' : currentLang === 'te' ? '15-30 నిమిషాల్లో రాక' : '15-30 mins arrival'}
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                      📍 {distKm} km {t.away}
                    </span>
                  </div>
                </div>
              </div>

              {/* STEP 1: INTERACTIVE BOOKING CALENDAR + TIME SLOT SELECTION */}
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <label className="font-black text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-[#4A148C] text-white text-[11px] font-black flex items-center justify-center">1</span>
                    <Calendar className="w-4 h-4 text-[#4A148C] dark:text-purple-400" />
                    <span>
                      {isRangeBooking
                        ? currentLang === 'te'
                          ? 'చెక్-ఇన్ & చెక్-అవుట్ తేదీలను ఎంచుకోండి (క్యాలెండర్):'
                          : 'Select Check-in & Check-out Dates:'
                        : currentLang === 'te'
                        ? 'బుకింగ్ తేదీ & సమయం ఎంచుకోండి (క్యాలెండర్):'
                        : 'Select Booking Date & Time (Calendar):'}
                    </span>
                  </label>

                  <button
                    type="button"
                    onClick={() => setShowCalendarGrid((v) => !v)}
                    className="px-2.5 py-1 rounded-lg bg-purple-100 dark:bg-purple-950/70 text-[#4A148C] dark:text-purple-300 font-extrabold text-[11px] flex items-center gap-1 cursor-pointer hover:bg-purple-200 transition"
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    <span>
                      {showCalendarGrid
                        ? currentLang === 'te'
                          ? 'క్యాలెండర్ దాచు'
                          : 'Compact View'
                        : currentLang === 'te'
                        ? 'క్యాలెండర్ తెరువు'
                        : 'Open Calendar'}
                    </span>
                  </button>
                </div>

                {/* Quick 1-Tap Date Presets */}
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                  {[
                    {
                      label: currentLang === 'te' ? '📅 ఈరోజు (Today)' : '📅 Today',
                      iso: todayIso,
                    },
                    {
                      label: currentLang === 'te' ? '🌤️ రేపు (Tomorrow)' : '🌤️ Tomorrow',
                      iso: tomorrowIso,
                    },
                    {
                      label: currentLang === 'te' ? '📆 ఎల్లుండి (+2 రోజులు)' : '📆 Day After',
                      iso: addDaysIso(todayIso, 2),
                    },
                    {
                      label: currentLang === 'te' ? '🎉 ఈ వారాంతం (+4 రోజులు)' : '🎉 Weekend',
                      iso: addDaysIso(todayIso, 4),
                    },
                  ].map((preset) => {
                    const active = selectedBookingDate === preset.iso;
                    return (
                      <button
                        key={preset.iso}
                        type="button"
                        onClick={() => {
                          setSelectedBookingDate(preset.iso);
                          if (isRangeBooking && selectedCheckoutDate <= preset.iso) {
                            setSelectedCheckoutDate(addDaysIso(preset.iso, 1));
                          }
                          const [y, m] = preset.iso.split('-').map(Number);
                          setCalendarMonth({ year: y, month: m - 1 });
                        }}
                        className={`px-3 py-1.5 rounded-xl font-black text-[11px] whitespace-nowrap transition border cursor-pointer ${
                          active
                            ? 'bg-[#4A148C] text-white border-[#4A148C] shadow-xs'
                            : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-purple-400'
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>

                {/* Selected Date Summary Bar + Direct Native Date Input */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-2.5 rounded-2xl bg-purple-50/70 dark:bg-slate-800/80 border border-purple-200 dark:border-slate-700">
                  <div
                    onClick={() => isRangeBooking && setActiveRangeEdge('checkIn')}
                    className={`space-y-1 p-1.5 rounded-xl transition ${
                      isRangeBooking && activeRangeEdge === 'checkIn'
                        ? 'bg-white dark:bg-slate-900 ring-2 ring-[#4A148C] shadow-2xs'
                        : ''
                    }`}
                  >
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-purple-800 dark:text-purple-300 block">
                      {isRangeBooking
                        ? currentLang === 'te'
                          ? '🟢 1. చెక్-ఇన్ తేదీ (Check-in):'
                          : '🟢 1. Check-in Date:'
                        : currentLang === 'te'
                        ? '📅 ఎంచుకున్న బుకింగ్ తేదీ:'
                        : '📅 Selected Booking Date:'}
                    </span>
                    <input
                      type="date"
                      min={todayIso}
                      value={selectedBookingDate}
                      onChange={(e) => {
                        if (e.target.value) {
                          setSelectedBookingDate(e.target.value);
                          if (selectedCheckoutDate <= e.target.value) {
                            setSelectedCheckoutDate(addDaysIso(e.target.value, 1));
                          }
                          const [y, m] = e.target.value.split('-').map(Number);
                          setCalendarMonth({ year: y, month: m - 1 });
                        }
                      }}
                      className="w-full bg-white dark:bg-slate-900 border border-purple-300 dark:border-slate-600 rounded-xl px-2.5 py-1.5 font-black text-xs text-slate-900 dark:text-white outline-hidden focus:border-[#4A148C] cursor-pointer"
                    />
                    <div className="text-[11px] font-bold text-[#4A148C] dark:text-purple-300">
                      {formatDisplayDate(selectedBookingDate)}
                    </div>
                  </div>

                  {isRangeBooking ? (
                    <div
                      onClick={() => setActiveRangeEdge('checkOut')}
                      className={`space-y-1 p-1.5 rounded-xl transition ${
                        activeRangeEdge === 'checkOut'
                          ? 'bg-white dark:bg-slate-900 ring-2 ring-indigo-600 shadow-2xs'
                          : ''
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-800 dark:text-indigo-300">
                          {currentLang === 'te' ? '🔴 2. చెక్-అవుట్ తేదీ (Check-out):' : '🔴 2. Check-out Date:'}
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-200 text-[10px] font-black">
                          {durationDays} {isHotel ? (currentLang === 'te' ? 'రాత్రులు' : 'Night(s)') : (currentLang === 'te' ? 'రోజులు' : 'Day(s)')}
                        </span>
                      </div>
                      <input
                        type="date"
                        min={isHotel && hotelStayMode === 'hourly' ? selectedBookingDate : addDaysIso(selectedBookingDate, 1)}
                        value={selectedCheckoutDate}
                        onChange={(e) => {
                          if (e.target.value) {
                            setSelectedCheckoutDate(e.target.value);
                          }
                        }}
                        className="w-full bg-white dark:bg-slate-900 border border-indigo-300 dark:border-slate-600 rounded-xl px-2.5 py-1.5 font-black text-xs text-slate-900 dark:text-white outline-hidden focus:border-indigo-600 cursor-pointer"
                      />
                      <div className="text-[11px] font-bold text-indigo-700 dark:text-indigo-300">
                        {formatDisplayDate(selectedCheckoutDate)}
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col justify-center p-2 rounded-xl bg-white/80 dark:bg-slate-900/70 border border-purple-100 dark:border-slate-700">
                      <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                        {currentLang === 'te' ? 'ఎంచుకున్న తేదీ & స్లాట్:' : 'Scheduled Date & Slot:'}
                      </span>
                      <span className="font-black text-xs text-slate-900 dark:text-white mt-0.5">
                        {formatDisplayDate(selectedBookingDate)}
                      </span>
                      <span className="text-[11px] font-extrabold text-emerald-600 dark:text-emerald-400">
                        {currentLang === 'te' ? selectedSlotObj.labelTe : selectedSlotObj.labelEn}
                      </span>
                    </div>
                  )}
                </div>

                {/* INTERACTIVE VISUAL MONTH CALENDAR GRID */}
                {showCalendarGrid && (
                  <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border-2 border-purple-200 dark:border-slate-700 shadow-xs space-y-2.5">
                    {isRangeBooking && (
                      <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-slate-100 dark:border-slate-800 text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setActiveRangeEdge('checkIn')}
                            className={`px-2.5 py-1 rounded-lg font-black cursor-pointer transition ${
                              activeRangeEdge === 'checkIn'
                                ? 'bg-[#4A148C] text-white'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                            }`}
                          >
                            {currentLang === 'te' ? '1. చెక్-ఇన్ ఎంచుకోండి' : '1. Pick Check-in'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setActiveRangeEdge('checkOut')}
                            className={`px-2.5 py-1 rounded-lg font-black cursor-pointer transition ${
                              activeRangeEdge === 'checkOut'
                                ? 'bg-indigo-600 text-white'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                            }`}
                          >
                            {currentLang === 'te' ? '2. చెక్-అవుట్ ఎంచుకోండి' : '2. Pick Check-out'}
                          </button>
                        </div>
                        <span className="font-black text-emerald-700 dark:text-emerald-400">
                          ₹{totalBookingAmount.toLocaleString('en-IN')} ({durationDays}d)
                        </span>
                      </div>
                    )}

                    {/* Month & Year Navigation Header */}
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={handlePrevMonth}
                        className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-purple-100 text-slate-700 dark:text-slate-200 transition cursor-pointer"
                        aria-label="Previous Month"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>

                      <div className="font-black text-xs sm:text-sm text-[#4A148C] dark:text-purple-300 flex items-center gap-1.5">
                        <Calendar className="w-4 h-4" />
                        <span>{monthLabel}</span>
                      </div>

                      <button
                        type="button"
                        onClick={handleNextMonth}
                        className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-purple-100 text-slate-700 dark:text-slate-200 transition cursor-pointer"
                        aria-label="Next Month"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Weekday Header Row */}
                    <div className="grid grid-cols-7 gap-1 text-center">
                      {weekdayHeaders.map((dayName) => (
                        <div
                          key={dayName}
                          className="text-[10px] font-black text-slate-400 dark:text-slate-500 py-1"
                        >
                          {dayName}
                        </div>
                      ))}
                    </div>

                    {/* Days Grid */}
                    <div className="grid grid-cols-7 gap-1">
                      {Array.from({ length: firstDayOfWeek }).map((_, emptyIdx) => (
                        <div key={`empty-${emptyIdx}`} className="h-8" />
                      ))}

                      {Array.from({ length: daysInMonth }).map((_, idx) => {
                        const dayNum = idx + 1;
                        const cellIso = `${calendarMonth.year}-${String(calendarMonth.month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                        const isPast = cellIso < todayIso;
                        const isToday = cellIso === todayIso;
                        const isSelectedStart = cellIso === selectedBookingDate;
                        const isSelectedEnd = isRangeBooking && cellIso === selectedCheckoutDate;
                        const isInRange =
                          isRangeBooking &&
                          cellIso > selectedBookingDate &&
                          cellIso < selectedCheckoutDate;

                        return (
                          <button
                            key={cellIso}
                            type="button"
                            disabled={isPast}
                            onClick={() => handleSelectCalendarDate(cellIso)}
                            className={`h-8 sm:h-9 rounded-xl font-black text-xs flex flex-col items-center justify-center transition-all relative ${
                              isPast
                                ? 'text-slate-300 dark:text-slate-700 cursor-not-allowed opacity-45'
                                : isSelectedStart
                                ? 'bg-[#4A148C] text-white shadow-sm ring-2 ring-purple-300 cursor-pointer scale-105 z-10'
                                : isSelectedEnd
                                ? 'bg-indigo-600 text-white shadow-sm ring-2 ring-indigo-300 cursor-pointer scale-105 z-10'
                                : isInRange
                                ? 'bg-purple-100 dark:bg-purple-900/50 text-purple-900 dark:text-purple-200 cursor-pointer'
                                : isToday
                                ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border border-amber-400 cursor-pointer hover:bg-purple-100'
                                : 'bg-slate-50 dark:bg-slate-800/70 text-slate-800 dark:text-slate-200 hover:bg-purple-100 dark:hover:bg-purple-900/40 cursor-pointer'
                            }`}
                          >
                            <span>{dayNum}</span>
                            {isToday && !isSelectedStart && (
                              <span className="w-1 h-1 rounded-full bg-amber-500 absolute bottom-1" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Time Slot Selection Buttons */}
                <div className="pt-1 space-y-1.5">
                  <span className="text-[11px] font-black text-slate-700 dark:text-slate-300 block">
                    {currentLang === 'te' ? '⏰ సమయం స్లాట్ ఎంచుకోండి:' : '⏰ Choose Preferred Time Slot:'}
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {slotOptions.map((opt) => {
                      const isSelected = selectedSlotType === opt.id;
                      const labelText = currentLang === 'te' ? opt.labelTe : opt.labelEn;
                      return (
                        <button
                          type="button"
                          key={opt.id}
                          onClick={() => {
                            setSelectedSlotType(opt.id);
                            if (opt.id === 'tomorrow') {
                              setSelectedBookingDate(tomorrowIso);
                            }
                          }}
                          className={`p-2.5 rounded-xl border text-left flex items-center gap-2 transition-all font-bold text-xs cursor-pointer ${
                            isSelected
                              ? 'bg-[#4A148C] text-white border-[#4A148C] shadow-sm scale-101 ring-2 ring-purple-300'
                              : 'bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-purple-300'
                          }`}
                        >
                          <div className={`p-1.5 rounded-lg ${isSelected ? 'bg-white/20 text-white' : 'bg-white dark:bg-slate-900'}`}>
                            {opt.icon}
                          </div>
                          <span className="truncate">{labelText}</span>
                          {isSelected && <Check className="w-4 h-4 ml-auto text-amber-300 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* STEP 2: NAME (WITH VOICE SPEAK BUTTON) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="font-black text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-[#4A148C] text-white text-[11px] font-black flex items-center justify-center">2</span>
                    <span>{currentLang === 'te' ? 'మీ పేరు:' : 'Your Name:'}</span>
                  </label>

                  <button
                    type="button"
                    onClick={() => startVoiceInput('name')}
                    className={`text-[11px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 border transition cursor-pointer ${
                      activeVoiceField === 'name'
                        ? 'bg-red-500 text-white border-red-500 animate-pulse'
                        : 'bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300 border-purple-200 hover:bg-purple-100'
                    }`}
                  >
                    {activeVoiceField === 'name' ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
                    <span>{activeVoiceField === 'name' ? (currentLang === 'te' ? 'వింటున్నాము...' : 'Listening...') : (currentLang === 'te' ? 'మైక్‌లో చెప్పండి' : 'Speak Name')}</span>
                  </button>
                </div>

                <div className="relative">
                  <User className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder={currentLang === 'te' ? 'మీ పేరు రాయండి (ఉదా: రమేష్)' : 'Enter your name'}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl pl-9 pr-3 py-2.5 font-bold text-xs sm:text-sm text-slate-900 dark:text-white outline-hidden focus:border-purple-600 focus:ring-1 focus:ring-purple-600"
                  />
                </div>
              </div>

              {/* STEP 3: MOBILE NUMBER (BIG, CLEAR NUMERIC INPUT) */}
              <div className="space-y-1.5">
                <label className="font-black text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-[#4A148C] text-white text-[11px] font-black flex items-center justify-center">3</span>
                  <span>{currentLang === 'te' ? 'మీ ఫోన్ నంబర్:' : 'Your Phone Number:'}</span>
                </label>

                <div className="relative">
                  <Phone className="absolute left-3 top-3 w-4 h-4 text-emerald-600" />
                  <div className="absolute left-9 top-2.5 text-xs font-bold text-slate-400">
                    +91
                  </div>
                  <input
                    type="tel"
                    required
                    maxLength={10}
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value.replace(/\D/g, ''))}
                    placeholder="9849012345"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl pl-17 pr-3 py-2.5 font-black text-sm tracking-wider text-slate-900 dark:text-white outline-hidden focus:border-purple-600 focus:ring-1 focus:ring-purple-600"
                  />
                </div>
                <p className="text-[10px] text-slate-400">
                  {currentLang === 'te' ? 'నిపుణుడు ఈ నంబర్‌కు కాల్ చేసి మీ ఇంటికి వస్తారు.' : 'Provider will call this number for confirmation.'}
                </p>
              </div>

              {/* STEP 4: ADDRESS / AREA (WITH FAST TAP CHIPS & VOICE INPUT) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="font-black text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-[#4A148C] text-white text-[11px] font-black flex items-center justify-center">4</span>
                    <span>{currentLang === 'te' ? 'మీ ప్రాంతం / చిరునామా:' : 'Your Area / Address:'}</span>
                  </label>

                  <button
                    type="button"
                    onClick={() => startVoiceInput('address')}
                    className={`text-[11px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 border transition cursor-pointer ${
                      activeVoiceField === 'address'
                        ? 'bg-red-500 text-white border-red-500 animate-pulse'
                        : 'bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300 border-purple-200 hover:bg-purple-100'
                    }`}
                  >
                    {activeVoiceField === 'address' ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
                    <span>{activeVoiceField === 'address' ? (currentLang === 'te' ? 'వింటున్నాము...' : 'Listening...') : (currentLang === 'te' ? 'మైక్‌లో చెప్పండి' : 'Speak Address')}</span>
                  </button>
                </div>

                <div className="relative">
                  <MapPin className="absolute left-3 top-3 w-4 h-4 text-purple-600" />
                  <input
                    type="text"
                    required
                    value={customerAddress}
                    onChange={(e) => setCustomerAddress(e.target.value)}
                    placeholder={currentLang === 'te' ? 'ఇంటి నంబర్, ప్రాంతం, ల్యాండ్‌మార్క్' : 'House no, area, landmark'}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl pl-9 pr-3 py-2.5 font-bold text-xs sm:text-sm text-slate-900 dark:text-white outline-hidden focus:border-purple-600 focus:ring-1 focus:ring-purple-600"
                  />
                </div>

                {/* Quick area chips for 1-tap select */}
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1">
                  <span className="text-[10px] text-slate-400 shrink-0 font-medium">{currentLang === 'te' ? 'త్వరిత ఎంపిక:' : 'Quick:'}</span>
                  {quickAreas.map((area) => (
                    <button
                      type="button"
                      key={area}
                      onClick={() => setCustomerAddress(`${area}, హైదరాబాద్`)}
                      className="px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-purple-100 text-slate-700 dark:text-slate-300 font-bold text-[10px] whitespace-nowrap transition border border-slate-200 dark:border-slate-700 cursor-pointer"
                    >
                      + {area}
                    </button>
                  ))}
                </div>
              </div>

              {/* STEP 5: PAYMENT OPTION - PAY LATER VS DYNAMIC PAY VIA QR */}
              <div className="space-y-2 pt-1">
                <label className="font-black text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-[#4A148C] text-white text-[11px] font-black flex items-center justify-center">5</span>
                  <span>{currentLang === 'te' ? 'చెల్లింపు విధానం (Payment Option):' : 'Select Payment Option:'}</span>
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {/* Option 1: Pay After Service */}
                  <button
                    type="button"
                    onClick={() => setPaymentMode('pay_later')}
                    className={`p-3 rounded-2xl border text-left transition flex items-start gap-2.5 cursor-pointer ${
                      paymentMode === 'pay_later'
                        ? 'bg-purple-50 dark:bg-purple-950/60 border-purple-600 text-purple-950 dark:text-white ring-2 ring-purple-400/40 shadow-xs'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-purple-300'
                    }`}
                  >
                    <div className={`p-2 rounded-xl shrink-0 ${paymentMode === 'pay_later' ? 'bg-purple-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'}`}>
                      <Clock className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-black text-xs flex items-center gap-1">
                        <span>{currentLang === 'te' ? 'సర్వీస్ తర్వాత చెల్లించండి' : 'Pay After Service'}</span>
                        {paymentMode === 'pay_later' && <Check className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 ml-auto" />}
                      </div>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                        {currentLang === 'te' ? 'పని పూర్తయిన తర్వాత నగదు లేదా యూపీఐ ద్వారా ఇవ్వండి.' : 'Cash or UPI after work is completed at doorstep.'}
                      </p>
                    </div>
                  </button>

                  {/* Option 2: Pay via QR (Dynamic QR Code) */}
                  <button
                    type="button"
                    onClick={() => setPaymentMode('pay_qr')}
                    className={`p-3 rounded-2xl border text-left transition flex items-start gap-2.5 cursor-pointer ${
                      paymentMode === 'pay_qr'
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-600 text-emerald-950 dark:text-white ring-2 ring-emerald-400/40 shadow-xs'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-emerald-300'
                    }`}
                  >
                    <div className={`p-2 rounded-xl shrink-0 ${paymentMode === 'pay_qr' ? 'bg-emerald-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'}`}>
                      <QrCode className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-black text-xs flex items-center gap-1">
                        <span>{currentLang === 'te' ? 'క్యూఆర్ ద్వారా చెల్లించండి' : 'Pay via QR'}</span>
                        <span className="text-[9px] font-black bg-emerald-600 text-white px-1.5 py-0.2 rounded-full uppercase">Instant</span>
                        {paymentMode === 'pay_qr' && <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 ml-auto" />}
                      </div>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                        {currentLang === 'te' ? 'Google Pay, PhonePe, Paytm తో నేరుగా స్కాన్ చేయండి.' : 'Scan with GPay, PhonePe, Paytm & BHIM.'}
                      </p>
                    </div>
                  </button>

                  {/* Option 3: Razorpay test-mode checkout */}
                  <button
                    type="button"
                    onClick={() => setPaymentMode('razorpay')}
                    className={`p-3 rounded-2xl border text-left transition flex items-start gap-2.5 cursor-pointer ${
                      paymentMode === 'razorpay'
                        ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-600 text-indigo-950 dark:text-white ring-2 ring-indigo-400/40 shadow-xs'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-indigo-300'
                    }`}
                  >
                    <div className={`p-2 rounded-xl shrink-0 ${paymentMode === 'razorpay' ? 'bg-indigo-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'}`}>
                      <CreditCard className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-black text-xs flex items-center gap-1">
                        <span>Razorpay</span>
                        <span className="text-[9px] font-black bg-indigo-600 text-white px-1.5 py-0.2 rounded-full uppercase">Test</span>
                        {paymentMode === 'razorpay' && <Check className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 ml-auto" />}
                      </div>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                        Secure card, UPI, and netbanking checkout with server verification.
                      </p>
                    </div>
                  </button>
                </div>

                {/* DYNAMIC PAY VIA QR PANEL (DISPLAYS WHEN PAY VIA QR IS SELECTED) */}
                {paymentMode === 'pay_qr' && (
                  <div className="mt-3 p-4 rounded-3xl bg-gradient-to-b from-emerald-50/90 via-white to-emerald-50/40 dark:from-emerald-950/50 dark:via-slate-900 dark:to-emerald-950/30 border-2 border-emerald-500/50 dark:border-emerald-500/40 space-y-3.5 shadow-md animate-in slide-in-from-top-2 duration-200">
                    
                    {/* QR Header */}
                    <div className="flex items-center justify-between pb-2 border-b border-emerald-200 dark:border-emerald-900/60">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                          <QrCode className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="font-black text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                            <span>{currentLang === 'te' ? 'డైనమిక్ యూపీఐ క్యూఆర్ కోడ్' : 'Dynamic UPI Payment QR'}</span>
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          </h4>
                          <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-bold">
                            {currentLang === 'te' ? 'ఖచ్చితమైన మొత్తం ఆటోమేటిక్‌గా సెట్ చేయబడింది' : 'Amount auto-configured for 1-scan pay'}
                          </span>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-sm sm:text-base font-black text-emerald-700 dark:text-emerald-300">
                          ₹{effectivePrice.toLocaleString('en-IN')}
                        </span>
                      </div>
                    </div>

                    {/* UPI Payment VPA Info */}

                    {/* Provider Details & 1-Tap App Links */}
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4 py-1">

                      {/* Provider Details & 1-Tap App Links */}
                      <div className="space-y-2.5 text-xs flex-1 w-full sm:w-auto">
                        <div className="p-2.5 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1">
                          <div className="text-[10px] uppercase font-bold text-slate-400">
                            {currentLang === 'te' ? 'స్వీకర్త (నిపుణుడు):' : 'Payee Pro:'}
                          </div>
                          <div className="font-black text-xs sm:text-sm text-slate-900 dark:text-white flex items-center justify-between">
                            <span className="truncate">{displayProviderName}</span>
                            <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 ml-1" />
                          </div>

                          <div className="pt-1 flex items-center justify-between text-[11px] font-mono text-slate-600 dark:text-slate-300 border-t border-slate-100 dark:border-slate-700">
                            <span className="truncate">{providerVpa}</span>
                            <button
                              type="button"
                              onClick={handleCopyUpi}
                              className="text-purple-600 dark:text-purple-400 hover:text-purple-800 font-bold flex items-center gap-0.5 ml-2 shrink-0 cursor-pointer text-[10px]"
                            >
                              {copiedUpi ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                              <span>{copiedUpi ? (currentLang === 'te' ? 'కాపీ అయింది!' : 'Copied!') : (currentLang === 'te' ? 'కాపీ' : 'Copy')}</span>
                            </button>
                          </div>
                        </div>

                        {/* Supported UPI Apps Pills */}
                        <div>
                          <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                            {currentLang === 'te' ? 'ఏదైనా యూపీఐ యాప్‌తో స్కాన్ చేయండి:' : 'Scan with any UPI App:'}
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {['Google Pay', 'PhonePe', 'Paytm', 'BHIM', 'CRED'].map((app) => (
                              <span key={app} className="px-2 py-0.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10px] font-black rounded-md text-slate-700 dark:text-slate-300">
                                {app}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Direct Open in UPI App Deep Link & Verify Button */}
                        <div className="pt-1 flex items-center gap-2">
                          <a
                            href={upiUri}
                            className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-xs transition active:scale-95 text-center cursor-pointer"
                          >
                            <Smartphone className="w-3.5 h-3.5" />
                            <span>{currentLang === 'te' ? 'యూపీఐ యాప్‌లో తెరవండి' : 'Open in UPI App'}</span>
                            <ExternalLink className="w-3 h-3 opacity-80" />
                          </a>

                          <button
                            type="button"
                            onClick={handleVerifyQrPayment}
                            disabled={isVerifyingQr || qrVerified}
                            className={`py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1 transition cursor-pointer border ${
                              qrVerified
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300'
                                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            {isVerifyingQr ? (
                              <span className="w-3 h-3 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                            ) : qrVerified ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Check className="w-3.5 h-3.5" />
                            )}
                            <span>
                              {qrVerified 
                                ? (currentLang === 'te' ? 'ధృవీకరించబడింది ✓' : 'Verified ✓')
                                : isVerifyingQr 
                                ? (currentLang === 'te' ? 'పరిశీలిస్తున్నాము...' : 'Verifying...') 
                                : (currentLang === 'te' ? 'నేను చెల్లించాను' : 'Paid')}
                            </span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Escrow Guarantee Note */}
                    <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 pt-1 border-t border-emerald-100 dark:border-emerald-900/60">
                      <span className="flex items-center gap-1 font-bold text-emerald-700 dark:text-emerald-400">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                        <span>{currentLang === 'te' ? '100% సురక్షితమైన బుకింగ్ హామీ' : '100% Escrow Protected Booking'}</span>
                      </span>
                      <span>{currentLang === 'te' ? 'QR చురుకుగా ఉంది' : 'QR Active'}</span>
                    </div>

                  </div>
                )}

                {paymentMode === 'razorpay' && (
                  <div className="mt-3 p-4 rounded-3xl bg-gradient-to-b from-indigo-50/90 via-white to-indigo-50/40 dark:from-indigo-950/50 dark:via-slate-900 dark:to-indigo-950/30 border-2 border-indigo-500/50 dark:border-indigo-500/40 space-y-3 shadow-md">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h4 className="font-black text-sm text-slate-900 dark:text-white">Razorpay Secure Checkout</h4>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                          Test mode only. Your payment is accepted only after server-side signature and capture validation.
                        </p>
                      </div>
                      <ShieldCheck className="w-6 h-6 text-indigo-600 shrink-0" />
                    </div>
                    <button
                      type="button"
                      onClick={handleRazorpayPayment}
                      disabled={isRazorpayProcessing || qrVerified}
                      className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-xs font-black text-white shadow-md transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {qrVerified
                        ? 'Razorpay payment verified ✓'
                        : isRazorpayProcessing
                        ? 'Opening secure checkout…'
                        : `Pay ₹${totalBookingAmount.toLocaleString('en-IN')} with Razorpay`}
                    </button>
                  </div>
                )}
              </div>

              {/* Extra Instructions (Optional) */}
              <div className="space-y-1">
                <label className="font-bold text-xs text-slate-600 dark:text-slate-400">
                  {currentLang === 'te' ? 'ఇతర వివరాలు (ఐచ్ఛికం):' : 'Additional details (Optional):'}
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={currentLang === 'te' ? 'సమస్య లేదా పని వివరాలు రాయండి...' : 'Describe your specific requirements...'}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-white outline-hidden focus:border-purple-600"
                />
              </div>

              {/* BIG EASY SUBMIT BUTTON (ADAPTS TO PAY LATER OR PAY VIA QR) */}
              <div className="pt-2 space-y-2">
                {bookingConflictError && (
                  <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-bold">
                    ⚠️ {bookingConflictError}
                  </div>
                )}
                <button
                  type="submit"
                  className={`w-full py-4 rounded-2xl active:scale-[0.98] text-white font-black text-sm sm:text-base shadow-xl transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    paymentMode !== 'pay_later'
                      ? 'bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:to-teal-800 shadow-emerald-950/25'
                      : 'bg-[#4A148C] hover:bg-purple-900 shadow-purple-950/25'
                  }`}
                >
                  {paymentMode !== 'pay_later' ? (
                    paymentMode === 'razorpay' ? <CreditCard className="w-5 h-5 text-amber-300" /> : <QrCode className="w-5 h-5 text-amber-300" />
                  ) : (
                    <ShieldCheck className="w-5 h-5 text-amber-300" />
                  )}
                  <span>
                    {paymentMode !== 'pay_later'
                      ? (currentLang === 'te'
                          ? paymentMode === 'razorpay'
                            ? `💳 Razorpay ధృవీకరణ తర్వాత బుక్ చేయండి (₹${totalBookingAmount.toLocaleString('en-IN')})`
                            : `📱 క్యూఆర్ ద్వారా చెల్లించి బుక్ చేయండి (₹${totalBookingAmount.toLocaleString('en-IN')})`
                          : paymentMode === 'razorpay'
                          ? `💳 Confirm Razorpay Booking (₹${totalBookingAmount.toLocaleString('en-IN')})`
                          : `📱 Confirm Booking with QR Payment (₹${totalBookingAmount.toLocaleString('en-IN')})`)
                      : (currentLang === 'te' 
                          ? `✅ ఉచితంగా బుక్ చేయండి (మొత్తం: ₹${totalBookingAmount.toLocaleString('en-IN')})`
                          : `✅ Confirm Free Booking (Total: ₹${totalBookingAmount.toLocaleString('en-IN')})`)}
                  </span>
                </button>
                <p className="text-[10px] text-center text-slate-400 mt-1.5 font-medium">
                  {paymentMode !== 'pay_later'
                    ? (currentLang === 'te'
                        ? paymentMode === 'razorpay'
                          ? '🔒 Razorpay సర్వర్ ధృవీకరణ తర్వాత మాత్రమే బుకింగ్ నిర్ధారించబడుతుంది.'
                          : '🔒 తక్షణ యూపీఐ రక్షణ. నిపుణుడు నిర్ధారించబడతారు మరియు రసీదు జారీ చేయబడుతుంది.'
                        : paymentMode === 'razorpay'
                        ? '🔒 Booking confirmation requires server-side Razorpay verification.'
                        : '🔒 Instant UPI protection with automated digital receipt generation.')
                    : (currentLang === 'te' 
                        ? '🔒 సర్వీస్ పూర్తయిన తర్వాత మాత్రమే పేమెంట్ చేయండి. 100% నమ్మకమైన నిపుణులు.'
                        : '🔒 Pay only after service is completed. Verified professionals.')}
                </p>
              </div>

            </form>
          )}
        </div>

      </div>
    </div>
  );
};
