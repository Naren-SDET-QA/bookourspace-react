import React, { useState, useEffect, useMemo } from 'react';
import GooglePayButton from '@google-pay/button-react';
import { QRCodeSVG } from 'qrcode.react';
import { 
  X, 
  ShieldCheck, 
  CheckCircle2, 
  CreditCard, 
  QrCode, 
  Smartphone, 
  Building2, 
  Lock, 
  Download, 
  Printer,
  ArrowRight,
  Copy,
  Check,
  Sparkles,
  ExternalLink,
  Settings2,
  Eye,
  EyeOff
} from 'lucide-react';
import { CopyButton } from './ui/CopyButton';
import { useMarketplace } from '../context/MarketplaceContext';
import {
  GSTInvoicePayload,
  downloadGSTInvoicePDF,
  printGSTInvoiceReceipt,
} from '../utils/gstInvoiceGenerator';
import { UniversalBarcode, generateBosBarcodeId } from './UniversalBarcode';
import { triggerGlobalGlobeLoader } from './BOSBrandLogo';
import { createServerPaymentIntent, verifyServerUpiPayment, PAYMENT_VERIFICATION_AVAILABLE } from '../lib/supabaseClient';

interface PaymentModalProps {
  isOpen: boolean;
  planName: string;
  amount: number;
  listingTitle?: string;
  defaultOneRupeeTest?: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

type DevicePlatform = 'ios' | 'android' | 'desktop';

type UpiAppId = 'gpay' | 'phonepe' | 'paytm' | 'bhim' | 'cred' | 'any_upi';

export interface MerchantUpiAccount {
  id: string;
  vpa: string;
  merchantName: string;
  bankLabel: string;
  isPrimary?: boolean;
}

const DEFAULT_MERCHANT_UPI_LIST: MerchantUpiAccount[] = [
  {
    id: 'upi-1',
    vpa: 'bookourspace@okhdfcbank',
    merchantName: 'BookOurSpace Official',
    bankLabel: 'HDFC Bank (Primary)',
    isPrimary: true,
  },
  {
    id: 'upi-2',
    vpa: 'bookourspace.icici@okicici',
    merchantName: 'BookOurSpace Official',
    bankLabel: 'ICICI Bank (Backup 1)',
    isPrimary: false,
  },
  {
    id: 'upi-3',
    vpa: 'bookourspace.sbi@oksbi',
    merchantName: 'BookOurSpace Official',
    bankLabel: 'SBI Corporate (Backup 2)',
    isPrimary: false,
  },
];

const detectDevicePlatform = (): DevicePlatform => {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent || navigator.vendor || '';
  if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
    return 'ios';
  }
  if (/android/i.test(ua)) {
    return 'android';
  }
  return 'desktop';
};

export const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  planName,
  amount,
  listingTitle,
  defaultOneRupeeTest = false,
  onClose,
  onSuccess,
}) => {
  const { recordPayment } = useMarketplace();

  const [paymentMethod, setPaymentMethod] = useState<'upi' | 'gpay_sdk' | 'card' | 'netbanking'>('upi');

  const [merchantAccounts, setMerchantAccounts] = useState<MerchantUpiAccount[]>(() => {
    try {
      const saved = localStorage.getItem('bos_merchant_upi_list');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore storage errors
    }
    return DEFAULT_MERCHANT_UPI_LIST;
  });

  const [selectedAccountId, setSelectedAccountId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('bos_merchant_upi_list');
      if (saved) {
        const parsed: MerchantUpiAccount[] = JSON.parse(saved);
        const primary = parsed.find((a) => a.isPrimary) || parsed[0];
        if (primary) return primary.id;
      }
    } catch {
      // ignore
    }
    return DEFAULT_MERCHANT_UPI_LIST[0].id;
  });

  const activeAccount = useMemo(
    () =>
      merchantAccounts.find((a) => a.id === selectedAccountId) ||
      merchantAccounts.find((a) => a.isPrimary) ||
      merchantAccounts[0] ||
      DEFAULT_MERCHANT_UPI_LIST[0],
    [merchantAccounts, selectedAccountId]
  );

  const merchantVpa = activeAccount.vpa;
  const merchantName = activeAccount.merchantName;

  // New Merchant UPI ID form fields
  const [newVpaInput, setNewVpaInput] = useState('');
  const [newMerchantNameInput, setNewMerchantNameInput] = useState('BookOurSpace Official');
  const [newBankLabelInput, setNewBankLabelInput] = useState('');
  const [showMerchantConfig, setShowMerchantConfig] = useState(false);

  const [devicePlatform, setDevicePlatform] = useState<DevicePlatform>('desktop');
  const [utrReference, setUtrReference] = useState('');
  const [appLaunchedNotice, setAppLaunchedNotice] = useState<string | null>(null);


  const [cardNumber, setCardNumber] = useState('4532 •••• •••• 8821');
  const [cardExpiry, setCardExpiry] = useState('08/29');
  const [cardCvv, setCardCvv] = useState('•••');
  const [showCvv, setShowCvv] = useState(false);
  const [selectedBank, setSelectedBank] = useState('HDFC Bank');

  // Customer / Provider GST Billing Fields
  const [billingName, setBillingName] = useState('Narendra Kumar');
  const [billingPhone, setBillingPhone] = useState('+91 98765 43210');
  const [billingGstin, setBillingGstin] = useState('36AABCB1429B1Z5');
  const [billingAddress, setBillingAddress] = useState('Road No. 1, Banjara Hills, Hyderabad - 500034');

  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [paymentIntentId, setPaymentIntentId] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [paidViaLabel, setPaidViaLabel] = useState('Direct 0%-Fee UPI / Google Pay');

  const [isOneRupeeTestMode, setIsOneRupeeTestMode] = useState(defaultOneRupeeTest);
  const [qrScanMode, setQrScanMode] = useState<'upi_pay' | 'open_mobile_app'>('upi_pay');


  const mobileShareUrl = useMemo(() => {
    if (typeof window === 'undefined') {
      return 'https://ais-pre-2sp75t3mb2qar3lhuhwjxd-429336547561.asia-southeast1.run.app';
    }
    const origin = window.location.origin;
    return origin.includes('ais-dev-')
      ? origin.replace('ais-dev-', 'ais-pre-')
      : origin;
  }, []);

  useEffect(() => {
    setDevicePlatform(detectDevicePlatform());
  }, []);

  useEffect(() => {
    if (isOpen) {
      setIsOneRupeeTestMode(defaultOneRupeeTest);
    }
  }, [isOpen, defaultOneRupeeTest]);

  const effectiveBaseAmount = isOneRupeeTestMode ? 1 : amount;
  const cgstAmount = isOneRupeeTestMode ? 0 : Math.round(amount * 0.09);
  const sgstAmount = isOneRupeeTestMode ? 0 : Math.round(amount * 0.09);
  const gstAmount = cgstAmount + sgstAmount;
  const totalPayable = effectiveBaseAmount + gstAmount;

  const orderRefId = useMemo(
    () => `BOS${Date.now().toString().slice(-8)}`,
    [planName, amount, isOpen]
  );

  // Build NPCI-compliant 0%-Commission UPI Deep Links & QR string (Keep '@' literal in pa= so all mobile QR scanners recognize it)
  const buildUpiDeepLink = (targetApp?: UpiAppId, targetPlatform: DevicePlatform = devicePlatform): string => {
    const cleanVpa = merchantVpa.trim();
    const cleanName = encodeURIComponent(merchantName.trim());
    const cleanNote = encodeURIComponent(`BOS ${planName}`.slice(0, 32));
    const params = `pa=${cleanVpa}&pn=${cleanName}&am=${totalPayable.toFixed(2)}&cu=INR&tn=${cleanNote}`;

    if (targetApp === 'any_upi') {
      return `upi://pay?${params}`;
    }

    if (targetPlatform === 'ios') {
      switch (targetApp) {
        case 'gpay':
          return `tez://upi/pay?${params}`;
        case 'phonepe':
          return `phonepe://pay?${params}`;
        case 'paytm':
          return `paytmmp://pay?${params}`;
        case 'bhim':
          return `bhim://upi/pay?${params}`;
        case 'cred':
          return `credpay://upi/pay?${params}`;
        default:
          return `upi://pay?${params}`;
      }
    }

    if (targetPlatform === 'android') {
      switch (targetApp) {
        case 'gpay':
          return `tez://upi/pay?${params}`;
        case 'phonepe':
          return `phonepe://pay?${params}`;
        case 'paytm':
          return `paytmmp://pay?${params}`;
        case 'bhim':
          return `bhim://upi/pay?${params}`;
        case 'cred':
          return `credpay://upi/pay?${params}`;
        default:
          return `upi://pay?${params}`;
      }
    }

    return `upi://pay?${params}`;
  };

  if (!isOpen) return null;

  const persistMerchantAccounts = (updated: MerchantUpiAccount[]) => {
    setMerchantAccounts(updated);
    try {
      localStorage.setItem('bos_merchant_upi_list', JSON.stringify(updated));
      const primary = updated.find((a) => a.isPrimary) || updated[0];
      if (primary) {
        localStorage.setItem('bos_merchant_vpa', primary.vpa);
        localStorage.setItem('bos_merchant_name', primary.merchantName);
      }
    } catch {
      // ignore storage errors
    }
  };

  const handleAddMerchantUpi = () => {
    const cleanVpa = newVpaInput.trim().toLowerCase();
    if (!cleanVpa || !cleanVpa.includes('@')) return;

    const newEntry: MerchantUpiAccount = {
      id: `upi-${Date.now()}`,
      vpa: cleanVpa,
      merchantName: newMerchantNameInput.trim() || 'BookOurSpace Official',
      bankLabel: newBankLabelInput.trim() || `Bank Account #${merchantAccounts.length + 1}`,
      isPrimary: merchantAccounts.length === 0,
    };

    const updated = [...merchantAccounts, newEntry];
    persistMerchantAccounts(updated);
    setSelectedAccountId(newEntry.id);
    setNewVpaInput('');
    setNewBankLabelInput('');
  };

  const handleSetPrimaryUpi = (id: string) => {
    const updated = merchantAccounts.map((acc) => ({
      ...acc,
      isPrimary: acc.id === id,
    }));
    persistMerchantAccounts(updated);
    setSelectedAccountId(id);
  };

  const handleRemoveMerchantUpi = (id: string) => {
    if (merchantAccounts.length <= 1) return; // Keep at least 1 active UPI ID
    const filtered = merchantAccounts.filter((acc) => acc.id !== id);
    if (!filtered.some((acc) => acc.isPrimary)) {
      filtered[0].isPrimary = true;
    }
    persistMerchantAccounts(filtered);
    if (selectedAccountId === id) {
      setSelectedAccountId(filtered[0].id);
    }
  };

  // Trigger W3C PaymentRequest API (Google Pay / Android Tez) or iOS/Android Deep Link
  const handleLaunchNativeUpiApp = async (appId: UpiAppId, appDisplayName: string) => {
    const deepLink = buildUpiDeepLink(appId, devicePlatform);
    setPaidViaLabel(`${appDisplayName} (${devicePlatform.toUpperCase()} Direct 0%-Fee UPI)`);

    // On Android/Chrome supporting W3C PaymentRequest for Google Pay Tez
    if (
      devicePlatform === 'android' &&
      appId === 'gpay' &&
      typeof window !== 'undefined' &&
      'PaymentRequest' in window
    ) {
      try {
        const supportedInstruments = [
          {
            supportedMethods: 'https://tez.google.com/pay',
            data: {
              pa: merchantVpa.trim(),
              pn: merchantName.trim(),
              tr: orderRefId,
              url: window.location.origin,
              mc: '5411',
              tn: `BookOurSpace ${planName}`,
            },
          },
        ];
        const details = {
          total: {
            label: `${planName} (incl. 18% GST)`,
            amount: {
              currency: 'INR',
              value: totalPayable.toFixed(2),
            },
          },
        };
        const request = new PaymentRequest(supportedInstruments, details);
        const canMakePayment = await request.canMakePayment();
        if (canMakePayment) {
          const response = await request.show();
          await response.complete('success');
          setAppLaunchedNotice(
            'Google Pay returned a payment response. Enter the actual bank UTR below; payment remains unconfirmed until a payment provider verifies settlement.'
          );
          return;
        }
      } catch {
        // Fallback to direct scheme launch below
      }
    }

    // Launch iOS / Android custom scheme (tez://, phonepe://, paytmmp://, upi://) on mobile devices
    if (devicePlatform === 'ios' || devicePlatform === 'android') {
      const anchor = document.createElement('a');
      anchor.href = deepLink;
      anchor.rel = 'noopener noreferrer';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    }

    setAppLaunchedNotice(
      devicePlatform === 'ios'
        ? `Opened ${appDisplayName} for iPhone/iPad (0% Gateway Fee). Complete ₹${totalPayable.toLocaleString('en-IN')} payment & enter 12-digit UTR or tap Verify below.`
        : devicePlatform === 'android'
        ? `Opened ${appDisplayName} for Android (0% Gateway Fee). Complete ₹${totalPayable.toLocaleString('en-IN')} payment & tap Verify below.`
        : `${appDisplayName} URI generated (${deepLink.split('?')[0]}). Scan the QR code with your iPhone or Android ${appDisplayName} app or click Verify below.`
    );
  };

  const buildCurrentInvoicePayload = (): GSTInvoicePayload => ({
    invoiceNumber: invoiceNumber || `BOS-GST-2026-${Date.now().toString().slice(-4)}`,
    transactionId: transactionId || `TXN-${Date.now().toString().slice(-8)}`,
    date: new Date().toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }),
    customerName: billingName.trim() || 'Verified BookOurSpace User',
    customerPhone: billingPhone.trim() || '+91 98765 43210',
    customerGstin: billingGstin.trim() || 'Unregistered / Consumer',
    customerAddress: billingAddress.trim() || 'Hyderabad, Telangana - 500081',
    planOrItemName: planName,
    description: listingTitle
      ? `Listing: ${listingTitle}`
      : 'BookOurSpace Platform Subscription & Verified Service (0% Gateway Fee Direct Settlement)',
    baseAmount: effectiveBaseAmount,
    cgstRate: isOneRupeeTestMode ? 0 : 9,
    sgstRate: isOneRupeeTestMode ? 0 : 9,
    totalAmount: totalPayable,
    paymentMethod: paidViaLabel,
  });

  const finalizePaymentSuccess = async () => {
    if (paymentMethod !== 'upi') {
      setAppLaunchedNotice('This payment method is unavailable until a real payment provider is configured. No payment was recorded.');
      return;
    }

    const cleanUtr = utrReference.trim().replace(/\s+/g, '');
    if (!/^[A-Za-z0-9]{12,22}$/.test(cleanUtr)) {
      setAppLaunchedNotice('Enter the actual 12–22 character bank UTR after completing your UPI payment.');
      return;
    }

    setIsProcessing(true);
    triggerGlobalGlobeLoader('Verifying 0%-Fee Direct Payment & Generating Official GST Invoice...', 750);

    try {
      let activeIntentId = paymentIntentId;
      if (!activeIntentId) {
        const intentRes = await createServerPaymentIntent({
          amount: totalPayable,
          merchantVpa,
          planOrListing: planName,
          purpose: 'subscription',
        });
        if (!intentRes.ok || !intentRes.intentId) {
          setAppLaunchedNotice('Unable to start payment verification. No payment was recorded.');
          setIsProcessing(false);
          return;
        }
        activeIntentId = intentRes.intentId;
        setPaymentIntentId(activeIntentId);
      }

      // If user typed a manual UTR, validate format & anti-replay on the server
      // Enforces: UTR alone != verified payment unless accompanied by bank webhook signature
      if (paymentMethod === 'upi') {
        const verifyRes = await verifyServerUpiPayment({
          intentId: activeIntentId,
          utrNumber: cleanUtr,
        });

        if (verifyRes.httpStatus === 409 || verifyRes.error === 'DUPLICATE_UTR_REPLAY') {
          setAppLaunchedNotice(
            `❌ Security Alert: ${verifyRes.message || 'This UTR number has already been used for another transaction.'}`
          );
          setIsProcessing(false);
          return;
        }
        if (!verifyRes.verified) {
          setAppLaunchedNotice(
            `⏳ ${verifyRes.message || 'UTR recorded for bank reconciliation. UTR alone is not marked as paid until bank settlement is independently verified.'}`
          );
          setIsProcessing(false);
          return;
        }
      }

      const generatedTxId = `UTR-${cleanUtr}`;
      const generatedInvNo = `BOS-GST-2026-${Math.floor(1000 + Math.random() * 9000)}`;
      const methodLabel = `${paidViaLabel} -> ${merchantVpa} (Server Verified)`;

      setTransactionId(generatedTxId);
      setInvoiceNumber(generatedInvNo);
      setPaidViaLabel(methodLabel);

      recordPayment(
        'plan_subscription',
        totalPayable,
        `${planName} (GST Bill #${generatedInvNo} · ${billingName} · Ref ${generatedTxId})`,
        methodLabel
      );

      setIsProcessing(false);
      setPaymentSuccess(true);
      if (onSuccess) onSuccess();
    } catch {
      setAppLaunchedNotice('Payment verification could not be completed. No payment was recorded. Please try again later.');
      setIsProcessing(false);
    }
  };

  const handlePay = () => {
    // If a manual UTR is entered, verify whether it has bank settlement
    void finalizePaymentSuccess();
  };

  const handleReset = () => {
    setPaymentSuccess(false);
    setPaymentIntentId('');
    setUtrReference('');
    setAppLaunchedNotice(null);
    onClose();
  };

  if (!PAYMENT_VERIFICATION_AVAILABLE) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm" role="presentation">
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="payment-unavailable-title"
          className="w-full max-w-md rounded-3xl border border-amber-300 bg-white p-6 shadow-2xl dark:border-amber-800 dark:bg-slate-900"
        >
          <h2 id="payment-unavailable-title" className="text-lg font-black text-slate-900 dark:text-white">
            Online payment unavailable
          </h2>
          <p role="status" className="mt-3 text-sm text-slate-600 dark:text-slate-300">
            BookOurSpace cannot verify payment settlement right now. Do not send funds. No payment or subscription has been recorded.
          </p>
          <button type="button" onClick={handleReset} className="mt-5 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white dark:bg-white dark:text-slate-900">
            Close
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="font-black text-slate-900 dark:text-white text-base">
                  Zero-Fee Direct UPI & Google Pay
                </h3>
                <span className="px-2 py-0.5 text-[9px] font-black uppercase rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300/50">
                  0% Commission
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Works on iOS (iPhone), Android & Web • Direct Bank Settlement
              </p>
            </div>
          </div>
          <button
            onClick={handleReset}
            className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        {!paymentSuccess ? (
          <div className="p-6 space-y-4 max-h-[82vh] overflow-y-auto">
            {/* Cross-Device Status Bar + Merchant VPA Config */}
            <div className="flex flex-wrap items-center justify-between gap-2 bg-emerald-50/70 dark:bg-emerald-950/30 px-3.5 py-2 rounded-2xl border border-emerald-200/70 dark:border-emerald-800/50">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                  Device:
                </span>
                <div className="inline-flex rounded-lg bg-white dark:bg-slate-900 p-0.5 border border-emerald-200 dark:border-slate-700">
                  {(['ios', 'android', 'desktop'] as DevicePlatform[]).map((plat) => (
                    <button
                      key={plat}
                      type="button"
                      onClick={() => setDevicePlatform(plat)}
                      className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase transition cursor-pointer ${
                        devicePlatform === plat
                          ? 'bg-emerald-600 text-white'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                      }`}
                    >
                      {plat === 'ios' ? '🍎 iOS' : plat === 'android' ? '🤖 Android' : '💻 Web'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsOneRupeeTestMode(!isOneRupeeTestMode)}
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-black border transition cursor-pointer ${
                    isOneRupeeTestMode
                      ? 'bg-amber-500 text-white border-amber-600 shadow-2xs'
                      : 'bg-white dark:bg-slate-900 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-800 hover:bg-amber-50'
                  }`}
                >
                  {isOneRupeeTestMode ? '⚡ ₹1 Live Test: ON' : '⚡ Test with ₹1'}
                </button>

                <button
                  type="button"
                  onClick={() => setShowMerchantConfig(!showMerchantConfig)}
                  className="inline-flex items-center gap-1 text-[10px] font-black text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                >
                  <Settings2 className="w-3 h-3" />
                  <span>Manage UPI IDs ({merchantAccounts.length})</span>
                </button>
              </div>
            </div>

            {/* Multi-Merchant Direct Bank UPI ID Manager */}
            {showMerchantConfig && (
              <div className="p-3.5 rounded-2xl bg-indigo-50/60 dark:bg-slate-800/70 border border-indigo-200 dark:border-slate-700 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-black text-indigo-900 dark:text-indigo-300">
                    Multi-Merchant Direct Bank UPI Manager (0% Gateway Fee)
                  </div>
                  <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                    {merchantAccounts.length} Active VPA{merchantAccounts.length > 1 ? 's' : ''}
                  </span>
                </div>

                {/* Saved Merchant UPI IDs List */}
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {merchantAccounts.map((acc) => {
                    const isSelected = acc.id === activeAccount.id;
                    return (
                      <div
                        key={acc.id}
                        className={`flex flex-wrap items-center justify-between gap-2 p-2 rounded-xl border text-xs transition ${
                          isSelected
                            ? 'bg-white dark:bg-slate-900 border-emerald-500 ring-1 ring-emerald-500/30'
                            : 'bg-white/70 dark:bg-slate-900/50 border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        <div
                          onClick={() => setSelectedAccountId(acc.id)}
                          className="cursor-pointer flex-1 min-w-[160px]"
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="font-black text-slate-900 dark:text-white text-[11px]">
                              {acc.bankLabel}
                            </span>
                            {acc.isPrimary && (
                              <span className="px-1.5 py-0.2 text-[9px] font-black uppercase rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                                Primary
                              </span>
                            )}
                            {isSelected && (
                              <span className="px-1.5 py-0.2 text-[9px] font-black uppercase rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                                Active Now
                              </span>
                            )}
                          </div>
                          <div className="font-mono font-bold text-[11px] text-emerald-700 dark:text-emerald-400">
                            {acc.vpa}
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          {!acc.isPrimary && (
                            <button
                              type="button"
                              onClick={() => handleSetPrimaryUpi(acc.id)}
                              className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-emerald-100 dark:hover:bg-emerald-950/60 text-[10px] font-bold text-slate-700 dark:text-slate-300 cursor-pointer"
                            >
                              Set Primary
                            </button>
                          )}
                          {merchantAccounts.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveMerchantUpi(acc.id)}
                              className="px-2 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 text-[10px] font-bold text-rose-600 dark:text-rose-400 cursor-pointer"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Add New Merchant UPI ID Form */}
                <div className="pt-2 border-t border-indigo-200/60 dark:border-slate-700 space-y-2">
                  <div className="text-[10px] font-black uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
                    + Add Another Merchant UPI ID (Backup Bank / Branch VPA)
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block mb-0.5">
                        New UPI ID (VPA) *
                      </label>
                      <input
                        type="text"
                        value={newVpaInput}
                        onChange={(e) => setNewVpaInput(e.target.value)}
                        placeholder="e.g. business@okaxis"
                        className="w-full px-2.5 py-1.5 text-xs font-mono font-bold rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block mb-0.5">
                        Bank / Label *
                      </label>
                      <input
                        type="text"
                        value={newBankLabelInput}
                        onChange={(e) => setNewBankLabelInput(e.target.value)}
                        placeholder="e.g. Axis Bank (Backup)"
                        className="w-full px-2.5 py-1.5 text-xs font-bold rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block mb-0.5">
                        Merchant Name
                      </label>
                      <input
                        type="text"
                        value={newMerchantNameInput}
                        onChange={(e) => setNewMerchantNameInput(e.target.value)}
                        placeholder="BookOurSpace Official"
                        className="w-full px-2.5 py-1.5 text-xs font-bold rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleAddMerchantUpi}
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-black cursor-pointer"
                    >
                      + Add Merchant UPI ID
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Order Summary & GST Breakdown Box */}
            <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-4 border border-slate-100 dark:border-slate-800 space-y-2.5">
              <div className="flex justify-between items-start">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                    Official GST Tax Invoice Preview
                  </div>
                  <div className="font-black text-slate-900 dark:text-white text-base">
                    {planName}
                  </div>
                  {listingTitle && (
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                      Listing: {listingTitle}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-lg font-black text-slate-900 dark:text-white">
                    ₹{amount.toLocaleString('en-IN')}
                  </div>
                  <span className="text-[10px] text-slate-400">HSN/SAC: 998599</span>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-200/70 dark:border-slate-700/60 space-y-1 text-xs text-slate-600 dark:text-slate-300">
                <div className="flex justify-between">
                  <span>Taxable Base Amount</span>
                  <span className="font-semibold">₹{amount.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between">
                  <span>CGST (9% Central Tax)</span>
                  <span>₹{cgstAmount.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between">
                  <span>SGST (9% State Tax)</span>
                  <span>₹{sgstAmount.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between text-emerald-700 dark:text-emerald-400 font-bold">
                  <span>Payment Gateway Fee (Direct UPI / GPay)</span>
                  <span>₹0 (0% MDR)</span>
                </div>
                <div className="flex justify-between text-sm font-black text-slate-900 dark:text-white pt-1.5 border-t border-slate-200/50 dark:border-slate-700/50">
                  <span>Total Payable (incl. 18% GST)</span>
                  <span className="text-emerald-600 dark:text-emerald-400">
                    ₹{totalPayable.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>
            </div>

            {/* Customer / Business Billing Details for GST Invoice */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 bg-indigo-50/40 dark:bg-slate-800/40 p-3 rounded-2xl border border-indigo-100 dark:border-slate-800">
              <div>
                <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">
                  Billed To Name *
                </label>
                <input
                  type="text"
                  value={billingName}
                  onChange={(e) => setBillingName(e.target.value)}
                  placeholder="Your Name / Business"
                  className="w-full px-2.5 py-1.5 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">
                  Mobile Number *
                </label>
                <input
                  type="text"
                  value={billingPhone}
                  onChange={(e) => setBillingPhone(e.target.value)}
                  placeholder="+91 9876543210"
                  className="w-full px-2.5 py-1.5 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">
                  Buyer GSTIN (Optional)
                </label>
                <input
                  type="text"
                  value={billingGstin}
                  onChange={(e) => setBillingGstin(e.target.value.toUpperCase())}
                  placeholder="e.g. 36ABCDE1234F1Z5"
                  className="w-full px-2.5 py-1.5 text-xs font-mono font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">
                  Billing Address (For GST Invoice) *
                </label>
                <input
                  type="text"
                  value={billingAddress}
                  onChange={(e) => setBillingAddress(e.target.value)}
                  placeholder="City, Area & Pincode"
                  className="w-full px-2.5 py-1.5 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>
            </div>

            {/* Payment Method Selector */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Select Zero-Commission Payment Mode (iOS • Android • Web)
              </label>
              <div className="grid grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('upi')}
                  className={`p-2 rounded-2xl border text-center transition flex flex-col items-center gap-1 cursor-pointer ${
                    paymentMethod === 'upi'
                      ? 'border-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 ring-2 ring-emerald-500/20'
                      : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <Smartphone className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-[11px] font-black">Direct UPI</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod('gpay_sdk')}
                  className={`p-2 rounded-2xl border text-center transition flex flex-col items-center gap-1 cursor-pointer ${
                    paymentMethod === 'gpay_sdk'
                      ? 'border-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 ring-2 ring-emerald-500/20'
                      : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span className="text-[11px] font-black">GPay Button</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod('card')}
                  className={`p-2 rounded-2xl border text-center transition flex flex-col items-center gap-1 cursor-pointer ${
                    paymentMethod === 'card'
                      ? 'border-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 ring-2 ring-emerald-500/20'
                      : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <CreditCard className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span className="text-[11px] font-black">Cards</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod('netbanking')}
                  className={`p-2 rounded-2xl border text-center transition flex flex-col items-center gap-1 cursor-pointer ${
                    paymentMethod === 'netbanking'
                      ? 'border-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 ring-2 ring-emerald-500/20'
                      : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <Building2 className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <span className="text-[11px] font-black">NetBanking</span>
                </button>
              </div>
            </div>

            {/* MODE 1: Direct 0%-Fee UPI (iOS Custom Schemes + Android Intent + Dynamic QR) */}
            {paymentMethod === 'upi' && (
              <div className="space-y-3.5 bg-slate-50/70 dark:bg-slate-800/40 p-4 rounded-2xl border border-emerald-200/80 dark:border-slate-800">
                <div className="flex items-center justify-between text-[11px] font-black text-emerald-700 dark:text-emerald-300">
                  <span className="flex items-center gap-1.5">
                    <QrCode className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-white">
                      ఏదైనా యూపీఐ యాప్‌తో స్కాన్ చేయండి:
                    </span>
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-[9px]">
                    0% Fee • NPCI Direct
                  </span>
                </div>

                {/* Multi-Merchant Receiver UPI ID Quick Switcher */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                      Select Receiver Merchant UPI ID (మర్చంట్ యూపీఐ ఐడి ఎంచుకోండి):
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowMerchantConfig(!showMerchantConfig)}
                      className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                    >
                      {showMerchantConfig ? 'Close Manager' : '+ Add / Edit UPI IDs'}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {merchantAccounts.map((acc) => {
                      const isActive = acc.id === activeAccount.id;
                      return (
                        <button
                          key={acc.id}
                          type="button"
                          onClick={() => setSelectedAccountId(acc.id)}
                          className={`px-2.5 py-1 rounded-xl border text-left transition cursor-pointer flex items-center gap-1.5 ${
                            isActive
                              ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                              : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-emerald-400'
                          }`}
                        >
                          <div>
                            <div className="text-[10px] font-black leading-tight">
                              {acc.bankLabel}
                            </div>
                            <div
                              className={`text-[9px] font-mono ${
                                isActive ? 'text-emerald-100' : 'text-slate-500 dark:text-slate-400'
                              }`}
                            >
                              {acc.vpa}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* High-Contrast Optical QR Scanner Card: Switch between Direct UPI QR & Open App on Mobile QR */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border-2 border-emerald-500/40 shadow-sm space-y-3">
                  {/* Switcher Tabs */}
                  <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
                    <button
                      type="button"
                      onClick={() => setQrScanMode('upi_pay')}
                      className={`py-1.5 px-2.5 rounded-lg text-[11px] font-black transition cursor-pointer flex items-center justify-center gap-1.5 ${
                        qrScanMode === 'upi_pay'
                          ? 'bg-emerald-600 text-white shadow-2xs'
                          : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                      }`}
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      <span>1. UPI Payment QR (₹{totalPayable.toLocaleString('en-IN')})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setQrScanMode('open_mobile_app')}
                      className={`py-1.5 px-2.5 rounded-lg text-[11px] font-black transition cursor-pointer flex items-center justify-center gap-1.5 ${
                        qrScanMode === 'open_mobile_app'
                          ? 'bg-indigo-600 text-white shadow-2xs'
                          : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                      }`}
                    >
                      <Smartphone className="w-3.5 h-3.5" />
                      <span>2. మొబైల్‌లో యాప్ తెరవండి (Open in Mobile)</span>
                    </button>
                  </div>

                  {qrScanMode === 'upi_pay' ? (
                    <div className="flex flex-col items-center text-center space-y-2">
                      <div className="text-xs font-black text-slate-900 dark:text-white">
                        ఏదైనా యూపీఐ యాప్‌తో స్కాన్ చేయండి (Scan with GPay / PhonePe / Paytm / BHIM / CRED)
                      </div>
                      <div className="p-3 bg-white rounded-2xl border-2 border-slate-900 shadow-md inline-flex items-center justify-center">
                        <QRCodeSVG
                          value={buildUpiDeepLink(undefined, 'desktop')}
                          size={188}
                          level="M"
                          includeMargin={true}
                        />
                      </div>
                      <div className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                        Receiver: <span className="font-mono font-black">{merchantVpa}</span> • Amount: <span className="font-black">₹{totalPayable.toLocaleString('en-IN')}</span>
                      </div>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 max-w-md">
                        Tip: If you are using the sample ID (`bookourspace@okhdfcbank`), click <b>+ Add / Edit UPI IDs</b> above and enter your own real UPI ID (e.g., `yourname@ybl` or `yourname@okaxis`) so your bank accepts the ₹1 test transfer.
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center text-center space-y-2.5">
                      <div className="text-xs font-black text-indigo-700 dark:text-indigo-300">
                        📱 మీ మొబైల్ కెమెరా లేదా Google Lens తో స్కాన్ చేసి ఈ యాప్‌ను మొబైల్‌లో తెరవండి:
                      </div>
                      <div className="p-3 bg-white rounded-2xl border-2 border-indigo-600 shadow-md inline-flex items-center justify-center">
                        <QRCodeSVG
                          value={mobileShareUrl}
                          size={188}
                          level="M"
                          includeMargin={true}
                        />
                      </div>
                      <div className="w-full flex flex-col sm:flex-row items-center gap-2 bg-indigo-50/70 dark:bg-slate-800 p-2 rounded-xl border border-indigo-200 dark:border-slate-700">
                        <input
                          type="text"
                          readOnly
                          value={mobileShareUrl}
                          className="w-full flex-1 bg-white dark:bg-slate-900 px-2.5 py-1.5 rounded-lg text-[11px] font-mono font-bold text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700"
                        />
                        <CopyButton value={mobileShareUrl} label="Copy Mobile Link" copiedLabel="Copied Link!" className="bg-indigo-600 text-white border-indigo-600 hover:text-white" />
                      </div>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">
                        Open this link in your mobile browser (Chrome / Safari) and tap <b>Google Pay, PhonePe, Paytm, BHIM, or CRED</b> to launch your UPI app directly!
                      </p>
                    </div>
                  )}
                </div>

                {/* 5 Direct UPI Apps: Google Pay, PhonePe, Paytm, BHIM, CRED */}
                <div>
                  <div className="text-[11px] font-black text-slate-700 dark:text-slate-300 mb-2 flex items-center justify-between">
                    <span>ఏదైనా యూపీఐ యాప్‌తో స్కాన్ చేయండి / యాప్ ఎంచుకోండి:</span>
                    <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                      ₹{totalPayable.toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                    {[
                      { id: 'gpay' as UpiAppId, name: 'Google Pay', badge: 'GPay', color: 'border-blue-200 hover:border-blue-500' },
                      { id: 'phonepe' as UpiAppId, name: 'PhonePe', badge: 'PhonePe', color: 'border-purple-200 hover:border-purple-500' },
                      { id: 'paytm' as UpiAppId, name: 'Paytm', badge: 'Paytm', color: 'border-sky-200 hover:border-sky-500' },
                      { id: 'bhim' as UpiAppId, name: 'BHIM', badge: 'BHIM UPI', color: 'border-orange-200 hover:border-orange-500' },
                      { id: 'cred' as UpiAppId, name: 'CRED', badge: 'CRED Pay', color: 'border-slate-300 hover:border-slate-700' },
                    ].map((app) => (
                      <button
                        key={app.id}
                        type="button"
                        onClick={() => handleLaunchNativeUpiApp(app.id, app.name)}
                        className={`py-2 px-2.5 rounded-xl bg-white dark:bg-slate-900 border ${app.color} dark:border-slate-700 hover:bg-emerald-50/40 text-left transition cursor-pointer shadow-2xs flex items-center justify-between`}
                      >
                        <div>
                          <div className="text-xs font-black text-slate-900 dark:text-white">
                            {app.name}
                          </div>
                          <div className="text-[9px] font-mono font-bold text-emerald-600 dark:text-emerald-400">
                            {app.badge}
                          </div>
                        </div>
                        <ExternalLink className="w-3 h-3 text-slate-400 shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Primary Universal UPI Deep-Link Button + Confirmation Button ("యూపీఐ యాప్‌లో తెరవండి" & "నేను చెల్లించాను") */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => handleLaunchNativeUpiApp('any_upi', 'UPI App')}
                    className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs sm:text-sm shadow-md flex items-center justify-center gap-2 transition cursor-pointer"
                  >
                    <Smartphone className="w-4 h-4" />
                    <span>యూపీఐ యాప్‌లో తెరవండి (Open in UPI App)</span>
                  </button>

                  <button
                    type="button"
                    onClick={handlePay}
                    disabled={isProcessing}
                    className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs sm:text-sm shadow-md flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>నేను చెల్లించాను (I Have Paid ₹{totalPayable.toLocaleString('en-IN')})</span>
                  </button>
                </div>

                {appLaunchedNotice && (
                  <div className="p-2.5 rounded-xl bg-emerald-100/80 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-[11px] font-bold text-emerald-900 dark:text-emerald-200">
                    {appLaunchedNotice}
                  </div>
                )}

                {/* Copy Receiver UPI ID & Optional 12-Digit UTR Input */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                    <div className="truncate pr-2">
                      <span className="text-[9px] font-bold uppercase text-slate-400 block">
                        Direct Merchant UPI ID
                      </span>
                      <span className="text-xs font-mono font-black text-slate-800 dark:text-slate-200">
                        {merchantVpa}
                      </span>
                    </div>
                    <CopyButton value={merchantVpa.trim()} label="Copy" />
                  </div>

                  <div>
                    <input
                      type="text"
                      value={utrReference}
                      onChange={(e) => setUtrReference(e.target.value.replace(/[^0-9A-Za-z-]/g, '').slice(0, 18))}
                      placeholder="12-Digit UPI Ref / UTR (Optional)"
                      className="w-full h-full px-3 py-1.5 text-xs font-mono font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* MODE 2: Official @google-pay/button-react Web & Mobile Component */}
            {paymentMethod === 'gpay_sdk' && (
              <div className="space-y-3 bg-slate-50/70 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 text-center">
                <div className="text-xs font-black text-slate-900 dark:text-white">
                  Official Google Pay Checkout (`@google-pay/button-react`)
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Works across iOS Safari, Android Chrome, and Desktop browsers with instant cryptographic payment confirmation.
                </p>
                <div className="flex justify-center py-2">
                  <GooglePayButton
                    environment="TEST"
                    buttonColor="black"
                    buttonType="pay"
                    buttonRadius={12}
                    buttonSizeMode="fill"
                    style={{ width: '100%', maxWidth: '320px', height: '44px' }}
                    paymentRequest={{
                      apiVersion: 2,
                      apiVersionMinor: 0,
                      allowedPaymentMethods: [
                        {
                          type: 'CARD',
                          parameters: {
                            allowedAuthMethods: ['PAN_ONLY', 'CRYPTOGRAM_3DS'],
                            allowedCardNetworks: ['MASTERCARD', 'VISA'],
                          },
                          tokenizationSpecification: {
                            type: 'PAYMENT_GATEWAY',
                            parameters: {
                              gateway: 'example',
                              gatewayMerchantId: 'exampleGatewayMerchantId',
                            },
                          },
                        },
                      ],
                      merchantInfo: {
                        merchantId: '12345678901234567890',
                        merchantName: merchantName,
                      },
                      transactionInfo: {
                        totalPriceStatus: 'FINAL',
                        totalPriceLabel: `${planName} (incl. GST)`,
                        totalPrice: totalPayable.toFixed(2),
                        currencyCode: 'INR',
                        countryCode: 'IN',
                      },
                    }}
                    onLoadPaymentData={() => {
                      setAppLaunchedNotice('Google Pay returned payment data. Settlement still needs confirmation from a configured payment provider. No payment was recorded.');
                    }}
                  />
                </div>
              </div>
            )}

            {paymentMethod === 'card' && (
              <div className="space-y-2.5 bg-slate-50/70 dark:bg-slate-800/40 p-3.5 rounded-2xl border border-slate-100 dark:border-slate-800">
                <input
                  type="text"
                  value={cardNumber}
                  onChange={(e) => setCardNumber(e.target.value)}
                  placeholder="4532 0000 0000 0000"
                  className="w-full px-3 py-1.5 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={cardExpiry}
                    onChange={(e) => setCardExpiry(e.target.value)}
                    placeholder="MM/YY"
                    className="w-full px-3 py-1.5 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                  />
                  <div className="relative">
                    <input
                      type={showCvv ? 'text' : 'password'}
                      maxLength={4}
                      value={cardCvv}
                      onChange={(e) => setCardCvv(e.target.value)}
                      placeholder="CVV"
                      autoComplete="cc-csc"
                      className="w-full px-3 py-1.5 pr-9 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCvv((value) => !value)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500"
                      aria-label={showCvv ? 'Hide CVV' : 'Show CVV'}
                      aria-pressed={showCvv}
                    >
                      {showCvv ? <EyeOff className="h-3.5 w-3.5" aria-hidden="true" /> : <Eye className="h-3.5 w-3.5" aria-hidden="true" />}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {paymentMethod === 'netbanking' && (
              <div className="grid grid-cols-2 gap-2 text-xs">
                {['HDFC Bank', 'ICICI Bank', 'State Bank of India', 'Axis Bank'].map((bank) => (
                  <button
                    key={bank}
                    type="button"
                    onClick={() => setSelectedBank(bank)}
                    className={`p-2 rounded-xl border text-left font-bold transition cursor-pointer ${
                      selectedBank === bank
                        ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200'
                        : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {bank}
                  </button>
                ))}
              </div>
            )}

            {/* Security Guarantee */}
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>
                0% Gateway Commission • Google Pay • PhonePe • Paytm • BHIM • CRED (iOS, Android & Web).
              </span>
            </div>

            {/* Action buttons */}
            <div className="flex items-center justify-end gap-3 pt-1">
              <button
                type="button"
                onClick={handleReset}
                className="px-4 py-2 rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold text-xs transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePay}
                disabled={isProcessing}
                className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs sm:text-sm shadow-lg shadow-emerald-600/25 flex items-center gap-2 transition disabled:opacity-50 cursor-pointer"
              >
                {isProcessing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Verifying & Generating GST Bill...</span>
                  </>
                ) : (
                  <>
                    <span>
                      {paymentMethod === 'upi'
                        ? `నేను చెల్లించాను • Verify ₹${totalPayable.toLocaleString('en-IN')}`
                        : `Pay ₹${totalPayable.toLocaleString('en-IN')} (with GST)`}
                    </span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          /* Payment Success Confirmation with Print Receipt & Download GST PDF Bill */
          <div className="p-6 sm:p-7 text-center space-y-5">
            <div className="w-14 h-14 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto ring-8 ring-emerald-500/5">
              <CheckCircle2 className="w-9 h-9" />
            </div>

            <div>
              <span className="text-[11px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                ✓ 0%-Commission Direct Payment Verified
              </span>
              <h3 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white mt-0.5">
                Official GST Tax Invoice Ready!
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                Print your receipt or download the GST Bill PDF below.
              </p>
            </div>

            {/* Official GST Bill Summary Card */}
            <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-4 border-2 border-emerald-500/30 text-left text-xs space-y-2">
              <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-700 pb-2">
                <span className="font-black text-slate-900 dark:text-white">BookOurSpace GST Invoice</span>
                <span className="font-mono font-black text-indigo-600 dark:text-indigo-400">{invoiceNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Transaction / UTR Reference</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white">{transactionId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Payment Channel</span>
                <span className="font-bold text-emerald-700 dark:text-emerald-400">{paidViaLabel}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Billed To</span>
                <span className="font-bold text-slate-900 dark:text-white">{billingName} ({billingPhone})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Supplier GSTIN</span>
                <span className="font-mono font-bold text-slate-800 dark:text-slate-200">36AABCB1234F1Z5</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Base Fee + CGST (9%) + SGST (9%)</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  ₹{amount} + ₹{cgstAmount} + ₹{sgstAmount}
                </span>
              </div>
              <div className="flex justify-between pt-1.5 border-t border-slate-200 dark:border-slate-700 text-sm">
                <span className="font-black text-slate-900 dark:text-white">Total Paid (0% Gateway Fee)</span>
                <span className="font-black text-emerald-600 dark:text-emerald-400">
                  ₹{totalPayable.toLocaleString('en-IN')}
                </span>
              </div>
            </div>

            {/* Scannable Official GST Tax Invoice Barcode */}
            <div className="text-left">
              <UniversalBarcode
                value={invoiceNumber || `BOS-GST-2026`}
                displayCode={generateBosBarcodeId('GST', invoiceNumber || transactionId, 'gst')}
                label="🧾 Official GST Tax Invoice Barcode"
                sublabel={`Invoice: ${invoiceNumber} • Txn: ${transactionId} • Paid: ₹${totalPayable.toLocaleString('en-IN')}`}
                moduleTag="gst"
                variant="compact"
                showQr={true}
              />
            </div>

            {/* Print Receipt & Download GST Bill PDF Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => printGSTInvoiceReceipt(buildCurrentInvoicePayload())}
                className="w-full py-3 px-4 rounded-xl bg-[#1E3A8A] hover:bg-blue-900 text-white font-black text-xs flex items-center justify-center gap-2 shadow-md cursor-pointer"
              >
                <Printer className="w-4 h-4 text-amber-300" />
                <span>🖨️ Print GST Receipt</span>
              </button>

              <button
                type="button"
                onClick={() => downloadGSTInvoicePDF(buildCurrentInvoicePayload())}
                className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs flex items-center justify-center gap-2 shadow-md cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>📄 Download GST Bill PDF</span>
              </button>
            </div>

            <div className="pt-1">
              <button
                type="button"
                onClick={handleReset}
                className="w-full py-2.5 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold text-xs hover:opacity-90 transition cursor-pointer"
              >
                Done & Return to Application
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

