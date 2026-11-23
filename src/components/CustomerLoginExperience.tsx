import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BedDouble,
  Building2,
  CheckCircle2,
  ChevronDown,
  Film,
  GraduationCap,
  Hotel,
  Loader2,
  Mail,
  Smartphone,
} from 'lucide-react';
import { useMarketplace } from '../context/MarketplaceContext';
import { isSupabaseEmailProviderEnabled, isValidEmailAddress, requestEmailOtp, requestSupabaseEmailOtp } from '../lib/emailOtpClient';
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient';
import type { AuthAccessConfig } from '../lib/authAccessClient';
import BOSOfficialLogo from './BOSOfficialLogo';
import { setStoredAuthoritativeSession } from '../lib/supabaseClient';

const EMAIL_OTP_LENGTH = 8;
const MOBILE_OTP_LENGTH = 6;
const RESEND_SECONDS = 60;

/** Premium resort/pool hero, the same Unsplash source the stay module already uses. */
const HERO_PHOTO_ID = 'photo-1540541338287-41700207dee6';
const heroSrc = (width: number) => `https://images.unsplash.com/${HERO_PHOTO_ID}?auto=format&fit=crop&w=${width}&q=80`;

const SERVICES: Array<{ label: string; short: string; icon: React.ComponentType<{ className?: string }> }> = [
  { label: 'Movies', short: 'Movies', icon: Film },
  { label: 'Classes', short: 'Classes', icon: GraduationCap },
  { label: 'Function Halls', short: 'Function Halls', icon: Building2 },
  { label: 'Hotels', short: 'Hotels', icon: Hotel },
  { label: 'PG', short: 'PG', icon: BedDouble },
];

const GOOGLE_G = () => (
  <svg aria-hidden="true" viewBox="0 0 48 48" className="h-[18px] w-[18px] shrink-0">
    <path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.1h6.6c3.9-3.6 6.1-8.9 6.1-15Z" />
    <path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.6-5.1c-1.8 1.2-4.1 1.9-6.9 1.9-5.3 0-9.8-3.6-11.4-8.4H5.8v5.3A20 20 0 0 0 24 44Z" />
    <path fill="#FBBC05" d="M12.6 27.5a12 12 0 0 1 0-7.1v-5.3H5.8a20 20 0 0 0 0 17.7l6.8-5.3Z" />
    <path fill="#EA4335" d="M24 12c3 0 5.7 1 7.8 3l5.8-5.8A19.4 19.4 0 0 0 24 4 20 20 0 0 0 5.8 15.1l6.8 5.3C14.2 15.6 18.7 12 24 12Z" />
  </svg>
);

/** Violet primary action from the reference: the working (email) send and verify steps. */
const CTA_CLASS =
  'flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#5b21b6] via-[#7c3aed] to-[#9333ea] px-5 text-sm font-black text-white shadow-[0_18px_38px_-16px_rgba(109,40,217,0.85)] transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7c3aed] disabled:cursor-not-allowed disabled:from-[#ddd6fe] disabled:via-[#ddd6fe] disabled:to-[#c4b5fd] disabled:text-[#5b21b6] disabled:shadow-none';

/** Coral brush stroke under the hero headline, drawn like the reference artwork. */
const BrushUnderline = () => (
  <svg
    aria-hidden="true"
    viewBox="0 0 220 16"
    preserveAspectRatio="none"
    className="pointer-events-none absolute -bottom-3 left-0 h-3 w-[74%] max-w-[260px]"
  >
    <path
      d="M3 11.5c34-5.2 74-7.6 118-7.2 31 .3 60 1.9 96 5.1-1.6 3.1-6.4 4.6-14.6 4.4-28.5-.6-60.8-1.3-96.9-1.2-33.8.1-66.4 1.3-97.7 3.6C4 16.4 1.6 14.6 3 11.5Z"
      fill="url(#bos-brush)"
    />
    <defs>
      <linearGradient id="bos-brush" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#fb923c" />
        <stop offset="55%" stopColor="#f97316" />
        <stop offset="100%" stopColor="#fb7185" />
      </linearGradient>
    </defs>
  </svg>
);

function OtpInput({
  value,
  onChange,
  disabled,
  inputRef,
  length,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  disabled: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  length: number;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const setDigit = (index: number, raw: string) => {
    const digit = raw.replace(/\D/g, '').slice(-1);
    const next = [...value];
    next[index] = digit;
    onChange(next);
    if (digit && index < length - 1) refs.current[index + 1]?.focus();
  };
  const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!pasted) return;
    event.preventDefault();
    onChange(Array.from({ length }, (_, index) => pasted[index] || ''));
    refs.current[Math.min(pasted.length, length - 1)]?.focus();
  };
  return (
    <div className="flex items-center justify-between gap-1.5 sm:gap-2" role="group" aria-label={`${length} digit sign-in code`}>
      {Array.from({ length }, (_, index) => (
        <input
          key={index}
          ref={(element) => {
            refs.current[index] = element;
            if (index === 0) inputRef.current = element;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          pattern="[0-9]*"
          maxLength={1}
          value={value[index] || ''}
          disabled={disabled}
          aria-label={`Digit ${index + 1} of ${length}`}
          onChange={(event) => setDigit(index, event.target.value)}
          onPaste={handlePaste}
          onKeyDown={(event) => {
            if (event.key === 'Backspace' && !value[index] && index > 0) {
              event.preventDefault();
              const next = [...value];
              next[index - 1] = '';
              onChange(next);
              refs.current[index - 1]?.focus();
            }
            if (event.key === 'ArrowLeft' && index > 0) refs.current[index - 1]?.focus();
            if (event.key === 'ArrowRight' && index < length - 1) refs.current[index + 1]?.focus();
          }}
          className="h-13 w-full min-w-0 rounded-2xl border-2 border-slate-200 bg-white py-3 text-center text-xl font-black text-brand-navy outline-none transition focus:border-[#7c3aed] focus:ring-4 focus:ring-violet-100 focus-visible:outline-none disabled:opacity-60"
        />
      ))}
    </div>
  );
}

/**
 * Customer sign-in surface shared by the first-visit entry screen and `#login`.
 *
 * Layout and palette follow the supplied reference: sunset resort hero with the
 * BOS lockup, hero copy and five service shortcuts, then a white bottom-sheet
 * card with pill tabs, the India +91 field, Google and guest entry.
 *
 * Presentation only — every button calls a flow that already exists. Email codes
 * go through the same Resend/Supabase OTP endpoints, Google opens the same OAuth
 * dialog and Guest writes the same entry choice. Mobile sign-in is shown but not
 * offered as a working path, because the server's verified-session exchange only
 * accepts `google` and `email` identities — claiming otherwise would be a fake
 * login.
 */
export function CustomerLoginExperience({
  onGoogle,
  onGuest,
  guestLoginEnabled = false,
  onClose,
  onSelectService,
  config,
  onSignedIn,
}: {
  onGoogle: () => void;
  onGuest?: () => void;
  guestLoginEnabled?: boolean;
  onClose?: () => void;
  onSelectService?: (service: string) => void;
  config?: AuthAccessConfig | null;
  onSignedIn?: (payload: {
    isNewUser?: boolean;
    redirectTarget?: 'marketplace' | 'provider_portal' | 'admin_console';
  }) => void;
}) {
  const { completeEmailOtpSignIn } = useMarketplace();
  const [tab, setTab] = useState<'mobile' | 'email'>('mobile');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [digits, setDigits] = useState<string[]>(() => Array.from({ length: EMAIL_OTP_LENGTH }, () => ''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [supabaseEmailProvider, setSupabaseEmailProvider] = useState(false);
  const [localProviderBusy, setLocalProviderBusy] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const otpRef = useRef<HTMLInputElement>(null);

  const authServiceUnavailable = config != null && config.available === false;
  // The server's Resend route is primary. The browser-only Supabase fallback is
  // used only when the hosted project actually accepts email sign-in, which
  // GoTrue reports on its public settings endpoint.
  const nativeSupabaseOtp = !authServiceUnavailable
    && config != null
    && config.emailOtpConfigured === false
    && isSupabaseConfigured
    && supabaseEmailProvider;
  const emailOtpAvailable = !authServiceUnavailable
    && config?.emailOtpEnabled !== false
    && (config?.emailOtpConfigured !== false || nativeSupabaseOtp);
  const googleAvailable = !authServiceUnavailable && config?.googleLoginEnabled !== false && config?.googleConfigured !== false;
  const emailSetupMissing = !authServiceUnavailable && !nativeSupabaseOtp && config != null
    && config.emailOtpEnabled !== false && config.emailOtpConfigured === false;
  const emailAdminDisabled = !authServiceUnavailable && config != null && config.emailOtpEnabled === false;
  const guestAvailable = guestLoginEnabled || config?.guestLoginEnabled === true;
  const code = useMemo(() => digits.join(''), [digits]);
  const localDemoProviderAvailable = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);

  const signInLocalProvider = async (email?: string) => {
    setLocalProviderBusy(true);
    setError('');
    try {
      const response = await fetch('/api/auth/local-dev/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ role: 'provider', ...(email ? { email } : {}) }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok || !data?.csrfToken) throw new Error(data?.message || data?.error || 'Local provider sign-in is unavailable.');
      setStoredAuthoritativeSession(String(data.csrfToken || ''), data.user || null);
      window.location.hash = 'provider';
      window.location.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Local provider sign-in failed.');
    } finally { setLocalProviderBusy(false); }
  };

  const signInLocalAdmin = async () => {
    setLocalProviderBusy(true);
    setError('');
    try {
      const response = await fetch('/api/auth/local-dev/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ role: 'admin' }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok || !data?.csrfToken) throw new Error(data?.message || data?.error || 'Local admin sign-in is unavailable.');
      setStoredAuthoritativeSession(String(data.csrfToken || ''), data.user || null);
      window.location.hash = 'admin';
      window.location.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Local admin sign-in failed.');
    } finally { setLocalProviderBusy(false); }
  };

  const phoneDigits = phone.replace(/\D/g, '').slice(0, 10);
  const phoneValid = /^[6-9]\d{9}$/.test(phoneDigits);

  useEffect(() => {
    if (authServiceUnavailable || config == null || config.emailOtpConfigured !== false) return;
    let cancelled = false;
    void isSupabaseEmailProviderEnabled().then((enabled) => {
      if (!cancelled) setSupabaseEmailProvider(enabled);
    });
    return () => { cancelled = true; };
  }, [authServiceUnavailable, config]);

  useEffect(() => {
    if (tab !== 'email' || step !== 'email') return;
    const timer = window.setTimeout(() => emailRef.current?.focus(), 60);
    return () => window.clearTimeout(timer);
  }, [tab, step]);

  useEffect(() => {
    if (step !== 'code') return;
    const timer = window.setTimeout(() => otpRef.current?.focus(), 60);
    return () => window.clearTimeout(timer);
  }, [step]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && onClose) {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const normalizeEmail = () => email.trim().toLowerCase();

  const sendCode = async (): Promise<boolean> => {
    const target = normalizeEmail();
    if (!isValidEmailAddress(target)) {
      setError('Enter a valid email address, for example you@example.com.');
      return false;
    }
    setBusy(true);
    setError('');
    setInfo('');
    try {
      const result = nativeSupabaseOtp ? await requestSupabaseEmailOtp(target) : await requestEmailOtp(target);
      if (!result.ok) {
        setError(result.message || 'The code could not be sent. Please try again.');
        if (result.retryAfterSeconds) setCooldown(Math.min(300, result.retryAfterSeconds));
        return false;
      }
      setEmail(target);
      setStep('code');
      setDigits(Array.from({ length: EMAIL_OTP_LENGTH }, () => ''));
      setCooldown(Math.min(120, result.cooldownSeconds || RESEND_SECONDS));
      setInfo(result.developmentCode ? `Development mode: your code is ${result.developmentCode}.` : `We emailed an ${EMAIL_OTP_LENGTH}-digit code to ${target}. It expires in 10 minutes.`);
      return true;
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async () => {
    const expectedLength = tab === 'mobile' ? MOBILE_OTP_LENGTH : EMAIL_OTP_LENGTH;
    if (code.length !== expectedLength) {
      setError(`Enter the ${expectedLength}-digit code from your ${tab === 'mobile' ? 'phone' : 'email'}.`);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await completeEmailOtpSignIn(tab === 'mobile' ? `+91${phoneDigits}` : normalizeEmail(), code, {
        verifyWithSupabase: tab === 'mobile' || nativeSupabaseOtp,
        phone: tab === 'mobile',
      });
      if (!result.ok) {
        setError(result.message || 'That code is invalid or has expired. Request a new code.');
        setDigits(Array.from({ length: tab === 'mobile' ? MOBILE_OTP_LENGTH : EMAIL_OTP_LENGTH }, () => ''));
        otpRef.current?.focus();
        return;
      }
      setInfo('Signed in. Opening your account…');
      onSignedIn?.({ isNewUser: result.isNewUser, redirectTarget: result.redirectTarget });
    } finally {
      setBusy(false);
    }
  };

  const sendPhoneCode = async () => {
    void phoneDigits;
    void phoneValid;
    setError('Mobile OTP is unavailable until an SMS provider is configured. Use email OTP for now.');
  };

  const switchTab = (next: 'mobile' | 'email') => {
    setTab(next);
    setError('');
    setInfo('');
    setStep('email');
    if (next === 'mobile') {
      setDigits(Array.from({ length: next === 'mobile' ? MOBILE_OTP_LENGTH : EMAIL_OTP_LENGTH }, () => ''));
    }
  };

  return (
    <div
      className="fixed inset-0 z-[250] overflow-y-auto bg-[#1b1230]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bos-customer-login-title"
      data-testid="customer-login"
    >
      <div className="relative flex min-h-[100dvh] w-full flex-col overflow-hidden">
        {/* Sunset resort/pool hero */}
        <img
          src={heroSrc(1600)}
          srcSet={`${heroSrc(800)} 800w, ${heroSrc(1600)} 1600w`}
          sizes="100vw"
          alt=""
          aria-hidden="true"
          fetchPriority="high"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover object-[50%_72%]"
        />
        {/* Warm dusk wash: rose and amber over violet, deep enough for white copy */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(178deg,rgba(59,24,74,0.55)_0%,rgba(109,40,217,0.32)_42%,rgba(190,24,93,0.28)_70%,rgba(10,11,26,0.9)_100%)]"
        />
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_50%_8%,rgba(251,146,60,0.40),transparent_60%)]" />
        <div aria-hidden="true" className="pointer-events-none absolute -left-24 top-10 h-[340px] w-[340px] rounded-full bg-[#fb7185]/20 blur-[120px]" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 top-1/4 h-[360px] w-[360px] rounded-full bg-[#7c3aed]/30 blur-[130px]" />

        <div className="relative mx-auto flex w-full max-w-7xl flex-1 flex-col px-0 pb-0 pt-6 sm:px-6 sm:pt-10 lg:grid lg:grid-cols-[minmax(0,1.02fr)_minmax(0,0.98fr)] lg:items-center lg:gap-12 lg:px-10 lg:py-12">
          {/* Brand, hero copy and service shortcuts */}
          <section className="w-full px-4 text-white sm:px-0">
            <div className="flex justify-center lg:justify-start">
              <span className="inline-flex items-center rounded-full border border-white/50 bg-white/90 px-5 py-2.5 shadow-[0_16px_40px_-18px_rgba(15,10,40,0.8)] backdrop-blur">
                <BOSOfficialLogo className="h-9 w-auto sm:h-10" loading="eager" />
              </span>
            </div>

            <div className="mx-auto mt-8 w-full max-w-[430px] lg:mx-0 lg:mt-9 lg:max-w-xl">
              <div className="relative">
                <h1 id="bos-customer-login-hero-title" className="text-[32px] font-black leading-[1.08] tracking-tight text-white sm:text-[40px] lg:text-[46px]">
                  Book Spaces for Every Occasion
                </h1>
                <BrushUnderline />
              </div>
              <p className="mt-6 max-w-md text-sm leading-6 text-white/85 sm:text-[15px]">
                Discover, book and manage venues, stays, classes and more — all in one place.
              </p>

              <ul className="mt-6 grid grid-cols-5 gap-2 sm:gap-2.5" aria-label="Browse a service">
                {SERVICES.map(({ label, short, icon: Icon }) => (
                  <li key={label}>
                    <button
                      type="button"
                      onClick={() => onSelectService?.(label)}
                      className="group flex h-full w-full flex-col items-center justify-start gap-1.5 rounded-2xl border border-white/25 bg-white/15 px-1 py-3 text-center backdrop-blur-md transition hover:border-white/60 hover:bg-white/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70 sm:gap-2 sm:py-4"
                    >
                      <Icon className="h-6 w-6 text-[#ffe0cc] sm:h-7 sm:w-7" aria-hidden="true" />
                      <span className="text-[10px] font-bold leading-[1.15] text-white sm:text-[11px]">{short}</span>
                    </button>
                  </li>
                ))}
              </ul>

              <div className="mt-7 flex items-center justify-center gap-1.5 lg:justify-start" aria-hidden="true">
                <span className="h-1 w-9 rounded-full bg-white/90" />
                <span className="h-1 w-6 rounded-full bg-white/40" />
                <span className="h-1 w-6 rounded-full bg-white/40" />
              </div>
            </div>
          </section>

          {/* White sign-in sheet: flush bottom on phones, floating card from tablet up */}
          <section className="mt-6 w-full sm:mt-8 lg:mt-0">
            <div className="relative mx-auto w-full max-w-[460px] rounded-t-[30px] bg-white px-4 pb-6 pt-3 shadow-[0_-20px_60px_-30px_rgba(2,6,23,0.75)] sm:rounded-[28px] sm:p-7 sm:shadow-[0_50px_100px_-40px_rgba(2,6,23,0.9)] sm:ring-1 sm:ring-white/70">
              <div aria-hidden="true" className="mx-auto h-1.5 w-12 rounded-full bg-slate-200 sm:hidden" />

              {/* The sheet leads with the method tabs, like the reference; the title is
                  kept for screen readers so the dialog has an accessible name. This heading
                  is the only element carrying `bos-customer-login-title`, which
                  `aria-labelledby` above resolves to, so the dialog is named "Sign in or
                  create an account"; the hero headline has its own
                  `bos-customer-login-hero-title`. */}
              <h2 id="bos-customer-login-title" className="sr-only">Sign in or create an account</h2>
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close sign-in"
                  className="absolute right-3 top-3 hidden h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-slate-500 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7c3aed] sm:inline-flex"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                </button>
              )}

              {/* Pill tabs */}
              <div role="tablist" aria-label="Sign-in method" className="mt-2 grid grid-cols-2 gap-1 rounded-full bg-[#f2f2f7] p-1.5">
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === 'mobile'}
                  onClick={() => switchTab('mobile')}
                  className={`flex min-h-11 items-center justify-center gap-2 rounded-full text-[13px] font-black transition ${
                    tab === 'mobile'
                      ? 'bg-white text-[#4c1d95] shadow-sm ring-1 ring-brand-coral/70'
                      : 'text-slate-500 hover:text-[#4c1d95]'
                  }`}
                >
                  <Smartphone className={`h-4 w-4 ${tab === 'mobile' ? 'text-[#7c3aed]' : ''}`} aria-hidden="true" />
                  Mobile OTP
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === 'email'}
                  onClick={() => switchTab('email')}
                  className={`flex min-h-11 items-center justify-center gap-2 rounded-full text-[13px] font-black transition ${
                    tab === 'email'
                      ? 'bg-white text-[#4c1d95] shadow-sm ring-1 ring-brand-coral/70'
                      : 'text-slate-500 hover:text-[#4c1d95]'
                  }`}
                >
                  <Mail className={`h-4 w-4 ${tab === 'email' ? 'text-[#7c3aed]' : ''}`} aria-hidden="true" />
                  Email
                </button>
              </div>

              {error && (
                <div role="alert" className="mt-3 flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-2.5 text-[11px] font-semibold text-rose-700">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}
              {!error && info && (
                <div role="status" className="mt-3 flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-2.5 text-[11px] font-semibold text-emerald-800">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>{info}</span>
                </div>
              )}
              {emailSetupMissing && (
                <div className="mt-3 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-2.5 text-[11px] font-semibold text-amber-800">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>
                    Email sign-in needs a mail provider. Add RESEND_API_KEY and RESEND_FROM_EMAIL to the server (or enable
                    Supabase&apos;s email provider), then this tab starts sending codes — use Google for now.
                  </span>
                </div>
              )}
              {emailAdminDisabled && (
                <div className="mt-3 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-2.5 text-[11px] font-semibold text-amber-800">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>Email sign-in is temporarily disabled by the administrator.</span>
                </div>
              )}

              {tab === 'mobile' && step === 'email' ? (
                <div className="mt-4">
                  <label htmlFor="bos-login-phone" className="sr-only">
                    Mobile number
                  </label>
                  <div className="flex items-stretch overflow-hidden rounded-full border-2 border-slate-200 bg-white transition focus-within:border-[#7c3aed] focus-within:ring-4 focus-within:ring-violet-100">
                    <span className="flex items-center gap-1.5 border-r border-slate-200 pl-4 pr-2.5 text-sm font-black text-[#1e1b34]">
                      <svg aria-hidden="true" viewBox="0 0 3 2" className="h-3.5 w-5 rounded-[2px]">
                        <rect width="3" height="0.67" y="0" fill="#FF9933" />
                        <rect width="3" height="0.67" y="0.67" fill="#FFFFFF" />
                        <rect width="3" height="0.66" y="1.34" fill="#138808" />
                      </svg>
                      +91
                      <ChevronDown className="h-4 w-4 text-slate-400" aria-hidden="true" />
                    </span>
                    <input
                      id="bos-login-phone"
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel-national"
                      value={phoneDigits}
                      onChange={(event) => setPhone(event.target.value)}
                      placeholder="Enter your mobile number"
                      disabled
                      aria-describedby="bos-mobile-otp-unavailable"
                      aria-invalid={Boolean(phoneDigits) && !phoneValid}
                      className="h-14 w-full min-w-0 bg-transparent px-4 text-sm font-semibold tracking-wide text-[#1e1b34] outline-none placeholder:font-medium placeholder:tracking-normal placeholder:text-slate-400"
                    />
                  </div>
                  <p id="bos-login-phone-note" className="mt-2 text-[10px] font-semibold text-slate-500">
                    {phoneDigits && !phoneValid
                      ? 'Enter a 10-digit Indian mobile number starting with 6, 7, 8 or 9.'
                      : `We will text a ${MOBILE_OTP_LENGTH}-digit code to this number.`}
                  </p>
                  <p id="bos-mobile-otp-unavailable" className="sr-only">Mobile OTP is unavailable until an SMS provider is configured.</p>

                  <button
                    type="button"
                    onClick={() => void sendPhoneCode()}
                    disabled
                    className={`mt-3 ${CTA_CLASS}`}
                  >
                    {busy ? 'Sending code…' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Send OTP'}
                  </button>
                </div>
              ) : tab === 'mobile' ? (
                <form className="mt-4" onSubmit={(event) => { event.preventDefault(); void verifyCode(); }}>
                  <label className="block text-[11px] font-black text-slate-700">Enter the SMS code</label>
                  <div className="mt-2"><OtpInput value={digits} onChange={setDigits} disabled={busy} inputRef={otpRef} length={MOBILE_OTP_LENGTH} /></div>
                  <button type="submit" disabled={busy || code.length !== MOBILE_OTP_LENGTH} className={`mt-3 ${CTA_CLASS}`}>{busy ? 'Verifying…' : 'Verify and continue'}</button>
                  <button type="button" onClick={() => setStep('email')} className="mt-3 flex w-full items-center justify-center gap-1 text-[11px] font-bold text-slate-500"><ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Change mobile number</button>
                </form>
              ) : step === 'email' ? (
                <form
                  className="mt-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!emailOtpAvailable) return;
                    void sendCode();
                  }}
                >
                  <label htmlFor="bos-login-email" className="sr-only">
                    Email address
                  </label>
                  <div className="flex items-center gap-2 rounded-full border-2 border-slate-200 bg-white px-4 transition focus-within:border-[#7c3aed] focus-within:ring-4 focus-within:ring-violet-100">
                    <Mail className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                    <input
                      id="bos-login-email"
                      ref={emailRef}
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      autoCapitalize="none"
                      spellCheck={false}
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="Enter your email address"
                      disabled={busy || !emailOtpAvailable}
                      aria-invalid={Boolean(error)}
                      className="h-14 w-full min-w-0 bg-transparent text-sm font-semibold text-[#1e1b34] outline-none placeholder:font-medium placeholder:text-slate-400 focus-visible:outline-none disabled:opacity-60"
                    />
                  </div>

                  <button type="submit" disabled={busy || !emailOtpAvailable} className={`mt-3 ${CTA_CLASS}`}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                    {busy ? 'Sending code…' : 'Send OTP'}
                    {!busy && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
                  </button>
                </form>
              ) : (
                <form
                  className="mt-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void verifyCode();
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setStep('email');
                      setDigits(Array.from({ length: EMAIL_OTP_LENGTH }, () => ''));
                      setError('');
                      setInfo('');
                    }}
                    className="mb-3 inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-500 transition hover:text-[#4c1d95]"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                    Change email
                  </button>
                  <label className="block text-[11px] font-black text-slate-700">Sign-in code</label>
                  <div className="mt-1.5">
                    <OtpInput value={digits} onChange={setDigits} disabled={busy} inputRef={otpRef} length={EMAIL_OTP_LENGTH} />
                  </div>
                  <button type="submit" disabled={busy || code.length !== EMAIL_OTP_LENGTH} className={`mt-3 ${CTA_CLASS}`}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                    {busy ? 'Verifying…' : 'Verify & sign in'}
                  </button>
                  <div className="mt-3 flex items-center justify-between gap-3 text-[11px]">
                    <span className="font-semibold text-slate-500">Didn&apos;t receive the code?</span>
                    <button
                      type="button"
                      disabled={busy || cooldown > 0 || !emailOtpAvailable}
                      onClick={() => void sendCode()}
                      className="font-black text-[#6d28d9] transition hover:text-[#4c1d95] disabled:cursor-not-allowed disabled:text-slate-400"
                    >
                      {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
                    </button>
                  </div>
                </form>
              )}

              {googleAvailable && (
                <>
                  <p className="mt-4 flex items-center gap-3 text-[11px] font-semibold text-slate-400">
                    <span className="h-px flex-1 bg-slate-200" />
                    or continue with
                    <span className="h-px flex-1 bg-slate-200" />
                  </p>
                  <button
                    type="button"
                    onClick={onGoogle}
                    data-testid="customer-login-google"
                    className="mt-3 flex min-h-[52px] w-full items-center justify-center gap-3 rounded-full border border-slate-200 bg-white px-4 text-sm font-black text-[#1e1b34] transition hover:border-[#7c3aed]/40 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7c3aed]"
                  >
                    <GOOGLE_G />
                    Continue with Google
                  </button>
                </>
              )}

              {localDemoProviderAvailable && <button
                type="button"
                onClick={() => void signInLocalProvider()}
                disabled={localProviderBusy}
                className="mt-4 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full border border-violet-300 bg-violet-50 px-4 text-sm font-black text-violet-800 transition hover:bg-violet-100 disabled:opacity-60"
              >
                {localProviderBusy ? 'Opening provider dashboard…' : 'Test provider dashboard'}
              </button>}

              {localDemoProviderAvailable && <button
                type="button"
                onClick={() => void signInLocalProvider('demo.services@bookourspace.local')}
                disabled={localProviderBusy}
                className="mt-2 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full border border-emerald-300 bg-emerald-50 px-4 text-sm font-black text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-60"
              >
                {localProviderBusy ? 'Opening services dashboard…' : 'Test services provider dashboard'}
              </button>}

              {localDemoProviderAvailable && <button
                type="button"
                onClick={() => void signInLocalAdmin()}
                disabled={localProviderBusy}
                className="mt-2 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-4 text-sm font-black text-amber-900 transition hover:bg-amber-100 disabled:opacity-60"
              >
                {localProviderBusy ? 'Opening admin console…' : 'Test admin console'}
              </button>}

              {!authServiceUnavailable && !googleAvailable && !emailOtpAvailable && (
                <p className="mt-3 rounded-2xl bg-slate-50 p-2.5 text-[11px] font-semibold text-slate-600">
                  Sign-in is temporarily unavailable. Please try again later.
                </p>
              )}

              {onGuest && (guestAvailable ? (
                <button
                  type="button"
                  onClick={onGuest}
                  data-testid="customer-login-guest"
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-full py-2 text-sm font-black text-[#4c1d95] transition hover:text-[#6d28d9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7c3aed]"
                >
                  Browse as Guest
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              ) : (
                <div className="mt-4">
                  <button
                    type="button"
                    disabled
                    aria-describedby="bos-guest-disabled"
                    className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-full py-2 text-sm font-black text-slate-400"
                  >
                    Browse as Guest
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <p id="bos-guest-disabled" className="mt-1 text-center text-[10px] font-semibold text-slate-500">
                    Guest browsing is turned off by the administrator on this deployment.
                  </p>
                </div>
              ))}

              <p className="mt-2 text-center text-[10px] leading-[1.45] text-slate-500">
                By continuing you agree to our{' '}
                <a href="#terms" onClick={(event) => event.preventDefault()} className="font-bold text-[#6d28d9] underline-offset-2 hover:underline">
                  Terms
                </a>{' '}
                and{' '}
                <a href="#privacy" onClick={(event) => event.preventDefault()} className="font-bold text-[#6d28d9] underline-offset-2 hover:underline">
                  Privacy Policy
                </a>
                . Signing in never grants an admin or owner role.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export default CustomerLoginExperience;
