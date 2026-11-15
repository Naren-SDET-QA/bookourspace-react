import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Eye,
  KeyRound,
  Lock,
  Mail,
  MessageCircle,
  Phone,
  ShieldCheck,
} from 'lucide-react';
import { useMarketplace } from '../context/MarketplaceContext';
import type { AppLanguage } from '../utils/translations';

interface VerifiedPhoneRevealProps {
  /** The provider phone number, never shown until the customer passes the gate. */
  phone: string;
  /** The provider's public email; this is contact metadata, not the OTP target. */
  email?: string;
  /** The provider's display name, used for the WhatsApp greeting. */
  providerName?: string;
  currentLang?: AppLanguage;
  /** Invoked when a signed-out customer taps "Sign in to view the number". */
  onOpenSignIn?: () => void;
}

/** Digits only, dropping the leading `+` so an Indian number masks cleanly. */
function digitsOf(phone: string): string {
  return (phone || '').replace(/\D/g, '');
}

/** Mask everything but the first two and last two digits of the local number. */
export function maskPhone(phone: string): string {
  const digits = digitsOf(phone);
  if (!digits) return '••••••••••';
  const local = digits.slice(-10);
  if (local.length < 5) return digits.replace(/\d/g, '•');
  const maskedLocal = `${local.slice(0, 2)}••••••${local.slice(-2)}`;
  const country = digits.length > 10 ? digits.slice(0, digits.length - 10) : '';
  return country ? `+${country} ${maskedLocal}` : maskedLocal;
}

type RevealPhase = 'idle' | 'signin' | 'email' | 'otp' | 'revealed';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Customer-facing provider-contact gate.
 *
 * The phone number is masked by default. Revealing it requires (1) a signed-in
 * session and (2) an email + one-time-code confirmation step. Call and WhatsApp
 * deep links only exist in the DOM after the number is revealed, so the digits
 * never leak through a `tel:`/`wa.me` href before verification.
 *
 * Email OTP transport is disabled in this environment (Google OAuth is the
 * identity provider), so the one-time code is delivered as an in-app fallback
 * banner — the same "in-app OTP" convention the platform already uses where no
 * SMS/email gateway is connected.
 */
export function VerifiedPhoneReveal({
  phone,
  email = '',
  providerName = '',
  currentLang = 'en',
  onOpenSignIn,
}: VerifiedPhoneRevealProps) {
  const { authUser } = useMarketplace();
  const [phase, setPhase] = useState<RevealPhase>('idle');
  const [emailInput, setEmailInput] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [error, setError] = useState('');

  const masked = useMemo(() => maskPhone(phone), [phone]);
  const revealed = phase === 'revealed';

  const signedInEmail = authUser?.email || '';

  // Once the customer signs in mid-flow, advance past the sign-in prompt and
  // prefill their verified email.
  useEffect(() => {
    if (phase === 'signin' && signedInEmail) {
      setEmailInput((current) => current || signedInEmail);
      setError('');
      setPhase('email');
    }
  }, [phase, signedInEmail]);

  // Reset the flow when the number changes (a different listing modal).
  useEffect(() => {
    setPhase('idle');
    setEmailInput('');
    setOtpInput('');
    setOtpCode('');
    setError('');
  }, [phone]);

  const beginReveal = () => {
    setError('');
    if (!authUser) {
      setPhase('signin');
      return;
    }
    setEmailInput((current) => current || signedInEmail);
    setPhase('email');
  };

  const sendOtp = () => {
    setError('');
    const nextEmail = emailInput.trim().toLowerCase();
    if (!EMAIL_RE.test(nextEmail)) {
      setError(
        currentLang === 'te' ? 'చెల్లుబాటు అయ్యే ఇమెయిల్ చిరునామాను నమోదు చేయండి' : 'Enter a valid email address.'
      );
      return;
    }
    if (signedInEmail && nextEmail !== signedInEmail.toLowerCase()) {
      setError(
        currentLang === 'te'
          ? 'ఈ ఇమెయిల్ మీ సైన్-ఇన్ ఖాతాకు సరిపోలడం లేదు.'
          : 'This email does not match your signed-in account.'
      );
      return;
    }
    const code = String(Math.floor(100000 + Math.random() * 900000));
    setOtpCode(code);
    setOtpInput('');
    setPhase('otp');
  };

  const verifyOtp = () => {
    setError('');
    if (otpInput.trim() !== otpCode) {
      setError(currentLang === 'te' ? 'OTP సరిపోలలేదు. మళ్లీ ప్రయత్నించండి.' : 'The code did not match. Try again.');
      return;
    }
    setPhase('revealed');
  };

  const waHref = useMemo(() => {
    const digits = digitsOf(phone);
    if (!digits) return '#';
    const text = providerName
      ? `Hi ${providerName}, I found your listing on BookOurSpace and would like to enquire.`
      : 'Hi, I found your listing on BookOurSpace.';
    return `https://wa.me/${digits.replace(/^\+/, '')}?text=${encodeURIComponent(text)}`;
  }, [phone, providerName]);

  const labels = {
    viewNumber: currentLang === 'te' ? 'నంబర్ చూడండి' : 'View number',
    signIn: currentLang === 'te' ? 'సైన్ ఇన్ చేయండి' : 'Sign in',
    signInPrompt:
      currentLang === 'te'
        ? 'ఈ నంబర్ చూడటానికి సైన్ ఇన్ అవసరం.'
        : 'Sign in to view this verified number.',
    emailLabel: currentLang === 'te' ? 'ఇమెయిల్ నిర్ధారించండి' : 'Confirm your email',
    emailHint:
      currentLang === 'te'
        ? 'మీ సైన్-ఇన్ ఖాతా ఇమెయిల్‌తో సరిపోలాలి.'
        : 'Must match your signed-in account email.',
    sendOtp: currentLang === 'te' ? 'OTP పంపండి' : 'Send OTP',
    otpLabel: currentLang === 'te' ? 'ఒక-సారి కోడ్ నమోదు చేయండి' : 'Enter the one-time code',
    inAppOtp:
      currentLang === 'te'
        ? 'ఇమెయిల్ గేట్‌వే కనెక్ట్ కాలేదు — ఇన్-యాప్ OTP:'
        : 'Email gateway not connected — in-app OTP:',
    verify: currentLang === 'te' ? 'ధృవీకరించండి' : 'Verify',
    call: currentLang === 'te' ? 'కాల్ చేయండి' : 'Call',
    whatsapp: 'WhatsApp',
  };

  return (
    <div className="space-y-2.5">
      {/* Masked / revealed number plus the provider email. */}
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs font-bold text-purple-900 dark:text-purple-300 tabular-nums">
        <span className="inline-flex items-center gap-1">
          <Phone className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
          {revealed ? phone : masked}
        </span>
        {email && (
          <>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1">
              <Mail className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
              {email}
            </span>
          </>
        )}
        {!revealed && (
          <span className="ml-1 inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
            <Lock className="w-3 h-3" />
            {currentLang === 'te' ? 'ధృవీకరణ అవసరం' : 'Verification required'}
          </span>
        )}
      </div>

      {!revealed && phase === 'signin' && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 p-2.5 dark:border-amber-800 dark:bg-amber-950/40">
          <span className="text-[11px] font-bold text-amber-900 dark:text-amber-200">{labels.signInPrompt}</span>
          <button
            type="button"
            onClick={onOpenSignIn}
            className="shrink-0 rounded-lg bg-amber-500 px-3 py-1.5 text-[11px] font-black text-slate-950 transition hover:bg-amber-400"
          >
            {labels.signIn}
          </button>
        </div>
      )}

      {!revealed && (phase === 'email' || phase === 'otp') && (
        <div className="space-y-2 rounded-xl border border-purple-200 bg-purple-50/70 p-2.5 dark:border-purple-800 dark:bg-purple-950/30">
          <label className="block text-[11px] font-black text-purple-900 dark:text-purple-200">
            {labels.emailLabel}
          </label>
          <div className="flex items-center gap-2">
            <input
              type="email"
              value={emailInput}
              onChange={(event) => setEmailInput(event.target.value)}
              disabled={phase === 'otp'}
              placeholder="you@example.com"
              autoComplete="email"
              className="min-w-0 flex-1 rounded-lg border border-purple-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 outline-none disabled:opacity-60 dark:border-purple-700 dark:bg-slate-900 dark:text-white"
            />
            {phase === 'email' && (
              <button
                type="button"
                onClick={sendOtp}
                className="shrink-0 rounded-lg bg-[#4A148C] px-3 py-1.5 text-[11px] font-black text-white transition hover:bg-purple-800"
              >
                {labels.sendOtp}
              </button>
            )}
          </div>
          {phase === 'email' && (
            <p className="text-[10px] text-purple-700/80 dark:text-purple-300/80">{labels.emailHint}</p>
          )}

          {phase === 'otp' && (
            <>
              <label className="block text-[11px] font-black text-purple-900 dark:text-purple-200">
                {labels.otpLabel}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={otpInput}
                  onChange={(event) => setOtpInput(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="••••••"
                  autoComplete="one-time-code"
                  className="min-w-0 flex-1 rounded-lg border border-purple-300 bg-white px-2.5 py-1.5 font-mono text-sm tracking-widest text-slate-900 outline-none dark:border-purple-700 dark:bg-slate-900 dark:text-white"
                />
                <button
                  type="button"
                  onClick={verifyOtp}
                  className="shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-black text-white transition hover:bg-emerald-500"
                >
                  {labels.verify}
                </button>
              </div>
              <p role="status" className="text-[10px] font-bold text-purple-800 dark:text-purple-200">
                {labels.inAppOtp} <span className="font-mono tracking-widest">{otpCode}</span>
              </p>
            </>
          )}

          {error && <p role="alert" className="text-[11px] font-bold text-rose-600 dark:text-rose-400">{error}</p>}
        </div>
      )}

      {/* Call / WhatsApp actions exist only once the number is revealed. */}
      <div className="flex items-center gap-2 flex-wrap">
        {revealed ? (
          <>
            <a
              href={`tel:${digitsOf(phone)}`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-800 shadow-xs transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <Phone className="h-3.5 w-3.5 text-emerald-600" />
              <span>{labels.call}</span>
            </a>
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-emerald-500"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              <span>{labels.whatsapp}</span>
            </a>
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
              <ShieldCheck className="h-3.5 w-3.5" />
              {currentLang === 'te' ? 'ధృవీకరించబడింది' : 'Verified'}
            </span>
          </>
        ) : (
          <button
            type="button"
            onClick={beginReveal}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#4A148C] px-3.5 py-2 text-xs font-black text-white shadow-xs transition hover:bg-purple-800"
          >
            {phase === 'idle' ? <Eye className="h-3.5 w-3.5" /> : <KeyRound className="h-3.5 w-3.5" />}
            <span>{labels.viewNumber}</span>
          </button>
        )}
      </div>

      {revealed && (
        <p className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
          <Check className="h-3.5 w-3.5" />
          {currentLang === 'te' ? 'నంబర్ కనిపిస్తోంది.' : 'Number revealed for this session.'}
        </p>
      )}
    </div>
  );
}
