import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Compass,
  Loader2,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from 'lucide-react';
import { useMarketplace } from '../context/MarketplaceContext';
import { requestEmailOtp, requestSupabaseEmailOtp, isValidEmailAddress } from '../lib/emailOtpClient';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import type { AuthAccessConfig } from '../lib/authAccessClient';
import BOSOfficialLogo from './BOSOfficialLogo';

const OTP_LENGTH = 6;
const RESEND_SECONDS = 60;

const GOOGLE_G = () => (
  <svg aria-hidden="true" viewBox="0 0 48 48" className="h-[18px] w-[18px] shrink-0">
    <path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.1h6.6c3.9-3.6 6.1-8.9 6.1-15Z" />
    <path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.6-5.1c-1.8 1.2-4.1 1.9-6.9 1.9-5.3 0-9.8-3.6-11.4-8.4H5.8v5.3A20 20 0 0 0 24 44Z" />
    <path fill="#FBBC05" d="M12.6 27.5a12 12 0 0 1 0-7.1v-5.3H5.8a20 20 0 0 0 0 17.7l6.8-5.3Z" />
    <path fill="#EA4335" d="M24 12c3 0 5.7 1 7.8 3l5.8-5.8A19.4 19.4 0 0 0 24 4 20 20 0 0 0 5.8 15.1l6.8 5.3C14.2 15.6 18.7 12 24 12Z" />
  </svg>
);

function OtpInput({
  value,
  onChange,
  disabled,
  inputRef,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  disabled: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const setDigit = (index: number, raw: string) => {
    const digit = raw.replace(/\D/g, '').slice(-1);
    const next = [...value];
    next[index] = digit;
    onChange(next);
    if (digit && index < OTP_LENGTH - 1) refs.current[index + 1]?.focus();
  };
  const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (!pasted) return;
    event.preventDefault();
    const next = Array.from({ length: OTP_LENGTH }, (_, index) => pasted[index] || '');
    onChange(next);
    refs.current[Math.min(pasted.length, OTP_LENGTH - 1)]?.focus();
  };
  return (
    <div className="flex items-center justify-between gap-2 sm:gap-3" role="group" aria-label="Six digit sign-in code">
      {Array.from({ length: OTP_LENGTH }, (_, index) => (
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
          aria-label={`Digit ${index + 1} of ${OTP_LENGTH}`}
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
            if (event.key === 'ArrowRight' && index < OTP_LENGTH - 1) refs.current[index + 1]?.focus();
          }}
          className="h-14 w-full min-w-0 rounded-xl border-2 border-[#e5e7eb] bg-white text-center text-2xl font-black text-[#111827] outline-none transition focus:border-[#f97316] focus:ring-4 focus:ring-orange-100 focus-visible:outline-none disabled:opacity-60 sm:h-16"
        />
      ))}
    </div>
  );
}

export function SimpleLoginPage({
  onClose,
  onGoogle,
  onContinueAsGuest,
  config,
  onSignedIn,
}: {
  onClose: () => void;
  onGoogle: () => void;
  onContinueAsGuest?: () => void;
  config?: AuthAccessConfig | null;
  onSignedIn?: (payload: {
    isNewUser?: boolean;
    redirectTarget?: 'marketplace' | 'provider_portal' | 'admin_console';
  }) => void;
}) {
  const { completeEmailOtpSignIn } = useMarketplace();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [digits, setDigits] = useState<string[]>(() => Array.from({ length: OTP_LENGTH }, () => ''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const emailRef = useRef<HTMLInputElement>(null);
  const otpRef = useRef<HTMLInputElement>(null);

  const authServiceUnavailable = config != null && config.available === false;
  // When the API has no Resend key but the browser has a Supabase client, the
  // code can still be delivered by Supabase's own email provider. The identity
  // and session remain Supabase-verified and the API re-verifies the token.
  const nativeSupabaseOtp = !authServiceUnavailable
    && config != null
    && config.emailOtpConfigured === false
    && isSupabaseConfigured;
  const emailOtpAvailable = !authServiceUnavailable
    && config?.emailOtpEnabled !== false
    && (config?.emailOtpConfigured !== false || nativeSupabaseOtp);
  const googleAvailable = !authServiceUnavailable && config?.googleLoginEnabled !== false && config?.googleConfigured !== false;
  const emailSetupMissing = !authServiceUnavailable && !nativeSupabaseOtp && config != null
    && config.emailOtpEnabled !== false && config.emailOtpConfigured === false;
  const emailAdminDisabled = !authServiceUnavailable && config != null && config.emailOtpEnabled === false;
  const guestAvailable = config?.guestLoginEnabled === true;
  const code = useMemo(() => digits.join(''), [digits]);

  useEffect(() => {
    const timer = window.setTimeout(() => emailRef.current?.focus(), 60);
    return () => window.clearTimeout(timer);
  }, []);

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

  // Escape closes the full-page sign-in, matching the modal's behaviour.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
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
      setDigits(Array.from({ length: OTP_LENGTH }, () => ''));
      setCooldown(Math.min(120, result.cooldownSeconds || RESEND_SECONDS));
      setInfo(`We emailed a ${OTP_LENGTH}-digit code to ${target}. It expires in 10 minutes.`);
      return true;
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async () => {
    if (code.length !== OTP_LENGTH) {
      setError(`Enter the ${OTP_LENGTH}-digit code from your email.`);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await completeEmailOtpSignIn(normalizeEmail(), code, {
        verifyWithSupabase: nativeSupabaseOtp,
      });
      if (!result.ok) {
        setError(result.message || 'That code is invalid or has expired. Request a new code.');
        setDigits(Array.from({ length: OTP_LENGTH }, () => ''));
        otpRef.current?.focus();
        return;
      }
      setInfo('Signed in. Opening your account…');
      onSignedIn?.({ isNewUser: result.isNewUser, redirectTarget: result.redirectTarget });
    } finally {
      setBusy(false);
    }
  };

  const benefits = [
    {
      title: 'One account for every space',
      body: 'Book verified PGs, stays, classes, function halls and home services without re-entering your details.',
    },
    {
      title: 'Saved favourites & comparisons',
      body: 'Shortlist the spaces you like, compare them side by side and return to them anytime.',
    },
    {
      title: 'Trusted reviews & ratings',
      body: 'Read genuine reviews from verified customers before you make a decision.',
    },
    {
      title: 'Direct owner contact',
      body: 'Talk to verified owners for accurate availability, pricing and faster responses.',
    },
  ];

  return (
    <div
      className="fixed inset-0 z-[250] overflow-y-auto bg-[#eef0f4] text-[#111827]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bos-login-title"
    >
      <header className="border-b border-[#e3e5ea] bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          <a href="#stays" onClick={(event) => { event.preventDefault(); onClose(); }} className="flex items-center" aria-label="BookOurSpace home">
            <BOSOfficialLogo className="h-8 w-auto" loading="eager" />
          </a>
          <span className="ml-1 hidden rounded-full bg-[#fff4ed] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[#c2410c] sm:inline">
            Verified marketplace
          </span>
          <div className="ml-auto flex items-center gap-2">
            {guestAvailable && onContinueAsGuest && (
              <button
                type="button"
                onClick={onContinueAsGuest}
                className="hidden min-h-[40px] items-center gap-1.5 rounded-xl border border-[#e0e2e8] bg-white px-3 text-xs font-bold text-[#374151] transition hover:bg-[#f8f9fb] sm:inline-flex"
              >
                <Compass className="h-4 w-4 text-[#f97316]" aria-hidden="true" />
                Browse as guest
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close sign-in"
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[#e0e2e8] bg-white px-3 text-xs font-bold text-[#374151] transition hover:bg-[#f8f9fb]"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex min-h-[calc(100dvh-64px)] max-w-6xl items-center px-3 py-6 sm:px-6 sm:py-10">
        <div className="grid w-full overflow-hidden rounded-[28px] border border-white bg-white shadow-[0_30px_80px_-30px_rgba(15,23,42,0.35)] lg:grid-cols-[1.05fr_0.95fr]">
          {/* Sign-in form */}
          <section className="p-6 sm:p-10 lg:p-12">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f97316] text-white shadow-[0_10px_24px_-8px_rgba(249,115,22,0.8)]">
              <LockKeyhole className="h-6 w-6" aria-hidden="true" />
            </div>
            <h1 id="bos-login-title" className="mt-5 text-2xl font-black leading-tight tracking-tight sm:text-[30px]">
              Welcome Back
            </h1>
            <p className="mt-2 text-sm leading-6 text-[#6b7280]">
              {step === 'email'
                ? 'Sign in with your email to continue.'
                : `Enter the code we sent to ${email}.`}
            </p>

            {error && (
              <div role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}
            {!error && info && (
              <div role="status" className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{info}</span>
              </div>
            )}

            {authServiceUnavailable && (
              <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Sign-in is temporarily unavailable because the account service cannot be reached. Please try again in a moment.</span>
              </div>
            )}
            {emailSetupMissing && (
              <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Email sign-in is not configured on this deployment yet. Please use Google or contact the administrator.</span>
              </div>
            )}
            {emailAdminDisabled && (
              <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Email sign-in is temporarily disabled by the administrator.</span>
              </div>
            )}

            {step === 'email' ? (
              <form
                className="mt-6"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!emailOtpAvailable) return;
                  void sendCode();
                }}
              >
                <label htmlFor="bos-login-email" className="block text-xs font-black text-[#374151]">
                  Email address
                </label>
                <div className="mt-2 flex items-center gap-2 rounded-xl border-2 border-[#e5e7eb] bg-white px-3 transition focus-within:border-[#f97316] focus-within:ring-4 focus-within:ring-orange-100">
                  <Mail className="h-4 w-4 shrink-0 text-[#9ca3af]" aria-hidden="true" />
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
                    placeholder="you@example.com"
                    disabled={busy || !emailOtpAvailable}
                    aria-invalid={Boolean(error)}
                    className="h-12 w-full min-w-0 bg-transparent text-sm font-semibold text-[#111827] outline-none focus-visible:outline-none disabled:opacity-60"
                  />
                </div>

                <button
                  type="submit"
                  disabled={busy || !emailOtpAvailable}
                  className="mt-4 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[#f97316] px-4 text-sm font-black text-white transition hover:bg-[#ea580c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f97316] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                  {busy ? 'Sending code…' : 'Continue'}
                  {!busy && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
                </button>

                {googleAvailable && (
                  <>
                    <div className="my-5 flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.16em] text-[#9ca3af]">
                      <span className="h-px flex-1 bg-[#eceef3]" />
                      or
                      <span className="h-px flex-1 bg-[#eceef3]" />
                    </div>
                    <button
                      type="button"
                      onClick={onGoogle}
                      className="flex min-h-[48px] w-full items-center justify-center gap-3 rounded-xl border-2 border-[#e5e7eb] bg-white px-4 text-sm font-bold text-[#111827] transition hover:bg-[#f9fafb]"
                    >
                      <GOOGLE_G />
                      Continue with Google
                    </button>
                  </>
                )}

                {guestAvailable && onContinueAsGuest && (
                  <button
                    type="button"
                    onClick={onContinueAsGuest}
                    className="mt-3 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#d1d5db] bg-[#fafafa] px-4 text-xs font-bold text-[#4b5563] transition hover:bg-[#f3f4f6] sm:hidden"
                  >
                    <Compass className="h-4 w-4 text-[#f97316]" aria-hidden="true" />
                    Explore spaces as guest
                  </button>
                )}

                {!googleAvailable && !emailOtpAvailable && (
                  <p className="mt-4 rounded-xl bg-[#fafafa] p-3 text-xs font-semibold text-[#6b7280]">
                    Sign-in is temporarily unavailable. Please try again later.
                  </p>
                )}

                <p className="mt-5 text-[11px] leading-5 text-[#6b7280]">
                  By continuing, you agree to our{' '}
                  <a href="#terms" onClick={(event) => event.preventDefault()} className="font-bold text-[#c2410c] underline-offset-2 hover:underline">
                    Terms &amp; Conditions
                  </a>{' '}
                  and{' '}
                  <a href="#privacy" onClick={(event) => event.preventDefault()} className="font-bold text-[#c2410c] underline-offset-2 hover:underline">
                    Privacy Policy
                  </a>
                  .
                </p>
              </form>
            ) : (
              <form
                className="mt-6"
                onSubmit={(event) => {
                  event.preventDefault();
                  void verifyCode();
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setStep('email');
                    setDigits(Array.from({ length: OTP_LENGTH }, () => ''));
                    setError('');
                    setInfo('');
                  }}
                  className="mb-4 inline-flex items-center gap-1.5 text-xs font-bold text-[#6b7280] transition hover:text-[#111827]"
                >
                  <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  Change email
                </button>

                <label className="block text-xs font-black text-[#374151]">Sign-in code</label>
                <div className="mt-2">
                  <OtpInput value={digits} onChange={setDigits} disabled={busy} inputRef={otpRef} />
                </div>

                <button
                  type="submit"
                  disabled={busy || code.length !== OTP_LENGTH}
                  className="mt-5 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[#f97316] px-4 text-sm font-black text-white transition hover:bg-[#ea580c] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                  {busy ? 'Verifying…' : 'Verify & sign in'}
                </button>

                <div className="mt-4 flex items-center justify-between gap-3 text-xs">
                  <span className="font-semibold text-[#6b7280]">Didn&apos;t receive the code?</span>
                  <button
                    type="button"
                    disabled={busy || cooldown > 0 || !emailOtpAvailable}
                    onClick={() => void sendCode()}
                    className="font-black text-[#c2410c] transition hover:text-[#9a3412] disabled:cursor-not-allowed disabled:text-[#9ca3af]"
                  >
                    {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
                  </button>
                </div>

                <p className="mt-5 flex items-start gap-2 rounded-xl bg-[#fafafa] p-3 text-[11px] leading-5 text-[#6b7280]">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#059669]" aria-hidden="true" />
                  <span>The code is valid for 10 minutes and can be used once. Check your spam folder if it does not arrive.</span>
                </p>
              </form>
            )}
          </section>

          {/* Benefits panel */}
          <aside className="border-t border-[#eceef3] bg-[#fbfbfc] p-6 sm:p-10 lg:border-l lg:border-t-0 lg:p-12">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#f97316]">Why sign in</p>
            <h2 className="mt-2 text-xl font-black leading-snug tracking-tight text-[#111827] sm:text-2xl">
              What you can do with your BookOurSpace account
            </h2>
            <ul className="mt-6 space-y-5">
              {benefits.map((benefit) => (
                <li key={benefit.title} className="flex gap-3">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#f97316]" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-black text-[#111827]">{benefit.title}</p>
                    <p className="mt-0.5 text-xs leading-5 text-[#6b7280]">{benefit.body}</p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-8 rounded-2xl border border-[#eceef3] bg-white p-4">
              <div className="flex items-center gap-2 text-xs font-black text-[#111827]">
                <ShieldCheck className="h-4 w-4 text-[#059669]" aria-hidden="true" />
                Email code security
              </div>
              <p className="mt-1.5 text-[11px] leading-5 text-[#6b7280]">
                No password to remember. Every session is verified by our server and linked to the email that received the code.
              </p>
            </div>

            <p className="mt-6 text-[11px] leading-5 text-[#9ca3af]">
              Administrator and owner consoles are only available to accounts that have been granted those roles. Signing in never grants a role.
            </p>
          </aside>
        </div>
      </main>
    </div>
  );
}
