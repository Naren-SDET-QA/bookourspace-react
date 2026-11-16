import { useMemo, useState } from 'react';
import { Check, Eye, Lock, Phone } from 'lucide-react';
import { useMarketplace } from '../context/MarketplaceContext';
import { isValidEmailAddress, requestEmailOtp, verifyEmailOtpCode } from '../lib/emailOtpClient';
import type { AppLanguage } from '../utils/translations';

interface VerifiedPhoneRevealProps {
  /** Provider phone. Never rendered until the customer passes the sign-in and email-code gate. */
  phone: string;
  currentLang?: AppLanguage;
  /** Invoked when a signed-out customer taps "Sign in to view the number". */
  onOpenSignIn?: () => void;
  /** Called once the customer has verified the code, so actions that need the number can unlock. */
  onRevealed?: () => void;
}

type RevealPhase = 'idle' | 'details' | 'otp' | 'revealed';

/** Mask everything but the first two and last two digits of the local number. */
export function maskPhone(phone: string): string {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return '••••••••••';
  const local = digits.slice(-10);
  if (local.length < 5) return digits.replace(/\d/g, '•');
  const maskedLocal = `${local.slice(0, 2)}••••••${local.slice(-2)}`;
  const country = digits.length > 10 ? digits.slice(0, digits.length - 10) : '';
  return country ? `+${country} ${maskedLocal}` : maskedLocal;
}

/**
 * Masks the provider phone until the customer is signed in and has proven
 * ownership of their account email with a server-verified one-time code.
 */
export function VerifiedPhoneReveal({
  phone,
  currentLang = 'en',
  onOpenSignIn,
  onRevealed,
}: VerifiedPhoneRevealProps) {
  const { authUser } = useMarketplace();
  const [phase, setPhase] = useState<RevealPhase>('idle');
  const [otpInput, setOtpInput] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactMobile, setContactMobile] = useState('');
  const [contactEmail, setContactEmail] = useState(authUser?.email || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const masked = useMemo(() => maskPhone(phone), [phone]);
  const signedInEmail = contactEmail.trim().toLowerCase();
  const te = currentLang === 'te';

  const sendCode = async () => {
    setBusy(true);
    setError('');
    const result = await requestEmailOtp(signedInEmail);
    setBusy(false);
    if (!result.ok) {
      setError(result.message || (te ? 'కోడ్ పంపలేకపోయాం.' : 'Could not send the code. Try again.'));
      return;
    }
    setOtpInput('');
    setPhase('otp');
  };

  const beginReveal = () => {
    setError('');
    setContactEmail(authUser?.email || '');
    setPhase('details');
  };

  const verifyCode = async () => {
    setBusy(true);
    setError('');
    const result = await verifyEmailOtpCode(signedInEmail, otpInput);
    setBusy(false);
    if (!result.ok) {
      setError(result.message || (te ? 'OTP సరిపోలలేదు. మళ్లీ ప్రయత్నించండి.' : 'The code did not match. Try again.'));
      return;
    }
    setPhase('revealed');
    onRevealed?.();
  };

  if (phase === 'revealed') {
    return (
      <div className="flex items-center gap-1.5 text-xs font-bold text-purple-900 dark:text-purple-300 tabular-nums">
        <Check className="w-3.5 h-3.5 text-emerald-600" />
        <Phone className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
        <span>{phone}</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-bold text-purple-900 dark:text-purple-300 tabular-nums">
        <Phone className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
        <span>{masked}</span>
      </div>

      {phase === 'idle' && (
        <button
          type="button"
          onClick={beginReveal}
          disabled={busy}
          className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 hover:bg-slate-50 transition-colors disabled:opacity-60"
        >
          {authUser ? <Eye className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
          <span>
            {authUser
              ? (te ? 'నంబర్ చూడండి' : 'View number')
              : (te ? 'నంబర్ చూడటానికి సైన్ ఇన్ చేయండి' : 'Sign in to view the number')}
          </span>
        </button>
      )}

      {phase === 'details' && (
        <form
          className="grid gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"
          onSubmit={(event) => {
            event.preventDefault();
            const mobile = contactMobile.replace(/\D/g, '');
            if (contactName.trim().length < 2) { setError('Enter your name.'); return; }
            if (!/^[6-9]\d{9}$/.test(mobile)) { setError('Enter a valid 10-digit mobile number.'); return; }
            if (!isValidEmailAddress(signedInEmail)) { setError('Enter a valid email address.'); return; }
            setError('');
            void sendCode();
          }}
        >
          <input required minLength={2} value={contactName} onChange={(event) => setContactName(event.target.value)} placeholder="Your full name" className="min-h-9 rounded-lg border border-slate-300 px-2 text-xs dark:border-slate-700 dark:bg-slate-950" />
          <input required inputMode="numeric" value={contactMobile} onChange={(event) => setContactMobile(event.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="Your mobile number" className="min-h-9 rounded-lg border border-slate-300 px-2 text-xs dark:border-slate-700 dark:bg-slate-950" />
          <input required type="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} placeholder="Your email address" className="min-h-9 rounded-lg border border-slate-300 px-2 text-xs dark:border-slate-700 dark:bg-slate-950" />
          <button type="submit" disabled={busy} className="rounded-lg bg-purple-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-60">{busy ? 'Sending…' : 'Send verification code'}</button>
        </form>
      )}

      {phase === 'otp' && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-slate-600 dark:text-slate-400">
            {te ? `${signedInEmail} కు కోడ్ పంపాం` : `We sent a code to ${signedInEmail}`}
          </span>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            value={otpInput}
            onChange={(event) => setOtpInput(event.target.value.replace(/\D/g, '').slice(0, 10))}
            placeholder={te ? 'కోడ్' : 'Code'}
            className="w-24 px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
          />
          <button
            type="button"
            onClick={verifyCode}
            disabled={busy || otpInput.length < 6}
            className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold disabled:opacity-60"
          >
            {te ? 'ధృవీకరించండి' : 'Verify'}
          </button>
          <button
            type="button"
            onClick={sendCode}
            disabled={busy}
            className="text-[11px] font-bold text-purple-700 dark:text-purple-300 underline disabled:opacity-60"
          >
            {te ? 'మళ్లీ పంపండి' : 'Resend code'}
          </button>
        </div>
      )}

      {error && <p className="text-[11px] font-bold text-rose-600">{error}</p>}
    </div>
  );
}
